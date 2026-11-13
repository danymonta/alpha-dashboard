-- Guided onboarding, release B1b (1.79.0, 20261109100000_questionario.sql): the questionnaire. The rule of the
-- answers (the keys and the options of Dany's Google form, no rule on the age; the same examples as the Vitest
-- of lib/validation/questionario.ts), the client's functions (step, consent, version, «cambiato», the sending
-- with the missing keys), the files (3 per field, 20 preparations and 100 MB a day counting every state, the
-- confirmation of the service role only, a missing object or another signature refused, nothing removed after
-- the sending), who reads (the admin only), the revocation of the consent, the cleanup (the questionnaire and
-- the files of a closed account stay), the last step served and the paths that start again.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(101);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ---------------------------------------------------------------------------
insert into auth.oauth_clients (id, client_name, registration_type, client_type, redirect_uris,
  grant_types, token_endpoint_auth_method, deleted_at)
values ('9c000000-0000-4000-8000-000000000114', 'Claude', 'manual', 'public',
  'https://claude.ai/api/mcp/auth_callback', 'authorization_code,refresh_token', 'none', null);
insert into auth.sessions (id, user_id, created_at, updated_at, aal, oauth_client_id, not_after)
values ('9e114000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', now(), now(), 'aal1',
  '9c000000-0000-4000-8000-000000000114', null);

create temp table casi (nome text primary key, sale_id uuid, client_id uuid, invito_id uuid, utente uuid) on commit drop;
create temp table appunti (chiave text primary key, valore jsonb) on commit drop;
grant select on casi to authenticated, service_role;
grant select, insert, update on appunti to authenticated, service_role;

create or replace function pg_temp.h(p text) returns text language sql immutable as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;
create or replace function pg_temp.cliente(p_nome text) returns uuid language sql as $$
  select client_id from pg_temp.casi where nome = p_nome $$;
create or replace function pg_temp.utente(p_nome text) returns uuid language sql as $$
  select utente from pg_temp.casi where nome = p_nome $$;
create or replace function pg_temp.passo(p_cliente uuid, p_passo text) returns text language sql as $$
  select s.stato from public.onboarding_passi s where s.client_id = p_cliente and s.passo = p_passo $$;
create or replace function pg_temp.nota(p_chiave text) returns jsonb language sql as $$
  select valore from pg_temp.appunti where chiave = p_chiave $$;

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

-- the detail of the error a statement raises
create or replace function pg_temp.dettaglio(p_sql text)
returns text
language plpgsql
as $$
declare
  v text;
begin
  execute p_sql;
  return 'nessun errore';
exception when others then
  get stacked diagnostics v = pg_exception_detail;
  return v;
end;
$$;

-- every question answered, invented
create or replace function pg_temp.completo() returns jsonb language sql immutable as $$
  select '{
    "nome_cognome": "Carla Centoquattordici", "email": "carla@example.test", "telefono": "+39 333 000 0114",
    "altezza_peso": {"altezza": 168, "peso": 61.5}, "data_nascita": "1996-03-21", "occupazione": "Magazziniera",
    "storia_allenamento": "Nuoto da ragazza, poi niente", "giorni_settimana": 3, "minuti_giorno": "30_40",
    "infortuni": "Nessuno", "attrezzatura": "Una sbarra e due elastici",
    "massimali": {"piegamenti": 8, "trazioni": "non_lo_so", "dip": 0},
    "esercizi_difficolta": "Fatico con le trazioni, mi riescono gli squat", "importanza_tecnica": "Molto",
    "ore_sonno": "Sette", "livello_attivita": "attivo", "organizzazione_giornata": "Lavoro dalle 8 alle 17",
    "seguito_alimentazione": "no", "conoscenza_alimentazione": "Abbastanza",
    "cattive_abitudini": {"scelte": ["sonno", "stimolanti"], "altro": ""},
    "obiettivo_principale": "Fare la prima trazione", "perche_noi": "I video sul canale",
    "obiettivi_3_6_mesi": "Cinque trazioni", "successo": "Allenarmi con costanza", "pronto": "si", "note": ""
  }'::jsonb $$;

-- the wizard as the admin; a test link, the payment confirmed by hand; registered through /join
create or replace function pg_temp.prepara(p_nome text)
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
      'nome', p_nome, 'cognome', 'Centoquattordici', 'email', lower(p_nome) || '@example.test'),
    jsonb_build_object('coach', '11111111-1111-4111-8111-111111111111', 'responsabile', '11111111-1111-4111-8111-111111111111'));
  insert into pg_temp.casi (nome, sale_id, client_id, invito_id)
  values (p_nome, (r ->> 'sale_id')::uuid, (r ->> 'client_id')::uuid, (r ->> 'invito_id')::uuid);
  perform public.onboarding_segna_prova((r ->> 'invito_id')::uuid, true);
  perform public.onboarding_conferma_pagamento((r ->> 'invito_id')::uuid);
  perform set_config('request.jwt.claims', '{}', true);

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
end;
$$;

select pg_temp.prepara('Carla');
select pg_temp.prepara('Dario');

-- ---------------------------------------------------------------------------
-- 1. The rule of the answers: the keys and the options of the Google form
-- ---------------------------------------------------------------------------
select ok(public.onboarding_risposte_valide('{}'), 'nessuna risposta è valida (si sta ancora compilando)');
select ok(public.onboarding_risposte_complete(pg_temp.completo()), 'tutte le domande del modulo, risposte: complete');
select is(public.onboarding_risposte_mancanti(pg_temp.completo()), '{}'::text[], 'e non manca niente');
select ok(not public.onboarding_risposte_valide('{"peso_ideale": "70"}'), 'una chiave che non è una domanda del modulo no');
select ok(not public.onboarding_risposte_valide('[]') and not public.onboarding_risposte_valide(null), 'un elenco o null no');
select ok(not public.onboarding_risposte_valide('{"minuti_giorno": "45_60"}'), 'una scelta fuori dalle opzioni del modulo no');
select ok(
  public.onboarding_risposte_valide('{"minuti_giorno": "20_30"}') and public.onboarding_risposte_valide('{"minuti_giorno": "90_120"}'),
  'le cinque fasce del modulo, dalla prima all''ultima'
);
select ok(not public.onboarding_risposte_valide('{"livello_attivita": "Sedentario"}'), 'il livello si salva con la sua chiave, non con l''etichetta');
select ok(
  public.onboarding_risposte_valide('{"livello_attivita": "sedentario"}')
  and public.onboarding_risposte_valide('{"livello_attivita": "molto_attivo"}'),
  'sedentario, attivo, molto attivo'
);
select ok(
  not public.onboarding_risposte_valide('{"giorni_settimana": 8}') and not public.onboarding_risposte_valide('{"giorni_settimana": 2.5}')
  and not public.onboarding_risposte_valide('{"giorni_settimana": "3"}'),
  'i giorni sono un intero da 1 a 7'
);
select ok(public.onboarding_risposte_valide('{"giorni_settimana": 1}') and public.onboarding_risposte_valide('{"giorni_settimana": 7}'),
  '1 e 7 restano tra le opzioni');
select ok(
  not public.onboarding_risposte_valide('{"altezza_peso": {"altezza": 119}}')
  and not public.onboarding_risposte_valide('{"altezza_peso": {"peso": 76.55}}')
  and not public.onboarding_risposte_valide('{"altezza_peso": {"vita": 80}}'),
  'altezza da 120 a 230 cm, peso con al massimo un decimale, nessun''altra misura'
);
select ok(public.onboarding_risposte_valide('{"altezza_peso": {"altezza": 230, "peso": 35}}'), 'gli estremi valgono');
select ok(
  not public.onboarding_risposte_valide('{"massimali": {"piegamenti": "tanti"}}')
  and not public.onboarding_risposte_valide('{"massimali": {"dip": 201}}')
  and not public.onboarding_risposte_valide('{"massimali": {"squat": 10}}'),
  'i massimali: un numero da 0 a 200 o «non lo so», solo piegamenti, trazioni e dip'
);
select ok(not public.onboarding_risposte_valide('{"cattive_abitudini": {"scelte": ["fumo", "fumo"]}}'), 'una scelta ripetuta no');
select ok(not public.onboarding_risposte_valide('{"cattive_abitudini": {"scelte": ["zucchero"]}}'), 'una cattiva abitudine fuori elenco no');
select ok(not public.onboarding_risposte_valide('{"seguito_alimentazione": "forse"}') and not public.onboarding_risposte_valide('{"pronto": true}'),
  'Sì o No, come nel modulo');
select ok(not public.onboarding_risposte_valide(jsonb_build_object('note', repeat('a', 2001))), 'un testo oltre 2.000 caratteri no');
select ok(public.onboarding_risposte_valide(jsonb_build_object('note', repeat('a', 2000))), '2.000 sì');
select ok(not public.onboarding_risposte_valide('{"email": "non è una email"}'), 'un''email non valida no');
select ok(not public.onboarding_risposte_valide('{"data_nascita": "2026-02-30"}') and not public.onboarding_risposte_valide('{"data_nascita": "21/03/1996"}'),
  'una data che non esiste, o non nel formato AAAA-MM-GG, no');
select ok(
  public.onboarding_risposte_complete(pg_temp.completo() || '{"data_nascita": "2010-06-01"}')
  and public.onboarding_risposte_complete(pg_temp.completo() || '{"data_nascita": "1950-06-01"}'),
  'nessun controllo sull''età: 16 anni o 76, il questionario si invia'
);
select ok(public.onboarding_risposte_complete(pg_temp.completo() - 'cattive_abitudini' - 'note'),
  'cattive abitudini e note restano facoltative');
select is(
  public.onboarding_risposte_mancanti((pg_temp.completo() - 'massimali') || '{"telefono": "   ", "pronto": null}'),
  array['telefono', 'massimali', 'pronto'], 'le domande che mancano, nell''ordine del questionario'
);
select is(public.onboarding_risposte_mancanti(pg_temp.completo() || '{"altezza_peso": {"altezza": 170}}'), array['altezza_peso'],
  'altezza e peso vanno insieme');

-- ---------------------------------------------------------------------------
-- 2. The client's functions
-- ---------------------------------------------------------------------------
select pg_temp.web(pg_temp.utente('Carla'));
select throws_ok($$ select public.questionario_cliente() $$, '22023', 'Questo passo non è ancora disponibile.',
  'prima del benvenuto il questionario non c''è');
reset role;
set local request.jwt.claims to '{}';
update public.onboarding_passi set stato = 'fatto', completato_il = now()
where client_id in (pg_temp.cliente('Carla'), pg_temp.cliente('Dario')) and passo in ('benvenuto', 'regole');
select public.onboarding_sblocca(pg_temp.cliente('Carla'));
select public.onboarding_sblocca(pg_temp.cliente('Dario'));

select pg_temp.web(pg_temp.utente('Carla'));
insert into appunti values ('vuoto', public.questionario_cliente());
select is(pg_temp.nota('vuoto') -> 'risposte',
  '{"nome_cognome": "Carla Centoquattordici", "email": "carla@example.test"}'::jsonb,
  'niente salvato: nome, cognome ed email dalla scheda, già scritti');
select is((pg_temp.nota('vuoto') ->> 'versione')::int, 0, 'versione 0');
select throws_ok($$ select public.questionario_salva('{"occupazione": "Magazziniera"}', 1, 0) $$, '22023',
  'Serve il consenso al trattamento dei dati sulla salute per compilare il questionario.', 'senza il consenso non si salva');
select throws_ok($$ select public.allegato_prepara('attrezzatura', 'sbarra.jpg', 'image/jpeg', 1000) $$, '22023',
  'Serve il consenso al trattamento dei dati sulla salute per compilare il questionario.', 'e non si carica un file');
select public.consenso_dai('salute', '2026-11-12');
select is(public.questionario_salva('{"occupazione": "Magazziniera"}', 1, 0), '{"esito": "salvato", "versione": 1}'::jsonb,
  'col consenso si salva, sopra la versione letta');
select is(public.questionario_salva('{"occupazione": "Altro"}', 1, 0) - 'risposte', '{"esito": "cambiato", "versione": 1}'::jsonb,
  'con una versione vecchia non scrive: «cambiato» (un altro dispositivo)');
select is(public.questionario_cliente() -> 'risposte' ->> 'occupazione', 'Magazziniera', 'e la risposta resta quella salvata');
select throws_ok($$ select public.questionario_salva('{"minuti_giorno": "tanti"}', 2, 1) $$, '22023',
  'Alcune risposte non sono valide: controllale e riprova.', 'risposte non valide no');
select throws_ok($$ select public.questionario_salva('{}', 5, 1) $$, '22023', null, 'una schermata che non c''è no');
select is(public.questionario_salva('{"nome_cognome": "Carla Centoquattordici", "occupazione": "Magazziniera"}', 2, 1) ->> 'versione', '2',
  'la versione sale a ogni salvataggio');
select is(pg_temp.dettaglio($$ select public.questionario_invia(2) $$)::jsonb ->> 0, 'email',
  'inviare con risposte mancanti: il dettaglio dell''errore dice le chiavi, dalla prima');
select throws_ok($$ select public.questionario_invia(2) $$, '22023', 'Mancano delle risposte: completa le parti segnate.',
  'e il messaggio');
reset role;
set local request.jwt.claims to '{}';
select is(pg_temp.passo(pg_temp.cliente('Carla'), 'questionario'), 'in_corso', 'il primo salvataggio ha avviato lo step');
select pg_temp.web(pg_temp.utente('Carla'));
insert into appunti values ('file_carla', public.allegato_prepara('piano_alimentare', 'piano.pdf', 'application/pdf', 2000));
select is(public.questionario_salva(pg_temp.completo(), 4, 2) ->> 'versione', '3', 'tutte le risposte');
select is(public.questionario_invia(2) ->> 'esito', 'cambiato', 'inviare una versione vecchia: «cambiato»');
insert into appunti values ('inviato', public.questionario_invia(3));
select is(pg_temp.nota('inviato') ->> 'esito', 'inviato', 'inviato');
select throws_ok($$ select public.questionario_salva('{}', 1, 3) $$, '22023', 'Il questionario è già stato inviato.',
  'dopo l''invio non si salva più');
select throws_ok($$ select public.questionario_cliente() $$, '22023', 'Il questionario è già stato inviato.', 'né si legge da qui');
select throws_ok(format($$ select public.allegato_togli(%L) $$, pg_temp.nota('file_carla') ->> 'id'), '22023',
  'Il questionario è già stato inviato.', 'né si toglie un file');
select is(public.percorso_cliente() ->> 'in_attesa', 'true', 'dopo il questionario: l''attesa (B1b serve fino a lì)');
reset role;
set local request.jwt.claims to '{}';
select is(
  array[pg_temp.passo(pg_temp.cliente('Carla'), 'questionario'), pg_temp.passo(pg_temp.cliente('Carla'), 'prenotazione')],
  array['fatto', 'bloccato'], 'lo step è fatto, la prenotazione resta bloccata: oltre l''ultimo step servito'
);
select is(public.onboarding_ultimo_passo_servito(), 'questionario', 'l''ultimo step servito è il questionario');
select ok(
  (select inviato_il is not null from public.onboarding_questionari where client_id = pg_temp.cliente('Carla')),
  'inviato_il scritto'
);
select is(
  (select array_agg(e.dettagli::text order by e.created_at) from public.onboarding_eventi e
   where e.client_id = pg_temp.cliente('Carla') and e.tipo = 'passo_completato'),
  array['{"passo": "questionario"}'], 'il registro dice lo step, mai una risposta'
);
select is(
  (select count(*)::int from public.notifiche n
   where n.link = '/onboarding/' || pg_temp.cliente('Carla') and n.titolo = 'Questionario inviato da Carla Centoquattordici'
     and n.anteprima = 'Le risposte sono nella sua scheda di onboarding.' and n.dettagli is null),
  (select count(*)::int from public.profiles where ruolo = 'admin' and attivo),
  'una notifica a ogni admin, senza le risposte'
);
select is(
  (select count(*)::int from public.notifiche n where n.link = '/onboarding/' || pg_temp.cliente('Carla')
     and (n.titolo || coalesce(n.anteprima, '') || coalesce(n.dettagli::text, '')) ~ '(Magazziniera|trazion|Nessuno)'),
  0, 'nessuna risposta nelle notifiche'
);

-- ---------------------------------------------------------------------------
-- 3. The files
-- ---------------------------------------------------------------------------
select pg_temp.web('0b0b0000-0000-4000-8000-000000000031');
select throws_ok($$ select public.allegato_prepara('attrezzatura', 'pagina.html', 'text/html', 1000) $$, '22023',
  'File non valido: puoi caricare foto (JPG, PNG, WebP) o PDF fino a 10 MB.', 'un HTML no');
select throws_ok($$ select public.allegato_prepara('attrezzatura', 'grande.jpg', 'image/jpeg', 10485761) $$, '22023', null, 'oltre 10 MB no');
select throws_ok($$ select public.allegato_prepara('attrezzatura', '../altro.jpg', 'image/jpeg', 1000) $$, '22023', null, 'un nome con una barra no');
select throws_ok($$ select public.allegato_prepara('fisico', 'io.jpg', 'image/jpeg', 1000) $$, '22023', null, 'un campo che non c''è no');
insert into appunti values ('a1', public.allegato_prepara('attrezzatura', 'sbarra.jpg', 'image/jpeg', 1000));
insert into appunti values ('a2', public.allegato_prepara('attrezzatura', 'elastici.png', 'image/png', 1000));
insert into appunti values ('a3', public.allegato_prepara('attrezzatura', 'anelli.webp', 'image/webp', 1000));
select is(pg_temp.nota('a1') ->> 'percorso', '0b0b0000-0000-4000-8000-000000000001/' || (pg_temp.nota('a1') ->> 'id'),
  'il percorso è <client_id>/<id>');
select throws_ok($$ select public.allegato_prepara('attrezzatura', 'manubri.jpg', 'image/jpeg', 1000) $$, '22023',
  'Hai già caricato 3 file qui: togline uno per aggiungerne un altro.', 'al massimo 3 file per campo');
select is(public.allegato_togli((pg_temp.nota('a3') ->> 'id')::uuid) ->> 'id', pg_temp.nota('a3') ->> 'id', 'il cliente toglie un file');
select lives_ok($$ select public.allegato_prepara('attrezzatura', 'manubri.jpg', 'image/jpeg', 1000) $$, 'e ne aggiunge un altro');
select throws_ok($$ select public.allegato_conferma('0b0b0000-0000-4000-8000-000000000001', gen_random_uuid(), 'image/jpeg') $$,
  '42501', null, 'la conferma non è del cliente');
-- the daily limit counts every row of the day, removed ones too
do $$
declare
  r jsonb;
begin
  -- four already today (the client reads no row: the count is written here)
  for i in 1..16 loop
    r := public.allegato_prepara('vecchia_scheda', 'scheda.pdf', 'application/pdf', 1000);
    perform public.allegato_togli((r ->> 'id')::uuid);
  end loop;
end;
$$;
select throws_ok($$ select public.allegato_prepara('vecchia_scheda', 'scheda.pdf', 'application/pdf', 1000) $$, '22023',
  'Hai caricato troppi file oggi: riprova domani.', '20 preparazioni al giorno, contando quelle tolte');
select pg_temp.web(pg_temp.utente('Dario'));
select public.consenso_dai('salute', '2026-11-12');
do $$
declare
  r jsonb;
begin
  for i in 1..10 loop
    r := public.allegato_prepara('vecchia_scheda', 'scheda.pdf', 'application/pdf', 10485760);
    perform public.allegato_togli((r ->> 'id')::uuid);
  end loop;
end;
$$;
select throws_ok($$ select public.allegato_prepara('vecchia_scheda', 'scheda.pdf', 'application/pdf', 1) $$, '22023',
  'Hai caricato troppi file oggi: riprova domani.', '100 MB dichiarati al giorno, contando quelli tolti');
reset role;
set local request.jwt.claims to '{}';

-- the confirmation: service role only, the object there, the signature of the row
insert into storage.objects (bucket_id, name, metadata)
values ('onboarding-allegati', pg_temp.nota('a1') ->> 'percorso', '{"size": 1000, "mimetype": "image/jpeg"}'),
       ('onboarding-allegati', pg_temp.nota('a2') ->> 'percorso', '{"size": 1000, "mimetype": "image/png"}');
set local role service_role;
select throws_ok(format($$ select public.allegato_conferma(%L, %L, 'image/jpeg') $$, pg_temp.cliente('Carla'), pg_temp.nota('a1') ->> 'id'),
  '22023', 'Il file non è arrivato: riprova.', 'il file di un altro cliente no');
select is(
  public.allegato_conferma('0b0b0000-0000-4000-8000-000000000001', (pg_temp.nota('a1') ->> 'id')::uuid, 'image/jpeg') ->> 'esito',
  'caricato', 'oggetto presente e firma uguale: caricato'
);
select throws_ok(format($$ select public.allegato_conferma('0b0b0000-0000-4000-8000-000000000001', %L, 'image/jpeg') $$, pg_temp.nota('a1') ->> 'id'),
  '22023', 'Il file non è arrivato: riprova.', 'una seconda conferma no');
select is(
  public.allegato_conferma('0b0b0000-0000-4000-8000-000000000001', (pg_temp.nota('a2') ->> 'id')::uuid, 'text/html') ->> 'esito',
  'non_valido', 'una firma diversa dal tipo dichiarato: rifiutato'
);
select is(
  public.allegato_conferma(pg_temp.cliente('Carla'), (pg_temp.nota('file_carla') ->> 'id')::uuid, 'application/pdf') ->> 'esito',
  'non_arrivato', 'nessun oggetto nel bucket: rifiutato'
);
reset role;
select is(
  (select array_agg(a.stato order by a.nome_file) from public.onboarding_allegati a
   where a.id in ((pg_temp.nota('a1') ->> 'id')::uuid, (pg_temp.nota('a2') ->> 'id')::uuid, (pg_temp.nota('file_carla') ->> 'id')::uuid)),
  array['da_cancellare', 'da_cancellare', 'caricato'], 'i rifiutati diventano da cancellare'
);
select pg_temp.web('0b0b0000-0000-4000-8000-000000000031');
select is(
  (select array_agg(x ->> 'nome_file') from jsonb_array_elements(public.questionario_cliente() -> 'allegati') x),
  array['sbarra.jpg'], 'il questionario mostra i file caricati'
);
reset role;
set local request.jwt.claims to '{}';
set local role service_role;
select is(
  (select count(*)::int from public.onboarding_allegati_da_togliere() d
   where d.percorso in (pg_temp.nota('a2') ->> 'percorso', pg_temp.nota('a3') ->> 'percorso')),
  0, 'i file da cancellare di oggi restano fino a domani (il limite del giorno li conta)'
);
reset role;
update public.onboarding_allegati set created_at = now() - interval '2 days' where id = (pg_temp.nota('a2') ->> 'id')::uuid;
insert into storage.objects (bucket_id, name, metadata)
values ('onboarding-allegati', pg_temp.cliente('Dario') || '/0b0b0000-0000-4000-8000-0000000000ee', '{"size": 10}');
set local role service_role;
select is(
  (select array_agg(coalesce(d.id::text, 'senza riga') order by d.id is null) from public.onboarding_allegati_da_togliere() d),
  array[pg_temp.nota('a2') ->> 'id', 'senza riga'], 'il cron toglie i file da cancellare dei giorni prima e gli oggetti senza riga'
);
reset role;
select pg_temp.web('0b0b0000-0000-4000-8000-000000000031');
select throws_ok($$ select count(*) from public.onboarding_allegati_da_togliere() $$, '42501', null, 'non è del cliente');
reset role;
set local request.jwt.claims to '{}';

-- ---------------------------------------------------------------------------
-- 4. Who reads: the admin only
-- ---------------------------------------------------------------------------
create temp table letture (persona text, questionari bigint, allegati bigint) on commit drop;
grant insert on letture to authenticated;
select pg_temp.web('11111111-1111-4111-8111-111111111111');
insert into letture select 'admin', (select count(*) from public.onboarding_questionari), (select count(*) from public.onboarding_allegati);
select pg_temp.web('22222222-2222-4222-8222-222222222222');
insert into letture select 'setter', (select count(*) from public.onboarding_questionari), (select count(*) from public.onboarding_allegati);
select pg_temp.web('33333333-3333-4333-8333-333333333333');
insert into letture select 'closer', (select count(*) from public.onboarding_questionari), (select count(*) from public.onboarding_allegati);
select pg_temp.web('0b0b0000-0000-4000-8000-000000000031');
insert into letture select 'cliente', (select count(*) from public.onboarding_questionari), (select count(*) from public.onboarding_allegati);
reset role;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","client_id":"9c000000-0000-4000-8000-000000000114","session_id":"9e114000-0000-4000-8000-000000000001"}';
select set_config('alpha.mcp_filtro', 'on', true);
set local role authenticated;
insert into letture select 'claude', (select count(*) from public.onboarding_questionari), (select count(*) from public.onboarding_allegati);
reset role;
select set_config('alpha.mcp_filtro', '', true);
set local request.jwt.claims to '{}';
select ok((select questionari >= 2 and allegati >= 1 from letture where persona = 'admin'), 'l''admin legge questionari e file');
select is(
  (select array_agg(persona || ' ' || questionari || ' ' || allegati order by persona) from letture where persona <> 'admin'),
  array['claude 0 0', 'cliente 0 0', 'closer 0 0', 'setter 0 0'],
  'setter, closer, il cliente e il token di Claude dell''admin non leggono niente'
);
select pg_temp.web('0b0b0000-0000-4000-8000-000000000031');
select throws_ok($$ update public.onboarding_questionari set schermata = 4 $$, '42501', null, 'il cliente non scrive la tabella');
reset role;
set local request.jwt.claims to '{}';

-- ---------------------------------------------------------------------------
-- 5. The revocation of the consent
-- ---------------------------------------------------------------------------
select pg_temp.web('22222222-2222-4222-8222-222222222222');
select throws_ok(format($$ select public.onboarding_revoca_consenso(%L, 'salute', 'Richiesta') $$, pg_temp.cliente('Carla')),
  '42501', null, 'il setter no');
reset role;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","client_id":"9c000000-0000-4000-8000-000000000114","session_id":"9e114000-0000-4000-8000-000000000001"}';
select set_config('alpha.mcp_filtro', 'on', true);
set local role authenticated;
select throws_ok(format($$ select public.onboarding_revoca_consenso(%L, 'salute', 'Richiesta') $$, pg_temp.cliente('Carla')),
  '42501', null, 'il token di Claude dell''admin no');
reset role;
select set_config('alpha.mcp_filtro', '', true);
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select throws_ok(format($$ update public.clienti_consensi set revocato_il = now() where client_id = %L $$, pg_temp.cliente('Carla')),
  '42501', 'Un consenso si revoca solo con «Registra la revoca».', 'un PATCH diretto dell''admin no');
select throws_ok(format($$ select public.onboarding_revoca_consenso(%L, 'salute', '  ') $$, pg_temp.cliente('Carla')),
  '22023', 'Scrivi il motivo della revoca.', 'senza motivo no');
insert into appunti values ('revoca', public.onboarding_revoca_consenso(pg_temp.cliente('Carla'), 'salute', 'Richiesta del cliente su Telegram'));
select is(pg_temp.nota('revoca') -> 'percorsi', jsonb_build_array(pg_temp.nota('file_carla') ->> 'percorso'),
  'restituisce i percorsi dei file, che la server action toglie subito');
select throws_ok(format($$ select public.onboarding_revoca_consenso(%L, 'salute', 'Di nuovo') $$, pg_temp.cliente('Carla')),
  '22023', 'Questo cliente non ha un consenso da revocare.', 'una seconda revoca no');
reset role;
set local request.jwt.claims to '{}';
select is(
  (select row(c.revocato_il is not null, c.revocato_da)::text from public.clienti_consensi c
   where c.client_id = pg_temp.cliente('Carla') order by c.dato_il desc limit 1),
  '(t,11111111-1111-4111-8111-111111111111)', 'il consenso è revocato, con chi l''ha registrato'
);
select is((select count(*)::int from public.onboarding_questionari where client_id = pg_temp.cliente('Carla')), 0,
  'le risposte sono cancellate');
select is(
  (select array_agg(distinct stato) from public.onboarding_allegati where client_id = pg_temp.cliente('Carla')),
  array['da_cancellare'], 'i file sono da cancellare'
);
select is(
  array[pg_temp.passo(pg_temp.cliente('Carla'), 'benvenuto'), pg_temp.passo(pg_temp.cliente('Carla'), 'regole'),
        pg_temp.passo(pg_temp.cliente('Carla'), 'questionario'), pg_temp.passo(pg_temp.cliente('Carla'), 'prenotazione')],
  array['fatto', 'disponibile', 'disponibile', 'bloccato'], 'regole e questionario di nuovo da fare, il resto bloccato'
);
select is(
  (select e.autore_id::text || ' ' || (e.dettagli ->> 'tipo') from public.onboarding_eventi e
   where e.client_id = pg_temp.cliente('Carla') and e.tipo = 'consenso_revocato'),
  '11111111-1111-4111-8111-111111111111 salute', 'il registro, con l''autore'
);
select pg_temp.web(pg_temp.utente('Carla'));
select throws_ok($$ select public.questionario_salva('{}', 1, 0) $$, '22023',
  'Serve il consenso al trattamento dei dati sulla salute per compilare il questionario.', 'senza consenso il questionario si ferma');
select public.consenso_dai('salute', '2026-11-12');
select is(public.questionario_salva('{"occupazione": "Magazziniera"}', 1, 0) ->> 'esito', 'salvato',
  'ridato il consenso, si ricomincia da un questionario nuovo');
reset role;
set local request.jwt.claims to '{}';

-- ---------------------------------------------------------------------------
-- 6. What is kept: the questionnaire and the files of a closed account stay
-- ---------------------------------------------------------------------------
insert into appunti select 'file_dario', to_jsonb(a) from public.onboarding_allegati a
where a.client_id = pg_temp.cliente('Dario') limit 1;
update public.onboarding_allegati set stato = 'caricato', caricato_il = now() where id = (pg_temp.nota('file_dario') ->> 'id')::uuid;
insert into public.onboarding_questionari (client_id, risposte, versione) values (pg_temp.cliente('Dario'), '{"occupazione": "Cuoco"}', 1)
on conflict (client_id) do update set risposte = excluded.risposte;
insert into public.onboarding_allegati (client_id, id, campo, percorso, nome_file, tipo, byte, created_at)
values (pg_temp.cliente('Dario'), '0b0b0000-0000-4000-8000-0000000000dd', 'attrezzatura',
        pg_temp.cliente('Dario') || '/0b0b0000-0000-4000-8000-0000000000dd', 'meta.jpg', 'image/jpeg', 100, now() - interval '2 days');
update public.sales set data_inizio = public.oggi() - 800, data_fine = public.oggi() - 500 where client_id = pg_temp.cliente('Dario');
select ok((public.onboarding_pulizia() ->> 'allegati')::int >= 1, 'la pulizia segna i file rimasti a metà da più di un giorno');
select is(
  (select row(a.stato, q.risposte ->> 'occupazione', f.stato)::text
   from public.clienti_account a
   join public.onboarding_questionari q on q.client_id = a.client_id
   join public.onboarding_allegati f on f.id = (pg_temp.nota('file_dario') ->> 'id')::uuid
   where a.client_id = pg_temp.cliente('Dario')),
  '(chiuso,Cuoco,caricato)', 'un account chiuso dopo 12 mesi: il questionario e i file restano'
);
select is((select stato from public.onboarding_allegati where id = '0b0b0000-0000-4000-8000-0000000000dd'), 'da_cancellare',
  'il file rimasto a metà è da cancellare');

-- ---------------------------------------------------------------------------
-- 7. Deletion, backup, the paths of the seed
-- ---------------------------------------------------------------------------
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select is(public.anteprima_eliminazione('cliente', '0b0b0000-0000-4000-8000-000000000001') ->> 'questionario', 'true',
  'la domanda prima di eliminare un cliente dice il questionario e i file');
select public.elimina_cliente(pg_temp.cliente('Dario'));
reset role;
set local request.jwt.claims to '{}';
select is(
  (select count(*)::int from public.onboarding_questionari where client_id = pg_temp.cliente('Dario'))
  + (select count(*)::int from public.onboarding_allegati where client_id = pg_temp.cliente('Dario')),
  0, 'eliminato il cliente, questionario e file se ne vanno con lui'
);
select ok(
  (select not (b ? 'onboarding_questionari') and not (b ? 'onboarding_allegati') from (select public.backup_completo() as b) x),
  'il backup non prende né il questionario né i file'
);
select is(
  array[pg_temp.passo('0b0b0000-0000-4000-8000-000000000002', 'questionario'),
        pg_temp.passo('0b0b0000-0000-4000-8000-000000000002', 'prenotazione')],
  array['disponibile', 'bloccato'], 'un percorso fermo dopo le regole riparte da solo fino al questionario'
);
select is((select public from storage.buckets where id = 'onboarding-allegati'), false, 'il bucket degli allegati è privato');
select is(
  (select row(file_size_limit, allowed_mime_types)::text from storage.buckets where id = 'onboarding-allegati'),
  '(10485760,"{image/jpeg,image/png,image/webp,application/pdf}")', '10 MB, foto e PDF'
);
select ok(
  not has_function_privilege('authenticated', 'public.allegato_conferma(uuid, uuid, text)', 'execute')
  and not has_function_privilege('authenticated', 'public.onboarding_allegati_da_togliere()', 'execute')
  and has_function_privilege('service_role', 'public.allegato_conferma(uuid, uuid, text)', 'execute'),
  'la conferma e i file da togliere sono solo del service role'
);
select ok(
  not has_function_privilege('authenticated', 'public.onboarding_risposte_valide(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.onboarding_questionario_aperto(uuid, boolean)', 'execute'),
  'le funzioni interne non sono raggiungibili da una sessione'
);
select is(
  (select count(*)::int from cron.job where command ilike '%questionari%' or command ilike '%salute%'),
  0, 'nessun lavoro notturno cancella i dati sulla salute'
);

select * from finish();
rollback;
