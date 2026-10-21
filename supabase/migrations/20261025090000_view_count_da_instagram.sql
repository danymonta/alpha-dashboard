-- View Count that fills and updates itself from Instagram (Dany, 25/10/2026: «le view
-- count sarebbe bello se le calcolasse e aggiornasse in automatico dalle API di
-- Instagram insight se ho caricato il link del reel»).
--
-- The post of Instagram a content is linked to is `instagram_contenuti` (read every
-- morning by the run, CLAUDE.md section 27; the link is the shortcode computed from the
-- content's URL). Its `views` are the content's View Count. Two paths, both
-- `security definer`, idempotent and without recursion:
--
--   1. instagram_contenuti_view_count: a post row is written, or its views change ->
--      View Count of the contents with the same shortcode.
--   2. marketing_contenuti_view_count_da_post: a content gets, changes or loses its
--      URL (its shortcode) -> it takes at once the views of its post if already read;
--      loses the link -> the number stays, the field is editable again.
--
-- Rules:
--   * views null = not read (the statistics permission is missing, or the run could not
--     read the post yet): the previous number stays, never overwritten with null.
--   * a content that is not linked, or linked to a post whose views are not read, keeps
--     the View Count written by hand and stays editable by hand.
--   * `view_count_da_instagram` is true exactly when the number comes from Instagram:
--     then a person cannot write the View Count (23514, in the app's words); only these
--     two paths and the migration's backfill write it, and the flag is never written
--     from a session. The seed, the import, the restore and the service role (no
--     session) are free, as for the other protected columns.
--   * the automatic refresh does NOT touch updated_at: updated_at is the content's
--     "version" for Claude (MCP: a hash of it) and for the panels, and an edit of a
--     person. A number the run rewrites every morning is not an edit: if it moved the
--     version, Claude would answer «cambiato» (and the panel would call the row newer)
--     about a content nobody touched. The write that only moves view_count and its flag
--     inside one of the two paths leaves updated_at as it was; every other update of
--     the table sets it as before. The paths mark themselves with the transaction-local
--     setting alpha.view_count_da_instagram, and the trigger checks that nothing else in
--     the row changed.

-- ---------------------------------------------------------------------------
-- 1. The flag
-- ---------------------------------------------------------------------------
alter table public.marketing_contenuti
  add column view_count_da_instagram boolean not null default false;

comment on column public.marketing_contenuti.view_count_da_instagram is
  'True when view_count is the views of the linked post of Instagram (instagram_contenuti.views): written only by the two view count triggers, never from a session; a person cannot change view_count while it is true.';

-- ---------------------------------------------------------------------------
-- 2. updated_at and the guard (replaces the plain set_updated_at trigger)
-- ---------------------------------------------------------------------------
-- Same trigger name, so it still fires after marketing_contenuti_autore and before the
-- others, as before. Insert too (the flag of a new row).
create or replace function public.marketing_contenuti_aggiorna()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_da_instagram boolean := coalesce(current_setting('alpha.view_count_da_instagram', true), '') = 'on';
  v_sessione boolean := (select auth.uid()) is not null;
begin
  if tg_op = 'INSERT' then
    -- a new row is never "from Instagram" by a person's hand
    if v_sessione and not v_da_instagram then
      new.view_count_da_instagram := false;
    end if;
    return new;
  end if;

  if v_da_instagram then
    -- one of the two paths: only the number and its flag may move, and then the version stays
    if (to_jsonb(new) - 'view_count' - 'view_count_da_instagram' - 'updated_at' - 'instagram_shortcode')
       is not distinct from
       (to_jsonb(old) - 'view_count' - 'view_count_da_instagram' - 'updated_at' - 'instagram_shortcode') then
      new.updated_at := old.updated_at;
      return new;
    end if;
    new.updated_at := now();
    return new;
  end if;

  if v_sessione then
    -- the flag is the database's alone, and a number that comes from Instagram is not written by hand
    new.view_count_da_instagram := old.view_count_da_instagram;
    if old.view_count_da_instagram and new.view_count is distinct from old.view_count then
      raise exception 'Il View Count di questo contenuto arriva da Instagram: si aggiorna da solo.'
        using errcode = '23514';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
comment on function public.marketing_contenuti_aggiorna() is
  'marketing_contenuti: updated_at on every edit, except the automatic refresh of view_count from Instagram; a number from Instagram is not written from a session (23514); the flag view_count_da_instagram is not written from a session.';
revoke all on function public.marketing_contenuti_aggiorna() from public, anon, authenticated;

drop trigger marketing_contenuti_set_updated_at on public.marketing_contenuti;
create trigger marketing_contenuti_set_updated_at
  before insert or update on public.marketing_contenuti
  for each row execute function public.marketing_contenuti_aggiorna();

-- ---------------------------------------------------------------------------
-- 3. Path 1: the post is read or its views change
-- ---------------------------------------------------------------------------
create or replace function public.instagram_contenuti_view_count()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- views null: not read, the number a content has stays
  if new.views is null then
    return null;
  end if;
  perform set_config('alpha.view_count_da_instagram', 'on', true);
  update public.marketing_contenuti m
     set view_count = new.views,
         view_count_da_instagram = true
   where m.instagram_shortcode = new.shortcode
     and (m.view_count is distinct from new.views or not m.view_count_da_instagram);
  perform set_config('alpha.view_count_da_instagram', '', true);
  return null;
end;
$$;
comment on function public.instagram_contenuti_view_count() is
  'A post of Instagram is written or its views change: the View Count of the contents linked to it (same shortcode). Never null, never touches updated_at.';
revoke all on function public.instagram_contenuti_view_count() from public, anon, authenticated;

create trigger instagram_contenuti_view_count
  after insert or update of views on public.instagram_contenuti
  for each row
  when (new.views is not null)
  execute function public.instagram_contenuti_view_count();

-- ---------------------------------------------------------------------------
-- 4. Path 2: a content gets, changes or loses its URL
-- ---------------------------------------------------------------------------
-- AFTER: the stored generated column instagram_shortcode is computed only after the
-- BEFORE triggers. The nested update only moves view_count and its flag, so it does not
-- fire this trigger again (update of url) and leaves updated_at as the outer write set it.
create or replace function public.marketing_contenuti_view_count_da_post()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_views integer;
begin
  if tg_op = 'UPDATE' and old.instagram_shortcode is not distinct from new.instagram_shortcode then
    return null;
  end if;
  if new.instagram_shortcode is not null then
    select i.views into v_views from public.instagram_contenuti i where i.shortcode = new.instagram_shortcode;
  end if;

  perform set_config('alpha.view_count_da_instagram', 'on', true);
  -- views not read (or no post, or no link): the number stays, and the field is editable by hand
  update public.marketing_contenuti m
     set view_count = coalesce(v_views, m.view_count),
         view_count_da_instagram = (v_views is not null)
   where m.id = new.id
     and (m.view_count_da_instagram is distinct from (v_views is not null)
          or m.view_count is distinct from coalesce(v_views, m.view_count));
  perform set_config('alpha.view_count_da_instagram', '', true);
  return null;
end;
$$;
comment on function public.marketing_contenuti_view_count_da_post() is
  'A content gets, changes or loses its URL: it takes the views of its post if already read; without a post or without views the number stays and the field is editable. Never touches updated_at.';
revoke all on function public.marketing_contenuti_view_count_da_post() from public, anon, authenticated;

create trigger marketing_contenuti_view_count_da_post
  after insert or update of url on public.marketing_contenuti
  for each row execute function public.marketing_contenuti_view_count_da_post();

-- ---------------------------------------------------------------------------
-- 5. Once: the contents already linked take their post's views now
-- ---------------------------------------------------------------------------
select set_config('alpha.view_count_da_instagram', 'on', true);
update public.marketing_contenuti m
   set view_count = i.views,
       view_count_da_instagram = true
  from public.instagram_contenuti i
 where i.shortcode = m.instagram_shortcode
   and i.views is not null;
select set_config('alpha.view_count_da_instagram', '', true);
