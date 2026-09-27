-- Project management: the second area of the app shell (CLAUDE.md section 3,
-- requested by Dany on 27/09/2026). Departments, projects, task lists
-- (milestones), tasks, members, self-declared time and dated notes.
--
-- Permission levels, separate from app_role (which is the job): every person
-- has livello_pm admin, manager or employee. The app admin is always PM admin.
--   admin     every department and project, departments and templates
--   manager   creates projects; manages the projects they are a member of
--   employee  sees the projects they are a member of, adds tasks, works the
--             tasks assigned to them, tracks their own time, writes notes
-- Clients stay in public.clients (never duplicated): a project may point to one.

create type public.pm_livello as enum ('admin', 'manager', 'employee');
create type public.pm_stato_progetto as enum ('attivo', 'in_pausa', 'completato', 'archiviato');
create type public.pm_stato_task as enum ('da_fare', 'in_corso', 'in_revisione', 'completato');
create type public.pm_priorita as enum ('bassa', 'media', 'alta');

alter table public.profiles
  add column livello_pm public.pm_livello not null default 'employee';

comment on column public.profiles.livello_pm is
  'Project management permission level. The app admin is PM admin whatever this says.';

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.pm_reparti (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique check (length(trim(nome)) between 2 and 60),
  descrizione text,
  ordine integer not null default 0,
  attivo boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pm_progetti (
  id uuid primary key default gen_random_uuid(),
  reparto_id uuid not null references public.pm_reparti (id),
  nome text not null check (length(trim(nome)) between 2 and 120),
  descrizione text,
  client_id uuid references public.clients (id) on delete set null,
  stato public.pm_stato_progetto not null default 'attivo',
  data_inizio date,
  data_fine date,
  responsabile_id uuid references public.profiles (id),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pm_progetti_date check (data_fine is null or data_inizio is null or data_fine >= data_inizio)
);

create index pm_progetti_reparto_idx on public.pm_progetti (reparto_id);
create index pm_progetti_client_idx on public.pm_progetti (client_id);

create table public.pm_membri (
  id uuid primary key default gen_random_uuid(),
  progetto_id uuid not null references public.pm_progetti (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  aggiunto_da uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (progetto_id, profile_id)
);

create index pm_membri_profile_idx on public.pm_membri (profile_id);

create table public.pm_tasklist (
  id uuid primary key default gen_random_uuid(),
  progetto_id uuid not null references public.pm_progetti (id) on delete cascade,
  nome text not null check (length(trim(nome)) between 1 and 120),
  descrizione text,
  ordine integer not null default 0,
  data_inizio date,
  data_fine date,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pm_tasklist_date check (data_fine is null or data_inizio is null or data_fine >= data_inizio)
);

create index pm_tasklist_progetto_idx on public.pm_tasklist (progetto_id);

create table public.pm_task (
  id uuid primary key default gen_random_uuid(),
  progetto_id uuid not null references public.pm_progetti (id) on delete cascade,
  tasklist_id uuid references public.pm_tasklist (id) on delete cascade,
  parent_id uuid references public.pm_task (id) on delete cascade,
  titolo text not null check (length(trim(titolo)) between 1 and 200),
  descrizione text,
  stato public.pm_stato_task not null default 'da_fare',
  priorita public.pm_priorita not null default 'media',
  assegnatario_id uuid references public.profiles (id),
  data_inizio date,
  scadenza date,
  stima_minuti integer check (stima_minuti is null or stima_minuti > 0),
  ordine integer not null default 0,
  completato_il timestamptz,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pm_task_date check (scadenza is null or data_inizio is null or scadenza >= data_inizio)
);

create index pm_task_progetto_idx on public.pm_task (progetto_id);
create index pm_task_tasklist_idx on public.pm_task (tasklist_id);
create index pm_task_assegnatario_idx on public.pm_task (assegnatario_id);

-- Templates: what a new project of a department starts with
create table public.pm_modelli (
  id uuid primary key default gen_random_uuid(),
  reparto_id uuid references public.pm_reparti (id) on delete cascade,
  nome text not null check (length(trim(nome)) between 2 and 120),
  descrizione text,
  attivo boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.pm_modelli_voci (
  id uuid primary key default gen_random_uuid(),
  modello_id uuid not null references public.pm_modelli (id) on delete cascade,
  tasklist text not null check (length(trim(tasklist)) between 1 and 120),
  titolo text not null check (length(trim(titolo)) between 1 and 200),
  descrizione text,
  ordine integer not null default 0,
  -- dates of the created task, counted from the project start
  inizio_giorni integer not null default 0 check (inizio_giorni >= 0),
  durata_giorni integer not null default 7 check (durata_giorni > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pm_modelli_voci_modello_idx on public.pm_modelli_voci (modello_id);

-- Self-declared time: a running timer, a stopped timer, or minutes entered afterwards
create table public.pm_tempo (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  progetto_id uuid not null references public.pm_progetti (id) on delete cascade,
  task_id uuid references public.pm_task (id) on delete set null,
  data date not null,
  inizio timestamptz,
  fine timestamptz,
  minuti integer check (minuti is null or (minuti > 0 and minuti <= 1440)),
  nota text check (nota is null or length(nota) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pm_tempo_coerente check (
    (inizio is not null and fine is null and minuti is null)
    or (inizio is not null and fine is not null and fine > inizio and minuti is not null)
    or (inizio is null and fine is null and minuti is not null)
  )
);

create index pm_tempo_profile_data_idx on public.pm_tempo (profile_id, data);
create index pm_tempo_progetto_idx on public.pm_tempo (progetto_id);
-- one running timer per person
create unique index pm_tempo_un_timer on public.pm_tempo (profile_id)
  where inizio is not null and fine is null;

-- Notes of a project, shown grouped by day
create table public.pm_note (
  id uuid primary key default gen_random_uuid(),
  progetto_id uuid not null references public.pm_progetti (id) on delete cascade,
  autore_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  data date not null default public.oggi(),
  testo text not null check (length(trim(testo)) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index pm_note_progetto_data_idx on public.pm_note (progetto_id, data desc);

-- updated_at everywhere
create trigger pm_reparti_set_updated_at before update on public.pm_reparti
  for each row execute function public.set_updated_at();
create trigger pm_progetti_set_updated_at before update on public.pm_progetti
  for each row execute function public.set_updated_at();
create trigger pm_membri_set_updated_at before update on public.pm_membri
  for each row execute function public.set_updated_at();
create trigger pm_tasklist_set_updated_at before update on public.pm_tasklist
  for each row execute function public.set_updated_at();
create trigger pm_task_set_updated_at before update on public.pm_task
  for each row execute function public.set_updated_at();
create trigger pm_modelli_set_updated_at before update on public.pm_modelli
  for each row execute function public.set_updated_at();
create trigger pm_modelli_voci_set_updated_at before update on public.pm_modelli_voci
  for each row execute function public.set_updated_at();
create trigger pm_tempo_set_updated_at before update on public.pm_tempo
  for each row execute function public.set_updated_at();
create trigger pm_note_set_updated_at before update on public.pm_note
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Permission helpers (security definer: they read membership without
-- recursing into the policies that call them)
-- ---------------------------------------------------------------------------
create or replace function public.pm_livello_corrente()
returns public.pm_livello
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.current_role() = 'admin' then 'admin'::public.pm_livello
    else (
      select p.livello_pm from public.profiles p
      where p.id = (select auth.uid()) and p.attivo
    )
  end;
$$;

create or replace function public.pm_membro(p_progetto uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pm_membri m
    where m.progetto_id = p_progetto and m.profile_id = (select auth.uid())
  );
$$;

create or replace function public.pm_puo_vedere(p_progetto uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.pm_livello_corrente() = 'admin'
    or (public.pm_livello_corrente() is not null and public.pm_membro(p_progetto)),
    false
  );
$$;

create or replace function public.pm_puo_gestire(p_progetto uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    public.pm_livello_corrente() = 'admin'
    or (public.pm_livello_corrente() = 'manager' and public.pm_membro(p_progetto)),
    false
  );
$$;

revoke all on function public.pm_livello_corrente() from public, anon;
revoke all on function public.pm_membro(uuid) from public, anon;
revoke all on function public.pm_puo_vedere(uuid) from public, anon;
revoke all on function public.pm_puo_gestire(uuid) from public, anon;
grant execute on function public.pm_livello_corrente() to authenticated;
grant execute on function public.pm_membro(uuid) to authenticated;
grant execute on function public.pm_puo_vedere(uuid) to authenticated;
grant execute on function public.pm_puo_gestire(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Consistency triggers
-- ---------------------------------------------------------------------------

-- A task stays in its project: its list, its parent and its assignee belong there.
create or replace function public.pm_task_coerenza()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tasklist_id is not null and not exists (
    select 1 from public.pm_tasklist l where l.id = new.tasklist_id and l.progetto_id = new.progetto_id
  ) then
    raise exception 'La lista non appartiene a questo progetto' using errcode = '22023';
  end if;

  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'Un task non può essere sotto-task di sé stesso' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.pm_task t
      where t.id = new.parent_id and t.progetto_id = new.progetto_id and t.parent_id is null
    ) then
      raise exception 'Il task principale deve essere dello stesso progetto e non essere a sua volta un sotto-task'
        using errcode = '22023';
    end if;
  end if;

  if new.assegnatario_id is not null and not exists (
    select 1 from public.pm_membri m
    where m.progetto_id = new.progetto_id and m.profile_id = new.assegnatario_id
  ) then
    raise exception 'La persona assegnata non fa parte del progetto' using errcode = '22023';
  end if;

  if new.stato = 'completato' and (tg_op = 'INSERT' or old.stato is distinct from 'completato') then
    new.completato_il := now();
  elsif new.stato <> 'completato' then
    new.completato_il := null;
  end if;

  return new;
end;
$$;

create trigger pm_task_coerenza
  before insert or update on public.pm_task
  for each row execute function public.pm_task_coerenza();

-- Time entries: the day in Europe/Rome, the minutes of a stopped timer, a task of the same project.
create or replace function public.pm_tempo_coerenza()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.inizio is not null and (tg_op = 'INSERT' or new.inizio is distinct from old.inizio) then
    new.data := (new.inizio at time zone 'Europe/Rome')::date;
  end if;

  if new.inizio is not null and new.fine is not null then
    new.minuti := greatest(1, least(1440, round(extract(epoch from (new.fine - new.inizio)) / 60)::integer));
  end if;

  if new.task_id is not null and not exists (
    select 1 from public.pm_task t where t.id = new.task_id and t.progetto_id = new.progetto_id
  ) then
    raise exception 'Il task non appartiene a questo progetto' using errcode = '22023';
  end if;

  if new.data > public.oggi() then
    raise exception 'Il tempo si registra per oggi o per un giorno passato' using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger pm_tempo_coerenza
  before insert or update on public.pm_tempo
  for each row execute function public.pm_tempo_coerenza();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.pm_reparti enable row level security;
alter table public.pm_progetti enable row level security;
alter table public.pm_membri enable row level security;
alter table public.pm_tasklist enable row level security;
alter table public.pm_task enable row level security;
alter table public.pm_modelli enable row level security;
alter table public.pm_modelli_voci enable row level security;
alter table public.pm_tempo enable row level security;
alter table public.pm_note enable row level security;

revoke all on public.pm_reparti, public.pm_progetti, public.pm_membri, public.pm_tasklist,
  public.pm_task, public.pm_modelli, public.pm_modelli_voci, public.pm_tempo, public.pm_note
  from anon;

-- Departments and templates: readable by every active person, written by the PM admin
create policy pm_reparti_select on public.pm_reparti for select to authenticated
  using (public.pm_livello_corrente() is not null);
create policy pm_reparti_write on public.pm_reparti for all to authenticated
  using (public.pm_livello_corrente() = 'admin')
  with check (public.pm_livello_corrente() = 'admin');

create policy pm_modelli_select on public.pm_modelli for select to authenticated
  using (public.pm_livello_corrente() is not null);
create policy pm_modelli_write on public.pm_modelli for all to authenticated
  using (public.pm_livello_corrente() = 'admin')
  with check (public.pm_livello_corrente() = 'admin');

create policy pm_modelli_voci_select on public.pm_modelli_voci for select to authenticated
  using (public.pm_livello_corrente() is not null);
create policy pm_modelli_voci_write on public.pm_modelli_voci for all to authenticated
  using (public.pm_livello_corrente() = 'admin')
  with check (public.pm_livello_corrente() = 'admin');

-- Projects: created through pm_crea_progetto (the creator becomes a member in
-- the same transaction), updated by who manages them, deleted by the admin
create policy pm_progetti_select on public.pm_progetti for select to authenticated
  using (public.pm_puo_vedere(id));
create policy pm_progetti_update on public.pm_progetti for update to authenticated
  using (public.pm_puo_gestire(id))
  with check (public.pm_puo_gestire(id));
create policy pm_progetti_delete on public.pm_progetti for delete to authenticated
  using (public.pm_livello_corrente() = 'admin');

-- Members see each other; who manages the project adds and removes people
create policy pm_membri_select on public.pm_membri for select to authenticated
  using (public.pm_puo_vedere(progetto_id));
create policy pm_membri_insert on public.pm_membri for insert to authenticated
  with check (public.pm_puo_gestire(progetto_id));
create policy pm_membri_delete on public.pm_membri for delete to authenticated
  using (public.pm_puo_gestire(progetto_id));

-- Lists (milestones): managed by who manages the project
create policy pm_tasklist_select on public.pm_tasklist for select to authenticated
  using (public.pm_puo_vedere(progetto_id));
create policy pm_tasklist_write on public.pm_tasklist for all to authenticated
  using (public.pm_puo_gestire(progetto_id))
  with check (public.pm_puo_gestire(progetto_id));

-- Tasks: every member adds them; the assignee and the author work on theirs;
-- who manages the project does everything
create policy pm_task_select on public.pm_task for select to authenticated
  using (public.pm_puo_vedere(progetto_id));
create policy pm_task_insert on public.pm_task for insert to authenticated
  with check (public.pm_puo_vedere(progetto_id));
create policy pm_task_update on public.pm_task for update to authenticated
  using (
    public.pm_puo_gestire(progetto_id)
    or (
      public.pm_puo_vedere(progetto_id)
      and (assegnatario_id = (select auth.uid()) or created_by = (select auth.uid()))
    )
  )
  with check (public.pm_puo_vedere(progetto_id));
create policy pm_task_delete on public.pm_task for delete to authenticated
  using (
    public.pm_puo_gestire(progetto_id)
    or (public.pm_puo_vedere(progetto_id) and created_by = (select auth.uid()))
  );

-- Time: everyone writes their own, on projects they can see. Who manages a
-- project reads the time spent on it; the admin reads everything.
create policy pm_tempo_select on public.pm_tempo for select to authenticated
  using (
    profile_id = (select auth.uid())
    or public.pm_puo_gestire(progetto_id)
  );
create policy pm_tempo_insert on public.pm_tempo for insert to authenticated
  with check (profile_id = (select auth.uid()) and public.pm_puo_vedere(progetto_id));
create policy pm_tempo_update on public.pm_tempo for update to authenticated
  using (profile_id = (select auth.uid()) or public.pm_livello_corrente() = 'admin')
  with check (
    (profile_id = (select auth.uid()) and public.pm_puo_vedere(progetto_id))
    or public.pm_livello_corrente() = 'admin'
  );
create policy pm_tempo_delete on public.pm_tempo for delete to authenticated
  using (profile_id = (select auth.uid()) or public.pm_livello_corrente() = 'admin');

-- Notes: every member reads and writes; the author (or the admin) edits and deletes
create policy pm_note_select on public.pm_note for select to authenticated
  using (public.pm_puo_vedere(progetto_id));
create policy pm_note_insert on public.pm_note for insert to authenticated
  with check (autore_id = (select auth.uid()) and public.pm_puo_vedere(progetto_id));
create policy pm_note_update on public.pm_note for update to authenticated
  using (autore_id = (select auth.uid()) or public.pm_livello_corrente() = 'admin')
  with check (public.pm_puo_vedere(progetto_id));
create policy pm_note_delete on public.pm_note for delete to authenticated
  using (autore_id = (select auth.uid()) or public.pm_livello_corrente() = 'admin');

-- ---------------------------------------------------------------------------
-- RPC: create a project, its members and, from a template, its lists and tasks
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
  v_progetto uuid;
  v_lista record;
  v_id_lista uuid;
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
  -- clients belong to Economics: only the app admin links one
  if p_client_id is not null and public.current_role() is distinct from 'admin' then
    raise exception 'Solo l''admin collega un cliente al progetto' using errcode = '42501';
  end if;
  if p_modello_id is not null and not exists (
    select 1 from public.pm_modelli m where m.id = p_modello_id and m.attivo
  ) then
    raise exception 'Modello non trovato' using errcode = '22023';
  end if;

  insert into public.pm_progetti (
    reparto_id, nome, descrizione, client_id, data_inizio, data_fine, responsabile_id, created_by
  )
  values (
    p_reparto_id, trim(p_nome), nullif(trim(p_descrizione), ''), p_client_id,
    v_inizio, p_data_fine, v_utente, v_utente
  )
  returning id into v_progetto;

  -- the creator plus the chosen active people
  insert into public.pm_membri (progetto_id, profile_id, aggiunto_da)
  select v_progetto, p.id, v_utente
  from public.profiles p
  where p.attivo and (p.id = v_utente or p.id = any (coalesce(p_membri, '{}')))
  on conflict (progetto_id, profile_id) do nothing;

  if p_modello_id is not null then
    for v_lista in
      select v.tasklist,
             min(v.ordine) as ordine,
             min(v.inizio_giorni) as da,
             max(v.inizio_giorni + v.durata_giorni) - 1 as a
      from public.pm_modelli_voci v
      where v.modello_id = p_modello_id
      group by v.tasklist
      order by min(v.ordine)
    loop
      insert into public.pm_tasklist (progetto_id, nome, ordine, data_inizio, data_fine, created_by)
      values (v_progetto, v_lista.tasklist, v_lista.ordine, v_inizio + v_lista.da, v_inizio + v_lista.a, v_utente)
      returning id into v_id_lista;

      insert into public.pm_task (
        progetto_id, tasklist_id, titolo, descrizione, ordine, data_inizio, scadenza, created_by
      )
      select v_progetto, v_id_lista, v.titolo, v.descrizione, v.ordine,
             v_inizio + v.inizio_giorni, v_inizio + v.inizio_giorni + v.durata_giorni - 1, v_utente
      from public.pm_modelli_voci v
      where v.modello_id = p_modello_id and v.tasklist = v_lista.tasklist
      order by v.ordine;
    end loop;
  end if;

  return v_progetto;
end;
$$;

revoke all on function public.pm_crea_progetto(uuid, text, text, uuid, uuid, date, date, uuid[]) from public, anon;
grant execute on function public.pm_crea_progetto(uuid, text, text, uuid, uuid, date, date, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- RPC: timer. Starting one stops the one already running (one at a time).
-- security invoker: RLS on pm_tempo decides, these only save round trips.
-- ---------------------------------------------------------------------------
create or replace function public.pm_avvia_timer(
  p_progetto_id uuid,
  p_task_id uuid default null,
  p_nota text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.pm_puo_vedere(p_progetto_id) then
    raise exception 'Progetto non trovato o non tuo' using errcode = '42501';
  end if;

  -- clock_timestamp, not now(): inside one transaction now() does not move
  update public.pm_tempo
  set fine = greatest(clock_timestamp(), inizio + interval '1 second')
  where profile_id = (select auth.uid()) and inizio is not null and fine is null;

  insert into public.pm_tempo (profile_id, progetto_id, task_id, data, inizio, nota)
  values ((select auth.uid()), p_progetto_id, p_task_id, public.oggi(), clock_timestamp(), nullif(trim(p_nota), ''))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.pm_ferma_timer(p_nota text default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  update public.pm_tempo
  set fine = greatest(clock_timestamp(), inizio + interval '1 second'),
      nota = coalesce(nullif(trim(p_nota), ''), nota)
  where profile_id = (select auth.uid()) and inizio is not null and fine is null
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.pm_avvia_timer(uuid, uuid, text) from public, anon;
revoke all on function public.pm_ferma_timer(text) from public, anon;
grant execute on function public.pm_avvia_timer(uuid, uuid, text) to authenticated;
grant execute on function public.pm_ferma_timer(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Defaults: departments and the client path template (editable by the admin)
-- ---------------------------------------------------------------------------
insert into public.pm_reparti (nome, descrizione, ordine) values
  ('Fitness Coaching', 'I percorsi dei clienti: onboarding, programmazione, check.', 1),
  ('Contenuti e Video', 'Reel, video, montaggi e calendario dei contenuti.', 2),
  ('Vendite e Marketing', 'Setting, campagne, funnel e materiali di vendita.', 3),
  ('Amministrazione', 'Fatture, commercialista, strumenti e processi interni.', 4);

with modello as (
  insert into public.pm_modelli (reparto_id, nome, descrizione)
  select r.id, 'Percorso cliente', 'Le attività di ogni cliente di Percorso Alpha, dall’onboarding al rinnovo.'
  from public.pm_reparti r where r.nome = 'Fitness Coaching'
  returning id
)
insert into public.pm_modelli_voci (modello_id, tasklist, titolo, ordine, inizio_giorni, durata_giorni)
select modello.id, v.tasklist, v.titolo, v.ordine, v.inizio, v.durata
from modello, (values
  ('Onboarding', 'Questionario iniziale e obiettivi', 1, 0, 2),
  ('Onboarding', 'Invio accessi e materiali di benvenuto', 2, 0, 2),
  ('Onboarding', 'Call di onboarding', 3, 1, 3),
  ('Onboarding', 'Scrittura programmazione', 4, 2, 5),
  ('Percorso', 'Assistenza chat', 10, 0, 90),
  ('Percorso', 'Revisione video settimanale', 11, 7, 77),
  ('Percorso', 'Call di check', 12, 14, 7),
  ('Percorso', 'Aggiornamento programmazione', 13, 28, 7),
  ('Percorso', 'Call di check di metà percorso', 14, 42, 7),
  ('Percorso', 'Aggiornamento programmazione di metà percorso', 15, 45, 7),
  ('Chiusura e rinnovo', 'Call di rinnovo', 20, 75, 7),
  ('Chiusura e rinnovo', 'Raccolta feedback e testimonianza', 21, 84, 7)
) as v(tasklist, titolo, ordine, inizio, durata);

-- Live updates for the timer and the task lists
alter publication supabase_realtime add table public.pm_task, public.pm_tempo;
