-- Team time, person by person (Dany, 29/09/2026): "chi ha tracciato che cosa,
-- non solo il mio tempo ma anche dei miei collaboratori, non solo dentro al
-- progetto ma per utente". Only the app admin reads it.
--
-- Privacy limits (CLAUDE.md sections 17 and 18):
-- - only time already declared: a stopped timer or minutes entered by hand.
--   A running timer never appears, not even its existence;
-- - only the people who logged something in the period: no list of who did
--   not log, no alerts;
-- - people in alphabetical order, never by hours: no ranking.
--
-- security invoker: the RLS of pm_tempo still applies on top of the explicit
-- admin check (the admin reads logged time on every project).

create or replace function public.pm_tempo_per_persona(
  p_da date,
  p_a date,
  p_profilo uuid default null,
  p_progetto uuid default null,
  p_limite integer default 100
)
returns table (
  livello text,        -- 'totale' | 'persona' | 'progetto' | 'task' | 'voce'
  profile_id uuid,
  persona text,
  progetto_id uuid,
  progetto text,
  task_id uuid,        -- on a 'task' row, null = time without a task
  task text,
  minuti integer,
  voci integer,        -- entries summed in the row; null on a 'voce'
  id uuid,             -- this column and the ones below: 'voce' rows only
  data date,
  inizio timestamptz,
  fine timestamptz,
  nota text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  -- the entries of each person, newest first: enough to read, never the whole history
  v_limite integer := least(greatest(coalesce(p_limite, 100), 1), 500);
begin
  if not public.is_admin() then
    raise exception 'Il tempo del team lo vede solo l''admin' using errcode = '42501';
  end if;

  if p_da is null or p_a is null or p_da > p_a then
    raise exception 'Periodo non valido' using errcode = '22023';
  end if;

  return query
  with base as (
    select t.id, t.profile_id, t.progetto_id, t.task_id, t.data, t.inizio, t.fine, t.minuti, t.nota, t.created_at
    from public.pm_tempo t
    where t.minuti is not null
      -- a running timer (start, no end) is nobody's business but its owner's
      and not (t.inizio is not null and t.fine is null)
      and t.data between p_da and p_a
      and (p_profilo is null or t.profile_id = p_profilo)
      and (p_progetto is null or t.progetto_id = p_progetto)
  ),
  somme as (
    -- overall, per person, per person and project, per person, project and task
    select
      case
        when grouping(b.profile_id) = 1 then 'totale'
        when grouping(b.progetto_id) = 1 then 'persona'
        when grouping(b.task_id) = 1 then 'progetto'
        else 'task'
      end as livello,
      b.profile_id,
      b.progetto_id,
      b.task_id,
      coalesce(sum(b.minuti), 0)::integer as minuti,
      count(b.id)::integer as voci
    from base b
    group by rollup (b.profile_id, b.progetto_id, b.task_id)
  ),
  ultime as (
    select
      b.*,
      row_number() over (
        partition by b.profile_id
        order by b.data desc, b.inizio desc nulls last, b.created_at desc, b.id
      ) as n
    from base b
  ),
  righe as (
    select
      s.livello, s.profile_id, s.progetto_id, s.task_id, s.minuti, s.voci,
      null::uuid as id, null::date as data, null::timestamptz as inizio, null::timestamptz as fine,
      null::text as nota, null::timestamptz as creata
    from somme s
    union all
    select
      'voce', u.profile_id, u.progetto_id, u.task_id, u.minuti, null,
      u.id, u.data, u.inizio, u.fine, u.nota, u.created_at
    from ultime u
    where u.n <= v_limite
  )
  select
    r.livello, r.profile_id, pr.nome, r.progetto_id, p.nome, r.task_id, k.titolo,
    r.minuti, r.voci, r.id, r.data, r.inizio, r.fine, r.nota
  from righe r
  left join public.profiles pr on pr.id = r.profile_id
  left join public.pm_progetti p on p.id = r.progetto_id
  left join public.pm_task k on k.id = r.task_id
  order by
    array_position(array['totale', 'persona', 'progetto', 'task', 'voce'], r.livello),
    -- people alphabetical, never by hours
    pr.nome nulls first,
    r.profile_id nulls first,
    -- entries newest first
    r.data desc nulls last,
    r.inizio desc nulls last,
    r.creata desc nulls last,
    -- inside one person: where the time went
    r.minuti desc,
    p.nome,
    k.titolo nulls last,
    r.id;
end;
$$;

comment on function public.pm_tempo_per_persona(date, date, uuid, uuid, integer) is
  'Admin only: logged time per person, project and task in a period, plus each person''s latest entries. Never a running timer, only people with time in the period, alphabetical.';

revoke all on function public.pm_tempo_per_persona(date, date, uuid, uuid, integer) from public, anon;
grant execute on function public.pm_tempo_per_persona(date, date, uuid, uuid, integer) to authenticated;
