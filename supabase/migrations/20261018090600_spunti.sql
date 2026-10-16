-- Spunti (1.37.0, CLAUDE.md section 31): the only place that decides what leaves the
-- database for Claude when it writes the weekly brief of the Marketing area, and the
-- only door through which a Claude connected with the MCP reads the brief.
--
-- «I numeri raccontano i contenuti, le parole raccontano i lead»: the facts about the
-- reels (views against the median, leads in the DMs) are sentences written here;
-- what the leads, the setter, the closer and the calls say reaches Claude without
-- names, without dates, without euros and, for the calls, only from the analysis
-- (categories, themes, questions), never the transcript, the summary, the lead's
-- words, the closer's answers, the performance or the suggestions for the setter.
-- The health of a person: the text is cleaned in TypeScript (lexicon) before it is sent.

-- ---------------------------------------------------------------------------
-- 1. What may reach Claude (service role only)
-- ---------------------------------------------------------------------------
create function public.marketing_fonti_spunti(p_da date, p_a date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_note boolean;
  v_oggi date := public.oggi();
  v_fuoco date := p_a - 6;
  v_reel jsonb;
  v_temi jsonb := '[]'::jsonb;
  v_setter jsonb := '[]'::jsonb;
  v_scale jsonb := '{}'::jsonb;
  v_closer jsonb := '[]'::jsonb;
  v_call jsonb := '[]'::jsonb;
  v_fatti jsonb := '[]'::jsonb;
  v_calendario jsonb;
  v_settimana integer;
  v_prima numeric;
  v_settimana_target integer;
begin
  if p_da is null or p_a is null or p_a < p_da or p_a - p_da > 60 then
    raise exception 'Periodo non valido.' using errcode = '22023';
  end if;
  select s.note_team into v_note from public.marketing_lavori_stato s where s.id;

  -- the reels of the period with an analysis ready, the newest first (R1, R2...)
  select coalesce(jsonb_agg(to_jsonb(q) order by q.n), '[]'::jsonb) into v_reel
  from (
    select row_number() over (order by i.pubblicato_il desc)::integer as n,
           'R' || row_number() over (order by i.pubblicato_il desc) as ref,
           i.shortcode,
           m.nome as name,
           m.reel_type::text as reel_type,
           m.formato::text as format,
           to_char(i.pubblicato_il at time zone 'Europe/Rome', 'DD/MM') as pubblicato,
           nullif(left(btrim(coalesce(l.gancio_parlato, split_part(coalesce(i.didascalia, ''), E'\n', 1))), 160), '') as gancio,
           a.verdetto,
           left(a.contenuto ->> 'sintesi', 400) as sintesi,
           (select coalesce(jsonb_agg(left(x, 200)), '[]'::jsonb)
            from (select jsonb_array_elements_text(coalesce(a.contenuto -> 'cosa_ha_funzionato', '[]'::jsonb)) as x limit 2) y) as cosa_ha_funzionato,
           l.scheda -> 'icp' ->> 'aderenza' as aderenza_icp,
           coalesce((select sum(d.dm) from public.instagram_contenuti_dm d where d.shortcode = i.shortcode), 0)::integer as lead_dm,
           coalesce((select sum(d.lead_in_target) from public.instagram_contenuti_dm d where d.shortcode = i.shortcode), 0)::integer as lead_in_target
    from public.instagram_contenuti i
    join lateral (select x.* from public.marketing_analisi x
                  where x.media_id = i.media_id and x.stato = 'pronta' order by x.created_at desc limit 1) a on true
    left join public.instagram_letture l on l.media_id = i.media_id
    left join public.marketing_contenuti m on m.instagram_shortcode = i.shortcode
    where (i.reel or i.media_type = 'VIDEO') and i.eliminato_il is null
      and (i.pubblicato_il at time zone 'Europe/Rome')::date between p_da and p_a
    order by i.pubblicato_il desc
    limit 20
  ) q;

  -- the facts about the reels, written here
  select coalesce(jsonb_agg(jsonb_build_object('ref', 'F' || (r.n), 'testo',
           'Reel del ' || r.pubblicato || ': ' || r.lead_dm || ' lead dai DM, ' || r.lead_in_target || ' in target'
           || coalesce(', verdetto dei numeri «' || initcap(r.verdetto) || '»', '')) order by r.n), '[]'::jsonb)
    into v_fatti
  from jsonb_to_recordset(v_reel) as r(n integer, pubblicato text, lead_dm integer, lead_in_target integer, verdetto text);

  select coalesce(sum(d.dm), 0)::integer, coalesce(sum(d.lead_in_target), 0)::integer into v_settimana, v_settimana_target
  from public.instagram_contenuti_dm d where d.giorno between v_fuoco and p_a;
  select coalesce(round(sum(d.dm) / 3.0, 0), 0) into v_prima
  from public.instagram_contenuti_dm d where d.giorno between v_fuoco - 21 and v_fuoco - 1;
  v_fatti := v_fatti || jsonb_build_array(
    jsonb_build_object('ref', 'F90', 'testo', 'Questa settimana ' || v_settimana || ' lead dai reel, ' || v_settimana_target || ' in target'),
    jsonb_build_object('ref', 'F91', 'testo', 'Nelle 3 settimane prima, in media ' || v_prima::integer || ' lead a settimana dai reel'));

  select coalesce(jsonb_agg(jsonb_build_object('name', m.nome, 'modello', m.tipo::text, 'reel_type', m.reel_type::text,
                                               'format', m.formato::text, 'status', m.stato::text)), '[]'::jsonb)
    into v_calendario
  from (select * from public.marketing_contenuti c where c.stato not in ('posted', 'canceled')
        order by c.post_date desc nulls last, c.created_at desc limit 40) m;

  if v_note then
    -- the themes of the DMs of the last recap: never the Insight's own commentary
    select coalesce(jsonb_agg(jsonb_build_object('ref', 'D' || t.n, 'tema', left(t.tema ->> 'theme', 80),
             'quanti', (t.tema ->> 'count')::integer, 'in_target', (t.tema ->> 'target_count')::integer,
             'con_call', (t.tema ->> 'calls')::integer, 'tendenza', t.tema ->> 'trend') order by t.n), '[]'::jsonb)
      into v_temi
    from (select row_number() over ()::integer as n, x.tema
          from (select jsonb_array_elements(coalesce(rc.dati -> 'content' -> 'themes', '[]'::jsonb)) as tema
                from (select y.dati from public.insight_recap y
                      where y.canale = 'instagram' and y.giorno between p_da and p_a
                      order by y.giorno desc limit 1) rc) x
          where jsonb_typeof(x.tema) = 'object' and x.tema ->> 'theme' is not null
          limit 12) t;

    -- the setter's answers, one a day and question; the day becomes «this week» or «before»
    select coalesce(jsonb_agg(jsonb_build_object('ref', 'S' || t.n,
             'quando', case when t.data >= v_fuoco then 'questa_settimana' else 'prima' end,
             'domanda', t.domanda, 'testo', t.testo, 'k', md5('giorno' || t.data::text)) order by t.n), '[]'::jsonb)
      into v_setter
    from (select row_number() over (order by u.data desc, u.domanda)::integer as n, u.*
          from (select d.data, 'cosa frenava'::text as domanda, left(d.cosa_frenava, 300) as testo
                from public.setter_daily_reports d
                where d.data between p_da and p_a and public.testo_scritto(d.cosa_frenava)
                union all
                select d.data, 'domande e contenuti', left(d.domande_contenuti, 300)
                from public.setter_daily_reports d
                where d.data between p_da and p_a and public.testo_scritto(d.domande_contenuti)
                order by 1 desc limit 40) u) t;
    select jsonb_build_object(
      'lead_in_target', (select x.v from (select d.lead_in_target::text as v from public.setter_daily_reports d
                                          where d.data between p_da and p_a and d.lead_in_target is not null
                                          group by 1 order by count(*) desc, 1 limit 1) x),
      'qualita_conversazioni', (select x.v from (select d.qualita_conversazioni::text as v from public.setter_daily_reports d
                                                 where d.data between p_da and p_a and d.qualita_conversazioni is not null
                                                 group by 1 order by count(*) desc, 1 limit 1) x))
      into v_scale;

    select coalesce(jsonb_agg(jsonb_build_object('ref', 'K' || t.n,
             'quando', case when t.g >= v_fuoco then 'questa_settimana' else 'prima' end,
             'esito', t.esito, 'qualificata', t.qualificata, 'motivo', t.motivo, 'note', t.note, 'k', md5(t.id::text)) order by t.n), '[]'::jsonb)
      into v_closer
    from (select row_number() over (order by c.programmata_il desc)::integer as n, c.id,
                 (c.programmata_il at time zone 'Europe/Rome')::date as g, c.esito::text as esito, c.qualificata,
                 left(c.obiezione_principale, 300) as motivo, left(c.note_closer, 300) as note
          from public.calls c
          where c.stato = 'svolta' and c.esito in ('follow_up', 'persa')
            and (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
            and (public.testo_scritto(c.obiezione_principale) or public.testo_scritto(c.note_closer))
          order by c.programmata_il desc limit 30) t;

    -- the analysed calls: only the lead's side (categories, themes, questions), never summary, words or the closer's answers
    select coalesce(jsonb_agg(jsonb_build_object('ref', 'C' || t.n,
             'quando', case when t.g >= v_fuoco then 'questa_settimana' else 'prima' end,
             'chiusa', t.chiusa, 'in_target', t.in_target, 'k', md5(t.id::text),
             'arriva_da', (select r.ref from jsonb_to_recordset(v_reel) as r(ref text, shortcode text)
                           where r.shortcode = t.shortcode
                             and (select count(*) from public.call_analisi_setter z
                                  join public.calls cc on cc.id = z.call_id
                                  join public.lead_contenuto lc2 on lc2.lead_id = cc.lead_id
                                  where lc2.shortcode = t.shortcode
                                    and (cc.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a) >= 3
                           limit 1),
             'obiezioni', t.obiezioni, 'pain', t.pain, 'desideri', t.desideri, 'gia_provato', t.gia_provato,
             'domande', t.domande, 'sapeva', t.sapeva, 'sorprese', t.sorprese, 'spunti_contenuto', t.spunti_contenuto)
             order by t.n), '[]'::jsonb)
      into v_call
    from (select row_number() over (order by c.programmata_il desc)::integer as n, c.id,
                 (c.programmata_il at time zone 'Europe/Rome')::date as g, c.esito = 'chiusa' as chiusa,
                 a.in_target, lc.shortcode,
                 -- condizioni_personali (health, work and family together) arrives as a category only
                 (select coalesce(jsonb_agg(jsonb_build_object('categoria', o ->> 'categoria',
                           'sintesi', case when o ->> 'categoria' = 'condizioni_personali' then null else left(o ->> 'sintesi', 200) end)), '[]'::jsonb)
                  from jsonb_array_elements(coalesce(a.obiezioni, '[]'::jsonb)) o) as obiezioni,
                 to_jsonb(a.pain) as pain, to_jsonb(a.desideri) as desideri,
                 coalesce(a.lead -> 'gia_provato', '[]'::jsonb) as gia_provato,
                 coalesce(a.domande, '[]'::jsonb) as domande,
                 to_jsonb(z.sapeva) as sapeva, coalesce(z.sorprese, '[]'::jsonb) as sorprese,
                 coalesce(a.spunti_contenuto, '[]'::jsonb) as spunti_contenuto
          from public.call_analisi a
          join public.calls c on c.id = a.call_id
          left join public.call_analisi_setter z on z.call_id = a.call_id
          left join public.lead_contenuto lc on lc.lead_id = c.lead_id
          where a.stato = 'pronta' and c.stato = 'svolta'
            and (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
          order by c.programmata_il desc limit 40) t;

  end if;

  return jsonb_build_object(
    'periodo', 'dal ' || to_char(p_da, 'DD/MM') || ' al ' || to_char(p_a, 'DD/MM/YYYY'),
    'settimana', 'dal ' || to_char(v_fuoco, 'DD/MM') || ' al ' || to_char(p_a, 'DD/MM/YYYY'),
    'note_team', v_note,
    'reel', v_reel,
    'dm', jsonb_build_object('temi', v_temi),
    'setter', jsonb_build_object('scale', v_scale, 'note', v_setter),
    'closer', jsonb_build_object('motivi', v_closer),
    'call', jsonb_build_object('analisi', v_call),
    'in_calendario', v_calendario,
    'fatti', v_fatti,
    'da_oscurare', public.marketing_da_oscurare());
end;
$$;
revoke all on function public.marketing_fonti_spunti(date, date) from public, anon, authenticated;
grant execute on function public.marketing_fonti_spunti(date, date) to service_role;

-- ---------------------------------------------------------------------------
-- 2. The brief for a Claude connected with the MCP (admin, video editor, marketing)
-- ---------------------------------------------------------------------------
-- Without the Claude OAuth guard on purpose: it is made for that token, and vede_marketing()
-- says who may. The latest ready brief (or the one whose period contains p_giorno), the
-- references replaced by the facts' sentences: never the sources, the counts or the numbers behind.
create function public.spunti_per_claude(p_giorno date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  m public.marketing_spunti;
begin
  if not public.vede_marketing() then
    raise exception 'Gli spunti sono dell’area Marketing.' using errcode = '42501';
  end if;
  select * into m from public.marketing_spunti x
  where x.stato = 'pronta' and (p_giorno is null or p_giorno between x.periodo_da and x.periodo_a)
  order by x.finita_il desc limit 1;
  if not found then
    return jsonb_build_object('spunti', null);
  end if;
  return jsonb_build_object(
    'periodo_da', m.periodo_da, 'periodo_a', m.periodo_a, 'finita_il', m.finita_il,
    'contenuto', m.contenuto,
    'idee_nel_calendario', (
      select coalesce(jsonb_agg(jsonb_build_object('idea', c.da_spunti_idea, 'name', c.nome) order by c.da_spunti_idea), '[]'::jsonb)
      from public.marketing_contenuti c where c.da_spunti = m.id));
end;
$$;
revoke all on function public.spunti_per_claude(date) from public, anon;
grant execute on function public.spunti_per_claude(date) to authenticated;

-- The Data API filter: a Claude token reaches the calendar, mcp_chi_sono and now the brief
create or replace function public.mcp_filtro_richiesta()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_percorso text;
  v_metodo text;
  v_intestazioni jsonb;
begin
  if not public.da_client_oauth() then
    return;
  end if;
  perform set_config('alpha.mcp_filtro', 'on', true);
  v_percorso := ltrim(coalesce(current_setting('request.path', true), ''), '/');
  v_metodo := upper(coalesce(current_setting('request.method', true), ''));
  v_intestazioni := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  if coalesce(v_intestazioni ->> 'accept-profile', 'public') = 'public'
     and coalesce(v_intestazioni ->> 'content-profile', 'public') = 'public'
     and (
          (v_percorso = 'marketing_contenuti' and v_metodo in ('GET', 'HEAD', 'POST', 'PATCH', 'DELETE'))
       or (v_percorso = 'rpc/salva_sezione_contenuto' and v_metodo = 'POST')   -- volatile: POST only
       or (v_percorso = 'rpc/spunti_per_claude' and v_metodo in ('GET', 'POST'))
       or (v_percorso = 'rpc/mcp_chi_sono' and v_metodo in ('GET', 'POST'))
     ) then
    return;
  end if;
  raise exception 'Da Claude si usa solo il calendario dei contenuti.' using errcode = '42501';
end;
$$;
comment on function public.mcp_filtro_richiesta() is
  'PostgREST pre-request: an OAuth token (Claude) reaches only marketing_contenuti, salva_sezione_contenuto (POST), spunti_per_claude and mcp_chi_sono, and raises the transaction-local flag alpha.mcp_filtro that mcp_chi_sono reports. The MCP allow-list: a later MCP tool adds its path here and in 00_schema.sql.';

comment on function public.marketing_fonti_spunti(date, date) is
  'service_role only: what may reach Claude for the weekly brief: the reels with their analysis, the leads from the DMs per reel as sentences, and with note_team on the themes of the DMs, the setter''s answers, the closer''s reasons and, from the analysed calls, categories, themes, questions and surprises of the leads. Never names, dates, euros, transcripts, summaries, the lead''s words, the closer''s answers, performance or the suggestions for the setter. da_oscurare and pesi stay on the server.';
comment on function public.spunti_per_claude(date) is
  'Admin, video editor and marketing (also with a Claude OAuth token): the latest ready weekly brief, without sources nor counts.';
