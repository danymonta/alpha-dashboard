-- Guided onboarding, release A (1.77.0): the data. Dany, 12/11/2026 (docs/onboarding/rilascio-a.md is the
-- contract, docs/onboarding/piano.md the plan he approved). Team side only: no client signs in yet, /join,
-- the client account and the questionnaire are release B, and nothing here touches authentication.
--
-- 1. onboarding_impostazioni: one row. aperto_ai_clienti is off and no session can turn it on (column
--    grants): while it is off the link is never shown and its 14 days never start.
-- 2. onboarding_incarichi: who follows the client (coach, reviewer, responsible). Written by the app's
--    admin only. It is the only source of who will read the client's data in B: the coach of a project
--    can be changed by a manager, so nothing sensitive leans on pm_progetti.coach_id.
-- 3. onboarding_inviti and onboarding_inviti_token: the personal link. Admin only. The state of the
--    payment lives here and nowhere else: coach and reviewer never read an invite, a token or an event.
--    The token in clear stays in its own table, out of the backup.
-- 4. onboarding_percorsi, onboarding_passi_def, onboarding_passi: the path of a client through the steps
--    of a version of the flow. The people in charge read a path only once the client has registered.
-- 5. onboarding_eventi: the log. Never an email, an amount or an answer in dettagli.
-- 6. clienti_telegram: outside clients, which closers read (and setters through their RPC).
--
-- Every table: RLS, nothing for anon, the restrictive <table>_mai_da_oauth (Claude connected reaches
-- none of them), at least one permissive policy. The triggers and the functions that write them are in
-- 20261108090200_onboarding_avvio_gate.sql.

-- ---------------------------------------------------------------------------
-- 1. Settings: one row
-- ---------------------------------------------------------------------------
create table public.onboarding_impostazioni (
  id boolean primary key default true check (id),
  -- the client area (release B): while false the link is not shown and never expires
  aperto_ai_clienti boolean not null default false,
  giorni_validita_link integer not null default 14 check (giorni_validita_link between 1 and 90),
  coach_predefinito_id uuid references public.profiles (id) on delete set null,
  revisore_predefinito_id uuid references public.profiles (id) on delete set null,
  responsabile_predefinito_id uuid references public.profiles (id) on delete set null,
  link_community text check (link_community ~ '^https://t\.me/[^[:space:]]+$' and char_length(link_community) <= 300),
  -- the estimate of the timeline (release B)
  giorni_call integer not null default 3 check (giorni_call between 0 and 60),
  giorni_test integer not null default 7 check (giorni_test between 0 and 60),
  giorni_programma integer not null default 2 check (giorni_programma between 0 and 60),
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.onboarding_impostazioni default values;

comment on table public.onboarding_impostazioni is
  'One row: the settings of the guided onboarding (1.77.0). aperto_ai_clienti stays false until the client area exists (release B) and no session can change it; the rest is the admin''s.';

create trigger onboarding_impostazioni_set_updated_at before update on public.onboarding_impostazioni
  for each row execute function public.set_updated_at();

alter table public.onboarding_impostazioni enable row level security;

create policy onboarding_impostazioni_admin_lettura on public.onboarding_impostazioni
  for select to authenticated using ((select public.is_admin()));
create policy onboarding_impostazioni_admin_modifica on public.onboarding_impostazioni
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy onboarding_impostazioni_mai_da_oauth on public.onboarding_impostazioni
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

revoke all on public.onboarding_impostazioni from anon;
revoke all on public.onboarding_impostazioni from authenticated;
grant select on public.onboarding_impostazioni to authenticated;
-- never aperto_ai_clienti: it opens with release B, from a migration
grant update (giorni_validita_link, coach_predefinito_id, revisore_predefinito_id, responsabile_predefinito_id,
              link_community, giorni_call, giorni_test, giorni_programma, updated_by)
  on public.onboarding_impostazioni to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Who follows the client
-- ---------------------------------------------------------------------------
create table public.onboarding_incarichi (
  client_id uuid primary key references public.clients (id) on delete cascade,
  coach_id uuid references public.profiles (id) on delete set null,
  revisore_id uuid references public.profiles (id) on delete set null,
  responsabile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index onboarding_incarichi_coach_idx on public.onboarding_incarichi (coach_id);
create index onboarding_incarichi_revisore_idx on public.onboarding_incarichi (revisore_id);
create index onboarding_incarichi_responsabile_idx on public.onboarding_incarichi (responsabile_id);

comment on table public.onboarding_incarichi is
  'Who follows a client in the onboarding: coach, video reviewer, responsible. Written by the app''s admin only; each person in charge reads their own row. Never derived from the project''s coach, which a manager can change.';

create trigger onboarding_incarichi_set_updated_at before update on public.onboarding_incarichi
  for each row execute function public.set_updated_at();

alter table public.onboarding_incarichi enable row level security;

create policy onboarding_incarichi_admin_lettura on public.onboarding_incarichi
  for select to authenticated using ((select public.is_admin()));
create policy onboarding_incarichi_admin_inserimento on public.onboarding_incarichi
  for insert to authenticated with check ((select public.is_admin()));
create policy onboarding_incarichi_admin_modifica on public.onboarding_incarichi
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy onboarding_incarichi_mai_da_oauth on public.onboarding_incarichi
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

revoke all on public.onboarding_incarichi from anon;
revoke all on public.onboarding_incarichi from authenticated;
grant select, insert, update on public.onboarding_incarichi to authenticated;

-- True when the caller is coach, reviewer or responsible of the client, with an active account and a place
-- in the Projects area (pm_livello_corrente() is null without a session, for a deactivated account and for
-- the business coach), the request is not Claude's, and the client's path is past the wait: in corso,
-- completed, or suspended after the registration. Security definer: it reads onboarding_incarichi and
-- onboarding_percorsi without RLS (their policies call it), and it answers only about the caller.
create function public.onboarding_incaricato(p_client_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  -- plpgsql: the body is resolved when called, after onboarding_percorsi exists
  return not public.da_client_oauth()
    and public.pm_livello_corrente() is not null
    and exists (
      select 1
      from public.onboarding_incarichi i
      join public.onboarding_percorsi p on p.client_id = i.client_id
      where i.client_id = p_client_id
        and (select auth.uid()) in (i.coach_id, i.revisore_id, i.responsabile_id)
        and (p.stato in ('in_corso', 'completato') or (p.stato = 'sospeso' and p.giorno_zero is not null))
    );
end;
$$;

comment on function public.onboarding_incaricato(uuid) is
  'True when the caller is coach, reviewer or responsible of this client in the onboarding, with an active account, and the client has registered (path in corso, completed, or suspended after the registration); never for an OAuth token. Security definer: it reads incarichi and paths without RLS and answers only about the caller.';

revoke all on function public.onboarding_incaricato(uuid) from public, anon;
grant execute on function public.onboarding_incaricato(uuid) to authenticated;

-- the person in charge reads their own row only once the client has registered (in corso, completed, or
-- paused after it), never while the path waits: a row of an incarico without its project would say «not
-- paid yet». onboarding_incaricato is security definer, so the policy never reads itself.
create policy onboarding_incarichi_incaricato_lettura on public.onboarding_incarichi
  for select to authenticated
  using ((select auth.uid()) in (coach_id, revisore_id, responsabile_id) and public.onboarding_incaricato(client_id));

-- ---------------------------------------------------------------------------
-- 3. The personal link
-- ---------------------------------------------------------------------------
create table public.onboarding_inviti (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  sale_id uuid references public.sales (id) on delete set null,
  call_id uuid references public.calls (id) on delete set null,
  -- readable part of the link, from name and surname without accents
  slug text not null check (slug ~ '^[a-z0-9-]{1,60}$'),
  -- sha256 of the token, in hex: the token itself is in onboarding_inviti_token
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  -- the address proposed to the client at registration (release B)
  email text check (char_length(email) <= 320),
  minorenne boolean not null default false,
  consenso_genitore_il timestamptz,
  consenso_genitore_nota text check (char_length(consenso_genitore_nota) <= 300),
  stato text not null default 'in_attesa_pagamento'
    check (stato in ('in_attesa_pagamento', 'attivo', 'usato', 'scaduto', 'revocato')),
  attivato_il timestamptz,
  attivato_da text check (attivato_da in ('pagamento', 'manuale')),
  scade_il timestamptz,
  usato_il timestamptz,
  revocato_il timestamptz,
  revocato_motivo text check (char_length(revocato_motivo) <= 300),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint onboarding_inviti_attivazione check ((attivato_il is null) = (attivato_da is null)),
  constraint onboarding_inviti_revoca check ((revocato_il is not null) = (stato = 'revocato')),
  constraint onboarding_inviti_consenso check (consenso_genitore_il is null or minorenne)
);
-- one living invite per client
create unique index onboarding_inviti_uno_vivo on public.onboarding_inviti (client_id)
  where stato in ('in_attesa_pagamento', 'attivo', 'usato');
create index onboarding_inviti_client_idx on public.onboarding_inviti (client_id);
create index onboarding_inviti_sale_idx on public.onboarding_inviti (sale_id);

comment on table public.onboarding_inviti is
  'The personal onboarding link of a client: waiting for the payment, active, used, expired, revoked. Admin only: the state of the payment lives here and coach and reviewer never read it.';

create trigger onboarding_inviti_set_updated_at before update on public.onboarding_inviti
  for each row execute function public.set_updated_at();

alter table public.onboarding_inviti enable row level security;

create policy onboarding_inviti_admin_lettura on public.onboarding_inviti
  for select to authenticated using ((select public.is_admin()));
create policy onboarding_inviti_admin_inserimento on public.onboarding_inviti
  for insert to authenticated with check ((select public.is_admin()));
create policy onboarding_inviti_admin_modifica on public.onboarding_inviti
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy onboarding_inviti_mai_da_oauth on public.onboarding_inviti
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

revoke all on public.onboarding_inviti from anon;
revoke all on public.onboarding_inviti from authenticated;
grant select, insert on public.onboarding_inviti to authenticated;
-- only the columns the admin's functions write: client, sale, minor, dates of the link and the rest are
-- the triggers' (onboarding_inviti_coerenza refuses even these outside the functions)
grant update (stato, attivato_da, token_hash, revocato_motivo, consenso_genitore_il, consenso_genitore_nota)
  on public.onboarding_inviti to authenticated;

-- The token in clear, until the invite is used: the admin copies the link from here. Out of the backup.
create table public.onboarding_inviti_token (
  invito_id uuid primary key references public.onboarding_inviti (id) on delete cascade,
  token text not null check (token ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now()
);

comment on table public.onboarding_inviti_token is
  'The token of an onboarding link in clear, until the invite is used. Admin only; never in the backup (backup_completo skips it).';

-- A token is always the one its invite has the hash of
create function public.onboarding_inviti_token_coerenza()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.onboarding_inviti i
    where i.id = new.invito_id
      and i.token_hash = encode(sha256(convert_to(new.token, 'UTF8')), 'hex')
  ) then
    raise exception 'Il token non corrisponde all''invito' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.onboarding_inviti_token_coerenza() from public, anon, authenticated;

create trigger onboarding_inviti_token_coerenza before insert or update on public.onboarding_inviti_token
  for each row execute function public.onboarding_inviti_token_coerenza();

alter table public.onboarding_inviti_token enable row level security;

create policy onboarding_inviti_token_admin_lettura on public.onboarding_inviti_token
  for select to authenticated using ((select public.is_admin()));
create policy onboarding_inviti_token_admin_inserimento on public.onboarding_inviti_token
  for insert to authenticated with check ((select public.is_admin()));
create policy onboarding_inviti_token_mai_da_oauth on public.onboarding_inviti_token
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

revoke all on public.onboarding_inviti_token from anon;
revoke all on public.onboarding_inviti_token from authenticated;
grant select, insert on public.onboarding_inviti_token to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The path of a client and its steps
-- ---------------------------------------------------------------------------
create table public.onboarding_percorsi (
  client_id uuid primary key references public.clients (id) on delete cascade,
  sale_id uuid references public.sales (id) on delete set null,
  versione_flusso integer not null default 1,
  stato text not null default 'in_attesa' check (stato in ('in_attesa', 'in_corso', 'sospeso', 'completato')),
  -- the client's registration (release B)
  giorno_zero timestamptz,
  completato_il timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.onboarding_percorsi is
  'One row per client in onboarding: the version of the flow, the state, day zero (the client''s registration, release B). The admin reads all; the people in charge only once the client has registered, never while it waits (that would tell the state of the payment).';

create trigger onboarding_percorsi_set_updated_at before update on public.onboarding_percorsi
  for each row execute function public.set_updated_at();

alter table public.onboarding_percorsi enable row level security;

create policy onboarding_percorsi_admin_lettura on public.onboarding_percorsi
  for select to authenticated using ((select public.is_admin()));
-- from the registration on (in corso, completed, or paused after it): a path that waits, or that was
-- suspended before the client ever registered, stays the admin's
create policy onboarding_percorsi_incaricato_lettura on public.onboarding_percorsi
  for select to authenticated
  using (
    (stato in ('in_corso', 'completato') or (stato = 'sospeso' and giorno_zero is not null))
    and public.onboarding_incaricato(client_id)
  );
create policy onboarding_percorsi_mai_da_oauth on public.onboarding_percorsi
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

revoke all on public.onboarding_percorsi from anon;
revoke all on public.onboarding_percorsi from authenticated;
grant select on public.onboarding_percorsi to authenticated;

-- The steps, per version of the flow
create table public.onboarding_passi_def (
  versione integer not null,
  chiave text not null check (chiave ~ '^[a-z0-9_]{1,40}$'),
  ordine integer not null,
  -- the node of the timeline the step belongs to
  nodo text not null check (nodo ~ '^[a-z0-9_]{1,40}$'),
  titolo text not null check (char_length(btrim(titolo)) between 1 and 120),
  tipo text not null
    check (tipo in ('video', 'regole', 'modulo', 'prenotazione', 'link_esterno', 'checklist', 'azione_team', 'conferma_lettura')),
  -- who completes it
  attore text not null check (attore in ('cliente', 'team')),
  richiede_verifica boolean not null default false,
  sblocca_dopo text[] not null default '{}',
  primary key (versione, chiave),
  unique (versione, ordine)
);

comment on table public.onboarding_passi_def is
  'The steps of the onboarding, per version of the flow: order, node of the timeline, who completes it, whether the team verifies it, and the steps it unlocks after (not a queue). Seeded by the migrations; the admin reads it.';

insert into public.onboarding_passi_def (versione, ordine, chiave, titolo, nodo, tipo, attore, richiede_verifica, sblocca_dopo) values
  (1, 1, 'benvenuto', 'Benvenuto', 'benvenuto', 'video', 'cliente', false, '{}'),
  (1, 2, 'regole', 'Le regole del percorso', 'benvenuto', 'regole', 'cliente', false, '{benvenuto}'),
  (1, 3, 'questionario', 'Questionario iniziale', 'questionario', 'modulo', 'cliente', false, '{regole}'),
  (1, 4, 'prenotazione', 'Prenota la call', 'call_prenotata', 'prenotazione', 'cliente', false, '{questionario}'),
  (1, 5, 'community', 'Entra nella community e presentati', 'community', 'link_esterno', 'cliente', false, '{prenotazione}'),
  (1, 6, 'call', 'Call di onboarding', 'call_onboarding', 'azione_team', 'team', true, '{prenotazione}'),
  (1, 7, 'obiettivo', 'Il tuo obiettivo su Coach Plus', 'call_onboarding', 'conferma_lettura', 'cliente', true, '{call}'),
  (1, 8, 'test', 'Settimana test', 'settimana_test', 'checklist', 'cliente', true, '{obiettivo}'),
  (1, 9, 'programma', 'Il tuo programma', 'inizio_percorso', 'azione_team', 'team', true, '{test}');

alter table public.onboarding_passi_def enable row level security;

create policy onboarding_passi_def_admin_lettura on public.onboarding_passi_def
  for select to authenticated using ((select public.is_admin()));
create policy onboarding_passi_def_mai_da_oauth on public.onboarding_passi_def
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

revoke all on public.onboarding_passi_def from anon;
revoke all on public.onboarding_passi_def from authenticated;
grant select on public.onboarding_passi_def to authenticated;

-- One row per client and step. Never an answer of the questionnaire here.
create table public.onboarding_passi (
  client_id uuid not null references public.clients (id) on delete cascade,
  passo text not null,
  versione integer not null,
  stato text not null default 'bloccato'
    check (stato in ('bloccato', 'disponibile', 'in_corso', 'inviato', 'in_attesa_team', 'fatto')),
  iniziato_il timestamptz,
  inviato_il timestamptz,
  completato_il timestamptz,
  dati jsonb not null default '{}'::jsonb check (jsonb_typeof(dati) = 'object'),
  nota text check (char_length(nota) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (client_id, passo),
  foreign key (versione, passo) references public.onboarding_passi_def (versione, chiave)
);

comment on table public.onboarding_passi is
  'The state of each step of a client''s onboarding, with its dates. Never the answers of the questionnaire. Read like onboarding_percorsi.';

create trigger onboarding_passi_set_updated_at before update on public.onboarding_passi
  for each row execute function public.set_updated_at();

alter table public.onboarding_passi enable row level security;

create policy onboarding_passi_admin_lettura on public.onboarding_passi
  for select to authenticated using ((select public.is_admin()));
-- whoever reads the path reads its steps: the subquery runs under the reader's own RLS on the paths
create policy onboarding_passi_incaricato_lettura on public.onboarding_passi
  for select to authenticated
  using (exists (select 1 from public.onboarding_percorsi p where p.client_id = onboarding_passi.client_id));
create policy onboarding_passi_mai_da_oauth on public.onboarding_passi
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

revoke all on public.onboarding_passi from anon;
revoke all on public.onboarding_passi from authenticated;
grant select on public.onboarding_passi to authenticated;

-- ---------------------------------------------------------------------------
-- 5. The log
-- ---------------------------------------------------------------------------
create table public.onboarding_eventi (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  tipo text not null check (tipo ~ '^[a-z0-9_]{1,40}$'),
  attore text not null check (attore in ('cliente', 'team', 'sistema')),
  -- only for the admin's own actions (start, payment confirmed, revoke, reactivate, regenerate)
  autore_id uuid references public.profiles (id) on delete set null,
  -- never an email, an amount or an answer
  dettagli jsonb not null default '{}'::jsonb check (jsonb_typeof(dettagli) = 'object'),
  -- the clock, not the transaction: several events of one transaction keep their order
  created_at timestamptz not null default clock_timestamp(),
  constraint onboarding_eventi_autore check (autore_id is null or attore = 'team')
);
create index onboarding_eventi_client_idx on public.onboarding_eventi (client_id, created_at);

comment on table public.onboarding_eventi is
  'The log of a client''s onboarding. The admin reads it; no session updates or deletes it. Never an email, an amount or an answer in dettagli; autore_id only for the admin''s own actions.';

alter table public.onboarding_eventi enable row level security;

create policy onboarding_eventi_admin_lettura on public.onboarding_eventi
  for select to authenticated using ((select public.is_admin()));
-- the admin's actions write their own line, with his name
create policy onboarding_eventi_admin_inserimento on public.onboarding_eventi
  for insert to authenticated
  with check ((select public.is_admin()) and attore = 'team' and autore_id = (select auth.uid()));
create policy onboarding_eventi_mai_da_oauth on public.onboarding_eventi
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

revoke all on public.onboarding_eventi from anon;
revoke all on public.onboarding_eventi from authenticated;
grant select, insert on public.onboarding_eventi to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Telegram: outside clients
-- ---------------------------------------------------------------------------
create table public.clienti_telegram (
  client_id uuid primary key references public.clients (id) on delete cascade,
  -- lower case, without @
  username text check (username ~ '^[a-z0-9_]{5,32}$'),
  gruppo_privato_url text check (gruppo_privato_url ~ '^https://t\.me/[^[:space:]]+$' and char_length(gruppo_privato_url) <= 300),
  community_richiesta_il timestamptz,
  community_approvata_il timestamptz,
  presentato_il timestamptz,
  presentazione_controllata_il timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.clienti_telegram is
  'The client on Telegram: username, private group, community and presentation. Outside clients, which closers read. Admin writes; the coach in charge reads once the client has registered.';

-- however it is typed («@Mario_Rossi »), it is saved lower case and without @
create function public.clienti_telegram_normalizza()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.username := nullif(lower(ltrim(btrim(new.username), '@')), '');
  new.gruppo_privato_url := nullif(btrim(new.gruppo_privato_url), '');
  return new;
end;
$$;
revoke all on function public.clienti_telegram_normalizza() from public, anon, authenticated;

create trigger clienti_telegram_normalizza before insert or update on public.clienti_telegram
  for each row execute function public.clienti_telegram_normalizza();
create trigger clienti_telegram_set_updated_at before update on public.clienti_telegram
  for each row execute function public.set_updated_at();

alter table public.clienti_telegram enable row level security;

create policy clienti_telegram_admin on public.clienti_telegram
  for all to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
-- the coach in charge, from the client's registration on (the path he can read)
create policy clienti_telegram_coach_lettura on public.clienti_telegram
  for select to authenticated
  using (
    (select public.pm_livello_corrente()) is not null
    and exists (
      select 1 from public.onboarding_incarichi i
      where i.client_id = clienti_telegram.client_id and i.coach_id = (select auth.uid())
    )
    and exists (select 1 from public.onboarding_percorsi p where p.client_id = clienti_telegram.client_id)
  );
create policy clienti_telegram_mai_da_oauth on public.clienti_telegram
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

revoke all on public.clienti_telegram from anon;
revoke all on public.clienti_telegram from authenticated;
grant select, insert, update, delete on public.clienti_telegram to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The backup never carries the tokens of the links (the body of 20261021090000, one table added
--    to the ones it skips): after a restore the admin regenerates the links.
-- ---------------------------------------------------------------------------
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
      and c.relname not in ('call_valutazioni', 'call_spunti_setter', 'notifiche', 'onboarding_inviti_token')
    order by c.relname
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', v_tabella)
      into v_righe;
    v_risultato := v_risultato || jsonb_build_object(v_tabella, v_righe);
  end loop;
  return v_risultato;
end;
$$;
