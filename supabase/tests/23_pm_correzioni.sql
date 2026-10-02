-- QA fixes of 28/09/2026: private running timers, stoppable timers, authors that
-- stay authors, 24 hours a day, templates that set the end date.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(13);

insert into public.invites (email, ruolo) values
  ('mgr.correzioni@alpha.test', 'coach'),
  ('emp.correzioni@alpha.test', 'editor');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', 'cccc0000-0000-4000-8000-00000000000a',
   'authenticated', 'authenticated', 'mgr.correzioni@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Manager Correzioni"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'cccc0000-0000-4000-8000-00000000000e',
   'authenticated', 'authenticated', 'emp.correzioni@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Employee Correzioni"}'::jsonb, now(), now(), '', '', '', '');
update public.profiles set livello_pm = 'manager' where id = 'cccc0000-0000-4000-8000-00000000000a';

select ok(
  (select bool_and(exists (select 1 from public.pm_modelli m where m.reparto_id = r.id and m.attivo))
   from public.pm_reparti r),
  'ogni reparto ha almeno un modello di partenza'
);

create temp table ids (chiave text primary key, id uuid);
grant all on ids to authenticated;

-- A dated template of the test's own: "Percorso cliente" is the 8 undated
-- buckets of a client's path since 02/10/2026; this keeps the old dated one.
with modello as (
  insert into public.pm_modelli (reparto_id, nome)
  select r.id, 'Percorso datato (prova)' from public.pm_reparti r where r.nome = 'Fitness Coaching'
  returning id
)
insert into public.pm_modelli_voci (modello_id, tasklist, titolo, ordine, inizio_giorni, durata_giorni)
select modello.id, v.tasklist, v.titolo, v.ordine, v.inizio, v.durata
from modello, (values
  ('Onboarding', 'Questionario iniziale e obiettivi', 1, 0, 2),
  ('Onboarding', 'Invio accessi e materiali di benvenuto', 2, 0, 2),
  ('Onboarding', 'Call di onboarding', 3, 1, 3),
  ('Onboarding', 'Scrittura programmazione', 4, 2, 5),
  ('Percorso', 'Assistenza chat', 10, 0, 90),
  ('Percorso', 'Revisione video settimanale', 11, 7, 77),
  ('Percorso', 'Call di check', 12, 14, 7),
  ('Percorso', 'Aggiornamento programmazione', 13, 28, 7),
  ('Percorso', 'Call di check di metà percorso', 14, 42, 7),
  ('Percorso', 'Aggiornamento programmazione di metà percorso', 15, 45, 7),
  ('Chiusura e rinnovo', 'Call di rinnovo', 20, 75, 7),
  ('Chiusura e rinnovo', 'Raccolta feedback e testimonianza', 21, 84, 7)
) as v(tasklist, titolo, ordine, inizio, durata);

set local role authenticated;

-- The manager creates a project from the template, with the employee inside
set local request.jwt.claims to '{"sub":"cccc0000-0000-4000-8000-00000000000a","role":"authenticated"}';
insert into ids
select 'progetto', public.pm_crea_progetto(
  (select id from public.pm_reparti where nome = 'Fitness Coaching'),
  'Correzioni', null, null,
  (select id from public.pm_modelli where nome = 'Percorso datato (prova)'),
  '2031-03-02', null,
  array['cccc0000-0000-4000-8000-00000000000e']::uuid[]
);

select is(
  (select data_fine from public.pm_progetti where id = (select id from ids where chiave = 'progetto')),
  '2031-05-31'::date,
  'senza data di fine, il progetto finisce dove finisce il modello (l''ultima voce chiude al giorno 91)'
);

insert into ids select 'task_manager', id from public.pm_task
where progetto_id = (select id from ids where chiave = 'progetto') and titolo = 'Call di check';

-- The employee starts a timer and logs time afterwards
set local request.jwt.claims to '{"sub":"cccc0000-0000-4000-8000-00000000000e","role":"authenticated"}';
select public.pm_avvia_timer((select id from ids where chiave = 'progetto'));
insert into public.pm_tempo (progetto_id, data, minuti) values ((select id from ids where chiave = 'progetto'), public.oggi() - 1, 1000);

select throws_ok(
  $$ insert into public.pm_tempo (progetto_id, data, minuti) values ((select id from ids where chiave = 'progetto'), public.oggi() - 1, 500) $$,
  '22023', 'In questo giorno risulterebbero più di 24 ore: controlla le voci già registrate',
  'un giorno non supera le 24 ore'
);

-- a task created "as someone else" is created as yourself
insert into public.pm_task (progetto_id, titolo, created_by)
values ((select id from ids where chiave = 'progetto'), 'Task dell''employee', 'cccc0000-0000-4000-8000-00000000000a');
select is(
  (select created_by from public.pm_task where titolo = 'Task dell''employee'),
  'cccc0000-0000-4000-8000-00000000000e'::uuid,
  'chi crea un task ne è l''autore, qualunque cosa mandi'
);
select throws_ok(
  $$ update public.pm_task set created_by = 'cccc0000-0000-4000-8000-00000000000a'
     where titolo = 'Task dell''employee' $$,
  '42501', null,
  'l''autore di un task non si cambia'
);

insert into public.pm_note (progetto_id, testo) values ((select id from ids where chiave = 'progetto'), 'Nota dell''employee');
select throws_ok(
  $$ update public.pm_note set autore_id = 'cccc0000-0000-4000-8000-00000000000a' where testo = 'Nota dell''employee' $$,
  '42501', 'L''autore di una nota non si cambia',
  'l''autore di una nota non si cambia'
);

-- The manager reads the time already logged, never the running timer
set local request.jwt.claims to '{"sub":"cccc0000-0000-4000-8000-00000000000a","role":"authenticated"}';
select is(
  (select count(*)::int from public.pm_tempo
   where profile_id = 'cccc0000-0000-4000-8000-00000000000e' and inizio is not null and fine is null),
  0, 'il manager non vede il timer acceso dell''employee'
);
select is(
  (select count(*)::int from public.pm_tempo where profile_id = 'cccc0000-0000-4000-8000-00000000000e' and minuti is not null),
  1, 'ma vede il tempo già registrato sul suo progetto'
);

-- Neither does the admin
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(
  (select count(*)::int from public.pm_tempo
   where profile_id = 'cccc0000-0000-4000-8000-00000000000e' and inizio is not null and fine is null),
  0, 'nemmeno l''admin vede i timer accesi degli altri'
);

-- Removed from the project: the timer stops, the minutes stay
select lives_ok(
  $$ delete from public.pm_membri
     where progetto_id = (select id from ids where chiave = 'progetto') and profile_id = 'cccc0000-0000-4000-8000-00000000000e' $$,
  'l''admin toglie l''employee dal progetto'
);

set local request.jwt.claims to '{"sub":"cccc0000-0000-4000-8000-00000000000e","role":"authenticated"}';
select is(
  (select count(*)::int from public.pm_tempo where profile_id = (select auth.uid()) and inizio is not null and fine is null),
  0, 'uscendo dal progetto il suo timer si è fermato'
);
select lives_ok($$ select public.pm_ferma_timer() $$, 'fermare il timer non fallisce mai');
select lives_ok(
  $$ select public.pm_avvia_timer(
       (select m.progetto_id from public.pm_membri m where m.profile_id = (select auth.uid()) limit 1)
     ) where exists (select 1 from public.pm_membri m where m.profile_id = (select auth.uid())) $$,
  'e può avviarne uno su un altro progetto'
);

select * from finish();
rollback;
