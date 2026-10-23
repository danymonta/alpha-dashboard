-- Claude a 360 gradi, fase 3 di 4 (Dany, 22-23/10/2026; 20261030090000_mcp_clienti_vendite.sql): an
-- OAuth token works on clients, sales, instalments and cash-ins with its person's permissions in the
-- app, inside a request the Data API filter approved. The filter's approval is simulated as PostgREST
-- does it: the request settings, then mcp_filtro_richiesta() (102_mcp_call_lead.sql does the same).
-- Checked here: which paths pass for which role, who reads what (the setter never a sale, an
-- instalment or a client, only his two functions; the closer only his sales), who writes what (the
-- triggers act on a token as on a web session, the audit writes the token's person, a first cash-in
-- opens the client's project), that nothing is deleted but by the three functions that delete to
-- work, that the Drive folder, the contract, the costs and the commissions stay closed in writing, and
-- that a deactivated account or a closed session gets nothing.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(70);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Seed: admin 1111, setter 2222, closer 3333, coach 4444, editor 5555,
-- business coach bc00. Every sale of the seed has setter 2222; the closer is 3333 or the admin.
-- ---------------------------------------------------------------------------
insert into auth.oauth_clients (id, client_name, registration_type, client_type, redirect_uris,
  grant_types, token_endpoint_auth_method, deleted_at)
values ('9c000000-0000-4000-8000-000000000103', 'Claude', 'manual', 'public',
  'https://claude.ai/api/mcp/auth_callback', 'authorization_code,refresh_token', 'none', null);

insert into auth.sessions (id, user_id, created_at, updated_at, aal, oauth_client_id, not_after)
select ('9e103000-0000-4000-8000-00000000000' || n)::uuid, u::uuid, now(), now(), 'aal1',
  '9c000000-0000-4000-8000-000000000103', null
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

-- A client of the closer (brought by the setter), with a sale of three instalments; a client the admin
-- brought and closed himself (no setter of the setter, never his); a closed call of the closer still
-- without its sale
insert into public.clients (id, nome, cognome, email, telefono, fonte, setter_id, closer_id) values
  ('c1030000-0000-4000-8000-000000000001', 'Cliente', 'Centotre', 'centotre@example.test', '+39 333 000 0103',
   'dm_inbound', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'),
  ('c1030000-0000-4000-8000-000000000002', 'Cliente', 'Admin Centotre', null, null,
   'referral', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111');
insert into public.sales (id, client_id, product_id, tipo, setter_id, closer_id, data_vendita, data_inizio,
  valore_contratto, numero_rate, created_by) values
  ('c1030000-0000-4000-8000-000000000011', 'c1030000-0000-4000-8000-000000000001', 'aaaaaaa1-0000-4000-8000-000000000002',
   'nuovo', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333',
   public.oggi() - 40, public.oggi() - 33, 1500, 3, '33333333-3333-4333-8333-333333333333'),
  ('c1030000-0000-4000-8000-000000000012', 'c1030000-0000-4000-8000-000000000002', 'aaaaaaa1-0000-4000-8000-000000000003',
   'nuovo', '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
   public.oggi() - 10, public.oggi() - 3, 2400, 4, '11111111-1111-4111-8111-111111111111');
insert into public.clienti_cartelle (client_id, url)
values ('c1030000-0000-4000-8000-000000000001', 'https://drive.google.com/drive/folders/test-103');
insert into public.vendite_contratti (sale_id, url)
values ('c1030000-0000-4000-8000-000000000011', 'https://drive.google.com/file/d/test-103');
insert into public.leads (id, nome, setter_id, fonte) values
  ('c1030000-0000-4000-8000-000000000021', 'Lead Vendita Centotre', '22222222-2222-4222-8222-222222222222', 'dm_outbound');
insert into public.calls (id, lead_id, setter_id, closer_id, tipo, programmata_il, stato, qualificata, esito) values
  ('c1030000-0000-4000-8000-000000000031', 'c1030000-0000-4000-8000-000000000021', '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333', 'discovery', now() - interval '1 day', 'svolta', true, 'chiusa');

-- What each person reads in the app (as postgres)
create temp table x on commit drop as
select
  (select count(*) from public.sales where closer_id = '33333333-3333-4333-8333-333333333333') as vendite_closer,
  (select count(*) from public.payments p join public.sales s on s.id = p.sale_id
     where s.closer_id = '33333333-3333-4333-8333-333333333333') as rate_closer,
  (select count(*) from public.sales) as vendite_tutte,
  (select count(*) from public.payments) as rate_tutte,
  (select count(*) from public.clients) as clienti_tutti,
  (select count(*) from public.clienti_cartelle) as cartelle,
  (select count(*) from public.vendite_contratti) as contratti,
  (select count(*) from public.payments p join public.sales s on s.id = p.sale_id
     where s.setter_id = '22222222-2222-4222-8222-222222222222') as rate_setter,
  (select id from public.payments where sale_id = 'c1030000-0000-4000-8000-000000000011' and numero_rata = 1) as rata_closer,
  (select id from public.payments where sale_id = 'c1030000-0000-4000-8000-000000000012' and numero_rata = 1) as rata_admin,
  (select count(*) from public.audit_log) as audit_prima;
grant select on x to authenticated;

-- A token of Claude for one person (an OAuth JWT with client_id and session_id), as authenticated
create or replace function pg_temp.come(p_utente uuid, p_sessione uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', p_utente, 'role', 'authenticated', 'client_id', '9c000000-0000-4000-8000-000000000103',
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

-- The money relations of this phase: which give rows to the current identity
create or replace function pg_temp.soldi()
returns text
language plpgsql
as $$
declare
  r text;
  n bigint;
  viste text[] := '{}';
begin
  foreach r in array array['clients', 'sales', 'payments', 'clienti_chiusure', 'clienti_sospensioni',
    'clienti_cartelle', 'vendite_contratti', 'v_clienti', 'v_vendite', 'v_rate', 'v_clienti_chiusi',
    'v_client_status'] loop
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

-- What stays closed to Claude in every phase: the audit log, the reminders, the setter's reports as such
-- (costs and commissions are phase 4: 104_mcp_costi_provvigioni.sql)
create or replace function pg_temp.chiuse()
returns text
language plpgsql
as $$
declare
  r text;
  n bigint;
  viste text[] := '{}';
begin
  foreach r in array array['audit_log', 'promemoria_percorso', 'setter_daily_reports'] loop
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
-- 1. The filter, by role: the paths of the tools, never DELETE
-- ---------------------------------------------------------------------------
select pg_temp.come('11111111-1111-4111-8111-111111111111', '9e103000-0000-4000-8000-000000000001');
select is(
  pg_temp.filtri(array['GET clients', 'GET sales', 'GET payments', 'GET v_clienti', 'GET v_vendite', 'GET v_rate',
    'GET v_clienti_chiusi', 'GET clienti_chiusure', 'GET clienti_sospensioni', 'GET clienti_cartelle',
    'GET vendite_contratti', 'POST rpc/clienti_elenco', 'POST rpc/da_incassare']),
  array['passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa'],
  'admin: legge clienti, vendite, rate, chiusure, sospensioni, cartella, contratto, l''elenco e il da incassare'
);
select is(
  pg_temp.filtri(array['POST clients', 'PATCH clients', 'PATCH sales', 'PATCH payments', 'POST clienti_chiusure',
    'PATCH clienti_chiusure', 'POST clienti_sospensioni', 'POST rpc/registra_vendita', 'POST rpc/segna_rata_incassata',
    'POST rpc/registra_rimborso', 'POST rpc/aggiungi_rata', 'POST rpc/interrompi_percorso', 'POST rpc/riapri_cliente',
    'POST rpc/riattiva_cliente']),
  array['passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa',
        'passa', 'passa'],
  'admin: scrive clienti, chiusure, sospensioni, vendite e rate con le funzioni dell''app'
);
select is(
  pg_temp.filtri(array['DELETE clients', 'DELETE sales', 'DELETE payments', 'DELETE clienti_chiusure',
    'DELETE clienti_sospensioni', 'POST rpc/elimina_cliente', 'POST rpc/elimina_rata', 'POST clienti_cartelle',
    'PATCH clienti_cartelle', 'POST vendite_contratti', 'PATCH vendite_contratti', 'POST sales', 'POST payments',
    'DELETE expenses', 'POST invites', 'GET setter_daily_reports', 'GET audit_log', 'POST rpc/collega_vendita_call',
    'POST rpc/elimina_persona', 'POST rpc/unisci_profili', 'POST products', 'PATCH products',
    'POST rpc/mie_vendite_setter']),
  array['42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501',
        '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501'],
  'admin: niente si elimina, cartella e contratto non si scrivono, registro, report, persone e prodotti restano fuori'
);

select pg_temp.come('33333333-3333-4333-8333-333333333333', '9e103000-0000-4000-8000-000000000003');
select is(
  pg_temp.filtri(array['GET sales', 'HEAD sales', 'GET payments', 'GET v_vendite', 'POST rpc/da_incassare_closer',
    'POST rpc/registra_vendita', 'POST rpc/segna_rata_incassata', 'PATCH payments']),
  array['passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa'],
  'closer: le sue vendite e le rate, il suo da incassare, registra una vendita e incassa'
);
select is(
  pg_temp.filtri(array['GET clients', 'GET v_clienti', 'GET v_rate', 'GET clienti_cartelle', 'GET vendite_contratti',
    'GET clienti_chiusure', 'PATCH sales', 'POST clients', 'POST rpc/aggiungi_rata', 'POST rpc/registra_rimborso',
    'POST rpc/interrompi_percorso', 'POST rpc/riapri_cliente', 'POST rpc/da_incassare', 'POST rpc/clienti_elenco',
    'DELETE payments', 'POST rpc/elimina_rata']),
  array['42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501',
        '42501', '42501', '42501', '42501'],
  'closer: mai il piano, i clienti diretti, la cartella, il contratto, i dati dell''admin, né un''eliminazione'
);

select pg_temp.come('22222222-2222-4222-8222-222222222222', '9e103000-0000-4000-8000-000000000002');
select is(
  pg_temp.filtri(array['POST rpc/mie_vendite_setter', 'GET rpc/mie_vendite_setter', 'POST rpc/incassi_clienti_setter']),
  array['passa', 'passa', 'passa'],
  'setter: i suoi clienti e la sua provvigione, dalle sue due funzioni'
);
select is(
  pg_temp.filtri(array['GET clients', 'GET sales', 'GET payments', 'GET v_clienti', 'GET v_vendite', 'GET v_rate',
    'GET v_clienti_chiusi', 'POST rpc/registra_vendita', 'POST rpc/segna_rata_incassata', 'PATCH payments',
    'POST rpc/da_incassare_closer', 'POST rpc/clienti_elenco', 'GET commission_rules']),
  array['42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501',
        '42501'],
  'setter: mai una tabella dei soldi, mai una scrittura'
);

select pg_temp.come('bc000000-0000-4000-8000-000000000001', '9e103000-0000-4000-8000-000000000006');
select is(
  pg_temp.filtri(array['GET clients', 'GET sales', 'GET payments', 'GET v_rate', 'GET clienti_cartelle',
    'POST rpc/clienti_elenco', 'POST rpc/da_incassare', 'PATCH payments', 'POST rpc/registra_vendita',
    'POST rpc/segna_rata_incassata', 'POST clients', 'POST rpc/riapri_cliente', 'POST rpc/interrompi_percorso']),
  array['42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501',
        '42501'],
  'business coach: non collega Claude (1.58.0), ogni richiesta si ferma al filtro'
);

select pg_temp.come('44444444-4444-4444-8444-444444444444', '9e103000-0000-4000-8000-000000000004');
select is(
  pg_temp.filtri(array['GET clients', 'GET sales', 'POST rpc/clienti_elenco', 'POST rpc/mie_vendite_setter',
    'POST rpc/da_incassare_closer', 'POST rpc/segna_rata_incassata']),
  array['42501', '42501', '42501', '42501', '42501', '42501'],
  'coach: nessuno strumento di questa fase'
);
select pg_temp.come('55555555-5555-4555-8555-555555555555', '9e103000-0000-4000-8000-000000000005');
select is(
  pg_temp.filtri(array['GET clients', 'GET sales', 'GET payments', 'POST rpc/registra_vendita']),
  array['42501', '42501', '42501', '42501'],
  'video editor: nemmeno'
);
reset role;

-- ---------------------------------------------------------------------------
-- 2. Reading, as in the app
-- ---------------------------------------------------------------------------
-- The admin: everything, the Drive folder and the contract as links
select pg_temp.come('11111111-1111-4111-8111-111111111111', '9e103000-0000-4000-8000-000000000001');
select is(pg_temp.filtro('clients', 'GET'), 'passa', 'admin: GET clients passa');
select is(
  row(pg_temp.conta('clients'), pg_temp.conta('sales'), pg_temp.conta('payments'), pg_temp.conta('clienti_cartelle'),
      pg_temp.conta('vendite_contratti'))::text,
  (select row(clienti_tutti, vendite_tutte, rate_tutte, cartelle, contratti)::text from x),
  'admin: tutti i clienti, le vendite, le rate, le cartelle e i contratti'
);
select is((select count(*) from public.clienti_elenco()), (select clienti_tutti from x),
  'admin: l''elenco dei clienti (LTV, mese del percorso, rate) risponde');
select ok((select count(*) from public.da_incassare()) = 3, 'admin: il da incassare per fascia, dal SQL');
select is(pg_temp.chiuse(), '', 'admin: promemoria, registro e report del setter restano chiusi');

-- The business coach: nothing (1.58.0, he sees only the sales recap, in the app)
select pg_temp.come('bc000000-0000-4000-8000-000000000001', '9e103000-0000-4000-8000-000000000006');
select is(pg_temp.filtro('rpc/clienti_elenco', 'POST'), '42501', 'business coach: la lettura dell''elenco non passa');
select throws_ok($$ select count(*) from public.clienti_elenco() $$, '42501', null,
  'business coach: l''elenco dei clienti risponde 42501');
select is(row(pg_temp.conta('sales'), pg_temp.conta('vendite_contratti'))::text, '(0,0)',
  'business coach: nessuna vendita, nessun contratto');
select is(pg_temp.chiuse(), '', 'business coach: promemoria, registro e report del setter restano chiusi');

-- The closer: his sales and their instalments, never the folder or the contract
select pg_temp.come('33333333-3333-4333-8333-333333333333', '9e103000-0000-4000-8000-000000000003');
select is(pg_temp.filtro('sales', 'GET'), 'passa', 'closer: GET sales passa');
select is(row(pg_temp.conta('sales'), pg_temp.conta('payments'))::text,
  (select row(vendite_closer, rate_closer)::text from x), 'closer: le sue vendite e le loro rate');
select is(
  (select count(*) from public.sales where closer_id <> '33333333-3333-4333-8333-333333333333'), 0::bigint,
  'closer: mai una vendita di un altro closer'
);
select is(row(pg_temp.conta('clienti_cartelle'), pg_temp.conta('vendite_contratti'))::text, '(0,0)',
  'closer: né la cartella Drive né il contratto, nemmeno delle sue vendite');
select ok((select totale from public.da_incassare_closer()) >= 0, 'closer: il suo da incassare, dal SQL');
select is(pg_temp.chiuse(), '', 'closer: promemoria, registro e report del setter restano chiusi');

-- The setter: only his two functions; the tables give him nothing, whatever the path
select pg_temp.come('22222222-2222-4222-8222-222222222222', '9e103000-0000-4000-8000-000000000002');
select is(pg_temp.filtro('rpc/mie_vendite_setter', 'POST'), 'passa', 'setter: la lettura dei suoi clienti passa');
select is((select count(*) from public.mie_vendite_setter()), (select rate_setter from x),
  'setter: le rate dei clienti che ha portato, come in I miei numeri');
select is(
  (select count(*) from public.mie_vendite_setter() where sale_id = 'c1030000-0000-4000-8000-000000000012'), 0::bigint,
  'setter: mai la vendita di un cliente che non ha portato lui'
);
select is(
  (select coalesce(string_agg(a.attname, ', '), '')
   from pg_proc p, unnest(p.proargnames) as a(attname)
   where p.oid = 'public.mie_vendite_setter'::regproc
     and a.attname in ('email', 'telefono', 'metodo', 'note', 'instagram_handle')),
  '',
  'setter: la sua funzione non ha contatti, metodo o note'
);
select ok((select clienti from public.incassi_clienti_setter(public.oggi() - 60, public.oggi())) >= 0,
  'setter: quanto hanno pagato i suoi clienti nel periodo, dal SQL');
select is(pg_temp.soldi(), '', 'setter: nessuna tabella o vista dei soldi gli dà righe, nemmeno dentro la sua richiesta');
select is(
  (select count(*) from public.leads l, lateral (select c.id from public.clients c where c.lead_id = l.id) z), 0::bigint,
  'setter: nemmeno passando da un lead arriva a un cliente'
);

-- Coach and video editor: nothing, even inside an approved request of another area
select pg_temp.come('44444444-4444-4444-8444-444444444444', '9e103000-0000-4000-8000-000000000004');
select is(pg_temp.filtro('pm_progetti', 'GET'), 'passa', 'coach: una richiesta dei progetti');
select is(pg_temp.soldi(), '', 'coach: nessun cliente, nessuna vendita, nessuna rata');
select is(
  (select count(*) from public.pm_progetti p, lateral (select c.id from public.clients c where c.id = p.client_id) z),
  0::bigint,
  'coach: nemmeno dal progetto di un cliente arriva al cliente'
);
select throws_ok($$ select * from public.clienti_elenco() $$, '42501', null, 'coach: l''elenco dei clienti risponde 42501');
select pg_temp.come('55555555-5555-4555-8555-555555555555', '9e103000-0000-4000-8000-000000000005');
select is(pg_temp.filtro('pm_task', 'GET'), 'passa', 'video editor: una richiesta dei progetti');
select is(pg_temp.soldi(), '', 'video editor: niente');
reset role;

-- ---------------------------------------------------------------------------
-- 3. Writing, as in the app
-- ---------------------------------------------------------------------------
-- The admin: a new client and its sale with a hand-written plan, then the first cash-in
select pg_temp.come('11111111-1111-4111-8111-111111111111', '9e103000-0000-4000-8000-000000000001');
select from pg_temp.filtro('rpc/registra_vendita', 'POST');
create temp table nuova on commit drop as
select * from public.registra_vendita('aaaaaaa1-0000-4000-8000-000000000001', 'nuovo', public.oggi(), public.oggi(),
  900, 2, null, null, 'Cliente', 'Da Claude Centotre', null, null, null, null, null, null,
  jsonb_build_array(jsonb_build_object('scadenza', public.oggi(), 'importo', 500),
                    jsonb_build_object('scadenza', public.oggi() + 30, 'importo', 400)));
select is((select count(*) from nuova), 1::bigint, 'admin: registra una vendita col piano scritto a mano');
select is((select count(*) from public.payments p join nuova n on n.id_vendita = p.sale_id), 2::bigint,
  'admin: il piano scritto a mano è scritto (inserisci_piano dentro la richiesta approvata)');
select from pg_temp.filtro('rpc/segna_rata_incassata', 'POST');
select lives_ok($$ select * from public.segna_rata_incassata(
  (select p.id from public.payments p join pg_temp.nuova n on n.id_vendita = p.sale_id where p.numero_rata = 1),
  public.oggi(), 500, 'bonifico') $$, 'admin: incassa la prima rata');
select from pg_temp.filtro('rpc/aggiungi_rata', 'POST');
select lives_ok($$ select public.aggiungi_rata((select id_vendita from pg_temp.nuova), public.oggi() + 60, 100) $$,
  'admin: aggiunge una rata');
select from pg_temp.filtro('rpc/registra_rimborso', 'POST');
select lives_ok($$ select public.registra_rimborso(
  (select p.id from public.payments p join pg_temp.nuova n on n.id_vendita = p.sale_id where p.numero_rata = 1 and p.stato = 'incassata'),
  public.oggi(), 50, 'Da Claude') $$, 'admin: registra un rimborso');
select from pg_temp.filtro('payments', 'PATCH');
select is(pg_temp.righe($$ update public.payments set stato = 'fallita'
  where id = (select rata_admin from pg_temp.x) and stato = 'prevista' $$), 1, 'admin: segna fallita una rata');
select from pg_temp.filtro('sales', 'PATCH');
select is(pg_temp.righe($$ update public.sales set note = 'Nota da Claude' where id = 'c1030000-0000-4000-8000-000000000012' $$), 1,
  'admin: modifica una vendita');
-- «Non rinnova», the archive, «Riapri»; «Sospendi», «Riattiva»
select from pg_temp.filtro('clienti_chiusure', 'POST');
select lives_ok($$ insert into public.clienti_chiusure (client_id, chiuso_il, motivo)
  values ('c1030000-0000-4000-8000-000000000002', public.oggi(), 'Da Claude')
  on conflict (client_id) do update set chiuso_il = excluded.chiuso_il, motivo = excluded.motivo $$,
  'admin: «Non rinnova»');
select from pg_temp.filtro('clienti_chiusure', 'DELETE');
select is(pg_temp.righe($$ delete from public.clienti_chiusure where client_id = 'c1030000-0000-4000-8000-000000000002' $$), 0,
  'admin: una chiusura non si elimina con un DELETE');
select from pg_temp.filtro('rpc/riapri_cliente', 'POST');
select is(public.riapri_cliente('c1030000-0000-4000-8000-000000000002'), true, 'admin: «Riapri» toglie la chiusura');
select from pg_temp.filtro('clienti_sospensioni', 'POST');
select lives_ok($$ insert into public.clienti_sospensioni (client_id, sospeso_il)
  values ('c1030000-0000-4000-8000-000000000001', public.oggi()) $$, 'admin: «Sospendi»');
select is(pg_temp.righe($$ delete from public.clienti_sospensioni where client_id = 'c1030000-0000-4000-8000-000000000001' $$), 0,
  'admin: una sospensione non si elimina con un DELETE');
select from pg_temp.filtro('rpc/riattiva_cliente', 'POST');
select is(public.riattiva_cliente('c1030000-0000-4000-8000-000000000001'), true, 'admin: «Riattiva» toglie la sospensione');
-- «Interrompi il percorso» drops the unpaid instalments after the last day, only from its function
select from pg_temp.filtro('payments', 'PATCH');
select is(pg_temp.righe($$ delete from public.payments where sale_id = 'c1030000-0000-4000-8000-000000000012' $$), 0,
  'admin: le rate non si eliminano con un DELETE');
select from pg_temp.filtro('rpc/interrompi_percorso', 'POST');
select is(
  (select rate_tolte from public.interrompi_percorso('c1030000-0000-4000-8000-000000000012', public.oggi(), true, true)) > 0,
  true,
  'admin: «Interrompi il percorso» toglie le rate non pagate dopo l''ultimo giorno'
);
-- What never passes, even inside an approved request
select from pg_temp.filtro('clients', 'PATCH');
select is(pg_temp.righe($$ delete from public.clients where id = 'c1030000-0000-4000-8000-000000000002' $$)
  + pg_temp.righe($$ delete from public.sales where id = 'c1030000-0000-4000-8000-000000000011' $$), 0,
  'admin: né un cliente né una vendita si eliminano');
select throws_ok($$ insert into public.clienti_cartelle (client_id, url)
  values ('c1030000-0000-4000-8000-000000000002', 'https://drive.google.com/drive/folders/da-claude') $$,
  '42501', null, 'admin: la cartella Drive non si scrive da Claude');
select is(pg_temp.righe($$ update public.vendite_contratti set url = 'https://drive.google.com/file/d/da-claude' $$), 0,
  'admin: né il contratto');
reset role;
select is(
  (select row(p.client_id is not null, p.created_by)::text from public.pm_progetti p join nuova n on n.id_cliente = p.client_id),
  '(t,)',
  'la prima rata incassata da Claude apre il progetto del cliente, senza autore, come nell''app'
);
select is(
  (select utente_id from public.audit_log
   where tabella = 'payments' and azione = 'update'
     and record_id = (select p.id from public.payments p join nuova n on n.id_vendita = p.sale_id where p.numero_rata = 1 and p.stato = 'incassata')
   order by created_at desc limit 1),
  '11111111-1111-4111-8111-111111111111'::uuid,
  'il registro delle modifiche scrive la persona del token'
);

-- The closer: cashes his instalment, never another closer's, never the plan
select pg_temp.come('33333333-3333-4333-8333-333333333333', '9e103000-0000-4000-8000-000000000003');
select from pg_temp.filtro('rpc/segna_rata_incassata', 'POST');
select lives_ok($$ select * from public.segna_rata_incassata((select rata_closer from pg_temp.x), public.oggi(), null, null) $$,
  'closer: incassa una rata di una sua vendita');
select throws_ok($$ select * from public.segna_rata_incassata((select rata_admin from pg_temp.x), public.oggi(), null, null) $$,
  '22023', null, 'closer: mai la rata della vendita di un altro');
select from pg_temp.filtro('payments', 'PATCH');
select throws_ok($$ update public.payments set importo_previsto = 1 where id = (select rata_closer from pg_temp.x) $$,
  '42501', null, 'closer: il piano rate lo modifica l''admin');
select is(pg_temp.righe($$ update public.payments set stato = 'prevista', incassato_il = null, importo_incassato = null,
  metodo = null where id = (select rata_closer from pg_temp.x) and stato in ('incassata', 'fallita') $$), 1,
  'closer: annulla l''incasso della sua rata');
select is(pg_temp.righe($$ update public.sales set note = 'Dal closer' where id = 'c1030000-0000-4000-8000-000000000011' $$), 0,
  'closer: la vendita la corregge l''admin');
select from pg_temp.filtro('rpc/registra_vendita', 'POST');
select lives_ok($$ select * from public.registra_vendita('aaaaaaa1-0000-4000-8000-000000000002', 'nuovo', public.oggi(),
  public.oggi() + 7, 1200, 2, 'c1030000-0000-4000-8000-000000000031', null, 'Lead', 'Vendita Centotre') $$,
  'closer: registra la vendita della sua call chiusa');
select throws_ok($$ insert into public.clienti_chiusure (client_id, chiuso_il)
  values ('c1030000-0000-4000-8000-000000000001', public.oggi()) $$, '42501', null, 'closer: «Non rinnova» è dell''admin');

-- The business coach: nothing, even if a write reached the database
select pg_temp.come('bc000000-0000-4000-8000-000000000001', '9e103000-0000-4000-8000-000000000006');
select from pg_temp.filtro('rpc/clienti_elenco', 'POST');
select is(pg_temp.righe($$ update public.payments set stato = 'fallita' where stato = 'prevista' $$)
  + pg_temp.righe($$ update public.clients set note = 'Da Claude' $$), 0, 'business coach: nessuna riga modificata');
reset role;

-- ---------------------------------------------------------------------------
-- 4. What closes everything
-- ---------------------------------------------------------------------------
-- Outside a request the filter approved (Realtime, Storage, SQL)
select pg_temp.come('11111111-1111-4111-8111-111111111111', '9e103000-0000-4000-8000-000000000001');
select is(pg_temp.soldi(), '', 'admin fuori dal filtro: niente');
reset role;
set local request.jwt.claims to '{}';
-- A deactivated account
update public.profiles set attivo = false where id = '33333333-3333-4333-8333-333333333333';
select pg_temp.come('33333333-3333-4333-8333-333333333333', '9e103000-0000-4000-8000-000000000003');
select is(pg_temp.filtri(array['GET sales', 'POST rpc/segna_rata_incassata']), array['42501', '42501'],
  'closer disattivato: il filtro non lascia passare niente');
reset role;
set local request.jwt.claims to '{}';
update public.profiles set attivo = true where id = '33333333-3333-4333-8333-333333333333';
-- A closed session (Scollega, or a token past its session)
delete from auth.sessions where id = '9e103000-0000-4000-8000-000000000007';
select pg_temp.come('33333333-3333-4333-8333-333333333333', '9e103000-0000-4000-8000-000000000007');
select is(pg_temp.filtro('sales', 'GET'), '42501', 'sessione chiusa: il filtro la rifiuta');
reset role;

-- The web app is unchanged: the closer's own session reads his sales from the table
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select set_config('request.path', '/sales', true);
set local role authenticated;
select is(pg_temp.conta('sales'), (select vendite_closer from x) + 1,
  'web, closer: le sue vendite dalla tabella, come prima (più quella registrata da Claude)');
reset role;

select * from finish();
rollback;
