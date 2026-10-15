-- Statistiche dei post, demo data (1.36.0). Numbers and posts invented, no real
-- shortcode: this file only adds numbers, a history of photos and followers to
-- the posts of 27_post_instagram.sql, and 13 old reels that make the
-- comparison possible. After 27_post_instagram.sql, before 30_tutorial.sql.
-- Dates relative to public.oggi(); fixed ids and "on conflict do nothing":
-- running it again changes nothing already there.
--
-- The 13 old reels (SeedReel01 to SeedReel13) are published before the first
-- Post Date of the calendar seed minus 3 days (25_marketing.sql starts at
-- today minus 12), so they are «prima_del_calendario» for Post di Instagram:
-- they change neither «Da collegare» nor its number nor 1.33.0's e2e test. They
-- have the photos at 3 and at 7 days, so a reel of the seed has 8 reels to be
-- compared with.
--   SeedDemo01   reel, 7 days old: far above the others (the verdict is to push it)
--   SeedPost02   reel, 7 days old: in line with the others
--   SeedPost03/04 reels of yesterday: only the first hours' numbers
--   SeedPost05   carousel: numbers not available (Meta answered with no data)
--   SeedPost06   photo from before the account was professional
--   SeedPost07   reel no longer on Instagram: its last numbers stay
--   SeedPost08   reel of 60 days ago: Instagram gives no video (licensed music)
--   SeedReel13   reel of 18 days ago, far below the others

-- ---------------------------------------------------------------------------
-- 1. The 13 old reels
-- ---------------------------------------------------------------------------
insert into public.instagram_contenuti (
  media_id, shortcode, permalink, media_type, media_product_type, reel, pubblicato_il, didascalia,
  copertina_url, letto_il, video_disponibile, durata_ms, audio_tipo
)
select
  '17900000000000' || lpad((100 + g)::text, 3, '0'), 'SeedReel' || lpad(g::text, 2, '0'),
  'https://www.instagram.com/reel/SeedReel' || lpad(g::text, 2, '0') || '/', 'VIDEO', 'REELS', true,
  ((public.oggi() - case when g = 13 then 18 else 20 + 7 * g end)::timestamp + time '18:15') at time zone 'Europe/Rome',
  (array[
    E'Tre errori nei piegamenti che ti fanno male alle spalle.\n#piegamenti',
    E'Cosa mangio in una giornata normale, senza pesare niente.',
    E'Allenarsi a casa con poco tempo: la mia settimana tipo.',
    E'Perché dopo i 30 la pancia non va via con i crunch.',
    E'La sbarra in casa: quale comprare e quale no.',
    E'Sei mesi di allenamento a corpo libero: cosa è cambiato davvero.',
    E'Il riscaldamento da fare prima di ogni allenamento.',
    E'Quanto dormire se vuoi perdere grasso.',
    E'Il corpo libero non è per principianti: ecco come progredire.',
    E'Dopo il lavoro non ho energie: cosa faccio io.',
    E'Trazioni: il primo passo se non ne fai nessuna.',
    E'Quanti passi al giorno servono davvero.',
    E'Un reel che non ha funzionato.'
  ])[g],
  null, now(), true, (30000 + 2500 * g), 'ORIGINAL_SOUND'
from generate_series(1, 13) g
on conflict (media_id) do nothing;

-- the history of photos stays out of the trigger's way: the seed writes its own
alter table public.instagram_contenuti disable trigger instagram_contenuti_misura;

-- ---------------------------------------------------------------------------
-- 2. The numbers of every post (the last reading), and the photos
-- ---------------------------------------------------------------------------
-- One row per post: views now, the photo at 24, 72 and 168 hours when the age allows
create temp table seed_misure_28 on commit drop as
select * from (
  select 'SeedReel' || lpad(g::text, 2, '0') as shortcode,
         case when g = 13 then 900 else round((1800 + 150 * g) * 1.45 * 1.6)::integer end as views,
         case when g = 13 then 150 else round((1800 + 150 * g) * 0.45)::integer end as v24,
         case when g = 13 then 380 else 1800 + 150 * g end as v72,
         case when g = 13 then 640 else round((1800 + 150 * g) * 1.45)::integer end as v168,
         case when g = 13 then 6 else null end as saved_fisso
  from generate_series(1, 13) g
  union all
  values
    ('SeedDemo01', 12480, 3100, 7400, 10900, null::integer),
    ('SeedPost02', 6100, 900, 2400, 4300, null),
    ('SeedPost08', 5200, 600, 2100, 3700, null)
) x;

update public.instagram_contenuti set durata_ms = 42500, video_disponibile = true, audio_tipo = 'ORIGINAL_SOUND'
where shortcode = 'SeedDemo01' and durata_ms is null;
update public.instagram_contenuti set durata_ms = 37000, video_disponibile = true, audio_tipo = 'ORIGINAL_SOUND'
where shortcode = 'SeedPost02' and durata_ms is null;
update public.instagram_contenuti set durata_ms = 29000, video_disponibile = true, audio_tipo = 'ORIGINAL_SOUND'
where shortcode in ('SeedPost03', 'SeedPost04') and durata_ms is null;
-- Instagram gives no video for this one (licensed music): the reading uses the cover
update public.instagram_contenuti set durata_ms = 33000, video_disponibile = false, audio_tipo = 'MUSIC'
where shortcode = 'SeedPost08' and video_disponibile is null;

-- current numbers
update public.instagram_contenuti i
set views = m.views,
    reach = round(m.views * 0.78),
    saved = coalesce(m.saved_fisso, round(m.views * 0.026)),
    shares = coalesce(round(m.saved_fisso / 3.0), round(m.views * 0.011)),
    likes = round(m.views * 0.045), comments = round(m.views * 0.004),
    total_interactions = round(m.views * 0.06),
    reposts = round(m.views * 0.002),
    avg_watch_ms = round(coalesce(i.durata_ms, 30000) * (case when m.shortcode = 'SeedReel13' then 0.12 else 0.31 end)),
    skip_rate = case when m.shortcode = 'SeedReel13' then 0.62 else 0.38 end,
    metriche_stato = 'lette',
    metriche_il = now() - interval '5 hours'
from seed_misure_28 m
where i.shortcode = m.shortcode and i.views is null;

-- the first hours of yesterday's reels: numbers of the first hours only
update public.instagram_contenuti
set views = 410, reach = 360, saved = 7, shares = 3, likes = 31, comments = 2, total_interactions = 44,
    avg_watch_ms = 8100, skip_rate = 0.41, metriche_stato = 'lette', metriche_il = now() - interval '3 hours'
where shortcode = 'SeedPost03' and views is null;
update public.instagram_contenuti
set views = 530, reach = 470, saved = 11, shares = 6, likes = 48, comments = 5, total_interactions = 70,
    avg_watch_ms = 9300, skip_rate = 0.36, metriche_stato = 'lette', metriche_il = now() - interval '3 hours'
where shortcode = 'SeedPost04' and views is null;
-- the carousel: Instagram has no numbers yet; the photo: before the account was professional
update public.instagram_contenuti set metriche_stato = 'non_disponibili' where shortcode = 'SeedPost05' and metriche_il is null;
update public.instagram_contenuti set metriche_stato = 'prima_della_conversione' where shortcode = 'SeedPost06' and metriche_il is null;
-- the reel no longer on Instagram keeps its last numbers
update public.instagram_contenuti
set views = 380, reach = 340, saved = 4, shares = 1, likes = 12, comments = 0, total_interactions = 17,
    avg_watch_ms = 6000, skip_rate = 0.5, metriche_stato = 'lette', metriche_il = now() - interval '9 days'
where shortcode = 'SeedPost07' and views is null;

-- the photos: 24, 72 and 168 hours after the publication, when they are past
insert into public.instagram_contenuti_misure
  (media_id, giorno, letto_il, eta_ore, views, reach, saved, shares, likes, comments, total_interactions, reposts,
   avg_watch_ms, skip_rate)
select i.media_id, (s.letto_il at time zone 'Europe/Rome')::date, s.letto_il, s.eta, s.v, round(s.v * 0.78),
       coalesce(case when m.saved_fisso is not null then round(m.saved_fisso * s.v::numeric / nullif(m.views, 0)) end,
                round(s.v * 0.026)),
       round(s.v * 0.011), round(s.v * 0.045), round(s.v * 0.004), round(s.v * 0.06), round(s.v * 0.002),
       round(coalesce(i.durata_ms, 30000) * (case when m.shortcode = 'SeedReel13' then 0.12 else 0.31 end)),
       case when m.shortcode = 'SeedReel13' then 0.62 else 0.38 end
from seed_misure_28 m
join public.instagram_contenuti i on i.shortcode = m.shortcode
cross join lateral (values (24, m.v24), (72, m.v72), (168, m.v168)) as e(eta, v)
cross join lateral (select e.eta, e.v, i.pubblicato_il + e.eta * interval '1 hour' as letto_il) s
where s.letto_il < now() - interval '1 hour'
on conflict (media_id, giorno) do nothing;

alter table public.instagram_contenuti enable trigger instagram_contenuti_misura;

-- ---------------------------------------------------------------------------
-- 3. The state of the statistics phase, and the followers of the account
-- ---------------------------------------------------------------------------
update public.instagram_contenuti_stato s
set permesso_insights = true,
    permesso_insights_il = least(now(), (public.oggi()::timestamp + time '05:31') at time zone 'Europe/Rome'),
    metriche_esito = 'ok',
    metriche_letti = 11,
    metriche_gradini = '{"reel":"completo","feed":"base"}'::jsonb,
    metriche_fine_il = least(now(), (public.oggi()::timestamp + time '05:33') at time zone 'Europe/Rome')
where s.id and s.metriche_esito is null;

insert into public.instagram_account_misure (giorno, follower, media, letto_il)
select public.oggi() - g, 11890 + (10 - g) * 14, 214 + (case when g > 6 then 0 else 1 end),
       ((public.oggi() - g)::timestamp + time '05:30') at time zone 'Europe/Rome'
from generate_series(0, 9) g
where ((public.oggi() - g)::timestamp + time '05:30') at time zone 'Europe/Rome' < now()
on conflict (giorno) do nothing;
