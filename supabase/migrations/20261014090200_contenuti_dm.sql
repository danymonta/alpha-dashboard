-- The leads that arrive in the DMs from each of Dany's posts, per arrival day
-- (Dany, 10/10/2026: «incrocia lo status dei lead che stanno arrivando»).
-- Numbers only: never a name, a handle, a text or a time of day. Written by the
-- Insight (service role) for the last 30 days at every run; older days are
-- final. Outlives the 30-day deletion of the recaps; read by the reel analysis
-- (1.36.0). Not prefixed insight_: the weekly backup keeps it.
--
-- No created_by, created_at or updated_at, on purpose (like the link tables of
-- 1.33.0): rows are rewritten, never edited, and they say nothing about a
-- person (CLAUDE.md section 17).
create table public.instagram_contenuti_dm (
  shortcode text not null references public.instagram_contenuti (shortcode) on delete cascade,
  giorno date not null,                     -- the Rome day the lead's chat started
  dm integer not null check (dm > 0),       -- lead chats arrived from the post (both channels)
  lead_in_target integer not null check (lead_in_target between 0 and dm),
  call_prenotate integer not null check (call_prenotate between 0 and dm),   -- with a call in the app
  dm_certi integer not null check (dm_certi between 0 and dm),   -- by code: a shared link, a caption keyword or a story of the post
  calcolato_il timestamptz not null default now(),
  primary key (shortcode, giorno)
);
create index instagram_contenuti_dm_giorno_idx on public.instagram_contenuti_dm (giorno);

comment on table public.instagram_contenuti_dm is
  'The leads that arrived in the DMs (Instagram and Messenger) from each of Dany''s posts, per Rome arrival day: lead chats, those in target, those with a call in the app, and those attributed by code (a shared link, a caption keyword, a story of the post) rather than by Claude reading the text. Numbers only, never a name, handle, text or time of day; never non-leads, excluded chats or under-14 chats. Written only by instagram_contenuti_dm_salva (the Insight, service role) for the last 30 days; older days are final and outlive the recaps. Read by admin, video editor and marketing. In the backup.';
comment on column public.instagram_contenuti_dm.giorno is
  'The Rome day the lead''s chat started (its first message), not the day of the post.';
comment on column public.instagram_contenuti_dm.dm_certi is
  'Of dm, the chats attributed by code (condivisione, parola_chiave, or a story whose link is the post); the rest by Claude reading the text.';

alter table public.instagram_contenuti_dm enable row level security;
revoke all on public.instagram_contenuti_dm from anon;
revoke insert, update, delete, truncate on public.instagram_contenuti_dm from authenticated;

create policy instagram_contenuti_dm_lettura on public.instagram_contenuti_dm
  for select to authenticated
  using (public.vede_marketing());

-- Rewrites the counts of the days from greatest(today - 29, storico_dal) on, in
-- one transaction: the rows of p_righe within those days whose post is one of
-- Dany's; the others are skipped. Older days are final. Returns how many rows
-- it wrote.
create function public.instagram_contenuti_dm_salva(p_righe jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_oggi date := public.oggi();
  v_dal date;
  n integer;
begin
  if p_righe is null or jsonb_typeof(p_righe) <> 'array' then
    raise exception 'Le righe sono un elenco.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('alpha.instagram_contenuti_dm', 0));

  v_dal := greatest(v_oggi - 29,
                    coalesce((select i.storico_dal from public.insight_impostazioni i where i.id), v_oggi - 29));

  delete from public.instagram_contenuti_dm d where d.giorno >= v_dal;

  -- one row per post and day: the first one of p_righe wins
  insert into public.instagram_contenuti_dm (shortcode, giorno, dm, lead_in_target, call_prenotate, dm_certi, calcolato_il)
  select distinct on (r.shortcode, r.giorno)
         r.shortcode, r.giorno, r.dm, r.lead_in_target, r.call_prenotate, r.dm_certi, now()
  from jsonb_array_elements(p_righe) with ordinality as e(riga, n)
  cross join lateral jsonb_to_record(e.riga) as r(
         shortcode text, giorno date, dm integer, lead_in_target integer, call_prenotate integer, dm_certi integer)
  where jsonb_typeof(e.riga) = 'object'
    and r.giorno between v_dal and v_oggi
    and exists (select 1 from public.instagram_contenuti i where i.shortcode = r.shortcode)
  order by r.shortcode, r.giorno, e.n;
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.instagram_contenuti_dm_salva(jsonb) is
  'service_role only (the Insight): rewrites the counts per post of the days from greatest(today - 29, insight_impostazioni.storico_dal) to today with p_righe ([{shortcode, giorno, dm, lead_in_target, call_prenotate, dm_certi}]), skipping other days and posts not in instagram_contenuti. Older days are never touched. Returns the rows written.';

revoke all on function public.instagram_contenuti_dm_salva(jsonb) from public, anon, authenticated;
grant execute on function public.instagram_contenuti_dm_salva(jsonb) to service_role;
