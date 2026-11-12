-- Guided onboarding, release B1a (1.78.0): the functions of the client and «Elimina onboarding»
-- (docs/onboarding/rilascio-b.md, «Schema di B1a», 3 and 4).
--
-- * cliente_corrente(): the client_id of the caller's active account; null for an OAuth token, for a person
--   of the team, for a suspended or closed account. No grants: only the client's functions use it.
-- * onboarding_ultimo_passo_servito(): the last step this release can serve ('regole' in B1a).
-- * onboarding_sblocca(client): the automatic unlock, never past that step, never a step of the team.
-- * onboarding_stima(client): the estimate of the timeline.
-- * The client's functions (security definer, search_path '', granted to authenticated, the first line
--   always cliente_corrente(): null is 42501): percorso_cliente, percorso_avanza, consenso_dai,
--   video_progresso. None returns data of another client, a person of the team beyond name, photo and role,
--   an amount or the state of the payment.
-- * onboarding_elimina(client): the admin removes an onboarding started for test or by mistake, before the
--   client registers. Security invoker: it deletes the invites under the admin's RLS, and a trigger does the
--   rest in the same transaction.

-- ---------------------------------------------------------------------------
-- 1. Who the client is
-- ---------------------------------------------------------------------------
create function public.cliente_corrente()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select a.client_id
  from public.clienti_account a
  where a.user_id = (select auth.uid())
    and a.stato = 'attivo'
    and not public.da_client_oauth()
    and not exists (select 1 from public.profiles p where p.id = a.user_id);
$$;

comment on function public.cliente_corrente() is
  'The client_id of the caller''s active client account; null for an OAuth token (Claude), for a person of the team, for a suspended or closed account, without a session. No grants: only the client''s functions (security definer) call it.';

revoke all on function public.cliente_corrente() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. How far the path goes in this release, and the unlock
-- ---------------------------------------------------------------------------
create function public.onboarding_ultimo_passo_servito()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'regole'::text;
$$;

comment on function public.onboarding_ultimo_passo_servito() is
  'The last step this release serves to the client: ''regole'' in B1a, ''questionario'' in B1b, null (all) in B2. onboarding_sblocca never opens a step after it.';

revoke all on function public.onboarding_ultimo_passo_servito() from public, anon, authenticated;

create function public.onboarding_sblocca(p_client_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ultimo text := public.onboarding_ultimo_passo_servito();
  n integer;
begin
  update public.onboarding_passi s
  set stato = 'disponibile'
  from public.onboarding_passi_def d
  where s.client_id = p_client_id
    and s.stato = 'bloccato'
    and d.versione = s.versione
    and d.chiave = s.passo
    and d.sblocco = 'automatico'
    and (
      v_ultimo is null
      or d.ordine <= (select d2.ordine from public.onboarding_passi_def d2 where d2.versione = d.versione and d2.chiave = v_ultimo)
    )
    and not exists (
      select 1
      from unnest(d.sblocca_dopo) as k(chiave)
      where not exists (
        select 1 from public.onboarding_passi s2
        where s2.client_id = p_client_id and s2.passo = k.chiave and s2.stato = 'fatto'
      )
    );
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.onboarding_sblocca(uuid) is
  'Opens (disponibile) every locked step of the client with sblocco automatico whose steps of sblocca_dopo are all done and that does not come after onboarding_ultimo_passo_servito(). Never a step of the team (obiettivo, programma). Returns how many it opened. No grants.';

revoke all on function public.onboarding_sblocca(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The estimate of the timeline (spec 4.4, durations of the admin; never negative)
-- ---------------------------------------------------------------------------
create function public.onboarding_stima(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  x public.onboarding_impostazioni;
  v_versione integer;
  v_data date;
  v_base text;
  v_cose integer;
  v_video jsonb;
  v_lancio timestamptz;
begin
  select * into x from public.onboarding_impostazioni;
  select p.versione_flusso into v_versione from public.onboarding_percorsi p where p.client_id = p_client_id;

  select s.completato_il into v_lancio
  from public.onboarding_passi s
  where s.client_id = p_client_id and s.passo = 'programma' and s.stato = 'fatto';

  if v_lancio is not null then
    v_base := 'iniziato';
    v_data := (v_lancio at time zone 'Europe/Rome')::date;
  else
    -- B1a and B1b: the call is never booked yet (clienti_call is B2)
    v_base := 'call_non_prenotata';
    v_data := public.oggi() + coalesce(x.giorni_call, 3) + coalesce(x.giorni_test, 7) + coalesce(x.giorni_programma, 2);
  end if;

  -- the client's own steps not done yet, up to the rocket
  select count(*) into v_cose
  from public.onboarding_passi s
  join public.onboarding_passi_def d on d.versione = s.versione and d.chiave = s.passo
  where s.client_id = p_client_id and d.attore = 'cliente' and s.stato <> 'fatto';

  -- the compulsory videos not seen yet, of the steps the client can see
  select coalesce(jsonb_agg(coalesce(b.titolo, 'Video') order by d.ordine, b.ordine), '[]'::jsonb) into v_video
  from public.onboarding_passi s
  join public.onboarding_passi_def d on d.versione = s.versione and d.chiave = s.passo
  join public.contenuti_blocchi b
    on b.versione_flusso = s.versione and b.pagina = 'passo' and b.passo = s.passo
       and b.tipo = 'video' and b.obbligatorio and b.pubblicato
  where s.client_id = p_client_id
    and s.stato <> 'bloccato'
    and not exists (
      select 1 from public.onboarding_video_visti vv
      where vv.client_id = p_client_id and vv.blocco_id = b.id and vv.visto_il is not null
    );

  return jsonb_build_object(
    'data', case when v_base = 'iniziato' or v_data >= public.oggi() then v_data end,
    'giorni', case when v_base = 'iniziato' then 0 else greatest(v_data - public.oggi(), 0) end,
    'quasi', v_base <> 'iniziato' and v_data < public.oggi(),
    'base', v_base,
    'cose_da_fare', v_cose,
    'video_mancanti', v_video
  );
end;
$$;

comment on function public.onboarding_stima(uuid) is
  'The estimate of the start of the client''s path: { data (null with quasi), giorni (never negative), quasi, base (call_non_prenotata, call_prenotata, settimana_test, iniziato), cose_da_fare (the client''s steps not done up to the rocket), video_mancanti (titles of the compulsory videos not seen, of the unlocked steps) }. No grants.';

revoke all on function public.onboarding_stima(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The client's page
-- ---------------------------------------------------------------------------
create function public.percorso_cliente()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := public.cliente_corrente();
  p public.onboarding_percorsi;
  v_nodi jsonb;
  v_passi jsonb;
  v_team jsonb;
  v_consensi jsonb;
  v_in_attesa boolean;
begin
  if v_cliente is null then
    raise exception 'Accesso non valido: entra di nuovo.' using errcode = '42501';
  end if;

  select * into p from public.onboarding_percorsi x where x.client_id = v_cliente;

  -- the nodes: completed (all their steps done), the current one (the first not completed with a step that
  -- is not locked), the future ones
  with nodi as (
    select d.nodo,
           min(d.ordine) as ordine,
           bool_and(s.stato = 'fatto') as completato,
           bool_or(s.stato <> 'bloccato') as aperto,
           max(s.completato_il) as completato_il
    from public.onboarding_passi_def d
    join public.onboarding_passi s on s.client_id = v_cliente and s.versione = d.versione and s.passo = d.chiave
    where d.versione = p.versione_flusso
    group by d.nodo
  ),
  attuale as (
    select n.nodo from nodi n where not n.completato and n.aperto order by n.ordine limit 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'chiave', n.nodo,
           'ordine', n.ordine,
           'stato', case when n.completato then 'completato'
                         when n.nodo = (select a.nodo from attuale a) then 'attuale'
                         else 'futuro' end,
           'completato_il', case when n.completato then n.completato_il end
         ) order by n.ordine), '[]'::jsonb)
    into v_nodi
  from nodi n;

  -- the steps; the content only of the unlocked ones, never the fields of the team (dati, nota)
  select coalesce(jsonb_agg(
           jsonb_build_object(
             'chiave', d.chiave,
             'titolo', d.titolo,
             'nodo', d.nodo,
             'attore', d.attore,
             'stato', s.stato
           )
           || case when s.stato = 'fatto' then jsonb_build_object('completato_il', s.completato_il) else '{}'::jsonb end
           || case when s.stato <> 'bloccato' then jsonb_build_object('blocchi', (
                select coalesce(jsonb_agg(
                         jsonb_build_object(
                           'id', b.id,
                           'tipo', b.tipo,
                           'titolo', b.titolo,
                           'corpo', b.corpo,
                           'youtube_id', b.youtube_id,
                           'url', b.url,
                           'obbligatorio', b.obbligatorio
                         )
                         || case when b.tipo = 'video' then jsonb_build_object('video', jsonb_build_object(
                              'percentuale', coalesce(vv.percentuale, 0),
                              'visto', vv.visto_il is not null)) else '{}'::jsonb end
                         order by b.ordine, b.created_at), '[]'::jsonb)
                from public.contenuti_blocchi b
                left join public.onboarding_video_visti vv on vv.client_id = v_cliente and vv.blocco_id = b.id
                where b.versione_flusso = s.versione and b.pagina = 'passo' and b.passo = s.passo and b.pubblicato
              )) else '{}'::jsonb end
           order by d.ordine), '[]'::jsonb)
    into v_passi
  from public.onboarding_passi s
  join public.onboarding_passi_def d on d.versione = s.versione and d.chiave = s.passo
  where s.client_id = v_cliente;

  -- the team: name, photo and role, never the email
  select coalesce(jsonb_agg(jsonb_build_object(
           'incarico', t.incarico,
           'ruolo', t.ruolo,
           'nome', pr.nome,
           'foto_url', pr.foto_url
         ) order by t.ordine), '[]'::jsonb)
    into v_team
  from public.onboarding_incarichi i
  cross join lateral (values
    (1, 'coach', 'Coach', i.coach_id),
    (2, 'revisore', 'Revisione video', i.revisore_id),
    (3, 'responsabile', 'Personal Success Manager', i.responsabile_id)
  ) as t(ordine, incarico, ruolo, persona)
  join public.profiles pr on pr.id = t.persona
  where i.client_id = v_cliente;

  -- the consents: the version in force and the one given
  select coalesce(jsonb_agg(jsonb_build_object(
           'tipo', ct.tipo,
           'versione_in_vigore', ct.versione,
           'versione', c.versione,
           'dato_il', c.dato_il
         ) order by ct.tipo), '[]'::jsonb)
    into v_consensi
  from public.clienti_consensi_testi ct
  left join public.clienti_consensi c on c.client_id = v_cliente and c.tipo = ct.tipo and c.revocato_il is null
  where ct.in_vigore;

  v_in_attesa := coalesce(p.stato, '') <> 'completato' and not exists (
    select 1
    from public.onboarding_passi s
    join public.onboarding_passi_def d on d.versione = s.versione and d.chiave = s.passo
    where s.client_id = v_cliente and d.attore = 'cliente' and s.stato in ('disponibile', 'in_corso')
  );

  return jsonb_build_object(
    'cliente', jsonb_build_object('nome', public.onboarding_nome_cliente(v_cliente)),
    'percorso', jsonb_build_object('stato', p.stato, 'giorno_zero', p.giorno_zero, 'completato_il', p.completato_il),
    'nodi', v_nodi,
    'passi', v_passi,
    'team', v_team,
    'consensi', v_consensi,
    'stima', public.onboarding_stima(v_cliente),
    'in_attesa', v_in_attesa
  );
end;
$$;

comment on function public.percorso_cliente() is
  'The page of the client: { cliente { nome }, percorso { stato, giorno_zero, completato_il }, nodi [{ chiave, ordine, stato (completato, attuale, futuro), completato_il }], passi [{ chiave, titolo, nodo, attore, stato, completato_il (done), blocchi (unlocked only: id, tipo, titolo, corpo, youtube_id, url, obbligatorio, video { percentuale, visto }) }], team [{ incarico, ruolo, nome, foto_url }], consensi [{ tipo, versione_in_vigore, versione, dato_il }], stima, in_attesa }. Only the caller''s own client (cliente_corrente(), else 42501).';

revoke all on function public.percorso_cliente() from public, anon;
grant execute on function public.percorso_cliente() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The client's consent (internal) and consenso_dai
-- ---------------------------------------------------------------------------
create function public.onboarding_scrivi_consenso(p_client_id uuid, p_tipo text, p_versione text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_in_vigore text;
  v_dato timestamptz;
begin
  select t.versione into v_in_vigore from public.clienti_consensi_testi t where t.tipo = p_tipo and t.in_vigore;
  if v_in_vigore is null or p_versione is distinct from v_in_vigore then
    raise exception 'Il testo del consenso è cambiato: rileggilo e accettalo di nuovo.' using errcode = '22023';
  end if;

  select c.dato_il into v_dato
  from public.clienti_consensi c
  where c.client_id = p_client_id and c.tipo = p_tipo and c.versione = v_in_vigore and c.revocato_il is null;
  if v_dato is not null then
    return v_dato;
  end if;

  -- a consent to an older version is replaced (not revoked by anybody: revocato_da stays null)
  update public.clienti_consensi c
  set revocato_il = now()
  where c.client_id = p_client_id and c.tipo = p_tipo and c.revocato_il is null;

  insert into public.clienti_consensi (client_id, tipo, versione)
  values (p_client_id, p_tipo, v_in_vigore)
  returning dato_il into v_dato;

  insert into public.onboarding_eventi (client_id, tipo, attore, dettagli)
  values (p_client_id, 'consenso_dato', 'cliente', jsonb_build_object('tipo', p_tipo, 'versione', v_in_vigore));

  return v_dato;
end;
$$;

revoke all on function public.onboarding_scrivi_consenso(uuid, text, text) from public, anon, authenticated;

create function public.consenso_dai(p_tipo text, p_versione text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := public.cliente_corrente();
  v_dato timestamptz;
begin
  if v_cliente is null then
    raise exception 'Accesso non valido: entra di nuovo.' using errcode = '42501';
  end if;
  if p_tipo is distinct from 'salute' then
    raise exception 'Consenso non valido' using errcode = '22023';
  end if;

  v_dato := public.onboarding_scrivi_consenso(v_cliente, p_tipo, p_versione);

  return jsonb_build_object('tipo', p_tipo, 'versione', p_versione, 'dato_il', v_dato);
end;
$$;

comment on function public.consenso_dai(text, text) is
  'The client gives (again) a consent, to the version of the text in force (22023 otherwise): { tipo, versione, dato_il }. A consent to an older version is replaced. Only the caller''s own client (cliente_corrente(), else 42501).';

revoke all on function public.consenso_dai(text, text) from public, anon;
grant execute on function public.consenso_dai(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. The only road to move a step forward with the client's actions: a closed list of (step, action), each
--    with the states it starts from
-- ---------------------------------------------------------------------------
create function public.percorso_avanza(p_passo text, p_azione text, p_dati jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := public.cliente_corrente();
  v_stato text;
  v_versione integer;
  v_partenze text[];
  v_regole jsonb;
begin
  if v_cliente is null then
    raise exception 'Accesso non valido: entra di nuovo.' using errcode = '42501';
  end if;

  -- the closed list of B1a
  v_partenze := case
    when p_passo = 'benvenuto' and p_azione = 'completa' then array['disponibile', 'in_corso']
    when p_passo = 'regole' and p_azione = 'accetta' then array['disponibile', 'in_corso']
  end;

  select s.stato, s.versione into v_stato, v_versione
  from public.onboarding_passi s
  where s.client_id = v_cliente and s.passo = p_passo
  for update;

  if v_stato = 'fatto' then
    raise exception 'Questo passo è già completato.' using errcode = '22023';
  end if;
  if v_partenze is null or v_stato is null or not (v_stato = any (v_partenze)) then
    raise exception 'Questo passo non è ancora disponibile.' using errcode = '22023';
  end if;

  if p_passo = 'benvenuto' then
    if exists (
      select 1
      from public.contenuti_blocchi b
      where b.versione_flusso = v_versione and b.pagina = 'passo' and b.passo = p_passo
        and b.tipo = 'video' and b.obbligatorio and b.pubblicato
        and not exists (
          select 1 from public.onboarding_video_visti vv
          where vv.client_id = v_cliente and vv.blocco_id = b.id and vv.visto_il is not null
        )
    ) then
      raise exception 'Guarda il video fino in fondo prima di andare avanti.' using errcode = '22023';
    end if;

  elsif p_passo = 'regole' then
    if p_dati is null or jsonb_typeof(p_dati) <> 'object' then
      raise exception 'Spunta tutte le regole per andare avanti.' using errcode = '22023';
    end if;
    v_regole := p_dati -> 'regole';
    if v_regole is null or jsonb_typeof(v_regole) <> 'array' or exists (
      select 1
      from public.contenuti_blocchi b
      where b.versione_flusso = v_versione and b.pagina = 'passo' and b.passo = p_passo
        and b.tipo = 'regola' and b.pubblicato
        and not (v_regole ? b.id::text)
    ) then
      raise exception 'Spunta tutte le regole per andare avanti.' using errcode = '22023';
    end if;
    if jsonb_typeof(p_dati -> 'consenso_salute') is distinct from 'string' then
      raise exception 'Il testo del consenso è cambiato: rileggilo e accettalo di nuovo.' using errcode = '22023';
    end if;
    perform public.onboarding_scrivi_consenso(v_cliente, 'salute', p_dati ->> 'consenso_salute');
  end if;

  update public.onboarding_passi s
  set stato = 'fatto',
      iniziato_il = coalesce(s.iniziato_il, now()),
      completato_il = now()
  where s.client_id = v_cliente and s.passo = p_passo;

  insert into public.onboarding_eventi (client_id, tipo, attore, dettagli)
  values (v_cliente, 'passo_completato', 'cliente', jsonb_build_object('passo', p_passo));

  perform public.onboarding_sblocca(v_cliente);

  return public.percorso_cliente();
end;
$$;

comment on function public.percorso_avanza(text, text, jsonb) is
  'The client completes a step with its action: only the pairs (step, action) of a closed list, each from its states (B1a: benvenuto/completa, every compulsory video seen at 90%; regole/accetta, { regole: [ids of every published rule], consenso_salute: the version in force }). A pair not in the list or a step in another state: 22023 «Questo passo non è ancora disponibile.»; a done step: 22023 «Questo passo è già completato.». Then the step is done, the log, the unlock, and percorso_cliente() is returned. Only the caller''s own client (else 42501).';

revoke all on function public.percorso_avanza(text, text, jsonb) from public, anon;
grant execute on function public.percorso_avanza(text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The seconds of a video seen
-- ---------------------------------------------------------------------------
create function public.video_progresso(p_blocco uuid, p_consegna uuid, p_durata integer, p_intervalli int4range[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := public.cliente_corrente();
  v_passo text;
  v_versione integer;
  v_stato text;
  r public.onboarding_video_visti;
  v_durata integer;
  v_bit varbit;
  v_int int4range;
  v_da integer;
  v_a integer;
  v_percentuale numeric;
begin
  if v_cliente is null then
    raise exception 'Accesso non valido: entra di nuovo.' using errcode = '42501';
  end if;
  if num_nonnulls(p_blocco, p_consegna) <> 1 then
    raise exception 'Video non valido' using errcode = '22023';
  end if;
  -- the deliveries of the coach are B2
  if p_consegna is not null then
    raise exception 'Video non valido' using errcode = '22023';
  end if;

  -- a video block of a step of the client that is open now
  select b.passo, b.versione_flusso into v_passo, v_versione
  from public.contenuti_blocchi b
  where b.id = p_blocco and b.tipo = 'video' and b.pagina = 'passo' and b.pubblicato;
  if v_passo is null then
    raise exception 'Video non valido' using errcode = '22023';
  end if;
  select s.stato into v_stato
  from public.onboarding_passi s
  where s.client_id = v_cliente and s.passo = v_passo and s.versione = v_versione
  for update;
  if v_stato is null or v_stato not in ('disponibile', 'in_corso') then
    raise exception 'Questo passo non è ancora disponibile.' using errcode = '22023';
  end if;

  if p_intervalli is null or cardinality(p_intervalli) > 50 then
    raise exception 'Intervalli non validi' using errcode = '22023';
  end if;

  select * into r from public.onboarding_video_visti vv where vv.client_id = v_cliente and vv.blocco_id = p_blocco for update;
  if found then
    v_durata := r.durata;
    v_bit := r.visti;
  else
    if p_durata is null or p_durata not between 1 and 10800 then
      raise exception 'Durata non valida' using errcode = '22023';
    end if;
    v_durata := p_durata;
    v_bit := repeat('0', v_durata)::varbit;
  end if;

  -- each interval of seconds [da, a) inside the length (the last seconds rounded by the player: 2 of margin)
  foreach v_int in array p_intervalli loop
    if v_int is null or isempty(v_int) or lower_inf(v_int) or upper_inf(v_int) then
      raise exception 'Intervalli non validi' using errcode = '22023';
    end if;
    v_da := lower(v_int);
    v_a := upper(v_int);
    if v_da < 0 or v_da >= v_durata or v_a > v_durata + 2 then
      raise exception 'Intervalli non validi' using errcode = '22023';
    end if;
    v_a := least(v_a, v_durata);
    v_bit := v_bit | (repeat('0', v_da) || repeat('1', v_a - v_da) || repeat('0', v_durata - v_a))::varbit;
  end loop;

  v_percentuale := round(bit_count(v_bit)::numeric * 100 / v_durata, 2);

  insert into public.onboarding_video_visti (client_id, blocco_id, durata, visti, visto_il)
  values (v_cliente, p_blocco, v_durata, v_bit, case when v_percentuale >= 90 then now() end)
  on conflict (client_id, blocco_id) where blocco_id is not null do update
  set visti = excluded.visti,
      visto_il = coalesce(onboarding_video_visti.visto_il, excluded.visto_il);

  -- watching a video starts its step
  if v_stato = 'disponibile' then
    update public.onboarding_passi s
    set stato = 'in_corso', iniziato_il = coalesce(s.iniziato_il, now())
    where s.client_id = v_cliente and s.passo = v_passo;
  end if;

  return jsonb_build_object('percentuale', v_percentuale, 'visto', v_percentuale >= 90);
end;
$$;

comment on function public.video_progresso(uuid, uuid, integer, int4range[]) is
  'The seconds of a video seen: exactly one of p_blocco and p_consegna (the delivery is B2: 22023 in B1a). A published video block of a step of the client available or in progress; at most 50 intervals [from, to) inside the length (the first declared by the player); the seconds are joined to the ones already seen. Returns { percentuale, visto } (visto from 90%). Only the caller''s own client (else 42501).';

revoke all on function public.video_progresso(uuid, uuid, integer, int4range[]) from public, anon;
grant execute on function public.video_progresso(uuid, uuid, integer, int4range[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. «Elimina onboarding» (Dany, 12/11/2026: «rimuovi questo, era un test che ho fatto»)
-- ---------------------------------------------------------------------------
-- The admin deletes an invite only through onboarding_elimina (the cascade of a client deleted aside)
create policy onboarding_inviti_admin_eliminazione on public.onboarding_inviti
  for delete to authenticated using ((select public.is_admin()));
grant delete on public.onboarding_inviti to authenticated;

create function public.onboarding_inviti_eliminazione()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- a session deletes an invite only from onboarding_elimina; a client deleted takes its invites with it
  -- one level deeper (the cascade), and the service role has no session
  if (select auth.uid()) is not null
     and pg_trigger_depth() = 1
     and coalesce(current_setting('alpha.onboarding_elimina', true), '') <> old.client_id::text then
    raise exception 'Un onboarding si elimina solo con «Elimina onboarding».' using errcode = '42501';
  end if;
  return old;
end;
$$;
revoke all on function public.onboarding_inviti_eliminazione() from public, anon, authenticated;

create trigger onboarding_inviti_eliminazione before delete on public.onboarding_inviti
  for each row execute function public.onboarding_inviti_eliminazione();

-- What goes with it, in the same transaction, only for «Elimina onboarding»
create function public.onboarding_inviti_eliminato()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := old.client_id;
begin
  if coalesce(current_setting('alpha.onboarding_elimina', true), '') <> v_cliente::text then
    return null;
  end if;

  delete from public.onboarding_passi s where s.client_id = v_cliente;
  delete from public.onboarding_percorsi p where p.client_id = v_cliente;
  delete from public.onboarding_incarichi i where i.client_id = v_cliente;
  delete from public.onboarding_eventi e where e.client_id = v_cliente;

  -- the onboarding tasks of the client's project (their people go with them, the time stays without a task)
  -- and the list «Onboarding» when it is left empty
  delete from public.pm_task t
  using public.pm_progetti pg
  where pg.id = t.progetto_id and pg.client_id = v_cliente and t.chiave_onboarding is not null;

  delete from public.pm_tasklist l
  using public.pm_progetti pg
  where pg.id = l.progetto_id and pg.client_id = v_cliente
    and l.nome = 'Onboarding'
    and not exists (select 1 from public.pm_task t where t.tasklist_id = l.id);

  -- the notifications of its payment
  delete from public.notifiche n
  where n.tipo = 'onboarding_pagamento'
    and (n.chiave like 'onboarding/' || v_cliente::text || '/%' or n.link = '/onboarding/' || v_cliente::text);

  return null;
end;
$$;
revoke all on function public.onboarding_inviti_eliminato() from public, anon, authenticated;

create trigger onboarding_inviti_eliminato after delete on public.onboarding_inviti
  for each row execute function public.onboarding_inviti_eliminato();

create function public.onboarding_elimina(p_client_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  n integer;
begin
  if public.da_client_oauth() or not public.is_admin() then
    raise exception 'Un onboarding lo elimina l''admin' using errcode = '42501';
  end if;
  if p_client_id is null then
    raise exception 'Questo cliente non ha un onboarding.' using errcode = '22023';
  end if;

  -- one at a time per client
  perform 1 from public.clients c where c.id = p_client_id for update;

  if exists (select 1 from public.clienti_account a where a.client_id = p_client_id) then
    raise exception 'Il cliente si è già registrato: per fermare l''onboarding usa «Revoca».' using errcode = '22023';
  end if;
  if not exists (select 1 from public.onboarding_inviti i where i.client_id = p_client_id) then
    raise exception 'Questo cliente non ha un onboarding.' using errcode = '22023';
  end if;

  perform set_config('alpha.onboarding_admin', 'on', true);
  perform set_config('alpha.onboarding_elimina', p_client_id::text, true);
  delete from public.onboarding_inviti i where i.client_id = p_client_id;
  get diagnostics n = row_count;
  perform set_config('alpha.onboarding_elimina', '', true);
  perform set_config('alpha.onboarding_admin', '', true);

  if n = 0 then
    raise exception 'Questo cliente non ha un onboarding.' using errcode = '22023';
  end if;

  return jsonb_build_object('client_id', p_client_id);
end;
$$;

comment on function public.onboarding_elimina(uuid) is
  'The admin removes an onboarding started for test or by mistake, only before the client registers (22023 with an account: use «Revoca»): invites (their tokens and registrations), path and steps, incarichi, log, the onboarding tasks of the client''s project and the list «Onboarding» left empty, the notifications of the payment. Client, sale, instalments, project with «Percorso cliente» and Telegram stay. Returns { client_id }. Admin only, never an OAuth token. Security invoker.';

revoke all on function public.onboarding_elimina(uuid) from public, anon;
grant execute on function public.onboarding_elimina(uuid) to authenticated;
