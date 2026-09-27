-- Time totals and notes: an employee sums only their own minutes, whoever
-- manages the project sums everyone's, whoever is outside gets nothing.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(27);

-- Fixtures: a manager (coach) and an employee (video editor). The seed setter
-- stays outside the project.
insert into public.invites (email, ruolo) values
  ('manager.tempo@alpha.test', 'coach'),
  ('employee.tempo@alpha.test', 'editor');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', 'bbbb0000-0000-4000-8000-00000000000a',
   'authenticated', 'authenticated', 'manager.tempo@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Manager Tempo"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'bbbb0000-0000-4000-8000-00000000000e',
   'authenticated', 'authenticated', 'employee.tempo@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Employee Tempo"}'::jsonb, now(), now(), '', '', '', '');
update public.profiles set livello_pm = 'manager' where id = 'bbbb0000-0000-4000-8000-00000000000a';

-- Shape of the functions: invoker rights, empty search_path, no anon
select ok(
  (select bool_and(not p.prosecdef and p.proconfig @> array['search_path=""'])
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('pm_timer_attivo', 'pm_riepilogo_tempo', 'pm_tempo_progetto')),
  'le tre RPC sono security invoker con search_path vuoto'
);
select ok(
  not has_function_privilege('anon', 'public.pm_riepilogo_tempo(date, date)', 'execute')
  and not has_function_privilege('anon', 'public.pm_tempo_progetto(uuid, date, date)', 'execute')
  and not has_function_privilege('anon', 'public.pm_timer_attivo()', 'execute'),
  'anon non esegue le RPC del tempo'
);
select ok(
  exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'pm_note'),
  'le note arrivano in tempo reale'
);

create temp table ids (chiave text primary key, id uuid);
grant all on ids to authenticated;

set local role authenticated;

-- Manager: a project with the employee inside and one task
set local request.jwt.claims to '{"sub":"bbbb0000-0000-4000-8000-00000000000a","role":"authenticated"}';
insert into ids
select 'progetto', public.pm_crea_progetto(
  (select id from public.pm_reparti where nome = 'Contenuti e Video'),
  'Video di lancio',
  null, null, null, null, null,
  array['bbbb0000-0000-4000-8000-00000000000e']::uuid[]
);
with nuovo as (
  insert into public.pm_task (progetto_id, titolo, created_by)
  values ((select id from ids where chiave = 'progetto'), 'Montaggio', 'bbbb0000-0000-4000-8000-00000000000a')
  returning id
)
insert into ids select 'task', id from nuovo;

-- the manager's own time: 60 min yesterday on the task, 30 min twenty days ago
insert into public.pm_tempo (progetto_id, task_id, data, minuti) values
  ((select id from ids where chiave = 'progetto'), (select id from ids where chiave = 'task'), public.oggi() - 1, 60),
  ((select id from ids where chiave = 'progetto'), null, public.oggi() - 20, 30);
insert into public.pm_note (progetto_id, testo)
values ((select id from ids where chiave = 'progetto'), 'Brief approvato dal cliente');

-- Employee: 45 min yesterday without task, 15 min two days ago on the task, a timer running now
set local request.jwt.claims to '{"sub":"bbbb0000-0000-4000-8000-00000000000e","role":"authenticated"}';
insert into public.pm_tempo (progetto_id, task_id, data, minuti) values
  ((select id from ids where chiave = 'progetto'), null, public.oggi() - 1, 45),
  ((select id from ids where chiave = 'progetto'), (select id from ids where chiave = 'task'), public.oggi() - 2, 15);
select lives_ok(
  $$ select public.pm_avvia_timer((select id from ids where chiave = 'progetto'), (select id from ids where chiave = 'task')) $$,
  'l''employee avvia un timer'
);

select is(
  (select array[minuti, voci] from public.pm_riepilogo_tempo(public.oggi() - 7, public.oggi()) where livello = 'totale'),
  array[60, 2],
  'l''employee somma solo il proprio tempo, il timer acceso non conta'
);
select is(
  (select array_agg(minuti order by data) from public.pm_riepilogo_tempo(public.oggi() - 7, public.oggi()) where livello = 'giorno'),
  array[15, 45],
  'e lo vede giorno per giorno'
);
select is(
  (select array[progetto, minuti::text] from public.pm_riepilogo_tempo(public.oggi() - 7, public.oggi()) where livello = 'progetto'),
  array['Video di lancio', '60'],
  'e per progetto, col nome'
);
select is(
  (select array[progetto, task] from public.pm_timer_attivo()),
  array['Video di lancio', 'Montaggio'],
  'il timer acceso si legge con progetto e task'
);
select is(
  (select array[minuti, voci] from public.pm_tempo_progetto((select id from ids where chiave = 'progetto'), public.oggi() - 7, public.oggi())
   where livello = 'totale'),
  array[60, 2],
  'nella scheda del progetto l''employee vede solo i propri minuti'
);
select is(
  (select count(*)::int from public.pm_tempo_progetto((select id from ids where chiave = 'progetto'), public.oggi() - 7, public.oggi())
   where livello = 'persona'),
  1,
  'e nessun altro collega'
);

insert into public.pm_note (progetto_id, testo)
values ((select id from ids where chiave = 'progetto'), 'Prima bozza caricata');
with modificate as (
  update public.pm_note set testo = 'Riscritta' where testo = 'Brief approvato dal cliente' returning 1
)
select is((select count(*)::int from modificate), 0, 'l''employee non modifica la nota di un altro');
select is(
  (select count(*)::int from public.pm_note where progetto_id = (select id from ids where chiave = 'progetto')),
  2,
  'ma legge tutte le note del progetto'
);

-- Manager: their own summary stays personal, the project tab sums everyone
set local request.jwt.claims to '{"sub":"bbbb0000-0000-4000-8000-00000000000a","role":"authenticated"}';
select is(
  (select minuti from public.pm_riepilogo_tempo(public.oggi() - 7, public.oggi()) where livello = 'totale'),
  60,
  'il riepilogo del manager conta solo il suo tempo'
);
select is(
  (select minuti from public.pm_riepilogo_tempo(public.oggi() - 30, public.oggi()) where livello = 'totale'),
  90,
  'il periodo decide quali giorni entrano'
);
select is(
  (select count(*)::int from public.pm_timer_attivo()),
  0,
  'il timer dell''employee non è il timer del manager'
);
select is(
  (select array[minuti, voci] from public.pm_tempo_progetto((select id from ids where chiave = 'progetto'), public.oggi() - 7, public.oggi())
   where livello = 'totale'),
  array[120, 3],
  'il manager somma il tempo di tutto il progetto'
);
select is(
  (select array_agg(persona || ':' || minuti order by persona)
   from public.pm_tempo_progetto((select id from ids where chiave = 'progetto'), public.oggi() - 7, public.oggi())
   where livello = 'persona'),
  array['Employee Tempo:60', 'Manager Tempo:60'],
  'per persona'
);
select is(
  (select array_agg(coalesce(task, 'senza task') || ':' || minuti order by task nulls last)
   from public.pm_tempo_progetto((select id from ids where chiave = 'progetto'), public.oggi() - 7, public.oggi())
   where livello = 'task'),
  array['Montaggio:75', 'senza task:45'],
  'per task, e il tempo senza task a parte'
);
select is(
  (select array_agg(minuti order by data)
   from public.pm_tempo_progetto((select id from ids where chiave = 'progetto'), public.oggi() - 7, public.oggi())
   where livello = 'giorno'),
  array[15, 105],
  'per giorno'
);

-- Outside the project: nothing at all
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(
  (select count(*)::int from public.pm_tempo_progetto((select id from ids where chiave = 'progetto'), public.oggi() - 30, public.oggi())),
  0,
  'chi non è nel progetto non riceve nemmeno una riga'
);
select is(
  (select count(*)::int from public.pm_riepilogo_tempo(public.oggi() - 30, public.oggi())
   where progetto_id = (select id from ids where chiave = 'progetto')),
  0,
  'e nel proprio riepilogo non trova il tempo degli altri'
);

-- App admin: the whole project, whatever livello_pm says; edits any note
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(
  (select minuti from public.pm_tempo_progetto((select id from ids where chiave = 'progetto'), public.oggi() - 30, public.oggi())
   where livello = 'totale'),
  150,
  'l''admin vede tutto il tempo del progetto'
);
select is(
  (select count(*)::int from public.pm_riepilogo_tempo(public.oggi() - 30, public.oggi())
   where progetto_id = (select id from ids where chiave = 'progetto')),
  0,
  'ma il suo riepilogo resta suo'
);
with modificate as (
  update public.pm_note set testo = 'Prima bozza caricata e approvata' where testo = 'Prima bozza caricata' returning 1
)
select is((select count(*)::int from modificate), 1, 'l''admin corregge la nota di chiunque');

-- Employee: stops the timer, the minutes land in the totals
set local request.jwt.claims to '{"sub":"bbbb0000-0000-4000-8000-00000000000e","role":"authenticated"}';
select isnt((select public.pm_ferma_timer('fine montaggio')), null, 'l''employee ferma il timer');
select is(
  (select voci from public.pm_riepilogo_tempo(public.oggi() - 7, public.oggi()) where livello = 'totale'),
  3,
  'fermato, il timer entra nel riepilogo'
);
with cancellate as (
  delete from public.pm_note where testo = 'Prima bozza caricata e approvata' returning 1
)
select is((select count(*)::int from cancellate), 1, 'l''autore cancella la propria nota');

select * from finish();
rollback;
