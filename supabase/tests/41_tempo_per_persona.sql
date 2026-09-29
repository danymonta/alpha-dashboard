-- Team time per person: the admin reads everyone's logged time, summed in SQL
-- per person, project and task, with each person's latest entries. Never a
-- running timer, never a person without time in the period, people in
-- alphabetical order. Everyone else is refused, the project manager too.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(26);

-- Shape: invoker rights, empty search_path, no anon
select ok(
  (select bool_and(not p.prosecdef and p.proconfig @> array['search_path=""'])
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'pm_tempo_per_persona'),
  'la RPC è security invoker con search_path vuoto'
);
select ok(
  not has_function_privilege('anon', 'public.pm_tempo_per_persona(date, date, uuid, uuid, integer)', 'execute'),
  'anon non la esegue'
);

-- Fixtures: three people. Zeno (a coach who manages projects) is created
-- first and has the smaller id: alphabetical order puts Anna first anyway.
-- Carla logs nothing in the period and must not appear.
insert into public.invites (email, ruolo) values
  ('zeno.tempo@alpha.test', 'coach'),
  ('anna.tempo@alpha.test', 'editor'),
  ('carla.tempo@alpha.test', 'dev');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', 'cccc0000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'zeno.tempo@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Zeno Tempo"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'cccc0000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'anna.tempo@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Anna Tempo"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'cccc0000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'carla.tempo@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Carla Tempo"}'::jsonb, now(), now(), '', '', '', '');
update public.profiles set livello_pm = 'manager' where id = 'cccc0000-0000-4000-8000-000000000001';

-- Two projects with one task each, everybody a member, Zeno managing both
insert into public.pm_progetti (id, reparto_id, nome, created_by) values
  ('cccc1111-0000-4000-8000-000000000001', (select id from public.pm_reparti order by ordine limit 1),
   'Progetto Uno', 'cccc0000-0000-4000-8000-000000000001'),
  ('cccc1111-0000-4000-8000-000000000002', (select id from public.pm_reparti order by ordine limit 1),
   'Progetto Due', 'cccc0000-0000-4000-8000-000000000001');
insert into public.pm_membri (progetto_id, profile_id)
select p.id, pr.id
from unnest(array['cccc1111-0000-4000-8000-000000000001', 'cccc1111-0000-4000-8000-000000000002']::uuid[]) p(id)
cross join unnest(array['cccc0000-0000-4000-8000-000000000001', 'cccc0000-0000-4000-8000-000000000002',
  'cccc0000-0000-4000-8000-000000000003']::uuid[]) pr(id);
insert into public.pm_task (id, progetto_id, titolo, created_by) values
  ('cccc2222-0000-4000-8000-000000000001', 'cccc1111-0000-4000-8000-000000000001', 'Montaggio',
   'cccc0000-0000-4000-8000-000000000001'),
  ('cccc2222-0000-4000-8000-000000000002', 'cccc1111-0000-4000-8000-000000000002', 'Riprese',
   'cccc0000-0000-4000-8000-000000000001');

-- January 2020: far from the seed's recent weeks. Written straight to the table
-- (the owner bypasses RLS; the coherence trigger still runs).
insert into public.pm_tempo (profile_id, progetto_id, task_id, data, inizio, fine, minuti, nota) values
  -- Anna: 60 min on Montaggio, 30 min on Progetto Uno without a task, a stopped timer 09:00-09:45 on Progetto Due
  ('cccc0000-0000-4000-8000-000000000002', 'cccc1111-0000-4000-8000-000000000001',
   'cccc2222-0000-4000-8000-000000000001', '2020-01-10', null, null, 60, 'Primo taglio'),
  ('cccc0000-0000-4000-8000-000000000002', 'cccc1111-0000-4000-8000-000000000001',
   null, '2020-01-12', null, null, 30, null),
  ('cccc0000-0000-4000-8000-000000000002', 'cccc1111-0000-4000-8000-000000000002',
   null, '2020-01-14', '2020-01-14 09:00 Europe/Rome', '2020-01-14 09:45 Europe/Rome', 1, 'Call con il cliente'),
  -- Anna, outside the period
  ('cccc0000-0000-4000-8000-000000000002', 'cccc1111-0000-4000-8000-000000000001',
   null, '2020-02-03', null, null, 20, null),
  -- Zeno: 90 + 15 min on Riprese
  ('cccc0000-0000-4000-8000-000000000001', 'cccc1111-0000-4000-8000-000000000002',
   'cccc2222-0000-4000-8000-000000000002', '2020-01-11', null, null, 90, null),
  ('cccc0000-0000-4000-8000-000000000001', 'cccc1111-0000-4000-8000-000000000002',
   'cccc2222-0000-4000-8000-000000000002', '2020-01-20', null, null, 15, null),
  -- Carla: only outside the period
  ('cccc0000-0000-4000-8000-000000000003', 'cccc1111-0000-4000-8000-000000000001',
   null, '2019-12-31', null, null, 10, null);
-- Anna's timer, started on 15/01/2020 and still running
insert into public.pm_tempo (profile_id, progetto_id, data, inizio)
values ('cccc0000-0000-4000-8000-000000000002', 'cccc1111-0000-4000-8000-000000000001',
        '2020-01-15', '2020-01-15 10:00 Europe/Rome');

-- with ordinality: the order the function returns is part of what is tested
create temp table risultato as
select * from public.pm_tempo_per_persona('2020-01-01', '2020-01-31') with ordinality limit 0;
grant all on risultato to authenticated;

set local role authenticated;

-- ---------------------------------------------------------------------------
-- The admin
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
insert into risultato select * from public.pm_tempo_per_persona('2020-01-01', '2020-01-31') with ordinality;

select is(
  (select array[minuti, voci] from risultato where livello = 'totale'),
  array[240, 5],
  'il totale del periodo: solo tempo fermato o inserito a mano, nel periodo'
);
select is(
  (select array_agg(persona order by ordinality) from risultato where livello = 'persona'),
  array['Anna Tempo', 'Zeno Tempo'],
  'solo chi ha registrato tempo nel periodo, in ordine alfabetico'
);
select is(
  (select count(*)::int from risultato where profile_id = 'cccc0000-0000-4000-8000-000000000003'),
  0,
  'chi non ha registrato niente nel periodo non compare da nessuna parte'
);
select is(
  (select array[minuti, voci] from risultato where livello = 'persona' and persona = 'Anna Tempo'),
  array[135, 3],
  'Anna: 60 + 30 + 45 minuti, il timer acceso non conta'
);
select is(
  (select array[minuti, voci] from risultato where livello = 'persona' and persona = 'Zeno Tempo'),
  array[105, 2],
  'Zeno: 90 + 15 minuti'
);
select is(
  (select array_agg(progetto || ' ' || minuti order by progetto) from risultato
   where livello = 'progetto' and persona = 'Anna Tempo'),
  array['Progetto Due 45', 'Progetto Uno 90'],
  'per persona e progetto'
);
select is(
  (select array_agg(coalesce(task, 'senza') || ' ' || minuti order by minuti desc) from risultato
   where livello = 'task' and persona = 'Anna Tempo' and progetto = 'Progetto Uno'),
  array['Montaggio 60', 'senza 30'],
  'per persona, progetto e task, con il tempo senza task a parte'
);
select is(
  (select array_agg(task || ' ' || minuti) from risultato where livello = 'task' and persona = 'Zeno Tempo'),
  array['Riprese 105'],
  'le voci dello stesso task si sommano'
);
select is(
  (select array_agg(data order by ordinality) from risultato where livello = 'voce' and persona = 'Anna Tempo'),
  array['2020-01-14', '2020-01-12', '2020-01-10']::date[],
  'le voci di una persona dalla più recente'
);
select is(
  (select array[to_char(inizio at time zone 'Europe/Rome', 'HH24:MI'), to_char(fine at time zone 'Europe/Rome', 'HH24:MI'),
     minuti::text, progetto, nota]
   from risultato where livello = 'voce' and data = '2020-01-14'),
  array['09:00', '09:45', '45', 'Progetto Due', 'Call con il cliente'],
  'una voce del timer porta la fascia, i minuti, il progetto e la nota'
);
select is(
  (select array[task, nota] from risultato where livello = 'voce' and data = '2020-01-10'),
  array['Montaggio', 'Primo taglio'],
  'una voce inserita a mano porta il task e la nota'
);
select is(
  (select count(*)::int from risultato where livello = 'voce' and inizio is not null and fine is null),
  0,
  'nessun timer acceso tra le voci'
);
select is(
  (select count(*)::int from risultato where livello = 'voce' and data = '2020-01-15'),
  0,
  'nemmeno il giorno in cui è partito'
);

-- Filters and limit
select is(
  (select array_agg(livello || ' ' || minuti order by livello) from public.pm_tempo_per_persona(
     '2020-01-01', '2020-01-31', p_profilo => 'cccc0000-0000-4000-8000-000000000001')
   where livello in ('totale', 'persona')),
  array['persona 105', 'totale 105'],
  'filtrato per persona'
);
select is(
  (select array_agg(persona || ' ' || minuti order by ordinality) from public.pm_tempo_per_persona(
     '2020-01-01', '2020-01-31', p_progetto => 'cccc1111-0000-4000-8000-000000000002') with ordinality
   where livello = 'persona'),
  array['Anna Tempo 45', 'Zeno Tempo 105'],
  'filtrato per progetto: ogni persona col suo tempo su quel progetto'
);
select is(
  (select array[
     (select count(*)::int from public.pm_tempo_per_persona('2020-01-01', '2020-01-31', p_limite => 1) where livello = 'voce'),
     (select voci from public.pm_tempo_per_persona('2020-01-01', '2020-01-31', p_limite => 1)
      where livello = 'persona' and persona = 'Anna Tempo')]),
  array[2, 3],
  'il limite vale per persona, il conteggio resta quello vero'
);
select is(
  (select array[minuti, voci] from public.pm_tempo_per_persona('2020-03-01', '2020-03-31') where livello = 'totale'),
  array[0, 0],
  'un periodo vuoto: solo il totale a zero'
);
select is(
  (select count(*)::int from public.pm_tempo_per_persona('2020-03-01', '2020-03-31') where livello <> 'totale'),
  0,
  'e nessuna persona'
);
select throws_ok(
  $$ select * from public.pm_tempo_per_persona('2020-01-31', '2020-01-01') $$,
  '22023', null, 'un periodo al contrario è rifiutato'
);

-- ---------------------------------------------------------------------------
-- Everyone else
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok($$ select * from public.pm_tempo_per_persona('2020-01-01', '2020-01-31') $$,
  '42501', null, 'il setter è rifiutato');

set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select throws_ok($$ select * from public.pm_tempo_per_persona('2020-01-01', '2020-01-31') $$,
  '42501', null, 'il closer è rifiutato');

set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select throws_ok($$ select * from public.pm_tempo_per_persona('2020-01-01', '2020-01-31') $$,
  '42501', null, 'il coach è rifiutato');

-- Zeno manages both projects and reads their tab, not the team page
set local request.jwt.claims to '{"sub":"cccc0000-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok($$ select * from public.pm_tempo_per_persona('2020-01-01', '2020-01-31', p_profilo => 'cccc0000-0000-4000-8000-000000000001') $$,
  '42501', null, 'il manager è rifiutato, anche sul proprio tempo');

set local request.jwt.claims to '{"sub":"cccc0000-0000-4000-8000-000000000002","role":"authenticated"}';
select throws_ok($$ select * from public.pm_tempo_per_persona('2020-01-01', '2020-01-31') $$,
  '42501', null, 'l''employee è rifiutato');

select * from finish();
rollback;
