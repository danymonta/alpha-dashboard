-- The Analisi page was too slow in production (1.37.1): with the real volumes
-- (229 posts, about 80 reels with numbers, 14 analyses) the page's query on
-- v_analisi_reel went past the 8 seconds of statement_timeout of the role
-- authenticated (57014 inside analisi_numeri_reel) and the page said «Non siamo
-- riusciti a caricare l'analisi dei reel». Two causes, both measured:
--
--   1. The read policies of the Marketing area called vede_marketing() as it
--      was, so Postgres evaluated it once per ROW of every table the view
--      reads (and every call opens profiles): 565 ms for v_instagram_numeri
--      alone on 320 posts, now 6 ms. Same rule, same answer, evaluated once per
--      statement: (select public.vede_marketing()), as marketing_contenuti
--      already did.
--   2. analisi_numeri_reel was called once per reel, and each call rebuilt the
--      comparison (the reels of the 90 days before) with a json round trip and
--      a lateral per candidate. The new analisi_numeri_set does the same sums
--      once for all the reels with set operations; analisi_numeri_reel,
--      analisi_riepilogo and v_analisi_reel are now thin layers over it. The
--      rules, the thresholds and every number are the ones of 20261016090200
--      (CLAUDE.md sections 9 and 30): supabase/tests/88_analisi_prestazioni.sql
--      compares the old function, copied there, with the new one reel by reel.
--
-- Nothing is opened to anyone: the functions stay security invoker (RLS of the
-- caller on every table read), a token of Claude (MCP) still reads nothing
-- (restrictive *_mai_da_oauth policies, untouched here) and editor and
-- marketing read what they read.

-- ---------------------------------------------------------------------------
-- 1. Policies: the role is checked once per statement, not once per row
-- ---------------------------------------------------------------------------
alter policy instagram_contenuti_lettura on public.instagram_contenuti
  using ((select public.vede_marketing()));
alter policy instagram_contenuti_stato_lettura on public.instagram_contenuti_stato
  using ((select public.vede_marketing()));
alter policy instagram_contenuti_misure_lettura on public.instagram_contenuti_misure
  using ((select public.vede_marketing()));
alter policy instagram_account_misure_lettura on public.instagram_account_misure
  using ((select public.vede_marketing()));
alter policy instagram_contenuti_dm_lettura on public.instagram_contenuti_dm
  using ((select public.vede_marketing()));
alter policy instagram_contenuti_dm_giorni_lettura on public.instagram_contenuti_dm_giorni
  using ((select public.vede_marketing()));
alter policy instagram_letture_lettura on public.instagram_letture
  using ((select public.vede_marketing()));
alter policy marketing_analisi_lettura on public.marketing_analisi
  using ((select public.vede_marketing()));
alter policy marketing_abbinamenti_lettura on public.marketing_abbinamenti
  using ((select public.vede_marketing()));
alter policy marketing_abbinamenti_rifiutati_lettura on public.marketing_abbinamenti_rifiutati
  using ((select public.vede_marketing()));
alter policy marketing_abbinamenti_rifiutati_inserimento on public.marketing_abbinamenti_rifiutati
  with check ((select public.vede_marketing()));
alter policy marketing_abbinamenti_rifiutati_eliminazione on public.marketing_abbinamenti_rifiutati
  using ((select public.vede_marketing()));
alter policy marketing_post_esclusi_lettura on public.marketing_post_esclusi
  using ((select public.vede_marketing()));
alter policy marketing_post_esclusi_inserimento on public.marketing_post_esclusi
  with check ((select public.vede_marketing()));
alter policy marketing_post_esclusi_eliminazione on public.marketing_post_esclusi
  using ((select public.vede_marketing()));
alter policy marketing_spunti_lettura on public.marketing_spunti
  using ((select public.vede_marketing()));

-- ---------------------------------------------------------------------------
-- 2. The numbers of the reels, all at once
-- ---------------------------------------------------------------------------
-- The same rules as the old analisi_numeri_reel (read its comment in
-- 20261016090200), for p_media_ids (any media) or, with null, for every reel
-- (Reel or VIDEO, deleted ones too, as v_instagram_numeri). One row per media
-- found: {media_id, num} where num is the jsonb the old function returned.
--
-- «cv» holds the comparison reels once, in three variants: with the photo at
-- about 3 days (60-108 hours, nearest to 72), at about 7 days (144-216, nearest
-- to 168) and with today's numbers for the whole life (published at least 336
-- hours ago). The same variant carries the leads of the window of its age
-- (3, 7 or 14 days from the day of publication) and whether all those days
-- were counted: so the 75th percentile of the comparison is a filter, not a
-- loop.
create function public.analisi_numeri_set(p_media_ids text[] default null, p_eta smallint default null)
returns table (media_id text, num jsonb)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_eta is not null and p_eta not in (0, 3, 7) then
    raise exception 'L’età del confronto vale 3, 7 o 0.' using errcode = '22023';
  end if;

  return query
  with
  adesso as (
    select now() as ora, public.oggi() as oggi
  ),
  -- the comparison candidates: reels not deleted, with numbers read
  cand as materialized (
    select x.media_id, x.shortcode, x.pubblicato_il, (x.pubblicato_il at time zone 'Europe/Rome')::date as g,
           x.durata_ms, x.views, x.reach, x.saved, x.shares, x.avg_watch_ms
    from public.instagram_contenuti x
    where x.eliminato_il is null and (x.reel or x.media_type = 'VIDEO') and x.metriche_stato = 'lette'
  ),
  cv0 as (
    select c.media_id, 3::smallint as eta, 3 as w, c.shortcode, c.g, c.pubblicato_il, c.durata_ms,
           s.views, s.reach, s.saved, s.shares, s.avg_watch_ms
    from cand c
    join lateral (
      select m.views, m.reach, m.saved, m.shares, m.avg_watch_ms
      from public.instagram_contenuti_misure m
      where m.media_id = c.media_id and m.eta_ore between 60 and 108
      order by abs(m.eta_ore - 72), m.giorno limit 1
    ) s on true
    union all
    select c.media_id, 7::smallint, 7, c.shortcode, c.g, c.pubblicato_il, c.durata_ms,
           s.views, s.reach, s.saved, s.shares, s.avg_watch_ms
    from cand c
    join lateral (
      select m.views, m.reach, m.saved, m.shares, m.avg_watch_ms
      from public.instagram_contenuti_misure m
      where m.media_id = c.media_id and m.eta_ore between 144 and 216
      order by abs(m.eta_ore - 168), m.giorno limit 1
    ) s on true
    union all
    select c.media_id, 0::smallint, 14, c.shortcode, c.g, c.pubblicato_il, c.durata_ms,
           c.views, c.reach, c.saved, c.shares, c.avg_watch_ms
    from cand c, adesso a
    where c.pubblicato_il <= a.ora - interval '336 hours'
  ),
  cv as materialized (
    select v.*,
           (select coalesce(sum(d.lead_in_target), 0) from public.instagram_contenuti_dm d
            where d.shortcode = v.shortcode and d.giorno between v.g and v.g + v.w - 1) as tg,
           (v.g + v.w - 1 <= (select oggi from adesso) - 1
            and (select count(*) from public.instagram_contenuti_dm_giorni gg
                 where gg.giorno between v.g and v.g + v.w - 1) = v.w) as tg_contati
    from cv0 v
  ),
  -- the reels asked for, with their age and the comparison they use
  t0 as (
    select i.media_id, i.shortcode, i.pubblicato_il, i.metriche_stato, i.durata_ms, i.views, i.reach, i.saved,
           i.shares, i.avg_watch_ms, i.skip_rate,
           (i.pubblicato_il at time zone 'Europe/Rome')::date as g,
           floor(extract(epoch from (a.ora - i.pubblicato_il)) / 3600)::integer as ore
    from public.instagram_contenuti i, adesso a
    where (p_media_ids is null and (i.reel or i.media_type = 'VIDEO')) or i.media_id = any(p_media_ids)
  ),
  t1 as (
    select t0.*,
           (case
              when p_eta is not null then p_eta
              when t0.ore < 72 then null
              when t0.ore < 168 then 3
              when t0.ore < 336 then 7
              else 0
            end)::smallint as eta
    from t0
  ),
  t2 as (
    select t1.*,
           case t1.eta when 3 then 3 when 7 then 7 when 0 then 14 end as w
    from t1
  ),
  -- the reel's own numbers at that age
  t3 as (
    select t2.media_id, t2.shortcode, t2.pubblicato_il, t2.durata_ms, t2.g, t2.ore, t2.eta, t2.w,
           case
             when t2.eta in (3, 7) then s.views
             when t2.eta = 0 and t2.metriche_stato = 'lette' then t2.views
           end as o_views,
           case
             when t2.eta in (3, 7) then s.reach
             when t2.eta = 0 and t2.metriche_stato = 'lette' then t2.reach
           end as o_reach,
           case
             when t2.eta in (3, 7) then s.saved
             when t2.eta = 0 and t2.metriche_stato = 'lette' then t2.saved
           end as o_saved,
           case
             when t2.eta in (3, 7) then s.shares
             when t2.eta = 0 and t2.metriche_stato = 'lette' then t2.shares
           end as o_shares,
           case
             when t2.eta in (3, 7) then s.avg_watch_ms
             when t2.eta = 0 and t2.metriche_stato = 'lette' then t2.avg_watch_ms
           end as o_avg,
           case
             when t2.eta in (3, 7) then s.skip_rate
             when t2.eta = 0 and t2.metriche_stato = 'lette' then t2.skip_rate
           end as o_skip
    from t2
    left join lateral (
      select m.views, m.reach, m.saved, m.shares, m.avg_watch_ms, m.skip_rate
      from public.instagram_contenuti_misure m
      where t2.eta in (3, 7) and m.media_id = t2.media_id
        and m.eta_ore between (case t2.eta when 3 then 60 else 144 end) and (case t2.eta when 3 then 108 else 216 end)
      order by abs(m.eta_ore - (case t2.eta when 3 then 72 else 168 end)), m.giorno limit 1
    ) s on true
  ),
  -- the comparison reels: the other reels of the 90 days before this one, at the same age
  t4 as (
    select t3.*, k.n, k.med_views, k.med_salv, k.med_cond, k.med_vista, k.pct, k.p75
    from t3
    left join lateral (
      select count(x.views)::integer as n,
             (percentile_cont(0.5) within group (order by x.views))::numeric as med_views,
             (percentile_cont(0.5) within group (order by case when x.reach > 0 then x.saved::numeric / x.reach end))::numeric as med_salv,
             (percentile_cont(0.5) within group (order by case when x.reach > 0 then x.shares::numeric / x.reach end))::numeric as med_cond,
             (percentile_cont(0.5) within group
                (order by case when x.durata_ms > 0 then x.avg_watch_ms::numeric / x.durata_ms end))::numeric as med_vista,
             round(100.0 * count(*) filter (where x.views < t3.o_views) / nullif(count(x.views), 0))::integer as pct,
             (percentile_cont(0.75) within group (order by x.tg) filter (where x.tg_contati))::numeric as p75
      from cv x
      where x.eta = t3.eta and x.media_id <> t3.media_id
        and x.pubblicato_il < t3.pubblicato_il and x.pubblicato_il >= t3.pubblicato_il - interval '90 days'
    ) k on true
  ),
  t5 as (
    select t4.*,
           case when t4.eta is null then null
                when t4.n >= 8 then (case when t4.eta = 0 then 'vita_intera' else 'stessa_eta' end)
           end as modo,
           (t4.w is not null and t4.g + t4.w - 1 <= (select oggi from adesso) - 1
            and (select count(*) from public.instagram_contenuti_dm_giorni gg
                 where gg.giorno between t4.g and t4.g + t4.w - 1) = t4.w) as contati
    from t4
  ),
  t6 as (
    select t5.*,
           case when t5.o_reach > 0 then t5.o_saved::numeric / t5.o_reach end as tasso_salv,
           case when t5.o_reach > 0 then t5.o_shares::numeric / t5.o_reach end as tasso_cond,
           case when t5.durata_ms > 0 and t5.o_avg is not null then t5.o_avg::numeric / t5.durata_ms end as vista,
           l.dm, l.tg, l.chiamate,
           coalesce(
             (select m.reel_type from public.marketing_contenuti m where m.instagram_shortcode = t5.shortcode limit 1),
             (select case when (il.scheda -> 'classificazione' ->> 'reel_type') in
                              ('attraction', 'education', 'converting', 'radio', 'workshop')
                          then (il.scheda -> 'classificazione' ->> 'reel_type')::public.contenuto_reel_type end
              from public.instagram_letture il where il.media_id = t5.media_id)
           ) as reel_type
    from t5
    left join lateral (
      select coalesce(sum(d.dm), 0)::integer as dm, coalesce(sum(d.lead_in_target), 0)::integer as tg,
             coalesce(sum(d.call_prenotate), 0)::integer as chiamate
      from public.instagram_contenuti_dm d
      where t5.contati and d.shortcode = t5.shortcode and d.giorno between t5.g and t5.g + t5.w - 1
    ) l on true
  ),
  t7 as (
    select t6.*,
           case when t6.modo is not null and t6.med_views > 0 and t6.o_views is not null then t6.o_views / t6.med_views end as r_views,
           case when t6.modo is not null and t6.tasso_salv is not null and t6.med_salv > 0 then t6.tasso_salv / t6.med_salv end as r_salv,
           case when t6.modo is not null and t6.tasso_cond is not null and t6.med_cond > 0 then t6.tasso_cond / t6.med_cond end as r_cond,
           case when t6.modo is not null and t6.vista is not null and t6.med_vista > 0 then t6.vista / t6.med_vista end as r_vista
    from t6
  ),
  t8 as (
    select t7.*,
           case when t7.modo is not null
                then public.analisi_fascia_pubblico(t7.r_views, t7.r_salv, t7.r_cond) end as f_pubblico,
           case when t7.contati
                then public.analisi_fascia_lead(t7.dm, t7.tg, t7.p75, t7.reel_type) end as f_lead
    from t7
  )
  select t8.media_id,
    jsonb_build_object(
      'eta_ore', t8.ore,
      'eta', t8.eta,
      'eta_confronto', case when t8.modo = 'stessa_eta' then t8.eta end,
      'confronto', t8.modo,
      'reel_di_confronto', case when t8.eta is null then null else t8.n end,
      'views', t8.o_views, 'copertura', t8.o_reach, 'salvataggi', t8.o_saved, 'condivisioni', t8.o_shares,
      'visione_media_ms', t8.o_avg, 'skip_rate', t8.o_skip, 'durata_ms', t8.durata_ms,
      'views_mediana', t8.med_views,
      'tasso_salvataggi', case when t8.modo is not null then round(t8.tasso_salv, 4) end,
      'tasso_salvataggi_mediana', round(t8.med_salv, 4),
      'tasso_condivisioni', case when t8.modo is not null then round(t8.tasso_cond, 4) end,
      'tasso_condivisioni_mediana', round(t8.med_cond, 4),
      'quota_vista', case when t8.modo is not null then round(t8.vista, 4) end,
      'quota_vista_mediana', round(t8.med_vista, 4),
      'views_rapporto', round(t8.r_views, 2),
      'salvataggi_rapporto', round(t8.r_salv, 2),
      'condivisioni_rapporto', round(t8.r_cond, 2),
      'vista_rapporto', round(t8.r_vista, 2),
      'views_percentile', case when t8.modo is not null and t8.o_views is not null then t8.pct end,
      'fascia_pubblico', t8.f_pubblico,
      'fascia_lead', t8.f_lead,
      'verdetto', public.analisi_verdetto(t8.f_pubblico, t8.f_lead),
      'reel_type', t8.reel_type,
      'lead', jsonb_build_object(
        'finestra', case t8.w when 3 then 'primi 3 giorni' when 7 then 'primi 7 giorni' when 14 then 'primi 14 giorni' end,
        'contati', t8.contati,
        'dm', case when t8.contati then t8.dm end,
        'lead_in_target', case when t8.contati then t8.tg end,
        'call_prenotate', case when t8.contati then t8.chiamate end,
        'in_target_p75', case when t8.contati then round(t8.p75, 2) end
      )
    )
  from t8;
end;
$$;

grant execute on function public.analisi_numeri_set(text[], smallint) to authenticated, service_role;
revoke all on function public.analisi_numeri_set(text[], smallint) from anon, public;

-- One reel: the same answer as before (null for a media that is not there),
-- now a thin layer over the set function.
create or replace function public.analisi_numeri_reel(p_media_id text, p_eta smallint default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return (select s.num from public.analisi_numeri_set(array[p_media_id], p_eta) s);
end;
$$;

-- The tiles of the page: the same as before, with one pass over the reels
-- instead of one call per reel.
create or replace function public.analisi_riepilogo(p_da date, p_a date)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_reel integer;
  v_mediana numeric;
  v_dm bigint;
  v_tg bigint;
  v_contati integer;
  v_non_contati integer;
  v_cambiare integer;
begin
  -- vede_marketing() is true for a live Claude token (MCP): the page's tiles are not for it
  if public.da_client_oauth() or not public.vede_marketing() then
    raise exception 'Le analisi dei reel sono dell’area Marketing.' using errcode = '42501';
  end if;
  if p_da is null or p_a is null or p_a < p_da or p_a - p_da > 366 then
    raise exception 'Periodo non valido.' using errcode = '22023';
  end if;

  select count(*), percentile_cont(0.5) within group (order by n.views_3g),
         coalesce(sum(n.dm_14g) filter (where n.lead_contati and n.lead_giorni = 14), 0),
         coalesce(sum(n.in_target_14g) filter (where n.lead_contati and n.lead_giorni = 14), 0),
         count(*) filter (where n.lead_contati and n.lead_giorni = 14),
         count(*) filter (where n.giorno + 13 <= public.oggi() - 1 and not n.lead_contati)
  into v_reel, v_mediana, v_dm, v_tg, v_contati, v_non_contati
  from public.v_instagram_numeri n
  where not n.eliminato and (n.reel or n.media_type = 'VIDEO') and n.giorno between p_da and p_a;

  select count(*) into v_cambiare
  from public.v_instagram_numeri n
  join public.analisi_numeri_set() a on a.media_id = n.media_id
  where not n.eliminato and (n.reel or n.media_type = 'VIDEO') and n.giorno between p_da and p_a
    and a.num ->> 'verdetto' = 'cambiare';

  return jsonb_build_object(
    'reel', v_reel, 'views_3g_mediana', v_mediana,
    'dm_14g', v_dm, 'in_target_14g', v_tg, 'reel_contati', v_contati, 'reel_non_contati', v_non_contati,
    'da_cambiare', v_cambiare);
end;
$$;

-- The view of the page: the same columns, in the same order, with the numbers
-- from the set function (computed once for all the reels, not once per row).
create or replace view public.v_analisi_reel with (security_invoker = true) as
select
  n.media_id, n.shortcode, n.permalink, n.copertina_url, n.pubblicato_il, n.giorno, n.durata_ms,
  n.video_disponibile, n.eliminato, n.media_type,
  left(p.didascalia, 140) as didascalia_inizio,
  p.stato_collegamento,
  p.contenuto_id, p.contenuto_nome as nome, m.reel_type, m.formato, p.contenuto_stato as status,
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
  z.motivo as analisi_motivo
from public.v_instagram_numeri n
join public.v_instagram_post p on p.media_id = n.media_id
left join public.marketing_contenuti m on m.id = p.contenuto_id
left join public.instagram_letture l on l.media_id = n.media_id
left join lateral (
  select x.id, x.stato, x.verdetto, x.eta_ore, x.eta_confronto, x.finita_il, x.errore, x.motivo
  from public.marketing_analisi x where x.media_id = n.media_id
  order by x.created_at desc limit 1
) z on true
left join public.analisi_numeri_set() a on a.media_id = n.media_id
where n.reel or n.media_type = 'VIDEO';

revoke all on public.v_analisi_reel from anon;

comment on function public.analisi_numeri_set(text[], smallint) is
  'The numbers and verdict of the reels asked for (or of all the reels with null), computed once with set operations: the same rules as analisi_numeri_reel. One row per media found: {media_id, num}. Security invoker: the RLS of the caller on every table.';
comment on function public.analisi_numeri_reel(text, smallint) is
  'The numbers of a reel at its age against the comparison reels (the 90 days before it, at least 8) and its verdict: spingere, mantenere or cambiare, decided here. Ages in hours (under 72 none, 3 days to 167, 7 days to 335, the whole life from 336). Leads of the first 3, 7 or 14 days only if the Insight counted them all (null, never 0). Never an amount of money. Claude explains the verdict and never changes it. A layer over analisi_numeri_set.';
comment on view public.v_analisi_reel is
  'One row per reel for the Analisi page: media, calendar content, numbers, comparison and verdict of today (from analisi_numeri_set, computed once), leads of the first 14 days (null when not counted), the reading and the last analysis.';
