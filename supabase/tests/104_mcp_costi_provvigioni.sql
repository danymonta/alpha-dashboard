-- Claude a 360 gradi, fase 4 di 4 (Dany, 22-23/10/2026; 20261031090000_mcp_costi_provvigioni.sql): an
-- OAuth token reads the economics of the Panoramica, the costs, the commissions, the goals and the team
-- with its person's permissions in the app, inside a request the Data API filter approved, and the admin
-- writes costs, payouts, rules and goals. The filter's approval is simulated as PostgREST does it: the
-- request settings, then mcp_filtro_richiesta() (102 and 103 do the same). Checked here: which paths pass
-- for which role, that Claude reads the same numbers as the app (the period's DM included, read from the
-- setter's reports only inside the functions that sum them), who writes what (the audit writes the
-- token's person), that nothing is deleted, the team never written, the setter only his own commissions,
-- and that a deactivated account or a closed session gets nothing.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(55);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Seed: admin 1111, setter 2222, closer 3333, coach 4444, editor 5555,
-- business coach bc00.
-- ---------------------------------------------------------------------------
insert into auth.oauth_clients (id, client_name, registration_type, client_type, redirect_uris,
  grant_types, token_endpoint_auth_method, deleted_at)
values ('9c000000-0000-4000-8000-000000000104', 'Claude', 'manual', 'public',
  'https://claude.ai/api/mcp/auth_callback', 'authorization_code,refresh_token', 'none', null);

insert into auth.sessions (id, user_id, created_at, updated_at, aal, oauth_client_id, not_after)
select ('9e104000-0000-4000-8000-00000000000' || n)::uuid, u::uuid, now(), now(), 'aal1',
  '9c000000-0000-4000-8000-000000000104', null
from (values
  (1, '11111111-1111-4111-8111-111111111111'),
  (2, '22222222-2222-4222-8222-222222222222'),
  (3, '33333333-3333-4333-8333-333333333333'),
  (4, '44444444-4444-4444-8444-444444444444'),
  (5, '55555555-5555-4555-8555-555555555555'),
  (6, 'bc000000-0000-4000-8000-000000000001'),
  -- a session that will be closed (Scollega)
  (7, '11111111-1111-4111-8111-111111111111')
) as s(n, u);

-- one row in every table of this phase, whatever the seed has
insert into public.expenses (id, data, categoria, descrizione, importo, ricorrente) values
  ('e1040000-0000-4000-8000-000000000001', public.oggi(), 'software', 'Prova 104', 10, false);
insert into public.commission_payouts (id, profile_id, periodo, importo, pagato_il) values
  ('e1040000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
   date_trunc('month', public.oggi())::date, 25, public.oggi());
insert into public.obiettivi_mese (mese, cash, nuovi_clienti) values ('2024-01-01', 10000, 5)
  on conflict (mese) do nothing;
insert into public.invites (email, ruolo) values ('invito104@alpha.test', 'closer');

-- What the tables hold (as postgres)
create temp table x on commit drop as
select
  (select count(*) from public.expenses) as costi,
  (select count(*) from public.commission_rules) as regole,
  (select count(*) from public.commission_payouts) as pagamenti,
  (select count(*) from public.obiettivi_mese) as obiettivi,
  (select count(*) from public.invites) as inviti,
  (select count(*) from public.setter_daily_reports) as report;
grant select on x to authenticated;
create temp table regola (id uuid) on commit drop;
grant select, insert on regola to authenticated;

-- The answers of the read functions, by identity
create temp table risposte (persona text, funzione text, testo text) on commit drop;
grant select, insert on risposte to authenticated;

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

-- A token of Claude for one person (an OAuth JWT with client_id and session_id), as authenticated
create or replace function pg_temp.come(p_utente uuid, p_sessione uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', p_utente, 'role', 'authenticated', 'client_id', '9c000000-0000-4000-8000-000000000104',
    'session_id', p_sessione)::text, true);
  perform set_config('alpha.mcp_filtro', '', true);
  perform set_config('request.path', '', true);
  set local role authenticated;
end;
$$;

-- The filter on one request of the current identity: 'passa' (and the request goes on with that path)
-- or the SQLSTATE
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

create or replace function pg_temp.filtri(p_richieste text[])
returns text[]
language plpgsql
as $$
declare
  r text;
  esiti text[] := '{}';
begin
  foreach r in array p_richieste loop
    esiti := esiti || pg_temp.filtro(split_part(r, ' ', 2), split_part(r, ' ', 1));
  end loop;
  return esiti;
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

create or replace function pg_temp.conta(p_relazione text)
returns bigint
language plpgsql
as $$
declare
  n bigint;
begin
  execute format('select count(*) from public.%I', p_relazione) into n;
  return n;
exception when others then
  return -1;
end;
$$;

-- The tables of this phase that give rows to the current identity
create or replace function pg_temp.economia()
returns text
language plpgsql
as $$
declare
  r text;
  n bigint;
  viste text[] := '{}';
begin
  foreach r in array array['expenses', 'commission_rules', 'commission_payouts', 'obiettivi_mese', 'invites',
    'setter_daily_reports', 'v_provvigioni_maturate'] loop
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

-- The read functions of the Panoramica, Incassi and Provvigioni; with p_oauth each one inside its own
-- approved request (its path), as PostgREST runs it
create or replace function pg_temp.leggi_tutto(p_persona text, p_oauth boolean)
returns void
language plpgsql
as $$
declare
  r record;
  t text;
  v_da date := public.oggi() - 120;
  v_a date := public.oggi();
begin
  for r in select * from (values
    ('metriche_periodo', format('select array_agg(f::text) from public.metriche_periodo(%L, %L) f', v_da, v_a)),
    ('kpi_periodo', format('select array_agg(f::text) from public.kpi_periodo(%L, %L) f', v_da, v_a)),
    ('funnel_periodo', format('select array_agg(f::text) from public.funnel_periodo(%L, %L) f', v_da, v_a)),
    ('cash_mensile', format('select array_agg(f::text) from public.cash_mensile(12, %L) f', v_a)),
    ('da_incassare', 'select array_agg(f::text) from public.da_incassare() f'),
    ('previsione_cassa', 'select array_agg(f::text) from public.previsione_cassa(3) f'),
    ('avanzamento_obiettivi', 'select array_agg(f::text) from public.avanzamento_obiettivi(''2024-01-01'') f'),
    ('metriche_per_fonte', format('select array_agg(f::text) from public.metriche_per_fonte(%L, %L) f', v_da, v_a)),
    ('provvigioni_riepilogo', 'select array_agg(f::text) from public.provvigioni_riepilogo(6) f'),
    ('provvigioni_per_vendita', 'select array_agg(f::text) from public.provvigioni_per_vendita(null) f')
  ) as v(funzione, sql) loop
    if p_oauth then
      perform pg_temp.filtro('rpc/' || r.funzione, 'POST');
    end if;
    begin
      execute r.sql into t;
      insert into pg_temp.risposte values (p_persona, r.funzione, coalesce(t, '(niente)'));
    exception when others then
      insert into pg_temp.risposte values (p_persona, r.funzione, 'errore ' || sqlstate);
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. The filter, by role: the paths of the tools, never DELETE
-- ---------------------------------------------------------------------------
select pg_temp.come('11111111-1111-4111-8111-111111111111', '9e104000-0000-4000-8000-000000000001');
select is(
  pg_temp.filtri(array['GET expenses', 'HEAD expenses', 'GET commission_rules', 'GET commission_payouts',
    'GET obiettivi_mese', 'GET invites', 'POST rpc/metriche_periodo', 'POST rpc/kpi_periodo', 'POST rpc/funnel_periodo',
    'POST rpc/cash_mensile', 'POST rpc/previsione_cassa', 'POST rpc/avanzamento_obiettivi', 'POST rpc/metriche_per_fonte',
    'POST rpc/provvigioni_riepilogo', 'GET rpc/provvigioni_per_vendita']),
  array['passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa',
        'passa', 'passa', 'passa'],
  'admin: legge costi, regole, pagamenti, obiettivi, inviti e i numeri della Panoramica e delle provvigioni'
);
select is(
  pg_temp.filtri(array['POST expenses', 'PATCH expenses', 'POST commission_payouts', 'PATCH commission_payouts',
    'PATCH commission_rules', 'POST obiettivi_mese', 'PATCH obiettivi_mese', 'POST rpc/nuova_regola_provvigione',
    'POST rpc/chiudi_regola_provvigione', 'POST rpc/copia_costi_ricorrenti']),
  array['passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa'],
  'admin: scrive costi, pagamenti, regole e obiettivi come l''app'
);
select is(
  pg_temp.filtri(array['DELETE expenses', 'DELETE commission_payouts', 'DELETE commission_rules', 'DELETE obiettivi_mese',
    'DELETE invites', 'POST commission_rules', 'POST invites', 'PATCH invites', 'PATCH profiles', 'GET setter_daily_reports',
    'GET audit_log', 'POST rpc/elimina_persona', 'POST rpc/unisci_profili', 'POST rpc/miei_numeri_periodo',
    'POST rpc/backup_completo', 'POST rpc/metriche_setting']),
  array['42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501',
        '42501', '42501', '42501', '42501'],
  'admin: niente si elimina, il team non si scrive, report, registro e backup restano fuori'
);

select pg_temp.come('bc000000-0000-4000-8000-000000000001', '9e104000-0000-4000-8000-000000000006');
select is(
  pg_temp.filtri(array['GET expenses', 'GET invites', 'POST rpc/metriche_periodo', 'POST rpc/provvigioni_riepilogo',
    'POST rpc/previsione_cassa', 'POST expenses', 'PATCH commission_rules', 'POST obiettivi_mese',
    'POST rpc/nuova_regola_provvigione', 'POST rpc/copia_costi_ricorrenti']),
  array['passa', 'passa', 'passa', 'passa', 'passa', '42501', '42501', '42501', '42501', '42501'],
  'business coach: legge come l''admin, mai una scrittura'
);
select set_config('request.path', 'expenses', true), set_config('request.method', 'POST', true),
  set_config('request.headers', '{}', true);
select throws_ok($$ select public.mcp_filtro_richiesta() $$, '42501',
  'Il business coach legge e basta: da Claude non si scrive niente.', 'business coach: il rifiuto lo dice');

select pg_temp.come('22222222-2222-4222-8222-222222222222', '9e104000-0000-4000-8000-000000000002');
select is(
  pg_temp.filtri(array['POST rpc/miei_numeri_periodo', 'GET rpc/miei_numeri_periodo', 'GET commission_rules',
    'GET commission_payouts', 'GET expenses', 'POST rpc/provvigioni_riepilogo', 'POST rpc/provvigioni_per_vendita',
    'POST rpc/metriche_periodo', 'GET invites', 'GET setter_daily_reports']),
  array['passa', 'passa', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501'],
  'setter: solo i suoi numeri (le sue provvigioni), mai regole, pagamenti, costi o i numeri dell''azienda'
);

select pg_temp.come('33333333-3333-4333-8333-333333333333', '9e104000-0000-4000-8000-000000000003');
select is(
  pg_temp.filtri(array['GET expenses', 'GET commission_payouts', 'POST rpc/metriche_periodo', 'POST rpc/miei_numeri_periodo',
    'POST rpc/provvigioni_riepilogo', 'POST expenses']),
  array['42501', '42501', '42501', '42501', '42501', '42501'],
  'closer: nessuno strumento di questa fase'
);
select pg_temp.come('44444444-4444-4444-8444-444444444444', '9e104000-0000-4000-8000-000000000004');
select is(pg_temp.filtri(array['GET expenses', 'GET invites', 'POST rpc/metriche_periodo']), array['42501', '42501', '42501'],
  'coach: nemmeno');
select pg_temp.come('55555555-5555-4555-8555-555555555555', '9e104000-0000-4000-8000-000000000005');
select is(pg_temp.filtri(array['GET expenses', 'GET commission_rules', 'POST rpc/provvigioni_riepilogo']),
  array['42501', '42501', '42501'], 'video editor: nemmeno');
reset role;
set local request.jwt.claims to '{}';

-- ---------------------------------------------------------------------------
-- 2. Reading: the same numbers as the app
-- ---------------------------------------------------------------------------
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select pg_temp.leggi_tutto('web_admin', false);
select pg_temp.come('11111111-1111-4111-8111-111111111111', '9e104000-0000-4000-8000-000000000001');
select pg_temp.leggi_tutto('claude_admin', true);
select pg_temp.come('bc000000-0000-4000-8000-000000000001', '9e104000-0000-4000-8000-000000000006');
select pg_temp.leggi_tutto('claude_bc', true);
reset role;
set local request.jwt.claims to '{}';

select is(
  (select coalesce(string_agg(funzione, ', ' order by funzione), '') from risposte
   where persona = 'web_admin' and (testo like 'errore %' or testo = '(niente)')),
  '',
  'web, admin: ogni funzione risponde'
);
select is(
  (select coalesce(string_agg(a.funzione, ', ' order by a.funzione), '')
   from risposte a join risposte b on b.funzione = a.funzione and b.persona = 'claude_admin'
   where a.persona = 'web_admin' and a.testo is distinct from b.testo),
  '',
  'Claude dell''admin: le stesse risposte della Panoramica, di Incassi e di Provvigioni (anche i DM del periodo)'
);
select is(
  (select coalesce(string_agg(a.funzione, ', ' order by a.funzione), '')
   from risposte a join risposte b on b.funzione = a.funzione and b.persona = 'claude_bc'
   where a.persona = 'web_admin' and a.testo is distinct from b.testo),
  '',
  'Claude del business coach: le stesse risposte dell''admin'
);
select pg_temp.come('11111111-1111-4111-8111-111111111111', '9e104000-0000-4000-8000-000000000001');
select from pg_temp.filtro('rpc/metriche_periodo', 'POST');
select ok((select dm_totali from public.metriche_periodo(public.oggi() - 120, public.oggi())) > 0,
  'i DM del periodo arrivano a Claude (non zero: il seed ha dei report)');
select is(pg_temp.filtro('expenses', 'GET'), 'passa', 'admin: GET expenses passa');
select is(
  row(pg_temp.conta('expenses'), pg_temp.conta('commission_rules'), pg_temp.conta('commission_payouts'),
      pg_temp.conta('obiettivi_mese'), pg_temp.conta('invites'))::text,
  (select row(costi, regole, pagamenti, obiettivi, inviti)::text from x),
  'admin: tutti i costi, le regole, i pagamenti, gli obiettivi e gli inviti'
);
select is(pg_temp.conta('setter_daily_reports'), 0::bigint,
  'admin: i report del setter mai letti direttamente, nemmeno in una richiesta approvata');
select from pg_temp.filtro('rpc/metriche_periodo', 'POST');
select ok(pg_temp.conta('setter_daily_reports') = (select report from x),
  'admin: i report si leggono solo dentro la somma del periodo (metriche_periodo)');

select pg_temp.come('bc000000-0000-4000-8000-000000000001', '9e104000-0000-4000-8000-000000000006');
select from pg_temp.filtro('commission_rules', 'GET');
select is(row(pg_temp.conta('commission_rules'), pg_temp.conta('invites'))::text, (select row(regole, inviti)::text from x),
  'business coach: regole e inviti, come l''admin');
select is(pg_temp.conta('setter_daily_reports'), 0::bigint, 'business coach: mai i report diretti');

-- The setter: his commissions from miei_numeri_periodo, the same as his page; nothing else
reset role;
set local request.jwt.claims to '{}';
create temp table mio (provvigioni_maturate numeric, provvigioni_pagate numeric) on commit drop;
grant select, insert on mio to authenticated;
select pg_temp.web('22222222-2222-4222-8222-222222222222');
insert into mio select provvigioni_maturate, provvigioni_pagate
from public.miei_numeri_periodo(date_trunc('month', public.oggi())::date, public.oggi());
select pg_temp.come('22222222-2222-4222-8222-222222222222', '9e104000-0000-4000-8000-000000000002');
select is(pg_temp.filtro('rpc/miei_numeri_periodo', 'POST'), 'passa', 'setter: i suoi numeri passano');
select is(
  (select row(provvigioni_maturate, provvigioni_pagate)::text
   from public.miei_numeri_periodo(date_trunc('month', public.oggi())::date, public.oggi())),
  (select row(provvigioni_maturate, provvigioni_pagate)::text from mio),
  'setter: le sue provvigioni maturate e pagate, come I miei numeri'
);
select ok((select provvigioni_pagate from mio) >= 25, 'setter: il pagamento del mese è nelle pagate');
select is(pg_temp.economia(), '', 'setter: nessuna tabella dei costi e delle provvigioni, nemmeno dentro la sua richiesta');
select throws_ok($$ select * from public.provvigioni_riepilogo(6) $$, '42501', null,
  'setter: le provvigioni di tutti rispondono 42501');

-- Closer, coach and video editor: nothing, even inside an approved request of their own area
select pg_temp.come('33333333-3333-4333-8333-333333333333', '9e104000-0000-4000-8000-000000000003');
select is(pg_temp.filtro('sales', 'GET'), 'passa', 'closer: una richiesta delle sue vendite');
select is(pg_temp.economia(), '', 'closer: niente costi, provvigioni, obiettivi, inviti o report');
select throws_ok($$ select * from public.metriche_periodo(public.oggi() - 30, public.oggi()) $$, '42501', null,
  'closer: i numeri dell''azienda rispondono 42501');
select pg_temp.come('44444444-4444-4444-8444-444444444444', '9e104000-0000-4000-8000-000000000004');
select is(pg_temp.filtro('pm_progetti', 'GET'), 'passa', 'coach: una richiesta dei progetti');
select is(pg_temp.economia(), '', 'coach: niente');
select pg_temp.come('55555555-5555-4555-8555-555555555555', '9e104000-0000-4000-8000-000000000005');
select is(pg_temp.filtro('pm_task', 'GET'), 'passa', 'video editor: una richiesta dei progetti');
select is(pg_temp.economia(), '', 'video editor: niente');
reset role;
set local request.jwt.claims to '{}';

-- ---------------------------------------------------------------------------
-- 3. Writing, as in the app
-- ---------------------------------------------------------------------------
select pg_temp.come('11111111-1111-4111-8111-111111111111', '9e104000-0000-4000-8000-000000000001');
select from pg_temp.filtro('expenses', 'POST');
select lives_ok($$ insert into public.expenses (id, data, categoria, descrizione, importo, ricorrente)
  values ('e1040000-0000-4000-8000-000000000011', public.oggi(), 'ads', 'Da Claude 104', 50, true) $$,
  'admin: registra un costo');
select from pg_temp.filtro('expenses', 'PATCH');
select is(pg_temp.righe($$ update public.expenses set importo = 55 where id = 'e1040000-0000-4000-8000-000000000011' $$), 1,
  'admin: corregge un costo');
select is(pg_temp.righe($$ delete from public.expenses where id = 'e1040000-0000-4000-8000-000000000011' $$), 0,
  'admin: un costo non si elimina da Claude');
select from pg_temp.filtro('rpc/copia_costi_ricorrenti', 'POST');
select lives_ok($$ select public.copia_costi_ricorrenti((date_trunc('month', public.oggi()) + interval '1 month')::date) $$,
  'admin: copia i costi ricorrenti nel mese dopo');
select from pg_temp.filtro('commission_payouts', 'POST');
select lives_ok($$ insert into public.commission_payouts (id, profile_id, periodo, importo, pagato_il)
  values ('e1040000-0000-4000-8000-000000000012', '22222222-2222-4222-8222-222222222222',
          date_trunc('month', public.oggi())::date, 10, public.oggi()) $$, 'admin: registra un pagamento di provvigioni');
select from pg_temp.filtro('commission_payouts', 'PATCH');
select is(pg_temp.righe($$ update public.commission_payouts set importo = 12 where id = 'e1040000-0000-4000-8000-000000000012' $$), 1,
  'admin: corregge un pagamento');
select is(pg_temp.righe($$ delete from public.commission_payouts where id = 'e1040000-0000-4000-8000-000000000012' $$), 0,
  'admin: un pagamento non si elimina da Claude');
select from pg_temp.filtro('rpc/nuova_regola_provvigione', 'POST');
insert into regola select public.nuova_regola_provvigione('33333333-3333-4333-8333-333333333333', 0.03, '{nuovo}', public.oggi() + 400);
select is((select count(*) from regola where id is not null), 1::bigint, 'admin: crea una regola provvigionale');
select from pg_temp.filtro('rpc/chiudi_regola_provvigione', 'POST');
select lives_ok($$ select public.chiudi_regola_provvigione((select id from pg_temp.regola), public.oggi() + 500) $$,
  'admin: chiude la regola');
select from pg_temp.filtro('commission_rules', 'PATCH');
select is(pg_temp.righe($$ update public.commission_rules set percentuale = 0.04 where id = (select id from pg_temp.regola) $$), 1,
  'admin: corregge la regola');
select is(pg_temp.righe($$ delete from public.commission_rules where id = (select id from pg_temp.regola) $$), 0,
  'admin: una regola non si elimina da Claude');
select from pg_temp.filtro('obiettivi_mese', 'POST');
select lives_ok($$ insert into public.obiettivi_mese (mese, cash, nuovi_clienti) values ('2031-01-01', 9000, 4)
  on conflict (mese) do update set cash = excluded.cash, nuovi_clienti = excluded.nuovi_clienti $$,
  'admin: imposta gli obiettivi (l''upsert dell''app)');
select is(pg_temp.righe($$ delete from public.obiettivi_mese where mese = '2031-01-01' $$), 0,
  'admin: gli obiettivi non si tolgono da Claude');
-- The team and the reports: never written, even inside an approved request
select throws_ok($$ insert into public.invites (email, ruolo) values ('da.claude104@alpha.test', 'setter') $$,
  '42501', null, 'admin: nessun invito da Claude');
select is(pg_temp.righe($$ update public.invites set revocato = true where email = 'invito104@alpha.test' $$), 0,
  'admin: nessuna revoca da Claude');
select throws_ok($$ insert into public.setter_daily_reports (setter_id, data) values
  ('22222222-2222-4222-8222-222222222222', public.oggi() - 900) $$, '42501', null, 'admin: nessun report da Claude');
reset role;
set local request.jwt.claims to '{}';
select is(
  (select utente_id from public.audit_log
   where tabella = 'expenses' and azione = 'insert' and record_id = 'e1040000-0000-4000-8000-000000000011'),
  '11111111-1111-4111-8111-111111111111'::uuid,
  'il registro delle modifiche scrive la persona del token'
);

-- The business coach and the closer: no row written, whatever reached the database
select pg_temp.come('bc000000-0000-4000-8000-000000000001', '9e104000-0000-4000-8000-000000000006');
select from pg_temp.filtro('rpc/metriche_periodo', 'POST');
select is(pg_temp.righe($$ update public.expenses set importo = 1 $$)
  + pg_temp.righe($$ update public.commission_rules set percentuale = 0.5 $$), 0, 'business coach: nessuna riga modificata');
select pg_temp.come('33333333-3333-4333-8333-333333333333', '9e104000-0000-4000-8000-000000000003');
select from pg_temp.filtro('sales', 'GET');
select throws_ok($$ insert into public.expenses (data, categoria, descrizione, importo) values (public.oggi(), 'altro', 'Dal closer', 1) $$,
  '42501', null, 'closer: nessun costo');
reset role;
set local request.jwt.claims to '{}';

-- ---------------------------------------------------------------------------
-- 4. What closes everything
-- ---------------------------------------------------------------------------
-- Outside a request the filter approved (Realtime, Storage, SQL)
select pg_temp.come('11111111-1111-4111-8111-111111111111', '9e104000-0000-4000-8000-000000000001');
select is(pg_temp.economia(), '', 'admin fuori dal filtro: niente');
reset role;
set local request.jwt.claims to '{}';
-- A deactivated account
update public.profiles set attivo = false where id = 'bc000000-0000-4000-8000-000000000001';
select pg_temp.come('bc000000-0000-4000-8000-000000000001', '9e104000-0000-4000-8000-000000000006');
select is(pg_temp.filtri(array['GET expenses', 'POST rpc/metriche_periodo']), array['42501', '42501'],
  'business coach disattivato: il filtro non lascia passare niente');
reset role;
set local request.jwt.claims to '{}';
update public.profiles set attivo = true where id = 'bc000000-0000-4000-8000-000000000001';
-- A closed session (Scollega, or a token past its session)
delete from auth.sessions where id = '9e104000-0000-4000-8000-000000000007';
select pg_temp.come('11111111-1111-4111-8111-111111111111', '9e104000-0000-4000-8000-000000000007');
select is(pg_temp.filtro('expenses', 'GET'), '42501', 'sessione chiusa: il filtro la rifiuta');
reset role;

-- The web app is unchanged: the admin's own session reads and deletes a cost as before
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select is(pg_temp.conta('setter_daily_reports'), (select report from x), 'web, admin: i report dalla tabella, come prima');
select is(pg_temp.righe($$ delete from public.expenses where id = 'e1040000-0000-4000-8000-000000000011' $$), 1,
  'web, admin: un costo si elimina dall''app, come prima');
reset role;

select * from finish();
rollback;
