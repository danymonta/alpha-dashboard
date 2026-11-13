-- Guided onboarding, release B2 (1.81.0, «Il percorso fino al lancio»): the data
-- (docs/onboarding/rilascio-b.md, «Schema di B2», migration 5).
--
-- * clienti_call: the onboarding call and the checkpoints of a client. Outside the sales metrics (decision 6):
--   no function of the numbers reads it. The admin reads every row; the people in charge read them only from
--   the functions of 20261110090100_percorso_team.sql; nobody writes from a session.
-- * clienti_consegne: the materials of the single client (step 12): links, never files (decision 10). Read
--   and written like clienti_call.
-- * onboarding_impostazioni: the address of the booking page and the switch of the email to the client;
--   aperto_ai_clienti granted to the sessions, but a change of it passes only from onboarding_apri_ai_clienti
--   and onboarding_chiudi_ai_clienti (the mark alpha.onboarding_area), never from a direct PATCH that would
--   skip their checks.
-- * onboarding_video_visti: the seconds seen of a delivery of the coach too (consegna_id).
--
-- Every new table: RLS, nothing for anon, the restrictive <table>_mai_da_oauth, at least one permissive policy,
-- not in Realtime.

-- ---------------------------------------------------------------------------
-- 1. The calls of the onboarding and the checkpoints
-- ---------------------------------------------------------------------------
create table public.clienti_call (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  tipo text not null check (tipo in ('onboarding', 'checkpoint')),
  inizio timestamptz not null,
  durata_minuti integer not null default 30 check (durata_minuti between 5 and 180),
  meet_url text check (meet_url ~ '^https://meet\.google\.com/[^[:space:]]+$' and char_length(meet_url) <= 300),
  stato text not null default 'prenotata'
    check (stato in ('da_confermare', 'prenotata', 'svolta', 'non_presentato', 'annullata')),
  coach_id uuid references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- one onboarding call not cancelled per client
create unique index clienti_call_una_onboarding on public.clienti_call (client_id)
  where tipo = 'onboarding' and stato <> 'annullata';
create index clienti_call_client_idx on public.clienti_call (client_id, tipo, inizio);

comment on table public.clienti_call is
  'The onboarding call and the checkpoints of a client (1.81.0): outside the sales metrics. The admin reads them; the people in charge only from the onboarding functions; written only by the functions of the client and of the team.';

create trigger clienti_call_set_updated_at before update on public.clienti_call
  for each row execute function public.set_updated_at();

alter table public.clienti_call enable row level security;

create policy clienti_call_admin_lettura on public.clienti_call
  for select to authenticated using ((select public.is_admin()));
create policy clienti_call_mai_da_oauth on public.clienti_call
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

revoke all on public.clienti_call from anon;
revoke all on public.clienti_call from authenticated;
grant select on public.clienti_call to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The deliveries of the coach (step 12)
-- ---------------------------------------------------------------------------
create table public.clienti_consegne (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  tipo text not null check (tipo in ('video', 'pdf', 'link')),
  titolo text not null check (char_length(btrim(titolo)) between 1 and 120),
  youtube_id text check (youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  url text check (url ~ '^https://[^[:space:]]+$' and char_length(url) <= 500),
  -- only a video can be compulsory: it must be seen at 90%
  obbligatoria boolean not null default false,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint clienti_consegne_video check (tipo <> 'video' or youtube_id is not null),
  constraint clienti_consegne_link check (tipo = 'video' or url is not null),
  constraint clienti_consegne_obbligatoria check (not obbligatoria or tipo = 'video')
);
create index clienti_consegne_client_idx on public.clienti_consegne (client_id, created_at);

comment on table public.clienti_consegne is
  'The materials of a single client (1.81.0, step 12): a YouTube video, a shared PDF, a link; never a file. The admin reads them; the people in charge only from the onboarding functions; written only by the functions of the team.';

alter table public.clienti_consegne enable row level security;

create policy clienti_consegne_admin_lettura on public.clienti_consegne
  for select to authenticated using ((select public.is_admin()));
create policy clienti_consegne_mai_da_oauth on public.clienti_consegne
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

revoke all on public.clienti_consegne from anon;
revoke all on public.clienti_consegne from authenticated;
grant select on public.clienti_consegne to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The settings of B2
-- ---------------------------------------------------------------------------
alter table public.onboarding_impostazioni
  add column link_prenotazione text
    check (link_prenotazione ~ '^https://(calendar\.app\.google|calendar\.google\.com)/[^[:space:]]*$'
           and char_length(link_prenotazione) <= 500),
  add column avvisa_cliente_email boolean not null default true;

comment on column public.onboarding_impostazioni.link_prenotazione is
  'The booking page of the onboarding call and of the checkpoints (Google Calendar), shown to the client once the step «prenotazione» is unlocked.';
comment on column public.onboarding_impostazioni.avvisa_cliente_email is
  'When the client''s turn comes back, the app sends him the email «Tocca a te»; off, the team copies the message for Telegram.';

grant update (aperto_ai_clienti, link_prenotazione, avvisa_cliente_email) on public.onboarding_impostazioni to authenticated;

-- aperto_ai_clienti changes only from onboarding_apri_ai_clienti and onboarding_chiudi_ai_clienti: a direct PATCH
-- would skip the checks before opening. With the area open, the community and the booking page stay: a client at
-- those steps would be left without a link. Opening and closing are written in the audit log, with who did it
-- (onboarding_eventi is per client). No session: a migration, the seed.
create function public.onboarding_impostazioni_coerenza()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
begin
  if new.aperto_ai_clienti is distinct from old.aperto_ai_clienti
     and v_utente is not null
     and coalesce(current_setting('alpha.onboarding_area', true), '') <> 'on' then
    raise exception 'L''area clienti si apre e si chiude solo con «Apri ai clienti» e «Chiudi ai clienti».'
      using errcode = '42501';
  end if;
  if new.aperto_ai_clienti and v_utente is not null
     and (new.link_community is null or new.link_prenotazione is null) then
    raise exception 'Con l''area clienti aperta servono il link della community e la pagina di prenotazione: chiudi l''area prima di toglierli.'
      using errcode = '22023';
  end if;
  if new.aperto_ai_clienti is distinct from old.aperto_ai_clienti then
    if v_utente is not null and not exists (select 1 from public.profiles p where p.id = v_utente) then
      v_utente := null;
    end if;
    insert into public.audit_log (tabella, record_id, azione, utente_id, dati_prima, dati_dopo)
    values ('onboarding_impostazioni', null, 'update', v_utente,
            jsonb_build_object('aperto_ai_clienti', old.aperto_ai_clienti),
            jsonb_build_object('aperto_ai_clienti', new.aperto_ai_clienti));
  end if;
  return new;
end;
$$;
revoke all on function public.onboarding_impostazioni_coerenza() from public, anon, authenticated;

create trigger onboarding_impostazioni_coerenza before update on public.onboarding_impostazioni
  for each row execute function public.onboarding_impostazioni_coerenza();

-- ---------------------------------------------------------------------------
-- 4. The seconds seen of a delivery
-- ---------------------------------------------------------------------------
alter table public.onboarding_video_visti
  add column consegna_id uuid references public.clienti_consegne (id) on delete cascade;

alter table public.onboarding_video_visti drop constraint onboarding_video_visti_cosa;
alter table public.onboarding_video_visti
  add constraint onboarding_video_visti_cosa check (num_nonnulls(blocco_id, consegna_id) = 1);

create unique index onboarding_video_visti_consegna on public.onboarding_video_visti (client_id, consegna_id)
  where consegna_id is not null;

comment on column public.onboarding_video_visti.consegna_id is
  'The delivery of the coach the seconds belong to (1.81.0); exactly one of blocco_id and consegna_id.';
