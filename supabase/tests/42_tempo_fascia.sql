-- Time typed afterwards with its range ("Dalle"–"Alle", Dany 29/09/2026):
-- start and end built in Europe/Rome from the day and HH:mm (DST included),
-- the minutes computed from them; the range can be added, changed, removed.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(34);

-- Fixtures: a manager (coach), an employee (video editor) in the project, and
-- an editor outside it.
insert into public.invites (email, ruolo) values
  ('manager.fascia@alpha.test', 'coach'),
  ('employee.fascia@alpha.test', 'editor'),
  ('esterno.fascia@alpha.test', 'editor');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', 'cccc4200-0000-4000-8000-00000000000a',
   'authenticated', 'authenticated', 'manager.fascia@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Manager Fascia"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'cccc4200-0000-4000-8000-00000000000e',
   'authenticated', 'authenticated', 'employee.fascia@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Employee Fascia"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'cccc4200-0000-4000-8000-00000000000f',
   'authenticated', 'authenticated', 'esterno.fascia@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Esterno Fascia"}'::jsonb, now(), now(), '', '', '', '');
update public.profiles set livello_pm = 'manager' where id = 'cccc4200-0000-4000-8000-00000000000a';

-- Shape: invoker rights, empty search_path, no anon
select ok(
  (select bool_and(not p.prosecdef and p.proconfig @> array['search_path=""'])
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('pm_fascia_tempo', 'pm_registra_tempo', 'pm_modifica_tempo')),
  'le funzioni della fascia sono security invoker con search_path vuoto'
);
select ok(
  not has_function_privilege('anon', 'public.pm_registra_tempo(uuid, date, integer, time, time, uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.pm_modifica_tempo(uuid, uuid, date, integer, time, time, uuid, text)', 'execute')
  and not has_function_privilege('anon', 'public.pm_fascia_tempo(date, time, time)', 'execute'),
  'anon non esegue le funzioni della fascia'
);

-- Europe/Rome, the two DST days of 2026
select is(
  (select extract(epoch from (f.fine - f.inizio))::int / 60 from public.pm_fascia_tempo('2026-10-25', '00:30', '03:30') f),
  240,
  '25/10/2026, fine dell''ora legale: dalle 00:30 alle 03:30 sono 4 ore'
);
select is(
  (select extract(epoch from (f.fine - f.inizio))::int / 60 from public.pm_fascia_tempo('2026-03-29', '01:30', '03:30') f),
  60,
  '29/03/2026, inizio dell''ora legale: dalle 01:30 alle 03:30 è un''ora'
);
select is(
  (select array[f.inizio, f.fine] from public.pm_fascia_tempo('2026-10-25', '02:30', '02:45') f),
  array['2026-10-25 01:30+00', '2026-10-25 01:45+00']::timestamptz[],
  'l''ora che si ripete a ottobre conta dopo il cambio'
);
select is(
  (select f.inizio from public.pm_fascia_tempo('2026-03-29', '02:30', '03:30') f),
  '2026-03-29 01:30+00'::timestamptz,
  'l''ora che manca a marzo conta prima del cambio'
);
select throws_ok(
  $$ select * from public.pm_fascia_tempo('2026-09-21', '09:00', null) $$,
  '22023',
  'Indica sia l’inizio sia la fine, o nessuno dei due',
  'solo l''inizio non basta'
);

create temp table ids (chiave text primary key, id uuid);
grant all on ids to authenticated;

set local role authenticated;

-- Manager: the project, with the employee inside
set local request.jwt.claims to '{"sub":"cccc4200-0000-4000-8000-00000000000a","role":"authenticated"}';
insert into ids
select 'progetto', public.pm_crea_progetto(
  (select id from public.pm_reparti where nome = 'Contenuti e Video'),
  'Fascia di prova',
  null, null, null, null, null,
  array['cccc4200-0000-4000-8000-00000000000e']::uuid[]
);

-- Employee
set local request.jwt.claims to '{"sub":"cccc4200-0000-4000-8000-00000000000e","role":"authenticated"}';

insert into ids
select 'fascia', public.pm_registra_tempo((select id from ids where chiave = 'progetto'), '2026-09-21', null, '09:00', '10:30', null, 'Montaggio');
select is(
  (select array[minuti::text, inizio::text, fine::text, data::text, nota] from public.pm_tempo where id = (select id from ids where chiave = 'fascia')),
  array['90', '2026-09-21 07:00:00+00', '2026-09-21 08:30:00+00', '2026-09-21', 'Montaggio'],
  'dalle 09:00 alle 10:30 in Europe/Rome: 90 minuti calcolati dal database'
);

insert into ids
select 'marzo', public.pm_registra_tempo((select id from ids where chiave = 'progetto'), '2026-03-29', null, '01:30', '03:30');
select is(
  (select array[minuti::text, data::text] from public.pm_tempo where id = (select id from ids where chiave = 'marzo')),
  array['60', '2026-03-29'],
  'il giorno in cui arriva l''ora legale la fascia conta l''ora vera'
);

insert into ids
select 'ottobre', public.pm_registra_tempo((select id from ids where chiave = 'progetto'), '2025-10-26', null, '00:30', '03:30');
select is(
  (select minuti from public.pm_tempo where id = (select id from ids where chiave = 'ottobre')),
  240,
  'il giorno in cui finisce l''ora legale (26/10/2025) dalle 00:30 alle 03:30 sono 240 minuti'
);

select throws_ok(
  $$ select public.pm_registra_tempo((select id from ids where chiave = 'progetto'), '2025-10-26', null, '00:00', '23:59') $$,
  '22023',
  'Al massimo 24 ore in una voce',
  'il giorno di 25 ore una fascia di tutto il giorno supera le 24 ore'
);
select throws_ok(
  $$ select public.pm_registra_tempo((select id from ids where chiave = 'progetto'), '2026-09-21', null, '10:30', '09:00') $$,
  '22023',
  'L’ora di fine deve essere dopo quella di inizio',
  'la fine prima dell''inizio non si salva'
);
select throws_ok(
  $$ select public.pm_registra_tempo((select id from ids where chiave = 'progetto'), '2026-03-29', null, '02:30', '03:15') $$,
  '22023',
  'L’ora di fine deve essere dopo quella di inizio',
  'dalle 02:30, che a marzo non esiste, alle 03:15 si torna indietro'
);
select throws_ok(
  $$ select public.pm_registra_tempo((select id from ids where chiave = 'progetto'), '2026-09-21', 30, null, '10:00') $$,
  '22023',
  'Indica sia l’inizio sia la fine, o nessuno dei due',
  'solo la fine non basta, anche con i minuti'
);
select throws_ok(
  $$ select public.pm_registra_tempo((select id from ids where chiave = 'progetto'), '2026-09-21') $$,
  '22023',
  'Scrivi la durata o la fascia oraria',
  'senza durata né fascia non si salva'
);

insert into ids
select 'minuti', public.pm_registra_tempo((select id from ids where chiave = 'progetto'), '2026-09-23', 45);
select is(
  (select array[minuti::text, coalesce(inizio::text, 'nessuno'), coalesce(fine::text, 'nessuno')] from public.pm_tempo where id = (select id from ids where chiave = 'minuti')),
  array['45', 'nessuno', 'nessuno'],
  'senza fascia restano i minuti scritti, come prima'
);

-- The trigger guards a range written straight into the table too
select throws_ok(
  $$ insert into public.pm_tempo (progetto_id, data, inizio, fine)
     values ((select id from ids where chiave = 'progetto'), public.oggi(), clock_timestamp() - interval '1 minute', clock_timestamp() + interval '1 minute') $$,
  '22023',
  'La fascia non può finire nel futuro',
  'una fascia non finisce nel futuro'
);
select throws_ok(
  $$ insert into public.pm_tempo (progetto_id, data, inizio, fine)
     values ((select id from ids where chiave = 'progetto'), '2026-09-21', '2026-09-21 20:00+00', '2026-09-21 23:00+00') $$,
  '22023',
  'Inizio e fine devono stare nello stesso giorno',
  'una fascia scritta a mano sta in un giorno solo'
);

-- 24 hours per person and day count the ranges too
select lives_ok(
  $$ select public.pm_registra_tempo((select id from ids where chiave = 'progetto'), '2026-09-22', 1400) $$,
  '23 ore e 20 minuti scritti a mano'
);
select throws_ok(
  $$ select public.pm_registra_tempo((select id from ids where chiave = 'progetto'), '2026-09-22', null, '09:00', '11:00') $$,
  '22023',
  'In questo giorno risulterebbero più di 24 ore: controlla le voci già registrate',
  'una fascia in più non fa superare le 24 ore del giorno'
);

-- Correcting: add a range, change it, remove it
select isnt(
  public.pm_modifica_tempo((select id from ids where chiave = 'minuti'), (select id from ids where chiave = 'progetto'), '2026-09-23', 45, '14:00', '16:00'),
  null,
  'alla voce scritta a mano si aggiunge la fascia'
);
select is(
  (select array[minuti::text, inizio::text, fine::text] from public.pm_tempo where id = (select id from ids where chiave = 'minuti')),
  array['120', '2026-09-23 12:00:00+00', '2026-09-23 14:00:00+00'],
  'e i minuti diventano quelli della fascia'
);
select public.pm_modifica_tempo((select id from ids where chiave = 'minuti'), (select id from ids where chiave = 'progetto'), '2026-09-23', null, '15:00', '15:30');
select is(
  (select minuti from public.pm_tempo where id = (select id from ids where chiave = 'minuti')),
  30,
  'cambiando la fascia cambiano i minuti'
);
select public.pm_modifica_tempo((select id from ids where chiave = 'minuti'), (select id from ids where chiave = 'progetto'), '2026-09-23', 30, null, null);
select is(
  (select array[minuti::text, coalesce(inizio::text, 'nessuno'), coalesce(fine::text, 'nessuno')] from public.pm_tempo where id = (select id from ids where chiave = 'minuti')),
  array['30', 'nessuno', 'nessuno'],
  'togliendo la fascia restano i minuti scritti'
);

-- Stopped timers written like the seeds (no session): one with seconds, one across midnight
reset role;
set local request.jwt.claims to '';
insert into public.pm_tempo (id, profile_id, progetto_id, data, inizio, fine) values
  ('cccc4200-0000-4000-8000-0000000000a1', 'cccc4200-0000-4000-8000-00000000000e', (select id from ids where chiave = 'progetto'),
   '2026-09-20', '2026-09-20 07:00:40+00', '2026-09-20 07:10:05+00'),
  ('cccc4200-0000-4000-8000-0000000000a2', 'cccc4200-0000-4000-8000-00000000000e', (select id from ids where chiave = 'progetto'),
   '2026-09-19', '2026-09-19 21:30:00+00', '2026-09-19 22:30:00+00');
set local role authenticated;
set local request.jwt.claims to '{"sub":"cccc4200-0000-4000-8000-00000000000e","role":"authenticated"}';

select public.pm_modifica_tempo('cccc4200-0000-4000-8000-0000000000a1', (select id from ids where chiave = 'progetto'), '2026-09-20', 10, '09:00', '09:10', null, 'Tagli');
select is(
  (select array[minuti::text, inizio::text, nota] from public.pm_tempo where id = 'cccc4200-0000-4000-8000-0000000000a1'),
  array['9', '2026-09-20 07:00:40+00', 'Tagli'],
  'la stessa fascia mostrata tiene i secondi del timer, e i suoi minuti'
);
select public.pm_modifica_tempo('cccc4200-0000-4000-8000-0000000000a1', (select id from ids where chiave = 'progetto'), '2026-09-20', null, '09:00', '09:20', null, 'Tagli');
select is(
  (select array[minuti::text, inizio::text] from public.pm_tempo where id = 'cccc4200-0000-4000-8000-0000000000a1'),
  array['20', '2026-09-20 07:00:00+00'],
  'una fascia corretta si ricostruisce al minuto'
);
select public.pm_modifica_tempo('cccc4200-0000-4000-8000-0000000000a2', (select id from ids where chiave = 'progetto'), '2026-09-19', 60, null, null, null, 'Consegna notturna');
select is(
  (select array[minuti::text, inizio::text, fine::text, nota] from public.pm_tempo where id = 'cccc4200-0000-4000-8000-0000000000a2'),
  array['60', '2026-09-19 21:30:00+00', '2026-09-19 22:30:00+00', 'Consegna notturna'],
  'il timer a cavallo della mezzanotte tiene inizio e fine se giorno e minuti restano'
);

-- A running timer is corrected only once stopped, and stopping it still works
select lives_ok(
  $$ select public.pm_avvia_timer((select id from ids where chiave = 'progetto')) $$,
  'l''employee avvia un timer'
);
select throws_ok(
  $$ select public.pm_modifica_tempo(
       (select id from public.pm_tempo where profile_id = auth.uid() and fine is null and inizio is not null),
       (select id from ids where chiave = 'progetto'), public.oggi(), null, '09:00', '09:30') $$,
  '22023',
  'Il timer è ancora acceso: fermalo prima di correggerlo',
  'il timer acceso non si corregge'
);
select isnt(public.pm_ferma_timer(), null, 'e si ferma come sempre');

-- The manager reads the employee's time but does not correct it
set local request.jwt.claims to '{"sub":"cccc4200-0000-4000-8000-00000000000a","role":"authenticated"}';
select is(
  public.pm_modifica_tempo((select id from ids where chiave = 'fascia'), (select id from ids where chiave = 'progetto'), '2026-09-21', null, '08:00', '12:00'),
  null,
  'chi gestisce il progetto non corregge il tempo di un altro'
);

-- Outside the project: nothing to read, nothing to write
set local request.jwt.claims to '{"sub":"cccc4200-0000-4000-8000-00000000000f","role":"authenticated"}';
select throws_ok(
  $$ select public.pm_modifica_tempo((select id from ids where chiave = 'fascia'), (select id from ids where chiave = 'progetto'), '2026-09-21', null, '08:00', '12:00') $$,
  '22023',
  'Voce non trovata',
  'chi è fuori non vede la voce'
);
select throws_ok(
  $$ select public.pm_registra_tempo((select id from ids where chiave = 'progetto'), '2026-09-21', null, '09:00', '10:00') $$,
  '42501',
  'Progetto non trovato o non tuo',
  'e non registra tempo sul progetto'
);

reset role;
select is(
  (select array[minuti::text, inizio::text] from public.pm_tempo where id = (select id from ids where chiave = 'fascia')),
  array['90', '2026-09-21 07:00:00+00'],
  'la voce dell''employee è rimasta com''era'
);

select * from finish();
rollback;
