-- The client's Drive folder on his project (Dany, 05/10/2026: «la scheda
-- Drive deve essere visibile anche dal progetto del cliente … e deve poterla
-- modificare ed editare il fitness coach»): the admin as before, and the coach
-- of the client's project reads, links, changes and takes away that client's
-- folder. Nobody else: another coach, a manager or a member of the project who
-- is not its coach, the closer and the setter of the client, whoever is not
-- signed in. A coach changed, gone from the project or switched off loses it
-- at once; a client without a project has only the admin.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(41);

-- People: coach A (the client's coach), coach B (another client's coach), a
-- PM manager and an editor who are members of A's project but not its coach.
insert into public.invites (email, ruolo) values
  ('coach.a57@alpha.test', 'coach'),
  ('coach.b57@alpha.test', 'coach'),
  ('manager57@alpha.test', 'coach'),
  ('editor57@alpha.test', 'editor');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', 'f5700000-0000-4000-8000-00000000000a',
   'authenticated', 'authenticated', 'coach.a57@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Coach Anna"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f5700000-0000-4000-8000-00000000000b',
   'authenticated', 'authenticated', 'coach.b57@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Coach Bruno"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f5700000-0000-4000-8000-00000000000c',
   'authenticated', 'authenticated', 'manager57@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Manuela Manager"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f5700000-0000-4000-8000-00000000000d',
   'authenticated', 'authenticated', 'editor57@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Elio Editor"}'::jsonb, now(), now(), '', '', '', '');
update public.profiles set livello_pm = 'manager' where id = 'f5700000-0000-4000-8000-00000000000c';

-- Clients: X (coach A, the seed closer and setter), Y (coach B), Z (no project)
insert into public.clients (id, nome, cognome, fonte, closer_id, setter_id) values
  ('57570000-0000-4000-8000-0000000000a1', 'Xeno', 'Cartella', 'dm_inbound',
   '33333333-3333-4333-8333-333333333333', '22222222-2222-4222-8222-222222222222'),
  ('57570000-0000-4000-8000-0000000000b1', 'Ylenia', 'Cartella', 'dm_inbound', null, null),
  ('57570000-0000-4000-8000-0000000000c1', 'Zeno', 'Senzaprogetto', 'dm_inbound', null, null);

insert into public.pm_progetti (id, reparto_id, nome, client_id) values
  ('57570000-0000-4000-8000-0000000000a2', (select id from public.pm_reparti where nome = 'Fitness Coaching'),
   'Xeno Cartella', '57570000-0000-4000-8000-0000000000a1'),
  ('57570000-0000-4000-8000-0000000000b2', (select id from public.pm_reparti where nome = 'Fitness Coaching'),
   'Ylenia Cartella', '57570000-0000-4000-8000-0000000000b1');
insert into public.pm_membri (progetto_id, profile_id) values
  ('57570000-0000-4000-8000-0000000000a2', 'f5700000-0000-4000-8000-00000000000a'),
  ('57570000-0000-4000-8000-0000000000a2', 'f5700000-0000-4000-8000-00000000000c'),
  ('57570000-0000-4000-8000-0000000000a2', 'f5700000-0000-4000-8000-00000000000d'),
  ('57570000-0000-4000-8000-0000000000b2', 'f5700000-0000-4000-8000-00000000000b');
update public.pm_progetti set coach_id = 'f5700000-0000-4000-8000-00000000000a' where id = '57570000-0000-4000-8000-0000000000a2';
update public.pm_progetti set coach_id = 'f5700000-0000-4000-8000-00000000000b' where id = '57570000-0000-4000-8000-0000000000b2';

-- ---------------------------------------------------------------------------
-- The helper: security definer with an empty search_path, never for anon
-- ---------------------------------------------------------------------------
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'public.pm_coach_del_cliente(uuid)'::regprocedure),
  'pm_coach_del_cliente è security definer con search_path vuoto'
);
select ok(
  not has_function_privilege('anon', 'public.pm_coach_del_cliente(uuid)', 'execute'),
  'chi non è entrato non la chiama'
);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- The admin, as before
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ insert into public.clienti_cartelle (client_id, url) values
       ('57570000-0000-4000-8000-0000000000a1', 'https://drive.google.com/drive/folders/x-57-admin'),
       ('57570000-0000-4000-8000-0000000000b1', 'https://drive.google.com/drive/folders/y-57-admin'),
       ('57570000-0000-4000-8000-0000000000c1', 'https://drive.google.com/drive/folders/z-57-admin') $$,
  'l''admin collega la cartella dei tre clienti'
);
select is(
  (select count(*)::integer from public.clienti_cartelle where client_id::text like '57570000-%'),
  3,
  'e le legge tutte'
);

-- ---------------------------------------------------------------------------
-- Coach A: his client's folder, all of it, and nothing else
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"f5700000-0000-4000-8000-00000000000a","role":"authenticated"}';
select is(
  (select array_agg(url) from public.clienti_cartelle),
  array['https://drive.google.com/drive/folders/x-57-admin'],
  'il coach del cliente legge solo la cartella del suo cliente'
);
select is(
  (select count(*)::integer from public.clients where id = '57570000-0000-4000-8000-0000000000a1'),
  0,
  'senza leggere il cliente'
);
select lives_ok(
  $$ update public.clienti_cartelle set url = 'https://drive.google.com/drive/folders/x-57-coach'
     where client_id = '57570000-0000-4000-8000-0000000000a1' $$,
  'la cambia'
);
select is(
  (select url from public.clienti_cartelle where client_id = '57570000-0000-4000-8000-0000000000a1'),
  'https://drive.google.com/drive/folders/x-57-coach',
  'e il link nuovo resta'
);
select throws_ok(
  $$ update public.clienti_cartelle set url = 'https://example.com/x'
     where client_id = '57570000-0000-4000-8000-0000000000a1' $$,
  '23514', null,
  'sempre e solo un link di Google Drive'
);
select lives_ok(
  $$ delete from public.clienti_cartelle where client_id = '57570000-0000-4000-8000-0000000000a1' $$,
  'la toglie'
);
select is(
  (select count(*)::integer from public.clienti_cartelle where client_id = '57570000-0000-4000-8000-0000000000a1'),
  0,
  'e non c''è più'
);
select lives_ok(
  $$ insert into public.clienti_cartelle (client_id, url)
     values ('57570000-0000-4000-8000-0000000000a1', 'https://drive.google.com/drive/folders/x-57-nuova') $$,
  'la collega di nuovo'
);
select lives_ok(
  $$ insert into public.clienti_cartelle (client_id, url)
     values ('57570000-0000-4000-8000-0000000000a1', 'https://drive.google.com/drive/folders/x-57-upsert')
     on conflict (client_id) do update set url = excluded.url $$,
  'e la sostituisce come fa l''app (upsert)'
);
select is(
  (select created_by from public.clienti_cartelle where client_id = '57570000-0000-4000-8000-0000000000a1'),
  'f5700000-0000-4000-8000-00000000000a'::uuid,
  'collegata da lui'
);

-- another client's folder, or a client without a project: never
select throws_ok(
  $$ insert into public.clienti_cartelle (client_id, url)
     values ('57570000-0000-4000-8000-0000000000b1', 'https://drive.google.com/drive/folders/y-57-a') $$,
  '42501', null,
  'non collega la cartella del cliente di un altro coach'
);
select throws_ok(
  $$ insert into public.clienti_cartelle (client_id, url)
     values ('57570000-0000-4000-8000-0000000000c1', 'https://drive.google.com/drive/folders/z-57-a') $$,
  '42501', null,
  'né quella di un cliente senza progetto'
);
select throws_ok(
  $$ update public.clienti_cartelle set client_id = '57570000-0000-4000-8000-0000000000b1'
     where client_id = '57570000-0000-4000-8000-0000000000a1' $$,
  '42501', null,
  'e non sposta la sua su un altro cliente'
);
update public.clienti_cartelle set url = 'https://drive.google.com/drive/folders/y-57-a'
where client_id in ('57570000-0000-4000-8000-0000000000b1', '57570000-0000-4000-8000-0000000000c1');
delete from public.clienti_cartelle where client_id in ('57570000-0000-4000-8000-0000000000b1', '57570000-0000-4000-8000-0000000000c1');

-- ---------------------------------------------------------------------------
-- Coach B: his own client only
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"f5700000-0000-4000-8000-00000000000b","role":"authenticated"}';
select is(
  (select array_agg(url) from public.clienti_cartelle),
  array['https://drive.google.com/drive/folders/y-57-admin'],
  'un altro coach legge solo la cartella del suo cliente, non quella del cliente di A'
);
update public.clienti_cartelle set url = 'https://drive.google.com/drive/folders/x-57-b'
where client_id = '57570000-0000-4000-8000-0000000000a1';
delete from public.clienti_cartelle where client_id = '57570000-0000-4000-8000-0000000000a1';
select throws_ok(
  $$ insert into public.clienti_cartelle (client_id, url)
     values ('57570000-0000-4000-8000-0000000000a1', 'https://drive.google.com/drive/folders/x-57-b')
     on conflict (client_id) do update set url = excluded.url $$,
  '42501', null,
  'e non scrive quella del cliente di A'
);

-- ---------------------------------------------------------------------------
-- Members of A's project who are not its coach: nothing
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"f5700000-0000-4000-8000-00000000000c","role":"authenticated"}';
select ok(public.pm_puo_gestire('57570000-0000-4000-8000-0000000000a2'), 'la manager gestisce il progetto del cliente');
select is((select count(*)::integer from public.clienti_cartelle), 0, 'ma non è il coach: non legge la cartella');
select throws_ok(
  $$ insert into public.clienti_cartelle (client_id, url)
     values ('57570000-0000-4000-8000-0000000000a1', 'https://drive.google.com/drive/folders/x-57-m')
     on conflict (client_id) do update set url = excluded.url $$,
  '42501', null,
  'e non la scrive'
);
delete from public.clienti_cartelle where client_id = '57570000-0000-4000-8000-0000000000a1';

set local request.jwt.claims to '{"sub":"f5700000-0000-4000-8000-00000000000d","role":"authenticated"}';
select is(
  (select row(
     (select count(*) from public.pm_progetti where id = '57570000-0000-4000-8000-0000000000a2'),
     (select count(*) from public.clienti_cartelle))::text),
  '(1,0)',
  'un membro del progetto vede il progetto, non la cartella'
);

-- ---------------------------------------------------------------------------
-- The closer and the setter of the client, whoever is not signed in
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(
  (select row(
     (select count(*) from public.clients where id = '57570000-0000-4000-8000-0000000000a1'),
     (select count(*) from public.clienti_cartelle))::text),
  '(1,0)',
  'il closer del cliente legge il cliente, non la cartella'
);
select throws_ok(
  $$ insert into public.clienti_cartelle (client_id, url)
     values ('57570000-0000-4000-8000-0000000000c1', 'https://drive.google.com/drive/folders/z-57-closer') $$,
  '42501', null,
  'e non la scrive'
);
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::integer from public.clienti_cartelle), 0, 'il setter del cliente non la legge');
select throws_ok(
  $$ insert into public.clienti_cartelle (client_id, url)
     values ('57570000-0000-4000-8000-0000000000c1', 'https://drive.google.com/drive/folders/z-57-setter') $$,
  '42501', null,
  'e non la scrive'
);
reset role;
set local role anon;
select throws_ok($$ select * from public.clienti_cartelle $$, '42501', null, 'chi non è entrato non la legge');
reset role;

-- nothing written by those who may not: the three links of before
select is(
  (select array_agg(url order by url) from public.clienti_cartelle where client_id::text like '57570000-%'),
  array[
    'https://drive.google.com/drive/folders/x-57-upsert',
    'https://drive.google.com/drive/folders/y-57-admin',
    'https://drive.google.com/drive/folders/z-57-admin'
  ],
  'chi non può non ha cambiato né tolto nessun link'
);

-- ---------------------------------------------------------------------------
-- The coach switched off, changed, gone from the project
-- ---------------------------------------------------------------------------
update public.profiles set attivo = false where id = 'f5700000-0000-4000-8000-00000000000a';
set local role authenticated;
set local request.jwt.claims to '{"sub":"f5700000-0000-4000-8000-00000000000a","role":"authenticated"}';
select is((select count(*)::integer from public.clienti_cartelle), 0, 'con l''account disattivato il coach non la legge più');
reset role;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
update public.profiles set attivo = true where id = 'f5700000-0000-4000-8000-00000000000a';

-- the admin hands the client to coach B (he joins the project and becomes its coach)
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select public.pm_scegli_coach('57570000-0000-4000-8000-0000000000a2', 'f5700000-0000-4000-8000-00000000000b') $$,
  'l''admin cambia il coach del cliente'
);
set local request.jwt.claims to '{"sub":"f5700000-0000-4000-8000-00000000000a","role":"authenticated"}';
select is(
  (select row(
     (select count(*) from public.pm_progetti where id = '57570000-0000-4000-8000-0000000000a2'),
     (select count(*) from public.clienti_cartelle))::text),
  '(1,0)',
  'il coach di prima resta nel progetto ma non legge più la cartella'
);
update public.clienti_cartelle set url = 'https://drive.google.com/drive/folders/x-57-vecchio'
where client_id = '57570000-0000-4000-8000-0000000000a1';
select throws_ok(
  $$ insert into public.clienti_cartelle (client_id, url)
     values ('57570000-0000-4000-8000-0000000000a1', 'https://drive.google.com/drive/folders/x-57-vecchio')
     on conflict (client_id) do update set url = excluded.url $$,
  '42501', null,
  'e non la scrive'
);
set local request.jwt.claims to '{"sub":"f5700000-0000-4000-8000-00000000000b","role":"authenticated"}';
select is(
  (select array_agg(url order by url) from public.clienti_cartelle),
  array['https://drive.google.com/drive/folders/x-57-upsert', 'https://drive.google.com/drive/folders/y-57-admin'],
  'il nuovo coach legge la cartella del cliente che ha preso, oltre alla sua'
);
select lives_ok(
  $$ update public.clienti_cartelle set url = 'https://drive.google.com/drive/folders/x-57-b'
     where client_id = '57570000-0000-4000-8000-0000000000a1' $$,
  'e la cambia'
);

-- coach B leaves the project: the coach empties, the folder goes with him
reset role;
delete from public.pm_membri
where progetto_id = '57570000-0000-4000-8000-0000000000a2' and profile_id = 'f5700000-0000-4000-8000-00000000000b';
select is(
  (select coach_id from public.pm_progetti where id = '57570000-0000-4000-8000-0000000000a2'),
  null::uuid,
  'uscito dal progetto, il progetto resta senza coach'
);
set local role authenticated;
set local request.jwt.claims to '{"sub":"f5700000-0000-4000-8000-00000000000b","role":"authenticated"}';
select is(
  (select array_agg(url) from public.clienti_cartelle),
  array['https://drive.google.com/drive/folders/y-57-admin'],
  'e lui non legge più la cartella di quel cliente'
);
select throws_ok(
  $$ insert into public.clienti_cartelle (client_id, url)
     values ('57570000-0000-4000-8000-0000000000a1', 'https://drive.google.com/drive/folders/x-57-fuori')
     on conflict (client_id) do update set url = excluded.url $$,
  '42501', null,
  'né la scrive'
);

-- without a coach the admin still has it all
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(
  (select url from public.clienti_cartelle where client_id = '57570000-0000-4000-8000-0000000000a1'),
  'https://drive.google.com/drive/folders/x-57-b',
  'l''admin legge il link che ha messo il coach'
);
select lives_ok(
  $$ delete from public.clienti_cartelle where client_id::text like '57570000-%' $$,
  'e toglie i link'
);
reset role;
select is(
  (select count(*)::integer from public.clienti_cartelle where client_id::text like '57570000-%'),
  0,
  'tolti tutti'
);

select * from finish();
rollback;
