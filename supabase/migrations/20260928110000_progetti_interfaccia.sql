-- Projects area, the screens: progress computed in SQL, sub-task and membership
-- consistency, list and department ordering, and the client link reserved to
-- the app admin also on update (pm_crea_progetto already checks it on create).

-- ---------------------------------------------------------------------------
-- Views. security_invoker: they run with the caller's RLS, so everybody counts
-- only the projects and tasks they can see.
-- ---------------------------------------------------------------------------

-- One task, with its late flag and the progress of its sub-tasks
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
  t.assegnatario_id,
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
) s on s.parent_id = t.id;

revoke all on public.v_pm_task from anon;

comment on view public.v_pm_task is
  'pm_task plus in_ritardo (open and past due, Europe/Rome) and the count of its sub-tasks.';

-- One list (milestone) with its progress. Sub-tasks count as tasks.
create view public.v_pm_tasklist
with (security_invoker = true)
as
select
  l.id,
  l.progetto_id,
  l.nome,
  l.descrizione,
  l.ordine,
  l.data_inizio,
  l.data_fine,
  l.created_at,
  count(t.id)::integer as task_totali,
  count(t.id) filter (where t.stato = 'completato')::integer as task_completati,
  count(t.id) filter (where t.stato <> 'completato' and t.scadenza < public.oggi())::integer as task_in_ritardo,
  case
    when count(t.id) = 0 then null
    else round(count(t.id) filter (where t.stato = 'completato')::numeric / count(t.id), 4)
  end as avanzamento
from public.pm_tasklist l
left join public.pm_task t on t.tasklist_id = l.id
group by l.id;

revoke all on public.v_pm_tasklist from anon;

comment on view public.v_pm_tasklist is
  'Task list with completed/total tasks (sub-tasks included) and progress as a ratio; null progress without tasks.';

-- One project with its progress, its late tasks and whether the caller is in it
create view public.v_pm_progetti
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
  public.pm_membro(p.id) as sono_membro
from public.pm_progetti p
left join public.pm_task t on t.progetto_id = p.id
group by p.id;

revoke all on public.v_pm_progetti from anon;

comment on view public.v_pm_progetti is
  'Project with completed/total tasks, late tasks, progress ratio, past end date and caller membership.';

-- ---------------------------------------------------------------------------
-- Project guard: the client link belongs to Economics, so only the app admin
-- changes it; the person in charge is one of the members.
-- auth.uid() is null for trusted server-side work (seed, migrations).
-- ---------------------------------------------------------------------------
create or replace function public.pm_progetti_guardia()
returns trigger
language plpgsql
set search_path = ''
as $$
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

  return new;
end;
$$;

create trigger pm_progetti_guardia
  before update on public.pm_progetti
  for each row execute function public.pm_progetti_guardia();

-- ---------------------------------------------------------------------------
-- Sub-tasks: one level only, and always in the list of their parent.
-- Runs after pm_task_coerenza (trigger names fire in alphabetical order),
-- which already checked that the parent is a top-level task of the project.
-- ---------------------------------------------------------------------------
create or replace function public.pm_task_sotto_task()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is not null then
    if tg_op = 'UPDATE' and exists (select 1 from public.pm_task c where c.parent_id = new.id) then
      raise exception 'Un task con sotto-task non può diventare a sua volta un sotto-task'
        using errcode = '22023';
    end if;
    new.tasklist_id := (select t.tasklist_id from public.pm_task t where t.id = new.parent_id);
  end if;
  return new;
end;
$$;

create trigger pm_task_sotto_task
  before insert or update on public.pm_task
  for each row execute function public.pm_task_sotto_task();

-- Moving a task to another list moves its sub-tasks too. security definer: the
-- assignee of the parent may not have rights on sub-tasks assigned to others,
-- and the list must stay consistent anyway. It only touches tasklist_id of the
-- children of a row the caller was allowed to update.
create or replace function public.pm_task_lista_ai_sotto_task()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.pm_task c
  set tasklist_id = new.tasklist_id
  where c.parent_id = new.id
    and c.tasklist_id is distinct from new.tasklist_id;
  return null;
end;
$$;

revoke all on function public.pm_task_lista_ai_sotto_task() from public, anon, authenticated;

create trigger pm_task_lista_ai_sotto_task
  after update of tasklist_id on public.pm_task
  for each row
  when (old.tasklist_id is distinct from new.tasklist_id and new.parent_id is null)
  execute function public.pm_task_lista_ai_sotto_task();

-- ---------------------------------------------------------------------------
-- A person leaves a project: their tasks there go back to nobody and they stop
-- being in charge of it. Otherwise the next edit of those tasks would fail the
-- "assignee is a member" check. security definer: a manager who removes
-- themselves loses their rights before this runs. Skipped when the project
-- itself is being deleted (the cascade removes everything anyway).
-- ---------------------------------------------------------------------------
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

  update public.pm_task t
  set assegnatario_id = null
  where t.progetto_id = old.progetto_id and t.assegnatario_id = old.profile_id;

  update public.pm_progetti p
  set responsabile_id = null
  where p.id = old.progetto_id and p.responsabile_id = old.profile_id;

  return null;
end;
$$;

revoke all on function public.pm_membro_tolto() from public, anon, authenticated;

create trigger pm_membri_tolto
  after delete on public.pm_membri
  for each row execute function public.pm_membro_tolto();

-- ---------------------------------------------------------------------------
-- Ordering: one statement sets the position of every row from an ordered list
-- of ids. security invoker: RLS decides, so whoever may not reorder updates
-- nothing. Returns how many rows moved.
-- ---------------------------------------------------------------------------
create or replace function public.pm_riordina_liste(p_progetto_id uuid, p_ids uuid[])
returns integer
language sql
security invoker
set search_path = ''
as $$
  with aggiornate as (
    update public.pm_tasklist l
    set ordine = x.posizione::integer
    from unnest(p_ids) with ordinality as x(id, posizione)
    where l.id = x.id and l.progetto_id = p_progetto_id
    returning 1
  )
  select count(*)::integer from aggiornate;
$$;

create or replace function public.pm_riordina_reparti(p_ids uuid[])
returns integer
language sql
security invoker
set search_path = ''
as $$
  with aggiornati as (
    update public.pm_reparti r
    set ordine = x.posizione::integer
    from unnest(p_ids) with ordinality as x(id, posizione)
    where r.id = x.id
    returning 1
  )
  select count(*)::integer from aggiornati;
$$;

revoke all on function public.pm_riordina_liste(uuid, uuid[]) from public, anon;
revoke all on function public.pm_riordina_reparti(uuid[]) from public, anon;
grant execute on function public.pm_riordina_liste(uuid, uuid[]) to authenticated;
grant execute on function public.pm_riordina_reparti(uuid[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Live updates of the lists too (a manager adds a milestone, the team sees it)
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pm_tasklist'
  ) then
    alter publication supabase_realtime add table public.pm_tasklist;
  end if;
end;
$$;
