-- The weekly brief of the Marketing area, «Spunti» (1.37.0, CLAUDE.md section 31).
-- Dany, 14/10/2026: Claude crosses how the reels went, the setter's chats, the
-- calls and the feedback of setter and closer, and gives the Marketing area
-- themes, objections, questions and ideas ready for the calendar.
--
-- One row per brief: the validated output only (themes in words, no names, no
-- figures of people), counts of the sources, never who asked for it. Written
-- only by the service role and the call_* functions of the next migration; read
-- by admin, video editor and marketing. A Claude OAuth token (MCP) reads the
-- brief only through spunti_per_claude.

create table public.marketing_spunti (
  id uuid primary key default gen_random_uuid(),
  motivo text not null check (motivo in ('automatica', 'richiesta')),
  stato public.analisi_stato not null default 'in_coda',
  periodo_da date not null,
  periodo_a date not null,
  -- the validated output (lib/marketing/spunti/schema.ts) with the facts it quotes
  contenuto jsonb,
  -- counts and booleans of the sources only: {"reel_analizzati":9,"dm":true,"setting":true,"call":true,"note_team":true}
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
  constraint marketing_spunti_periodo check (periodo_a >= periodo_da),
  constraint marketing_spunti_pronta check ((stato = 'pronta') = (contenuto is not null)),
  constraint marketing_spunti_fallita check ((stato = 'fallita') = (errore is not null)),
  constraint marketing_spunti_finita check ((stato in ('in_coda', 'in_corso')) = (finita_il is null))
);
create unique index marketing_spunti_uno_aperto on public.marketing_spunti ((true)) where stato in ('in_coda', 'in_corso');
create index marketing_spunti_creata_idx on public.marketing_spunti (created_at desc);

create trigger marketing_spunti_set_updated_at before update on public.marketing_spunti
  for each row execute function public.set_updated_at();

alter table public.marketing_spunti enable row level security;
revoke all on public.marketing_spunti from anon;
revoke insert, update, delete, truncate on public.marketing_spunti from authenticated;

create policy marketing_spunti_lettura on public.marketing_spunti
  for select to authenticated using (public.vede_marketing());
create policy marketing_spunti_mai_da_oauth on public.marketing_spunti
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

comment on table public.marketing_spunti is
  'The weekly brief of the Marketing area written by Claude from reels, DMs, the setting and the calls: validated output only (no names, no euros, no health), counts of the sources, never who asked for it. Kept 26 weeks, except the briefs an idea of which is in the calendar. Written by the service role and the call_* functions; read by admin, video editor and marketing. In the backup.';

-- ---------------------------------------------------------------------------
-- The calendar: which content was born from an idea of a brief
-- ---------------------------------------------------------------------------
alter table public.marketing_contenuti
  add column da_spunti uuid references public.marketing_spunti (id) on delete set null,
  add column da_spunti_idea smallint constraint marketing_contenuti_da_spunti_idea check (da_spunti_idea between 0 and 11);
create unique index marketing_contenuti_spunti_idx on public.marketing_contenuti (da_spunti, da_spunti_idea)
  where da_spunti is not null;

comment on column public.marketing_contenuti.da_spunti is
  'The weekly brief whose idea this content was born from («Aggiungi al calendario»); null when the brief was pruned. Only the app''s action writes it.';

create function public.marketing_contenuti_spunti_coerenza()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_idee integer;
begin
  if tg_op = 'UPDATE'
     and new.da_spunti is not distinct from old.da_spunti and new.da_spunti_idea is not distinct from old.da_spunti_idea then
    return new;
  end if;
  if tg_op = 'INSERT' and new.da_spunti is null and new.da_spunti_idea is null then
    return new;
  end if;
  if public.da_client_oauth() then
    raise exception 'Il legame con un’idea degli spunti non si scrive da qui.' using errcode = '42501';
  end if;
  -- the service role, the seed, the restore: free
  if auth.uid() is null or public.is_admin() then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    raise exception 'Il legame con un’idea degli spunti non si cambia.' using errcode = '42501';
  end if;
  select jsonb_array_length(s.contenuto -> 'idee') into v_idee
  from public.marketing_spunti s where s.id = new.da_spunti and s.stato = 'pronta';
  if new.da_spunti is null or new.da_spunti_idea is null or v_idee is null or new.da_spunti_idea >= v_idee then
    raise exception 'Idea di Claude non valida.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.marketing_contenuti_spunti_coerenza() from public, anon, authenticated;

create trigger marketing_contenuti_spunti_coerenza
  before insert or update of da_spunti, da_spunti_idea on public.marketing_contenuti
  for each row execute function public.marketing_contenuti_spunti_coerenza();
