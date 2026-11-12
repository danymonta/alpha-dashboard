-- Guided onboarding, release A (1.77.0, 20261108090000_onboarding_dati.sql and
-- 20261108090100_onboarding_progetto.sql): the data and who reads it. The admin reads and writes; setter,
-- closer, a coach who is not in charge, video editor, marketing, business coach and Claude's token (the
-- admin's too) read nothing and write nothing; a person in charge reads only their own row of the
-- incarichi, and the path (with its steps, and Telegram for the coach) only once the client has
-- registered: never an invite, a token, an event, the settings, nor the state of the payment.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(68);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Seed: admin 1111, setter 2222, closer 3333, coach 4444, editor 5555,
-- marketing 6161, business coach bc00. One invented client in onboarding: Marco Coach is his coach,
-- the closer his reviewer, the admin his responsible. A second coach is in charge of nobody.
-- ---------------------------------------------------------------------------
insert into auth.oauth_clients (id, client_name, registration_type, client_type, redirect_uris,
  grant_types, token_endpoint_auth_method, deleted_at)
values ('9c000000-0000-4000-8000-000000000109', 'Claude', 'manual', 'public',
  'https://claude.ai/api/mcp/auth_callback', 'authorization_code,refresh_token', 'none', null);
insert into auth.sessions (id, user_id, created_at, updated_at, aal, oauth_client_id, not_after)
values ('9e109000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', now(), now(), 'aal1',
  '9c000000-0000-4000-8000-000000000109', null);

insert into public.invites (email, ruolo) values ('coach109@alpha.test', 'coach');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999990109',
  'authenticated', 'authenticated', 'coach109@alpha.test', '', now(),
  '{}'::jsonb, '{"full_name":"Carlo Centonove"}'::jsonb, now(), now(), '', '', '', '');

insert into public.clients (id, nome, cognome, created_by)
values ('c1090000-0000-4000-8000-000000000001', 'Ilario', 'Centonove', '11111111-1111-4111-8111-111111111111');
insert into public.sales (id, client_id, product_id, tipo, closer_id, data_vendita, data_inizio, valore_contratto,
  numero_rate, created_by)
select 'c1090000-0000-4000-8000-000000000011', 'c1090000-0000-4000-8000-000000000001', p.id, 'nuovo',
  '11111111-1111-4111-8111-111111111111', public.oggi(), public.oggi() + 7, 2400, 3, '11111111-1111-4111-8111-111111111111'
from public.products p order by p.created_at limit 1;
-- a renewal of a seed client: never the start of an onboarding
insert into public.sales (id, client_id, product_id, tipo, closer_id, data_vendita, data_inizio, valore_contratto,
  numero_rate, created_by)
select 'c1090000-0000-4000-8000-000000000012', s.client_id, s.product_id, 'rinnovo',
  '11111111-1111-4111-8111-111111111111', public.oggi(), public.oggi() + 7, 900, 1, '11111111-1111-4111-8111-111111111111'
from public.sales s
where s.product_id is not null
  and not exists (select 1 from public.onboarding_inviti i where i.client_id = s.client_id)
order by s.created_at limit 1;

insert into public.onboarding_incarichi (client_id, coach_id, revisore_id, responsabile_id)
values ('c1090000-0000-4000-8000-000000000001', '44444444-4444-4444-8444-444444444444',
  '33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111');
insert into public.clienti_telegram (client_id, username)
values ('c1090000-0000-4000-8000-000000000001', ' @Ilario_109 ');
insert into public.onboarding_inviti (id, client_id, sale_id, slug, token_hash)
values ('c1090000-0000-4000-8000-000000000021', 'c1090000-0000-4000-8000-000000000001',
  'c1090000-0000-4000-8000-000000000011', 'ilario-centonove', encode(sha256(convert_to(repeat('ab', 32), 'UTF8')), 'hex'));
insert into public.onboarding_inviti_token (invito_id, token)
values ('c1090000-0000-4000-8000-000000000021', repeat('ab', 32));

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

-- The admin's token of Claude; p_dentro: inside a request the Data API filter approved, where
-- current_role() names its person
create or replace function pg_temp.claude(p_dentro boolean default false)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated',
    'client_id', '9c000000-0000-4000-8000-000000000109',
    'session_id', '9e109000-0000-4000-8000-000000000001')::text, true);
  perform set_config('alpha.mcp_filtro', case when p_dentro then 'on' else '' end, true);
  perform set_config('request.path', '', true);
  set local role authenticated;
end;
$$;

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

-- What the current identity reads of the onboarding: 'relation n' for every relation with rows (or its
-- SQLSTATE), '' when it reads nothing at all
create or replace function pg_temp.vede()
returns text
language plpgsql
as $$
declare
  r text;
  n bigint;
  viste text[] := '{}';
begin
  foreach r in array array[
    'onboarding_impostazioni', 'onboarding_incarichi', 'onboarding_inviti', 'onboarding_inviti_token',
    'onboarding_percorsi', 'onboarding_passi_def', 'onboarding_passi', 'onboarding_eventi', 'clienti_telegram',
    'v_onboarding', 'v_vendite_senza_onboarding'
  ] loop
    begin
      execute format('select count(*) from public.%I', r) into n;
      if n > 0 then
        viste := viste || (r || ' ' || n);
      end if;
    exception when others then
      viste := viste || (r || ' ' || sqlstate);
    end;
  end loop;
  return array_to_string(viste, ', ');
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::int from pg_tables where schemaname = 'public' and tablename in (
     'onboarding_impostazioni', 'onboarding_incarichi', 'onboarding_inviti', 'onboarding_inviti_token',
     'onboarding_percorsi', 'onboarding_passi_def', 'onboarding_passi', 'onboarding_eventi', 'clienti_telegram')),
  9, 'le nove tabelle dell''onboarding esistono'
);
select policies_are('public', 'onboarding_impostazioni', array[
  'onboarding_impostazioni_admin_lettura', 'onboarding_impostazioni_admin_modifica', 'onboarding_impostazioni_mai_da_oauth'
], 'impostazioni: l''admin legge e modifica, mai Claude');
select policies_are('public', 'onboarding_incarichi', array[
  'onboarding_incarichi_admin_lettura', 'onboarding_incarichi_admin_inserimento', 'onboarding_incarichi_admin_modifica',
  'onboarding_incarichi_incaricato_lettura', 'onboarding_incarichi_mai_da_oauth'
], 'incarichi: l''admin scrive, l''incaricato legge la sua riga');
select policies_are('public', 'onboarding_inviti', array[
  'onboarding_inviti_admin_lettura', 'onboarding_inviti_admin_inserimento', 'onboarding_inviti_admin_modifica',
  -- 1.78.0: the admin deletes an invite only through onboarding_elimina (its trigger refuses the rest)
  'onboarding_inviti_admin_eliminazione', 'onboarding_inviti_mai_da_oauth'
], 'inviti: solo l''admin');
select policies_are('public', 'onboarding_inviti_token', array[
  'onboarding_inviti_token_admin_lettura', 'onboarding_inviti_token_admin_inserimento', 'onboarding_inviti_token_mai_da_oauth'
], 'token: solo l''admin');
select policies_are('public', 'onboarding_percorsi', array[
  'onboarding_percorsi_admin_lettura', 'onboarding_percorsi_incaricato_lettura', 'onboarding_percorsi_mai_da_oauth'
], 'percorsi: l''admin, e l''incaricato dalla registrazione in poi');
select policies_are('public', 'onboarding_passi_def', array[
  'onboarding_passi_def_admin_lettura', 'onboarding_passi_def_mai_da_oauth'
], 'definizione degli step: l''admin');
select policies_are('public', 'onboarding_passi', array[
  'onboarding_passi_admin_lettura', 'onboarding_passi_incaricato_lettura', 'onboarding_passi_mai_da_oauth'
], 'step: come i percorsi');
select policies_are('public', 'onboarding_eventi', array[
  'onboarding_eventi_admin_lettura', 'onboarding_eventi_admin_inserimento', 'onboarding_eventi_mai_da_oauth'
], 'registro: l''admin legge e aggiunge, nessuno modifica o elimina');
select policies_are('public', 'clienti_telegram', array[
  'clienti_telegram_admin', 'clienti_telegram_coach_lettura', 'clienti_telegram_mai_da_oauth'
], 'Telegram: l''admin tutto, il coach incaricato legge');
select ok(
  (select p.prosecdef and 'search_path=""' = any(p.proconfig)
   from pg_proc p where p.oid = 'public.onboarding_incaricato(uuid)'::regprocedure),
  'onboarding_incaricato è security definer con search_path vuoto (le policy di incarichi e percorsi la chiamano)'
);
select is(
  (select coalesce(string_agg(p.proname::text, ', ' order by p.proname::text), '')
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('onboarding_apri_progetto', 'onboarding_assegna_incarichi', 'onboarding_inviti_token_coerenza',
                       'pm_task_onboarding_guardia', 'clienti_telegram_normalizza')
     and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))),
  '',
  'le funzioni interne e dei trigger non sono eseguibili da una sessione'
);
select results_eq(
  $$ select ordine, chiave, nodo, attore, richiede_verifica, sblocca_dopo
     from public.onboarding_passi_def where versione = 1 order by ordine $$,
  $$ values
     (1, 'benvenuto', 'benvenuto', 'cliente', false, '{}'::text[]),
     (2, 'regole', 'benvenuto', 'cliente', false, '{benvenuto}'),
     (3, 'questionario', 'questionario', 'cliente', false, '{regole}'),
     (4, 'prenotazione', 'call_prenotata', 'cliente', false, '{questionario}'),
     (5, 'community', 'community', 'cliente', false, '{prenotazione}'),
     (6, 'call', 'call_onboarding', 'team', true, '{prenotazione}'),
     (7, 'obiettivo', 'call_onboarding', 'cliente', true, '{call}'),
     (8, 'test', 'settimana_test', 'cliente', true, '{obiettivo}'),
     (9, 'programma', 'inizio_percorso', 'team', true, '{test}') $$,
  'il flusso versione 1: nove step, coi loro nodi e cosa sbloccano'
);
select is(
  (select row(count(*), bool_and(not aperto_ai_clienti), min(giorni_validita_link))::text from public.onboarding_impostazioni),
  '(1,t,14)',
  'le impostazioni: una riga, l''area clienti chiusa, 14 giorni di link'
);
select results_eq(
  $$ select v.chiave_onboarding, v.per_incarico, v.tasklist, v.inizio_giorni is null
     from public.pm_modelli_voci v join public.pm_modelli m on m.id = v.modello_id
     where m.per_onboarding order by v.ordine $$,
  $$ values
     ('telegram_gruppo', 'responsabile', 'Onboarding', true),
     ('community_accesso', 'responsabile', 'Onboarding', true),
     ('questionario_letto', 'coach', 'Onboarding', true),
     ('call_onboarding', 'coach', 'Onboarding', true),
     ('obiettivo_smart', 'coach', 'Onboarding', true),
     ('coachplus_test', 'coach', 'Onboarding', true),
     ('revisione_test', 'revisore', 'Onboarding', true),
     ('prima_scheda', 'coach', 'Onboarding', true),
     ('template_alimentare', 'coach', 'Onboarding', true),
     ('primo_checkpoint', 'coach', 'Onboarding', true) $$,
  'il modello «Onboarding cliente»: dieci task in una lista, senza date, ognuno col suo incarico'
);
select is(
  (select array[m.nome, r.nome] from public.pm_modelli m join public.pm_reparti r on r.id = m.reparto_id where m.per_onboarding),
  (select array['Onboarding cliente', r.nome] from public.pm_modelli m join public.pm_reparti r on r.id = m.reparto_id
   where m.per_nuovi_clienti),
  'uno solo, nel reparto di «Percorso cliente»'
);
select throws_ok(
  $$ update public.pm_modelli set per_onboarding = true
     where not per_onboarding and not per_nuovi_clienti and id = (select min(id::text)::uuid from public.pm_modelli
                                                                   where not per_onboarding and not per_nuovi_clienti) $$,
  '23505', null,
  'un solo modello di onboarding'
);
select throws_ok(
  $$ update public.pm_modelli set per_nuovi_clienti = true where per_onboarding $$, '23514', null,
  'il modello di onboarding non è mai quello dei nuovi clienti'
);

-- The invite written by hand (as the seed does) started the path, and Telegram is saved clean
select is(
  (select row(p.stato, p.versione_flusso, (select count(*) from public.onboarding_passi s
                                           where s.client_id = p.client_id and s.stato = 'bloccato'))::text
   from public.onboarding_percorsi p where p.client_id = 'c1090000-0000-4000-8000-000000000001'),
  '(in_attesa,1,9)',
  'un invito apre il percorso, in attesa, con i nove step bloccati'
);
select is(
  (select username from public.clienti_telegram where client_id = 'c1090000-0000-4000-8000-000000000001'),
  'ilario_109',
  'lo username Telegram si salva minuscolo e senza @'
);
select throws_ok(
  $$ update public.clienti_telegram set username = 'no' where client_id = 'c1090000-0000-4000-8000-000000000001' $$,
  '23514', null, 'uno username troppo corto è rifiutato'
);
select throws_ok(
  $$ insert into public.onboarding_inviti (client_id, sale_id, slug, token_hash)
     values ('c1090000-0000-4000-8000-000000000001', 'c1090000-0000-4000-8000-000000000011', 'ilario-bis', repeat('c', 64)) $$,
  '23505', null, 'un solo invito vivo per cliente'
);
select throws_ok(
  $$ insert into public.onboarding_inviti (client_id, sale_id, slug, token_hash)
     select s.client_id, s.id, 'rinnovo', repeat('d', 64) from public.sales s
     where s.id = 'c1090000-0000-4000-8000-000000000012' $$,
  '22023', 'L''onboarding parte solo da una vendita a un nuovo cliente.', 'un rinnovo non apre mai un invito'
);
select throws_ok(
  $$ insert into public.onboarding_inviti_token (invito_id, token)
     values ('c1090000-0000-4000-8000-000000000021', repeat('ef', 32))
     on conflict (invito_id) do update set token = excluded.token $$,
  '22023', null, 'un token che non è quello dell''invito è rifiutato'
);

-- ---------------------------------------------------------------------------
-- 2. The admin
-- ---------------------------------------------------------------------------
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select is(
  (select count(*)::int from unnest(string_to_array(pg_temp.vede(), ', ')) x),
  11,
  'l''admin legge tutte le nove tabelle e le due viste'
);
select is(
  (select row(invito_stato, percorso_stato, passo_corrente, passo_attore, coach_nome, revisore_nome, responsabile_nome,
              progetto_id is not null)::text
   from public.v_onboarding where client_id = 'c1090000-0000-4000-8000-000000000001'),
  '(in_attesa_pagamento,in_attesa,benvenuto,cliente,"Marco Coach","Lorenzo Closer","Dany Montagnolo",t)',
  'v_onboarding: lo stato del link, del percorso, lo step corrente, gli incaricati e il progetto'
);
select is(
  pg_temp.righe($$ update public.onboarding_impostazioni set giorni_validita_link = 21,
                     link_community = 'https://t.me/+provacentonove' $$), 1,
  'l''admin cambia le impostazioni'
);
select throws_ok(
  $$ update public.onboarding_impostazioni set aperto_ai_clienti = true $$, '42501', null,
  'ma non apre l''area clienti: nessuna sessione lo fa'
);
select throws_ok(
  $$ update public.onboarding_impostazioni set link_community = 'https://example.test/gruppo' $$, '23514', null,
  'il link della community è un link di Telegram'
);
select throws_ok(
  $$ update public.onboarding_eventi set tipo = 'altro' $$, '42501', null,
  'il registro non si modifica'
);
select throws_ok(
  $$ delete from public.onboarding_eventi $$, '42501', null, 'e non si elimina'
);
select throws_ok(
  $$ insert into public.onboarding_eventi (client_id, tipo, attore)
     values ('c1090000-0000-4000-8000-000000000001', 'link_attivo', 'sistema') $$,
  '42501', null, 'l''admin scrive nel registro solo le sue azioni, col suo nome'
);
select throws_ok(
  $$ update public.onboarding_percorsi set stato = 'in_corso' $$, '42501', null,
  'il percorso non lo scrive nessuna sessione'
);
select throws_ok(
  $$ update public.pm_task set chiave_onboarding = 'altra' where chiave_onboarding = 'call_onboarding' $$,
  '42501', null, 'la chiave di un task dell''onboarding non la cambia nessuna sessione'
);
select throws_ok(
  $$ update public.pm_task set per_incarico = 'revisore' where chiave_onboarding = 'call_onboarding' $$,
  '42501', null, 'né il suo incarico'
);
select throws_ok(
  $$ insert into public.pm_task (progetto_id, titolo, per_incarico)
     select p.id, 'Task finto dell''onboarding', 'coach' from public.pm_progetti p
     where p.client_id = 'c1090000-0000-4000-8000-000000000001' $$,
  '42501', null, 'e nessuna sessione crea un task con un incarico'
);
select is(
  pg_temp.righe($$ update public.pm_task set stato = 'completato' where chiave_onboarding = 'telegram_gruppo'
                     and progetto_id = (select id from public.pm_progetti where client_id = 'c1090000-0000-4000-8000-000000000001') $$),
  1, 'un task dell''onboarding si lavora come ogni altro'
);

-- ---------------------------------------------------------------------------
-- 3. Who is not in charge reads nothing and writes nothing
-- ---------------------------------------------------------------------------
select pg_temp.web('22222222-2222-4222-8222-222222222222');
select is(pg_temp.vede(), '', 'il setter non legge niente dell''onboarding');
select ok(not public.onboarding_incaricato('c1090000-0000-4000-8000-000000000001'), 'e non è un incaricato');
select throws_ok(
  $$ insert into public.onboarding_incarichi (client_id, coach_id)
     values ('c1090000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222')
     on conflict (client_id) do update set coach_id = excluded.coach_id $$,
  '42501', null, 'non si dà un incarico'
);
select pg_temp.web('99999999-9999-4999-8999-999999990109');
select is(pg_temp.vede(), '', 'un coach che non è incaricato non legge niente');
select pg_temp.web('55555555-5555-4555-8555-555555555555');
select is(pg_temp.vede(), '', 'il video editor nemmeno');
select pg_temp.web('61616161-6161-4161-8161-616161616161');
select is(pg_temp.vede(), '', 'il marketing nemmeno');
select pg_temp.web('bc000000-0000-4000-8000-000000000001');
select is(pg_temp.vede(), '', 'il business coach nemmeno');
set local role anon;
select throws_ok($$ select count(*) from public.onboarding_inviti $$, '42501', null, 'anon non legge gli inviti');
select throws_ok($$ select count(*) from public.v_onboarding $$, '42501', null, 'né la vista');
reset role;

-- ---------------------------------------------------------------------------
-- 4. The people in charge: their own row; the path only from the registration on
-- ---------------------------------------------------------------------------
select pg_temp.web('44444444-4444-4444-8444-444444444444');
select is(
  pg_temp.vede(), '',
  'il coach incaricato, prima della registrazione, non legge niente: nemmeno la riga del suo incarico (senza il progetto direbbe «non ha ancora pagato»)'
);
select ok(not public.onboarding_incaricato('c1090000-0000-4000-8000-000000000001'),
  'onboarding_incaricato: no finché il cliente non si registra');
select is(
  pg_temp.righe($$ update public.onboarding_incarichi set revisore_id = '44444444-4444-4444-8444-444444444444' $$)
    + pg_temp.righe($$ update public.clienti_telegram set username = 'cambiato_dal_coach' $$),
  0, 'non cambia gli incarichi né Telegram'
);
select pg_temp.web('33333333-3333-4333-8333-333333333333');
select is(
  pg_temp.vede(), '',
  'il closer, che qui è il revisore, prima della registrazione non legge niente: mai l''invito, cioè lo stato del pagamento'
);

-- the client registers (release B): the path is in corso
reset role;
set local request.jwt.claims to '{}';
update public.onboarding_percorsi set stato = 'in_corso', giorno_zero = now()
where client_id = 'c1090000-0000-4000-8000-000000000001';

select pg_temp.web('44444444-4444-4444-8444-444444444444');
select is(
  pg_temp.vede(),
  'onboarding_incarichi 1, onboarding_percorsi 1, onboarding_passi 9, clienti_telegram 1',
  'dalla registrazione il coach legge il suo incarico, il percorso, i suoi step e Telegram: mai inviti, token, eventi o impostazioni'
);
select ok(public.onboarding_incaricato('c1090000-0000-4000-8000-000000000001'), 'onboarding_incaricato: sì per il suo cliente');
select is(
  (select bool_and('44444444-4444-4444-8444-444444444444' in (coach_id, revisore_id, responsabile_id))
   from public.onboarding_incarichi),
  true, 'e la riga è la sua'
);
select pg_temp.web('33333333-3333-4333-8333-333333333333');
select is(
  pg_temp.vede(), 'onboarding_incarichi 1, onboarding_percorsi 1, onboarding_passi 9',
  'il revisore il percorso e gli step, non Telegram'
);
select pg_temp.web('99999999-9999-4999-8999-999999990109');
select is(pg_temp.vede(), '', 'chi non è incaricato ancora niente');

-- suspended after the registration: still readable («in pausa»); suspended before it: never
reset role;
set local request.jwt.claims to '{}';
update public.onboarding_percorsi set stato = 'sospeso' where client_id = 'c1090000-0000-4000-8000-000000000001';
select pg_temp.web('44444444-4444-4444-8444-444444444444');
select is((select count(*)::int from public.onboarding_percorsi), 1, 'un percorso sospeso dopo la registrazione lo legge ancora');
reset role;
set local request.jwt.claims to '{}';
update public.onboarding_percorsi set giorno_zero = null where client_id = 'c1090000-0000-4000-8000-000000000001';
select pg_temp.web('44444444-4444-4444-8444-444444444444');
select is(
  (select count(*)::int from public.onboarding_percorsi) + (select count(*)::int from public.onboarding_passi)
    + (select count(*)::int from public.clienti_telegram),
  0, 'uno sospeso prima della registrazione no: direbbe che il pagamento non è andato'
);

-- a deactivated account, and the business coach even if somebody put him in charge
reset role;
set local request.jwt.claims to '{}';
update public.onboarding_percorsi set stato = 'in_corso', giorno_zero = now()
where client_id = 'c1090000-0000-4000-8000-000000000001';
update public.profiles set attivo = false where id = '44444444-4444-4444-8444-444444444444';
select pg_temp.web('44444444-4444-4444-8444-444444444444');
select is(pg_temp.vede(), '', 'un incaricato disattivato non legge più niente');
reset role;
set local request.jwt.claims to '{}';
update public.profiles set attivo = true where id = '44444444-4444-4444-8444-444444444444';
update public.onboarding_incarichi set revisore_id = 'bc000000-0000-4000-8000-000000000001'
where client_id = 'c1090000-0000-4000-8000-000000000001';
select pg_temp.web('bc000000-0000-4000-8000-000000000001');
select is(pg_temp.vede(), '', 'il business coach non legge niente nemmeno se qualcuno gli desse un incarico');
select ok(not public.onboarding_incaricato('c1090000-0000-4000-8000-000000000001'), 'e onboarding_incaricato gli dice no');

-- ---------------------------------------------------------------------------
-- 5. Claude: the admin's token gets nothing, outside and inside an approved request
-- ---------------------------------------------------------------------------
select pg_temp.claude();
select is(pg_temp.vede(), '', 'token di Claude dell''admin: nessuna riga dell''onboarding');
select pg_temp.claude(true);
select ok(public.is_admin(), 'dentro una richiesta ammessa il token è l''admin');
select is(pg_temp.vede(), '', 'e nemmeno lì legge una riga');
select ok(not public.onboarding_incaricato('c1090000-0000-4000-8000-000000000001'),
  'onboarding_incaricato: mai per un token, nemmeno del responsabile');
select is(
  pg_temp.righe($$ update public.onboarding_impostazioni set giorni_validita_link = 30 $$)
    + pg_temp.righe($$ update public.onboarding_inviti set consenso_genitore_nota = 'da-claude' $$)
    + pg_temp.righe($$ update public.clienti_telegram set username = 'da_claude' $$),
  0, 'e non scrive niente: impostazioni, inviti, Telegram'
);
select throws_ok(
  $$ insert into public.onboarding_incarichi (client_id, responsabile_id)
     values ('0b0a0000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111')
     on conflict (client_id) do update set responsabile_id = excluded.responsabile_id $$,
  '42501', null, 'né un incarico'
);
select is(
  array[
    pg_temp.filtro('/onboarding_inviti', 'GET'), pg_temp.filtro('/onboarding_inviti_token', 'GET'),
    pg_temp.filtro('/onboarding_percorsi', 'GET'), pg_temp.filtro('/onboarding_eventi', 'GET'),
    pg_temp.filtro('/onboarding_incarichi', 'POST'), pg_temp.filtro('/clienti_telegram', 'PATCH'),
    pg_temp.filtro('/v_onboarding', 'GET'), pg_temp.filtro('/v_vendite_senza_onboarding', 'GET'),
    pg_temp.filtro('/rpc/onboarding_incaricato', 'POST')
  ],
  array['42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501', '42501'],
  'il filtro delle Data API rifiuta le tabelle, le viste e la funzione dell''onboarding'
);

reset role;
set local request.jwt.claims to '{}';
select is(
  (select row(giorni_validita_link, aperto_ai_clienti)::text from public.onboarding_impostazioni),
  '(21,f)', 'le impostazioni sono quelle dell''admin'
);

select * from finish();
rollback;
