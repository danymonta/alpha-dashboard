-- View Count that fills and updates itself from Instagram (20261025090000, Dany
-- 25/10/2026). A content linked to a post of Instagram (the shortcode of its URL)
-- takes the post's views as its View Count: when the post is read or its views
-- change, and when the content gets or changes its URL. Views null (not read) never
-- overwrite; a content not linked keeps the number written by hand and stays
-- editable; a number that comes from Instagram is not written from a session; the
-- automatic refresh does not move updated_at (the content's version for Claude),
-- every edit of a person does.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(48);

-- ---------------------------------------------------------------------------
-- 0. The data (as postgres: no session)
-- ---------------------------------------------------------------------------
insert into public.marketing_contenuti (id, tipo, nome, stato, url, view_count, created_by) values
  -- linked by URL to a post that is not read yet, with a number written by hand
  ('96960000-0000-4000-8000-000000000001', 'reel', 'Contenuto 96 con link e numero a mano', 'posted',
   'https://www.instagram.com/reel/T96PostA01/', 50, '11111111-1111-4111-8111-111111111111'),
  -- not linked, a number by hand
  ('96960000-0000-4000-8000-000000000002', 'reel', 'Contenuto 96 senza link', 'posted', null, 77,
   '11111111-1111-4111-8111-111111111111'),
  -- not linked, no number: the person pastes the URL later
  ('96960000-0000-4000-8000-000000000003', 'reel', 'Contenuto 96 da collegare', 'posted', null, null,
   '11111111-1111-4111-8111-111111111111'),
  -- linked to a post whose views are not read
  ('96960000-0000-4000-8000-000000000004', 'reel', 'Contenuto 96 post senza views', 'posted',
   'https://www.instagram.com/reel/T96PostC03/', 12, '11111111-1111-4111-8111-111111111111');

insert into public.instagram_contenuti (media_id, shortcode, permalink, media_type, media_product_type, reel,
  pubblicato_il, didascalia, views)
values
  ('9600000000000002', 'T96PostB02', 'https://www.instagram.com/reel/T96PostB02/', 'VIDEO', 'REELS', true, now() - interval '3 days', 'B', 3000),
  ('9600000000000003', 'T96PostC03', 'https://www.instagram.com/reel/T96PostC03/', 'VIDEO', 'REELS', true, now() - interval '3 days', 'C', null),
  ('9600000000000004', 'T96PostD04', 'https://www.instagram.com/reel/T96PostD04/', 'VIDEO', 'REELS', true, now() - interval '3 days', 'D', 0),
  ('9600000000000005', 'T96PostE05', 'https://www.instagram.com/reel/T96PostE05/', 'VIDEO', 'REELS', true, now() - interval '3 days', 'E', null);

-- a known old updated_at on the rows the checks compare (the table's own trigger sets now())
alter table public.marketing_contenuti disable trigger marketing_contenuti_set_updated_at;
update public.marketing_contenuti set updated_at = '2026-01-01 10:00:00+00'
 where id::text like '96960000-0000-4000-8000-%';
alter table public.marketing_contenuti enable trigger marketing_contenuti_set_updated_at;

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
select has_column('public', 'marketing_contenuti', 'view_count_da_instagram', 'il contenuto dice se il View Count arriva da Instagram');
select col_default_is('public', 'marketing_contenuti', 'view_count_da_instagram', 'false', 'di base no');
select has_trigger('public', 'instagram_contenuti', 'instagram_contenuti_view_count', 'il post riscrive il View Count dei contenuti collegati');
select has_trigger('public', 'marketing_contenuti', 'marketing_contenuti_view_count_da_post', 'il contenuto che prende un URL prende le views del post');
select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('instagram_contenuti_view_count', 'marketing_contenuti_view_count_da_post')
     and p.prosecdef and p.proconfig @> array['search_path=""']),
  2,
  'le due funzioni sono security definer con search_path vuoto');

-- ---------------------------------------------------------------------------
-- 2. The post is read: the contents linked to it follow
-- ---------------------------------------------------------------------------
select is((select view_count from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000001'), 50,
  'finché il post non c''è, il numero scritto a mano resta');
select is((select view_count_da_instagram from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000001'), false,
  'e non è «da Instagram»');

insert into public.instagram_contenuti (media_id, shortcode, permalink, media_type, media_product_type, reel,
  pubblicato_il, didascalia, views)
values ('9600000000000001', 'T96PostA01', 'https://www.instagram.com/reel/T96PostA01/', 'VIDEO', 'REELS', true,
        now() - interval '3 days', 'A', 1000);

select is((select view_count from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000001'), 1000,
  'il post letto con 1.000 views: il contenuto collegato le prende');
select is((select view_count_da_instagram from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000001'), true,
  'ora il numero è «da Instagram»');
select is((select updated_at from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000001'),
  '2026-01-01 10:00:00+00'::timestamptz,
  'il giro che scrive le views non muove updated_at: per Claude il contenuto non è cambiato');

update public.instagram_contenuti set views = 2500 where shortcode = 'T96PostA01';
select is((select view_count from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000001'), 2500,
  'le views cambiano: il View Count le segue');
select is((select updated_at from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000001'),
  '2026-01-01 10:00:00+00'::timestamptz, 'anche questa volta updated_at resta');

update public.instagram_contenuti set views = null where shortcode = 'T96PostA01';
select is((select view_count from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000001'), 2500,
  'views null = non letto: il numero di prima resta, mai sovrascritto con null');
select is((select view_count_da_instagram from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000001'), true,
  'e resta «da Instagram»');

update public.instagram_contenuti set views = 2500 where shortcode = 'T96PostA01';
select is((select view_count from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000001'), 2500,
  'riscrivere lo stesso numero non cambia niente (idempotente)');

-- an upsert like the run's (on conflict do update) goes through the same trigger
insert into public.instagram_contenuti (media_id, shortcode, permalink, media_type, media_product_type, reel,
  pubblicato_il, didascalia, views)
values ('9600000000000001', 'T96PostA01', 'https://www.instagram.com/reel/T96PostA01/', 'VIDEO', 'REELS', true,
        now() - interval '3 days', 'A', 3100)
on conflict (media_id) do update set views = excluded.views;
select is((select view_count from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000001'), 3100,
  'l''upsert del giro aggiorna il View Count');

select is((select view_count from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000002'), 77,
  'un contenuto non collegato mantiene il numero scritto a mano');
select is((select view_count_da_instagram from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000002'), false,
  'e non è «da Instagram»');
select is((select view_count from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000004'), 12,
  'un contenuto il cui post non ha views (non letto) mantiene il suo numero');
select is((select view_count_da_instagram from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000004'), false,
  'e resta modificabile a mano');
select is((select count(*)::integer from public.marketing_abbinamenti_rifiutati where shortcode like 'T96%'), 0,
  'il giro delle views non scrive nessun «no» (scollegamenti)');

-- ---------------------------------------------------------------------------
-- 3. A person pastes the URL: the content takes the views at once
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';

select lives_ok(
  $$update public.marketing_contenuti set url = 'https://www.instagram.com/reel/T96PostB02/' where id = '96960000-0000-4000-8000-000000000003'$$,
  'il marketing incolla il link del reel');
select is((select view_count from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000003'), 3000,
  'il contenuto prende subito le views del post già letto');
select is((select view_count_da_instagram from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000003'), true,
  '«da Instagram»');
select ok((select updated_at from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000003') > '2026-01-01 10:00:00+00'::timestamptz,
  'incollare il link è una modifica di una persona: updated_at si muove');
select is((select created_by from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000003'),
  '11111111-1111-4111-8111-111111111111'::uuid,
  'il trigger «chi l''ha creato» regge anche con la scrittura delle views');

-- a number from Instagram is not written by hand
select throws_ok(
  $$update public.marketing_contenuti set view_count = 5 where id = '96960000-0000-4000-8000-000000000003'$$,
  '23514', null, 'un View Count che arriva da Instagram non si scrive a mano');
select is((select view_count from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000003'), 3000,
  'e resta quello di Instagram');
select lives_ok(
  $$update public.marketing_contenuti set nome = 'Contenuto 96 da collegare, rinominato' where id = '96960000-0000-4000-8000-000000000003'$$,
  'le altre proprietà si cambiano come sempre');
select lives_ok(
  $$update public.marketing_contenuti set view_count = view_count where id = '96960000-0000-4000-8000-000000000003'$$,
  'riscrivere lo stesso numero non è un errore');
select throws_ok(
  $$update public.marketing_contenuti set view_count = 1 where id = '96960000-0000-4000-8000-000000000003' and view_count_da_instagram$$,
  '23514', null, 'nemmeno insieme a un filtro');

-- the flag is the database's alone
select lives_ok(
  $$update public.marketing_contenuti set view_count_da_instagram = true, view_count = 9 where id = '96960000-0000-4000-8000-000000000002'$$,
  'una sessione che prova a scrivere il segno «da Instagram» su un contenuto libero');
select is((select view_count_da_instagram from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000002'), false,
  'il segno non cambia da una sessione');
select is((select view_count from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000002'), 9,
  'ma il numero di un contenuto libero si scrive a mano');
select lives_ok(
  $$update public.marketing_contenuti set view_count_da_instagram = false where id = '96960000-0000-4000-8000-000000000003'$$,
  'togliere il segno da una sessione non fa errore');
select is((select view_count_da_instagram from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000003'), true,
  'e non lo toglie');
select lives_ok(
  $$insert into public.marketing_contenuti (id, tipo, nome, view_count, view_count_da_instagram)
    values ('96960000-0000-4000-8000-000000000005', 'reel', 'Contenuto 96 nuovo con il segno', 8, true)$$,
  'un contenuto nuovo scritto da una sessione con il segno acceso');
select is((select view_count_da_instagram from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000005'), false,
  'nasce senza il segno');

-- the link changes to a post without views: the number stays, editable by hand
select lives_ok(
  $$update public.marketing_contenuti set url = 'https://www.instagram.com/reel/T96PostE05/' where id = '96960000-0000-4000-8000-000000000003'$$,
  'il link passa a un post senza views');
select is((select view_count from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000003'), 3000,
  'il numero di prima resta');
select is((select view_count_da_instagram from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000003'), false,
  'ma non è più «da Instagram»: si scrive a mano');
select lives_ok(
  $$update public.marketing_contenuti set view_count = 3200 where id = '96960000-0000-4000-8000-000000000003'$$,
  'infatti si può cambiare');

-- the post with zero views is a number too
select lives_ok(
  $$update public.marketing_contenuti set url = 'https://www.instagram.com/reel/T96PostD04/' where id = '96960000-0000-4000-8000-000000000003'$$,
  'il link passa a un post con 0 views');
select is((select view_count from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000003'), 0,
  '0 views è un numero letto, non un «non letto»');

-- the link is taken away: the number stays and the field is free
select lives_ok(
  $$update public.marketing_contenuti set url = null where id = '96960000-0000-4000-8000-000000000003'$$,
  'si toglie il link');
select is((select view_count_da_instagram from public.marketing_contenuti where id = '96960000-0000-4000-8000-000000000003'), false,
  'il View Count torna a mano');

-- the admin follows the same rule
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok(
  $$update public.marketing_contenuti set view_count = 1 where id = '96960000-0000-4000-8000-000000000001'$$,
  '23514', null, 'nemmeno l''admin scrive a mano un numero che arriva da Instagram');

-- ---------------------------------------------------------------------------
-- 4. No session: the seed, the import and the restore are free
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims to '{}';
select lives_ok(
  $$update public.marketing_contenuti set view_count = 4 where id = '96960000-0000-4000-8000-000000000001'$$,
  'senza sessione (seed, import, ripristino) si scrive come sempre');

select * from finish();
rollback;
