-- The business coach (Dany, 23/10/2026, 1.58.0: «una versione per Max dove lui ha semplicemente una
-- pagina… unicamente una dashboard sales per il mio business coach»; 20261101090000). Until 1.57.x he
-- read what the admin reads (20261028090100); now the database gives him his own profile row and one
-- function, recap_sales() (and from 1.59.0 recap_mese(), the same numbers by month and by day), and nothing else: no row of any other table or view, every read function of
-- the admin 42501, no write, no Claude. recap_sales answers him exactly the numbers of the Panoramica
-- (metriche_periodo, metriche_setting, funnel_periodo called by the admin), aggregates only.
-- Every table and view of public is counted as him, so a table added later is covered without editing
-- this test.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(72);

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
insert into public.obiettivi_mese (mese, cash, nuovi_clienti) values ('2024-01-01', 10000, 5)
on conflict (mese) do nothing;
insert into public.promemoria_percorso (client_id, tipo, data_fine, esito)
select c.id, 'rinnovo_1_mese', '2024-02-29', 'inviato' from public.clients c limit 1
on conflict (client_id, tipo, data_fine) do nothing;
-- a notification of his own: even the app's copy of an email never reaches him (no bell, no page)
insert into public.notifiche (destinatario_id, tipo, canale, titolo, anteprima, corpo_html, email_inviata, chiave)
values ('bc000000-0000-4000-8000-000000000001', 'backup', 'email', 'Backup 101', 'Riga 101', '<p>101</p>', false,
  'test-101/backup');
-- a personal expense of the admin (1.68.0, 107_spese_personali.sql): never his
insert into public.spese_personali (data, categoria, descrizione, importo) values ('2024-01-15', 'casa', 'Affitto 101', 700);

-- An OAuth client and the business coach's session with it (75_mcp_oauth.sql)
insert into auth.oauth_clients (id, client_name, registration_type, client_type, redirect_uris,
  grant_types, token_endpoint_auth_method, deleted_at)
values ('9c000000-0000-4000-8000-000000000101', 'Claude', 'manual', 'public',
  'https://claude.ai/api/mcp/auth_callback', 'authorization_code,refresh_token', 'none', null);
insert into auth.sessions (id, user_id, created_at, updated_at, aal, oauth_client_id, not_after)
values
  ('9e000000-0000-4000-8000-000000000101', 'bc000000-0000-4000-8000-000000000001', now(), now(), 'aal1',
   '9c000000-0000-4000-8000-000000000101', null),
  ('9e000000-0000-4000-8000-000000000102', '11111111-1111-4111-8111-111111111111', now(), now(), 'aal1',
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
  (select id from public.marketing_contenuti order by id limit 1) as contenuto,
  date_trunc('month', public.oggi())::date as mese_da,
  public.oggi() as mese_a;
grant select on x to authenticated;

create or replace function pg_temp.web(p_utente uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_utente, 'role', 'authenticated')::text, true);
  perform set_config('alpha.mcp_filtro', '', true);
  set local role authenticated;
end $$;

-- A token of Claude (an OAuth JWT with client_id and session_id), with the filter run on a path
create or replace function pg_temp.claude(p_utente uuid, p_sessione uuid, p_percorso text default null,
  p_metodo text default 'GET')
returns text language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', p_utente, 'role', 'authenticated',
    'client_id', '9c000000-0000-4000-8000-000000000101', 'session_id', p_sessione)::text, true);
  perform set_config('alpha.mcp_filtro', '', true);
  set local role authenticated;
  if p_percorso is null then
    return null;
  end if;
  perform set_config('request.path', p_percorso, true);
  perform set_config('request.method', p_metodo, true);
  perform set_config('request.headers', '{}', true);
  begin
    perform public.mcp_filtro_richiesta();
    return 'passa';
  exception when others then
    return sqlstate;
  end;
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

-- ---------------------------------------------------------------------------
-- 1. The helpers
-- ---------------------------------------------------------------------------
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select ok(public.legge_come_admin(), 'legge_come_admin: l''admin sì');
select pg_temp.web('bc000000-0000-4000-8000-000000000001');
select is(
  row(public.legge_come_admin(), public.is_admin(), public.pm_livello_corrente(),
      public.pm_puo_vedere((select progetto from x)), public.vede_marketing(), public.insight_puo_leggere(),
      public.puo_usare_mcp())::text,
  row(false, false, null::public.pm_livello, false, false, false, false)::text,
  'il business coach: non legge come l''admin, non è admin, nessun livello nei progetti, niente Marketing, Insight o Claude'
);
select pg_temp.web('22222222-2222-4222-8222-222222222222');
select ok(not public.legge_come_admin(), 'legge_come_admin: il setter no');
reset role;
set local request.jwt.claims to '{}';
set local role authenticated;
select ok(not public.legge_come_admin(), 'legge_come_admin: senza sessione no');
reset role;

-- ---------------------------------------------------------------------------
-- 2. Every table and view of public: nothing, his own profile aside
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

select pg_temp.web('bc000000-0000-4000-8000-000000000001');
select pg_temp.conta_tutto('bc');
reset role;
set local request.jwt.claims to '{}';
select pg_temp.conta_tutto('postgres');

select is(
  (select count(*)::integer from righe_viste where persona = 'bc'),
  (select count(*)::integer from pg_tables where schemaname = 'public')
    + (select count(*)::integer from pg_views where schemaname = 'public'),
  'il conteggio ha letto tutte le tabelle e le view di public'
);
select is(
  (select coalesce(string_agg(relazione || ' ' || righe, ', ' order by relazione), '')
   from righe_viste where persona = 'bc' and coalesce(righe, 0) > 0 and relazione <> 'profiles'),
  '',
  'il business coach non legge nessuna riga di nessuna tabella o view'
);
select is(
  (select righe from righe_viste where persona = 'bc' and relazione = 'profiles'), 1::bigint,
  'dei profili, solo il suo'
);
select pg_temp.web('bc000000-0000-4000-8000-000000000001');
select is((select id from public.profiles), 'bc000000-0000-4000-8000-000000000001'::uuid, 'il profilo che legge è il suo');
reset role;
set local request.jwt.claims to '{}';
select is(
  (select coalesce(string_agg(relazione, ', ' order by relazione), '')
   from righe_viste
   where persona = 'postgres' and coalesce(righe, 0) = 0
     and relazione in ('sales', 'payments', 'expenses', 'commission_rules', 'commission_payouts', 'clients', 'calls',
                       'leads', 'setter_daily_reports', 'call_pitch', 'audit_log', 'marketing_contenuti', 'pm_progetti',
                       'pm_task', 'pm_tempo', 'insight_recap', 'call_analisi', 'products', 'invites', 'notifiche',
                       'obiettivi_mese', 'clienti_cartelle', 'report_proposte_instagram', 'v_vendite', 'v_rate',
                       'v_clienti', 'v_pubblicati', 'spese_personali',
                       -- the guided onboarding (1.77.0): the seed's two clients (60_onboarding.sql)
                       'onboarding_inviti', 'onboarding_inviti_token', 'onboarding_percorsi', 'onboarding_passi',
                       'onboarding_eventi', 'onboarding_incarichi', 'onboarding_impostazioni', 'clienti_telegram',
                       -- the client's area (1.79.0, 61_percorso.sql)
                       'clienti_account', 'contenuti_blocchi', 'clienti_consensi_testi', 'clienti_consensi',
                       'onboarding_video_visti',
                       -- the questionnaire (1.80.0, 61_percorso.sql)
                       'onboarding_questionari')),
  '',
  'le tabelle principali hanno righe: 0 righe per lui vuol dire RLS'
);

-- Static: no policy opens to him (the _lettura_come_admin policies are gone, 20261101090000)
select is(
  (select coalesce(string_agg(tablename || '.' || policyname, ', ' order by 1), '')
   from pg_policies where schemaname = 'public' and policyname like '%\_lettura\_come\_admin'),
  '',
  'nessuna policy _lettura_come_admin'
);
select is(
  (select coalesce(string_agg(tablename || '.' || policyname, ', ' order by 1), '')
   from pg_policies
   where schemaname = 'public' and permissive = 'PERMISSIVE'
     and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'legge_come_admin'),
  '',
  'nessuna policy permissiva usa legge_come_admin'
);
select is(
  (select coalesce(string_agg(tablename || '.' || policyname, ', ' order by tablename, policyname), '')
   from pg_policies
   where schemaname = 'public' and permissive = 'PERMISSIVE'
     and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'business_coach'),
  'notifiche.notifiche_eliminazione, notifiche.notifiche_lettura, notifiche.notifiche_segna_lette, profiles.profiles_select_authenticated',
  'le policy permissive che lo nominano sono solo quelle che lo escludono (rubrica del team e notifiche)'
);
select is(
  (select coalesce(string_agg(tablename || '.' || policyname, ', ' order by 1), '')
   from pg_policies
   where schemaname = 'public' and permissive = 'PERMISSIVE'
     and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'business_coach'
     and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) !~ '<> ''business_coach'''),
  '',
  'e lo nominano solo con «<> business_coach»'
);

-- ---------------------------------------------------------------------------
-- 3. The read functions: 42501, the admin's ones answer the admin
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
    ('kpi_periodo', format('select array_agg(f::text) from public.kpi_periodo(%L, %L) f', v_da, v_a)),
    ('funnel_periodo', format('select array_agg(f::text) from public.funnel_periodo(%L, %L) f', v_da, v_a)),
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
    ('call_per_claude', 'select array_agg(f::text) from public.call_per_claude(p_limite => 200) f'),
    ('pm_tempo_per_persona', format('select array_agg(f::text) from public.pm_tempo_per_persona(%L, %L, null, null, 100) f', v_da, v_a)),
    ('pm_tempo_progetto', format('select array_agg(f::text) from public.pm_tempo_progetto(%L, %L, %L) f',
                                 (select progetto from pg_temp.x), v_da, v_a)),
    ('analisi_riepilogo', format('select public.analisi_riepilogo(%L, %L)::text', v_a - 180, v_a)),
    ('insight_stato', 'select public.insight_stato()::text'),
    ('call_lavori_situazione', 'select public.call_lavori_situazione()::text'),
    ('marketing_lavori_situazione', 'select public.marketing_lavori_situazione()::text'),
    ('spunti_per_claude', 'select public.spunti_per_claude()::text'),
    ('anteprima_eliminazione', format('select public.anteprima_eliminazione(''cliente'', %L)::text', (select cliente from pg_temp.x)))
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
   where persona = 'admin' and testo like 'errore %'),
  '',
  'ogni funzione di lettura risponde all''admin'
);
select is((select count(*)::integer from risposte where persona = 'bc'), 28, 'le 28 funzioni di lettura sono state provate');
select is(
  (select coalesce(string_agg(funzione || ' ' || testo, ', ' order by funzione), '') from risposte
   where persona = 'bc' and testo <> 'errore 42501'
     -- the time of a project: whoever reads the project (he reads none), no admin guard of its own
     and not (funzione = 'pm_tempo_progetto' and testo = '(niente)')),
  '',
  'ogni funzione di lettura dell''admin risponde 42501 al business coach (il tempo di un progetto: niente)'
);

-- ---------------------------------------------------------------------------
-- 4. recap_sales: the numbers of the Panoramica, aggregates only
-- ---------------------------------------------------------------------------
create temp table recap (persona text, dati jsonb) on commit drop;
grant select, insert on recap to authenticated;
create temp table admin_numeri (chiave text, dati jsonb) on commit drop;
grant select, insert on admin_numeri to authenticated;

select pg_temp.web('11111111-1111-4111-8111-111111111111');
insert into recap select 'admin', public.recap_sales((select mese_da from x), (select mese_a from x));
insert into admin_numeri select 'metriche', to_jsonb(m) from public.metriche_periodo((select mese_da from x), (select mese_a from x)) m;
insert into admin_numeri select 'setting', to_jsonb(s) from public.metriche_setting((select mese_da from x), (select mese_a from x)) s
  where s.setter_id is null;
insert into admin_numeri select 'funnel', jsonb_agg(jsonb_build_object('ordine', f.ordine, 'fase', f.fase, 'valore', f.valore,
  'passaggio', f.passaggio) order by f.ordine) from public.funnel_periodo((select mese_da from x), (select mese_a from x)) f;
insert into admin_numeri select 'precedente', to_jsonb(m)
  from public.periodo_precedente((select mese_da from x), (select mese_a from x)) pp, lateral public.metriche_periodo(pp.da, pp.a) m;
insert into admin_numeri select 'trimestre', public.recap_sales(public.oggi() - 120, public.oggi());
insert into admin_numeri select 'trimestre_metriche', to_jsonb(m) from public.metriche_periodo(public.oggi() - 120, public.oggi()) m;
select pg_temp.web('bc000000-0000-4000-8000-000000000001');
insert into recap select 'bc', public.recap_sales((select mese_da from x), (select mese_a from x));
reset role;
set local request.jwt.claims to '{}';

select is((select dati from recap where persona = 'bc'), (select dati from recap where persona = 'admin'),
  'recap_sales: il business coach legge gli stessi numeri dell''admin');
select is(
  (select coalesce(string_agg(k, ', ' order by k), '')
   from recap r, admin_numeri a,
        unnest(array['dm_totali', 'conversazioni', 'call_prenotate', 'call_svolte', 'no_show', 'show_rate', 'chiuse',
                     'close_rate', 'cash_nuovi_clienti', 'revenue_nuovi']) k
   where r.persona = 'bc' and a.chiave = 'metriche'
     and (r.dati -> 'valori' -> k) is distinct from (a.dati -> k)),
  '',
  'recap_sales: i totali sono quelli di metriche_periodo dell''admin (la Panoramica)'
);
select is(
  (select coalesce(string_agg(k, ', ' order by k), '')
   from recap r, admin_numeri a, unnest(array['dm_outbound', 'dm_inbound', 'follow_up']) k
   where r.persona = 'bc' and a.chiave = 'setting'
     and (r.dati -> 'valori' -> k)::numeric is distinct from (a.dati -> k)::numeric),
  '',
  'recap_sales: outbound, inbound e follow up sono quelli di metriche_setting (il totale)'
);
select ok(
  (select ((r.dati -> 'valori' ->> 'dm_outbound')::bigint + (r.dati -> 'valori' ->> 'dm_inbound')::bigint
          + (r.dati -> 'valori' ->> 'follow_up')::bigint) = (r.dati -> 'valori' ->> 'dm_totali')::bigint
   from recap r where r.persona = 'bc'),
  'recap_sales: outbound + inbound + follow up = DM totali'
);
select is((select dati -> 'funnel' from recap where persona = 'bc'), (select dati from admin_numeri where chiave = 'funnel'),
  'recap_sales: il funnel è funnel_periodo');
select is(
  (select coalesce(string_agg(k, ', ' order by k), '')
   from recap r, admin_numeri a,
        unnest(array['dm_totali', 'conversazioni', 'call_prenotate', 'call_svolte', 'chiuse', 'cash_nuovi_clienti',
                     'revenue_nuovi']) k
   where r.persona = 'bc' and a.chiave = 'precedente'
     and (r.dati -> 'precedenti' -> k) is distinct from (a.dati -> k)),
  '',
  'recap_sales: il periodo prima è metriche_periodo sul periodo precedente (periodo_precedente)'
);
select is(
  (select coalesce(string_agg(k, ', ' order by k), '')
   from recap r,
        unnest(array['dm_totali', 'conversazioni', 'call_prenotate', 'call_svolte', 'chiuse', 'cash_nuovi_clienti',
                     'revenue_nuovi']) k
   where r.persona = 'bc'
     and (r.dati -> 'delta' ->> k)::numeric is distinct from round(public.rapporto(
           (r.dati -> 'valori' ->> k)::numeric - (r.dati -> 'precedenti' ->> k)::numeric,
           abs((r.dati -> 'precedenti' ->> k)::numeric)), 4)),
  '',
  'recap_sales: la variazione è quella di kpi_periodo (relativa, null senza un valore prima)'
);
select is(
  (select array[sum((s ->> 'dm_outbound')::bigint), sum((s ->> 'dm_inbound')::bigint), sum((s ->> 'follow_up')::bigint),
                sum((s ->> 'call_svolte')::bigint), sum((s ->> 'chiuse')::bigint)]::bigint[]
   from recap r, jsonb_array_elements(r.dati -> 'serie') s where r.persona = 'bc'),
  (select array[(dati -> 'valori' ->> 'dm_outbound')::bigint, (dati -> 'valori' ->> 'dm_inbound')::bigint,
                (dati -> 'valori' ->> 'follow_up')::bigint, (dati -> 'valori' ->> 'call_svolte')::bigint,
                (dati -> 'valori' ->> 'chiuse')::bigint]
   from recap where persona = 'bc'),
  'recap_sales: la serie somma ai totali (DM, call svolte, chiuse)'
);
select is(
  (select sum((s ->> 'cash_nuovi_clienti')::numeric) from recap r, jsonb_array_elements(r.dati -> 'serie') s
   where r.persona = 'bc'),
  (select (dati -> 'valori' ->> 'cash_nuovi_clienti')::numeric from recap where persona = 'bc'),
  'recap_sales: la serie del cash dei nuovi clienti somma al totale'
);
select is(
  (select array[dati ->> 'granularita', jsonb_array_length(dati -> 'serie')::text,
                dati -> 'serie' -> 0 ->> 'inizio', dati -> 'serie' -> -1 ->> 'fine']
   from recap where persona = 'bc'),
  (select array['giorno', ((mese_a - mese_da) + 1)::text, mese_da::text, mese_a::text] from x),
  'recap_sales: un mese si legge giorno per giorno, dal primo all''ultimo giorno del periodo'
);
-- the granularity, decided in SQL
select pg_temp.web('bc000000-0000-4000-8000-000000000001');
select is(
  array[
    public.recap_sales('2026-01-01', '2026-01-31') ->> 'granularita',
    public.recap_sales('2026-01-01', '2026-02-01') ->> 'granularita',
    public.recap_sales('2026-01-01', '2026-07-05') ->> 'granularita',
    public.recap_sales('2026-01-01', '2026-07-06') ->> 'granularita'
  ],
  array['giorno', 'settimana', 'settimana', 'mese'],
  'recap_sales: giorni fino a 31, settimane fino a 186, mesi oltre'
);
select is(
  (select array[jsonb_array_length(r -> 'serie')::text, r -> 'serie' -> 0 ->> 'inizio', r -> 'serie' -> 0 ->> 'fine',
                r -> 'serie' -> 1 ->> 'inizio', r -> 'serie' -> -1 ->> 'fine']
   from (select public.recap_sales('2026-01-01', '2026-02-28') as r) q),
  -- 01/01/2026 is a Thursday: the first week is clipped to the period, the others start on Monday
  array['9', '2026-01-01', '2026-01-04', '2026-01-05', '2026-02-28'],
  'recap_sales: le settimane partono dal lunedì, la prima e l''ultima tagliate al periodo'
);
select is(
  (select array[jsonb_array_length(r -> 'serie')::text, r -> 'serie' -> 0 ->> 'inizio', r -> 'serie' -> 0 ->> 'fine',
                r -> 'serie' -> -1 ->> 'inizio', r -> 'serie' -> -1 ->> 'fine']
   from (select public.recap_sales('2025-11-15', '2026-06-10') as r) q),
  array['8', '2025-11-15', '2025-11-30', '2026-06-01', '2026-06-10'],
  'recap_sales: i mesi, il primo e l''ultimo tagliati al periodo'
);
-- a longer period: by week, and still the totals of metriche_periodo
select is(
  (select array[(r -> 'valori' ->> 'dm_totali')::numeric, (r -> 'valori' ->> 'chiuse')::numeric,
                (r -> 'valori' ->> 'cash_nuovi_clienti')::numeric]
   from (select public.recap_sales(public.oggi() - 120, public.oggi()) as r) q),
  (select array[(dati ->> 'dm_totali')::numeric, (dati ->> 'chiuse')::numeric, (dati ->> 'cash_nuovi_clienti')::numeric]
   from admin_numeri where chiave = 'trimestre_metriche'),
  'recap_sales su 4 mesi: gli stessi totali di metriche_periodo'
);
select is(
  (select sum((s ->> 'cash_nuovi_clienti')::numeric) from jsonb_array_elements(public.recap_sales(public.oggi() - 120, public.oggi()) -> 'serie') s),
  (select (dati ->> 'cash_nuovi_clienti')::numeric from admin_numeri where chiave = 'trimestre_metriche'),
  'recap_sales su 4 mesi: le settimane sommano al cash dei nuovi clienti'
);
-- after his recap the admin's reads are closed again, in the same transaction
select ok(not public.legge_come_admin(), 'dopo recap_sales: legge_come_admin di nuovo no');
select throws_ok($$ select * from public.metriche_periodo(public.oggi() - 30, public.oggi()) $$, '42501', null,
  'dopo recap_sales: metriche_periodo di nuovo 42501');
-- no name, no client, no lead in what he receives
select ok(
  (select dati::text !~* '(nome|cliente|lead|setter_id|closer_id|margine|costi|provvigion)' from recap where persona = 'bc'),
  'recap_sales: solo aggregati, mai un nome, un cliente, un lead, costi, margine o provvigioni'
);
select throws_ok($$ select public.recap_sales('2026-02-01', '2026-01-01') $$, '22023', null,
  'recap_sales: un periodo al contrario 22023');
reset role;
set local request.jwt.claims to '{}';

-- who else: 42501
create temp table esiti_recap (persona text, esito text) on commit drop;
grant select, insert on esiti_recap to authenticated;
create or replace function pg_temp.prova_recap(p_persona text)
returns void language plpgsql as $$
begin
  begin
    perform public.recap_sales(public.oggi() - 30, public.oggi());
    insert into pg_temp.esiti_recap values (p_persona, 'passa');
  exception when others then
    insert into pg_temp.esiti_recap values (p_persona, sqlstate);
  end;
end $$;
select pg_temp.web('22222222-2222-4222-8222-222222222222');
select pg_temp.prova_recap('setter');
select pg_temp.web('33333333-3333-4333-8333-333333333333');
select pg_temp.prova_recap('closer');
select pg_temp.web('44444444-4444-4444-8444-444444444444');
select pg_temp.prova_recap('coach');
select pg_temp.web('55555555-5555-4555-8555-555555555555');
select pg_temp.prova_recap('editor');
select pg_temp.web('61616161-6161-4161-8161-616161616161');
select pg_temp.prova_recap('marketing');
reset role;
set local request.jwt.claims to '{}';
set local role authenticated;
select pg_temp.prova_recap('nessuna sessione');
reset role;
select is(
  (select array_agg(persona || ' ' || esito order by persona) from esiti_recap),
  array['closer 42501', 'coach 42501', 'editor 42501', 'marketing 42501', 'nessuna sessione 42501', 'setter 42501'],
  'recap_sales: gli altri ruoli e senza sessione 42501'
);

-- ---------------------------------------------------------------------------
-- 4b. recap_mese (1.59.0): the month by day, the totals of the Panoramica and of the Closer page
-- ---------------------------------------------------------------------------
create temp table mese_recap (persona text, dati jsonb) on commit drop;
grant select, insert on mese_recap to authenticated;
create temp table mese_admin (chiave text, dati jsonb) on commit drop;
grant select, insert on mese_admin to authenticated;
create temp table m on commit drop as
select date_trunc('month', public.oggi())::date as da,
       ((date_trunc('month', public.oggi()) + interval '1 month')::date - 1) as a,
       (date_trunc('month', public.oggi()) - interval '1 month')::date as prec_da,
       (date_trunc('month', public.oggi())::date - 1) as prec_a;
grant select on m to authenticated;

select pg_temp.web('11111111-1111-4111-8111-111111111111');
insert into mese_recap select 'admin', public.recap_mese((select da from m) + 9);
insert into mese_admin select 'metriche', to_jsonb(x) from public.metriche_periodo((select da from m), (select a from m)) x;
insert into mese_admin select 'precedente', to_jsonb(x) from public.metriche_periodo((select prec_da from m), (select prec_a from m)) x;
insert into mese_admin select 'setting', to_jsonb(s) from public.metriche_setting((select da from m), (select a from m)) s
  where s.setter_id is null;
insert into mese_admin select 'closer', to_jsonb(g) from public.giornate_closer((select da from m), (select a from m)) g
  where g.data is null;
insert into mese_admin select 'sales', public.recap_sales((select da from m), (select a from m));
select pg_temp.web('bc000000-0000-4000-8000-000000000001');
insert into mese_recap select 'bc', public.recap_mese((select da from m));
reset role;
set local request.jwt.claims to '{}';

select is((select dati from mese_recap where persona = 'bc'), (select dati from mese_recap where persona = 'admin'),
  'recap_mese: il business coach legge gli stessi numeri dell''admin, da qualunque giorno del mese');
select is(
  (select array[r.dati -> 'valori', r.dati -> 'precedenti', r.dati -> 'delta']
   from mese_recap r where r.persona = 'bc'),
  (select array[a.dati -> 'valori', a.dati -> 'precedenti', a.dati -> 'delta'] from mese_admin a where a.chiave = 'sales'),
  'recap_mese: le tessere sono quelle di recap_sales sul mese intero'
);
select is(
  (select array[jsonb_array_length(dati -> 'giorni')::text, dati -> 'giorni' -> 0 ->> 'giorno',
                dati -> 'giorni' -> -1 ->> 'giorno', dati ->> 'da', dati ->> 'a', dati ->> 'precedente_da']
   from mese_recap where persona = 'bc'),
  (select array[((a - da) + 1)::text, da::text, a::text, da::text, a::text, prec_da::text] from m),
  'recap_mese: ogni giorno del mese, dal primo all''ultimo, anche quelli senza niente'
);
select is(
  (select coalesce(string_agg(k, ', ' order by k), '')
   from mese_recap r,
        unnest(array['dm_outbound', 'dm_inbound', 'follow_up', 'dm_totali', 'conversazioni', 'call_proposte',
                     'call_prenotate', 'prenotate_inbound', 'prenotate_outbound', 'call_svolte', 'qualificate',
                     'no_show', 'call_follow_up', 'cancellate', 'in_attesa', 'chiuse', 'cash', 'revenue']) k
   where r.persona = 'bc'
     and (select sum((g ->> k)::numeric) from jsonb_array_elements(r.dati -> 'giorni') g)
         is distinct from (r.dati -> 'totali' ->> k)::numeric),
  '',
  'recap_mese: i giorni sommano ai totali del mese, voce per voce'
);
select is(
  (select coalesce(string_agg(k, ', ' order by k), '')
   from mese_recap r, mese_admin a,
        unnest(array['dm_totali', 'conversazioni', 'call_proposte', 'call_prenotate', 'call_svolte', 'no_show',
                     'qualificate', 'chiuse']) k
   where r.persona = 'bc' and a.chiave = 'metriche'
     and (r.dati -> 'totali' ->> k)::numeric is distinct from (a.dati ->> k)::numeric),
  '',
  'recap_mese: i totali del setting e delle call sono quelli di metriche_periodo (la Panoramica)'
);
select is(
  (select coalesce(string_agg(k, ', ' order by k), '')
   from mese_recap r, mese_admin a,
        unnest(array['dm_outbound', 'dm_inbound', 'follow_up', 'prenotate_inbound', 'prenotate_outbound']) k
   where r.persona = 'bc' and a.chiave = 'setting'
     and (r.dati -> 'totali' ->> k)::numeric is distinct from (a.dati ->> k)::numeric),
  '',
  'recap_mese: outbound, inbound, follow up e le prenotate per fonte sono quelli di metriche_setting'
);
select is(
  (select array[(r.dati -> 'totali' ->> 'call_svolte')::numeric, (r.dati -> 'totali' ->> 'qualificate')::numeric,
                (r.dati -> 'totali' ->> 'no_show')::numeric, (r.dati -> 'totali' ->> 'call_follow_up')::numeric,
                (r.dati -> 'totali' ->> 'cancellate')::numeric, (r.dati -> 'totali' ->> 'chiuse')::numeric,
                (r.dati -> 'totali' ->> 'cash')::numeric, (r.dati -> 'totali' ->> 'revenue')::numeric]
   from mese_recap r where r.persona = 'bc'),
  (select array[coalesce((a.dati ->> 'call')::numeric, 0), coalesce((a.dati ->> 'qualificate')::numeric, 0),
                coalesce((a.dati ->> 'no_show')::numeric, 0), coalesce((a.dati ->> 'follow_up')::numeric, 0),
                coalesce((a.dati ->> 'cancellate')::numeric, 0), coalesce((a.dati ->> 'chiuse')::numeric, 0),
                coalesce((a.dati ->> 'cash')::numeric, 0), coalesce((a.dati ->> 'revenue')::numeric, 0)]
   from (select (select dati from mese_admin where chiave = 'closer') as dati) a),
  'recap_mese: i totali del closing sono quelli di giornate_closer per tutti i closer (la pagina Closer)'
);
select is(
  (select (r.dati -> 'totali' ->> 'revenue')::numeric from mese_recap r where r.persona = 'bc'),
  (select (a.dati ->> 'revenue_nuovi')::numeric from mese_admin a where a.chiave = 'metriche'),
  'recap_mese: la revenue dei giorni è la revenue dei nuovi clienti del mese'
);
select is(
  (select coalesce(string_agg(k, ', ' order by k), '')
   from mese_recap r, mese_admin a,
        unnest(array['tasso_conversazione', 'tasso_prenotazione', 'dm_per_call', 'show_rate', 'tasso_qualificazione',
                     'close_rate', 'close_rate_qualificate', 'chiuse', 'cash_nuovi_clienti', 'revenue_nuovi',
                     'cash_per_dm', 'revenue_per_dm', 'cash_per_call_svolta', 'valore_medio_nuovo']) k
   where r.persona = 'bc' and a.chiave = 'metriche'
     and (r.dati -> 'riepilogo' ->> k)::numeric is distinct from (a.dati ->> k)::numeric),
  '',
  'recap_mese: il riepilogo è metriche_periodo (sezione 9)'
);
select is(
  (select array[(r.dati -> 'riepilogo' ->> 'tasso_dm_qualificate')::numeric,
                (r.dati -> 'riepilogo' ->> 'cash_medio_chiusura')::numeric]
   from mese_recap r where r.persona = 'bc'),
  (select array[public.rapporto((a.dati ->> 'qualificate')::numeric, (a.dati ->> 'dm_totali')::numeric),
                public.rapporto((a.dati ->> 'cash_nuovi_clienti')::numeric, (a.dati ->> 'chiuse')::numeric)]
   from mese_admin a where a.chiave = 'metriche'),
  'recap_mese: DM → qualificate e cash medio per chiusura con rapporto() (null senza denominatore)'
);
select is(
  (select coalesce(string_agg(k, ', ' order by k), '')
   from mese_recap r, mese_admin a,
        unnest(array['tasso_conversazione', 'tasso_prenotazione', 'show_rate', 'close_rate', 'cash_nuovi_clienti',
                     'revenue_nuovi', 'valore_medio_nuovo']) k
   where r.persona = 'bc' and a.chiave = 'precedente'
     and (r.dati -> 'riepilogo_precedente' ->> k)::numeric is distinct from (a.dati ->> k)::numeric),
  '',
  'recap_mese: il riepilogo del mese prima è metriche_periodo del mese prima'
);
select is(
  (select coalesce(string_agg(g ->> 'giorno', ', '), '')
   from mese_recap r, jsonb_array_elements(r.dati -> 'giorni') g
   where r.persona = 'bc'
     and ((g ->> 'show_rate')::numeric is distinct from
            public.rapporto((g ->> 'call_svolte')::numeric, (g ->> 'call_svolte')::numeric + (g ->> 'no_show')::numeric)
          or (g ->> 'close_rate')::numeric is distinct from
            public.rapporto((g ->> 'chiuse')::numeric, (g ->> 'call_svolte')::numeric))),
  '',
  'recap_mese: show rate e close rate di ogni giorno, null senza call'
);
select ok(
  (select dati::text !~* '(nome|cliente|lead|setter_id|closer_id|margine|costi|provvigion|email)' from mese_recap where persona = 'bc'),
  'recap_mese: solo totali del team, mai un nome, un cliente, un lead, costi, margine o provvigioni'
);
select pg_temp.web('bc000000-0000-4000-8000-000000000001');
select ok(not public.legge_come_admin(), 'dopo recap_mese: legge_come_admin di nuovo no');
select throws_ok($$ select public.recap_mese(null) $$, '22023', null, 'recap_mese: senza un mese 22023');
reset role;
set local request.jwt.claims to '{}';

create temp table esiti_mese (persona text, esito text) on commit drop;
grant select, insert on esiti_mese to authenticated;
create or replace function pg_temp.prova_mese(p_persona text)
returns void language plpgsql as $$
begin
  begin
    perform public.recap_mese(public.oggi());
    insert into pg_temp.esiti_mese values (p_persona, 'passa');
  exception when others then
    insert into pg_temp.esiti_mese values (p_persona, sqlstate);
  end;
end $$;
select pg_temp.web('22222222-2222-4222-8222-222222222222');
select pg_temp.prova_mese('setter');
select pg_temp.web('33333333-3333-4333-8333-333333333333');
select pg_temp.prova_mese('closer');
select pg_temp.web('44444444-4444-4444-8444-444444444444');
select pg_temp.prova_mese('coach');
select pg_temp.web('55555555-5555-4555-8555-555555555555');
select pg_temp.prova_mese('editor');
select pg_temp.web('61616161-6161-4161-8161-616161616161');
select pg_temp.prova_mese('marketing');
reset role;
set local request.jwt.claims to '{}';
set local role authenticated;
select pg_temp.prova_mese('nessuna sessione');
reset role;
select is(
  (select array_agg(persona || ' ' || esito order by persona) from esiti_mese),
  array['closer 42501', 'coach 42501', 'editor 42501', 'marketing 42501', 'nessuna sessione 42501', 'setter 42501'],
  'recap_mese: gli altri ruoli e senza sessione 42501'
);

-- ---------------------------------------------------------------------------
-- 5. Never a write
-- ---------------------------------------------------------------------------
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
-- his own profile row: profiles has no update or delete policy for him (aggiorna_mio_profilo is the way, below)
select is(
  (select coalesce(string_agg(tabella || ' ' || azione || ' ' || esito, ', ' order by tabella, azione), '')
   from scritture where esito not in ('0', 'errore 42501')),
  '',
  'nessun update e nessun delete del business coach tocca una riga, in nessuna tabella'
);

select pg_temp.web('bc000000-0000-4000-8000-000000000001');
select throws_ok($$ insert into public.expenses (data, categoria, descrizione, importo) values (public.oggi(), 'software', 'Prova 101', 10) $$,
  '42501', null, 'non registra un costo');
select throws_ok($$ insert into public.leads (nome, setter_id, fonte) values ('Lead 101', 'bc000000-0000-4000-8000-000000000001', 'organico') $$,
  '42501', null, 'non crea un lead');
select throws_ok($$ insert into public.clients (nome, cognome) values ('Cliente', 'Centouno') $$,
  '42501', null, 'non crea un cliente');
select throws_ok($$ insert into public.marketing_contenuti (nome) values ('Contenuto 101') $$,
  '42501', null, 'non crea un contenuto del calendario');
select throws_ok(format($$ insert into public.pm_tempo (profile_id, progetto_id, data, minuti) values ('bc000000-0000-4000-8000-000000000001', %L, public.oggi(), 30) $$,
  (select progetto from x)), '42501', null, 'non registra tempo');
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
  perform pg_temp.prova('elimina_cliente', format($q$ select public.elimina_cliente(%L) $q$, a.cliente));
  perform pg_temp.prova('elimina_persona', $q$ select public.elimina_persona('22222222-2222-4222-8222-222222222222') $q$);
  perform pg_temp.prova('aggiorna_stato_lead', format($q$ select public.aggiorna_stato_lead(%L, 'perso') $q$, a.lead));
  perform pg_temp.prova('fissa_call', $q$ select public.fissa_call('Lead 101', 'organico', 'discovery', public.oggi() + 1, '18:00',
    '11111111-1111-4111-8111-111111111111', null, null) $q$);
  perform pg_temp.prova('sposta_call', format($q$ select public.sposta_call(%L, public.oggi() + 2, '18:00') $q$, a.call_id));
  perform pg_temp.prova('nuova_regola_provvigione', $q$ select public.nuova_regola_provvigione('22222222-2222-4222-8222-222222222222', 0.05, '{nuovo}', '2031-01-01') $q$);
  perform pg_temp.prova('insight_richiedi', $q$ select public.insight_richiedi() $q$);
  perform pg_temp.prova('marketing_spunti_richiedi', $q$ select public.marketing_spunti_richiedi() $q$);
  perform pg_temp.prova('pm_crea_progetto', format($q$ select public.pm_crea_progetto(%L, 'Progetto 101', null, null, null, null, null, null) $q$, a.reparto));
  perform pg_temp.prova('pm_registra_tempo', format($q$ select public.pm_registra_tempo(%L, public.oggi(), 30, null, null, null, null) $q$, a.progetto));
end $$;
reset role;
set local request.jwt.claims to '{}';
select is(
  (select coalesce(string_agg(funzione || ' ' || esito, ', ' order by funzione), '')
   from esiti_rpc where esito <> '42501'),
  '',
  'ogni funzione che scrive rifiuta il business coach con 42501'
);

-- ---------------------------------------------------------------------------
-- 6. A deactivated business coach: nothing, not even the recap
-- ---------------------------------------------------------------------------
update public.profiles set attivo = false where id = 'bc000000-0000-4000-8000-000000000001';
select pg_temp.web('bc000000-0000-4000-8000-000000000001');
select pg_temp.conta_tutto('spento');
select throws_ok($$ select public.recap_sales(public.oggi() - 30, public.oggi()) $$, '42501', null,
  'disattivato: recap_sales 42501');
select throws_ok($$ select public.recap_mese(public.oggi()) $$, '42501', null,
  'disattivato: recap_mese 42501');
reset role;
set local request.jwt.claims to '{}';
select is(
  (select coalesce(string_agg(relazione || ' ' || righe, ', ' order by relazione), '')
   from righe_viste where persona = 'spento' and coalesce(righe, 0) > 0 and relazione <> 'profiles'),
  '',
  'disattivato: nessuna riga in nessuna tabella o view'
);
update public.profiles set attivo = true where id = 'bc000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- 7. Claude: he no longer connects it
-- ---------------------------------------------------------------------------
select pg_temp.claude('bc000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000101');
select is(
  row(public.mcp_ruolo(), public.current_role(), public.mcp_chi_sono() ->> 'esito')::text,
  row(null::public.app_role, null::public.app_role, 'ruolo')::text,
  'token di Claude del business coach: nessun ruolo, mcp_chi_sono dice «ruolo» (la route risponde 403)'
);
reset role;
select is(
  array[
    pg_temp.claude('bc000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000101', '/pm_task', 'GET'),
    pg_temp.claude('bc000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000101', '/profiles', 'GET'),
    pg_temp.claude('bc000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000101', '/marketing_contenuti', 'GET'),
    pg_temp.claude('bc000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000101', '/rpc/recap_sales', 'POST'),
    pg_temp.claude('bc000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000101', '/rpc/mcp_chi_sono', 'POST')
  ],
  array['42501', '42501', '42501', '42501', 'passa'],
  'il filtro: ogni richiesta del suo token si ferma, tranne la domanda della route'
);
reset role;
set local request.jwt.claims to '{}';
select pg_temp.claude('bc000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000101');
select throws_ok($$ select public.recap_sales(public.oggi() - 30, public.oggi()) $$, '42501', null,
  'token di Claude del business coach: recap_sales 42501');
select throws_ok($$ select public.recap_mese(public.oggi()) $$, '42501', null,
  'token di Claude del business coach: recap_mese 42501');
reset role;
set local request.jwt.claims to '{}';
-- the admin's token too: the recap is a page of the app, never of Claude
select pg_temp.claude('11111111-1111-4111-8111-111111111111', '9e000000-0000-4000-8000-000000000102', '/rpc/mcp_chi_sono', 'POST');
select throws_ok($$ select public.recap_sales(public.oggi() - 30, public.oggi()) $$, '42501', null,
  'token di Claude dell''admin: recap_sales 42501');
select throws_ok($$ select public.recap_mese(public.oggi()) $$, '42501', null,
  'token di Claude dell''admin: recap_mese 42501');
reset role;
set local request.jwt.claims to '{}';
-- after the filter tried, his token reads nothing
select pg_temp.claude('bc000000-0000-4000-8000-000000000001', '9e000000-0000-4000-8000-000000000101', '/rpc/mcp_chi_sono', 'POST');
select pg_temp.conta_tutto('claude');
reset role;
set local request.jwt.claims to '{}';
select is(
  (select coalesce(string_agg(relazione || ' ' || righe, ', ' order by relazione), '')
   from righe_viste where persona = 'claude' and coalesce(righe, 0) > 0),
  '',
  'token di Claude del business coach, anche in una richiesta passata dal filtro: nessuna riga'
);

select * from finish();
rollback;
