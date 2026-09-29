-- A task can be assigned to more than one person (Dany, 29/09/2026: "un task può
-- essere assegnato a più persone, tienilo da conto"). The single column
-- pm_task.assegnatario_id becomes the table pm_task_assegnatari, one row per
-- task and person. The rules stay those of the column:
--   every assignee is a member of the task's project;
--   leaving a project drops your assignments there;
--   who may change a task (who manages the project, its author, one of its
--   assignees) manages its assignees; whoever sees the task sees them.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------
create table public.pm_task_assegnatari (
  task_id uuid not null references public.pm_task (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references public.profiles (id),
  primary key (task_id, profile_id)
);

-- "I miei task" reads by person
create index pm_task_assegnatari_profile_idx on public.pm_task_assegnatari (profile_id);

comment on table public.pm_task_assegnatari is
  'Who a project task is assigned to: one row per task and person, every person a member of the project.';

-- The assignments of today, where the person is (still) in the project: the
-- old trigger guaranteed it, the filter keeps the migration from ever failing.
insert into public.pm_task_assegnatari (task_id, profile_id, created_at)
select t.id, t.assegnatario_id, t.updated_at
from public.pm_task t
where t.assegnatario_id is not null
  and exists (
    select 1 from public.pm_membri m
    where m.progetto_id = t.progetto_id and m.profile_id = t.assegnatario_id
  )
on conflict (task_id, profile_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Permission helpers. security definer: the pm_task policies read the
--    assignments, and the assignment policies read the task, without either
--    going through the other's RLS (no recursion).
-- ---------------------------------------------------------------------------
create or replace function public.pm_assegnato(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.pm_task_assegnatari a
    where a.task_id = p_task and a.profile_id = (select auth.uid())
  );
$$;

-- Who may change a task: the same rule as the pm_task update policy below
create or replace function public.pm_puo_modificare_task(p_task uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select public.pm_puo_gestire(t.progetto_id)
      or (
        public.pm_puo_vedere(t.progetto_id)
        and (t.created_by = (select auth.uid()) or public.pm_assegnato(t.id))
      )
    from public.pm_task t
    where t.id = p_task
  ), false);
$$;

revoke all on function public.pm_assegnato(uuid) from public, anon;
revoke all on function public.pm_puo_modificare_task(uuid) from public, anon;
grant execute on function public.pm_assegnato(uuid) to authenticated;
grant execute on function public.pm_puo_modificare_task(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RLS. Rows are pairs: never updated, only added and removed.
-- ---------------------------------------------------------------------------
alter table public.pm_task_assegnatari enable row level security;
revoke all on public.pm_task_assegnatari from anon;

-- whoever sees the task sees who works on it (the task's own RLS decides)
create policy pm_task_assegnatari_select on public.pm_task_assegnatari for select to authenticated
  using (exists (select 1 from public.pm_task t where t.id = task_id));
create policy pm_task_assegnatari_insert on public.pm_task_assegnatari for insert to authenticated
  with check (
    public.pm_puo_modificare_task(task_id)
    and created_by is not distinct from (select auth.uid())
  );
create policy pm_task_assegnatari_delete on public.pm_task_assegnatari for delete to authenticated
  using (public.pm_puo_modificare_task(task_id));

-- The task itself: its assignees work on it, as the single assignee did
drop policy pm_task_update on public.pm_task;
create policy pm_task_update on public.pm_task for update to authenticated
  using (
    public.pm_puo_gestire(progetto_id)
    or (
      public.pm_puo_vedere(progetto_id)
      and (created_by = (select auth.uid()) or public.pm_assegnato(id))
    )
  )
  with check (public.pm_puo_vedere(progetto_id));

-- ---------------------------------------------------------------------------
-- 4. Consistency
-- ---------------------------------------------------------------------------

-- Every assignee is a member of the task's project
create or replace function public.pm_task_assegnatari_membro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.pm_task t
    join public.pm_membri m on m.progetto_id = t.progetto_id
    where t.id = new.task_id and m.profile_id = new.profile_id
  ) then
    raise exception 'La persona assegnata non fa parte del progetto' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger pm_task_assegnatari_membro
  before insert or update of task_id, profile_id on public.pm_task_assegnatari
  for each row execute function public.pm_task_assegnatari_membro();

-- A new or removed assignee changes the task: its updated_at moves, and the
-- Realtime subscription on pm_task (filtered by project) refreshes whoever has
-- the project open. Once per task and transaction.
create or replace function public.pm_task_assegnatari_tocca()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pm_task t
  set updated_at = now()
  where t.id = case when tg_op = 'DELETE' then old.task_id else new.task_id end
    and t.updated_at is distinct from now();
  return null;
end;
$$;

create trigger pm_task_assegnatari_tocca
  after insert or delete on public.pm_task_assegnatari
  for each row execute function public.pm_task_assegnatari_tocca();

revoke all on function public.pm_task_assegnatari_membro() from public, anon, authenticated;
revoke all on function public.pm_task_assegnatari_tocca() from public, anon, authenticated;

-- A task stays in its project: its list and its parent belong there. The
-- assignees are checked by their own table; a task moved to another project
-- (only the admin can) must find them there too.
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

  if tg_op = 'UPDATE' and new.progetto_id is distinct from old.progetto_id and exists (
    select 1 from public.pm_task_assegnatari a
    where a.task_id = new.id
      and not exists (
        select 1 from public.pm_membri m
        where m.progetto_id = new.progetto_id and m.profile_id = a.profile_id
      )
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

-- A person leaves a project: their assignments there go, they stop being in
-- charge of it, their running timer on it stops.
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
  set responsabile_id = null
  where p.id = old.progetto_id and p.responsabile_id = old.profile_id;

  -- the time worked so far is kept, the clock stops
  update public.pm_tempo t
  set fine = greatest(clock_timestamp(), t.inizio + interval '1 second')
  where t.progetto_id = old.progetto_id and t.profile_id = old.profile_id
    and t.inizio is not null and t.fine is null;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. The column goes. v_pm_task depends on it: dropped and rebuilt with the
--    assignees as an array, every other column as before.
-- ---------------------------------------------------------------------------
drop view public.v_pm_task;
drop index public.pm_task_assegnatario_idx;
alter table public.pm_task drop column assegnatario_id;

create view public.v_pm_task
with (security_invoker = true)
as
select
  t.id,
  t.progetto_id,
  t.tasklist_id,
  t.parent_id,
  t.titolo,
  t.descrizione,
  t.stato,
  t.priorita,
  coalesce(a.persone, '{}'::uuid[]) as assegnatari,
  t.data_inizio,
  t.scadenza,
  t.stima_minuti,
  t.ordine,
  t.completato_il,
  t.created_by,
  t.created_at,
  t.updated_at,
  coalesce(t.stato <> 'completato' and t.scadenza < public.oggi(), false) as in_ritardo,
  coalesce(s.totali, 0)::integer as sotto_task_totali,
  coalesce(s.completati, 0)::integer as sotto_task_completati
from public.pm_task t
left join (
  select
    c.parent_id,
    count(*) as totali,
    count(*) filter (where c.stato = 'completato') as completati
  from public.pm_task c
  where c.parent_id is not null
  group by c.parent_id
) s on s.parent_id = t.id
left join lateral (
  select array_agg(x.profile_id order by p.nome, x.created_at) as persone
  from public.pm_task_assegnatari x
  left join public.profiles p on p.id = x.profile_id
  where x.task_id = t.id
) a on true;

revoke all on public.v_pm_task from anon;

comment on view public.v_pm_task is
  'pm_task plus its assignees (by name), in_ritardo (open and past due, Europe/Rome) and the count of its sub-tasks.';

-- ---------------------------------------------------------------------------
-- 6. Assignees of a task in one call: the list given is the list kept.
--    security invoker: RLS on pm_task_assegnatari decides, the check up front
--    only gives a readable message. Adds first, removes after: an assignee
--    who hands the task over keeps the right to do it until the end.
-- ---------------------------------------------------------------------------
create or replace function public.pm_imposta_assegnatari(p_task uuid, p_persone uuid[])
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_persone uuid[] := coalesce(array(select distinct x from unnest(p_persone) x where x is not null), '{}');
begin
  if not public.pm_puo_modificare_task(p_task) then
    raise exception 'Puoi modificare solo i task assegnati a te o creati da te' using errcode = '42501';
  end if;

  insert into public.pm_task_assegnatari (task_id, profile_id)
  select p_task, x from unnest(v_persone) x
  on conflict (task_id, profile_id) do nothing;

  delete from public.pm_task_assegnatari a
  where a.task_id = p_task and a.profile_id <> all (v_persone);
end;
$$;

revoke all on function public.pm_imposta_assegnatari(uuid, uuid[]) from public, anon;
grant execute on function public.pm_imposta_assegnatari(uuid, uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The project overview: a task without assignees has no row in the table
-- ---------------------------------------------------------------------------
create or replace function public.pm_panoramica_progetto(p_progetto uuid)
returns table (
  da_fare integer,
  in_corso integer,
  in_revisione integer,
  completati integer,
  in_ritardo integer,
  senza_assegnatario integer,
  in_scadenza_7_giorni integer,
  minuti_totali integer,
  minuti_ultimi_7_giorni integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*) filter (where t.stato = 'da_fare')::integer,
    count(*) filter (where t.stato = 'in_corso')::integer,
    count(*) filter (where t.stato = 'in_revisione')::integer,
    count(*) filter (where t.stato = 'completato')::integer,
    count(*) filter (where t.stato <> 'completato' and t.scadenza < public.oggi())::integer,
    count(*) filter (
      where t.stato <> 'completato'
        and not exists (select 1 from public.pm_task_assegnatari a where a.task_id = t.id)
    )::integer,
    count(*) filter (
      where t.stato <> 'completato' and t.scadenza between public.oggi() and public.oggi() + 7
    )::integer,
    (select coalesce(sum(v.minuti), 0)::integer from public.pm_tempo v where v.progetto_id = p_progetto),
    (select coalesce(sum(v.minuti), 0)::integer from public.pm_tempo v
      where v.progetto_id = p_progetto and v.data >= public.oggi() - 6)
  from public.pm_task t
  where t.progetto_id = p_progetto;
$$;

-- ---------------------------------------------------------------------------
-- 8. Merging two profiles: a task can now hold both people, and every
--    assignment needs its person in the project. So, in the projects both are
--    in, the source's assignments pass to the target before the source's
--    membership goes; the other memberships move before the loop moves the
--    remaining assignments. Everything else as in 20260928150200.
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
