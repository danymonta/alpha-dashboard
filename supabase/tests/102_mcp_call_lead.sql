-- Claude a 360 gradi, fase 2 di 4 (Dany, 22-23/10/2026; 20261029090000_mcp_call_lead.sql): an OAuth
-- token works on calls, leads and outcomes with its person's permissions in the app, inside a request
-- the Data API filter approved. The filter's approval is simulated as PostgREST does it: the request
-- settings, then mcp_filtro_richiesta() (100_mcp_progetti_tempo.sql does the same). Checked here:
-- which paths pass for which role, who reads which calls and leads, who writes what (the triggers of
-- the closer's columns act on a token as on a web session), that nothing is deleted, that the setter
-- never receives the Fathom link, the performance or an amount, that the analyses and the money stay
-- closed, and that a deactivated account or a closed session gets nothing.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(65);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Seed: admin 1111, setter 2222, closer 3333, coach 4444, editor 5555,
-- business coach bc00. Every call of the seed has setter 2222; the closer is 3333 or the admin.
-- ---------------------------------------------------------------------------
insert into auth.oauth_clients (id, client_name, registration_type, client_type, redirect_uris,
  grant_types, token_endpoint_auth_method, deleted_at)
values ('9c000000-0000-4000-8000-000000000102', 'Claude', 'manual', 'public',
  'https://claude.ai/api/mcp/auth_callback', 'authorization_code,refresh_token', 'none', null);

insert into auth.sessions (id, user_id, created_at, updated_at, aal, oauth_client_id, not_after)
select ('9e100000-0000-4000-8000-00000000000' || n)::uuid, u::uuid, now(), now(), 'aal1',
  '9c000000-0000-4000-8000-000000000102', null
from (values
  (1, '11111111-1111-4111-8111-111111111111'),
  (2, '22222222-2222-4222-8222-222222222222'),
  (3, '33333333-3333-4333-8333-333333333333'),
  (4, '44444444-4444-4444-8444-444444444444'),
  (5, '55555555-5555-4555-8555-555555555555'),
  (6, 'bc000000-0000-4000-8000-000000000001'),
  -- a session that will be closed (Scollega)
  (7, '33333333-3333-4333-8333-333333333333')
) as s(n, u);

-- A lead of the setter with four calls, and a lead of the admin (he books calls too)
insert into public.leads (id, nome, setter_id, fonte) values
  ('a1020000-0000-4000-8000-000000000001', 'Lead Centodue', '22222222-2222-4222-8222-222222222222', 'dm_inbound'),
  ('a1020000-0000-4000-8000-000000000002', 'Lead Admin Centodue', '11111111-1111-4111-8111-111111111111', 'referral');
insert into public.calls (id, lead_id, setter_id, closer_id, tipo, programmata_il, stato, qualificata, esito,
  obiezione_principale, link_registrazione, performance) values
  -- c1: to be held, tomorrow
  ('a1020000-0000-4000-8000-000000000011', 'a1020000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333', 'discovery', now() + interval '1 day', 'programmata', null, null, null, null, null),
  -- c2: yesterday, its outcome still to be recorded
  ('a1020000-0000-4000-8000-000000000012', 'a1020000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333', 'discovery', now() - interval '1 day', 'programmata', null, null, null, null, null),
  -- c3: held and lost, with its Fathom link and its performance
  ('a1020000-0000-4000-8000-000000000013', 'a1020000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333', 'discovery', now() - interval '2 days', 'svolta', true, 'persa', 'Prezzo',
   'https://fathom.video/share/centodue', 'buona'),
  -- c4: the admin is its closer
  ('a1020000-0000-4000-8000-000000000014', 'a1020000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'discovery', now() + interval '2 days', 'programmata', null, null, null, null, null);
insert into public.call_pitch (call_id, importo_proposto) values ('a1020000-0000-4000-8000-000000000013', 1500);

-- What each person reads in the app (as postgres)
create temp table x on commit drop as
select
  (select count(*) from public.calls where setter_id = '22222222-2222-4222-8222-222222222222') as call_setter,
  (select count(*) from public.calls where closer_id = '33333333-3333-4333-8333-333333333333') as call_closer,
  (select count(*) from public.calls) as call_tutte,
  (select count(*) from public.leads where setter_id = '22222222-2222-4222-8222-222222222222') as lead_setter,
  (select count(*) from public.leads l where exists (select 1 from public.calls c where c.lead_id = l.id
     and c.closer_id = '33333333-3333-4333-8333-333333333333')) as lead_closer,
  (select count(*) from public.leads) as lead_tutti,
  (select count(*) from public.call_pitch p join public.calls c on c.id = p.call_id
     where c.closer_id = '33333333-3333-4333-8333-333333333333') as pitch_closer,
  (select count(*) from public.call_pitch) as pitch_tutti,
  (select count(*) from public.call_registrazioni r join public.calls c on c.id = r.call_id
     where c.closer_id = '33333333-3333-4333-8333-333333333333') as registrazioni_closer,
  (select count(*) from public.call_valutazioni where closer_id = '33333333-3333-4333-8333-333333333333') as valutazioni_closer,
  (select count(*) from public.products) as prodotti;
grant select on x to authenticated;

-- A token of Claude for one person (an OAuth JWT with client_id and session_id), as authenticated
create or replace function pg_temp.come(p_utente uuid, p_sessione uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', p_utente, 'role', 'authenticated', 'client_id', '9c000000-0000-4000-8000-000000000102',
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

-- Many requests at once: the answer of each, in order
create or replace function pg_temp.filtri(p_richieste text[])
returns text[]
language plpgsql
as $$
declare
  r text;
  esiti text[] := '{}';
begin
  foreach r in array p_richieste loop
    perform set_config('alpha.mcp_filtro', '', true);
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
end;
$$;

-- The relations that stay closed to Claude in this phase: never a row
create or replace function pg_temp.chiuse()
returns text
language plpgsql
as $$
declare
  r text;
  n bigint;
  viste text[] := '{}';
begin
  foreach r in array array['call_analisi', 'call_analisi_setter', 'call_spunti_setter', 'call_valutazioni',
    'lead_contenuto', 'expenses', 'commission_rules', 'commission_payouts',
    'setter_daily_reports', 'report_proposte_instagram', 'audit_log'] loop
    -- clients, sales and instalments are phase 3 (20261030090000, 103_mcp_clienti_vendite.sql)
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
-- 1. The filter, by role: the paths of the tools, never DELETE, never a direct insert
-- ---------------------------------------------------------------------------
select pg_temp.come('22222222-2222-4222-8222-222222222222', '9e100000-0000-4000-8000-000000000002');
select is(
  pg_temp.filtri(array['GET leads', 'POST rpc/call_per_claude', 'POST rpc/fissa_call', 'POST rpc/sposta_call',
    'POST rpc/modifica_call', 'POST rpc/aggiorna_stato_lead']),
  array['passa', 'passa', 'passa', 'passa', 'passa', 'passa'],
  'setter: i suoi lead, le call lette da call_per_claude, fissa, sposta, modifica e lo stato del lead'
);
select is(
  pg_temp.filtri(array['GET calls', 'PATCH calls', 'POST calls', 'DELETE calls', 'GET call_pitch',
    'GET call_registrazioni', 'GET products', 'POST leads', 'PATCH leads', 'DELETE leads', 'POST rpc/dettagli_call',
    'POST rpc/fissa_follow_up', 'POST rpc/collega_registrazione', 'POST rpc/scollega_registrazione',
    'POST rpc/elimina_call', 'POST rpc/elimina_lead', 'GET call_analisi_setter', 'GET call_spunti_setter',
    'GET sales', 'GET setter_daily_reports']),
  array['42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501',
        '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501'],
  'setter: mai la tabella delle call (il link), importi, registrazioni, esiti, dettagli, eliminazioni, analisi, soldi o report'
);

select pg_temp.come('33333333-3333-4333-8333-333333333333', '9e100000-0000-4000-8000-000000000003');
select is(
  pg_temp.filtri(array['GET calls', 'HEAD calls', 'PATCH calls', 'GET leads', 'GET call_registrazioni', 'GET products',
    'POST rpc/call_per_claude', 'POST rpc/dettagli_call', 'POST rpc/fissa_follow_up', 'POST rpc/collega_registrazione',
    'POST rpc/sposta_call', 'POST rpc/modifica_call', 'POST rpc/aggiorna_stato_lead']),
  array['passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa'],
  'closer: legge e registra l''esito, i dettagli, la registrazione, la call di follow-up, sposta e cambia lo stato del lead'
);
select is(
  pg_temp.filtri(array['POST rpc/fissa_call', 'DELETE calls', 'POST calls', 'DELETE call_pitch', 'GET call_pitch',
    'POST rpc/scollega_registrazione', 'POST rpc/elimina_call', 'GET call_analisi', 'GET call_valutazioni',
    'POST rpc/decidi_performance', 'POST rpc/call_analisi_richiedi', 'POST rpc/vendite_da_collegare',
    'GET clients', 'GET lead_contenuto']),
  array['42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501',
        '42501', '42501'],
  'closer: non fissa call nuove, non elimina, non scollega, e analisi, valutazioni, performance proposta e clienti diretti restano fuori'
);

select pg_temp.come('11111111-1111-4111-8111-111111111111', '9e100000-0000-4000-8000-000000000001');
select is(
  pg_temp.filtri(array['POST rpc/fissa_call', 'GET calls', 'PATCH calls', 'POST rpc/dettagli_call',
    'POST rpc/fissa_follow_up', 'POST rpc/collega_registrazione']),
  array['passa', 'passa', 'passa', 'passa', 'passa', 'passa'],
  'admin: tutto quello di setter e closer'
);
select is(
  pg_temp.filtri(array['DELETE calls', 'DELETE leads', 'PATCH leads', 'POST rpc/elimina_call', 'POST rpc/elimina_lead',
    'POST rpc/collega_vendita_call', 'POST rpc/elimina_cliente', 'POST rpc/scollega_registrazione',
    'GET call_valutazioni']),
  array['42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501'],
  'admin: niente si elimina, nessuna vendita collegata da qui (la vendita si registra: fase 3)'
);

select pg_temp.come('bc000000-0000-4000-8000-000000000001', '9e100000-0000-4000-8000-000000000006');
select is(
  pg_temp.filtri(array['GET leads', 'POST rpc/call_per_claude', 'GET products', 'GET calls', 'PATCH calls',
    'POST rpc/fissa_call', 'POST rpc/aggiorna_stato_lead', 'POST rpc/sposta_call']),
  array['passa', 'passa', 'passa', '42501', '42501', '42501', '42501', '42501'],
  'business coach: legge (call_per_claude, lead, prodotti), mai una scrittura'
);

select pg_temp.come('44444444-4444-4444-8444-444444444444', '9e100000-0000-4000-8000-000000000004');
select is(
  pg_temp.filtri(array['GET leads', 'POST rpc/call_per_claude', 'GET calls', 'GET products', 'POST rpc/sposta_call']),
  array['42501', '42501', '42501', '42501', '42501'],
  'coach: nessuno strumento di questa fase'
);
select pg_temp.come('55555555-5555-4555-8555-555555555555', '9e100000-0000-4000-8000-000000000005');
select is(
  pg_temp.filtri(array['GET leads', 'POST rpc/call_per_claude', 'GET calls', 'POST rpc/fissa_call']),
  array['42501', '42501', '42501', '42501'],
  'video editor: nemmeno'
);
reset role;

-- ---------------------------------------------------------------------------
-- 2. Reading, as in the app
-- ---------------------------------------------------------------------------
-- The setter: his calls only through call_per_claude, never their link, performance or amount
select pg_temp.come('22222222-2222-4222-8222-222222222222', '9e100000-0000-4000-8000-000000000002');
select is(pg_temp.filtro('rpc/call_per_claude', 'POST'), 'passa', 'setter: la richiesta di lettura delle call passa');
select is(
  (select max(totale) from public.call_per_claude(p_limite => 200)),
  (select call_setter from x),
  'setter: le call col suo nome, come nell''app'
);
select is(
  (select row(link_registrazione, performance, importo_proposto, registrazione)::text
   from public.call_per_claude(p_id => 'a1020000-0000-4000-8000-000000000013')),
  '(,,,)',
  'setter: della call svolta mai il link di Fathom, la performance, l''importo proposto o la registrazione'
);
select is(
  (select row(motivo, esito, lead_nome)::text from public.call_per_claude(p_id => 'a1020000-0000-4000-8000-000000000013')),
  '(Prezzo,persa,"Lead Centodue")',
  'setter: legge esito e motivo di non chiusura delle sue call, come nell''app'
);
select is(public.call_ha_follow_up(c), null, 'setter: le colonne calcolate delle call sono nulle per un token di Claude')
from public.calls c where c.id = 'a1020000-0000-4000-8000-000000000012';
-- the same token on another path: the table of the calls gives him nothing
select is(pg_temp.filtro('leads', 'GET'), 'passa', 'setter: GET leads passa');
select is(pg_temp.conta('leads'), (select lead_setter from x), 'setter: i suoi lead');
select is(pg_temp.conta('calls'), 0::bigint, 'setter: la tabella delle call, letta o incorporata da leads, non dà righe');
select is(
  (select count(*) from public.leads l, lateral (select c.link_registrazione from public.calls c where c.lead_id = l.id) z),
  0::bigint,
  'setter: nemmeno passando da un lead arriva al link di una call'
);
select is(pg_temp.chiuse(), '', 'setter: analisi, spunti, origine dei lead, costi, provvigioni e report restano chiusi');

-- The closer: the calls assigned to him, with the amount pitched and the recording
select pg_temp.come('33333333-3333-4333-8333-333333333333', '9e100000-0000-4000-8000-000000000003');
select is(pg_temp.filtro('calls', 'GET'), 'passa', 'closer: GET calls passa');
select is(pg_temp.conta('calls'), (select call_closer from x), 'closer: le call assegnate a lui');
select is(pg_temp.conta('leads'), (select lead_closer from x), 'closer: i lead delle sue call');
select is(pg_temp.conta('call_pitch'), (select pitch_closer from x), 'closer: l''importo proposto delle sue call');
select is(pg_temp.conta('call_registrazioni'), (select registrazioni_closer from x), 'closer: le registrazioni delle sue call');
select is(pg_temp.conta('products'), (select prodotti from x), 'closer: i prodotti, per il prodotto proposto');
select is(
  (select row(link_registrazione, performance, importo_proposto)::text
   from public.call_per_claude(p_id => 'a1020000-0000-4000-8000-000000000013')),
  '(https://fathom.video/share/centodue,buona,1500.00)',
  'closer: della sua call legge link, performance e importo proposto'
);
select is(
  (select count(*) from public.calls c where public.call_ha_vendita(c) is not null or public.call_ha_follow_up(c) is not null),
  0::bigint,
  'closer: call_ha_vendita e call_ha_follow_up nulli per un token di Claude (la vendita è della fase 3)'
);
select ok((select valutazioni_closer from x) >= 0 and pg_temp.conta('call_valutazioni') = 0,
  'closer: come ha condotto la call (valutazione) non arriva a Claude');
select is(pg_temp.chiuse(), '', 'closer: analisi, spunti, origine dei lead, costi, provvigioni e report restano chiusi');

-- The admin and the business coach: every call
select pg_temp.come('11111111-1111-4111-8111-111111111111', '9e100000-0000-4000-8000-000000000001');
select is(pg_temp.filtro('calls', 'GET'), 'passa', 'admin: GET calls passa');
select is(row(pg_temp.conta('calls'), pg_temp.conta('leads'), pg_temp.conta('call_pitch'))::text,
  (select row(call_tutte, lead_tutti, pitch_tutti)::text from x), 'admin: tutte le call, tutti i lead, tutti gli importi');
select is(pg_temp.chiuse(), '', 'admin: le aree delle fasi dopo restano chiuse');
select pg_temp.come('bc000000-0000-4000-8000-000000000001', '9e100000-0000-4000-8000-000000000006');
select is(pg_temp.filtro('rpc/call_per_claude', 'POST'), 'passa', 'business coach: la lettura delle call passa');
select is((select max(totale) from public.call_per_claude(p_limite => 200)), (select call_tutte from x),
  'business coach: tutte le call, come l''admin');

-- Coach: nothing, even inside an approved request of another area
select pg_temp.come('44444444-4444-4444-8444-444444444444', '9e100000-0000-4000-8000-000000000004');
select is(pg_temp.filtro('pm_task', 'GET'), 'passa', 'coach: una richiesta dei progetti');
select is(row(pg_temp.conta('calls'), pg_temp.conta('leads'), pg_temp.conta('call_pitch'))::text, '(0,0,0)',
  'coach: nessuna call, nessun lead, nessun importo');
select throws_ok($$ select * from public.call_per_claude() $$, '42501', null, 'coach: call_per_claude risponde 42501');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Writing, as in the app
-- ---------------------------------------------------------------------------
-- The setter books, moves and edits his calls (the functions of the app)
select pg_temp.come('22222222-2222-4222-8222-222222222222', '9e100000-0000-4000-8000-000000000002');
select from pg_temp.filtro('rpc/fissa_call', 'POST');
select lives_ok($$ select * from public.fissa_call('Lead Claude Centodue', 'dm_outbound', 'discovery',
  public.oggi() + 3, '18:00', '33333333-3333-4333-8333-333333333333', '@lead.claude.102') $$,
  'setter: fissa una call (lead e call insieme)');
select from pg_temp.filtro('rpc/sposta_call', 'POST');
select lives_ok($$ select public.sposta_call('a1020000-0000-4000-8000-000000000011', public.oggi() + 4, '17:30') $$,
  'setter: sposta una sua call ancora da fare');
select throws_ok($$ select public.sposta_call('a1020000-0000-4000-8000-000000000013', public.oggi() + 4, '17:30') $$,
  '22023', null, 'setter: una call svolta non si sposta, con le sue parole');
select from pg_temp.filtro('rpc/modifica_call', 'POST');
select lives_ok($$ select public.modifica_call('a1020000-0000-4000-8000-000000000011', 'discovery', public.oggi() + 4,
  '17:30', '11111111-1111-4111-8111-111111111111', 'Nota del setter da Claude') $$,
  'setter: riassegna il closer e scrive le sue note');
-- even inside a function where he reads the row, the triggers keep the closer's columns his
select throws_ok($$ update public.calls set stato = 'svolta', esito = 'persa', qualificata = true,
  obiezione_principale = 'Da Claude' where id = 'a1020000-0000-4000-8000-000000000012' $$,
  '42501', null, 'setter: non scrive mai un esito, nemmeno con un update diretto');
select throws_ok($$ update public.calls set performance = 'ottima' where id = 'a1020000-0000-4000-8000-000000000012' $$,
  '42501', null, 'setter: né la performance');
select throws_ok($$ update public.calls set link_registrazione = 'https://fathom.video/share/x'
  where id = 'a1020000-0000-4000-8000-000000000012' $$, '42501', null, 'setter: né il link di Fathom');
select throws_ok($$ select public.dettagli_call('a1020000-0000-4000-8000-000000000012', null, 'ottima') $$,
  '42501', null, 'setter: né i dettagli del closer');
select throws_ok($$ select public.collega_registrazione('a1020000-0000-4000-8000-000000000013', '{"tipo":"non_registrata"}') $$,
  '42501', null, 'setter: né la registrazione');
select lives_ok($$ select public.aggiorna_stato_lead('a1020000-0000-4000-8000-000000000001', 'follow_up') $$,
  'setter: cambia lo stato di un suo lead');
select throws_ok($$ select public.aggiorna_stato_lead('a1020000-0000-4000-8000-000000000002', 'perso') $$,
  '42501', 'Lead non trovato o non tuo', 'setter: mai di un lead non suo');
select is(pg_temp.righe($$ delete from public.calls where id = 'a1020000-0000-4000-8000-000000000011' $$)
  + pg_temp.righe($$ delete from public.leads where id = 'a1020000-0000-4000-8000-000000000001' $$), 0,
  'setter: niente si elimina, né una call né un lead');

-- The closer records an outcome (registraEsito: a PATCH on calls, then the recording)
select pg_temp.come('33333333-3333-4333-8333-333333333333', '9e100000-0000-4000-8000-000000000003');
select from pg_temp.filtro('calls', 'PATCH');
select is(pg_temp.righe($$ update public.calls set stato = 'svolta', esito = 'follow_up', qualificata = true,
  obiezione_principale = 'Deve parlarne con la moglie' where id = 'a1020000-0000-4000-8000-000000000012' $$), 1,
  'closer: registra l''esito Follow-up col motivo di non chiusura');
select throws_ok($$ update public.calls set note = 'Note del setter dal closer'
  where id = 'a1020000-0000-4000-8000-000000000012' $$, '42501', null, 'closer: le note del setter non le scrive');
select is(pg_temp.righe($$ update public.calls set esito = 'persa' where id = 'a1020000-0000-4000-8000-000000000014' $$), 0,
  'closer: la call di un altro closer non la tocca');
select from pg_temp.filtro('rpc/collega_registrazione', 'POST');
select lives_ok($$ select public.collega_registrazione('a1020000-0000-4000-8000-000000000012', '{"tipo":"non_registrata"}') $$,
  'closer: «Call non registrata»');
select from pg_temp.filtro('rpc/fissa_follow_up', 'POST');
select lives_ok($$ select public.fissa_follow_up('a1020000-0000-4000-8000-000000000012', public.oggi() + 2, '17:00') $$,
  'closer: fissa la call di follow-up');
select from pg_temp.filtro('rpc/dettagli_call', 'POST');
select lives_ok($$ select public.dettagli_call('a1020000-0000-4000-8000-000000000013', 'https://fathom.video/share/centodue',
  'ottima', null, 1800, 'Note aggiuntive da Claude') $$, 'closer: la matita, con l''importo proposto');
select is((select importo_proposto from public.call_pitch where call_id = 'a1020000-0000-4000-8000-000000000013'), 1800.00,
  'closer: l''importo proposto è scritto');
select lives_ok($$ select public.dettagli_call('a1020000-0000-4000-8000-000000000013', 'https://fathom.video/share/centodue',
  'ottima', null, null, 'Note aggiuntive da Claude') $$, 'closer: togliere l''importo, come nell''app');
reset role;
select is((select count(*) from public.call_pitch where call_id = 'a1020000-0000-4000-8000-000000000013'), 0::bigint,
  'l''importo tolto da Claude non resta');
select pg_temp.come('33333333-3333-4333-8333-333333333333', '9e100000-0000-4000-8000-000000000003');
select from pg_temp.filtro('rpc/sposta_call', 'POST');
select throws_ok($$ select public.sposta_call('a1020000-0000-4000-8000-000000000013', public.oggi() + 1, '10:00') $$,
  '22023', null, 'closer: una call svolta non si sposta');
select throws_ok($$ select * from public.fissa_call('Lead del closer', 'organico', 'discovery', public.oggi() + 1, '10:00',
  '33333333-3333-4333-8333-333333333333') $$, '42501', null, 'closer: non fissa call nuove');

-- The business coach: nothing, even if a write reached the database
select pg_temp.come('bc000000-0000-4000-8000-000000000001', '9e100000-0000-4000-8000-000000000006');
select from pg_temp.filtro('rpc/call_per_claude', 'POST');
select is(pg_temp.righe($$ update public.calls set note = 'Da Claude' where id = 'a1020000-0000-4000-8000-000000000011' $$), 0,
  'business coach: nessuna call modificata');
reset role;

-- ---------------------------------------------------------------------------
-- 4. What closes everything
-- ---------------------------------------------------------------------------
-- Outside a request the filter approved (Realtime, Storage, SQL)
select pg_temp.come('33333333-3333-4333-8333-333333333333', '9e100000-0000-4000-8000-000000000003');
select is(row(pg_temp.conta('calls'), pg_temp.conta('leads'))::text, '(0,0)', 'closer fuori dal filtro: niente');
reset role;
set local request.jwt.claims to '{}';
-- A deactivated account
update public.profiles set attivo = false where id = '22222222-2222-4222-8222-222222222222';
select pg_temp.come('22222222-2222-4222-8222-222222222222', '9e100000-0000-4000-8000-000000000002');
select is(pg_temp.filtri(array['GET leads', 'POST rpc/call_per_claude', 'POST rpc/fissa_call']),
  array['42501', '42501', '42501'], 'setter disattivato: il filtro non lascia passare niente');
reset role;
set local request.jwt.claims to '{}';
update public.profiles set attivo = true where id = '22222222-2222-4222-8222-222222222222';
-- A closed session (Scollega, or a token past its session)
delete from auth.sessions where id = '9e100000-0000-4000-8000-000000000007';
select pg_temp.come('33333333-3333-4333-8333-333333333333', '9e100000-0000-4000-8000-000000000007');
select is(pg_temp.filtro('calls', 'GET'), '42501', 'sessione chiusa: il filtro la rifiuta');
reset role;

-- The web app is unchanged: the setter's own session reads his calls from the table
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select set_config('request.path', '/calls', true);
set local role authenticated;
select is(pg_temp.conta('calls'), (select call_setter from x) + 2,
  'web, setter: le sue call dalla tabella, come prima (più quella fissata da Claude e la call di follow-up col suo nome)');
reset role;

select * from finish();
rollback;
