-- The Monday email of team time: last week's logged time per person, project
-- and task, summed in SQL for the cron. Only the service role reads it. The
-- same limits as Tempo › Team: never a running timer, never a person without
-- time in the period, people in alphabetical order.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(23);

-- Shape: definer rights for the cron (no session), empty search_path, service role only
select ok(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'riepilogo_tempo_team'),
  'la RPC è security definer con search_path vuoto'
);
select ok(
  not has_function_privilege('anon', 'public.riepilogo_tempo_team(date, date)', 'execute'),
  'anon non la esegue'
);
select ok(
  not has_function_privilege('authenticated', 'public.riepilogo_tempo_team(date, date)', 'execute'),
  'nessun utente la esegue, nemmeno l''admin: è del cron'
);
select ok(
  has_function_privilege('service_role', 'public.riepilogo_tempo_team(date, date)', 'execute'),
  'il service role (il cron) la esegue'
);

-- Fixtures: Zeno is created first and has the smaller id: alphabetical order
-- puts Anna first anyway. Carla logs only outside the week and must not appear.
insert into public.invites (email, ruolo) values
  ('zeno.settimana@alpha.test', 'coach'),
  ('anna.settimana@alpha.test', 'editor'),
  ('carla.settimana@alpha.test', 'dev');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', 'dddd0000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'zeno.settimana@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Zeno Settimana"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'dddd0000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'anna.settimana@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Anna Settimana"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'dddd0000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'carla.settimana@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Carla Settimana"}'::jsonb, now(), now(), '', '', '', '');

-- Anna's two projects, seven tasks on the first; Zeno's twelve projects
insert into public.pm_progetti (id, reparto_id, nome, created_by) values
  ('dddd1111-0000-4000-8000-000000000001', (select id from public.pm_reparti order by ordine limit 1),
   'Progetto Uno', 'dddd0000-0000-4000-8000-000000000001'),
  ('dddd1111-0000-4000-8000-000000000002', (select id from public.pm_reparti order by ordine limit 1),
   'Progetto Due', 'dddd0000-0000-4000-8000-000000000001');
insert into public.pm_progetti (id, reparto_id, nome, created_by)
select ('dddd3333-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       (select id from public.pm_reparti order by ordine limit 1),
       'Zeta ' || lpad(n::text, 2, '0'), 'dddd0000-0000-4000-8000-000000000001'
from generate_series(1, 12) n;
insert into public.pm_membri (progetto_id, profile_id)
select p.id, pr.id
from public.pm_progetti p
cross join unnest(array['dddd0000-0000-4000-8000-000000000001', 'dddd0000-0000-4000-8000-000000000002',
  'dddd0000-0000-4000-8000-000000000003']::uuid[]) pr(id)
where p.created_by = 'dddd0000-0000-4000-8000-000000000001';
insert into public.pm_task (id, progetto_id, titolo, created_by)
select ('dddd2222-0000-4000-8000-00000000000' || n)::uuid, 'dddd1111-0000-4000-8000-000000000001',
       'Task ' || n, 'dddd0000-0000-4000-8000-000000000001'
from generate_series(1, 7) n;

-- The week: Monday 02/03/2020 to Sunday 08/03/2020. Written straight to the
-- table (the owner bypasses RLS; the coherence trigger still runs).
-- Anna, Progetto Uno: Task 1..7 for 70, 60, 50, 40, 30, 20, 10 min, and 45 min without a task
insert into public.pm_tempo (profile_id, progetto_id, task_id, data, minuti)
select 'dddd0000-0000-4000-8000-000000000002', 'dddd1111-0000-4000-8000-000000000001',
       ('dddd2222-0000-4000-8000-00000000000' || n)::uuid, '2020-03-02'::date + (n % 7), 80 - 10 * n
from generate_series(1, 7) n;
insert into public.pm_tempo (profile_id, progetto_id, task_id, data, minuti) values
  ('dddd0000-0000-4000-8000-000000000002', 'dddd1111-0000-4000-8000-000000000001', null, '2020-03-08', 45),
  -- Anna, outside the week, on both sides
  ('dddd0000-0000-4000-8000-000000000002', 'dddd1111-0000-4000-8000-000000000001', null, '2020-03-01', 500),
  ('dddd0000-0000-4000-8000-000000000002', 'dddd1111-0000-4000-8000-000000000001', null, '2020-03-09', 500),
  -- Carla: only outside the week
  ('dddd0000-0000-4000-8000-000000000003', 'dddd1111-0000-4000-8000-000000000001', null, '2020-02-28', 60);
-- Anna, Progetto Due: a stopped timer 09:00-09:45 (the trigger counts 45 minutes)
insert into public.pm_tempo (profile_id, progetto_id, data, inizio, fine, minuti) values
  ('dddd0000-0000-4000-8000-000000000002', 'dddd1111-0000-4000-8000-000000000002', '2020-03-04',
   '2020-03-04 09:00 Europe/Rome', '2020-03-04 09:45 Europe/Rome', 1);
-- Anna's timer, started on 05/03/2020 and still running
insert into public.pm_tempo (profile_id, progetto_id, data, inizio)
values ('dddd0000-0000-4000-8000-000000000002', 'dddd1111-0000-4000-8000-000000000002',
        '2020-03-05', '2020-03-05 10:00 Europe/Rome');
-- Zeno: Zeta 01..12 for 10, 20, ... 120 min
insert into public.pm_tempo (profile_id, progetto_id, data, minuti)
select 'dddd0000-0000-4000-8000-000000000001', ('dddd3333-0000-4000-8000-0000000000' || lpad(n::text, 2, '0'))::uuid,
       '2020-03-03', 10 * n
from generate_series(1, 12) n;

create temp table r as select public.riepilogo_tempo_team('2020-03-02', '2020-03-08') as j;

select is(
  (select array[(j ->> 'minuti')::int, (j ->> 'voci')::int] from r),
  array[1150, 21],
  'il totale della settimana: solo tempo fermato o inserito a mano, nella settimana'
);
select is(
  (select array_agg(x ->> 'nome' order by o) from r, jsonb_array_elements(j -> 'persone') with ordinality e(x, o)),
  array['Anna Settimana', 'Zeno Settimana'],
  'solo chi ha registrato tempo nella settimana, in ordine alfabetico, mai per ore'
);
select is(
  (select array[(x ->> 'minuti')::int, (x ->> 'voci')::int]
   from r, jsonb_array_elements(j -> 'persone') x where x ->> 'nome' = 'Anna Settimana'),
  array[370, 9],
  'Anna: 325 + 45 minuti, il timer acceso non conta, i giorni fuori dalla settimana nemmeno'
);
select is(
  (select array_agg((p ->> 'nome') || ' ' || (p ->> 'minuti') order by o)
   from r, jsonb_array_elements(j -> 'persone') x, jsonb_array_elements(x -> 'progetti') with ordinality e(p, o)
   where x ->> 'nome' = 'Anna Settimana'),
  array['Progetto Uno 325', 'Progetto Due 45'],
  'dentro una persona i progetti vanno per tempo'
);
select is(
  (select array_agg(coalesce(t ->> 'titolo', 'senza') || ' ' || (t ->> 'minuti') order by o)
   from r, jsonb_array_elements(j -> 'persone') x, jsonb_array_elements(x -> 'progetti') p,
        jsonb_array_elements(p -> 'task') with ordinality e(t, o)
   where x ->> 'nome' = 'Anna Settimana' and p ->> 'nome' = 'Progetto Uno'),
  array['Task 1 70', 'Task 2 60', 'Task 3 50', 'Task 4 40', 'Task 5 30'],
  'i 5 task con più tempo: il tempo senza task (45 min, il quarto) non prende il posto di un task'
);
select is(
  (select (p ->> 'senza_task_minuti')::int
   from r, jsonb_array_elements(j -> 'persone') x, jsonb_array_elements(x -> 'progetti') p
   where x ->> 'nome' = 'Anna Settimana' and p ->> 'nome' = 'Progetto Uno'),
  45,
  'il tempo senza task sta a parte'
);
select is(
  (select array[(p ->> 'altri_task')::int, (p ->> 'altri_task_minuti')::int]
   from r, jsonb_array_elements(j -> 'persone') x, jsonb_array_elements(x -> 'progetti') p
   where x ->> 'nome' = 'Anna Settimana' and p ->> 'nome' = 'Progetto Uno'),
  array[2, 30],
  'gli altri task sono solo task veri, con i loro minuti'
);
select is(
  (select array[jsonb_array_length(p -> 'task'), (p ->> 'senza_task_minuti')::int, (p ->> 'altri_task')::int]
   from r, jsonb_array_elements(j -> 'persone') x, jsonb_array_elements(x -> 'progetti') p
   where x ->> 'nome' = 'Anna Settimana' and p ->> 'nome' = 'Progetto Due'),
  array[0, 45, 0],
  'un progetto con solo tempo senza task: nessun task, nessun "altro task"'
);
select ok(
  (select bool_and(
     (p ->> 'minuti')::int =
       coalesce((select sum((t ->> 'minuti')::int) from jsonb_array_elements(p -> 'task') t), 0)
       + (p ->> 'senza_task_minuti')::int + (p ->> 'altri_task_minuti')::int)
   from r, jsonb_array_elements(j -> 'persone') x, jsonb_array_elements(x -> 'progetti') p),
  'ogni progetto torna: task elencati + senza task + altri task'
);
select is(
  (select (p ->> 'voci')::int
   from r, jsonb_array_elements(j -> 'persone') x, jsonb_array_elements(x -> 'progetti') p
   where x ->> 'nome' = 'Anna Settimana' and p ->> 'nome' = 'Progetto Uno'),
  8,
  'le voci del progetto, comprese quelle dei task oltre i primi 5'
);
select is(
  (select array[(x ->> 'minuti')::int, (x ->> 'voci')::int]
   from r, jsonb_array_elements(j -> 'persone') x where x ->> 'nome' = 'Zeno Settimana'),
  array[780, 12],
  'Zeno: 10 + 20 + ... + 120 minuti'
);
select is(
  (select array_agg(p ->> 'nome' order by o)
   from r, jsonb_array_elements(j -> 'persone') x, jsonb_array_elements(x -> 'progetti') with ordinality e(p, o)
   where x ->> 'nome' = 'Zeno Settimana'),
  array['Zeta 12', 'Zeta 11', 'Zeta 10', 'Zeta 09', 'Zeta 08', 'Zeta 07', 'Zeta 06', 'Zeta 05', 'Zeta 04', 'Zeta 03'],
  'i 10 progetti con più tempo'
);
select is(
  (select array[(x ->> 'altri_progetti')::int, (x ->> 'altri_progetti_minuti')::int]
   from r, jsonb_array_elements(j -> 'persone') x where x ->> 'nome' = 'Zeno Settimana'),
  array[2, 30],
  'gli altri progetti si contano, con i loro minuti: il totale della persona torna'
);
select is(
  (select count(*)::int from r, jsonb_array_elements(j -> 'persone') x where x ->> 'nome' = 'Carla Settimana'),
  0,
  'chi non ha registrato niente nella settimana non compare'
);
select ok(
  (select position('Carla' in j::text) = 0 from r),
  'nemmeno il suo nome da qualche parte'
);
select is(
  public.riepilogo_tempo_team('1990-01-01', '1990-01-07'),
  '{"a": "1990-01-07", "da": "1990-01-01", "voci": 0, "minuti": 0, "persone": []}'::jsonb,
  'una settimana senza tempo: zero e nessuna persona'
);
select throws_ok(
  $$ select public.riepilogo_tempo_team('2020-03-08', '2020-03-02') $$,
  '22023', null,
  'un periodo al contrario è rifiutato'
);
select throws_ok(
  $$ select public.riepilogo_tempo_team(null, '2020-03-02') $$,
  '22023', null,
  'un periodo senza inizio è rifiutato'
);

-- an admin with a session does not read it: Tempo › Team is the admin's page
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok(
  $$ select public.riepilogo_tempo_team('2020-03-02', '2020-03-08') $$,
  '42501', null,
  'un utente non legge il riepilogo del tempo, nemmeno l''admin'
);

select * from finish();
rollback;
