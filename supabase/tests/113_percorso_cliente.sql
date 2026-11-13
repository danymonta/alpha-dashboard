-- Guided onboarding, release B1a (1.79.0, 20261109090100_percorso_base.sql and 20261109090200_percorso_funzioni.sql):
-- the client's page (only his own data, the content only of the unlocked steps, never the fields of the team,
-- the team without emails, the estimate never negative, the wait after the rules), the unlock (never past the
-- last step served, never a step of the team), percorso_avanza (a closed list), the videos, the consent, the
-- CMS (only the admin writes), the backup, the preview of a deletion, the cleanup, and «Elimina onboarding».
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(68);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
insert into auth.oauth_clients (id, client_name, registration_type, client_type, redirect_uris,
  grant_types, token_endpoint_auth_method, deleted_at)
values ('9c000000-0000-4000-8000-000000000113', 'Claude', 'manual', 'public',
  'https://claude.ai/api/mcp/auth_callback', 'authorization_code,refresh_token', 'none', null);
insert into auth.sessions (id, user_id, created_at, updated_at, aal, oauth_client_id, not_after)
values ('9e113000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', now(), now(), 'aal1',
  '9c000000-0000-4000-8000-000000000113', null);

create temp table casi (nome text primary key, sale_id uuid, client_id uuid, invito_id uuid, utente uuid) on commit drop;
create temp table appunti (chiave text primary key, valore jsonb) on commit drop;
grant select on casi to authenticated;
grant select, insert, update on appunti to authenticated;

create or replace function pg_temp.h(p text) returns text language sql immutable as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;
create or replace function pg_temp.cliente(p_nome text) returns uuid language sql as $$
  select client_id from pg_temp.casi where nome = p_nome $$;
create or replace function pg_temp.invito(p_nome text) returns uuid language sql as $$
  select invito_id from pg_temp.casi where nome = p_nome $$;
create or replace function pg_temp.vendita(p_nome text) returns uuid language sql as $$
  select sale_id from pg_temp.casi where nome = p_nome $$;
create or replace function pg_temp.utente(p_nome text) returns uuid language sql as $$
  select utente from pg_temp.casi where nome = p_nome $$;
-- the ids of the blocks, read as postgres (the client reads no block)
create temp table blocchi on commit drop as
select b.id, b.passo, b.tipo, b.titolo, b.ordine from public.contenuti_blocchi b where b.versione_flusso = 1 and b.pagina = 'passo';
grant select, insert on blocchi to authenticated;
create or replace function pg_temp.blocco(p_passo text, p_tipo text) returns uuid language sql as $$
  select b.id from pg_temp.blocchi b where b.passo = p_passo and b.tipo = p_tipo order by b.ordine limit 1 $$;
create or replace function pg_temp.passo(p_nome text, p_passo text) returns text language sql as $$
  select s.stato from public.onboarding_passi s where s.client_id = pg_temp.cliente(p_nome) and s.passo = p_passo $$;

-- the state of a step as the client sees it (he reads no table)
create or replace function pg_temp.mio_passo(p_passo text) returns text language sql as $$
  select jsonb_path_query_first(public.percorso_cliente(), '$.passi[*] ? (@.chiave == $p).stato', jsonb_build_object('p', p_passo)) #>> '{}' $$;

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

-- the wizard as the admin; a test link, the payment confirmed by hand; registered through /join when asked
create or replace function pg_temp.prepara(p_nome text, p_registra boolean default true)
returns void
language plpgsql
as $$
declare
  r jsonb;
  v jsonb;
  v_chiave text := md5(random()::text) || md5(random()::text);
  v_token text;
begin
  perform set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);
  r := public.nuovo_cliente(
    jsonb_build_object(
      'product_id', (select id from public.products order by created_at limit 1), 'data_vendita', public.oggi(),
      'data_inizio', public.oggi() + 7, 'valore_contratto', 2400, 'numero_rate', 3,
      'nome', p_nome, 'cognome', 'Centotredici', 'email', lower(p_nome) || '@example.test'),
    jsonb_build_object('coach', '11111111-1111-4111-8111-111111111111', 'responsabile', '11111111-1111-4111-8111-111111111111'));
  insert into pg_temp.casi (nome, sale_id, client_id, invito_id)
  values (p_nome, (r ->> 'sale_id')::uuid, (r ->> 'client_id')::uuid, (r ->> 'invito_id')::uuid);
  perform public.onboarding_segna_prova((r ->> 'invito_id')::uuid, true);
  perform public.onboarding_conferma_pagamento((r ->> 'invito_id')::uuid);
  perform set_config('request.jwt.claims', '{}', true);

  if p_registra then
    select t.token into v_token from public.onboarding_inviti_token t where t.invito_id = (r ->> 'invito_id')::uuid;
    perform public.onboarding_join_apri(pg_temp.h(v_token), pg_temp.h(v_chiave));
    perform public.onboarding_join_codice(pg_temp.h(v_chiave), lower(p_nome) || '@example.test', pg_temp.h('12345678'));
    v := public.onboarding_join_verifica(pg_temp.h(v_chiave), '12345678');
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token)
    values ('00000000-0000-0000-0000-000000000000', (v ->> 'utente_id')::uuid, 'authenticated', 'authenticated',
      v ->> 'email', '', now(), '{"tipo":"cliente"}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
    update pg_temp.casi set utente = (v ->> 'utente_id')::uuid where nome = p_nome;
  end if;
end;
$$;

select pg_temp.prepara('Anna');
-- a video in the questionnaire, which the client cannot see yet
insert into public.contenuti_blocchi (versione_flusso, pagina, passo, ordine, tipo, titolo, youtube_id, obbligatorio)
values (1, 'passo', 'questionario', 9, 'video', 'Video del questionario', 'YYYYYYYYYYY', true);
insert into blocchi select b.id, b.passo, b.tipo, b.titolo, b.ordine from public.contenuti_blocchi b where b.titolo = 'Video del questionario';

-- ---------------------------------------------------------------------------
-- 1. The page
-- ---------------------------------------------------------------------------
select pg_temp.web(pg_temp.utente('Anna'));
insert into appunti values ('pagina', public.percorso_cliente());
select is((select valore -> 'cliente' ->> 'nome' from appunti where chiave = 'pagina'), 'Anna', 'il suo nome di battesimo');
select is(
  (select array_agg(n ->> 'chiave' || ':' || (n ->> 'stato') order by (n ->> 'ordine')::int)
   from appunti, jsonb_array_elements(valore -> 'nodi') n where chiave = 'pagina'),
  array['benvenuto:attuale', 'questionario:futuro', 'call_prenotata:futuro', 'community:futuro',
        'call_onboarding:futuro', 'settimana_test:futuro', 'inizio_percorso:futuro'],
  'sette nodi: Benvenuto è quello attuale'
);
select is((select jsonb_array_length(valore -> 'passi') from appunti where chiave = 'pagina'), 9, 'nove step');
select is(
  (select array_agg(p ->> 'chiave' order by p ->> 'chiave') from appunti, jsonb_array_elements(valore -> 'passi') p
   where chiave = 'pagina' and p ? 'blocchi'),
  array['benvenuto'], 'i blocchi solo dello step sbloccato'
);
select is(
  (select count(*)::int from appunti, jsonb_array_elements(valore -> 'passi') p
   where chiave = 'pagina' and (p ? 'dati' or p ? 'nota')),
  0, 'mai i campi del team (dati, nota)'
);
select is(
  (select array_agg(distinct k order by k)
   from appunti, jsonb_array_elements(valore -> 'passi') p, jsonb_array_elements(p -> 'blocchi') b, jsonb_object_keys(b) k
   where chiave = 'pagina'),
  array['corpo', 'id', 'obbligatorio', 'tipo', 'titolo', 'url', 'video', 'youtube_id'],
  'un blocco ha id e contenuto, mai pubblicato, ordine, versione o date'
);
select ok(
  (select not (valore::text like '%Video del questionario%') from appunti where chiave = 'pagina'),
  'il contenuto di uno step bloccato non arriva, nemmeno nei video da vedere'
);
select is(
  (select array_agg(t ->> 'ruolo' order by t ->> 'ruolo') from appunti, jsonb_array_elements(valore -> 'team') t where chiave = 'pagina'),
  array['Coach', 'Personal Success Manager'], 'il team con i ruoli'
);
select ok(
  (select not (valore -> 'team')::text like '%@%' and not (valore -> 'team')::text like '%email%' from appunti where chiave = 'pagina'),
  'il team senza email'
);
select is(
  (select (valore -> 'stima') - 'data' from appunti where chiave = 'pagina'),
  jsonb_build_object('giorni', 12, 'quasi', false, 'base', 'call_non_prenotata', 'cose_da_fare', 7,
                     'video_mancanti', jsonb_build_array('Il video di benvenuto')),
  'la stima: oggi + 3 + 7 + 2, sette cose da fare, il video che manca'
);
select is((select (valore -> 'stima' ->> 'data')::date from appunti where chiave = 'pagina'), public.oggi() + 12, 'la data stimata');
select is((select valore ->> 'in_attesa' from appunti where chiave = 'pagina'), 'false', 'non in attesa: c''è un passo da fare');
select is(
  (select valore -> 'consensi' -> 0 ->> 'versione_in_vigore' from appunti where chiave = 'pagina'), '2026-11-12',
  'la versione in vigore del consenso'
);

-- ---------------------------------------------------------------------------
-- 2. percorso_avanza: a closed list, its states
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.percorso_avanza('regole', 'accetta', '{}') $$, '22023', 'Questo passo non è ancora disponibile.',
  'le regole prima del benvenuto no');
select throws_ok($$ select public.percorso_avanza('benvenuto', 'salta', '{}') $$, '22023', 'Questo passo non è ancora disponibile.',
  'un''azione che non c''è no');
select throws_ok($$ select public.percorso_avanza('programma', 'completa', '{}') $$, '22023', 'Questo passo non è ancora disponibile.',
  'una coppia fuori dall''elenco no');
select throws_ok($$ select public.percorso_avanza('benvenuto', 'completa', '{}') $$, '22023',
  'Guarda il video fino in fondo prima di andare avanti.', 'senza il video visto no');

-- ---------------------------------------------------------------------------
-- 3. The video
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$ select public.video_progresso(null, %L, 100, array[int4range(0, 10)]) $$, gen_random_uuid()),
  '22023', null, 'una consegna che non c''è no');
select throws_ok(
  format($$ select public.video_progresso(%L, null, 100, (select array_agg(int4range(i, i + 1)) from generate_series(0, 50) i)) $$,
         pg_temp.blocco('benvenuto', 'video')),
  '22023', null, 'più di 50 intervalli no');
select throws_ok(
  format($$ select public.video_progresso(%L, null, 100, array[int4range(90, 110)]) $$, pg_temp.blocco('benvenuto', 'video')),
  '22023', null, 'un intervallo fuori dalla durata no');
select throws_ok(
  format($$ select public.video_progresso(%L, null, 100, array[int4range(0, 10)]) $$,
         (select id from pg_temp.blocchi where titolo = 'Video del questionario')),
  '22023', 'Questo passo non è ancora disponibile.', 'il video di uno step bloccato no');
select throws_ok(
  format($$ select public.video_progresso(%L, null, 20, array[int4range(0, 20)]) $$, pg_temp.blocco('benvenuto', 'video')),
  '22023', 'Durata non valida', 'un video sotto i 30 secondi no: la durata la dice il player, non basta a segnarlo visto');
select throws_ok(
  format($$ select public.video_progresso(%L, null, 100, array[int4range(0, 95)]) $$, pg_temp.blocco('benvenuto', 'video')),
  '22023', 'Intervalli non validi', 'un video intero in una chiamata no: i secondi non corrono più dell''orologio');
select is(
  public.video_progresso(pg_temp.blocco('benvenuto', 'video'), null, 100, array[int4range(0, 25)]),
  '{"visto": false, "percentuale": 25.00}'::jsonb, 'il primo invio: 25%'
);
select throws_ok(
  format($$ select public.video_progresso(%L, null, 100, array[int4range(25, 50)]) $$, pg_temp.blocco('benvenuto', 'video')),
  '22023', 'Intervalli non validi', 'subito dopo, altri 25 secondi no');
-- the minutes pass: the first send is an hour ago
reset role;
update public.onboarding_video_visti set created_at = now() - interval '1 hour'
where blocco_id = pg_temp.blocco('benvenuto', 'video');
select pg_temp.web(pg_temp.utente('Anna'));
select is(
  public.video_progresso(pg_temp.blocco('benvenuto', 'video'), null, 100, array[int4range(25, 50)]),
  '{"visto": false, "percentuale": 50.00}'::jsonb, 'metà video: 50%'
);
select is(
  public.video_progresso(pg_temp.blocco('benvenuto', 'video'), null, 999, array[int4range(40, 95), int4range(30, 35)]),
  '{"visto": true, "percentuale": 95.00}'::jsonb, 'i secondi si uniscono a quelli già visti, la durata è la prima: 95%, visto'
);
select is(pg_temp.mio_passo('benvenuto'), 'in_corso', 'guardare il video avvia lo step');

-- ---------------------------------------------------------------------------
-- 4. The welcome and the rules
-- ---------------------------------------------------------------------------
select is(
  (select jsonb_path_query_first(public.percorso_avanza('benvenuto', 'completa', '{}'), '$.passi[*] ? (@.chiave == "regole").stato')),
  '"disponibile"'::jsonb, 'benvenuto completato: le regole si aprono'
);
select is(pg_temp.mio_passo('benvenuto'), 'fatto', 'e il benvenuto è fatto');
select throws_ok($$ select public.percorso_avanza('benvenuto', 'completa', '{}') $$, '22023', 'Questo passo è già completato.',
  'una seconda volta no');
reset role;
insert into appunti values ('regole', (select jsonb_agg(b.id) from public.contenuti_blocchi b
  where b.versione_flusso = 1 and b.passo = 'regole' and b.tipo = 'regola' and b.pubblicato));
select pg_temp.web(pg_temp.utente('Anna'));
select throws_ok(
  $$ select public.percorso_avanza('regole', 'accetta', jsonb_build_object(
       'regole', (select valore - 0 from appunti where chiave = 'regole'), 'consenso_salute', '2026-11-12')) $$,
  '22023', 'Spunta tutte le regole per andare avanti.', 'una regola non spuntata no'
);
select throws_ok(
  $$ select public.percorso_avanza('regole', 'accetta', jsonb_build_object(
       'regole', (select valore from appunti where chiave = 'regole'), 'consenso_salute', '2026-01-01')) $$,
  '22023', 'Il testo del consenso è cambiato: rileggilo e accettalo di nuovo.', 'una versione del consenso non in vigore no'
);
insert into appunti values ('dopo_regole', public.percorso_avanza('regole', 'accetta', jsonb_build_object(
  'regole', (select valore from appunti where chiave = 'regole'), 'consenso_salute', '2026-11-12')));
select is((select valore ->> 'in_attesa' from appunti where chiave = 'dopo_regole'), 'false',
  'dopo le regole: niente attesa, c''è il questionario (B1b)');
select is(pg_temp.mio_passo('questionario'), 'disponibile', 'il questionario si apre: è l''ultimo step servito');
select is(pg_temp.mio_passo('prenotazione'), 'bloccato', 'la prenotazione no: aspetta il questionario');
select is((select valore -> 'stima' ->> 'cose_da_fare' from appunti where chiave = 'dopo_regole'), '5', 'cinque cose da fare');
select is(
  (select valore -> 'nodi' -> 0 ->> 'stato' from appunti where chiave = 'dopo_regole'), 'completato', 'il nodo Benvenuto è completato'
);
select is(public.consenso_dai('salute', '2026-11-12') ->> 'versione', '2026-11-12', 'consenso_dai: lo stesso consenso, nessun doppione');
select throws_ok($$ select public.consenso_dai('salute', '2025-01-01') $$, '22023', null, 'una versione vecchia no');
select throws_ok($$ select public.consenso_dai('wins', '2026-11-12') $$, '22023', null, 'un tipo che non c''è no');
reset role;
set local request.jwt.claims to '{}';
select is(
  (select row(count(*), min(versione))::text from public.clienti_consensi where client_id = pg_temp.cliente('Anna') and revocato_il is null),
  '(1,2026-11-12)', 'un solo consenso vivo, con la sua versione'
);
select is(
  (select array_agg(e.tipo || ':' || e.attore order by e.created_at) from public.onboarding_eventi e
   where e.client_id = pg_temp.cliente('Anna') and e.tipo in ('passo_completato', 'consenso_dato')),
  array['passo_completato:cliente', 'consenso_dato:cliente', 'passo_completato:cliente'], 'il registro, dal cliente'
);

-- ---------------------------------------------------------------------------
-- 5. The unlock: never a step of the team
-- ---------------------------------------------------------------------------
update public.onboarding_passi set stato = 'fatto' where client_id = pg_temp.cliente('Anna') and passo in ('questionario', 'prenotazione', 'call');
select public.onboarding_sblocca(pg_temp.cliente('Anna'));
select is(pg_temp.passo('Anna', 'obiettivo'), 'bloccato', 'con la call fatta e il task dell''obiettivo aperto, l''obiettivo resta bloccato');
select is(pg_temp.passo('Anna', 'community'), 'disponibile', 'la community sì: dalla 1.81.0 il percorso è servito fino in fondo');
select ok(
  (select array_agg(chiave order by chiave) = array['obiettivo', 'programma'] from public.onboarding_passi_def where versione = 1 and sblocco = 'team'),
  'gli step del team: obiettivo e programma'
);

-- ---------------------------------------------------------------------------
-- 6. Only his own: another client
-- ---------------------------------------------------------------------------
select pg_temp.web('0b0b0000-0000-4000-8000-000000000031');
select is(public.percorso_cliente() -> 'cliente' ->> 'nome', 'Davide', 'il cliente del seed legge solo il suo percorso');
select is(public.percorso_cliente() ->> 'in_attesa', 'false', 'ed è a metà del questionario (1.80.0), non in attesa');
reset role;

-- ---------------------------------------------------------------------------
-- 7. The CMS: only the admin
-- ---------------------------------------------------------------------------
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select lives_ok(
  $$ insert into public.contenuti_blocchi (pagina, ordine, tipo, titolo, corpo) values ('dopo_lancio', 1, 'testo', 'Ci siamo', 'Testo') $$,
  'l''admin scrive un blocco'
);
select throws_ok(
  $$ insert into public.contenuti_blocchi (pagina, passo, ordine, tipo, titolo) values ('passo', 'benvenuto', 9, 'video', 'Senza id') $$,
  '23514', null, 'un video senza id no'
);
select pg_temp.web('22222222-2222-4222-8222-222222222222');
select throws_ok(
  $$ insert into public.contenuti_blocchi (pagina, ordine, tipo, titolo) values ('dopo_lancio', 2, 'testo', 'Dal setter') $$,
  '42501', null, 'il setter no'
);
select pg_temp.web(pg_temp.utente('Anna'));
select throws_ok(
  $$ insert into public.contenuti_blocchi (pagina, ordine, tipo, titolo) values ('dopo_lancio', 2, 'testo', 'Dal cliente') $$,
  '42501', null, 'il cliente no'
);
reset role;
set local request.jwt.claims to '{}';

-- ---------------------------------------------------------------------------
-- 8. Backup, preview of a deletion, cleanup
-- ---------------------------------------------------------------------------
select ok(
  (select not (b ? 'onboarding_registrazioni') and not (b ? 'clienti_accesso_limiti') and not (b ? 'onboarding_inviti_token')
      and b ? 'clienti_account' and b ? 'contenuti_blocchi' and b ? 'clienti_consensi' and b ? 'onboarding_video_visti'
   from (select public.backup_completo() as b) x),
  'il backup salta registrazioni, limiti e token; ha account, contenuti, consensi e video'
);
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select is(public.anteprima_eliminazione('cliente', pg_temp.cliente('Anna')) ->> 'accesso_cliente', 'true',
  'la domanda prima di eliminare un cliente dice il suo accesso');
reset role;
set local request.jwt.claims to '{}';
insert into public.onboarding_registrazioni (invito_id, chiave_hash, chiave_scade_il)
select i.id, pg_temp.h('vecchia'), now() - interval '2 days'
from public.onboarding_inviti i where i.client_id = '0b0a0000-0000-4000-8000-000000000001';
insert into public.clienti_accesso_limiti (chiave, dal) values ('email:' || pg_temp.h('vecchia'), now() - interval '2 days');
select is(
  (select v - 'account_chiusi' - 'eventi' - 'token' - 'video' - 'allegati' from (select public.onboarding_pulizia() as v) x),
  '{"limiti": 1, "registrazioni": 1}'::jsonb, 'la pulizia toglie registrazioni scadute e limiti vecchi'
);
select is((select count(*)::int from cron.job where jobname = 'onboarding-pulizia' and schedule = '50 2 * * *'), 1,
  'ogni notte alle 02:50 UTC');
-- an active link past its days by more than 30, never opened again: its token in clear goes too
create temp table scaduto_mai_aperto on commit drop as
select i.id from public.onboarding_inviti i
join public.onboarding_inviti_token t on t.invito_id = i.id
where i.stato = 'attivo' limit 1;
set local session_replication_role = replica;
update public.onboarding_inviti set scade_il = now() - interval '40 days' where id = (select id from scaduto_mai_aperto);
set local session_replication_role = origin;
select ok((select count(*) from scaduto_mai_aperto) = 1 and (public.onboarding_pulizia() ->> 'token')::int >= 1,
  'la pulizia toglie anche il token di un link attivo scaduto da 30 giorni e mai riaperto');
select is((select count(*)::int from public.onboarding_inviti_token where invito_id = (select id from scaduto_mai_aperto)), 0,
  'il suo token in chiaro non c''è più');

-- ---------------------------------------------------------------------------
-- 9. «Elimina onboarding»
-- ---------------------------------------------------------------------------
select pg_temp.prepara('Bruno', false);
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select is(
  public.anteprima_eliminazione('onboarding', pg_temp.cliente('Bruno')) - 'eventi',
  '{"passi": 9, "accesso_cliente": false, "task_onboarding": 10}'::jsonb,
  'la domanda conta i task e gli step'
);
select throws_ok(
  format($$ delete from public.onboarding_inviti where client_id = %L $$, pg_temp.cliente('Bruno')),
  '42501', 'Un onboarding si elimina solo con «Elimina onboarding».', 'un DELETE diretto dell''admin no'
);
select throws_ok(
  format($$ select public.onboarding_elimina(%L) $$, pg_temp.cliente('Anna')),
  '22023', 'Il cliente si è già registrato: per fermare l''onboarding usa «Revoca».', 'un cliente registrato no'
);
select pg_temp.web('22222222-2222-4222-8222-222222222222');
select throws_ok(format($$ select public.onboarding_elimina(%L) $$, pg_temp.cliente('Bruno')), '42501', null, 'il setter no');
reset role;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","client_id":"9c000000-0000-4000-8000-000000000113","session_id":"9e113000-0000-4000-8000-000000000001"}';
select set_config('alpha.mcp_filtro', 'on', true);
set local role authenticated;
select throws_ok(format($$ select public.onboarding_elimina(%L) $$, pg_temp.cliente('Bruno')), '42501', null,
  'il token di Claude dell''admin no, nemmeno dentro una richiesta ammessa');
reset role;
select set_config('alpha.mcp_filtro', '', true);
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select is(public.onboarding_elimina(pg_temp.cliente('Bruno')) ->> 'client_id', pg_temp.cliente('Bruno')::text, 'l''admin lo elimina');
reset role;
set local request.jwt.claims to '{}';
select is(
  (select array[
     (select count(*) from public.onboarding_inviti where client_id = pg_temp.cliente('Bruno')),
     (select count(*) from public.onboarding_inviti_token where invito_id = pg_temp.invito('Bruno')),
     (select count(*) from public.onboarding_percorsi where client_id = pg_temp.cliente('Bruno')),
     (select count(*) from public.onboarding_passi where client_id = pg_temp.cliente('Bruno')),
     (select count(*) from public.onboarding_incarichi where client_id = pg_temp.cliente('Bruno')),
     (select count(*) from public.onboarding_eventi where client_id = pg_temp.cliente('Bruno')),
     (select count(*) from public.pm_task t join public.pm_progetti p on p.id = t.progetto_id
      where p.client_id = pg_temp.cliente('Bruno') and t.chiave_onboarding is not null),
     (select count(*) from public.pm_tasklist l join public.pm_progetti p on p.id = l.progetto_id
      where p.client_id = pg_temp.cliente('Bruno') and l.nome = 'Onboarding'),
     (select count(*) from public.notifiche where tipo = 'onboarding_pagamento' and link = '/onboarding/' || pg_temp.cliente('Bruno'))
   ]),
  array[0, 0, 0, 0, 0, 0, 0, 0, 0]::bigint[],
  'via invito, token, percorso, step, incarichi, registro, task e lista «Onboarding», notifiche del pagamento'
);
select is(
  (select array[
     (select count(*) from public.clients where id = pg_temp.cliente('Bruno')),
     (select count(*) from public.sales where id = pg_temp.vendita('Bruno')),
     (select count(*) from public.payments where sale_id = pg_temp.vendita('Bruno')),
     (select count(*) from public.pm_progetti where client_id = pg_temp.cliente('Bruno')),
     (select count(*) from public.pm_task t join public.pm_progetti p on p.id = t.progetto_id
      where p.client_id = pg_temp.cliente('Bruno') and t.chiave_onboarding is null),
     (select count(*) from public.clienti_telegram where client_id = pg_temp.cliente('Bruno'))
   ]),
  (select array[1, 1, 3, 1,
     (select count(*) from public.pm_modelli_voci v join public.pm_modelli m on m.id = v.modello_id where m.per_nuovi_clienti),
     0]::bigint[]),
  'restano cliente, vendita, rate, progetto e «Percorso cliente»'
);
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select is((select count(*)::int from public.v_vendite_senza_onboarding where sale_id = pg_temp.vendita('Bruno')), 1,
  'la vendita torna tra quelle senza onboarding');
select is(
  public.avvia_onboarding(pg_temp.vendita('Bruno'), null, null, '11111111-1111-4111-8111-111111111111', null, null) ->> 'stato',
  'in_attesa_pagamento', 'e l''onboarding si avvia di nuovo'
);
reset role;
set local request.jwt.claims to '{}';

select * from finish();
rollback;
