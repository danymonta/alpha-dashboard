-- Local load test of the Analisi page (1.37.1). NEVER on a real project.
-- Run with  -v n=300  (the number of posts; production has about 230).
-- Generates ~300 posts (240 reels, all with numbers read), ~3000 daily photos
-- of the numbers, the leads of every day and a few analyses, all inside one
-- transaction that is rolled back at the end, then times what the page reads
-- as the admin, under RLS and with the 8 s statement_timeout of authenticated.
--   docker exec -i <db container> psql -U postgres -v ON_ERROR_STOP=1 < scripts/carico-analisi.sql
begin;

insert into public.instagram_contenuti
  (media_id, shortcode, permalink, media_type, media_product_type, reel, pubblicato_il, didascalia,
   metriche_stato, metriche_il, views, reach, saved, shares, likes, comments, total_interactions, avg_watch_ms, durata_ms,
   eliminato_il)
select '9' || lpad(g::text, 15, '0'), 'CarPost' || lpad(g::text, 4, '0'),
       'https://www.instagram.com/reel/CarPost' || lpad(g::text, 4, '0') || '/',
       case when g % 5 = 0 then 'IMAGE' else 'VIDEO' end,
       case when g % 5 = 0 then 'FEED' else 'REELS' end, g % 5 <> 0,
       now() - (g * 0.6) * interval '1 day' - (g % 7) * interval '1 hour',
       'Didascalia di prova numero ' || g,
       case when g % 11 = 0 then 'da_leggere' else 'lette' end, case when g % 11 = 0 then null else now() end,
       case when g % 11 = 0 then null else 200 + abs(hashtext('v' || g)) % 20000 end,
       case when g % 11 = 0 then null else 150 + abs(hashtext('r' || g)) % 15000 end,
       case when g % 11 = 0 then null else abs(hashtext('s' || g)) % 400 end,
       case when g % 11 = 0 then null else abs(hashtext('c' || g)) % 300 end,
       50 + g % 400, g % 40, 80 + g % 500,
       case when g % 11 = 0 then null else 2000 + abs(hashtext('a' || g)) % 20000 end, 30000,
       case when g % 17 = 0 then now() else null end
from generate_series(1, :n) g;

insert into public.instagram_contenuti_misure (media_id, giorno, letto_il, eta_ore, views, reach, saved, shares, avg_watch_ms)
select c.media_id, ((c.pubblicato_il + e * interval '1 hour') at time zone 'Europe/Rome')::date,
       c.pubblicato_il + e * interval '1 hour', e,
       (c.views * (0.2 + e / 500.0) * (0.7 + (abs(hashtext(c.media_id || e)) % 60) / 100.0))::integer,
       (c.reach * (0.2 + e / 500.0))::integer,
       (c.saved * (0.2 + e / 500.0) * (0.5 + (abs(hashtext('x' || c.media_id || e)) % 100) / 100.0))::integer,
       (c.shares * (0.2 + e / 500.0))::integer, c.avg_watch_ms
from public.instagram_contenuti c
cross join unnest(array[24, 48, 72, 96, 120, 168, 216, 336, 504, 720]) e
where c.shortcode like 'CarPost%' and c.views is not null and c.pubblicato_il + e * interval '1 hour' < now()
on conflict do nothing;

-- the days the Insight counted: every day but some holes
insert into public.instagram_contenuti_dm_giorni (giorno)
select (public.oggi() - g)::date from generate_series(1, 200) g
where g % 23 <> 0
on conflict do nothing;

insert into public.instagram_contenuti_dm (shortcode, giorno, dm, lead_in_target, call_prenotate, dm_certi, calcolato_il)
select c.shortcode, ((c.pubblicato_il at time zone 'Europe/Rome')::date + d),
       1 + abs(hashtext('d' || c.shortcode || d)) % 3, abs(hashtext('t' || c.shortcode || d)) % 3 / 2,
       abs(hashtext('p' || c.shortcode || d)) % 5 / 4, 1, now()
from public.instagram_contenuti c
cross join generate_series(0, 5) d
where c.shortcode like 'CarPost%' and c.reel and abs(hashtext('k' || c.shortcode || d)) % 3 = 0
  and ((c.pubblicato_il at time zone 'Europe/Rome')::date + d) < public.oggi()
on conflict do nothing;

analyze public.instagram_contenuti; analyze public.instagram_contenuti_misure;
analyze public.instagram_contenuti_dm; analyze public.instagram_contenuti_dm_giorni;

-- the admin, as the page uses it
select set_config('request.jwt.claims',
  (select json_build_object('sub', p.id, 'role', 'authenticated', 'email', p.email)::text
   from public.profiles p where p.ruolo = 'admin' and p.attivo limit 1), true);
set local role authenticated;
set local statement_timeout = '8s';

do $$
declare
  t0 timestamptz; n integer; r jsonb;
begin
  -- the page's query: all its columns, the reels of the period, ordered, at most 200
  t0 := clock_timestamp();
  select jsonb_array_length(jsonb_agg(to_jsonb(x))) into n from (
    select * from public.v_analisi_reel
    where giorno >= public.oggi() - 180
    order by views desc nulls last, pubblicato_il desc limit 200) x;
  raise notice 'v_analisi_reel (180 giorni, ordine per views, % righe): % ms', n, round(extract(epoch from clock_timestamp() - t0) * 1000);

  t0 := clock_timestamp();
  select jsonb_array_length(jsonb_agg(to_jsonb(x))) into n from (
    select * from public.v_analisi_reel
    where giorno >= public.oggi() - 30
    order by pubblicato_il desc limit 200) x;
  raise notice 'v_analisi_reel (30 giorni, % righe): % ms', n, round(extract(epoch from clock_timestamp() - t0) * 1000);

  t0 := clock_timestamp();
  select to_jsonb(x) into r from public.v_analisi_reel x where media_id = '9000000000000100';
  raise notice 'v_analisi_reel (un reel, il pannello): % ms', round(extract(epoch from clock_timestamp() - t0) * 1000);

  t0 := clock_timestamp();
  r := public.analisi_riepilogo(public.oggi() - 180, public.oggi());
  raise notice 'analisi_riepilogo (180 giorni): % ms', round(extract(epoch from clock_timestamp() - t0) * 1000);

  t0 := clock_timestamp();
  r := public.analisi_numeri_reel('9000000000000100');
  raise notice 'analisi_numeri_reel (un reel): % ms', round(extract(epoch from clock_timestamp() - t0) * 1000);
end $$;

rollback;
