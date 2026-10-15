-- The reel analysis (1.36.0, «Analisi AI dei reel», CLAUDE.md section 30):
-- what Whisper heard and Claude saw in each reel, the analysis Claude writes
-- from the numbers, and the state of the work (the step lease, the month's
-- cost, the two switches). Dany, 09/10/2026 (the request), 10/10/2026 (the
-- ICP), 15/10/2026 (transcripts visible to the Marketing area; the notes of
-- setter and closer reach Claude, and the Marketing area reads only what
-- Claude makes of them: themes, never names nor figures).
--
-- Text and numbers only: never the video, the audio, a frame or a CDN URL
-- (D26). Written only by the service role and the functions of
-- 20261016090200; read by admin, video editor and marketing, except
-- marketing_lavori_stato (the cost and the switches: the admin only). A Claude
-- OAuth token (MCP) reaches none of the three.
--
-- Order: enum, tables, calendar columns, checks, RLS and grants, comments.

create type public.analisi_stato as enum ('in_coda', 'in_corso', 'pronta', 'fallita');

-- ---------------------------------------------------------------------------
-- 1. instagram_letture: the reading of a reel (one row per media)
-- ---------------------------------------------------------------------------
create table public.instagram_letture (
  media_id text primary key references public.instagram_contenuti (media_id) on delete cascade,
  -- only the speech (the recovery of the older reels) or also the vision
  richiesta text not null check (richiesta in ('trascrizione', 'completa')),
  stato text not null default 'in_coda' check (stato in ('in_coda', 'in_corso', 'fatta', 'fallita')),
  motivo text not null check (motivo in ('automatica', 'recupero', 'richiesta')),
  -- 0 recovery, 1 automatic, 2 asked by a person
  priorita smallint not null default 1 check (priorita between 0 and 2),
  tentativi smallint not null default 0 check (tentativi between 0 and 5),
  -- one «resume» without an attempt per reading (R6): the second counts
  ripresa_usata boolean not null default false,
  -- after a limit or a network error
  prossimo_il timestamptz,
  video text check (video in ('letto', 'senza_media_url', 'troppo_grande', 'non_scaricabile', 'senza_estrattore')),
  ha_audio boolean,
  trascrizione_esito text
    check (trascrizione_esito in ('pronta', 'senza_parlato', 'senza_audio', 'senza_video', 'spenta', 'fallita')),
  trascrizione text check (char_length(trascrizione) <= 20000),
  segmenti jsonb check (segmenti is null or (jsonb_typeof(segmenti) = 'array' and jsonb_array_length(segmenti) <= 400)),
  -- the segments that begin before 3 seconds
  gancio_parlato text check (char_length(gancio_parlato) <= 300),
  modello_trascrizione text check (char_length(modello_trascrizione) <= 80),
  visione_esito text check (visione_esito in ('pronta', 'rifiutata', 'fallita')),
  fonte_visione text check (fonte_visione in ('video', 'copertina')),
  -- the validated visual card (lib/marketing/analisi/schema.ts)
  scheda jsonb,
  fotogrammi smallint check (fotogrammi between 0 and 48),
  lato_px smallint check (lato_px in (896, 1280)),
  modello_visione text check (char_length(modello_visione) <= 80),
  versione_prompt_visione text check (char_length(versione_prompt_visione) <= 40),
  -- a fixed Italian sentence (lib/marketing/analisi/frasi.ts)
  errore text check (char_length(errore) <= 300),
  iniziata_il timestamptz,
  letta_il timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_letture_fatta check (stato <> 'fatta' or trascrizione_esito is not null),
  constraint instagram_letture_completa
    check (stato <> 'fatta' or richiesta = 'trascrizione' or visione_esito is not null),
  -- is not distinct from: a card without an outcome would pass with a plain =
  constraint instagram_letture_scheda check ((scheda is not null) = (visione_esito is not distinct from 'pronta')),
  constraint instagram_letture_testo check (trascrizione is null or trascrizione_esito = 'pronta'),
  constraint instagram_letture_fallita check (stato <> 'fallita' or errore is not null)
);
create index instagram_letture_coda_idx on public.instagram_letture (priorita desc, created_at) where stato = 'in_coda';

create trigger instagram_letture_set_updated_at before update on public.instagram_letture
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. marketing_analisi: Claude's analysis of a reel (and its re-runs)
-- ---------------------------------------------------------------------------
create table public.marketing_analisi (
  id uuid primary key default gen_random_uuid(),
  media_id text not null references public.instagram_contenuti (media_id) on delete cascade,
  motivo text not null check (motivo in ('automatica', 'richiesta')),
  stato public.analisi_stato not null default 'in_coda',
  -- the reel's age in hours when it was analysed, and the age of the comparison (3 or 7 days; null = whole life)
  eta_ore integer check (eta_ore between 0 and 9600),
  eta_confronto smallint check (eta_confronto in (3, 7)),
  -- the context window (28 days up to yesterday)
  periodo_da date not null,
  periodo_a date not null,
  -- from SQL (analisi_numeri_reel), copied when the analysis starts
  verdetto text check (verdetto in ('spingere', 'mantenere', 'cambiare')),
  -- what Claude saw: counts, ratios and words, never euros
  numeri jsonb,
  -- the validated output
  contenuto jsonb,
  -- counts of the sources only: {"fotogrammi":31,"video":"si","trascrizione":"si","lead":"si","note_team":true}
  fonti jsonb,
  modello text check (char_length(modello) <= 80),
  versione_prompt text check (char_length(versione_prompt) <= 40),
  errore text check (char_length(errore) <= 300),
  tentativi smallint not null default 0 check (tentativi between 0 and 5),
  prossimo_il timestamptz,
  iniziata_il timestamptz,
  finita_il timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_analisi_periodo check (periodo_a >= periodo_da),
  constraint marketing_analisi_pronta check ((stato = 'pronta') = (contenuto is not null)),
  constraint marketing_analisi_fallita check ((stato = 'fallita') = (errore is not null)),
  constraint marketing_analisi_finita check ((stato in ('in_coda', 'in_corso')) = (finita_il is null))
);
create unique index marketing_analisi_una_aperta on public.marketing_analisi (media_id)
  where stato in ('in_coda', 'in_corso');
create unique index marketing_analisi_automatica_una on public.marketing_analisi (media_id)
  where motivo = 'automatica';
create index marketing_analisi_reel_idx on public.marketing_analisi (media_id, created_at desc);
create index marketing_analisi_creata_idx on public.marketing_analisi (created_at desc);

create trigger marketing_analisi_set_updated_at before update on public.marketing_analisi
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. marketing_lavori_stato: the state of the work (one row, admin reads)
-- ---------------------------------------------------------------------------
create table public.marketing_lavori_stato (
  id boolean primary key default true check (id),
  -- where pg_net posts every step: the same two forms as insight_impostazioni.url_passo
  url_passo text
    constraint marketing_lavori_stato_url_passo
    check (url_passo ~ '^https://[a-z0-9.-]+/api/cron/marketing$'
           or url_passo ~ '^http://(127\.0\.0\.1|localhost|host\.docker\.internal)(:[0-9]{2,5})?/api/cron/marketing$'),
  passo_id uuid,
  passo_cosa text check (passo_cosa in ('lettura', 'analisi')),
  passo_rif text,
  lease_fino_al timestamptz,
  inviata_il timestamptz,
  ultimo_tick_il timestamptz,
  ultimo_passo_il timestamptz,
  ultimo_esito text
    check (ultimo_esito in ('ok', 'parziale', 'fallito', 'senza_chiave', 'limite_spesa', 'limite_fornitore')),
  ultimo_errore text check (char_length(ultimo_errore) <= 300),
  -- off: only the requests (R14)
  automatiche boolean not null default true,
  -- on (Dany, 15/10/2026): the notes of setter and closer reach Claude, without names; off: they do not
  note_team boolean not null default true,
  mese date not null default date_trunc('month', public.oggi())::date,
  token_input bigint not null default 0,
  token_cache_scritti bigint not null default 0,
  token_cache_letti bigint not null default 0,
  token_output bigint not null default 0,
  secondi_audio integer not null default 0,
  costo_mese_usd numeric(8,4) not null default 0,
  costo_max_mese numeric(6,2) not null default 25 check (costo_max_mese between 0 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_lavori_stato_passo
    check ((passo_id is null) = (passo_cosa is null) and (passo_id is null) = (passo_rif is null))
);
insert into public.marketing_lavori_stato default values;

create trigger marketing_lavori_stato_set_updated_at before update on public.marketing_lavori_stato
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. The calendar: which content was born from an idea of Claude
-- ---------------------------------------------------------------------------
alter table public.marketing_contenuti
  add column da_analisi uuid references public.marketing_analisi (id) on delete set null,
  add column da_idea smallint constraint marketing_contenuti_da_idea check (da_idea between 0 and 9);
-- one calendar row per idea
create unique index marketing_contenuti_idea_idx on public.marketing_contenuti (da_analisi, da_idea)
  where da_analisi is not null;

-- ---------------------------------------------------------------------------
-- 5. The speech in the proposals of «Da collegare»
-- ---------------------------------------------------------------------------
alter table public.marketing_abbinamenti drop constraint marketing_abbinamenti_motivi;
alter table public.marketing_abbinamenti add constraint marketing_abbinamenti_motivi
  check (motivi <@ array['stessa_data', 'giorno_vicino', 'didascalia_simile', 'unico_del_giorno', 'parlato_simile']::text[]);

-- ---------------------------------------------------------------------------
-- 6. RLS and grants
-- ---------------------------------------------------------------------------
alter table public.instagram_letture enable row level security;
alter table public.marketing_analisi enable row level security;
alter table public.marketing_lavori_stato enable row level security;
revoke all on public.instagram_letture from anon;
revoke all on public.marketing_analisi from anon;
revoke all on public.marketing_lavori_stato from anon;
revoke insert, update, delete, truncate on public.instagram_letture from authenticated;
revoke insert, update, delete, truncate on public.marketing_analisi from authenticated;
revoke insert, update, delete, truncate on public.marketing_lavori_stato from authenticated;

create policy instagram_letture_lettura on public.instagram_letture
  for select to authenticated using (public.vede_marketing());
create policy marketing_analisi_lettura on public.marketing_analisi
  for select to authenticated using (public.vede_marketing());
create policy marketing_lavori_stato_admin on public.marketing_lavori_stato
  for select to authenticated using (public.is_admin());

create policy instagram_letture_mai_da_oauth on public.instagram_letture
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));
create policy marketing_analisi_mai_da_oauth on public.marketing_analisi
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));
create policy marketing_lavori_stato_mai_da_oauth on public.marketing_lavori_stato
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

-- ---------------------------------------------------------------------------
-- 7. Comments
-- ---------------------------------------------------------------------------
comment on table public.instagram_letture is
  'The reading of a reel: what Whisper heard (text, segments with times, the first words) and the visual card Claude wrote from the frames. One row per media. Text and numbers only: never the video, the audio, a frame or a CDN URL. Written by the service role and the marketing_* functions; read by admin, video editor and marketing. In the backup.';
comment on table public.marketing_analisi is
  'Claude''s analysis of a reel: validated output only (names stripped, no euros), the numbers it saw and the counts of its sources, never who asked for it. Re-running keeps the last 3 and every one an idea of which is in the calendar. Written by the service role and the marketing_* functions; read by admin, video editor and marketing. In the backup.';
comment on table public.marketing_lavori_stato is
  'One row: the step lease of the reel work, the step URL, the two switches (automatic analyses, notes of the team) and the month''s cost with the limit. Admin reads; written only by the marketing_* functions.';
comment on column public.marketing_lavori_stato.note_team is
  'On by default (Dany, 15/10/2026): the answers of the setter and the closer''s reasons reach Claude without names; the video editor and the marketing read only what Claude makes of them.';
comment on column public.marketing_contenuti.da_analisi is
  'The analysis whose idea this content was born from («Aggiungi al calendario»); null when the analysis was pruned. Only the app''s action writes it.';
