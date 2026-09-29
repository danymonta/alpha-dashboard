-- Review of the time range (29/09/2026): with a session the clock decides a
-- timer (starts now, its start never moves, stops now, a stopped entry never
-- runs again), the day follows the start, and a stopped timer with no range
-- the forms can show keeps its start and end while its day and minutes stay.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(19);

-- Fixtures: a manager (coach) and an employee (video editor) in his project
insert into public.invites (email, ruolo) values
  ('manager.timer@alpha.test', 'coach'),
  ('employee.timer@alpha.test', 'editor');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', 'cccc4300-0000-4000-8000-00000000000a',
   'authenticated', 'authenticated', 'manager.timer@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Manager Timer"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'cccc4300-0000-4000-8000-00000000000e',
   'authenticated', 'authenticated', 'employee.timer@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Employee Timer"}'::jsonb, now(), now(), '', '', '', '');
update public.profiles set livello_pm = 'manager' where id = 'cccc4300-0000-4000-8000-00000000000a';

create temp table ids (chiave text primary key, id uuid);
grant all on ids to authenticated;

set local role authenticated;
set local request.jwt.claims to '{"sub":"cccc4300-0000-4000-8000-00000000000a","role":"authenticated"}';
insert into ids
select 'progetto', public.pm_crea_progetto(
  (select id from public.pm_reparti where nome = 'Contenuti e Video'),
  'Timer protetto',
  null, null, null, null, null,
  array['cccc4300-0000-4000-8000-00000000000e']::uuid[]
);

-- ---------------------------------------------------------------------------
-- The running timer follows the clock (direct writes, as a PATCH would do)
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"cccc4300-0000-4000-8000-00000000000e","role":"authenticated"}';
insert into ids select 'timer', public.pm_avvia_timer((select id from ids where chiave = 'progetto'));

select throws_ok(
  $$ update public.pm_tempo set inizio = clock_timestamp() - interval '1 hour', fine = clock_timestamp() + interval '5 hours'
     where id = (select id from ids where chiave = 'timer') $$,
  '22023',
  'L’inizio di un timer acceso non si cambia',
  'l''inizio di un timer acceso non si sposta indietro'
);
select throws_ok(
  $$ update public.pm_tempo set inizio = null, minuti = 600 where id = (select id from ids where chiave = 'timer') $$,
  '22023',
  'L’inizio di un timer acceso non si cambia',
  'e il timer acceso non diventa una voce a mano'
);

update public.pm_tempo set fine = clock_timestamp() + interval '5 hours' where id = (select id from ids where chiave = 'timer');
select ok(
  -- at least one second after the start, as pm_ferma_timer writes
  (select fine <= greatest(clock_timestamp(), inizio + interval '1 second') and minuti = 1
   from public.pm_tempo where id = (select id from ids where chiave = 'timer')),
  'fermandolo con una fine nel futuro si ferma adesso'
);

insert into public.pm_tempo (progetto_id, data, inizio)
values ((select id from ids where chiave = 'progetto'), public.oggi() - 3, clock_timestamp() - interval '3 days');
select ok(
  (select inizio > clock_timestamp() - interval '1 minute' and data = public.oggi()
   from public.pm_tempo where profile_id = auth.uid() and inizio is not null and fine is null),
  'un timer scritto con un inizio passato parte adesso, nel giorno di oggi'
);
select isnt(public.pm_ferma_timer(), null, 'e si ferma come sempre');

select throws_ok(
  $$ update public.pm_tempo set fine = null, minuti = null where id = (select id from ids where chiave = 'timer') $$,
  '22023',
  'Una voce già ferma non torna un timer acceso',
  'una voce ferma non si riapre come timer'
);

-- the day follows the start: a range does not move to another day alone
insert into ids
select 'fascia', public.pm_registra_tempo((select id from ids where chiave = 'progetto'), '2026-09-21', null, '09:00', '10:00');
update public.pm_tempo set data = '2026-09-09' where id = (select id from ids where chiave = 'fascia');
select is(
  (select data from public.pm_tempo where id = (select id from ids where chiave = 'fascia')),
  '2026-09-21'::date,
  'cambiando solo il giorno la voce resta nel giorno della sua fascia'
);

-- the manager does not stop or move the employee's timer
select public.pm_avvia_timer((select id from ids where chiave = 'progetto'));
set local request.jwt.claims to '{"sub":"cccc4300-0000-4000-8000-00000000000a","role":"authenticated"}';
update public.pm_tempo set fine = clock_timestamp() where profile_id = 'cccc4300-0000-4000-8000-00000000000e' and fine is null;
set local request.jwt.claims to '{"sub":"cccc4300-0000-4000-8000-00000000000e","role":"authenticated"}';
select is(
  (select count(*)::int from public.pm_tempo where profile_id = auth.uid() and inizio is not null and fine is null),
  1,
  'il timer acceso dell''employee resta suo: chi gestisce il progetto non lo ferma'
);
select public.pm_ferma_timer();

-- ---------------------------------------------------------------------------
-- Without a session (seeds, imports) the rows are written as they are
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims to '';
insert into public.pm_tempo (id, profile_id, progetto_id, data, inizio) values
  ('cccc4300-0000-4000-8000-0000000000b0', 'cccc4300-0000-4000-8000-00000000000a', (select id from ids where chiave = 'progetto'),
   '2026-09-20', '2026-09-20 07:00:00+00');
select is(
  (select inizio from public.pm_tempo where id = 'cccc4300-0000-4000-8000-0000000000b0'),
  '2026-09-20 07:00:00+00'::timestamptz,
  'il seed scrive un timer acceso col suo inizio'
);
delete from public.pm_tempo where id = 'cccc4300-0000-4000-8000-0000000000b0';

-- Stopped timers with no range the forms can show, written like the seeds:
-- inside one minute; inside the first 02:xx of 26/10/2025 (summer time);
-- from 02:50 summer time to 02:10 winter time of that night; and one with a
-- range the forms show, 09:00:40–09:10:05.
insert into public.pm_tempo (id, profile_id, progetto_id, data, inizio, fine) values
  ('cccc4300-0000-4000-8000-0000000000b1', 'cccc4300-0000-4000-8000-00000000000e', (select id from ids where chiave = 'progetto'),
   '2026-09-20', '2026-09-20 07:00:05+00', '2026-09-20 07:00:50+00'),
  ('cccc4300-0000-4000-8000-0000000000b2', 'cccc4300-0000-4000-8000-00000000000e', (select id from ids where chiave = 'progetto'),
   '2025-10-26', '2025-10-26 00:10:00+00', '2025-10-26 00:40:00+00'),
  ('cccc4300-0000-4000-8000-0000000000b3', 'cccc4300-0000-4000-8000-00000000000e', (select id from ids where chiave = 'progetto'),
   '2025-10-26', '2025-10-26 00:50:00+00', '2025-10-26 01:10:00+00'),
  ('cccc4300-0000-4000-8000-0000000000b4', 'cccc4300-0000-4000-8000-00000000000e', (select id from ids where chiave = 'progetto'),
   '2026-09-18', '2026-09-18 07:00:40+00', '2026-09-18 07:10:05+00');
set local role authenticated;
set local request.jwt.claims to '{"sub":"cccc4300-0000-4000-8000-00000000000e","role":"authenticated"}';

select public.pm_modifica_tempo('cccc4300-0000-4000-8000-0000000000b1', (select id from ids where chiave = 'progetto'), '2026-09-20', 1, null, null, null, 'Cambio di task');
select is(
  (select array[minuti::text, inizio::text, fine::text, nota] from public.pm_tempo where id = 'cccc4300-0000-4000-8000-0000000000b1'),
  array['1', '2026-09-20 07:00:05+00', '2026-09-20 07:00:50+00', 'Cambio di task'],
  'il timer fermato dentro il suo primo minuto: cambiando la nota tiene inizio e fine'
);
select public.pm_modifica_tempo('cccc4300-0000-4000-8000-0000000000b1', (select id from ids where chiave = 'progetto'), '2026-09-20', 5, null, null, null, 'Cambio di task');
select is(
  (select array[minuti::text, coalesce(inizio::text, 'nessuno'), coalesce(fine::text, 'nessuno')] from public.pm_tempo where id = 'cccc4300-0000-4000-8000-0000000000b1'),
  array['5', 'nessuno', 'nessuno'],
  'cambiando la durata resta solo la durata'
);

select public.pm_modifica_tempo('cccc4300-0000-4000-8000-0000000000b2', (select id from ids where chiave = 'progetto'), '2025-10-26', 30, null, null, null, 'Notte');
select is(
  (select array[minuti::text, inizio::text, fine::text] from public.pm_tempo where id = 'cccc4300-0000-4000-8000-0000000000b2'),
  array['30', '2025-10-26 00:10:00+00', '2025-10-26 00:40:00+00'],
  'il timer nella prima 02:xx del cambio d''ora non si sposta di un''ora'
);
select public.pm_modifica_tempo('cccc4300-0000-4000-8000-0000000000b3', (select id from ids where chiave = 'progetto'), '2025-10-26', 20, null, null, null, 'Notte');
select is(
  (select array[minuti::text, inizio::text, fine::text] from public.pm_tempo where id = 'cccc4300-0000-4000-8000-0000000000b3'),
  array['20', '2025-10-26 00:50:00+00', '2025-10-26 01:10:00+00'],
  'il timer dalle 02:50 estive alle 02:10 invernali tiene inizio e fine'
);
select public.pm_modifica_tempo('cccc4300-0000-4000-8000-0000000000b3', (select id from ids where chiave = 'progetto'), '2025-10-26', null, '01:00', '01:30');
select is(
  (select array[minuti::text, inizio::text] from public.pm_tempo where id = 'cccc4300-0000-4000-8000-0000000000b3'),
  array['30', '2025-10-25 23:00:00+00'],
  'e gli si può dare una fascia nuova'
);

select public.pm_modifica_tempo('cccc4300-0000-4000-8000-0000000000b4', (select id from ids where chiave = 'progetto'), '2026-09-18', 9, null, null, null, 'Senza fascia');
select is(
  (select array[minuti::text, coalesce(inizio::text, 'nessuno'), coalesce(fine::text, 'nessuno')] from public.pm_tempo where id = 'cccc4300-0000-4000-8000-0000000000b4'),
  array['9', 'nessuno', 'nessuno'],
  'la fascia che il modulo mostra si toglie anche a durata invariata'
);

-- a range typed by hand still follows the rules
select throws_ok(
  $$ select public.pm_modifica_tempo('cccc4300-0000-4000-8000-0000000000b4', (select id from ids where chiave = 'progetto'), '2026-09-18', null, '10:00', '09:00') $$,
  '22023',
  'L’ora di fine deve essere dopo quella di inizio',
  'una fascia al contrario non si salva'
);
select throws_ok(
  $$ insert into public.pm_tempo (progetto_id, data, inizio, fine)
     values ((select id from ids where chiave = 'progetto'), public.oggi(), clock_timestamp() - interval '1 minute', clock_timestamp() + interval '1 minute') $$,
  '22023',
  'La fascia non può finire nel futuro',
  'una fascia scritta nella tabella non finisce nel futuro'
);

-- the checks of the function keep their shape
reset role;
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p
   where p.oid = 'public.pm_tempo_coerenza()'::regprocedure),
  'il trigger resta security definer con search_path vuoto'
);
select ok(
  (select not p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p
   where p.oid = 'public.pm_modifica_tempo(uuid, uuid, date, integer, time, time, uuid, text)'::regprocedure)
  and not has_function_privilege('anon', 'public.pm_modifica_tempo(uuid, uuid, date, integer, time, time, uuid, text)', 'execute'),
  'pm_modifica_tempo resta security invoker, senza anon'
);

select * from finish();
rollback;
