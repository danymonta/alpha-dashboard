-- The content scoring and the «Claude only after a click» rule (1.39.0,
-- 20261020090000_punteggio_contenuti.sql): the score next to the analysis, who reads it,
-- the redo that becomes a content (index 9), the planner that queues no analysis by itself,
-- and the Spunti that are only on request.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(42);

create or replace function pg_temp.codice(p_sql text)
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

insert into public.instagram_contenuti (media_id, shortcode, permalink, media_type, reel, pubblicato_il) values
  ('9000000000000001', 'T90Reel01', 'https://www.instagram.com/reel/T90Reel01/', 'VIDEO', true, now() - interval '5 days'),
  ('9000000000000002', 'T90Reel02', 'https://www.instagram.com/reel/T90Reel02/', 'VIDEO', true, now() - interval '6 days'),
  ('9000000000000003', 'T90Reel03', 'https://www.instagram.com/reel/T90Reel03/', 'VIDEO', true, now() - interval '2 days');

-- ---------------------------------------------------------------------------
-- 1. Structure
-- ---------------------------------------------------------------------------
select has_column('public', 'marketing_analisi', 'punteggio', 'l''analisi ha il punteggio');
select has_column('public', 'marketing_analisi', 'punteggio_totale', 'e il totale per le liste');
select has_column('public', 'marketing_analisi', 'punteggio_fascia', 'e la fascia per i filtri');
select has_column('public', 'marketing_analisi', 'punteggio_tipo', 'e il tipo');
select has_column('public', 'marketing_analisi', 'versione_guida', 'e la versione della guida');
select hasnt_column('public', 'call_lavori_stato', 'spunti_automatici', 'l''interruttore degli spunti automatici non c''è più');
select policies_are('public', 'marketing_analisi',
  array['marketing_analisi_lettura', 'marketing_analisi_lettura_come_admin', 'marketing_analisi_mai_da_oauth'], 'le analisi: sempre solo lettura, nessuna policy nuova');
select hasnt_column('public', 'marketing_analisi', 'created_by', 'nessun autore: sono contenuti, non persone');

-- ---------------------------------------------------------------------------
-- 2. marketing_analisi_fine with the score
-- ---------------------------------------------------------------------------
insert into public.marketing_analisi (id, media_id, motivo, stato, periodo_da, periodo_a, iniziata_il) values
  ('90900000-0000-4000-8000-000000000001', '9000000000000001', 'richiesta', 'in_corso', public.oggi() - 28, public.oggi() - 1, now()),
  ('90900000-0000-4000-8000-000000000002', '9000000000000002', 'richiesta', 'in_corso', public.oggi() - 28, public.oggi() - 1, now());

select is(pg_temp.codice($$ select public.marketing_analisi_fine('90900000-0000-4000-8000-000000000001', 'pronta', '{}', '{"sintesi":"x"}', '{}', 'm', 'v', null, null,
  '{"totale":150,"fascia":"pubblicare","tipo":"mof"}'::jsonb, 'g') $$), '22023', 'un totale oltre 100 non passa');
select is(pg_temp.codice($$ select public.marketing_analisi_fine('90900000-0000-4000-8000-000000000001', 'pronta', '{}', '{"sintesi":"x"}', '{}', 'm', 'v', null, null,
  '{"totale":70,"fascia":"ottima","tipo":"mof"}'::jsonb, 'g') $$), '22023', 'una fascia che non esiste no');
select is(pg_temp.codice($$ select public.marketing_analisi_fine('90900000-0000-4000-8000-000000000001', 'pronta', '{}', '{"sintesi":"x"}', '{}', 'm', 'v', null, null,
  '{"totale":70,"fascia":"rifare_le_parti_deboli","tipo":"story"}'::jsonb, 'g') $$), '22023', 'un tipo che non è TOF, MOF o BOF no');
select is(
  public.marketing_analisi_fine('90900000-0000-4000-8000-000000000001', 'pronta', '{}', '{"sintesi":"x"}', '{"punteggio":"si"}', 'claude-sonnet-5-5', 'v', null, null,
    '{"totale":72,"fascia":"rifare_le_parti_deboli","tipo":"mof","rifacimento":{"script_riscritto":"Hook: prova"}}'::jsonb, '2026-10-16.1'),
  true, 'un punteggio valido si salva con l''analisi');
select is(
  (select row(punteggio_totale, punteggio_fascia, punteggio_tipo, versione_guida, stato::text)::text from public.marketing_analisi where id = '90900000-0000-4000-8000-000000000001'),
  row(72::smallint, 'rifare_le_parti_deboli'::text, 'mof'::text, '2026-10-16.1'::text, 'pronta'::text)::text,
  'totale, fascia e tipo vengono dal documento, la versione dal parametro');
select is(
  public.marketing_analisi_fine('90900000-0000-4000-8000-000000000002', 'pronta', '{}', '{"sintesi":"y"}', '{}', 'm', 'v', null, null),
  true, 'un''analisi senza punteggio (il punteggio non è riuscito) si salva lo stesso');
select is(
  (select row(punteggio is null, punteggio_totale is null, punteggio_fascia is null, punteggio_tipo is null, versione_guida is null)::text
   from public.marketing_analisi where id = '90900000-0000-4000-8000-000000000002'),
  row(true, true, true, true, true)::text, 'e i cinque campi del punteggio restano vuoti insieme');
select throws_ok(
  $$ update public.marketing_analisi set punteggio_totale = 50 where id = '90900000-0000-4000-8000-000000000002' $$,
  '23514', null, 'il totale da solo non si scrive: tutto o niente');
select throws_ok(
  $$ update public.marketing_analisi set stato = 'fallita', errore = 'x', finita_il = now(), contenuto = null
     where id = '90900000-0000-4000-8000-000000000001' $$,
  '23514', null, 'un''analisi con un punteggio resta pronta (il contenuto è obbligatorio)');

-- a ready analysis that goes back to the queue has no score in it (a retry never keeps a stale one)
insert into public.marketing_analisi (id, media_id, motivo, stato, periodo_da, periodo_a, iniziata_il) values
  ('90900000-0000-4000-8000-000000000003', '9000000000000003', 'richiesta', 'in_corso', public.oggi() - 28, public.oggi() - 1, now());
select is(public.marketing_analisi_fine('90900000-0000-4000-8000-000000000003', 'in_coda', null, null, null, null, null, 'x', now() + interval '10 minutes',
  '{"totale":50,"fascia":"riscrivere","tipo":"tof"}'::jsonb, 'g'), true, 'in_coda ignora un punteggio che arriva per sbaglio');
select is((select punteggio_totale is null from public.marketing_analisi where id = '90900000-0000-4000-8000-000000000003'), true,
  'e non lo scrive');

-- ---------------------------------------------------------------------------
-- 3. The view of the page: the score of the last ready analysis that has one
-- ---------------------------------------------------------------------------
select is(
  (select row(punteggio_totale, punteggio_fascia, punteggio_tipo)::text from public.v_analisi_reel where media_id = '9000000000000001'),
  row(72::smallint, 'rifare_le_parti_deboli'::text, 'mof'::text)::text, 'la vista porta il punteggio del reel');
select is((select punteggio_totale is null from public.v_analisi_reel where media_id = '9000000000000002'), true,
  'un reel con l''analisi senza punteggio è «non valutato»');
-- a newer analysis without a score does not hide the older score
insert into public.marketing_analisi (id, media_id, motivo, stato, periodo_da, periodo_a, contenuto, finita_il, created_at) values
  ('90900000-0000-4000-8000-000000000004', '9000000000000001', 'richiesta', 'pronta', public.oggi() - 28, public.oggi() - 1,
   '{"sintesi":"nuova"}', now(), now() + interval '1 minute');
select is((select punteggio_totale from public.v_analisi_reel where media_id = '9000000000000001'), 72::smallint,
  'un''analisi più nuova senza punteggio non nasconde il precedente');

-- ---------------------------------------------------------------------------
-- 4. Who reads the score
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select punteggio_totale from public.marketing_analisi where id = '90900000-0000-4000-8000-000000000001'), 72::smallint, 'l''admin lo legge');
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is((select punteggio_totale from public.marketing_analisi where id = '90900000-0000-4000-8000-000000000001'), 72::smallint, 'il marketing lo legge');
set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
select is((select punteggio_totale from public.marketing_analisi where id = '90900000-0000-4000-8000-000000000001'), 72::smallint, 'il video editor lo legge');
select is(pg_temp.codice($$ update public.marketing_analisi set punteggio_totale = 99 where id = '90900000-0000-4000-8000-000000000001' $$), '42501',
  'ma non lo scrive');
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::integer from public.marketing_analisi), 0, 'il setter non vede nessuna analisi');
select is((select count(*)::integer from public.v_analisi_reel), 0, 'né la vista');
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is((select count(*)::integer from public.marketing_analisi), 0, 'il closer nemmeno');
-- a token of Claude connected through the MCP (a client_id in the JWT) reads nothing
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","client_id":"c0000000-0000-4000-8000-000000000001"}';
select is((select count(*)::integer from public.marketing_analisi), 0, 'un token di Claude non legge nemmeno il punteggio');
reset role;
set local request.jwt.claims to '{}';

-- ---------------------------------------------------------------------------
-- 5. The redo as a content (index 9, once)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is(pg_temp.codice($$ insert into public.marketing_contenuti (tipo, nome, da_analisi, da_idea)
  values ('reel', 'Rifacimento T90', '90900000-0000-4000-8000-000000000001', 9) $$), 'ok', 'il rifacimento di un''analisi che lo ha entra nel calendario');
select is(pg_temp.codice($$ insert into public.marketing_contenuti (tipo, nome, da_analisi, da_idea)
  values ('reel', 'Rifacimento T90 bis', '90900000-0000-4000-8000-000000000001', 9) $$), '23505', 'ma una volta sola');
select is(pg_temp.codice($$ insert into public.marketing_contenuti (tipo, nome, da_analisi, da_idea)
  values ('reel', 'Senza rifacimento', '90900000-0000-4000-8000-000000000002', 9) $$), '22023', 'un''analisi senza punteggio non ha il rifacimento');
select is(pg_temp.codice($$ insert into public.marketing_contenuti (tipo, nome, da_analisi, da_idea)
  values ('reel', 'Idea che non c''è', '90900000-0000-4000-8000-000000000001', 4) $$), '22023', 'e un''idea oltre quelle dell''analisi no');
reset role;
set local request.jwt.claims to '{}';

-- ---------------------------------------------------------------------------
-- 6. The planner: Claude only after a click
-- ---------------------------------------------------------------------------
delete from public.marketing_contenuti where da_analisi is not null;
delete from public.marketing_analisi;
delete from public.instagram_letture;
update public.instagram_contenuti set eliminato_il = now() where media_id !~ '^9000000000000';
update public.marketing_lavori_stato set automatiche = true;
update public.instagram_contenuti_stato set permesso_insights = true;
select public.marketing_pianifica();
select is((select array_agg(distinct richiesta) from public.instagram_letture), array['trascrizione'],
  'la notte legge solo il parlato: mai la lettura con lo sguardo di Claude');
select is((select count(*)::integer from public.marketing_analisi), 0, 'e non mette in coda nessuna analisi');
-- an old completa automatic reading left in the queue is not picked up by the night
update public.instagram_letture set richiesta = 'completa', stato = 'in_coda';
select is((select count(*)::integer from public.marketing_scegli_lavoro(((public.oggi()::timestamp + time '03:00') at time zone 'Europe/Rome'))), 0,
  'una lettura completa automatica rimasta in coda non parte: serve il click');
update public.instagram_letture set richiesta = 'completa', motivo = 'richiesta', priorita = 2;
select is((select count(*)::integer from public.marketing_scegli_lavoro(((public.oggi()::timestamp + time '15:00') at time zone 'Europe/Rome'))), 1,
  'quella chiesta da una persona parte a qualsiasi ora');

-- ---------------------------------------------------------------------------
-- 7. The Spunti only on request, the call switch
-- ---------------------------------------------------------------------------
delete from public.marketing_spunti;
select public.call_pianifica();
select is((select count(*)::integer from public.marketing_spunti), 0, 'il pianificatore delle call non mette in coda lo spunto del lunedì');
select is(pg_temp.codice($$ select public.call_tick() $$), 'ok', 'il tick delle call gira');
select is((select count(*)::integer from public.marketing_spunti where motivo = 'automatica'), 0, 'e non ne crea');
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(
  (select exists (select 1 from jsonb_object_keys(public.call_lavori_situazione()) k where k = 'spunti_automatici')),
  false, 'la situazione non parla più di spunti automatici');
reset role;
set local request.jwt.claims to '{}';

select * from finish();
rollback;
