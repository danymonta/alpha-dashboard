-- Projects screens: progress computed in SQL through security_invoker views,
-- sub-task and membership consistency, ordering, client link only by the admin.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(31);

-- Fixtures: a manager and an employee of their own (the seed setter stays outside).
insert into public.invites (email, ruolo) values
  ('manager.ui@alpha.test', 'coach'),
  ('employee.ui@alpha.test', 'editor');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', 'cccc0000-0000-4000-8000-00000000000a',
   'authenticated', 'authenticated', 'manager.ui@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Manager UI"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'cccc0000-0000-4000-8000-00000000000e',
   'authenticated', 'authenticated', 'employee.ui@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Employee UI"}'::jsonb, now(), now(), '', '', '', '');
update public.profiles set livello_pm = 'manager' where id = 'cccc0000-0000-4000-8000-00000000000a';

select is(
  (select array_agg(c.relname::text order by c.relname)
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('v_pm_progetti', 'v_pm_tasklist', 'v_pm_task')
     and 'security_invoker=true' = any (c.reloptions)),
  array['v_pm_progetti', 'v_pm_task', 'v_pm_tasklist'],
  'le tre view dei progetti girano con i permessi di chi legge'
);
select ok(
  exists (select 1 from pg_publication_tables
          where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'pm_tasklist'),
  'le liste arrivano in tempo reale'
);

create temp table ids (chiave text primary key, id uuid);
grant all on ids to authenticated;
insert into ids select 'cliente', id from public.clients limit 1;

set local role authenticated;

-- Manager: a client path started long ago, so every task is already past due
set local request.jwt.claims to '{"sub":"cccc0000-0000-4000-8000-00000000000a","role":"authenticated"}';
insert into ids
select 'progetto', public.pm_crea_progetto(
  (select id from public.pm_reparti where nome = 'Fitness Coaching'),
  'Percorso di prova UI',
  null, null,
  (select id from public.pm_modelli where nome = 'Percorso cliente'),
  public.oggi() - 200,
  null,
  array['cccc0000-0000-4000-8000-00000000000e']::uuid[]
);
insert into ids
select 'onboarding', id from public.pm_tasklist
where progetto_id = (select id from ids where chiave = 'progetto') and nome = 'Onboarding';
insert into ids
select 'percorso', id from public.pm_tasklist
where progetto_id = (select id from ids where chiave = 'progetto') and nome = 'Percorso';

select is(
  (select array[task_totali, task_completati] from public.v_pm_progetti
   where id = (select id from ids where chiave = 'progetto')),
  array[12, 0],
  'un progetto appena creato dal modello: 12 task, nessuno completato'
);

update public.pm_task set stato = 'completato'
where progetto_id = (select id from ids where chiave = 'progetto')
  and titolo in ('Questionario iniziale e obiettivi', 'Invio accessi e materiali di benvenuto', 'Call di onboarding');

select is(
  (select avanzamento from public.v_pm_progetti where id = (select id from ids where chiave = 'progetto')),
  0.2500::numeric,
  'avanzamento del progetto: 3 completati su 12'
);
select is(
  (select task_in_ritardo from public.v_pm_progetti where id = (select id from ids where chiave = 'progetto')),
  9,
  'in ritardo: i 9 task aperti con la scadenza passata'
);
select is(
  (select array[task_completati, task_totali] from public.v_pm_tasklist
   where id = (select id from ids where chiave = 'onboarding')),
  array[3, 4],
  'avanzamento della lista Onboarding: 3 su 4'
);
select is(
  (select avanzamento from public.v_pm_tasklist where id = (select id from ids where chiave = 'onboarding')),
  0.7500::numeric,
  'e la sua percentuale la calcola il database'
);
select is(
  (select array[
     bool_and(in_ritardo) filter (where stato <> 'completato'),
     bool_or(in_ritardo) filter (where stato = 'completato')
   ] from public.v_pm_task where progetto_id = (select id from ids where chiave = 'progetto')),
  array[true, false],
  'un task è in ritardo se è aperto e scaduto, mai se è completato'
);

insert into public.pm_tasklist (progetto_id, nome) values ((select id from ids where chiave = 'progetto'), 'Lista vuota');
select is(
  (select avanzamento from public.v_pm_tasklist
   where progetto_id = (select id from ids where chiave = 'progetto') and nome = 'Lista vuota'),
  null,
  'una lista senza task non ha percentuale (denominatore zero)'
);
select ok(
  (select sono_membro from public.v_pm_progetti where id = (select id from ids where chiave = 'progetto')),
  'il manager risulta membro del suo progetto'
);

-- Client link: never by a manager, not even through a plain update
select throws_ok(
  $$ update public.pm_progetti set client_id = (select id from ids where chiave = 'cliente')
     where id = (select id from ids where chiave = 'progetto') $$,
  '42501', 'Solo l''admin collega un cliente al progetto',
  'il manager non collega un cliente modificando il progetto'
);
select throws_ok(
  $$ update public.pm_progetti set responsabile_id = '22222222-2222-4222-8222-222222222222'
     where id = (select id from ids where chiave = 'progetto') $$,
  '22023', 'Il responsabile deve far parte del progetto',
  'il responsabile è uno dei membri'
);
select lives_ok(
  $$ update public.pm_progetti set responsabile_id = 'cccc0000-0000-4000-8000-00000000000e'
     where id = (select id from ids where chiave = 'progetto') $$,
  'il manager passa la responsabilità a un membro'
);

-- Sub-tasks: always in the list of their parent, one level only
insert into ids
select 'padre', id from public.pm_task
where progetto_id = (select id from ids where chiave = 'progetto') and titolo = 'Call di check';
insert into public.pm_task (id, progetto_id, tasklist_id, parent_id, titolo, assegnatario_id, created_by)
values ('cccc0000-0000-4000-8000-0000000000f1', (select id from ids where chiave = 'progetto'),
        (select id from ids where chiave = 'onboarding'), (select id from ids where chiave = 'padre'),
        'Preparare le domande del check', 'cccc0000-0000-4000-8000-00000000000e',
        'cccc0000-0000-4000-8000-00000000000a');

select is(
  (select tasklist_id from public.pm_task where id = 'cccc0000-0000-4000-8000-0000000000f1'),
  (select id from ids where chiave = 'percorso'),
  'un sotto-task sta nella lista del suo task principale'
);
select is(
  (select array[sotto_task_totali, sotto_task_completati] from public.v_pm_task
   where id = (select id from ids where chiave = 'padre')),
  array[1, 0],
  'il task principale conta i suoi sotto-task'
);
select throws_ok(
  $$ update public.pm_task
     set parent_id = (select id from public.pm_task
                      where progetto_id = (select id from ids where chiave = 'progetto') and titolo = 'Call di rinnovo')
     where id = (select id from ids where chiave = 'padre') $$,
  '22023', 'Un task con sotto-task non può diventare a sua volta un sotto-task',
  'un task con sotto-task non diventa sotto-task: un solo livello'
);

update public.pm_task set tasklist_id = (select id from ids where chiave = 'onboarding')
where id = (select id from ids where chiave = 'padre');
select is(
  (select tasklist_id from public.pm_task where id = 'cccc0000-0000-4000-8000-0000000000f1'),
  (select id from ids where chiave = 'onboarding'),
  'spostare il task principale in un’altra lista sposta anche i sotto-task'
);

-- Ordering: RLS decides who moves what
select is(
  public.pm_riordina_liste(
    (select id from ids where chiave = 'progetto'),
    array[(select id from ids where chiave = 'percorso'), (select id from ids where chiave = 'onboarding')]
  ),
  2,
  'il manager riordina le liste del suo progetto'
);
select is(
  (select array_agg(nome order by ordine) from public.pm_tasklist
   where id in ((select id from ids where chiave = 'percorso'), (select id from ids where chiave = 'onboarding'))),
  array['Percorso', 'Onboarding'],
  'e l’ordine è quello indicato'
);
select is(
  public.pm_riordina_reparti(array(select id from public.pm_reparti order by ordine desc)),
  0,
  'il manager non riordina i reparti'
);

-- Employee: sees the project in the views, does not reorder its lists
set local request.jwt.claims to '{"sub":"cccc0000-0000-4000-8000-00000000000e","role":"authenticated"}';
select is(
  (select array[task_totali, task_completati] from public.v_pm_progetti
   where id = (select id from ids where chiave = 'progetto')),
  array[13, 3],
  'l’employee vede il progetto con gli stessi numeri (sotto-task compreso)'
);
select is(
  public.pm_riordina_liste(
    (select id from ids where chiave = 'progetto'),
    array[(select id from ids where chiave = 'onboarding'), (select id from ids where chiave = 'percorso')]
  ),
  0,
  'l’employee non riordina le liste'
);
with modificati as (
  update public.profiles set livello_pm = 'admin' where id = 'cccc0000-0000-4000-8000-00000000000e' returning 1
)
select is((select count(*)::int from modificati), 0, 'nessuno si alza da solo il livello');

-- Outside the project: nothing in any view
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(
  (select array[
     (select count(*) from public.v_pm_progetti where id = (select id from ids where chiave = 'progetto')),
     (select count(*) from public.v_pm_tasklist where progetto_id = (select id from ids where chiave = 'progetto')),
     (select count(*) from public.v_pm_task where progetto_id = (select id from ids where chiave = 'progetto'))
   ]::int[]),
  array[0, 0, 0],
  'chi non è nel progetto non lo vede nemmeno attraverso le view'
);

-- App admin: sees it without being a member, links the client, reorders departments
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(
  (select sono_membro from public.v_pm_progetti where id = (select id from ids where chiave = 'progetto')),
  false,
  'l’admin vede il progetto anche senza esserne membro'
);
select lives_ok(
  $$ update public.pm_progetti set client_id = (select id from ids where chiave = 'cliente')
     where id = (select id from ids where chiave = 'progetto') $$,
  'l’admin collega un cliente al progetto'
);
select is(
  public.pm_riordina_reparti(array(select id from public.pm_reparti order by ordine desc)),
  (select count(*)::int from public.pm_reparti),
  'l’admin riordina i reparti'
);
select lives_ok(
  $$ update public.profiles set livello_pm = 'manager' where id = 'cccc0000-0000-4000-8000-00000000000e' $$,
  'l’admin cambia il livello progetti di una persona'
);

-- A person leaves: their tasks go back to nobody, and they are no longer in charge
delete from public.pm_membri
where progetto_id = (select id from ids where chiave = 'progetto')
  and profile_id = 'cccc0000-0000-4000-8000-00000000000e';
select is(
  (select array[
     (select count(*) from public.pm_task
      where progetto_id = (select id from ids where chiave = 'progetto')
        and assegnatario_id = 'cccc0000-0000-4000-8000-00000000000e'),
     (select count(*) from public.pm_progetti
      where id = (select id from ids where chiave = 'progetto') and responsabile_id is not null)
   ]::int[]),
  array[0, 0],
  'chi esce dal progetto perde i suoi task e la responsabilità'
);

-- Deleting a whole project with members, lists and tasks goes through
select lives_ok(
  $$ delete from public.pm_progetti where id = (select id from ids where chiave = 'progetto') $$,
  'l’admin cancella un progetto con membri, liste e task'
);
select is(
  (select count(*)::int from public.pm_task where progetto_id = (select id from ids where chiave = 'progetto')),
  0,
  'e con lui se ne vanno liste e task'
);

select * from finish();
rollback;
