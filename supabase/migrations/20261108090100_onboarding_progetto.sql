-- Guided onboarding, release A (1.77.0): the client's project and its tasks (docs/onboarding/rilascio-a.md).
--
-- 1. pm_modelli.per_onboarding (one template in the app), and on pm_modelli_voci and pm_task
--    per_incarico (coach, revisore, responsabile: who does it, from onboarding_incarichi) and
--    chiave_onboarding (the stable name of the task). A session never writes the two columns of a task.
-- 2. The template «Onboarding cliente»: 10 tasks in one list «Onboarding», without dates (the due dates
--    come with release B).
-- 3. onboarding_apri_progetto(client): the client's project, opened when missing, with the list
--    «Onboarding» and its tasks added once; the responsible is the project's. No grants.
-- 4. onboarding_assegna_incarichi(client): coach and reviewer join the project, the coach becomes the
--    project's coach, every task goes to the person of its incarico. Called when the link turns active,
--    never at the start: before the payment coach and reviewer do not see the project. No grants.
-- 5. pm_scegli_coach never touches a task with an incarico; pm_apri_progetto_cliente never reopens an
--    onboarding task at a renewal.
-- 6. anteprima_eliminazione('cliente') says whether the client has an onboarding.
--
-- unisci_profili and elimina_persona stay as they are: the first moves every column that points to a
-- person (the incarichi and the defaults too), the second leans on «on delete set null»
-- (110_onboarding_avvio_gate.sql checks both).

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.pm_modelli add column per_onboarding boolean not null default false;
create unique index pm_modelli_uno_per_onboarding on public.pm_modelli (per_onboarding) where per_onboarding;

comment on column public.pm_modelli.per_onboarding is
  'The one template whose tasks are added to a client''s project when the onboarding starts (onboarding_apri_progetto).';

alter table public.pm_modelli_voci
  add column per_incarico text check (per_incarico in ('coach', 'revisore', 'responsabile')),
  add column chiave_onboarding text check (chiave_onboarding ~ '^[a-z0-9_]{1,60}$');
create unique index pm_modelli_voci_chiave_onboarding on public.pm_modelli_voci (modello_id, chiave_onboarding)
  where chiave_onboarding is not null;

comment on column public.pm_modelli_voci.per_incarico is
  'Who does the task in a client''s onboarding: the coach, the reviewer or the responsible of onboarding_incarichi.';
comment on column public.pm_modelli_voci.chiave_onboarding is
  'The stable name of an onboarding task: the task is added to a project once per key.';

alter table public.pm_task
  add column per_incarico text check (per_incarico in ('coach', 'revisore', 'responsabile')),
  add column chiave_onboarding text check (chiave_onboarding ~ '^[a-z0-9_]{1,60}$');
create unique index pm_task_chiave_onboarding on public.pm_task (progetto_id, chiave_onboarding)
  where chiave_onboarding is not null;

comment on column public.pm_task.per_incarico is
  'Copied from the template item: the incarico (coach, revisore, responsabile) whose person does this onboarding task. Never written by a session.';
comment on column public.pm_task.chiave_onboarding is
  'The stable name of an onboarding task in a client''s project (one per project). Never written by a session.';

-- A session never writes the two columns: only the onboarding (no session inside its functions) does.
create function public.pm_task_onboarding_guardia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.per_incarico is not null or new.chiave_onboarding is not null then
      raise exception 'I task dell''onboarding li crea l''onboarding' using errcode = '42501';
    end if;
  elsif new.per_incarico is distinct from old.per_incarico
        or new.chiave_onboarding is distinct from old.chiave_onboarding then
    raise exception 'L''incarico e la chiave di un task dell''onboarding non si cambiano' using errcode = '42501';
  end if;

  return new;
end;
$$;
revoke all on function public.pm_task_onboarding_guardia() from public, anon, authenticated;

create trigger pm_task_onboarding_guardia
  before insert or update of per_incarico, chiave_onboarding on public.pm_task
  for each row execute function public.pm_task_onboarding_guardia();

-- ---------------------------------------------------------------------------
-- 2. The template «Onboarding cliente», in the department of «Percorso cliente»
-- ---------------------------------------------------------------------------
do $$
declare
  v_reparto uuid;
  v_modello uuid;
begin
  select m.reparto_id into v_reparto from public.pm_modelli m where m.per_nuovi_clienti;
  if v_reparto is null then
    select r.id into v_reparto
    from public.pm_reparti r
    where r.progetti_con_cliente
    order by (r.nome = 'Fitness Coaching') desc, r.ordine, r.nome
    limit 1;
  end if;
  if v_reparto is null then
    return;
  end if;

  select m.id into v_modello from public.pm_modelli m where m.per_onboarding;
  if v_modello is null then
    insert into public.pm_modelli (reparto_id, nome, descrizione, attivo, per_onboarding)
    values (
      v_reparto,
      'Onboarding cliente',
      'I task del team per l''onboarding di un nuovo cliente: si aggiungono al suo progetto quando parte l''onboarding.',
      true,
      true
    )
    returning id into v_modello;
  end if;

  insert into public.pm_modelli_voci (
    modello_id, tasklist, titolo, ordine, inizio_giorni, durata_giorni, per_incarico, chiave_onboarding
  )
  select v_modello, 'Onboarding', v.titolo, v.ordine, null, null, v.incarico, v.chiave
  from (values
    (1, 'telegram_gruppo', 'Crea il gruppo privato Telegram e aggiungi il cliente', 'responsabile'),
    (2, 'community_accesso', 'Approva la richiesta di accesso alla community', 'responsabile'),
    (3, 'questionario_letto', 'Leggi il questionario prima della call', 'coach'),
    (4, 'call_onboarding', 'Call di onboarding', 'coach'),
    (5, 'obiettivo_smart', 'Imposta obiettivo SMART e milestone su Coach Plus', 'coach'),
    (6, 'coachplus_test', 'Verifica il cliente su Coach Plus e assegna i test', 'coach'),
    (7, 'revisione_test', 'Revisione video dei test', 'revisore'),
    (8, 'prima_scheda', 'Prima scheda di 4 settimane consegnata', 'coach'),
    (9, 'template_alimentare', 'Template alimentare dopo 5 giorni di dati', 'coach'),
    (10, 'primo_checkpoint', 'Primo checkpoint mensile', 'coach')
  ) as v(ordine, chiave, titolo, incarico)
  where not exists (
    select 1 from public.pm_modelli_voci x where x.modello_id = v_modello and x.chiave_onboarding = v.chiave
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. The client's project, with the list «Onboarding». Idempotent on the key of
--    each task; tasks and list without an author (they are the app's), like the
--    ones pm_crea_progetto_cliente makes. No grants: only the triggers call it.
-- ---------------------------------------------------------------------------
create function public.onboarding_apri_progetto(p_client_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_progetto uuid;
  v_modello uuid;
  v_responsabile uuid;
  v_lista record;
  v_id_lista uuid;
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
begin
  if p_client_id is null then
    return null;
  end if;

  -- the project the first cashed instalment would open: the same one, a bit earlier
  v_progetto := public.pm_crea_progetto_cliente(p_client_id);
  if v_progetto is null then
    return null;
  end if;

  select m.id into v_modello from public.pm_modelli m where m.per_onboarding;
  select i.responsabile_id into v_responsabile
  from public.onboarding_incarichi i
  where i.client_id = p_client_id;

  -- no session while the app writes: no author on lists and tasks, the guards of the tasks let it pass
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  -- a project archived by a deleted sale is in use again
  update public.pm_progetti p
  set stato = 'attivo'
  where p.id = v_progetto and p.stato = 'archiviato';

  if v_modello is not null then
    for v_lista in
      select v.tasklist, min(v.ordine) as ordine
      from public.pm_modelli_voci v
      where v.modello_id = v_modello
        and v.chiave_onboarding is not null
        and v.tasklist is not null
        and not exists (
          select 1 from public.pm_task t
          where t.progetto_id = v_progetto and t.chiave_onboarding = v.chiave_onboarding
        )
      group by v.tasklist
      order by min(v.ordine)
    loop
      select l.id into v_id_lista
      from public.pm_tasklist l
      where l.progetto_id = v_progetto and l.nome = v_lista.tasklist
      order by l.created_at, l.id
      limit 1;
      if v_id_lista is null then
        insert into public.pm_tasklist (progetto_id, nome, ordine, created_by)
        values (v_progetto, v_lista.tasklist, v_lista.ordine, null)
        returning id into v_id_lista;
      end if;

      insert into public.pm_task (
        progetto_id, tasklist_id, titolo, descrizione, ordine, per_ruolo, per_incarico, chiave_onboarding, created_by
      )
      select v_progetto, v_id_lista, v.titolo, v.descrizione, v.ordine, v.per_ruolo, v.per_incarico,
             v.chiave_onboarding, null
      from public.pm_modelli_voci v
      where v.modello_id = v_modello
        and v.tasklist = v_lista.tasklist
        and v.chiave_onboarding is not null
      order by v.ordine, v.created_at
      on conflict (progetto_id, chiave_onboarding) where chiave_onboarding is not null do nothing;
    end loop;

    -- the items of the template outside any list
    insert into public.pm_task (
      progetto_id, titolo, descrizione, ordine, per_ruolo, per_incarico, chiave_onboarding, created_by
    )
    select v_progetto, v.titolo, v.descrizione, v.ordine, v.per_ruolo, v.per_incarico, v.chiave_onboarding, null
    from public.pm_modelli_voci v
    where v.modello_id = v_modello
      and v.tasklist is null
      and v.chiave_onboarding is not null
    order by v.ordine, v.created_at
    on conflict (progetto_id, chiave_onboarding) where chiave_onboarding is not null do nothing;
  end if;

  -- the responsible of the onboarding is the project's (a member, as the guard of pm_progetti wants)
  if v_responsabile is not null then
    insert into public.pm_membri (progetto_id, profile_id, aggiunto_da)
    values (v_progetto, v_responsabile, null)
    on conflict (progetto_id, profile_id) do nothing;

    update public.pm_progetti p
    set responsabile_id = v_responsabile
    where p.id = v_progetto and p.responsabile_id is distinct from v_responsabile;
  end if;

  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);

  return v_progetto;
end;
$$;

comment on function public.onboarding_apri_progetto(uuid) is
  'The client''s project for the onboarding: opened when missing (pm_crea_progetto_cliente), with the tasks of the template «Onboarding cliente» added once per key, without author nor assignees; the responsible of onboarding_incarichi becomes a member and the project''s responsible. No grants.';

revoke all on function public.onboarding_apri_progetto(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. The people in charge on the project and on its tasks. Called when the link
--    turns active (and again whenever the incarichi change while it is): coach
--    and reviewer join, the coach becomes the project's coach exactly as with
--    «Scegli il coach» (the tasks without an incarico still without anybody, and
--    the ones of the previous coach, go to him; a task of a role to a person with
--    that role), every task with an incarico goes to its person. An empty
--    incarico leaves its tasks as they are. No grants.
-- ---------------------------------------------------------------------------
create function public.onboarding_assegna_incarichi(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_progetto uuid;
  v_coach uuid;
  v_revisore uuid;
  v_responsabile uuid;
  v_vecchio uuid;
  v_task record;
  v_chi uuid;
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
begin
  -- the project, its list and its responsible (idempotent)
  v_progetto := public.onboarding_apri_progetto(p_client_id);
  if v_progetto is null then
    return;
  end if;

  select i.coach_id, i.revisore_id, i.responsabile_id
  into v_coach, v_revisore, v_responsabile
  from public.onboarding_incarichi i
  where i.client_id = p_client_id;
  if not found then
    return;
  end if;

  -- no session: nobody's name on who joined or who was assigned
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  insert into public.pm_membri (progetto_id, profile_id, aggiunto_da)
  select v_progetto, x.id, null
  from (select distinct u as id from unnest(array[v_coach, v_revisore, v_responsabile]) as u where u is not null) x
  on conflict (progetto_id, profile_id) do nothing;

  -- the project's coach follows the incarico (never the other way round)
  select p.coach_id into v_vecchio from public.pm_progetti p where p.id = v_progetto;
  if v_coach is not null and v_vecchio is distinct from v_coach then
    for v_task in
      select t.id, t.per_ruolo
      from public.pm_task t
      where t.progetto_id = v_progetto and t.parent_id is null and t.per_incarico is null
        and (
          not exists (select 1 from public.pm_task_assegnatari a where a.task_id = t.id)
          or exists (select 1 from public.pm_task_assegnatari a where a.task_id = t.id and a.profile_id = v_vecchio)
        )
      order by t.ordine, t.created_at
    loop
      v_chi := v_coach;
      if v_task.per_ruolo is not null then
        select coalesce((
          select x.id
          from public.profiles x
          where x.attivo and x.ruolo = v_task.per_ruolo
          order by exists (
            select 1 from public.pm_membri m where m.progetto_id = v_progetto and m.profile_id = x.id
          ) desc, x.nome, x.id
          limit 1
        ), v_coach) into v_chi;
      end if;

      if v_chi <> v_coach then
        insert into public.pm_membri (progetto_id, profile_id, aggiunto_da)
        values (v_progetto, v_chi, null)
        on conflict (progetto_id, profile_id) do nothing;
      end if;

      insert into public.pm_task_assegnatari (task_id, profile_id, created_by)
      values (v_task.id, v_chi, null)
      on conflict (task_id, profile_id) do nothing;

      if v_vecchio is not null and v_vecchio <> v_chi then
        delete from public.pm_task_assegnatari a
        where a.task_id = v_task.id and a.profile_id = v_vecchio;
      end if;
    end loop;

    update public.pm_progetti p
    set coach_id = v_coach
    where p.id = v_progetto and p.coach_id is distinct from v_coach;
  end if;

  -- every onboarding task to the person of its incarico
  insert into public.pm_task_assegnatari (task_id, profile_id, created_by)
  select t.id, x.chi, null
  from public.pm_task t
  cross join lateral (
    select case t.per_incarico
             when 'coach' then v_coach
             when 'revisore' then v_revisore
             when 'responsabile' then v_responsabile
           end as chi
  ) x
  where t.progetto_id = v_progetto and t.per_incarico is not null and x.chi is not null
  on conflict (task_id, profile_id) do nothing;

  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);
end;
$$;

comment on function public.onboarding_assegna_incarichi(uuid) is
  'Aligns the client''s project to onboarding_incarichi: the people join, the coach becomes the project''s coach (with the tasks «Scegli il coach» would give him), every task with an incarico goes to its person; an empty incarico leaves its tasks alone. Called when the link turns active and when the incarichi change while it is. No grants.';

revoke all on function public.onboarding_assegna_incarichi(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. «Scegli il coach» never touches a task with an incarico: the body of
--    20261002090000, one condition added.
-- ---------------------------------------------------------------------------
create or replace function public.pm_scegli_coach(p_progetto uuid, p_coach uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
  v_cliente uuid;
  v_vecchio uuid;
  v_task record;
  v_chi uuid;
begin
  if not public.pm_puo_gestire(p_progetto) then
    raise exception 'Il coach lo sceglie chi gestisce il progetto' using errcode = '42501';
  end if;

  select p.client_id, p.coach_id into v_cliente, v_vecchio from public.pm_progetti p where p.id = p_progetto;
  if not found then
    raise exception 'Progetto non trovato' using errcode = '22023';
  end if;
  if v_cliente is null then
    raise exception 'Il coach si sceglie nei progetti dei clienti' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles x where x.id = p_coach and x.attivo) then
    raise exception 'Scegli una persona attiva del team' using errcode = '22023';
  end if;

  insert into public.pm_membri (progetto_id, profile_id, aggiunto_da)
  values (p_progetto, p_coach, v_utente)
  on conflict (progetto_id, profile_id) do nothing;

  for v_task in
    select t.id, t.per_ruolo
    from public.pm_task t
    where t.progetto_id = p_progetto and t.parent_id is null
      -- the tasks of the onboarding follow onboarding_incarichi, never the project's coach (1.77.0)
      and t.per_incarico is null
      and (
        not exists (select 1 from public.pm_task_assegnatari a where a.task_id = t.id)
        or exists (select 1 from public.pm_task_assegnatari a where a.task_id = t.id and a.profile_id = v_vecchio)
      )
    order by t.ordine, t.created_at
  loop
    v_chi := p_coach;
    if v_task.per_ruolo is not null then
      select coalesce((
        select x.id
        from public.profiles x
        where x.attivo and x.ruolo = v_task.per_ruolo
        order by exists (
          select 1 from public.pm_membri m where m.progetto_id = p_progetto and m.profile_id = x.id
        ) desc, x.nome, x.id
        limit 1
      ), p_coach) into v_chi;
    end if;

    if v_chi <> p_coach then
      insert into public.pm_membri (progetto_id, profile_id, aggiunto_da)
      values (p_progetto, v_chi, v_utente)
      on conflict (progetto_id, profile_id) do nothing;
    end if;

    insert into public.pm_task_assegnatari (task_id, profile_id)
    values (v_task.id, v_chi)
    on conflict (task_id, profile_id) do nothing;

    if v_vecchio is not null and v_vecchio <> v_chi then
      delete from public.pm_task_assegnatari a
      where a.task_id = v_task.id and a.profile_id = v_vecchio;
    end if;
  end loop;

  update public.pm_progetti p
  set coach_id = p_coach
  where p.id = p_progetto and p.coach_id is distinct from p_coach;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. A renewal never reopens an onboarding task: the body of 20261003100000,
--    one condition added.
-- ---------------------------------------------------------------------------
create or replace function public.pm_apri_progetto_cliente(p_client_id uuid, p_sale_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_progetto uuid;
  v_creato_il timestamptz;
  v_prima_del timestamptz;
begin
  if p_client_id is null then
    return null;
  end if;

  select p.id, p.created_at into v_progetto, v_creato_il
  from public.pm_progetti p
  where p.client_id = p_client_id;

  -- the first path: a new project, its tasks just made
  if v_progetto is null then
    return public.pm_crea_progetto_cliente(p_client_id);
  end if;

  -- a new path for a project that was there: the path is not over any more
  update public.pm_progetti p
  set stato = 'attivo'
  where p.id = v_progetto
    and p.stato in ('completato', 'archiviato');

  -- a renewal: the path follows another one of the client; the tasks
  -- completed before it (its start, or its registration when later) reopen
  select greatest((s.data_inizio::timestamp at time zone 'Europe/Rome'), s.created_at)
  into v_prima_del
  from public.sales s
  where s.id = p_sale_id
    and s.client_id = p_client_id
    and exists (
      select 1 from public.sales prima
      where prima.client_id = s.client_id
        and prima.id <> s.id
        and prima.tipo in ('nuovo', 'rinnovo')
        and prima.data_inizio < s.data_inizio
    );
  if v_prima_del is null then
    return v_progetto;
  end if;

  -- the template's buckets are open again; never at the cost of the project
  begin
    update public.pm_task t
    set stato = 'da_fare'
    where t.progetto_id = v_progetto
      and t.stato = 'completato'
      and coalesce(t.completato_il, '-infinity'::timestamptz) < v_prima_del
      and t.parent_id is null
      and t.created_by is null
      and t.created_at = v_creato_il
      -- the onboarding is done once: its tasks never come back with a renewal (1.77.0)
      and t.chiave_onboarding is null
      and (t.scadenza is null or t.scadenza >= public.oggi());
  exception when others then
    raise warning 'Task del progetto % non riaperti: %', v_progetto, sqlerrm;
  end;

  return v_progetto;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. The preview of a client's deletion says whether an onboarding goes with
--    it: the body of 20261004110000, one key added to «cliente».
-- ---------------------------------------------------------------------------
create or replace function public.anteprima_eliminazione(p_tipo text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo l''admin elimina' using errcode = '42501';
  end if;

  case p_tipo
    when 'persona' then
      return jsonb_build_object(
        'report', (select count(*) from public.setter_daily_reports where setter_id = p_id),
        'regole', (select count(*) from public.commission_rules where profile_id = p_id),
        'pagamenti_provvigioni', (select count(*) from public.commission_payouts where profile_id = p_id),
        'vendite', (select count(*) from public.sales where setter_id = p_id or closer_id = p_id),
        'call', (select count(*) from public.calls where setter_id = p_id or closer_id = p_id),
        'lead', (select count(*) from public.leads where setter_id = p_id),
        'progetti', (select count(*) from public.pm_membri where profile_id = p_id),
        'voci_tempo', (select count(*) from public.pm_tempo where profile_id = p_id),
        'note', (select count(*) from public.pm_note where autore_id = p_id)
      );
    when 'cliente' then
      return jsonb_build_object(
        'vendite', (select count(*) from public.sales where client_id = p_id),
        'rate', (select count(*) from public.payments p join public.sales s on s.id = p.sale_id where s.client_id = p_id),
        'incassato', (
          select public.euro_testo(coalesce(sum(p.importo_incassato), 0))
          from public.payments p join public.sales s on s.id = p.sale_id
          where s.client_id = p_id and p.importo_incassato is not null
        ),
        'progetti', (select count(*) from public.pm_progetti where client_id = p_id),
        'cartella_drive', (select count(*) from public.clienti_cartelle where client_id = p_id),
        -- the onboarding (invite, path, steps, log, Telegram) goes with the client (1.77.0)
        'onboarding', (
          exists (select 1 from public.onboarding_inviti where client_id = p_id)
          or exists (select 1 from public.onboarding_percorsi where client_id = p_id)
        )
      );
    when 'vendita' then
      return jsonb_build_object(
        'rate', (select count(*) from public.payments where sale_id = p_id),
        'rate_incassate', (select count(*) from public.payments where sale_id = p_id and stato = 'incassata'),
        'incassato', (
          select public.euro_testo(coalesce(sum(importo_incassato), 0))
          from public.payments where sale_id = p_id and importo_incassato is not null
        )
      );
    when 'lead' then
      return jsonb_build_object(
        'call', (select count(*) from public.calls where lead_id = p_id),
        'clienti_collegati', (select count(*) from public.clients where lead_id = p_id)
      );
    when 'prodotto' then
      return jsonb_build_object(
        'vendite', (select count(*) from public.sales where product_id = p_id),
        'call', (select count(*) from public.calls where prodotto_proposto_id = p_id)
      );
    when 'reparto' then
      return jsonb_build_object(
        'progetti', (select count(*) from public.pm_progetti where reparto_id = p_id),
        'modelli', (select count(*) from public.pm_modelli where reparto_id = p_id)
      );
    else
      raise exception 'Tipo non valido' using errcode = '22023';
  end case;
end;
$$;
