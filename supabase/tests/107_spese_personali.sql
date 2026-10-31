-- Personal expenses (1.68.0, 20261106090000_spese_personali.sql). Dany, 31/10/2026: «semmai dividi una
-- sezione in amministrazione per le spese personali». Checked here: the admin reads and writes them, the
-- totals per category come from SQL, the recurring ones are copied like the business costs; setter,
-- closer, video editor, marketing and business coach read zero rows and write nothing; Claude's token
-- (even the admin's) gets nothing and the Data API filter refuses the table and both functions; and,
-- above all, no business number moves: metriche_periodo (costs, cash, margine operativo) and
-- riepilogo_costi_periodo read public.expenses only.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(33);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Seed: admin 1111, setter 2222, closer 3333, editor 5555, marketing 6161,
-- business coach bc00. A month far from the seed (2034), with one business cost of 50 €.
-- ---------------------------------------------------------------------------
insert into auth.oauth_clients (id, client_name, registration_type, client_type, redirect_uris,
  grant_types, token_endpoint_auth_method, deleted_at)
values ('9c000000-0000-4000-8000-000000000107', 'Claude', 'manual', 'public',
  'https://claude.ai/api/mcp/auth_callback', 'authorization_code,refresh_token', 'none', null);
insert into auth.sessions (id, user_id, created_at, updated_at, aal, oauth_client_id, not_after)
values ('9e107000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', now(), now(), 'aal1',
  '9c000000-0000-4000-8000-000000000107', null);

insert into public.expenses (data, categoria, descrizione, importo, ricorrente)
values ('2034-03-15', 'software', 'Costo aziendale del test 107', 50, false);

create temp table prima (costi numeric, cash numeric, margine numeric) on commit drop;
grant select, insert on prima to authenticated;

-- A web session (no client_id), as authenticated
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

-- The admin's token of Claude (an OAuth JWT with client_id and session_id), as authenticated
create or replace function pg_temp.claude()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated',
    'client_id', '9c000000-0000-4000-8000-000000000107',
    'session_id', '9e107000-0000-4000-8000-000000000001')::text, true);
  perform set_config('alpha.mcp_filtro', '', true);
  perform set_config('request.path', '', true);
  set local role authenticated;
end;
$$;

-- The Data API filter on one request of the current identity: 'passa' or the SQLSTATE
create or replace function pg_temp.filtro(p_percorso text, p_metodo text)
returns text
language plpgsql
as $$
begin
  perform set_config('alpha.mcp_filtro', '', true);
  perform set_config('request.path', p_percorso, true);
  perform set_config('request.method', p_metodo, true);
  perform set_config('request.headers', '{}', true);
  begin
    perform public.mcp_filtro_richiesta();
    return 'passa';
  exception when others then
    return sqlstate;
  end;
end;
$$;

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

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
select has_table('public', 'spese_personali', 'la tabella delle spese personali esiste');
select policies_are('public', 'spese_personali', array[
  'spese_personali_admin_lettura', 'spese_personali_admin_inserimento', 'spese_personali_admin_modifica',
  'spese_personali_admin_eliminazione', 'spese_personali_mai_da_oauth'
], 'quattro policy dell''admin e la restrittiva per Claude');
select ok(
  not exists (
    select 1 from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public' and table_name = 'spese_personali'
  ),
  'anon non ha permessi sulla tabella'
);
select ok(
  (select not p.prosecdef from pg_proc p where p.oid = 'public.riepilogo_spese_personali(date, date)'::regprocedure)
  and (select not p.prosecdef from pg_proc p where p.oid = 'public.copia_spese_personali_ricorrenti(date)'::regprocedure),
  'le due funzioni sono security invoker'
);

-- ---------------------------------------------------------------------------
-- 2. The admin
-- ---------------------------------------------------------------------------
select pg_temp.web('11111111-1111-4111-8111-111111111111');
insert into prima
select costi, cash_incassato, margine_operativo from public.metriche_periodo('2034-03-01', '2034-03-31');

select lives_ok($$
  insert into public.spese_personali (data, categoria, descrizione, importo, ricorrente) values
    ('2034-03-05', 'casa', 'Affitto', 800, true),
    ('2034-03-10', 'spesa', 'Supermercato', 120.50, false),
    ('2034-03-20', 'spesa', 'Mercato', 40, false)
$$, 'l''admin registra le sue spese personali');
select is(
  (select count(*)::int from public.spese_personali where data between '2034-03-01' and '2034-03-31'), 3,
  'e le legge'
);
select is(
  (select created_by from public.spese_personali where descrizione = 'Affitto'),
  '11111111-1111-4111-8111-111111111111'::uuid,
  'created_by è chi la registra'
);
select results_eq(
  $$ select categoria, totale, numero from public.riepilogo_spese_personali('2034-03-01', '2034-03-31') $$,
  $$ values ('casa'::text, 800.00::numeric, 1), ('spesa', 160.50, 2), (null, 960.50, 3) $$,
  'i totali per categoria e la riga del totale vengono dal SQL'
);
select throws_ok(
  $$ select * from public.riepilogo_spese_personali('2034-03-31', '2034-03-01') $$, '22023', null,
  'un periodo al contrario è rifiutato'
);
select is(
  pg_temp.righe($$ update public.spese_personali set importo = 45 where descrizione = 'Mercato' $$), 1,
  'l''admin la corregge'
);
select throws_ok(
  $$ insert into public.spese_personali (data, categoria, descrizione, importo) values ('2034-03-21', 'viaggi', 'Treno', 10) $$,
  '23514', null,
  'una categoria fuori dall''elenco è rifiutata'
);
select throws_ok(
  $$ insert into public.spese_personali (data, categoria, descrizione, importo) values ('2034-03-21', 'altro', 'Zero', 0) $$,
  '23514', null,
  'un importo a zero è rifiutato'
);

-- No business number moves
select is(
  (select row(costi, cash_incassato, margine_operativo)::text
   from public.metriche_periodo('2034-03-01', '2034-03-31')),
  (select row(costi, cash, margine)::text from prima),
  'metriche_periodo: costi, cash e margine operativo non cambiano con le spese personali'
);
select is(
  (select costi from public.metriche_periodo('2034-03-01', '2034-03-31')), 50.00::numeric,
  'i costi del mese sono solo quelli aziendali'
);
select is(
  (select totale from public.riepilogo_costi_periodo('2034-03-01', '2034-03-31') where categoria is null), 50.00::numeric,
  'Costi non vede le spese personali'
);

-- Recurring ones are copied to the next month, once
select is(public.copia_spese_personali_ricorrenti('2034-04-01'), 1, 'copia solo le ricorrenti del mese prima');
select is(public.copia_spese_personali_ricorrenti('2034-04-01'), 0, 'rilanciata non duplica');
select is(
  (select row(data, categoria, importo, ricorrente)::text from public.spese_personali
   where data between '2034-04-01' and '2034-04-30'),
  row('2034-04-05'::date, 'casa'::text, 800.00::numeric, true)::text,
  'la copia tiene il giorno del mese, la categoria e l''importo'
);

-- ---------------------------------------------------------------------------
-- 3. Nobody else: setter, closer, video editor, marketing, business coach
-- ---------------------------------------------------------------------------
select pg_temp.web('22222222-2222-4222-8222-222222222222');
select is((select count(*)::int from public.spese_personali), 0, 'il setter non legge nessuna spesa personale');
select throws_ok(
  $$ insert into public.spese_personali (data, categoria, descrizione, importo) values ('2034-03-22', 'altro', 'Prova setter', 5) $$,
  '42501', null, 'e non ne scrive'
);
select is(
  pg_temp.righe($$ update public.spese_personali set importo = 1 $$) + pg_temp.righe($$ delete from public.spese_personali $$), 0,
  'e non ne corregge né elimina'
);
select throws_ok(
  $$ select * from public.riepilogo_spese_personali('2034-03-01', '2034-03-31') $$, '42501', null,
  'i totali gli rispondono 42501'
);

select pg_temp.web('33333333-3333-4333-8333-333333333333');
select is((select count(*)::int from public.spese_personali), 0, 'il closer nemmeno');
select pg_temp.web('55555555-5555-4555-8555-555555555555');
select is((select count(*)::int from public.spese_personali), 0, 'il video editor nemmeno');
select pg_temp.web('61616161-6161-4161-8161-616161616161');
select is((select count(*)::int from public.spese_personali), 0, 'il marketing nemmeno');

select pg_temp.web('bc000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.spese_personali), 0, 'il business coach nemmeno');
select throws_ok(
  $$ select public.copia_spese_personali_ricorrenti('2034-05-01') $$, '42501', null,
  'e non copia le ricorrenti'
);

-- ---------------------------------------------------------------------------
-- 4. Claude: the admin's token gets nothing
-- ---------------------------------------------------------------------------
select pg_temp.claude();
select is((select count(*)::int from public.spese_personali), 0, 'token di Claude dell''admin: nessuna riga');
select throws_ok(
  $$ insert into public.spese_personali (data, categoria, descrizione, importo) values ('2034-03-23', 'altro', 'Da Claude', 5) $$,
  '42501', null, 'token di Claude: nessuna scrittura'
);
select throws_ok(
  $$ select * from public.riepilogo_spese_personali('2034-03-01', '2034-03-31') $$, '42501', null,
  'token di Claude: i totali rispondono 42501'
);
select is(
  array[
    pg_temp.filtro('/spese_personali', 'GET'), pg_temp.filtro('/spese_personali', 'POST'),
    pg_temp.filtro('/rpc/riepilogo_spese_personali', 'POST'),
    pg_temp.filtro('/rpc/copia_spese_personali_ricorrenti', 'POST')
  ],
  array['42501', '42501', '42501', '42501'],
  'il filtro delle Data API rifiuta la tabella e le due funzioni'
);

-- ---------------------------------------------------------------------------
-- 5. Nothing changed for anyone else, and anon reaches nothing
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims to '{}';
select is(
  (select array_agg(descrizione || ' ' || importo order by data) from public.spese_personali where data >= '2034-03-01'),
  array['Affitto 800.00', 'Supermercato 120.50', 'Mercato 45.00', 'Affitto 800.00'],
  'le spese restano quelle dell''admin'
);
set local role anon;
select throws_ok($$ select count(*) from public.spese_personali $$, '42501', null, 'anon non legge la tabella');
reset role;

select * from finish();
rollback;
