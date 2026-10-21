-- Team time by email every Monday (Dany, 02/10/2026): "ogni lunedì una mail
-- formattata bene con i tracciamenti dei miei collaboratori, come quella con i
-- dati del setter, così capisco quante ore hanno lavorato ogni settimana".
--
-- The same data as Tempo › Team (pm_tempo_per_persona), summed in SQL for the
-- daily cron. The cron has no session, so this is security definer and only
-- the service role executes it, like riepilogo_serale.
--
-- Privacy limits, the same as the page (CLAUDE.md sections 17 and 18):
-- - only time already declared: a stopped timer or minutes entered by hand.
--   A running timer never appears, not even its existence;
-- - only the people who logged something in the period: no list of who did
--   not log, no alerts;
-- - people in alphabetical order, never by hours: no ranking.
--
-- Inside one person, projects and tasks go by time (where the time went), as
-- on the page: the 10 projects and the 5 tasks per project with more time,
-- the time without a task on its own, then how many others and their
-- minutes, so every total still adds up.

create or replace function public.riepilogo_tempo_team(p_da date, p_a date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_progetti_max constant integer := 10;
  v_task_max constant integer := 5;
  v_risultato jsonb;
begin
  if p_da is null or p_a is null or p_da > p_a then
    raise exception 'Periodo non valido' using errcode = '22023';
  end if;

  with base as (
    select t.profile_id, t.progetto_id, t.task_id, t.minuti
    from public.pm_tempo t
    where t.minuti is not null
      -- a running timer (start, no end) is nobody's business but its owner's
      and not (t.inizio is not null and t.fine is null)
      and t.data between p_da and p_a
  ),
  per_task as (
    select b.profile_id, b.progetto_id, b.task_id,
           sum(b.minuti)::integer as minuti, count(*)::integer as voci
    from base b
    group by b.profile_id, b.progetto_id, b.task_id
  ),
  task_ordinati as (
    -- only real tasks are ranked and counted: time without a task (or on a
    -- task deleted since) is its own line, never "one more task"
    select pt.*, k.titolo,
           case when pt.task_id is not null then
             row_number() over (
               partition by pt.profile_id, pt.progetto_id, pt.task_id is null
               order by pt.minuti desc, k.titolo, pt.task_id
             )
           end as n
    from per_task pt
    left join public.pm_task k on k.id = pt.task_id
  ),
  per_progetto as (
    select t.profile_id, t.progetto_id,
           sum(t.minuti)::integer as minuti,
           sum(t.voci)::integer as voci,
           coalesce(
             jsonb_agg(jsonb_build_object('titolo', t.titolo, 'minuti', t.minuti) order by t.n)
               filter (where t.n <= v_task_max),
             '[]'::jsonb
           ) as task,
           coalesce(sum(t.minuti) filter (where t.task_id is null), 0)::integer as senza_task_minuti,
           (count(*) filter (where t.n > v_task_max))::integer as altri_task,
           coalesce(sum(t.minuti) filter (where t.n > v_task_max), 0)::integer as altri_task_minuti
    from task_ordinati t
    group by t.profile_id, t.progetto_id
  ),
  progetti_ordinati as (
    select pp.*, p.nome,
           row_number() over (
             partition by pp.profile_id
             order by pp.minuti desc, p.nome, pp.progetto_id
           ) as n
    from per_progetto pp
    join public.pm_progetti p on p.id = pp.progetto_id
  ),
  per_persona as (
    select po.profile_id,
           sum(po.minuti)::integer as minuti,
           sum(po.voci)::integer as voci,
           coalesce(
             jsonb_agg(jsonb_build_object(
               'nome', po.nome,
               'minuti', po.minuti,
               'voci', po.voci,
               'task', po.task,
               'senza_task_minuti', po.senza_task_minuti,
               'altri_task', po.altri_task,
               'altri_task_minuti', po.altri_task_minuti
             ) order by po.n) filter (where po.n <= v_progetti_max),
             '[]'::jsonb
           ) as progetti,
           (count(*) filter (where po.n > v_progetti_max))::integer as altri_progetti,
           coalesce(sum(po.minuti) filter (where po.n > v_progetti_max), 0)::integer as altri_progetti_minuti
    from progetti_ordinati po
    group by po.profile_id
  ),
  persone as (
    select pp.*, coalesce(nullif(btrim(pr.nome), ''), pr.email) as nome
    from per_persona pp
    join public.profiles pr on pr.id = pp.profile_id
  )
  select jsonb_build_object(
    'da', p_da,
    'a', p_a,
    'minuti', coalesce((select sum(x.minuti) from persone x), 0)::integer,
    'voci', coalesce((select sum(x.voci) from persone x), 0)::integer,
    'persone', coalesce((
      select jsonb_agg(jsonb_build_object(
               'nome', x.nome,
               'minuti', x.minuti,
               'voci', x.voci,
               'progetti', x.progetti,
               'altri_progetti', x.altri_progetti,
               'altri_progetti_minuti', x.altri_progetti_minuti
             -- people alphabetical, never by hours
             ) order by x.nome, x.profile_id)
      from persone x
    ), '[]'::jsonb)
  )
  into v_risultato;

  return v_risultato;
end;
$$;

comment on function public.riepilogo_tempo_team(date, date) is
  'Service role only (the Monday email): logged time per person, project and task in a period. Never a running timer, only people with time in the period, alphabetical.';

revoke all on function public.riepilogo_tempo_team(date, date) from public, anon, authenticated;
grant execute on function public.riepilogo_tempo_team(date, date) to service_role;


-- The email's in-app copy (1.41.0): a new kind of notification
alter table public.notifiche drop constraint notifiche_tipo_check;
alter table public.notifiche
  add constraint notifiche_tipo_check check (tipo in (
    'riepilogo_settimana', 'tempo_team', 'backup', 'promemoria_feedback', 'promemoria_rinnovo',
    'rate_in_ritardo', 'chiave_in_scadenza', 'chiave_rifiutata', 'proposta_da_approvare', 'spesa_claude'
  ));
