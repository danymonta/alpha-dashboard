-- Claude a 360 gradi, fase 1 di 4 (Dany, 22/10/2026; 20261027110000_mcp_progetti_tempo.sql): an
-- OAuth token works on projects, lists, tasks, notes and time with its person's permissions in the
-- app, inside a request the Data API filter approved. The filter's approval is simulated here as
-- PostgREST does it: the request settings, then mcp_filtro_richiesta() (which raises the
-- transaction-local flag alpha.mcp_filtro). Time is always one's own from Claude (the app admin
-- reads the team's declared time), nothing is deleted, and the areas of the later phases (clients,
-- money, costs, the setter's reports) stay closed. Calls and leads are phase 2 (102_mcp_call_lead.sql).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(47);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Seed: admin 1111, setter 2222, coach 4444 (PM manager, member of 4
-- projects), editor 5555 (PM employee, member of 4), marketing 6161
-- ---------------------------------------------------------------------------
insert into auth.oauth_clients (id, client_name, registration_type, client_type, redirect_uris,
  grant_types, token_endpoint_auth_method, deleted_at)
values
  ('9c000000-0000-4000-8000-000000000001', 'Claude', 'manual', 'public',
   'https://claude.ai/api/mcp/auth_callback', 'authorization_code,refresh_token', 'none', null),
  ('9c000000-0000-4000-8000-000000000002', 'Claude', 'dynamic', 'public',
   'https://claude.ai/api/mcp/auth_callback', 'authorization_code,refresh_token', 'none', null);

insert into auth.sessions (id, user_id, created_at, updated_at, aal, oauth_client_id, not_after)
values
  ('9e000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', now(), now(), 'aal1', '9c000000-0000-4000-8000-000000000001', null),
  ('9e000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', now(), now(), 'aal1', '9c000000-0000-4000-8000-000000000001', null),
  ('9e000000-0000-4000-8000-000000000004', '44444444-4444-4444-8444-444444444444', now(), now(), 'aal1', '9c000000-0000-4000-8000-000000000001', null),
  ('9e000000-0000-4000-8000-000000000005', '55555555-5555-4555-8555-555555555555', now(), now(), 'aal1', '9c000000-0000-4000-8000-000000000001', null),
  ('9e000000-0000-4000-8000-000000000006', '61616161-6161-4161-8161-616161616161', now(), now(), 'aal1', '9c000000-0000-4000-8000-000000000001', null),
  -- a dynamic client: never in
  ('9e000000-0000-4000-8000-000000000007', '44444444-4444-4444-8444-444444444444', now(), now(), 'aal1', '9c000000-0000-4000-8000-000000000002', null),
  -- a session that will be closed (Scollega)
  ('9e000000-0000-4000-8000-000000000008', '44444444-4444-4444-8444-444444444444', now(), now(), 'aal1', '9c000000-0000-4000-8000-000000000001', null);

-- The ids this test works on, taken from the seed as postgres
create temp table x on commit drop as
select
  (select m.progetto_id from public.pm_membri m where m.profile_id = '44444444-4444-4444-8444-444444444444'
   order by m.progetto_id limit 1) as del_coach,
  (select p.id from public.pm_progetti p
   where not exists (select 1 from public.pm_membri m where m.progetto_id = p.id
                     and m.profile_id = '44444444-4444-4444-8444-444444444444')
   order by p.id limit 1) as non_del_coach,
  (select m.progetto_id from public.pm_membri m where m.profile_id = '55555555-5555-4555-8555-555555555555'
   order by m.progetto_id limit 1) as del_editor,
  (select id from public.pm_reparti where attivo order by nome limit 1) as reparto,
  (select id from public.pm_tempo where profile_id = '44444444-4444-4444-8444-444444444444' and minuti is not null
   order by id limit 1) as tempo_coach,
  (select id from public.pm_tempo where profile_id = '11111111-1111-4111-8111-111111111111' and minuti is not null
   order by id limit 1) as tempo_admin,
  (select id from public.clients order by created_at limit 1) as cliente,
  (select id from public.marketing_contenuti order by created_at limit 1) as contenuto;
grant select on x to authenticated;

-- A request of Claude for one person: the JWT of an OAuth token, then the filter on the given path
-- (PostgREST runs it before the request). p_filtro false = the same token outside an approved request.
create or replace function pg_temp.claude(p_utente uuid, p_sessione uuid, p_filtro boolean default true,
  p_client uuid default '9c000000-0000-4000-8000-000000000001')
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', p_utente, 'role', 'authenticated', 'client_id', p_client, 'session_id', p_sessione)::text, true);
  perform set_config('alpha.mcp_filtro', '', true);
  set local role authenticated;
  if p_filtro then
    perform set_config('request.path', '/pm_task', true);
    perform set_config('request.method', 'GET', true);
    perform set_config('request.headers', '{}', true);
    perform public.mcp_filtro_richiesta();
  end if;
end;
$$;

create or replace function pg_temp.web(p_utente uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_utente, 'role', 'authenticated')::text, true);
  perform set_config('alpha.mcp_filtro', '', true);
  set local role authenticated;
end;
$$;

-- Rows touched by a statement, as the current identity
create or replace function pg_temp.righe(p_sql text)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- How many rows the current identity reads in a relation
create or replace function pg_temp.conta(p_relazione text)
returns bigint
language plpgsql
as $$
declare
  n bigint;
begin
  execute format('select count(*) from public.%I', p_relazione) into n;
  return n;
end;
$$;

-- The relations of the later phases: never a row to Claude
create or replace function pg_temp.altre_aree()
returns text
language plpgsql
as $$
declare
  r text;
  n bigint;
  viste text[] := '{}';
begin
  -- calls, leads and the amount pitched are phase 2 (20261029090000, 102_mcp_call_lead.sql); clients,
  -- sales, instalments and the Drive folder phase 3 (20261030090000, 103_mcp_clienti_vendite.sql); costs,
  -- commissions, goals and invites phase 4 (20261031090000, 104_mcp_costi_provvigioni.sql)
  foreach r in array array['setter_daily_reports', 'audit_log', 'insight_recap', 'notifiche'] loop
    begin
      execute format('select count(*) from public.%I', r) into n;
      if n > 0 then viste := viste || r; end if;
    exception when others then
      null;
    end;
  end loop;
  return array_to_string(viste, ', ');
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. The role exists only inside an approved request
-- ---------------------------------------------------------------------------
select pg_temp.claude('11111111-1111-4111-8111-111111111111', '9e000000-0000-4000-8000-000000000001');
select is(
  row(public.current_role(), public.is_admin(), public.pm_livello_corrente(), public.puo_usare_mcp())::text,
  '(admin,t,admin,f)',
  'admin, richiesta ammessa dal filtro: il suo ruolo e il suo livello nei progetti (mai il permesso di collegare Claude)'
);
select pg_temp.claude('11111111-1111-4111-8111-111111111111', '9e000000-0000-4000-8000-000000000001', false);
select is(
  row(public.current_role(), public.is_admin(), public.pm_livello_corrente())::text,
  '(,f,)',
  'lo stesso token fuori da una richiesta ammessa (Realtime, Storage, SQL diretto): nessun ruolo'
);
select is(pg_temp.conta('pm_progetti'), 0::bigint, 'e nessun progetto');
select pg_temp.claude('44444444-4444-4444-8444-444444444444', '9e000000-0000-4000-8000-000000000004');
select is(
  row(public.current_role(), public.pm_livello_corrente(), public.vede_marketing())::text,
  '(coach,manager,f)',
  'coach: il suo ruolo e manager nei progetti; il calendario no'
);

-- ---------------------------------------------------------------------------
-- 2. Reading: as in the app
-- ---------------------------------------------------------------------------
select pg_temp.claude('11111111-1111-4111-8111-111111111111', '9e000000-0000-4000-8000-000000000001');
select is(pg_temp.conta('pm_progetti'), (select count(*) from public.pm_progetti), 'l''admin legge tutti i progetti');
select is(
  pg_temp.conta('pm_tempo'),
  (select count(*) from public.pm_tempo where minuti is not null or profile_id = '11111111-1111-4111-8111-111111111111'),
  'e il tempo già dichiarato del team, mai il timer acceso di un altro'
);
select ok(pg_temp.conta('profiles') >= 6, 'e i profili del team (nomi per i membri e gli assegnatari)');
select is(pg_temp.altre_aree(), '', 'admin: report, registro, Insight e notifiche restano chiusi (soldi e costi sono delle fasi 3 e 4)');

select pg_temp.claude('44444444-4444-4444-8444-444444444444', '9e000000-0000-4000-8000-000000000004');
-- 4 of 10_progetti.sql and the project of the client he follows in the onboarding (62_percorso_team.sql, 1.80.0)
select is(pg_temp.conta('pm_progetti'), 5::bigint, 'il coach legge solo i 5 progetti di cui è membro');
select is(pg_temp.conta('v_pm_progetti'), 5::bigint, 'anche dalla vista');
select is(
  pg_temp.conta('pm_tempo'),
  (select count(*) from public.pm_tempo where profile_id = '44444444-4444-4444-8444-444444444444'),
  'il tempo: solo il suo, anche se gestisce progetti dove altri hanno registrato tempo'
);
select is(pg_temp.altre_aree(), '', 'coach: le altre aree restano chiuse');
select is(pg_temp.conta('marketing_contenuti'), 0::bigint, 'e il calendario dei contenuti non è suo');

select pg_temp.claude('22222222-2222-4222-8222-222222222222', '9e000000-0000-4000-8000-000000000002');
select is(pg_temp.conta('pm_progetti'), 0::bigint, 'il setter, membro di nessun progetto, non ne legge');
select is(pg_temp.altre_aree(), '', 'e nemmeno da Claude legge i suoi report o i suoi clienti: sono di una fase dopo (call e lead sono della fase 2)');

-- ---------------------------------------------------------------------------
-- 3. Writing as in the app
-- ---------------------------------------------------------------------------
select pg_temp.claude('44444444-4444-4444-8444-444444444444', '9e000000-0000-4000-8000-000000000004');
select lives_ok($$
  insert into public.pm_task (id, progetto_id, titolo)
  select '9f000000-0000-4000-8000-000000000001', del_coach, 'Task da Claude' from pg_temp.x $$,
  'il coach aggiunge un task in un suo progetto');
select is(
  pg_temp.righe($$ update public.pm_task set stato = 'completato' where id = '9f000000-0000-4000-8000-000000000001' $$),
  1, 'lo completa'
);
select throws_ok($$
  insert into public.pm_task (progetto_id, titolo) select non_del_coach, 'Fuori' from pg_temp.x $$,
  '42501', null, 'mai in un progetto di cui non è membro');
select lives_ok($$
  insert into public.pm_note (progetto_id, testo) select del_coach, 'Nota da Claude' from pg_temp.x $$,
  'scrive una nota nel suo progetto');
select is(
  pg_temp.righe($$ update public.pm_note set testo = 'Cambiata' where testo = 'Nota da Claude' $$),
  0, 'una nota da Claude si aggiunge e basta: non si modifica'
);
select lives_ok($$
  select public.pm_registra_tempo(del_coach, public.oggi(), 45, null, null, null, 'Da Claude') from pg_temp.x $$,
  'registra 45 minuti del suo tempo');
select ok(public.pm_avvia_timer((select del_coach from pg_temp.x), null, 'Timer da Claude') is not null, 'avvia il timer');
select ok(public.pm_ferma_timer('Fermato da Claude') is not null, 'e lo ferma');
select throws_ok($$
  select public.pm_modifica_tempo(tempo_admin, del_coach, public.oggi(), 5, null, null, null, null) from pg_temp.x $$,
  'Voce non trovata',
  'il tempo di un altro non lo vede e non lo corregge'
);
select throws_ok($$ select count(*) from public.pm_tempo_per_persona('2026-10-01', '2026-10-31', null, null, 10) $$,
  '42501', null, 'e il tempo del team lo legge solo l''admin');
select lives_ok($$
  select public.pm_crea_progetto(reparto, 'Progetto del coach da Claude') from pg_temp.x $$,
  'un manager crea un progetto, come nell''app');

-- Nothing is deleted from Claude
select is(pg_temp.righe($$ delete from public.pm_task where id = '9f000000-0000-4000-8000-000000000001' $$), 0,
  'niente si elimina: nemmeno il task che ha creato');
select is(pg_temp.righe($$ delete from public.pm_tempo where profile_id = '44444444-4444-4444-8444-444444444444' $$), 0,
  'né il suo tempo');
select is(pg_temp.righe($$ delete from public.pm_note where autore_id = '44444444-4444-4444-8444-444444444444' $$), 0,
  'né le sue note');
select is(pg_temp.righe($$ delete from public.pm_progetti where id = (select del_coach from pg_temp.x) $$), 0,
  'né un progetto');
select throws_ok($$ insert into public.leads (nome, setter_id, fonte)
  values ('Lead da Claude', '22222222-2222-4222-8222-222222222222', 'organico') $$,
  '42501', null, 'e niente scritture nelle aree delle fasi dopo');

-- The editor: an employee of the projects
select pg_temp.claude('55555555-5555-4555-8555-555555555555', '9e000000-0000-4000-8000-000000000005');
select throws_ok($$ select public.pm_crea_progetto(reparto, 'Progetto dell''editor') from pg_temp.x $$,
  '42501', null, 'il video editor (employee) non crea progetti');
select is(
  pg_temp.righe($$ update public.pm_progetti set descrizione = 'Da Claude' where id = (select del_editor from pg_temp.x) $$),
  0, 'né modifica un progetto che non gestisce'
);
select lives_ok($$
  insert into public.pm_task (progetto_id, titolo) select del_editor, 'Task dell''editor' from pg_temp.x $$,
  'ma aggiunge un task dove è membro');

-- The admin: projects yes, never a client link from Claude, never another person's time
select pg_temp.claude('11111111-1111-4111-8111-111111111111', '9e000000-0000-4000-8000-000000000001');
select throws_ok($$
  select public.pm_crea_progetto(reparto, 'Con cliente', null, cliente) from pg_temp.x $$,
  '42501', null, 'l''admin da Claude non collega un cliente a un nuovo progetto');
select throws_ok($$
  update public.pm_progetti set client_id = (select cliente from pg_temp.x) where id = (select non_del_coach from pg_temp.x) $$,
  '42501', null, 'né a un progetto esistente');
select is(
  pg_temp.righe($$ update public.pm_tempo set nota = 'Da Claude' where id = (select tempo_coach from pg_temp.x) $$),
  0, 'il tempo degli altri lo legge, non lo scrive'
);
select ok(
  (select count(*) from public.pm_tempo_per_persona('2026-01-01', '2026-12-31', null, null, 10)) > 0,
  'e il tempo del team lo legge come in Tempo › Team'
);

-- ---------------------------------------------------------------------------
-- 4. The calendar is the Marketing area's as before
-- ---------------------------------------------------------------------------
select pg_temp.claude('61616161-6161-4161-8161-616161616161', '9e000000-0000-4000-8000-000000000006');
select is(pg_temp.righe($$ delete from public.marketing_contenuti where id = (select contenuto from pg_temp.x) $$), 0,
  'il marketing da Claude non elimina un contenuto, anche con il ruolo nella richiesta');
select pg_temp.claude('11111111-1111-4111-8111-111111111111', '9e000000-0000-4000-8000-000000000001');
select lives_ok($$ insert into public.marketing_contenuti (id, nome, created_by)
  values ('9d000000-0000-4000-8000-000000000001', 'Contenuto 99', '22222222-2222-4222-8222-222222222222') $$,
  'l''admin da Claude crea un contenuto dicendo un altro autore');
reset role;
select is((select created_by from public.marketing_contenuti where id = '9d000000-0000-4000-8000-000000000001'),
  '11111111-1111-4111-8111-111111111111'::uuid, 'resta suo: da Claude l''admin non è admin per l''autore');

-- ---------------------------------------------------------------------------
-- 5. What closes everything
-- ---------------------------------------------------------------------------
reset role;
update public.profiles set attivo = false where id = '55555555-5555-4555-8555-555555555555';
select pg_temp.claude('55555555-5555-4555-8555-555555555555', '9e000000-0000-4000-8000-000000000005');
select is(row(public.current_role(), pg_temp.conta('pm_progetti'))::text, '(,0)', 'account disattivato: nessun ruolo, nessun progetto');
select throws_ok($$ select public.pm_registra_tempo(del_editor, public.oggi(), 10) from pg_temp.x $$,
  '42501', null, 'e niente tempo');
reset role;

select pg_temp.claude('44444444-4444-4444-8444-444444444444', '9e000000-0000-4000-8000-000000000007', true,
  '9c000000-0000-4000-8000-000000000002');
select is(row(public.current_role(), pg_temp.conta('pm_progetti'))::text, '(,0)', 'client registrato da solo (dinamico): niente');
reset role;
delete from auth.sessions where id = '9e000000-0000-4000-8000-000000000008';
select pg_temp.claude('44444444-4444-4444-8444-444444444444', '9e000000-0000-4000-8000-000000000008');
select is(row(public.current_role(), pg_temp.conta('pm_tempo'))::text, '(,0)', 'sessione chiusa (Scollega): niente, nemmeno il proprio tempo');
select throws_ok($$ select public.pm_ferma_timer(null) $$, '42501', null, 'e il timer non si tocca');
reset role;

-- The web app is unchanged
select pg_temp.web('44444444-4444-4444-8444-444444444444');
select is(
  row(public.current_role(), public.pm_livello_corrente(), public.puo_usare_mcp(), pg_temp.conta('pm_progetti'))::text,
  '(coach,manager,t,6)',
  'web, coach: come prima (i suoi 5 progetti più quello creato da Claude), e ora può collegare Claude'
);
reset role;

select * from finish();
rollback;
