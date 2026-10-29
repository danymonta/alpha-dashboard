-- Pause for the timer (1.66.0, 20261105090000_timer_pausa.sql): a running timer
-- pauses and resumes with the clock, its minutes are the time it ran without the
-- pauses, a stopped timer that had pauses keeps only the minutes, and nobody
-- writes the pause by hand.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(17);

-- Fixtures: a manager (coach) and an employee (video editor) in his project
insert into public.invites (email, ruolo) values
  ('manager.pausa@alpha.test', 'coach'),
  ('employee.pausa@alpha.test', 'editor');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', 'cccc1060-0000-4000-8000-00000000000a',
   'authenticated', 'authenticated', 'manager.pausa@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Manager Pausa"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'cccc1060-0000-4000-8000-00000000000e',
   'authenticated', 'authenticated', 'employee.pausa@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Employee Pausa"}'::jsonb, now(), now(), '', '', '', '');
update public.profiles set livello_pm = 'manager' where id = 'cccc1060-0000-4000-8000-00000000000a';

create temp table ids (chiave text primary key, id uuid);
grant all on ids to authenticated;

set local role authenticated;
set local request.jwt.claims to '{"sub":"cccc1060-0000-4000-8000-00000000000a","role":"authenticated"}';
insert into ids
select 'progetto', public.pm_crea_progetto(
  (select id from public.pm_reparti where nome = 'Contenuti e Video'),
  'Timer in pausa',
  null, null, null, null, null,
  array['cccc1060-0000-4000-8000-00000000000e']::uuid[]
);

-- ---------------------------------------------------------------------------
-- Pause and resume follow the clock
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"cccc1060-0000-4000-8000-00000000000e","role":"authenticated"}';
select is(public.pm_pausa_timer(), null, 'senza un timer acceso la pausa non fa niente');
insert into ids select 'timer', public.pm_avvia_timer((select id from ids where chiave = 'progetto'));
select is(public.pm_riprendi_timer(), null, 'un timer che va non si riprende');
select is(public.pm_pausa_timer(), (select id from ids where chiave = 'timer'), 'il timer va in pausa');
select ok(
  (select pausa_dal > clock_timestamp() - interval '1 minute' and pausa_secondi = 0
   from public.pm_tempo where id = (select id from ids where chiave = 'timer')),
  'la pausa parte adesso'
);
select is(public.pm_pausa_timer(), null, 'un timer già in pausa non ci va due volte');

update public.pm_tempo set pausa_dal = clock_timestamp() - interval '3 hours', pausa_secondi = 99999
where id = (select id from ids where chiave = 'timer');
select ok(
  (select pausa_dal > clock_timestamp() - interval '1 minute' and pausa_secondi = 0
   from public.pm_tempo where id = (select id from ids where chiave = 'timer')),
  'la pausa non si scrive a mano'
);
select is(
  (select pausa_dal is not null from public.pm_timer_attivo()), true,
  'pm_timer_attivo dice che il timer è in pausa'
);
select is(public.pm_riprendi_timer(), (select id from ids where chiave = 'timer'), 'il timer riprende');
select ok(
  (select pausa_dal is null from public.pm_tempo where id = (select id from ids where chiave = 'timer')),
  'e torna a contare'
);
select isnt(public.pm_ferma_timer(), null, 'e si ferma come sempre');
select ok(
  (select inizio is not null and fine is not null and pausa_secondi = 0 and pausa_dal is null
   from public.pm_tempo where id = (select id from ids where chiave = 'timer')),
  'una pausa sotto il secondo non cambia niente: la voce tiene inizio e fine'
);

-- ---------------------------------------------------------------------------
-- The minutes: the time it ran, without the pauses (a timer of two hours,
-- written as postgres: 10 minutes of pauses already ended and a pause open
-- since an hour ago)
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims to '{}';
insert into public.pm_tempo (profile_id, progetto_id, data, inizio, pausa_dal, pausa_secondi)
values ('cccc1060-0000-4000-8000-00000000000e', (select id from ids where chiave = 'progetto'), public.oggi(),
        clock_timestamp() - interval '2 hours', clock_timestamp() - interval '1 hour', 600);
insert into ids select 'lungo', id from public.pm_tempo
where profile_id = 'cccc1060-0000-4000-8000-00000000000e' and fine is null and inizio is not null;

set local role authenticated;
set local request.jwt.claims to '{"sub":"cccc1060-0000-4000-8000-00000000000e","role":"authenticated"}';
select is(public.pm_ferma_timer('Montaggio'), (select id from ids where chiave = 'lungo'), 'fermato in pausa');
select is(
  (select minuti from public.pm_tempo where id = (select id from ids where chiave = 'lungo')), 50,
  'conta i minuti in cui è andato: 2 ore meno 1 ora e 10 di pause'
);
select ok(
  (select inizio is null and fine is null and pausa_dal is null and pausa_secondi = 0 and nota = 'Montaggio'
   and data = public.oggi()
   from public.pm_tempo where id = (select id from ids where chiave = 'lungo')),
  'e resta una voce con la sola durata, nel giorno dell''inizio'
);

-- starting another timer stops the paused one the same way
reset role;
set local request.jwt.claims to '{}';
insert into public.pm_tempo (profile_id, progetto_id, data, inizio, pausa_dal)
values ('cccc1060-0000-4000-8000-00000000000e', (select id from ids where chiave = 'progetto'), public.oggi(),
        clock_timestamp() - interval '90 minutes', clock_timestamp() - interval '30 minutes');
insert into ids select 'secondo', id from public.pm_tempo
where profile_id = 'cccc1060-0000-4000-8000-00000000000e' and fine is null and inizio is not null;
set local role authenticated;
set local request.jwt.claims to '{"sub":"cccc1060-0000-4000-8000-00000000000e","role":"authenticated"}';
insert into ids select 'terzo', public.pm_avvia_timer((select id from ids where chiave = 'progetto'));
select is(
  (select minuti from public.pm_tempo where id = (select id from ids where chiave = 'secondo')), 60,
  'avviando un altro timer quello in pausa si ferma senza la pausa'
);

-- ---------------------------------------------------------------------------
-- Only one's own timer, and only a running one has a pause
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"cccc1060-0000-4000-8000-00000000000a","role":"authenticated"}';
select is(public.pm_pausa_timer(), null, 'il manager non mette in pausa il timer di un altro');
set local request.jwt.claims to '{"sub":"cccc1060-0000-4000-8000-00000000000e","role":"authenticated"}';
update public.pm_tempo set pausa_secondi = 1800 where id = (select id from ids where chiave = 'timer');
select ok(
  (select pausa_secondi = 0 and inizio is not null and fine is not null
   from public.pm_tempo where id = (select id from ids where chiave = 'timer')),
  'una voce ferma non riceve una pausa scritta a mano'
);

select * from finish();
rollback;
