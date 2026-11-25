-- The questions of the questionnaire editable from the settings (1.88.0, 20261125110000_questionario_modificabile.sql):
-- the 26 of the form seeded as questions of the system; who reads them (the admin, a person with a task in an
-- onboarding; never a setter, the marketing, a client or an OAuth token) and who writes them (the admin only, never
-- deleted); what never changes (key, kind, column of the sheet, the values of a numeric choice); the column of a
-- question added (AI = 34, then the next one, never reused); the answers kept by their questions at the save, the
-- missing ones at the sending (a question of files answered by a file uploaded), the files of a field of a question.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(34);

create temp table appunti (chiave text primary key, valore jsonb) on commit drop;
grant select, insert, update on appunti to authenticated;

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

create or replace function pg_temp.oauth(p_utente uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_utente, 'role', 'authenticated',
    'client_id', '9c000000-0000-4000-8000-000000000119', 'session_id', '9e119000-0000-4000-8000-000000000001')::text, true);
  set local role authenticated;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. The seed: the 26 questions of the form
-- ---------------------------------------------------------------------------
select is((select count(*)::int from public.onboarding_domande), 26, 'le 26 domande del modulo');
select ok(not exists (select 1 from public.onboarding_domande where not sistema or colonna is not null or not attiva),
  'tutte del sistema, attive, senza una colonna dopo AH');
select is((select string_agg(chiave, ',' order by sezione, ordine) from public.onboarding_domande where not obbligatoria),
  'note', 'solo le note facoltative, come nel modulo');

-- ---------------------------------------------------------------------------
-- 2. Who reads
-- ---------------------------------------------------------------------------
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select is((select count(*)::int from public.onboarding_domande), 26, 'l''admin le legge');
reset role;
select pg_temp.web('44444444-4444-4444-8444-444444444444');
select is((select count(*)::int from public.onboarding_domande), 26, 'il coach con un incarico le legge (le risposte con le loro domande)');
reset role;
select pg_temp.web('22222222-2222-4222-8222-222222222222');
select is((select count(*)::int from public.onboarding_domande), 0, 'il setter no');
reset role;
select pg_temp.web('0b0b0000-0000-4000-8000-000000000031');
select is((select count(*)::int from public.onboarding_domande), 0, 'il cliente non legge la tabella: le riceve dal suo questionario');
reset role;
select pg_temp.oauth('11111111-1111-4111-8111-111111111111');
select is((select count(*)::int from public.onboarding_domande), 0, 'un token di Claude, anche dell''admin, no');
reset role;
set local request.jwt.claims to '{}';

-- ---------------------------------------------------------------------------
-- 3. Who writes, and what never changes
-- ---------------------------------------------------------------------------
select pg_temp.web('22222222-2222-4222-8222-222222222222');
select throws_ok($$ insert into public.onboarding_domande (chiave, ordine, sezione, tipo, testo) values ('furba_x1', 99, 4, 'testo', 'Furba') $$,
  '42501', null, 'il setter non aggiunge domande');
reset role;

select pg_temp.web('11111111-1111-4111-8111-111111111111');
insert into public.onboarding_domande (chiave, ordine, sezione, tipo, testo, opzioni)
values ('sport_x1', 30, 4, 'scelte', 'Quali sport fai?',
  '[{"valore":"calcio","etichetta":"Calcio"},{"valore":"nuoto","etichetta":"Nuoto"}]');
insert into public.onboarding_domande (chiave, ordine, sezione, tipo, testo, allegato)
values ('analisi_x1', 31, 4, 'file', 'Carica le tue analisi', '{"campo":"analisi_x1","etichetta":"Le analisi"}');
select is((select colonna::int from public.onboarding_domande where chiave = 'sport_x1'), 34, 'la prima domanda aggiunta va in AI');
select is((select colonna::int from public.onboarding_domande where chiave = 'analisi_x1'), 35, 'la seconda in AJ');
select ok((select updated_by = '11111111-1111-4111-8111-111111111111' from public.onboarding_domande where chiave = 'sport_x1'),
  'scritta dall''admin');
select throws_ok($$ insert into public.onboarding_domande (chiave, ordine, sezione, tipo, testo) values ('peso_x1', 32, 4, 'altezza_peso', 'Peso') $$,
  '23514', null, 'una domanda aggiunta non ha i tipi del modulo');
select throws_ok($$ insert into public.onboarding_domande (chiave, ordine, sezione, tipo, testo) values ('scelta_x1', 32, 4, 'scelta', 'Senza') $$,
  '23514', null, 'una scelta senza risposte possibili no');
select throws_ok($$ update public.onboarding_domande set tipo = 'testo' where chiave = 'sport_x1' $$,
  '22023', 'Il tipo di una domanda non si cambia: toglila e creane una nuova.', 'il tipo non si cambia');
select throws_ok($$ update public.onboarding_domande set colonna = 40 where chiave = 'sport_x1' $$,
  '22023', null, 'la colonna del foglio non si cambia');
select throws_ok($$ update public.onboarding_domande set opzioni = opzioni || '[{"valore":"8","etichetta":"8"}]' where chiave = 'giorni_settimana' $$,
  '22023', 'Le opzioni di questa domanda si rinominano, non si aggiungono né si tolgono.', 'i giorni restano da 1 a 7');
update public.onboarding_domande set opzioni = jsonb_set(opzioni, '{0,etichetta}', '"Un giorno"') where chiave = 'giorni_settimana';
select is((select opzioni -> 0 ->> 'etichetta' from public.onboarding_domande where chiave = 'giorni_settimana'), 'Un giorno',
  'ma si rinominano');
update public.onboarding_domande set testo = 'Ti senti pronto?', aiuto = 'Dillo sinceramente.' where chiave = 'pronto';
select is((select testo from public.onboarding_domande where chiave = 'pronto'), 'Ti senti pronto?', 'le parole di una domanda del modulo si cambiano');
select throws_ok($$ delete from public.onboarding_domande where chiave = 'sport_x1' $$, '42501', null,
  'nemmeno l''admin elimina una domanda: la toglie');
reset role;
set local request.jwt.claims to '{}';

-- ---------------------------------------------------------------------------
-- 4. The answers by their questions
-- ---------------------------------------------------------------------------
select is(public.onboarding_risposte_filtra('{"sport_x1": ["calcio"], "pronto": "si"}'), '{"sport_x1": ["calcio"], "pronto": "si"}'::jsonb,
  'le risposte delle domande in uso restano');
select is(public.onboarding_risposte_filtra('{"sport_x1": ["tennis"]}'), '{}'::jsonb, 'una risposta fuori dalle sue opzioni va via');
select ok(public.onboarding_risposte_valide('{"sport_x1": ["calcio", "nuoto"]}') and not public.onboarding_risposte_valide('{"sport_x1": ["calcio", "calcio"]}'),
  'la forma: un elenco di opzioni senza ripetizioni');
select ok(
  'sport_x1' = any(public.onboarding_risposte_mancanti('{}', '0b0b0000-0000-4000-8000-000000000001'))
  and 'analisi_x1' = any(public.onboarding_risposte_mancanti('{}', '0b0b0000-0000-4000-8000-000000000001')),
  'una domanda nuova obbligatoria manca, e quella dei file senza un file'
);
insert into public.onboarding_allegati (client_id, campo, percorso, id, nome_file, tipo, byte, stato, caricato_il)
values ('0b0b0000-0000-4000-8000-000000000001', 'analisi_x1',
  '0b0b0000-0000-4000-8000-000000000001/0b119000-0000-4000-8000-0000000000a1', '0b119000-0000-4000-8000-0000000000a1',
  'analisi.pdf', 'application/pdf', 2000, 'caricato', now());
select ok(not ('analisi_x1' = any(public.onboarding_risposte_mancanti('{}', '0b0b0000-0000-4000-8000-000000000001'))),
  'con un file caricato la domanda dei file c''è');

-- ---------------------------------------------------------------------------
-- 5. The client: the questions with the questionnaire, the save keeps what holds, the files of a new field
-- ---------------------------------------------------------------------------
select pg_temp.web('0b0b0000-0000-4000-8000-000000000031');
insert into appunti values ('q', public.questionario_cliente());
select ok(
  exists (select 1 from appunti a, jsonb_array_elements(a.valore -> 'domande') d where a.chiave = 'q' and d ->> 'chiave' = 'sport_x1'),
  'il cliente riceve le domande nuove col suo questionario'
);
select is(
  (select jsonb_array_length(a.valore -> 'domande') from appunti a where a.chiave = 'q'), 28, 'tutte quelle in uso'
);
insert into appunti values ('s', public.questionario_salva(
  (select a.valore -> 'risposte' from appunti a where a.chiave = 'q') || '{"sport_x1": ["nuoto"], "minuti_giorno": "45_60", "ignota": "x"}',
  4, (select (a.valore ->> 'versione')::int from appunti a where a.chiave = 'q')));
select is((select a.valore ->> 'esito' from appunti a where a.chiave = 's'), 'salvato', 'il salvataggio passa');
reset role;
set local request.jwt.claims to '{}';
select is((select risposte -> 'sport_x1' from public.onboarding_questionari where client_id = '0b0b0000-0000-4000-8000-000000000001'),
  '["nuoto"]'::jsonb, 'con la risposta della domanda nuova');
select ok(
  (select not (risposte ? 'minuti_giorno') and not (risposte ? 'ignota') from public.onboarding_questionari
   where client_id = '0b0b0000-0000-4000-8000-000000000001'),
  'senza le risposte che non reggono: una fascia che non c''è, una chiave che non è una domanda'
);
select pg_temp.web('0b0b0000-0000-4000-8000-000000000031');
select ok((public.allegato_prepara('analisi_x1', 'analisi2.pdf', 'application/pdf', 1000) ->> 'id') is not null,
  'il cliente carica un file nel campo della domanda nuova');
select throws_ok($$ select public.allegato_prepara('campo_inventato', 'x.pdf', 'application/pdf', 1000) $$, '22023', null,
  'non in un campo che nessuna domanda ha');
reset role;
set local request.jwt.claims to '{}';

-- a question taken away: the client no longer sees it, its answer goes at the next save
update public.onboarding_domande set attiva = false where chiave = 'sport_x1';
select is(public.onboarding_risposte_filtra('{"sport_x1": ["nuoto"]}'), '{}'::jsonb, 'tolta, la sua risposta va via al salvataggio');
select ok(not exists (select 1 from jsonb_array_elements(public.onboarding_domande_attive()) d where d ->> 'chiave' = 'sport_x1'),
  'e il cliente non la riceve più');

select * from finish();
rollback;
