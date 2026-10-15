-- The functions of the reel analysis (1.36.0, CLAUDE.md section 30): the
-- verdict of the numbers (decided here, in SQL: Claude explains it and never
-- changes it), the requests of the people, the planner that moves the work one
-- step at a time, what is allowed to reach Claude, and the view of the page.
-- Dany, 09/10/2026, 10/10/2026, 15/10/2026.
--
-- The thresholds are constants of the functions below and of CLAUDE.md section
-- 9: changing one is a migration and a test.
--   views of the reel / median of the comparison reels at the same age:
--     above  >= 1.3, or >= 0.8 with saves or shares >= 1.5 times their median
--     below  <= 0.7 with saves and shares below their median
--   leads of the first days (3, 7 or 14): above = at least 2 in target, or at
--     least 1 and more than the 75th percentile of the comparison reels;
--     below = no DM at all on a «Converting» reel
--   verdict: spingere / mantenere / cambiare (below)
-- Ages in HOURS: under 72 none; 3 days from 72 to 167; 7 days from 168 to 335;
-- the whole life from 336. The comparison needs at least 8 reels.
--
-- Every security definer function has set search_path = '' and, by default,
-- no grant (the planner and the internals), or the grant that is written.
-- insight_costo_usd (1.35.0) is revoked from every role: it is called only
-- inside the definer functions here, which run as their owner.

-- ---------------------------------------------------------------------------
-- 1. The verdict: three small immutable functions
-- ---------------------------------------------------------------------------
create function public.analisi_fascia_pubblico(p_views numeric, p_salvataggi numeric, p_condivisioni numeric)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_views is null then null
    when p_views >= 1.3
         or (p_views >= 0.8 and (coalesce(p_salvataggi, 0) >= 1.5 or coalesce(p_condivisioni, 0) >= 1.5))
      then 'sopra'
    when p_views <= 0.7 and coalesce(p_salvataggi, 0) < 1 and coalesce(p_condivisioni, 0) < 1 then 'sotto'
    else 'nella_media'
  end;
$$;

create function public.analisi_fascia_lead(
  p_dm integer, p_in_target integer, p_p75 numeric, p_reel_type public.contenuto_reel_type)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_dm is null then null
    when coalesce(p_in_target, 0) >= 2
         or (coalesce(p_in_target, 0) >= 1 and p_p75 is not null and p_in_target > p_p75) then 'sopra'
    when p_dm = 0 and p_reel_type = 'converting' then 'sotto'
    else 'nella_media'
  end;
$$;

create function public.analisi_verdetto(p_pubblico text, p_lead text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when p_pubblico is null and p_lead is null then null
    when p_lead = 'sopra' or (p_pubblico = 'sopra' and p_lead is distinct from 'sotto') then 'spingere'
    when (p_pubblico = 'sotto' and p_lead is distinct from 'sopra') or p_lead = 'sotto' then 'cambiare'
    else 'mantenere'
  end;
$$;

grant execute on function public.analisi_fascia_pubblico(numeric, numeric, numeric) to authenticated, service_role;
grant execute on function public.analisi_fascia_lead(integer, integer, numeric, public.contenuto_reel_type) to authenticated, service_role;
grant execute on function public.analisi_verdetto(text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The numbers of a reel against the other reels, and its verdict
-- ---------------------------------------------------------------------------
-- p_eta: null = the age in hours decides (under 72: none, 3, 7 or the whole
-- life from 336); 3 or 7 forces that comparison; 0 forces the whole life.
-- The comparison reels are the reels (Reel or VIDEO) published in the 90 days
-- before this one, not deleted, with numbers read: at the same age (the photo
-- of the same window, instagram_contenuti_misure) for 3 and 7 days; for the
-- whole life the ones of 336 hours and more, with today's numbers. At least 8,
-- otherwise every ratio is null. The leads count the first 3, 7 or 14 days of
-- arrival (instagram_contenuti_dm) and only when the Insight counted all of
-- those days after they were over (instagram_contenuti_dm_giorni): otherwise
-- null, never 0. Never an amount of money.
create function public.analisi_numeri_reel(p_media_id text, p_eta smallint default null)
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

grant execute on function public.analisi_numeri_reel(text, smallint) to authenticated, service_role;

-- The tiles of the page: the reels of the period, the median of their views at
-- three days, the leads of their first 14 days (only the reels whose days were
-- counted; how many were not), and how many say «Cambiare» today.
create function public.analisi_riepilogo(p_da date, p_a date)
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
    if public.analisi_numeri_reel(r.media_id) ->> 'verdetto' = 'cambiare' then
      v_cambiare := v_cambiare + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'reel', v_reel, 'views_3g_mediana', v_mediana,
    'dm_14g', v_dm, 'in_target_14g', v_tg, 'reel_contati', v_contati, 'reel_non_contati', v_non_contati,
    'da_cambiare', v_cambiare);
end;
$$;

grant execute on function public.analisi_riepilogo(date, date) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The cost of the month (internal) and the idea trigger
-- ---------------------------------------------------------------------------
-- The month's cost counts only if its month is this one: at the turn of the
-- month a limit reached the month before blocks nothing (R4).
create function public.marketing_costo_mese()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case when s.mese = date_trunc('month', public.oggi())::date then s.costo_mese_usd else 0 end
     from public.marketing_lavori_stato s where s.id), 0);
$$;
revoke all on function public.marketing_costo_mese() from public, anon, authenticated, service_role;

-- A content born from an idea of Claude («Aggiungi al calendario»): the origin
-- is written only for a ready analysis that has that idea; it never changes
-- from a session; a token of Claude (MCP) never writes it. The service role's
-- «set null» when an old analysis is pruned passes (no auth.uid()).
create function public.marketing_contenuti_idea_coerenza()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_idee integer;
begin
  if tg_op = 'UPDATE'
     and new.da_analisi is not distinct from old.da_analisi and new.da_idea is not distinct from old.da_idea then
    return new;
  end if;
  if tg_op = 'INSERT' and new.da_analisi is null and new.da_idea is null then
    return new;
  end if;

  if public.da_client_oauth() then
    raise exception 'Il legame con un’idea di Claude non si scrive da qui.' using errcode = '42501';
  end if;
  -- the service role, the seed, the restore: free
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;

  if tg_op = 'UPDATE' then
    raise exception 'Il legame con un’idea di Claude non si cambia.' using errcode = '42501';
  end if;
  select jsonb_array_length(a.contenuto -> 'idee') into v_idee
  from public.marketing_analisi a where a.id = new.da_analisi and a.stato = 'pronta';
  if new.da_analisi is null or new.da_idea is null or v_idee is null or new.da_idea >= v_idee then
    raise exception 'Idea di Claude non valida.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.marketing_contenuti_idea_coerenza() from public, anon, authenticated;

create trigger marketing_contenuti_idea_coerenza
  before insert or update of da_analisi, da_idea on public.marketing_contenuti
  for each row execute function public.marketing_contenuti_idea_coerenza();

-- ---------------------------------------------------------------------------
-- 4. The requests of the people (admin and marketing)
-- ---------------------------------------------------------------------------
create function public.marketing_analisi_richiedi(p_media_id text, p_rileggi boolean default false)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.instagram_contenuti;
  l public.instagram_letture;
  s public.marketing_lavori_stato;
  v_id uuid;
  v_inizio_oggi timestamptz := public.oggi()::timestamp at time zone 'Europe/Rome';
begin
  if public.current_role() is null or public.current_role() not in ('admin', 'marketing') then
    raise exception 'Le analisi le chiedono l’admin e il marketing.' using errcode = '42501';
  end if;
  select * into r from public.instagram_contenuti i where i.media_id = p_media_id;
  if not found then
    raise exception 'Questo reel non c’è tra quelli letti da Instagram.' using errcode = 'P0002';
  end if;
  if not (r.reel or r.media_type = 'VIDEO') then
    raise exception 'L’analisi di Claude per i caroselli arriva più avanti.' using errcode = '22023';
  end if;
  if r.eliminato_il is not null then
    raise exception 'Questo reel non è più su Instagram.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('alpha.marketing_lavori', 0));

  select * into s from public.marketing_lavori_stato x where x.id;
  if public.marketing_costo_mese() >= s.costo_max_mese then
    raise exception 'Le analisi di questo mese hanno raggiunto il limite di spesa: lo cambia l’admin in Impostazioni.'
      using errcode = '22023';
  end if;
  if exists (select 1 from public.marketing_analisi a where a.media_id = p_media_id and a.stato in ('in_coda', 'in_corso')) then
    raise exception 'Claude sta già analizzando questo reel.' using errcode = '22023';
  end if;
  if (select count(*) from public.marketing_analisi a
      where a.motivo = 'richiesta' and a.created_at >= v_inizio_oggi) >= 10 then
    raise exception 'Le analisi di oggi sono finite: riprova domani.' using errcode = '22023';
  end if;

  select * into l from public.instagram_letture x where x.media_id = p_media_id for update;
  if not found then
    insert into public.instagram_letture (media_id, richiesta, stato, motivo, priorita)
    values (p_media_id, 'completa', 'in_coda', 'richiesta', 2);
  elsif l.stato <> 'in_corso' and (l.richiesta = 'trascrizione' or l.stato = 'fallita' or l.stato = 'in_coda'
                                   or coalesce(p_rileggi, false)) then
    update public.instagram_letture x
    set richiesta = 'completa', stato = 'in_coda', motivo = 'richiesta', priorita = 2,
        tentativi = 0, ripresa_usata = false, prossimo_il = null, errore = null,
        -- a speech that did not come out for a reason that can pass (Whisper failed or was off, the video was not
        -- there) is asked again: a transcript that came out, or a reel with no speech, is kept
        trascrizione_esito = case when x.trascrizione_esito in ('fallita', 'spenta', 'senza_video') then null else x.trascrizione_esito end
    where x.media_id = p_media_id;
  end if;

  insert into public.marketing_analisi (media_id, motivo, periodo_da, periodo_a)
  values (p_media_id, 'richiesta', public.oggi() - 28, public.oggi() - 1)
  returning id into v_id;
  return v_id;
end;
$$;

-- «Limite di spesa al mese ($)»: the admin only.
create function public.marketing_imposta_costo_max(p_usd numeric)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo l’admin cambia il limite di spesa.' using errcode = '42501';
  end if;
  if p_usd is null or p_usd < 0 or p_usd > 200 then
    raise exception 'Scegli un limite tra 0 e 200 $.' using errcode = '22023';
  end if;
  update public.marketing_lavori_stato s set costo_max_mese = round(p_usd, 2) where s.id;
end;
$$;

-- The two switches: the automatic analyses and the notes of setter and closer.
-- Null leaves the value as it is. Changing note_team does not redo the analyses already made.
create function public.marketing_imposta_interruttori(
  p_automatiche boolean default null, p_note_team boolean default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo l’admin cambia le analisi automatiche e le note del team.' using errcode = '42501';
  end if;
  update public.marketing_lavori_stato s
  set automatiche = coalesce(p_automatiche, s.automatiche), note_team = coalesce(p_note_team, s.note_team)
  where s.id;
end;
$$;

-- What the page says about the work: for admin, video editor and marketing the
-- mode of the automatic analyses and how many jobs wait; for the admin also the
-- cost, the limit, the notes switch and the last error.
create function public.marketing_lavori_situazione()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.marketing_lavori_stato;
  v_ruolo public.app_role := public.current_role();
  v_costo numeric := public.marketing_costo_mese();
  v_automatiche text;
  v_risposta jsonb;
begin
  if v_ruolo is null or v_ruolo not in ('admin', 'editor', 'marketing') then
    raise exception 'La situazione delle analisi è dell’area Marketing.' using errcode = '42501';
  end if;
  select * into s from public.marketing_lavori_stato x where x.id;
  v_automatiche := case
    when s.ultimo_esito = 'senza_chiave' then 'ferme_chiave'
    when v_costo >= s.costo_max_mese then 'in_pausa_spesa'
    when not s.automatiche then 'spente'
    else 'attive'
  end;
  v_risposta := jsonb_build_object(
    'automatiche', v_automatiche,
    'ultimo_passo_il', s.ultimo_passo_il,
    'in_coda', (select count(*) from public.instagram_letture l where l.stato = 'in_coda')
             + (select count(*) from public.marketing_analisi a where a.stato = 'in_coda'));
  if v_ruolo = 'admin' then
    v_risposta := v_risposta || jsonb_build_object(
      'costo_mese', v_costo, 'costo_max', s.costo_max_mese, 'note_team', s.note_team,
      'automatiche_accese', s.automatiche, 'ultimo_errore', s.ultimo_errore, 'ultimo_tick_il', s.ultimo_tick_il,
      'ultimo_esito', s.ultimo_esito);
  end if;
  return v_risposta;
end;
$$;

revoke all on function public.marketing_analisi_richiedi(text, boolean) from public, anon, authenticated;
grant execute on function public.marketing_analisi_richiedi(text, boolean) to authenticated;
revoke all on function public.marketing_imposta_costo_max(numeric) from public, anon, authenticated;
grant execute on function public.marketing_imposta_costo_max(numeric) to authenticated;
revoke all on function public.marketing_imposta_interruttori(boolean, boolean) from public, anon, authenticated;
grant execute on function public.marketing_imposta_interruttori(boolean, boolean) to authenticated;
revoke all on function public.marketing_lavori_situazione() from public, anon, authenticated;
grant execute on function public.marketing_lavori_situazione() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The service role: the address, the outcome without a step
-- ---------------------------------------------------------------------------
create function public.marketing_imposta_url(p_url text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.marketing_lavori_stato s set url_passo = p_url where s.id;
end;
$$;

-- Without ANTHROPIC_API_KEY the route takes no step: the outcome is written
-- here, so that the page can say so.
create function public.marketing_segna_esito(p_esito text, p_errore text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_esito is null or p_esito not in ('ok', 'parziale', 'fallito', 'senza_chiave', 'limite_spesa', 'limite_fornitore') then
    raise exception 'Esito non valido.' using errcode = '22023';
  end if;
  update public.marketing_lavori_stato s
  set ultimo_esito = p_esito, ultimo_errore = nullif(left(btrim(coalesce(p_errore, '')), 300), ''),
      ultimo_passo_il = now()
  where s.id;
end;
$$;

revoke all on function public.marketing_imposta_url(text) from public, anon, authenticated;
grant execute on function public.marketing_imposta_url(text) to service_role;
revoke all on function public.marketing_segna_esito(text, text) from public, anon, authenticated;
grant execute on function public.marketing_segna_esito(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. The planner: what to do next, and when
-- ---------------------------------------------------------------------------

-- The automatic work: new readings and automatic analyses. With `automatiche`
-- off nothing is created (R14). Everything with on conflict do nothing.
create function public.marketing_pianifica()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.marketing_lavori_stato;
  r record;
  n jsonb;
  v_ok boolean;
  v_permesso boolean;
begin
  select * into s from public.marketing_lavori_stato x where x.id;
  if not s.automatiche then
    return;
  end if;

  -- 1. new readings: complete up to 28 days, the speech only from 29 to 90
  insert into public.instagram_letture (media_id, richiesta, motivo, priorita)
  select i.media_id,
         case when i.pubblicato_il >= now() - interval '28 days' then 'completa' else 'trascrizione' end,
         case when i.pubblicato_il >= now() - interval '28 days' then 'automatica' else 'recupero' end,
         case when i.pubblicato_il >= now() - interval '28 days' then 1 else 0 end
  from public.instagram_contenuti i
  where (i.reel or i.media_type = 'VIDEO') and i.eliminato_il is null
    and i.pubblicato_il >= now() - interval '90 days'
    and not exists (select 1 from public.instagram_letture l where l.media_id = i.media_id)
  on conflict (media_id) do nothing;

  -- 2. automatic analyses: 3 days when there is the comparison (waiting for the leads until 108 hours), else 14 days
  select coalesce(st.permesso_insights, false) into v_permesso from public.instagram_contenuti_stato st where st.id;
  if v_permesso then
    for r in
      select i.media_id, floor(extract(epoch from (now() - i.pubblicato_il)) / 3600)::integer as ore
      from public.instagram_contenuti i
      where (i.reel or i.media_type = 'VIDEO') and i.eliminato_il is null
        and i.pubblicato_il >= now() - interval '672 hours' and i.pubblicato_il <= now() - interval '72 hours'
        and not exists (select 1 from public.marketing_analisi a
                        where a.media_id = i.media_id and (a.motivo = 'automatica' or a.stato in ('in_coda', 'in_corso', 'pronta')))
        and exists (select 1 from public.instagram_letture l
                    where l.media_id = i.media_id
                      and (l.stato in ('fatta', 'fallita') or (l.stato = 'in_coda' and l.created_at < now() - interval '48 hours')))
    loop
      n := public.analisi_numeri_reel(r.media_id);
      v_ok := false;
      if n is not null then
        if r.ore < 336 then
          v_ok := (n ->> 'confronto') = 'stessa_eta' and (n ->> 'eta_confronto') = '3' and n ->> 'views' is not null
                  and ((n -> 'lead' ->> 'contati')::boolean or r.ore >= 108);
        else
          v_ok := (n ->> 'confronto') = 'vita_intera' and n ->> 'views' is not null;
        end if;
      end if;
      if v_ok then
        insert into public.marketing_analisi (media_id, motivo, periodo_da, periodo_a)
        values (r.media_id, 'automatica', public.oggi() - 28, public.oggi() - 1)
        on conflict do nothing;
      end if;
    end loop;
  end if;
end;
$$;

-- The next job that is due, in this order (a single query over a union): the
-- readings asked by a person; the analyses asked by a person whose reading is
-- not going; then, only with the automatic work on, between 00:00 and 10:00
-- (Rome; p_adesso is only for the tests) and within the daily limits, the automatic readings (the newest
-- reel first), the automatic analyses (the oldest reel first) and the
-- recovery readings (60 a day at most). Nothing while the lease is taken, an
-- Insight run is active, or the month's cost has reached the limit.
create function public.marketing_scegli_lavoro(p_adesso timestamptz default now())
returns table (cosa text, rif text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.marketing_lavori_stato;
  v_inizio_oggi timestamptz := public.oggi()::timestamp at time zone 'Europe/Rome';
  v_finestra boolean := extract(hour from (p_adesso at time zone 'Europe/Rome')) < 10;
  v_auto boolean;
  v_letture_auto integer;
  v_recuperi integer;
begin
  select * into s from public.marketing_lavori_stato x where x.id;
  if s.lease_fino_al is not null and s.lease_fino_al > now() then
    return;
  end if;
  if exists (select 1 from public.insight_esecuzioni e where e.stato in ('in_coda', 'in_corso')) then
    return;
  end if;
  if public.marketing_costo_mese() >= s.costo_max_mese then
    return;
  end if;

  v_auto := s.automatiche and v_finestra;
  select count(*) into v_letture_auto from public.instagram_letture l
  where l.motivo = 'automatica' and l.iniziata_il >= v_inizio_oggi;
  select count(*) into v_recuperi from public.instagram_letture l
  where l.motivo = 'recupero' and l.iniziata_il >= v_inizio_oggi;

  return query
  select u.cosa, u.rif
  from (
    select 1 as o, 'lettura'::text as cosa, l.media_id as rif, extract(epoch from l.created_at) as k
    from public.instagram_letture l
    where l.stato = 'in_coda' and l.priorita = 2 and l.tentativi < 3 and (l.prossimo_il is null or l.prossimo_il <= now())
    union all
    select 2, 'analisi', a.id::text, extract(epoch from a.created_at)
    from public.marketing_analisi a
    where a.stato = 'in_coda' and a.motivo = 'richiesta' and a.tentativi < 3 and (a.prossimo_il is null or a.prossimo_il <= now())
      and not exists (select 1 from public.instagram_letture l where l.media_id = a.media_id and l.stato in ('in_coda', 'in_corso'))
    union all
    select 3, 'lettura', l.media_id, -extract(epoch from i.pubblicato_il)
    from public.instagram_letture l join public.instagram_contenuti i on i.media_id = l.media_id
    where v_auto and v_letture_auto < 30
      and l.stato = 'in_coda' and l.priorita = 1 and l.tentativi < 3 and (l.prossimo_il is null or l.prossimo_il <= now())
    union all
    select 4, 'analisi', a.id::text, extract(epoch from i.pubblicato_il)
    from public.marketing_analisi a join public.instagram_contenuti i on i.media_id = a.media_id
    where v_auto
      and a.stato = 'in_coda' and a.motivo = 'automatica' and a.tentativi < 3 and (a.prossimo_il is null or a.prossimo_il <= now())
      and not exists (select 1 from public.instagram_letture l where l.media_id = a.media_id and l.stato in ('in_coda', 'in_corso'))
    union all
    select 5, 'lettura', l.media_id, -extract(epoch from i.pubblicato_il)
    from public.instagram_letture l join public.instagram_contenuti i on i.media_id = l.media_id
    where v_auto and v_recuperi < 60
      and l.stato = 'in_coda' and l.priorita = 0 and l.tentativi < 3 and (l.prossimo_il is null or l.prossimo_il <= now())
  ) u
  order by u.o, u.k
  limit 1;
end;
$$;

create function public.marketing_c_e_lavoro()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.marketing_scegli_lavoro());
$$;

-- pg_net posts to the step URL with the Vault key of the steps (the same as
-- the Insight's), after the transaction commits. Nothing without a URL or a key.
create function public.marketing_dispatch()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_chiave text;
begin
  select s.url_passo into v_url from public.marketing_lavori_stato s where s.id;
  if v_url is null then
    return false;
  end if;
  select d.decrypted_secret into v_chiave from vault.decrypted_secrets d where d.name = 'insight_chiave';
  if v_chiave is null or v_chiave = '' then
    raise warning 'marketing_dispatch: manca la chiave dei passi';
    return false;
  end if;
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_chiave),
    timeout_milliseconds := 20000);
  update public.marketing_lavori_stato s set inviata_il = now() where s.id;
  return true;
end;
$$;

-- Wakes the chain from the route (a request of a person): if the lease is
-- free and there is something due, dispatch.
create function public.marketing_sveglia()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if public.marketing_c_e_lavoro() then
    perform public.marketing_dispatch();
  end if;
end;
$$;

-- pg_cron, every 5 minutes at 2, 7, 12... (the Insight's tick runs at 0, 5,
-- 10...), as postgres. Never raises: each step in its own block.
create function public.marketing_tick()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.marketing_lavori_stato;
  r record;
begin
  begin
    update public.marketing_lavori_stato x set ultimo_tick_il = now() where x.id;
  exception when others then
    raise warning 'marketing_tick: ultimo tick non salvato (%)', sqlstate;
  end;

  -- the turn of the month (Rome): counters and cost to zero, and a stop for the limit lifts (R4)
  begin
    update public.marketing_lavori_stato x
    set mese = date_trunc('month', public.oggi())::date,
        token_input = 0, token_cache_scritti = 0, token_cache_letti = 0, token_output = 0,
        secondi_audio = 0, costo_mese_usd = 0,
        ultimo_esito = case when x.ultimo_esito = 'limite_spesa' then null else x.ultimo_esito end
    where x.id and x.mese <> date_trunc('month', public.oggi())::date;
  exception when others then
    raise warning 'marketing_tick: cambio di mese non riuscito (%)', sqlstate;
  end;

  -- the watchdog: an expired lease is a dead invocation; a job left in_corso
  -- without a lease for 10 minutes was lost between its end and the lease's release
  begin
    select * into s from public.marketing_lavori_stato x where x.id;
    if s.lease_fino_al is not null and s.lease_fino_al < now() then
      update public.marketing_lavori_stato x
      set lease_fino_al = null, passo_id = null, passo_cosa = null, passo_rif = null where x.id;
    end if;
    for r in
      select l.media_id as rif, 'lettura'::text as cosa, l.tentativi from public.instagram_letture l
      where l.stato = 'in_corso' and l.iniziata_il < now() - interval '10 minutes'
        and (s.passo_rif is distinct from l.media_id or s.lease_fino_al is null or s.lease_fino_al < now())
      union all
      select a.id::text, 'analisi', a.tentativi from public.marketing_analisi a
      where a.stato = 'in_corso' and a.iniziata_il < now() - interval '10 minutes'
        and (s.passo_rif is distinct from a.id::text or s.lease_fino_al is null or s.lease_fino_al < now())
    loop
      if r.cosa = 'lettura' then
        update public.instagram_letture l
        set tentativi = l.tentativi + 1,
            stato = case when l.tentativi + 1 >= 3 then 'fallita' else 'in_coda' end,
            errore = case when l.tentativi + 1 >= 3
                          then 'Interrotta: il server non ha finito il lavoro. Riprova.' end
        where l.media_id = r.rif;
      else
        update public.marketing_analisi a
        set tentativi = a.tentativi + 1,
            stato = case when a.tentativi + 1 >= 3 then 'fallita'::public.analisi_stato else 'in_coda'::public.analisi_stato end,
            errore = case when a.tentativi + 1 >= 3 then 'Interrotta: il server non ha finito il lavoro. Riprova.' end,
            finita_il = case when a.tentativi + 1 >= 3 then now() end
        where a.id = r.rif::uuid;
      end if;
    end loop;
  exception when others then
    raise warning 'marketing_tick: controllo dei lavori non riuscito (%)', sqlstate;
  end;

  -- the automatic work
  begin
    perform public.marketing_pianifica();
  exception when others then
    raise warning 'marketing_tick: pianificazione non riuscita (%)', sqlstate;
  end;

  -- dispatch: the lease is free, nothing was sent in the last 2 minutes, there is work due;
  -- without a key of Claude (ultimo_esito senza_chiave) at most once an hour
  begin
    select * into s from public.marketing_lavori_stato x where x.id;
    if (s.lease_fino_al is null or s.lease_fino_al < now())
       and (s.inviata_il is null or s.inviata_il < now() - interval '2 minutes')
       and (s.ultimo_esito is distinct from 'senza_chiave' or s.ultimo_passo_il is null
            or s.ultimo_passo_il < now() - interval '60 minutes')
       and public.marketing_c_e_lavoro() then
      perform public.marketing_dispatch();
    end if;
  exception when others then
    raise warning 'marketing_tick: invio non riuscito (%)', sqlstate;
  end;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. The steps (the route, service role)
-- ---------------------------------------------------------------------------
-- Takes the next job with a lease, atomically: no row when the lease is taken,
-- an Insight run is active, the limit is reached or nothing is due.
create function public.marketing_prendi_passo(p_secondi integer default 330)
returns table (passo uuid, cosa text, rif text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_secondi integer := coalesce(p_secondi, 330);
  s public.marketing_lavori_stato;
  v record;
  v_passo uuid;
begin
  if v_secondi < 1 or v_secondi > 3600 then
    raise exception 'Durata del passo non valida' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('alpha.marketing_lavori', 0));
  select * into s from public.marketing_lavori_stato x where x.id for update;

  if s.lease_fino_al is not null and s.lease_fino_al > now() then
    return;
  end if;
  if public.marketing_costo_mese() >= s.costo_max_mese then
    update public.marketing_lavori_stato x set ultimo_esito = 'limite_spesa' where x.id;
    return;
  end if;
  select w.cosa, w.rif into v from public.marketing_scegli_lavoro() w limit 1;
  if not found then
    return;
  end if;

  v_passo := gen_random_uuid();
  if v.cosa = 'lettura' then
    update public.instagram_letture l set stato = 'in_corso', iniziata_il = now() where l.media_id = v.rif;
  else
    update public.marketing_analisi a set stato = 'in_corso', iniziata_il = now() where a.id = v.rif::uuid;
  end if;
  update public.marketing_lavori_stato x
  set lease_fino_al = now() + make_interval(secs => v_secondi), passo_id = v_passo,
      passo_cosa = v.cosa, passo_rif = v.rif
  where x.id;

  passo := v_passo;
  cosa := v.cosa;
  rif := v.rif;
  return next;
end;
$$;

-- The end of a reading. p_esito: {stato: fatta | fallita | in_coda, ...columns...}. Only from in_corso.
--  - fatta: the results (every key given is written, a JSON null empties it)
--  - fallita: the sentence of the error
--  - in_coda: «resume» (the time ran out after the speech: the results already
--    obtained stay; one resume without an attempt per reading, the second counts)
--    or a retry that counts (tentativo true, with prossimo_il); at 3 attempts it fails
create function public.marketing_lettura_fine(p_media_id text, p_esito jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  l public.instagram_letture;
  e jsonb := coalesce(p_esito, '{}'::jsonb);
  v_stato text := e ->> 'stato';
  v_tentativi integer;
  v_ripresa boolean;
  v_errore text := left(btrim(coalesce(e ->> 'errore', '')), 300);
begin
  if jsonb_typeof(e) <> 'object' or v_stato is null or v_stato not in ('fatta', 'fallita', 'in_coda') then
    raise exception 'Esito della lettura non valido.' using errcode = '22023';
  end if;
  select * into l from public.instagram_letture x where x.media_id = p_media_id for update;
  if not found or l.stato <> 'in_corso' then
    return false;
  end if;

  v_tentativi := l.tentativi;
  v_ripresa := l.ripresa_usata;
  if v_stato = 'in_coda' then
    if coalesce((e ->> 'tentativo')::boolean, false) then
      v_tentativi := v_tentativi + 1;
    elsif not v_ripresa then
      v_ripresa := true;
    else
      v_tentativi := v_tentativi + 1;
    end if;
    if v_tentativi >= 3 then
      v_stato := 'fallita';
      if v_errore = '' then
        v_errore := 'Il reel è troppo lungo da leggere in un passo: riprova.';
      end if;
    end if;
  elsif v_stato = 'fallita' then
    v_tentativi := v_tentativi + 1;
    if v_errore = '' then
      v_errore := 'La lettura non è riuscita: riprova.';
    end if;
  end if;

  update public.instagram_letture x
  set stato = v_stato,
      tentativi = least(v_tentativi, 5),
      ripresa_usata = v_ripresa,
      prossimo_il = case when v_stato = 'in_coda' then (e ->> 'prossimo_il')::timestamptz end,
      errore = case when v_stato = 'fallita' then v_errore end,
      letta_il = case when v_stato = 'fatta' then now() else x.letta_il end,
      video = case when e ? 'video' then e ->> 'video' else x.video end,
      ha_audio = case when e ? 'ha_audio' then (e ->> 'ha_audio')::boolean else x.ha_audio end,
      trascrizione_esito = case when e ? 'trascrizione_esito' then e ->> 'trascrizione_esito' else x.trascrizione_esito end,
      trascrizione = case when e ? 'trascrizione' then e ->> 'trascrizione' else x.trascrizione end,
      segmenti = case when e ? 'segmenti' then nullif(e -> 'segmenti', 'null'::jsonb) else x.segmenti end,
      gancio_parlato = case when e ? 'gancio_parlato' then e ->> 'gancio_parlato' else x.gancio_parlato end,
      modello_trascrizione = case when e ? 'modello_trascrizione' then e ->> 'modello_trascrizione' else x.modello_trascrizione end,
      visione_esito = case when e ? 'visione_esito' then e ->> 'visione_esito' else x.visione_esito end,
      fonte_visione = case when e ? 'fonte_visione' then e ->> 'fonte_visione' else x.fonte_visione end,
      scheda = case when e ? 'scheda' then nullif(e -> 'scheda', 'null'::jsonb) else x.scheda end,
      fotogrammi = case when e ? 'fotogrammi' then (e ->> 'fotogrammi')::smallint else x.fotogrammi end,
      lato_px = case when e ? 'lato_px' then (e ->> 'lato_px')::smallint else x.lato_px end,
      modello_visione = case when e ? 'modello_visione' then e ->> 'modello_visione' else x.modello_visione end,
      versione_prompt_visione = case when e ? 'versione_prompt_visione' then e ->> 'versione_prompt_visione' else x.versione_prompt_visione end
  where x.media_id = p_media_id;

  update public.instagram_contenuti i
  set durata_ms = case when e ? 'durata_ms' and (e ->> 'durata_ms')::integer > 0 then (e ->> 'durata_ms')::integer else i.durata_ms end,
      audio_tipo = case when e ->> 'audio_tipo' in ('MUSIC', 'ORIGINAL_SOUND') then e ->> 'audio_tipo' else i.audio_tipo end,
      video_disponibile = case when e ? 'video_disponibile' then (e ->> 'video_disponibile')::boolean else i.video_disponibile end
  where i.media_id = p_media_id;
  return true;
end;
$$;

-- The end of an analysis. Only from in_corso.
--  - pronta: the validated output; keeps the last 3 ready ones of the reel and
--    deletes the others, never one an idea of which is in the calendar
--  - fallita: the sentence of the error
--  - in_coda: with p_riprova_il the retry counts an attempt (3: it fails); without
--    it the time ran out before Claude was asked, no attempt
create function public.marketing_analisi_fine(
  p_id uuid, p_stato text, p_numeri jsonb, p_contenuto jsonb, p_fonti jsonb,
  p_modello text, p_versione text, p_errore text, p_riprova_il timestamptz default null)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.marketing_analisi;
  v_stato text := p_stato;
  v_tentativi integer;
  v_errore text := left(btrim(coalesce(p_errore, '')), 300);
begin
  if p_stato is null or p_stato not in ('pronta', 'fallita', 'in_coda') then
    raise exception 'Esito dell’analisi non valido.' using errcode = '22023';
  end if;
  select * into a from public.marketing_analisi x where x.id = p_id for update;
  if not found or a.stato <> 'in_corso' then
    return false;
  end if;

  v_tentativi := a.tentativi;
  if v_stato = 'in_coda' and p_riprova_il is not null then
    v_tentativi := v_tentativi + 1;
    if v_tentativi >= 3 then
      v_stato := 'fallita';
    end if;
  elsif v_stato = 'fallita' then
    v_tentativi := v_tentativi + 1;
  end if;
  if v_stato = 'fallita' and v_errore = '' then
    v_errore := 'L’analisi non è riuscita: riprova.';
  end if;
  if v_stato = 'pronta' and (p_contenuto is null or jsonb_typeof(p_contenuto) <> 'object') then
    raise exception 'L’analisi pronta ha un contenuto.' using errcode = '22023';
  end if;

  update public.marketing_analisi x
  set stato = v_stato::public.analisi_stato,
      tentativi = least(v_tentativi, 5),
      prossimo_il = case when v_stato = 'in_coda' then p_riprova_il end,
      errore = case when v_stato = 'fallita' then v_errore end,
      finita_il = case when v_stato in ('pronta', 'fallita') then now() end,
      contenuto = case when v_stato = 'pronta' then p_contenuto end,
      numeri = case when v_stato = 'pronta' then p_numeri else x.numeri end,
      fonti = case when v_stato = 'pronta' then p_fonti else x.fonti end,
      modello = case when v_stato = 'pronta' then left(p_modello, 80) else x.modello end,
      versione_prompt = case when v_stato = 'pronta' then left(p_versione, 40) else x.versione_prompt end,
      verdetto = case when p_numeri ->> 'verdetto' in ('spingere', 'mantenere', 'cambiare') then p_numeri ->> 'verdetto' else x.verdetto end,
      eta_ore = case when (p_numeri ->> 'eta_ore') ~ '^[0-9]{1,4}$' then least((p_numeri ->> 'eta_ore')::integer, 9600) else x.eta_ore end,
      eta_confronto = case when p_numeri ->> 'eta_confronto' in ('3', '7') then (p_numeri ->> 'eta_confronto')::smallint else x.eta_confronto end
  where x.id = p_id;

  if v_stato = 'pronta' then
    delete from public.marketing_analisi d
    where d.media_id = a.media_id and d.stato = 'pronta'
      and d.id not in (select k.id from public.marketing_analisi k
                       where k.media_id = a.media_id and k.stato = 'pronta'
                       order by k.finita_il desc, k.created_at desc limit 3)
      and not exists (select 1 from public.marketing_contenuti m where m.da_analisi = d.id);
  end if;
  return true;
end;
$$;

-- The end of a step: the counters are added up (only the known keys, integers
-- from 0), the cost of the month is recomputed in SQL from the tokens and the
-- seconds of audio, the lease is freed, and the next step is dispatched if
-- there is work. Only the step that holds the lease; false otherwise.
create function public.marketing_passo_finito(p_passo uuid, p_esito text, p_contatori jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.marketing_lavori_stato;
  c jsonb := coalesce(p_contatori, '{}'::jsonb);
  v_oggi_mese date := date_trunc('month', public.oggi())::date;
  chiave text;
begin
  if p_esito is null or p_esito not in ('ok', 'parziale', 'fallito', 'senza_chiave', 'limite_spesa', 'limite_fornitore') then
    raise exception 'Esito non valido.' using errcode = '22023';
  end if;
  if jsonb_typeof(c) <> 'object' then
    raise exception 'Contatori non validi.' using errcode = '22023';
  end if;
  for chiave in select k from jsonb_object_keys(c) as k loop
    if chiave in ('input', 'cache_scritti', 'cache_letti', 'output', 'secondi_audio')
       and (jsonb_typeof(c -> chiave) <> 'number' or (c ->> chiave) !~ '^[0-9]{1,12}$') then
      raise exception 'Contatore non valido: %', chiave using errcode = '22023';
    end if;
  end loop;

  select * into s from public.marketing_lavori_stato x where x.id for update;
  if s.passo_id is distinct from p_passo then
    return false;
  end if;

  -- a step that ends in a new month starts the new month's counters first
  if s.mese <> v_oggi_mese then
    update public.marketing_lavori_stato x
    set mese = v_oggi_mese, token_input = 0, token_cache_scritti = 0, token_cache_letti = 0, token_output = 0,
        secondi_audio = 0, costo_mese_usd = 0
    where x.id;
  end if;

  update public.marketing_lavori_stato x
  set token_input = x.token_input + coalesce((c ->> 'input')::bigint, 0),
      token_cache_scritti = x.token_cache_scritti + coalesce((c ->> 'cache_scritti')::bigint, 0),
      token_cache_letti = x.token_cache_letti + coalesce((c ->> 'cache_letti')::bigint, 0),
      token_output = x.token_output + coalesce((c ->> 'output')::bigint, 0),
      secondi_audio = x.secondi_audio + coalesce((c ->> 'secondi_audio')::integer, 0)
  where x.id;
  update public.marketing_lavori_stato x
  set costo_mese_usd = round(
        public.insight_costo_usd(x.token_input, x.token_cache_scritti, x.token_cache_letti, x.token_output)
        + x.secondi_audio * 0.111 / 3600.0, 4),
      ultimo_passo_il = now(),
      ultimo_esito = p_esito,
      ultimo_errore = case when p_esito in ('ok', 'parziale') then null else x.ultimo_errore end,
      lease_fino_al = null, passo_id = null, passo_cosa = null, passo_rif = null
  where x.id;

  -- a rate limit of the provider stops the chain: the tick starts it again in 5 minutes
  if p_esito <> 'limite_fornitore' and public.marketing_c_e_lavoro() then
    perform public.marketing_dispatch();
  end if;
  return true;
end;
$$;

revoke all on function public.marketing_prendi_passo(integer) from public, anon, authenticated;
grant execute on function public.marketing_prendi_passo(integer) to service_role;
revoke all on function public.marketing_lettura_fine(text, jsonb) from public, anon, authenticated;
grant execute on function public.marketing_lettura_fine(text, jsonb) to service_role;
revoke all on function public.marketing_analisi_fine(uuid, text, jsonb, jsonb, jsonb, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.marketing_analisi_fine(uuid, text, jsonb, jsonb, jsonb, text, text, text, timestamptz)
  to service_role;
revoke all on function public.marketing_passo_finito(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.marketing_passo_finito(uuid, text, jsonb) to service_role;
revoke all on function public.marketing_sveglia() from public, anon, authenticated;
grant execute on function public.marketing_sveglia() to service_role;
revoke all on function public.marketing_tick() from public, anon, authenticated, service_role;
revoke all on function public.marketing_pianifica() from public, anon, authenticated, service_role;
revoke all on function public.marketing_scegli_lavoro(timestamptz) from public, anon, authenticated, service_role;
revoke all on function public.marketing_c_e_lavoro() from public, anon, authenticated, service_role;
revoke all on function public.marketing_dispatch() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. What reaches Claude
-- ---------------------------------------------------------------------------
-- The names to blank in every text that reaches Claude and in every text that
-- comes back: leads, clients and the team who is not an active admin (Dany is
-- the brand), their handles, and the people of the DM chats of the Insight of the
-- last 30 days. At most 5000, lower case, 3 characters or more. Server only.
create function public.marketing_da_oscurare()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_oscurare jsonb;
begin
  -- names to blank in every text: leads, clients and the team who is not an active admin (Dany is the brand)
  select coalesce(jsonb_agg(distinct n.nome), '[]'::jsonb) into v_oscurare
  from (
    select lower(btrim(x)) as nome from (
      select l.nome as x from public.leads l where l.created_at >= now() - interval '180 days'
      union all select ltrim(l.instagram_handle, '@') from public.leads l where l.created_at >= now() - interval '180 days'
      union all select c.nome from public.clients c
      union all select c.cognome from public.clients c
      union all select btrim(coalesce(c.nome, '') || ' ' || coalesce(c.cognome, '')) from public.clients c
      union all select ltrim(c.instagram_handle, '@') from public.clients c
      union all select p.nome from public.profiles p where not (p.ruolo = 'admin' and p.attivo)
      union all select h.nome from public.insight_chat h where h.letta_il >= now() - interval '30 days'
      union all select h.username from public.insight_chat h where h.letta_il >= now() - interval '30 days'
    ) q
    where x is not null and char_length(btrim(x)) >= 3
    limit 5000
  ) n;
  return v_oscurare;
end;
$$;

revoke all on function public.marketing_da_oscurare() from public, anon, authenticated;
grant execute on function public.marketing_da_oscurare() to service_role;

-- The only place that decides what leaves for Claude (service role only): the
-- medians of the account, the best and the worst reels of the period, the
-- contents already in the calendar and, with `note_team` on, the answers of the
-- setter about the days (what kept the leads from booking, their questions),
-- the reasons of non-closure of the closer and the themes of the DMs of the
-- Insight, without names. `da_oscurare` (names of leads, clients and of the
-- team who are not admin) stays on the server and is used to blank the texts.
-- With `note_team` off those keys do not exist at all (not empty), so neither
-- Claude nor a log sees them. Never: setter_id, «Altre note», calls.note,
-- importi, the leads' contacts.
create function public.marketing_fonti_analisi(p_da date, p_a date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.marketing_lavori_stato;
  v_note boolean;
  v_risposta jsonb;
  v_reel jsonb;
  v_migliori jsonb;
  v_peggiori jsonb;
  v_oscurare jsonb;
begin
  if p_da is null or p_a is null or p_a < p_da or p_a - p_da > 366 then
    raise exception 'Periodo non valido.' using errcode = '22023';
  end if;
  select * into s from public.marketing_lavori_stato x where x.id;
  v_note := s.note_team;

  -- the best and the worst reels of the period by views against the median at their age
  select coalesce(jsonb_agg(to_jsonb(q)), '[]'::jsonb) into v_reel
  from (
    select i.media_id,
           (public.analisi_numeri_reel(i.media_id) ->> 'views_rapporto')::numeric as rapporto,
           nullif(left(btrim(coalesce(l.gancio_parlato, split_part(coalesce(i.didascalia, ''), E'\n', 1))), 200), '') as gancio,
           (select n.in_target_14g from public.v_instagram_numeri n where n.media_id = i.media_id) as tg
    from public.instagram_contenuti i
    left join public.instagram_letture l on l.media_id = i.media_id
    where (i.reel or i.media_type = 'VIDEO') and i.eliminato_il is null
      and (i.pubblicato_il at time zone 'Europe/Rome')::date between p_da and p_a
  ) q;
  select coalesce(jsonb_agg(jsonb_build_object('gancio', t.gancio, 'views_rapporto', t.rapporto, 'in_target', t.tg)), '[]'::jsonb)
  into v_migliori
  from (select * from jsonb_to_recordset(v_reel) as x(media_id text, rapporto numeric, gancio text, tg integer)
        where rapporto is not null order by rapporto desc limit 5) t;
  select coalesce(jsonb_agg(jsonb_build_object('gancio', t.gancio, 'views_rapporto', t.rapporto, 'in_target', t.tg)), '[]'::jsonb)
  into v_peggiori
  from (select * from jsonb_to_recordset(v_reel) as x(media_id text, rapporto numeric, gancio text, tg integer)
        where rapporto is not null order by rapporto asc limit 5) t;

  v_risposta := jsonb_build_object(
    'note_del_team', case when v_note then 'accese' else 'spente' end,
    'account', jsonb_build_object(
      'reel_nel_periodo', jsonb_array_length(v_reel),
      'mediane', jsonb_build_object(
        'a_3_giorni', (select jsonb_build_object(
            'views', percentile_cont(0.5) within group (order by n.views_3g),
            'tasso_salvataggio', percentile_cont(0.5) within group (order by case when n.reach_3g > 0 then round(n.saved_3g::numeric / n.reach_3g, 4) end),
            'quota_vista', percentile_cont(0.5) within group (order by n.visione_su_durata))
          from public.v_instagram_numeri n
          where not n.eliminato and (n.reel or n.media_type = 'VIDEO') and n.giorno >= public.oggi() - 90),
        'a_7_giorni', (select jsonb_build_object('views', percentile_cont(0.5) within group (order by n.views_7g))
          from public.v_instagram_numeri n
          where not n.eliminato and (n.reel or n.media_type = 'VIDEO') and n.giorno >= public.oggi() - 90)),
      'migliori', v_migliori,
      'peggiori', v_peggiori),
    'in_calendario', (
      select coalesce(jsonb_agg(jsonb_build_object('name', m.nome, 'reel_type', m.reel_type, 'format', m.formato, 'status', m.stato)), '[]'::jsonb)
      from (select * from public.marketing_contenuti c where c.stato not in ('posted', 'canceled')
            order by c.post_date desc nulls last, c.created_at desc limit 40) m));

  if v_note then
    v_risposta := v_risposta || jsonb_build_object(
      'commenti_setter', jsonb_build_object(
        'scale', jsonb_build_object(
          'lead_in_target', (select coalesce(jsonb_object_agg(x.v, x.n), '{}'::jsonb)
                             from (select d.lead_in_target::text as v, count(*) as n from public.setter_daily_reports d
                                   where d.data between p_da and p_a and d.lead_in_target is not null group by 1) x),
          'qualita_conversazioni', (select coalesce(jsonb_object_agg(x.v, x.n), '{}'::jsonb)
                                    from (select d.qualita_conversazioni::text as v, count(*) as n from public.setter_daily_reports d
                                          where d.data between p_da and p_a and d.qualita_conversazioni is not null group by 1) x)),
        'testi', (select coalesce(jsonb_agg(jsonb_build_object('giorno', t.data, 'domanda', t.domanda, 'testo', t.testo) order by t.data desc), '[]'::jsonb)
                  from (select * from (
                          select d.data, 'cosa frenava'::text as domanda, left(d.cosa_frenava, 300) as testo
                          from public.setter_daily_reports d
                          where d.data between p_da and p_a and public.testo_scritto(d.cosa_frenava)
                          union all
                          select d.data, 'domande e contenuti', left(d.domande_contenuti, 300)
                          from public.setter_daily_reports d
                          where d.data between p_da and p_a and public.testo_scritto(d.domande_contenuti)
                        ) u order by u.data desc limit 40) t)),
      'motivi_closer', (
        select coalesce(jsonb_agg(jsonb_build_object('giorno', t.g, 'esito', t.esito, 'qualificata', t.qualificata,
                                                     'motivo', t.motivo, 'note', t.note) order by t.g desc), '[]'::jsonb)
        from (select (c.programmata_il at time zone 'Europe/Rome')::date as g, c.esito::text as esito, c.qualificata,
                     left(c.obiezione_principale, 300) as motivo, left(c.note_closer, 300) as note
              from public.calls c
              where c.stato = 'svolta' and c.esito in ('follow_up', 'persa')
                and (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
                and (public.testo_scritto(c.obiezione_principale) or public.testo_scritto(c.note_closer))
              order by c.programmata_il desc limit 30) t),
      'temi_dm', (
        select coalesce(jsonb_agg(jsonb_build_object('tema', t.tema ->> 'theme', 'quanti', (t.tema ->> 'count')::integer,
                                                     'in_target', (t.tema ->> 'target_count')::integer,
                                                     'call', (t.tema ->> 'calls')::integer, 'tendenza', t.tema ->> 'trend')), '[]'::jsonb)
        from (select jsonb_array_elements(coalesce(rc.dati -> 'content' -> 'themes', '[]'::jsonb)) as tema
              from (select x.dati from public.insight_recap x
                    where x.canale = 'instagram' and x.giorno between p_da and p_a
                    order by x.giorno desc limit 1) rc
              limit 8) t
        where jsonb_typeof(t.tema) = 'object' and t.tema ->> 'theme' is not null));
  end if;

  v_oscurare := public.marketing_da_oscurare();
  return v_risposta || jsonb_build_object('da_oscurare', v_oscurare);
end;
$$;

revoke all on function public.marketing_fonti_analisi(date, date) from public, anon, authenticated;
grant execute on function public.marketing_fonti_analisi(date, date) to service_role;

-- ---------------------------------------------------------------------------
-- 9. The view of the page
-- ---------------------------------------------------------------------------
-- One row per reel (Reel or VIDEO): the media, its content in the calendar,
-- the numbers, the comparison and the verdict of today (analisi_numeri_reel
-- is evaluated only for the rows the page asks for), the leads, the reading
-- and the last analysis.
create view public.v_analisi_reel with (security_invoker = true) as
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
cross join lateral (select public.analisi_numeri_reel(n.media_id) as num) a
where n.reel or n.media_type = 'VIDEO';

revoke all on function public.analisi_numeri_reel(text, smallint) from anon;
revoke all on public.v_analisi_reel from anon;

-- ---------------------------------------------------------------------------
-- 10. The scheduler
-- ---------------------------------------------------------------------------
-- Every 5 minutes at 2, 7, 12... (sfasato: the Insight's tick is at 0, 5, 10...).
select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'marketing-tick';
select cron.schedule('marketing-tick', '2-59/5 * * * *', 'select public.marketing_tick()');

-- ---------------------------------------------------------------------------
-- 11. Comments
-- ---------------------------------------------------------------------------
comment on function public.analisi_numeri_reel(text, smallint) is
  'The numbers of a reel at its age against the comparison reels (the 90 days before it, at least 8) and its verdict: spingere, mantenere or cambiare, decided here. Ages in hours (under 72 none, 3 days to 167, 7 days to 335, the whole life from 336). Leads of the first 3, 7 or 14 days only if the Insight counted them all (null, never 0). Never an amount of money. Claude explains the verdict and never changes it.';
comment on function public.analisi_riepilogo(date, date) is
  'The tiles of the Analisi page: reels of the period, median of views at three days, leads of the first 14 days (and how many reels were not counted), how many say Cambiare today. 42501 outside the Marketing area.';
comment on function public.marketing_analisi_richiedi(text, boolean) is
  'Admin and marketing: asks for the analysis of a reel (10 a day for the team, failed ones included; not above the cost limit); queues the reading too when it is missing, speech only, failed, or p_rileggi. Returns the analysis id.';
comment on function public.marketing_fonti_analisi(date, date) is
  'service_role only: what may reach Claude (medians, best and worst reels, calendar; with note_team on also the setter''s answers, the closer''s reasons and the themes of the DMs) and da_oscurare, the names to blank, which never leaves the server. With note_team off those keys do not exist.';
comment on function public.marketing_tick() is
  'pg_cron every 5 minutes (2, 7, 12...): turn of the month, watchdog, planning of the automatic work, dispatch of the next step. Never raises.';
comment on view public.v_analisi_reel is
  'One row per reel for the Analisi page: media, calendar content, numbers, comparison and verdict of today, leads of the first 14 days (null when not counted), the reading and the last analysis.';
