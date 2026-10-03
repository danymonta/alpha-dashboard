-- One's own time per task (Dany, 03/10/2026: «Quanto ho dedicato alla revisione
-- video di Rossi questo mese?»). Il mio tempo and Alfire's mio_tempo had the
-- totals per day and per project (pm_riepilogo_tempo), never per task, and the
-- model must never add up entries: the totals per project › task come from here.
--
-- Always and only the caller's own time, whoever calls: an employee, the
-- manager of the project (who reads the others' time on the project's Tempo
-- tab, never through this) and the admin (whose read of the others is
-- pm_tempo_per_persona, Tempo › Team). Only time already declared: a running
-- timer is not an entry yet. Days are pm_tempo.data, the Europe/Rome day of
-- the entry (of its start, for a timer: pm_tempo_coerenza).
--
-- security invoker: the RLS of pm_tempo applies on top of the explicit filter
-- on auth.uid(); project and task names come through their own RLS (a project
-- the caller no longer sees keeps its minutes, without a name).

create or replace function public.pm_mio_tempo_per_task(
  p_da date,
  p_a date,
  p_progetto uuid default null,
  p_task uuid default null,
  p_tasks uuid[] default null
)
returns table (
  livello text,        -- 'totale' | 'progetto' | 'task'
  progetto_id uuid,
  progetto text,
  task_id uuid,        -- on a 'task' row, null = time on the project without a task
  task text,
  minuti integer,
  voci integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_utente uuid := (select auth.uid());
begin
  if v_utente is null then
    raise exception 'Sessione scaduta' using errcode = '42501';
  end if;
  -- a deactivated account (or no profile) reads nothing, not even its own time
  if public.current_role() is null then
    raise exception 'Account non attivo' using errcode = '42501';
  end if;
  if p_da is null or p_a is null or p_da > p_a then
    raise exception 'Periodo non valido' using errcode = '22023';
  end if;

  return query
  with base as (
    select t.id, t.progetto_id, t.task_id, t.minuti
    from public.pm_tempo t
    -- mine only, even when RLS would let a manager or the admin read more
    where t.profile_id = v_utente
      and t.minuti is not null
      -- a running timer (start, no end) is not an entry yet
      and not (t.inizio is not null and t.fine is null)
      and t.data between p_da and p_a
      and (p_progetto is null or t.progetto_id = p_progetto)
      and (p_task is null or t.task_id = p_task)
      -- the same task said for several clients ("revisione video"): the
      -- caller's time on all of them, summed here, never by the model
      and (p_tasks is null or t.task_id = any (p_tasks))
  ),
  somme as (
    -- overall, per project, per project and task
    select
      case
        when grouping(b.progetto_id) = 1 then 'totale'
        when grouping(b.task_id) = 1 then 'progetto'
        else 'task'
      end as livello,
      b.progetto_id,
      b.task_id,
      coalesce(sum(b.minuti), 0)::integer as minuti,
      count(b.id)::integer as voci
    from base b
    group by rollup (b.progetto_id, b.task_id)
  )
  select s.livello, s.progetto_id, p.nome, s.task_id, k.titolo, s.minuti, s.voci
  from somme s
  left join public.pm_progetti p on p.id = s.progetto_id
  left join public.pm_task k on k.id = s.task_id
  order by
    array_position(array['totale', 'progetto', 'task'], s.livello),
    -- where the time went first
    s.minuti desc,
    p.nome nulls last,
    s.progetto_id,
    k.titolo nulls last,
    s.task_id;
end;
$$;

comment on function public.pm_mio_tempo_per_task(date, date, uuid, uuid, uuid[]) is
  'The caller''s own logged time in a period, in total, per project and per project and task (optionally one project, one task, or a set of tasks: the same task title across several client projects). Never another person''s time, never a running timer.';

revoke all on function public.pm_mio_tempo_per_task(date, date, uuid, uuid, uuid[]) from public, anon;
grant execute on function public.pm_mio_tempo_per_task(date, date, uuid, uuid, uuid[]) to authenticated;
