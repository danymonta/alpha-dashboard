-- The statistics of the posts (1.36.0, «Analisi AI dei reel», CLAUDE.md section
-- 30): views, reach, saves, shares, watch time and the others, read by Meta
-- with the permission instagram_business_manage_insights, kept one photo a day
-- per post so that a three-day-old reel is compared with the other reels at
-- three days, and the followers of the account day by day.
-- Dany, 09/10/2026 («i post di Instagram»), 10/10/2026 (the reel analysis).
--
-- instagram_contenuti already has the statistics columns (20261009130000) and
-- the Insight (1.35.0, 20261014090000) already counts the leads per post and
-- per day of arrival (instagram_contenuti_dm) and says which days it counted
-- (instagram_contenuti_dm_giorni, with the 14-day window of its R2): this file
-- only adds what the reel analysis needs.
--
-- The numbers of a post are written by ONE function, instagram_salva_metriche,
-- for the morning run (lib/instagram/sincronizza-contenuti.ts) and for the
-- Insight (lib/insight/archivio.ts): a post already read stays read, a number
-- Meta did not give stays what it was (never 0 for «missing»), and every
-- reading that gave a number says the permission is there.
--
-- Order: columns, tables, functions, trigger, views, RLS and grants, comments.
-- No updated_at nor created_by on the rows of numbers beyond the table
-- convention: they are written by the run only and say nothing about a person
-- (CLAUDE.md section 17).

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.instagram_contenuti
  -- only VIDEO: false = Meta does not give media_url (licensed music); null = not known yet
  add column video_disponibile boolean,
  -- from the video, when the reel analysis reads it: the API does not give the length
  add column durata_ms integer
    constraint instagram_contenuti_durata check (durata_ms > 0 and durata_ms <= 3600000);

alter table public.instagram_contenuti_stato
  -- null: never tried; false: Meta said the permission is missing
  add column permesso_insights boolean,
  add column permesso_insights_il timestamptz,
  add column metriche_esito text
    constraint instagram_contenuti_stato_metriche_esito
    check (metriche_esito in ('ok', 'parziale', 'senza_permesso', 'fallito')),
  add column metriche_letti integer
    constraint instagram_contenuti_stato_metriche_letti check (metriche_letti >= 0),
  -- {"reel":"completo","feed":"base"}: what Meta gave
  add column metriche_gradini jsonb
    constraint instagram_contenuti_stato_metriche_gradini check (jsonb_typeof(metriche_gradini) = 'object'),
  add column metriche_errore text
    constraint instagram_contenuti_stato_metriche_errore check (char_length(metriche_errore) <= 500),
  add column metriche_fine_il timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------------

-- The numbers of every post, one row per Rome day of reading (the last reading
-- of the day). Written only by the trigger below.
create table public.instagram_contenuti_misure (
  media_id text not null references public.instagram_contenuti (media_id) on delete cascade,
  giorno date not null,
  letto_il timestamptz not null,
  eta_ore numeric(7,1) not null check (eta_ore >= 0),
  views integer check (views >= 0), reach integer check (reach >= 0),
  saved integer check (saved >= 0), shares integer check (shares >= 0),
  likes integer check (likes >= 0), comments integer check (comments >= 0),
  total_interactions integer check (total_interactions >= 0), reposts integer check (reposts >= 0),
  like_count integer check (like_count >= 0), comments_count integer check (comments_count >= 0),
  avg_watch_ms integer check (avg_watch_ms >= 0),
  skip_rate numeric(6,4) check (skip_rate between 0 and 1),
  follows integer check (follows >= 0), profile_visits integer check (profile_visits >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (media_id, giorno)
);
create index instagram_contenuti_misure_eta_idx on public.instagram_contenuti_misure (media_id, eta_ore);

-- The account, one row a day: followers and posts, from the /me the morning run already calls.
create table public.instagram_account_misure (
  giorno date primary key,
  follower integer check (follower >= 0),
  media integer check (media >= 0),
  letto_il timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger instagram_contenuti_misure_set_updated_at before update on public.instagram_contenuti_misure
  for each row execute function public.set_updated_at();
create trigger instagram_account_misure_set_updated_at before update on public.instagram_account_misure
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. The photo of the day: a trigger on the reading
-- ---------------------------------------------------------------------------
-- Every write of metriche_il on a post that is 'lette' (a reading that gave a
-- number) leaves or replaces the row of its Rome day: the last reading of the
-- day wins. Never an error that stops the write of the numbers.
create function public.instagram_contenuti_misura()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if new.metriche_stato = 'lette' and new.metriche_il is not null then
    insert into public.instagram_contenuti_misure as m
      (media_id, giorno, letto_il, eta_ore, views, reach, saved, shares, likes, comments, total_interactions,
       reposts, like_count, comments_count, avg_watch_ms, skip_rate, follows, profile_visits)
    values
      (new.media_id, (new.metriche_il at time zone 'Europe/Rome')::date, new.metriche_il,
       greatest(0, round(extract(epoch from (new.metriche_il - new.pubblicato_il)) / 3600.0, 1)),
       new.views, new.reach, new.saved, new.shares, new.likes, new.comments, new.total_interactions,
       new.reposts, new.like_count, new.comments_count, new.avg_watch_ms, new.skip_rate, new.follows,
       new.profile_visits)
    on conflict (media_id, giorno) do update
      set letto_il = excluded.letto_il, eta_ore = excluded.eta_ore, views = excluded.views, reach = excluded.reach,
          saved = excluded.saved, shares = excluded.shares, likes = excluded.likes, comments = excluded.comments,
          total_interactions = excluded.total_interactions, reposts = excluded.reposts,
          like_count = excluded.like_count, comments_count = excluded.comments_count,
          avg_watch_ms = excluded.avg_watch_ms, skip_rate = excluded.skip_rate, follows = excluded.follows,
          profile_visits = excluded.profile_visits;
  end if;
  return null;
exception when others then
  raise warning 'instagram_contenuti_misura: storico non scritto (%)', sqlstate;
  return null;
end;
$$;

create trigger instagram_contenuti_misura
  after insert or update of metriche_il on public.instagram_contenuti
  for each row execute function public.instagram_contenuti_misura();

-- ---------------------------------------------------------------------------
-- 4. Functions (service role only: the runs)
-- ---------------------------------------------------------------------------

-- A JSON value as an integer of the columns: a number from 0 to 2147483647,
-- rounded; anything else (a string, a negative, too big, null) is null.
create function public.insight_valore_intero(p_valore jsonb)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_valore) = 'number'
         and (p_valore #>> '{}')::numeric between 0 and 2147483647
      then round((p_valore #>> '{}')::numeric)::integer
  end;
$$;

-- skip_rate: Meta may give a percentage (38.5) or a ratio (0.385): above 1 it
-- is divided by 100, then it must be between 0 and 1.
create function public.insight_valore_rapporto(p_valore jsonb)
returns numeric
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_valore) = 'number' and (p_valore #>> '{}')::numeric >= 0 then
      case
        when (p_valore #>> '{}')::numeric <= 1 then round((p_valore #>> '{}')::numeric, 4)
        when (p_valore #>> '{}')::numeric / 100 <= 1 then round((p_valore #>> '{}')::numeric / 100, 4)
      end
  end;
$$;

-- The total watch time in milliseconds can pass the integer range: a bigint.
create function public.insight_valore_grande(p_valore jsonb)
returns bigint
language sql
immutable
security invoker
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_valore) = 'number'
         and (p_valore #>> '{}')::numeric between 0 and 9000000000000000
      then round((p_valore #>> '{}')::numeric)::bigint
  end;
$$;

revoke all on function public.insight_valore_grande(jsonb) from public, anon, authenticated;
revoke all on function public.insight_valore_intero(jsonb) from public, anon, authenticated;
revoke all on function public.insight_valore_rapporto(jsonb) from public, anon, authenticated;

-- The one way to write the numbers of the posts: [{media_id, stato, valori}],
-- at most 200.
--  - 'lette': a key of `valori` that is absent leaves the column as it is (a
--    lower step does not wipe a number read before), a key that is present
--    with null empties it, a value out of range or not a number is null. The
--    row is read only if at least one number came out: metriche_il, the
--    state and the photo of the day follow it; with none, it counts as
--    'non_disponibili' (Meta's empty answer is «not there yet», never zeros).
--  - 'senza_permesso', 'prima_della_conversione', 'non_disponibili': only the
--    state, never metriche_il nor the numbers, and never on a post already
--    'lette' (a refusal tomorrow does not wipe today's numbers).
--  - a media_id that is not there is skipped.
-- Every 'lette' says the permission is there (the morning run, the Insight of
-- the evening or «Aggiorna da Instagram»: the new permission shows at once).
-- Returns how many rows it wrote with numbers.
create function public.instagram_salva_metriche(p_righe jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  e jsonb;
  v jsonb;
  v_id text;
  v_stato text;
  v_views integer; v_reach integer; v_saved integer; v_shares integer; v_likes integer; v_comments integer;
  v_inter integer; v_reposts integer; v_avg integer; v_skip numeric; v_follows integer; v_visite integer;
  v_totale bigint;
  v_letta boolean;
  n integer := 0;
begin
  if p_righe is null or jsonb_typeof(p_righe) <> 'array' then
    raise exception 'Le righe sono un elenco.' using errcode = '22023';
  end if;
  if jsonb_array_length(p_righe) > 200 then
    raise exception 'Al massimo 200 righe alla volta.' using errcode = '22023';
  end if;

  for e in select x from jsonb_array_elements(p_righe) as x loop
    if jsonb_typeof(e) <> 'object' then
      continue;
    end if;
    v_id := e ->> 'media_id';
    v_stato := e ->> 'stato';
    v := case when jsonb_typeof(e -> 'valori') = 'object' then e -> 'valori' else '{}'::jsonb end;
    if v_id is null or v_stato is null then
      continue;
    end if;

    v_letta := false;
    if v_stato = 'lette' then
      v_views := public.insight_valore_intero(v -> 'views');
      v_reach := public.insight_valore_intero(v -> 'reach');
      v_saved := public.insight_valore_intero(v -> 'saved');
      v_shares := public.insight_valore_intero(v -> 'shares');
      v_likes := public.insight_valore_intero(v -> 'likes');
      v_comments := public.insight_valore_intero(v -> 'comments');
      v_inter := public.insight_valore_intero(v -> 'total_interactions');
      v_reposts := public.insight_valore_intero(v -> 'reposts');
      v_avg := public.insight_valore_intero(v -> 'avg_watch_ms');
      v_skip := public.insight_valore_rapporto(v -> 'skip_rate');
      v_follows := public.insight_valore_intero(v -> 'follows');
      v_visite := public.insight_valore_intero(v -> 'profile_visits');
      v_letta := coalesce(v_views, v_reach, v_saved, v_shares, v_likes, v_comments, v_inter, v_reposts,
                          v_avg, v_follows, v_visite) is not null or v_skip is not null
                 or public.insight_valore_grande(v -> 'view_total_ms') is not null;
    end if;

    if v_letta then
      update public.instagram_contenuti i
      set views = case when v ? 'views' then v_views else i.views end,
          reach = case when v ? 'reach' then v_reach else i.reach end,
          saved = case when v ? 'saved' then v_saved else i.saved end,
          shares = case when v ? 'shares' then v_shares else i.shares end,
          likes = case when v ? 'likes' then v_likes else i.likes end,
          comments = case when v ? 'comments' then v_comments else i.comments end,
          total_interactions = case when v ? 'total_interactions' then v_inter else i.total_interactions end,
          reposts = case when v ? 'reposts' then v_reposts else i.reposts end,
          avg_watch_ms = case when v ? 'avg_watch_ms' then v_avg else i.avg_watch_ms end,
          view_total_ms = case when v ? 'view_total_ms' then public.insight_valore_grande(v -> 'view_total_ms') else i.view_total_ms end,
          skip_rate = case when v ? 'skip_rate' then v_skip else i.skip_rate end,
          follows = case when v ? 'follows' then v_follows else i.follows end,
          profile_visits = case when v ? 'profile_visits' then v_visite else i.profile_visits end,
          metriche_stato = 'lette',
          metriche_il = now()
      where i.media_id = v_id;
      if found then
        n := n + 1;
      end if;
    else
      -- a refusal or an empty answer: the state only, and never over a read post
      update public.instagram_contenuti i
      set metriche_stato = case
            when v_stato in ('senza_permesso', 'prima_della_conversione', 'non_disponibili') then v_stato
            when v_stato = 'lette' then 'non_disponibili'
            else i.metriche_stato
          end
      where i.media_id = v_id and i.metriche_stato <> 'lette';
    end if;
  end loop;

  if n > 0 then
    update public.instagram_contenuti_stato s
    set permesso_insights = true, permesso_insights_il = now()
    where s.id;
  end if;
  v_totale := n;
  return v_totale::integer;
end;
$$;

-- The end of the statistics phase of the morning run: outcome, how many posts
-- got numbers, what Meta gave, the permission. Only while the run still holds
-- the lease (false: someone else's). p_permesso false: Meta said the permission
-- is missing, and the posts never read are marked so; true: the posts marked
-- before come back to be read (the page must not say «missing» for a post that
-- will have its numbers tomorrow); null: the phase did not start, the
-- permission stays as it was. The error never keeps the token.
create function public.instagram_contenuti_metriche_fine(
  p_giro uuid,
  p_esito text,
  p_letti integer,
  p_permesso boolean,
  p_gradini jsonb,
  p_errore text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_errore text := btrim(coalesce(p_errore, ''));
  v_token text;
begin
  if p_giro is null then
    return false;
  end if;
  if p_esito is null or p_esito not in ('ok', 'parziale', 'senza_permesso', 'fallito') then
    raise exception 'Esito delle statistiche non valido.' using errcode = '22023';
  end if;

  if p_esito in ('ok', 'senza_permesso') then
    v_errore := '';
  elsif v_errore <> '' then
    select s.decrypted_secret into v_token from vault.decrypted_secrets s where s.name = 'instagram_token';
    if v_token is not null and v_token <> '' then
      v_errore := replace(v_errore, v_token, '[token]');
    end if;
    v_errore := regexp_replace(v_errore, 'access_token=[^&[:space:]"'']*', 'access_token=[token]', 'gi');
    v_errore := regexp_replace(v_errore, '[A-Za-z0-9_-]{40,}', '[token]', 'g');
    v_errore := left(v_errore, 500);
  end if;

  update public.instagram_contenuti_stato s
  set metriche_esito = p_esito,
      metriche_letti = case when p_letti is null then null else greatest(p_letti, 0) end,
      metriche_gradini = case when jsonb_typeof(p_gradini) = 'object' then p_gradini else null end,
      metriche_errore = nullif(v_errore, ''),
      metriche_fine_il = now(),
      permesso_insights = coalesce(p_permesso, s.permesso_insights),
      permesso_insights_il = case when p_permesso is null then s.permesso_insights_il else now() end
  where s.id and s.giro_id = p_giro;
  if not found then
    return false;
  end if;

  if p_permesso is false then
    update public.instagram_contenuti set metriche_stato = 'senza_permesso' where metriche_stato = 'da_leggere';
  elsif p_permesso is true then
    update public.instagram_contenuti set metriche_stato = 'da_leggere' where metriche_stato = 'senza_permesso';
  end if;
  return true;
end;
$$;

revoke all on function public.instagram_salva_metriche(jsonb) from public, anon, authenticated;
grant execute on function public.instagram_salva_metriche(jsonb) to service_role;
revoke all on function public.instagram_contenuti_metriche_fine(uuid, text, integer, boolean, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.instagram_contenuti_metriche_fine(uuid, text, integer, boolean, jsonb, text)
  to service_role;
revoke all on function public.instagram_contenuti_misura() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Views (security invoker): the numbers of the posts, in SQL
-- ---------------------------------------------------------------------------

-- One row per post with its numbers, the photos at about 3, 7 and 30 days, the
-- rates (a zero denominator is null) and the leads that arrived in the DMs
-- from it (instagram_contenuti_dm, 1.35.0).
--
-- Photos: the reading whose age is nearest to 72, 168 and 720 hours, inside the
-- windows 60-108, 144-216 and 648-864 hours. Leads (P = the Rome day of the
-- post): lead_giorni = the days from P to least(yesterday, P + 13);
-- lead_giorni_contati = how many of them the Insight counted after they were
-- over (instagram_contenuti_dm_giorni); lead_contati = all of them, and at
-- least one. Only then the lead numbers exist: otherwise null, never 0.
-- dm_14g, in_target_14g and call_14g are the leads of the first 14 days (the
-- same days for every reel); dm, lead_in_target and call_prenotate the
-- total of every day, only to show. lead_completi = every day from P to
-- yesterday counted (the page says «alcuni giorni non contati» otherwise).
create view public.v_instagram_numeri with (security_invoker = true) as
with base as (
  select i.*, (i.pubblicato_il at time zone 'Europe/Rome')::date as g,
         public.oggi() - 1 as ieri
  from public.instagram_contenuti i
),
lead as (
  select b.media_id,
         greatest(least(b.ieri, b.g + 13) - b.g + 1, 0) as lead_giorni,
         (select count(*) from public.instagram_contenuti_dm_giorni dg
          where dg.giorno between b.g and least(b.ieri, b.g + 13)) as lead_giorni_contati,
         (b.ieri >= b.g and (select count(*) from public.instagram_contenuti_dm_giorni dg
                             where dg.giorno between b.g and b.ieri) = b.ieri - b.g + 1) as lead_completi,
         (select coalesce(sum(d.dm), 0) from public.instagram_contenuti_dm d where d.shortcode = b.shortcode) as dm_tot,
         (select coalesce(sum(d.lead_in_target), 0) from public.instagram_contenuti_dm d where d.shortcode = b.shortcode) as tg_tot,
         (select coalesce(sum(d.call_prenotate), 0) from public.instagram_contenuti_dm d where d.shortcode = b.shortcode) as call_tot,
         (select coalesce(sum(d.dm), 0) from public.instagram_contenuti_dm d
          where d.shortcode = b.shortcode and d.giorno between b.g and b.g + 13) as dm_14,
         (select coalesce(sum(d.lead_in_target), 0) from public.instagram_contenuti_dm d
          where d.shortcode = b.shortcode and d.giorno between b.g and b.g + 13) as tg_14,
         (select coalesce(sum(d.call_prenotate), 0) from public.instagram_contenuti_dm d
          where d.shortcode = b.shortcode and d.giorno between b.g and b.g + 13) as call_14,
         (select coalesce(sum(d.dm), 0) from public.instagram_contenuti_dm d
          where d.shortcode = b.shortcode and d.giorno between b.g and b.g + 6) as dm_7
  from base b
)
select
  b.media_id, b.shortcode, b.permalink, b.copertina_url, b.media_type, b.media_product_type, b.reel,
  b.pubblicato_il, b.g as giorno, (b.eliminato_il is not null) as eliminato,
  b.views, b.reach, b.saved, b.shares, b.likes, b.comments, b.total_interactions, b.reposts,
  b.avg_watch_ms, b.skip_rate, b.follows, b.profile_visits, b.like_count, b.comments_count,
  b.metriche_il, b.metriche_stato, b.video_disponibile, b.audio_tipo, b.durata_ms,
  (b.metriche_il is not null and b.metriche_il - b.pubblicato_il < interval '48 hours') as numeri_parziali,
  floor(extract(epoch from (now() - b.pubblicato_il)) / 3600)::integer as eta_ore,
  f3.views as views_3g, f3.saved as saved_3g, f3.shares as shares_3g, f3.reach as reach_3g,
  f7.views as views_7g, f30.views as views_30g,
  case when b.reach > 0 then round(b.total_interactions::numeric / b.reach, 4) end as tasso_interazioni,
  case when b.reach > 0 then round(b.saved::numeric / b.reach, 4) end as tasso_salvataggi,
  case when b.reach > 0 then round(b.shares::numeric / b.reach, 4) end as tasso_condivisioni,
  case when b.reach > 0 then round(b.views::numeric / b.reach, 2) end as views_per_account,
  case when b.durata_ms > 0 then round(b.avg_watch_ms::numeric / b.durata_ms, 4) end as visione_su_durata,
  l.lead_giorni, l.lead_giorni_contati,
  (l.lead_giorni > 0 and l.lead_giorni_contati = l.lead_giorni) as lead_contati,
  l.lead_completi,
  case when l.lead_giorni > 0 and l.lead_giorni_contati = l.lead_giorni then l.dm_14 end as dm_14g,
  case when l.lead_giorni > 0 and l.lead_giorni_contati = l.lead_giorni then l.tg_14 end as in_target_14g,
  case when l.lead_giorni > 0 and l.lead_giorni_contati = l.lead_giorni then l.call_14 end as call_14g,
  case when l.lead_giorni > 0 and l.lead_giorni_contati = l.lead_giorni then l.dm_7 end as dm_7g,
  case when l.lead_giorni > 0 and l.lead_giorni_contati = l.lead_giorni then l.dm_tot end as dm,
  case when l.lead_giorni > 0 and l.lead_giorni_contati = l.lead_giorni then l.tg_tot end as lead_in_target,
  case when l.lead_giorni > 0 and l.lead_giorni_contati = l.lead_giorni then l.call_tot end as call_prenotate,
  case when l.lead_giorni > 0 and l.lead_giorni_contati = l.lead_giorni and b.views > 0
       then round(l.dm_tot * 1000.0 / b.views, 2) end as dm_ogni_mille_views
from base b
join lead l on l.media_id = b.media_id
left join lateral (
  select m.* from public.instagram_contenuti_misure m
  where m.media_id = b.media_id and m.eta_ore between 60 and 108 order by abs(m.eta_ore - 72), m.giorno limit 1
) f3 on true
left join lateral (
  select m.* from public.instagram_contenuti_misure m
  where m.media_id = b.media_id and m.eta_ore between 144 and 216 order by abs(m.eta_ore - 168), m.giorno limit 1
) f7 on true
left join lateral (
  select m.* from public.instagram_contenuti_misure m
  where m.media_id = b.media_id and m.eta_ore between 648 and 864 order by abs(m.eta_ore - 720), m.giorno limit 1
) f30 on true;

-- The medians of the last 90 days per kind (reel, feed): for the tiles of the
-- page. `quanti` is how many posts each median stands on; under 8 the page
-- says the comparison is poor. The verdict of a reel has its own comparison
-- (analisi_numeri_reel, 20261016090200).
create view public.v_instagram_mediane with (security_invoker = true) as
select
  case when n.reel then 'reel' else 'feed' end as tipo,
  count(*) filter (where n.metriche_stato = 'lette') as quanti,
  percentile_cont(0.5) within group (order by n.views_3g) as views_3g_mediana,
  count(n.views_3g) as views_3g_quanti,
  percentile_cont(0.5) within group (order by n.views) as views_mediana,
  count(n.views) as views_quanti,
  percentile_cont(0.5) within group (order by n.tasso_salvataggi) as tasso_salvataggi_mediana,
  count(n.tasso_salvataggi) as tasso_salvataggi_quanti,
  percentile_cont(0.5) within group (order by n.tasso_condivisioni) as tasso_condivisioni_mediana,
  count(n.tasso_condivisioni) as tasso_condivisioni_quanti,
  percentile_cont(0.5) within group (order by n.visione_su_durata) as visione_su_durata_mediana,
  count(n.visione_su_durata) as visione_su_durata_quanti
from public.v_instagram_numeri n
where not n.eliminato and n.giorno >= public.oggi() - 90
group by n.reel;

-- ---------------------------------------------------------------------------
-- 6. RLS and grants
-- ---------------------------------------------------------------------------
-- Admin, video editor and marketing read (vede_marketing()); setter, closer,
-- coach, nutrizione, dev and deactivated accounts read nothing; nobody writes
-- from a session. A Claude OAuth token (MCP) reaches none of them.
alter table public.instagram_contenuti_misure enable row level security;
alter table public.instagram_account_misure enable row level security;
revoke all on public.instagram_contenuti_misure from anon;
revoke all on public.instagram_account_misure from anon;
revoke insert, update, delete, truncate on public.instagram_contenuti_misure from authenticated;
revoke insert, update, delete, truncate on public.instagram_account_misure from authenticated;
revoke all on public.v_instagram_numeri from anon;
revoke all on public.v_instagram_mediane from anon;

create policy instagram_contenuti_misure_lettura on public.instagram_contenuti_misure
  for select to authenticated using (public.vede_marketing());
create policy instagram_account_misure_lettura on public.instagram_account_misure
  for select to authenticated using (public.vede_marketing());
create policy instagram_contenuti_misure_mai_da_oauth on public.instagram_contenuti_misure
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));
create policy instagram_account_misure_mai_da_oauth on public.instagram_account_misure
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

-- ---------------------------------------------------------------------------
-- 7. Comments
-- ---------------------------------------------------------------------------
comment on table public.instagram_contenuti_misure is
  'The numbers of every post, one photo a day (the last reading of its Rome day), with the age in hours: a reel at three days is compared with the other reels at three days. Written only by the trigger instagram_contenuti_misura; read by admin, video editor and marketing. Numbers only, nothing about a person. In the backup.';
comment on table public.instagram_account_misure is
  'The followers and posts of the connected account, one row a Rome day, from the /me of the morning run. Written by the service role; read by admin, video editor and marketing. In the backup.';
comment on column public.instagram_contenuti.video_disponibile is
  'Only for videos: false = Meta does not give media_url (usually licensed music); null = not known yet.';
comment on column public.instagram_contenuti.durata_ms is
  'The length of the video in milliseconds, written by the reel reading (the API does not give it).';
comment on function public.instagram_salva_metriche(jsonb) is
  'service_role only: the one way to write the numbers of the posts ([{media_id, stato, valori}], at most 200). A post already read stays read; a key absent leaves the column; a value out of range is null; an answer with no number is not a reading. Every reading with a number says the permission instagram_business_manage_insights is there. Returns the rows written with numbers.';
comment on function public.instagram_contenuti_metriche_fine(uuid, text, integer, boolean, jsonb, text) is
  'service_role only: ends the statistics phase of the morning run while it holds the lease (false: someone else''s). The error is stored with the token blanked out.';
comment on view public.v_instagram_numeri is
  'One row per post: numbers, photos at about 3, 7 and 30 days, rates (zero denominator = null) and the leads from the DMs of the first 14 days, null when the Insight did not count those days (never 0).';
comment on view public.v_instagram_mediane is
  'Medians of the last 90 days per kind (reel, feed) with how many posts each stands on.';
