-- Time and notes of the Projects area: the totals the screens show are
-- computed here (CLAUDE.md section 9: numbers in SQL, TypeScript only formats).
-- Every function is security invoker: the RLS of pm_tempo decides whose time
-- is read (your own; on a project you manage, everyone's; the admin, all).
-- A running timer has no minutes yet: it never counts in a total.

-- ---------------------------------------------------------------------------
-- The caller's running timer, with the names the shell indicator shows.
-- Filtered on auth.uid(): the admin reads everyone's time, but the indicator
-- is about their own clock only.
-- ---------------------------------------------------------------------------
create or replace function public.pm_timer_attivo()
returns table (
  id uuid,
  progetto_id uuid,
  progetto text,
  task_id uuid,
  task text,
  inizio timestamptz,
  nota text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id, t.progetto_id, p.nome, t.task_id, k.titolo, t.inizio, t.nota
  from public.pm_tempo t
  left join public.pm_progetti p on p.id = t.progetto_id
  left join public.pm_task k on k.id = t.task_id
  where t.profile_id = (select auth.uid())
    and t.inizio is not null
    and t.fine is null;
$$;

-- ---------------------------------------------------------------------------
-- "Il mio tempo": the caller's own minutes in a period, per day, per project
-- and overall. The overall row is always there (0 when nothing was logged).
-- ---------------------------------------------------------------------------
create or replace function public.pm_riepilogo_tempo(p_da date, p_a date)
returns table (
  livello text,        -- 'giorno' | 'progetto' | 'totale'
  data date,
  progetto_id uuid,
  progetto text,
  minuti integer,
  voci integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    case
      when grouping(t.data) = 0 then 'giorno'
      when grouping(t.progetto_id) = 0 then 'progetto'
      else 'totale'
    end,
    t.data,
    t.progetto_id,
    p.nome,
    coalesce(sum(t.minuti), 0)::integer,
    count(t.id)::integer
  from public.pm_tempo t
  left join public.pm_progetti p on p.id = t.progetto_id
  where t.profile_id = (select auth.uid())
    and t.minuti is not null
    and t.data between p_da and p_a
  group by grouping sets ((t.data), (t.progetto_id, p.nome), ())
  order by 1, 2, 5 desc, 4;
$$;

-- ---------------------------------------------------------------------------
-- Time tab of a project: minutes per day, per person and per task, as far as
-- RLS lets the caller see (an employee: their own; who manages the project
-- and the admin: everyone's). Whoever cannot see the project gets no rows.
-- ---------------------------------------------------------------------------
create or replace function public.pm_tempo_progetto(p_progetto uuid, p_da date, p_a date)
returns table (
  livello text,        -- 'giorno' | 'persona' | 'task' | 'totale'
  data date,
  profile_id uuid,
  persona text,
  task_id uuid,
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
begin
  if not public.pm_puo_vedere(p_progetto) then
    return;
  end if;

  return query
  select
    case
      when grouping(t.data) = 0 then 'giorno'
      when grouping(t.profile_id) = 0 then 'persona'
      when grouping(t.task_id) = 0 then 'task'
      else 'totale'
    end,
    t.data,
    t.profile_id,
    pr.nome,
    t.task_id,
    k.titolo,
    coalesce(sum(t.minuti), 0)::integer,
    count(t.id)::integer
  from public.pm_tempo t
  left join public.profiles pr on pr.id = t.profile_id
  left join public.pm_task k on k.id = t.task_id
  where t.progetto_id = p_progetto
    and t.minuti is not null
    and t.data between p_da and p_a
  group by grouping sets ((t.data), (t.profile_id, pr.nome), (t.task_id, k.titolo), ())
  order by 1, 2, 7 desc, 4, 6;
end;
$$;

revoke all on function public.pm_timer_attivo() from public, anon;
revoke all on function public.pm_riepilogo_tempo(date, date) from public, anon;
revoke all on function public.pm_tempo_progetto(uuid, date, date) from public, anon;
grant execute on function public.pm_timer_attivo() to authenticated;
grant execute on function public.pm_riepilogo_tempo(date, date) to authenticated;
grant execute on function public.pm_tempo_progetto(uuid, date, date) to authenticated;

-- The time tab of a project reads by project and period
create index pm_tempo_progetto_data_idx on public.pm_tempo (progetto_id, data);

-- Notes appear live to the other members of the project (RLS applies to events)
alter publication supabase_realtime add table public.pm_note;
