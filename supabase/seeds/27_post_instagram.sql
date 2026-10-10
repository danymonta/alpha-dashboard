-- Post di Instagram demo data (1.33.0). Invented posts and captions only: no
-- real shortcode, no CDN cover (copertina_url null: the page shows the icon).
-- After 25_marketing.sql (the contents it links to), before 30_tutorial.sql.
-- Dates relative to public.oggi(); fixed ids and "on conflict do nothing":
-- running it again changes nothing already there.
--   SeedDemo01  reel, linked by hand to the content that already has its URL
--   SeedPost02  reel, linked by the run ("Collegato da solo")
--   SeedPost03  reel  } the same day, two proposals each ("Da collegare")
--   SeedPost04  reel  }
--   SeedPost05  carousel without a content ("Da collegare", no proposal)
--   SeedPost06  photo left out of the calendar ("Fuori dal calendario")
--   SeedPost07  reel no longer on Instagram
--   SeedPost08  reel older than the calendar
-- The run's state: one run "ok" this night.

-- ---------------------------------------------------------------------------
-- 1. The posts
-- ---------------------------------------------------------------------------
insert into public.instagram_contenuti (
  media_id, shortcode, permalink, media_type, media_product_type, reel, pubblicato_il,
  didascalia, copertina_url, like_count, comments_count, letto_il, eliminato_il
)
select
  x.media_id, x.shortcode, x.permalink, x.media_type, x.media_product_type, x.reel,
  ((public.oggi() + x.giorni)::timestamp + x.ora::time) at time zone 'Europe/Rome',
  x.didascalia, null, x.like_count, x.comments_count, now(),
  case when x.eliminato then now() - interval '1 day' end
from (values
  ('17900000000000001', 'SeedDemo01', 'https://www.instagram.com/reel/SeedDemo01/', 'VIDEO', 'REELS', true,
   -12, '18:30',
   E'Niente sbarra? Nessun problema.\nTre alternative per allenare la schiena con quello che hai in casa: il tavolo, un asciugamano, lo zaino.\n#allenamentoacasa #schiena',
   412, 37, false),
  ('17900000000000002', 'SeedPost02', 'https://www.instagram.com/reel/SeedPost02/', 'VIDEO', 'REELS', true,
   -9, '19:00',
   E'Fai mille crunch e non vedi niente?\nTre errori negli addominali che rallentano i risultati. Il terzo lo fanno quasi tutti.\n#addominali #corpolibero',
   268, 21, false),
  ('17900000000000003', 'SeedPost03', 'https://www.instagram.com/reel/SeedPost03/', 'VIDEO', 'REELS', true,
   -1, '12:15',
   E'Il primo piegamento vero arriva in quattro settimane, se parti dal gradino giusto: ginocchia, panca, pavimento.',
   95, 8, false),
  ('17900000000000004', 'SeedPost04', 'https://www.instagram.com/reel/SeedPost04/', 'VIDEO', 'REELS', true,
   -1, '20:40',
   E'La cena non è il problema: è la somma della giornata. Cosa mangio la sera quando ho fame davvero.',
   133, 14, false),
  ('17900000000000005', 'SeedPost05', 'https://www.instagram.com/p/SeedPost05/', 'CAROUSEL_ALBUM', 'FEED', false,
   -2, '09:30',
   E'Dietro le quinte del workshop di sabato: grazie a chi c''era, alla prossima.',
   58, 4, false),
  ('17900000000000006', 'SeedPost06', 'https://www.instagram.com/p/SeedPost06/', 'IMAGE', 'FEED', false,
   -4, '21:10',
   E'Auguri a mio fratello: trent''anni oggi.',
   201, 33, false),
  ('17900000000000007', 'SeedPost07', 'https://www.instagram.com/reel/SeedPost07/', 'VIDEO', 'REELS', true,
   -8, '18:00',
   E'Una prova di montaggio, archiviata.',
   12, 0, true),
  ('17900000000000008', 'SeedPost08', 'https://www.instagram.com/reel/SeedPost08/', 'VIDEO', 'REELS', true,
   -60, '18:45',
   E'Il mio primo reel su questo profilo: da dove sono partito.',
   340, 52, false)
) as x(media_id, shortcode, permalink, media_type, media_product_type, reel, giorni, ora,
       didascalia, like_count, comments_count, eliminato)
on conflict (media_id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. Linked by the run: the Posted reel without URL whose hook opens the caption
-- ---------------------------------------------------------------------------
-- No session: the trigger writes no refusal; false when already linked.
select public.instagram_collega_da_solo(
  'SeedPost02', 'ccccccc1-0000-4000-8000-000000000002'::uuid,
  84::smallint, 0.740, 0::smallint, array['stessa_data', 'didascalia_simile']
);

-- ---------------------------------------------------------------------------
-- 3. Two reels the same day, two proposals each; one excluded post
-- ---------------------------------------------------------------------------
insert into public.marketing_abbinamenti (shortcode, contenuto_id, esito, punteggio, somiglianza, giorni, motivi)
select x.shortcode, m.id, 'proposto', x.punteggio, x.somiglianza, x.giorni, x.motivi
from (values
  ('SeedPost03', 'ccccccc1-0000-4000-8000-000000000004', 76, 0.620, 0, array['stessa_data', 'didascalia_simile']),
  ('SeedPost03', 'ccccccc1-0000-4000-8000-000000000005', 42, 0.300, 1, array['giorno_vicino', 'didascalia_simile']),
  ('SeedPost04', 'ccccccc1-0000-4000-8000-000000000005', 67, 0.710, 1, array['giorno_vicino', 'didascalia_simile']),
  ('SeedPost04', 'ccccccc1-0000-4000-8000-000000000004', 46, 0.100, 0, array['stessa_data'])
) as x(shortcode, contenuto_id, punteggio, somiglianza, giorni, motivi)
join public.marketing_contenuti m on m.id = x.contenuto_id::uuid
join public.instagram_contenuti i on i.shortcode = x.shortcode
on conflict (shortcode, contenuto_id) do nothing;

insert into public.marketing_post_esclusi (shortcode)
select i.shortcode from public.instagram_contenuti i where i.shortcode = 'SeedPost06'
on conflict (shortcode) do nothing;

-- ---------------------------------------------------------------------------
-- 4. The run's state: one night run, all fields given
-- ---------------------------------------------------------------------------
update public.instagram_contenuti_stato s
set account_username = '_danymonta',
    ultimo_giro_il = least(now(), (public.oggi()::timestamp + time '05:31') at time zone 'Europe/Rome'),
    ultimo_giro_esito = 'ok',
    ultimo_giro_motivo = 'notte',
    ultimo_giro_letti = 8,
    ultimo_giro_collegati = 1,
    ultimo_giro_proposti = 4,
    campi = 'completi'
where s.id and s.ultimo_giro_il is null;
