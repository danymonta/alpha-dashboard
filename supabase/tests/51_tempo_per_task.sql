-- One's own time per task (03/10/2026): the caller's logged time in a period,
-- summed in SQL in total, per project and per project and task, optionally
-- for one project, one task, or a set of tasks (the same title in several
-- client projects, p_tasks). Never another person's entries, whoever calls
-- (employee, manager of the project, admin); never a running timer; days are
-- Europe/Rome days. No session, or a deactivated account: refused.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(37);

-- Shape: invoker rights, empty search_path, no anon
select ok(
  (select bool_and(not p.prosecdef and p.proconfig @> array['search_path=""'])
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'pm_mio_tempo_per_task'),
  'la RPC è security invoker con search_path vuoto'
);
select ok(
  not has_function_privilege('anon', 'public.pm_mio_tempo_per_task(date, date, uuid, uuid, uuid[])', 'execute'),
  'anon non la esegue'
);
select ok(
  has_function_privilege('authenticated', 'public.pm_mio_tempo_per_task(date, date, uuid, uuid, uuid[])', 'execute'),
  'chi è entrato la esegue'
);

-- Fixtures: Anna (an editor, employee) and Zeno (a coach who manages both
-- projects). The seed admin logs time too, on the same task as Anna.
insert into public.invites (email, ruolo) values
  ('zeno.pertask@alpha.test', 'coach'),
  ('anna.pertask@alpha.test', 'editor');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', 'dddd0000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'zeno.pertask@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Zeno Pertask"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'dddd0000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'anna.pertask@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Anna Pertask"}'::jsonb, now(), now(), '', '', '', '');
update public.profiles set livello_pm = 'manager' where id = 'dddd0000-0000-4000-8000-000000000001';

insert into public.pm_progetti (id, reparto_id, nome, created_by) values
  ('dddd1111-0000-4000-8000-000000000001', (select id from public.pm_reparti order by ordine limit 1),
   'Progetto Uno', 'dddd0000-0000-4000-8000-000000000001'),
  ('dddd1111-0000-4000-8000-000000000002', (select id from public.pm_reparti order by ordine limit 1),
   'Progetto Due', 'dddd0000-0000-4000-8000-000000000001');
insert into public.pm_membri (progetto_id, profile_id)
select p.id, pr.id
from unnest(array['dddd1111-0000-4000-8000-000000000001', 'dddd1111-0000-4000-8000-000000000002']::uuid[]) p(id)
cross join unnest(array['dddd0000-0000-4000-8000-000000000001', 'dddd0000-0000-4000-8000-000000000002']::uuid[]) pr(id);
insert into public.pm_task (id, progetto_id, titolo, created_by) values
  ('dddd2222-0000-4000-8000-000000000001', 'dddd1111-0000-4000-8000-000000000001', 'Montaggio',
   'dddd0000-0000-4000-8000-000000000001'),
  ('dddd2222-0000-4000-8000-000000000002', 'dddd1111-0000-4000-8000-000000000001', 'Revisione video',
   'dddd0000-0000-4000-8000-000000000001'),
  ('dddd2222-0000-4000-8000-000000000003', 'dddd1111-0000-4000-8000-000000000002', 'Riprese',
   'dddd0000-0000-4000-8000-000000000001'),
  -- the same title in the other project, as every client's project has it (p_tasks)
  ('dddd2222-0000-4000-8000-000000000004', 'dddd1111-0000-4000-8000-000000000002', 'Revisione video',
   'dddd0000-0000-4000-8000-000000000001');

-- January 2021, far from the seed's recent weeks. Written straight to the table
-- (the owner bypasses RLS; the coherence trigger still runs and sets the day of
-- a timer from its start, in Europe/Rome).
insert into public.pm_tempo (profile_id, progetto_id, task_id, data, inizio, fine, minuti) values
  -- Anna: Montaggio 60 + 30, Revisione video 45, Progetto Uno without a task 20, Riprese 50
  ('dddd0000-0000-4000-8000-000000000002', 'dddd1111-0000-4000-8000-000000000001',
   'dddd2222-0000-4000-8000-000000000001', '2021-01-10', null, null, 60),
  ('dddd0000-0000-4000-8000-000000000002', 'dddd1111-0000-4000-8000-000000000001',
   'dddd2222-0000-4000-8000-000000000001', '2021-01-12', null, null, 30),
  ('dddd0000-0000-4000-8000-000000000002', 'dddd1111-0000-4000-8000-000000000001',
   'dddd2222-0000-4000-8000-000000000002', '2021-01-12', null, null, 45),
  ('dddd0000-0000-4000-8000-000000000002', 'dddd1111-0000-4000-8000-000000000001',
   null, '2021-01-13', null, null, 20),
  ('dddd0000-0000-4000-8000-000000000002', 'dddd1111-0000-4000-8000-000000000002',
   'dddd2222-0000-4000-8000-000000000003', '2021-01-14', null, null, 50),
  -- Anna, a stopped timer on the evening of 31/01 in Rome (22:00-22:40 UTC): January
  ('dddd0000-0000-4000-8000-000000000002', 'dddd1111-0000-4000-8000-000000000001',
   'dddd2222-0000-4000-8000-000000000002', '2021-01-31', '2021-01-31 23:00 Europe/Rome', '2021-01-31 23:40 Europe/Rome', 1),
  -- Anna, a timer after midnight in Rome, still 31/01 in UTC: February 1st
  ('dddd0000-0000-4000-8000-000000000002', 'dddd1111-0000-4000-8000-000000000002',
   'dddd2222-0000-4000-8000-000000000003', '2021-01-31', '2021-02-01 00:30 Europe/Rome', '2021-02-01 01:00 Europe/Rome', 1),
  -- Anna, outside the period
  ('dddd0000-0000-4000-8000-000000000002', 'dddd1111-0000-4000-8000-000000000001',
   'dddd2222-0000-4000-8000-000000000001', '2021-02-03', null, null, 15),
  -- Zeno, the manager: 90 on Montaggio, 10 on Riprese
  ('dddd0000-0000-4000-8000-000000000001', 'dddd1111-0000-4000-8000-000000000001',
   'dddd2222-0000-4000-8000-000000000001', '2021-01-11', null, null, 90),
  ('dddd0000-0000-4000-8000-000000000001', 'dddd1111-0000-4000-8000-000000000002',
   'dddd2222-0000-4000-8000-000000000003', '2021-01-20', null, null, 10),
  -- the admin: 40 on Montaggio
  ('11111111-1111-4111-8111-111111111111', 'dddd1111-0000-4000-8000-000000000001',
   'dddd2222-0000-4000-8000-000000000001', '2021-01-11', null, null, 40);
-- May 2022, for p_tasks: the two «Revisione video» (002 in Progetto Uno, 004 in Progetto Due)
insert into public.pm_tempo (profile_id, progetto_id, task_id, data, minuti) values
  -- Anna: 25 on Uno's review, 35 on Due's, 60 on Montaggio (not a review), 15 on Due's in June
  ('dddd0000-0000-4000-8000-000000000002', 'dddd1111-0000-4000-8000-000000000001',
   'dddd2222-0000-4000-8000-000000000002', '2022-05-10', 25),
  ('dddd0000-0000-4000-8000-000000000002', 'dddd1111-0000-4000-8000-000000000002',
   'dddd2222-0000-4000-8000-000000000004', '2022-05-12', 35),
  ('dddd0000-0000-4000-8000-000000000002', 'dddd1111-0000-4000-8000-000000000001',
   'dddd2222-0000-4000-8000-000000000001', '2022-05-11', 60),
  ('dddd0000-0000-4000-8000-000000000002', 'dddd1111-0000-4000-8000-000000000002',
   'dddd2222-0000-4000-8000-000000000004', '2022-06-02', 15),
  -- Zeno on Due's review, the admin on Uno's: the same tasks, never Anna's
  ('dddd0000-0000-4000-8000-000000000001', 'dddd1111-0000-4000-8000-000000000002',
   'dddd2222-0000-4000-8000-000000000004', '2022-05-12', 70),
  ('11111111-1111-4111-8111-111111111111', 'dddd1111-0000-4000-8000-000000000001',
   'dddd2222-0000-4000-8000-000000000002', '2022-05-13', 50);

-- Anna's timer, started on 15/01/2021 and still running
insert into public.pm_tempo (profile_id, progetto_id, task_id, data, inizio)
values ('dddd0000-0000-4000-8000-000000000002', 'dddd1111-0000-4000-8000-000000000001',
        'dddd2222-0000-4000-8000-000000000001', '2021-01-15', '2021-01-15 10:00 Europe/Rome');

select is(
  (select array_agg(data::text order by inizio) from public.pm_tempo
   where profile_id = 'dddd0000-0000-4000-8000-000000000002' and fine is not null),
  array['2021-01-31', '2021-02-01'],
  'il giorno di un timer è quello del suo inizio a Roma'
);

-- with ordinality: the order the function returns is part of what is tested
create temp table risultato as
select * from public.pm_mio_tempo_per_task('2021-01-01', '2021-01-31') with ordinality limit 0;
grant all on risultato to authenticated;

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Anna, employee
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"dddd0000-0000-4000-8000-000000000002","role":"authenticated"}';
insert into risultato select * from public.pm_mio_tempo_per_task('2021-01-01', '2021-01-31') with ordinality;

select is(
  (select array[minuti, voci] from risultato where livello = 'totale'),
  array[245, 6],
  'il totale di gennaio: solo il suo tempo fermato o inserito a mano'
);
select is(
  (select array_agg(progetto || ' ' || minuti || ' ' || voci order by ordinality) from risultato where livello = 'progetto'),
  array['Progetto Uno 195 5', 'Progetto Due 50 1'],
  'per progetto, dal progetto con più tempo'
);
select is(
  (select array_agg(coalesce(task, 'senza') || ' ' || minuti || ' ' || voci order by ordinality) from risultato
   where livello = 'task' and progetto = 'Progetto Uno'),
  array['Montaggio 90 2', 'Revisione video 85 2', 'senza 20 1'],
  'per progetto e task, il tempo senza task a parte'
);
select is(
  (select array_agg(livello order by ordinality) from risultato),
  array['totale', 'progetto', 'progetto', 'task', 'task', 'task', 'task'],
  'prima il totale, poi i progetti, poi i task'
);
select is(
  (select minuti from risultato where livello = 'task' and task = 'Montaggio'),
  90,
  'Montaggio: solo le sue voci, mai quelle del manager o dell''admin sullo stesso task'
);
select is(
  (select count(*)::int from risultato where livello = 'task' and task = 'Riprese' and minuti <> 50),
  0,
  'il timer dopo la mezzanotte di Roma non conta a gennaio'
);

-- Europe/Rome days
select is(
  (select array[minuti, voci] from public.pm_mio_tempo_per_task('2021-01-31', '2021-01-31') where livello = 'totale'),
  array[40, 1],
  'il 31/01 di Roma: il timer delle 23'
);
select is(
  (select array_agg(task || ' ' || minuti) from public.pm_mio_tempo_per_task('2021-02-01', '2021-02-01') where livello = 'task'),
  array['Riprese 30'],
  'il 01/02 di Roma: il timer delle 00:30, anche se a Greenwich era ancora il 31'
);

-- Filters
select is(
  (select array_agg(livello || ' ' || coalesce(progetto, '-') || ' ' || minuti order by ordinality)
   from public.pm_mio_tempo_per_task('2021-01-01', '2021-01-31', p_progetto => 'dddd1111-0000-4000-8000-000000000002') with ordinality),
  array['totale - 50', 'progetto Progetto Due 50', 'task Progetto Due 50'],
  'filtrato per progetto'
);
select is(
  (select array_agg(livello || ' ' || coalesce(task, '-') || ' ' || minuti order by ordinality)
   from public.pm_mio_tempo_per_task('2021-01-01', '2021-01-31', p_task => 'dddd2222-0000-4000-8000-000000000002') with ordinality),
  array['totale - 85', 'progetto - 85', 'task Revisione video 85'],
  'filtrato per task'
);
select is(
  (select array_agg(livello || ' ' || minuti || ' ' || voci order by ordinality)
   from public.pm_mio_tempo_per_task('2021-01-01', '2021-01-31',
     p_progetto => 'dddd1111-0000-4000-8000-000000000001', p_task => 'dddd2222-0000-4000-8000-000000000001') with ordinality),
  array['totale 90 2', 'progetto 90 2', 'task 90 2'],
  'filtrato per progetto e task'
);
select is(
  (select array_agg(livello || ' ' || minuti order by ordinality)
   from public.pm_mio_tempo_per_task('2021-01-01', '2021-01-31',
     p_progetto => 'dddd1111-0000-4000-8000-000000000001', p_task => 'dddd2222-0000-4000-8000-000000000003') with ordinality),
  array['totale 0'],
  'un task di un altro progetto: solo il totale a zero'
);
select is(
  (select array_agg(livello || ' ' || minuti || ' ' || voci) from public.pm_mio_tempo_per_task('2021-03-01', '2021-03-31')),
  array['totale 0 0'],
  'un periodo vuoto: solo il totale a zero'
);
select is(
  (select array[minuti, voci] from public.pm_mio_tempo_per_task('2021-01-15', '2021-01-15') where livello = 'totale'),
  array[0, 0],
  'il timer acceso non conta, nemmeno il giorno in cui è partito'
);
select throws_ok(
  $$ select * from public.pm_mio_tempo_per_task('2021-01-31', '2021-01-01') $$,
  '22023', null, 'un periodo al contrario è rifiutato'
);
select throws_ok(
  $$ select * from public.pm_mio_tempo_per_task(null, '2021-01-31') $$,
  '22023', null, 'un periodo senza inizio è rifiutato'
);

-- A set of tasks (p_tasks): «Revisione video» of every client, summed here, never by the model
select is(
  (select array_agg(livello || ' ' || coalesce(progetto, '-') || ' ' || coalesce(task, '-') || ' ' || minuti || ' ' || voci order by ordinality)
   from public.pm_mio_tempo_per_task('2022-05-01', '2022-05-31',
     p_tasks => array['dddd2222-0000-4000-8000-000000000002', 'dddd2222-0000-4000-8000-000000000004']::uuid[]) with ordinality),
  array['totale - - 60 2', 'progetto Progetto Due - 35 1', 'progetto Progetto Uno - 25 1',
        'task Progetto Due Revisione video 35 1', 'task Progetto Uno Revisione video 25 1'],
  'p_tasks: le sue voci sui due task, sommate in totale e per progetto; Montaggio fuori, e mai il tempo di Zeno o dell''admin sugli stessi task'
);
select is(
  (select array[minuti, voci] from public.pm_mio_tempo_per_task('2022-05-01', '2022-06-30',
     p_tasks => array['dddd2222-0000-4000-8000-000000000002', 'dddd2222-0000-4000-8000-000000000004']::uuid[]) where livello = 'totale'),
  array[75, 3],
  'p_tasks con il periodo: maggio e giugno contano anche i 15 minuti di giugno'
);
select is(
  (select array[minuti, voci] from public.pm_mio_tempo_per_task('2022-06-01', '2022-06-30',
     p_tasks => array['dddd2222-0000-4000-8000-000000000002', 'dddd2222-0000-4000-8000-000000000004']::uuid[]) where livello = 'totale'),
  array[15, 1],
  'p_tasks con il periodo: solo giugno, solo i 15 minuti di giugno'
);
select is(
  (select array[minuti, voci] from public.pm_mio_tempo_per_task('2022-05-01', '2022-05-31',
     p_progetto => 'dddd1111-0000-4000-8000-000000000002',
     p_tasks => array['dddd2222-0000-4000-8000-000000000002', 'dddd2222-0000-4000-8000-000000000004']::uuid[]) where livello = 'totale'),
  array[35, 1],
  'p_tasks con un progetto: solo il task di quel progetto'
);
select is(
  (select array_agg(livello || ' ' || minuti) from public.pm_mio_tempo_per_task('2022-05-01', '2022-05-31', p_tasks => '{}'::uuid[])),
  array['totale 0'],
  'un insieme vuoto di task non conta niente'
);
select is(
  (select array[minuti, voci] from public.pm_mio_tempo_per_task('2022-05-01', '2022-05-31') where livello = 'totale'),
  array[120, 3],
  'senza p_tasks, nello stesso periodo, conta anche Montaggio'
);

-- ---------------------------------------------------------------------------
-- Zeno, manager of both projects: he reads the others' time on the projects'
-- Tempo tab, never here
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"dddd0000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  (select count(*)::int from public.pm_tempo where task_id = 'dddd2222-0000-4000-8000-000000000001' and data between '2021-01-01' and '2021-01-31'),
  4,
  'il manager legge le voci degli altri sul suo progetto (RLS)'
);
select is(
  (select array[minuti, voci] from public.pm_mio_tempo_per_task('2021-01-01', '2021-01-31') where livello = 'totale'),
  array[100, 2],
  'il manager: solo il suo tempo'
);
select is(
  (select minuti from public.pm_mio_tempo_per_task('2021-01-01', '2021-01-31', p_task => 'dddd2222-0000-4000-8000-000000000001')
   where livello = 'task'),
  90,
  'il manager su Montaggio: i suoi 90 minuti, mai quelli di Anna o dell''admin'
);
select is(
  (select array[minuti, voci] from public.pm_mio_tempo_per_task('2022-05-01', '2022-05-31',
     p_tasks => array['dddd2222-0000-4000-8000-000000000002', 'dddd2222-0000-4000-8000-000000000004']::uuid[]) where livello = 'totale'),
  array[70, 1],
  'il manager con p_tasks: i suoi 70 minuti, mai quelli di Anna o dell''admin sugli stessi task'
);

-- ---------------------------------------------------------------------------
-- The admin: the others' time is pm_tempo_per_persona, never this
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(
  (select array[minuti, voci] from public.pm_mio_tempo_per_task('2021-01-01', '2021-01-31') where livello = 'totale'),
  array[40, 1],
  'l''admin: solo il suo tempo'
);
select is(
  (select array_agg(progetto || ' › ' || task || ' ' || minuti) from public.pm_mio_tempo_per_task('2021-01-01', '2021-01-31')
   where livello = 'task'),
  array['Progetto Uno › Montaggio 40'],
  'l''admin vede i nomi del progetto e del task'
);
select is(
  (select array[minuti, voci] from public.pm_mio_tempo_per_task('2021-01-01', '2021-01-31',
     p_task => 'dddd2222-0000-4000-8000-000000000002') where livello = 'totale'),
  array[0, 0],
  'l''admin su un task dove ha lavorato solo Anna: zero'
);
select is(
  (select array_agg(livello || ' ' || coalesce(progetto, '-') || ' ' || minuti order by ordinality)
   from public.pm_mio_tempo_per_task('2022-05-01', '2022-05-31',
     p_tasks => array['dddd2222-0000-4000-8000-000000000002', 'dddd2222-0000-4000-8000-000000000004']::uuid[]) with ordinality),
  array['totale - 50', 'progetto Progetto Uno 50', 'task Progetto Uno 50'],
  'l''admin con p_tasks: i suoi 50 minuti, mai quelli di Anna o di Zeno'
);

-- ---------------------------------------------------------------------------
-- The setter, without time in the period: zero, no error
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(
  (select array_agg(livello || ' ' || minuti) from public.pm_mio_tempo_per_task('2021-01-01', '2021-01-31')),
  array['totale 0'],
  'ogni ruolo legge il proprio tempo: il setter senza tempo ha zero'
);

-- ---------------------------------------------------------------------------
-- No session, a deactivated account
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"role":"authenticated"}';
select throws_ok(
  $$ select * from public.pm_mio_tempo_per_task('2021-01-01', '2021-01-31') $$,
  '42501', null, 'senza sessione è rifiutato'
);

reset role;
update public.profiles set attivo = false where id = 'dddd0000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claims to '{"sub":"dddd0000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok(
  $$ select * from public.pm_mio_tempo_per_task('2021-01-01', '2021-01-31') $$,
  '42501', null, 'un account disattivato è rifiutato, anche sul proprio tempo'
);

select * from finish();
rollback;
