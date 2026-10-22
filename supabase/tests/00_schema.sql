-- Structural guarantees: no table without RLS, no view that bypasses it,
-- no security definer function with a mutable search_path, and Claude's OAuth
-- tokens (20261010090000_mcp_oauth.sql, 20261027110000_mcp_progetti_tempo.sql)
-- reach only the MCP allow-list.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(10);

-- Every table of the data model exists
select is(
  (select count(*)::int
   from pg_tables
   where schemaname = 'public'
     and tablename in (
       'profiles', 'invites', 'setter_daily_reports', 'leads', 'calls',
       'clients', 'products', 'sales', 'payments',
       'commission_rules', 'commission_payouts', 'expenses', 'audit_log'
     )),
  13,
  'tutte e 13 le tabelle del modello dati esistono'
);

-- RLS on every table in public, no exceptions
select is(
  (select coalesce(string_agg(tablename, ', ' order by tablename), '')
   from pg_tables
   where schemaname = 'public'
     and not rowsecurity),
  '',
  'ogni tabella in public ha RLS abilitata'
);

-- Every table has at least one permissive policy (RLS without policies = silent
-- denial). Restrictive ones do not count: <table>_mai_da_oauth alone grants nothing.
select is(
  (select coalesce(string_agg(t.tablename, ', ' order by t.tablename), '')
   from pg_tables t
   where t.schemaname = 'public'
     and not exists (
       select 1 from pg_policies p
       where p.schemaname = 'public' and p.tablename = t.tablename
         and p.permissive = 'PERMISSIVE'
     )),
  '',
  'ogni tabella ha almeno una policy'
);

-- Claude (20261010090000_mcp_oauth.sql): every table outside the MCP allow-list
-- refuses OAuth tokens with its own restrictive <table>_mai_da_oauth, for every
-- command; the allow-list tables have none. A new table fails here until it gets
-- the policy in its migration, or joins the allow-list on purpose (and the
-- pre-request mcp_filtro_richiesta, and test 75).
select is(
  (select coalesce(string_agg(t.tablename, ', ' order by t.tablename), '')
   from pg_tables t
   where t.schemaname = 'public'
     and case
       when t.tablename = 'marketing_contenuti' then exists (
         select 1 from pg_policies p
         where p.schemaname = 'public' and p.tablename = t.tablename
           and (p.permissive = 'RESTRICTIVE' or p.policyname = t.tablename || '_mai_da_oauth')
       )
       -- the labels (20261024090000): Claude reads them, so no restrictive policy on the read,
       -- and exactly one per write (insert, update, delete)
       when t.tablename = 'marketing_opzioni' then exists (
         select 1 from pg_policies p
         where p.schemaname = 'public' and p.tablename = t.tablename
           and p.permissive = 'RESTRICTIVE' and p.cmd in ('ALL', 'SELECT')
       ) or (
         select count(*) from pg_policies p
         where p.schemaname = 'public' and p.tablename = t.tablename
           and p.permissive = 'RESTRICTIVE' and p.cmd in ('INSERT', 'UPDATE', 'DELETE')
       ) <> 3
       -- projects, lists, tasks, notes and time (20261027110000, phase 1 of 4): no _mai_da_oauth, and
       -- exactly four restrictive policies, one per command, the delete one refusing every OAuth token
       -- (the people of a task aside: pm_imposta_assegnatari and pm_scegli_coach replace them)
       when t.tablename in ('pm_progetti', 'pm_membri', 'pm_tasklist', 'pm_task', 'pm_task_assegnatari',
                            'pm_tempo', 'pm_note', 'pm_reparti', 'pm_modelli', 'profiles') then (
         select coalesce(array_agg(p.policyname::text || ' ' || p.cmd order by p.policyname::text), '{}')
         from pg_policies p
         where p.schemaname = 'public' and p.tablename = t.tablename
           and (p.permissive = 'RESTRICTIVE' or p.policyname like '%_mai_da_oauth')
       ) <> array[
         t.tablename || '_claude_eliminazione DELETE', t.tablename || '_claude_inserimento INSERT',
         t.tablename || '_claude_lettura SELECT', t.tablename || '_claude_modifica UPDATE'
       ] or not exists (
         select 1 from pg_policies p
         where p.schemaname = 'public' and p.tablename = t.tablename
           and p.policyname = t.tablename || '_claude_eliminazione'
           and p.roles = array['authenticated']::name[]
           and p.qual = case when t.tablename = 'pm_task_assegnatari'
                             then '((NOT ( SELECT da_client_oauth() AS da_client_oauth)) OR (( SELECT "current_role"() AS "current_role") IS NOT NULL))'
                             else '(NOT ( SELECT da_client_oauth() AS da_client_oauth))' end
       )
       else not exists (
         select 1 from pg_policies p
         where p.schemaname = 'public' and p.tablename = t.tablename
           and p.policyname = t.tablename || '_mai_da_oauth'
           and p.permissive = 'RESTRICTIVE'
           and p.cmd = 'ALL'
           and p.roles = array['authenticated']::name[]
           and p.qual = '(NOT ( SELECT da_client_oauth() AS da_client_oauth))'
           and p.with_check = '(NOT ( SELECT da_client_oauth() AS da_client_oauth))'
       )
     end),
  '',
  'ogni tabella fuori dalla lista MCP rifiuta i token di Claude'
);

-- The security definer functions anyone signed in can call (PUBLIC grants
-- included), trigger functions aside. Each one was read for an OAuth token
-- (current_role() null): it refuses, answers nothing or only about the caller,
-- or has an explicit guard on da_client_oauth(). A new one fails here until it
-- is added to this list and to the RPC block of 75_mcp_oauth.sql with its
-- outcome for Claude's token.
select results_eq(
  $$ select p.proname::text collate "C"
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and p.prorettype <> 'trigger'::regtype
       and has_function_privilege('authenticated', p.oid, 'execute')
     order by 1 $$,
  $$ select x collate "C" from unnest(array[
       'aggiorna_mio_profilo', 'aggiorna_stato_lead', 'aggiungi_rata', 'anteprima_eliminazione',
       -- the calls of 1.37.0: the recording (admin and the call's closer), the analysis and its requests, the numbers
       -- (admin, closer), the planner's settings (admin), the performance (the call's closer, admin), the brief for Claude
       'call_analisi_richiedi', 'call_imposta_costo_max', 'call_imposta_interruttori', 'call_lavori_situazione',
       'call_numeri_periodo', 'collega_registrazione', 'decidi_performance',
       'fathom_chiave_presente', 'fathom_imposta_chiave', 'fathom_togli_chiave',
       'marketing_spunti_richiedi', 'scollega_registrazione', 'spunti_per_claude',
       'call_ha_follow_up', 'call_ha_vendita', 'current_role', 'elimina_call', 'elimina_cliente',
       'elimina_lead', 'elimina_persona', 'elimina_prodotto', 'elimina_rata', 'fissa_follow_up',
       'giornate_closer', 'giornate_setter', 'incassi_clienti_setter', 'inserisci_piano',
       -- the Insight (1.35.0): admin, or insight_puo_leggere() for insight_stato, checked first
       'insight_chat_messenger', 'insight_dimentica', 'insight_imposta_automazione', 'insight_richiedi',
       'insight_ruota_chiave', 'insight_stato',
       'instagram_imposta_token', 'instagram_togli_token', 'instagram_token_presente', 'is_admin',
       'lead_appartiene_al_setter',
       -- the business coach (1.52.0): true for an active admin or business coach, read policies and read functions only
       'legge_come_admin',
       -- the reel analysis (1.36.0): marketing_analisi_richiedi (admin and marketing), the limit and the
       -- switches (admin), the situation (admin, editor, marketing): each checks current_role() first
       'marketing_analisi_richiedi', 'marketing_imposta_costo_max', 'marketing_imposta_interruttori',
       'marketing_lavori_situazione',
       'mcp_chi_sono', 'mcp_client', 'mcp_filtro_richiesta', 'mcp_ruolo',
       -- Messenger for the Insight (1.35.0): the admin only
       'messenger_imposta_token', 'messenger_togli_token', 'messenger_token_presente',
       'mia_foto_google', 'mie_vendite_setter', 'miei_clienti', 'miei_numeri_periodo', 'pm_assegnato',
       'pm_coach_del_cliente', 'pm_crea_progetto', 'pm_ferma_timer', 'pm_livello_corrente',
       'pm_membro', 'pm_puo_gestire', 'pm_puo_modificare_task', 'pm_puo_vedere',
       'promemoria_percorso_interrotto', 'puo_usare_mcp', 'segna_tutorial_visto', 'unisci_profili',
       'vede_marketing'
     ]::text[]) as x order by 1 $$,
  'ogni funzione security definer raggiungibile è nella lista (e nel test 75 per i token di Claude)'
);

-- PostgREST calls a function that takes a row of a table or view as a computed column of that
-- relation (GET /pm_task?select=f): on the relations Claude reaches, it would run inside a request the
-- filter approved, with the person's role. None exists; one added later fails here until it is read
-- for Claude's token and listed.
select is(
  (select coalesce(string_agg(p.proname::text || '(' || c.relname::text || ')', ', ' order by p.proname::text), '')
   from pg_proc p
   join pg_type ty on ty.oid = p.proargtypes[0]
   join pg_class c on c.oid = ty.typrelid
   where p.pronamespace = 'public'::regnamespace
     and p.pronargs >= 1
     and c.relnamespace = 'public'::regnamespace
     and c.relname in ('marketing_contenuti', 'marketing_opzioni', 'pm_progetti', 'pm_membri', 'pm_tasklist',
                       'pm_task', 'pm_task_assegnatari', 'pm_tempo', 'pm_note', 'pm_reparti', 'pm_modelli',
                       'profiles', 'v_pm_progetti', 'v_pm_task', 'v_pm_tasklist')),
  '',
  'nessuna funzione fa da colonna calcolata sulle tabelle che Claude raggiunge'
);

-- The Data API filter is registered where PostgREST reads it
select ok(
  exists (
    select 1
    from pg_db_role_setting s
    join pg_roles r on r.oid = s.setrole
    where r.rolname = 'authenticator'
      and s.setdatabase = 0
      and 'pgrst.db_pre_request=public.mcp_filtro_richiesta' = any (s.setconfig)
  ),
  'il filtro delle Data API (pgrst.db_pre_request) è registrato sul ruolo authenticator'
);

-- The most likely security bug of this project: a view without security_invoker
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '')
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relkind = 'v'
     and coalesce(
       (select option_value
        from pg_options_to_table(c.reloptions)
        where option_name = 'security_invoker'),
       'false'
     ) <> 'true'),
  '',
  'ogni view è security_invoker'
);

-- security definer functions must pin search_path
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '')
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.prosecdef
     and not exists (
       select 1 from unnest(coalesce(p.proconfig, array[]::text[])) as cfg
       where cfg like 'search_path=%'
     )),
  '',
  'ogni funzione security definer ha search_path impostato'
);

-- anon must never reach the economics tables
select is(
  (select coalesce(string_agg(distinct table_name, ', '), '')
   from information_schema.role_table_grants
   where grantee = 'anon'
     and table_schema = 'public'),
  '',
  'il ruolo anon non ha alcun permesso sulle tabelle di public'
);

select * from finish();
rollback;
