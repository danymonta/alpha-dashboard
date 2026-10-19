-- In-app alerts in the notification center (1.42.0, CLAUDE.md sections 8, 10, 15 and 17).
--
-- Dany, 19/10/2026, asked for four alerts in the center that 1.41.0 created: «rate in ritardo, token di Instagram
-- in scadenza, giornate di Loris da approvare, spesa di Claude vicina al limite». He answered «si tutte». They live
-- only in the app (no email): the recipients are the active admins, and every alert has a stable key per
-- recipient, so a re-run or a second delivery of a cron never repeats it.
--
--  1. public.notifiche: a canale column ('email', the 1.41.0 ones; 'app', the alerts), an optional dettagli list
--     (plain lines, shown in the detail page) and a nullable corpo_html (only an email carries HTML); four new
--     kinds of notification.
--  2. public.rate_notificate: which overdue instalments were already announced, so a rata is announced once.
--  3. public.notifiche_avvisi_emessi + notifiche_avviso / notifiche_avviso_admin: the writers (service_role
--     only). A key is emitted once for all: a re-run, a second delivery of a cron, or the same scan the next
--     evening never repeats an alert, and an alert the admin deleted is not created again.
--  4. notifiche_rate_in_ritardo(giorno): the evening digest of the instalments that became overdue.
--  5. notifiche_collegamenti_stato(): what the evening scan reads of the Instagram, Messenger and Fathom
--     connections (never a token or a key).
--  6. instagram_salva_proposta: a NEW proposal (never a recalculation) tells the admins to decide it.
--  7. marketing_passo_finito / call_passo_finito: crossing 80% and 100% of the month's limit tells the admins.
--
-- Nothing here is about what a person did or did not fill in: money, keys, Claude's spend and the one thing
-- the admin decides (the Instagram proposal of a setter, decision of 08/10/2026), CLAUDE.md section 17.

-- ---------------------------------------------------------------------------
-- 1. The table: canale, dettagli, corpo_html optional, the new kinds
-- ---------------------------------------------------------------------------
alter table public.notifiche
  add column canale text not null default 'email'
    constraint notifiche_canale_check check (canale in ('email', 'app')),
  -- up to 31 plain lines of text (the detail page shows them as a list, escaped by React): no HTML
  add column dettagli jsonb
    constraint notifiche_dettagli_check check (
      dettagli is null
      or (jsonb_typeof(dettagli) = 'array'
          and jsonb_array_length(dettagli) <= 31
          and not jsonb_path_exists(dettagli, '$[*] ? (@.type() != "string")'))
    );

alter table public.notifiche alter column corpo_html drop not null;

-- an email always carries its HTML; an alert never does (and never says an email left)
alter table public.notifiche
  add constraint notifiche_corpo_per_canale check (
    (canale = 'email' and corpo_html is not null)
    or (canale = 'app' and corpo_html is null and not email_inviata)
  );

alter table public.notifiche drop constraint notifiche_tipo_check;
alter table public.notifiche
  add constraint notifiche_tipo_check check (tipo in (
    'riepilogo_settimana', 'backup', 'promemoria_feedback', 'promemoria_rinnovo',
    'rate_in_ritardo', 'chiave_in_scadenza', 'chiave_rifiutata', 'proposta_da_approvare', 'spesa_claude'
  ));

comment on column public.notifiche.canale is
  'email: the in-app copy of an email the app sent (or tried to send); app: an alert that exists only here (no email, no corpo_html).';
comment on column public.notifiche.dettagli is
  'Optional list of plain text lines (at most 31) for the detail page of an alert (for example the overdue instalments). Never HTML.';

-- ---------------------------------------------------------------------------
-- 2. The instalments already announced (nobody reads it: the writer is notifiche_rate_in_ritardo)
-- ---------------------------------------------------------------------------
create table public.rate_notificate (
  payment_id uuid primary key references public.payments (id) on delete cascade,
  notificata_il date not null default public.oggi()
);

comment on table public.rate_notificate is
  'The overdue instalments the evening digest already announced (one row per payment): a rata is announced once. No session reads or writes it; notifiche_rate_in_ritardo (service_role) does. No created_by and no updated_at: written once by the app.';

alter table public.rate_notificate enable row level security;
create policy rate_notificate_nessuna_sessione on public.rate_notificate
  for all to authenticated using (false) with check (false);
create policy rate_notificate_mai_da_oauth on public.rate_notificate
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));
revoke all on public.rate_notificate from anon;
revoke all on public.rate_notificate from authenticated;

-- ---------------------------------------------------------------------------
-- 2b. The keys already emitted (an alert the admin deleted is not created again by the next scan)
-- ---------------------------------------------------------------------------
create table public.notifiche_avvisi_emessi (
  chiave text primary key check (char_length(chiave) between 1 and 200),
  emessa_il timestamptz not null default now()
);

comment on table public.notifiche_avvisi_emessi is
  'The keys of the in-app alerts already emitted, whoever received them: the same key is never emitted twice, even when the admin deleted the notification. No session reads or writes it; notifiche_avviso (service_role) does. Cleaned after 12 months with the notifications. No created_by and no updated_at: written once by the app.';

alter table public.notifiche_avvisi_emessi enable row level security;
create policy notifiche_avvisi_emessi_nessuna_sessione on public.notifiche_avvisi_emessi
  for all to authenticated using (false) with check (false);
create policy notifiche_avvisi_emessi_mai_da_oauth on public.notifiche_avvisi_emessi
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));
revoke all on public.notifiche_avvisi_emessi from anon;
revoke all on public.notifiche_avvisi_emessi from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Small pure helpers (the text of the alerts is built in SQL where the event happens)
-- ---------------------------------------------------------------------------
create function public.notifiche_euro(p_importo numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_importo < 0 then '-' else '' end
    || regexp_replace(split_part(to_char(abs(round(p_importo, 2)), 'FM9999999990.00'), '.', 1), '(\d)(?=(\d{3})+$)', '\1.', 'g')
    || ',' || split_part(to_char(abs(round(p_importo, 2)), 'FM9999999990.00'), '.', 2) || ' €';
$$;

create function public.notifiche_dollari(p_importo numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(to_char(round(p_importo, 2), 'FM9999990.00'), '.', ',') || ' $';
$$;

create function public.notifiche_data(p_giorno date)
returns text
language sql
immutable
set search_path = ''
as $$
  select to_char(p_giorno, 'DD/MM/YYYY');
$$;

revoke all on function public.notifiche_euro(numeric) from public, anon, authenticated;
revoke all on function public.notifiche_dollari(numeric) from public, anon, authenticated;
revoke all on function public.notifiche_data(date) from public, anon, authenticated;

-- the retention of 1.41.0 also forgets the emitted keys after 12 months
create or replace function public.notifiche_pulizia()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.notifiche where created_at < now() - interval '12 months';
  get diagnostics n = row_count;
  delete from public.notifiche_avvisi_emessi where emessa_il < now() - interval '12 months';
  return n;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The writers (service_role only)
-- ---------------------------------------------------------------------------
create function public.notifiche_avviso(
  p_destinatari uuid[],
  p_tipo text,
  p_titolo text,
  p_anteprima text,
  p_dettagli jsonb,
  p_link text,
  p_chiave text
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  n integer;
begin
  select array_agg(p.id) into v_ids from public.profiles p where p.id = any (coalesce(p_destinatari, '{}'::uuid[]));
  -- nobody to tell: nothing is emitted, the key stays free for when there is somebody
  if v_ids is null then
    return 0;
  end if;
  -- a key is emitted once, for everybody: a repeat writes nothing, not even when the first one was deleted
  insert into public.notifiche_avvisi_emessi (chiave) values (p_chiave) on conflict (chiave) do nothing;
  get diagnostics n = row_count;
  if n = 0 then
    return 0;
  end if;
  insert into public.notifiche (destinatario_id, tipo, titolo, anteprima, corpo_html, dettagli, link, email_inviata, chiave, canale)
  select id, p_tipo, p_titolo, coalesce(p_anteprima, ''), null, p_dettagli, p_link, false, p_chiave, 'app'
  from unnest(v_ids) as id
  on conflict (destinatario_id, chiave) do nothing;
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.notifiche_avviso(uuid[], text, text, text, jsonb, text, text) is
  'service_role only: saves an in-app alert (no email, no HTML) for the given existing profiles, once per chiave (notifiche_avvisi_emessi): a repeat writes nothing, even if the first one was deleted. The checks of the table (kind, sizes, internal link, at most 31 lines) raise 23514. Returns the rows written.';
revoke all on function public.notifiche_avviso(uuid[], text, text, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.notifiche_avviso(uuid[], text, text, text, jsonb, text, text) to service_role;

-- The same, for the active admins (the people who receive the emails)
create function public.notifiche_avviso_admin(
  p_tipo text,
  p_titolo text,
  p_anteprima text,
  p_dettagli jsonb,
  p_link text,
  p_chiave text
)
returns integer
language sql
volatile
security definer
set search_path = ''
as $$
  select public.notifiche_avviso(
    (select array_agg(p.id) from public.profiles p where p.ruolo = 'admin' and p.attivo),
    p_tipo, p_titolo, p_anteprima, p_dettagli, p_link, p_chiave);
$$;

comment on function public.notifiche_avviso_admin(text, text, text, jsonb, text, text) is
  'service_role only (for the functions that run as it): notifiche_avviso for every active admin.';
revoke all on function public.notifiche_avviso_admin(text, text, text, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.notifiche_avviso_admin(text, text, text, jsonb, text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 5. Overdue instalments: the evening digest
-- ---------------------------------------------------------------------------
create function public.notifiche_rate_in_ritardo(p_giorno date)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
  v_totale numeric;
  v_nuove integer;
  v_dettagli jsonb;
  v_piu_vecchia date;
  v_creata integer;
begin
  if p_giorno is null then
    raise exception 'Giorno non valido' using errcode = '22023';
  end if;
  -- two runs at once (a cron delivered twice) take turns
  perform pg_advisory_xact_lock(hashtextextended('alpha.notifiche_rate', 0));

  -- overdue = still 'prevista' and past its due date (the definition of CLAUDE.md section 8), and not announced
  select array_agg(p.id order by p.scadenza, c.nome, c.cognome, p.numero_rata, p.id),
         sum(p.importo_previsto), min(p.scadenza)
  into v_ids, v_totale, v_piu_vecchia
  from public.payments p
  join public.sales s on s.id = p.sale_id
  join public.clients c on c.id = s.client_id
  where p.stato = 'prevista' and p.scadenza < p_giorno
    and not exists (select 1 from public.rate_notificate r where r.payment_id = p.id);

  if v_ids is null then
    return 0;
  end if;
  v_nuove := cardinality(v_ids);

  -- the first 20 lines, oldest first; the rest as a count
  select jsonb_agg(
           btrim(concat_ws(' ', c.nome, c.cognome))
           || ' · Rata ' || p.numero_rata || ' di ' || s.numero_rate
           || ' · ' || public.notifiche_euro(p.importo_previsto)
           || ' · scaduta il ' || public.notifiche_data(p.scadenza)
           order by u.ord)
  into v_dettagli
  from unnest(v_ids) with ordinality as u(id, ord)
  join public.payments p on p.id = u.id
  join public.sales s on s.id = p.sale_id
  join public.clients c on c.id = s.client_id
  where u.ord <= 20;
  if v_nuove > 20 then
    v_dettagli := v_dettagli || to_jsonb('e altre ' || (v_nuove - 20) || ' rate: le trovi in Incassi.'::text);
  end if;

  v_creata := public.notifiche_avviso_admin(
    'rate_in_ritardo',
    case when v_nuove = 1 then '1 rata è andata in ritardo' else v_nuove || ' rate sono andate in ritardo' end,
    public.notifiche_euro(v_totale) || ' da incassare, la più vecchia scaduta il ' || public.notifiche_data(v_piu_vecchia) || '.',
    v_dettagli,
    '/payments?vista=ritardo',
    'rate-in-ritardo/' || p_giorno
  );

  -- announced only when the alert was really written: if the key already existed (a rata that appeared late on
  -- the same day) or there is no active admin, they go in tomorrow's digest
  if v_creata > 0 then
    insert into public.rate_notificate (payment_id, notificata_il)
    select u, p_giorno from unnest(v_ids) as u
    on conflict (payment_id) do nothing;
    return v_nuove;
  end if;
  return 0;
end;
$$;

comment on function public.notifiche_rate_in_ritardo(date) is
  'service_role only (the evening cron): one digest per day of the instalments that became overdue (prevista, scadenza before the day) and were not announced yet, for every active admin; key rate-in-ritardo/<day>. Nothing new, nothing written. Returns the instalments announced.';
revoke all on function public.notifiche_rate_in_ritardo(date) from public, anon, authenticated;
grant execute on function public.notifiche_rate_in_ritardo(date) to service_role;

-- ---------------------------------------------------------------------------
-- 6. What the evening scan reads of the connections (never a token or a key)
-- ---------------------------------------------------------------------------
create function public.notifiche_collegamenti_stato()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'instagram', (
      select jsonb_build_object(
        'presente', exists (select 1 from vault.secrets s where s.name = 'instagram_token'),
        'scade_il', c.token_scade_il,
        'errore', c.ultimo_errore,
        'errore_il', c.ultimo_errore_il)
      from public.instagram_collegamento c where c.id),
    'messenger', (
      select jsonb_build_object(
        'presente', exists (select 1 from vault.secrets s where s.name = 'messenger_token'),
        'errore', m.ultimo_errore,
        'errore_il', m.ultimo_errore_il)
      from public.messenger_collegamento m where m.id),
    'fathom', (
      select jsonb_build_object(
        'presente', exists (select 1 from vault.secrets s where s.name = 'fathom_chiave'),
        'errore', f.ultimo_errore,
        'errore_il', f.ultimo_errore_il)
      from public.fathom_collegamento f where f.id)
  );
$$;

comment on function public.notifiche_collegamenti_stato() is
  'service_role only (the evening cron): whether each connection has its token or key, when the Instagram token ends and the last error with its time. Never a token or a key.';
revoke all on function public.notifiche_collegamenti_stato() from public, anon, authenticated;
grant execute on function public.notifiche_collegamenti_stato() to service_role;

-- ---------------------------------------------------------------------------
-- 7. A new Instagram proposal to decide
-- ---------------------------------------------------------------------------
create function public.notifiche_proposta(p_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_data date;
  v_nome text;
  v_giorno text;
begin
  select x.data, split_part(btrim(p.nome), ' ', 1)
  into v_data, v_nome
  from public.report_proposte_instagram x
  join public.profiles p on p.id = x.setter_id
  where x.id = p_id and x.stato = 'da_confermare';
  if v_data is null then
    return 0;
  end if;
  -- «ieri, mercoledì 07/10» for yesterday, «lunedì 05/10» for an older day (a recalculated old day, a restore)
  v_giorno := (array['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'])[extract(dow from v_data)::int + 1]
    || ' ' || to_char(v_data, 'DD/MM');
  if v_data = public.oggi() - 1 then
    v_giorno := 'ieri, ' || v_giorno;
  end if;
  return public.notifiche_avviso_admin(
    'proposta_da_approvare',
    'Da approvare: il tracciamento di ' || coalesce(nullif(v_nome, ''), 'un setter') || ' di ' || v_giorno,
    'Sono i numeri contati dai DM: confermali, correggili o tieni quelli del setter.',
    null,
    '/setting#da-approvare',
    'proposta/' || p_id
  );
end;
$$;

comment on function public.notifiche_proposta(uuid) is
  'service_role only: tells every active admin that a setter''s Instagram proposal is waiting for a decision (key proposta/<id>). Nothing for a proposal already decided.';
revoke all on function public.notifiche_proposta(uuid) from public, anon, authenticated;
grant execute on function public.notifiche_proposta(uuid) to service_role;

-- copied from 20261008090000_report_da_instagram.sql, plus: a proposal that is NEW (inserted now, not updated)
-- tells the admins to decide it; a recalculation of the same proposal never does
create or replace function public.instagram_salva_proposta(
  p_setter uuid,
  p_data date,
  p_dm_outbound integer,
  p_dm_inbound integer,
  p_follow_up integer,
  p_conversazioni integer,
  p_call_proposte integer,
  p_chat_lette integer,
  p_chat_incerte integer,
  p_discovery_prenotate integer default null
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_discovery integer := coalesce(p_discovery_prenotate, public.discovery_prenotate_del_giorno(p_setter, p_data));
  v_id uuid;
  v_nuova boolean;
begin
  if p_setter is null
     or not exists (select 1 from public.instagram_collegamento c where c.id and c.setter_id = p_setter)
     or not exists (select 1 from public.profiles p where p.id = p_setter and p.ruolo = 'setter' and p.attivo) then
    raise exception 'La proposta va al setter attivo collegato a Instagram' using errcode = '22023';
  end if;
  if p_data is null or p_data >= public.oggi() then
    raise exception 'La proposta è di un giorno già finito' using errcode = '22023';
  end if;
  if exists (
    select 1
    from unnest(array[p_dm_outbound, p_dm_inbound, p_follow_up, p_conversazioni, p_call_proposte, v_discovery]) as n(v)
    where n.v is null or n.v < 0 or n.v > 9999
  ) then
    raise exception 'I numeri della proposta vanno da 0 a 9999' using errcode = '22023';
  end if;
  if p_chat_lette is null or p_chat_incerte is null or p_chat_lette < 0 or p_chat_incerte < 0
     or p_chat_incerte > p_chat_lette then
    raise exception 'Chat lette e incerte non valide' using errcode = '22023';
  end if;

  insert into public.report_proposte_instagram as x (
    setter_id, data, dm_outbound, dm_inbound, follow_up, conversazioni, call_proposte,
    discovery_prenotate, chat_lette, chat_incerte, calcolato_il
  )
  values (
    p_setter, p_data, p_dm_outbound, p_dm_inbound, p_follow_up, p_conversazioni, p_call_proposte,
    v_discovery, p_chat_lette, p_chat_incerte, now()
  )
  on conflict (setter_id, data) do update
    set dm_outbound = excluded.dm_outbound,
        dm_inbound = excluded.dm_inbound,
        follow_up = excluded.follow_up,
        conversazioni = excluded.conversazioni,
        call_proposte = excluded.call_proposte,
        discovery_prenotate = excluded.discovery_prenotate,
        chat_lette = excluded.chat_lette,
        chat_incerte = excluded.chat_incerte,
        -- a new moment only when something changed: the same numbers again
        -- (a second delivery of the cron, "Ricalcola ieri" on a day already
        -- counted) leave the proposal as the setter saw it, so his
        -- confirmation is not refused over numbers that did not change
        calcolato_il = case
          when (x.dm_outbound, x.dm_inbound, x.follow_up, x.conversazioni, x.call_proposte,
                x.discovery_prenotate, x.chat_lette, x.chat_incerte)
               is distinct from
               (excluded.dm_outbound, excluded.dm_inbound, excluded.follow_up, excluded.conversazioni,
                excluded.call_proposte, excluded.discovery_prenotate, excluded.chat_lette, excluded.chat_incerte)
            then excluded.calcolato_il
          else x.calcolato_il
        end
    -- the setter's decision always wins
    where x.stato = 'da_confermare'
  -- xmax is 0 on a row that was just inserted, not on one that conflicted and was updated
  returning x.id, (x.xmax::text = '0') into v_id, v_nuova;

  update public.instagram_collegamento
  set ultimo_calcolo_il = now(),
      ultimo_calcolo_giorno = p_data,
      ultimo_calcolo_chat = p_chat_lette,
      ultimo_errore = null,
      ultimo_errore_il = null
  where id;

  -- the admins decide these proposals too (08/10/2026): a NEW one is an alert; it never fails the job
  if v_id is not null and v_nuova then
    begin
      perform public.notifiche_proposta(v_id);
    exception when others then
      raise warning 'notifica della proposta non registrata (%)', sqlstate;
    end;
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Claude's spend near the monthly limit
-- ---------------------------------------------------------------------------
-- p_area: 'reel' (the reel analyses) or 'call' (the calls and the Spunti). Called by the two step-ending
-- functions with the cost before and after the step: only a step that CROSSES a threshold writes (a notification
-- the admin deleted is not recreated by the next step), 80% or, when the step crosses both, 100%.
create function public.notifiche_spesa(p_area text, p_mese date, p_prima numeric, p_dopo numeric, p_max numeric)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_soglia integer;
  v_nome text;
  v_link text;
  v_mesi text[] := array['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto',
                         'settembre', 'ottobre', 'novembre', 'dicembre'];
  v_riprende date := (p_mese + interval '1 month')::date;
begin
  if p_area not in ('reel', 'call') or p_max is null or p_max <= 0 then
    return 0;
  end if;
  if p_prima < p_max and p_dopo >= p_max then
    v_soglia := 100;
  elsif p_prima < p_max * 0.8 and p_dopo >= p_max * 0.8 and p_dopo < p_max then
    v_soglia := 80;
  else
    return 0;
  end if;
  v_nome := case p_area when 'reel' then 'le analisi dei reel' else 'le analisi delle call e gli Spunti' end;
  v_link := case p_area when 'reel' then '/settings/instagram#analisi-reel' else '/settings/fathom' end;

  if v_soglia = 100 then
    return public.notifiche_avviso_admin(
      'spesa_claude',
      'Limite di spesa di Claude raggiunto: ' || v_nome || ' sono ferme',
      public.notifiche_dollari(p_dopo) || ' su ' || public.notifiche_dollari(p_max) || ' questo mese: '
        || v_nome || ' sono ferme fino al 1° ' || v_mesi[extract(month from v_riprende)::int] || '.',
      jsonb_build_array('Se vuoi che riprendano prima, alza il limite del mese nelle impostazioni.'),
      v_link,
      'spesa/' || p_area || '/' || to_char(p_mese, 'YYYY-MM') || '/100');
  end if;
  return public.notifiche_avviso_admin(
    'spesa_claude',
    'La spesa di Claude è all’80% del limite: ' || v_nome,
    public.notifiche_dollari(p_dopo) || ' su ' || public.notifiche_dollari(p_max)
      || ' questo mese. Al limite ' || v_nome || ' si fermano fino al 1° ' || v_mesi[extract(month from v_riprende)::int] || '.',
    jsonb_build_array('Puoi alzare il limite del mese nelle impostazioni.'),
    v_link,
    'spesa/' || p_area || '/' || to_char(p_mese, 'YYYY-MM') || '/80');
end;
$$;

comment on function public.notifiche_spesa(text, date, numeric, numeric, numeric) is
  'service_role only (the step-ending functions): an in-app alert for the active admins when a step takes the month''s spend of Claude over 80% or over 100% of the limit; key spesa/<area>/<YYYY-MM>/<80|100>. Writes only when the step crosses the threshold.';
revoke all on function public.notifiche_spesa(text, date, numeric, numeric, numeric) from public, anon, authenticated;
grant execute on function public.notifiche_spesa(text, date, numeric, numeric, numeric) to service_role;

-- copied from 20261016090200_analisi_funzioni.sql, plus the alert
create or replace function public.marketing_passo_finito(p_passo uuid, p_esito text, p_contatori jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.marketing_lavori_stato;
  c jsonb := coalesce(p_contatori, '{}'::jsonb);
  v_oggi_mese date := date_trunc('month', public.oggi())::date;
  chiave text;
  v_prima numeric;
  v_dopo numeric;
  v_max numeric;
begin
  if p_esito is null or p_esito not in ('ok', 'parziale', 'fallito', 'senza_chiave', 'limite_spesa', 'limite_fornitore') then
    raise exception 'Esito non valido.' using errcode = '22023';
  end if;
  if jsonb_typeof(c) <> 'object' then
    raise exception 'Contatori non validi.' using errcode = '22023';
  end if;
  for chiave in select k from jsonb_object_keys(c) as k loop
    if chiave in ('input', 'cache_scritti', 'cache_letti', 'output', 'secondi_audio')
       and (jsonb_typeof(c -> chiave) <> 'number' or (c ->> chiave) !~ '^[0-9]{1,12}$') then
      raise exception 'Contatore non valido: %', chiave using errcode = '22023';
    end if;
  end loop;

  select * into s from public.marketing_lavori_stato x where x.id for update;
  if s.passo_id is distinct from p_passo then
    return false;
  end if;

  -- the spend before this step (a new month starts from zero)
  v_prima := case when s.mese <> v_oggi_mese then 0 else s.costo_mese_usd end;

  -- a step that ends in a new month starts the new month's counters first
  if s.mese <> v_oggi_mese then
    update public.marketing_lavori_stato x
    set mese = v_oggi_mese, token_input = 0, token_cache_scritti = 0, token_cache_letti = 0, token_output = 0,
        secondi_audio = 0, costo_mese_usd = 0
    where x.id;
  end if;

  update public.marketing_lavori_stato x
  set token_input = x.token_input + coalesce((c ->> 'input')::bigint, 0),
      token_cache_scritti = x.token_cache_scritti + coalesce((c ->> 'cache_scritti')::bigint, 0),
      token_cache_letti = x.token_cache_letti + coalesce((c ->> 'cache_letti')::bigint, 0),
      token_output = x.token_output + coalesce((c ->> 'output')::bigint, 0),
      secondi_audio = x.secondi_audio + coalesce((c ->> 'secondi_audio')::integer, 0)
  where x.id;
  update public.marketing_lavori_stato x
  set costo_mese_usd = round(
        public.insight_costo_usd(x.token_input, x.token_cache_scritti, x.token_cache_letti, x.token_output)
        + x.secondi_audio * 0.111 / 3600.0, 4),
      ultimo_passo_il = now(),
      ultimo_esito = p_esito,
      ultimo_errore = case when p_esito in ('ok', 'parziale') then null else x.ultimo_errore end,
      lease_fino_al = null, passo_id = null, passo_cosa = null, passo_rif = null
  where x.id
  returning x.costo_mese_usd, x.costo_max_mese into v_dopo, v_max;

  -- the admins are told when the month's spend crosses 80% and 100% of the limit; never fails the step
  begin
    perform public.notifiche_spesa('reel', v_oggi_mese, v_prima, v_dopo, v_max);
  exception when others then
    raise warning 'avviso di spesa non registrato (%)', sqlstate;
  end;

  -- a rate limit of the provider stops the chain: the tick starts it again in 5 minutes
  if p_esito <> 'limite_fornitore' and public.marketing_c_e_lavoro() then
    perform public.marketing_dispatch();
  end if;
  return true;
end;
$$;

-- copied from 20261018090400_analisi_call.sql, plus the alert
create or replace function public.call_passo_finito(p_passo uuid, p_esito text, p_contatori jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.call_lavori_stato;
  c jsonb := coalesce(p_contatori, '{}'::jsonb);
  v_mese date := date_trunc('month', public.oggi())::date;
  chiave text;
  v_prima numeric;
  v_dopo numeric;
  v_max numeric;
begin
  if p_esito is null or p_esito not in ('ok', 'parziale', 'fallito', 'senza_chiave', 'limite_spesa', 'limite_fornitore') then
    raise exception 'Esito non valido.' using errcode = '22023';
  end if;
  if jsonb_typeof(c) <> 'object' then
    raise exception 'Contatori non validi.' using errcode = '22023';
  end if;
  for chiave in select k from jsonb_object_keys(c) as k loop
    if chiave in ('input', 'cache_scritti', 'cache_letti', 'output')
       and (jsonb_typeof(c -> chiave) <> 'number' or (c ->> chiave) !~ '^[0-9]{1,12}$') then
      raise exception 'Contatore non valido: %', chiave using errcode = '22023';
    end if;
  end loop;

  select * into s from public.call_lavori_stato x where x.id for update;
  if s.passo_id is distinct from p_passo then
    return false;
  end if;

  -- the spend before this step (a new month starts from zero)
  v_prima := case when s.mese <> v_mese then 0 else s.costo_mese_usd end;

  if s.mese <> v_mese then
    update public.call_lavori_stato x
    set mese = v_mese, token_input = 0, token_cache_scritti = 0, token_cache_letti = 0, token_output = 0,
        costo_mese_usd = 0, analisi_mese = 0, spunti_mese = 0
    where x.id;
  end if;
  update public.call_lavori_stato x
  set token_input = x.token_input + coalesce((c ->> 'input')::bigint, 0),
      token_cache_scritti = x.token_cache_scritti + coalesce((c ->> 'cache_scritti')::bigint, 0),
      token_cache_letti = x.token_cache_letti + coalesce((c ->> 'cache_letti')::bigint, 0),
      token_output = x.token_output + coalesce((c ->> 'output')::bigint, 0)
  where x.id;
  update public.call_lavori_stato x
  set costo_mese_usd = round(
        public.insight_costo_usd(x.token_input, x.token_cache_scritti, x.token_cache_letti, x.token_output), 4),
      ultimo_passo_il = now(),
      ultimo_esito = p_esito,
      ultimo_errore = case when p_esito in ('ok', 'parziale') then null else x.ultimo_errore end,
      lease_fino_al = null, passo_id = null, passo_cosa = null, passo_rif = null
  where x.id
  returning x.costo_mese_usd, x.costo_max_mese into v_dopo, v_max;

  -- the admins are told when the month's spend crosses 80% and 100% of the limit; never fails the step
  begin
    perform public.notifiche_spesa('call', v_mese, v_prima, v_dopo, v_max);
  exception when others then
    raise warning 'avviso di spesa non registrato (%)', sqlstate;
  end;

  -- a rate limit of the provider stops the chain: the tick starts it again in 5 minutes
  if p_esito <> 'limite_fornitore' and public.call_c_e_lavoro() then
    perform public.call_dispatch();
  end if;
  return true;
end;
$$;
