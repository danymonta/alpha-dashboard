-- A task can be assigned to more than one person: members only, the assignees
-- work on it, leaving a project drops the assignments, the views and the
-- overview count them in SQL, merging two profiles keeps them.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(36);

-- Fixtures: a manager, two employees and a placeholder profile (the seed setter stays outside)
insert into public.invites (email, ruolo) values
  ('manager.assegna@alpha.test', 'coach'),
  ('anna.assegna@alpha.test', 'editor'),
  ('bruno.assegna@alpha.test', 'editor'),
  ('segnaposto.assegna@prova.invalid', 'editor');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', 'abab0000-0000-4000-8000-00000000000a',
   'authenticated', 'authenticated', 'manager.assegna@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Manager Assegna"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'abab0000-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'anna.assegna@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Anna Assegnata"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'abab0000-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'bruno.assegna@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Bruno Assegnato"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'abab0000-0000-4000-8000-000000000003',
   'authenticated', 'authenticated', 'segnaposto.assegna@prova.invalid', '', now(),
   '{}'::jsonb, '{"full_name":"Segnaposto Task"}'::jsonb, now(), now(), '', '', '', '');
update public.profiles set livello_pm = 'manager' where id = 'abab0000-0000-4000-8000-00000000000a';

select hasnt_column('public', 'pm_task', 'assegnatario_id', 'la colonna dell’assegnatario unico non c’è più');
select ok(
  (select relrowsecurity from pg_class where oid = 'public.pm_task_assegnatari'::regclass),
  'gli assegnatari hanno la RLS attiva'
);
select col_not_null('public', 'pm_task_assegnatari', 'updated_at', 'gli assegnatari hanno updated_at, come ogni tabella');
select has_trigger(
  'public', 'pm_task_assegnatari', 'pm_task_assegnatari_set_updated_at',
  'e il trigger che lo tiene aggiornato'
);
select ok(
  (select 'security_invoker=true' = any (reloptions) from pg_class where oid = 'public.v_pm_task'::regclass),
  'v_pm_task gira ancora con i permessi di chi legge'
);
select is(
  (select array_agg(proname::text order by proname) from pg_proc
   where proname in ('pm_assegnato', 'pm_puo_modificare_task')
     and prosecdef and proconfig @> array['search_path=""']),
  array['pm_assegnato', 'pm_puo_modificare_task'],
  'gli helper dei permessi sono security definer con search_path vuoto'
);

create temp table ids (chiave text primary key, id uuid);
grant all on ids to authenticated;

set local role authenticated;

-- Manager: a project with the two employees and the placeholder, four tasks
set local request.jwt.claims to '{"sub":"abab0000-0000-4000-8000-00000000000a","role":"authenticated"}';
insert into ids
select 'progetto', public.pm_crea_progetto(
  (select id from public.pm_reparti where nome = 'Contenuti e Video'),
  'Progetto a più mani',
  null, null, null, null, null,
  array['abab0000-0000-4000-8000-000000000001', 'abab0000-0000-4000-8000-000000000002',
        'abab0000-0000-4000-8000-000000000003']::uuid[]
);
insert into public.pm_task (progetto_id, titolo, stato, created_by)
select (select id from ids where chiave = 'progetto'), x.titolo, x.stato::public.pm_stato_task,
       'abab0000-0000-4000-8000-00000000000a'
from (values
  ('Montaggio a quattro mani', 'da_fare'),
  ('Copertina', 'da_fare'),
  ('Caption', 'da_fare'),
  ('Già chiuso', 'completato')
) as x(titolo, stato);
insert into ids
select case titolo
         when 'Montaggio a quattro mani' then 'insieme'
         when 'Copertina' then 'copertina'
         when 'Caption' then 'caption'
         else 'chiuso'
       end, id
from public.pm_task where progetto_id = (select id from ids where chiave = 'progetto');

select lives_ok(
  $$ select public.pm_imposta_assegnatari((select id from ids where chiave = 'insieme'),
       array['abab0000-0000-4000-8000-000000000002', 'abab0000-0000-4000-8000-000000000001']::uuid[]) $$,
  'il manager assegna un task a due persone'
);
select lives_ok(
  $$ insert into public.pm_task_assegnatari (task_id, profile_id)
     values ((select id from ids where chiave = 'copertina'), 'abab0000-0000-4000-8000-000000000002') $$,
  'e un altro a una persona sola'
);
select is(
  (select assegnatari from public.v_pm_task where id = (select id from ids where chiave = 'insieme')),
  array['abab0000-0000-4000-8000-000000000001', 'abab0000-0000-4000-8000-000000000002']::uuid[],
  'v_pm_task elenca gli assegnatari, in ordine di nome'
);
select is(
  (select assegnatari from public.v_pm_task where id = (select id from ids where chiave = 'caption')),
  '{}'::uuid[],
  'un task senza assegnatari ha l’elenco vuoto, non null'
);
select throws_ok(
  $$ select public.pm_imposta_assegnatari((select id from ids where chiave = 'copertina'),
       array['abab0000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222']::uuid[]) $$,
  '22023', 'La persona assegnata non fa parte del progetto',
  'si assegna solo a chi è nel progetto'
);
select is(
  (select assegnatari from public.v_pm_task where id = (select id from ids where chiave = 'copertina')),
  array['abab0000-0000-4000-8000-000000000002']::uuid[],
  'e se una persona non va, il task resta com’era'
);
select is(
  (select senza_assegnatario from public.pm_panoramica_progetto((select id from ids where chiave = 'progetto'))),
  1,
  'panoramica: senza assegnatario conta i task aperti senza nessuno (quello chiuso no)'
);

-- Anna: one of the two assignees
set local request.jwt.claims to '{"sub":"abab0000-0000-4000-8000-000000000001","role":"authenticated"}';
select is(
  (select array_agg(titolo order by titolo) from public.v_pm_task
   where 'abab0000-0000-4000-8000-000000000001' = any (assegnatari)),
  array['Montaggio a quattro mani'],
  'I miei task: Anna trova il task che condivide con Bruno'
);
select is(
  (select assegnatari from public.v_pm_task where id = (select id from ids where chiave = 'insieme')),
  array['abab0000-0000-4000-8000-000000000001', 'abab0000-0000-4000-8000-000000000002']::uuid[],
  'e vede chi lo fa con lei'
);
with aggiornati as (
  update public.pm_task set stato = 'completato'
  where id = (select id from ids where chiave = 'insieme') returning completato_il
)
select ok((select completato_il is not null from aggiornati), 'Anna completa il task dove è una delle due persone');
with aggiornati as (
  update public.pm_task set stato = 'in_corso' where id = (select id from ids where chiave = 'copertina') returning 1
)
select is((select count(*)::int from aggiornati), 0, 'Anna non modifica un task dove non è assegnata');
select throws_ok(
  $$ insert into public.pm_task_assegnatari (task_id, profile_id)
     values ((select id from ids where chiave = 'copertina'), 'abab0000-0000-4000-8000-000000000001') $$,
  '42501', null,
  'né si aggiunge da sola a quel task'
);
with tolti as (
  delete from public.pm_task_assegnatari where task_id = (select id from ids where chiave = 'copertina') returning 1
)
select is((select count(*)::int from tolti), 0, 'né ne toglie chi c’è');

-- Bruno: both his tasks; he hands one over
set local request.jwt.claims to '{"sub":"abab0000-0000-4000-8000-000000000002","role":"authenticated"}';
select is(
  (select array_agg(titolo order by titolo) from public.v_pm_task
   where 'abab0000-0000-4000-8000-000000000002' = any (assegnatari)),
  array['Copertina', 'Montaggio a quattro mani'],
  'I miei task: Bruno trova il task condiviso e il suo'
);

-- An employee who wrote a task, without being on it, gives it to someone else
insert into public.pm_task (progetto_id, titolo, created_by)
values ((select id from ids where chiave = 'progetto'), 'Scaletta di Bruno', 'abab0000-0000-4000-8000-000000000002');
insert into ids
select 'di_bruno', id from public.pm_task
where progetto_id = (select id from ids where chiave = 'progetto') and titolo = 'Scaletta di Bruno';
select lives_ok(
  $$ select public.pm_imposta_assegnatari((select id from ids where chiave = 'di_bruno'),
       array['abab0000-0000-4000-8000-000000000001']::uuid[]) $$,
  'chi ha creato un task, senza esserne assegnato, lo assegna a un altro membro'
);
select is(
  (select assegnatari from public.v_pm_task where id = (select id from ids where chiave = 'di_bruno')),
  array['abab0000-0000-4000-8000-000000000001']::uuid[],
  'e il task è di Anna'
);
with aggiornati as (
  update public.pm_task set priorita = 'alta' where id = (select id from ids where chiave = 'di_bruno') returning 1
)
select is((select count(*)::int from aggiornati), 1, 'e chi l’ha creato continua a modificarlo');

select lives_ok(
  $$ select public.pm_imposta_assegnatari((select id from ids where chiave = 'copertina'),
       array['abab0000-0000-4000-8000-000000000001']::uuid[]) $$,
  'chi è assegnato passa il task a un altro membro'
);
with aggiornati as (
  update public.pm_task set priorita = 'alta' where id = (select id from ids where chiave = 'copertina') returning 1
)
select is((select count(*)::int from aggiornati), 0, 'e da quel momento non lo modifica più');

-- Outside the project: no assignment at all
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(
  (select count(*)::int from public.pm_task_assegnatari
   where task_id in (select id from ids where chiave in ('insieme', 'copertina', 'caption'))),
  0,
  'chi non è nel progetto non vede chi ci lavora'
);

-- Manager: Bruno leaves the project, his assignments there go, Anna's stay
set local request.jwt.claims to '{"sub":"abab0000-0000-4000-8000-00000000000a","role":"authenticated"}';
delete from public.pm_membri
where progetto_id = (select id from ids where chiave = 'progetto')
  and profile_id = 'abab0000-0000-4000-8000-000000000002';
select is(
  (select assegnatari from public.v_pm_task where id = (select id from ids where chiave = 'insieme')),
  array['abab0000-0000-4000-8000-000000000001']::uuid[],
  'chi esce dal progetto perde i suoi incarichi, chi resta li tiene'
);
select is(
  (select count(*)::int from public.pm_task_assegnatari where profile_id = 'abab0000-0000-4000-8000-000000000002'),
  0,
  'di Bruno non resta nessun incarico nel progetto'
);

-- Merging the placeholder into Anna: the shared task keeps one Anna, the others pass to her.
-- A second project has only the placeholder: its membership and task move too.
select lives_ok(
  $$ select public.pm_imposta_assegnatari((select id from ids where chiave = 'caption'),
       array['abab0000-0000-4000-8000-000000000003']::uuid[]);
     select public.pm_imposta_assegnatari((select id from ids where chiave = 'insieme'),
       array['abab0000-0000-4000-8000-000000000001', 'abab0000-0000-4000-8000-000000000003']::uuid[]) $$,
  'il segnaposto lavora su un task da solo e su uno con Anna'
);
insert into ids
select 'progetto2', public.pm_crea_progetto(
  (select id from public.pm_reparti where nome = 'Contenuti e Video'),
  'Progetto del segnaposto',
  null, null, null, null, null,
  array['abab0000-0000-4000-8000-000000000003']::uuid[]
);
insert into public.pm_task (progetto_id, titolo, created_by)
values ((select id from ids where chiave = 'progetto2'), 'Solo segnaposto', 'abab0000-0000-4000-8000-00000000000a');
insert into ids
select 'solo', id from public.pm_task where progetto_id = (select id from ids where chiave = 'progetto2');
select lives_ok(
  $$ select public.pm_imposta_assegnatari((select id from ids where chiave = 'solo'),
       array['abab0000-0000-4000-8000-000000000003']::uuid[]) $$,
  'e su un altro progetto, dove Anna non c’è'
);

set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

-- Moving a task to another project (only the admin can): its people must be there too
select throws_ok(
  $$ update public.pm_task set progetto_id = (select id from ids where chiave = 'progetto2')
     where id = (select id from ids where chiave = 'copertina') $$,
  '22023', 'La persona assegnata non fa parte del progetto',
  'un task non passa a un progetto dove chi ci lavora non c’è'
);

select lives_ok(
  $$ select public.unisci_profili('abab0000-0000-4000-8000-000000000003', 'abab0000-0000-4000-8000-000000000001') $$,
  'l’admin unisce il segnaposto ad Anna anche se lavoravano sullo stesso task'
);
select is(
  (select array_agg(array_to_string(assegnatari, ',') order by titolo) from public.v_pm_task
   where id in (select id from ids where chiave in ('insieme', 'caption', 'solo'))),
  array[
    'abab0000-0000-4000-8000-000000000001',
    'abab0000-0000-4000-8000-000000000001',
    'abab0000-0000-4000-8000-000000000001'
  ],
  'dopo l’unione ogni incarico del segnaposto è di Anna, una volta sola'
);
select ok(
  exists (select 1 from public.pm_membri
          where progetto_id = (select id from ids where chiave = 'progetto2')
            and profile_id = 'abab0000-0000-4000-8000-000000000001'),
  'e Anna entra nel progetto dove c’era solo il segnaposto'
);
select lives_ok(
  $$ update public.pm_task set progetto_id = (select id from ids where chiave = 'progetto2')
     where id = (select id from ids where chiave = 'copertina') $$,
  'ora che Anna è in quel progetto, il suo task ci passa'
);

-- Deleting a task takes its assignments with it
delete from public.pm_task where id = (select id from ids where chiave = 'insieme');
select is(
  (select count(*)::int from public.pm_task_assegnatari where task_id = (select id from ids where chiave = 'insieme')),
  0,
  'eliminato il task, se ne vanno anche i suoi incarichi'
);

select * from finish();
rollback;
