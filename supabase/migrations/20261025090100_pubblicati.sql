-- «Pubblicati» (Dany, 25/10/2026: a section with the published content and its insights,
-- next to the Piano editoriale; analyses start from the published posts). One row per post
-- or reel of the account, not deleted or deleted, with its numbers, the calendar content it
-- is linked to (if any), the leads that came from it, and for a reel the verdict and score
-- of the Analisi: the same columns as v_analisi_reel (the reel panel reads one and the other
-- alike) for every kind of post, and a few more: the kind (reel), the full caption (for the
-- search), the View Count of the linked content and whether it comes from Instagram.
--
-- v_analisi_reel stays as it is (the page that read it is gone, the view and its tests are
-- not touched). A plain read of the same views: v_instagram_numeri (numbers and leads),
-- marketing_contenuti (the link is the shortcode), instagram_letture and marketing_analisi
-- (reel only: a carousel or a photo has no reading nor analysis), analisi_numeri_set (the
-- verdict, computed once, only for reels).
--
-- No stato_collegamento here (the proposals of the run are not shown any more): linked =
-- contenuto_id is not null. security_invoker: the Marketing area (vede_marketing) reads,
-- everybody else reads 0 rows.
create view public.v_pubblicati with (security_invoker = true) as
select
  n.media_id, n.shortcode, n.permalink, n.copertina_url, n.pubblicato_il, n.giorno, n.durata_ms,
  n.video_disponibile, n.eliminato, n.media_type, n.reel,
  i.didascalia,
  left(i.didascalia, 140) as didascalia_inizio,
  m.id as contenuto_id, m.nome, m.reel_type, m.formato, m.stato as status,
  m.view_count, m.view_count_da_instagram,
  n.metriche_stato, n.metriche_il, n.numeri_parziali, n.eta_ore,
  n.views, n.reach, n.saved, n.shares, n.likes, n.comments, n.like_count, n.comments_count,
  n.avg_watch_ms, n.skip_rate, n.views_3g, n.views_7g, n.tasso_salvataggi, n.tasso_condivisioni, n.visione_su_durata,
  (a.num ->> 'eta_confronto')::smallint as eta_confronto,
  (a.num ->> 'confronto') as confronto,
  (a.num ->> 'views')::integer as views_all_eta,
  (a.num ->> 'views_mediana')::numeric as views_confronto,
  (a.num ->> 'views_rapporto')::numeric as views_rapporto,
  (a.num ->> 'salvataggi_rapporto')::numeric as salvataggi_rapporto,
  round(n.avg_watch_ms / 1000.0, 1) as visione_media_s,
  (a.num ->> 'quota_vista')::numeric as quota_vista,
  (a.num ->> 'fascia_pubblico') as fascia_pubblico,
  (a.num ->> 'fascia_lead') as fascia_lead,
  (a.num ->> 'verdetto') as verdetto_oggi,
  n.lead_contati, n.lead_completi, n.dm_14g, n.in_target_14g, n.call_14g, n.dm, n.lead_in_target, n.call_prenotate,
  l.stato as lettura_stato, l.richiesta as lettura_richiesta, l.video as lettura_video,
  l.trascrizione_esito, l.visione_esito, l.fonte_visione, l.errore as lettura_errore,
  l.scheda -> 'classificazione' ->> 'reel_type' as classificazione_reel_type,
  l.scheda -> 'classificazione' ->> 'format' as classificazione_formato,
  z.id as analisi_id, z.stato as analisi_stato, z.verdetto as analisi_verdetto, z.eta_ore as analisi_eta_ore,
  z.eta_confronto as analisi_eta_confronto, z.finita_il as analisi_finita_il, z.errore as analisi_errore,
  z.motivo as analisi_motivo,
  y.punteggio_totale, y.punteggio_fascia, y.punteggio_tipo
from public.v_instagram_numeri n
join public.instagram_contenuti i on i.media_id = n.media_id
left join public.marketing_contenuti m on m.instagram_shortcode = n.shortcode
left join public.instagram_letture l on l.media_id = n.media_id
left join lateral (
  select x.id, x.stato, x.verdetto, x.eta_ore, x.eta_confronto, x.finita_il, x.errore, x.motivo
  from public.marketing_analisi x where x.media_id = n.media_id
  order by x.created_at desc limit 1
) z on true
left join lateral (
  select x.punteggio_totale, x.punteggio_fascia, x.punteggio_tipo
  from public.marketing_analisi x
  where x.media_id = n.media_id and x.stato = 'pronta' and x.punteggio is not null
  order by x.finita_il desc, x.created_at desc limit 1
) y on true
left join public.analisi_numeri_set() a on a.media_id = n.media_id;

revoke all on public.v_pubblicati from anon;

comment on view public.v_pubblicati is
  'One row per post or reel of the account for the Pubblicati page: media, the calendar content linked to it (by shortcode) with its View Count, numbers (views, reach, saved, shares, comments), leads of the first 14 days and in total (null when not counted), and for a reel the verdict of today, the reading, the last analysis and the score. Same columns as v_analisi_reel, for every kind of post.';
