-- Project management: who sees which project, who manages it, whose time is whose.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(24);

-- Fixtures: a manager (coach) and an employee (video editor). The seed setter
-- stays outside every project.
insert into public.invites (email, ruolo) values
  ('manager.pm@alpha.test', 'coach'),
  ('employee.pm@alpha.test', 'editor');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', 'aaaa0000-0000-4000-8000-00000000000a',
   'authenticated', 'authenticated', 'manager.pm@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Manager PM"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'aaaa0000-0000-4000-8000-00000000000e',
   'authenticated', 'authenticated', 'employee.pm@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Employee PM"}'::jsonb, now(), now(), '', '', '', '');
update public.profiles set livello_pm = 'manager' where id = 'aaaa0000-0000-4000-8000-00000000000a';

select is((select count(*)::int from public.pm_reparti), 4, 'i quattro reparti di partenza esistono');
select is(
  (select count(*)::int from public.pm_modelli_voci v join public.pm_modelli m on m.id = v.modello_id
   where m.nome = 'Percorso cliente' and v.tasklist is null and v.inizio_giorni is null),
  8,
  'il modello Percorso cliente ha le sue 8 attività, fuori dalle liste e senza date'
);

create temp table ids (chiave text primary key, id uuid);
grant all on ids to authenticated;
-- read before switching role: the manager cannot read clients
-- a client of the test's own, without a project: since 02/10/2026 every paying client has one
with c as (insert into public.clients (nome, cognome) values ('Cliente', 'Senza progetto') returning id)
insert into ids select 'cliente', id from c;

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

-- Employee: no projects of their own
set local request.jwt.claims to '{"sub":"aaaa0000-0000-4000-8000-00000000000e","role":"authenticated"}';
select throws_ok(
  $$ select public.pm_crea_progetto((select id from public.pm_reparti where nome = 'Fitness Coaching'), 'Progetto vietato') $$,
  '42501', 'I progetti li crea un admin o un manager',
  'un employee non crea progetti'
);

-- Manager: creates a client path from the template, with the employee inside
set local request.jwt.claims to '{"sub":"aaaa0000-0000-4000-8000-00000000000a","role":"authenticated"}';
insert into ids
select 'progetto', public.pm_crea_progetto(
  (select id from public.pm_reparti where nome = 'Fitness Coaching'),
  'Cliente di prova',
  null, null,
  (select id from public.pm_modelli where nome = 'Percorso datato (prova)'),
  '2031-03-02',
  null,
  array['aaaa0000-0000-4000-8000-00000000000e']::uuid[]
);

select is(
  (select count(*)::int from public.pm_tasklist where progetto_id = (select id from ids where chiave = 'progetto')),
  3, 'il modello apre le tre liste'
);
select is(
  (select count(*)::int from public.pm_task where progetto_id = (select id from ids where chiave = 'progetto')),
  12, 'e le dodici attività'
);
select is(
  (select array[data_inizio, scadenza] from public.pm_task
   where progetto_id = (select id from ids where chiave = 'progetto') and titolo = 'Call di onboarding'),
  array['2031-03-03', '2031-03-05']::date[],
  'le date dei task partono dall''inizio del progetto'
);
select is(
  (select count(*)::int from public.pm_membri where progetto_id = (select id from ids where chiave = 'progetto')),
  2, 'chi crea il progetto e la persona scelta ne sono membri'
);
select throws_ok(
  $$ select public.pm_crea_progetto((select id from public.pm_reparti where nome = 'Fitness Coaching'), 'Con cliente', null,
       (select id from ids where chiave = 'cliente')) $$,
  '42501', 'Solo l''admin collega un cliente al progetto',
  'solo l''admin collega un cliente'
);

-- the manager gives a task to the employee, and one to nobody
insert into ids
select 'task_manager', id from public.pm_task
where progetto_id = (select id from ids where chiave = 'progetto') and titolo = 'Call di check';
insert into public.pm_task_assegnatari (task_id, profile_id)
values ((select id from ids where chiave = 'task_manager'), 'aaaa0000-0000-4000-8000-00000000000e');

select throws_ok(
  $$ insert into public.pm_task_assegnatari (task_id, profile_id)
     values ((select id from ids where chiave = 'task_manager'), '22222222-2222-4222-8222-222222222222') $$,
  '22023', 'La persona assegnata non fa parte del progetto',
  'un task si assegna solo a chi è nel progetto'
);

-- Employee: sees the project, adds a task, works the assigned one, no lists, no deleting others' work
set local request.jwt.claims to '{"sub":"aaaa0000-0000-4000-8000-00000000000e","role":"authenticated"}';
select is((select count(*)::int from public.pm_progetti), 1, 'l''employee vede il progetto di cui è membro');

select lives_ok(
  $$ insert into public.pm_task (progetto_id, titolo, created_by)
     values ((select id from ids where chiave = 'progetto'), 'Montare il video di benvenuto', 'aaaa0000-0000-4000-8000-00000000000e') $$,
  'l''employee aggiunge un task'
);
select throws_ok(
  $$ insert into public.pm_tasklist (progetto_id, nome) values ((select id from ids where chiave = 'progetto'), 'Lista vietata') $$,
  '42501', null, 'l''employee non crea liste'
);

with aggiornati as (
  update public.pm_task set stato = 'completato'
  where id = (select id from ids where chiave = 'task_manager') returning completato_il
)
select ok((select completato_il is not null from aggiornati), 'l''employee chiude il task assegnato a lui');

with cancellati as (
  delete from public.pm_task
  where progetto_id = (select id from ids where chiave = 'progetto') and titolo = 'Scrittura programmazione'
  returning 1
)
select is((select count(*)::int from cancellati), 0, 'l''employee non cancella i task degli altri');

with modificati as (
  update public.pm_progetti set nome = 'Rinominato' where id = (select id from ids where chiave = 'progetto') returning 1
)
select is((select count(*)::int from modificati), 0, 'l''employee non modifica il progetto');

-- Time: one timer at a time, stopped with its minutes
select lives_ok(
  $$ select public.pm_avvia_timer((select id from ids where chiave = 'progetto'), (select id from ids where chiave = 'task_manager')) $$,
  'l''employee avvia un timer'
);
select lives_ok(
  $$ select public.pm_avvia_timer((select id from ids where chiave = 'progetto')) $$,
  'avviarne un altro ferma il primo'
);
select is(
  (select array[count(*) filter (where fine is null), count(*) filter (where minuti >= 1)]::int[] from public.pm_tempo),
  array[1, 1],
  'un solo timer resta acceso, quello fermato ha i suoi minuti'
);
select lives_ok(
  $$ insert into public.pm_tempo (progetto_id, data, minuti, nota)
     values ((select id from ids where chiave = 'progetto'), public.oggi() - 1, 45, 'montaggio di ieri') $$,
  'il tempo si carica anche dopo'
);
select throws_ok(
  $$ insert into public.pm_tempo (progetto_id, data, minuti) values ((select id from ids where chiave = 'progetto'), public.oggi() + 1, 30) $$,
  '22023', 'Il tempo si registra per oggi o per un giorno passato',
  'non si carica tempo nel futuro'
);

insert into public.pm_note (progetto_id, testo) values ((select id from ids where chiave = 'progetto'), 'Cliente motivato, preferisce le call serali');

-- Manager: reads the time spent on their project
set local request.jwt.claims to '{"sub":"aaaa0000-0000-4000-8000-00000000000a","role":"authenticated"}';
-- 3 entries: the running timer stays private (20260928140000), the other two are readable
select is((select count(*)::int from public.pm_tempo), 2, 'il manager legge il tempo speso sul suo progetto, non il timer acceso');

-- A person outside the project: nothing at all
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(
  (select array[(select count(*) from public.pm_progetti), (select count(*) from public.pm_task),
                (select count(*) from public.pm_tempo), (select count(*) from public.pm_note)]::int[]),
  array[0, 0, 0, 0],
  'chi non è nel progetto non ne vede nulla'
);
select is((select count(*)::int from public.pm_reparti), 4, 'ma vede i reparti');

-- App admin: everything, whatever livello_pm says
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select ok(
  (select count(*) from public.pm_progetti where id = (select id from ids where chiave = 'progetto')) = 1
  -- scoped to this project: the demo seed has time on the other projects
  and (select count(*) from public.pm_tempo where progetto_id = (select id from ids where chiave = 'progetto')) = 2,
  'l''admin vede tutti i progetti e tutto il tempo registrato (non i timer accesi)'
);

select * from finish();
rollback;
