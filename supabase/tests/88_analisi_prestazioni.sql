-- The Analisi page in production (1.37.1, 20261019090000_analisi_prestazioni.sql): the numbers of the
-- reels are now computed once for all of them (analisi_numeri_set) and the Marketing policies check the
-- role once per statement. Here: (1) the new functions give EXACTLY the answers of the old ones, whose code
-- is copied below as the oracle, on the seed and on ~300 generated posts, at every age; (2) who reads what
-- is unchanged; (3) the page's query, as the admin and under RLS, runs in a fraction of the 8 seconds of
-- statement_timeout of the role authenticated (it did not finish in production).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(27);

-- ---------------------------------------------------------------------------
-- 1. The load: ~300 posts (240 reels), ~2800 daily photos of the numbers, the leads of the days
--    (same generator as scripts/carico-analisi.sql)
-- ---------------------------------------------------------------------------
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
from generate_series(1, 300) g;

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


-- ---------------------------------------------------------------------------
-- 2. The oracle: the old functions (20261016090200), copied
-- ---------------------------------------------------------------------------
create function pg_temp.analisi_numeri_reel_v0(p_media_id text, p_eta smallint default null)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  r public.instagram_contenuti;
  v_ore integer;
  v_eta smallint;
  v_lo numeric;
  v_hi numeric;
  v_mira numeric;
  v_oggi date := public.oggi();
  v_p date;
  v_views integer; v_reach integer; v_saved integer; v_shares integer; v_avg integer; v_skip numeric;
  v_snap public.instagram_contenuti_misure;
  v_conf jsonb;
  v_n integer := 0;
  v_med_views numeric; v_med_salv numeric; v_med_cond numeric; v_med_vista numeric;
  v_percentile integer;
  v_r_views numeric; v_r_salv numeric; v_r_cond numeric; v_r_vista numeric;
  v_tasso_salv numeric; v_tasso_cond numeric; v_vista numeric;
  v_fascia_pubblico text;
  v_giorni smallint;
  v_dm integer; v_tg integer; v_call integer;
  v_contati boolean := false;
  v_p75 numeric;
  v_reel_type public.contenuto_reel_type;
  v_tipo_scheda text;
  v_fascia_lead text;
  v_eta_confronto smallint;
  v_modo text;
begin
  if p_eta is not null and p_eta not in (0, 3, 7) then
    raise exception 'L’età del confronto vale 3, 7 o 0.' using errcode = '22023';
  end if;
  select * into r from public.instagram_contenuti i where i.media_id = p_media_id;
  if not found then
    return null;
  end if;

  v_ore := floor(extract(epoch from (now() - r.pubblicato_il)) / 3600)::integer;
  v_eta := case
    when p_eta is not null then p_eta
    when v_ore < 72 then null
    when v_ore < 168 then 3
    when v_ore < 336 then 7
    else 0
  end;
  v_p := (r.pubblicato_il at time zone 'Europe/Rome')::date;
  v_giorni := case v_eta when 3 then 3 when 7 then 7 when 0 then 14 end;

  -- the reel's own numbers at that age
  if v_eta in (3, 7) then
    v_lo := case v_eta when 3 then 60 else 144 end;
    v_hi := case v_eta when 3 then 108 else 216 end;
    v_mira := case v_eta when 3 then 72 else 168 end;
    select m.* into v_snap from public.instagram_contenuti_misure m
    where m.media_id = r.media_id and m.eta_ore between v_lo and v_hi
    order by abs(m.eta_ore - v_mira), m.giorno limit 1;
    if found then
      v_views := v_snap.views; v_reach := v_snap.reach; v_saved := v_snap.saved; v_shares := v_snap.shares;
      v_avg := v_snap.avg_watch_ms; v_skip := v_snap.skip_rate;
    end if;
  elsif v_eta = 0 and r.metriche_stato = 'lette' then
    v_views := r.views; v_reach := r.reach; v_saved := r.saved; v_shares := r.shares;
    v_avg := r.avg_watch_ms; v_skip := r.skip_rate;
  end if;

  -- the comparison reels, with the numbers they had at that age
  if v_eta is not null then
    select coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) into v_conf
    from (
      select x.media_id, x.shortcode, (x.pubblicato_il at time zone 'Europe/Rome')::date as p, x.durata_ms,
             s.views, s.reach, s.saved, s.shares, s.avg_watch_ms
      from public.instagram_contenuti x
      join lateral (
        select m.views, m.reach, m.saved, m.shares, m.avg_watch_ms
        from public.instagram_contenuti_misure m
        where v_eta in (3, 7) and m.media_id = x.media_id and m.eta_ore between v_lo and v_hi
        order by abs(m.eta_ore - v_mira), m.giorno limit 1
      ) s on true
      where x.media_id <> r.media_id and x.eliminato_il is null and (x.reel or x.media_type = 'VIDEO')
        and x.metriche_stato = 'lette'
        and x.pubblicato_il < r.pubblicato_il and x.pubblicato_il >= r.pubblicato_il - interval '90 days'
      union all
      select x.media_id, x.shortcode, (x.pubblicato_il at time zone 'Europe/Rome')::date, x.durata_ms,
             x.views, x.reach, x.saved, x.shares, x.avg_watch_ms
      from public.instagram_contenuti x
      where v_eta = 0 and x.media_id <> r.media_id and x.eliminato_il is null and (x.reel or x.media_type = 'VIDEO')
        and x.metriche_stato = 'lette' and x.pubblicato_il <= now() - interval '336 hours'
        and x.pubblicato_il < r.pubblicato_il and x.pubblicato_il >= r.pubblicato_il - interval '90 days'
    ) c;

    select count(*) filter (where c.views is not null),
           percentile_cont(0.5) within group (order by c.views),
           percentile_cont(0.5) within group (order by case when c.reach > 0 then c.saved::numeric / c.reach end),
           percentile_cont(0.5) within group (order by case when c.reach > 0 then c.shares::numeric / c.reach end),
           percentile_cont(0.5) within group (order by case when c.durata_ms > 0 then c.avg_watch_ms::numeric / c.durata_ms end)
    into v_n, v_med_views, v_med_salv, v_med_cond, v_med_vista
    from jsonb_to_recordset(v_conf) as c(media_id text, shortcode text, p date, durata_ms integer,
                                         views integer, reach integer, saved integer, shares integer,
                                         avg_watch_ms integer);
  end if;

  v_modo := case when v_eta is null then null when v_n >= 8 then (case when v_eta = 0 then 'vita_intera' else 'stessa_eta' end) end;
  v_eta_confronto := case when v_modo = 'stessa_eta' then v_eta end;

  if v_modo is not null then
    v_tasso_salv := case when v_reach > 0 then v_saved::numeric / v_reach end;
    v_tasso_cond := case when v_reach > 0 then v_shares::numeric / v_reach end;
    v_vista := case when r.durata_ms > 0 and v_avg is not null then v_avg::numeric / r.durata_ms end;
    v_r_views := case when v_views is not null and v_med_views > 0 then v_views / v_med_views end;
    v_r_salv := case when v_tasso_salv is not null and v_med_salv > 0 then v_tasso_salv / v_med_salv end;
    v_r_cond := case when v_tasso_cond is not null and v_med_cond > 0 then v_tasso_cond / v_med_cond end;
    v_r_vista := case when v_vista is not null and v_med_vista > 0 then v_vista / v_med_vista end;
    if v_views is not null then
      select round(100.0 * count(*) filter (where c.views < v_views) / nullif(count(c.views), 0))::integer
      into v_percentile
      from jsonb_to_recordset(v_conf) as c(media_id text, shortcode text, p date, durata_ms integer,
                                           views integer, reach integer, saved integer, shares integer,
                                           avg_watch_ms integer);
    end if;
    v_fascia_pubblico := public.analisi_fascia_pubblico(v_r_views, v_r_salv, v_r_cond);
  end if;

  -- the leads of the first days, only if all of those days were counted
  if v_giorni is not null and v_p + v_giorni - 1 <= v_oggi - 1
     and (select count(*) from public.instagram_contenuti_dm_giorni g
          where g.giorno between v_p and v_p + v_giorni - 1) = v_giorni then
    v_contati := true;
    select coalesce(sum(d.dm), 0), coalesce(sum(d.lead_in_target), 0), coalesce(sum(d.call_prenotate), 0)
    into v_dm, v_tg, v_call
    from public.instagram_contenuti_dm d
    where d.shortcode = r.shortcode and d.giorno between v_p and v_p + v_giorni - 1;
  end if;

  if v_contati and v_conf is not null then
    -- the 75th percentile of the in-target leads of the comparison reels whose same window was all counted
    select percentile_cont(0.75) within group (order by t.tg) into v_p75
    from (
      select (select coalesce(sum(d.lead_in_target), 0) from public.instagram_contenuti_dm d
              where d.shortcode = c.shortcode and d.giorno between c.p and c.p + v_giorni - 1) as tg
      from jsonb_to_recordset(v_conf) as c(media_id text, shortcode text, p date, durata_ms integer,
                                           views integer, reach integer, saved integer, shares integer,
                                           avg_watch_ms integer)
      where c.p + v_giorni - 1 <= v_oggi - 1
        and (select count(*) from public.instagram_contenuti_dm_giorni g
             where g.giorno between c.p and c.p + v_giorni - 1) = v_giorni
    ) t;
  end if;

  select m.reel_type into v_reel_type from public.marketing_contenuti m where m.instagram_shortcode = r.shortcode limit 1;
  if v_reel_type is null then
    select l.scheda -> 'classificazione' ->> 'reel_type' into v_tipo_scheda
    from public.instagram_letture l where l.media_id = r.media_id;
    if v_tipo_scheda in ('attraction', 'education', 'converting', 'radio', 'workshop') then
      v_reel_type := v_tipo_scheda::public.contenuto_reel_type;
    end if;
  end if;

  if v_contati then
    v_fascia_lead := public.analisi_fascia_lead(v_dm, v_tg, v_p75, v_reel_type);
  end if;

  return jsonb_build_object(
    'eta_ore', v_ore,
    'eta', v_eta,
    'eta_confronto', v_eta_confronto,
    'confronto', v_modo,
    'reel_di_confronto', case when v_eta is null then null else v_n end,
    'views', v_views, 'copertura', v_reach, 'salvataggi', v_saved, 'condivisioni', v_shares,
    'visione_media_ms', v_avg, 'skip_rate', v_skip, 'durata_ms', r.durata_ms,
    'views_mediana', v_med_views,
    'tasso_salvataggi', case when v_modo is not null then round(v_tasso_salv, 4) end,
    'tasso_salvataggi_mediana', round(v_med_salv, 4),
    'tasso_condivisioni', case when v_modo is not null then round(v_tasso_cond, 4) end,
    'tasso_condivisioni_mediana', round(v_med_cond, 4),
    'quota_vista', case when v_modo is not null then round(v_vista, 4) end,
    'quota_vista_mediana', round(v_med_vista, 4),
    'views_rapporto', round(v_r_views, 2),
    'salvataggi_rapporto', round(v_r_salv, 2),
    'condivisioni_rapporto', round(v_r_cond, 2),
    'vista_rapporto', round(v_r_vista, 2),
    'views_percentile', v_percentile,
    'fascia_pubblico', v_fascia_pubblico,
    'fascia_lead', v_fascia_lead,
    'verdetto', public.analisi_verdetto(v_fascia_pubblico, v_fascia_lead),
    'reel_type', v_reel_type,
    'lead', jsonb_build_object(
      'finestra', case v_giorni when 3 then 'primi 3 giorni' when 7 then 'primi 7 giorni' when 14 then 'primi 14 giorni' end,
      'contati', v_contati,
      'dm', v_dm, 'lead_in_target', v_tg, 'call_prenotate', v_call,
      'in_target_p75', round(v_p75, 2)
    )
  );
end;
$$;

create function pg_temp.analisi_riepilogo_v0(p_da date, p_a date)
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
  v_cambiare integer := 0;
  r record;
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

  for r in
    select n.media_id from public.v_instagram_numeri n
    where not n.eliminato and (n.reel or n.media_type = 'VIDEO') and n.giorno between p_da and p_a
  loop
    if pg_temp.analisi_numeri_reel_v0(r.media_id) ->> 'verdetto' = 'cambiare' then
      v_cambiare := v_cambiare + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'reel', v_reel, 'views_3g_mediana', v_mediana,
    'dm_14g', v_dm, 'in_target_14g', v_tg, 'reel_contati', v_contati, 'reel_non_contati', v_non_contati,
    'da_cambiare', v_cambiare);
end;
$$;

select ok((select count(*) from public.instagram_contenuti where shortcode like 'CarPost%' and (reel or media_type = 'VIDEO')) >= 200,
  'il carico: almeno 200 reel generati');
select ok((select count(*) from public.instagram_contenuti_misure) >= 2000, 'e almeno 2000 foto dei numeri');

-- ---------------------------------------------------------------------------
-- 3. The same answers, reel by reel and age by age (as the table owner: the policies are not the subject)
-- ---------------------------------------------------------------------------
create temp table confronto (eta smallint, n integer, diversi integer);
do $$
declare e smallint; n integer; d integer;
begin
  foreach e in array array[null, 3, 7, 0]::smallint[] loop
    select count(*), count(*) filter (where pg_temp.analisi_numeri_reel_v0(i.media_id, e) is distinct from public.analisi_numeri_reel(i.media_id, e))
    into n, d
    from public.instagram_contenuti i where i.reel or i.media_type = 'VIDEO';
    insert into confronto values (e, n, d);
  end loop;
end $$;
select is((select sum(diversi)::integer from confronto), 0, 'analisi_numeri_reel: 4 età x tutti i reel, nessuna risposta diversa dalla vecchia');
select ok((select min(n) from confronto) > 200, 'e il confronto è su più di 200 reel per età');

-- the same through the set function, in one go, with the age decided by the age of the reel
select is(
  (select count(*)::integer from public.analisi_numeri_set() s
   where s.num is distinct from pg_temp.analisi_numeri_reel_v0(s.media_id)),
  0, 'analisi_numeri_set(): tutti i reel, la stessa risposta della vecchia');
select is((select count(*)::integer from public.analisi_numeri_set()),
  (select count(*)::integer from public.instagram_contenuti where reel or media_type = 'VIDEO'),
  'una riga per reel, né di più né di meno');
select is((select count(*)::integer from public.analisi_numeri_set(array['9000000000000001', 'nonesiste'])), 1,
  'con gli id: solo quelli trovati (anche un post che non è un reel)');
select is(public.analisi_numeri_reel('nonesiste'), null::jsonb, 'un media che non c''è: null, come prima');
select throws_ok($$ select public.analisi_numeri_set(null, 5::smallint) $$, '22023', null, 'un''età che non esiste: 22023');
select throws_ok($$ select public.analisi_numeri_reel('9000000000000002', 5::smallint) $$, '22023', null, 'anche dal reel singolo');

-- the view of the page says what the oracle says, column by column of the verdict
select is(
  (select count(*)::integer from public.v_analisi_reel v
   where (v.verdetto_oggi, v.fascia_pubblico, v.fascia_lead, v.confronto, v.views_rapporto, v.salvataggi_rapporto, v.quota_vista, v.views_confronto, v.eta_confronto, v.views_all_eta)
     is distinct from (
       pg_temp.analisi_numeri_reel_v0(v.media_id) ->> 'verdetto', pg_temp.analisi_numeri_reel_v0(v.media_id) ->> 'fascia_pubblico',
       pg_temp.analisi_numeri_reel_v0(v.media_id) ->> 'fascia_lead', pg_temp.analisi_numeri_reel_v0(v.media_id) ->> 'confronto',
       (pg_temp.analisi_numeri_reel_v0(v.media_id) ->> 'views_rapporto')::numeric,
       (pg_temp.analisi_numeri_reel_v0(v.media_id) ->> 'salvataggi_rapporto')::numeric,
       (pg_temp.analisi_numeri_reel_v0(v.media_id) ->> 'quota_vista')::numeric,
       (pg_temp.analisi_numeri_reel_v0(v.media_id) ->> 'views_mediana')::numeric,
       (pg_temp.analisi_numeri_reel_v0(v.media_id) ->> 'eta_confronto')::smallint,
       (pg_temp.analisi_numeri_reel_v0(v.media_id) ->> 'views')::integer)),
  0, 'v_analisi_reel: verdetto, fasce e rapporti di ogni reel come nella vecchia funzione');
select is(
  (select v.verdetto_oggi from public.v_analisi_reel v where v.media_id = '9000000000000099'),
  pg_temp.analisi_numeri_reel_v0('9000000000000099') ->> 'verdetto',
  'e leggendo un reel solo (il pannello) lo stesso');

-- the load really exercises the rules: verdicts, both kinds of comparison, leads counted and not
select ok((select count(distinct s.num ->> 'verdetto') from public.analisi_numeri_set() s) >= 3, 'il carico copre almeno 3 verdetti diversi');
select ok((select count(distinct s.num ->> 'confronto') from public.analisi_numeri_set() s) >= 2, 'e più di un tipo di confronto');
select ok((select count(*) from public.analisi_numeri_set() s where (s.num -> 'lead' ->> 'contati')::boolean) > 10
      and (select count(*) from public.analisi_numeri_set() s where not (s.num -> 'lead' ->> 'contati')::boolean) > 10,
  'e reel con i lead contati e non contati');

-- ---------------------------------------------------------------------------
-- 4. Who reads: unchanged
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(public.analisi_riepilogo(public.oggi() - 180, public.oggi()), pg_temp.analisi_riepilogo_v0(public.oggi() - 180, public.oggi()),
  'le tessere: le stesse della vecchia funzione, a 180 giorni');
select is(public.analisi_riepilogo(public.oggi() - 30, public.oggi()), pg_temp.analisi_riepilogo_v0(public.oggi() - 30, public.oggi()),
  'e a 30');
select ok((select count(*) from public.analisi_numeri_set()) > 200, 'l''admin legge i numeri');

set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
select ok((select count(*) from public.analisi_numeri_set()) > 200 and (select count(*) from public.v_analisi_reel) > 200, 'il video editor legge come prima');
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select ok((select count(*) from public.analisi_numeri_set()) > 200, 'il marketing pure');
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::integer from public.analisi_numeri_set()), 0, 'il setter non vede niente');
select is((select count(*)::integer from public.v_analisi_reel), 0, 'né la view');
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","client_id":"7c000000-0000-4000-8000-0000000000aa"}';
select is((select count(*)::integer from public.analisi_numeri_set()), 0, 'un token di Claude, anche dell''admin, nemmeno');
select is((select count(*)::integer from public.v_analisi_reel), 0, 'né la view');
reset role;
set local request.jwt.claims to '{}';

-- the policies check the role once per statement (an initplan), not once per row
select is(
  (select count(*)::integer from pg_policies
   where schemaname = 'public' and cmd = 'SELECT'
     and policyname in ('instagram_contenuti_lettura', 'instagram_contenuti_misure_lettura', 'instagram_contenuti_dm_lettura',
                        'instagram_contenuti_dm_giorni_lettura', 'instagram_letture_lettura', 'marketing_analisi_lettura',
                        'marketing_abbinamenti_lettura', 'marketing_post_esclusi_lettura', 'marketing_abbinamenti_rifiutati_lettura')
     and qual !~* 'select vede_marketing'),
  0, 'le policy di lettura dell''area Marketing valutano vede_marketing() una volta per istruzione');

-- ---------------------------------------------------------------------------
-- 5. The time: the page's query, as the admin, under RLS
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
create or replace function pg_temp.ms(p_sql text) returns numeric language plpgsql as $$
declare t0 timestamptz := clock_timestamp();
begin
  execute p_sql;
  return round(extract(epoch from clock_timestamp() - t0) * 1000);
end;
$$;
select ok(pg_temp.ms($q$ select jsonb_agg(to_jsonb(x)) from (
  select * from public.v_analisi_reel where giorno >= public.oggi() - 180
  order by views desc nulls last, pubblicato_il desc limit 200) x $q$) < 3000,
  'la pagina (180 giorni, 200 reel, ordine per views) sotto i 3 secondi: prima non finiva in 8');
select ok(pg_temp.ms($q$ select public.analisi_riepilogo(public.oggi() - 180, public.oggi()) $q$) < 3000,
  'e le tessere pure');
reset role;
set local request.jwt.claims to '{}';

select * from finish();
rollback;
