-- «Pubblicati» (20261025090100, Dany 25/10/2026): v_pubblicati, one row per post or reel
-- of the account (reel, carousel and photo), with the calendar content linked to it (by
-- shortcode), its View Count, the numbers and the leads of the post. The Marketing area
-- (admin, video editor, marketing) reads; setter, closer and the others read nothing.
-- The columns of v_analisi_reel are all there: the reel panel reads either row alike.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(21);

-- ---------------------------------------------------------------------------
-- 0. Data (as postgres)
-- ---------------------------------------------------------------------------
insert into public.marketing_contenuti (id, tipo, nome, stato, url, view_count, created_by) values
  ('97970000-0000-4000-8000-000000000001', 'reel', 'Contenuto 97 collegato', 'posted',
   'https://www.instagram.com/reel/T97Reel01/', null, '11111111-1111-4111-8111-111111111111');

insert into public.instagram_contenuti (media_id, shortcode, permalink, media_type, media_product_type, reel,
  pubblicato_il, didascalia, views, reach, saved, shares, comments, metriche_stato, eliminato_il)
values
  ('9700000000000001', 'T97Reel01', 'https://www.instagram.com/reel/T97Reel01/', 'VIDEO', 'REELS', true,
   now() - interval '5 days', 'Un reel con la sua didascalia lunga abbastanza', 4000, 3000, 120, 80, 14, 'lette', null),
  ('9700000000000002', 'T97Carou02', 'https://www.instagram.com/p/T97Carou02/', 'CAROUSEL_ALBUM', 'FEED', false,
   now() - interval '6 days', 'Un carosello', null, 900, 40, 10, 3, 'lette', null),
  ('9700000000000003', 'T97Foto03', 'https://www.instagram.com/p/T97Foto03/', 'IMAGE', 'FEED', false,
   now() - interval '7 days', null, null, null, null, null, null, 'senza_permesso', null),
  ('9700000000000004', 'T97Gone04', 'https://www.instagram.com/reel/T97Gone04/', 'VIDEO', 'REELS', true,
   now() - interval '8 days', 'Sparito da Instagram', 100, 90, 1, 0, 0, 'lette', now() - interval '1 day'),
  -- published today: the Insight has not counted its days yet
  ('9700000000000005', 'T97Oggi05', 'https://www.instagram.com/reel/T97Oggi05/', 'VIDEO', 'REELS', true,
   now(), 'Uscito oggi', 10, 9, 0, 0, 0, 'lette', null);

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
select has_view('public', 'v_pubblicati', 'la view dei pubblicati c''è');
select ok(
  coalesce((select c.reloptions @> array['security_invoker=true'] from pg_class c where c.oid = 'public.v_pubblicati'::regclass), false),
  'è security_invoker: gira coi permessi di chi legge');
select is(
  (select count(*)::integer from information_schema.columns v
   where v.table_schema = 'public' and v.table_name = 'v_analisi_reel'
     and not exists (select 1 from information_schema.columns p
                     where p.table_schema = 'public' and p.table_name = 'v_pubblicati' and p.column_name = v.column_name
                       and p.data_type = v.data_type)),
  1,
  'ha tutte le colonne di v_analisi_reel, tranne stato_collegamento (le proposte non si mostrano più)');
select has_column('public', 'v_pubblicati', 'view_count_da_instagram', 'dice se il View Count arriva da Instagram');
select has_column('public', 'v_pubblicati', 'didascalia', 'porta la didascalia intera (la ricerca)');

-- ---------------------------------------------------------------------------
-- 2. What it says
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from public.v_pubblicati where media_id like '97000000000000%'), 5,
  'ogni tipo di post: reel, carosello, foto, anche quello sparito da Instagram');
select is((select count(*)::integer from public.v_analisi_reel where media_id like '97000000000000%'), 3,
  'v_analisi_reel resta com''era: solo i reel');
select is((select nome from public.v_pubblicati where media_id = '9700000000000001'), 'Contenuto 97 collegato',
  'il reel collegato porta il Name del suo contenuto');
select is((select view_count from public.v_pubblicati where media_id = '9700000000000001'), 4000,
  'e il suo View Count, arrivato da Instagram');
select is((select view_count_da_instagram from public.v_pubblicati where media_id = '9700000000000001'), true,
  'detto «da Instagram»');
select is((select contenuto_id from public.v_pubblicati where media_id = '9700000000000002'), null,
  'un carosello senza contenuto: contenuto_id vuoto');
select is((select views from public.v_pubblicati where media_id = '9700000000000002'), null,
  'e senza views: null, non 0');
select is((select reach from public.v_pubblicati where media_id = '9700000000000002'), 900, 'la copertura c''è');
select is((select eliminato from public.v_pubblicati where media_id = '9700000000000004'), true, 'il post sparito è detto sparito');
select is((select didascalia_inizio from public.v_pubblicati where media_id = '9700000000000001'),
  'Un reel con la sua didascalia lunga abbastanza', 'l''inizio della didascalia');
select is((select reel from public.v_pubblicati where media_id = '9700000000000003'), false, 'la foto non è un reel');
select is((select dm from public.v_pubblicati where media_id = '9700000000000005'), null,
  'i lead non ancora contati dall''Insight sono null, non 0');

-- ---------------------------------------------------------------------------
-- 3. Who reads
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is((select count(*)::integer from public.v_pubblicati where media_id like '97000000000000%'), 5, 'il marketing legge tutti i post');
set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
select is((select count(*)::integer from public.v_pubblicati where media_id like '97000000000000%'), 5, 'il video editor pure');
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::integer from public.v_pubblicati), 0, 'il setter non vede niente');
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is((select count(*)::integer from public.v_pubblicati), 0, 'e il closer neanche');

select * from finish();
rollback;
