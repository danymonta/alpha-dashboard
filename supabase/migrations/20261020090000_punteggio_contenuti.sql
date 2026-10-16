-- The content scoring (1.39.0, CLAUDE.md sections 26, 30 and 31).
--
--  1. marketing_analisi keeps the score of the reel next to Claude's analysis: the validated output
--     (`punteggio`) and, for the lists and the filters, the total, the band and the type. Written only by
--     marketing_analisi_fine (service_role), read by admin, video editor and marketing with the table's own policy.
--  2. «Aggiungi al calendario» from the redo: a content may be born from the rewrite of a score (the idea
--     index 9), once only.
--  3. Claude works only after a click (Dany, 16/10/2026): the automatic analyses are gone. What the night still
--     does is the speech of the new reels, Whisper only, no Claude (marketing_pianifica, marketing_scegli_lavoro).
--     The queued automatic work is cleaned.
--  4. The weekly brief of the Spunti is only on request (call_pianifica no longer queues it; the switch goes).
--     The analyses of the calls stay automatic.
-- The tables are not new: their RLS (select for vede_marketing, restrictive *_mai_da_oauth) is the one of
-- 20261016090100_analisi_dati.sql.

-- ---------------------------------------------------------------------------
-- 1. The score
-- ---------------------------------------------------------------------------
alter table public.marketing_analisi
  add column punteggio jsonb,
  add column punteggio_totale smallint,
  add column punteggio_fascia text,
  add column punteggio_tipo text,
  add column versione_guida text;

alter table public.marketing_analisi
  add constraint marketing_analisi_punteggio_totale check (punteggio_totale between 0 and 100),
  add constraint marketing_analisi_punteggio_fascia
    check (punteggio_fascia in ('pubblicare', 'pubblicare_dopo_ritocchi', 'rifare_le_parti_deboli', 'riscrivere', 'scartare')),
  add constraint marketing_analisi_punteggio_tipo check (punteggio_tipo in ('tof', 'mof', 'bof')),
  add constraint marketing_analisi_versione_guida check (char_length(versione_guida) <= 40),
  -- all or nothing, and only on a ready analysis
  add constraint marketing_analisi_punteggio_insieme
    check ((punteggio is null) = (punteggio_totale is null)
           and (punteggio is null) = (punteggio_fascia is null)
           and (punteggio is null) = (punteggio_tipo is null)),
  add constraint marketing_analisi_punteggio_pronta check (punteggio is null or stato = 'pronta');

comment on column public.marketing_analisi.punteggio is
  'The score of the reel (Dany''s guide of 16/10/2026): type, hook, the criteria with vote, weight, passage, reason and correction, the penalties with their line, strengths, priorities and the redo (instructions, three hooks, rewritten script and caption, expected score). Every number was computed by the app from Claude''s votes. Validated output only: no name, no amount, no link. Null when the analysis was made without it or the scoring failed.';
comment on column public.marketing_analisi.punteggio_totale is 'The final score, 0-100 (copy of punteggio.totale, for the lists and the filters).';
comment on column public.marketing_analisi.punteggio_fascia is 'The band of the final score: pubblicare, pubblicare_dopo_ritocchi, rifare_le_parti_deboli, riscrivere, scartare.';
comment on column public.marketing_analisi.punteggio_tipo is 'The funnel type the reel was scored as: tof, mof or bof.';
comment on column public.marketing_analisi.versione_guida is 'The version of the guide and of the prompt the score was made with.';

-- The end of an analysis. As in 20261016090200, with the score: only from in_corso.
--  - pronta: the validated output (and the score, when there is one); keeps the last 3 ready ones of the reel
--    and deletes the others, never one an idea of which is in the calendar
--  - fallita: the sentence of the error
--  - in_coda: with p_riprova_il the retry counts an attempt (3: it fails); without it the time ran out
--    before Claude was asked, no attempt
drop function public.marketing_analisi_fine(uuid, text, jsonb, jsonb, jsonb, text, text, text, timestamptz);
create function public.marketing_analisi_fine(
  p_id uuid, p_stato text, p_numeri jsonb, p_contenuto jsonb, p_fonti jsonb,
  p_modello text, p_versione text, p_errore text, p_riprova_il timestamptz default null,
  p_punteggio jsonb default null, p_versione_guida text default null)
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
  v_totale smallint;
  v_fascia text;
  v_tipo text;
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
  -- the score: the three summary fields come from the document itself, and must be what the table allows
  if v_stato = 'pronta' and p_punteggio is not null then
    if jsonb_typeof(p_punteggio) <> 'object'
       or (p_punteggio ->> 'totale') !~ '^[0-9]{1,3}$'
       or (p_punteggio ->> 'totale')::integer > 100
       or p_punteggio ->> 'fascia' not in ('pubblicare', 'pubblicare_dopo_ritocchi', 'rifare_le_parti_deboli', 'riscrivere', 'scartare')
       or p_punteggio ->> 'tipo' not in ('tof', 'mof', 'bof') then
      raise exception 'Il punteggio non è valido.' using errcode = '22023';
    end if;
    v_totale := (p_punteggio ->> 'totale')::smallint;
    v_fascia := p_punteggio ->> 'fascia';
    v_tipo := p_punteggio ->> 'tipo';
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
      punteggio = case when v_stato = 'pronta' then p_punteggio end,
      punteggio_totale = v_totale,
      punteggio_fascia = v_fascia,
      punteggio_tipo = v_tipo,
      versione_guida = case when v_stato = 'pronta' and p_punteggio is not null then left(p_versione_guida, 40) end,
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
revoke all on function public.marketing_analisi_fine(uuid, text, jsonb, jsonb, jsonb, text, text, text, timestamptz, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.marketing_analisi_fine(uuid, text, jsonb, jsonb, jsonb, text, text, text, timestamptz, jsonb, text)
  to service_role;

comment on function public.marketing_analisi_fine(uuid, text, jsonb, jsonb, jsonb, text, text, text, timestamptz, jsonb, text) is
  'service_role only: closes an analysis (pronta, fallita, in_coda) from in_corso. With p_punteggio (the validated score, whose total, band and type must be valid) the score is kept next to the analysis. Keeps the last 3 ready ones of the reel.';

-- ---------------------------------------------------------------------------
-- 2. The redo in the calendar
-- ---------------------------------------------------------------------------
-- A content born from an idea of Claude, or from the rewrite of a score (index 9, once per analysis): the origin
-- is written only for a ready analysis that has that idea (or that rewrite); it never changes from a session;
-- a token of Claude (MCP) never writes it. The service role's «set null» when an old analysis is pruned passes.
create or replace function public.marketing_contenuti_idea_coerenza()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_idee integer;
  v_rifacimento boolean;
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
  select case when jsonb_typeof(a.contenuto -> 'idee') = 'array' then jsonb_array_length(a.contenuto -> 'idee') else 0 end,
         coalesce(btrim(a.punteggio -> 'rifacimento' ->> 'script_riscritto'), '') <> ''
    into v_idee, v_rifacimento
  from public.marketing_analisi a where a.id = new.da_analisi and a.stato = 'pronta';
  if new.da_analisi is null or new.da_idea is null or not found
     or (new.da_idea >= v_idee and not (new.da_idea = 9 and v_rifacimento)) then
    raise exception 'Idea di Claude non valida.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.marketing_contenuti_idea_coerenza() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Claude only after a click
-- ---------------------------------------------------------------------------
-- The automatic work is now only the speech of the new reels (Whisper, no Claude, no frames): the reading of a
-- reel with Claude's visual card, the analysis and the score start from «Analizza» and from nothing else.
-- With `automatiche` off nothing is created.
create or replace function public.marketing_pianifica()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.marketing_lavori_stato;
begin
  select * into s from public.marketing_lavori_stato x where x.id;
  if not s.automatiche then
    return;
  end if;

  -- the speech of the new reels: up to 28 days old at the first priority, from 29 to 90 as a recovery
  insert into public.instagram_letture (media_id, richiesta, motivo, priorita)
  select i.media_id,
         'trascrizione',
         case when i.pubblicato_il >= now() - interval '28 days' then 'automatica' else 'recupero' end,
         case when i.pubblicato_il >= now() - interval '28 days' then 1 else 0 end
  from public.instagram_contenuti i
  where (i.reel or i.media_type = 'VIDEO') and i.eliminato_il is null
    and i.pubblicato_il >= now() - interval '90 days'
    and not exists (select 1 from public.instagram_letture l where l.media_id = i.media_id)
  on conflict (media_id) do nothing;
end;
$$;

-- The next job that is due, in this order: the readings asked by a person; the analyses asked by a person whose
-- reading is not going; then, only with the automatic work on, between 00:00 and 10:00 (Rome; p_adesso is only
-- for the tests) and within the daily limits, the automatic readings (the speech only, newest reel first) and
-- the recovery readings (60 a day at most). There is no automatic analysis any more. Nothing while the lease
-- is taken, an Insight run is active, or the month's cost has reached the limit.
create or replace function public.marketing_scegli_lavoro(p_adesso timestamptz default now())
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
      and l.stato = 'in_coda' and l.priorita = 1 and l.richiesta = 'trascrizione' and l.tentativi < 3
      and (l.prossimo_il is null or l.prossimo_il <= now())
    union all
    select 5, 'lettura', l.media_id, -extract(epoch from i.pubblicato_il)
    from public.instagram_letture l join public.instagram_contenuti i on i.media_id = l.media_id
    where v_auto and v_recuperi < 60
      and l.stato = 'in_coda' and l.priorita = 0 and l.richiesta = 'trascrizione' and l.tentativi < 3
      and (l.prossimo_il is null or l.prossimo_il <= now())
  ) u
  order by u.o, u.k
  limit 1;
end;
$$;

-- What was queued by the night before this release: the readings become speech-only (they were complete, with
-- Claude's look), the automatic analyses that had not started are gone. A reading or an analysis already
-- running finishes.
update public.instagram_letture set richiesta = 'trascrizione'
where stato = 'in_coda' and motivo in ('automatica', 'recupero') and richiesta = 'completa';
delete from public.marketing_analisi where motivo = 'automatica' and stato = 'in_coda';

comment on column public.marketing_lavori_stato.automatiche is
  '«Trascrizioni automatiche (senza Claude)»: when on, the night transcribes the speech of the new reels (Whisper), nothing else. Claude works only after a click on «Analizza».';
comment on function public.marketing_pianifica() is
  'The automatic work, when `automatiche` is on: queue the speech of the new reels (Whisper only, no Claude). Since 1.39.0 no analysis and no look of Claude is ever queued by itself.';
comment on function public.marketing_scegli_lavoro(timestamptz) is
  'The next reel job due: readings and analyses asked by a person first, then (switch on, 00:00-10:00 Rome, within the daily limits) the speech-only readings. No automatic analysis since 1.39.0.';

-- ---------------------------------------------------------------------------
-- 4. The view of the page: the score of the last ready analysis that has one
-- ---------------------------------------------------------------------------
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
  z.motivo as analisi_motivo,
  y.punteggio_totale, y.punteggio_fascia, y.punteggio_tipo
from public.v_instagram_numeri n
join public.v_instagram_post p on p.media_id = n.media_id
left join public.marketing_contenuti m on m.id = p.contenuto_id
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
left join public.analisi_numeri_set() a on a.media_id = n.media_id
where n.reel or n.media_type = 'VIDEO';

revoke all on public.v_analisi_reel from anon;

comment on view public.v_analisi_reel is
  'One row per reel for the Analisi page: media, calendar content, numbers, comparison and verdict of today (from analisi_numeri_set, computed once), leads of the first 14 days (null when not counted), the reading, the last analysis and the score of the last ready analysis that has one (total, band, type).';

-- ---------------------------------------------------------------------------
-- 5. The Spunti only on request
-- ---------------------------------------------------------------------------
-- The weekly brief is no longer queued by itself; the pruning of the old ones stays.
create or replace function public.call_pianifica()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  delete from public.marketing_spunti m
  where m.periodo_a < public.oggi() - 182 and m.stato in ('pronta', 'fallita')
    and not exists (select 1 from public.marketing_contenuti c where c.da_spunti = m.id);
end;
$$;
revoke all on function public.call_pianifica() from public, anon, authenticated, service_role;

delete from public.marketing_spunti where motivo = 'automatica' and stato = 'in_coda';

-- one switch less: the analyses of the calls
drop function public.call_imposta_interruttori(boolean, boolean);
create function public.call_imposta_interruttori(p_analisi boolean default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo l’admin accende e spegne le analisi.' using errcode = '42501';
  end if;
  update public.call_lavori_stato s set analisi_attive = coalesce(p_analisi, s.analisi_attive) where s.id;
end;
$$;
revoke all on function public.call_imposta_interruttori(boolean) from public, anon;
grant execute on function public.call_imposta_interruttori(boolean) to authenticated;

create or replace function public.call_lavori_situazione()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.call_lavori_stato;
  v_ruolo public.app_role := public.current_role();
  v_costo numeric := public.call_costo_mese();
  v_risposta jsonb;
begin
  if v_ruolo is null or v_ruolo not in ('admin', 'editor', 'marketing') then
    raise exception 'La situazione dei lavori è dell’area Marketing.' using errcode = '42501';
  end if;
  select * into s from public.call_lavori_stato x where x.id;
  v_risposta := jsonb_build_object(
    'spunti_in_coda', exists (select 1 from public.marketing_spunti m where m.stato in ('in_coda', 'in_corso')),
    'in_pausa_spesa', v_costo >= s.costo_max_mese);
  if v_ruolo = 'admin' then
    v_risposta := v_risposta || jsonb_build_object(
      'analisi_attive', s.analisi_attive,
      'costo_mese', v_costo, 'costo_max', s.costo_max_mese,
      'analisi_mese', s.analisi_mese, 'spunti_mese', s.spunti_mese,
      'analisi_in_coda', (select count(*) from public.call_analisi a where a.stato in ('in_coda', 'in_corso')),
      'ultimo_errore', s.ultimo_errore, 'ultimo_esito', s.ultimo_esito,
      'ultimo_passo_il', s.ultimo_passo_il, 'ultimo_tick_il', s.ultimo_tick_il);
  end if;
  return v_risposta;
end;
$$;
revoke all on function public.call_lavori_situazione() from public, anon;
grant execute on function public.call_lavori_situazione() to authenticated;

alter table public.call_lavori_stato drop column spunti_automatici;

comment on function public.call_pianifica() is
  'The planner of the call jobs: prunes the old Spunti briefs. Since 1.39.0 it queues nothing: the brief of the Spunti is only on request (marketing_spunti_richiedi).';
