-- Guided onboarding, release B2 (1.81.0, «Il percorso fino al lancio»): the rest of the path and the work of
-- the team (docs/onboarding/rilascio-b.md, «Schema di B2», migration 6).
--
-- * onboarding_ultimo_passo_servito() is null: the path is served to the end.
-- * The client's functions of B1a, recreated from their last version with the pairs and the fields of B2:
--   percorso_avanza (prenotazione, community, obiettivo, test, programma), percorso_cliente (the call, the
--   deliveries, the links of the community and of the booking page, the private group, who of the team the
--   client is waiting for, the page after the launch), video_progresso (the deliveries), onboarding_stima
--   (the booked call and the test week), onboarding_registra_cliente (the due dates of two tasks, the people in
--   charge told). onboarding_sblocca stays as it is.
-- * The reads of the people in charge (security definer, granted to authenticated, 42501 for an OAuth token):
--   onboarding_incaricati_elenco, onboarding_scheda_incaricato, onboarding_allegato_apri. No new policy: coach,
--   reviewer and responsible never read clients, v_onboarding, invites, the questionnaire, the files, the
--   calls or the deliveries of a client from a table. Never the payment, the invite or the log.
-- * The functions of the team (security definer, granted to authenticated): the admin and the coach in charge
--   (the responsible too for the community); 42501 «Questa azione è del coach del cliente e dell'admin.» for
--   anybody else and for an OAuth token.
-- * pm_task_onboarding_passo: the step follows its task (obiettivo_smart opens obiettivo after the call);
--   never stops a task.
-- * The completion of the onboarding, and the opening of the client area with its checks
--   (onboarding_apri_ai_clienti, onboarding_chiudi_ai_clienti, security invoker, admin only).
-- * The notifications to the people in charge with notifiche_avviso, each only his own, always towards a page
--   he reads (/onboarding/<client>).
-- * The blocks of the CMS of the new steps and of the page after the launch, «[Da scrivere: …]» where Dany
--   writes the text (onboarding_apri_ai_clienti refuses to open while they are there).
-- * The due dates for the accounts already registered, and every registered path unlocked again.
--
-- No trigger here ever stops a task, an instalment or a deletion.

-- ---------------------------------------------------------------------------
-- 1. The path is served to the end
-- ---------------------------------------------------------------------------
create or replace function public.onboarding_ultimo_passo_servito()
returns text
language sql
immutable
set search_path = ''
as $$
  select null::text;
$$;

comment on function public.onboarding_ultimo_passo_servito() is
  'The last step this release serves to the client: ''regole'' in B1a, ''questionario'' in B1b, null (all) in B2. onboarding_sblocca never opens a step after it.';

revoke all on function public.onboarding_ultimo_passo_servito() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Helpers (no grants)
-- ---------------------------------------------------------------------------
create function public.onboarding_nome_completo(p_client_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(concat_ws(' ', nullif(btrim(c.nome), ''), nullif(btrim(c.cognome), '')), '')
  from public.clients c where c.id = p_client_id;
$$;
revoke all on function public.onboarding_nome_completo(uuid) from public, anon, authenticated;

-- The due date of an onboarding task of the client's project, never on a completed task
create function public.onboarding_task_scadenza(p_client_id uuid, p_chiave text, p_giorno date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pm_task t
  set scadenza = p_giorno
  from public.pm_progetti pg
  where pg.id = t.progetto_id
    and pg.client_id = p_client_id
    and t.chiave_onboarding = p_chiave
    and t.stato <> 'completato'
    and t.scadenza is distinct from p_giorno;
end;
$$;
revoke all on function public.onboarding_task_scadenza(uuid, text, date) from public, anon, authenticated;

-- An onboarding task of the client's project completed (the step is the truth, the task its mirror)
create function public.onboarding_task_completa(p_client_id uuid, p_chiave text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pm_task t
  set stato = 'completato'
  from public.pm_progetti pg
  where pg.id = t.progetto_id
    and pg.client_id = p_client_id
    and t.chiave_onboarding = p_chiave
    and t.stato <> 'completato';
end;
$$;
revoke all on function public.onboarding_task_completa(uuid, text) from public, anon, authenticated;

-- The people to tell: the active people of the given incarichi of the client, and the active admins
create function public.onboarding_destinatari(p_client_id uuid, p_incarichi text[], p_admin boolean)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select array_agg(distinct p.id)
  from public.profiles p
  where p.attivo
    and p.ruolo <> 'business_coach'
    and (
      (p_admin and p.ruolo = 'admin')
      or exists (
        select 1
        from public.onboarding_incarichi i
        where i.client_id = p_client_id
          and (('coach' = any (p_incarichi) and i.coach_id = p.id)
               or ('revisore' = any (p_incarichi) and i.revisore_id = p.id)
               or ('responsabile' = any (p_incarichi) and i.responsabile_id = p.id))
      )
    );
$$;
revoke all on function public.onboarding_destinatari(uuid, text[], boolean) from public, anon, authenticated;

-- An in-app notification towards /onboarding/<client>; never at the cost of what called it
create function public.onboarding_avvisa(
  p_client_id uuid,
  p_incarichi text[],
  p_admin boolean,
  p_titolo text,
  p_anteprima text,
  p_chiave text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    perform public.notifiche_avviso(
      public.onboarding_destinatari(p_client_id, p_incarichi, p_admin),
      'onboarding_cliente',
      left(p_titolo, 300),
      left(p_anteprima, 300),
      null,
      '/onboarding/' || p_client_id::text,
      'onboarding/' || p_client_id::text || '/' || p_chiave
    );
  exception when others then
    raise warning 'Onboarding: notifica % del cliente % non scritta: %', p_chiave, p_client_id, sqlerrm;
  end;
end;
$$;
revoke all on function public.onboarding_avvisa(uuid, text[], boolean, text, text, text) from public, anon, authenticated;

-- The compulsory videos not seen: of one step (its published video blocks, and for «programma» the
-- compulsory deliveries too), or of the whole path with p_passo null. A step already done never waits for its
-- videos again: its action checked them, or the team closed it with «Sblocca step» because the video did not
-- count, and a compulsory video added later to a step the client has passed does not stop him at the launch.
create function public.onboarding_video_mancanti(p_client_id uuid, p_passo text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.onboarding_passi s
    join public.contenuti_blocchi b
      on b.versione_flusso = s.versione and b.pagina = 'passo' and b.passo = s.passo
         and b.tipo = 'video' and b.obbligatorio and b.pubblicato
    where s.client_id = p_client_id
      and (p_passo is null or s.passo = p_passo)
      and s.stato <> 'fatto'
      and not exists (
        select 1 from public.onboarding_video_visti vv
        where vv.client_id = p_client_id and vv.blocco_id = b.id and vv.visto_il is not null
      )
  ) or (
    (p_passo is null or p_passo = 'programma')
    and exists (
      select 1
      from public.clienti_consegne c
      where c.client_id = p_client_id and c.obbligatoria
        and not exists (
          select 1 from public.onboarding_video_visti vv
          where vv.client_id = p_client_id and vv.consegna_id = c.id and vv.visto_il is not null
        )
    )
  );
$$;
revoke all on function public.onboarding_video_mancanti(uuid, text) from public, anon, authenticated;

-- The onboarding is closed when every step is done and every compulsory video (blocks and deliveries) seen
-- (spec 4.1): the path completed, the log, the admins and the coach told. Returns whether it closed now.
create function public.onboarding_completa_se_pronto(p_client_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_completato timestamptz;
begin
  if not exists (
       select 1 from public.onboarding_percorsi p where p.client_id = p_client_id and p.stato = 'in_corso'
     )
     or exists (select 1 from public.onboarding_passi s where s.client_id = p_client_id and s.stato <> 'fatto')
     or not exists (select 1 from public.onboarding_passi s where s.client_id = p_client_id)
     or public.onboarding_video_mancanti(p_client_id, null) then
    return false;
  end if;

  update public.onboarding_percorsi p
  set stato = 'completato', completato_il = now()
  where p.client_id = p_client_id and p.stato = 'in_corso'
  returning p.completato_il into v_completato;
  if v_completato is null then
    return false;
  end if;

  insert into public.onboarding_eventi (client_id, tipo, attore, dettagli)
  values (p_client_id, 'onboarding_completato', 'sistema', '{}'::jsonb);

  perform public.onboarding_avvisa(
    p_client_id, array['coach'], true,
    'Onboarding completato: ' || coalesce(public.onboarding_nome_completo(p_client_id), 'un cliente'),
    'Ha visto il suo programma: il percorso è partito.',
    'completato/' || floor(extract(epoch from v_completato))::bigint::text
  );
  return true;
end;
$$;
revoke all on function public.onboarding_completa_se_pronto(uuid) from public, anon, authenticated;

-- Who may act on the client as the team: the admin (on a registered client) and the coach in charge (with
-- p_responsabile, the responsible in charge too); never an OAuth token. A paused onboarding (link revoked,
-- account suspended) refuses every action. Returns the role it allowed: admin, coach or responsabile.
create function public.onboarding_guardia_team(p_client_id uuid, p_responsabile boolean)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_io uuid := (select auth.uid());
  i public.onboarding_incarichi;
  v_ruolo text;
  v_messaggio text := case when p_responsabile
    then 'Questa azione è del coach, del responsabile del cliente e dell''admin.'
    else 'Questa azione è del coach del cliente e dell''admin.' end;
begin
  if public.da_client_oauth() or v_io is null or p_client_id is null then
    raise exception '%', v_messaggio using errcode = '42501';
  end if;

  if public.is_admin() then
    v_ruolo := 'admin';
    if not exists (
      select 1 from public.onboarding_percorsi p where p.client_id = p_client_id and p.giorno_zero is not null
    ) then
      raise exception 'Il cliente non si è ancora registrato.' using errcode = '22023';
    end if;
  else
    select * into i from public.onboarding_incarichi x where x.client_id = p_client_id;
    if not public.onboarding_incaricato(p_client_id) then
      raise exception '%', v_messaggio using errcode = '42501';
    end if;
    if i.coach_id = v_io then
      v_ruolo := 'coach';
    elsif p_responsabile and i.responsabile_id = v_io then
      v_ruolo := 'responsabile';
    else
      raise exception '%', v_messaggio using errcode = '42501';
    end if;
  end if;

  if exists (select 1 from public.onboarding_percorsi p where p.client_id = p_client_id and p.stato = 'sospeso')
     or not exists (select 1 from public.clienti_account a where a.client_id = p_client_id and a.stato = 'attivo') then
    raise exception 'L''onboarding di questo cliente è in pausa.' using errcode = '22023';
  end if;

  return v_ruolo;
end;
$$;
revoke all on function public.onboarding_guardia_team(uuid, boolean) from public, anon, authenticated;

-- What the client is told when his turn comes back: the server action sends the email «Tocca a te», or offers
-- the message for Telegram when the email is off or does not leave
create function public.onboarding_avviso_cliente(p_motivo text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'avviso', p_motivo,
    'avvisa_cliente_email', coalesce((select x.avvisa_cliente_email from public.onboarding_impostazioni x), true)
  );
$$;
revoke all on function public.onboarding_avviso_cliente(text) from public, anon, authenticated;

-- The queues of the team for a client (every one, before the filter of the incarico)
create function public.onboarding_code(p_client_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with passi as (
    select
      max(s.stato) filter (where s.passo = 'community') as community,
      max(s.stato) filter (where s.passo = 'call') as call,
      max(s.stato) filter (where s.passo = 'obiettivo') as obiettivo,
      max(s.stato) filter (where s.passo = 'test') as test,
      max(s.stato) filter (where s.passo = 'programma') as programma,
      (array_agg(s.dati) filter (where s.passo = 'community'))[1] as dati_community
    from public.onboarding_passi s
    where s.client_id = p_client_id
  ),
  chiamata as (
    select c.stato, c.inizio
    from public.clienti_call c
    where c.client_id = p_client_id and c.tipo = 'onboarding' and c.stato <> 'annullata'
    order by c.created_at desc
    limit 1
  )
  select jsonb_build_object(
    'call_da_confermare', coalesce((select ch.stato = 'da_confermare' from chiamata ch), false),
    'call_da_segnare', coalesce((select ch.stato = 'prenotata' and ch.inizio < now() from chiamata ch), false),
    'richiesta_community', coalesce(
      p.dati_community ? 'richiesta_inviata_il' and not p.dati_community ? 'community_approvata_il', false),
    'presentazione_da_controllare', coalesce(
      p.dati_community ? 'presentato_il' and not p.dati_community ? 'presentazione_controllata_il', false),
    'test_da_confermare', coalesce(p.test = 'in_attesa_team', false),
    'test_da_rivedere', coalesce(p.test = 'fatto' and exists (
      select 1 from public.pm_task t join public.pm_progetti pg on pg.id = t.progetto_id
      where pg.client_id = p_client_id and t.chiave_onboarding = 'revisione_test' and t.stato <> 'completato'
    ), false),
    'programma_da_consegnare', coalesce(p.programma = 'in_attesa_team', false),
    'obiettivo_da_impostare', coalesce(p.call = 'fatto' and p.obiettivo = 'bloccato', false),
    -- spec 4.1: the call within 48 hours (or past and not marked) and the community not done
    'preparazione_incompleta', coalesce(
      (select ch.stato = 'prenotata' and ch.inizio <= now() + interval '48 hours' from chiamata ch)
      and p.community is distinct from 'fatto', false)
  )
  from passi p;
$$;
revoke all on function public.onboarding_code(uuid) from public, anon, authenticated;

-- The queues a person sees: each only those of his incarico (the reviewer only «Test da rivedere»); all for
-- the admin
create function public.onboarding_code_per(p_code jsonb, p_incarichi text[], p_admin boolean)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_object_agg(k.chiave, coalesce((p_code ->> k.chiave)::boolean, false) and (p_admin or p_incarichi && k.incarichi))
  from (values
    ('call_da_confermare', array['coach']),
    ('call_da_segnare', array['coach']),
    ('richiesta_community', array['coach', 'responsabile']),
    ('presentazione_da_controllare', array['coach', 'responsabile']),
    ('test_da_confermare', array['coach']),
    ('test_da_rivedere', array['revisore']),
    ('programma_da_consegnare', array['coach']),
    ('obiettivo_da_impostare', array['coach']),
    ('preparazione_incompleta', array['coach'])
  ) as k(chiave, incarichi);
$$;
revoke all on function public.onboarding_code_per(jsonb, text[], boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The estimate of the timeline: the body of 20261109090200, with the booked call, the test week and the
--    programme delivered (spec 4.4, durations of the admin; never negative)
-- ---------------------------------------------------------------------------
create or replace function public.onboarding_stima(p_client_id uuid)
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
  v_test public.onboarding_passi;
  v_programma public.onboarding_passi;
  v_obiettivo public.onboarding_passi;
  v_call timestamptz;
begin
  select * into x from public.onboarding_impostazioni;
  select p.versione_flusso into v_versione from public.onboarding_percorsi p where p.client_id = p_client_id;

  select * into v_test from public.onboarding_passi s where s.client_id = p_client_id and s.passo = 'test';
  select * into v_programma from public.onboarding_passi s where s.client_id = p_client_id and s.passo = 'programma';
  select * into v_obiettivo from public.onboarding_passi s where s.client_id = p_client_id and s.passo = 'obiettivo';

  -- the programme delivered (B2) or the step done: the real date, the rocket leaves
  if v_programma.stato in ('disponibile', 'in_corso', 'fatto') then
    v_lancio := coalesce((v_programma.dati ->> 'consegnato_il')::timestamptz, v_programma.completato_il);
  end if;

  select c.inizio into v_call
  from public.clienti_call c
  where c.client_id = p_client_id and c.tipo = 'onboarding' and c.stato <> 'annullata'
  order by c.created_at desc
  limit 1;

  if v_lancio is not null then
    v_base := 'iniziato';
    v_data := (v_lancio at time zone 'Europe/Rome')::date;
  elsif v_test.stato = 'in_attesa_team' or v_test.stato = 'fatto' then
    -- the tests are in: the programme in about giorni_programma
    v_base := 'settimana_test';
    v_data := (coalesce(v_test.inviato_il, v_test.completato_il, now()) at time zone 'Europe/Rome')::date
              + coalesce(x.giorni_programma, 2);
  elsif v_test.stato in ('disponibile', 'in_corso') then
    v_base := 'settimana_test';
    v_data := (coalesce(v_test.iniziato_il, v_obiettivo.completato_il, now()) at time zone 'Europe/Rome')::date
              + coalesce(x.giorni_test, 7) + coalesce(x.giorni_programma, 2);
  elsif v_call is not null then
    v_base := 'call_prenotata';
    v_data := (v_call at time zone 'Europe/Rome')::date + coalesce(x.giorni_test, 7) + coalesce(x.giorni_programma, 2);
  else
    v_base := 'call_non_prenotata';
    v_data := public.oggi() + coalesce(x.giorni_call, 3) + coalesce(x.giorni_test, 7) + coalesce(x.giorni_programma, 2);
  end if;

  -- the client's own steps not done yet, up to the rocket; during the test week the step counts as its
  -- published items not ticked yet (rilascio-b.md: «più le voci obbligatorie della settimana test»)
  select count(*) into v_cose
  from public.onboarding_passi s
  join public.onboarding_passi_def d on d.versione = s.versione and d.chiave = s.passo
  where s.client_id = p_client_id and d.attore = 'cliente' and s.stato <> 'fatto'
    and not (s.passo = 'test' and s.stato in ('disponibile', 'in_corso'));
  if v_test.stato in ('disponibile', 'in_corso') then
    v_cose := v_cose + (
      select count(*)
      from public.contenuti_blocchi b
      where b.versione_flusso = v_test.versione and b.pagina = 'passo' and b.passo = 'test'
        and b.tipo = 'voce' and b.pubblicato
        and not coalesce(v_test.dati -> 'voci', '[]'::jsonb) ? b.id::text
    );
  end if;

  -- the compulsory videos not seen yet, of the steps the client can see, and the compulsory deliveries
  select coalesce(jsonb_agg(v.titolo order by v.ordine, v.sotto), '[]'::jsonb) into v_video
  from (
    select coalesce(b.titolo, 'Video') as titolo, d.ordine, b.ordine as sotto
    from public.onboarding_passi s
    join public.onboarding_passi_def d on d.versione = s.versione and d.chiave = s.passo
    join public.contenuti_blocchi b
      on b.versione_flusso = s.versione and b.pagina = 'passo' and b.passo = s.passo
         and b.tipo = 'video' and b.obbligatorio and b.pubblicato
    where s.client_id = p_client_id
      and s.stato not in ('bloccato', 'fatto')
      and not exists (
        select 1 from public.onboarding_video_visti vv
        where vv.client_id = p_client_id and vv.blocco_id = b.id and vv.visto_il is not null
      )
    union all
    select c.titolo, 1000, extract(epoch from c.created_at)::integer
    from public.clienti_consegne c
    where c.client_id = p_client_id and c.obbligatoria
      and v_programma.stato in ('disponibile', 'in_corso', 'fatto')
      and not exists (
        select 1 from public.onboarding_video_visti vv
        where vv.client_id = p_client_id and vv.consegna_id = c.id and vv.visto_il is not null
      )
  ) v;

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
  'The estimate of the start of the client''s path: { data (null with quasi), giorni (never negative), quasi, base (call_non_prenotata, call_prenotata, settimana_test, iniziato), cose_da_fare (the client''s steps not done up to the rocket, the test week as its items not ticked), video_mancanti (titles of the compulsory videos not seen, of the steps open and not done, and of the compulsory deliveries once the programme is delivered) }. No grants.';

revoke all on function public.onboarding_stima(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The client's page: the body of 20261109090200, with the fields of B2
-- ---------------------------------------------------------------------------
create or replace function public.percorso_cliente()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := public.cliente_corrente();
  p public.onboarding_percorsi;
  v_imp public.onboarding_impostazioni;
  v_nodi jsonb;
  v_passi jsonb;
  v_team jsonb;
  v_consensi jsonb;
  v_in_attesa boolean;
  v_stati jsonb;
  v_call jsonb;
  v_checkpoint jsonb;
  v_consegne jsonb;
  v_community jsonb;
  v_gruppo text;
  v_attesa jsonb;
  v_dopo jsonb;
  v_coach_nome text;
  v_coach_foto text;
  v_lanciato boolean;
begin
  if v_cliente is null then
    raise exception 'Accesso non valido: entra di nuovo.' using errcode = '42501';
  end if;

  select * into p from public.onboarding_percorsi x where x.client_id = v_cliente;
  select * into v_imp from public.onboarding_impostazioni;

  -- the state of each step, by key
  select coalesce(jsonb_object_agg(s.passo, s.stato), '{}'::jsonb) into v_stati
  from public.onboarding_passi s where s.client_id = v_cliente;

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

  -- the steps; the content only of the unlocked ones, never the fields of the team (dati, nota); an item of
  -- the test week says whether it is ticked
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
                         || case when b.tipo = 'voce' then jsonb_build_object('spuntata',
                              coalesce(s.dati -> 'voci', '[]'::jsonb) ? b.id::text) else '{}'::jsonb end
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

  -- the onboarding call (the Meet link only once the coach confirmed it) and the next checkpoint
  select jsonb_build_object(
           'giorno', (c.inizio at time zone 'Europe/Rome')::date,
           'ora', to_char(c.inizio at time zone 'Europe/Rome', 'HH24:MI'),
           'inizio', c.inizio,
           'durata_minuti', c.durata_minuti,
           'stato', c.stato,
           'meet_url', case when c.stato = 'prenotata' then c.meet_url end
         )
    into v_call
  from public.clienti_call c
  where c.client_id = v_cliente and c.tipo = 'onboarding' and c.stato <> 'annullata'
  order by c.created_at desc
  limit 1;

  select jsonb_build_object(
           'giorno', (c.inizio at time zone 'Europe/Rome')::date,
           'ora', to_char(c.inizio at time zone 'Europe/Rome', 'HH24:MI'),
           'inizio', c.inizio,
           'durata_minuti', c.durata_minuti,
           'stato', c.stato,
           'meet_url', case when c.stato = 'prenotata' then c.meet_url end
         )
    into v_checkpoint
  from public.clienti_call c
  where c.client_id = v_cliente and c.tipo = 'checkpoint' and c.stato = 'prenotata'
  order by c.inizio
  limit 1;

  -- the deliveries of the coach, once the programme is delivered
  if v_stati ->> 'programma' in ('disponibile', 'in_corso', 'fatto') then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', c.id,
             'tipo', c.tipo,
             'titolo', c.titolo,
             'url', c.url,
             'youtube_id', c.youtube_id,
             'obbligatoria', c.obbligatoria
           )
           || case when c.tipo = 'video' then jsonb_build_object('video', jsonb_build_object(
                'percentuale', coalesce(vv.percentuale, 0),
                'visto', vv.visto_il is not null)) else '{}'::jsonb end
           order by c.created_at), '[]'::jsonb)
      into v_consegne
    from public.clienti_consegne c
    left join public.onboarding_video_visti vv on vv.client_id = v_cliente and vv.consegna_id = c.id
    where c.client_id = v_cliente;
  end if;

  -- the community: what the client did, once the step is unlocked
  select t.gruppo_privato_url into v_gruppo from public.clienti_telegram t where t.client_id = v_cliente;
  if coalesce(v_stati ->> 'community', 'bloccato') <> 'bloccato' then
    select jsonb_build_object(
             'username', (select t.username from public.clienti_telegram t where t.client_id = v_cliente),
             'richiesta_inviata_il', s.dati ->> 'richiesta_inviata_il',
             'presentato_il', s.dati ->> 'presentato_il'
           )
      into v_community
    from public.onboarding_passi s
    where s.client_id = v_cliente and s.passo = 'community';
  end if;

  v_lanciato := v_stati ->> 'programma' = 'fatto';

  -- the client can act: one of his steps available or in progress, or the programme delivered to watch
  v_in_attesa := coalesce(p.stato, '') <> 'completato' and not exists (
    select 1
    from public.onboarding_passi s
    join public.onboarding_passi_def d on d.versione = s.versione and d.chiave = s.passo
    where s.client_id = v_cliente
      and ((d.attore = 'cliente' and s.stato in ('disponibile', 'in_corso'))
           or (s.passo = 'programma' and s.stato = 'disponibile'))
  );

  -- who of the team the client is waiting for, and what that person is doing (first name and photo only)
  select nullif(split_part(btrim(pr.nome), ' ', 1), ''), pr.foto_url
    into v_coach_nome, v_coach_foto
  from public.onboarding_incarichi i
  join public.profiles pr on pr.id = i.coach_id
  where i.client_id = v_cliente;

  v_attesa := case
    when v_stati ->> 'prenotazione' = 'inviato' then jsonb_build_object(
      'passo', 'prenotazione',
      'cosa', coalesce(v_coach_nome, 'Il tuo coach') || ' sta confermando la tua call.')
    when v_stati ->> 'call' in ('disponibile', 'in_corso') and v_call is not null then jsonb_build_object(
      'passo', 'call',
      'cosa', 'La tua call di onboarding con ' || coalesce(v_coach_nome, 'il tuo coach') || ' è fissata.')
    when v_stati ->> 'call' = 'fatto' and v_stati ->> 'obiettivo' = 'bloccato' then jsonb_build_object(
      'passo', 'obiettivo',
      'cosa', coalesce(v_coach_nome, 'Il tuo coach') || ' sta impostando il tuo obiettivo su Coach Plus.')
    when v_stati ->> 'test' = 'in_attesa_team' then jsonb_build_object(
      'passo', 'test',
      'cosa', coalesce(v_coach_nome, 'Il tuo coach') || ' sta controllando i tuoi test e i tuoi tracciamenti.')
    when v_stati ->> 'programma' = 'in_attesa_team' then jsonb_build_object(
      'passo', 'programma',
      'cosa', coalesce(v_coach_nome, 'Il tuo coach') || ' sta preparando il tuo programma.')
  end;
  if v_attesa is not null then
    v_attesa := v_attesa || jsonb_build_object('chi', case when v_coach_nome is null then null else jsonb_build_object(
      'nome', v_coach_nome, 'ruolo', 'Coach', 'foto_url', v_coach_foto) end);
  end if;

  -- the page after the launch
  if v_lanciato then
    select coalesce(jsonb_agg(jsonb_build_object(
             'id', b.id,
             'tipo', b.tipo,
             'titolo', b.titolo,
             'corpo', b.corpo,
             'youtube_id', b.youtube_id,
             'url', b.url,
             'obbligatorio', b.obbligatorio
           ) order by b.ordine, b.created_at), '[]'::jsonb)
      into v_dopo
    from public.contenuti_blocchi b
    where b.versione_flusso = p.versione_flusso and b.pagina = 'dopo_lancio' and b.pubblicato;
  end if;

  return jsonb_build_object(
    'cliente', jsonb_build_object('nome', public.onboarding_nome_cliente(v_cliente)),
    'percorso', jsonb_build_object('stato', p.stato, 'giorno_zero', p.giorno_zero, 'completato_il', p.completato_il),
    'nodi', v_nodi,
    'passi', v_passi,
    'team', v_team,
    'consensi', v_consensi,
    'stima', public.onboarding_stima(v_cliente),
    'in_attesa', v_in_attesa,
    'call', v_call,
    'checkpoint', v_checkpoint,
    'consegne', coalesce(v_consegne, '[]'::jsonb),
    'community', v_community,
    'link_community', case when coalesce(v_stati ->> 'community', 'bloccato') <> 'bloccato' then v_imp.link_community end,
    'link_prenotazione', case when coalesce(v_stati ->> 'prenotazione', 'bloccato') <> 'bloccato' then v_imp.link_prenotazione end,
    'gruppo_privato_url', v_gruppo,
    'attesa_team', v_attesa,
    'lanciato', coalesce(v_lanciato, false),
    'dopo_lancio', coalesce(v_dopo, '[]'::jsonb)
  );
end;
$$;

comment on function public.percorso_cliente() is
  'The page of the client: { cliente { nome }, percorso { stato, giorno_zero, completato_il }, nodi, passi [{ chiave, titolo, nodo, attore, stato, completato_il (done), blocchi (unlocked only; a video with { percentuale, visto }, an item with spuntata) }], team [{ incarico, ruolo, nome, foto_url }], consensi, stima, in_attesa, call { giorno, ora, inizio, durata_minuti, stato, meet_url (only once prenotata) }, checkpoint (the next booked one), consegne (once the programme is delivered: id, tipo, titolo, url, youtube_id, obbligatoria, video), community { username, richiesta_inviata_il, presentato_il } (step unlocked), link_community and link_prenotazione (their step unlocked), gruppo_privato_url, attesa_team { passo, cosa, chi { nome, ruolo, foto_url } }, lanciato, dopo_lancio (the blocks of the page after the launch) }. Only the caller''s own client (cliente_corrente(), else 42501).';

revoke all on function public.percorso_cliente() from public, anon;
grant execute on function public.percorso_cliente() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. percorso_avanza: the body of 20261109090200, with the pairs of B2. Each pair from the states it starts
--    from; a pair not in the list, or a step in another state, is refused.
-- ---------------------------------------------------------------------------
create or replace function public.percorso_avanza(p_passo text, p_azione text, p_dati jsonb default '{}'::jsonb)
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
  v_dati jsonb;
  v_partenze text[];
  v_regole jsonb;
  v_nuovo text;
  v_giorno date;
  v_ora time;
  v_inizio timestamptz;
  v_call uuid;
  v_username text;
  v_voce uuid;
  v_voci jsonb;
  v_nome text;
begin
  if v_cliente is null then
    raise exception 'Accesso non valido: entra di nuovo.' using errcode = '42501';
  end if;

  -- the closed list
  v_partenze := case
    when p_passo = 'benvenuto' and p_azione = 'completa' then array['disponibile', 'in_corso']
    when p_passo = 'regole' and p_azione = 'accetta' then array['disponibile', 'in_corso']
    when p_passo = 'prenotazione' and p_azione = 'prenotato' then array['disponibile', 'in_corso']
    when p_passo = 'community' and p_azione in ('username', 'richiesta_inviata', 'presentato')
      then array['disponibile', 'in_corso']
    when p_passo = 'obiettivo' and p_azione = 'visto' then array['disponibile']
    when p_passo = 'test' and p_azione = 'spunta' then array['disponibile', 'in_corso']
    -- after the delivery only: never while the coach prepares the programme
    when p_passo = 'programma' and p_azione = 'completa' then array['disponibile']
  end;

  select s.stato, s.versione, s.dati into v_stato, v_versione, v_dati
  from public.onboarding_passi s
  where s.client_id = v_cliente and s.passo = p_passo
  for update;

  if v_stato = 'fatto' then
    raise exception 'Questo passo è già completato.' using errcode = '22023';
  end if;
  if v_partenze is not null and v_stato in ('inviato', 'in_attesa_team') then
    raise exception 'Il tuo team sta controllando questo passo: ti avvisiamo quando tocca a te.' using errcode = '22023';
  end if;
  if v_partenze is null or v_stato is null or not (v_stato = any (v_partenze)) then
    raise exception 'Questo passo non è ancora disponibile.' using errcode = '22023';
  end if;
  if p_dati is null then
    p_dati := '{}'::jsonb;
  end if;

  v_nome := coalesce(public.onboarding_nome_completo(v_cliente), 'un cliente');
  v_nuovo := 'fatto';

  if p_passo = 'benvenuto' then
    if public.onboarding_video_mancanti(v_cliente, p_passo) then
      raise exception 'Guarda il video fino in fondo prima di andare avanti.' using errcode = '22023';
    end if;

  elsif p_passo = 'regole' then
    if jsonb_typeof(p_dati) <> 'object' then
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

  elsif p_passo = 'prenotazione' then
    -- the day and the hour the client booked on the coach's calendar, from today to 60 days
    if jsonb_typeof(p_dati) <> 'object'
       or coalesce(p_dati ->> 'giorno', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or coalesce(p_dati ->> 'ora', '') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
      raise exception 'Scrivi il giorno e l''ora della call che hai prenotato.' using errcode = '22023';
    end if;
    begin
      v_giorno := (p_dati ->> 'giorno')::date;
      v_ora := (p_dati ->> 'ora')::time;
    exception when others then
      raise exception 'Scrivi il giorno e l''ora della call che hai prenotato.' using errcode = '22023';
    end;
    if v_giorno < public.oggi() or v_giorno > public.oggi() + 60 then
      raise exception 'Il giorno della call va da oggi a 60 giorni.' using errcode = '22023';
    end if;
    v_inizio := (v_giorno + v_ora) at time zone 'Europe/Rome';
    if v_inizio < now() then
      raise exception 'Quest''ora è già passata: scrivi quella della call che hai prenotato.' using errcode = '22023';
    end if;
    if exists (
      select 1 from public.clienti_call c
      where c.client_id = v_cliente and c.tipo = 'onboarding' and c.stato <> 'annullata'
    ) then
      raise exception 'Hai già una call di onboarding.' using errcode = '22023';
    end if;

    insert into public.clienti_call (client_id, tipo, inizio, stato, coach_id)
    values (v_cliente, 'onboarding', v_inizio, 'da_confermare',
            (select i.coach_id from public.onboarding_incarichi i where i.client_id = v_cliente))
    returning id into v_call;

    v_nuovo := 'inviato';
    perform public.onboarding_avvisa(
      v_cliente, array['coach'], true,
      'Call da confermare: ' || v_nome,
      'Ha prenotato la call di onboarding: confermala con il link di Meet.',
      'prenotazione/' || v_call::text
    );

  elsif p_passo = 'community' then
    if jsonb_typeof(p_dati) <> 'object' then
      raise exception 'Dati non validi' using errcode = '22023';
    end if;

    if p_azione = 'username' then
      v_username := nullif(lower(ltrim(btrim(coalesce(p_dati ->> 'username', '')), '@')), '');
      if v_username is null or v_username !~ '^[a-z0-9_]{5,32}$' then
        raise exception 'Lo username di Telegram ha da 5 a 32 caratteri: lettere, numeri e trattino basso.'
          using errcode = '22023';
      end if;
      insert into public.clienti_telegram (client_id, username) values (v_cliente, v_username)
      on conflict (client_id) do update set username = excluded.username;
      v_nuovo := 'in_corso';

    elsif p_azione = 'richiesta_inviata' then
      if not exists (select 1 from public.clienti_telegram t where t.client_id = v_cliente and t.username is not null) then
        raise exception 'Prima scrivi il tuo username di Telegram.' using errcode = '22023';
      end if;
      if not v_dati ? 'richiesta_inviata_il' then
        v_dati := v_dati || jsonb_build_object('richiesta_inviata_il', now());
        update public.clienti_telegram t
        set community_richiesta_il = coalesce(t.community_richiesta_il, now())
        where t.client_id = v_cliente;
        perform public.onboarding_avvisa(
          v_cliente, array['responsabile'], false,
          'Richiesta di accesso alla community: ' || v_nome,
          'Ha chiesto di entrare nella community su Telegram: approvala.',
          'community_richiesta/' || floor(extract(epoch from now()))::bigint::text
        );
      end if;
      v_nuovo := 'in_corso';

    else
      -- presentato
      if not v_dati ? 'richiesta_inviata_il' then
        raise exception 'Prima chiedi l''accesso alla community.' using errcode = '22023';
      end if;
      if public.onboarding_video_mancanti(v_cliente, p_passo) then
        raise exception 'Guarda il video fino in fondo prima di andare avanti.' using errcode = '22023';
      end if;
      v_dati := v_dati || jsonb_build_object('presentato_il', now());
      update public.clienti_telegram t
      set presentato_il = coalesce(t.presentato_il, now())
      where t.client_id = v_cliente;
      perform public.onboarding_avvisa(
        v_cliente, array['responsabile'], false,
        'Presentazione da controllare: ' || v_nome,
        'Si è presentato nella community.',
        'presentazione/' || floor(extract(epoch from now()))::bigint::text
      );
    end if;

  elsif p_passo = 'obiettivo' then
    if public.onboarding_video_mancanti(v_cliente, p_passo) then
      raise exception 'Guarda il video fino in fondo prima di andare avanti.' using errcode = '22023';
    end if;

  elsif p_passo = 'test' then
    begin
      v_voce := (p_dati ->> 'voce')::uuid;
    exception when others then
      v_voce := null;
    end;
    if v_voce is null or not exists (
      select 1 from public.contenuti_blocchi b
      where b.id = v_voce and b.versione_flusso = v_versione and b.pagina = 'passo' and b.passo = 'test'
        and b.tipo = 'voce' and b.pubblicato
    ) then
      raise exception 'Voce non valida' using errcode = '22023';
    end if;
    v_voci := coalesce(v_dati -> 'voci', '[]'::jsonb);
    if jsonb_typeof(v_voci) <> 'array' then
      v_voci := '[]'::jsonb;
    end if;
    if not v_voci ? v_voce::text then
      v_voci := v_voci || to_jsonb(v_voce::text);
    end if;
    v_dati := v_dati || jsonb_build_object('voci', v_voci);

    -- every published item ticked: the coach confirms tests and tracking
    if not exists (
      select 1 from public.contenuti_blocchi b
      where b.versione_flusso = v_versione and b.pagina = 'passo' and b.passo = 'test'
        and b.tipo = 'voce' and b.pubblicato
        and not (v_voci ? b.id::text)
    ) then
      v_nuovo := 'in_attesa_team';
      perform public.onboarding_avvisa(
        v_cliente, array['coach'], false,
        'Test da confermare: ' || v_nome,
        'Ha spuntato tutta la settimana test: conferma test e tracciamenti ricevuti.',
        'test_finiti/' || floor(extract(epoch from now()))::bigint::text
      );
    else
      v_nuovo := 'in_corso';
    end if;

  elsif p_passo = 'programma' then
    -- every compulsory video of the path, blocks and deliveries, seen at 90%
    if public.onboarding_video_mancanti(v_cliente, null) then
      raise exception 'Guarda i video obbligatori prima di andare avanti.' using errcode = '22023';
    end if;
  end if;

  update public.onboarding_passi s
  set stato = v_nuovo,
      dati = coalesce(v_dati, s.dati),
      iniziato_il = coalesce(s.iniziato_il, now()),
      inviato_il = case when v_nuovo in ('inviato', 'in_attesa_team') then now() else s.inviato_il end,
      completato_il = case when v_nuovo = 'fatto' then now() else s.completato_il end
  where s.client_id = v_cliente and s.passo = p_passo;

  if v_nuovo = 'fatto' then
    insert into public.onboarding_eventi (client_id, tipo, attore, dettagli)
    values (v_cliente, 'passo_completato', 'cliente', jsonb_build_object('passo', p_passo));
    perform public.onboarding_sblocca(v_cliente);
    perform public.onboarding_completa_se_pronto(v_cliente);
  elsif v_nuovo in ('inviato', 'in_attesa_team') then
    insert into public.onboarding_eventi (client_id, tipo, attore, dettagli)
    values (v_cliente, 'passo_inviato', 'cliente', jsonb_build_object('passo', p_passo));
  end if;

  return public.percorso_cliente();
end;
$$;

comment on function public.percorso_avanza(text, text, jsonb) is
  'The client moves a step forward with its action: only the pairs (step, action) of a closed list, each from its states. B1a: benvenuto/completa (compulsory videos seen), regole/accetta ({ regole, consenso_salute }). B2: prenotazione/prenotato ({ giorno, ora }, from today to 60 days: the onboarding call da_confermare, the step inviato, the coach and the admins told); community/username ({ username }), community/richiesta_inviata, community/presentato (the step done); obiettivo/visto (from disponibile only); test/spunta ({ voce }: a published item; every item ticked, the step in_attesa_team); programma/completa (from disponibile only, every compulsory video of the path, blocks and deliveries, seen). A step the team is checking: 22023; another pair or state: 22023 «Questo passo non è ancora disponibile.»; a done step: 22023 «Questo passo è già completato.». Then the step, the log, the unlock, the completion, and percorso_cliente() is returned. Only the caller''s own client (else 42501).';

revoke all on function public.percorso_avanza(text, text, jsonb) from public, anon;
grant execute on function public.percorso_avanza(text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. video_progresso: the body of 20261109090200, with the deliveries of the coach (the step «programma»
--    available or in progress). Watching never moves obiettivo or programma to in_corso: their action starts
--    only from disponibile.
-- ---------------------------------------------------------------------------
create or replace function public.video_progresso(p_blocco uuid, p_consegna uuid, p_durata integer, p_intervalli int4range[])
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
  v_dal timestamptz;
begin
  if v_cliente is null then
    raise exception 'Accesso non valido: entra di nuovo.' using errcode = '42501';
  end if;
  if num_nonnulls(p_blocco, p_consegna) <> 1 then
    raise exception 'Video non valido' using errcode = '22023';
  end if;

  if p_consegna is not null then
    -- a video delivered to this client, once the programme is delivered
    if not exists (
      select 1 from public.clienti_consegne c
      where c.id = p_consegna and c.client_id = v_cliente and c.tipo = 'video'
    ) then
      raise exception 'Video non valido' using errcode = '22023';
    end if;
    v_passo := 'programma';
    select s.stato, s.versione into v_stato, v_versione
    from public.onboarding_passi s
    where s.client_id = v_cliente and s.passo = 'programma'
    for update;
  else
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
  end if;
  if v_stato is null or v_stato not in ('disponibile', 'in_corso') then
    raise exception 'Questo passo non è ancora disponibile.' using errcode = '22023';
  end if;

  if p_intervalli is null or cardinality(p_intervalli) > 50 then
    raise exception 'Intervalli non validi' using errcode = '22023';
  end if;

  if p_consegna is not null then
    select * into r from public.onboarding_video_visti vv
    where vv.client_id = v_cliente and vv.consegna_id = p_consegna for update;
  else
    select * into r from public.onboarding_video_visti vv
    where vv.client_id = v_cliente and vv.blocco_id = p_blocco for update;
  end if;
  if found then
    v_durata := r.durata;
    v_bit := r.visti;
    v_dal := r.created_at;
  else
    -- the length is the player's, never trusted alone: a video shorter than 30 seconds is not a lesson, and
    -- the seconds below are capped by the real time passed since the first send
    if p_durata is null or p_durata not between 30 and 10800 then
      raise exception 'Durata non valida' using errcode = '22023';
    end if;
    v_durata := p_durata;
    v_bit := repeat('0', v_durata)::varbit;
    v_dal := now();
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

  -- the seconds seen never run ahead of the clock: at most twice the real time since the first send (YouTube
  -- plays up to 2x), plus 30 seconds for what the player saw before it (it sends every 12 seconds). One call
  -- never marks a video seen, and the page keeps the seconds a refused call carried only when the server failed.
  if bit_count(v_bit) > 2 * extract(epoch from now() - v_dal) + 30 then
    raise exception 'Intervalli non validi' using errcode = '22023';
  end if;

  v_percentuale := round(bit_count(v_bit)::numeric * 100 / v_durata, 2);

  if p_consegna is not null then
    insert into public.onboarding_video_visti (client_id, consegna_id, durata, visti, visto_il)
    values (v_cliente, p_consegna, v_durata, v_bit, case when v_percentuale >= 90 then now() end)
    on conflict (client_id, consegna_id) where consegna_id is not null do update
    set visti = excluded.visti,
        visto_il = coalesce(onboarding_video_visti.visto_il, excluded.visto_il);
  else
    insert into public.onboarding_video_visti (client_id, blocco_id, durata, visti, visto_il)
    values (v_cliente, p_blocco, v_durata, v_bit, case when v_percentuale >= 90 then now() end)
    on conflict (client_id, blocco_id) where blocco_id is not null do update
    set visti = excluded.visti,
        visto_il = coalesce(onboarding_video_visti.visto_il, excluded.visto_il);
  end if;

  -- watching a video starts its step (not obiettivo and programma: their action starts from disponibile)
  if v_stato = 'disponibile' and v_passo not in ('obiettivo', 'programma') then
    update public.onboarding_passi s
    set stato = 'in_corso', iniziato_il = coalesce(s.iniziato_il, now())
    where s.client_id = v_cliente and s.passo = v_passo;
  end if;

  return jsonb_build_object('percentuale', v_percentuale, 'visto', v_percentuale >= 90);
end;
$$;

comment on function public.video_progresso(uuid, uuid, integer, int4range[]) is
  'The seconds of a video seen: exactly one of p_blocco (a published video block of a step of the client available or in progress) and p_consegna (a video delivered to the client, with the step programma available or in progress). At most 50 intervals [from, to) inside the length (the first declared by the player, from 30 seconds to 3 hours); the seconds are joined to the ones already seen, and never more than twice the real time since the first send plus 30 seconds (22023). Returns { percentuale, visto } (visto from 90%). Only the caller''s own client (else 42501).';

revoke all on function public.video_progresso(uuid, uuid, integer, int4range[]) from public, anon;
grant execute on function public.video_progresso(uuid, uuid, integer, int4range[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The client registers: the body of 20261109090000, with the due dates of telegram_gruppo and
--    community_accesso (day zero + 1) and the coach and the responsible told
-- ---------------------------------------------------------------------------
create or replace function public.onboarding_registra_cliente(p_user_id uuid, p_invito uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente uuid;
  v_email_scheda text;
  v_email text;
  v_nome text;
  v_giorno_zero timestamptz;
begin
  select i.client_id into v_cliente from public.onboarding_inviti i where i.id = p_invito;
  select lower(u.email) into v_email from auth.users u where u.id = p_user_id;
  select c.email, concat_ws(' ', nullif(btrim(c.nome), ''), nullif(btrim(c.cognome), ''))
    into v_email_scheda, v_nome
  from public.clients c where c.id = v_cliente;

  insert into public.clienti_account (user_id, client_id) values (p_user_id, v_cliente);

  update public.onboarding_inviti i set stato = 'usato' where i.id = p_invito;

  update public.onboarding_percorsi p
  set stato = 'in_corso', giorno_zero = coalesce(p.giorno_zero, now())
  where p.client_id = v_cliente
  returning p.giorno_zero into v_giorno_zero;

  perform public.onboarding_sblocca(v_cliente);

  -- the due dates of the responsible's two tasks (B2): never an alarm, only a date on the task
  begin
    perform public.onboarding_task_scadenza(v_cliente, 'telegram_gruppo',
      (coalesce(v_giorno_zero, now()) at time zone 'Europe/Rome')::date + 1);
    perform public.onboarding_task_scadenza(v_cliente, 'community_accesso',
      (coalesce(v_giorno_zero, now()) at time zone 'Europe/Rome')::date + 1);
  exception when others then
    raise warning 'Onboarding: scadenze dei task del cliente % non scritte: %', v_cliente, sqlerrm;
  end;

  insert into public.onboarding_eventi (client_id, tipo, attore, dettagli)
  values (v_cliente, 'registrato', 'cliente', jsonb_build_object('invito_id', p_invito));

  -- the card follows the address the client chose; the log says that it changed, never which
  if v_email is distinct from lower(btrim(v_email_scheda)) then
    update public.clients c set email = v_email where c.id = v_cliente;
    insert into public.onboarding_eventi (client_id, tipo, attore, dettagli)
    values (v_cliente, 'email_cambiata', 'cliente', '{}'::jsonb);
    begin
      perform public.notifiche_avviso_admin(
        'onboarding_cliente',
        left('Email diversa da quella della scheda: ' || coalesce(nullif(v_nome, ''), 'un cliente'), 300),
        'Si è registrato con un altro indirizzo: la scheda del cliente ora ha quello.',
        null,
        '/onboarding/' || v_cliente::text,
        'onboarding/' || v_cliente::text || '/email/' || p_user_id::text
      );
    exception when others then
      raise warning 'Onboarding: notifica dell''email del cliente % non scritta: %', v_cliente, sqlerrm;
    end;
  end if;

  begin
    perform public.notifiche_avviso_admin(
      'onboarding_cliente',
      left(coalesce(nullif(v_nome, ''), 'Un cliente') || ' si è registrato al percorso', 300),
      'Il suo accesso al percorso è attivo.',
      null,
      '/onboarding/' || v_cliente::text,
      'onboarding/' || v_cliente::text || '/registrato/' || p_user_id::text
    );
  exception when others then
    raise warning 'Onboarding: notifica della registrazione del cliente % non scritta: %', v_cliente, sqlerrm;
  end;

  -- the coach and the responsible (B2: each his own), with a key of their own (an admin in charge is
  -- already told above)
  begin
    perform public.notifiche_avviso(
      (select array_agg(d.id) from unnest(public.onboarding_destinatari(v_cliente, array['coach', 'responsabile'], false)) as d(id)
       join public.profiles pr on pr.id = d.id where pr.ruolo <> 'admin'),
      'onboarding_cliente',
      left(coalesce(nullif(v_nome, ''), 'Un cliente') || ' si è registrato al percorso', 300),
      'Il suo onboarding è partito: lo trovi in Onboarding.',
      null,
      '/onboarding/' || v_cliente::text,
      'onboarding/' || v_cliente::text || '/registrato_team/' || p_user_id::text
    );
  exception when others then
    raise warning 'Onboarding: notifica della registrazione al team del cliente % non scritta: %', v_cliente, sqlerrm;
  end;

  delete from public.onboarding_registrazioni r where r.invito_id = p_invito;
end;
$$;

comment on function public.onboarding_registra_cliente(uuid, uuid) is
  'The client registers (inside the creation of its user): the account, the invite used, the path in corso with day zero, the first steps unlocked, the due dates of telegram_gruppo and community_accesso (day zero + 1), the address of the card aligned, the log, the admins, the coach and the responsible told. No grants.';

revoke all on function public.onboarding_registra_cliente(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. The reads of the people in charge (piano 4.9: «Coach e revisore vedono un cliente da registrato in poi;
--    un account sospeso per loro è In pausa, senza motivo»). Never email, phone, notes, invite, sale, payment
--    or log.
-- ---------------------------------------------------------------------------
-- The person in charge of a registered client that is not paused: onboarding_incaricato, and neither the path
-- nor the account suspended (nor closed before the end). A paused client is «In pausa» for the people in
-- charge, and only that: they read his path, steps, Telegram and files only through this (rilievo B2).
create function public.onboarding_incaricato_attivo(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.onboarding_incaricato(p_client_id)
    and exists (
      select 1 from public.onboarding_percorsi p
      where p.client_id = p_client_id and p.stato in ('in_corso', 'completato')
    )
    and not exists (
      select 1 from public.clienti_account a
      join public.onboarding_percorsi p on p.client_id = a.client_id
      where a.client_id = p_client_id
        and (a.stato = 'sospeso' or (a.stato = 'chiuso' and p.stato <> 'completato'))
    );
$$;

comment on function public.onboarding_incaricato_attivo(uuid) is
  'True when the caller is in charge of this registered client (onboarding_incaricato) and the client is not paused: path in corso or completed, account neither suspended nor closed before the end. Answers only about the caller; false for an OAuth token.';

revoke all on function public.onboarding_incaricato_attivo(uuid) from public, anon;
grant execute on function public.onboarding_incaricato_attivo(uuid) to authenticated;

-- the policy of A read the path (and through it the steps and Telegram) of a paused client too
drop policy onboarding_percorsi_incaricato_lettura on public.onboarding_percorsi;
create policy onboarding_percorsi_incaricato_lettura on public.onboarding_percorsi
  for select to authenticated
  using (stato in ('in_corso', 'completato') and public.onboarding_incaricato_attivo(client_id));

create function public.onboarding_incaricati_elenco()
returns table (
  client_id uuid,
  nome text,
  cognome text,
  incarico text,
  incarichi text[],
  gruppo text,
  passo text,
  passo_titolo text,
  call_da_confermare boolean,
  call_da_segnare boolean,
  richiesta_community boolean,
  presentazione_da_controllare boolean,
  test_da_confermare boolean,
  test_da_rivedere boolean,
  programma_da_consegnare boolean,
  obiettivo_da_impostare boolean,
  preparazione_incompleta boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_io uuid := (select auth.uid());
  v_admin boolean;
begin
  if public.da_client_oauth() or v_io is null then
    raise exception 'Accesso non valido' using errcode = '42501';
  end if;
  v_admin := public.is_admin();

  return query
  with base as (
    select p.client_id,
           c.nome,
           c.cognome,
           array_remove(array[
             case when i.coach_id = v_io then 'coach' end,
             case when i.revisore_id = v_io then 'revisore' end,
             case when i.responsabile_id = v_io then 'responsabile' end
           ], null) as inc,
           (p.stato = 'sospeso' or a.stato = 'sospeso' or (a.stato = 'chiuso' and p.stato <> 'completato')) as pausa,
           p.stato = 'completato' as completato
    from public.onboarding_percorsi p
    join public.clients c on c.id = p.client_id
    left join public.onboarding_incarichi i on i.client_id = p.client_id
    left join public.clienti_account a on a.client_id = p.client_id
    where p.giorno_zero is not null
      and (v_admin or (v_io in (i.coach_id, i.revisore_id, i.responsabile_id) and public.onboarding_incaricato(p.client_id)))
  ),
  righe as (
    select b.*,
           case when b.pausa then '{}'::jsonb
                else public.onboarding_code_per(public.onboarding_code(b.client_id), b.inc, v_admin) end as code,
           (select s.passo
            from public.onboarding_passi s
            join public.onboarding_passi_def d on d.versione = s.versione and d.chiave = s.passo
            where s.client_id = b.client_id and s.stato <> 'fatto'
            order by (s.stato = 'bloccato'), d.ordine
            limit 1) as passo_attuale
    from base b
  )
  select r.client_id,
         r.nome,
         r.cognome,
         case when 'coach' = any (r.inc) then 'coach'
              when 'responsabile' = any (r.inc) then 'responsabile'
              when 'revisore' = any (r.inc) then 'revisore' end,
         r.inc,
         case when r.pausa then 'in_pausa'
              when r.completato then 'completati'
              when exists (select 1 from jsonb_each_text(r.code) e where e.value = 'true') then 'tocca_a_te'
              else 'tocca_al_cliente' end,
         case when r.pausa or r.completato then null else r.passo_attuale end,
         case when r.pausa or r.completato then null else (
           select d.titolo from public.onboarding_passi_def d
           join public.onboarding_percorsi p on p.client_id = r.client_id and d.versione = p.versione_flusso
           where d.chiave = r.passo_attuale) end,
         coalesce((r.code ->> 'call_da_confermare')::boolean, false),
         coalesce((r.code ->> 'call_da_segnare')::boolean, false),
         coalesce((r.code ->> 'richiesta_community')::boolean, false),
         coalesce((r.code ->> 'presentazione_da_controllare')::boolean, false),
         coalesce((r.code ->> 'test_da_confermare')::boolean, false),
         coalesce((r.code ->> 'test_da_rivedere')::boolean, false),
         coalesce((r.code ->> 'programma_da_consegnare')::boolean, false),
         coalesce((r.code ->> 'obiettivo_da_impostare')::boolean, false),
         coalesce((r.code ->> 'preparazione_incompleta')::boolean, false)
  from righe r
  order by case when r.pausa then 3 when r.completato then 4
                when exists (select 1 from jsonb_each_text(r.code) e where e.value = 'true') then 1 else 2 end,
           r.nome, r.cognome, r.client_id;
end;
$$;

comment on function public.onboarding_incaricati_elenco() is
  'The registered clients of the caller''s incarichi (every one for the admin): client_id, nome, cognome, incarico (the main one: coach, responsabile, revisore) and incarichi, gruppo (tocca_a_te, tocca_al_cliente, in_pausa for a suspended account or path, never why; completati), the current step and its title, and the queues of his incarico only (the reviewer only test_da_rivedere; all for the admin). Never email, phone, notes, invite, sale, payment or log. 42501 for an OAuth token or without a session.';

revoke all on function public.onboarding_incaricati_elenco() from public, anon;
grant execute on function public.onboarding_incaricati_elenco() to authenticated;

create function public.onboarding_scheda_incaricato(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_io uuid := (select auth.uid());
  v_admin boolean;
  i public.onboarding_incarichi;
  p public.onboarding_percorsi;
  a public.clienti_account;
  c public.clients;
  v_inc text[];
  v_pausa boolean;
  v_code jsonb;
  v_ris jsonb;
  v_passi jsonb;
  v_video jsonb;
  v_call jsonb;
  v_checkpoint jsonb;
  v_consegne jsonb;
  v_community jsonb;
  v_test jsonb;
  v_q public.onboarding_questionari;
begin
  if public.da_client_oauth() or v_io is null then
    raise exception 'Accesso non valido' using errcode = '42501';
  end if;
  v_admin := public.is_admin();
  if not v_admin and (p_client_id is null or not public.onboarding_incaricato(p_client_id)) then
    raise exception 'Questo cliente non è tra i tuoi.' using errcode = '42501';
  end if;

  select * into p from public.onboarding_percorsi x where x.client_id = p_client_id;
  if p.client_id is null or p.giorno_zero is null then
    raise exception 'Il cliente non si è ancora registrato.' using errcode = '22023';
  end if;
  select * into i from public.onboarding_incarichi x where x.client_id = p_client_id;
  select * into a from public.clienti_account x where x.client_id = p_client_id;
  select * into c from public.clients x where x.id = p_client_id;

  v_inc := array_remove(array[
    case when i.coach_id = v_io then 'coach' end,
    case when i.revisore_id = v_io then 'revisore' end,
    case when i.responsabile_id = v_io then 'responsabile' end
  ], null);
  v_pausa := p.stato = 'sospeso' or a.stato = 'sospeso' or (a.stato = 'chiuso' and p.stato <> 'completato');

  v_ris := jsonb_build_object(
    'client_id', p_client_id,
    'nome', c.nome,
    'cognome', c.cognome,
    'incarichi', to_jsonb(v_inc),
    'in_pausa', v_pausa
  );
  -- paused: only the name and «In pausa», never why
  if v_pausa then
    return v_ris || jsonb_build_object('gruppo', 'in_pausa');
  end if;

  v_code := public.onboarding_code_per(public.onboarding_code(p_client_id), v_inc, v_admin);

  select coalesce(jsonb_agg(jsonb_build_object(
           'chiave', d.chiave,
           'titolo', d.titolo,
           'nodo', d.nodo,
           'attore', d.attore,
           'stato', s.stato,
           'completato_il', s.completato_il,
           -- what «Sblocca step» can do on it (onboarding_sblocca_passo)
           'sbloccabile', (s.stato = 'bloccato' and d.attore = 'cliente' and d.sblocco = 'automatico')
                          or (s.passo in ('benvenuto', 'obiettivo') and s.stato in ('disponibile', 'in_corso'))
         ) order by d.ordine), '[]'::jsonb)
    into v_passi
  from public.onboarding_passi s
  join public.onboarding_passi_def d on d.versione = s.versione and d.chiave = s.passo
  where s.client_id = p_client_id;

  -- the videos: titles and percentages, of the unlocked steps and of the deliveries
  select coalesce(jsonb_agg(v.oggetto order by v.ordine, v.sotto), '[]'::jsonb) into v_video
  from (
    select jsonb_build_object(
             'tipo', 'blocco', 'passo', b.passo, 'titolo', coalesce(b.titolo, 'Video'),
             'obbligatorio', b.obbligatorio,
             'percentuale', coalesce(vv.percentuale, 0), 'visto', vv.visto_il is not null) as oggetto,
           d.ordine, b.ordine as sotto
    from public.onboarding_passi s
    join public.onboarding_passi_def d on d.versione = s.versione and d.chiave = s.passo
    join public.contenuti_blocchi b
      on b.versione_flusso = s.versione and b.pagina = 'passo' and b.passo = s.passo
         and b.tipo = 'video' and b.pubblicato
    left join public.onboarding_video_visti vv on vv.client_id = p_client_id and vv.blocco_id = b.id
    where s.client_id = p_client_id and s.stato <> 'bloccato'
    union all
    select jsonb_build_object(
             'tipo', 'consegna', 'passo', 'programma', 'titolo', k.titolo,
             'obbligatorio', k.obbligatoria,
             'percentuale', coalesce(vv.percentuale, 0), 'visto', vv.visto_il is not null),
           1000, extract(epoch from k.created_at)::integer
    from public.clienti_consegne k
    left join public.onboarding_video_visti vv on vv.client_id = p_client_id and vv.consegna_id = k.id
    where k.client_id = p_client_id and k.tipo = 'video'
  ) v;

  select jsonb_build_object(
           'id', k.id, 'inizio', k.inizio, 'durata_minuti', k.durata_minuti, 'stato', k.stato, 'meet_url', k.meet_url)
    into v_call
  from public.clienti_call k
  where k.client_id = p_client_id and k.tipo = 'onboarding' and k.stato <> 'annullata'
  order by k.created_at desc
  limit 1;

  select jsonb_build_object(
           'id', k.id, 'inizio', k.inizio, 'durata_minuti', k.durata_minuti, 'stato', k.stato, 'meet_url', k.meet_url)
    into v_checkpoint
  from public.clienti_call k
  where k.client_id = p_client_id and k.tipo = 'checkpoint' and k.stato <> 'annullata'
  order by (k.stato <> 'prenotata'), k.inizio
  limit 1;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', k.id, 'tipo', k.tipo, 'titolo', k.titolo, 'url', k.url, 'youtube_id', k.youtube_id,
           'obbligatoria', k.obbligatoria,
           'percentuale', coalesce(vv.percentuale, 0), 'visto', vv.visto_il is not null
         ) order by k.created_at), '[]'::jsonb)
    into v_consegne
  from public.clienti_consegne k
  left join public.onboarding_video_visti vv on vv.client_id = p_client_id and vv.consegna_id = k.id
  where k.client_id = p_client_id;

  select jsonb_build_object(
           'richiesta_inviata_il', s.dati ->> 'richiesta_inviata_il',
           'community_approvata_il', s.dati ->> 'community_approvata_il',
           'presentato_il', s.dati ->> 'presentato_il',
           'presentazione_controllata_il', s.dati ->> 'presentazione_controllata_il'
         )
    into v_community
  from public.onboarding_passi s
  where s.client_id = p_client_id and s.passo = 'community';

  select jsonb_build_object('voci', coalesce(jsonb_agg(jsonb_build_object(
           'id', b.id, 'titolo', b.titolo,
           'spuntata', coalesce(s.dati -> 'voci', '[]'::jsonb) ? b.id::text
         ) order by b.ordine, b.created_at), '[]'::jsonb))
    into v_test
  from public.onboarding_passi s
  join public.contenuti_blocchi b
    on b.versione_flusso = s.versione and b.pagina = 'passo' and b.passo = 'test' and b.tipo = 'voce' and b.pubblicato
  where s.client_id = p_client_id and s.passo = 'test';

  v_ris := v_ris || jsonb_build_object(
    'gruppo', case when p.stato = 'completato' then 'completati'
                   when exists (select 1 from jsonb_each_text(v_code) e where e.value = 'true') then 'tocca_a_te'
                   else 'tocca_al_cliente' end,
    'percorso', jsonb_build_object('stato', p.stato, 'giorno_zero', p.giorno_zero, 'completato_il', p.completato_il),
    'passi', v_passi,
    'video', v_video,
    'call', v_call,
    'checkpoint', v_checkpoint,
    'consegne', v_consegne,
    'community', v_community,
    'test', v_test,
    'code', v_code
  );

  -- Telegram: the coach and the responsible (and the admin)
  if v_admin or v_inc && array['coach', 'responsabile'] then
    v_ris := v_ris || jsonb_build_object('telegram', (
      select jsonb_build_object('username', t.username, 'gruppo_privato_url', t.gruppo_privato_url)
      from public.clienti_telegram t where t.client_id = p_client_id));
  end if;

  -- the questionnaire and its files: the coach only (and the admin); never the reviewer or the responsible
  if v_admin or 'coach' = any (v_inc) then
    select * into v_q from public.onboarding_questionari q where q.client_id = p_client_id;
    v_ris := v_ris || jsonb_build_object(
      -- never the email and the phone to the coach: the contacts stay the admin's (the client is reached
      -- with «Tocca a te» and on Telegram)
      'questionario', case when v_q.client_id is null then null
                           else jsonb_build_object(
                             'risposte', case when v_admin then v_q.risposte
                                              else v_q.risposte - 'email' - 'telefono' end,
                             'inviato_il', v_q.inviato_il) end,
      'allegati', (
        select coalesce(jsonb_agg(jsonb_build_object('id', f.id, 'campo', f.campo, 'nome_file', f.nome_file)
                                  order by f.campo, f.created_at), '[]'::jsonb)
        from public.onboarding_allegati f
        where f.client_id = p_client_id and f.stato = 'caricato'
      )
    );
  end if;

  return v_ris;
end;
$$;

comment on function public.onboarding_scheda_incaricato(uuid) is
  'One registered client for a person in charge (or the admin): name and surname, incarichi, gruppo, the steps with title and state, titles and percentages of the videos, the onboarding call and the checkpoint, the deliveries, the community, the items of the test week, the queues of his incarico; the coach also the answers of the questionnaire and its files (id, campo, nome_file); coach and responsible the Telegram username and private group. A paused client: only name and in_pausa. Never email, phone, notes, invite, sale, payment or log. 42501 for anybody else and for an OAuth token; 22023 for a client not registered.';

revoke all on function public.onboarding_scheda_incaricato(uuid) from public, anon;
grant execute on function public.onboarding_scheda_incaricato(uuid) to authenticated;

create function public.onboarding_allegato_apri(p_id uuid)
returns table (percorso text, tipo text, nome_file text)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if public.da_client_oauth() then
    raise exception 'Accesso non valido' using errcode = '42501';
  end if;
  if (select auth.uid()) is null then
    return;
  end if;

  return query
  select f.percorso, f.tipo, f.nome_file
  from public.onboarding_allegati f
  where f.id = p_id
    and f.stato = 'caricato'
    and (
      public.is_admin()
      or (
        public.onboarding_incaricato_attivo(f.client_id)
        and exists (
          select 1 from public.onboarding_incarichi i
          where i.client_id = f.client_id and i.coach_id = (select auth.uid())
        )
      )
    );
end;
$$;

comment on function public.onboarding_allegato_apri(uuid) is
  'A file of the questionnaire for the route that signs its read: { percorso, tipo, nome_file } for the admin or the coach in charge of that registered client while it is not paused; no row for anybody else. 42501 for an OAuth token.';

revoke all on function public.onboarding_allegato_apri(uuid) from public, anon;
grant execute on function public.onboarding_allegato_apri(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. The functions of the team: the admin and the coach in charge (the responsible too for the community)
-- ---------------------------------------------------------------------------
create function public.onboarding_call_conferma(p_client_id uuid, p_inizio timestamptz, p_meet_url text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  k public.clienti_call;
  v_meet text := nullif(btrim(coalesce(p_meet_url, '')), '');
  v_inizio timestamptz;
begin
  perform public.onboarding_guardia_team(p_client_id, false);

  select * into k
  from public.clienti_call c
  where c.client_id = p_client_id and c.tipo = 'onboarding' and c.stato = 'da_confermare'
  for update;
  if k.id is null then
    raise exception 'Non c''è una call da confermare.' using errcode = '22023';
  end if;
  if v_meet is null or v_meet !~ '^https://meet\.google\.com/[^[:space:]]+$' or char_length(v_meet) > 300 then
    raise exception 'Il link di Meet comincia con https://meet.google.com/.' using errcode = '22023';
  end if;
  v_inizio := coalesce(p_inizio, k.inizio);
  if v_inizio < now() - interval '12 hours' or v_inizio > now() + interval '60 days' then
    raise exception 'Il giorno della call va da oggi a 60 giorni.' using errcode = '22023';
  end if;

  update public.clienti_call c
  set stato = 'prenotata',
      inizio = v_inizio,
      meet_url = v_meet,
      coach_id = coalesce((select i.coach_id from public.onboarding_incarichi i where i.client_id = p_client_id), c.coach_id)
  where c.id = k.id;

  update public.onboarding_passi s
  set stato = 'fatto', iniziato_il = coalesce(s.iniziato_il, now()), completato_il = now()
  where s.client_id = p_client_id and s.passo = 'prenotazione' and s.stato <> 'fatto';

  perform public.onboarding_sblocca(p_client_id);

  perform public.onboarding_task_scadenza(p_client_id, 'questionario_letto', (v_inizio at time zone 'Europe/Rome')::date);
  perform public.onboarding_task_scadenza(p_client_id, 'call_onboarding', (v_inizio at time zone 'Europe/Rome')::date);

  insert into public.onboarding_eventi (client_id, tipo, attore, dettagli)
  values (p_client_id, 'call_confermata', 'team', jsonb_build_object('call_id', k.id));

  return jsonb_build_object('client_id', p_client_id, 'call_id', k.id, 'inizio', v_inizio)
    || public.onboarding_avviso_cliente('call_confermata');
end;
$$;

comment on function public.onboarding_call_conferma(uuid, timestamptz, text) is
  'The coach in charge (or the admin) confirms the onboarding call the client booked: prenotata, day and hour corrected if given (from today to 60 days), the Meet link; the step prenotazione done, the unlock, the due dates of questionario_letto and call_onboarding on the day of the call. Returns { client_id, call_id, inizio, avviso, avvisa_cliente_email }. 42501 for anybody else and for an OAuth token.';

revoke all on function public.onboarding_call_conferma(uuid, timestamptz, text) from public, anon;
grant execute on function public.onboarding_call_conferma(uuid, timestamptz, text) to authenticated;

create function public.onboarding_call_esito(p_call_id uuid, p_esito text, p_nuovo_inizio timestamptz default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  k public.clienti_call;
  v_avviso text;
  v_primo uuid;
begin
  select * into k from public.clienti_call c where c.id = p_call_id;
  -- the guard before anything about the call: a person not in charge learns nothing
  perform public.onboarding_guardia_team(k.client_id, false);

  select * into k from public.clienti_call c where c.id = p_call_id for update;
  if p_esito is null or p_esito not in ('svolta', 'non_presentato', 'spostata') then
    raise exception 'Esito non valido' using errcode = '22023';
  end if;
  if k.stato <> 'prenotata' then
    raise exception 'Questa call non è da segnare.' using errcode = '22023';
  end if;

  if p_esito = 'svolta' then
    if k.inizio > now() then
      raise exception 'La call non c''è ancora stata: segnala svolta dopo averla fatta.' using errcode = '22023';
    end if;
    update public.clienti_call c set stato = 'svolta' where c.id = k.id;

    if k.tipo = 'onboarding' then
      update public.onboarding_passi s
      set stato = 'fatto', iniziato_il = coalesce(s.iniziato_il, now()), completato_il = now()
      where s.client_id = k.client_id and s.passo = 'call' and s.stato <> 'fatto';

      perform public.onboarding_task_completa(k.client_id, 'call_onboarding');
      perform public.onboarding_task_scadenza(k.client_id, 'obiettivo_smart', public.oggi() + 1);
      perform public.onboarding_task_scadenza(k.client_id, 'coachplus_test', public.oggi() + 1);
      perform public.onboarding_sblocca(k.client_id);

      -- the goal already set on Coach Plus: the client sees it now
      if exists (
        select 1 from public.pm_task t join public.pm_progetti pg on pg.id = t.progetto_id
        where pg.client_id = k.client_id and t.chiave_onboarding = 'obiettivo_smart' and t.stato = 'completato'
      ) then
        update public.onboarding_passi s
        set stato = 'disponibile'
        where s.client_id = k.client_id and s.passo = 'obiettivo' and s.stato = 'bloccato';
        if found then
          v_avviso := 'obiettivo_aperto';
          insert into public.onboarding_eventi (client_id, tipo, attore, dettagli)
          values (k.client_id, 'obiettivo_aperto', 'sistema', '{}'::jsonb);
        end if;
      end if;
    else
      -- the first checkpoint done: its task too (the first booked, the same rule as for a move)
      select c.id into v_primo
      from public.clienti_call c
      where c.client_id = k.client_id and c.tipo = 'checkpoint' and c.stato <> 'annullata'
      order by c.created_at, c.id
      limit 1;
      if v_primo = k.id then
        perform public.onboarding_task_completa(k.client_id, 'primo_checkpoint');
      end if;
    end if;

    insert into public.onboarding_eventi (client_id, tipo, attore, dettagli)
    values (k.client_id, 'call_svolta', 'team', jsonb_build_object('call_id', k.id, 'tipo', k.tipo));
    perform public.onboarding_completa_se_pronto(k.client_id);

  else
    if p_nuovo_inizio is null or p_nuovo_inizio <= now() or p_nuovo_inizio > now() + interval '60 days' then
      raise exception 'Scegli il nuovo giorno e la nuova ora della call, da adesso a 60 giorni.' using errcode = '22023';
    end if;
    update public.clienti_call c set inizio = p_nuovo_inizio where c.id = k.id;

    if k.tipo = 'onboarding' then
      perform public.onboarding_task_scadenza(k.client_id, 'questionario_letto', (p_nuovo_inizio at time zone 'Europe/Rome')::date);
      perform public.onboarding_task_scadenza(k.client_id, 'call_onboarding', (p_nuovo_inizio at time zone 'Europe/Rome')::date);
    else
      select c.id into v_primo
      from public.clienti_call c
      where c.client_id = k.client_id and c.tipo = 'checkpoint' and c.stato <> 'annullata'
      order by c.created_at, c.id
      limit 1;
      if v_primo = k.id then
        perform public.onboarding_task_scadenza(k.client_id, 'primo_checkpoint', (p_nuovo_inizio at time zone 'Europe/Rome')::date);
      end if;
    end if;

    insert into public.onboarding_eventi (client_id, tipo, attore, dettagli)
    values (k.client_id, case when p_esito = 'spostata' then 'call_spostata' else 'call_non_presentato' end, 'team',
            jsonb_build_object('call_id', k.id, 'tipo', k.tipo));
    v_avviso := case
      when k.tipo = 'checkpoint' and p_esito = 'spostata' then 'checkpoint_spostato'
      when k.tipo = 'checkpoint' then 'checkpoint_non_presentato'
      when p_esito = 'spostata' then 'call_spostata'
      else 'call_non_presentato' end;
  end if;

  return jsonb_build_object('client_id', k.client_id, 'call_id', k.id, 'esito', p_esito)
    || case when v_avviso is null then '{}'::jsonb else public.onboarding_avviso_cliente(v_avviso) end;
end;
$$;

comment on function public.onboarding_call_esito(uuid, text, timestamptz) is
  'The coach in charge (or the admin) marks a booked call: svolta (only once it began: the onboarding call makes the step call done, the task call_onboarding completed, the due dates of obiettivo_smart and coachplus_test tomorrow, the unlock, and the step obiettivo available if the goal is already set; the first checkpoint completes its task), non_presentato and spostata (p_nuovo_inizio from now to 60 days: the call stays booked on the new day). Returns { client_id, call_id, esito } and, when the client is to be told, { avviso, avvisa_cliente_email }. 42501 for anybody else and for an OAuth token.';

revoke all on function public.onboarding_call_esito(uuid, text, timestamptz) from public, anon;
grant execute on function public.onboarding_call_esito(uuid, text, timestamptz) to authenticated;

create function public.onboarding_test_ricevuti(p_client_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.onboarding_guardia_team(p_client_id, false);

  update public.onboarding_passi s
  set stato = 'fatto', completato_il = now()
  where s.client_id = p_client_id and s.passo = 'test' and s.stato = 'in_attesa_team';
  if not found then
    raise exception 'Il cliente non ha ancora finito la settimana test.' using errcode = '22023';
  end if;

  update public.onboarding_passi s
  set stato = 'in_attesa_team', inviato_il = now()
  where s.client_id = p_client_id and s.passo = 'programma' and s.stato = 'bloccato';

  perform public.onboarding_task_scadenza(p_client_id, 'prima_scheda', public.oggi() + 2);

  insert into public.onboarding_eventi (client_id, tipo, attore, dettagli)
  values (p_client_id, 'test_ricevuti', 'team', '{}'::jsonb);

  perform public.onboarding_avvisa(
    p_client_id, array['revisore'], false,
    'Test da rivedere: ' || coalesce(public.onboarding_nome_completo(p_client_id), 'un cliente'),
    'I video dei test della settimana sono su Coach Plus.',
    'test_ricevuti/' || floor(extract(epoch from now()))::bigint::text
  );

  return jsonb_build_object('client_id', p_client_id);
end;
$$;

comment on function public.onboarding_test_ricevuti(uuid) is
  'The coach in charge (or the admin) confirms tests and tracking received: the step test done, the step programma waiting for the team, the due date of prima_scheda in 2 days, the reviewer told («Test da rivedere»). 42501 for anybody else and for an OAuth token.';

revoke all on function public.onboarding_test_ricevuti(uuid) from public, anon;
grant execute on function public.onboarding_test_ricevuti(uuid) to authenticated;

create function public.onboarding_consegna_aggiungi(
  p_client_id uuid,
  p_tipo text,
  p_titolo text,
  p_url text,
  p_obbligatoria boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_titolo text := btrim(coalesce(p_titolo, ''));
  v_url text := nullif(btrim(coalesce(p_url, '')), '');
  v_youtube text;
  k public.clienti_consegne;
begin
  perform public.onboarding_guardia_team(p_client_id, false);

  if p_tipo is null or p_tipo not in ('video', 'pdf', 'link') then
    raise exception 'Tipo di consegna non valido' using errcode = '22023';
  end if;
  if char_length(v_titolo) not between 1 and 120 then
    raise exception 'Il titolo ha da 1 a 120 caratteri.' using errcode = '22023';
  end if;

  if p_tipo = 'video' then
    -- a YouTube link (watch, youtu.be, shorts, embed) or the id alone
    if v_url ~ '^[A-Za-z0-9_-]{11}$' then
      v_youtube := v_url;
      v_url := null;
    else
      v_youtube := substring(coalesce(v_url, '') from
        '^https://(?:www\.|m\.)?(?:youtube\.com/(?:watch\?(?:[^#]*&)?v=|shorts/|embed/|live/)|youtu\.be/|youtube-nocookie\.com/embed/)([A-Za-z0-9_-]{11})');
    end if;
    if v_youtube is null then
      raise exception 'Incolla il link del video di YouTube.' using errcode = '22023';
    end if;
  end if;
  if v_url is not null and (v_url !~ '^https://[^[:space:]]+$' or char_length(v_url) > 500) then
    raise exception 'Il link comincia con https://.' using errcode = '22023';
  end if;
  if p_tipo <> 'video' and v_url is null then
    raise exception 'Il link comincia con https://.' using errcode = '22023';
  end if;

  insert into public.clienti_consegne (client_id, tipo, titolo, youtube_id, url, obbligatoria, created_by)
  values (p_client_id, p_tipo, v_titolo, v_youtube, v_url,
          coalesce(p_obbligatoria, false) and p_tipo = 'video', (select auth.uid()))
  returning * into k;

  return jsonb_build_object(
    'id', k.id, 'client_id', k.client_id, 'tipo', k.tipo, 'titolo', k.titolo,
    'youtube_id', k.youtube_id, 'url', k.url, 'obbligatoria', k.obbligatoria
  );
end;
$$;

comment on function public.onboarding_consegna_aggiungi(uuid, text, text, text, boolean) is
  'The coach in charge (or the admin) adds a delivery for the client: video (a YouTube link or id; it can be compulsory), pdf or link (https). Returns the delivery. 42501 for anybody else and for an OAuth token.';

revoke all on function public.onboarding_consegna_aggiungi(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.onboarding_consegna_aggiungi(uuid, text, text, text, boolean) to authenticated;

create function public.onboarding_consegna_togli(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cliente uuid;
begin
  select c.client_id into v_cliente from public.clienti_consegne c where c.id = p_id;
  perform public.onboarding_guardia_team(v_cliente, false);

  delete from public.clienti_consegne c where c.id = p_id;

  return jsonb_build_object('id', p_id, 'client_id', v_cliente);
end;
$$;

comment on function public.onboarding_consegna_togli(uuid) is
  'The coach in charge (or the admin) removes a delivery of the client (its seconds seen go with it). 42501 for anybody else, for an unknown delivery and for an OAuth token.';

revoke all on function public.onboarding_consegna_togli(uuid) from public, anon;
grant execute on function public.onboarding_consegna_togli(uuid) to authenticated;

create function public.onboarding_programma_consegnato(p_client_id uuid, p_primo_checkpoint timestamptz)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_checkpoint uuid;
begin
  perform public.onboarding_guardia_team(p_client_id, false);

  perform 1 from public.onboarding_passi s
  where s.client_id = p_client_id and s.passo = 'programma' and s.stato = 'in_attesa_team'
  for update;
  if not found then
    raise exception 'Il programma si consegna dopo aver confermato i test.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.clienti_consegne c where c.client_id = p_client_id) then
    raise exception 'Aggiungi almeno una consegna prima.' using errcode = '22023';
  end if;
  if p_primo_checkpoint is null or p_primo_checkpoint <= now() or p_primo_checkpoint > now() + interval '120 days' then
    raise exception 'Scegli il giorno e l''ora del primo checkpoint, da adesso a 120 giorni.' using errcode = '22023';
  end if;

  insert into public.clienti_call (client_id, tipo, inizio, stato, coach_id, created_by)
  values (p_client_id, 'checkpoint', p_primo_checkpoint, 'prenotata',
          (select i.coach_id from public.onboarding_incarichi i where i.client_id = p_client_id), (select auth.uid()))
  returning id into v_checkpoint;

  update public.onboarding_passi s
  set stato = 'disponibile',
      dati = s.dati || jsonb_build_object('consegnato_il', now())
  where s.client_id = p_client_id and s.passo = 'programma';

  perform public.onboarding_task_completa(p_client_id, 'prima_scheda');
  perform public.onboarding_task_scadenza(p_client_id, 'template_alimentare', public.oggi() + 5);
  perform public.onboarding_task_scadenza(p_client_id, 'primo_checkpoint', (p_primo_checkpoint at time zone 'Europe/Rome')::date);

  insert into public.onboarding_eventi (client_id, tipo, attore, dettagli)
  values (p_client_id, 'programma_consegnato', 'team', jsonb_build_object('checkpoint_id', v_checkpoint));

  return jsonb_build_object('client_id', p_client_id, 'checkpoint_id', v_checkpoint)
    || public.onboarding_avviso_cliente('programma_consegnato');
end;
$$;

comment on function public.onboarding_programma_consegnato(uuid, timestamptz) is
  'The coach in charge (or the admin) delivers the programme: at least one delivery, the first checkpoint (a clienti_call checkpoint, from now to 120 days), the step programma available to the client (he watches the compulsory videos), the task prima_scheda completed, the due dates of template_alimentare in 5 days and of primo_checkpoint on its day. Returns { client_id, checkpoint_id, avviso, avvisa_cliente_email }. 42501 for anybody else and for an OAuth token.';

revoke all on function public.onboarding_programma_consegnato(uuid, timestamptz) from public, anon;
grant execute on function public.onboarding_programma_consegnato(uuid, timestamptz) to authenticated;

create function public.onboarding_community(p_client_id uuid, p_azione text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_dati jsonb;
begin
  perform public.onboarding_guardia_team(p_client_id, true);

  if p_azione is null or p_azione not in ('approvata', 'controllata') then
    raise exception 'Azione non valida' using errcode = '22023';
  end if;

  select s.dati into v_dati
  from public.onboarding_passi s
  where s.client_id = p_client_id and s.passo = 'community'
  for update;
  if v_dati is null then
    raise exception 'Step non valido' using errcode = '22023';
  end if;

  if p_azione = 'approvata' then
    if not v_dati ? 'community_approvata_il' then
      update public.onboarding_passi s
      set dati = s.dati || jsonb_build_object('community_approvata_il', now())
      where s.client_id = p_client_id and s.passo = 'community';
      update public.clienti_telegram t
      set community_approvata_il = coalesce(t.community_approvata_il, now())
      where t.client_id = p_client_id;
    end if;
    perform public.onboarding_task_completa(p_client_id, 'community_accesso');
  else
    if not v_dati ? 'presentato_il' then
      raise exception 'Il cliente non si è ancora presentato.' using errcode = '22023';
    end if;
    if not v_dati ? 'presentazione_controllata_il' then
      update public.onboarding_passi s
      set dati = s.dati || jsonb_build_object('presentazione_controllata_il', now())
      where s.client_id = p_client_id and s.passo = 'community';
      update public.clienti_telegram t
      set presentazione_controllata_il = coalesce(t.presentazione_controllata_il, now())
      where t.client_id = p_client_id;
    end if;
  end if;

  insert into public.onboarding_eventi (client_id, tipo, attore, dettagli)
  values (p_client_id, 'community_' || p_azione, 'team', '{}'::jsonb);

  return jsonb_build_object('client_id', p_client_id, 'azione', p_azione);
end;
$$;

comment on function public.onboarding_community(uuid, text) is
  'The admin, the coach or the responsible in charge marks the community: approvata (the request to join approved, the task community_accesso completed) or controllata (the presentation checked, only after the client presented himself). 42501 for anybody else and for an OAuth token.';

revoke all on function public.onboarding_community(uuid, text) from public, anon;
grant execute on function public.onboarding_community(uuid, text) to authenticated;

-- «Segna obiettivo impostato»: the goal set on Coach Plus after the call. The same as completing the task
-- «Obiettivo SMART» in the project (the trigger opens the step), but it returns the notice to the client, which a
-- trigger cannot send: so «Tocca a te» leaves in this order too (rilievo B2).
create function public.onboarding_obiettivo_impostato(p_client_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_aperto boolean := false;
begin
  perform public.onboarding_guardia_team(p_client_id, false);

  perform 1 from public.onboarding_passi s where s.client_id = p_client_id and s.passo = 'obiettivo' for update;
  if not exists (
    select 1 from public.onboarding_passi s where s.client_id = p_client_id and s.passo = 'call' and s.stato = 'fatto'
  ) then
    raise exception 'Prima segna la call di onboarding come svolta.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.onboarding_passi s where s.client_id = p_client_id and s.passo = 'obiettivo' and s.stato = 'bloccato'
  ) then
    raise exception 'L''obiettivo è già aperto al cliente.' using errcode = '22023';
  end if;

  -- the task: its trigger opens the step and writes the log
  perform public.onboarding_task_completa(p_client_id, 'obiettivo_smart');
  -- a task completed before (reopened by hand, or without a project): the step opens here
  update public.onboarding_passi s
  set stato = 'disponibile'
  where s.client_id = p_client_id and s.passo = 'obiettivo' and s.stato = 'bloccato';
  if found then
    insert into public.onboarding_eventi (client_id, tipo, attore, dettagli)
    values (p_client_id, 'obiettivo_aperto', 'team', '{}'::jsonb);
  end if;
  select s.stato = 'disponibile' into v_aperto
  from public.onboarding_passi s where s.client_id = p_client_id and s.passo = 'obiettivo';

  return jsonb_build_object('client_id', p_client_id)
    || case when v_aperto then public.onboarding_avviso_cliente('obiettivo_aperto') else '{}'::jsonb end;
end;
$$;

comment on function public.onboarding_obiettivo_impostato(uuid) is
  'The coach in charge (or the admin) says the goal is set on Coach Plus: after the call done, with the step obiettivo still locked (else 22023), the task obiettivo_smart completed and the step available for the client. Returns { client_id, avviso, avvisa_cliente_email }. 42501 for anybody else and for an OAuth token.';

revoke all on function public.onboarding_obiettivo_impostato(uuid) from public, anon;
grant execute on function public.onboarding_obiettivo_impostato(uuid) to authenticated;

create function public.onboarding_sblocca_passo(p_client_id uuid, p_passo text, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := btrim(coalesce(p_motivo, ''));
  s public.onboarding_passi;
  d public.onboarding_passi_def;
  v_chiudi boolean;
begin
  perform public.onboarding_guardia_team(p_client_id, false);

  if char_length(v_motivo) not between 1 and 300 then
    raise exception 'Scrivi perché sblocchi lo step (al massimo 300 caratteri).' using errcode = '22023';
  end if;
  select * into s
  from public.onboarding_passi x
  where x.client_id = p_client_id and x.passo = p_passo
  for update;
  if s.client_id is null then
    raise exception 'Step non valido' using errcode = '22023';
  end if;
  select * into d from public.onboarding_passi_def x where x.versione = s.versione and x.chiave = s.passo;

  -- a step the client is stuck on because its video does not count (YouTube that changes its protocol):
  -- the team closes it, and its videos never stop him again (onboarding_video_mancanti skips the done steps)
  v_chiudi := s.passo in ('benvenuto', 'obiettivo') and s.stato in ('disponibile', 'in_corso');

  if not v_chiudi then
    -- the steps the team opens with its own action: never from here, or the path would have no way out
    if p_passo = 'call' then
      raise exception 'La call di onboarding si chiude con «Com''è andata», quando è stata svolta.' using errcode = '22023';
    elsif p_passo = 'programma' then
      raise exception 'Il programma si apre con «Consegna il programma».' using errcode = '22023';
    elsif p_passo = 'obiettivo' then
      raise exception 'L''obiettivo si apre con «Segna obiettivo impostato», dopo la call.' using errcode = '22023';
    elsif d.attore <> 'cliente' or d.sblocco <> 'automatico' then
      raise exception 'Questo step lo apre un''azione del team.' using errcode = '22023';
    elsif s.stato <> 'bloccato' then
      raise exception 'Questo step non è bloccato.' using errcode = '22023';
    end if;
  end if;

  if v_chiudi then
    update public.onboarding_passi x
    set stato = 'fatto',
        iniziato_il = coalesce(x.iniziato_il, now()),
        completato_il = now(),
        dati = x.dati || jsonb_build_object('chiuso_dal_team_il', now())
    where x.client_id = p_client_id and x.passo = p_passo;
  else
    update public.onboarding_passi x
    set stato = 'disponibile'
    where x.client_id = p_client_id and x.passo = p_passo;
  end if;

  -- the author, which only the admin reads
  insert into public.onboarding_eventi (client_id, tipo, attore, autore_id, dettagli)
  values (p_client_id, 'passo_sbloccato', 'team', (select auth.uid()),
          jsonb_build_object('passo', p_passo, 'motivo', v_motivo, 'chiuso', v_chiudi));

  if v_chiudi then
    perform public.onboarding_sblocca(p_client_id);
    perform public.onboarding_completa_se_pronto(p_client_id);
  end if;

  return jsonb_build_object('client_id', p_client_id, 'passo', p_passo, 'chiuso', v_chiudi)
    || public.onboarding_avviso_cliente('passo_sbloccato');
end;
$$;

comment on function public.onboarding_sblocca_passo(uuid, text, text) is
  'The admin or the coach in charge, with a reason (1-300 characters): opens a locked step of the client that unlocks by itself (disponibile), or closes a step the client is stuck on because its video does not count (benvenuto or obiettivo, available or in progress: done, its videos no longer wanted, the next steps unlocked). Never call, programma or a locked obiettivo, which the team opens with its own action (22023). The log with the author, which only the admin reads. Returns { client_id, passo, chiuso, avviso, avvisa_cliente_email }. 42501 for anybody else and for an OAuth token.';

revoke all on function public.onboarding_sblocca_passo(uuid, text, text) from public, anon;
grant execute on function public.onboarding_sblocca_passo(uuid, text, text) to authenticated;

create function public.onboarding_riavvia(p_client_id uuid, p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_motivo text := btrim(coalesce(p_motivo, ''));
begin
  perform public.onboarding_guardia_team(p_client_id, false);

  if char_length(v_motivo) not between 1 and 300 then
    raise exception 'Scrivi perché riavvii l''onboarding (al massimo 300 caratteri).' using errcode = '22023';
  end if;

  perform 1 from public.onboarding_percorsi p where p.client_id = p_client_id for update;

  -- every step locked again, but the rules and the questionnaire, which keep consent and answers
  update public.onboarding_passi s
  set stato = 'bloccato', iniziato_il = null, inviato_il = null, completato_il = null, dati = '{}'::jsonb
  where s.client_id = p_client_id and s.passo not in ('regole', 'questionario');

  -- the onboarding call booked before: cancelled, a new booking can be made; the checkpoint still to come
  -- too, so a new «Consegna il programma» books the only one (the deliveries stay: the coach removes them)
  update public.clienti_call c
  set stato = 'annullata'
  where c.client_id = p_client_id
    and (c.tipo = 'onboarding' and c.stato <> 'annullata'
         or c.tipo = 'checkpoint' and c.stato in ('da_confermare', 'prenotata'));

  update public.onboarding_percorsi p
  set stato = 'in_corso', completato_il = null
  where p.client_id = p_client_id;

  perform public.onboarding_sblocca(p_client_id);

  insert into public.onboarding_eventi (client_id, tipo, attore, autore_id, dettagli)
  values (p_client_id, 'onboarding_riavviato', 'team', (select auth.uid()), jsonb_build_object('motivo', v_motivo));

  return jsonb_build_object('client_id', p_client_id) || public.onboarding_avviso_cliente('onboarding_riavviato');
end;
$$;

comment on function public.onboarding_riavvia(uuid, text) is
  'The admin or the coach in charge starts the onboarding again, with a reason (1-300 characters): every step locked but regole and questionario (they stay done, with consent and answers), the onboarding call and the checkpoint to come cancelled (the deliveries stay), the path in corso, the unlock; the log with the author, which only the admin reads. 42501 for anybody else and for an OAuth token.';

revoke all on function public.onboarding_riavvia(uuid, text) from public, anon;
grant execute on function public.onboarding_riavvia(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 10. The step follows its task (piano 4.4: «la verità è lo step, il task è lo specchio»): obiettivo_smart
--     completed after the call opens obiettivo; telegram_gruppo completed writes the log. Reopening the task
--     never moves the step back. Never stops the task.
-- ---------------------------------------------------------------------------
create function public.pm_task_onboarding_passo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente uuid;
begin
  begin
    select pg.client_id into v_cliente from public.pm_progetti pg where pg.id = new.progetto_id;
    if v_cliente is null then
      return null;
    end if;

    if new.chiave_onboarding = 'obiettivo_smart' then
      update public.onboarding_passi s
      set stato = 'disponibile'
      where s.client_id = v_cliente and s.passo = 'obiettivo' and s.stato = 'bloccato'
        and exists (
          select 1 from public.onboarding_passi c
          where c.client_id = v_cliente and c.passo = 'call' and c.stato = 'fatto'
        );
      if found then
        insert into public.onboarding_eventi (client_id, tipo, attore, dettagli)
        values (v_cliente, 'obiettivo_aperto', 'sistema', '{}'::jsonb);
      end if;
    elsif new.chiave_onboarding = 'telegram_gruppo' then
      insert into public.onboarding_eventi (client_id, tipo, attore, dettagli)
      values (v_cliente, 'telegram_gruppo_creato', 'sistema', '{}'::jsonb);
    end if;
  exception when others then
    raise warning 'Onboarding: lo step del task % non è stato allineato: %', new.id, sqlerrm;
  end;
  return null;
end;
$$;
revoke all on function public.pm_task_onboarding_passo() from public, anon, authenticated;

create trigger pm_task_onboarding_passo
  after update of stato on public.pm_task
  for each row
  when (new.chiave_onboarding is not null and new.stato = 'completato' and old.stato is distinct from 'completato')
  execute function public.pm_task_onboarding_passo();

-- ---------------------------------------------------------------------------
-- 11. The opening of the client area
-- ---------------------------------------------------------------------------
-- The invite keeps itself coherent: the body of 20261109090000, plus an active invite without its days that
-- gets them once the area is open (onboarding_apri_ai_clienti touches the active invites without a date)
create or replace function public.onboarding_inviti_coerenza()
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
  if new.minorenne is distinct from old.minorenne then
    raise exception 'Un invito non cambia da minorenne a maggiorenne: si decide all''avvio' using errcode = '22023';
  end if;
  -- only the trigger of a sale moved to another client lets go of it; never onto another sale
  if new.sale_id is distinct from old.sale_id and new.sale_id is not null then
    raise exception 'Un invito non cambia vendita' using errcode = '22023';
  end if;
  -- a session changes the link only through the admin's functions (they raise alpha.onboarding_admin);
  -- the triggers of payments and sales run one level deeper. Never a direct PATCH: it would skip the
  -- log with its author, the consent of a parent and the rules of the payment.
  if (select auth.uid()) is not null
     and pg_trigger_depth() = 1
     and coalesce(current_setting('alpha.onboarding_admin', true), '') <> 'on'
     and row(new.stato, new.attivato_da, new.attivato_il, new.token_hash, new.revocato_motivo,
             new.consenso_genitore_il, new.consenso_genitore_nota, new.scade_il, new.usato_il, new.sale_id,
             new.prova)
         is distinct from
         row(old.stato, old.attivato_da, old.attivato_il, old.token_hash, old.revocato_motivo,
             old.consenso_genitore_il, old.consenso_genitore_nota, old.scade_il, old.usato_il, old.sale_id,
             old.prova) then
    raise exception 'Il link si cambia solo dalle azioni dell''onboarding.' using errcode = '42501';
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
      -- the days of the link start once the client area is open, or at once for a test invite (B1a)
      new.scade_il := case when coalesce(v_aperto, false) or new.prova
                           then now() + make_interval(days => coalesce(v_giorni, 14)) end;
    end if;
  elsif new.stato = 'attivo' and new.token_hash is distinct from old.token_hash then
    new.scade_il := case when coalesce(v_aperto, false) or new.prova
                         then now() + make_interval(days => coalesce(v_giorni, 14)) end;
  elsif new.stato = 'attivo' and new.prova and not old.prova and new.scade_il is null then
    -- an active link marked as a test one: its days start now
    new.scade_il := now() + make_interval(days => coalesce(v_giorni, 14));
  elsif new.stato = 'attivo' and new.scade_il is null and coalesce(v_aperto, false) then
    -- an active link of before the opening of the area (B2): its days start now
    new.scade_il := now() + make_interval(days => coalesce(v_giorni, 14));
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

create function public.onboarding_apri_ai_clienti()
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  x public.onboarding_impostazioni;
  v_problemi text[] := '{}';
  v_da_scrivere integer;
  v_segnaposto integer;
  v_inviti integer;
begin
  if public.da_client_oauth() or not public.is_admin() then
    raise exception 'L''area clienti la apre l''admin' using errcode = '42501';
  end if;

  select * into x from public.onboarding_impostazioni for update;
  if x.aperto_ai_clienti then
    return jsonb_build_object('aperto', true, 'inviti', 0);
  end if;

  select count(*) into v_da_scrivere
  from public.contenuti_blocchi b
  where b.pubblicato
    and (position('[Da scrivere' in coalesce(b.titolo, '')) > 0
         or position('[Da scrivere' in coalesce(b.corpo, '')) > 0
         or position('da-scrivere' in coalesce(b.url, '')) > 0);
  if v_da_scrivere > 0 then
    v_problemi := v_problemi || (v_da_scrivere::text
      || case when v_da_scrivere = 1 then ' contenuto ha ancora «[Da scrivere»' else ' contenuti hanno ancora «[Da scrivere»' end);
  end if;

  select count(*) into v_segnaposto
  from public.contenuti_blocchi b
  where b.pubblicato and b.tipo = 'video' and b.youtube_id = 'XXXXXXXXXXX';
  if v_segnaposto > 0 then
    v_problemi := v_problemi || (v_segnaposto::text
      || case when v_segnaposto = 1 then ' video ha ancora l''id segnaposto' else ' video hanno ancora l''id segnaposto' end);
  end if;

  if x.link_community is null then
    v_problemi := v_problemi || 'manca il link della community'::text;
  end if;
  if x.link_prenotazione is null then
    v_problemi := v_problemi || 'manca l''indirizzo della pagina di prenotazione'::text;
  end if;

  if cardinality(v_problemi) > 0 then
    raise exception 'Prima di aprire l''area clienti: %.', array_to_string(v_problemi, ', ')
      using errcode = '22023', detail = to_jsonb(v_problemi)::text;
  end if;

  perform set_config('alpha.onboarding_area', 'on', true);
  update public.onboarding_impostazioni s
  set aperto_ai_clienti = true, updated_by = (select auth.uid())
  where s.id;
  perform set_config('alpha.onboarding_area', '', true);

  -- the active links of before get their days now
  perform set_config('alpha.onboarding_admin', 'on', true);
  update public.onboarding_inviti i
  set stato = i.stato
  where i.stato = 'attivo' and i.scade_il is null;
  get diagnostics v_inviti = row_count;
  perform set_config('alpha.onboarding_admin', '', true);

  return jsonb_build_object('aperto', true, 'inviti', v_inviti);
end;
$$;

comment on function public.onboarding_apri_ai_clienti() is
  'The admin opens the client area: refused (22023, the problems in words, and as a JSON array in the detail) while a published block still says «[Da scrivere» (or a placeholder link), a video still has the placeholder id, the link of the community or the booking page is missing. Open, the active links without a date get their days. Returns { aperto, inviti }. Admin only, never an OAuth token. Security invoker.';

revoke all on function public.onboarding_apri_ai_clienti() from public, anon;
grant execute on function public.onboarding_apri_ai_clienti() to authenticated;

create function public.onboarding_chiudi_ai_clienti()
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
begin
  if public.da_client_oauth() or not public.is_admin() then
    raise exception 'L''area clienti la chiude l''admin' using errcode = '42501';
  end if;

  perform set_config('alpha.onboarding_area', 'on', true);
  update public.onboarding_impostazioni s
  set aperto_ai_clienti = false, updated_by = (select auth.uid())
  where s.id and s.aperto_ai_clienti;
  perform set_config('alpha.onboarding_area', '', true);

  return jsonb_build_object('aperto', false);
end;
$$;

comment on function public.onboarding_chiudi_ai_clienti() is
  'The admin closes the client area: no new registration but the test ones; the accounts that exist stay. Returns { aperto }. Admin only, never an OAuth token. Security invoker.';

revoke all on function public.onboarding_chiudi_ai_clienti() from public, anon;
grant execute on function public.onboarding_chiudi_ai_clienti() to authenticated;

-- ---------------------------------------------------------------------------
-- 12. The content of the new steps and of the page after the launch (the CMS)
-- ---------------------------------------------------------------------------
insert into public.contenuti_blocchi (versione_flusso, pagina, passo, ordine, tipo, titolo, corpo, youtube_id, url, obbligatorio) values
  (1, 'passo', 'prenotazione', 1, 'testo', 'Prenota la tua call di onboarding',
   E'Apri il calendario del tuo coach e scegli il giorno e l''ora che ti vanno meglio. Poi torna qui e scrivi quello che hai scelto: il tuo coach conferma la call e ti manda il link di Google Meet.',
   null, null, false),
  (1, 'passo', 'prenotazione', 2, 'testo', 'Cosa faremo in call',
   E'**Call di onboarding con il tuo coach, 30 minuti su Google Meet**\n\n1. Rileggiamo insieme il tuo questionario e chiariamo i punti aperti.\n2. Ti diciamo cosa è realistico ottenere in 3 e in 6 mesi.\n3. Ti mostriamo cosa misuriamo e perché: peso, torace, vita, braccia, foto.\n4. Definiamo la strategia di allenamento e alimentazione.\n5. Ti mostriamo a schermo i test fisici su Coach Plus e come filmarli.\n6. Ti spieghiamo come tracciare l''alimentazione con Yazio.\n7. Fissiamo il primo checkpoint, tra circa 5 settimane, e poi uno ogni mese.',
   null, null, false),
  (1, 'passo', 'prenotazione', 3, 'avviso', null,
   'Se non trovi un orario che ti va bene, scrivilo nel tuo gruppo privato su Telegram.',
   null, null, false),
  (1, 'passo', 'community', 1, 'testo', 'Entra nella community',
   E'Nella community su Telegram trovi gli altri allievi e le risposte alle domande utili a tutti. Tre passi: scrivi il tuo username di Telegram, chiedi l''accesso con «Entra nella community» e, quando sei dentro, presentati nel topic «Presentazioni».',
   null, null, false),
  (1, 'passo', 'community', 2, 'domande', 'La tua presentazione',
   E'Ciao a tutti, sono [il tuo nome].\n\n**Chi sono:** \n\n**Da dove parto:** \n\n**Il mio obiettivo a 6 mesi:** \n\n**Perché adesso:** ',
   null, null, false),
  (1, 'passo', 'community', 3, 'avviso', null,
   '[Da scrivere: le regole della community da ricordare prima di presentarsi.]',
   null, null, false),
  (1, 'passo', 'call', 1, 'testo', 'La tua call di onboarding',
   E'**Cosa preparare:** il questionario compilato, l''attrezzatura a portata di mano, il telefono o il computer con cui puoi condividere lo schermo, 30 minuti senza interruzioni.',
   null, null, false),
  (1, 'passo', 'obiettivo', 1, 'testo', 'Il tuo obiettivo su Coach Plus',
   'Il tuo obiettivo SMART e le tue milestone sono su Coach Plus, impostati dal coach dopo la call. Aprili, leggili con calma e poi torna qui.',
   null, null, false),
  (1, 'passo', 'obiettivo', 2, 'pulsante', 'Apri Coach Plus',
   '[Da scrivere: il link di Coach Plus.]',
   null, 'https://da-scrivere.invalid/coach-plus', false),
  (1, 'passo', 'test', 1, 'testo', 'La settimana test',
   'Questa settimana raccogliamo i tuoi dati di partenza. Spunta ogni voce quando l''hai fatta.',
   null, null, false),
  (1, 'passo', 'test', 2, 'voce', 'Registrati su Coach Plus e avvisa il tuo coach',
   'Usa il link che ti ha mandato il tuo coach, poi scrivigli nel gruppo privato.',
   null, null, true),
  (1, 'passo', 'test', 3, 'voce', 'Carica 3 foto del fisico su Coach Plus',
   'Nella sezione Progressi: di fronte, di lato e di schiena.',
   null, null, true),
  (1, 'passo', 'test', 4, 'voce', 'Traccia quello che mangi per almeno 5 giorni',
   'Con Yazio, e ogni sera scrivi kcal e macro nel questionario giornaliero di Coach Plus.',
   null, null, true),
  (1, 'passo', 'test', 5, 'voce', 'Prendi le circonferenze',
   'Con il metro da sarto, e caricale su Coach Plus.',
   null, null, true),
  (1, 'passo', 'test', 6, 'voce', 'Fai i test fisici e carica i video',
   '[Da scrivere: quante sessioni di test (2 sessioni o 3 giorni) e cosa contengono.]',
   null, null, true),
  (1, 'passo', 'test', 7, 'avviso', null,
   'Quando hai completato test e tracciamenti, ricevi il programma in circa 24-48 ore.',
   null, null, false),
  (1, 'passo', 'programma', 1, 'testo', 'Il tuo programma',
   'Il tuo coach ti ha preparato il programma. Guarda i video segnati come obbligatori fino in fondo: quando li hai visti tutti, il tuo percorso parte.',
   null, null, false),
  (1, 'dopo_lancio', null, 1, 'testo', 'Il tuo percorso è iniziato',
   'Da qui in avanti lavori su Coach Plus con il tuo coach. Qui sotto trovi i link che ti servono ogni giorno.',
   null, null, false),
  (1, 'dopo_lancio', null, 2, 'pulsante', 'Apri Coach Plus',
   '[Da scrivere: il link di Coach Plus.]',
   null, 'https://da-scrivere.invalid/coach-plus', false),
  (1, 'dopo_lancio', null, 3, 'pulsante', 'Apri Yazio',
   'Per tracciare quello che mangi.',
   null, 'https://www.yazio.com/it', false);

-- ---------------------------------------------------------------------------
-- 13. The accounts already registered: the due dates of the responsible's two tasks, and every registered
--     path unlocked again (the step after the questionnaire opens now)
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select p.client_id, p.giorno_zero
    from public.onboarding_percorsi p
    join public.clienti_account a on a.client_id = p.client_id
    where p.giorno_zero is not null
  loop
    perform public.onboarding_task_scadenza(r.client_id, 'telegram_gruppo', (r.giorno_zero at time zone 'Europe/Rome')::date + 1);
    perform public.onboarding_task_scadenza(r.client_id, 'community_accesso', (r.giorno_zero at time zone 'Europe/Rome')::date + 1);
    perform public.onboarding_sblocca(r.client_id);
  end loop;
end;
$$;
