-- Release C of the guided onboarding (1.82.0, 20261111090000_questionario_foglio.sql): the questionnaire as
-- Dany's form (every question required except note, «Altre sostanze», the order of the form), the new version
-- of the health consent, the Google service account (admin only, the key only in Vault) and the queue of the
-- sheet (a sent questionnaire to write, a revocation to clear, the outcomes and the retries, who reads it).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(31);

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

create or replace function pg_temp.completo() returns jsonb language sql immutable as $$
  select '{
    "nome_cognome": "Sara Centosedici", "email": "sara@example.test", "telefono": "+39 333 000 0116",
    "altezza_peso": {"altezza": 170, "peso": 60}, "data_nascita": "1995-05-05", "occupazione": "Grafica",
    "storia_allenamento": "Corsa", "giorni_settimana": 3, "minuti_giorno": "30_40",
    "infortuni": "Nessuno", "attrezzatura": "Una sbarra",
    "massimali": {"piegamenti": 5, "trazioni": "non_lo_so", "dip": 0},
    "esercizi_difficolta": "Le trazioni", "importanza_tecnica": "Molto",
    "ore_sonno": "Sette", "livello_attivita": "attivo", "organizzazione_giornata": "Lavoro 9-18",
    "seguito_alimentazione": "no", "conoscenza_alimentazione": "Poco",
    "cattive_abitudini": {"scelte": ["altre_sostanze"]},
    "obiettivo_principale": "La prima trazione", "perche_noi": "I video",
    "obiettivi_3_6_mesi": "Tre trazioni", "successo": "Costanza", "pronto": "si"
  }'::jsonb $$;

-- ---------------------------------------------------------------------------
-- 1. The questionnaire as the form
-- ---------------------------------------------------------------------------
select ok(public.onboarding_risposte_complete(pg_temp.completo()), '«Altre sostanze» è una risposta del modulo');
select ok(not public.onboarding_risposte_valide('{"cattive_abitudini": {"scelte": ["alcol","fumo","altre_sostanze","sonno","stimolanti","motivazione","alcol"]}}'),
  'sette scelte (una ripetuta) no');
select is(public.onboarding_risposte_mancanti(pg_temp.completo() - 'cattive_abitudini'), array['cattive_abitudini'],
  'le cattive abitudini sono obbligatorie, come nel modulo');
select is(public.onboarding_risposte_mancanti(pg_temp.completo() || '{"cattive_abitudini": {"scelte": [], "altro": "Troppi dolci"}}'),
  '{}'::text[], '«Altro» scritto basta');
select is((public.onboarding_risposte_mancanti('{}'::jsonb))[1:3], array['email', 'telefono', 'nome_cognome'],
  'l’ordine è quello del modulo: prima l’email');
select is(cardinality(public.onboarding_risposte_mancanti('{}'::jsonb)), 25, '25 domande obbligatorie: tutte tranne le note');

-- ---------------------------------------------------------------------------
-- 2. The consent in force
-- ---------------------------------------------------------------------------
select results_eq(
  $$ select versione from public.clienti_consensi_testi where tipo = 'salute' and in_vigore $$,
  $$ values ('2026-11-13') $$,
  'una sola versione in vigore del consenso sulla salute, quella che cita il foglio'
);

-- ---------------------------------------------------------------------------
-- 3. The Google service account
-- ---------------------------------------------------------------------------
select pg_temp.come('11111111-1111-4111-8111-111111111111');
select throws_ok($$ select public.google_imposta_chiave('non è json') $$, '22023', null, 'un testo che non è JSON no');
select throws_ok($$ select public.google_imposta_chiave('{"type":"authorized_user"}') $$, '22023', null, 'una chiave che non è di un service account no');
select is(
  public.google_imposta_chiave(json_build_object('type', 'service_account', 'client_email', 'Alpha-Foglio@progetto.iam.gserviceaccount.com',
    'private_key', E'-----BEGIN PRIVATE KEY-----\nfinta\n-----END PRIVATE KEY-----\n', 'project_id', 'progetto')::text),
  'alpha-foglio@progetto.iam.gserviceaccount.com', 'l’admin salva la chiave e riceve solo l’indirizzo'
);
select ok(public.google_chiave_presente(), 'e sa solo che c’è');
select is((select account_email from public.google_collegamento), 'alpha-foglio@progetto.iam.gserviceaccount.com',
  'l’indirizzo si legge, per condividere il foglio');
select throws_ok($$ select public.google_chiave() $$, '42501', null, 'la chiave no: solo il service role');
reset role;

select is((select (d.decrypted_secret::jsonb) ? 'project_id' from vault.decrypted_secrets d where d.name = 'google_service_account'),
  false, 'nel Vault vanno solo l’indirizzo e la chiave privata');

select pg_temp.come((select id from public.profiles where email = 'setter@alpha.test'));
select throws_ok($$ select public.google_chiave_presente() $$, '42501', null, 'il setter no');
select is((select count(*)::int from public.google_collegamento), 0, 'il setter non legge il collegamento');
reset role;

-- ---------------------------------------------------------------------------
-- 4. The queue of the sheet
-- ---------------------------------------------------------------------------
create temp table caso as select id as client_id from public.clients order by created_at limit 1;
grant select on caso to authenticated, service_role;
delete from public.onboarding_foglio;
delete from public.onboarding_questionari where client_id = (select client_id from caso);
delete from public.clienti_consensi where client_id = (select client_id from caso);
insert into public.clienti_consensi (client_id, tipo, versione) select client_id, 'salute', '2026-11-13' from caso;

insert into public.onboarding_questionari (client_id, risposte, versione, schermata)
select client_id, pg_temp.completo(), 1, 4 from caso;
select is((select count(*)::int from public.onboarding_foglio), 0, 'un questionario non inviato non va sul foglio');

update public.onboarding_questionari set inviato_il = now() where client_id = (select client_id from caso);
select is((select stato from public.onboarding_foglio), 'da_scrivere', 'inviato: in coda per il foglio');

set local role service_role;
create temp table preso as select public.onboarding_foglio_prendi(10, null) as p;
reset role;
select is((select p #>> '{lavori,0,azione}' from preso), 'scrivi', 'il lavoro è scrivere');
select is((select p #> '{lavori,0,risposte}' from preso), pg_temp.completo(), 'con le risposte');
select is((select p ->> 'scheda' from preso), 'Risposte del modulo', 'sulla scheda del modulo');
set local role service_role;
select is((public.onboarding_foglio_prendi(10, null) -> 'lavori'), '[]'::jsonb, 'un lavoro preso non si riprende per 10 minuti');
select public.onboarding_foglio_esito((select client_id from caso), (select rif from public.onboarding_foglio), 'scrivi', 7, null);
reset role;
select results_eq($$ select stato, riga, tentativi from public.onboarding_foglio $$, $$ values ('scritta', 7, 0) $$,
  'scritta alla riga 7');

-- the revocation deletes the questionnaire: the row is to clear
delete from public.onboarding_questionari where client_id = (select client_id from caso);
select is((select stato from public.onboarding_foglio), 'da_svuotare', 'revocato: la riga va cancellata dal foglio');
set local role service_role;
select is((public.onboarding_foglio_prendi(10, null) #>> '{lavori,0,azione}'), 'svuota', 'il lavoro è cancellare');
select ok((public.onboarding_foglio_prendi(10, null) #> '{lavori}') = '[]'::jsonb, 'e non si ripete');
-- an error: retried later, with a sentence
update public.onboarding_foglio set preso_il = null;
select public.onboarding_foglio_esito((select client_id from caso), (select rif from public.onboarding_foglio), 'svuota', null,
  'Google non ha risposto: riprovo più tardi.');
reset role;
select results_eq($$ select stato, tentativi, prossimo_il > now() from public.onboarding_foglio $$,
  $$ values ('da_svuotare', 1, true) $$, 'un errore riprova più tardi');
select is((select ultimo_errore from public.google_collegamento), 'Google non ha risposto: riprovo più tardi.', 'e l’admin lo legge');
set local role service_role;
select public.onboarding_foglio_esito((select client_id from caso), (select rif from public.onboarding_foglio), 'svuota', null, null);
reset role;
select is((select stato from public.onboarding_foglio), 'svuotata', 'cancellata dal foglio');

-- who reads the queue: the admin, not the setter; the functions of the work only the service role
select pg_temp.come((select id from public.profiles where email = 'setter@alpha.test'));
select is((select count(*)::int from public.onboarding_foglio), 0, 'il setter non legge la coda');
select throws_ok($$ select public.onboarding_foglio_prendi(1, null) $$, '42501', null, 'né prende i lavori');
reset role;

select * from finish();
rollback;
