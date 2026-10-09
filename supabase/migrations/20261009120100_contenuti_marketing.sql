-- The content calendar (Dany, 08/10/2026): Notion's "📸 Instagram Posts DANYMONTA"
-- with the same properties and labels (English, lib/marketing/etichette.ts).
-- One row = one Notion page, built from the "Reel Topic" or "Carousel Topic"
-- template (tipo). Read and written by the admin, the video editor and marketing;
-- deleted by the admin and marketing (the editor sets "Canceled").
-- Team text only: never DMs, leads or money.

create type public.contenuto_tipo as enum ('reel', 'carousel');
create type public.contenuto_reel_type as enum ('attraction', 'education', 'converting', 'radio', 'workshop');
create type public.contenuto_format as enum (
  'text_opinion', 'check_caption', 'split', 'reaction', 'b_roll',
  'green_screen', 'raw_talking_head', 'storytelling', 'transformation', 'show_and_tell'
);
-- workflow order (sorting); the menu shows Notion's groups and order (etichette.ts)
create type public.contenuto_status as enum (
  'not_started', 'to_be_recorded', 'to_be_edited', 'to_be_posted', 'posted', 'canceled'
);

create or replace function public.vede_marketing()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_role() in ('admin', 'editor', 'marketing'), false);
$$;
comment on function public.vede_marketing() is
  'The Marketing area: the admin, the video editor and marketing, active (current_role() checks role and account).';
revoke all on function public.vede_marketing() from public, anon;
grant execute on function public.vede_marketing() to authenticated;

create table public.marketing_contenuti (
  id uuid primary key default gen_random_uuid(),
  tipo public.contenuto_tipo not null default 'reel',
  nome text not null
    constraint marketing_contenuti_nome check (btrim(nome) <> '' and char_length(nome) <= 300),
  reel_type public.contenuto_reel_type,
  formato public.contenuto_format,
  inspiration text
    constraint marketing_contenuti_inspiration
    check (inspiration is null or (char_length(inspiration) <= 500 and inspiration ~ '^https?://\S+$')),
  stato public.contenuto_status not null default 'not_started',
  post_date date,
  audio text
    constraint marketing_contenuti_audio check (audio is null or (btrim(audio) <> '' and char_length(audio) <= 200)),
  url text
    constraint marketing_contenuti_url
    check (url is null or (char_length(url) <= 500 and url ~ '^https?://\S+$')),
  view_count integer
    constraint marketing_contenuti_view_count check (view_count is null or view_count >= 0),
  messaggio text constraint marketing_contenuti_messaggio check (messaggio is null or char_length(messaggio) <= 30000),
  bozza     text constraint marketing_contenuti_bozza     check (bozza     is null or char_length(bozza)     <= 30000),
  commenti  text constraint marketing_contenuti_commenti  check (commenti  is null or char_length(commenti)  <= 30000),
  finale    text constraint marketing_contenuti_finale    check (finale    is null or char_length(finale)    <= 30000),
  -- the published post's shortcode, from URL (never Inspiration: other creators' reels).
  -- The join key with Insight's permalinks (1.33.0) and Instagram media (1.34.0);
  -- lib/marketing/shortcode.ts is the same regex. Not a shortcode: /share/ links
  -- (a redirect token) and /reels/audio/ pages.
  instagram_shortcode text generated always as (
    substring(url from '^https?://(?:www\.|m\.)?(?:instagram\.com|instagr\.am)/(?!share/)(?:[A-Za-z0-9._]+/)?(?:p|reels?|tv)/(?!audio/)([A-Za-z0-9_-]{5,40})')
  ) stored,
  notion_page_id uuid constraint marketing_contenuti_notion unique,  -- the imported page: idempotency and "Apri in Notion"
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index marketing_contenuti_post_date_idx on public.marketing_contenuti (post_date desc nulls last, created_at desc);
create index marketing_contenuti_stato_idx on public.marketing_contenuti (stato);
-- one row per published post: the same URL on two rows is an error the form explains (23505)
create unique index marketing_contenuti_shortcode_idx on public.marketing_contenuti (instagram_shortcode)
  where instagram_shortcode is not null;

create trigger marketing_contenuti_set_updated_at
  before update on public.marketing_contenuti
  for each row execute function public.set_updated_at();

-- Who created it and which Notion page it came from are the truth (same rule as
-- clienti_cartelle_autore, 20261005110000): whoever is not the admin gets his own
-- id and now() on insert, no Notion page, and cannot change them (nor the id) on
-- update. The admin (the import runs as Dany), the seed, the restore and the
-- service role are free; elimina_persona and unisci_profili run as the admin.
create or replace function public.marketing_contenuti_autore()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.created_at := now();
    new.notion_page_id := null;
  else
    new.id := old.id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.notion_page_id := old.notion_page_id;
  end if;
  return new;
end;
$$;
comment on function public.marketing_contenuti_autore() is
  'marketing_contenuti: whoever is not the admin cannot write id (on update), created_by, created_at or notion_page_id.';
revoke all on function public.marketing_contenuti_autore() from public, anon, authenticated;

create trigger marketing_contenuti_autore
  before insert or update on public.marketing_contenuti
  for each row execute function public.marketing_contenuti_autore();

alter table public.marketing_contenuti enable row level security;
revoke all on public.marketing_contenuti from anon;

create policy marketing_contenuti_lettura on public.marketing_contenuti
  for select to authenticated using (public.vede_marketing());
create policy marketing_contenuti_inserimento on public.marketing_contenuti
  for insert to authenticated with check (public.vede_marketing());
create policy marketing_contenuti_modifica on public.marketing_contenuti
  for update to authenticated using (public.vede_marketing()) with check (public.vede_marketing());
-- the video editor does not delete: he sets "Canceled" (open question 1;
-- mirrored by RUOLI_ELIMINA_CONTENUTI in lib/marketing/permessi.ts)
create policy marketing_contenuti_eliminazione on public.marketing_contenuti
  for delete to authenticated using (coalesce(public.current_role() in ('admin', 'marketing'), false));

-- One section of a content, saved only over the text the person started from
-- (md5 of the text the page showed; '' for null). Two people on two sections never
-- block each other; two on the same section never overwrite text they have not seen.
-- Invoker: RLS decides which rows exist (no row: 'sparito').
-- Normalisation: leading blank lines and trailing whitespace go; the first line's
-- indentation stays (it is Markdown). Only spaces = null.
create or replace function public.salva_sezione_contenuto(
  p_id uuid, p_campo text, p_testo text, p_impronta text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_trovato boolean;
  v_attuale text;
  v_versione timestamptz;
  v_testo text := nullif(
    rtrim(regexp_replace(coalesce(p_testo, ''), '^([ \t]*\r?\n)+', ''), E' \t\r\n'),
    '');
begin
  if p_campo is null or p_campo not in ('messaggio', 'bozza', 'commenti', 'finale') then
    raise exception 'Sezione non valida.' using errcode = '22023';
  end if;
  if char_length(coalesce(v_testo, '')) > 30000 then
    raise exception 'Il testo supera i 30.000 caratteri: accorcialo.' using errcode = '22023';
  end if;

  execute format('select true, %I, updated_at from public.marketing_contenuti where id = $1 for update', p_campo)
    into v_trovato, v_attuale, v_versione using p_id;
  if v_trovato is null then
    return jsonb_build_object('esito', 'sparito');
  end if;
  if md5(coalesce(v_attuale, '')) is distinct from p_impronta then
    return jsonb_build_object('esito', 'cambiata', 'attuale', v_attuale,
      'impronta', md5(coalesce(v_attuale, '')), 'versione', v_versione);
  end if;
  if v_testo is distinct from v_attuale then
    execute format('update public.marketing_contenuti set %I = $1 where id = $2 returning updated_at', p_campo)
      into v_versione using v_testo, p_id;
  end if;
  return jsonb_build_object('esito', 'salvata', 'impronta', md5(coalesce(v_testo, '')), 'versione', v_versione);
end;
$$;
comment on function public.salva_sezione_contenuto(uuid, text, text, text) is
  'Saves one section (messaggio, bozza, commenti, finale) only over the text whose md5 the caller read. Returns {esito: salvata|cambiata|sparito, impronta, versione}.';
revoke all on function public.salva_sezione_contenuto(uuid, text, text, text) from public, anon;
grant execute on function public.salva_sezione_contenuto(uuid, text, text, text) to authenticated;

comment on table public.marketing_contenuti is
  'The content calendar: Notion''s "Instagram Posts DANYMONTA", one row per page (Reel Topic or Carousel Topic). Labels in lib/marketing/etichette.ts. Admin, video editor and marketing read and write; admin and marketing delete. Team text: never DMs, leads or money.';
