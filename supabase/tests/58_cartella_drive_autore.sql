-- The client's Drive folder after the review (05/10/2026):
-- 1. who manages a client's project picks its coach, so also who reads the
--    folder: a manager who names himself coach reads it while he is the coach,
--    and not once the coach changes again;
-- 2. a coach cannot write who linked the folder or when (created_by,
--    created_at); the admin still can (elimina_persona, unisci_profili).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(13);

insert into public.invites (email, ruolo) values
  ('coach.a58@alpha.test', 'coach'),
  ('manager58@alpha.test', 'coach');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', 'f5800000-0000-4000-8000-00000000000a',
   'authenticated', 'authenticated', 'coach.a58@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Coach Alba"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f5800000-0000-4000-8000-00000000000c',
   'authenticated', 'authenticated', 'manager58@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Mirco Manager"}'::jsonb, now(), now(), '', '', '', '');
update public.profiles set livello_pm = 'manager' where id = 'f5800000-0000-4000-8000-00000000000c';

insert into public.clients (id, nome, cognome, fonte) values
  ('58580000-0000-4000-8000-0000000000a1', 'Xavier', 'Autore', 'dm_inbound');
insert into public.pm_progetti (id, reparto_id, nome, client_id) values
  ('58580000-0000-4000-8000-0000000000a2', (select id from public.pm_reparti where nome = 'Fitness Coaching'),
   'Xavier Autore', '58580000-0000-4000-8000-0000000000a1');
insert into public.pm_membri (progetto_id, profile_id) values
  ('58580000-0000-4000-8000-0000000000a2', 'f5800000-0000-4000-8000-00000000000a'),
  ('58580000-0000-4000-8000-0000000000a2', 'f5800000-0000-4000-8000-00000000000c');
update public.pm_progetti set coach_id = 'f5800000-0000-4000-8000-00000000000a' where id = '58580000-0000-4000-8000-0000000000a2';

select ok(
  exists (select 1 from pg_trigger where tgname = 'clienti_cartelle_autore' and tgrelid = 'public.clienti_cartelle'::regclass),
  'il trigger che protegge chi ha collegato la cartella c''è'
);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- 2. Who linked it: the coach cannot say it was someone else, or another day
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"f5800000-0000-4000-8000-00000000000a","role":"authenticated"}';
insert into public.clienti_cartelle (client_id, url, created_by, created_at)
values ('58580000-0000-4000-8000-0000000000a1', 'https://drive.google.com/drive/folders/x-58',
        '11111111-1111-4111-8111-111111111111', '2020-01-01');
select is(
  (select created_by from public.clienti_cartelle where client_id = '58580000-0000-4000-8000-0000000000a1'),
  'f5800000-0000-4000-8000-00000000000a'::uuid,
  'il coach che collega la cartella ne risulta l''autore, qualunque cosa mandi'
);
select ok(
  (select created_at > now() - interval '1 minute' from public.clienti_cartelle where client_id = '58580000-0000-4000-8000-0000000000a1'),
  'collegata adesso, non nel 2020'
);
update public.clienti_cartelle
set created_by = '11111111-1111-4111-8111-111111111111', created_at = '2020-01-01',
    url = 'https://drive.google.com/drive/folders/x-58-b'
where client_id = '58580000-0000-4000-8000-0000000000a1';
select is(
  (select row(created_by, created_at > now() - interval '1 minute', url)::text
   from public.clienti_cartelle where client_id = '58580000-0000-4000-8000-0000000000a1'),
  '(f5800000-0000-4000-8000-00000000000a,t,https://drive.google.com/drive/folders/x-58-b)',
  'cambiando il link non riscrive autore e data: cambia solo il link'
);
insert into public.clienti_cartelle (client_id, url, created_by)
values ('58580000-0000-4000-8000-0000000000a1', 'https://drive.google.com/drive/folders/x-58-c', '11111111-1111-4111-8111-111111111111')
on conflict (client_id) do update set url = excluded.url, created_by = excluded.created_by;
select is(
  (select row(created_by, url)::text from public.clienti_cartelle where client_id = '58580000-0000-4000-8000-0000000000a1'),
  '(f5800000-0000-4000-8000-00000000000a,https://drive.google.com/drive/folders/x-58-c)',
  'nemmeno con l''upsert'
);

-- the admin still rewrites it (elimina_persona and unisci_profili do)
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ update public.clienti_cartelle set created_by = null where client_id = '58580000-0000-4000-8000-0000000000a1' $$,
  'l''admin toglie l''autore, come fa eliminando una persona'
);
select is(
  (select created_by from public.clienti_cartelle where client_id = '58580000-0000-4000-8000-0000000000a1'),
  null::uuid,
  'e resta tolto'
);
reset role;
set local request.jwt.claims to '{}';
update public.clienti_cartelle set created_by = 'f5800000-0000-4000-8000-00000000000a'
where client_id = '58580000-0000-4000-8000-0000000000a1';
select is(
  (select created_by from public.clienti_cartelle where client_id = '58580000-0000-4000-8000-0000000000a1'),
  'f5800000-0000-4000-8000-00000000000a'::uuid,
  'senza sessione (seed, ripristino) il trigger non tocca niente'
);

-- ---------------------------------------------------------------------------
-- 1. Who manages the project picks the coach, and with him who reads the folder
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"f5800000-0000-4000-8000-00000000000c","role":"authenticated"}';
select is((select count(*)::integer from public.clienti_cartelle), 0, 'la manager del progetto, finché non è il coach, non legge la cartella');
select lives_ok(
  $$ select public.pm_scegli_coach('58580000-0000-4000-8000-0000000000a2', 'f5800000-0000-4000-8000-00000000000c') $$,
  'chi gestisce il progetto può scegliere sé stesso come coach (sezione 18)'
);
select is(
  (select array_agg(url) from public.clienti_cartelle),
  array['https://drive.google.com/drive/folders/x-58-c'],
  'e da coach legge la cartella del cliente: chi sceglie il coach sceglie chi la vede'
);

set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select public.pm_scegli_coach('58580000-0000-4000-8000-0000000000a2', 'f5800000-0000-4000-8000-00000000000a');
set local request.jwt.claims to '{"sub":"f5800000-0000-4000-8000-00000000000c","role":"authenticated"}';
select is((select count(*)::integer from public.clienti_cartelle), 0, 'rimesso il coach di prima, la manager non la legge più');
set local request.jwt.claims to '{"sub":"f5800000-0000-4000-8000-00000000000a","role":"authenticated"}';
select is((select count(*)::integer from public.clienti_cartelle), 1, 'e il coach la legge di nuovo');

reset role;
select * from finish();
rollback;
