-- The statistics of the posts (1.36.0, 20261016090000_statistiche_post.sql):
-- the one function that writes them, the photo of the day, the end of the
-- statistics phase of the morning run, the views and who reads what.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(69);

-- A reel of the test, published 5 days ago (120 hours), and one of 4 days
insert into public.instagram_contenuti (media_id, shortcode, permalink, media_type, reel, pubblicato_il) values
  ('7900000000000001', 'T79Reel01', 'https://www.instagram.com/reel/T79Reel01/', 'VIDEO', true, now() - interval '120 hours'),
  ('7900000000000002', 'T79Reel02', 'https://www.instagram.com/reel/T79Reel02/', 'VIDEO', true, now() - interval '96 hours'),
  ('7900000000000003', 'T79Feed03', 'https://www.instagram.com/p/T79Feed03/', 'IMAGE', false, now() - interval '30 hours');

-- ---------------------------------------------------------------------------
-- 1. Structure
-- ---------------------------------------------------------------------------
select has_table('public', 'instagram_contenuti_misure', 'lo storico dei numeri ha la sua tabella');
select col_is_pk('public', 'instagram_contenuti_misure', array['media_id', 'giorno'], 'una foto per post e per giorno');
select fk_ok('public', 'instagram_contenuti_misure', 'media_id', 'public', 'instagram_contenuti', 'media_id',
  'ogni foto è di un post');
select has_table('public', 'instagram_account_misure', 'i follower del giorno hanno la loro tabella');
select col_is_pk('public', 'instagram_account_misure', 'giorno', 'una riga al giorno');
select has_column('public', 'instagram_contenuti', 'video_disponibile', 'video_disponibile');
select has_column('public', 'instagram_contenuti', 'durata_ms', 'durata_ms');
select has_column('public', 'instagram_contenuti_stato', 'permesso_insights', 'il permesso degli insights sta nello stato');
select ok((select relrowsecurity from pg_class where oid = 'public.instagram_contenuti_misure'::regclass)
  and (select relrowsecurity from pg_class where oid = 'public.instagram_account_misure'::regclass), 'RLS attiva');
select policies_are('public', 'instagram_contenuti_misure',
  array['instagram_contenuti_misure_lettura', 'instagram_contenuti_misure_lettura_come_admin', 'instagram_contenuti_misure_mai_da_oauth'], 'le foto: solo la lettura');
select policies_are('public', 'instagram_account_misure',
  array['instagram_account_misure_lettura', 'instagram_account_misure_lettura_come_admin', 'instagram_account_misure_mai_da_oauth'], 'i follower: solo la lettura');
select throws_ok(
  $$ insert into public.instagram_contenuti_misure (media_id, giorno, letto_il, eta_ore, skip_rate)
     values ('7900000000000001', public.oggi(), now(), 5, 1.5) $$,
  '23514', null, 'skip_rate resta tra 0 e 1');
select throws_ok(
  $$ insert into public.instagram_contenuti_misure (media_id, giorno, letto_il, eta_ore)
     values ('7900000000000001', public.oggi(), now(), -1) $$,
  '23514', null, 'l''età non è negativa');
select throws_ok($$ update public.instagram_contenuti set durata_ms = 0 where media_id = '7900000000000001' $$,
  '23514', null, 'la durata è positiva');

-- ---------------------------------------------------------------------------
-- 2. instagram_salva_metriche
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('anon', 'public.instagram_salva_metriche(jsonb)', 'execute')
  and not has_function_privilege('authenticated', 'public.instagram_salva_metriche(jsonb)', 'execute')
  and has_function_privilege('service_role', 'public.instagram_salva_metriche(jsonb)', 'execute'),
  'la scrive solo il service role');
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p
   where p.oid = 'public.instagram_salva_metriche(jsonb)'::regprocedure),
  'security definer con search_path vuoto');

select is(
  public.instagram_salva_metriche('[{"media_id":"7900000000000001","stato":"lette","valori":{"views":4200,"reach":3000,"saved":90,"shares":30,"skip_rate":38.5,"avg_watch_ms":9800,"follows":-3}}]'),
  1, 'una riga letta: una scritta');
select is(
  (select row(views, reach, saved, shares, skip_rate, avg_watch_ms, follows, metriche_stato)::text
   from public.instagram_contenuti where media_id = '7900000000000001'),
  row(4200, 3000, 90, 30, 0.3850::numeric, 9800, null::integer, 'lette'::text)::text,
  'i numeri; skip_rate 38,5 diventa 0,385; un negativo diventa null');
select ok((select metriche_il is not null from public.instagram_contenuti where media_id = '7900000000000001'),
  'metriche_il segna la lettura');
select is((select permesso_insights from public.instagram_contenuti_stato where id), true,
  'una lettura con un numero dice che il permesso c''è');

-- a key absent leaves the number, a key null empties it, a string and a huge number are null
select public.instagram_salva_metriche('[{"media_id":"7900000000000001","stato":"lette","valori":{"reach":null,"saved":"tanti","shares":99999999999,"likes":12}}]');
select is(
  (select row(views, reach, saved, shares, likes)::text from public.instagram_contenuti where media_id = '7900000000000001'),
  row(4200, null::integer, null::integer, null::integer, 12)::text,
  'chiave assente: il numero resta; null: lo toglie; una stringa o un numero enorme: null');
select public.instagram_salva_metriche('[{"media_id":"7900000000000001","stato":"lette","valori":{"skip_rate":150,"view_total_ms":9000000000}}]');
select is(
  (select row(skip_rate, view_total_ms)::text from public.instagram_contenuti where media_id = '7900000000000001'),
  row(null::numeric, 9000000000::bigint)::text,
  'skip_rate 150 è null; il tempo totale di visione passa i 2 miliardi');

-- a refusal over a read post changes nothing
select public.instagram_salva_metriche('[{"media_id":"7900000000000001","stato":"senza_permesso"}]');
select is((select metriche_stato from public.instagram_contenuti where media_id = '7900000000000001'), 'lette',
  'un post già letto resta letto, anche se oggi Meta rifiuta');
select is((select views from public.instagram_contenuti where media_id = '7900000000000001'), 4200,
  'e tiene i suoi numeri');

-- a refusal over a post never read: the state only
select public.instagram_salva_metriche('[{"media_id":"7900000000000002","stato":"senza_permesso"}]');
select is(
  (select row(metriche_stato, metriche_il is null, views)::text from public.instagram_contenuti where media_id = '7900000000000002'),
  row('senza_permesso'::text, true, null::integer)::text,
  'un post mai letto prende lo stato, senza metriche_il né numeri');
select public.instagram_salva_metriche('[{"media_id":"7900000000000002","stato":"prima_della_conversione"}]');
select is((select metriche_stato from public.instagram_contenuti where media_id = '7900000000000002'), 'prima_della_conversione',
  'lo stato cambia finché il post non è letto');

-- an answer with no number is no reading
select is(public.instagram_salva_metriche('[{"media_id":"7900000000000002","stato":"lette","valori":{}}]'), 0,
  'una lettura senza numeri non scrive niente');
select is(
  (select row(metriche_stato, metriche_il is null)::text from public.instagram_contenuti where media_id = '7900000000000002'),
  row('non_disponibili'::text, true)::text,
  'e conta come non disponibile, senza metriche_il');
select is((select count(*)::integer from public.instagram_contenuti_misure where media_id = '7900000000000002'), 0,
  'né una foto tutta vuota nello storico');

select throws_ok($$ select public.instagram_salva_metriche('{}') $$, '22023', null, 'le righe sono un elenco');
select throws_ok(
  $$ select public.instagram_salva_metriche((select jsonb_agg('{"media_id":"7900000000000001","stato":"non_disponibili"}'::jsonb)
                                            from generate_series(1, 201))) $$,
  '22023', null, '201 righe: troppe');
select is(public.instagram_salva_metriche('[{"media_id":"9999999999999999","stato":"lette","valori":{"views":1}}]'), 0,
  'un media_id che non c''è si salta');

-- ---------------------------------------------------------------------------
-- 3. The photo of the day
-- ---------------------------------------------------------------------------
select is((select count(*)::integer from public.instagram_contenuti_misure where media_id = '7900000000000001'), 1,
  'tre letture nello stesso giorno di Roma: una foto');
select is((select likes from public.instagram_contenuti_misure where media_id = '7900000000000001'), 12,
  'e vince l''ultima');
select ok((select eta_ore between 119.9 and 120.1 from public.instagram_contenuti_misure where media_id = '7900000000000001'),
  'l''età in ore è quella della lettura');
update public.instagram_contenuti set metriche_il = now() - interval '2 days' where media_id = '7900000000000001';
select is((select count(*)::integer from public.instagram_contenuti_misure where media_id = '7900000000000001'), 2,
  'una lettura di un altro giorno: una seconda foto');
select ok((select eta_ore between 71.9 and 72.1 from public.instagram_contenuti_misure
           where media_id = '7900000000000001' and giorno = ((now() - interval '2 days') at time zone 'Europe/Rome')::date), 'con la sua età: 72 ore');
-- the listing's own upsert writes no photo
update public.instagram_contenuti set letto_il = now(), didascalia = 'Una didascalia' where media_id = '7900000000000001';
select is((select count(*)::integer from public.instagram_contenuti_misure where media_id = '7900000000000001'), 2,
  'un aggiornamento dell''elenco non scrive storico');
-- a state other than lette writes none
update public.instagram_contenuti set metriche_stato = 'non_disponibili', metriche_il = now() - interval '1 day'
where media_id = '7900000000000003';
select is((select count(*)::integer from public.instagram_contenuti_misure where media_id = '7900000000000003'), 0,
  'uno stato diverso da lette non scrive storico');

-- ---------------------------------------------------------------------------
-- 4. The end of the statistics phase
-- ---------------------------------------------------------------------------
create temp table giro79 on commit drop as
select (public.instagram_contenuti_inizia_giro('notte') ->> 'giro')::uuid as id;
select is(public.instagram_contenuti_metriche_fine('00000000-0000-4000-8000-000000000079', 'ok', 3, true, '{}', null), false,
  'un altro giro non scrive');
update public.instagram_contenuti set metriche_stato = 'da_leggere' where media_id = '7900000000000003';
select is(
  (select public.instagram_contenuti_metriche_fine(id, 'senza_permesso', 0, false, '{"reel":"completo"}',
     'token 1234567890123456789012345678901234567890123 sbagliato') from giro79),
  true, 'il giro che ha il lease scrive');
select is(
  (select row(permesso_insights, metriche_esito, metriche_letti, metriche_gradini ->> 'reel')::text
   from public.instagram_contenuti_stato where id),
  row(false, 'senza_permesso'::text, 0, 'completo'::text)::text,
  'permesso, esito, quanti, i gradini');
select is((select metriche_errore from public.instagram_contenuti_stato where id), null,
  'senza_permesso non porta un errore');
select is((select metriche_stato from public.instagram_contenuti where media_id = '7900000000000003'), 'senza_permesso',
  'permesso mancante: i post da leggere diventano senza_permesso');
select is((select metriche_stato from public.instagram_contenuti where media_id = '7900000000000001'), 'lette',
  'e quelli letti restano letti');
select is(
  (select public.instagram_contenuti_metriche_fine(id, 'fallito', 0, null, null,
     'Errore con un token 1234567890123456789012345678901234567890123 dentro') from giro79),
  true, 'un esito fallito');
select is((select metriche_errore from public.instagram_contenuti_stato where id),
  'Errore con un token [token] dentro', 'il token non resta nell''errore');
select is((select permesso_insights from public.instagram_contenuti_stato where id), false,
  'permesso null: com''era');
select is(
  (select public.instagram_contenuti_metriche_fine(id, 'ok', 5, true, '{"reel":"base"}', null) from giro79),
  true, 'il permesso c''è');
select is((select metriche_stato from public.instagram_contenuti where media_id = '7900000000000003'), 'da_leggere',
  'e i senza_permesso tornano da leggere');
select throws_ok($$ select public.instagram_contenuti_metriche_fine(gen_random_uuid(), 'boh', 0, null, null, null) $$,
  '22023', null, 'un esito che non esiste no');

-- ---------------------------------------------------------------------------
-- 5. The view of the numbers
-- ---------------------------------------------------------------------------
-- Photos of T79Reel02 (96 hours old): at 24 hours, 72 hours (a window 60-108), 130 (outside every window)
insert into public.instagram_contenuti_misure (media_id, giorno, letto_il, eta_ore, views, reach, saved, shares) values
  ('7900000000000002', public.oggi() - 3, now() - interval '3 days', 24, 100, 90, 1, 0),
  ('7900000000000002', public.oggi() - 1, now() - interval '1 day', 72, 800, 700, 14, 7),
  ('7900000000000002', public.oggi(), now(), 130, 1500, 1200, 30, 12);
select is(
  (select row(views_3g, saved_3g, shares_3g, reach_3g)::text from public.v_instagram_numeri where media_id = '7900000000000002'),
  row(800, 14, 7, 700)::text, 'views_3g viene dalla foto tra 60 e 108 ore, la più vicina a 72');
select is((select views_7g from public.v_instagram_numeri where media_id = '7900000000000002'), null::integer,
  'views_7g è null se non c''è una foto in finestra');
update public.instagram_contenuti set views = 1500, reach = 1200, saved = 30, shares = 12, total_interactions = 60,
  avg_watch_ms = 6000, durata_ms = 30000, metriche_stato = 'lette' where media_id = '7900000000000002';
select is(
  (select row(tasso_salvataggi, tasso_condivisioni, tasso_interazioni, visione_su_durata, views_per_account)::text
   from public.v_instagram_numeri where media_id = '7900000000000002'),
  row(0.0250::numeric, 0.0100::numeric, 0.0500::numeric, 0.2000::numeric, 1.25::numeric)::text,
  'i tassi sono numeri; la visione su durata è la quota vista');
update public.instagram_contenuti set reach = 0 where media_id = '7900000000000002';
select is(
  (select row(tasso_salvataggi, views_per_account)::text from public.v_instagram_numeri where media_id = '7900000000000002'),
  row(null::numeric, null::numeric)::text, 'copertura zero: i tassi sono null, mai infinito');
update public.instagram_contenuti set reach = 1200 where media_id = '7900000000000002';

-- the leads: P = the day of the post (4 days ago); counted days oggi-3 .. oggi-1, the day P and the next not
delete from public.instagram_contenuti_dm_giorni;
delete from public.instagram_contenuti_dm where shortcode = 'T79Reel02';
insert into public.instagram_contenuti_dm (shortcode, giorno, dm, lead_in_target, call_prenotate, dm_certi) values
  ('T79Reel02', public.oggi() - 3, 2, 1, 0, 1);
select is(
  (select row(lead_contati, dm, dm_14g)::text from public.v_instagram_numeri where media_id = '7900000000000002'),
  row(false, null::bigint, null::bigint)::text,
  'giorni non contati: i lead sono null, mai 0');
insert into public.instagram_contenuti_dm_giorni (giorno)
select (now() at time zone 'Europe/Rome')::date - g from generate_series(1, 6) g;
select is(
  (select row(lead_contati, lead_completi, dm, lead_in_target, dm_14g, in_target_14g, call_14g)::text
   from public.v_instagram_numeri where media_id = '7900000000000002'),
  row(true, true, 2::bigint, 1::bigint, 2::bigint, 1::bigint, 0::bigint)::text,
  'tutti i giorni contati: i numeri dei lead; zero dove non ci sono righe');
delete from public.instagram_contenuti_dm_giorni where giorno = public.oggi() - 1;
select is(
  (select row(lead_contati, lead_completi, dm_14g)::text from public.v_instagram_numeri where media_id = '7900000000000002'),
  row(false, false, null::bigint)::text,
  'uno dei giorni da P a ieri non contato: nessun numero dei lead');

-- the 14-day window: a post of 20 days ago, its days 0..13 counted, day 14 not
insert into public.instagram_contenuti (media_id, shortcode, permalink, media_type, reel, pubblicato_il) values
  ('7900000000000004', 'T79Reel04', 'https://www.instagram.com/reel/T79Reel04/', 'VIDEO', true, now() - interval '20 days');
insert into public.instagram_contenuti_dm_giorni (giorno)
select ((now() - interval '20 days') at time zone 'Europe/Rome')::date + g from generate_series(0, 13) g
on conflict (giorno) do nothing;
insert into public.instagram_contenuti_dm (shortcode, giorno, dm, lead_in_target, call_prenotate, dm_certi) values
  ('T79Reel04', ((now() - interval '20 days') at time zone 'Europe/Rome')::date + 13, 4, 2, 1, 1),
  ('T79Reel04', ((now() - interval '20 days') at time zone 'Europe/Rome')::date + 14, 5, 5, 5, 5);
select is(
  (select row(lead_contati, lead_completi, dm_14g, in_target_14g, dm)::text from public.v_instagram_numeri where media_id = '7900000000000004'),
  row(true, false, 4::bigint, 2::bigint, 9::bigint)::text,
  'i lead dei primi 14 giorni: il quindicesimo non conta (ma il totale sì); con un giorno non contato dopo il quattordicesimo lead_completi è falso');

-- the medians: one row per kind
select ok((select count(*) = 2 from public.v_instagram_mediane), 'le mediane: una riga per tipo (reel, feed)');
select is((select tipo from public.v_instagram_mediane where tipo = 'feed'), 'feed', 'ci sono i reel e il feed');

-- ---------------------------------------------------------------------------
-- 6. Who reads
-- ---------------------------------------------------------------------------
insert into public.instagram_account_misure (giorno, follower, media, letto_il) values (public.oggi() - 40, 12000, 230, now());
insert into public.invites (email, ruolo) values ('marketing79@alpha.test', 'marketing');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999990079',
  'authenticated', 'authenticated', 'marketing79@alpha.test', '', now(),
  '{}'::jsonb, '{"full_name":"Marco Settantanove"}'::jsonb, now(), now(), '', '', '', '');
update public.profiles set attivo = false where id = '99999999-9999-4999-8999-999999990079';

create temp table viste79 (persona text, misure bigint, account bigint, numeri bigint, errore text) on commit drop;
grant select, insert on viste79 to authenticated, anon;
create or replace function pg_temp.conta79(p_persona text)
returns void
language plpgsql
as $$
declare
  a bigint; b bigint; c bigint;
begin
  select count(*) into a from public.instagram_contenuti_misure;
  select count(*) into b from public.instagram_account_misure;
  select count(*) into c from public.v_instagram_numeri;
  insert into pg_temp.viste79 values (p_persona, a, b, c, null);
exception when others then
  insert into pg_temp.viste79 values (p_persona, null, null, null, sqlstate);
end;
$$;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
do $$ begin perform pg_temp.conta79('admin'); end $$;
set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
do $$ begin perform pg_temp.conta79('editor'); end $$;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
do $$ begin perform pg_temp.conta79('marketing'); end $$;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
do $$ begin perform pg_temp.conta79('setter'); end $$;
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
do $$ begin perform pg_temp.conta79('closer'); end $$;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
do $$ begin perform pg_temp.conta79('coach'); end $$;
set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999990079","role":"authenticated"}';
do $$ begin perform pg_temp.conta79('marketing_spento'); end $$;
reset role;
set local request.jwt.claims to '{}';
set local role anon;
do $$ begin perform pg_temp.conta79('anon'); end $$;
reset role;

select is(
  (select array_agg(persona order by persona) from viste79 where misure > 0 and account > 0 and numeri > 0),
  array['admin', 'editor', 'marketing'],
  'numeri, storico e follower li leggono l''admin, il video editor e il marketing');
select is(
  (select array_agg(persona order by persona) from viste79 where misure = 0 and account = 0 and numeri = 0),
  array['closer', 'coach', 'marketing_spento', 'setter'],
  'setter, closer, coach e un account disattivato non vedono niente');
select is((select errore from viste79 where persona = 'anon'), '42501', 'anon nemmeno');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok(
  $$ insert into public.instagram_contenuti_misure (media_id, giorno, letto_il, eta_ore)
     values ('7900000000000001', public.oggi() - 9, now(), 1) $$,
  '42501', null, 'nemmeno l''admin scrive una foto');
select throws_ok($$ insert into public.instagram_account_misure (giorno, follower, letto_il) values (public.oggi() - 49, 1, now()) $$,
  '42501', null, 'né i follower');
select throws_ok($$ select public.instagram_salva_metriche('[]') $$, '42501', null, 'né chiama la funzione del giro');
reset role;
set local request.jwt.claims to '{}';

-- ---------------------------------------------------------------------------
-- 7. Cascade and backup
-- ---------------------------------------------------------------------------
delete from public.instagram_contenuti where media_id = '7900000000000001';
select is((select count(*)::integer from public.instagram_contenuti_misure where media_id = '7900000000000001'), 0,
  'cancellare un post toglie le sue foto');
select ok(public.backup_completo() ?& array['instagram_contenuti_misure', 'instagram_account_misure'],
  'il backup ha lo storico e i follower');

select * from finish();
rollback;
