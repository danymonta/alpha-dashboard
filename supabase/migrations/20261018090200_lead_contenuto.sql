-- The post a lead came from (1.37.0, CLAUDE.md section 31). Dany, 14/10/2026:
-- «performance delle call collegate» by the reel the lead comes from. The origin
-- is what the Insight (1.35.0) read in the DMs: a shared reel, a keyword of the
-- caption, a story. Written only by the app; the first origin found stays; read
-- only by the admin (the numbers by content pass through definer functions).
-- Nothing about the person: the public post and how it was recognised.

create table public.lead_contenuto (
  lead_id uuid primary key references public.leads on delete cascade,
  shortcode text references public.instagram_contenuti (shortcode) on delete cascade,
  come text not null check (come in ('condivisione', 'parola_chiave', 'storia', 'testo')),
  certo boolean not null,
  -- the Rome day the chat started
  giorno date not null,
  created_at timestamptz not null default now(),
  constraint lead_contenuto_post check (come = 'storia' or shortcode is not null)
);
create index lead_contenuto_shortcode_idx on public.lead_contenuto (shortcode);

alter table public.lead_contenuto enable row level security;
revoke all on public.lead_contenuto from anon;
revoke insert, update, delete, truncate on public.lead_contenuto from authenticated;
create policy lead_contenuto_admin on public.lead_contenuto
  for select to authenticated using (public.is_admin());
create policy lead_contenuto_mai_da_oauth on public.lead_contenuto
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

comment on table public.lead_contenuto is
  'The post a lead came from, as the Insight read it in the DMs (a shared reel, a caption keyword, a story): one row per lead, the first origin found stays. Nothing about the person. Written only by lead_contenuto_da_chat (a trigger on leads, and the Insight''s union step); read only by the admin; the numbers by content go through call_numeri_periodo. In the backup.';

-- One lead: looks for its chat in the Insight (Instagram, by handle) and writes the origin, once.
-- Only when the post is one of Dany's (a lead may have shared another account's reel).
create function public.lead_contenuto_da_chat(p_lead uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_handle text;
  c record;
begin
  if exists (select 1 from public.lead_contenuto x where x.lead_id = p_lead) then
    return;
  end if;
  select lower(ltrim(btrim(l.instagram_handle), '@')) into v_handle from public.leads l where l.id = p_lead;
  if v_handle is null or v_handle = '' then
    return;
  end if;
  select h.origine_tipo, h.origine_shortcode, h.origine_giorno into c
  from public.insight_chat h
  where h.canale = 'instagram' and h.username = v_handle and h.origine_tipo is not null and h.origine_giorno is not null
    and (h.origine_tipo = 'storia'
         or exists (select 1 from public.instagram_contenuti i where i.shortcode = h.origine_shortcode))
  order by h.origine_il nulls last
  limit 1;
  if not found then
    return;
  end if;
  insert into public.lead_contenuto (lead_id, shortcode, come, certo, giorno)
  values (p_lead,
          case when exists (select 1 from public.instagram_contenuti i where i.shortcode = c.origine_shortcode)
               then c.origine_shortcode end,
          c.origine_tipo, c.origine_tipo in ('condivisione', 'parola_chiave') or c.origine_shortcode is not null, c.origine_giorno)
  on conflict (lead_id) do nothing;
end;
$$;

-- The trigger runs inside fissa_call: a lead is never lost for its origin
create function public.leads_contenuto()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  begin
    perform public.lead_contenuto_da_chat(new.id);
  exception when others then
    raise warning 'lead_contenuto: origine non scritta (%)', sqlstate;
  end;
  return new;
end;
$$;

create trigger leads_contenuto
  after insert or update of instagram_handle on public.leads
  for each row execute function public.leads_contenuto();

-- The Insight's union step calls it for the leads of the last 30 days without an origin
create function public.lead_contenuto_da_insight()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select l.id from public.leads l
    where l.created_at >= now() - interval '30 days'
      and not exists (select 1 from public.lead_contenuto x where x.lead_id = l.id)
  loop
    perform public.lead_contenuto_da_chat(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function public.lead_contenuto_da_chat(uuid) from public, anon, authenticated;
revoke all on function public.leads_contenuto() from public, anon, authenticated;
revoke all on function public.lead_contenuto_da_insight() from public, anon, authenticated;
grant execute on function public.lead_contenuto_da_insight() to service_role;

-- the leads that are already there
do $$
declare
  r record;
begin
  for r in select l.id from public.leads l where l.instagram_handle is not null loop
    perform public.lead_contenuto_da_chat(r.id);
  end loop;
end;
$$;
