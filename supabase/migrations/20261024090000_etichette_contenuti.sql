-- Reel Type and Format as labels people create and colour, like Notion's select
-- properties (Dany, 21/10/2026: «uno può volendo creare anche nuove etichette proprio
-- come notion e soprattutto devono essere colorate per distinguere meglio i
-- contenuti»). Until now both were fixed enums (contenuto_reel_type,
-- contenuto_format, 20261009120100_contenuti_marketing.sql). From here they are
-- rows of marketing_opzioni, and marketing_contenuti points at them.
--
--   * marketing_opzioni: one row per option: the field it belongs to
--     (reel_type or formato), a stable slug (valore: what the contents, Claude's
--     analysis and the old enum values call it, never changes), the name people
--     read (renamed freely), one of Notion's ten colours and an order. Admin,
--     video editor and marketing read, create, rename and recolour; admin and
--     marketing delete, like the contents. A token of Claude (MCP) reads the
--     options (it needs the names to write a content) and never writes them.
--   * marketing_contenuti.reel_type and .formato become text and point at
--     (field, slug): a slug that is not an option is refused by the database
--     (23503), and deleting an option empties it from the contents that used it
--     (on delete set null on the slug only). The constant columns
--     reel_type_campo and formato_campo are the "field" half of the two foreign
--     keys (a composite key cannot take a constant), fixed by a check.
--   * The 15 options of the old enums are born with the same slugs, Notion's
--     names and one colour each; the Status stays the fixed enum (the workflow,
--     the Spunti, the MCP tools and the analysis depend on it).
--   * Everything that spoke the enum types speaks text now: analisi_fascia_lead
--     (new signature), analisi_numeri_set (the cast) and v_analisi_reel (a view
--     cannot follow a column that changes type: dropped and created again, the
--     same text). Then the two types are dropped.

-- ---------------------------------------------------------------------------
-- 1. The options
-- ---------------------------------------------------------------------------
create table public.marketing_opzioni (
  id uuid primary key default gen_random_uuid(),
  campo text not null
    constraint marketing_opzioni_campo check (campo in ('reel_type', 'formato')),
  valore text not null
    constraint marketing_opzioni_valore check (valore ~ '^[a-z0-9_]{1,60}$'),
  nome text not null
    constraint marketing_opzioni_nome check (nome = btrim(nome) and char_length(nome) between 1 and 60),
  colore text not null default 'default'
    constraint marketing_opzioni_colore check (
      colore in ('default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red')),
  ordine integer not null default 0,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint marketing_opzioni_valore_unico unique (campo, valore)
);
-- one name per field, whatever the case
create unique index marketing_opzioni_nome_unico on public.marketing_opzioni (campo, lower(nome));
create index marketing_opzioni_ordine_idx on public.marketing_opzioni (campo, ordine, nome);

create trigger marketing_opzioni_set_updated_at
  before update on public.marketing_opzioni
  for each row execute function public.set_updated_at();

-- The name is stored with single spaces; the slug and the field never change
-- (contents, the analysis and Claude point at them); whoever is not the admin
-- cannot write created_by or created_at (same rule as marketing_contenuti_autore).
-- No session (seed, import, restore, the migration itself): free.
create or replace function public.marketing_opzioni_stabile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.nome := btrim(regexp_replace(new.nome, '\s+', ' ', 'g'));
  if (select auth.uid()) is null then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if not public.is_admin() then
      new.created_by := (select auth.uid());
      new.created_at := now();
    end if;
    return new;
  end if;
  if new.campo is distinct from old.campo or new.valore is distinct from old.valore then
    raise exception 'Il codice di un’etichetta non cambia: si cambia il nome.' using errcode = '42501';
  end if;
  new.id := old.id;
  if not public.is_admin() then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;
comment on function public.marketing_opzioni_stabile() is
  'marketing_opzioni: the name with single spaces; field and slug never change; whoever is not the admin cannot write created_by or created_at.';
revoke all on function public.marketing_opzioni_stabile() from public, anon, authenticated;

create trigger marketing_opzioni_stabile
  before insert or update on public.marketing_opzioni
  for each row execute function public.marketing_opzioni_stabile();

alter table public.marketing_opzioni enable row level security;
revoke all on public.marketing_opzioni from anon;

create policy marketing_opzioni_lettura on public.marketing_opzioni
  for select to authenticated using ((select public.vede_marketing()));
create policy marketing_opzioni_inserimento on public.marketing_opzioni
  for insert to authenticated with check ((select public.vede_marketing()));
create policy marketing_opzioni_modifica on public.marketing_opzioni
  for update to authenticated using ((select public.vede_marketing())) with check ((select public.vede_marketing()));
-- like the contents: the video editor creates and recolours, he does not delete
create policy marketing_opzioni_eliminazione on public.marketing_opzioni
  for delete to authenticated using (coalesce((select public.current_role()) in ('admin', 'marketing'), false));

-- Claude (MCP, 20261010090000_mcp_oauth.sql) reads the options, to write a
-- content with the right label, and never writes them: vede_marketing() is true
-- for a live token of an admin, editor or marketing, so the three writes are
-- refused to any OAuth token here (and mcp_filtro_richiesta lets only GET and
-- HEAD through).
create policy marketing_opzioni_mai_da_oauth on public.marketing_opzioni
  as restrictive for insert to authenticated with check (not (select public.da_client_oauth()));
create policy marketing_opzioni_mai_da_oauth_modifica on public.marketing_opzioni
  as restrictive for update to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));
create policy marketing_opzioni_mai_da_oauth_eliminazione on public.marketing_opzioni
  as restrictive for delete to authenticated using (not (select public.da_client_oauth()));

comment on table public.marketing_opzioni is
  'The labels of Reel Type and Format of the content calendar, like Notion''s select options: field, stable slug, name, one of ten colours, order. Created and recoloured by admin, video editor and marketing; deleted by admin and marketing (the contents that used one lose it). Claude reads them, never writes.';

-- The options of the old enums: same slugs, Notion's names, one colour each
-- (the colours of Notion's screenshots where they were visible)
insert into public.marketing_opzioni (campo, valore, nome, colore, ordine) values
  ('reel_type', 'attraction', 'Attraction', 'blue', 10),
  ('reel_type', 'education', 'Education', 'yellow', 20),
  ('reel_type', 'converting', 'Converting', 'red', 30),
  ('reel_type', 'radio', 'RADIO', 'purple', 40),
  ('reel_type', 'workshop', 'Workshop', 'green', 50),
  ('formato', 'text_opinion', 'Text opinion', 'gray', 10),
  ('formato', 'check_caption', 'Check Caption', 'pink', 20),
  ('formato', 'split', 'Split', 'purple', 30),
  ('formato', 'reaction', 'Reaction', 'yellow', 40),
  ('formato', 'b_roll', 'B roll', 'orange', 50),
  ('formato', 'green_screen', 'Green Screen', 'green', 60),
  ('formato', 'raw_talking_head', 'Raw Talking Head', 'blue', 70),
  ('formato', 'storytelling', 'Storytelling', 'brown', 80),
  ('formato', 'transformation', 'Transformation', 'red', 90),
  ('formato', 'show_and_tell', 'Show&Tell', 'default', 100);

-- ---------------------------------------------------------------------------
-- 2. Creating an option, and how many contents use each
-- ---------------------------------------------------------------------------
-- "Create «x»" of the menu: the slug comes from the name (lower case, no
-- accents, underscores; "_2" when taken), the order after the last one, the
-- colour the next of a rotation unless given. Security invoker: the policies of
-- the table decide who may, an OAuth token is refused by the restrictive one.
create or replace function public.marketing_slug(p_nome text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      trim(both '_' from regexp_replace(
        lower(translate(replace(coalesce(p_nome, ''), '&', ' and '),
          'àáâäãèéêëìíîïòóôöõùúûüñçÀÁÂÄÃÈÉÊËÌÍÎÏÒÓÔÖÕÙÚÛÜÑÇ',
          'aaaaaeeeeiiiiooooouuuuncaaaaaeeeeiiiiooooouuuunc')),
        '[^a-z0-9]+', '_', 'g')),
      ''),
    'etichetta');
$$;
revoke all on function public.marketing_slug(text) from public, anon;
grant execute on function public.marketing_slug(text) to authenticated;

create or replace function public.crea_opzione_marketing(p_campo text, p_nome text, p_colore text default null)
returns public.marketing_opzioni
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_nome text := btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));
  v_base text;
  v_valore text;
  v_n integer := 1;
  v_colore text := p_colore;
  v_riga public.marketing_opzioni;
begin
  if p_campo is null or p_campo not in ('reel_type', 'formato') then
    raise exception 'Campo non valido.' using errcode = '22023';
  end if;
  if v_nome = '' then
    raise exception 'Scrivi il nome dell’etichetta.' using errcode = '22023';
  end if;
  if char_length(v_nome) > 60 then
    raise exception 'Il nome è lungo al massimo 60 caratteri.' using errcode = '22023';
  end if;
  if v_colore is not null and v_colore not in
     ('default', 'gray', 'brown', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink', 'red') then
    raise exception 'Colore non valido.' using errcode = '22023';
  end if;

  -- two people creating at the same moment: one after the other, so the slug and the order are free
  perform pg_advisory_xact_lock(hashtext('marketing_opzioni:' || p_campo));
  if exists (select 1 from public.marketing_opzioni o where o.campo = p_campo and lower(o.nome) = lower(v_nome)) then
    raise exception 'C’è già un’etichetta con questo nome.' using errcode = '23505';
  end if;

  v_base := left(public.marketing_slug(v_nome), 50);
  v_valore := v_base;
  while exists (select 1 from public.marketing_opzioni o where o.campo = p_campo and o.valore = v_valore) loop
    v_n := v_n + 1;
    v_valore := v_base || '_' || v_n;
  end loop;

  if v_colore is null then
    v_colore := (array['blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'red', 'brown', 'gray'])[
      1 + (select count(*)::integer from public.marketing_opzioni o where o.campo = p_campo) % 9];
  end if;

  insert into public.marketing_opzioni (campo, valore, nome, colore, ordine)
  values (p_campo, v_valore, v_nome, v_colore,
    coalesce((select max(o.ordine) from public.marketing_opzioni o where o.campo = p_campo), 0) + 10)
  returning * into v_riga;
  return v_riga;
end;
$$;
comment on function public.crea_opzione_marketing(text, text, text) is
  'Creates a Reel Type or Format option: slug from the name, order after the last one, colour given or the next of a rotation. Security invoker: RLS decides (admin, editor, marketing; never a Claude token).';
revoke all on function public.crea_opzione_marketing(text, text, text) from public, anon;
grant execute on function public.crea_opzione_marketing(text, text, text) to authenticated;

create or replace function public.conteggi_opzioni_marketing()
returns table (campo text, valore text, n integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select 'reel_type'::text, c.reel_type::text, count(*)::integer
  from public.marketing_contenuti c where c.reel_type is not null group by c.reel_type
  union all
  select 'formato'::text, c.formato::text, count(*)::integer
  from public.marketing_contenuti c where c.formato is not null group by c.formato;
$$;
comment on function public.conteggi_opzioni_marketing() is
  'How many contents use each option (only the ones used), for the filters and the question before deleting an option. Security invoker: the contents RLS lets the caller read.';
revoke all on function public.conteggi_opzioni_marketing() from public, anon;
grant execute on function public.conteggi_opzioni_marketing() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. From the enums to text
-- ---------------------------------------------------------------------------
-- the new analisi_fascia_lead first (analisi_numeri_set calls it with text)
create or replace function public.analisi_fascia_lead(
  p_dm integer, p_in_target integer, p_p75 numeric, p_reel_type text)
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
grant execute on function public.analisi_fascia_lead(integer, integer, numeric, text) to authenticated, service_role;
comment on function public.analisi_fascia_lead(integer, integer, numeric, text) is
  'The band of the leads of a reel: above with 2 or more in target (or above the 75th percentile of the comparison), below only for a Converting reel (slug converting) with no DM, otherwise in line. The Reel Type is the option''s slug.';

-- the view cannot follow the columns: dropped here, created again below (same text)
drop view public.v_analisi_reel;

-- analisi_numeri_set without the cast to the enum (the same function otherwise)
create or replace function public.analisi_numeri_set(p_media_ids text[] default null, p_eta smallint default null)
returns table (media_id text, num jsonb)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_eta is not null and p_eta not in (0, 3, 7) then
    raise exception 'L’età del confronto vale 3, 7 o 0.' using errcode = '22023';
  end if;

  return query
  with
  adesso as (
    select now() as ora, public.oggi() as oggi
  ),
  -- the comparison candidates: reels not deleted, with numbers read
  cand as materialized (
    select x.media_id, x.shortcode, x.pubblicato_il, (x.pubblicato_il at time zone 'Europe/Rome')::date as g,
           x.durata_ms, x.views, x.reach, x.saved, x.shares, x.avg_watch_ms
    from public.instagram_contenuti x
    where x.eliminato_il is null and (x.reel or x.media_type = 'VIDEO') and x.metriche_stato = 'lette'
  ),
  cv0 as (
    select c.media_id, 3::smallint as eta, 3 as w, c.shortcode, c.g, c.pubblicato_il, c.durata_ms,
           s.views, s.reach, s.saved, s.shares, s.avg_watch_ms
    from cand c
    join lateral (
      select m.views, m.reach, m.saved, m.shares, m.avg_watch_ms
      from public.instagram_contenuti_misure m
      where m.media_id = c.media_id and m.eta_ore between 60 and 108
      order by abs(m.eta_ore - 72), m.giorno limit 1
    ) s on true
    union all
    select c.media_id, 7::smallint, 7, c.shortcode, c.g, c.pubblicato_il, c.durata_ms,
           s.views, s.reach, s.saved, s.shares, s.avg_watch_ms
    from cand c
    join lateral (
      select m.views, m.reach, m.saved, m.shares, m.avg_watch_ms
      from public.instagram_contenuti_misure m
      where m.media_id = c.media_id and m.eta_ore between 144 and 216
      order by abs(m.eta_ore - 168), m.giorno limit 1
    ) s on true
    union all
    select c.media_id, 0::smallint, 14, c.shortcode, c.g, c.pubblicato_il, c.durata_ms,
           c.views, c.reach, c.saved, c.shares, c.avg_watch_ms
    from cand c, adesso a
    where c.pubblicato_il <= a.ora - interval '336 hours'
  ),
  cv as materialized (
    select v.*,
           (select coalesce(sum(d.lead_in_target), 0) from public.instagram_contenuti_dm d
            where d.shortcode = v.shortcode and d.giorno between v.g and v.g + v.w - 1) as tg,
           (v.g + v.w - 1 <= (select oggi from adesso) - 1
            and (select count(*) from public.instagram_contenuti_dm_giorni gg
                 where gg.giorno between v.g and v.g + v.w - 1) = v.w) as tg_contati
    from cv0 v
  ),
  -- the reels asked for, with their age and the comparison they use
  t0 as (
    select i.media_id, i.shortcode, i.pubblicato_il, i.metriche_stato, i.durata_ms, i.views, i.reach, i.saved,
           i.shares, i.avg_watch_ms, i.skip_rate,
           (i.pubblicato_il at time zone 'Europe/Rome')::date as g,
           floor(extract(epoch from (a.ora - i.pubblicato_il)) / 3600)::integer as ore
    from public.instagram_contenuti i, adesso a
    where (p_media_ids is null and (i.reel or i.media_type = 'VIDEO')) or i.media_id = any(p_media_ids)
  ),
  t1 as (
    select t0.*,
           (case
              when p_eta is not null then p_eta
              when t0.ore < 72 then null
              when t0.ore < 168 then 3
              when t0.ore < 336 then 7
              else 0
            end)::smallint as eta
    from t0
  ),
  t2 as (
    select t1.*,
           case t1.eta when 3 then 3 when 7 then 7 when 0 then 14 end as w
    from t1
  ),
  -- the reel's own numbers at that age
  t3 as (
    select t2.media_id, t2.shortcode, t2.pubblicato_il, t2.durata_ms, t2.g, t2.ore, t2.eta, t2.w,
           case
             when t2.eta in (3, 7) then s.views
             when t2.eta = 0 and t2.metriche_stato = 'lette' then t2.views
           end as o_views,
           case
             when t2.eta in (3, 7) then s.reach
             when t2.eta = 0 and t2.metriche_stato = 'lette' then t2.reach
           end as o_reach,
           case
             when t2.eta in (3, 7) then s.saved
             when t2.eta = 0 and t2.metriche_stato = 'lette' then t2.saved
           end as o_saved,
           case
             when t2.eta in (3, 7) then s.shares
             when t2.eta = 0 and t2.metriche_stato = 'lette' then t2.shares
           end as o_shares,
           case
             when t2.eta in (3, 7) then s.avg_watch_ms
             when t2.eta = 0 and t2.metriche_stato = 'lette' then t2.avg_watch_ms
           end as o_avg,
           case
             when t2.eta in (3, 7) then s.skip_rate
             when t2.eta = 0 and t2.metriche_stato = 'lette' then t2.skip_rate
           end as o_skip
    from t2
    left join lateral (
      select m.views, m.reach, m.saved, m.shares, m.avg_watch_ms, m.skip_rate
      from public.instagram_contenuti_misure m
      where t2.eta in (3, 7) and m.media_id = t2.media_id
        and m.eta_ore between (case t2.eta when 3 then 60 else 144 end) and (case t2.eta when 3 then 108 else 216 end)
      order by abs(m.eta_ore - (case t2.eta when 3 then 72 else 168 end)), m.giorno limit 1
    ) s on true
  ),
  -- the comparison reels: the other reels of the 90 days before this one, at the same age
  t4 as (
    select t3.*, k.n, k.med_views, k.med_salv, k.med_cond, k.med_vista, k.pct, k.p75
    from t3
    left join lateral (
      select count(x.views)::integer as n,
             (percentile_cont(0.5) within group (order by x.views))::numeric as med_views,
             (percentile_cont(0.5) within group (order by case when x.reach > 0 then x.saved::numeric / x.reach end))::numeric as med_salv,
             (percentile_cont(0.5) within group (order by case when x.reach > 0 then x.shares::numeric / x.reach end))::numeric as med_cond,
             (percentile_cont(0.5) within group
                (order by case when x.durata_ms > 0 then x.avg_watch_ms::numeric / x.durata_ms end))::numeric as med_vista,
             round(100.0 * count(*) filter (where x.views < t3.o_views) / nullif(count(x.views), 0))::integer as pct,
             (percentile_cont(0.75) within group (order by x.tg) filter (where x.tg_contati))::numeric as p75
      from cv x
      where x.eta = t3.eta and x.media_id <> t3.media_id
        and x.pubblicato_il < t3.pubblicato_il and x.pubblicato_il >= t3.pubblicato_il - interval '90 days'
    ) k on true
  ),
  t5 as (
    select t4.*,
           case when t4.eta is null then null
                when t4.n >= 8 then (case when t4.eta = 0 then 'vita_intera' else 'stessa_eta' end)
           end as modo,
           (t4.w is not null and t4.g + t4.w - 1 <= (select oggi from adesso) - 1
            and (select count(*) from public.instagram_contenuti_dm_giorni gg
                 where gg.giorno between t4.g and t4.g + t4.w - 1) = t4.w) as contati
    from t4
  ),
  t6 as (
    select t5.*,
           case when t5.o_reach > 0 then t5.o_saved::numeric / t5.o_reach end as tasso_salv,
           case when t5.o_reach > 0 then t5.o_shares::numeric / t5.o_reach end as tasso_cond,
           case when t5.durata_ms > 0 and t5.o_avg is not null then t5.o_avg::numeric / t5.durata_ms end as vista,
           l.dm, l.tg, l.chiamate,
           coalesce(
             (select m.reel_type from public.marketing_contenuti m where m.instagram_shortcode = t5.shortcode limit 1),
             (select case when (il.scheda -> 'classificazione' ->> 'reel_type') in
                              ('attraction', 'education', 'converting', 'radio', 'workshop')
                          then (il.scheda -> 'classificazione' ->> 'reel_type') end
              from public.instagram_letture il where il.media_id = t5.media_id)
           ) as reel_type
    from t5
    left join lateral (
      select coalesce(sum(d.dm), 0)::integer as dm, coalesce(sum(d.lead_in_target), 0)::integer as tg,
             coalesce(sum(d.call_prenotate), 0)::integer as chiamate
      from public.instagram_contenuti_dm d
      where t5.contati and d.shortcode = t5.shortcode and d.giorno between t5.g and t5.g + t5.w - 1
    ) l on true
  ),
  t7 as (
    select t6.*,
           case when t6.modo is not null and t6.med_views > 0 and t6.o_views is not null then t6.o_views / t6.med_views end as r_views,
           case when t6.modo is not null and t6.tasso_salv is not null and t6.med_salv > 0 then t6.tasso_salv / t6.med_salv end as r_salv,
           case when t6.modo is not null and t6.tasso_cond is not null and t6.med_cond > 0 then t6.tasso_cond / t6.med_cond end as r_cond,
           case when t6.modo is not null and t6.vista is not null and t6.med_vista > 0 then t6.vista / t6.med_vista end as r_vista
    from t6
  ),
  t8 as (
    select t7.*,
           case when t7.modo is not null
                then public.analisi_fascia_pubblico(t7.r_views, t7.r_salv, t7.r_cond) end as f_pubblico,
           case when t7.contati
                then public.analisi_fascia_lead(t7.dm, t7.tg, t7.p75, t7.reel_type) end as f_lead
    from t7
  )
  select t8.media_id,
    jsonb_build_object(
      'eta_ore', t8.ore,
      'eta', t8.eta,
      'eta_confronto', case when t8.modo = 'stessa_eta' then t8.eta end,
      'confronto', t8.modo,
      'reel_di_confronto', case when t8.eta is null then null else t8.n end,
      'views', t8.o_views, 'copertura', t8.o_reach, 'salvataggi', t8.o_saved, 'condivisioni', t8.o_shares,
      'visione_media_ms', t8.o_avg, 'skip_rate', t8.o_skip, 'durata_ms', t8.durata_ms,
      'views_mediana', t8.med_views,
      'tasso_salvataggi', case when t8.modo is not null then round(t8.tasso_salv, 4) end,
      'tasso_salvataggi_mediana', round(t8.med_salv, 4),
      'tasso_condivisioni', case when t8.modo is not null then round(t8.tasso_cond, 4) end,
      'tasso_condivisioni_mediana', round(t8.med_cond, 4),
      'quota_vista', case when t8.modo is not null then round(t8.vista, 4) end,
      'quota_vista_mediana', round(t8.med_vista, 4),
      'views_rapporto', round(t8.r_views, 2),
      'salvataggi_rapporto', round(t8.r_salv, 2),
      'condivisioni_rapporto', round(t8.r_cond, 2),
      'vista_rapporto', round(t8.r_vista, 2),
      'views_percentile', case when t8.modo is not null and t8.o_views is not null then t8.pct end,
      'fascia_pubblico', t8.f_pubblico,
      'fascia_lead', t8.f_lead,
      'verdetto', public.analisi_verdetto(t8.f_pubblico, t8.f_lead),
      'reel_type', t8.reel_type,
      'lead', jsonb_build_object(
        'finestra', case t8.w when 3 then 'primi 3 giorni' when 7 then 'primi 7 giorni' when 14 then 'primi 14 giorni' end,
        'contati', t8.contati,
        'dm', case when t8.contati then t8.dm end,
        'lead_in_target', case when t8.contati then t8.tg end,
        'call_prenotate', case when t8.contati then t8.chiamate end,
        'in_target_p75', case when t8.contati then round(t8.p75, 2) end
      )
    )
  from t8;
end;
$$;

grant execute on function public.analisi_numeri_set(text[], smallint) to authenticated, service_role;
revoke all on function public.analisi_numeri_set(text[], smallint) from anon, public;
comment on function public.analisi_numeri_set(text[], smallint) is
  'The numbers and verdict of the reels asked for (or of all the reels with null), computed once with set operations: the same rules as analisi_numeri_reel. One row per media found: {media_id, num}. Security invoker: the RLS of the caller on every table.';

-- the contents: text columns that point at the options
alter table public.marketing_contenuti
  alter column reel_type type text using reel_type::text,
  alter column formato type text using formato::text,
  add column reel_type_campo text not null default 'reel_type'
    constraint marketing_contenuti_reel_type_campo check (reel_type_campo = 'reel_type'),
  add column formato_campo text not null default 'formato'
    constraint marketing_contenuti_formato_campo check (formato_campo = 'formato');

alter table public.marketing_contenuti
  add constraint marketing_contenuti_reel_type_fkey
    foreign key (reel_type_campo, reel_type) references public.marketing_opzioni (campo, valore)
    on delete set null (reel_type),
  add constraint marketing_contenuti_formato_fkey
    foreign key (formato_campo, formato) references public.marketing_opzioni (campo, valore)
    on delete set null (formato);

comment on column public.marketing_contenuti.reel_type is
  'Reel Type: the slug of a marketing_opzioni option (campo reel_type); null when none, or when the option was deleted.';
comment on column public.marketing_contenuti.formato is
  'Format: the slug of a marketing_opzioni option (campo formato); null when none, or when the option was deleted.';
comment on column public.marketing_contenuti.reel_type_campo is
  'Constant: the field half of the foreign key to marketing_opzioni (a composite key cannot take a literal).';
comment on column public.marketing_contenuti.formato_campo is
  'Constant: the field half of the foreign key to marketing_opzioni (a composite key cannot take a literal).';

-- the view of the Analisi page, created again (text of 20261020090000)
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

-- the old signature and the two types go: nothing depends on them any more
drop function public.analisi_fascia_lead(integer, integer, numeric, public.contenuto_reel_type);
drop type public.contenuto_reel_type;
drop type public.contenuto_format;

-- ---------------------------------------------------------------------------
-- 4. Claude reads the options
-- ---------------------------------------------------------------------------
-- The Data API filter: a Claude token reaches the calendar, its options (read
-- only), mcp_chi_sono and the brief
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
       or (v_percorso = 'marketing_opzioni' and v_metodo in ('GET', 'HEAD'))   -- the labels: read only
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
  'PostgREST pre-request: an OAuth token (Claude) reaches only marketing_contenuti, marketing_opzioni (GET and HEAD), salva_sezione_contenuto (POST), spunti_per_claude and mcp_chi_sono, and raises the transaction-local flag alpha.mcp_filtro that mcp_chi_sono reports. The MCP allow-list: a later MCP tool adds its path here and in 00_schema.sql.';

comment on view public.v_analisi_reel is
  'One row per reel for the Analisi page: media, calendar content, numbers, comparison and verdict of today (from analisi_numeri_set, computed once), leads of the first 14 days (null when not counted), the reading, the last analysis and the score of the last ready analysis that has one (total, band, type).';
