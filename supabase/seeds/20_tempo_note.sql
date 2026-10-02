-- Time and notes demo data for the Projects area. Invented content only.
-- It does not know the demo projects' ids (10_progetti.sql owns them): it reads
-- the projects and their members that exist, and does nothing when there are
-- none. Ids are derived from project, person and day (md5), so running it again
-- changes nothing already there ("on conflict do nothing"). No running timers,
-- no new members: the seed setter stays outside every project.

-- ---------------------------------------------------------------------------
-- Time: the last two working weeks, about half the days per person and
-- project, some from the timer (start and end), some typed afterwards.
-- ---------------------------------------------------------------------------
with progetti as (
  select p.id
  from public.pm_progetti p
  where p.stato <> 'archiviato'
    -- the demo projects: a client's automatic project has nobody in it yet
    and exists (select 1 from public.pm_membri m where m.progetto_id = p.id)
  order by p.created_at, p.id
  limit 6
),
candidati as (
  select
    m.progetto_id,
    m.profile_id,
    d.data,
    -- a stable pseudo-random number per person, project and day (0 .. 2^28-1)
    ('x' || substr(md5(m.progetto_id::text || m.profile_id::text || d.data::text), 1, 7))::bit(28)::int as h
  from progetti p
  join public.pm_membri m on m.progetto_id = p.id
  cross join lateral (
    select public.oggi() - g as data
    from generate_series(1, 13) g
    where extract(isodow from public.oggi() - g) < 6
  ) d
),
scelte as (
  select
    c.*,
    15 * (1 + (c.h / 100) % 10) as minuti,
    (c.h / 7) % 2 = 0 as da_timer,
    (
      select t.id
      from public.pm_task t
      where t.progetto_id = c.progetto_id and t.parent_id is null
      order by t.ordine, t.id
      offset ((c.h / 13) % greatest(1, (select count(*) from public.pm_task x where x.progetto_id = c.progetto_id and x.parent_id is null)))
      limit 1
    ) as task_id
  from candidati c
  where c.h % 100 < 55
)
insert into public.pm_tempo (id, profile_id, progetto_id, task_id, data, inizio, fine, minuti, nota)
select
  md5('seed-tempo:' || s.progetto_id || ':' || s.profile_id || ':' || s.data)::uuid,
  s.profile_id,
  s.progetto_id,
  case when s.h % 5 = 0 then null else s.task_id end,
  s.data,
  case when s.da_timer
    then (s.data + make_time(9 + s.h % 8, (s.h % 4) * 15, 0)) at time zone 'Europe/Rome'
  end,
  case when s.da_timer
    then (s.data + make_time(9 + s.h % 8, (s.h % 4) * 15, 0)) at time zone 'Europe/Rome' + make_interval(mins => s.minuti)
  end,
  s.minuti,
  (array[
    null,
    'Revisione e correzioni',
    'Montaggio della prima parte',
    'Call con il cliente',
    null,
    'Preparazione materiali',
    'Aggiornamento della scheda',
    null
  ])[1 + s.h % 8]
from scelte s
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Notes: four per project, today and on a few past days, by its members.
-- ---------------------------------------------------------------------------
with progetti as (
  select p.id, row_number() over (order by p.created_at, p.id) as n
  from public.pm_progetti p
  where p.stato <> 'archiviato'
    -- the demo projects: a client's automatic project has nobody in it yet
    and exists (select 1 from public.pm_membri m where m.progetto_id = p.id)
  order by p.created_at, p.id
  limit 6
),
righe as (
  select
    p.id as progetto_id,
    p.n,
    k,
    (array[0, 1, 3, 6])[k] as giorni_fa,
    (
      select m.profile_id
      from public.pm_membri m
      where m.progetto_id = p.id
      order by m.created_at, m.profile_id
      offset (k % greatest(1, (select count(*) from public.pm_membri x where x.progetto_id = p.id)))
      limit 1
    ) as autore_id
  from progetti p
  cross join generate_series(1, 4) k
),
datate as (
  select
    r.*,
    public.oggi() - r.giorni_fa as data,
    least(now(), (public.oggi() - r.giorni_fa + make_time(9 + (r.n::int + r.k) % 9, 10 * r.k, 0)) at time zone 'Europe/Rome') as scritta
  from righe r
  where r.autore_id is not null
)
insert into public.pm_note (id, progetto_id, autore_id, data, testo, created_at, updated_at)
select
  md5('seed-nota:' || d.progetto_id || ':' || d.k)::uuid,
  d.progetto_id,
  d.autore_id,
  d.data,
  (array[
    'Call di allineamento: priorità confermate per questa settimana.',
    'Materiali ricevuti, si parte con la prima bozza.',
    'Feedback del cliente: più attenzione alla tecnica, meno alla motivazione.',
    'Consegna spostata di due giorni, avvisato tutto il team.',
    'Bozza approvata. Prossimo passo: revisione finale.',
    'Da ricordare: il cliente preferisce essere contattato la sera.',
    'Aggiornata la checklist, due attività chiuse oggi.',
    'Serve un nuovo giro di riprese: la luce va sistemata.'
  ])[1 + ((d.n::int * 3 + d.k) % 8)],
  d.scritta,
  d.scritta
from datate d
on conflict (id) do nothing;
