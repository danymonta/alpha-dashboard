-- One project for every paying client (Dany, 02/10/2026): «per ogni persona che
-- diventa cliente pagante venga creato in automatico anche un progetto con il
-- nome del cliente», «semplice e non troppo dettagliata per i fitness coach che
-- tracciano».
--
-- 1. Templates: an item may live outside any list and have no dates (a bucket
--    open for the whole project, where the coach logs time), and may belong to
--    a role ("Programmazione alimentare" goes to nutrition when there is one).
--    One template in the app is the one for new clients (per_nuovi_clienti).
-- 2. "Percorso cliente" (Fitness Coaching) becomes those 8 buckets.
-- 3. A client has at most one project (unique client_id); the project has its
--    coach (coach_id), a member of the project.
-- 4. The first cashed instalment of a "nuovo" or "rinnovo" sale whose path is
--    not over creates the client's project, named like the client, in the
--    department of the template for new clients, with its tasks and no
--    members. An upsell never does (e.g. a university course sold on its own).
-- 5. The project's dates are the path's: the first start and the last end of
--    the client's "nuovo" and "rinnovo" sales, kept aligned when a sale is
--    added, changed, interrupted or deleted.
-- 6. "Coach del cliente": who manages the project picks the coach with one tap;
--    the coach joins and gets every task, the tasks of a role go to an active
--    person with that role (else to the coach too).
-- 7. A client renamed renames its project; merging profiles keeps the coach;
--    the preview of a client's deletion counts its project.
-- 8. Backfill, once: a project for every client on a paid path today.
--
-- The coach sees the project once he is a member, and nothing about money:
-- clients, sales and payments keep their own RLS (no policy for coaches).

-- ---------------------------------------------------------------------------
-- 1. Templates and tasks
-- ---------------------------------------------------------------------------
alter table public.pm_modelli_voci
  alter column tasklist drop not null,
  alter column inizio_giorni drop not null,
  alter column durata_giorni drop not null,
  add column per_ruolo public.app_role,
  add constraint pm_modelli_voci_date_insieme check ((inizio_giorni is null) = (durata_giorni is null));

comment on column public.pm_modelli_voci.tasklist is
  'The list the task goes into; null: the task stays outside any list.';
comment on column public.pm_modelli_voci.inizio_giorni is
  'First day of the task counted from the project start; null with durata_giorni: a task without dates, open for the whole project.';
comment on column public.pm_modelli_voci.per_ruolo is
  'Who does it when it is not the coach: picking the coach assigns it to an active person with this role, else to the coach.';

alter table public.pm_task add column per_ruolo public.app_role;

comment on column public.pm_task.per_ruolo is
  'Copied from the template item: the role that does this task in a client''s project (null: the coach).';

alter table public.pm_modelli add column per_nuovi_clienti boolean not null default false;

comment on column public.pm_modelli.per_nuovi_clienti is
  'The template every paying client''s project starts from (one in the app, in a department that works on clients).';

create unique index pm_modelli_uno_per_nuovi_clienti on public.pm_modelli (per_nuovi_clienti) where per_nuovi_clienti;

-- The template for new clients belongs to a department that works on clients;
-- choosing another one takes the flag from the old one. It stays active: a
-- switched-off template would open every new client's project without tasks,
-- silently. Chosen while switched off, it is offered again.
create or replace function public.pm_modello_per_nuovi_clienti()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.per_nuovi_clienti then
    if not exists (
      select 1 from public.pm_reparti r where r.id = new.reparto_id and r.progetti_con_cliente
    ) then
      raise exception 'Il modello dei nuovi clienti va in un reparto che lavora sui clienti, come Fitness Coaching'
        using errcode = '22023';
    end if;
    if not new.attivo then
      if tg_op = 'UPDATE' and old.per_nuovi_clienti and old.attivo then
        raise exception 'Il modello dei nuovi clienti resta attivo: per spegnerlo togli prima «Per i nuovi clienti» dal modello'
          using errcode = '22023';
      end if;
      new.attivo := true;
    end if;
    update public.pm_modelli m
    set per_nuovi_clienti = false
    where m.per_nuovi_clienti and m.id <> new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.pm_modello_per_nuovi_clienti() from public, anon, authenticated;

create trigger pm_modelli_per_nuovi_clienti
  before insert or update of per_nuovi_clienti, reparto_id, attivo on public.pm_modelli
  for each row execute function public.pm_modello_per_nuovi_clienti();

-- A department keeps "works on clients" while it holds client projects (as
-- before) or the template for new clients.
create or replace function public.pm_reparto_senza_clienti()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.progetti_con_cliente and not new.progetti_con_cliente then
    if exists (select 1 from public.pm_progetti p where p.reparto_id = new.id and p.client_id is not null) then
      raise exception 'Il reparto ha progetti legati a un cliente: togli prima il cliente da quei progetti'
        using errcode = '22023';
    end if;
    if exists (select 1 from public.pm_modelli m where m.reparto_id = new.id and m.per_nuovi_clienti) then
      raise exception 'Il reparto ha il modello dei nuovi clienti: togli prima la scelta da quel modello'
        using errcode = '22023';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. Projects: one per client, with its coach
-- ---------------------------------------------------------------------------
alter table public.pm_progetti
  add column coach_id uuid references public.profiles (id) on delete set null;

comment on column public.pm_progetti.coach_id is
  'The coach of a client''s project, a member of it. Picked with pm_scegli_coach.';

do $$
begin
  if exists (
    select 1 from public.pm_progetti p
    where p.client_id is not null
    group by p.client_id
    having count(*) > 1
  ) then
    raise exception 'Alcuni clienti hanno più di un progetto: scollega i doppioni prima di questa migration';
  end if;
end;
$$;

drop index public.pm_progetti_client_idx;
create unique index pm_progetti_un_progetto_per_cliente on public.pm_progetti (client_id) where client_id is not null;

-- The view of projects, with the coach (appended: every other column as before)
create or replace view public.v_pm_progetti
with (security_invoker = true)
as
select
  p.id,
  p.reparto_id,
  p.nome,
  p.descrizione,
  p.client_id,
  p.stato,
  p.data_inizio,
  p.data_fine,
  p.responsabile_id,
  p.created_at,
  count(t.id)::integer as task_totali,
  count(t.id) filter (where t.stato = 'completato')::integer as task_completati,
  count(t.id) filter (where t.stato <> 'completato' and t.scadenza < public.oggi())::integer as task_in_ritardo,
  case
    when count(t.id) = 0 then null
    else round(count(t.id) filter (where t.stato = 'completato')::numeric / count(t.id), 4)
  end as avanzamento,
  coalesce(p.data_fine < public.oggi() and p.stato in ('attivo', 'in_pausa'), false) as scaduto,
  public.pm_membro(p.id) as sono_membro,
  p.coach_id
from public.pm_progetti p
left join public.pm_task t on t.progetto_id = p.id
group by p.id;

revoke all on public.v_pm_progetti from anon;

-- ---------------------------------------------------------------------------
-- 3. Internal helpers (no grants: only triggers, migrations and the other
--    functions here call them)
-- ---------------------------------------------------------------------------

-- The client's coaching path: from the first start to the last end of its
-- "nuovo" and "rinnovo" sales. An upsell is not the path. Nulls without one.
create or replace function public.pm_periodo_percorso(p_client_id uuid, out inizio date, out fine date)
language sql
stable
security definer
set search_path = ''
as $$
  select min(s.data_inizio), max(s.data_fine)
  from public.sales s
  where s.client_id = p_client_id and s.tipo in ('nuovo', 'rinnovo');
$$;

-- The client's project follows the path. Without a path left (its sales
-- deleted) the project keeps the dates it had.
create or replace function public.pm_allinea_progetto_cliente(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inizio date;
  v_fine date;
begin
  if p_client_id is null then
    return;
  end if;
  select x.inizio, x.fine into v_inizio, v_fine from public.pm_periodo_percorso(p_client_id) x;
  if v_inizio is null then
    return;
  end if;

  update public.pm_progetti p
  set data_inizio = v_inizio,
      data_fine = v_fine
  where p.client_id = p_client_id
    and (p.data_inizio is distinct from v_inizio or p.data_fine is distinct from v_fine);
end;
$$;

-- A template applied to a project: its lists, then the tasks. An item without
-- a list stays outside any list, an item without days has no dates.
create or replace function public.pm_applica_modello(p_progetto uuid, p_modello uuid, p_inizio date, p_autore uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lista record;
  v_id_lista uuid;
begin
  for v_lista in
    select v.tasklist,
           min(v.ordine) as ordine,
           min(v.inizio_giorni) as da,
           max(v.inizio_giorni + v.durata_giorni) - 1 as a
    from public.pm_modelli_voci v
    where v.modello_id = p_modello and v.tasklist is not null
    group by v.tasklist
    order by min(v.ordine)
  loop
    insert into public.pm_tasklist (progetto_id, nome, ordine, data_inizio, data_fine, created_by)
    values (p_progetto, v_lista.tasklist, v_lista.ordine, p_inizio + v_lista.da, p_inizio + v_lista.a, p_autore)
    returning id into v_id_lista;

    insert into public.pm_task (
      progetto_id, tasklist_id, titolo, descrizione, ordine, data_inizio, scadenza, per_ruolo, created_by
    )
    select p_progetto, v_id_lista, v.titolo, v.descrizione, v.ordine,
           p_inizio + v.inizio_giorni, p_inizio + v.inizio_giorni + v.durata_giorni - 1, v.per_ruolo, p_autore
    from public.pm_modelli_voci v
    where v.modello_id = p_modello and v.tasklist = v_lista.tasklist
    order by v.ordine, v.created_at;
  end loop;

  insert into public.pm_task (
    progetto_id, titolo, descrizione, ordine, data_inizio, scadenza, per_ruolo, created_by
  )
  select p_progetto, v.titolo, v.descrizione, v.ordine,
         p_inizio + v.inizio_giorni, p_inizio + v.inizio_giorni + v.durata_giorni - 1, v.per_ruolo, p_autore
  from public.pm_modelli_voci v
  where v.modello_id = p_modello and v.tasklist is null
  order by v.ordine, v.created_at;
end;
$$;

-- The name of a client's project: the client's full name.
create or replace function public.pm_nome_progetto_cliente(p_nome text, p_cognome text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when length(x.titolo) < 2 then trim('Cliente ' || x.titolo) else x.titolo end
  from (select left(concat_ws(' ', nullif(trim(p_nome), ''), nullif(trim(p_cognome), '')), 120) as titolo) x;
$$;

-- The client's project: the one it has, or a new one named like the client,
-- in the department of the template for new clients and with its tasks (no
-- template: the first department that works on clients, no tasks). No
-- members: the coach is picked afterwards. Null when no department works on
-- clients or the client does not exist.
-- Made by the app, not by whoever cashed the instalment: project and tasks
-- have no author, as in the backfill (otherwise a closer cashing his sale
-- would be the author of the coach's tasks, and could change them as such).
-- The session is set aside while they are written; an error unwinds to a
-- savepoint or to the end of the transaction, which brings it back as well.
create or replace function public.pm_crea_progetto_cliente(p_client_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_progetto uuid;
  v_nome text;
  v_cognome text;
  v_inizio date;
  v_fine date;
  v_modello uuid;
  v_reparto uuid;
  v_claims text := current_setting('request.jwt.claims', true);
  v_sub text := current_setting('request.jwt.claim.sub', true);
begin
  select p.id into v_progetto from public.pm_progetti p where p.client_id = p_client_id;
  if v_progetto is not null then
    return v_progetto;
  end if;

  select c.nome, c.cognome into v_nome, v_cognome from public.clients c where c.id = p_client_id;
  if not found then
    return null;
  end if;

  select m.id, m.reparto_id into v_modello, v_reparto
  from public.pm_modelli m
  join public.pm_reparti r on r.id = m.reparto_id
  where m.per_nuovi_clienti and m.attivo and r.attivo and r.progetti_con_cliente;

  if v_reparto is null then
    select r.id into v_reparto
    from public.pm_reparti r
    where r.attivo and r.progetti_con_cliente
    order by r.ordine, r.nome
    limit 1;
  end if;
  if v_reparto is null then
    return null;
  end if;

  select x.inizio, x.fine into v_inizio, v_fine from public.pm_periodo_percorso(p_client_id) x;

  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);

  insert into public.pm_progetti (reparto_id, nome, client_id, data_inizio, data_fine, created_by)
  values (v_reparto, public.pm_nome_progetto_cliente(v_nome, v_cognome), p_client_id, v_inizio, v_fine, null)
  on conflict (client_id) where client_id is not null do nothing
  returning id into v_progetto;

  if v_progetto is null then
    -- made in the meantime by another transaction
    select p.id into v_progetto from public.pm_progetti p where p.client_id = p_client_id;
  elsif v_modello is not null then
    perform public.pm_applica_modello(v_progetto, v_modello, coalesce(v_inizio, public.oggi()), null);
  end if;

  perform set_config('request.jwt.claims', coalesce(v_claims, ''), true);
  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true);

  return v_progetto;
end;
$$;

revoke all on function public.pm_periodo_percorso(uuid) from public, anon, authenticated;
revoke all on function public.pm_allinea_progetto_cliente(uuid) from public, anon, authenticated;
revoke all on function public.pm_applica_modello(uuid, uuid, date, uuid) from public, anon, authenticated;
revoke all on function public.pm_crea_progetto_cliente(uuid) from public, anon, authenticated;
revoke all on function public.pm_nome_progetto_cliente(text, text) from public, anon, authenticated;

comment on function public.pm_crea_progetto_cliente(uuid) is
  'Internal: the client''s project, created with the tasks of the template for new clients when missing.';

-- ---------------------------------------------------------------------------
-- 4. pm_crea_progetto: the template through pm_applica_modello (undated items,
--    items without a list); a client has one project; a client's project
--    takes the dates of its path.
-- ---------------------------------------------------------------------------
create or replace function public.pm_crea_progetto(
  p_reparto_id uuid,
  p_nome text,
  p_descrizione text default null,
  p_client_id uuid default null,
  p_modello_id uuid default null,
  p_data_inizio date default null,
  p_data_fine date default null,
  p_membri uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
  v_livello public.pm_livello := public.pm_livello_corrente();
  v_inizio date := coalesce(p_data_inizio, public.oggi());
  v_fine date := p_data_fine;
  v_percorso_inizio date;
  v_percorso_fine date;
  v_progetto uuid;
begin
  if v_livello is null or v_livello = 'employee' then
    raise exception 'I progetti li crea un admin o un manager' using errcode = '42501';
  end if;
  if nullif(trim(p_nome), '') is null then
    raise exception 'Scrivi il nome del progetto' using errcode = '22023';
  end if;
  if not exists (select 1 from public.pm_reparti r where r.id = p_reparto_id and r.attivo) then
    raise exception 'Reparto non trovato' using errcode = '22023';
  end if;
  if p_client_id is not null and public.current_role() is distinct from 'admin' then
    raise exception 'Solo l''admin collega un cliente al progetto' using errcode = '42501';
  end if;
  if p_client_id is not null and exists (select 1 from public.pm_progetti p where p.client_id = p_client_id) then
    raise exception 'Questo cliente ha già il suo progetto: lo apri dalla scheda del cliente' using errcode = '22023';
  end if;
  if p_modello_id is not null and not exists (
    select 1 from public.pm_modelli m where m.id = p_modello_id and m.attivo
  ) then
    raise exception 'Modello non trovato' using errcode = '22023';
  end if;

  -- a client's project lasts as long as its path
  if p_client_id is not null then
    select x.inizio, x.fine into v_percorso_inizio, v_percorso_fine from public.pm_periodo_percorso(p_client_id) x;
    if v_percorso_inizio is not null then
      v_inizio := v_percorso_inizio;
      v_fine := v_percorso_fine;
    end if;
  end if;

  if v_fine is null and p_modello_id is not null then
    select v_inizio + max(v.inizio_giorni + v.durata_giorni) - 1 into v_fine
    from public.pm_modelli_voci v
    where v.modello_id = p_modello_id;
  end if;

  insert into public.pm_progetti (
    reparto_id, nome, descrizione, client_id, data_inizio, data_fine, responsabile_id, created_by
  )
  values (
    p_reparto_id, trim(p_nome), nullif(trim(p_descrizione), ''), p_client_id,
    v_inizio, v_fine, v_utente, v_utente
  )
  returning id into v_progetto;

  insert into public.pm_membri (progetto_id, profile_id, aggiunto_da)
  select v_progetto, p.id, v_utente
  from public.profiles p
  where p.attivo and (p.id = v_utente or p.id = any (coalesce(p_membri, '{}')))
  on conflict (progetto_id, profile_id) do nothing;

  if p_modello_id is not null then
    perform public.pm_applica_modello(v_progetto, p_modello_id, v_inizio, v_utente);
  end if;

  return v_progetto;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Project guard: the coach is a member; a client linked by hand gives the
--    project the dates of its path. security definer now: it reads the
--    members and the client's sales whatever the caller's RLS.
-- ---------------------------------------------------------------------------
create or replace function public.pm_progetti_guardia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inizio date;
  v_fine date;
begin
  if new.client_id is distinct from old.client_id
     and (select auth.uid()) is not null
     and public.current_role() is distinct from 'admin' then
    raise exception 'Solo l''admin collega un cliente al progetto' using errcode = '42501';
  end if;

  if new.responsabile_id is not null
     and new.responsabile_id is distinct from old.responsabile_id
     and not exists (
       select 1 from public.pm_membri m
       where m.progetto_id = new.id and m.profile_id = new.responsabile_id
     ) then
    raise exception 'Il responsabile deve far parte del progetto' using errcode = '22023';
  end if;

  if new.coach_id is not null
     and new.coach_id is distinct from old.coach_id
     and not exists (
       select 1 from public.pm_membri m
       where m.progetto_id = new.id and m.profile_id = new.coach_id
     ) then
    raise exception 'Il coach deve far parte del progetto' using errcode = '22023';
  end if;

  if new.client_id is not null and new.client_id is distinct from old.client_id then
    select x.inizio, x.fine into v_inizio, v_fine from public.pm_periodo_percorso(new.client_id) x;
    if v_inizio is not null then
      new.data_inizio := v_inizio;
      new.data_fine := v_fine;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.pm_progetti_guardia() from public, anon, authenticated;

-- A person leaves a project: their assignments there go, they stop being in
-- charge of it or its coach, their running timer on it stops.
create or replace function public.pm_membro_tolto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.pm_progetti p where p.id = old.progetto_id) then
    return null;
  end if;

  delete from public.pm_task_assegnatari a
  using public.pm_task t
  where t.id = a.task_id and t.progetto_id = old.progetto_id and a.profile_id = old.profile_id;

  update public.pm_progetti p
  set responsabile_id = case when p.responsabile_id = old.profile_id then null else p.responsabile_id end,
      coach_id = case when p.coach_id = old.profile_id then null else p.coach_id end
  where p.id = old.progetto_id
    and (p.responsabile_id = old.profile_id or p.coach_id = old.profile_id);

  -- the time worked so far is kept, the clock stops
  update public.pm_tempo t
  set fine = greatest(clock_timestamp(), t.inizio + interval '1 second')
  where t.progetto_id = old.progetto_id and t.profile_id = old.profile_id
    and t.inizio is not null and t.fine is null;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. "Percorso cliente": the 8 buckets of a client's path, the template for
--    new clients. Projects already opened from it keep their tasks.
-- ---------------------------------------------------------------------------
do $$
declare
  v_reparto uuid;
  v_modello uuid;
begin
  select r.id into v_reparto
  from public.pm_reparti r
  where r.progetti_con_cliente
  order by (r.nome = 'Fitness Coaching') desc, r.ordine, r.nome
  limit 1;
  if v_reparto is null then
    return;
  end if;

  select m.id into v_modello
  from public.pm_modelli m
  where m.reparto_id = v_reparto and m.nome = 'Percorso cliente'
  order by m.created_at
  limit 1;
  if v_modello is null then
    insert into public.pm_modelli (reparto_id, nome)
    values (v_reparto, 'Percorso cliente')
    returning id into v_modello;
  end if;

  update public.pm_modelli
  set descrizione = 'Le attività del coach su ogni cliente, aperte per tutto il percorso: ci si registra il tempo.',
      attivo = true,
      per_nuovi_clienti = true
  where id = v_modello;

  delete from public.pm_modelli_voci where modello_id = v_modello;

  insert into public.pm_modelli_voci (
    modello_id, tasklist, titolo, descrizione, ordine, inizio_giorni, durata_giorni, per_ruolo
  )
  select v_modello, null, v.titolo, v.descrizione, v.ordine, null, null, v.per_ruolo::public.app_role
  from (values
    (1, 'Call di onboarding', 'La prima call: obiettivi, punto di partenza e come lavoriamo insieme.', null),
    (2, 'Analisi e strategia iniziale', 'Questionario, foto e misure di partenza: la strategia del percorso.', null),
    (3, 'Programmazione allenamento (creazione e aggiornamenti)', 'La scheda di allenamento e ogni suo aggiornamento.', null),
    (4, 'Programmazione alimentare (creazione e aggiornamenti)', 'Il piano alimentare e ogni suo aggiornamento.', 'nutrizione'),
    (5, 'Revisione video', 'I video degli esercizi mandati dal cliente, con le correzioni.', null),
    (6, 'Call di check', 'Le call periodiche sui progressi.', null),
    (7, 'Assistenza chat', 'Le risposte al cliente in chat.', null),
    (8, 'Altre attività', 'Tutto il resto del lavoro sul cliente.', null)
  ) as v(ordine, titolo, descrizione, per_ruolo);
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Triggers: the first cashed instalment creates the project, the sales move
--    its dates
-- ---------------------------------------------------------------------------

-- Only the first instalment cashed on a path (nuovo or rinnovo) that is not
-- over yet, and only when the client has no project: a project deleted on
-- purpose does not come back at the next instalment, only with a new path.
-- Several instalments cashed in one statement: only the earliest counts.
-- "First" is read from the instalments cashed now: the cash of the first one
-- undone and done again, or another one cashed with an earlier date, counts as
-- a first instalment again (and brings back a project deleted on purpose).
-- Nothing here ever blocks the cash: a project that cannot be made is a warning.
create or replace function public.pm_progetto_da_incasso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente uuid;
begin
  if tg_op = 'UPDATE' and old.stato = 'incassata' then
    return null;
  end if;

  select s.client_id into v_cliente
  from public.sales s
  where s.id = new.sale_id
    and s.tipo in ('nuovo', 'rinnovo')
    and s.data_fine >= public.oggi();
  if v_cliente is null then
    return null;
  end if;

  if exists (
    select 1 from public.payments p
    where p.sale_id = new.sale_id
      and p.id <> new.id
      and p.stato = 'incassata'
      and (p.incassato_il, p.numero_rata, p.id) < (new.incassato_il, new.numero_rata, new.id)
  ) then
    return null;
  end if;

  if exists (select 1 from public.pm_progetti p where p.client_id = v_cliente) then
    return null;
  end if;

  begin
    perform public.pm_crea_progetto_cliente(v_cliente);
  exception when others then
    raise warning 'Progetto del cliente % non creato: %', v_cliente, sqlerrm;
  end;

  return null;
end;
$$;

revoke all on function public.pm_progetto_da_incasso() from public, anon, authenticated;

create trigger payments_progetto_cliente
  after insert or update of stato on public.payments
  for each row
  when (new.stato = 'incassata')
  execute function public.pm_progetto_da_incasso();

-- A sale added (a renewal extends the path), its dates or type changed, a path
-- interrupted (interrompi_percorso moves data_fine) or a sale deleted: the
-- client's project takes the dates of the path again.
-- A sale corrected into a path after its first instalment was cashed (an
-- upsell that was a new sale, a past end fixed, the right client chosen):
-- the client's project opens now, as it would have at that instalment.
create or replace function public.pm_progetto_segue_vendite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.pm_allinea_progetto_cliente(old.client_id);
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.client_id is distinct from old.client_id) then
    perform public.pm_allinea_progetto_cliente(new.client_id);
  end if;

  if tg_op = 'UPDATE'
     and new.tipo in ('nuovo', 'rinnovo')
     and new.data_fine >= public.oggi()
     and (
       old.tipo not in ('nuovo', 'rinnovo')
       or coalesce(old.data_fine < public.oggi(), true)
       or old.client_id is distinct from new.client_id
     )
     and exists (select 1 from public.payments x where x.sale_id = new.id and x.stato = 'incassata')
     and not exists (select 1 from public.pm_progetti p where p.client_id = new.client_id) then
    begin
      perform public.pm_crea_progetto_cliente(new.client_id);
    exception when others then
      raise warning 'Progetto del cliente % non creato: %', new.client_id, sqlerrm;
    end;
  end if;

  return null;
end;
$$;

revoke all on function public.pm_progetto_segue_vendite() from public, anon, authenticated;

create trigger sales_progetto_cliente
  after insert or delete or update of data_inizio, data_fine, tipo, client_id on public.sales
  for each row execute function public.pm_progetto_segue_vendite();

-- ---------------------------------------------------------------------------
-- 8. "Coach del cliente": one tap by who manages the project. security
--    invoker: RLS on members, assignees and the project decides; the check up
--    front only gives a readable message. The coach joins and takes the
--    client's top-level tasks that are still free (nobody on them) or were
--    the previous coach's; a task of a role goes to an active person with
--    that role (one already in the project first), else to the coach. Tasks
--    other people work on stay theirs. A coach replaced leaves his tasks and
--    stays a member (his time stays where it is).
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

comment on function public.pm_scegli_coach(uuid, uuid) is
  'Who manages a client''s project picks its coach: member, assignee of the free tasks and of the previous coach''s (role tasks to that role when someone has it).';

revoke all on function public.pm_scegli_coach(uuid, uuid) from public, anon;
grant execute on function public.pm_scegli_coach(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 9. A client renamed: its project follows, unless it was renamed by hand
-- ---------------------------------------------------------------------------
create or replace function public.pm_progetto_segue_cliente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pm_progetti p
  set nome = public.pm_nome_progetto_cliente(new.nome, new.cognome)
  where p.client_id = new.id
    and p.nome = public.pm_nome_progetto_cliente(old.nome, old.cognome)
    and p.nome <> public.pm_nome_progetto_cliente(new.nome, new.cognome);
  return null;
end;
$$;

revoke all on function public.pm_progetto_segue_cliente() from public, anon, authenticated;

create trigger clients_progetto_nome
  after update of nome, cognome on public.clients
  for each row
  when (old.nome is distinct from new.nome or old.cognome is distinct from new.cognome)
  execute function public.pm_progetto_segue_cliente();

-- ---------------------------------------------------------------------------
-- 10. Two profiles merged: the target takes over as coach and as the one in
--     charge where both were members. Before, dropping the duplicate
--     membership (pm_membro_tolto) emptied both before the foreign keys
--     moved. Everything else as in 20260929100000_task_assegnatari.sql.
-- ---------------------------------------------------------------------------
create or replace function public.unisci_profili(p_da uuid, p_a uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  r record;
begin
  if not public.is_admin() then
    raise exception 'Solo l''admin unisce i profili' using errcode = '42501';
  end if;
  if p_da = p_a then
    raise exception 'Scegli due profili diversi' using errcode = '22023';
  end if;
  if p_da = (select auth.uid()) then
    raise exception 'Il tuo account non si può unire a un altro' using errcode = '42501';
  end if;
  select p.email into v_email from public.profiles p where p.id = p_da;
  if v_email is null or not exists (select 1 from public.profiles p where p.id = p_a) then
    raise exception 'Profilo non trovato' using errcode = '22023';
  end if;

  -- what both have: the target's copy stays
  delete from public.setter_daily_reports d
  where d.setter_id = p_da
    and exists (select 1 from public.setter_daily_reports x where x.setter_id = p_a and x.data = d.data);
  insert into public.pm_task_assegnatari (task_id, profile_id, created_at, created_by)
  select a.task_id, p_a, a.created_at, a.created_by
  from public.pm_task_assegnatari a
  join public.pm_task t on t.id = a.task_id
  where a.profile_id = p_da
    and exists (select 1 from public.pm_membri x where x.profile_id = p_a and x.progetto_id = t.progetto_id)
  on conflict (task_id, profile_id) do nothing;
  update public.pm_progetti p
  set coach_id = case when p.coach_id = p_da then p_a else p.coach_id end,
      responsabile_id = case when p.responsabile_id = p_da then p_a else p.responsabile_id end
  where (p.coach_id = p_da or p.responsabile_id = p_da)
    and exists (select 1 from public.pm_membri x where x.profile_id = p_a and x.progetto_id = p.id);
  delete from public.pm_membri m
  where m.profile_id = p_da
    and exists (select 1 from public.pm_membri x where x.profile_id = p_a and x.progetto_id = m.progetto_id);
  update public.pm_membri set profile_id = p_a where profile_id = p_da;
  -- one set of commission rules per person: the target's, if it has any
  if exists (select 1 from public.commission_rules where profile_id = p_a) then
    delete from public.commission_rules where profile_id = p_da;
  end if;
  -- one running timer per person
  update public.pm_tempo set fine = greatest(clock_timestamp(), inizio + interval '1 second')
  where profile_id = p_da and inizio is not null and fine is null;

  -- every column pointing to a person moves to the target
  for r in
    select c.conrelid::regclass as tabella, a.attname as colonna
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and c.confrelid = 'public.profiles'::regclass
  loop
    execute format('update %s set %I = $2 where %I = $1', r.tabella, r.colonna, r.colonna) using p_da, p_a;
  end loop;

  delete from public.invites where email = lower(v_email);
  delete from auth.users where id = p_da;
end;
$$;

revoke all on function public.unisci_profili(uuid, uuid) from public, anon;
grant execute on function public.unisci_profili(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Deleting a client: the preview counts its project too, which stays
--     without the client. Everything else as in 20260928150000_controllo_admin.sql.
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
        'progetti', (select count(*) from public.pm_progetti where client_id = p_id)
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

revoke all on function public.anteprima_eliminazione(text, uuid) from public, anon;
grant execute on function public.anteprima_eliminazione(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 12. Backfill, once: every client on a paid path today. "On a path": a nuovo
--    or rinnovo sale in progress today (attivo or in_scadenza in
--    v_client_status, counted on the path only), or paid and not started yet
--    (the view calls that "scaduto"). "Paid": a nuovo or rinnovo sale with a
--    cashed instalment. An upsell is never the path: a client with upsells
--    only, or whose coaching is over and only an upsell is running, gets none
--    (the same rule as the trigger above).
-- ---------------------------------------------------------------------------
create or replace function public.pm_crea_progetti_clienti_attivi()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente uuid;
  v_creati integer := 0;
begin
  for v_cliente in
    select c.id
    from public.clients c
    where not exists (select 1 from public.pm_progetti p where p.client_id = c.id)
      -- a paying client: a path with a cashed instalment
      and exists (
        select 1 from public.sales s
        where s.client_id = c.id
          and s.tipo in ('nuovo', 'rinnovo')
          and exists (select 1 from public.payments x where x.sale_id = s.id and x.stato = 'incassata')
      )
      -- on a path today: in progress, or paid and starting later
      and exists (
        select 1 from public.sales s
        where s.client_id = c.id
          and s.tipo in ('nuovo', 'rinnovo')
          and s.data_fine >= public.oggi()
          and (
            s.data_inizio <= public.oggi()
            or exists (select 1 from public.payments x where x.sale_id = s.id and x.stato = 'incassata')
          )
      )
    order by c.created_at, c.id
  loop
    if public.pm_crea_progetto_cliente(v_cliente) is not null then
      v_creati := v_creati + 1;
    end if;
  end loop;
  return v_creati;
end;
$$;

revoke all on function public.pm_crea_progetti_clienti_attivi() from public, anon, authenticated;

comment on function public.pm_crea_progetti_clienti_attivi() is
  'Internal: the project of every client on a paid path that has none. Run once by its migration.';

select public.pm_crea_progetti_clienti_attivi();
