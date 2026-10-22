-- The labels of Reel Type and Format (20261024090000, Dany 21/10/2026): rows of
-- marketing_opzioni that people create, rename and recolour like Notion's select
-- options, and the contents point at them. Here: the schema, the 15 options of
-- the old enums, the rules of the table (colour, unique name, stable slug), the
-- foreign keys of the contents (an option that is not there is refused, deleting
-- one empties it from the contents), who may do what, and the two functions
-- (crea_opzione_marketing, conteggi_opzioni_marketing). Claude reads and never
-- writes: test 75.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(81);

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

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
select has_table('public', 'marketing_opzioni', 'la tabella delle etichette c''è');
select policies_are('public', 'marketing_opzioni',
  array['marketing_opzioni_lettura', 'marketing_opzioni_lettura_come_admin', 'marketing_opzioni_inserimento', 'marketing_opzioni_modifica',
        'marketing_opzioni_eliminazione', 'marketing_opzioni_mai_da_oauth', 'marketing_opzioni_mai_da_oauth_modifica',
        'marketing_opzioni_mai_da_oauth_eliminazione'],
  'quattro policy per le persone e tre restrittive per Claude');
select has_function('public', 'crea_opzione_marketing', array['text', 'text', 'text'], 'crea_opzione_marketing c''è');
select has_function('public', 'conteggi_opzioni_marketing', 'conteggi_opzioni_marketing c''è');
select hasnt_type('public', 'contenuto_reel_type', 'l''enum di Reel Type non c''è più');
select hasnt_type('public', 'contenuto_format', 'né quello di Format');
select col_type_is('public', 'marketing_contenuti', 'reel_type', 'text', 'Reel Type del contenuto è un testo');
select col_type_is('public', 'marketing_contenuti', 'formato', 'text', 'e così Format');
select table_privs_are('public', 'marketing_opzioni', 'anon', array[]::text[], 'anon non ha nessun permesso sulla tabella');
select function_privs_are('public', 'crea_opzione_marketing', array['text', 'text', 'text']::name[], 'anon', array[]::text[],
  'anon non esegue crea_opzione_marketing');

-- ---------------------------------------------------------------------------
-- 2. The 15 options of the old enums
-- ---------------------------------------------------------------------------
select is(
  (select array_agg(valore || ':' || nome || ':' || colore order by ordine) from public.marketing_opzioni
   where campo = 'reel_type' and valore in ('attraction', 'education', 'converting', 'radio', 'workshop')),
  array['attraction:Attraction:blue', 'education:Education:yellow', 'converting:Converting:red',
        'radio:RADIO:purple', 'workshop:Workshop:green'],
  'Reel Type: gli stessi codici dell''enum, i nomi di Notion, un colore a testa');
select is(
  (select array_agg(valore || ':' || nome || ':' || colore order by ordine) from public.marketing_opzioni
   where campo = 'formato' and valore in ('text_opinion', 'check_caption', 'split', 'reaction', 'b_roll',
     'green_screen', 'raw_talking_head', 'storytelling', 'transformation', 'show_and_tell')),
  array['text_opinion:Text opinion:gray', 'check_caption:Check Caption:pink', 'split:Split:purple',
        'reaction:Reaction:yellow', 'b_roll:B roll:orange', 'green_screen:Green Screen:green',
        'raw_talking_head:Raw Talking Head:blue', 'storytelling:Storytelling:brown',
        'transformation:Transformation:red', 'show_and_tell:Show&Tell:default'],
  'Format: gli stessi codici, i nomi di Notion, un colore a testa');

-- ---------------------------------------------------------------------------
-- 3. The rules of the table (as postgres: no session)
-- ---------------------------------------------------------------------------
select throws_ok($$ insert into public.marketing_opzioni (campo, valore, nome, colore) values ('formato', 'colore_no', 'Colore no', 'magenta') $$,
  '23514', null, 'un colore fuori dai dieci di Notion è rifiutato');
select throws_ok($$ insert into public.marketing_opzioni (campo, valore, nome) values ('reel_type', 'x_1', 'RADIO') $$,
  '23505', null, 'due nomi uguali nello stesso campo no');
select throws_ok($$ insert into public.marketing_opzioni (campo, valore, nome) values ('reel_type', 'x_2', 'radio') $$,
  '23505', null, 'nemmeno con le maiuscole diverse');
select lives_ok($$ insert into public.marketing_opzioni (campo, valore, nome) values ('formato', 'radio', 'RADIO') $$,
  'lo stesso nome in un altro campo sì (e lo stesso codice: è unico per campo)');
select throws_ok($$ insert into public.marketing_opzioni (campo, valore, nome) values ('formato', 'radio', 'Altro nome') $$,
  '23505', null, 'il codice è unico per campo');
select throws_ok($$ insert into public.marketing_opzioni (campo, valore, nome) values ('formato', 'Maiuscole', 'Maiuscole') $$,
  '23514', null, 'il codice è minuscolo, cifre e trattino basso');
select throws_ok($$ insert into public.marketing_opzioni (campo, valore, nome) values ('formato', 'vuoto', '   ') $$,
  '23514', null, 'un nome di soli spazi no');
select throws_ok($$ insert into public.marketing_opzioni (campo, valore, nome) values ('formato', 'lungo', repeat('a', 61)) $$,
  '23514', null, 'un nome di 61 caratteri no');
select throws_ok($$ insert into public.marketing_opzioni (campo, valore, nome) values ('stato', 'x', 'Stato') $$,
  '23514', null, 'il campo è reel_type o formato');
insert into public.marketing_opzioni (campo, valore, nome) values ('formato', 'spazi_95', '  Due    spazi  ');
select is((select nome from public.marketing_opzioni where valore = 'spazi_95'), 'Due spazi',
  'il nome si salva con gli spazi singoli e senza quelli ai bordi');
select is((select colore from public.marketing_opzioni where valore = 'spazi_95'), 'default', 'il colore di base è «default»');

-- ---------------------------------------------------------------------------
-- 4. The contents point at the options
-- ---------------------------------------------------------------------------
insert into public.marketing_opzioni (campo, valore, nome, colore) values
  ('reel_type', 'prova_95', 'Prova 95', 'pink'),
  ('formato', 'prova_95', 'Prova 95 formato', 'brown');
insert into public.marketing_contenuti (id, nome, reel_type, formato) values
  ('95950000-0000-4000-8000-000000000001', 'Contenuto 95 con etichette', 'prova_95', 'prova_95'),
  ('95950000-0000-4000-8000-000000000002', 'Contenuto 95 con Attraction', 'attraction', null),
  ('95950000-0000-4000-8000-000000000003', 'Contenuto 95 senza etichette', null, null);

select throws_ok($$ insert into public.marketing_contenuti (nome, reel_type) values ('Contenuto 95 sbagliato', 'inesistente') $$,
  '23503', null, 'un Reel Type che non c''è è rifiutato dal database');
select throws_ok($$ insert into public.marketing_contenuti (nome, formato) values ('Contenuto 95 sbagliato', 'inesistente') $$,
  '23503', null, 'e un Format che non c''è');
select throws_ok($$ insert into public.marketing_contenuti (nome, reel_type) values ('Contenuto 95 incrociato', 'split') $$,
  '23503', null, 'il codice di un Format non vale come Reel Type');
select throws_ok($$ insert into public.marketing_contenuti (nome, formato) values ('Contenuto 95 incrociato', 'attraction') $$,
  '23503', null, 'né il contrario');
select throws_ok($$ update public.marketing_contenuti set reel_type = 'nuovo_ma_non_c_e' where id = '95950000-0000-4000-8000-000000000003' $$,
  '23503', null, 'anche cambiando un contenuto che c''è già');
select lives_ok($$ update public.marketing_contenuti set reel_type = 'education' where id = '95950000-0000-4000-8000-000000000003' $$,
  'un codice che c''è passa');
select lives_ok($$ update public.marketing_contenuti set reel_type = null where id = '95950000-0000-4000-8000-000000000003' $$,
  'e «vuoto» sempre');
select throws_ok($$ update public.marketing_contenuti set reel_type_campo = 'formato' where id = '95950000-0000-4000-8000-000000000003' $$,
  '23514', null, 'la metà costante della chiave non si cambia');

-- how many contents use each option
select is(
  (select n from public.conteggi_opzioni_marketing() where campo = 'reel_type' and valore = 'prova_95'), 1,
  'conteggi_opzioni_marketing: un contenuto usa «Prova 95»');
select is(
  (select count(*)::integer from public.conteggi_opzioni_marketing() where n = 0), 0,
  'e le etichette inutilizzate non compaiono');

-- deleting an option empties it from the contents that used it
update public.marketing_contenuti set updated_at = '2026-01-01' where id = '95950000-0000-4000-8000-000000000001';
delete from public.marketing_opzioni where campo = 'reel_type' and valore = 'prova_95';
select is(
  (select reel_type from public.marketing_contenuti where id = '95950000-0000-4000-8000-000000000001'), null,
  'eliminata l''etichetta, il contenuto che la usava resta senza');
select is(
  (select formato from public.marketing_contenuti where id = '95950000-0000-4000-8000-000000000001'), 'prova_95',
  'ma il suo Format, che è un''altra etichetta, resta');
select ok(
  (select updated_at > '2026-01-01' from public.marketing_contenuti where id = '95950000-0000-4000-8000-000000000001'),
  'e la sua versione cambia: chi lo ha aperto se ne accorge');
select is(
  (select reel_type from public.marketing_contenuti where id = '95950000-0000-4000-8000-000000000002'), 'attraction',
  'gli altri contenuti non si toccano');
select is((select count(*)::integer from public.marketing_contenuti where id = '95950000-0000-4000-8000-000000000001'), 1,
  'il contenuto non sparisce');
select is((select count(*)::integer from public.marketing_opzioni where campo = 'formato' and valore = 'prova_95'), 1,
  'e l''etichetta con lo stesso codice nell''altro campo resta');

-- ---------------------------------------------------------------------------
-- 5. Who may do what
-- ---------------------------------------------------------------------------
set local role authenticated;

set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select ok((select count(*) from public.marketing_opzioni) >= 15, 'l''admin legge le etichette');
select lives_ok($$ insert into public.marketing_opzioni (campo, valore, nome, colore) values ('reel_type', 'admin_95', 'Admin 95', 'green') $$,
  'l''admin ne crea una');
select is(pg_temp.righe($$ update public.marketing_opzioni set nome = 'Admin 95 bis', colore = 'red' where valore = 'admin_95' and campo = 'reel_type' $$), 1,
  'la rinomina e la ricolora');
select is(pg_temp.righe($$ delete from public.marketing_opzioni where valore = 'admin_95' and campo = 'reel_type' $$), 1,
  'e la elimina');

set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
select ok((select count(*) from public.marketing_opzioni) >= 15, 'il video editor legge le etichette');
select lives_ok($$ insert into public.marketing_opzioni (campo, valore, nome, colore) values ('formato', 'editor_95', 'Editor 95', 'orange') $$,
  'il video editor ne crea una');
select is(pg_temp.righe($$ update public.marketing_opzioni set nome = 'Editor 95 bis', colore = 'blue' where valore = 'editor_95' $$), 1,
  'la rinomina e la ricolora');
select is(pg_temp.righe($$ delete from public.marketing_opzioni where valore = 'editor_95' $$), 0,
  'ma non la elimina, come i contenuti');
select is((select count(*)::integer from public.marketing_opzioni where valore = 'editor_95'), 1, 'e l''etichetta resta');
select throws_ok($$ update public.marketing_opzioni set valore = 'altro_codice' where valore = 'editor_95' $$,
  '42501', null, 'il codice non si cambia, nemmeno da chi la può rinominare');
select throws_ok($$ update public.marketing_opzioni set campo = 'reel_type' where valore = 'editor_95' $$,
  '42501', null, 'né il campo');
insert into public.marketing_opzioni (campo, valore, nome, created_by, created_at)
values ('formato', 'autore_95', 'Autore 95', '11111111-1111-4111-8111-111111111111', '2020-01-01');
select is(
  (select row(created_by, created_at = now())::text from public.marketing_opzioni where valore = 'autore_95'),
  row('55555555-5555-4555-8555-555555555555'::uuid, true)::text,
  'chi non è l''admin non scrive l''autore né il momento');

set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select ok((select count(*) from public.marketing_opzioni) >= 15, 'il marketing legge le etichette');
select lives_ok($$ insert into public.marketing_opzioni (campo, valore, nome) values ('formato', 'marketing_95', 'Marketing 95') $$,
  'il marketing ne crea una');
select is(pg_temp.righe($$ delete from public.marketing_opzioni where valore = 'marketing_95' $$), 1, 'e la elimina');
select is(pg_temp.righe($$ delete from public.marketing_opzioni where valore = 'editor_95' $$), 1,
  'anche quella del video editor');

-- everybody else: nothing, not even a row
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::integer from public.marketing_opzioni), 0, 'il setter non legge nessuna etichetta');
select throws_ok($$ insert into public.marketing_opzioni (campo, valore, nome) values ('formato', 'setter_95', 'Setter 95') $$,
  '42501', null, 'il setter non ne crea');
select is(pg_temp.righe($$ update public.marketing_opzioni set nome = 'Setter' where valore = 'split' $$), 0, 'né ne rinomina');
select is(pg_temp.righe($$ delete from public.marketing_opzioni where valore = 'split' $$), 0, 'né ne elimina');
select throws_ok($$ select public.crea_opzione_marketing('formato', 'Setter 95') $$, '42501', null,
  'e la funzione che le crea è rifiutata');

set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is((select count(*)::integer from public.marketing_opzioni), 0, 'il closer non legge nessuna etichetta');
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select is((select count(*)::integer from public.marketing_opzioni), 0, 'il coach non legge nessuna etichetta');
select is((select count(*)::integer from public.conteggi_opzioni_marketing()), 0, 'e non conta i contenuti');

-- ---------------------------------------------------------------------------
-- 6. crea_opzione_marketing: the slug, the order, the colour
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
select is((select valore || '|' || nome from public.crea_opzione_marketing('formato', 'Ciao Mondo', 'purple')),
  'ciao_mondo|Ciao Mondo', 'il codice nasce dal nome: minuscolo, trattini bassi');
select is((select colore from public.marketing_opzioni where campo = 'formato' and valore = 'ciao_mondo'), 'purple',
  'con il colore detto');
select is((select valore from public.crea_opzione_marketing('formato', 'Città è  Così')), 'citta_e_cosi',
  'senza accenti né spazi doppi');
select is((select valore from public.crea_opzione_marketing('formato', 'Reel!')), 'reel', 'un nome di punteggiatura intorno a una parola');
select is((select valore from public.crea_opzione_marketing('formato', 'Reel?')), 'reel_2',
  'due nomi con lo stesso codice: il secondo prende _2');
select is((select valore from public.crea_opzione_marketing('formato', 'Reel.')), 'reel_3', 'e il terzo _3');
select is((select valore from public.crea_opzione_marketing('formato', 'Show & Tell 2')), 'show_and_tell_2',
  'la & diventa «and»');
select is((select valore from public.crea_opzione_marketing('formato', '???')), 'etichetta',
  'un nome senza lettere ha comunque un codice');
select is(
  (select o.ordine from public.marketing_opzioni o where o.campo = 'formato' and o.valore = 'show_and_tell_2')
  - (select o.ordine from public.marketing_opzioni o where o.campo = 'formato' and o.valore = 'reel_3'),
  10, 'l''ordine viene dopo l''ultima etichetta del campo, di dieci in dieci');
select is((select colore from public.marketing_opzioni where campo = 'formato' and valore = 'citta_e_cosi') in
  ('blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'red', 'brown', 'gray'), true,
  'senza colore detto ne prende uno dei nove colori veri');
select throws_ok($$ select public.crea_opzione_marketing('formato', 'ciao MONDO') $$, '23505', 'C’è già un’etichetta con questo nome.',
  'un nome che c''è già (maiuscole a parte) non si crea due volte');
select lives_ok($$ select public.crea_opzione_marketing('reel_type', 'Ciao Mondo') $$, 'ma in un altro campo sì');
select throws_ok($$ select public.crea_opzione_marketing('formato', '   ') $$, '22023', 'Scrivi il nome dell’etichetta.', 'un nome vuoto no');
select throws_ok($$ select public.crea_opzione_marketing('formato', repeat('a', 61)) $$, '22023', null, 'un nome di 61 caratteri no');
select throws_ok($$ select public.crea_opzione_marketing('stato', 'Prova') $$, '22023', 'Campo non valido.', 'un campo che non è Reel Type né Format no');
select throws_ok($$ select public.crea_opzione_marketing('formato', 'Colorata', 'magenta') $$, '22023', 'Colore non valido.', 'un colore fuori dai dieci no');

-- ---------------------------------------------------------------------------
-- 7. conteggi_opzioni_marketing
-- ---------------------------------------------------------------------------
select is(
  (select n from public.conteggi_opzioni_marketing() where campo = 'reel_type' and valore = 'attraction'),
  (select count(*)::integer from public.marketing_contenuti where reel_type = 'attraction'),
  'quanti contenuti usano Attraction: il conteggio dice quanti sono');
select is(
  (select count(*)::integer from public.conteggi_opzioni_marketing() c where c.campo = 'formato' and c.valore = 'prova_95'), 1,
  'e Prova 95 formato, usata da un contenuto, compare');

select * from finish();
rollback;
