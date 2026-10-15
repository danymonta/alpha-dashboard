-- The DM Insight of the last 24 hours in the app (Dany, 08/10/2026): the
-- artifact "Recap DM Alpha" brought home. DM text is stored here for at most
-- 30 days and sent to Anthropic for the analysis (CLAUDE.md section 29).
-- Under 14, no message outlives the run that read it.
--
-- Dany, 08 to 10/10/2026: «tutto paro come l'artefatto deve funzionare»; the
-- admin and every active setter read the recaps; «Aggiorna dati» and the
-- automation are the admin's; editor and marketing never see a chat or a
-- name, only the counts per post (instagram_contenuti_dm, 20261014090200).
--
-- Order: extensions, enums, the read helper, tables (each with RLS, policies,
-- grants and comments), Realtime, the Vault key of the steps, the backup rule,
-- the new comment of instagram_contenuti. The functions and the pg_cron jobs
-- are in 20261014090100_insight_funzioni.sql.
--
-- Tables:
--  1. insight_impostazioni  one row: the automation (on/off, «Pronto alle»),
--                           the step URL, the last tick, the first day of the
--                           chats (storico_dal). Admin reads; functions write.
--  2. insight_esecuzioni    the runs: state, step, lease, counters, tokens,
--                           cost, the app's agenda and lead state. Admin reads.
--  3. insight_chat          the latest state of each conversation, with up to
--                           25 messages of the last 30 days. No session.
--  4. insight_profili       the Instagram profile cache. No session.
--  5. insight_blocchi       the units of AI work of a run. No session.
--  6. insight_schede        Claude's validated cards. No session.
--  7. insight_recap         the documents the page renders, one per day and
--                           channel. Admin and every active setter read.
--  8. insight_fatto         the shared Fatto switches. Admin and every active
--                           setter read and write (no delete).
--  9. messenger_collegamento  one row: the Facebook Page (the token is in
--                           Vault). Admin reads; functions write.
-- 10. messenger_esclusi     Messenger chats never read. Admin only.
--
-- Every insight_* table holds third-party DM text (or derives from it): the
-- weekly backup never takes it (backup_completo below). messenger_* and
-- instagram_contenuti_dm are named so on purpose: they stay in the backup.

-- ---------------------------------------------------------------------------
-- Extensions: pg_cron starts the runs at the time the admin chooses, pg_net
-- posts each step to the app (Supabase docs, enabling pg_cron by SQL)
-- ---------------------------------------------------------------------------
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
-- needed by insight_pulizia (cron.job_run_details)
grant all privileges on all tables in schema cron to postgres;

-- ---------------------------------------------------------------------------
-- Enums, created whole (never "alter type … add value" in this release)
-- ---------------------------------------------------------------------------
create type public.insight_canale as enum ('instagram', 'messenger');
-- not "insight_stato": that is a function
create type public.insight_stato_esecuzione as enum ('in_coda', 'in_corso', 'pronta', 'fallita');
create type public.insight_passo as enum ('lettura', 'analisi', 'unione');

-- ---------------------------------------------------------------------------
-- Who reads the Insight: the admin and every active setter (Dany, 09/10/2026).
-- security invoker: current_role() (definer) already requires an active
-- account and, from 1.34.0, is null for a Claude OAuth token. Here and not in
-- 20261014090100 because the policies below need it.
-- ---------------------------------------------------------------------------
create function public.insight_puo_leggere()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(public.current_role() in ('admin', 'setter'), false);
$$;

comment on function public.insight_puo_leggere() is
  'The Insight of the last 24 hours: the admin and every active setter (current_role() checks role and account). security invoker.';

revoke all on function public.insight_puo_leggere() from public, anon;
grant execute on function public.insight_puo_leggere() to authenticated;

-- ---------------------------------------------------------------------------
-- 1. insight_impostazioni
-- ---------------------------------------------------------------------------
create table public.insight_impostazioni (
  -- one row only
  id boolean primary key default true
    constraint insight_impostazioni_una_riga check (id),
  -- «Automazione»: the recap is ready at `ora` (Rome) every day
  attivo boolean not null default false,
  ora time not null default '19:00'
    constraint insight_impostazioni_ora
    check (extract(second from ora) = 0 and extract(minute from ora)::integer % 5 = 0),
  -- the run starts this many minutes before `ora`
  anticipo_minuti integer not null default 15
    constraint insight_impostazioni_anticipo check (anticipo_minuti between 5 and 60),
  -- where pg_net posts each step: https on a public host, or the local hosts
  -- a local Supabase reaches the dev server with (lib/insight/config.ts)
  url_passo text
    constraint insight_impostazioni_url_passo
    check (url_passo ~ '^https://[a-z0-9.-]+/api/cron/insight$'
           or url_passo ~ '^http://(host\.docker\.internal|localhost|127\.0\.0\.1)(:[0-9]{2,5})?/api/cron/insight$'),
  -- the last pg_cron tick (the page says when the scheduler stopped)
  ultimo_tick_il timestamptz,
  -- the first day the chats of insight_chat cover (the bootstrap start day,
  -- Rome), written once by the first reading that found insight_chat empty:
  -- instagram_contenuti_dm_salva never rewrites a day before it
  storico_dal date,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.insight_impostazioni is
  'The Insight''s automation (one row): on or off, the time the recap is ready (Rome), how early the run starts, the step URL pg_net posts to, the last pg_cron tick and the first day of the chats. Admin reads; written only by insight_imposta_automazione, insight_richiedi, insight_tick and insight_passo_finito.';
comment on column public.insight_impostazioni.storico_dal is
  'The first Rome day the chats cover (bootstrap), written once: the counts per post before it are never rewritten.';

insert into public.insight_impostazioni (id) values (true);

create trigger insight_impostazioni_set_updated_at
  before update on public.insight_impostazioni
  for each row execute function public.set_updated_at();

alter table public.insight_impostazioni enable row level security;
revoke all on public.insight_impostazioni from anon;
revoke insert, update, delete, truncate on public.insight_impostazioni from authenticated;

create policy insight_impostazioni_admin_lettura on public.insight_impostazioni
  for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. insight_esecuzioni: the runs
-- ---------------------------------------------------------------------------
create table public.insight_esecuzioni (
  id uuid primary key default gen_random_uuid(),
  -- the Rome day of the recap
  giorno date not null,
  motivo text not null
    constraint insight_esecuzioni_motivo check (motivo in ('pianificata', 'manuale')),
  richiesta_da uuid references public.profiles (id) on delete set null,
  stato public.insight_stato_esecuzione not null default 'in_coda',
  passo public.insight_passo not null default 'lettura',
  -- conversation ids and counters only, never text or usernames
  progresso jsonb not null default '{}'::jsonb
    constraint insight_esecuzioni_progresso check (jsonb_typeof(progresso) = 'object'),
  -- agenda, show-up and lead-state rows (names and handles of booked leads;
  -- never notes or amounts): deleted with its run after 30 days
  contesto_app jsonb,
  inviata_il timestamptz,
  lease_fino_al timestamptz,
  tentativi integer not null default 0
    constraint insight_esecuzioni_tentativi check (tentativi between 0 and 10),
  invocazioni integer not null default 0
    constraint insight_esecuzioni_invocazioni check (invocazioni between 0 and 40),
  -- fixed Italian sentences only, never message text or model output
  avvisi text[] not null default '{}',
  errore text
    constraint insight_esecuzioni_errore check (char_length(errore) <= 500),
  -- counters (numbers only)
  chat_instagram integer constraint insight_esecuzioni_chat_instagram check (chat_instagram >= 0),
  chat_messenger integer constraint insight_esecuzioni_chat_messenger check (chat_messenger >= 0),
  chat_escluse integer constraint insight_esecuzioni_chat_escluse check (chat_escluse >= 0),
  contenuti integer constraint insight_esecuzioni_contenuti check (contenuti >= 0),
  blocchi_totali integer constraint insight_esecuzioni_blocchi_totali check (blocchi_totali >= 0),
  blocchi_fatti integer constraint insight_esecuzioni_blocchi_fatti check (blocchi_fatti >= 0),
  chat_attribuite integer constraint insight_esecuzioni_chat_attribuite check (chat_attribuite >= 0),
  -- Anthropic's token counters, added up by insight_passo_finito
  token_input bigint constraint insight_esecuzioni_token_input check (token_input >= 0),
  token_cache_scritti bigint constraint insight_esecuzioni_token_cache_scritti check (token_cache_scritti >= 0),
  token_cache_letti bigint constraint insight_esecuzioni_token_cache_letti check (token_cache_letti >= 0),
  token_output bigint constraint insight_esecuzioni_token_output check (token_output >= 0),
  -- written only by insight_passo_finito, with insight_costo_usd (D19)
  costo_usd numeric(8,4) constraint insight_esecuzioni_costo check (costo_usd >= 0),
  modello text constraint insight_esecuzioni_modello check (char_length(modello) <= 100),
  servito_da_fallback integer not null default 0
    constraint insight_esecuzioni_fallback check (servito_da_fallback >= 0),
  creata_il timestamptz not null default now(),
  iniziata_il timestamptz,
  finita_il timestamptz,
  updated_at timestamptz not null default now()
);

-- one run at a time, one planned run per day
create unique index insight_esecuzioni_una_attiva on public.insight_esecuzioni ((true))
  where stato in ('in_coda', 'in_corso');
create unique index insight_esecuzioni_una_pianificata on public.insight_esecuzioni (giorno)
  where motivo = 'pianificata';
create index insight_esecuzioni_creata_idx on public.insight_esecuzioni (creata_il desc);

comment on table public.insight_esecuzioni is
  'The Insight''s runs: state, step, lease, counters, Anthropic tokens and cost, the app''s agenda and lead state (contesto_app: names and handles of booked leads, never notes or amounts). Admin reads; written only by the insight_* functions (service role). Deleted 30 days after it was created (insight_pulizia), with its blocks and cards. creata_il plays the part of created_at.';
comment on column public.insight_esecuzioni.errore is
  'A fixed Italian sentence (FRASI_INSIGHT), never message text, model output or an exception''s message.';

create trigger insight_esecuzioni_set_updated_at
  before update on public.insight_esecuzioni
  for each row execute function public.set_updated_at();

alter table public.insight_esecuzioni enable row level security;
revoke all on public.insight_esecuzioni from anon;
revoke insert, update, delete, truncate on public.insight_esecuzioni from authenticated;

create policy insight_esecuzioni_admin_lettura on public.insight_esecuzioni
  for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. insight_chat: the latest state of each conversation (no session reads it)
-- ---------------------------------------------------------------------------
create table public.insight_chat (
  id uuid primary key default gen_random_uuid(),
  canale public.insight_canale not null,
  conversazione_id text not null
    constraint insight_chat_conversazione check (char_length(conversazione_id) between 1 and 200),
  -- Instagram: the lead's username, lowercase
  username text
    constraint insight_chat_username check (username ~ '^[a-z0-9._]{1,30}$'),
  -- Instagram user id or Messenger PSID
  utente_id text
    constraint insight_chat_utente_id check (utente_id ~ '^[0-9]{1,30}$'),
  nome text
    constraint insight_chat_nome check (char_length(nome) <= 120),
  -- Meta's updated_time; null forces a new reading
  aggiornata_il timestamptz,
  -- up to 25 messages {da, il, testo, codici, storia}, oldest first, never
  -- older than 30 days (insight_pulizia)
  messaggi jsonb not null default '[]'::jsonb
    constraint insight_chat_messaggi
    check (case when jsonb_typeof(messaggi) = 'array' then jsonb_array_length(messaggi) <= 25 else false end),
  messaggi_letti integer not null default 0
    constraint insight_chat_messaggi_letti check (messaggi_letti >= 0),
  -- fewer than 20 messages read: the start of the chat is visible
  completa boolean not null default false,
  ultimo_da text
    constraint insight_chat_ultimo_da check (ultimo_da in ('lead', 'alpha')),
  ultimo_il timestamptz,
  calendly_inviato_il timestamptz,
  codici_condivisi text[] not null default '{}',
  non_lead boolean not null default false,
  letta_il timestamptz not null default now(),
  -- where the lead comes from (D26), frozen once found, only on a complete chat
  origine_tipo text
    constraint insight_chat_origine_tipo check (origine_tipo in ('condivisione', 'parola_chiave', 'storia', 'testo')),
  origine_shortcode text
    constraint insight_chat_origine_shortcode check (origine_shortcode ~ '^[A-Za-z0-9_-]{5,40}$'),
  -- the chat's first message (when the lead arrived) and its Rome day
  origine_il timestamptz,
  origine_giorno date,
  -- Claude's latest classification, for the counts of the past days
  ultimo_target text
    constraint insight_chat_ultimo_target check (ultimo_target in ('si', 'no', 'da verificare')),
  -- under 14 (D25): no message is kept
  minore_14 boolean not null default false,
  -- the run that last wrote `messaggi` (D25 step 5: a failed run leaves none)
  letta_da uuid references public.insight_esecuzioni (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint insight_chat_una_per_conversazione unique (canale, conversazione_id),
  constraint insight_chat_origine_completa
    check ((origine_tipo is null) = (origine_il is null) and (origine_tipo is null) = (origine_giorno is null)),
  constraint insight_chat_origine_con_post
    check (origine_tipo not in ('condivisione', 'parola_chiave', 'testo') or origine_shortcode is not null),
  constraint insight_chat_post_con_origine
    check (origine_shortcode is null or origine_tipo is not null),
  -- a non-lead keeps no messages (the routine: «Per i non lead NON salvare i messaggi»)
  constraint insight_chat_non_lead_senza_messaggi
    check (not non_lead or messaggi = '[]'::jsonb),
  -- under 14: no message, no shared code
  constraint insight_chat_minore_senza_messaggi
    check (not minore_14 or (messaggi = '[]'::jsonb and codici_condivisi = '{}'::text[]))
);

create index insight_chat_username_idx on public.insight_chat (canale, username);
create index insight_chat_ultimo_idx on public.insight_chat (canale, ultimo_il desc);
create index insight_chat_letta_idx on public.insight_chat (letta_il);
create index insight_chat_letta_da_idx on public.insight_chat (letta_da);
create index insight_chat_origine_giorno_idx on public.insight_chat (origine_giorno)
  where origine_giorno is not null;

comment on table public.insight_chat is
  'The latest state of each Instagram and Messenger conversation the Insight read: up to 25 messages of the last 30 days (third-party DM text), the origin of the lead (a post and a day, D26), Claude''s latest target. No session ever reads or writes it (insight_chat_nessuna_sessione): only the service role. Non-leads and under-14 chats keep no messages; a failed run leaves none (insight_scarta_letture). Never in the backup.';

create trigger insight_chat_set_updated_at
  before update on public.insight_chat
  for each row execute function public.set_updated_at();

alter table public.insight_chat enable row level security;
revoke all on public.insight_chat from anon;
revoke all on public.insight_chat from authenticated;

create policy insight_chat_nessuna_sessione on public.insight_chat
  for all to authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- 4. insight_profili: the Instagram profile cache (no session reads it)
-- ---------------------------------------------------------------------------
create table public.insight_profili (
  username text primary key
    constraint insight_profili_username check (username ~ '^[a-z0-9._]{1,30}$'),
  utente_id text
    constraint insight_profili_utente_id check (utente_id ~ '^[0-9]{1,30}$'),
  nome text
    constraint insight_profili_nome check (char_length(nome) <= 120),
  follower integer
    constraint insight_profili_follower check (follower >= 0),
  verificato boolean,
  ti_segue boolean,
  lo_segui boolean,
  letto_il timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.insight_profili is
  'Instagram profiles of the people who write (name, followers, who follows whom), a cache of the Insight. No session ever reads or writes it (insight_profili_nessuna_sessione): only the service role. Deleted 30 days after it was read. Never in the backup.';

create trigger insight_profili_set_updated_at
  before update on public.insight_profili
  for each row execute function public.set_updated_at();

alter table public.insight_profili enable row level security;
revoke all on public.insight_profili from anon;
revoke all on public.insight_profili from authenticated;

create policy insight_profili_nessuna_sessione on public.insight_profili
  for all to authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- 5. insight_blocchi: the units of AI work of a run (no session reads them)
-- ---------------------------------------------------------------------------
create table public.insight_blocchi (
  id uuid primary key default gen_random_uuid(),
  esecuzione_id uuid not null references public.insight_esecuzioni (id) on delete cascade,
  canale public.insight_canale not null,
  tipo text not null
    constraint insight_blocchi_tipo check (tipo in ('schede', 'riattivazione', 'agenda', 'correzione', 'sintesi')),
  indice integer not null
    constraint insight_blocchi_indice check (indice >= 0),
  -- conversazione_id (schede, riattivazione) or call_id (agenda)
  chiavi text[] not null default '{}',
  stato text not null default 'da_fare'
    constraint insight_blocchi_stato check (stato in ('da_fare', 'in_corso', 'fatto', 'fallito')),
  tentativi integer not null default 0
    constraint insight_blocchi_tentativi check (tentativi between 0 and 10),
  -- sintesi and correzione outputs
  risultato jsonb,
  usage jsonb,
  servito_da_fallback boolean not null default false,
  -- an error code only (rate_limit, timeout, refusal:…, json, schema,
  -- max_tokens, interrotto, …), never an exception message
  errore text
    constraint insight_blocchi_errore check (char_length(errore) <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint insight_blocchi_unico unique (esecuzione_id, canale, tipo, indice)
);

comment on table public.insight_blocchi is
  'The units of AI work of an Insight run. A block left in_corso by a dead invocation goes back to da_fare at the next step (insight_prendi_passo), and fails at 3 attempts. No session ever reads or writes it (insight_blocchi_nessuna_sessione). Deleted with its run.';

create trigger insight_blocchi_set_updated_at
  before update on public.insight_blocchi
  for each row execute function public.set_updated_at();

alter table public.insight_blocchi enable row level security;
revoke all on public.insight_blocchi from anon;
revoke all on public.insight_blocchi from authenticated;

create policy insight_blocchi_nessuna_sessione on public.insight_blocchi
  for all to authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- 6. insight_schede: Claude's validated cards (no session reads them)
-- ---------------------------------------------------------------------------
create table public.insight_schede (
  id uuid primary key default gen_random_uuid(),
  esecuzione_id uuid not null references public.insight_esecuzioni (id) on delete cascade,
  giorno date not null,
  canale public.insight_canale not null,
  tipo text not null
    constraint insight_schede_tipo check (tipo in ('lead', 'non_lead', 'riattivazione', 'agenda', 'show_up')),
  -- conversazione_id or call_id
  chiave text not null
    constraint insight_schede_chiave check (char_length(chiave) between 1 and 200),
  -- sha-256 of what Claude read: an unchanged chat reuses its card
  impronta text not null
    constraint insight_schede_impronta check (impronta ~ '^[0-9a-f]{64}$'),
  dati jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint insight_schede_unica unique (esecuzione_id, canale, tipo, chiave)
);

create index insight_schede_impronta_idx on public.insight_schede (giorno, canale, impronta);
-- the last closure of an under-14 chat (D25 step 4)
create index insight_schede_chiave_idx on public.insight_schede (canale, chiave);

comment on table public.insight_schede is
  'Claude''s validated cards of an Insight run, one per chat or call. No session ever reads or writes it (insight_schede_nessuna_sessione). Deleted with its run.';

create trigger insight_schede_set_updated_at
  before update on public.insight_schede
  for each row execute function public.set_updated_at();

alter table public.insight_schede enable row level security;
revoke all on public.insight_schede from anon;
revoke all on public.insight_schede from authenticated;

create policy insight_schede_nessuna_sessione on public.insight_schede
  for all to authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- 7. insight_recap: the documents the page renders
-- ---------------------------------------------------------------------------
create table public.insight_recap (
  -- the Rome day
  giorno date not null,
  canale public.insight_canale not null,
  esecuzione_id uuid references public.insight_esecuzioni (id) on delete set null,
  generato_il timestamptz not null,
  stato text not null
    constraint insight_recap_stato check (stato in ('completo', 'parziale')),
  -- the artifact's document (lib/insight/recap.ts)
  dati jsonb not null
    constraint insight_recap_dati check (jsonb_typeof(dati) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (giorno, canale)
);

comment on table public.insight_recap is
  'The Insight''s documents, one per Rome day and channel (lib/insight/recap.ts): leads with their chats (messages of the last 30 days, each with its instant), reactivations, objections, agenda, contents. Read by the admin and every active setter (insight_puo_leggere). Written only by the service role, always with an upsert on (giorno, canale), never delete-and-insert: a delete takes that day''s Fatto rows with it. Deleted 30 days after its day. Never in the backup.';

create trigger insight_recap_set_updated_at
  before update on public.insight_recap
  for each row execute function public.set_updated_at();

alter table public.insight_recap enable row level security;
revoke all on public.insight_recap from anon;
revoke insert, update, delete, truncate on public.insight_recap from authenticated;

create policy insight_recap_lettura on public.insight_recap
  for select to authenticated
  using (public.insight_puo_leggere());

-- ---------------------------------------------------------------------------
-- 8. insight_fatto: the Fatto switches, shared
-- ---------------------------------------------------------------------------
create table public.insight_fatto (
  -- a surrogate key: Realtime sends a DELETE's old primary key to every
  -- subscriber of the table (RLS cannot apply to deleted rows), so a lead's
  -- username must never be part of it
  id uuid primary key default gen_random_uuid(),
  giorno date not null,
  canale public.insight_canale not null,
  chiave text not null check (char_length(chiave) between 1 and 200),
  fatto boolean not null,
  constraint insight_fatto_una_per_chat unique (giorno, canale, chiave),
  constraint insight_fatto_recap foreign key (giorno, canale)
    references public.insight_recap (giorno, canale) on delete cascade
);

comment on table public.insight_fatto is
  'The Fatto switches of the Insight: a shared checklist per recap (day, channel) and lead key, never an activity log (CLAUDE.md section 17): deliberately no created_by and no timestamps. Admin and every active setter read, insert and update (an upsert on giorno, canale, chiave); nobody deletes. Goes with its recap. The surrogate key keeps usernames out of Realtime''s DELETE events.';

alter table public.insight_fatto enable row level security;
revoke all on public.insight_fatto from anon;
revoke delete, truncate on public.insight_fatto from authenticated;

create policy insight_fatto_lettura on public.insight_fatto
  for select to authenticated
  using (public.insight_puo_leggere());

create policy insight_fatto_inserimento on public.insight_fatto
  for insert to authenticated
  with check (public.insight_puo_leggere());

create policy insight_fatto_modifica on public.insight_fatto
  for update to authenticated
  using (public.insight_puo_leggere())
  with check (public.insight_puo_leggere());

alter publication supabase_realtime add table public.insight_fatto;

-- ---------------------------------------------------------------------------
-- 9. messenger_collegamento: the Facebook Page (one row; the token in Vault)
-- ---------------------------------------------------------------------------
create table public.messenger_collegamento (
  -- one row only
  id boolean primary key default true
    constraint messenger_collegamento_una_riga check (id),
  pagina_id text
    constraint messenger_collegamento_pagina_id check (pagina_id ~ '^[0-9]{1,30}$'),
  pagina_nome text
    constraint messenger_collegamento_pagina_nome check (char_length(pagina_nome) <= 120),
  token_aggiornato_il timestamptz,
  -- never the token: messenger_errore blanks it
  ultimo_errore text
    constraint messenger_collegamento_errore check (char_length(ultimo_errore) <= 500),
  ultimo_errore_il timestamptz,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.messenger_collegamento is
  'The Facebook Page whose Messenger chats the Insight reads (one row): its id and name, when the token was saved, the last error. Admin reads; written only by the messenger_* functions. The token is in Vault (messenger_imposta_token), never here.';

insert into public.messenger_collegamento (id) values (true);

create trigger messenger_collegamento_set_updated_at
  before update on public.messenger_collegamento
  for each row execute function public.set_updated_at();

alter table public.messenger_collegamento enable row level security;
revoke all on public.messenger_collegamento from anon;
revoke insert, update, delete, truncate on public.messenger_collegamento from authenticated;

create policy messenger_collegamento_admin_lettura on public.messenger_collegamento
  for select to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- 10. messenger_esclusi: Messenger chats never read (admin only)
-- ---------------------------------------------------------------------------
create table public.messenger_esclusi (
  -- the PSID
  utente_id text primary key
    constraint messenger_esclusi_utente_id check (utente_id ~ '^[0-9]{1,30}$'),
  nome text not null
    constraint messenger_esclusi_nome check (btrim(nome) <> '' and char_length(nome) <= 120),
  motivo text
    constraint messenger_esclusi_motivo check (char_length(motivo) <= 120),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.messenger_esclusi is
  'Messenger chats the Insight never stores nor sends to Claude (clients, friends, services), picked by the admin from the latest chats. Admin only.';

create trigger messenger_esclusi_set_updated_at
  before update on public.messenger_esclusi
  for each row execute function public.set_updated_at();

alter table public.messenger_esclusi enable row level security;
revoke all on public.messenger_esclusi from anon;
-- truncate skips RLS
revoke truncate on public.messenger_esclusi from authenticated;

create policy messenger_esclusi_admin on public.messenger_esclusi
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- The key of the steps: pg_net sends it, the route checks it. In Vault, never
-- inlined in a cron command; insight_ruota_chiave() changes it.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from vault.secrets s where s.name = 'insight_chiave') then
    perform vault.create_secret(encode(extensions.gen_random_bytes(32), 'hex'), 'insight_chiave',
      'Chiave dei passi dell''Insight 24h');
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- The backup: every table of public but the insight_* ones
-- ---------------------------------------------------------------------------
-- le tabelle insight_* hanno testi di DM di terzi da tenere al massimo 30
-- giorni: il backup settimanale, mandato per email e scaricabile, non le
-- prende mai. instagram_contenuti_dm, messenger_collegamento e
-- messenger_esclusi restano nel backup (nessun testo di DM).
create or replace function public.backup_completo()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_risultato jsonb := '{}'::jsonb;
  v_tabella text;
  v_righe jsonb;
begin
  for v_tabella in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname not like 'insight\_%'
    order by c.relname
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', v_tabella)
      into v_righe;
    v_risultato := v_risultato || jsonb_build_object(v_tabella, v_righe);
  end loop;
  return v_risultato;
end;
$$;

comment on function public.backup_completo() is
  'service_role only: every table of public read at the time of the call (a table added later is never forgotten), the Instagram proposals included (08/10/2026), never the insight_* tables (third-party DM text kept at most 30 days, 1.35.0). Never the tokens: they are in Vault.';

revoke all on function public.backup_completo() from public, anon, authenticated;
grant execute on function public.backup_completo() to service_role;

-- ---------------------------------------------------------------------------
-- instagram_contenuti (1.33.0): only its comment changes
-- ---------------------------------------------------------------------------
comment on table public.instagram_contenuti is
  'The posts and reels of the connected Instagram account (Dany''s own public media: never comments, likes, DMs or lead data), one row per media. Listed by the morning run of 1.33.0 (service role) and by the Insight (1.35.0), which also writes the latest statistics of the posts of the last 14 days. Read by admin, video editor and marketing. 1.36.0 adds the statistics history. The leads per post and day are in instagram_contenuti_dm.';
