-- The client's home base (1.83.0, 20261112090000_campo_base.sql): the client reads only his own home base
-- (the CMS pages, the Aula with the content of the open modules only, his check-ups without the notes), completes
-- the lessons of the open modules (a video at 90%); the team of a client (the admin, a person in charge of his
-- registered onboarding, the coach of his project) reads the notes and writes the check-ups; nobody else, not a
-- member of the project who is not in his team, not a setter, not a client, not an OAuth token. The tables are
-- read directly by the admin only; the notes never go in the backup; the deletion of a client says the check-ups.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(34);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres): the seed's Davide (client 0001, user 0031, team: the admin) and Giorgio (client 0003,
-- user 0033, coach of the onboarding and of the project: the coach); the editor joins Giorgio's project
-- ---------------------------------------------------------------------------
insert into public.pm_membri (progetto_id, profile_id)
select p.id, '55555555-5555-4555-8555-555555555555' from public.pm_progetti p
where p.client_id = '0b0b0000-0000-4000-8000-000000000003'
on conflict do nothing;

create temp table appunti (chiave text primary key, valore jsonb) on commit drop;
grant select, insert, update on appunti to authenticated;

create or replace function pg_temp.web(p_utente uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_utente, 'role', 'authenticated')::text, true);
  perform set_config('alpha.mcp_filtro', '', true);
  perform set_config('request.path', '', true);
  set local role authenticated;
end;
$$;

create or replace function pg_temp.oauth(p_utente uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_utente, 'role', 'authenticated',
    'client_id', '9c000000-0000-4000-8000-000000000117', 'session_id', '9e117000-0000-4000-8000-000000000001')::text, true);
  set local role authenticated;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. The client: his home base, never the notes
-- ---------------------------------------------------------------------------
select pg_temp.web('0b0b0000-0000-4000-8000-000000000031');
select ok(public.campo_base_cliente() ? 'aula', 'il cliente legge il suo campo base');
select is(
  (select count(*)::int from jsonb_array_elements(public.campo_base_cliente() -> 'checkup')),
  1, 'con i suoi check-up'
);
select ok(not (public.campo_base_cliente()::text like '%Appunti di prova%'), 'mai gli appunti del team');
select ok(
  not exists (select 1 from jsonb_array_elements(public.campo_base_cliente() -> 'checkup') k where k ? 'appunti' or k ? 'coach_id'),
  'nessun check-up porta gli appunti'
);
select is(
  (select m ->> 'aperto' from jsonb_array_elements(public.campo_base_cliente() -> 'aula') m
   where m ->> 'id' = 'ca000000-0000-4000-8000-000000000002'),
  'false', 'un modulo dopo il lancio è chiuso durante l''onboarding'
);
select ok(
  not exists (
    select 1 from jsonb_array_elements(public.campo_base_cliente() -> 'aula') m, jsonb_array_elements(m -> 'lezioni') l
    where m ->> 'aperto' = 'false' and (l ? 'corpo' or l ? 'url' or l ? 'youtube_id')
  ),
  'di un modulo chiuso mai il contenuto delle lezioni'
);
select is((select count(*)::int from public.clienti_checkup), 0, 'il cliente non legge la tabella dei check-up');
select is((select count(*)::int from public.clienti_checkup_appunti), 0, 'né quella degli appunti');
select is((select count(*)::int from public.aula_lezioni), 0, 'né quella delle lezioni');

-- the lessons
select ok(
  (public.aula_lezione_completa('cc000000-0000-4000-8000-000000000002') ->> 'completata_il') is not null,
  'completa una lezione di testo di un modulo aperto'
);
select throws_ok($$ select public.aula_lezione_completa('cc000000-0000-4000-8000-000000000001') $$, '22023', null,
  'un video si completa guardandolo');
select throws_ok($$ select public.aula_lezione_completa('cc000000-0000-4000-8000-000000000004') $$, '22023', null,
  'mai una lezione di un modulo chiuso');
select is(
  public.aula_video_progresso('cc000000-0000-4000-8000-000000000001', 100, array[int4range(0, 20)]) ->> 'visto',
  'false', 'una parte del video: non ancora vista'
);
-- the seconds seen never run faster than the clock: the first watch an hour ago
reset role;
update public.aula_progressi set created_at = now() - interval '1 hour'
where client_id = '0b0b0000-0000-4000-8000-000000000001' and lezione_id = 'cc000000-0000-4000-8000-000000000001';
select pg_temp.web('0b0b0000-0000-4000-8000-000000000031');
select is(
  public.aula_video_progresso('cc000000-0000-4000-8000-000000000001', 100, array[int4range(20, 95)]) ->> 'visto',
  'true', 'al 90% la lezione video è completata'
);
select is(
  (select (m ->> 'lezioni_completate')::int from jsonb_array_elements(public.campo_base_cliente() -> 'aula') m
   where m ->> 'id' = 'ca000000-0000-4000-8000-000000000001'),
  2, 'il modulo conta le lezioni completate'
);
select throws_ok($$ select public.campo_base_team('0b0b0000-0000-4000-8000-000000000001') $$, '42501', null,
  'il cliente non legge il campo base del team');
select throws_ok($$ select public.checkup_salva('0b0b0000-0000-4000-8000-000000000001', null, '{"giorno": "2026-11-10"}') $$,
  '42501', null, 'e non scrive un check-up');
reset role;

-- ---------------------------------------------------------------------------
-- 2. The team: the coach of the onboarding and of the project
-- ---------------------------------------------------------------------------
select pg_temp.web('44444444-4444-4444-8444-444444444444');
select ok(public.campo_base_vede('0b0b0000-0000-4000-8000-000000000003'), 'il coach vede il campo base del suo cliente');
select ok(not public.campo_base_vede('0b0b0000-0000-4000-8000-000000000001'), 'e non quello di un altro');
select throws_ok($$ select public.campo_base_team('0b0b0000-0000-4000-8000-000000000001') $$, '42501', null,
  'il campo base di un altro cliente: 42501');
insert into pg_temp.appunti values ('id', public.checkup_salva('0b0b0000-0000-4000-8000-000000000003', null, jsonb_build_object(
  'giorno', (public.oggi() - 1)::text, 'fathom_url', 'https://fathom.video/share/Prova117',
  'argomento', 'La prima call', 'resoconto', 'Giorgio, grazie della call, oggi abbiamo parlato di questo topic principale: la prima call.',
  'compiti', jsonb_build_array('Carica il peso', 'Rallenta la discesa'), 'appunti', 'Appunti segreti 117')));
select ok((select valore ->> 'id' from pg_temp.appunti where chiave = 'id') is not null, 'il coach scrive un check-up');
select is(
  (select k ->> 'appunti' from jsonb_array_elements(public.campo_base_team('0b0b0000-0000-4000-8000-000000000003') -> 'checkup') k
   where k ->> 'id' = (select valore ->> 'id' from pg_temp.appunti where chiave = 'id')),
  'Appunti segreti 117', 'e legge i suoi appunti nel campo base del team'
);
select is((select count(*)::int from public.clienti_checkup_appunti), 0, 'ma non legge la tabella degli appunti');
select throws_ok($$ select public.checkup_salva('0b0b0000-0000-4000-8000-000000000003', null,
  jsonb_build_object('giorno', '2026-11-10', 'fathom_url', 'https://example.com/x')) $$, '22023', null,
  'un link che non è di Fathom: 22023');
reset role;

select pg_temp.web('0b0b0000-0000-4000-8000-000000000033');
select ok(public.campo_base_cliente()::text like '%Prova117%', 'il cliente vede il check-up col link di Fathom');
select ok(not (public.campo_base_cliente()::text like '%Appunti segreti 117%'), 'mai i suoi appunti');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Nobody else: a member of the project outside the team, a setter, an OAuth token of the admin
-- ---------------------------------------------------------------------------
select pg_temp.web('55555555-5555-4555-8555-555555555555');
select ok(not public.campo_base_vede('0b0b0000-0000-4000-8000-000000000003'), 'un membro del progetto fuori dal team non vede');
select throws_ok($$ select public.campo_base_team('0b0b0000-0000-4000-8000-000000000003') $$, '42501', null,
  'e il campo base del team gli risponde 42501');
reset role;
select pg_temp.web('22222222-2222-4222-8222-222222222222');
select throws_ok($$ select public.checkup_salva('0b0b0000-0000-4000-8000-000000000003', null, '{"giorno": "2026-11-10"}') $$,
  '42501', null, 'il setter non scrive un check-up');
reset role;
select pg_temp.oauth('11111111-1111-4111-8111-111111111111');
select throws_ok($$ select public.campo_base_team('0b0b0000-0000-4000-8000-000000000003') $$, '42501', null,
  'nemmeno un token di Claude dell''admin');
reset role;

-- ---------------------------------------------------------------------------
-- 4. The admin, the deletion, the backup
-- ---------------------------------------------------------------------------
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select ok((select count(*) from public.clienti_checkup_appunti) >= 2, 'l''admin legge gli appunti');
select ok(public.checkup_elimina((select (valore ->> 'id')::uuid from pg_temp.appunti where chiave = 'id')), 'e elimina un check-up');
reset role;
select is(public.anteprima_eliminazione('cliente', '0b0b0000-0000-4000-8000-000000000001') ->> 'checkup', '1',
  'eliminare un cliente dice i suoi check-up');
select ok(
  (select not (b ? 'clienti_checkup_appunti') and (b ? 'clienti_checkup') from (select public.backup_completo() as b) x),
  'il backup prende i check-up e mai gli appunti'
);

select * from finish();
rollback;
