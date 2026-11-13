-- Claude connected through Supabase Auth's OAuth 2.1 server (Dany, 09/10/2026:
-- «creare un mcp nella mia dashboard che collego con claude normale e gli dico
-- come riempire tutta la parte di content»; 20261010090000_mcp_oauth.sql).
-- An OAuth token is an ordinary Supabase JWT plus client_id and session_id. It
-- reaches only the MCP allow-list, even when it is the admin's: the content
-- calendar and, since 20261027110000_mcp_progetti_tempo.sql (phase 1 of 4,
-- 22/10/2026), projects, lists, tasks, notes and time (100_mcp_progetti_tempo.sql
-- tests those). Three layers: the Data API filter (mcp_filtro_richiesta, run by
-- PostgREST before every request), a restrictive policy on every table
-- (<table>_mai_da_oauth outside the list), and current_role() /
-- pm_livello_corrente() null for it outside a request the filter approved, with
-- explicit guards on the definer RPCs that act on auth.uid(). This test never
-- goes through PostgREST: the layers B and C are checked here without the
-- filter's approval (the flag alpha.mcp_filtro unset), so every definer RPC of
-- the other areas still answers 42501 to the token; the filter on its own with
-- the request settings PostgREST would write, and it refuses the path of every
-- one of those RPCs.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(101);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres): OAuth clients and sessions, two more roles, a
-- deactivated marketing account
-- ---------------------------------------------------------------------------
-- Seed: admin 1111, setter 2222, closer 3333, coach 4444 (PM manager),
-- editor 5555, marketing 6161 (supabase/seeds/25_marketing.sql)
insert into public.invites (email, ruolo) values
  ('marketing75@alpha.test', 'marketing'),
  ('nutrizione75@alpha.test', 'nutrizione'),
  ('dev75@alpha.test', 'dev');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999990075',
   'authenticated', 'authenticated', 'marketing75@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Marta Settantacinque"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999990175',
   'authenticated', 'authenticated', 'nutrizione75@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Nina Settantacinque"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999990275',
   'authenticated', 'authenticated', 'dev75@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Dario Settantacinque"}'::jsonb, now(), now(), '', '', '', '');
update public.profiles set attivo = false where id = '99999999-9999-4999-8999-999999990075';

-- Clients as GoTrue stores them: redirect_uris is one comma-separated text, and
-- client_type defaults to confidential (set public explicitly, as in the dashboard)
insert into auth.oauth_clients (id, client_name, registration_type, client_type, redirect_uris,
  grant_types, token_endpoint_auth_method, deleted_at)
values
  ('7c000000-0000-4000-8000-000000000001', 'Claude', 'manual', 'public',
   'https://claude.ai/api/mcp/auth_callback,https://claude.com/api/mcp/auth_callback',
   'authorization_code,refresh_token', 'none', null),
  -- named on purpose unlike «Claude Code»: mcp_client() finds it by its redirect
  ('7c000000-0000-4000-8000-000000000002', 'Claude Code (prova)', 'manual', 'public',
   'http://localhost:48721/callback,http://127.0.0.1:48721/callback',
   'authorization_code,refresh_token', 'none', null),
  ('7c000000-0000-4000-8000-000000000003', 'Claude', 'dynamic', 'public',
   'https://claude.ai/api/mcp/auth_callback',
   'authorization_code,refresh_token', 'none', null),
  ('7c000000-0000-4000-8000-000000000004', 'Claude', 'manual', 'public',
   'https://claude.ai/api/mcp/auth_callback',
   'authorization_code,refresh_token', 'none', now()),
  ('7c000000-0000-4000-8000-000000000005', 'Claude', 'manual', 'confidential',
   'https://claude.ai/api/mcp/auth_callback',
   'authorization_code,refresh_token', 'client_secret_basic', null),
  ('7c000000-0000-4000-8000-000000000006', 'Altra app', 'manual', 'public',
   'https://altra.example.test/callback',
   'authorization_code,refresh_token', 'none', null);

insert into auth.sessions (id, user_id, created_at, updated_at, aal, oauth_client_id, not_after)
values
  ('7e000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', now(), now(), 'aal1', '7c000000-0000-4000-8000-000000000001', null),
  ('7e000000-0000-4000-8000-000000000002', '55555555-5555-4555-8555-555555555555', now(), now(), 'aal1', '7c000000-0000-4000-8000-000000000001', null),
  ('7e000000-0000-4000-8000-000000000003', '61616161-6161-4161-8161-616161616161', now(), now(), 'aal1', '7c000000-0000-4000-8000-000000000001', null),
  ('7e000000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', now(), now(), 'aal1', '7c000000-0000-4000-8000-000000000001', null),
  ('7e000000-0000-4000-8000-000000000005', '33333333-3333-4333-8333-333333333333', now(), now(), 'aal1', '7c000000-0000-4000-8000-000000000001', null),
  ('7e000000-0000-4000-8000-000000000006', '44444444-4444-4444-8444-444444444444', now(), now(), 'aal1', '7c000000-0000-4000-8000-000000000001', null),
  ('7e000000-0000-4000-8000-000000000007', '99999999-9999-4999-8999-999999990075', now(), now(), 'aal1', '7c000000-0000-4000-8000-000000000001', null),
  ('7e000000-0000-4000-8000-000000000008', '61616161-6161-4161-8161-616161616161', now(), now(), 'aal1', '7c000000-0000-4000-8000-000000000002', null),
  ('7e000000-0000-4000-8000-000000000009', '61616161-6161-4161-8161-616161616161', now(), now(), 'aal1', '7c000000-0000-4000-8000-000000000003', null),
  ('7e000000-0000-4000-8000-000000000010', '61616161-6161-4161-8161-616161616161', now(), now(), 'aal1', '7c000000-0000-4000-8000-000000000004', null),
  ('7e000000-0000-4000-8000-000000000011', '61616161-6161-4161-8161-616161616161', now(), now(), 'aal1', '7c000000-0000-4000-8000-000000000001', now() - interval '1 minute'),
  ('7e000000-0000-4000-8000-000000000012', '61616161-6161-4161-8161-616161616161', now(), now(), 'aal1', '7c000000-0000-4000-8000-000000000006', null);

-- Who the request is. The JWT of an OAuth token has client_id and session_id;
-- p_client is text so that a malformed one ('abc') can be tried.
create or replace function pg_temp.come_oauth(p_utente uuid, p_client text, p_sessione uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', p_utente, 'role', 'authenticated', 'client_id', p_client, 'session_id', p_sessione)::text, true);
  set local role authenticated;
end;
$$;

-- A web session (the app): no client_id, or, with p_client, a client_id as given
create or replace function pg_temp.come_web(p_utente uuid, p_client text default null)
returns void
language plpgsql
as $$
begin
  if p_client is null then
    perform set_config('request.jwt.claims', json_build_object('sub', p_utente, 'role', 'authenticated')::text, true);
  else
    perform set_config('request.jwt.claims', json_build_object(
      'sub', p_utente, 'role', 'authenticated', 'client_id', p_client)::text, true);
  end if;
  set local role authenticated;
end;
$$;

-- What the Data API filter answers for one request: 'passa' or the SQLSTATE
create or replace function pg_temp.filtro(p_percorso text, p_metodo text, p_intestazioni jsonb default '{}'::jsonb)
returns text
language plpgsql
as $$
begin
  perform set_config('request.path', coalesce(p_percorso, ''), true);
  perform set_config('request.method', coalesce(p_metodo, ''), true);
  perform set_config('request.headers', p_intestazioni::text, true);
  begin
    perform public.mcp_filtro_richiesta();
    return 'passa';
  exception when others then
    return sqlstate;
  end;
end;
$$;

-- Calendar writes as the current identity, with the number of rows touched
create or replace function pg_temp.modifica(p_id uuid)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  update public.marketing_contenuti set stato = 'to_be_edited' where id = p_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- The URL of a content emptied as the current identity (1.33.0's trigger on the URL runs)
create or replace function pg_temp.togli_url(p_id uuid)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  update public.marketing_contenuti set url = null where id = p_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

create or replace function pg_temp.elimina(p_id uuid)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  delete from public.marketing_contenuti where id = p_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- puo_usare_mcp() for one identity (web session, or OAuth with a client)
create or replace function pg_temp.puo(p_utente uuid, p_client text default null, p_sessione uuid default null)
returns boolean
language plpgsql
as $$
begin
  if p_client is null then
    perform pg_temp.come_web(p_utente);
  else
    perform pg_temp.come_oauth(p_utente, p_client, p_sessione);
  end if;
  return public.puo_usare_mcp();
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('da_client_oauth', 'mcp_token_valido', 'mcp_ruolo', 'mcp_filtro_richiesta',
                       'mcp_chi_sono', 'puo_usare_mcp', 'mcp_client')),
  7,
  'le sette funzioni del collegamento a Claude esistono'
);
select is(
  (select coalesce(string_agg(p.proname::text collate "default", ', ' order by p.proname::text collate "default"), '')
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('da_client_oauth', 'mcp_token_valido', 'mcp_ruolo', 'mcp_filtro_richiesta',
                       'mcp_chi_sono', 'puo_usare_mcp', 'mcp_client')
     and (p.prosecdef <> (p.proname <> 'da_client_oauth')
          or not ('search_path=""' = any (coalesce(p.proconfig, array[]::text[]))))),
  '',
  'tutte security definer tranne da_client_oauth, e tutte con search_path vuoto'
);
select is(
  (select coalesce(string_agg(f, ', ' order by f), '')
   from unnest(array['da_client_oauth()', 'mcp_chi_sono()', 'mcp_ruolo()', 'puo_usare_mcp()', 'mcp_client()']) as f
   where has_function_privilege('anon', ('public.' || f)::regprocedure, 'execute')),
  '',
  'anon non chiama nessuna delle funzioni di Claude'
);
select ok(
  not has_function_privilege('authenticated', 'public.mcp_token_valido()', 'execute')
  and not has_function_privilege('anon', 'public.mcp_token_valido()', 'execute'),
  'mcp_token_valido è interna: né authenticated né anon'
);
select ok(
  has_function_privilege('anon', 'public.mcp_filtro_richiesta()', 'execute')
  and has_function_privilege('authenticated', 'public.mcp_filtro_richiesta()', 'execute')
  and has_function_privilege('service_role', 'public.mcp_filtro_richiesta()', 'execute'),
  'il filtro lo eseguono anon, authenticated e service_role (PostgREST lo chiama col ruolo della richiesta)'
);
select ok(
  exists (
    select 1 from pg_db_role_setting s join pg_roles r on r.oid = s.setrole
    where r.rolname = 'authenticator' and s.setdatabase = 0
      and 'pgrst.db_pre_request=public.mcp_filtro_richiesta' = any (s.setconfig)
  ),
  'il filtro è registrato come pgrst.db_pre_request sul ruolo authenticator'
);
-- The redefined functions keep arguments (defaults included), volatility, owner rights and grants
select is(
  (select array_agg(
            p.proname::text collate "default" || '(' || pg_get_function_arguments(p.oid) || ') '
            || p.provolatile::text || ' definer:' || p.prosecdef::text
            || ' anon:' || has_function_privilege('anon', p.oid, 'execute')::text
            || ' authenticated:' || has_function_privilege('authenticated', p.oid, 'execute')::text
            || ' service_role:' || has_function_privilege('service_role', p.oid, 'execute')::text
            order by p.proname::text collate "default")
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('pm_livello_corrente', 'inserisci_piano', 'pm_ferma_timer', 'segna_tutorial_visto',
                       'mia_foto_google', 'foto_google', 'current_role', 'vede_marketing')),
  array[
    'current_role() s definer:true anon:true authenticated:true service_role:true',
    'foto_google(p_meta jsonb) i definer:false anon:false authenticated:true service_role:true',
    'inserisci_piano(p_sale_id uuid, p_rate jsonb) v definer:true anon:false authenticated:true service_role:true',
    'mia_foto_google() s definer:true anon:false authenticated:true service_role:true',
    'pm_ferma_timer(p_nota text DEFAULT NULL::text) v definer:true anon:false authenticated:true service_role:true',
    'pm_livello_corrente() s definer:true anon:false authenticated:true service_role:true',
    'segna_tutorial_visto() v definer:true anon:false authenticated:true service_role:true',
    'vede_marketing() s definer:true anon:false authenticated:true service_role:true'
  ],
  'le funzioni ridefinite tengono argomenti, volatilità e permessi di prima'
);

-- ---------------------------------------------------------------------------
-- 2. The web app is unchanged
-- ---------------------------------------------------------------------------
select pg_temp.come_web('11111111-1111-4111-8111-111111111111');
select is(
  row(public.current_role(), public.is_admin(), public.vede_marketing(), public.da_client_oauth(), public.mcp_ruolo())::text,
  '(admin,t,t,f,)',
  'web, admin: ruolo, admin, area Marketing come prima; nessun ruolo per Claude'
);
select pg_temp.come_web('22222222-2222-4222-8222-222222222222');
select is(
  row(public.current_role(), public.is_admin(), public.vede_marketing(), public.da_client_oauth())::text,
  '(setter,f,f,f)',
  'web, setter: come prima'
);
reset role;
set local request.jwt.claims to '{}';
set local role authenticated;
select is(
  row(public.current_role(), public.is_admin(), public.vede_marketing(), public.da_client_oauth())::text,
  '(,f,f,f)',
  'senza sessione: come prima'
);
select pg_temp.come_web('11111111-1111-4111-8111-111111111111', '');
select is(
  row(public.current_role(), public.is_admin(), public.da_client_oauth())::text,
  '(admin,t,f)',
  'un client_id vuoto nel JWT vale come sessione web'
);

-- ---------------------------------------------------------------------------
-- 3. The admin's OAuth token outside a request the filter approved: no role, no
--    project level, only the calendar (inside one, 100_mcp_progetti_tempo.sql)
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims to '{}';
create temp table progetti on commit drop as select id from public.pm_progetti;
grant select on progetti to authenticated;

select pg_temp.come_oauth('11111111-1111-4111-8111-111111111111', '7c000000-0000-4000-8000-000000000001',
  '7e000000-0000-4000-8000-000000000001');
select is(
  row(public.current_role(), public.is_admin(), public.pm_livello_corrente(), public.mcp_ruolo(),
      public.vede_marketing(), public.puo_usare_mcp(), public.da_client_oauth())::text,
  '(,f,,admin,t,f,t)',
  'token di Claude dell''admin: nessun ruolo, non admin, nessun livello nei progetti; Claude agisce come admin solo nel calendario'
);
select is((select count(*)::int from public.mcp_client()), 0, 'token di Claude: nessun client da collegare');
select is(
  (select row(bool_or(public.pm_puo_vedere(id)), bool_or(public.pm_puo_gestire(id)))::text from progetti),
  '(f,f)',
  'token di Claude dell''admin: nessun progetto da vedere o gestire'
);
select pg_temp.come_web('11111111-1111-4111-8111-111111111111');
select is(
  (select row(public.pm_livello_corrente(), bool_and(public.pm_puo_vedere(id)))::text from progetti),
  '(admin,t)',
  'web, admin: admin dei progetti e li vede tutti, come prima'
);
select pg_temp.come_web('44444444-4444-4444-8444-444444444444');
select is(public.pm_livello_corrente()::text, 'manager', 'web, coach: il livello salvato, come prima');

-- ---------------------------------------------------------------------------
-- 4. Restrictive policies
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims to '{}';
select is(
  (select coalesce(string_agg(t.tablename, ', ' order by t.tablename), '')
   from pg_tables t
   where t.schemaname = 'public' and t.tablename not in ('marketing_contenuti', 'marketing_opzioni')
     -- the tables of phase 1 (20261027110000) have four restrictive _claude_* policies instead (00_schema.sql)
     and t.tablename not in ('pm_progetti', 'pm_membri', 'pm_tasklist', 'pm_task', 'pm_task_assegnatari',
                             'pm_tempo', 'pm_note', 'pm_reparti', 'pm_modelli', 'profiles')
     -- and so have the tables of phase 2 (20261029090000: calls, leads and outcomes, 102_mcp_call_lead.sql)
     and t.tablename not in ('calls', 'leads', 'call_pitch', 'call_registrazioni', 'products')
     -- and so have the tables of phase 3 (20261030090000: clients, sales, instalments, 103_mcp_clienti_vendite.sql)
     and t.tablename not in ('clients', 'sales', 'payments', 'clienti_chiusure', 'clienti_sospensioni',
                             'clienti_cartelle', 'vendite_contratti')
     -- and so have the tables of phase 4 (20261031090000: costs, commissions, goals, invites, the setter's
     -- reports, 104_mcp_costi_provvigioni.sql)
     and t.tablename not in ('expenses', 'commission_rules', 'commission_payouts', 'obiettivi_mese', 'invites',
                             'setter_daily_reports')
     and not exists (
       select 1 from pg_policies p
       where p.schemaname = 'public' and p.tablename = t.tablename
         and p.policyname = t.tablename || '_mai_da_oauth'
         and p.permissive = 'RESTRICTIVE' and p.cmd = 'ALL'
         and p.roles = array['authenticated']::name[]
     )),
  '',
  'ogni tabella tranne il calendario e le tabelle di progetti, tempo, call, lead, clienti, vendite, costi e provvigioni ha la sua policy restrittiva _mai_da_oauth'
);
select is(
  (select count(*)::int from pg_policies
   where schemaname = 'public' and tablename = 'marketing_contenuti' and permissive = 'RESTRICTIVE'),
  0,
  'il calendario non ne ha'
);
-- the labels of the calendar (20261024090000): Claude reads them, never writes: three restrictive policies, one per write
select is(
  (select array_agg(cmd order by cmd) from pg_policies
   where schemaname = 'public' and tablename = 'marketing_opzioni' and permissive = 'RESTRICTIVE'
     and policyname like 'marketing_opzioni_mai_da_oauth%' and roles = array['authenticated']::name[]),
  array['DELETE', 'INSERT', 'UPDATE']::text[],
  'le etichette: tre policy restrittive, una per ogni scrittura (e nessuna sulla lettura)'
);
select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'storage' and tablename = 'objects' and policyname = 'oggetti_mai_da_oauth'
      and permissive = 'RESTRICTIVE' and cmd = 'ALL' and roles = array['authenticated']::name[]
  ),
  'nemmeno lo Storage: oggetti_mai_da_oauth'
);

-- ---------------------------------------------------------------------------
-- 5. Generic isolation: every table and view of public, as Claude
-- ---------------------------------------------------------------------------
-- A row in every table the seed leaves empty, so "0 rows" means something
-- (the same rows as 66_ruolo_marketing.sql)
insert into public.call_pitch (call_id, importo_proposto)
select c.id, 1500 from public.calls c
where not exists (select 1 from public.call_pitch p where p.call_id = c.id)
limit 1;
insert into public.clienti_cartelle (client_id, url)
select c.id, 'https://drive.google.com/drive/folders/test-75' from public.clients c
where not exists (select 1 from public.clienti_cartelle x where x.client_id = c.id)
limit 1;
insert into public.clienti_chiusure (client_id, chiuso_il, motivo)
select c.id, public.oggi(), 'Prova del test 75' from public.clients c
where not exists (select 1 from public.clienti_chiusure x where x.client_id = c.id)
  and not exists (select 1 from public.sales s where s.client_id = c.id and s.data_vendita > public.oggi())
limit 1;
-- a client on hold (1.44.0): closing the first client above ends his hold, so the hold goes to another one
insert into public.clienti_sospensioni (client_id, sospeso_il)
select c.id, public.oggi() from public.clients c
where not exists (select 1 from public.clienti_sospensioni x where x.client_id = c.id)
  and not exists (select 1 from public.clienti_chiusure x where x.client_id = c.id)
limit 1;
insert into public.report_proposte_instagram (setter_id, data, dm_outbound, chat_lette)
values ('22222222-2222-4222-8222-222222222222', '2024-01-15', 12, 20)
on conflict (setter_id, data) do nothing;
insert into public.promemoria_percorso (client_id, tipo, data_fine, esito)
select c.id, 'rinnovo_1_mese', '2024-02-29', 'inviato' from public.clients c limit 1
on conflict (client_id, tipo, data_fine) do nothing;
insert into public.obiettivi_mese (mese, cash, nuovi_clienti) values ('2024-01-01', 10000, 5)
on conflict (mese) do nothing;
-- The Instagram posts and their links with the calendar (1.33.0): Claude reaches none of them
insert into public.marketing_contenuti (id, tipo, nome, stato, post_date) values
  ('66660000-0000-4000-8000-000000000066', 'reel', 'Contenuto del test 66', 'posted', public.oggi() - 1)
on conflict (id) do nothing;
insert into public.instagram_contenuti (media_id, shortcode, permalink, media_type, reel, pubblicato_il) values
  ('6600000000000001', 'Test66Post1', 'https://www.instagram.com/reel/Test66Post1/', 'VIDEO', true, now() - interval '1 day'),
  ('6600000000000002', 'Test66Post2', 'https://www.instagram.com/p/Test66Post2/', 'IMAGE', false, now() - interval '1 day')
on conflict (media_id) do nothing;
insert into public.marketing_abbinamenti (shortcode, contenuto_id, esito, punteggio, somiglianza, giorni, motivi)
values ('Test66Post1', '66660000-0000-4000-8000-000000000066', 'proposto', 50, 0.4, 0, array['stessa_data'])
on conflict (shortcode, contenuto_id) do nothing;
insert into public.marketing_abbinamenti_rifiutati (shortcode, contenuto_id)
values ('Test66Rifiutato', '66660000-0000-4000-8000-000000000066')
on conflict (shortcode, contenuto_id) do nothing;
insert into public.marketing_post_esclusi (shortcode) values ('Test66Post2')
on conflict (shortcode) do nothing;
-- The Insight (1.35.0, 20261014090300_insight_mai_da_oauth.sql): chats, profiles,
-- AI work, Messenger exclusions and the counted days of the leads per post,
-- which the seed leaves empty (the recaps, the runs, Fatto and the counts have
-- the seed's rows, the automation and the Messenger Page their row)
insert into public.insight_esecuzioni (id, giorno, motivo, stato, passo) values
  ('75750000-0000-4000-8000-000000000175', public.oggi() - 2, 'manuale', 'pronta', 'unione')
on conflict (id) do nothing;
insert into public.insight_chat (canale, conversazione_id, username, nome, messaggi, messaggi_letti, completa)
values ('instagram', 'test75-chat', 'lead.test75', 'Lead Test 75',
        '[{"da":"lead","il":"2026-10-10T10:00:00Z","testo":"Ciao","codici":[],"storia":false}]', 1, true)
on conflict (canale, conversazione_id) do nothing;
insert into public.insight_profili (username, nome) values ('lead.test75', 'Lead Test 75')
on conflict (username) do nothing;
insert into public.insight_blocchi (esecuzione_id, canale, tipo, indice)
values ('75750000-0000-4000-8000-000000000175', 'instagram', 'sintesi', 0)
on conflict (esecuzione_id, canale, tipo, indice) do nothing;
insert into public.insight_schede (esecuzione_id, giorno, canale, tipo, chiave, impronta, dati)
values ('75750000-0000-4000-8000-000000000175', public.oggi() - 2, 'instagram', 'lead', 'test75-chat', repeat('e', 64), '{}')
on conflict (esecuzione_id, canale, tipo, chiave) do nothing;
insert into public.messenger_esclusi (utente_id, nome) values ('7500000000000075', 'Escluso Test 75')
on conflict (utente_id) do nothing;
insert into public.instagram_contenuti_dm (shortcode, giorno, dm, lead_in_target, call_prenotate, dm_certi)
values ('Test66Post1', public.oggi() - 1, 2, 1, 1, 1)
on conflict (shortcode, giorno) do nothing;
insert into public.instagram_contenuti_dm_giorni (giorno) values (public.oggi() - 1)
on conflict (giorno) do nothing;
-- The reel analysis (1.36.0, 20261016090100_analisi_dati.sql): the numbers of the posts, the readings
-- and the analyses, which the seed may leave empty (marketing_lavori_stato has its row)
insert into public.instagram_contenuti_misure (media_id, giorno, letto_il, eta_ore, views)
values ('6600000000000001', public.oggi() - 1, now(), 24, 100)
on conflict (media_id, giorno) do nothing;
insert into public.instagram_account_misure (giorno, follower, media, letto_il)
values (public.oggi() - 30, 12000, 200, now())
on conflict (giorno) do nothing;
insert into public.instagram_letture (media_id, richiesta, motivo)
values ('6600000000000001', 'completa', 'richiesta')
on conflict (media_id) do nothing;
insert into public.marketing_analisi (id, media_id, motivo, periodo_da, periodo_a)
values ('75750000-0000-4000-8000-000000000275', '6600000000000001', 'richiesta', public.oggi() - 28, public.oggi() - 1)
on conflict (id) do nothing;
-- The calendar «Dany Discovery Call» (1.76.0), which the seed leaves empty
insert into public.call_calendario (uid, creata_il, programmata_il, eta, budget_si)
values ('evento-75@calendly.com', now() - interval '3 days', now() + interval '1 day', 30, true)
on conflict (uid) do nothing;
-- The admin's personal expenses (1.68.0), which the seed leaves empty
insert into public.spese_personali (data, categoria, descrizione, importo) values ('2024-01-15', 'casa', 'Affitto 75', 700);
-- The client's area (1.78.0): a registration in progress and the limits of /entra, which the seed leaves empty
insert into public.onboarding_registrazioni (invito_id, chiave_hash, chiave_scade_il)
values ('0b0a0000-0000-4000-8000-000000000021', repeat('7', 64), now() + interval '30 minutes')
on conflict (invito_id) do nothing;
insert into public.clienti_accesso_limiti (chiave, invii) values ('tutti', 1) on conflict (chiave) do nothing;
-- The questionnaire (1.79.0): a file of the seed's active client, which the seed leaves without files
insert into public.onboarding_allegati (id, client_id, campo, percorso, nome_file, tipo, byte)
values ('75750000-0000-4000-8000-000000000276', '0b0b0000-0000-4000-8000-000000000001', 'attrezzatura',
        '0b0b0000-0000-4000-8000-000000000001/75750000-0000-4000-8000-000000000276', 'sbarra.jpg', 'image/jpeg', 1000)
on conflict (id) do nothing;

create or replace function pg_temp.tabelle_vuote()
returns text
language plpgsql
as $$
declare
  r record;
  n bigint;
  vuote text[] := '{}';
begin
  for r in select tablename::text as nome from pg_catalog.pg_tables where schemaname = 'public' loop
    execute format('select count(*) from public.%I', r.nome) into n;
    if n = 0 then
      vuote := vuote || r.nome;
    end if;
  end loop;
  return array_to_string(vuote, ', ');
end;
$$;
select is(pg_temp.tabelle_vuote(), '', 'ogni tabella di public ha almeno una riga: lo zero dei conteggi vuol dire qualcosa');

create temp table righe_viste (persona text, relazione text, righe bigint, errore text) on commit drop;
grant select, insert on righe_viste to authenticated;

create or replace function pg_temp.conta_tutto(p_persona text)
returns void
language plpgsql
as $$
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
end;
$$;

select pg_temp.come_oauth('11111111-1111-4111-8111-111111111111', '7c000000-0000-4000-8000-000000000001',
  '7e000000-0000-4000-8000-000000000001');
do $$ begin perform pg_temp.conta_tutto('admin'); end $$;
select pg_temp.come_oauth('61616161-6161-4161-8161-616161616161', '7c000000-0000-4000-8000-000000000001',
  '7e000000-0000-4000-8000-000000000003');
do $$ begin perform pg_temp.conta_tutto('marketing'); end $$;
reset role;
set local request.jwt.claims to '{}';

select is(
  (select count(*)::integer from righe_viste where persona = 'admin'),
  (select count(*)::integer from pg_tables where schemaname = 'public')
    + (select count(*)::integer from pg_views where schemaname = 'public'),
  'il conteggio ha letto tutte le tabelle e le view di public'
);
select is(
  (select coalesce(array_agg(relazione order by relazione), '{}') from righe_viste where persona = 'admin' and righe > 0),
  array['marketing_contenuti', 'marketing_opzioni'],
  'col token di Claude l''admin legge solo il calendario dei contenuti e le sue etichette'
);
select is(
  (select coalesce(array_agg(relazione order by relazione), '{}') from righe_viste where persona = 'marketing' and righe > 0),
  array['marketing_contenuti', 'marketing_opzioni'],
  'e così il marketing: niente profili, progetti o prodotti'
);

-- ---------------------------------------------------------------------------
-- 6. Writes refused
-- ---------------------------------------------------------------------------
select pg_temp.come_oauth('11111111-1111-4111-8111-111111111111', '7c000000-0000-4000-8000-000000000001',
  '7e000000-0000-4000-8000-000000000001');
select throws_ok($$
  insert into public.expenses (data, categoria, descrizione, importo)
  values (public.oggi(), 'software', 'Costo da Claude', 10) $$,
  '42501', null, 'token di Claude dell''admin: niente costi');
select throws_ok($$
  insert into public.leads (nome, setter_id, fonte)
  values ('Lead Da Claude', '11111111-1111-4111-8111-111111111111', 'organico') $$,
  '42501', null, 'né lead');
select throws_ok($$ insert into public.clients (nome) values ('Cliente Da Claude') $$,
  '42501', null, 'né clienti');
-- An update that RLS filters out touches no row and raises nothing: it is counted
create or replace function pg_temp.rinomina_admin()
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  update public.profiles set nome = 'Dany Da Claude' where id = '11111111-1111-4111-8111-111111111111';
  get diagnostics n = row_count;
  return n;
end;
$$;
select is(pg_temp.rinomina_admin(), 0, 'né il proprio profilo: nessuna riga toccata');
reset role;
set local request.jwt.claims to '{}';
select is(
  (select nome from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'Dany Montagnolo',
  'il nome resta com''era'
);

-- ---------------------------------------------------------------------------
-- 7. Every security definer RPC of 00_schema.sql (and the economics ones), as
--    the admin's OAuth token: each in its own block, the outcome compared at
--    the end. P0002 or a result would mean the body ran.
-- ---------------------------------------------------------------------------
-- Arguments taken from the seed, as postgres
create temp table argomenti on commit drop as
select
  (select id from public.leads order by created_at limit 1) as lead_id,
  (select id from public.calls order by created_at limit 1) as call_id,
  (select id from public.clients order by created_at limit 1) as client_id,
  (select id from public.sales order by created_at limit 1) as sale_id,
  (select id from public.payments order by created_at limit 1) as payment_id,
  (select id from public.products order by created_at limit 1) as product_id,
  (select id from public.pm_reparti order by nome limit 1) as reparto_id,
  (select id from public.pm_progetti order by created_at limit 1) as progetto_id,
  (select id from public.pm_task order by created_at limit 1) as task_id;
grant select on argomenti to authenticated;
create temp table una_call on commit drop as select * from public.calls order by created_at limit 1;
grant select on una_call to authenticated;

-- A sale created by the admin without a plan: inserisci_piano would write one
-- for him (created_by = auth.uid()) if the token reached its body
insert into public.sales (id, client_id, product_id, tipo, data_vendita, data_inizio, valore_contratto,
  numero_rate, created_by)
select '7f000000-0000-4000-8000-000000000001', a.client_id, a.product_id, 'upsell', public.oggi(), public.oggi(),
  300, 1, '11111111-1111-4111-8111-111111111111'
from argomenti a;
delete from public.payments where sale_id = '7f000000-0000-4000-8000-000000000001';
-- The admin's running timer (pm_ferma_timer), the tour not seen yet
-- (segna_tutorial_visto), and his Google photo (mia_foto_google)
insert into public.pm_tempo (profile_id, progetto_id, data, inizio)
select '11111111-1111-4111-8111-111111111111', a.progetto_id, public.oggi(), now() - interval '10 minutes'
from argomenti a;
update public.profiles set tutorial_visto = false where id = '11111111-1111-4111-8111-111111111111';
update auth.users set raw_user_meta_data = raw_user_meta_data || '{"avatar_url":"https://lh3.googleusercontent.com/a/dany"}'::jsonb
where id = '11111111-1111-4111-8111-111111111111';
create temp table prima on commit drop as
select (select count(*) from public.pm_progetti) as progetti, (select count(*) from public.payments) as rate;

create temp table esiti_rpc (funzione text, esito text) on commit drop;
grant select, insert on esiti_rpc to authenticated;

create or replace function pg_temp.prova(p_funzione text, p_sql text)
returns void
language plpgsql
as $$
declare
  v text;
begin
  begin
    execute p_sql into v;
    insert into pg_temp.esiti_rpc values (p_funzione, 'ok:' || coalesce(v, 'null'));
  exception when others then
    insert into pg_temp.esiti_rpc values (p_funzione, sqlstate);
  end;
end;
$$;

select pg_temp.come_oauth('11111111-1111-4111-8111-111111111111', '7c000000-0000-4000-8000-000000000001',
  '7e000000-0000-4000-8000-000000000001');
select set_config('request.path', 'rpc/mcp_filtro_richiesta', true), set_config('request.method', 'POST', true),
  set_config('request.headers', '{}', true);
do $$
declare
  a record;
begin
  select * into a from pg_temp.argomenti;
  -- the security definer list of 00_schema.sql
  perform pg_temp.prova('aggiorna_mio_profilo', $q$ select public.aggiorna_mio_profilo('Dany Da Claude', null)::text $q$);
  perform pg_temp.prova('aggiorna_stato_lead', format($q$ select public.aggiorna_stato_lead(%L, 'perso')::text $q$, a.lead_id));
  perform pg_temp.prova('aggiungi_rata', format($q$ select public.aggiungi_rata(%L, public.oggi(), 100)::text $q$, a.sale_id));
  perform pg_temp.prova('anteprima_eliminazione', format($q$ select public.anteprima_eliminazione('cliente', %L)::text $q$, a.client_id));
  -- the calls of 1.37.0: every one reads current_role(), which an OAuth token does not have; the brief is made for it
  perform pg_temp.prova('call_analisi_richiedi', format($q$ select public.call_analisi_richiedi(%L)::text $q$, a.call_id));
  perform pg_temp.prova('call_imposta_costo_max', $q$ select public.call_imposta_costo_max(30)::text $q$);
  perform pg_temp.prova('call_imposta_interruttori', $q$ select public.call_imposta_interruttori(false)::text $q$);
  perform pg_temp.prova('call_lavori_situazione', $q$ select public.call_lavori_situazione()::text $q$);
  perform pg_temp.prova('call_numeri_periodo', $q$ select count(*)::text from public.call_numeri_periodo('2026-10-01', '2026-10-31', 'totale', null) $q$);
  perform pg_temp.prova('collega_registrazione', format($q$ select public.collega_registrazione(%L, '{"tipo":"non_registrata"}')::text $q$, a.call_id));
  perform pg_temp.prova('decidi_performance', format($q$ select public.decidi_performance(%L, 'buona')::text $q$, a.call_id));
  -- the calendar «Dany Discovery Call» (1.76.0): admin only, never an OAuth token
  perform pg_temp.prova('calendario_imposta_url', $q$ select public.calendario_imposta_url('https://calendar.google.com/calendar/ical/x%40group.calendar.google.com/private-0123456789abcdef0123/basic.ics')::text $q$);
  perform pg_temp.prova('calendario_togli_url', $q$ select public.calendario_togli_url()::text $q$);
  perform pg_temp.prova('calendario_url_presente', $q$ select public.calendario_url_presente()::text $q$);
  perform pg_temp.prova('prenotate_per_giorno', $q$ select count(*)::text from public.prenotate_per_giorno('2026-10-01', '2026-10-31') $q$);
  perform pg_temp.prova('setting_contatti', $q$ select public.setting_contatti('2026-10-01', '2026-10-31')::text $q$);
  perform pg_temp.prova('fathom_chiave_presente', $q$ select public.fathom_chiave_presente()::text $q$);
  perform pg_temp.prova('fathom_imposta_chiave', $q$ select public.fathom_imposta_chiave('chiave-da-claude-0123456789abcdef')::text $q$);
  perform pg_temp.prova('fathom_togli_chiave', $q$ select public.fathom_togli_chiave()::text $q$);
  perform pg_temp.prova('marketing_spunti_richiedi', $q$ select public.marketing_spunti_richiedi()::text $q$);
  perform pg_temp.prova('scollega_registrazione', format($q$ select public.scollega_registrazione(%L)::text $q$, a.call_id));
  perform pg_temp.prova('spunti_per_claude', $q$ select ((public.spunti_per_claude() ->> 'periodo_a') is not null)::text $q$);
  perform pg_temp.prova('call_ha_follow_up', $q$ select public.call_ha_follow_up(row(u.*)::public.calls)::text from pg_temp.una_call u $q$);
  perform pg_temp.prova('call_ha_vendita', $q$ select public.call_ha_vendita(row(u.*)::public.calls)::text from pg_temp.una_call u $q$);
  perform pg_temp.prova('current_role', $q$ select public.current_role()::text $q$);
  perform pg_temp.prova('elimina_call', format($q$ select public.elimina_call(%L)::text $q$, a.call_id));
  perform pg_temp.prova('elimina_cliente', format($q$ select public.elimina_cliente(%L)::text $q$, a.client_id));
  perform pg_temp.prova('elimina_lead', format($q$ select public.elimina_lead(%L)::text $q$, a.lead_id));
  perform pg_temp.prova('elimina_persona', $q$ select public.elimina_persona('22222222-2222-4222-8222-222222222222')::text $q$);
  perform pg_temp.prova('elimina_prodotto', format($q$ select public.elimina_prodotto(%L)::text $q$, a.product_id));
  perform pg_temp.prova('elimina_rata', format($q$ select public.elimina_rata(%L)::text $q$, a.payment_id));
  perform pg_temp.prova('fissa_follow_up', format($q$ select public.fissa_follow_up(%L, public.oggi() + 1, '18:00')::text $q$, a.call_id));
  perform pg_temp.prova('giornate_closer', $q$ select count(*)::text from public.giornate_closer('2026-10-01', '2026-10-31', null) $q$);
  perform pg_temp.prova('giornate_setter', $q$ select count(*)::text from public.giornate_setter('2026-10-01', '2026-10-31', null) $q$);
  perform pg_temp.prova('incassi_clienti_setter', $q$ select count(*)::text from public.incassi_clienti_setter('2026-10-01', '2026-10-31') $q$);
  perform pg_temp.prova('inserisci_piano', $q$ select public.inserisci_piano('7f000000-0000-4000-8000-000000000001',
    '[{"scadenza":"2026-11-01","importo":300}]'::jsonb)::text $q$);
  -- the Insight (1.35.0): the admin's, or insight_puo_leggere() for insight_stato, checked first
  perform pg_temp.prova('insight_chat_messenger', $q$ select count(*)::text from public.insight_chat_messenger() $q$);
  perform pg_temp.prova('insight_dimentica', $q$ select public.insight_dimentica('instagram', 'lead.test75')::text $q$);
  perform pg_temp.prova('insight_imposta_automazione', $q$ select public.insight_imposta_automazione(true, '19:00')::text $q$);
  perform pg_temp.prova('insight_richiedi', $q$ select public.insight_richiedi()::text $q$);
  perform pg_temp.prova('insight_ruota_chiave', $q$ select public.insight_ruota_chiave()::text $q$);
  perform pg_temp.prova('insight_stato', $q$ select public.insight_stato()::text $q$);
  perform pg_temp.prova('instagram_imposta_token', $q$ select public.instagram_imposta_token('IGAAprovaDaClaude0123456789abcdefghij')::text $q$);
  perform pg_temp.prova('instagram_togli_token', $q$ select public.instagram_togli_token()::text $q$);
  perform pg_temp.prova('instagram_token_presente', $q$ select public.instagram_token_presente()::text $q$);
  perform pg_temp.prova('is_admin', $q$ select public.is_admin()::text $q$);
  perform pg_temp.prova('legge_come_admin', $q$ select public.legge_come_admin()::text $q$);
  perform pg_temp.prova('lead_appartiene_al_setter', format($q$ select public.lead_appartiene_al_setter(%L, '11111111-1111-4111-8111-111111111111')::text $q$, a.lead_id));
  -- the reel analysis (1.36.0): the roles are checked first; an OAuth token has none
  perform pg_temp.prova('marketing_analisi_richiedi', $q$ select public.marketing_analisi_richiedi('6600000000000001')::text $q$);
  perform pg_temp.prova('marketing_imposta_costo_max', $q$ select public.marketing_imposta_costo_max(30)::text $q$);
  perform pg_temp.prova('marketing_imposta_interruttori', $q$ select public.marketing_imposta_interruttori(false, false)::text $q$);
  perform pg_temp.prova('marketing_lavori_situazione', $q$ select public.marketing_lavori_situazione()::text $q$);
  perform pg_temp.prova('mcp_chi_sono', $q$ select (public.mcp_chi_sono() ->> 'esito') $q$);
  perform pg_temp.prova('mcp_client', $q$ select count(*)::text from public.mcp_client() $q$);
  perform pg_temp.prova('mcp_filtro_richiesta', $q$ select public.mcp_filtro_richiesta()::text $q$);
  perform pg_temp.prova('mcp_ruolo', $q$ select public.mcp_ruolo()::text $q$);
  perform pg_temp.prova('messenger_imposta_token', $q$ select public.messenger_imposta_token('EAAprovaDaClaude0123456789abcdefghij',
    '7500000000000001', 'Pagina Da Claude')::text $q$);
  perform pg_temp.prova('messenger_togli_token', $q$ select public.messenger_togli_token()::text $q$);
  perform pg_temp.prova('messenger_token_presente', $q$ select public.messenger_token_presente()::text $q$);
  perform pg_temp.prova('mia_foto_google', $q$ select public.mia_foto_google() $q$);
  perform pg_temp.prova('mie_vendite_setter', $q$ select count(*)::text from public.mie_vendite_setter() $q$);
  perform pg_temp.prova('miei_clienti', $q$ select count(*)::text from public.miei_clienti() $q$);
  perform pg_temp.prova('miei_numeri_periodo', $q$ select count(*)::text from public.miei_numeri_periodo('2026-10-01', '2026-10-31') $q$);
  perform pg_temp.prova('pm_assegnato', format($q$ select public.pm_assegnato(%L)::text $q$, a.task_id));
  perform pg_temp.prova('pm_coach_del_cliente', format($q$ select public.pm_coach_del_cliente(%L)::text $q$, a.client_id));
  perform pg_temp.prova('pm_crea_progetto', format($q$ select public.pm_crea_progetto(%L, 'Progetto Da Claude', null, null, null, null, null, null)::text $q$, a.reparto_id));
  perform pg_temp.prova('pm_ferma_timer', $q$ select public.pm_ferma_timer(null)::text $q$);
  perform pg_temp.prova('pm_livello_corrente', $q$ select public.pm_livello_corrente()::text $q$);
  perform pg_temp.prova('pm_membro', format($q$ select public.pm_membro(%L)::text $q$, a.progetto_id));
  perform pg_temp.prova('pm_puo_gestire', format($q$ select public.pm_puo_gestire(%L)::text $q$, a.progetto_id));
  perform pg_temp.prova('pm_puo_modificare_task', format($q$ select public.pm_puo_modificare_task(%L)::text $q$, a.task_id));
  perform pg_temp.prova('pm_puo_vedere', format($q$ select public.pm_puo_vedere(%L)::text $q$, a.progetto_id));
  perform pg_temp.prova('promemoria_percorso_interrotto', format($q$ select public.promemoria_percorso_interrotto(%L)::text $q$, a.sale_id));
  perform pg_temp.prova('puo_usare_mcp', $q$ select public.puo_usare_mcp()::text $q$);
  perform pg_temp.prova('recap_mese', $q$ select public.recap_mese('2026-10-01')::text $q$);
  perform pg_temp.prova('recap_sales', $q$ select public.recap_sales('2026-10-01', '2026-10-31')::text $q$);
  perform pg_temp.prova('segna_tutorial_visto', $q$ select public.segna_tutorial_visto()::text $q$);
  perform pg_temp.prova('unisci_profili', $q$ select public.unisci_profili('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333')::text $q$);
  perform pg_temp.prova('vede_marketing', $q$ select public.vede_marketing()::text $q$);
  -- the economics aggregates and the writes of the app (security invoker): they check the role
  perform pg_temp.prova('avanzamento_obiettivi', $q$ select count(*)::text from public.avanzamento_obiettivi('2026-10-01') $q$);
  perform pg_temp.prova('cash_mensile', $q$ select count(*)::text from public.cash_mensile(12, '2026-10-31') $q$);
  perform pg_temp.prova('commenti_setter_periodo', $q$ select count(*)::text from public.commenti_setter_periodo('2026-10-01', '2026-10-31', null, 10) $q$);
  perform pg_temp.prova('da_incassare_closer', $q$ select count(*)::text from public.da_incassare_closer() $q$);
  perform pg_temp.prova('fissa_call', $q$ select public.fissa_call('Lead Da Claude', 'organico', 'discovery', public.oggi() + 1, '18:00',
    '11111111-1111-4111-8111-111111111111', null, null)::text $q$);
  perform pg_temp.prova('metriche_per_fonte', $q$ select count(*)::text from public.metriche_per_fonte('2026-10-01', '2026-10-31') $q$);
  perform pg_temp.prova('metriche_periodo', $q$ select count(*)::text from public.metriche_periodo('2026-10-01', '2026-10-31') $q$);
  perform pg_temp.prova('metriche_setting', $q$ select count(*)::text from public.metriche_setting('2026-10-01', '2026-10-31') $q$);
  perform pg_temp.prova('motivi_non_chiusura_periodo', $q$ select count(*)::text from public.motivi_non_chiusura_periodo('2026-10-01', '2026-10-31', null, 10) $q$);
  perform pg_temp.prova('pm_tempo_per_persona', $q$ select count(*)::text from public.pm_tempo_per_persona('2026-10-01', '2026-10-31', null, null, 10) $q$);
  perform pg_temp.prova('previsione_cassa', $q$ select count(*)::text from public.previsione_cassa(3) $q$);
  perform pg_temp.prova('provvigioni_per_vendita', $q$ select count(*)::text from public.provvigioni_per_vendita(null) $q$);
  perform pg_temp.prova('registra_vendita', format($q$ select public.registra_vendita(%L, 'nuovo', public.oggi(), public.oggi(), 900, 1,
    null, null, 'Cliente', 'Da Claude', null, null, null, null, null, null, null)::text $q$, a.product_id));
  perform pg_temp.prova('vendite_da_collegare', format($q$ select count(*)::text from public.vendite_da_collegare(%L) $q$, a.call_id));
  -- the guided onboarding (1.77.0): security invoker, admin only, and never an OAuth token (an explicit
  -- guard on da_client_oauth(): 110_onboarding_avvio_gate.sql calls them inside an approved request too);
  -- onboarding_incaricato is false for every token. Invite and client are the seed's (60_onboarding.sql)
  perform pg_temp.prova('avvia_onboarding', format($q$ select public.avvia_onboarding(%L, null, null,
    '11111111-1111-4111-8111-111111111111', null, null)::text $q$, a.sale_id));
  perform pg_temp.prova('nuovo_cliente', $q$ select public.nuovo_cliente('{"nome":"Da Claude"}'::jsonb, '{}'::jsonb)::text $q$);
  perform pg_temp.prova('onboarding_conferma_pagamento', $q$ select public.onboarding_conferma_pagamento('0b0a0000-0000-4000-8000-000000000021')::text $q$);
  perform pg_temp.prova('onboarding_consenso_genitore', $q$ select public.onboarding_consenso_genitore('0b0a0000-0000-4000-8000-000000000021', null)::text $q$);
  perform pg_temp.prova('onboarding_imposta_incarichi', $q$ select public.onboarding_imposta_incarichi('0b0a0000-0000-4000-8000-000000000001',
    null, null, '11111111-1111-4111-8111-111111111111')::text $q$);
  perform pg_temp.prova('onboarding_incaricato', $q$ select public.onboarding_incaricato('0b0a0000-0000-4000-8000-000000000001')::text $q$);
  perform pg_temp.prova('onboarding_revoca', $q$ select public.onboarding_revoca('0b0a0000-0000-4000-8000-000000000021', 'Da Claude')::text $q$);
  perform pg_temp.prova('onboarding_riattiva', $q$ select public.onboarding_riattiva('0b0a0000-0000-4000-8000-000000000021')::text $q$);
  perform pg_temp.prova('onboarding_rigenera_link', $q$ select public.onboarding_rigenera_link('0b0a0000-0000-4000-8000-000000000021')::text $q$);
  -- the client's area (1.78.0): the client's functions start from cliente_corrente(), null for every OAuth
  -- token; the admin's two (security invoker) refuse it explicitly
  perform pg_temp.prova('onboarding_segna_prova', $q$ select public.onboarding_segna_prova('0b0a0000-0000-4000-8000-000000000021', true)::text $q$);
  perform pg_temp.prova('onboarding_elimina', $q$ select public.onboarding_elimina('0b0a0000-0000-4000-8000-000000000001')::text $q$);
  perform pg_temp.prova('percorso_cliente', $q$ select public.percorso_cliente()::text $q$);
  perform pg_temp.prova('percorso_avanza', $q$ select public.percorso_avanza('benvenuto', 'completa', '{}')::text $q$);
  perform pg_temp.prova('consenso_dai', $q$ select public.consenso_dai('salute', '2026-11-12')::text $q$);
  perform pg_temp.prova('video_progresso', $q$ select public.video_progresso(gen_random_uuid(), null, 100, array[int4range(0, 10)])::text $q$);
  -- the questionnaire (1.79.0): the client's functions start from cliente_corrente(); the admin's revocation
  -- (security invoker) refuses an OAuth token explicitly
  perform pg_temp.prova('questionario_cliente', $q$ select public.questionario_cliente()::text $q$);
  perform pg_temp.prova('questionario_salva', $q$ select public.questionario_salva('{}'::jsonb, 1, 0)::text $q$);
  perform pg_temp.prova('questionario_invia', $q$ select public.questionario_invia(0)::text $q$);
  perform pg_temp.prova('allegato_prepara', $q$ select public.allegato_prepara('attrezzatura', 'sbarra.jpg', 'image/jpeg', 1000)::text $q$);
  perform pg_temp.prova('allegato_togli', $q$ select public.allegato_togli('75750000-0000-4000-8000-000000000276')::text $q$);
  perform pg_temp.prova('onboarding_revoca_consenso', $q$ select public.onboarding_revoca_consenso('0b0b0000-0000-4000-8000-000000000001',
    'salute', 'Da Claude')::text $q$);
end $$;
reset role;
set local request.jwt.claims to '{}';

select is(
  (select array_agg(funzione || ' ' || esito order by funzione) from esiti_rpc),
  array[
    'aggiorna_mio_profilo 42501',
    'aggiorna_stato_lead 42501',
    'aggiungi_rata 42501',
    'allegato_prepara 42501',
    'allegato_togli 42501',
    'anteprima_eliminazione 42501',
    'avanzamento_obiettivi 42501',
    'avvia_onboarding 42501',
    'calendario_imposta_url 42501',
    'calendario_togli_url 42501',
    'calendario_url_presente 42501',
    'call_analisi_richiedi 42501',
    'call_ha_follow_up ok:null',
    'call_ha_vendita ok:null',
    'call_imposta_costo_max 42501',
    'call_imposta_interruttori 42501',
    'call_lavori_situazione 42501',
    'call_numeri_periodo 42501',
    'cash_mensile 42501',
    'collega_registrazione 42501',
    'commenti_setter_periodo 42501',
    'consenso_dai 42501',
    'current_role ok:null',
    'da_incassare_closer 42501',
    'decidi_performance 42501',
    'elimina_call 42501',
    'elimina_cliente 42501',
    'elimina_lead 42501',
    'elimina_persona 42501',
    'elimina_prodotto 42501',
    'elimina_rata 42501',
    'fathom_chiave_presente 42501',
    'fathom_imposta_chiave 42501',
    'fathom_togli_chiave 42501',
    'fissa_call 42501',
    'fissa_follow_up 42501',
    'giornate_closer 42501',
    'giornate_setter 42501',
    'incassi_clienti_setter 42501',
    'inserisci_piano 42501',
    'insight_chat_messenger 42501',
    'insight_dimentica 42501',
    'insight_imposta_automazione 42501',
    'insight_richiedi 42501',
    'insight_ruota_chiave 42501',
    'insight_stato 42501',
    'instagram_imposta_token 42501',
    'instagram_togli_token 42501',
    'instagram_token_presente 42501',
    'is_admin ok:false',
    'lead_appartiene_al_setter ok:false',
    'legge_come_admin ok:false',
    'marketing_analisi_richiedi 42501',
    'marketing_imposta_costo_max 42501',
    'marketing_imposta_interruttori 42501',
    'marketing_lavori_situazione 42501',
    'marketing_spunti_richiedi 42501',
    'mcp_chi_sono ok:ok',
    'mcp_client ok:0',
    'mcp_filtro_richiesta 42501',
    'mcp_ruolo ok:admin',
    'messenger_imposta_token 42501',
    'messenger_togli_token 42501',
    'messenger_token_presente 42501',
    'metriche_per_fonte 42501',
    'metriche_periodo 42501',
    'metriche_setting 42501',
    'mia_foto_google ok:null',
    'mie_vendite_setter 42501',
    'miei_clienti ok:0',
    'miei_numeri_periodo 42501',
    'motivi_non_chiusura_periodo 42501',
    'nuovo_cliente 42501',
    'onboarding_conferma_pagamento 42501',
    'onboarding_consenso_genitore 42501',
    'onboarding_elimina 42501',
    'onboarding_imposta_incarichi 42501',
    'onboarding_incaricato ok:false',
    'onboarding_revoca 42501',
    'onboarding_revoca_consenso 42501',
    'onboarding_riattiva 42501',
    'onboarding_rigenera_link 42501',
    'onboarding_segna_prova 42501',
    'percorso_avanza 42501',
    'percorso_cliente 42501',
    'pm_assegnato ok:false',
    'pm_coach_del_cliente ok:false',
    'pm_crea_progetto 42501',
    'pm_ferma_timer 42501',
    'pm_livello_corrente ok:null',
    'pm_membro ok:false',
    'pm_puo_gestire ok:false',
    'pm_puo_modificare_task ok:false',
    'pm_puo_vedere ok:false',
    'pm_tempo_per_persona 42501',
    'prenotate_per_giorno 42501',
    'previsione_cassa 42501',
    'promemoria_percorso_interrotto 42501',
    'provvigioni_per_vendita 42501',
    'puo_usare_mcp ok:false',
    'questionario_cliente 42501',
    'questionario_invia 42501',
    'questionario_salva 42501',
    'recap_mese 42501',
    'recap_sales 42501',
    'registra_vendita 42501',
    'scollega_registrazione 42501',
    'segna_tutorial_visto 42501',
    'setting_contatti 42501',
    'spunti_per_claude ok:true',
    'unisci_profili 42501',
    'vede_marketing ok:true',
    'vendite_da_collegare 42501',
    'video_progresso 42501'
  ],
  'token di Claude dell''admin: ogni funzione rifiuta, o non risponde niente, o parla solo di chi chiama'
);
-- Every reachable security definer function was tried above: a new one fails
-- here (and in 00_schema.sql) until it gets its line and its outcome
select is(
  (select coalesce(string_agg(p.proname::text collate "default", ', ' order by p.proname::text collate "default"), '')
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.prosecdef
     and p.prorettype <> 'trigger'::regtype
     and has_function_privilege('authenticated', p.oid, 'execute')
     and p.proname::text collate "default" not in (select funzione from esiti_rpc)),
  '',
  'ogni funzione security definer raggiungibile è provata col token di Claude'
);
select is(
  (select row(
     (select count(*) from public.payments where sale_id = '7f000000-0000-4000-8000-000000000001'),
     (select count(*) from public.pm_progetti) = (select progetti from prima),
     (select count(*) from public.payments) = (select rate from prima),
     exists (select 1 from public.pm_tempo where profile_id = '11111111-1111-4111-8111-111111111111'
               and inizio is not null and fine is null),
     (select tutorial_visto from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
     (select nome from public.profiles where id = '11111111-1111-4111-8111-111111111111'))::text),
  '(0,t,t,t,f,"Dany Montagnolo")',
  'nessuna scrittura: nessun piano rate, nessun progetto, il timer corre, il tutorial resta da vedere, il nome resta'
);
select pg_temp.come_web('11111111-1111-4111-8111-111111111111');
select is(public.mia_foto_google(), 'https://lh3.googleusercontent.com/a/dany',
  'web, admin: la sua foto di Google, come prima');
reset role;
set local request.jwt.claims to '{}';

-- ---------------------------------------------------------------------------
-- 8. The calendar by role
-- ---------------------------------------------------------------------------
-- admin, video editor, marketing: read, insert, update, sections
select pg_temp.come_oauth('11111111-1111-4111-8111-111111111111', '7c000000-0000-4000-8000-000000000001',
  '7e000000-0000-4000-8000-000000000001');
select ok((select count(*) from public.marketing_contenuti) > 0, 'Claude dell''admin legge il calendario');
select lives_ok($$ insert into public.marketing_contenuti (id, nome) values ('7d000000-0000-4000-8000-000000000001', 'MCP 75 admin') $$,
  'crea un contenuto');
select is(pg_temp.modifica('7d000000-0000-4000-8000-000000000001'), 1, 'lo modifica');
select is(
  public.salva_sezione_contenuto('7d000000-0000-4000-8000-000000000001', 'finale', 'Testo da Claude', md5('')) ->> 'esito',
  'salvata',
  'ne scrive una sezione'
);

-- The labels of Reel Type and Format (20261024090000): read yes, write never, not even through the RPC
create or replace function pg_temp.opzioni_toccate(p_sql text)
returns integer
language plpgsql
as $f$
declare
  n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$f$;
select ok((select count(*) from public.marketing_opzioni) >= 15, 'Claude dell''admin legge le etichette di Reel Type e Format');
select throws_ok($$ insert into public.marketing_opzioni (campo, valore, nome) values ('formato', 'da_claude', 'Da Claude') $$,
  '42501', null, 'ma non ne crea una');
select is(pg_temp.opzioni_toccate($$ update public.marketing_opzioni set nome = 'Da Claude' where valore = 'split' $$), 0,
  'né ne rinomina una');
select is(pg_temp.opzioni_toccate($$ delete from public.marketing_opzioni where valore = 'radio' $$), 0,
  'né ne elimina una');
select throws_ok($$ select public.crea_opzione_marketing('formato', 'Da Claude') $$, '42501', null,
  'e la funzione che le crea è rifiutata dalla policy');

select pg_temp.come_oauth('55555555-5555-4555-8555-555555555555', '7c000000-0000-4000-8000-000000000001',
  '7e000000-0000-4000-8000-000000000002');
select ok((select count(*) from public.marketing_contenuti) > 0, 'Claude del video editor legge il calendario');
select lives_ok($$ insert into public.marketing_contenuti (id, nome) values ('7d000000-0000-4000-8000-000000000002', 'MCP 75 editor') $$,
  'crea un contenuto');
select is(pg_temp.modifica('7d000000-0000-4000-8000-000000000002'), 1, 'lo modifica');
select is(
  public.salva_sezione_contenuto('7d000000-0000-4000-8000-000000000002', 'finale', 'Testo da Claude', md5('')) ->> 'esito',
  'salvata',
  'ne scrive una sezione'
);

select pg_temp.come_oauth('61616161-6161-4161-8161-616161616161', '7c000000-0000-4000-8000-000000000001',
  '7e000000-0000-4000-8000-000000000003');
select ok((select count(*) from public.marketing_contenuti) > 0, 'Claude del marketing legge il calendario');
select lives_ok($$ insert into public.marketing_contenuti (id, nome) values ('7d000000-0000-4000-8000-000000000003', 'MCP 75 marketing') $$,
  'crea un contenuto');
select is(pg_temp.modifica('7d000000-0000-4000-8000-000000000003'), 1, 'lo modifica');
select is(
  public.salva_sezione_contenuto('7d000000-0000-4000-8000-000000000003', 'finale', 'Testo da Claude', md5('')) ->> 'esito',
  'salvata',
  'ne scrive una sezione'
);

-- Delete: from Claude only the admin (Dany, 09/10/2026)
select is(pg_temp.elimina('7d000000-0000-4000-8000-000000000002'), 0, 'Claude del marketing non elimina');
select pg_temp.come_oauth('55555555-5555-4555-8555-555555555555', '7c000000-0000-4000-8000-000000000001',
  '7e000000-0000-4000-8000-000000000002');
select is(pg_temp.elimina('7d000000-0000-4000-8000-000000000003'), 0, 'né quello del video editor');
select pg_temp.come_oauth('11111111-1111-4111-8111-111111111111', '7c000000-0000-4000-8000-000000000001',
  '7e000000-0000-4000-8000-000000000001');
select is(pg_temp.elimina('7d000000-0000-4000-8000-000000000001'), 1, 'Claude dell''admin elimina');
-- Author trigger: an OAuth admin is not is_admin(), so the row is his and has no Notion page
select lives_ok($$ insert into public.marketing_contenuti (id, nome, created_by, notion_page_id)
  values ('7d000000-0000-4000-8000-000000000004', 'MCP 75 autore', '22222222-2222-4222-8222-222222222222',
          '7d000000-0000-4000-8000-0000000000ff') $$,
  'Claude dell''admin crea un contenuto dicendo un altro autore e una pagina Notion');
reset role;
set local request.jwt.claims to '{}';
select is(
  (select row(created_by, notion_page_id)::text from public.marketing_contenuti where id = '7d000000-0000-4000-8000-000000000004'),
  '(11111111-1111-4111-8111-111111111111,)',
  'resta suo e senza pagina Notion'
);
select is(
  (select count(*)::int from public.marketing_contenuti
   where id in ('7d000000-0000-4000-8000-000000000002', '7d000000-0000-4000-8000-000000000003')),
  2,
  'i contenuti che marketing e video editor hanno provato a eliminare ci sono ancora'
);
select pg_temp.come_web('61616161-6161-4161-8161-616161616161');
select is(pg_temp.elimina('7d000000-0000-4000-8000-000000000003'), 1, 'dall''app il marketing elimina, come prima');

-- The posts of Instagram (1.33.0): Claude empties the URL of a content linked to a post like a
-- person of the app; the "no" for that pair is written by the trigger (security definer), while
-- the posts' tables stay closed to the token
reset role;
set local request.jwt.claims to '{}';
update public.marketing_contenuti set url = 'https://www.instagram.com/reel/Test66Post1/'
where id = '66660000-0000-4000-8000-000000000066';
select pg_temp.come_oauth('11111111-1111-4111-8111-111111111111', '7c000000-0000-4000-8000-000000000001',
  '7e000000-0000-4000-8000-000000000001');
select is(pg_temp.togli_url('66660000-0000-4000-8000-000000000066'), 1,
  'Claude dell''admin toglie l''URL di un contenuto collegato a un post');
select is((select count(*)::int from public.marketing_abbinamenti_rifiutati), 0, 'e i no non li legge');
reset role;
set local request.jwt.claims to '{}';
select ok(
  exists (select 1 from public.marketing_abbinamenti_rifiutati
          where shortcode = 'Test66Post1' and contenuto_id = '66660000-0000-4000-8000-000000000066'),
  'il no per quella coppia lo scrive il trigger, come per un tocco nell''app'
);

-- Not allowed: setter, closer, coach, a deactivated marketing account
select pg_temp.come_oauth('22222222-2222-4222-8222-222222222222', '7c000000-0000-4000-8000-000000000001',
  '7e000000-0000-4000-8000-000000000004');
select is((select count(*)::int from public.marketing_contenuti), 0, 'Claude del setter: nessun contenuto');
select throws_ok($$ insert into public.marketing_contenuti (nome) values ('MCP 75 setter') $$, '42501', null,
  'e non ne crea');
select pg_temp.come_oauth('33333333-3333-4333-8333-333333333333', '7c000000-0000-4000-8000-000000000001',
  '7e000000-0000-4000-8000-000000000005');
select is((select count(*)::int from public.marketing_contenuti), 0, 'Claude del closer: nessun contenuto');
select throws_ok($$ insert into public.marketing_contenuti (nome) values ('MCP 75 closer') $$, '42501', null,
  'e non ne crea');
select pg_temp.come_oauth('44444444-4444-4444-8444-444444444444', '7c000000-0000-4000-8000-000000000001',
  '7e000000-0000-4000-8000-000000000006');
select is((select count(*)::int from public.marketing_contenuti), 0, 'Claude del coach: nessun contenuto');
select throws_ok($$ insert into public.marketing_contenuti (nome) values ('MCP 75 coach') $$, '42501', null,
  'e non ne crea');
select pg_temp.come_oauth('99999999-9999-4999-8999-999999990075', '7c000000-0000-4000-8000-000000000001',
  '7e000000-0000-4000-8000-000000000007');
select is((select count(*)::int from public.marketing_contenuti), 0, 'Claude di un marketing disattivato: nessun contenuto');
select throws_ok($$ insert into public.marketing_contenuti (nome) values ('MCP 75 disattivato') $$, '42501', null,
  'e non ne crea');

-- ---------------------------------------------------------------------------
-- 9. The OAuth session: access ends with it
-- ---------------------------------------------------------------------------
select pg_temp.come_oauth('61616161-6161-4161-8161-616161616161', '7c000000-0000-4000-8000-000000000002',
  '7e000000-0000-4000-8000-000000000008');
select ok((select count(*) from public.marketing_contenuti) > 0, 'Claude Code del marketing legge il calendario');
reset role;
set local request.jwt.claims to '{}';
delete from auth.sessions where id = '7e000000-0000-4000-8000-000000000008';
select pg_temp.come_oauth('61616161-6161-4161-8161-616161616161', '7c000000-0000-4000-8000-000000000002',
  '7e000000-0000-4000-8000-000000000008');
select is((select count(*)::int from public.marketing_contenuti), 0, 'sessione eliminata (Scollega): subito niente');

select pg_temp.come_oauth('61616161-6161-4161-8161-616161616161', '7c000000-0000-4000-8000-000000000006',
  '7e000000-0000-4000-8000-000000000012');
select ok((select count(*) from public.marketing_contenuti) > 0, 'un client registrato a mano: legge');
reset role;
set local request.jwt.claims to '{}';
update auth.oauth_clients set deleted_at = now() where id = '7c000000-0000-4000-8000-000000000006';
select pg_temp.come_oauth('61616161-6161-4161-8161-616161616161', '7c000000-0000-4000-8000-000000000006',
  '7e000000-0000-4000-8000-000000000012');
select is((select count(*)::int from public.marketing_contenuti), 0, 'client eliminato nella dashboard: subito niente');

select pg_temp.come_oauth('61616161-6161-4161-8161-616161616161', '7c000000-0000-4000-8000-000000000003',
  '7e000000-0000-4000-8000-000000000009');
select is((select count(*)::int from public.marketing_contenuti), 0, 'un client registrato da solo (dinamico): niente');
select pg_temp.come_oauth('61616161-6161-4161-8161-616161616161', '7c000000-0000-4000-8000-000000000001',
  '7e000000-0000-4000-8000-000000000011');
select is((select count(*)::int from public.marketing_contenuti), 0, 'una sessione scaduta (not_after passato): niente');
select pg_temp.come_oauth('61616161-6161-4161-8161-616161616161', '7c000000-0000-4000-8000-000000000002',
  '7e000000-0000-4000-8000-000000000003');
select is((select count(*)::int from public.marketing_contenuti), 0, 'client del token diverso da quello della sessione: niente');
select pg_temp.come_oauth('61616161-6161-4161-8161-616161616161', '7c000000-0000-4000-8000-000000000001',
  '7e000000-0000-4000-8000-000000000002');
select is((select count(*)::int from public.marketing_contenuti), 0, 'la sessione di un''altra persona: niente');
select pg_temp.come_oauth('61616161-6161-4161-8161-616161616161', 'abc', '7e000000-0000-4000-8000-000000000003');
select lives_ok($$ select count(*) from public.marketing_contenuti $$, 'un client_id che non è un uuid non dà errore');
select is((select count(*)::int from public.marketing_contenuti), 0, 'e non legge niente');

-- ---------------------------------------------------------------------------
-- 10. mcp_chi_sono(): the route's question
-- ---------------------------------------------------------------------------
select pg_temp.come_web('61616161-6161-4161-8161-616161616161');
select is(public.mcp_chi_sono(), '{"esito":"non_oauth"}'::jsonb, 'sessione web: non_oauth');
select pg_temp.come_oauth('61616161-6161-4161-8161-616161616161', '7c000000-0000-4000-8000-000000000003',
  '7e000000-0000-4000-8000-000000000009');
select is(public.mcp_chi_sono(), '{"esito":"sessione"}'::jsonb, 'sessione che non vale: sessione');
select pg_temp.come_oauth('22222222-2222-4222-8222-222222222222', '7c000000-0000-4000-8000-000000000001',
  '7e000000-0000-4000-8000-000000000004');
select is(public.mcp_chi_sono() - 'filtro', '{"esito":"ok","ruolo":"setter","livello":"employee"}'::jsonb,
  'setter: ok dal 22/10/2026, con il suo livello nei progetti');
select pg_temp.come_oauth('99999999-9999-4999-8999-999999990075', '7c000000-0000-4000-8000-000000000001',
  '7e000000-0000-4000-8000-000000000007');
select is(public.mcp_chi_sono(), '{"esito":"ruolo"}'::jsonb, 'marketing disattivato: ruolo');
-- the flag lives until the end of the transaction: reset before every case that expects false
select set_config('alpha.mcp_filtro', '', true);
select pg_temp.come_oauth('61616161-6161-4161-8161-616161616161', '7c000000-0000-4000-8000-000000000001',
  '7e000000-0000-4000-8000-000000000003');
select is(public.mcp_chi_sono(), '{"esito":"ok","ruolo":"marketing","livello":"employee","filtro":false}'::jsonb,
  'marketing senza il filtro sulla richiesta: ok, ma filtro falso (la route risponde 503)');
select is(pg_temp.filtro('/rpc/mcp_chi_sono', 'POST'), 'passa', 'il filtro lascia passare la domanda');
select is(public.mcp_chi_sono(), '{"esito":"ok","ruolo":"marketing","livello":"employee","filtro":true}'::jsonb,
  'dopo il filtro, nella stessa richiesta: filtro vero');
select set_config('alpha.mcp_filtro', '', true);
select pg_temp.come_web('61616161-6161-4161-8161-616161616161');
select is(
  pg_temp.filtro('/profiles', 'GET') || ' ' || coalesce(current_setting('alpha.mcp_filtro', true), ''),
  'passa ',
  'una sessione web passa il filtro e non alza mai il segnale'
);

-- ---------------------------------------------------------------------------
-- 11. mcp_filtro_richiesta(): what an OAuth token may reach through the Data API
-- ---------------------------------------------------------------------------
select pg_temp.come_web('11111111-1111-4111-8111-111111111111');
select is(
  array[pg_temp.filtro('/profiles', 'GET'), pg_temp.filtro('rpc/metriche_periodo', 'POST'), pg_temp.filtro(null, null)],
  array['passa', 'passa', 'passa'],
  'web: passa tutto, anche senza le impostazioni della richiesta'
);
reset role;
set local request.jwt.claims to '{"role":"anon"}';
set local role anon;
select is(pg_temp.filtro('/profiles', 'GET'), 'passa', 'anon passa');
reset role;
set local request.jwt.claims to '{"role":"service_role"}';
set local role service_role;
select is(pg_temp.filtro('/profiles', 'GET'), 'passa', 'service_role passa');
reset role;
set local request.jwt.claims to '{}';

select pg_temp.come_oauth('61616161-6161-4161-8161-616161616161', '7c000000-0000-4000-8000-000000000001',
  '7e000000-0000-4000-8000-000000000003');
select is(
  array[
    pg_temp.filtro('/marketing_contenuti', 'GET'), pg_temp.filtro('marketing_contenuti', 'GET'),
    pg_temp.filtro('/marketing_contenuti', 'HEAD'), pg_temp.filtro('marketing_contenuti', 'HEAD'),
    pg_temp.filtro('/marketing_contenuti', 'POST'), pg_temp.filtro('marketing_contenuti', 'POST'),
    pg_temp.filtro('/marketing_contenuti', 'PATCH'), pg_temp.filtro('marketing_contenuti', 'PATCH'),
    pg_temp.filtro('/marketing_contenuti', 'DELETE'), pg_temp.filtro('marketing_contenuti', 'DELETE'),
    pg_temp.filtro('/marketing_contenuti', 'GET', '{"accept-profile":"public"}'),
    pg_temp.filtro('/rpc/salva_sezione_contenuto', 'POST', '{"content-profile":"public"}'),
    pg_temp.filtro('/rpc/mcp_chi_sono', 'GET'), pg_temp.filtro('/rpc/mcp_chi_sono', 'POST')
  ],
  array['passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa', 'passa',
        'passa', 'passa', 'passa', 'passa'],
  'token di Claude: passano il calendario (GET, HEAD, POST, PATCH, DELETE), salva_sezione_contenuto in POST e mcp_chi_sono'
);
select is(
  array[
    pg_temp.filtro('/marketing_opzioni', 'GET'), pg_temp.filtro('marketing_opzioni', 'GET'),
    pg_temp.filtro('/marketing_opzioni', 'HEAD'), pg_temp.filtro('/marketing_opzioni', 'POST'),
    pg_temp.filtro('/marketing_opzioni', 'PATCH'), pg_temp.filtro('/marketing_opzioni', 'DELETE'),
    pg_temp.filtro('/rpc/crea_opzione_marketing', 'POST'), pg_temp.filtro('/rpc/conteggi_opzioni_marketing', 'POST')
  ],
  array['passa', 'passa', 'passa', '42501', '42501', '42501', '42501', '42501'],
  'token di Claude: le etichette solo in lettura (GET, HEAD), mai scritte né create dalla funzione'
);
select is(
  array[
    pg_temp.filtro('/calls', 'GET'),
    pg_temp.filtro('/rpc/metriche_periodo', 'POST'),
    pg_temp.filtro('/rpc/graphql', 'POST', '{"content-profile":"graphql_public"}'),
    pg_temp.filtro('/rpc/salva_sezione_contenuto', 'GET'),
    pg_temp.filtro('/marketing_contenuti', 'PUT'),
    pg_temp.filtro('/marketing_contenuti', 'GET', '{"accept-profile":"graphql_public"}'),
    pg_temp.filtro('/marketing_contenuti', 'POST', '{"accept-profile":"public","content-profile":"graphql_public"}'),
    pg_temp.filtro('/', 'GET'),
    pg_temp.filtro('', 'GET'),
    pg_temp.filtro(null, null),
    pg_temp.filtro('/marketing_contenuti/', 'GET'),
    pg_temp.filtro('/clients', 'GET'),
    pg_temp.filtro('/rpc/inserisci_piano', 'POST')
  ],
  array['42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501',
        '42501', '42501', '42501'],
  'token di Claude: tutto il resto no (call, metriche, GraphQL, un altro schema, PUT, la radice OpenAPI, clienti, le RPC)'
);
select set_config('request.path', '/calls', true), set_config('request.method', 'GET', true),
  set_config('request.headers', '{}', true);
select throws_ok($$ select public.mcp_filtro_richiesta() $$, '42501',
  'Questa parte del gestionale non è raggiungibile da Claude.',
  'il rifiuto lo dice in italiano');
-- Defence in depth for the areas of the later phases (22/10/2026): inside a request the filter
-- approved current_role() names the token's person, so every reachable security definer RPC that is
-- not on the allow-list must be refused by the filter itself, whatever the method
select is(
  (select coalesce(string_agg(p.proname::text collate "default", ', ' order by p.proname::text collate "default"), '')
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and has_function_privilege('authenticated', p.oid, 'execute')
     and p.prorettype <> 'trigger'::regtype
     and p.proname::text not in (
       -- the allow-list: the calendar, the route's question, projects, lists, tasks and time
       'salva_sezione_contenuto', 'spunti_per_claude', 'mcp_chi_sono', 'pm_crea_progetto', 'pm_scegli_coach',
       'pm_imposta_assegnatari', 'pm_registra_tempo', 'pm_modifica_tempo', 'pm_avvia_timer', 'pm_ferma_timer',
       'pm_mio_tempo_per_task', 'pm_riepilogo_tempo', 'pm_tempo_per_persona', 'pm_timer_attivo')
     -- the call tools (phase 2, 20261029090000) pass only for admin, setter and closer:
     -- for this marketing token they are refused like the rest (102_mcp_call_lead.sql tests them by role)
     and (pg_temp.filtro('/rpc/' || p.proname, 'POST') <> '42501'
          or pg_temp.filtro('/rpc/' || p.proname, 'GET') <> '42501')),
  '',
  'token di Claude: il filtro rifiuta ogni altra funzione (economia, call, Insight, Fathom, team), in GET e in POST'
);
select is(
  array[
    pg_temp.filtro('/calls', 'GET'), pg_temp.filtro('/leads', 'GET'), pg_temp.filtro('/sales', 'GET'),
    pg_temp.filtro('/payments', 'GET'), pg_temp.filtro('/expenses', 'GET'), pg_temp.filtro('/commission_rules', 'GET'),
    pg_temp.filtro('/commission_payouts', 'GET'), pg_temp.filtro('/clients', 'GET'),
    pg_temp.filtro('/setter_daily_reports', 'GET'), pg_temp.filtro('/pm_task', 'DELETE'),
    pg_temp.filtro('/pm_tempo', 'POST'), pg_temp.filtro('/pm_note', 'PATCH'), pg_temp.filtro('/profiles', 'PATCH')
  ],
  array['42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501',
        '42501', '42501', '42501'],
  'token di Claude del marketing: call e lead (fase 2, non del suo ruolo) e le aree delle fasi successive restano chiuse, e niente si elimina dai progetti'
);
reset role;
set local request.jwt.claims to '{}';

-- ---------------------------------------------------------------------------
-- 12. mcp_client() and puo_usare_mcp(): the card «Collega Claude»
-- ---------------------------------------------------------------------------
select pg_temp.come_web('11111111-1111-4111-8111-111111111111');
select is(
  (select array_agg(tipo || ' ' || nome || ' ' || client_id::text order by tipo) from public.mcp_client()),
  array['claude Claude 7c000000-0000-4000-8000-000000000001',
        'claude_code Claude Code (prova) 7c000000-0000-4000-8000-000000000002'],
  'web, admin: i due client registrati a mano e pubblici, riconosciuti dall''indirizzo di ritorno (mai il dinamico, l''eliminato o il riservato)'
);
select pg_temp.come_web('55555555-5555-4555-8555-555555555555');
select is((select array_agg(tipo order by tipo) from public.mcp_client()), array['claude', 'claude_code'],
  'web, video editor: gli stessi');
select pg_temp.come_web('61616161-6161-4161-8161-616161616161');
select is((select array_agg(tipo order by tipo) from public.mcp_client()), array['claude', 'claude_code'],
  'web, marketing: gli stessi');
select pg_temp.come_web('22222222-2222-4222-8222-222222222222');
select is((select array_agg(tipo order by tipo) from public.mcp_client()), array['claude', 'claude_code'],
  'web, setter: gli stessi, dal 22/10/2026');
select is(
  array[
    pg_temp.puo('11111111-1111-4111-8111-111111111111'),
    pg_temp.puo('55555555-5555-4555-8555-555555555555'),
    pg_temp.puo('61616161-6161-4161-8161-616161616161'),
    pg_temp.puo('22222222-2222-4222-8222-222222222222'),
    pg_temp.puo('33333333-3333-4333-8333-333333333333'),
    pg_temp.puo('44444444-4444-4444-8444-444444444444'),
    pg_temp.puo('99999999-9999-4999-8999-999999990175'),
    pg_temp.puo('99999999-9999-4999-8999-999999990275'),
    pg_temp.puo('99999999-9999-4999-8999-999999990075'),
    pg_temp.puo('61616161-6161-4161-8161-616161616161', '7c000000-0000-4000-8000-000000000001',
                '7e000000-0000-4000-8000-000000000003')
  ],
  array[true, true, true, true, true, true, true, true, false, false],
  'collegano Claude tutti i ruoli attivi, dall''app (22/10/2026): mai un account disattivato o un token di Claude'
);
reset role;
set local request.jwt.claims to '{}';

-- ---------------------------------------------------------------------------
-- 13. foto_google(): only Google's photo hosts
-- ---------------------------------------------------------------------------
select is(
  array[
    public.foto_google('{"avatar_url":"https://lh3.googleusercontent.com/a/x"}'),
    public.foto_google('{"picture":"https://lh3.googleusercontent.com/a/y"}'),
    public.foto_google('{"avatar_url":"https://evil.example/x.png"}'),
    public.foto_google('{"avatar_url":"http://lh3.googleusercontent.com/x"}'),
    public.foto_google('{"avatar_url":"https://lh3.googleusercontent.com.evil.example/x"}')
  ],
  array['https://lh3.googleusercontent.com/a/x', 'https://lh3.googleusercontent.com/a/y', null, null, null],
  'la foto di Google viene solo dai server delle foto di Google, in https'
);

select * from finish();
rollback;
