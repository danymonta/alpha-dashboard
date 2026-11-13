-- Guided onboarding, release B2 (1.80.0, 20261110090000_percorso_call_consegne.sql and
-- 20261110090100_percorso_team.sql): the path to the launch and the work of the team. The booking by hand and
-- its confirmation, the outcomes of the call, the community and the queues, the task that opens the goal (in
-- both orders), the due dates of the tasks, the test week and the programme, the deliveries and the compulsory
-- videos, the completion, «Sblocca step» and «Riavvia onboarding», the opening of the client area with its
-- checks; the pairs percorso_avanza refuses; the reads of the people in charge (never the payment, the invite,
-- the questionnaire for the reviewer and the responsible; a suspended client is «In pausa» without a reason);
-- the functions of the team refused to setter, closer, a coach not in charge, marketing, business coach and
-- Claude's token.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(180);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Seed: admin 1111, setter 2222, closer 3333, coach 4444, editor 5555, marketing 6161,
-- business coach bc00. The invented clients of this test: Marco Coach is their coach, the closer their
-- reviewer, the video editor their responsible. A second coach is in charge of nobody.
-- ---------------------------------------------------------------------------
insert into auth.oauth_clients (id, client_name, registration_type, client_type, redirect_uris,
  grant_types, token_endpoint_auth_method, deleted_at)
values ('9c000000-0000-4000-8000-000000000115', 'Claude', 'manual', 'public',
  'https://claude.ai/api/mcp/auth_callback', 'authorization_code,refresh_token', 'none', null);
insert into auth.sessions (id, user_id, created_at, updated_at, aal, oauth_client_id, not_after)
values ('9e115000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', now(), now(), 'aal1',
  '9c000000-0000-4000-8000-000000000115', null);

insert into public.invites (email, ruolo) values ('coach115@alpha.test', 'coach');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999990115',
  'authenticated', 'authenticated', 'coach115@alpha.test', '', now(),
  '{}'::jsonb, '{"full_name":"Carlo Centoquindici"}'::jsonb, now(), now(), '', '', '', '');

update public.onboarding_impostazioni
set link_prenotazione = 'https://calendar.app.google/prenota115', link_community = 'https://t.me/+community115';

create temp table casi (nome text primary key, sale_id uuid, client_id uuid, invito_id uuid, utente uuid) on commit drop;
create temp table appunti (chiave text primary key, valore jsonb) on commit drop;
grant select on casi to authenticated;
grant select, insert, update on appunti to authenticated;

create or replace function pg_temp.h(p text) returns text language sql immutable as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;
create or replace function pg_temp.cliente(p_nome text) returns uuid language sql as $$
  select client_id from pg_temp.casi where nome = p_nome $$;
create or replace function pg_temp.utente(p_nome text) returns uuid language sql as $$
  select utente from pg_temp.casi where nome = p_nome $$;
create or replace function pg_temp.nota(p_chiave text) returns jsonb language sql as $$
  select valore from pg_temp.appunti where chiave = p_chiave $$;
create or replace function pg_temp.passo(p_nome text, p_passo text) returns text language sql as $$
  select s.stato from public.onboarding_passi s where s.client_id = pg_temp.cliente(p_nome) and s.passo = p_passo $$;
create or replace function pg_temp.task(p_nome text, p_chiave text) returns public.pm_task language sql as $$
  select t.* from public.pm_task t join public.pm_progetti pg on pg.id = t.progetto_id
  where pg.client_id = pg_temp.cliente(p_nome) and t.chiave_onboarding = p_chiave $$;
create or replace function pg_temp.call(p_nome text, p_tipo text default 'onboarding') returns public.clienti_call language sql as $$
  select c.* from public.clienti_call c where c.client_id = pg_temp.cliente(p_nome) and c.tipo = p_tipo
  order by (c.stato = 'annullata'), c.created_at desc limit 1 $$;
-- the state of a step as the client sees it (he reads no table)
create or replace function pg_temp.mio_passo(p_passo text) returns text language sql as $$
  select jsonb_path_query_first(public.percorso_cliente(), '$.passi[*] ? (@.chiave == $p).stato', jsonb_build_object('p', p_passo)) #>> '{}' $$;
-- the published items of the test week (read as postgres)
create temp table voci on commit drop as
select b.id, b.ordine from public.contenuti_blocchi b
where b.versione_flusso = 1 and b.pagina = 'passo' and b.passo = 'test' and b.tipo = 'voce' and b.pubblicato;
grant select on voci to authenticated;

create or replace function pg_temp.come(p_utente uuid)
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

-- the admin's token of Claude
create or replace function pg_temp.claude()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated',
    'client_id', '9c000000-0000-4000-8000-000000000115',
    'session_id', '9e115000-0000-4000-8000-000000000001')::text, true);
  perform set_config('alpha.mcp_filtro', '', true);
  perform set_config('request.path', '', true);
  set local role authenticated;
end;
$$;

-- the SQLSTATE of a statement, or 'ok'
create or replace function pg_temp.esito(p_sql text)
returns text
language plpgsql
as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end;
$$;

-- the wizard as the admin; a test link, the payment confirmed by hand; registered through /join; then the
-- welcome, the rules and the questionnaire done (written as postgres, the consent and the video too)
create or replace function pg_temp.prepara(p_nome text)
returns void
language plpgsql
as $$
declare
  r jsonb;
  v jsonb;
  v_chiave text := md5(random()::text) || md5(random()::text);
  v_token text;
  v_cliente uuid;
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
  r := public.nuovo_cliente(
    jsonb_build_object(
      'product_id', (select id from public.products order by created_at limit 1), 'data_vendita', public.oggi(),
      'data_inizio', public.oggi() + 7, 'valore_contratto', 2400, 'numero_rate', 3,
      'nome', p_nome, 'cognome', 'Centoquindici', 'email', lower(p_nome) || '115@example.test'),
    jsonb_build_object('coach', '44444444-4444-4444-8444-444444444444', 'revisore', '33333333-3333-4333-8333-333333333333',
                       'responsabile', '55555555-5555-4555-8555-555555555555'));
  v_cliente := (r ->> 'client_id')::uuid;
  insert into pg_temp.casi (nome, sale_id, client_id, invito_id)
  values (p_nome, (r ->> 'sale_id')::uuid, v_cliente, (r ->> 'invito_id')::uuid);
  perform public.onboarding_segna_prova((r ->> 'invito_id')::uuid, true);
  perform public.onboarding_conferma_pagamento((r ->> 'invito_id')::uuid);
  perform set_config('request.jwt.claims', '{}', true);

  select t.token into v_token from public.onboarding_inviti_token t where t.invito_id = (r ->> 'invito_id')::uuid;
  perform public.onboarding_join_apri(pg_temp.h(v_token), pg_temp.h(v_chiave));
  perform public.onboarding_join_codice(pg_temp.h(v_chiave), lower(p_nome) || '115@example.test', pg_temp.h('12345678'));
  v := public.onboarding_join_verifica(pg_temp.h(v_chiave), '12345678');
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', (v ->> 'utente_id')::uuid, 'authenticated', 'authenticated',
    v ->> 'email', '', now(), '{"tipo":"cliente"}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
  update pg_temp.casi set utente = (v ->> 'utente_id')::uuid where nome = p_nome;

  insert into public.onboarding_video_visti (client_id, blocco_id, durata, visti, visto_il)
  select v_cliente, b.id, 60, repeat('1', 60)::varbit, now()
  from public.contenuti_blocchi b where b.versione_flusso = 1 and b.pagina = 'passo' and b.tipo = 'video' and b.obbligatorio;
  insert into public.clienti_consensi (client_id, tipo, versione)
  select v_cliente, 'salute', t.versione from public.clienti_consensi_testi t where t.tipo = 'salute' and t.in_vigore;
  update public.onboarding_passi
  set stato = 'fatto', iniziato_il = now(), completato_il = now()
  where client_id = v_cliente and passo in ('benvenuto', 'regole', 'questionario');
  perform public.onboarding_sblocca(v_cliente);
end;
$$;

select pg_temp.prepara('Bruno');
select pg_temp.prepara('Carlo');
select pg_temp.prepara('Dario');

-- ---------------------------------------------------------------------------
-- 1. The due dates at the registration (and the seed's client, registered after the migration)
-- ---------------------------------------------------------------------------
select is(
  (pg_temp.task('Bruno', 'telegram_gruppo')).scadenza,
  (select (p.giorno_zero at time zone 'Europe/Rome')::date + 1 from public.onboarding_percorsi p where p.client_id = pg_temp.cliente('Bruno')),
  'alla registrazione: il gruppo Telegram scade il giorno dopo'
);
select is((pg_temp.task('Bruno', 'community_accesso')).scadenza, (pg_temp.task('Bruno', 'telegram_gruppo')).scadenza,
  'e così la richiesta della community');
select is(
  (select t.scadenza from public.pm_task t join public.pm_progetti pg on pg.id = t.progetto_id
   where pg.client_id = '0b0b0000-0000-4000-8000-000000000001' and t.chiave_onboarding = 'telegram_gruppo'),
  (select (p.giorno_zero at time zone 'Europe/Rome')::date + 1 from public.onboarding_percorsi p
   where p.client_id = '0b0b0000-0000-4000-8000-000000000001'),
  'anche il cliente del seed, registrato dopo la migration'
);
select is((pg_temp.task('Bruno', 'call_onboarding')).scadenza, null, 'nessuna scadenza sugli altri task');

-- ---------------------------------------------------------------------------
-- 2. The booking by hand (step 4)
-- ---------------------------------------------------------------------------
select pg_temp.come(pg_temp.utente('Bruno'));
insert into appunti values ('pagina', public.percorso_cliente());
select is(pg_temp.nota('pagina') ->> 'link_prenotazione', 'https://calendar.app.google/prenota115',
  'con la prenotazione sbloccata il cliente riceve la pagina di prenotazione');
select is(pg_temp.nota('pagina') ->> 'link_community', null, 'la community no: è ancora bloccata');
select is(pg_temp.nota('pagina') -> 'call', 'null'::jsonb, 'nessuna call');
select is(pg_temp.nota('pagina') -> 'stima' ->> 'base', 'call_non_prenotata', 'la stima: call non prenotata');
select throws_ok($$ select public.percorso_avanza('prenotazione', 'prenotato', '{"giorno":"2020-01-01","ora":"18:00"}') $$,
  '22023', 'Il giorno della call va da oggi a 60 giorni.', 'un giorno passato no');
select throws_ok(format($$ select public.percorso_avanza('prenotazione', 'prenotato', '{"giorno":"%s","ora":"18:00"}') $$, public.oggi() + 61),
  '22023', 'Il giorno della call va da oggi a 60 giorni.', 'oltre 60 giorni no');
select throws_ok($$ select public.percorso_avanza('prenotazione', 'prenotato', '{"giorno":"domani","ora":"18"}') $$,
  '22023', null, 'un giorno scritto male no');
select throws_ok($$ select public.percorso_avanza('prenotazione', 'vola', '{}') $$,
  '22023', 'Questo passo non è ancora disponibile.', 'un''azione che non c''è no');
insert into appunti values ('prenotato', public.percorso_avanza('prenotazione', 'prenotato',
  jsonb_build_object('giorno', public.oggi() + 3, 'ora', '18:00')));
select is(pg_temp.mio_passo('prenotazione'), 'inviato', 'prenotato: lo step è inviato');
select is(pg_temp.nota('prenotato') -> 'call' ->> 'stato', 'da_confermare', 'la call è da confermare');
select is(pg_temp.nota('prenotato') -> 'call' ->> 'meet_url', null, 'senza il link di Meet');
select is(pg_temp.nota('prenotato') -> 'call' ->> 'ora', '18:00', 'all''ora di Roma che ha scritto');
select is(pg_temp.nota('prenotato') -> 'attesa_team' ->> 'cosa', 'Marco sta confermando la tua call.',
  'il pannello dice chi lavora e cosa sta facendo');
select is(pg_temp.nota('prenotato') -> 'attesa_team' -> 'chi' ->> 'ruolo', 'Coach', 'con il nome di battesimo e il ruolo');
select is(pg_temp.nota('prenotato') -> 'stima' ->> 'base', 'call_prenotata', 'la stima parte dalla call');
select throws_ok(format($$ select public.percorso_avanza('prenotazione', 'prenotato', '{"giorno":"%s","ora":"19:00"}') $$, public.oggi() + 4),
  '22023', null, 'una seconda prenotazione, con lo step inviato, no');
reset role;
set local request.jwt.claims to '{}';
select is(
  (select count(*)::int from public.notifiche n
   where n.chiave like 'onboarding/' || pg_temp.cliente('Bruno') || '/prenotazione/%'
     and n.destinatario_id in ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111')),
  2, 'il coach e l''admin lo sanno'
);
select is(
  (select count(*)::int from public.notifiche n
   where n.chiave like 'onboarding/' || pg_temp.cliente('Bruno') || '/prenotazione/%'
     and n.destinatario_id in ('33333333-3333-4333-8333-333333333333', '55555555-5555-4555-8555-555555555555')),
  0, 'il revisore e il responsabile no: ognuno le sue'
);

-- the ids of the calls, read as postgres (the people in charge read no call from the table)
insert into appunti values ('call_bruno', to_jsonb(pg_temp.call('Bruno')));
create or replace function pg_temp.id_call(p_nome text) returns uuid language sql as $$
  select (valore ->> 'id')::uuid from pg_temp.appunti where chiave = 'call_' || lower(p_nome) $$;

-- ---------------------------------------------------------------------------
-- 3. The functions of the team, refused to everybody else
-- ---------------------------------------------------------------------------
create or replace function pg_temp.rifiuti()
returns text
language plpgsql
as $$
declare
  c text := pg_temp.cliente('Bruno')::text;
  v_call text := pg_temp.id_call('Bruno')::text;
  v text[] := '{}';
begin
  v := v || pg_temp.esito(format($q$ select public.onboarding_call_conferma(%L, null, 'https://meet.google.com/abc-defg-hij') $q$, c));
  v := v || pg_temp.esito(format($q$ select public.onboarding_call_esito(%L, 'spostata', now() + interval '2 days') $q$, v_call));
  v := v || pg_temp.esito(format($q$ select public.onboarding_test_ricevuti(%L) $q$, c));
  v := v || pg_temp.esito(format($q$ select public.onboarding_consegna_aggiungi(%L, 'link', 'Prova', 'https://example.test/x', false) $q$, c));
  v := v || pg_temp.esito(format($q$ select public.onboarding_programma_consegnato(%L, now() + interval '30 days') $q$, c));
  v := v || pg_temp.esito(format($q$ select public.onboarding_community(%L, 'approvata') $q$, c));
  v := v || pg_temp.esito(format($q$ select public.onboarding_sblocca_passo(%L, 'community', 'Prova') $q$, c));
  v := v || pg_temp.esito(format($q$ select public.onboarding_riavvia(%L, 'Prova') $q$, c));
  v := v || pg_temp.esito(format($q$ select public.onboarding_obiettivo_impostato(%L) $q$, c));
  v := v || pg_temp.esito(format($q$ select public.onboarding_scheda_incaricato(%L) $q$, c));
  return array_to_string(array(select distinct x from unnest(v) x order by 1), ',');
end;
$$;

select pg_temp.come('22222222-2222-4222-8222-222222222222');
select is(pg_temp.rifiuti(), '42501', 'il setter: 42501 da ogni funzione del team');
reset role;
select pg_temp.come('33333333-3333-4333-8333-333333333333');
select is(pg_temp.rifiuti(), '42501,ok', 'il revisore (qui il closer): 42501, tranne leggere la sua scheda');
reset role;
select pg_temp.come('99999999-9999-4999-8999-999999990115');
select is(pg_temp.rifiuti(), '42501', 'un coach non incaricato: 42501');
reset role;
select pg_temp.come('61616161-6161-4161-8161-616161616161');
select is(pg_temp.rifiuti(), '42501', 'il marketing: 42501');
reset role;
select pg_temp.come('bc000000-0000-4000-8000-000000000001');
select is(pg_temp.rifiuti(), '42501', 'il business coach: 42501');
reset role;
select pg_temp.claude();
select is(pg_temp.rifiuti(), '42501', 'il token di Claude dell''admin: 42501');
select throws_ok($$ select * from public.onboarding_incaricati_elenco() $$, '42501', null, 'e l''elenco degli incaricati');
reset role;
select pg_temp.come(pg_temp.utente('Bruno'));
select is(pg_temp.rifiuti(), '42501', 'il cliente stesso: 42501');
select is((select count(*)::int from public.onboarding_incaricati_elenco()), 0, 'e nessuna riga nell''elenco');
reset role;
select pg_temp.come('55555555-5555-4555-8555-555555555555');
select throws_ok(format($$ select public.onboarding_call_conferma(%L, null, 'https://meet.google.com/abc-defg-hij') $$, pg_temp.cliente('Bruno')),
  '42501', 'Questa azione è del coach del cliente e dell''admin.', 'il responsabile non conferma la call');
reset role;

-- ---------------------------------------------------------------------------
-- 4. The coach confirms the call
-- ---------------------------------------------------------------------------
select pg_temp.come('44444444-4444-4444-8444-444444444444');
select throws_ok(format($$ select public.onboarding_call_conferma(%L, null, 'https://zoom.us/j/1') $$, pg_temp.cliente('Bruno')),
  '22023', 'Il link di Meet comincia con https://meet.google.com/.', 'un link che non è di Meet no');
insert into appunti values ('conferma', public.onboarding_call_conferma(pg_temp.cliente('Bruno'),
  (public.oggi() + 2 + time '17:30') at time zone 'Europe/Rome', 'https://meet.google.com/abc-defg-hij'));
select is(pg_temp.nota('conferma') ->> 'avviso', 'call_confermata', 'la risposta dice di avvisare il cliente');
reset role;
set local request.jwt.claims to '{}';
select is((pg_temp.call('Bruno')).stato, 'prenotata', 'la call è prenotata');
select is(to_char((pg_temp.call('Bruno')).inizio at time zone 'Europe/Rome', 'HH24:MI'), '17:30', 'con l''ora corretta dal coach');
select is(
  array[pg_temp.passo('Bruno', 'prenotazione'), pg_temp.passo('Bruno', 'community'), pg_temp.passo('Bruno', 'call')],
  array['fatto', 'disponibile', 'disponibile'], 'la prenotazione è fatta: si aprono la community e la call'
);
select is((pg_temp.task('Bruno', 'questionario_letto')).scadenza, public.oggi() + 2, 'leggere il questionario scade il giorno della call');
select is((pg_temp.task('Bruno', 'call_onboarding')).scadenza, public.oggi() + 2, 'e la call di onboarding');
select pg_temp.come(pg_temp.utente('Bruno'));
insert into appunti values ('confermata', public.percorso_cliente());
select is(pg_temp.nota('confermata') -> 'call' ->> 'meet_url', 'https://meet.google.com/abc-defg-hij', 'il cliente riceve il link di Meet');
select is(pg_temp.nota('confermata') ->> 'link_community', 'https://t.me/+community115', 'e il link della community');
select is(pg_temp.nota('confermata') ->> 'in_attesa', 'false', 'tocca a lui: la community');
reset role;

-- ---------------------------------------------------------------------------
-- 5. The community and the queues
-- ---------------------------------------------------------------------------
select pg_temp.come(pg_temp.utente('Bruno'));
select throws_ok($$ select public.percorso_avanza('community', 'richiesta_inviata', '{}') $$, '22023',
  'Prima scrivi il tuo username di Telegram.', 'senza username non chiede l''accesso');
select throws_ok($$ select public.percorso_avanza('community', 'presentato', '{}') $$, '22023',
  'Prima chiedi l''accesso alla community.', 'non si presenta prima di chiedere l''accesso');
select throws_ok($$ select public.percorso_avanza('community', 'username', '{"username":"io"}') $$, '22023', null,
  'uno username troppo corto no');
select lives_ok($$ select public.percorso_avanza('community', 'username', '{"username":" @Bruno_115 "}') $$, 'lo username');
select lives_ok($$ select public.percorso_avanza('community', 'richiesta_inviata', '{}') $$, 'la richiesta inviata');
select is(pg_temp.mio_passo('community'), 'in_corso', 'lo step è in corso');
reset role;
set local request.jwt.claims to '{}';
select is((select username from public.clienti_telegram where client_id = pg_temp.cliente('Bruno')), 'bruno_115',
  'salvato minuscolo e senza @');
select is(
  (select count(*)::int from public.notifiche n
   where n.chiave like 'onboarding/' || pg_temp.cliente('Bruno') || '/community_richiesta/%'
     and n.destinatario_id = '55555555-5555-4555-8555-555555555555'),
  1, 'il responsabile sa della richiesta'
);
-- the call within 48 hours, the community not done: preparation incomplete
update public.clienti_call set inizio = now() + interval '24 hours' where id = (pg_temp.call('Bruno')).id;
select pg_temp.come('44444444-4444-4444-8444-444444444444');
select is(
  (select row(e.incarico, e.gruppo, e.richiesta_community, e.preparazione_incompleta, e.passo)::text
   from public.onboarding_incaricati_elenco() e where e.client_id = pg_temp.cliente('Bruno')),
  '(coach,tocca_a_te,t,t,community)', 'il coach: tocca a lui, la richiesta e «Preparazione incompleta»'
);
select is(
  (select public.onboarding_scheda_incaricato(pg_temp.cliente('Bruno')) -> 'code' ->> 'preparazione_incompleta'),
  'true', 'anche nella scheda del coach'
);
reset role;
select pg_temp.come('55555555-5555-4555-8555-555555555555');
select is(
  (select row(e.incarico, e.gruppo, e.richiesta_community, e.preparazione_incompleta, e.call_da_segnare)::text
   from public.onboarding_incaricati_elenco() e where e.client_id = pg_temp.cliente('Bruno')),
  '(responsabile,tocca_a_te,t,f,f)', 'il responsabile: solo le code della community'
);
select throws_ok(format($$ select public.onboarding_community(%L, 'controllata') $$, pg_temp.cliente('Bruno')),
  '22023', 'Il cliente non si è ancora presentato.', 'una presentazione che non c''è non si controlla');
select lives_ok(format($$ select public.onboarding_community(%L, 'approvata') $$, pg_temp.cliente('Bruno')),
  'il responsabile approva la richiesta');
reset role;
select pg_temp.come('33333333-3333-4333-8333-333333333333');
select is(
  (select row(e.incarico, e.gruppo, e.richiesta_community, e.preparazione_incompleta)::text
   from public.onboarding_incaricati_elenco() e where e.client_id = pg_temp.cliente('Bruno')),
  '(revisore,tocca_al_cliente,f,f)', 'il revisore: nessuna coda della community né della call'
);
reset role;
set local request.jwt.claims to '{}';
select is((pg_temp.task('Bruno', 'community_accesso')).stato::text, 'completato', 'la richiesta approvata completa il task');
select pg_temp.come(pg_temp.utente('Bruno'));
select lives_ok($$ select public.percorso_avanza('community', 'presentato', '{}') $$, 'si è presentato');
select is(pg_temp.mio_passo('community'), 'fatto', 'la community è fatta');
reset role;
select pg_temp.come('55555555-5555-4555-8555-555555555555');
select is(
  (select e.presentazione_da_controllare from public.onboarding_incaricati_elenco() e where e.client_id = pg_temp.cliente('Bruno')),
  true, 'la presentazione è da controllare'
);
select lives_ok(format($$ select public.onboarding_community(%L, 'controllata') $$, pg_temp.cliente('Bruno')), 'controllata');
select is(
  (select e.presentazione_da_controllare from public.onboarding_incaricati_elenco() e where e.client_id = pg_temp.cliente('Bruno')),
  false, 'e la coda si svuota'
);
reset role;

-- ---------------------------------------------------------------------------
-- 6. The outcomes of the call, and the goal opened by its task (the task after the call)
-- ---------------------------------------------------------------------------
select pg_temp.come('44444444-4444-4444-8444-444444444444');
select throws_ok(format($$ select public.onboarding_call_esito(%L, 'svolta', null) $$, pg_temp.id_call('Bruno')),
  '22023', 'La call non c''è ancora stata: segnala svolta dopo averla fatta.', 'una call futura non si segna svolta');
select throws_ok(format($$ select public.onboarding_call_esito(%L, 'spostata', null) $$, pg_temp.id_call('Bruno')),
  '22023', null, 'spostata senza il giorno nuovo no');
select is(
  public.onboarding_call_esito(pg_temp.id_call('Bruno'), 'spostata', (public.oggi() + 5 + time '10:00') at time zone 'Europe/Rome') ->> 'avviso',
  'call_spostata', 'spostata: il cliente va avvisato');
reset role;
set local request.jwt.claims to '{}';
select is((pg_temp.call('Bruno')).stato, 'prenotata', 'la call resta prenotata');
select is(((pg_temp.call('Bruno')).inizio at time zone 'Europe/Rome')::date, public.oggi() + 5, 'col giorno nuovo');
select is((pg_temp.task('Bruno', 'call_onboarding')).scadenza, public.oggi() + 5, 'e la scadenza del task segue');
update public.clienti_call set inizio = now() - interval '1 hour' where id = (pg_temp.call('Bruno')).id;
select pg_temp.come('44444444-4444-4444-8444-444444444444');
select is(
  (select e.call_da_segnare from public.onboarding_incaricati_elenco() e where e.client_id = pg_temp.cliente('Bruno')),
  true, 'una call passata e non segnata è «Call da segnare»'
);
select lives_ok(format($$ select public.onboarding_call_esito(%L, 'svolta', null) $$, pg_temp.id_call('Bruno')), 'svolta');
select is(
  (select e.obiettivo_da_impostare from public.onboarding_incaricati_elenco() e where e.client_id = pg_temp.cliente('Bruno')),
  true, 'poi l''obiettivo è da impostare'
);
reset role;
set local request.jwt.claims to '{}';
select is(pg_temp.passo('Bruno', 'call'), 'fatto', 'lo step della call è fatto');
select is((pg_temp.task('Bruno', 'call_onboarding')).stato::text, 'completato', 'il task della call completato');
select is((pg_temp.task('Bruno', 'obiettivo_smart')).scadenza, public.oggi() + 1, 'l''obiettivo SMART scade domani');
select is((pg_temp.task('Bruno', 'coachplus_test')).scadenza, public.oggi() + 1, 'e la verifica su Coach Plus');
select is(pg_temp.passo('Bruno', 'obiettivo'), 'bloccato', 'con il task dell''obiettivo aperto l''obiettivo resta bloccato');
select pg_temp.come(pg_temp.utente('Bruno'));
select is(public.percorso_cliente() -> 'attesa_team' ->> 'cosa', 'Marco sta impostando il tuo obiettivo su Coach Plus.',
  'il cliente aspetta il coach');
reset role;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
update public.pm_task set stato = 'completato' where id = (pg_temp.task('Bruno', 'obiettivo_smart')).id;
set local request.jwt.claims to '{}';
select is(pg_temp.passo('Bruno', 'obiettivo'), 'disponibile', 'il coach spunta il task: l''obiettivo si apre');
update public.pm_task set stato = 'da_fare' where id = (pg_temp.task('Bruno', 'obiettivo_smart')).id;
select is(pg_temp.passo('Bruno', 'obiettivo'), 'disponibile', 'riaprire il task non riporta indietro lo step');
update public.pm_task set stato = 'completato' where id = (pg_temp.task('Bruno', 'obiettivo_smart')).id;

-- «Segna obiettivo impostato»: the same as the task, with the notice to the client (a trigger cannot send it)
update public.onboarding_passi set stato = 'bloccato' where client_id = pg_temp.cliente('Bruno') and passo = 'obiettivo';
update public.pm_task set stato = 'da_fare' where id = (pg_temp.task('Bruno', 'obiettivo_smart')).id;
select pg_temp.come('44444444-4444-4444-8444-444444444444');
select is(public.onboarding_obiettivo_impostato(pg_temp.cliente('Bruno')) ->> 'avviso', 'obiettivo_aperto',
  '«Segna obiettivo impostato»: il cliente va avvisato');
select throws_ok(format($$ select public.onboarding_obiettivo_impostato(%L) $$, pg_temp.cliente('Bruno')), '22023',
  'L''obiettivo è già aperto al cliente.', 'una seconda volta no');
reset role;
set local request.jwt.claims to '{}';
select is(array[pg_temp.passo('Bruno', 'obiettivo'), (pg_temp.task('Bruno', 'obiettivo_smart')).stato::text],
  array['disponibile', 'completato'], 'l''obiettivo si apre e il task è completato');

-- the other order: the task before the call (Carlo)
update public.onboarding_passi set stato = 'fatto', completato_il = now() where client_id = pg_temp.cliente('Carlo') and passo = 'prenotazione';
select public.onboarding_sblocca(pg_temp.cliente('Carlo'));
insert into public.clienti_call (client_id, tipo, inizio, stato, coach_id)
values (pg_temp.cliente('Carlo'), 'onboarding', now() - interval '2 hours', 'prenotata', '44444444-4444-4444-8444-444444444444');
update public.pm_task set stato = 'completato' where id = (pg_temp.task('Carlo', 'obiettivo_smart')).id;
insert into appunti values ('call_carlo', to_jsonb(pg_temp.call('Carlo')));
select is(pg_temp.passo('Carlo', 'obiettivo'), 'bloccato', 'il task prima della call: l''obiettivo aspetta la call');
select pg_temp.come('44444444-4444-4444-8444-444444444444');
select throws_ok(format($$ select public.onboarding_obiettivo_impostato(%L) $$, pg_temp.cliente('Carlo')), '22023',
  'Prima segna la call di onboarding come svolta.', '«Segna obiettivo impostato» prima della call no');
select is(public.onboarding_call_esito(pg_temp.id_call('Carlo'), 'svolta', null) ->> 'avviso', 'obiettivo_aperto',
  'la call svolta con l''obiettivo già impostato: il cliente va avvisato');
reset role;
set local request.jwt.claims to '{}';
select is(pg_temp.passo('Carlo', 'obiettivo'), 'disponibile', 'e l''obiettivo si apre');

-- ---------------------------------------------------------------------------
-- 7. The goal and the test week
-- ---------------------------------------------------------------------------
select pg_temp.come(pg_temp.utente('Bruno'));
select lives_ok($$ select public.percorso_avanza('obiettivo', 'visto', '{}') $$, 'ha visto l''obiettivo');
select is(pg_temp.mio_passo('test'), 'disponibile', 'si apre la settimana test');
select throws_ok($$ select public.percorso_avanza('test', 'spunta', '{"voce":"00000000-0000-4000-8000-000000000000"}') $$,
  '22023', 'Voce non valida', 'una voce che non c''è no');
select lives_ok(format($$ select public.percorso_avanza('test', 'spunta', jsonb_build_object('voce', %L)) $$,
  (select id from voci order by ordine limit 1)), 'la prima voce');
select is(pg_temp.mio_passo('test'), 'in_corso', 'lo step è in corso');
insert into appunti values ('una_voce', public.percorso_cliente());
reset role;
set local request.jwt.claims to '{}';
select is((pg_temp.nota('una_voce') -> 'stima' ->> 'cose_da_fare')::int,
  (select count(*)::int from voci) - 1 + (
    select count(*)::int from public.onboarding_passi s
    join public.onboarding_passi_def d on d.versione = s.versione and d.chiave = s.passo
    where s.client_id = pg_temp.cliente('Bruno') and d.attore = 'cliente' and s.stato <> 'fatto' and s.passo <> 'test'),
  'nella settimana test «cose da fare» conta le voci non spuntate, come il pannello');
select pg_temp.come(pg_temp.utente('Bruno'));
select is(
  (select count(*)::int from jsonb_path_query(public.percorso_cliente(), '$.passi[*] ? (@.chiave == "test").blocchi[*] ? (@.spuntata == true)')),
  1, 'la pagina dice quale voce è spuntata'
);
select lives_ok(format($$ select public.percorso_avanza('test', 'spunta', jsonb_build_object('voce', %L)) $$,
  (select id from voci order by ordine limit 1)), 'la stessa voce due volte non fa danni');
create or replace function pg_temp.spunta_tutte() returns void language plpgsql as $$
declare
  r record;
begin
  for r in select id from pg_temp.voci order by ordine offset 1 loop
    perform public.percorso_avanza('test', 'spunta', jsonb_build_object('voce', r.id));
  end loop;
end;
$$;
select pg_temp.spunta_tutte();
select is(pg_temp.mio_passo('test'), 'in_attesa_team', 'tutte spuntate: tocca al coach');
select throws_ok(format($$ select public.percorso_avanza('test', 'spunta', jsonb_build_object('voce', %L)) $$,
  (select id from voci order by ordine limit 1)), '22023', null, '(test, spunta) in attesa del team no');
select is(public.percorso_cliente() -> 'stima' ->> 'base', 'settimana_test', 'la stima: settimana test');
reset role;
select pg_temp.come('44444444-4444-4444-8444-444444444444');
select is(
  (select e.test_da_confermare from public.onboarding_incaricati_elenco() e where e.client_id = pg_temp.cliente('Bruno')),
  true, 'il coach: «Test da confermare»'
);
reset role;
select pg_temp.come('33333333-3333-4333-8333-333333333333');
select throws_ok(format($$ select public.onboarding_test_ricevuti(%L) $$, pg_temp.cliente('Bruno')), '42501', null,
  'il revisore non conferma i test');
reset role;
select pg_temp.come('44444444-4444-4444-8444-444444444444');
select lives_ok(format($$ select public.onboarding_test_ricevuti(%L) $$, pg_temp.cliente('Bruno')), 'il coach conferma i test');
select throws_ok(format($$ select public.onboarding_test_ricevuti(%L) $$, pg_temp.cliente('Bruno')), '22023', null,
  'una seconda volta no');
select is(
  (select e.programma_da_consegnare from public.onboarding_incaricati_elenco() e where e.client_id = pg_temp.cliente('Bruno')),
  true, 'poi il programma è da consegnare'
);
reset role;
set local request.jwt.claims to '{}';
select is(array[pg_temp.passo('Bruno', 'test'), pg_temp.passo('Bruno', 'programma')], array['fatto', 'in_attesa_team'],
  'il test è fatto, il programma aspetta il coach');
select is((pg_temp.task('Bruno', 'prima_scheda')).scadenza, public.oggi() + 2, 'la prima scheda scade tra 2 giorni');
select is(
  (select count(*)::int from public.notifiche n
   where n.chiave like 'onboarding/' || pg_temp.cliente('Bruno') || '/test_ricevuti/%'
     and n.destinatario_id = '33333333-3333-4333-8333-333333333333'),
  1, 'il revisore riceve «Test da rivedere»'
);
select pg_temp.come('33333333-3333-4333-8333-333333333333');
select is(
  (select row(e.gruppo, e.test_da_rivedere, e.programma_da_consegnare)::text
   from public.onboarding_incaricati_elenco() e where e.client_id = pg_temp.cliente('Bruno')),
  '(tocca_a_te,t,f)', 'il revisore: solo «Test da rivedere»'
);
reset role;
select pg_temp.come(pg_temp.utente('Bruno'));
select throws_ok($$ select public.percorso_avanza('programma', 'completa', '{}') $$, '22023', null,
  '(programma, completa) in attesa del team no');
reset role;

-- ---------------------------------------------------------------------------
-- 8. The deliveries and the programme
-- ---------------------------------------------------------------------------
select pg_temp.come('44444444-4444-4444-8444-444444444444');
select throws_ok(format($$ select public.onboarding_programma_consegnato(%L, now() + interval '35 days') $$, pg_temp.cliente('Bruno')),
  '22023', 'Aggiungi almeno una consegna prima.', 'senza consegne il programma non si consegna');
select throws_ok(format($$ select public.onboarding_consegna_aggiungi(%L, 'video', 'Spiegazione della scheda', 'https://vimeo.com/1', true) $$,
  pg_temp.cliente('Bruno')), '22023', 'Incolla il link del video di YouTube.', 'un video che non è di YouTube no');
insert into appunti values ('video', public.onboarding_consegna_aggiungi(pg_temp.cliente('Bruno'), 'video',
  'Spiegazione della scheda', 'https://youtu.be/AbCdEfGhIjK', true));
select is(pg_temp.nota('video') ->> 'youtube_id', 'AbCdEfGhIjK', 'l''id del video dal link');
insert into appunti values ('pdf', public.onboarding_consegna_aggiungi(pg_temp.cliente('Bruno'), 'pdf',
  'Lista della spesa', 'https://drive.google.com/file/d/lista115', true));
select is(pg_temp.nota('pdf') ->> 'obbligatoria', 'false', 'un PDF non è mai obbligatorio');
insert into appunti values ('da_togliere', public.onboarding_consegna_aggiungi(pg_temp.cliente('Bruno'), 'link',
  'Link sbagliato', 'https://example.test/sbagliato', false));
select lives_ok(format($$ select public.onboarding_consegna_togli(%L) $$, pg_temp.nota('da_togliere') ->> 'id'), 'una consegna si toglie');
reset role;
select pg_temp.come(pg_temp.utente('Bruno'));
select throws_ok(format($$ select public.video_progresso(null, %L, 100, array[int4range(0, 100)]) $$, pg_temp.nota('video') ->> 'id'),
  '22023', 'Questo passo non è ancora disponibile.', 'il video consegnato prima della consegna del programma no');
select is(jsonb_array_length(public.percorso_cliente() -> 'consegne'), 0, 'e le consegne non si vedono ancora');
reset role;
select pg_temp.come('44444444-4444-4444-8444-444444444444');
select throws_ok(format($$ select public.onboarding_programma_consegnato(%L, now() - interval '1 day') $$, pg_temp.cliente('Bruno')),
  '22023', null, 'un checkpoint nel passato no');
select is(
  public.onboarding_programma_consegnato(pg_temp.cliente('Bruno'), (public.oggi() + 35 + time '18:00') at time zone 'Europe/Rome') ->> 'avviso',
  'programma_consegnato', 'il programma consegnato: il cliente va avvisato');
reset role;
set local request.jwt.claims to '{}';
select is(pg_temp.passo('Bruno', 'programma'), 'disponibile', 'il programma è disponibile al cliente');
select is((pg_temp.call('Bruno', 'checkpoint')).stato, 'prenotata', 'nasce il primo checkpoint');
select is((pg_temp.task('Bruno', 'prima_scheda')).stato::text, 'completato', 'la prima scheda è completata');
select is((pg_temp.task('Bruno', 'template_alimentare')).scadenza, public.oggi() + 5, 'il template alimentare scade tra 5 giorni');
select is((pg_temp.task('Bruno', 'primo_checkpoint')).scadenza, public.oggi() + 35, 'il primo checkpoint il suo giorno');
select pg_temp.come(pg_temp.utente('Bruno'));
insert into appunti values ('consegnato', public.percorso_cliente());
select is(jsonb_array_length(pg_temp.nota('consegnato') -> 'consegne'), 2, 'il cliente vede le sue consegne');
select is(pg_temp.nota('consegnato') -> 'checkpoint' ->> 'ora', '18:00', 'e il primo checkpoint');
select is(pg_temp.nota('consegnato') -> 'stima' ->> 'base', 'iniziato', 'il razzo parte');
select throws_ok($$ select public.percorso_avanza('programma', 'completa', '{}') $$, '22023',
  'Guarda i video obbligatori prima di andare avanti.', 'senza il video obbligatorio non si completa');
select throws_ok(format($$ select public.video_progresso(null, %L, 100, array[int4range(0, 95)]) $$, pg_temp.nota('video') ->> 'id'),
  '22023', 'Intervalli non validi', 'il video consegnato non si segna visto in una sola chiamata');
select is(public.video_progresso(null, (pg_temp.nota('video') ->> 'id')::uuid, 100, array[int4range(0, 30)]) ->> 'visto', 'false',
  'il primo invio: 30 secondi');
reset role;
update public.onboarding_video_visti set created_at = now() - interval '1 hour'
where consegna_id = (pg_temp.nota('video') ->> 'id')::uuid;
select pg_temp.come(pg_temp.utente('Bruno'));
select is(public.video_progresso(null, (pg_temp.nota('video') ->> 'id')::uuid, 100, array[int4range(30, 95)]) ->> 'visto', 'true',
  'un''ora dopo, il video consegnato visto al 95%');
select is(pg_temp.mio_passo('programma'), 'disponibile', 'guardarlo non porta il programma in corso: si completa da disponibile');
insert into appunti values ('lanciato', public.percorso_avanza('programma', 'completa', '{}'));
select is(pg_temp.nota('lanciato') ->> 'lanciato', 'true', 'lanciato');
select is(pg_temp.nota('lanciato') -> 'percorso' ->> 'stato', 'completato', 'l''onboarding è completato');
select is(jsonb_array_length(pg_temp.nota('lanciato') -> 'dopo_lancio'), 3, 'la pagina dopo il lancio');
reset role;
set local request.jwt.claims to '{}';
select is(
  (select count(*)::int from public.onboarding_eventi where client_id = pg_temp.cliente('Bruno') and tipo = 'onboarding_completato'),
  1, 'il registro lo dice'
);
select is(
  (select count(*)::int from public.notifiche n
   where n.chiave like 'onboarding/' || pg_temp.cliente('Bruno') || '/completato/%'
     and n.destinatario_id in ('44444444-4444-4444-8444-444444444444', '11111111-1111-4111-8111-111111111111')),
  2, 'il coach e l''admin lo sanno'
);
select pg_temp.come('44444444-4444-4444-8444-444444444444');
select is(
  (select e.gruppo from public.onboarding_incaricati_elenco() e where e.client_id = pg_temp.cliente('Bruno')),
  'completati', 'per il coach è tra i completati'
);
reset role;

-- ---------------------------------------------------------------------------
-- 9. What the people in charge read
-- ---------------------------------------------------------------------------
insert into public.onboarding_allegati (id, client_id, campo, percorso, nome_file, tipo, byte, stato, caricato_il)
values ('11500000-0000-4000-8000-000000000001', pg_temp.cliente('Bruno'), 'attrezzatura',
  pg_temp.cliente('Bruno')::text || '/11500000-0000-4000-8000-000000000001', 'sbarra.jpg', 'image/jpeg', 1000, 'caricato', now());

create or replace function pg_temp.tabelle_lette()
returns integer
language plpgsql
as $$
declare
  r record;
  n integer;
  tot integer := 0;
begin
  for r in select x from unnest(array['v_onboarding', 'clients', 'onboarding_inviti', 'onboarding_inviti_token',
             'onboarding_eventi', 'onboarding_questionari', 'onboarding_allegati', 'onboarding_video_visti', 'clienti_call',
             'clienti_consegne', 'clienti_consensi', 'clienti_account', 'sales', 'payments']) x loop
    begin
      execute format('select count(*) from public.%I where %s', r.x,
        case when r.x in ('clients') then 'id = ' || quote_literal(pg_temp.cliente('Bruno'))
             when r.x = 'payments' then 'sale_id = ' || quote_literal((select sale_id from pg_temp.casi where nome = 'Bruno'))
             when r.x = 'onboarding_inviti_token' then 'true'
             else 'client_id = ' || quote_literal(pg_temp.cliente('Bruno')) end) into n;
      tot := tot + n;
    exception when others then
      null;
    end;
  end loop;
  return tot;
end;
$$;

insert into public.onboarding_questionari (client_id, risposte)
values (pg_temp.cliente('Bruno'), '{"email": "bruno115@example.test", "telefono": "+39 333 000 0115"}'::jsonb)
on conflict (client_id) do update set risposte = onboarding_questionari.risposte || excluded.risposte;
select pg_temp.come('44444444-4444-4444-8444-444444444444');
select is(pg_temp.tabelle_lette(), 0,
  'il coach non legge niente del cliente dalle tabelle: né la vista, né il cliente, né l''invito, né il questionario, né i soldi');
insert into appunti values ('scheda_coach', public.onboarding_scheda_incaricato(pg_temp.cliente('Bruno')));
select ok(pg_temp.nota('scheda_coach') ? 'questionario' and pg_temp.nota('scheda_coach') ? 'allegati'
          and pg_temp.nota('scheda_coach') ? 'telegram', 'il coach riceve dalla funzione il questionario, i file e Telegram');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(pg_temp.nota('scheda_coach')) k
   where k in ('email', 'telefono', 'note', 'invito', 'sale_id', 'pagamento_confermato', 'eventi', 'registro')),
  null, 'mai email, telefono, note, invito, vendita, pagamento o registro'
);
select ok(not (pg_temp.nota('scheda_coach') -> 'questionario' -> 'risposte' ?| array['email', 'telefono']),
  'nemmeno dentro le risposte del questionario: email e telefono restano dell''admin');
select is((select count(*)::int from public.onboarding_allegato_apri('11500000-0000-4000-8000-000000000001')), 1,
  'il coach apre un file del suo cliente');
reset role;
select pg_temp.come('33333333-3333-4333-8333-333333333333');
insert into appunti values ('scheda_revisore', public.onboarding_scheda_incaricato(pg_temp.cliente('Bruno')));
select ok(not (pg_temp.nota('scheda_revisore') ? 'questionario') and not (pg_temp.nota('scheda_revisore') ? 'telegram'),
  'il revisore mai il questionario né Telegram');
select is((select count(*)::int from public.onboarding_allegato_apri('11500000-0000-4000-8000-000000000001')), 0,
  'né un file');
select is(pg_temp.tabelle_lette(), 0, 'né le tabelle');
reset role;
select pg_temp.come('55555555-5555-4555-8555-555555555555');
insert into appunti values ('scheda_responsabile', public.onboarding_scheda_incaricato(pg_temp.cliente('Bruno')));
select ok(not (pg_temp.nota('scheda_responsabile') ? 'questionario') and pg_temp.nota('scheda_responsabile') ? 'telegram',
  'il responsabile Telegram, mai il questionario');
select is((select count(*)::int from public.onboarding_allegato_apri('11500000-0000-4000-8000-000000000001')), 0,
  'né un file');
reset role;
select pg_temp.come('99999999-9999-4999-8999-999999990115');
select throws_ok(format($$ select public.onboarding_scheda_incaricato(%L) $$, pg_temp.cliente('Bruno')), '42501',
  'Questo cliente non è tra i tuoi.', 'un coach non incaricato non legge la scheda');
select is((select count(*)::int from public.onboarding_incaricati_elenco()), 0, 'e il suo elenco è vuoto');
reset role;
select pg_temp.come('11111111-1111-4111-8111-111111111111');
select is((select count(*)::int from public.onboarding_allegato_apri('11500000-0000-4000-8000-000000000001')), 1,
  'l''admin apre il file');
select ok((select count(*) >= 3 from public.onboarding_incaricati_elenco()), 'l''admin vede tutti i clienti registrati');
reset role;

-- a suspended client is «In pausa», without a reason (Dario: the admin revokes his link)
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select public.onboarding_revoca((select invito_id from casi where nome = 'Dario'), 'Prova del test 115');
set local request.jwt.claims to '{}';
select pg_temp.come('44444444-4444-4444-8444-444444444444');
select is(
  (select row(e.gruppo, e.passo, e.call_da_confermare or e.richiesta_community or e.preparazione_incompleta)::text
   from public.onboarding_incaricati_elenco() e where e.client_id = pg_temp.cliente('Dario')),
  '(in_pausa,,f)', 'un cliente sospeso è «In pausa», senza step né code'
);
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.onboarding_scheda_incaricato(pg_temp.cliente('Dario'))) k),
  array['client_id', 'cognome', 'gruppo', 'in_pausa', 'incarichi', 'nome'], 'e la scheda dice solo il nome e «In pausa»'
);
select throws_ok(format($$ select public.onboarding_sblocca_passo(%L, 'community', 'Prova') $$, pg_temp.cliente('Dario')),
  '22023', 'L''onboarding di questo cliente è in pausa.', 'e nessuna azione');
reset role;
-- nor from the tables or the files: «In pausa», and only that
insert into public.onboarding_allegati (id, client_id, campo, percorso, nome_file, tipo, byte, stato, caricato_il)
values ('11500000-0000-4000-8000-000000000002', pg_temp.cliente('Dario'), 'attrezzatura',
  pg_temp.cliente('Dario')::text || '/11500000-0000-4000-8000-000000000002', 'panca.jpg', 'image/jpeg', 1000, 'caricato', now());
insert into public.clienti_telegram (client_id, username) values (pg_temp.cliente('Dario'), 'dario_115')
on conflict (client_id) do update set username = excluded.username;
select pg_temp.come('44444444-4444-4444-8444-444444444444');
select is(
  (select count(*)::int from public.onboarding_allegato_apri('11500000-0000-4000-8000-000000000002'))
    + (select count(*)::int from public.onboarding_percorsi where client_id = pg_temp.cliente('Dario'))
    + (select count(*)::int from public.onboarding_passi where client_id = pg_temp.cliente('Dario'))
    + (select count(*)::int from public.clienti_telegram where client_id = pg_temp.cliente('Dario')),
  0, 'di un cliente in pausa il coach non apre i file e non legge percorso, step o Telegram dalle tabelle'
);
reset role;

-- ---------------------------------------------------------------------------
-- 10. «Sblocca step» and «Riavvia onboarding» (Carlo)
-- ---------------------------------------------------------------------------
select pg_temp.come('44444444-4444-4444-8444-444444444444');
select throws_ok(format($$ select public.onboarding_sblocca_passo(%L, 'test', '  ') $$, pg_temp.cliente('Carlo')),
  '22023', null, 'senza motivo no');
select throws_ok(format($$ select public.onboarding_sblocca_passo(%L, 'call', 'Prova') $$, pg_temp.cliente('Carlo')),
  '22023', 'La call di onboarding si chiude con «Com''è andata», quando è stata svolta.', 'la call non si sblocca: ha la sua azione');
select throws_ok(format($$ select public.onboarding_sblocca_passo(%L, 'programma', 'Prova') $$, pg_temp.cliente('Carlo')),
  '22023', 'Il programma si apre con «Consegna il programma».', 'il programma nemmeno');
select lives_ok(format($$ select public.onboarding_sblocca_passo(%L, 'test', 'Il link dei test non si apre') $$, pg_temp.cliente('Carlo')),
  'il coach sblocca la settimana test');
select throws_ok(format($$ select public.onboarding_sblocca_passo(%L, 'test', 'Ancora') $$, pg_temp.cliente('Carlo')),
  '22023', 'Questo step non è bloccato.', 'uno step non bloccato no');
select is((select count(*)::int from public.onboarding_eventi), 0, 'il coach non legge il registro');
reset role;
set local request.jwt.claims to '{}';
select is(pg_temp.passo('Carlo', 'test'), 'disponibile', 'lo step è disponibile');
select is(
  (select row(attore, autore_id)::text from public.onboarding_eventi where client_id = pg_temp.cliente('Carlo') and tipo = 'passo_sbloccato'),
  '(team,44444444-4444-4444-8444-444444444444)', 'il registro con l''autore, che legge solo l''admin'
);
select pg_temp.come('44444444-4444-4444-8444-444444444444');
select lives_ok(format($$ select public.onboarding_riavvia(%L, 'Ripartiamo da capo') $$, pg_temp.cliente('Carlo')), 'riavvia');
reset role;
set local request.jwt.claims to '{}';
select is(
  (select array_agg(s.passo || ':' || s.stato order by d.ordine)
   from public.onboarding_passi s join public.onboarding_passi_def d on d.versione = s.versione and d.chiave = s.passo
   where s.client_id = pg_temp.cliente('Carlo')),
  array['benvenuto:disponibile', 'regole:fatto', 'questionario:fatto', 'prenotazione:disponibile', 'community:bloccato',
        'call:bloccato', 'obiettivo:bloccato', 'test:bloccato', 'programma:bloccato'],
  'riavviato: regole e questionario restano fatti, il resto riparte'
);
select is((pg_temp.call('Carlo')).stato, 'annullata', 'la call di prima è annullata');
select is((select stato from public.onboarding_percorsi where client_id = pg_temp.cliente('Carlo')), 'in_corso', 'il percorso è in corso');

-- the video of the welcome does not count (YouTube changed its protocol): the coach closes the step, the client
-- goes on and the onboarding still ends
delete from public.onboarding_video_visti where client_id = pg_temp.cliente('Carlo');
select pg_temp.come('44444444-4444-4444-8444-444444444444');
select is(public.onboarding_sblocca_passo(pg_temp.cliente('Carlo'), 'benvenuto', 'Il video non conta i secondi') ->> 'chiuso',
  'true', 'lo step fermo sul video si chiude');
reset role;
set local request.jwt.claims to '{}';
select is(array[pg_temp.passo('Carlo', 'benvenuto'), pg_temp.passo('Carlo', 'prenotazione')], array['fatto', 'disponibile'],
  'il benvenuto è fatto e il percorso va avanti');
-- every other step done, the programme delivered without compulsory deliveries
update public.onboarding_passi set stato = 'fatto', completato_il = now()
where client_id = pg_temp.cliente('Carlo') and passo <> 'programma';
update public.onboarding_passi set stato = 'disponibile', dati = jsonb_build_object('consegnato_il', now())
where client_id = pg_temp.cliente('Carlo') and passo = 'programma';
select pg_temp.come(pg_temp.utente('Carlo'));
select is(public.percorso_avanza('programma', 'completa', '{}') -> 'percorso' ->> 'stato', 'completato',
  'il video del benvenuto mai visto non ferma il lancio: l''onboarding si completa');
reset role;

-- ---------------------------------------------------------------------------
-- 11. The opening of the client area
-- ---------------------------------------------------------------------------
select pg_temp.come('11111111-1111-4111-8111-111111111111');
select throws_ok($$ update public.onboarding_impostazioni set aperto_ai_clienti = true $$, '42501', null,
  'un PATCH diretto di aperto_ai_clienti no, nemmeno dall''admin');
select lives_ok($$ update public.onboarding_impostazioni set avvisa_cliente_email = false, link_prenotazione = 'https://calendar.google.com/calendar/appointments/115' $$,
  'le altre impostazioni di B2 sì');
select throws_ok($$ select public.onboarding_apri_ai_clienti() $$, '22023', null, 'con i segnaposto non si apre');
reset role;
select pg_temp.come('44444444-4444-4444-8444-444444444444');
select throws_ok($$ select public.onboarding_apri_ai_clienti() $$, '42501', null, 'il coach non apre l''area');
reset role;
set local request.jwt.claims to '{}';
update public.contenuti_blocchi
set titolo = replace(titolo, '[Da scrivere', 'Scritto'), corpo = replace(corpo, '[Da scrivere', 'Scritto'),
    url = replace(url, 'https://da-scrivere.invalid/', 'https://example.test/')
where pubblicato;
update public.contenuti_blocchi set youtube_id = 'BbCcDdEeFfG' where youtube_id = 'XXXXXXXXXXX';
select is((select scade_il from public.onboarding_inviti where id = '0b0a0000-0000-4000-8000-000000000022'), null,
  'un link attivo con l''area chiusa non ha ancora i suoi giorni');
select pg_temp.come('11111111-1111-4111-8111-111111111111');
select is(public.onboarding_apri_ai_clienti() ->> 'aperto', 'true', 'senza segnaposto l''area si apre');
reset role;
set local request.jwt.claims to '{}';
select ok((select aperto_ai_clienti from public.onboarding_impostazioni), 'aperta');
select pg_temp.come('11111111-1111-4111-8111-111111111111');
select throws_ok($$ update public.onboarding_impostazioni set link_prenotazione = null $$, '22023', null,
  'con l''area aperta la pagina di prenotazione non si toglie');
reset role;
set local request.jwt.claims to '{}';
select ok((select scade_il > now() from public.onboarding_inviti where id = '0b0a0000-0000-4000-8000-000000000022'),
  'aperta: i link attivi ricevono i loro giorni');
select pg_temp.come('11111111-1111-4111-8111-111111111111');
select is(public.onboarding_chiudi_ai_clienti() ->> 'aperto', 'false', 'e si richiude');
reset role;
set local request.jwt.claims to '{}';
select ok(not (select aperto_ai_clienti from public.onboarding_impostazioni), 'chiusa');
select is(
  (select array_agg((dati_dopo ->> 'aperto_ai_clienti') || ':' || coalesce(utente_id::text, '') order by created_at, dati_dopo ->> 'aperto_ai_clienti' desc)
   from public.audit_log where tabella = 'onboarding_impostazioni'),
  array['true:11111111-1111-4111-8111-111111111111', 'false:11111111-1111-4111-8111-111111111111'],
  'apertura e chiusura restano nel registro delle modifiche, con chi le ha fatte');

select * from finish();
rollback;
