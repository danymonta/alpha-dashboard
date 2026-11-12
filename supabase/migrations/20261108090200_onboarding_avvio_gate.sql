-- Guided onboarding, release A (1.77.0): start, payment gate and revocation (docs/onboarding/rilascio-a.md).
--
-- * avvia_onboarding and nuovo_cliente (registra_vendita + avvia_onboarding in one transaction), and the
--   admin's actions on a link (payment confirmed by hand, parent's consent, revoke, reactivate, regenerate,
--   people in charge). All security invoker, admin only, never an OAuth token: they write through the
--   admin's own RLS. Whatever must happen for everybody (a closer who cashes an instalment, a refund, a
--   deleted sale) happens in security definer triggers and in internal functions without grants.
-- * The gate: an instalment of the sale cashed, from any road, turns the link active. A total refund, the
--   sale deleted or moved to another client revoke it. An undone or corrected cash-in never does.
-- * No trigger here can ever stop a cash-in, a refund or a deletion: what the onboarding does on payments
--   and sales runs inside a block that turns every error into a warning.
-- * A minor without the parent's consent never gets an active link.
-- * Who did what: only the admin's own actions carry a name (the functions raise alpha.onboarding_admin
--   for their transaction, a setting no client of the Data API can write); a cash-in by anybody is the
--   system's.

-- ---------------------------------------------------------------------------
-- 0. The notification «Pagamento confermato per …» (app only)
-- ---------------------------------------------------------------------------
alter table public.notifiche drop constraint notifiche_tipo_check;
alter table public.notifiche
  add constraint notifiche_tipo_check check (tipo in (
    'riepilogo_settimana', 'tempo_team', 'contenuti_settimana', 'backup', 'promemoria_feedback', 'promemoria_rinnovo',
    'rate_in_ritardo', 'chiave_in_scadenza', 'chiave_rifiutata', 'proposta_da_approvare', 'spesa_claude',
    'onboarding_pagamento'
  ));

-- ---------------------------------------------------------------------------
-- 1. Helpers
-- ---------------------------------------------------------------------------
-- «mario-rossi» from name and surname: lower case, no accents, hyphens
create function public.onboarding_slug(p_nome text, p_cognome text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      rtrim(left(btrim(regexp_replace(
        translate(
          lower(concat_ws(' ', p_nome, p_cognome)),
          'àáâãäåāèéêëēìíîïīòóôõöōùúûüūçñýÿ',
          'aaaaaaaeeeeeiiiiioooooouuuuucnyy'
        ),
        '[^a-z0-9]+', '-', 'g'
      ), '-'), 60), '-'),
      ''
    ),
    'cliente'
  );
$$;

comment on function public.onboarding_slug(text, text) is
  'The readable part of an onboarding link, from name and surname: lower case, without accents, hyphens, 60 characters at most («cliente» when nothing is left).';

revoke all on function public.onboarding_slug(text, text) from public, anon;
grant execute on function public.onboarding_slug(text, text) to authenticated;

-- What the sale has cashed, net of refunds: the formula of v_vendite.incassato. No grants.
create function public.onboarding_incassato_netto(p_sale_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(p.importo_incassato) filter (where p.stato in ('incassata', 'rimborsata')), 0)::numeric(12, 2)
  from public.payments p
  where p.sale_id = p_sale_id;
$$;
revoke all on function public.onboarding_incassato_netto(uuid) from public, anon, authenticated;

-- Another path of the client (nuovo or rinnovo) with money cashed. No grants.
create function public.onboarding_altro_percorso_pagato(p_client_id uuid, p_sale_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sales s
    where s.client_id = p_client_id
      and s.id is distinct from p_sale_id
      and s.tipo in ('nuovo', 'rinnovo')
      and public.onboarding_incassato_netto(s.id) > 0
  );
$$;
revoke all on function public.onboarding_altro_percorso_pagato(uuid, uuid) from public, anon, authenticated;

-- A line of the log. The author only for the admin's own actions (alpha.onboarding_admin, or p_team for
-- the start); everything else is the system's. No grants.
create function public.onboarding_evento(p_client_id uuid, p_tipo text, p_dettagli jsonb, p_team boolean default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_team boolean := coalesce(p_team, coalesce(current_setting('alpha.onboarding_admin', true), '') = 'on');
begin
  insert into public.onboarding_eventi (client_id, tipo, attore, autore_id, dettagli)
  values (
    p_client_id,
    p_tipo,
    case when v_team then 'team' else 'sistema' end,
    case when v_team then (select auth.uid()) end,
    coalesce(p_dettagli, '{}'::jsonb)
  );
end;
$$;
revoke all on function public.onboarding_evento(uuid, text, jsonb, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The invite keeps itself coherent, whoever writes it
-- ---------------------------------------------------------------------------
create function public.onboarding_inviti_coerenza()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo public.sale_type;
  v_cliente uuid;
  v_aperto boolean;
  v_giorni integer;
  v_modo text;
begin
  new.slug := lower(btrim(new.slug));

  if tg_op = 'INSERT' then
    if new.stato <> 'in_attesa_pagamento' then
      raise exception 'Un invito nasce in attesa di pagamento' using errcode = '22023';
    end if;
    -- a renewal never starts an onboarding
    select s.tipo, s.client_id into v_tipo, v_cliente from public.sales s where s.id = new.sale_id;
    if not found or v_tipo <> 'nuovo' then
      raise exception 'L''onboarding parte solo da una vendita a un nuovo cliente.' using errcode = '22023';
    end if;
    if v_cliente is distinct from new.client_id then
      raise exception 'La vendita non è di questo cliente' using errcode = '22023';
    end if;
    new.attivato_il := null;
    new.attivato_da := null;
    new.scade_il := null;
    new.usato_il := null;
    new.revocato_il := null;
    new.revocato_motivo := null;
    return new;
  end if;

  if new.client_id is distinct from old.client_id then
    raise exception 'Un invito non cambia cliente' using errcode = '22023';
  end if;

  select x.aperto_ai_clienti, x.giorni_validita_link into v_aperto, v_giorni
  from public.onboarding_impostazioni x;

  -- a new token: the one in clear of before is gone, and an active link gets its days again
  if new.token_hash is distinct from old.token_hash then
    delete from public.onboarding_inviti_token t where t.invito_id = new.id;
  end if;

  if new.stato = 'attivo' and old.stato <> 'attivo' then
    if new.minorenne and new.consenso_genitore_il is null then
      -- a minor waits for a parent's consent, whatever paid or confirmed: said once per way in the log
      v_modo := coalesce(new.attivato_da, 'manuale');
      if not exists (
        select 1 from public.onboarding_eventi e
        where e.client_id = new.client_id
          and e.tipo = 'in_attesa_consenso'
          and e.dettagli ->> 'invito_id' = new.id::text
          and e.dettagli ->> 'modo' = v_modo
      ) then
        perform public.onboarding_evento(new.client_id, 'in_attesa_consenso',
          jsonb_build_object('invito_id', new.id, 'modo', v_modo));
      end if;
      new.stato := 'in_attesa_pagamento';
    else
      new.attivato_il := coalesce(new.attivato_il, now());
      new.attivato_da := coalesce(new.attivato_da, 'manuale');
      -- the days of the link start only once the client area is open (release B)
      new.scade_il := case when coalesce(v_aperto, false) then now() + make_interval(days => coalesce(v_giorni, 14)) end;
    end if;
  elsif new.stato = 'attivo' and new.token_hash is distinct from old.token_hash then
    new.scade_il := case when coalesce(v_aperto, false) then now() + make_interval(days => coalesce(v_giorni, 14)) end;
  end if;

  if new.stato = 'in_attesa_pagamento' then
    new.attivato_il := null;
    new.attivato_da := null;
    new.scade_il := null;
  end if;

  if new.stato = 'revocato' then
    if old.stato <> 'revocato' then
      new.revocato_il := now();
    end if;
  else
    new.revocato_il := null;
    new.revocato_motivo := null;
  end if;

  if new.stato = 'usato' and new.usato_il is null then
    new.usato_il := now();
  end if;

  return new;
end;
$$;
revoke all on function public.onboarding_inviti_coerenza() from public, anon, authenticated;

create trigger onboarding_inviti_coerenza before insert or update on public.onboarding_inviti
  for each row execute function public.onboarding_inviti_coerenza();

-- ---------------------------------------------------------------------------
-- 3. The start: path, steps, project, log, and the link already active when the
--    sale has money cashed
-- ---------------------------------------------------------------------------
create function public.onboarding_inviti_avviato()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_versione integer;
begin
  insert into public.onboarding_percorsi (client_id, sale_id)
  values (new.client_id, new.sale_id)
  on conflict (client_id) do update
  set sale_id = excluded.sale_id,
      -- a path suspended by a revoked link starts again with the new one
      stato = case
                when onboarding_percorsi.stato = 'sospeso' and onboarding_percorsi.giorno_zero is null then 'in_attesa'
                when onboarding_percorsi.stato = 'sospeso' then 'in_corso'
                else onboarding_percorsi.stato
              end
  returning versione_flusso into v_versione;

  insert into public.onboarding_passi (client_id, passo, versione)
  select new.client_id, d.chiave, d.versione
  from public.onboarding_passi_def d
  where d.versione = v_versione
  on conflict (client_id, passo) do nothing;

  -- the client's project with the list «Onboarding»; coach and reviewer join when the link turns active
  perform public.onboarding_apri_progetto(new.client_id);

  perform public.onboarding_evento(new.client_id, 'avviato',
    jsonb_build_object('invito_id', new.id, 'minorenne', new.minorenne), true);

  -- already paid: the link is active at once (a minor without consent stays waiting: the invite's own trigger)
  if public.onboarding_incassato_netto(new.sale_id) > 0 then
    update public.onboarding_inviti i
    set stato = 'attivo', attivato_da = 'pagamento'
    where i.id = new.id and i.stato = 'in_attesa_pagamento';
  end if;

  return null;
end;
$$;
revoke all on function public.onboarding_inviti_avviato() from public, anon, authenticated;

create trigger onboarding_inviti_avviato after insert on public.onboarding_inviti
  for each row execute function public.onboarding_inviti_avviato();

-- ---------------------------------------------------------------------------
-- 4. What a change of state brings with it
-- ---------------------------------------------------------------------------
create function public.onboarding_inviti_stato()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := coalesce(current_setting('alpha.onboarding_admin', true), '') = 'on';
  v_nome text;
  v_aperto boolean;
begin
  if new.stato is not distinct from old.stato then
    return null;
  end if;

  if new.stato = 'revocato' then
    update public.onboarding_percorsi p
    set stato = 'sospeso'
    where p.client_id = new.client_id and p.stato in ('in_attesa', 'in_corso');

    perform public.onboarding_evento(new.client_id, 'link_revocato',
      jsonb_build_object('invito_id', new.id, 'automatica', not v_admin)
        || case when new.revocato_motivo is null then '{}'::jsonb else jsonb_build_object('motivo', new.revocato_motivo) end);

  elsif old.stato = 'revocato' then
    -- reactivated: the path is back where it was
    update public.onboarding_percorsi p
    set stato = case when p.giorno_zero is null then 'in_attesa' else 'in_corso' end
    where p.client_id = new.client_id and p.stato = 'sospeso';

    perform public.onboarding_evento(new.client_id, 'link_riattivato',
      jsonb_build_object('invito_id', new.id, 'stato', new.stato));

    if new.stato in ('attivo', 'usato') then
      begin
        perform public.onboarding_assegna_incarichi(new.client_id);
      exception when others then
        raise warning 'Onboarding: incarichi del cliente % non allineati al progetto: %', new.client_id, sqlerrm;
      end;
    end if;

  elsif new.stato = 'attivo' then
    -- coach and reviewer see the project from now on; never at the cost of the activation
    begin
      perform public.onboarding_assegna_incarichi(new.client_id);
    exception when others then
      raise warning 'Onboarding: incarichi del cliente % non allineati al progetto: %', new.client_id, sqlerrm;
    end;

    perform public.onboarding_evento(new.client_id, 'link_attivo',
      jsonb_build_object('invito_id', new.id, 'attivato_da', new.attivato_da));

    -- the admins are told, in the app, once per invite; never an amount
    begin
      select concat_ws(' ', nullif(btrim(c.nome), ''), nullif(btrim(c.cognome), '')) into v_nome
      from public.clients c where c.id = new.client_id;
      select x.aperto_ai_clienti into v_aperto from public.onboarding_impostazioni x;
      perform public.notifiche_avviso_admin(
        'onboarding_pagamento',
        left('Pagamento confermato per ' || coalesce(nullif(v_nome, ''), 'il cliente'), 300),
        case when coalesce(v_aperto, false)
             then 'Il link di onboarding è attivo.'
             else 'Onboarding pronto: il link si apre con l''area clienti.' end,
        null,
        '/onboarding/' || new.client_id::text,
        'onboarding/' || new.client_id::text || '/pagamento/' || new.id::text
      );
    exception when others then
      raise warning 'Onboarding: notifica del pagamento del cliente % non scritta: %', new.client_id, sqlerrm;
    end;
  end if;

  return null;
end;
$$;
revoke all on function public.onboarding_inviti_stato() from public, anon, authenticated;

create trigger onboarding_inviti_stato after update of stato on public.onboarding_inviti
  for each row execute function public.onboarding_inviti_stato();

-- ---------------------------------------------------------------------------
-- 5. The people in charge change: the project follows, when the onboarding is
--    alive (people and tasks only while the link is active)
-- ---------------------------------------------------------------------------
create function public.onboarding_incarichi_allinea()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stato text;
begin
  begin
    select i.stato into v_stato
    from public.onboarding_inviti i
    where i.client_id = new.client_id and i.stato in ('in_attesa_pagamento', 'attivo', 'usato')
    limit 1;

    if v_stato in ('attivo', 'usato') then
      -- whoever held an incarico before leaves its tasks (and stays in the project, with the time worked)
      if tg_op = 'UPDATE' then
        delete from public.pm_task_assegnatari a
        using public.pm_task t, public.pm_progetti p
        where a.task_id = t.id
          and t.progetto_id = p.id
          and p.client_id = new.client_id
          and t.per_incarico is not null
          and a.profile_id = case t.per_incarico
                               when 'coach' then old.coach_id
                               when 'revisore' then old.revisore_id
                               else old.responsabile_id
                             end
          and a.profile_id is distinct from case t.per_incarico
                                              when 'coach' then new.coach_id
                                              when 'revisore' then new.revisore_id
                                              else new.responsabile_id
                                            end;
      end if;
      perform public.onboarding_assegna_incarichi(new.client_id);
    elsif v_stato = 'in_attesa_pagamento' then
      -- before the payment only the responsible is on the project
      perform public.onboarding_apri_progetto(new.client_id);
    end if;
  exception when others then
    -- the admin who changes the people sees the error; a person deleted or merged never fails for this
    if coalesce(current_setting('alpha.onboarding_admin', true), '') = 'on' then
      raise;
    end if;
    raise warning 'Onboarding: incarichi del cliente % non allineati al progetto: %', new.client_id, sqlerrm;
  end;

  return null;
end;
$$;
revoke all on function public.onboarding_incarichi_allinea() from public, anon, authenticated;

create trigger onboarding_incarichi_allinea
  after insert or update of coach_id, revisore_id, responsabile_id on public.onboarding_incarichi
  for each row execute function public.onboarding_incarichi_allinea();

-- ---------------------------------------------------------------------------
-- 6. The gate: an instalment of the sale cashed, by anybody and from any road
-- ---------------------------------------------------------------------------
create function public.onboarding_gate_pagamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.stato = 'incassata' then
    return null;
  end if;

  -- never at the cost of the cash-in
  begin
    update public.onboarding_inviti i
    set stato = 'attivo', attivato_da = 'pagamento'
    where i.sale_id = new.sale_id and i.stato = 'in_attesa_pagamento';
  exception when others then
    raise warning 'Onboarding: link della vendita % non attivato: %', new.sale_id, sqlerrm;
  end;

  return null;
end;
$$;
revoke all on function public.onboarding_gate_pagamento() from public, anon, authenticated;

create trigger payments_onboarding_gate
  after insert or update of stato on public.payments
  for each row when (new.stato = 'incassata')
  execute function public.onboarding_gate_pagamento();

-- ---------------------------------------------------------------------------
-- 7. Automatic revocation. Never for a cash-in undone or corrected.
-- ---------------------------------------------------------------------------
-- A total refund of the only paid path (never a link the admin activated by hand)
create function public.onboarding_revoca_da_rimborso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente uuid;
begin
  begin
    select s.client_id into v_cliente from public.sales s where s.id = new.sale_id;
    if v_cliente is not null
       and public.onboarding_incassato_netto(new.sale_id) <= 0
       and not public.onboarding_altro_percorso_pagato(v_cliente, new.sale_id) then
      update public.onboarding_inviti i
      set stato = 'revocato', revocato_motivo = 'Rimborso totale'
      where i.sale_id = new.sale_id
        and i.stato in ('in_attesa_pagamento', 'attivo', 'usato')
        and i.attivato_da is distinct from 'manuale';
    end if;
  exception when others then
    raise warning 'Onboarding: link della vendita % non revocato dopo il rimborso: %', new.sale_id, sqlerrm;
  end;

  return null;
end;
$$;
revoke all on function public.onboarding_revoca_da_rimborso() from public, anon, authenticated;

create trigger payments_onboarding_rimborso
  after insert on public.payments
  for each row when (new.stato = 'rimborsata')
  execute function public.onboarding_revoca_da_rimborso();

-- The sale deleted: its living link is revoked and the client's project archived, unless the client has
-- another paid path
create function public.onboarding_vendita_eliminata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if exists (select 1 from public.onboarding_inviti i where i.sale_id = old.id)
       and not public.onboarding_altro_percorso_pagato(old.client_id, old.id) then
      update public.onboarding_inviti i
      set stato = 'revocato', revocato_motivo = 'Vendita eliminata'
      where i.sale_id = old.id and i.stato in ('in_attesa_pagamento', 'attivo', 'usato');

      update public.pm_progetti p
      set stato = 'archiviato'
      where p.client_id = old.client_id and p.stato <> 'archiviato';
    end if;
  exception when others then
    raise warning 'Onboarding: link della vendita % non revocato prima dell''eliminazione: %', old.id, sqlerrm;
  end;

  return old;
end;
$$;
revoke all on function public.onboarding_vendita_eliminata() from public, anon, authenticated;

create trigger sales_onboarding_eliminata
  before delete on public.sales
  for each row execute function public.onboarding_vendita_eliminata();

-- The sale moved to another client: the link not used yet is revoked and let go of the sale
create function public.onboarding_vendita_spostata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    update public.onboarding_inviti i
    set stato = 'revocato', revocato_motivo = 'Vendita spostata su un altro cliente', sale_id = null
    where i.sale_id = new.id
      and i.client_id = old.client_id
      and i.stato in ('in_attesa_pagamento', 'attivo', 'scaduto');

    update public.onboarding_percorsi p
    set sale_id = null
    where p.client_id = old.client_id and p.sale_id = new.id;
  exception when others then
    raise warning 'Onboarding: link della vendita % non revocato dopo lo spostamento: %', new.id, sqlerrm;
  end;

  return null;
end;
$$;
revoke all on function public.onboarding_vendita_spostata() from public, anon, authenticated;

create trigger sales_onboarding_spostata
  after update of client_id on public.sales
  for each row when (old.client_id is distinct from new.client_id)
  execute function public.onboarding_vendita_spostata();

-- ---------------------------------------------------------------------------
-- 8. Start: avvia_onboarding (a sale that exists) and nuovo_cliente (the wizard)
-- ---------------------------------------------------------------------------
create function public.avvia_onboarding(
  p_sale_id uuid,
  p_coach uuid,
  p_revisore uuid,
  p_responsabile uuid,
  p_contatti jsonb,
  p_telegram text,
  p_minorenne boolean default false
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_cliente uuid;
  v_tipo public.sale_type;
  v_call uuid;
  v_contatti jsonb := nullif(p_contatti, 'null'::jsonb);
  v_telegram text := nullif(lower(ltrim(btrim(p_telegram), '@')), '');
  v_nome text;
  v_cognome text;
  v_email text;
  v_token text;
  v_invito uuid;
  v_stato text;
begin
  if public.da_client_oauth() or not public.is_admin() then
    raise exception 'L''onboarding lo avvia l''admin' using errcode = '42501';
  end if;

  select s.client_id, s.tipo, s.call_id into v_cliente, v_tipo, v_call
  from public.sales s
  where s.id = p_sale_id;
  if not found then
    raise exception 'Vendita non trovata' using errcode = '22023';
  end if;
  if v_tipo <> 'nuovo' then
    raise exception 'L''onboarding parte solo da una vendita a un nuovo cliente.' using errcode = '22023';
  end if;

  -- one start at a time per client
  perform 1 from public.clients c where c.id = v_cliente for update;
  if exists (
    select 1 from public.onboarding_inviti i
    where i.client_id = v_cliente and i.stato in ('in_attesa_pagamento', 'attivo', 'usato')
  ) then
    raise exception 'Questo cliente ha già un onboarding avviato.' using errcode = '22023';
  end if;

  if p_responsabile is null then
    raise exception 'Scegli il responsabile dell''onboarding.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from unnest(array[p_coach, p_revisore, p_responsabile]) as u(id)
    where u.id is not null
      and not exists (
        select 1 from public.profiles x where x.id = u.id and x.attivo and x.ruolo <> 'business_coach'
      )
  ) then
    raise exception 'Coach, revisore e responsabile devono essere persone attive del team.' using errcode = '22023';
  end if;

  -- the contacts of the client: only the keys given
  if v_contatti is not null then
    if jsonb_typeof(v_contatti) <> 'object' then
      raise exception 'Contatti non validi' using errcode = '22023';
    end if;
    if exists (
      select 1 from jsonb_each(v_contatti) e
      where e.key not in ('nome', 'cognome', 'email', 'telefono', 'instagram_handle')
         or jsonb_typeof(e.value) not in ('string', 'null')
    ) then
      raise exception 'Contatti non validi' using errcode = '22023';
    end if;
    if v_contatti ? 'nome' and nullif(btrim(v_contatti ->> 'nome'), '') is null then
      raise exception 'Il nome del cliente è obbligatorio' using errcode = '22023';
    end if;

    update public.clients c
    set nome = case when v_contatti ? 'nome' then btrim(v_contatti ->> 'nome') else c.nome end,
        cognome = case when v_contatti ? 'cognome' then nullif(btrim(v_contatti ->> 'cognome'), '') else c.cognome end,
        email = case when v_contatti ? 'email' then nullif(lower(btrim(v_contatti ->> 'email')), '') else c.email end,
        telefono = case when v_contatti ? 'telefono' then nullif(btrim(v_contatti ->> 'telefono'), '') else c.telefono end,
        instagram_handle = case when v_contatti ? 'instagram_handle'
                                then nullif(lower(btrim(v_contatti ->> 'instagram_handle')), '')
                                else c.instagram_handle end
    where c.id = v_cliente;
  end if;

  if v_telegram is not null then
    if v_telegram !~ '^[a-z0-9_]{5,32}$' then
      raise exception 'Username Telegram non valido: da 5 a 32 caratteri tra lettere, numeri e trattino basso.'
        using errcode = '22023';
    end if;
    insert into public.clienti_telegram (client_id, username)
    values (v_cliente, v_telegram)
    on conflict (client_id) do update set username = excluded.username;
  end if;

  insert into public.onboarding_incarichi (client_id, coach_id, revisore_id, responsabile_id)
  values (v_cliente, p_coach, p_revisore, p_responsabile)
  on conflict (client_id) do update
  set coach_id = excluded.coach_id,
      revisore_id = excluded.revisore_id,
      responsabile_id = excluded.responsabile_id;

  select c.nome, c.cognome, c.email into v_nome, v_cognome, v_email
  from public.clients c
  where c.id = v_cliente;

  -- 64 hex characters; only its hash stays on the invite
  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  insert into public.onboarding_inviti (client_id, sale_id, call_id, slug, token_hash, email, minorenne)
  values (
    v_cliente,
    p_sale_id,
    v_call,
    public.onboarding_slug(v_nome, v_cognome),
    encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
    v_email,
    coalesce(p_minorenne, false)
  )
  returning id into v_invito;

  insert into public.onboarding_inviti_token (invito_id, token) values (v_invito, v_token);

  -- the invite's own trigger may have turned it active already (a sale with money cashed)
  select i.stato into v_stato from public.onboarding_inviti i where i.id = v_invito;

  return jsonb_build_object('invito_id', v_invito, 'client_id', v_cliente, 'stato', v_stato);
end;
$$;

comment on function public.avvia_onboarding(uuid, uuid, uuid, uuid, jsonb, text, boolean) is
  'Starts the onboarding of the client of a «nuovo» sale: contacts and Telegram updated, people in charge written, the invite with its personal link (waiting for the payment, or active at once when the sale has money cashed), the path, the steps and the client''s project. Returns { invito_id, client_id, stato }. Admin only, never an OAuth token. Security invoker.';

revoke all on function public.avvia_onboarding(uuid, uuid, uuid, uuid, jsonb, text, boolean) from public, anon;
grant execute on function public.avvia_onboarding(uuid, uuid, uuid, uuid, jsonb, text, boolean) to authenticated;

-- The wizard «Nuovo cliente»: the sale and the onboarding in one transaction. p_vendita has the arguments
-- of registra_vendita by name (product_id, data_vendita, data_inizio, valore_contratto, numero_rate,
-- call_id, client_id, nome, cognome, email, telefono, instagram_handle, note, prodotto_personalizzato,
-- data_fine, rate; the p_ prefix is accepted too); p_onboarding the ones of avvia_onboarding (coach,
-- revisore, responsabile, contatti, telegram, minorenne).
create function public.nuovo_cliente(p_vendita jsonb, p_onboarding jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v jsonb;
  o jsonb;
  v_vendita uuid;
  v_cliente uuid;
  v_esito jsonb;
begin
  if public.da_client_oauth() or not public.is_admin() then
    raise exception 'L''onboarding lo avvia l''admin' using errcode = '42501';
  end if;
  if p_vendita is null or jsonb_typeof(p_vendita) <> 'object' then
    raise exception 'Dati della vendita non validi' using errcode = '22023';
  end if;
  if p_onboarding is null or jsonb_typeof(p_onboarding) <> 'object' then
    raise exception 'Dati dell''onboarding non validi' using errcode = '22023';
  end if;

  select coalesce(jsonb_object_agg(regexp_replace(e.key, '^p_', ''), e.value), '{}'::jsonb) into v
  from jsonb_each(p_vendita) e;
  select coalesce(jsonb_object_agg(regexp_replace(e.key, '^p_', ''), e.value), '{}'::jsonb) into o
  from jsonb_each(p_onboarding) e;

  if coalesce(v ->> 'tipo', 'nuovo') <> 'nuovo' then
    raise exception 'L''onboarding parte solo da una vendita a un nuovo cliente.' using errcode = '22023';
  end if;

  select r.id_vendita, r.id_cliente into v_vendita, v_cliente
  from public.registra_vendita(
    p_product_id => nullif(v ->> 'product_id', '')::uuid,
    p_tipo => 'nuovo'::public.sale_type,
    p_data_vendita => nullif(v ->> 'data_vendita', '')::date,
    p_data_inizio => nullif(v ->> 'data_inizio', '')::date,
    p_valore_contratto => nullif(v ->> 'valore_contratto', '')::numeric,
    p_numero_rate => nullif(v ->> 'numero_rate', '')::integer,
    p_call_id => nullif(v ->> 'call_id', '')::uuid,
    p_client_id => nullif(v ->> 'client_id', '')::uuid,
    p_nome => v ->> 'nome',
    p_cognome => v ->> 'cognome',
    p_email => v ->> 'email',
    p_telefono => v ->> 'telefono',
    p_instagram_handle => v ->> 'instagram_handle',
    p_note => v ->> 'note',
    p_prodotto_personalizzato => v ->> 'prodotto_personalizzato',
    p_data_fine => nullif(v ->> 'data_fine', '')::date,
    p_rate => nullif(v -> 'rate', 'null'::jsonb)
  ) r;

  v_esito := public.avvia_onboarding(
    v_vendita,
    nullif(o ->> 'coach', '')::uuid,
    nullif(o ->> 'revisore', '')::uuid,
    nullif(o ->> 'responsabile', '')::uuid,
    o -> 'contatti',
    o ->> 'telegram',
    coalesce(nullif(o ->> 'minorenne', '')::boolean, false)
  );

  return jsonb_build_object(
    'sale_id', v_vendita,
    'client_id', v_cliente,
    'invito_id', v_esito -> 'invito_id',
    'stato', v_esito -> 'stato'
  );
end;
$$;

comment on function public.nuovo_cliente(jsonb, jsonb) is
  'The wizard «Nuovo cliente»: registra_vendita (always a «nuovo» sale) and avvia_onboarding in one transaction. Returns { sale_id, client_id, invito_id, stato }. Admin only, never an OAuth token. Security invoker.';

revoke all on function public.nuovo_cliente(jsonb, jsonb) from public, anon;
grant execute on function public.nuovo_cliente(jsonb, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. The admin's actions on a link. Each one leaves its line in the log, with
--    his name (the triggers above write it while alpha.onboarding_admin is on).
-- ---------------------------------------------------------------------------
-- «Conferma pagamento»: the link turns active without any cash-in registered
create function public.onboarding_conferma_pagamento(p_invito uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v public.onboarding_inviti;
begin
  if public.da_client_oauth() or not public.is_admin() then
    raise exception 'Il pagamento lo conferma l''admin' using errcode = '42501';
  end if;

  select * into v from public.onboarding_inviti i where i.id = p_invito for update;
  if not found then
    raise exception 'Invito non trovato' using errcode = '22023';
  end if;
  if v.stato <> 'in_attesa_pagamento' then
    raise exception 'Il pagamento si conferma solo per un link in attesa di pagamento.' using errcode = '22023';
  end if;

  perform set_config('alpha.onboarding_admin', 'on', true);
  update public.onboarding_inviti i
  set stato = 'attivo', attivato_da = 'manuale'
  where i.id = p_invito;
  perform set_config('alpha.onboarding_admin', '', true);

  return (
    select jsonb_build_object('invito_id', i.id, 'client_id', i.client_id, 'stato', i.stato)
    from public.onboarding_inviti i where i.id = p_invito
  );
end;
$$;

comment on function public.onboarding_conferma_pagamento(uuid) is
  'The admin confirms the payment by hand: the link waiting for it turns active (attivato_da manuale); a minor without a parent''s consent stays waiting. Registers no cash-in. Returns { invito_id, client_id, stato }. Admin only, never an OAuth token.';

revoke all on function public.onboarding_conferma_pagamento(uuid) from public, anon;
grant execute on function public.onboarding_conferma_pagamento(uuid) to authenticated;

-- The consent of a parent, for a minor: the link turns active if it was paid or confirmed already
create function public.onboarding_consenso_genitore(p_invito uuid, p_nota text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v public.onboarding_inviti;
  v_nota text := nullif(btrim(p_nota), '');
  v_modo text;
begin
  if public.da_client_oauth() or not public.is_admin() then
    raise exception 'Il consenso del genitore lo registra l''admin' using errcode = '42501';
  end if;

  select * into v from public.onboarding_inviti i where i.id = p_invito for update;
  if not found then
    raise exception 'Invito non trovato' using errcode = '22023';
  end if;
  if not v.minorenne then
    raise exception 'Il consenso del genitore si registra solo per un cliente minorenne.' using errcode = '22023';
  end if;
  if v.consenso_genitore_il is not null then
    raise exception 'Il consenso del genitore è già registrato.' using errcode = '22023';
  end if;
  if char_length(v_nota) > 300 then
    raise exception 'La nota è troppo lunga: al massimo 300 caratteri.' using errcode = '22023';
  end if;

  update public.onboarding_inviti i
  set consenso_genitore_il = now(), consenso_genitore_nota = v_nota
  where i.id = p_invito;

  insert into public.onboarding_eventi (client_id, tipo, attore, autore_id, dettagli)
  values (v.client_id, 'consenso_genitore', 'team', (select auth.uid()), jsonb_build_object('invito_id', v.id));

  -- what was waiting only for the consent
  if v.stato = 'in_attesa_pagamento' then
    if (
      select coalesce(sum(p.importo_incassato) filter (where p.stato in ('incassata', 'rimborsata')), 0)
      from public.payments p where p.sale_id = v.sale_id
    ) > 0 then
      v_modo := 'pagamento';
    elsif exists (
      select 1 from public.onboarding_eventi e
      where e.client_id = v.client_id
        and e.tipo = 'in_attesa_consenso'
        and e.dettagli ->> 'invito_id' = v.id::text
        and e.dettagli ->> 'modo' = 'manuale'
    ) then
      v_modo := 'manuale';
    end if;

    if v_modo is not null then
      perform set_config('alpha.onboarding_admin', 'on', true);
      update public.onboarding_inviti i
      set stato = 'attivo', attivato_da = v_modo
      where i.id = p_invito;
      perform set_config('alpha.onboarding_admin', '', true);
    end if;
  end if;

  return (
    select jsonb_build_object('invito_id', i.id, 'client_id', i.client_id, 'stato', i.stato)
    from public.onboarding_inviti i where i.id = p_invito
  );
end;
$$;

comment on function public.onboarding_consenso_genitore(uuid, text) is
  'Registers the consent of a parent for a minor (with a note, 300 characters at most); the link turns active if the sale has money cashed or the admin had confirmed the payment by hand. Returns { invito_id, client_id, stato }. Admin only, never an OAuth token.';

revoke all on function public.onboarding_consenso_genitore(uuid, text) from public, anon;
grant execute on function public.onboarding_consenso_genitore(uuid, text) to authenticated;

create function public.onboarding_revoca(p_invito uuid, p_motivo text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v public.onboarding_inviti;
  v_motivo text := nullif(btrim(p_motivo), '');
begin
  if public.da_client_oauth() or not public.is_admin() then
    raise exception 'Un link lo revoca l''admin' using errcode = '42501';
  end if;

  select * into v from public.onboarding_inviti i where i.id = p_invito for update;
  if not found then
    raise exception 'Invito non trovato' using errcode = '22023';
  end if;
  if v.stato = 'revocato' then
    raise exception 'Questo link è già revocato.' using errcode = '22023';
  end if;
  if char_length(v_motivo) > 300 then
    raise exception 'Il motivo è troppo lungo: al massimo 300 caratteri.' using errcode = '22023';
  end if;

  perform set_config('alpha.onboarding_admin', 'on', true);
  update public.onboarding_inviti i
  set stato = 'revocato', revocato_motivo = v_motivo
  where i.id = p_invito;
  perform set_config('alpha.onboarding_admin', '', true);

  return (
    select jsonb_build_object('invito_id', i.id, 'client_id', i.client_id, 'stato', i.stato)
    from public.onboarding_inviti i where i.id = p_invito
  );
end;
$$;

comment on function public.onboarding_revoca(uuid, text) is
  'The admin revokes a link, with a reason (300 characters at most): the path is suspended. Returns { invito_id, client_id, stato }. Admin only, never an OAuth token.';

revoke all on function public.onboarding_revoca(uuid, text) from public, anon;
grant execute on function public.onboarding_revoca(uuid, text) to authenticated;

-- Back to what it was: active if it had been activated, waiting for the payment otherwise
create function public.onboarding_riattiva(p_invito uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v public.onboarding_inviti;
begin
  if public.da_client_oauth() or not public.is_admin() then
    raise exception 'Un link lo riattiva l''admin' using errcode = '42501';
  end if;

  select * into v from public.onboarding_inviti i where i.id = p_invito for update;
  if not found then
    raise exception 'Invito non trovato' using errcode = '22023';
  end if;
  if v.stato <> 'revocato' then
    raise exception 'Si riattiva solo un link revocato.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.onboarding_inviti i
    where i.client_id = v.client_id and i.id <> v.id and i.stato in ('in_attesa_pagamento', 'attivo', 'usato')
  ) then
    raise exception 'Questo cliente ha già un onboarding avviato.' using errcode = '22023';
  end if;

  perform set_config('alpha.onboarding_admin', 'on', true);
  update public.onboarding_inviti i
  set stato = case
                when v.usato_il is not null then 'usato'
                when v.attivato_il is not null then 'attivo'
                else 'in_attesa_pagamento'
              end
  where i.id = p_invito;
  perform set_config('alpha.onboarding_admin', '', true);

  return (
    select jsonb_build_object('invito_id', i.id, 'client_id', i.client_id, 'stato', i.stato)
    from public.onboarding_inviti i where i.id = p_invito
  );
end;
$$;

comment on function public.onboarding_riattiva(uuid) is
  'The admin reactivates a revoked link: active again if it had been activated (used, if it had been used), waiting for the payment otherwise; the path is back where it was. Returns { invito_id, client_id, stato }. Admin only, never an OAuth token.';

revoke all on function public.onboarding_riattiva(uuid) from public, anon;
grant execute on function public.onboarding_riattiva(uuid) to authenticated;

-- A new token on the same invite, not used yet. An expired or revoked one goes back to the state the
-- payment justifies.
create function public.onboarding_rigenera_link(p_invito uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v public.onboarding_inviti;
  v_token text;
  v_stato text;
  v_modo text;
begin
  if public.da_client_oauth() or not public.is_admin() then
    raise exception 'Un link lo rigenera l''admin' using errcode = '42501';
  end if;

  select * into v from public.onboarding_inviti i where i.id = p_invito for update;
  if not found then
    raise exception 'Invito non trovato' using errcode = '22023';
  end if;
  if v.stato = 'usato' then
    raise exception 'Il link è già stato usato: non si rigenera.' using errcode = '22023';
  end if;

  v_stato := v.stato;
  v_modo := v.attivato_da;
  if v.stato in ('revocato', 'scaduto') then
    if exists (
      select 1 from public.onboarding_inviti i
      where i.client_id = v.client_id and i.id <> v.id and i.stato in ('in_attesa_pagamento', 'attivo', 'usato')
    ) then
      raise exception 'Questo cliente ha già un onboarding avviato.' using errcode = '22023';
    end if;

    if (
      select coalesce(sum(p.importo_incassato) filter (where p.stato in ('incassata', 'rimborsata')), 0)
      from public.payments p where p.sale_id = v.sale_id
    ) > 0 then
      v_stato := 'attivo';
      v_modo := 'pagamento';
    elsif v.attivato_da = 'manuale' then
      v_stato := 'attivo';
      v_modo := 'manuale';
    else
      v_stato := 'in_attesa_pagamento';
      v_modo := null;
    end if;
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  perform set_config('alpha.onboarding_admin', 'on', true);
  update public.onboarding_inviti i
  set token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
      stato = v_stato,
      attivato_da = case when v_stato = 'attivo' then v_modo else i.attivato_da end
  where i.id = p_invito;
  perform set_config('alpha.onboarding_admin', '', true);

  insert into public.onboarding_inviti_token (invito_id, token) values (p_invito, v_token);

  insert into public.onboarding_eventi (client_id, tipo, attore, autore_id, dettagli)
  values (v.client_id, 'link_rigenerato', 'team', (select auth.uid()), jsonb_build_object('invito_id', v.id));

  return (
    select jsonb_build_object('invito_id', i.id, 'client_id', i.client_id, 'stato', i.stato)
    from public.onboarding_inviti i where i.id = p_invito
  );
end;
$$;

comment on function public.onboarding_rigenera_link(uuid) is
  'A new token (and hash) on the same invite, not used yet; an expired or revoked one goes back to the state the payment justifies (active with money cashed or a payment confirmed by hand, waiting otherwise). Returns { invito_id, client_id, stato }. Admin only, never an OAuth token.';

revoke all on function public.onboarding_rigenera_link(uuid) from public, anon;
grant execute on function public.onboarding_rigenera_link(uuid) to authenticated;

-- The people in charge of a client in onboarding; with an active link the project and its tasks follow
create function public.onboarding_imposta_incarichi(p_client_id uuid, p_coach uuid, p_revisore uuid, p_responsabile uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if public.da_client_oauth() or not public.is_admin() then
    raise exception 'Gli incarichi li sceglie l''admin' using errcode = '42501';
  end if;

  if not exists (select 1 from public.onboarding_percorsi p where p.client_id = p_client_id)
     and not exists (select 1 from public.onboarding_inviti i where i.client_id = p_client_id) then
    raise exception 'Questo cliente non ha un onboarding.' using errcode = '22023';
  end if;
  if p_responsabile is null then
    raise exception 'Scegli il responsabile dell''onboarding.' using errcode = '22023';
  end if;
  if exists (
    select 1
    from unnest(array[p_coach, p_revisore, p_responsabile]) as u(id)
    where u.id is not null
      and not exists (
        select 1 from public.profiles x where x.id = u.id and x.attivo and x.ruolo <> 'business_coach'
      )
  ) then
    raise exception 'Coach, revisore e responsabile devono essere persone attive del team.' using errcode = '22023';
  end if;

  perform set_config('alpha.onboarding_admin', 'on', true);
  insert into public.onboarding_incarichi (client_id, coach_id, revisore_id, responsabile_id)
  values (p_client_id, p_coach, p_revisore, p_responsabile)
  on conflict (client_id) do update
  set coach_id = excluded.coach_id,
      revisore_id = excluded.revisore_id,
      responsabile_id = excluded.responsabile_id;
  perform set_config('alpha.onboarding_admin', '', true);

  -- that they changed, never who they are: the log names nobody but the admin who did it
  insert into public.onboarding_eventi (client_id, tipo, attore, autore_id, dettagli)
  values (p_client_id, 'incarichi_modificati', 'team', (select auth.uid()), '{}'::jsonb);

  return jsonb_build_object('client_id', p_client_id);
end;
$$;

comment on function public.onboarding_imposta_incarichi(uuid, uuid, uuid, uuid) is
  'Sets coach, reviewer and responsible of a client in onboarding (the responsible is required; active people of the team); while the link is active the project and its tasks follow. Returns { client_id }. Admin only, never an OAuth token.';

revoke all on function public.onboarding_imposta_incarichi(uuid, uuid, uuid, uuid) from public, anon;
grant execute on function public.onboarding_imposta_incarichi(uuid, uuid, uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. Views (security invoker; the admin only, said in the views themselves:
--     a closer reads his own sales and would otherwise see them as «without
--     onboarding», and nobody but the admin reads the state of a link)
-- ---------------------------------------------------------------------------
create view public.v_onboarding
with (security_invoker = true) as
select
  p.client_id,
  c.nome,
  c.cognome,
  coalesce(i.sale_id, p.sale_id) as sale_id,
  i.id as invito_id,
  i.slug,
  case
    when i.stato = 'attivo' and i.scade_il is not null and i.scade_il < now() then 'scaduto'
    else i.stato
  end as invito_stato,
  i.attivato_il,
  i.attivato_da,
  i.scade_il,
  i.usato_il,
  i.revocato_il,
  i.revocato_motivo,
  i.minorenne,
  i.consenso_genitore_il,
  p.stato as percorso_stato,
  p.giorno_zero,
  p.completato_il,
  passo.passo as passo_corrente,
  passo.titolo as passo_titolo,
  passo.attore as passo_attore,
  passo.stato as passo_stato,
  inc.coach_id,
  pc.nome as coach_nome,
  inc.revisore_id,
  pr.nome as revisore_nome,
  inc.responsabile_id,
  ps.nome as responsabile_nome,
  pg.id as progetto_id,
  p.created_at
from public.onboarding_percorsi p
join public.clients c on c.id = p.client_id
-- the living invite of the client, else the most recent one
left join lateral (
  select x.*
  from public.onboarding_inviti x
  where x.client_id = p.client_id
  order by (x.stato in ('in_attesa_pagamento', 'attivo', 'usato')) desc, x.created_at desc, x.id
  limit 1
) i on true
-- the current step: the first one not done yet
left join lateral (
  select s.passo, d.titolo, d.attore, s.stato
  from public.onboarding_passi s
  join public.onboarding_passi_def d on d.versione = s.versione and d.chiave = s.passo
  where s.client_id = p.client_id and s.stato <> 'fatto'
  order by d.ordine
  limit 1
) passo on true
left join public.onboarding_incarichi inc on inc.client_id = p.client_id
left join public.profiles pc on pc.id = inc.coach_id
left join public.profiles pr on pr.id = inc.revisore_id
left join public.profiles ps on ps.id = inc.responsabile_id
left join public.pm_progetti pg on pg.client_id = p.client_id
where (select public.is_admin()) and not (select public.da_client_oauth());

comment on view public.v_onboarding is
  'One row per client with an onboarding: the client, the state of the link (scaduto when its days are over), the state of the path, the current step and who it is up to, the people in charge, the project. Admin only.';

revoke all on public.v_onboarding from anon, authenticated;
grant select on public.v_onboarding to authenticated;

create view public.v_vendite_senza_onboarding
with (security_invoker = true) as
select
  s.id as sale_id,
  s.client_id,
  c.nome,
  c.cognome,
  s.data_vendita,
  s.data_inizio,
  s.data_fine,
  coalesce(pr.nome, s.prodotto_personalizzato) as prodotto,
  s.call_id,
  s.created_at
from public.sales s
join public.clients c on c.id = s.client_id
left join public.products pr on pr.id = s.product_id
where s.tipo = 'nuovo'
  and s.data_fine >= public.oggi()
  and not exists (select 1 from public.onboarding_inviti i where i.client_id = s.client_id)
  and not exists (select 1 from public.onboarding_percorsi p where p.client_id = s.client_id)
  and (select public.is_admin())
  and not (select public.da_client_oauth());

comment on view public.v_vendite_senza_onboarding is
  'The «nuovo» sales whose path is not over and whose client has neither an invite nor a path: client, dates, product. Never an amount. Admin only.';

revoke all on public.v_vendite_senza_onboarding from anon, authenticated;
grant select on public.v_vendite_senza_onboarding to authenticated;
