-- Post di Instagram e calendario (Dany, 09/10/2026, 1.33.0). `instagram_contenuti`
-- nasce qui: 1.34.0 e 1.35.0 la riusano e non la ricreano.
--
-- Dany: «per quanto riguarda i link devi semplicemente prenderli dal mio profilo
-- instagram e matcharli con i contenuti ad oggi online; volendo si può collegare
-- e linkare il post da instagram per fare comunicare le due parti».
--
-- Every night (cron contenuti-instagram) and with "Aggiorna da Instagram" the
-- listing run reads the posts and reels of the connected account (Dany's own
-- public media: never comments, likes, DMs or lead data) with the token already
-- in Vault, stores them in instagram_contenuti and links them to the calendar
-- (lib/marketing/abbinamento.ts): when it is sure it writes the post's permalink
-- in marketing_contenuti.url (a Posted content without URL, never Status or
-- Post Date), otherwise it leaves proposals for a person ("Da collegare").
-- A person who undoes a link leaves a "no" the run never redoes; the sign
-- "Collegato da solo" waits 10 minutes with the "no", for the toast's «Annulla».
--
-- Order: tables, functions, trigger, views, RLS and grants, comments.
-- The three link tables have no updated_at nor created_by on purpose: their rows
-- are written and deleted, never updated, and the app never says who linked a
-- post (section 17).

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

-- One row per post or reel of the connected account (Dany's own media, no lead
-- data). Written only by the service role (the listing run); read by the
-- Marketing area. The statistics columns are filled from 1.35.0 on.
create table public.instagram_contenuti (
  media_id text primary key
    constraint instagram_contenuti_media_id check (media_id ~ '^[0-9]{1,30}$'),
  shortcode text not null
    constraint instagram_contenuti_shortcode_unico unique
    constraint instagram_contenuti_shortcode check (shortcode ~ '^[A-Za-z0-9_-]{5,40}$'),
  permalink text not null
    constraint instagram_contenuti_permalink
    check (char_length(permalink) <= 500 and permalink ~ '^https://(www\.)?instagram\.com/\S+$'),
  media_type text not null
    constraint instagram_contenuti_media_type check (media_type in ('IMAGE', 'VIDEO', 'CAROUSEL_ALBUM')),
  media_product_type text   -- null when Instagram does not give it (Instagram Login)
    constraint instagram_contenuti_product_type check (media_product_type in ('FEED', 'REELS', 'AD', 'STORY')),
  reel boolean not null,     -- REELS, or a video / a /reel/ permalink when the type is missing
  pubblicato_il timestamptz not null,
  didascalia text            -- null: no caption, or Instagram did not give it
    constraint instagram_contenuti_didascalia check (char_length(didascalia) <= 2200),
  -- the cover: thumbnail_url (video) or media_url (photo, carousel); a signed CDN
  -- URL that expires, renewed at every run. Never the video's media_url.
  copertina_url text
    constraint instagram_contenuti_copertina check (char_length(copertina_url) <= 2000 and copertina_url ~ '^https://\S+$'),
  audio_tipo text constraint instagram_contenuti_audio check (audio_tipo in ('MUSIC', 'ORIGINAL_SOUND')),
  -- numbers: null = Instagram did not give it, never 0 for "missing"
  like_count integer check (like_count >= 0),
  comments_count integer check (comments_count >= 0),
  views integer check (views >= 0), reach integer check (reach >= 0),
  saved integer check (saved >= 0), shares integer check (shares >= 0),
  likes integer check (likes >= 0), comments integer check (comments >= 0),
  total_interactions integer check (total_interactions >= 0), reposts integer check (reposts >= 0),
  avg_watch_ms integer check (avg_watch_ms >= 0), view_total_ms bigint check (view_total_ms >= 0),
  skip_rate numeric(6,4) check (skip_rate between 0 and 1),
  follows integer check (follows >= 0), profile_visits integer check (profile_visits >= 0),
  metriche_il timestamptz,
  metriche_stato text not null default 'da_leggere'
    constraint instagram_contenuti_metriche_stato
    check (metriche_stato in ('da_leggere', 'lette', 'senza_permesso', 'prima_della_conversione', 'non_disponibili')),
  letto_il timestamptz not null default now(),   -- the last listing that returned it
  eliminato_il timestamptz,                      -- missing from a complete listing: deleted or archived
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index instagram_contenuti_pubblicato_idx on public.instagram_contenuti (pubblicato_il desc);
create trigger instagram_contenuti_set_updated_at before update on public.instagram_contenuti
  for each row execute function public.set_updated_at();

-- The listing run: one row. The lease (giro_*) keeps one run at a time; the
-- last run's outcome is what the page and Impostazioni › Instagram show.
-- 1.35.0 adds its columns here with alter table and uses the same lease.
create table public.instagram_contenuti_stato (
  id boolean primary key default true constraint instagram_contenuti_stato_una_riga check (id),
  account_username text constraint instagram_contenuti_stato_username check (account_username ~ '^[a-z0-9._]{1,30}$'),
  giro_id uuid, giro_dal timestamptz,
  giro_motivo text constraint instagram_contenuti_stato_motivo check (giro_motivo in ('notte', 'manuale')),
  ultimo_giro_il timestamptz,
  ultimo_giro_esito text constraint instagram_contenuti_stato_esito check (ultimo_giro_esito in ('ok', 'parziale', 'fallito')),
  -- the last run's reason, copied from giro_motivo by fine_giro: "Aggiornati stanotte" or "alle 10:12"
  ultimo_giro_motivo text
    constraint instagram_contenuti_stato_ultimo_motivo check (ultimo_giro_motivo in ('notte', 'manuale')),
  -- why the last run did not end ok (lib/instagram/sincronizza-contenuti.ts, CausaContenuti):
  -- only 'senza_token' and 'token' let "Aggiorna da Instagram" start again at once
  ultimo_giro_causa text constraint instagram_contenuti_stato_causa
    check (ultimo_giro_causa in ('senza_token', 'token', 'limite', 'rete', 'tempo', 'meta', 'database')),
  ultimo_giro_letti integer check (ultimo_giro_letti >= 0),
  ultimo_giro_collegati integer check (ultimo_giro_collegati >= 0),
  ultimo_giro_proposti integer check (ultimo_giro_proposti >= 0),
  campi text constraint instagram_contenuti_stato_campi
    check (campi in ('completi', 'senza_tipo', 'senza_didascalia', 'minimi')),   -- what Instagram gave last time
  ultimo_errore text constraint instagram_contenuti_stato_errore check (char_length(ultimo_errore) <= 500),
  ultimo_errore_il timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint instagram_contenuti_stato_giro
    check ((giro_id is null) = (giro_dal is null) and (giro_id is null) = (giro_motivo is null))
);
insert into public.instagram_contenuti_stato default values on conflict do nothing;
create trigger instagram_contenuti_stato_set_updated_at before update on public.instagram_contenuti_stato
  for each row execute function public.set_updated_at();

-- Proposals and automatic links, computed by the run (lib/marketing/abbinamento.ts).
-- 'proposto': rewritten at every run. 'automatico': kept while the content still
-- has that post (the sign "Collegato da solo"), and for 10 minutes after a
-- person unlinked it (the "no" of the pair), so that «Annulla» finds it again.
-- Service role only: no session ever writes a sign.
create table public.marketing_abbinamenti (
  shortcode text not null references public.instagram_contenuti (shortcode) on delete cascade,
  contenuto_id uuid not null references public.marketing_contenuti (id) on delete cascade,
  esito text not null constraint marketing_abbinamenti_esito check (esito in ('automatico', 'proposto')),
  punteggio smallint not null check (punteggio between 0 and 100),
  somiglianza numeric(4,3) not null check (somiglianza between 0 and 1),
  giorni smallint check (giorni between 0 and 366),        -- null: the content has no Post Date
  motivi text[] not null default '{}'
    constraint marketing_abbinamenti_motivi
    check (motivi <@ array['stessa_data', 'giorno_vicino', 'didascalia_simile', 'unico_del_giorno']::text[]),
  calcolato_il timestamptz not null default now(),
  primary key (shortcode, contenuto_id)
);
create index marketing_abbinamenti_contenuto_idx on public.marketing_abbinamenti (contenuto_id);

-- "Non è questo": a pair a person undid. Never proposed or linked again by the run.
-- Written by the trigger below (and deleted by "Annulla"). No FK on the shortcode:
-- a URL typed by hand can name a post the run has not read. created_at is the
-- moment of the "no" (sessions never write it: column grants below): within 10
-- minutes the pair's sign "Collegato da solo" waits for an «Annulla».
create table public.marketing_abbinamenti_rifiutati (
  shortcode text not null
    constraint marketing_abbinamenti_rifiutati_shortcode check (shortcode ~ '^[A-Za-z0-9_-]{5,40}$'),
  contenuto_id uuid not null references public.marketing_contenuti (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (shortcode, contenuto_id)
);
create index marketing_abbinamenti_rifiutati_contenuto_idx on public.marketing_abbinamenti_rifiutati (contenuto_id);

-- "Non va nel calendario": a post with no content on purpose (a repost, a personal post).
create table public.marketing_post_esclusi (
  shortcode text primary key references public.instagram_contenuti (shortcode) on delete cascade,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- 2. Functions (service role only: the listing run)
-- ---------------------------------------------------------------------------

-- Takes the lease. A lease younger than 6 minutes (more than the cron's
-- maxDuration) belongs to a run still going: {"rifiutato":"in_corso","dal":…}.
-- "Aggiorna da Instagram" within 5 minutes of the end of the last run:
-- {"rifiutato":"appena_fatto","il":…,"esito":…} (the toast says "Ultimo tentativo"
-- after a failed run, never "Aggiornato"). Only a run that failed for the token
-- (none, or refused: causes 'senza_token' and 'token') never makes the next tap
-- wait, so the admin who pasted it tries again at once; a run that failed for
-- Meta's limits, the network, Meta or the database waits the 5 minutes too
-- (the token is shared with the night's DM report). Otherwise {"giro": uuid}.
create function public.instagram_contenuti_inizia_giro(p_motivo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_stato public.instagram_contenuti_stato;
  v_giro uuid;
begin
  if p_motivo is null or p_motivo not in ('notte', 'manuale') then
    raise exception 'Motivo del giro non valido.' using errcode = '22023';
  end if;

  -- the migration created the row; a hand-cleaned database gets it back
  insert into public.instagram_contenuti_stato default values on conflict do nothing;
  select * into v_stato from public.instagram_contenuti_stato s where s.id for update;

  if v_stato.giro_id is not null and v_stato.giro_dal > now() - interval '6 minutes' then
    return jsonb_build_object('rifiutato', 'in_corso', 'dal', v_stato.giro_dal);
  end if;
  if p_motivo = 'manuale' and v_stato.ultimo_giro_il is not null
     and not coalesce(v_stato.ultimo_giro_esito = 'fallito'
                      and v_stato.ultimo_giro_causa in ('senza_token', 'token'), false)
     and v_stato.ultimo_giro_il > now() - interval '5 minutes' then
    return jsonb_build_object('rifiutato', 'appena_fatto', 'il', v_stato.ultimo_giro_il, 'esito', v_stato.ultimo_giro_esito);
  end if;

  v_giro := gen_random_uuid();
  update public.instagram_contenuti_stato s
  set giro_id = v_giro, giro_dal = now(), giro_motivo = p_motivo
  where s.id;
  return jsonb_build_object('giro', v_giro);
end;
$$;

-- Ends the run that holds the lease (false: the lease expired and another run
-- took it, nothing written). Records the outcome and its cause and frees the
-- lease. The error never keeps the token: the stored token, any access_token=
-- and any long token-like run of characters are blanked, as in
-- instagram_errore. Values out of range never keep the lease taken: counts are
-- clamped, an unknown level of fields or an invalid account name leave the
-- previous one, an unknown cause is stored as none (and makes the next manual
-- run wait).
create function public.instagram_contenuti_fine_giro(
  p_giro uuid,
  p_esito text,
  p_letti integer,
  p_collegati integer,
  p_proposti integer,
  p_campi text,
  p_account text,
  p_errore text,
  p_causa text default null
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
  v_account text := lower(ltrim(btrim(coalesce(p_account, '')), '@'));
begin
  if p_giro is null then
    return false;
  end if;
  if p_esito is null or p_esito not in ('ok', 'parziale', 'fallito') then
    raise exception 'Esito del giro non valido.' using errcode = '22023';
  end if;

  if p_esito = 'ok' then
    v_errore := '';
  elsif v_errore <> '' then
    select s.decrypted_secret into v_token
    from vault.decrypted_secrets s
    where s.name = 'instagram_token';
    if v_token is not null and v_token <> '' then
      v_errore := replace(v_errore, v_token, '[token]');
    end if;
    v_errore := regexp_replace(v_errore, 'access_token=[^&[:space:]"'']*', 'access_token=[token]', 'gi');
    v_errore := regexp_replace(v_errore, '[A-Za-z0-9_-]{40,}', '[token]', 'g');
    v_errore := left(v_errore, 500);
  end if;

  update public.instagram_contenuti_stato s
  set ultimo_giro_il = now(),
      ultimo_giro_esito = p_esito,
      ultimo_giro_motivo = s.giro_motivo,
      ultimo_giro_causa = case
                            when p_esito <> 'ok'
                                 and p_causa in ('senza_token', 'token', 'limite', 'rete', 'tempo', 'meta', 'database')
                              then p_causa
                          end,
      ultimo_giro_letti = case when p_letti is null then null else greatest(p_letti, 0) end,
      ultimo_giro_collegati = case when p_collegati is null then null else greatest(p_collegati, 0) end,
      ultimo_giro_proposti = case when p_proposti is null then null else greatest(p_proposti, 0) end,
      campi = case
                when p_campi in ('completi', 'senza_tipo', 'senza_didascalia', 'minimi') then p_campi
                else s.campi
              end,
      account_username = case
                           when v_account ~ '^[a-z0-9._]{1,30}$' then v_account
                           else s.account_username
                         end,
      ultimo_errore = nullif(v_errore, ''),
      ultimo_errore_il = case when v_errore = '' then null else now() end,
      giro_id = null,
      giro_dal = null,
      giro_motivo = null
  where s.id and s.giro_id = p_giro;
  return found;
end;
$$;

-- After a complete listing only: the media published since p_dal that the
-- listing did not return are deleted or archived on Instagram. They stay, marked.
-- A media that comes back is unmarked by the run's upsert (eliminato_il = null).
create function public.instagram_contenuti_segna_eliminati(p_dal timestamptz, p_presenti text[])
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_righe integer;
begin
  if p_dal is null then
    raise exception 'Manca il giorno da cui contare.' using errcode = '22023';
  end if;
  update public.instagram_contenuti i
  set eliminato_il = now()
  where i.pubblicato_il >= p_dal
    and i.eliminato_il is null
    and not (i.media_id = any (coalesce(array_remove(p_presenti, null), '{}'::text[])));
  get diagnostics v_righe = row_count;
  return v_righe;
end;
$$;

-- The contents the run can link: no URL yet, not Canceled. Sections cut at 3000
-- characters: the run never downloads 30.000 characters per row.
create function public.marketing_contenuti_per_abbinamento()
returns table (
  id uuid,
  tipo public.contenuto_tipo,
  stato public.contenuto_status,
  post_date date,
  nome text,
  bozza text,
  finale text,
  messaggio text
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id, m.tipo, m.stato, m.post_date, m.nome,
         left(m.bozza, 3000), left(m.finale, 3000), left(m.messaggio, 3000)
  from public.marketing_contenuti m
  where m.url is null and m.stato <> 'canceled'
  order by m.post_date desc nulls last, m.id;
$$;

-- The run links a post by itself: only a Posted content still without URL, a
-- pair nobody refused, a post neither excluded, deleted nor on another content.
-- Writes only url (the permalink, so instagram_shortcode), never Status or Post
-- Date, and the 'automatico' row ("Collegato da solo"). False: nothing written.
create function public.instagram_collega_da_solo(
  p_shortcode text, p_contenuto uuid, p_punteggio smallint, p_somiglianza numeric, p_giorni smallint, p_motivi text[]
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_permalink text;
  v_shortcode text;
begin
  select i.permalink into v_permalink
  from public.instagram_contenuti i
  where i.shortcode = p_shortcode and i.eliminato_il is null;
  if v_permalink is null
     or exists (select 1 from public.marketing_post_esclusi e where e.shortcode = p_shortcode)
     or exists (select 1 from public.marketing_abbinamenti_rifiutati r
                where r.shortcode = p_shortcode and r.contenuto_id = p_contenuto)
     or exists (select 1 from public.marketing_contenuti m where m.instagram_shortcode = p_shortcode) then
    return false;
  end if;
  begin
    -- only a Posted content still without a URL: a person who typed one meanwhile wins
    update public.marketing_contenuti m set url = v_permalink
    where m.id = p_contenuto and m.url is null and m.stato = 'posted'
    returning m.instagram_shortcode into v_shortcode;
    if not found then
      return false;
    end if;
    if v_shortcode is distinct from p_shortcode then
      raise exception 'permalink' using errcode = 'P0001';   -- rolled back below: never a wrong link
    end if;
    insert into public.marketing_abbinamenti (shortcode, contenuto_id, esito, punteggio, somiglianza, giorni, motivi)
    values (p_shortcode, p_contenuto, 'automatico', p_punteggio, p_somiglianza, p_giorni, coalesce(p_motivi, '{}'))
    on conflict (shortcode, contenuto_id) do update set esito = 'automatico', punteggio = excluded.punteggio,
      somiglianza = excluded.somiglianza, giorni = excluded.giorni, motivi = excluded.motivi, calcolato_il = now();
    return true;
  exception
    when unique_violation or raise_exception then
      return false;   -- the post went to another content meanwhile
  end;
end;
$$;

-- The proposals of a run, in one go: every 'proposto' row goes, the 'automatico'
-- rows whose content no longer has that post go (unless a person unlinked it
-- less than 10 minutes ago: the sign waits for «Annulla»), the new proposals come in
-- (jsonb array of {shortcode, contenuto_id, punteggio, somiglianza, giorni,
-- motivi}; the table's checks validate them). Skipped: a refused pair, an
-- excluded, deleted or already linked post, a content with a URL or Canceled,
-- a row that names nothing. Two calls (the night and a person's tap) never mix:
-- they wait for each other. Returns how many proposals it wrote.
create function public.instagram_salva_proposte(p_proposte jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_proposte jsonb := coalesce(p_proposte, '[]'::jsonb);
  v_righe integer;
begin
  if jsonb_typeof(v_proposte) <> 'array' then
    raise exception 'Le proposte sono un elenco.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.instagram_salva_proposte'));

  delete from public.marketing_abbinamenti a where a.esito = 'proposto';
  delete from public.marketing_abbinamenti a
  where a.esito = 'automatico'
    and not exists (select 1 from public.marketing_contenuti m
                    where m.id = a.contenuto_id and m.instagram_shortcode = a.shortcode)
    -- «Scollega» less than 10 minutes ago: the sign waits for its «Annulla» (trigger below)
    and not exists (select 1 from public.marketing_abbinamenti_rifiutati r
                    where r.shortcode = a.shortcode and r.contenuto_id = a.contenuto_id
                      and r.created_at > now() - interval '10 minutes' and r.created_at <= now());

  insert into public.marketing_abbinamenti (shortcode, contenuto_id, esito, punteggio, somiglianza, giorni, motivi)
  select x.shortcode, x.contenuto_id, 'proposto', x.punteggio, x.somiglianza, x.giorni, coalesce(x.motivi, '{}')
  from jsonb_to_recordset(v_proposte) as x(
    shortcode text, contenuto_id uuid, punteggio smallint, somiglianza numeric, giorni smallint, motivi text[]
  )
  join public.instagram_contenuti i on i.shortcode = x.shortcode and i.eliminato_il is null
  join public.marketing_contenuti m on m.id = x.contenuto_id and m.url is null and m.stato <> 'canceled'
  where not exists (select 1 from public.marketing_abbinamenti_rifiutati r
                    where r.shortcode = x.shortcode and r.contenuto_id = x.contenuto_id)
    and not exists (select 1 from public.marketing_post_esclusi e where e.shortcode = x.shortcode)
    and not exists (select 1 from public.marketing_contenuti c where c.instagram_shortcode = x.shortcode)
  on conflict (shortcode, contenuto_id) do nothing;
  get diagnostics v_righe = row_count;
  return v_righe;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Trigger: the "no" of a person
-- ---------------------------------------------------------------------------
-- After a session changes a content's URL: the post it had is refused for that
-- content (the run never proposes or links it again), from now; the post it
-- gets now is no longer refused. The sign "Collegato da solo" is the run's
-- and only the run's: a post the content gets from a person keeps it only
-- when it is the same post a person unlinked from it less than 10 minutes ago
-- («Annulla» of «Scollega»: the 'automatico' row waited with the "no", see
-- instagram_salva_proposte), otherwise the pair's 'automatico' row goes, so a
-- link made by hand never shows it. Nothing of the sign ever comes from the
-- session. Sessions only: the run, the restore and the import write nothing
-- here. AFTER: the generated instagram_shortcode is computed.
create function public.marketing_contenuti_post_scollegato()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return null;
  end if;
  if old.instagram_shortcode is not null and old.instagram_shortcode is distinct from new.instagram_shortcode then
    insert into public.marketing_abbinamenti_rifiutati (shortcode, contenuto_id)
    values (old.instagram_shortcode, new.id)
    on conflict (shortcode, contenuto_id) do update set created_at = now();
  end if;
  if new.instagram_shortcode is not null then
    if new.instagram_shortcode is distinct from old.instagram_shortcode
       and not exists (select 1 from public.marketing_abbinamenti_rifiutati r
                       where r.shortcode = new.instagram_shortcode and r.contenuto_id = new.id
                         and r.created_at > now() - interval '10 minutes' and r.created_at <= now()) then
      delete from public.marketing_abbinamenti a
      where a.shortcode = new.instagram_shortcode and a.contenuto_id = new.id and a.esito = 'automatico';
    end if;
    delete from public.marketing_abbinamenti_rifiutati r
    where r.shortcode = new.instagram_shortcode and r.contenuto_id = new.id;
  end if;
  return null;
end;
$$;

create trigger marketing_contenuti_post_scollegato
  after update of url on public.marketing_contenuti
  for each row execute function public.marketing_contenuti_post_scollegato();

-- ---------------------------------------------------------------------------
-- 4. Views (security_invoker: the reader's RLS)
-- ---------------------------------------------------------------------------
-- The proposals still worth a tap: a superseded one (post linked meanwhile,
-- content with a URL or Canceled, pair refused, post excluded or gone) is hidden
-- at once, without waiting for the next run.
create view public.v_marketing_proposte with (security_invoker = true) as
select a.shortcode, a.contenuto_id, a.punteggio, a.somiglianza, a.giorni, a.motivi, a.calcolato_il,
       m.nome, m.tipo, m.stato, m.post_date
from public.marketing_abbinamenti a
join public.instagram_contenuti i on i.shortcode = a.shortcode and i.eliminato_il is null
join public.marketing_contenuti m on m.id = a.contenuto_id and m.url is null and m.stato <> 'canceled'
where a.esito = 'proposto'
  and not exists (select 1 from public.marketing_contenuti x where x.instagram_shortcode = a.shortcode)
  and not exists (select 1 from public.marketing_post_esclusi e where e.shortcode = a.shortcode)
  and not exists (select 1 from public.marketing_abbinamenti_rifiutati r
                  where r.shortcode = a.shortcode and r.contenuto_id = a.contenuto_id);

-- Every post with its content (if any) and where it stands. "Da collegare" =
-- stato_collegamento in ('proposto', 'senza_contenuto'). The posts older than
-- the calendar (its first Post Date minus 3 days) stay for 1.35.0 and are not work.
create view public.v_instagram_post with (security_invoker = true) as
with inizio as (
  select min(m.post_date) - 3 as dal from public.marketing_contenuti m where m.stato <> 'canceled'
)
select i.media_id, i.shortcode, i.permalink, i.media_type, i.reel, i.pubblicato_il,
       (i.pubblicato_il at time zone 'Europe/Rome')::date as giorno,
       i.didascalia, i.copertina_url, i.eliminato_il,
       m.id as contenuto_id, m.nome as contenuto_nome, m.stato as contenuto_stato, m.post_date as contenuto_post_date,
       (a.shortcode is not null) as collegato_da_solo, a.motivi as motivi_collegamento,
       case
         when m.id is not null then 'collegato'
         when i.eliminato_il is not null then 'eliminato'
         when e.shortcode is not null then 'escluso'
         when inizio.dal is null or (i.pubblicato_il at time zone 'Europe/Rome')::date < inizio.dal then 'prima_del_calendario'
         when exists (select 1 from public.v_marketing_proposte p where p.shortcode = i.shortcode) then 'proposto'
         else 'senza_contenuto'
       end as stato_collegamento
from public.instagram_contenuti i
cross join inizio
left join public.marketing_contenuti m on m.instagram_shortcode = i.shortcode
left join public.marketing_abbinamenti a
  on a.shortcode = i.shortcode and a.contenuto_id = m.id and a.esito = 'automatico'
left join public.marketing_post_esclusi e on e.shortcode = i.shortcode;

-- ---------------------------------------------------------------------------
-- 5. RLS and grants
-- ---------------------------------------------------------------------------
-- Admin, video editor and marketing (vede_marketing()) read everything here;
-- setter, closer, coach, nutrizione, dev and deactivated accounts read nothing.
-- Posts, the run's state and the run's links: written only by the service role
-- and the functions above. Refusals and excluded posts: the Marketing area's
-- people add and remove them (no update: a row is written or deleted).
alter table public.instagram_contenuti enable row level security;
alter table public.instagram_contenuti_stato enable row level security;
alter table public.marketing_abbinamenti enable row level security;
alter table public.marketing_abbinamenti_rifiutati enable row level security;
alter table public.marketing_post_esclusi enable row level security;

revoke all on public.instagram_contenuti from anon;
revoke all on public.instagram_contenuti_stato from anon;
revoke all on public.marketing_abbinamenti from anon;
revoke all on public.marketing_abbinamenti_rifiutati from anon;
revoke all on public.marketing_post_esclusi from anon;
revoke all on public.v_marketing_proposte from anon;
revoke all on public.v_instagram_post from anon;

revoke insert, update, delete, truncate on public.instagram_contenuti from authenticated;
revoke insert, update, delete, truncate on public.instagram_contenuti_stato from authenticated;
revoke insert, update, delete, truncate on public.marketing_abbinamenti from authenticated;
-- truncate skips RLS; update has no policy and no use
revoke update, truncate on public.marketing_abbinamenti_rifiutati from authenticated;
revoke update, truncate on public.marketing_post_esclusi from authenticated;
-- a session writes the pair of a "no", never its moment (created_at: the 10
-- minutes in which the sign "Collegato da solo" waits for «Annulla»)
revoke insert on public.marketing_abbinamenti_rifiutati from authenticated;
grant insert (shortcode, contenuto_id) on public.marketing_abbinamenti_rifiutati to authenticated;

create policy instagram_contenuti_lettura on public.instagram_contenuti
  for select to authenticated using (public.vede_marketing());
create policy instagram_contenuti_stato_lettura on public.instagram_contenuti_stato
  for select to authenticated using (public.vede_marketing());
create policy marketing_abbinamenti_lettura on public.marketing_abbinamenti
  for select to authenticated using (public.vede_marketing());

create policy marketing_abbinamenti_rifiutati_lettura on public.marketing_abbinamenti_rifiutati
  for select to authenticated using (public.vede_marketing());
create policy marketing_abbinamenti_rifiutati_inserimento on public.marketing_abbinamenti_rifiutati
  for insert to authenticated with check (public.vede_marketing());
create policy marketing_abbinamenti_rifiutati_eliminazione on public.marketing_abbinamenti_rifiutati
  for delete to authenticated using (public.vede_marketing());

create policy marketing_post_esclusi_lettura on public.marketing_post_esclusi
  for select to authenticated using (public.vede_marketing());
create policy marketing_post_esclusi_inserimento on public.marketing_post_esclusi
  for insert to authenticated with check (public.vede_marketing());
create policy marketing_post_esclusi_eliminazione on public.marketing_post_esclusi
  for delete to authenticated using (public.vede_marketing());

revoke all on function public.instagram_contenuti_inizia_giro(text) from public, anon, authenticated;
grant execute on function public.instagram_contenuti_inizia_giro(text) to service_role;
revoke all on function public.instagram_contenuti_fine_giro(uuid, text, integer, integer, integer, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.instagram_contenuti_fine_giro(uuid, text, integer, integer, integer, text, text, text, text)
  to service_role;
revoke all on function public.instagram_contenuti_segna_eliminati(timestamptz, text[]) from public, anon, authenticated;
grant execute on function public.instagram_contenuti_segna_eliminati(timestamptz, text[]) to service_role;
revoke all on function public.marketing_contenuti_per_abbinamento() from public, anon, authenticated;
grant execute on function public.marketing_contenuti_per_abbinamento() to service_role;
revoke all on function public.instagram_collega_da_solo(text, uuid, smallint, numeric, smallint, text[])
  from public, anon, authenticated;
grant execute on function public.instagram_collega_da_solo(text, uuid, smallint, numeric, smallint, text[])
  to service_role;
revoke all on function public.instagram_salva_proposte(jsonb) from public, anon, authenticated;
grant execute on function public.instagram_salva_proposte(jsonb) to service_role;
revoke all on function public.marketing_contenuti_post_scollegato() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Comments
-- ---------------------------------------------------------------------------
comment on table public.instagram_contenuti is
  'The posts and reels of the connected Instagram account (Dany''s own public media: never comments, likes, DMs or lead data), one row per media, from the listing run (service role). Read by admin, video editor and marketing. Statistics columns empty until 1.35.0. Created in 1.33.0; 1.34.0 and 1.35.0 reuse it.';
comment on table public.instagram_contenuti_stato is
  'One row: the listing run''s lease (one run at a time) and the last run''s outcome, shown on Post di Instagram and in Impostazioni › Instagram. Written only by instagram_contenuti_inizia_giro and instagram_contenuti_fine_giro.';
comment on table public.marketing_abbinamenti is
  'Links computed by the run between posts and calendar contents: ''proposto'' (rewritten at every run) and ''automatico'' (the sign "Collegato da solo", kept while the content has that post, and for 10 minutes after a person unlinked it, for «Annulla»). Service role only: no session ever writes a sign. No updated_at nor created_by on purpose.';
comment on table public.marketing_abbinamenti_rifiutati is
  'A pair a person undid ("Scollega", or the URL changed by hand): the run never proposes or links it again. Written by the trigger marketing_contenuti_post_scollegato, removed by a manual link or "Annulla". created_at is the moment of the "no", never written by a session (column grants). No updated_at nor created_by on purpose (section 17).';
comment on table public.marketing_post_esclusi is
  '"Non va nel calendario": a post with no content on purpose. Added and removed by admin, video editor and marketing. No updated_at nor created_by on purpose (section 17).';
comment on view public.v_marketing_proposte is
  'The proposals still worth a tap, with the content''s name, type, Status and Post Date. Superseded ones are hidden at once.';
comment on view public.v_instagram_post is
  'Every post with its linked content (if any), "Collegato da solo" and stato_collegamento: collegato, eliminato, escluso, prima_del_calendario, proposto, senza_contenuto. "Da collegare" = proposto or senza_contenuto.';
comment on function public.instagram_contenuti_inizia_giro(text) is
  'service_role only: takes the listing run''s lease. {"giro": uuid}, or {"rifiutato": "in_corso", "dal"} (a lease younger than 6 minutes) or {"rifiutato": "appena_fatto", "il", "esito"} (manual run within 5 minutes of the end of the last run, unless it failed for the token: no token or token refused).';
comment on function public.instagram_contenuti_fine_giro(uuid, text, integer, integer, integer, text, text, text, text) is
  'service_role only: records the outcome of the run holding the lease, with its cause (none on ok), and frees it (false: the lease is someone else''s). The error is stored with the token blanked out, at most 500 characters; none on ok.';
comment on function public.instagram_contenuti_segna_eliminati(timestamptz, text[]) is
  'service_role only, after a complete listing: marks as deleted the media published since p_dal that the listing did not return. Returns how many.';
comment on function public.marketing_contenuti_per_abbinamento() is
  'service_role only: the contents without URL and not Canceled, with Bozza, Final and Messaggio cut at 3000 characters, for the matching.';
comment on function public.instagram_collega_da_solo(text, uuid, smallint, numeric, smallint, text[]) is
  'service_role only: writes the post''s permalink in a Posted content without URL (never Status or Post Date) and the ''automatico'' row, unless the pair is refused or the post is excluded, deleted or already linked. False: nothing written.';
comment on function public.instagram_salva_proposte(jsonb) is
  'service_role only: replaces every ''proposto'' row with the given ones (refused pairs, excluded, deleted or linked posts, contents with a URL or Canceled skipped) and drops the ''automatico'' rows whose content lost that post, except those unlinked by a person less than 10 minutes ago (the sign waits for «Annulla»). Returns how many it wrote.';
comment on function public.marketing_contenuti_post_scollegato() is
  'After a session changes a content''s URL: the post it had becomes a refused pair (from now), the post it has now is no longer refused. The sign "Collegato da solo" of the new pair stays only if a person unlinked that same post from that content less than 10 minutes ago («Annulla»); otherwise it goes: a link by hand never shows it. No session (the run, a restore, the import): nothing.';
