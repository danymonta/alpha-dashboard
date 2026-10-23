-- The business coach (Dany, 22/10/2026: «Voglio che il business coach abbia accessi in lettura e
-- veda tutto»; 20261028090000 and 20261028090100): he reads what the admin reads and never writes.
-- Not what is one person's (how a call was conducted, the setter's DM tips, someone else's
-- notifications), not the keys and the connections, not the Instagram proposals of the setter's
-- report (the closed version, CLAUDE.md section 6). A deactivated account reads nothing; his Claude
-- token reads only the MCP areas, and writes nothing.
-- Every table and view of public is counted as the admin and as him, so a table added later is
-- covered without editing this test: it must give him the admin's rows, or be named below.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(58);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Seed: admin 1111, setter 2222, closer 3333, coach 4444, editor 5555,
-- marketing 6161, business coach bc00 (supabase/seeds/26_business_coach.sql)
-- ---------------------------------------------------------------------------
insert into public.invites (email, ruolo) values ('businesscoach101@alpha.test', 'business_coach');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999990101',
  'authenticated', 'authenticated', 'businesscoach101@alpha.test', '', now(),
  '{}'::jsonb, '{"full_name":"Bruno Centouno"}'::jsonb, now(), now(), '', '', '', '');

select is(
  (select row(ruolo, attivo)::text from public.profiles where id = '99999999-9999-4999-8999-999999990101'),
  row('business_coach'::public.app_role, true)::text,
  'l''invito come business coach crea il profilo business coach'
);

-- A row in the tables the seed leaves empty, so "0 rows" means something
insert into public.call_pitch (call_id, importo_proposto)
select c.id, 1500 from public.calls c
where not exists (select 1 from public.call_pitch p where p.call_id = c.id) limit 1;
insert into public.clienti_cartelle (client_id, url)
select c.id, 'https://drive.google.com/drive/folders/test-101' from public.clients c
where not exists (select 1 from public.clienti_cartelle x where x.client_id = c.id) limit 1;
insert into public.report_proposte_instagram (setter_id, data, dm_outbound, chat_lette)
values ('22222222-2222-4222-8222-222222222222', '2024-01-15', 12, 20)
on conflict (setter_id, data) do nothing;
insert into public.instagram_esclusi (username, motivo) values ('prova_test_101', 'Prova del test 101')
on conflict (username) do nothing;
insert into public.messenger_esclusi (utente_id, nome) values ('1010000000000101', 'Escluso Test 101')
on conflict (utente_id) do nothing;
insert into public.obiettivi_mese (mese, cash, nuovi_clienti) values ('2024-01-01', 10000, 5)
on conflict (mese) do nothing;
insert into public.promemoria_percorso (client_id, tipo, data_fine, esito)
select c.id, 'rinnovo_1_mese', '2024-02-29', 'inviato' from public.clients c limit 1
on conflict (client_id, tipo, data_fine) do nothing;
-- the admin's running timer: never someone else's (section 17)
insert into public.pm_tempo (profile_id, progetto_id, data, inizio)
select '11111111-1111-4111-8111-111111111111', p.id, public.oggi(), now() - interval '10 minutes'
from public.pm_progetti p order by p.id limit 1;

-- An OAuth client and the business coach's session with it (75_mcp_oauth.sql, 100_mcp_progetti_tempo.sql)
insert into auth.oauth_clients (id, client_name, registration_type, client_type, redirect_uris,
  grant_types, token_endpoint_auth_method, deleted_at)
values ('9c000000-0000-4000-8000-000000000101', 'Claude', 'manual', 'public',
  'https://claude.ai/api/mcp/auth_callback', 'authorization_code,refresh_token', 'none', null);
insert into auth.sessions (id, user_id, created_at, updated_at, aal, oauth_client_id, not_after)
values ('9e000000-0000-4000-8000-000000000101', 'bc000000-0000-4000-8000-000000000001', now(), now(), 'aal1',
  '9c000000-0000-4000-8000-000000000101', null);

create temp table x on commit drop as
select
  (select id from public.pm_progetti order by id limit 1) as progetto,
  (select id from public.sales order by id limit 1) as vendita,
  (select id from public.payments order by id limit 1) as rata,
  (select id from public.clients order by id limit 1) as cliente,
  (select id from public.calls order by id limit 1) as call_id,
  (select id from public.leads order by id limit 1) as lead,
  (select id from public.products order by id limit 1) as prodotto,
  (select id from public.pm_reparti order by id limit 1) as reparto,
  (select id from public.marketing_contenuti order by id limit 1) as contenuto;
grant select on x to authenticated;

create or replace function pg_temp.web(p_utente uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_utente, 'role', 'authenticated')::text, true);
  perform set_config('alpha.mcp_filtro', '', true);
  set local role authenticated;
end $$;

-- Rows touched by a statement, as the current identity
create or replace function pg_temp.righe(p_sql text)
returns integer language plpgsql as $$
declare
  n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end $$;

-- A request of Claude for the business coach, approved by the filter on a path and method
create or replace function pg_temp.claude(p_filtro boolean default true, p_percorso text default '/pm_task',
  p_metodo text default 'GET')
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', 'bc000000-0000-4000-8000-000000000001', 'role', 'authenticated',
    'client_id', '9c000000-0000-4000-8000-000000000101',
    'session_id', '9e000000-0000-4000-8000-000000000101')::text, true);
  perform set_config('alpha.mcp_filtro', '', true);
  set local role authenticated;
  if p_filtro then
    perform set_config('request.path', p_percorso, true);
    perform set_config('request.method', p_metodo, true);
    perform set_config('request.headers', '{}', true);
    perform public.mcp_filtro_richiesta();
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. legge_come_admin() and the project level
-- ---------------------------------------------------------------------------
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select ok(public.legge_come_admin(), 'legge_come_admin: l''admin sì');
select pg_temp.web('bc000000-0000-4000-8000-000000000001');
select ok(public.legge_come_admin(), 'legge_come_admin: il business coach sì');
select is(
  row(public.is_admin(), public.pm_livello_corrente(), public.pm_puo_vedere((select progetto from x)),
      public.pm_puo_gestire((select progetto from x)), public.vede_marketing(), public.insight_puo_leggere())::text,
  row(false, null::public.pm_livello, false, false, false, false)::text,
  'il business coach non è admin, non ha un livello nei progetti, non scrive nel Marketing né nell''Insight'
);
select pg_temp.web('22222222-2222-4222-8222-222222222222');
select ok(not public.legge_come_admin(), 'legge_come_admin: il setter no');
select pg_temp.web('33333333-3333-4333-8333-333333333333');
select ok(not public.legge_come_admin(), 'legge_come_admin: il closer no');
select pg_temp.web('61616161-6161-4161-8161-616161616161');
select ok(not public.legge_come_admin(), 'legge_come_admin: il marketing no');
select pg_temp.web('44444444-4444-4444-8444-444444444444');
select ok(not public.legge_come_admin(), 'legge_come_admin: il coach no');
reset role;
set local request.jwt.claims to '{}';
set local role authenticated;
select ok(not public.legge_come_admin(), 'legge_come_admin: senza sessione no');
reset role;

-- ---------------------------------------------------------------------------
-- 2. Every table and view of public: the admin's rows, except the named ones
-- ---------------------------------------------------------------------------
create temp table righe_viste (persona text, relazione text, righe bigint, errore text) on commit drop;
grant select, insert on righe_viste to authenticated;

create or replace function pg_temp.conta_tutto(p_persona text)
returns void language plpgsql as $$
declare
  r record;
  n bigint;
begin
  for r in
    select tablename::text as nome from pg_catalog.pg_tables where schemaname = 'public'
    union
    select viewname::text from pg_catalog.pg_views where schemaname = 'public'
  loop
    begin
      execute format('select count(*) from public.%I', r.nome) into n;
      insert into pg_temp.righe_viste values (p_persona, r.nome, n, null);
    exception when others then
      insert into pg_temp.righe_viste values (p_persona, r.nome, null, sqlstate);
    end;
  end loop;
end $$;

select pg_temp.web('11111111-1111-4111-8111-111111111111');
select pg_temp.conta_tutto('admin');
select pg_temp.web('bc000000-0000-4000-8000-000000000001');
select pg_temp.conta_tutto('bc');
reset role;
set local request.jwt.claims to '{}';
-- what all the rows are, as postgres
select pg_temp.conta_tutto('postgres');

-- What he never reads, whatever the admin reads: one person's (how a call was conducted, the
-- setter's DM tips, the notifications), the keys and the connections (the pages read them through
-- their functions), the Instagram proposals of the setter's report (section 17, the closed version)
create temp table chiuse (relazione text primary key) on commit drop;
grant select on chiuse to authenticated;
insert into chiuse values
  ('call_valutazioni'), ('call_spunti_setter'), ('notifiche'), ('report_proposte_instagram'),
  ('instagram_collegamento'), ('instagram_esclusi'), ('messenger_collegamento'), ('messenger_esclusi'),
  ('fathom_collegamento'), ('call_lavori_stato'), ('marketing_lavori_stato'),
  -- the running timers: the admin reads his own, nobody reads someone else's
  ('pm_tempo');

select is(
  (select count(*)::integer from righe_viste where persona = 'bc'),
  (select count(*)::integer from pg_tables where schemaname = 'public')
    + (select count(*)::integer from pg_views where schemaname = 'public'),
  'il conteggio ha letto tutte le tabelle e le view di public'
);
select is(
  (select coalesce(string_agg(a.relazione || ' admin ' || coalesce(a.righe::text, a.errore)
                              || ' business coach ' || coalesce(b.righe::text, b.errore), ', ' order by a.relazione), '')
   from righe_viste a
   join righe_viste b on b.relazione = a.relazione and b.persona = 'bc'
   where a.persona = 'admin'
     and a.relazione not in (select relazione from chiuse)
     and (a.righe is distinct from b.righe or a.errore is distinct from b.errore)),
  '',
  'il business coach legge le stesse righe dell''admin in ogni tabella e view (tranne quelle chiuse)'
);
select is(
  (select coalesce(string_agg(relazione, ', ' order by relazione), '')
   from righe_viste
   where persona = 'postgres' and relazione in (select relazione from chiuse) and coalesce(righe, 0) = 0),
  '',
  'ogni tabella chiusa ha righe: 0 righe qui sotto vuol dire RLS'
);
select is(
  (select coalesce(string_agg(relazione || ' ' || coalesce(righe::text, errore), ', ' order by relazione), '')
   from righe_viste
   where persona = 'bc' and relazione in (select relazione from chiuse) and relazione <> 'pm_tempo'
     and coalesce(righe, 0) <> 0),
  '',
  'il business coach non legge valutazioni, spunti per i DM, notifiche degli altri, chiavi, collegamenti e proposte da Instagram'
);
select is(
  (select righe from righe_viste where persona = 'bc' and relazione = 'pm_tempo'),
  (select count(*) from public.pm_tempo where minuti is not null),
  'il tempo: tutto quello già dichiarato, mai un timer acceso'
);
select is(
  (select coalesce(string_agg(relazione, ', ' order by relazione), '')
   from righe_viste
   where persona = 'bc' and coalesce(righe, 0) = 0
     and relazione in ('sales', 'payments', 'expenses', 'commission_rules', 'commission_payouts', 'clients', 'calls',
                       'leads', 'setter_daily_reports', 'call_pitch', 'audit_log', 'marketing_contenuti', 'pm_progetti',
                       'pm_task', 'pm_tempo', 'pm_note', 'insight_recap', 'insight_esecuzioni', 'call_analisi',
                       'products', 'invites', 'obiettivi_mese', 'v_vendite', 'v_rate', 'v_clienti', 'v_pubblicati')),
  '',
  'il business coach legge soldi, clienti, call, setting, costi, provvigioni, contenuti, progetti, Insight e registro'
);

-- ---------------------------------------------------------------------------
-- 3. The admin's read functions answer him the same
-- ---------------------------------------------------------------------------
create temp table risposte (persona text, funzione text, testo text) on commit drop;
grant select, insert on risposte to authenticated;

create or replace function pg_temp.leggi_tutto(p_persona text)
returns void language plpgsql as $$
declare
  r record;
  t text;
  v_da date := public.oggi() - 120;
  v_a date := public.oggi();
begin
  for r in select * from (values
    ('metriche_periodo', format('select array_agg(f::text) from public.metriche_periodo(%L, %L) f', v_da, v_a)),
    ('cash_mensile', format('select array_agg(f::text) from public.cash_mensile(12, %L) f', v_a)),
    ('da_incassare', 'select array_agg(f::text) from public.da_incassare() f'),
    ('previsione_cassa', 'select array_agg(f::text) from public.previsione_cassa(3) f'),
    ('metriche_per_fonte', format('select array_agg(f::text) from public.metriche_per_fonte(%L, %L) f', v_da, v_a)),
    ('metriche_setting', format('select array_agg(f::text) from public.metriche_setting(%L, %L) f', v_da, v_a)),
    ('oggi_team', 'select array_agg(f::text) from public.oggi_team() f'),
    ('avanzamento_obiettivi', format('select array_agg(f::text) from public.avanzamento_obiettivi(%L) f', v_a)),
    ('riepilogo_costi_periodo', format('select array_agg(f::text) from public.riepilogo_costi_periodo(%L, %L) f', v_da, v_a)),
    ('provvigioni_riepilogo', 'select array_agg(f::text) from public.provvigioni_riepilogo(6) f'),
    ('provvigioni_per_vendita', 'select array_agg(f::text) from public.provvigioni_per_vendita(null) f'),
    ('clienti_elenco', 'select array_agg(f::text) from public.clienti_elenco(null) f'),
    ('commenti_setter_periodo', format('select array_agg(f::text) from public.commenti_setter_periodo(%L, %L, null, 200) f', v_da, v_a)),
    ('motivi_non_chiusura_periodo', format('select array_agg(f::text) from public.motivi_non_chiusura_periodo(%L, %L, null, 200) f', v_da, v_a)),
    ('giornate_closer', format('select array_agg(f::text) from public.giornate_closer(%L, %L, null) f', v_da, v_a)),
    ('giornate_setter', format('select array_agg(f::text) from public.giornate_setter(%L, %L, null) f', v_da, v_a)),
    ('call_numeri_periodo', format('select array_agg(f::text) from public.call_numeri_periodo(%L, %L, ''fonte'', null) f', v_da, v_a)),
    ('pm_tempo_per_persona', format('select array_agg(f::text) from public.pm_tempo_per_persona(%L, %L, null, null, 100) f', v_da, v_a)),
    ('pm_tempo_progetto', format('select array_agg(f::text) from public.pm_tempo_progetto(%L, %L, %L) f',
                                 (select progetto from pg_temp.x), v_da, v_a)),
    ('analisi_riepilogo', format('select public.analisi_riepilogo(%L, %L)::text', v_a - 180, v_a)),
    ('insight_stato', 'select public.insight_stato()::text'),
    ('call_lavori_situazione', 'select public.call_lavori_situazione()::text'),
    ('marketing_lavori_situazione', 'select public.marketing_lavori_situazione()::text'),
    ('call_ha_vendita', 'select array_agg(public.call_ha_vendita(c)::text order by c.id) from public.calls c'),
    ('call_ha_follow_up', 'select array_agg(public.call_ha_follow_up(c)::text order by c.id) from public.calls c')
  ) as v(funzione, sql) loop
    begin
      execute r.sql into t;
      insert into pg_temp.risposte values (p_persona, r.funzione, coalesce(t, '(niente)'));
    exception when others then
      insert into pg_temp.risposte values (p_persona, r.funzione, 'errore ' || sqlstate);
    end;
  end loop;
end $$;

select pg_temp.web('11111111-1111-4111-8111-111111111111');
select pg_temp.leggi_tutto('admin');
select pg_temp.web('bc000000-0000-4000-8000-000000000001');
select pg_temp.leggi_tutto('bc');
reset role;
set local request.jwt.claims to '{}';

select is(
  (select coalesce(string_agg(funzione, ', ' order by funzione), '') from risposte
   where persona = 'admin' and (testo like 'errore %' or testo = '(niente)')),
  '',
  'ogni funzione di lettura risponde all''admin'
);
select is(
  (select coalesce(string_agg(a.funzione, ', ' order by a.funzione), '')
   from risposte a join risposte b on b.funzione = a.funzione and b.persona = 'bc'
   where a.persona = 'admin' and a.testo is distinct from b.testo),
  '',
  'le funzioni di lettura dell''admin rispondono uguale al business coach (costi e avvisi dell''Insight compresi)'
);

-- ---------------------------------------------------------------------------
-- 4. Never a write
-- ---------------------------------------------------------------------------
-- Static: no permissive write policy names him, every _lettura_come_admin policy only reads, and no
-- function that can write opens to him (mcp_filtro_richiesta names him only to refuse his writes)
select is(
  (select coalesce(string_agg(tablename || '.' || policyname, ', ' order by 1), '')
   from pg_policies
   where schemaname = 'public' and permissive = 'PERMISSIVE' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
     and (coalesce(qual, '') ~ '(legge_come_admin|business_coach)'
          or coalesce(with_check, '') ~ '(legge_come_admin|business_coach)')),
  '',
  'nessuna policy permissiva di scrittura nomina il business coach'
);
select is(
  (select coalesce(string_agg(tablename || '.' || policyname, ', ' order by 1), '')
   from pg_policies
   where schemaname = 'public' and policyname like '%\_lettura\_come\_admin' and (cmd <> 'SELECT' or permissive <> 'PERMISSIVE')),
  '',
  'ogni policy _lettura_come_admin è solo lettura'
);
select is(
  (select coalesce(string_agg(p.proname::text, ', ' order by p.proname::text), '')
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.provolatile = 'v'
     and p.proname <> 'mcp_filtro_richiesta'
     and pg_get_functiondef(p.oid) ~ '(legge_come_admin|business_coach)'),
  '',
  'nessuna funzione che può scrivere si apre al business coach'
);

-- Dynamic: every row he reads, of every table, refuses an update and a delete
create temp table scritture (tabella text, azione text, esito text) on commit drop;
grant select, insert on scritture to authenticated;
create temp table colonne on commit drop as
select c.table_name::text as tabella, min(c.column_name::text) as colonna
from information_schema.columns c
join pg_tables t on t.schemaname = 'public' and t.tablename = c.table_name
where c.table_schema = 'public' and c.is_generated = 'NEVER' and c.is_identity = 'NO'
group by c.table_name;
grant select on colonne to authenticated;

create or replace function pg_temp.prova_scritture()
returns void language plpgsql as $$
declare
  r record;
  n integer;
begin
  for r in select * from pg_temp.colonne loop
    begin
      execute format('update public.%I set %I = %I', r.tabella, r.colonna, r.colonna);
      get diagnostics n = row_count;
      insert into pg_temp.scritture values (r.tabella, 'update', n::text);
    exception when others then
      insert into pg_temp.scritture values (r.tabella, 'update', 'errore ' || sqlstate);
    end;
    begin
      execute format('delete from public.%I', r.tabella);
      get diagnostics n = row_count;
      insert into pg_temp.scritture values (r.tabella, 'delete', n::text);
    exception when others then
      insert into pg_temp.scritture values (r.tabella, 'delete', 'errore ' || sqlstate);
    end;
  end loop;
end $$;

select pg_temp.web('bc000000-0000-4000-8000-000000000001');
select pg_temp.prova_scritture();
reset role;
set local request.jwt.claims to '{}';
select is(
  (select count(*)::integer from scritture), 2 * (select count(*)::integer from pg_tables where schemaname = 'public'),
  'update e delete provati su ogni tabella'
);
select is(
  (select coalesce(string_agg(tabella || ' ' || azione || ' ' || esito, ', ' order by tabella, azione), '')
   from scritture where esito not in ('0', 'errore 42501')),
  '',
  'nessun update e nessun delete del business coach tocca una riga, in nessuna tabella'
);
-- and where he reads rows, the refusal is the table's grants (no UPDATE or DELETE for any session)
-- or RLS itself (0 rows): never an error of something else that would hide a policy letting him in
select is(
  (select coalesce(string_agg(s.tabella || ' ' || s.azione || ' ' || s.esito, ', ' order by s.tabella, s.azione), '')
   from scritture s
   join righe_viste v on v.persona = 'bc' and v.relazione = s.tabella and v.righe > 0
   where s.esito <> '0'
     and (s.esito <> 'errore 42501' or has_table_privilege('authenticated', 'public.' || s.tabella, upper(s.azione)))),
  '',
  'dove legge righe, update e delete si fermano ai permessi della tabella o alle policy'
);

-- Inserts: refused by RLS
select pg_temp.web('bc000000-0000-4000-8000-000000000001');
select throws_ok($$ insert into public.expenses (data, categoria, descrizione, importo) values (public.oggi(), 'software', 'Prova 101', 10) $$,
  '42501', null, 'non registra un costo');
select throws_ok($$ insert into public.obiettivi_mese (mese, cash, nuovi_clienti) values ('2031-01-01', 1, 1) $$,
  '42501', null, 'non scrive gli obiettivi');
select throws_ok($$ insert into public.products (nome, durata_mesi, prezzo_listino) values ('Prova 101', 3, 100) $$,
  '42501', null, 'non crea un prodotto');
select throws_ok($$ insert into public.leads (nome, setter_id, fonte) values ('Lead 101', 'bc000000-0000-4000-8000-000000000001', 'organico') $$,
  '42501', null, 'non crea un lead');
select throws_ok($$ insert into public.clients (nome, cognome) values ('Cliente', 'Centouno') $$,
  '42501', null, 'non crea un cliente');
select throws_ok($$ insert into public.commission_payouts (profile_id, periodo, importo, pagato_il)
  values ('22222222-2222-4222-8222-222222222222', '2031-01-01', 10, public.oggi()) $$,
  '42501', null, 'non registra un pagamento di provvigioni');
select throws_ok($$ insert into public.invites (email, ruolo) values ('altro101@alpha.test', 'setter') $$,
  '42501', null, 'non invita nessuno');
select throws_ok($$ insert into public.marketing_contenuti (nome) values ('Contenuto 101') $$,
  '42501', null, 'non crea un contenuto del calendario');
select throws_ok($$ insert into public.marketing_opzioni (campo, valore, nome) values ('formato', 'prova_101', 'Prova 101') $$,
  '42501', null, 'non crea un''etichetta');
select throws_ok(format($$ insert into public.pm_task (progetto_id, titolo) values (%L, 'Task 101') $$, (select progetto from x)),
  '42501', null, 'non crea un task');
select throws_ok(format($$ insert into public.pm_note (progetto_id, autore_id, testo) values (%L, 'bc000000-0000-4000-8000-000000000001', 'Nota 101') $$,
  (select progetto from x)), '42501', null, 'non scrive una nota');
select throws_ok(format($$ insert into public.pm_tempo (profile_id, progetto_id, data, minuti) values ('bc000000-0000-4000-8000-000000000001', %L, public.oggi(), 30) $$,
  (select progetto from x)), '42501', null, 'non registra tempo');
select throws_ok($$ insert into public.insight_fatto (giorno, canale, chiave, fatto) values (public.oggi(), 'instagram', 'lead.101', true) $$,
  '42501', null, 'non segna «Fatto» nell''Insight');
select throws_ok($$ insert into public.setter_daily_reports (setter_id, data) values ('bc000000-0000-4000-8000-000000000001', public.oggi()) $$,
  '42501', null, 'non scrive un report del setting');
reset role;
set local request.jwt.claims to '{}';

-- The functions that write: every one refuses him (an error, never a write)
create temp table esiti_rpc (funzione text primary key, esito text) on commit drop;
grant select, insert on esiti_rpc to authenticated;
create or replace function pg_temp.prova(p_funzione text, p_sql text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    insert into pg_temp.esiti_rpc values (p_funzione, 'scritto');
  exception when others then
    insert into pg_temp.esiti_rpc values (p_funzione, sqlstate);
  end;
end $$;

select pg_temp.web('bc000000-0000-4000-8000-000000000001');
do $$
declare
  a record;
begin
  select * into a from pg_temp.x;
  perform pg_temp.prova('registra_vendita', format($q$ select public.registra_vendita(%L, 'nuovo', public.oggi(), public.oggi(), 900, 1,
    null, null, 'Cliente', 'Centouno', null, null, null, null, null, null, null) $q$, a.prodotto));
  perform pg_temp.prova('aggiungi_rata', format($q$ select public.aggiungi_rata(%L, public.oggi(), 100) $q$, a.vendita));
  perform pg_temp.prova('elimina_rata', format($q$ select public.elimina_rata(%L) $q$, a.rata));
  perform pg_temp.prova('elimina_cliente', format($q$ select public.elimina_cliente(%L) $q$, a.cliente));
  perform pg_temp.prova('elimina_call', format($q$ select public.elimina_call(%L) $q$, a.call_id));
  perform pg_temp.prova('elimina_lead', format($q$ select public.elimina_lead(%L) $q$, a.lead));
  perform pg_temp.prova('elimina_prodotto', format($q$ select public.elimina_prodotto(%L) $q$, a.prodotto));
  perform pg_temp.prova('elimina_persona', $q$ select public.elimina_persona('22222222-2222-4222-8222-222222222222') $q$);
  perform pg_temp.prova('unisci_profili', $q$ select public.unisci_profili('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333') $q$);
  perform pg_temp.prova('aggiorna_stato_lead', format($q$ select public.aggiorna_stato_lead(%L, 'perso') $q$, a.lead));
  perform pg_temp.prova('fissa_call', $q$ select public.fissa_call('Lead 101', 'organico', 'discovery', public.oggi() + 1, '18:00',
    '11111111-1111-4111-8111-111111111111', null, null) $q$);
  perform pg_temp.prova('fissa_follow_up', format($q$ select public.fissa_follow_up(%L, public.oggi() + 1, '18:00') $q$, a.call_id));
  perform pg_temp.prova('sposta_call', format($q$ select public.sposta_call(%L, public.oggi() + 2, '18:00') $q$, a.call_id));
  perform pg_temp.prova('collega_registrazione', format($q$ select public.collega_registrazione(%L, '{"tipo":"non_registrata"}') $q$, a.call_id));
  perform pg_temp.prova('decidi_performance', format($q$ select public.decidi_performance(%L, 'buona') $q$, a.call_id));
  perform pg_temp.prova('call_analisi_richiedi', format($q$ select public.call_analisi_richiedi(%L) $q$, a.call_id));
  perform pg_temp.prova('nuova_regola_provvigione', $q$ select public.nuova_regola_provvigione('22222222-2222-4222-8222-222222222222', 0.05, '{nuovo}', '2031-01-01') $q$);
  perform pg_temp.prova('copia_costi_ricorrenti', $q$ select public.copia_costi_ricorrenti('2031-01-01') $q$);
  perform pg_temp.prova('insight_richiedi', $q$ select public.insight_richiedi() $q$);
  perform pg_temp.prova('insight_imposta_automazione', $q$ select public.insight_imposta_automazione(true, '19:00') $q$);
  perform pg_temp.prova('insight_dimentica', $q$ select public.insight_dimentica('instagram', 'lead.101') $q$);
  perform pg_temp.prova('instagram_imposta_token', $q$ select public.instagram_imposta_token('IGAAprovaBusinessCoach0123456789abcdef') $q$);
  perform pg_temp.prova('fathom_imposta_chiave', $q$ select public.fathom_imposta_chiave('chiave-business-coach-0123456789abcdef') $q$);
  perform pg_temp.prova('marketing_analisi_richiedi', $q$ select public.marketing_analisi_richiedi('6600000000000001') $q$);
  perform pg_temp.prova('marketing_spunti_richiedi', $q$ select public.marketing_spunti_richiedi() $q$);
  perform pg_temp.prova('marketing_imposta_costo_max', $q$ select public.marketing_imposta_costo_max(30) $q$);
  perform pg_temp.prova('call_imposta_costo_max', $q$ select public.call_imposta_costo_max(30) $q$);
  perform pg_temp.prova('pm_crea_progetto', format($q$ select public.pm_crea_progetto(%L, 'Progetto 101', null, null, null, null, null, null) $q$, a.reparto));
  perform pg_temp.prova('pm_registra_tempo', format($q$ select public.pm_registra_tempo(%L, public.oggi(), 30, null, null, null, null) $q$, a.progetto));
  perform pg_temp.prova('pm_avvia_timer', format($q$ select public.pm_avvia_timer(%L, null) $q$, a.progetto));
end $$;
reset role;
set local request.jwt.claims to '{}';
select is(
  (select coalesce(string_agg(funzione || ' ' || esito, ', ' order by funzione), '')
   from esiti_rpc where esito = 'scritto'),
  '',
  'ogni funzione che scrive rifiuta il business coach'
);
select is((select count(*)::integer from esiti_rpc), 30, 'le 30 funzioni sono state provate');
select is(
  (select coalesce(string_agg(funzione || ' ' || esito, ', ' order by funzione), '')
   from esiti_rpc where esito <> '42501'),
  '',
  'ogni rifiuto è 42501'
);

-- ---------------------------------------------------------------------------
-- 5. A deactivated business coach reads nothing (his own profile row aside)
-- ---------------------------------------------------------------------------
update public.profiles set attivo = false where id = 'bc000000-0000-4000-8000-000000000001';
select pg_temp.web('bc000000-0000-4000-8000-000000000001');
select ok(not public.legge_come_admin(), 'disattivato: legge_come_admin no');
select pg_temp.conta_tutto('spento');
reset role;
set local request.jwt.claims to '{}';
select is(
  (select coalesce(string_agg(relazione || ' ' || righe, ', ' order by relazione), '')
   from righe_viste where persona = 'spento' and coalesce(righe, 0) > 0 and relazione <> 'profiles'),
  '',
  'disattivato: nessuna riga in nessuna tabella o view'
);
select is((select righe from righe_viste where persona = 'spento' and relazione = 'profiles'), 1::bigint,
  'disattivato: solo il proprio profilo');
select throws_ok($$ select public.metriche_periodo(public.oggi() - 30, public.oggi()) $$, '42501', null,
  'disattivato: le metriche rispondono 42501');
update public.profiles set attivo = true where id = 'bc000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- 6. His Claude token: the MCP areas, read only
-- ---------------------------------------------------------------------------
-- Outside a request the filter approved: nothing at all
select pg_temp.claude(false);
select ok(not public.legge_come_admin(), 'token di Claude fuori dal filtro: legge_come_admin no');
select pg_temp.conta_tutto('claude_fuori');
reset role;
set local request.jwt.claims to '{}';
select is(
  (select coalesce(string_agg(relazione || ' ' || righe, ', ' order by relazione), '')
   from righe_viste where persona = 'claude_fuori' and coalesce(righe, 0) > 0),
  '',
  'token di Claude fuori dal filtro: nessuna riga'
);

-- Inside: the projects, the team's declared time and the calendar; nothing of the other areas
select pg_temp.claude(true);
select pg_temp.conta_tutto('claude');
reset role;
set local request.jwt.claims to '{}';
select ok(
  (select righe from righe_viste where persona = 'claude' and relazione = 'pm_progetti')
    = (select count(*) from public.pm_progetti)
  and (select righe from righe_viste where persona = 'claude' and relazione = 'marketing_contenuti')
    = (select count(*) from public.marketing_contenuti)
  and (select righe from righe_viste where persona = 'claude' and relazione = 'pm_tempo')
    = (select count(*) from public.pm_tempo where minuti is not null),
  'token di Claude nel filtro: tutti i progetti, tutto il calendario, il tempo già dichiarato del team'
);
select is(
  (select coalesce(string_agg(relazione || ' ' || righe, ', ' order by relazione), '')
   from righe_viste
   where persona = 'claude' and coalesce(righe, 0) > 0
     and relazione not in ('profiles', 'marketing_contenuti', 'marketing_opzioni', 'pm_progetti', 'pm_membri',
                           'pm_tasklist', 'pm_task', 'pm_task_assegnatari', 'pm_tempo', 'pm_note', 'pm_reparti',
                           'pm_modelli', 'v_pm_progetti', 'v_pm_task', 'v_pm_tasklist',
                           -- calls, leads and outcomes (phase 2, 20261029090000): he reads them like the admin
                           'calls', 'leads', 'call_pitch', 'call_registrazioni', 'products')),
  '',
  'token di Claude nel filtro: nessuna riga fuori dalle aree MCP'
);

select pg_temp.claude(true);
select is(
  (select count(*)::integer from public.pm_tempo_per_persona(public.oggi() - 120, public.oggi(), null, null, 100)) > 0,
  true,
  'token di Claude nel filtro: il tempo del team come l''admin'
);
select ok((public.spunti_per_claude() ->> 'periodo_a') is not null, 'token di Claude nel filtro: gli spunti in lettura');
select throws_ok(format($$ insert into public.pm_task (progetto_id, titolo) values (%L, 'Task da Claude 101') $$, (select progetto from x)),
  '42501', null, 'token di Claude: non crea un task');
select is(
  (select count(*)::integer from public.marketing_contenuti where id = (select contenuto from x)), 1,
  'token di Claude nel filtro: legge un contenuto del calendario'
);
select is(
  pg_temp.righe(format('update public.marketing_contenuti set nome = nome where id = %L', (select contenuto from x))),
  0, 'token di Claude nel filtro: non modifica il calendario');
reset role;
set local request.jwt.claims to '{}';

-- The filter itself: his writes stop there, before any table; his reads pass
select lives_ok($$ select pg_temp.claude(true, '/pm_task', 'GET') $$, 'il filtro: GET pm_task passa');
reset role;
select lives_ok($$ select pg_temp.claude(true, '/rpc/pm_tempo_per_persona', 'POST') $$, 'il filtro: la lettura del tempo del team passa');
reset role;
select throws_ok($$ select pg_temp.claude(true, '/pm_task', 'POST') $$, '42501', null, 'il filtro: POST pm_task no');
reset role;
select throws_ok($$ select pg_temp.claude(true, '/marketing_contenuti', 'PATCH') $$, '42501', null, 'il filtro: PATCH sul calendario no');
reset role;
select throws_ok($$ select pg_temp.claude(true, '/rpc/pm_avvia_timer', 'POST') $$, '42501', null, 'il filtro: il timer no');
reset role;
set local request.jwt.claims to '{}';

select * from finish();
rollback;
