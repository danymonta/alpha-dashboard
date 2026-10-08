-- The setter's report, precompiled from Instagram (Dany, 08/10/2026: "si
-- riuscirebbe collegare un sistema di aggiornamento automatico dei
-- tracciamenti in modo che Loris non debba più compilare a mano i dati").
-- Every night, after midnight in Rome, a job reads the DMs of Percorso
-- Alpha's Instagram account (Loris writes from Dany's account: everything
-- sent from it is the connected setter's setting), counts the day that just
-- ended and leaves a PROPOSAL for the setter. Never confirmed by itself: the
-- setter confirms it (as it is, or corrected) or discards it, and his answer
-- always wins. The questions of "Com'è andata la giornata" stay his.
--
-- Section 17 changes with this (Dany, 08/10/2026): the report stays the
-- setter's own declaration; the system only proposes the totals he already
-- declares. No activity hours, no response times, no alerts, no comparison,
-- no list by person; the proposal is seen only by him (not by the admin, who
-- keeps seeing the report as the setter confirms it).
--
-- Nothing of the messages is stored: no text, no username of a lead, only
-- the day's numbers (and how many chats were read, and how many could not be
-- read whole, so the setter knows how sure the numbers are).
--
-- 1. instagram_collegamento: one row (the account, the setter who works its
--    DMs, the token's dates, the last run and the last error). Admin only.
--    The token is never here.
-- 2. The token lives in Supabase Vault, under one fixed name. The admin sets
--    it (instagram_imposta_token) and can remove it (instagram_togli_token),
--    and only asks whether it is there (instagram_token_presente). Only the
--    service role reads it (instagram_token), writes its refresh
--    (instagram_token_rinnovato, only over the token it refreshed: never
--    over one the admin removed or pasted meanwhile) and records an error
--    (instagram_errore, which blanks the token out of any message).
-- 3. instagram_esclusi: the accounts whose chats are never counted (Dany's
--    personal one, the team's, services). Admin only.
-- 4. report_proposte_instagram: one proposal per setter and day. The setter
--    reads his own and decides on it (never its numbers); the admin does not
--    read it; only the service role writes it (instagram_salva_proposta,
--    which never touches a decided proposal). discovery_prenotate comes from
--    the calls the setter booked that day (discovery_prenotate_del_giorno),
--    not from the DMs.
-- 5. conferma_proposta_instagram writes the 6 numbers into the setter's own
--    report of that day (his correction or the proposal's), through his own
--    RLS like the "Oggi" screen, leaving every other field as it was; only
--    the proposal he saw (its calcolato_il): one recomputed meanwhile is
--    refused, so he never confirms numbers he has not seen.
--    scarta_proposta_instagram keeps his numbers.
-- 6. unisci_profili: two proposals of the same day keep the target's, and the
--    Instagram DMs follow the target only if he is an active setter.
--    elimina_persona needs nothing: the proposals go with the person
--    (cascade), the connection loses its setter (set null).
-- 7. The weekly backup (backup_completo) reads every table of public by
--    itself, the proposals excepted: the only table the admin does not read
--    (section 6), and the backup is his. The connection and the excluded
--    accounts go in; the token does not (Vault is another schema).

create extension if not exists supabase_vault with schema vault;

-- ---------------------------------------------------------------------------
-- 1. The connection
-- ---------------------------------------------------------------------------
create table public.instagram_collegamento (
  -- one row only
  id boolean primary key default true
    constraint instagram_collegamento_una_riga check (id),
  -- the account the DMs are read from, as /me says it
  account_username text
    constraint instagram_collegamento_username_valido check (account_username ~ '^[a-z0-9._]{1,30}$'),
  account_id text
    constraint instagram_collegamento_account_id_valido check (account_id ~ '^[0-9]{1,30}$'),
  -- who works the DMs: the proposals are his (chosen by the admin)
  setter_id uuid references public.profiles (id) on delete set null,
  -- the token's dates (the token itself is in Vault)
  token_aggiornato_il timestamptz,
  token_scade_il timestamptz,
  -- the last nightly run that saved a proposal
  ultimo_calcolo_il timestamptz,
  ultimo_calcolo_giorno date,
  ultimo_calcolo_chat integer
    constraint instagram_collegamento_chat_non_negative check (ultimo_calcolo_chat >= 0),
  -- the last error of the nightly run (never the token: instagram_errore blanks it)
  ultimo_errore text
    constraint instagram_collegamento_errore_lunghezza check (char_length(ultimo_errore) <= 500),
  ultimo_errore_il timestamptz,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.instagram_collegamento is
  'The Instagram account whose DMs precompile the setter''s report (one row): account, the setter who works its DMs, the token''s dates, the last run and the last error. Admin only. The token is in Vault (instagram_imposta_token), never here.';
comment on column public.instagram_collegamento.setter_id is
  'Who works the DMs of the account: the nightly proposals are his. An active setter when chosen (instagram_collegamento_coerenza).';
comment on column public.instagram_collegamento.ultimo_calcolo_chat is
  'How many chats the last run read (a number only: no username, no text).';

insert into public.instagram_collegamento (id) values (true);

create trigger instagram_collegamento_set_updated_at
  before update on public.instagram_collegamento
  for each row execute function public.set_updated_at();

-- security definer: the chosen person is read whatever RLS lets the session see
create function public.instagram_collegamento_coerenza()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- the proposals are read only by a setter (section 6): the DMs go to an
  -- active one. Checked when the setter is chosen, so a setter deactivated
  -- later does not block the nightly bookkeeping on this row.
  if new.setter_id is not null
     and (tg_op = 'INSERT' or new.setter_id is distinct from old.setter_id)
     and not exists (
       select 1 from public.profiles p
       where p.id = new.setter_id and p.ruolo = 'setter' and p.attivo
     ) then
    raise exception 'I DM di Instagram li lavora un setter attivo: scegli un setter del team'
      using errcode = '22023';
  end if;

  -- who last changed the configuration, never the nightly job (no session)
  if auth.uid() is not null
     and (tg_op = 'INSERT'
          or new.setter_id is distinct from old.setter_id
          or new.account_username is distinct from old.account_username
          or new.account_id is distinct from old.account_id) then
    new.updated_by := auth.uid();
  end if;

  return new;
end;
$$;

create trigger instagram_collegamento_coerenza
  before insert or update on public.instagram_collegamento
  for each row execute function public.instagram_collegamento_coerenza();

alter table public.instagram_collegamento enable row level security;
revoke all on public.instagram_collegamento from anon;
-- the admin chooses the setter and records the account; the token's dates,
-- the runs and the errors are written by the functions below
revoke insert, update, delete, truncate on public.instagram_collegamento from authenticated;
grant update (setter_id, account_username, account_id) on public.instagram_collegamento to authenticated;

create policy instagram_collegamento_admin_lettura on public.instagram_collegamento
  for select to authenticated
  using (public.is_admin());

create policy instagram_collegamento_admin_modifica on public.instagram_collegamento
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 2. The token, in Vault
-- ---------------------------------------------------------------------------
-- The admin connects the account. Never returns the token, never echoes it
-- in an error.
create function public.instagram_imposta_token(p_token text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text := btrim(p_token);
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Instagram lo collega l''admin' using errcode = '42501';
  end if;
  if v_token is null or char_length(v_token) not between 20 and 2048
     or v_token !~ '^[A-Za-z0-9_.|-]+$' then
    raise exception 'Il token non sembra valido: copialo di nuovo per intero' using errcode = '22023';
  end if;

  -- one change of the token at a time (instagram_token_rinnovato)
  perform pg_advisory_xact_lock(hashtextextended('alpha.instagram_token', 0));
  select s.id into v_id from vault.secrets s where s.name = 'instagram_token';
  if v_id is null then
    perform vault.create_secret(v_token, 'instagram_token',
      'Instagram token of Percorso Alpha''s account: read only by the service role (instagram_token)');
  else
    perform vault.update_secret(v_id, v_token);
  end if;

  insert into public.instagram_collegamento as c
    (id, token_aggiornato_il, token_scade_il, ultimo_errore, ultimo_errore_il, updated_by)
  values (true, now(), now() + interval '60 days', null, null, (select auth.uid()))
  on conflict (id) do update
    set token_aggiornato_il = excluded.token_aggiornato_il,
        token_scade_il = excluded.token_scade_il,
        ultimo_errore = null,
        ultimo_errore_il = null,
        updated_by = excluded.updated_by;
end;
$$;

comment on function public.instagram_imposta_token(text) is
  'Admin only: stores the Instagram token in Vault (one secret, fixed name), dates it (60 days) and clears the last error. Never returns it.';

revoke all on function public.instagram_imposta_token(text) from public, anon;
grant execute on function public.instagram_imposta_token(text) to authenticated;

-- The admin disconnects the account: the token leaves Vault, the nightly job
-- stops (it has nothing to read with).
create function public.instagram_togli_token()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Instagram lo scollega l''admin' using errcode = '42501';
  end if;

  -- one change of the token at a time (instagram_token_rinnovato)
  perform pg_advisory_xact_lock(hashtextextended('alpha.instagram_token', 0));
  delete from vault.secrets s where s.name = 'instagram_token';

  update public.instagram_collegamento
  set token_aggiornato_il = null,
      token_scade_il = null,
      updated_by = (select auth.uid())
  where id;
end;
$$;

comment on function public.instagram_togli_token() is
  'Admin only: removes the Instagram token from Vault and its dates. The setter and the account stay.';

revoke all on function public.instagram_togli_token() from public, anon;
grant execute on function public.instagram_togli_token() to authenticated;

-- Whether a token is there, never its value
create function public.instagram_token_presente()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Il collegamento di Instagram lo vede l''admin' using errcode = '42501';
  end if;
  return exists (select 1 from vault.secrets s where s.name = 'instagram_token');
end;
$$;

comment on function public.instagram_token_presente() is
  'Admin only: whether the Instagram token is in Vault, never its value.';

revoke all on function public.instagram_token_presente() from public, anon;
grant execute on function public.instagram_token_presente() to authenticated;

-- The token, for the nightly job only (server side, service role)
create function public.instagram_token()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret
  from vault.decrypted_secrets s
  where s.name = 'instagram_token';
$$;

comment on function public.instagram_token() is
  'The Instagram token from Vault, null when not connected. service_role only: it never reaches a browser.';

revoke all on function public.instagram_token() from public, anon, authenticated;
grant execute on function public.instagram_token() to service_role;

-- The job refreshed the token (a 60-day token, refreshable when valid and
-- older than 24 hours): p_vecchio is the token it read and refreshed,
-- p_token the new one. Saved only if Vault still holds p_vecchio. False when
-- the admin removed the token in the meantime (a removed token never comes
-- back by itself) or pasted another one (the refresh of the old one never
-- overwrites it: the job reads the token again). The admin's functions and
-- this one take the same transaction lock, so a paste never falls between
-- the check and the write.
create function public.instagram_token_rinnovato(p_vecchio text, p_token text, p_scade_il timestamptz)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text := btrim(p_token);
  v_scade timestamptz := coalesce(p_scade_il, now() + interval '60 days');
  v_id uuid;
  v_attuale text;
begin
  if v_token is null or char_length(v_token) not between 20 and 2048
     or v_token !~ '^[A-Za-z0-9_.|-]+$' then
    raise exception 'Token rinnovato non valido' using errcode = '22023';
  end if;
  if v_scade <= now() then
    raise exception 'La scadenza del token rinnovato è già passata' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('alpha.instagram_token', 0));
  select s.id, s.decrypted_secret into v_id, v_attuale
  from vault.decrypted_secrets s
  where s.name = 'instagram_token';
  if v_id is null or v_attuale is distinct from btrim(p_vecchio) then
    return false;
  end if;
  perform vault.update_secret(v_id, v_token);

  insert into public.instagram_collegamento as c (id, token_aggiornato_il, token_scade_il)
  values (true, now(), v_scade)
  on conflict (id) do update
    set token_aggiornato_il = excluded.token_aggiornato_il,
        token_scade_il = excluded.token_scade_il;
  return true;
end;
$$;

comment on function public.instagram_token_rinnovato(text, text, timestamptz) is
  'service_role only: stores the refreshed Instagram token (p_token) and its expiry (default 60 days), only in place of the token that was refreshed (p_vecchio). False when no token is connected or the admin pasted another one meanwhile: never overwritten.';

revoke all on function public.instagram_token_rinnovato(text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.instagram_token_rinnovato(text, text, timestamptz) to service_role;

-- The job failed: the admin reads why. The token never lands in the column,
-- whatever the caller passed: the stored token, any access_token= and any
-- long token-like run of characters are blanked before the message is cut.
create function public.instagram_errore(p_messaggio text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_messaggio text := btrim(coalesce(p_messaggio, ''));
  v_token text;
begin
  select s.decrypted_secret into v_token
  from vault.decrypted_secrets s
  where s.name = 'instagram_token';
  if v_token is not null and v_token <> '' then
    v_messaggio := replace(v_messaggio, v_token, '[token]');
  end if;
  v_messaggio := regexp_replace(v_messaggio, 'access_token=[^&[:space:]"'']*', 'access_token=[token]', 'gi');
  v_messaggio := regexp_replace(v_messaggio, '[A-Za-z0-9_-]{40,}', '[token]', 'g');
  v_messaggio := left(v_messaggio, 500);
  if v_messaggio = '' then
    v_messaggio := 'Errore sconosciuto';
  end if;

  insert into public.instagram_collegamento as c (id, ultimo_errore, ultimo_errore_il)
  values (true, v_messaggio, now())
  on conflict (id) do update
    set ultimo_errore = excluded.ultimo_errore,
        ultimo_errore_il = excluded.ultimo_errore_il;
end;
$$;

comment on function public.instagram_errore(text) is
  'service_role only: records the last error of the nightly run (at most 500 characters, the token blanked out).';

revoke all on function public.instagram_errore(text) from public, anon, authenticated;
grant execute on function public.instagram_errore(text) to service_role;

-- ---------------------------------------------------------------------------
-- 3. Accounts never counted
-- ---------------------------------------------------------------------------
create table public.instagram_esclusi (
  -- lowercase, without @, as Instagram writes it
  username text primary key
    constraint instagram_esclusi_username_valido check (username ~ '^[a-z0-9._]{1,30}$'),
  motivo text
    constraint instagram_esclusi_motivo_lunghezza check (char_length(motivo) <= 120),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.instagram_esclusi is
  'Instagram accounts whose chats are never counted in the setter''s proposals (personal, team, services). Admin only.';

create trigger instagram_esclusi_set_updated_at
  before update on public.instagram_esclusi
  for each row execute function public.set_updated_at();

alter table public.instagram_esclusi enable row level security;
revoke all on public.instagram_esclusi from anon;

create policy instagram_esclusi_admin on public.instagram_esclusi
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

insert into public.instagram_esclusi (username, motivo, created_by) values
  ('danymonta.raw', 'Account personale di Dany', null),
  ('loris_explore', 'Account del team', null),
  ('coachplus.app', 'Servizio: Coach Plus', null),
  ('createcontent.club', 'Servizio: Create Content Club', null);

-- ---------------------------------------------------------------------------
-- 4. The proposals
-- ---------------------------------------------------------------------------
create type public.proposta_stato as enum ('da_confermare', 'confermata', 'scartata');

create table public.report_proposte_instagram (
  id uuid primary key default gen_random_uuid(),
  setter_id uuid not null references public.profiles (id) on delete cascade,
  data date not null,
  dm_outbound integer not null default 0 check (dm_outbound >= 0),
  dm_inbound integer not null default 0 check (dm_inbound >= 0),
  follow_up integer not null default 0 check (follow_up >= 0),
  conversazioni integer not null default 0 check (conversazioni >= 0),
  call_proposte integer not null default 0 check (call_proposte >= 0),
  discovery_prenotate integer not null default 0 check (discovery_prenotate >= 0),
  -- how sure the numbers are: chats read, and those with 20 messages read
  -- (Meta's limit: the chat may be longer than what was read)
  chat_lette integer not null default 0 check (chat_lette >= 0),
  chat_incerte integer not null default 0 check (chat_incerte >= 0),
  calcolato_il timestamptz not null default now(),
  stato public.proposta_stato not null default 'da_confermare',
  deciso_il timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint report_proposte_instagram_un_giorno unique (setter_id, data),
  constraint report_proposte_instagram_incerte check (chat_incerte <= chat_lette),
  constraint report_proposte_instagram_decisione check ((stato = 'da_confermare') = (deciso_il is null))
);

comment on table public.report_proposte_instagram is
  'The setter''s report of a day as proposed from the Instagram DMs (numbers only, never a text or a username). Read only by its setter, who confirms it (into his report, corrected or not) or discards it; never by the admin. Written only by the nightly job (service role).';
comment on column public.report_proposte_instagram.discovery_prenotate is
  'From the calls the setter booked that day (calls.created_at in Europe/Rome, follow-up calls left out), not from the DMs.';
comment on column public.report_proposte_instagram.chat_incerte is
  'Chats with 20 messages read (Meta''s limit): longer than what was read, so their first message is not known.';

create trigger report_proposte_instagram_set_updated_at
  before update on public.report_proposte_instagram
  for each row execute function public.set_updated_at();

-- A session (the setter) only decides; the confirmation goes through
-- conferma_proposta_instagram, which writes the report in the same
-- transaction and marks it with a transaction-local setting that PostgREST
-- never lets a client set. No session (the nightly job) and the admin's merge
-- (unisci_profili: he has no policy, only that function reaches here) are free.
create function public.report_proposte_instagram_coerenza()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ruolo public.app_role := public.current_role();
begin
  if tg_op = 'UPDATE' and v_ruolo is not null and v_ruolo <> 'admin' then
    if (new.setter_id, new.data, new.dm_outbound, new.dm_inbound, new.follow_up, new.conversazioni,
        new.call_proposte, new.discovery_prenotate, new.chat_lette, new.chat_incerte,
        new.calcolato_il, new.created_at)
       is distinct from
       (old.setter_id, old.data, old.dm_outbound, old.dm_inbound, old.follow_up, old.conversazioni,
        old.call_proposte, old.discovery_prenotate, old.chat_lette, old.chat_incerte,
        old.calcolato_il, old.created_at) then
      raise exception 'Della proposta decidi solo se confermarla o scartarla: i numeri si correggono confermando'
        using errcode = '42501';
    end if;
    if old.stato <> 'da_confermare' then
      raise exception 'Questa proposta è già stata decisa' using errcode = '22023';
    end if;
    if new.stato = 'confermata'
       and current_setting('alpha.conferma_proposta_instagram', true) is distinct from new.id::text then
      raise exception 'La proposta si conferma con Conferma, che scrive i numeri nel report'
        using errcode = '42501';
    end if;
    if new.stato not in ('confermata', 'scartata') then
      raise exception 'Una proposta si conferma o si scarta' using errcode = '22023';
    end if;
    new.deciso_il := now();
    return new;
  end if;

  -- the moment of the decision follows the state
  if new.stato = 'da_confermare' then
    new.deciso_il := null;
  elsif new.deciso_il is null or (tg_op = 'UPDATE' and new.stato is distinct from old.stato) then
    new.deciso_il := now();
  end if;
  return new;
end;
$$;

create trigger report_proposte_instagram_coerenza
  before insert or update on public.report_proposte_instagram
  for each row execute function public.report_proposte_instagram_coerenza();

alter table public.report_proposte_instagram enable row level security;
revoke all on public.report_proposte_instagram from anon;
-- only the nightly job writes it; the setter changes the state, nothing else
revoke insert, update, delete, truncate on public.report_proposte_instagram from authenticated;
grant update (stato) on public.report_proposte_instagram to authenticated;

-- the active setter reads his own; nobody else (the admin neither: Dany, 08/10/2026)
create policy report_proposte_instagram_setter_lettura on public.report_proposte_instagram
  for select to authenticated
  using (
    public.current_role() = 'setter'
    and setter_id = (select auth.uid())
  );

create policy report_proposte_instagram_setter_decide on public.report_proposte_instagram
  for update to authenticated
  using (
    public.current_role() = 'setter'
    and setter_id = (select auth.uid())
    and stato = 'da_confermare'
  )
  with check (
    public.current_role() = 'setter'
    and setter_id = (select auth.uid())
  );

-- The setter's bookings of a day, for the proposal: the calls he booked
-- (created that day in Europe/Rome), the follow-up calls left out (the closer
-- books them, 07/10/2026), as the "prenotate" of metriche_setting.
create function public.discovery_prenotate_del_giorno(p_setter uuid, p_data date)
returns integer
language sql
stable
security invoker
set search_path = ''
as $$
  select count(*)::integer
  from public.calls c
  where c.setter_id = p_setter
    and c.created_at >= (p_data::timestamp at time zone 'Europe/Rome')
    and c.created_at < ((p_data + 1)::timestamp at time zone 'Europe/Rome')
    and not c.di_follow_up;
$$;

comment on function public.discovery_prenotate_del_giorno(uuid, date) is
  'Calls booked by the setter on the day (created_at in Europe/Rome), follow-up calls left out. service_role only (the nightly proposal).';

revoke all on function public.discovery_prenotate_del_giorno(uuid, date) from public, anon, authenticated;
grant execute on function public.discovery_prenotate_del_giorno(uuid, date) to service_role;

-- The nightly job saves the proposal of a day that has ended. A proposal
-- still to be decided is recomputed; a confirmed or discarded one is never
-- touched (null). p_discovery_prenotate null: counted here from the calls.
-- calcolato_il moves only when a number (or the chats read) changed: the
-- setter's confirmation checks it (conferma_proposta_instagram), and a
-- recompute that changes nothing never refuses it. The connection records
-- the run (and clears the last error).
create function public.instagram_salva_proposta(
  p_setter uuid,
  p_data date,
  p_dm_outbound integer,
  p_dm_inbound integer,
  p_follow_up integer,
  p_conversazioni integer,
  p_call_proposte integer,
  p_chat_lette integer,
  p_chat_incerte integer,
  p_discovery_prenotate integer default null
)
returns uuid
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_discovery integer := coalesce(p_discovery_prenotate, public.discovery_prenotate_del_giorno(p_setter, p_data));
  v_id uuid;
begin
  if p_setter is null
     or not exists (select 1 from public.instagram_collegamento c where c.id and c.setter_id = p_setter)
     or not exists (select 1 from public.profiles p where p.id = p_setter and p.ruolo = 'setter' and p.attivo) then
    raise exception 'La proposta va al setter attivo collegato a Instagram' using errcode = '22023';
  end if;
  if p_data is null or p_data >= public.oggi() then
    raise exception 'La proposta è di un giorno già finito' using errcode = '22023';
  end if;
  if exists (
    select 1
    from unnest(array[p_dm_outbound, p_dm_inbound, p_follow_up, p_conversazioni, p_call_proposte, v_discovery]) as n(v)
    where n.v is null or n.v < 0 or n.v > 9999
  ) then
    raise exception 'I numeri della proposta vanno da 0 a 9999' using errcode = '22023';
  end if;
  if p_chat_lette is null or p_chat_incerte is null or p_chat_lette < 0 or p_chat_incerte < 0
     or p_chat_incerte > p_chat_lette then
    raise exception 'Chat lette e incerte non valide' using errcode = '22023';
  end if;

  insert into public.report_proposte_instagram as x (
    setter_id, data, dm_outbound, dm_inbound, follow_up, conversazioni, call_proposte,
    discovery_prenotate, chat_lette, chat_incerte, calcolato_il
  )
  values (
    p_setter, p_data, p_dm_outbound, p_dm_inbound, p_follow_up, p_conversazioni, p_call_proposte,
    v_discovery, p_chat_lette, p_chat_incerte, now()
  )
  on conflict (setter_id, data) do update
    set dm_outbound = excluded.dm_outbound,
        dm_inbound = excluded.dm_inbound,
        follow_up = excluded.follow_up,
        conversazioni = excluded.conversazioni,
        call_proposte = excluded.call_proposte,
        discovery_prenotate = excluded.discovery_prenotate,
        chat_lette = excluded.chat_lette,
        chat_incerte = excluded.chat_incerte,
        -- a new moment only when something changed: the same numbers again
        -- (a second delivery of the cron, "Ricalcola ieri" on a day already
        -- counted) leave the proposal as the setter saw it, so his
        -- confirmation is not refused over numbers that did not change
        calcolato_il = case
          when (x.dm_outbound, x.dm_inbound, x.follow_up, x.conversazioni, x.call_proposte,
                x.discovery_prenotate, x.chat_lette, x.chat_incerte)
               is distinct from
               (excluded.dm_outbound, excluded.dm_inbound, excluded.follow_up, excluded.conversazioni,
                excluded.call_proposte, excluded.discovery_prenotate, excluded.chat_lette, excluded.chat_incerte)
            then excluded.calcolato_il
          else x.calcolato_il
        end
    -- the setter's decision always wins
    where x.stato = 'da_confermare'
  returning x.id into v_id;

  update public.instagram_collegamento
  set ultimo_calcolo_il = now(),
      ultimo_calcolo_giorno = p_data,
      ultimo_calcolo_chat = p_chat_lette,
      ultimo_errore = null,
      ultimo_errore_il = null
  where id;

  return v_id;
end;
$$;

comment on function public.instagram_salva_proposta(uuid, date, integer, integer, integer, integer, integer, integer, integer, integer) is
  'service_role only: creates or recomputes the proposal of an ended day for the connected active setter (numbers 0 to 9999); a confirmed or discarded one is never touched (null). discovery_prenotate from the calls when not passed. calcolato_il moves only when a number or the chats read change. Records the run on the connection.';

revoke all on function public.instagram_salva_proposta(uuid, date, integer, integer, integer, integer, integer, integer, integer, integer)
  from public, anon, authenticated;
grant execute on function public.instagram_salva_proposta(uuid, date, integer, integer, integer, integer, integer, integer, integer, integer)
  to service_role;

-- ---------------------------------------------------------------------------
-- 5. The setter decides
-- ---------------------------------------------------------------------------
-- Confirms the proposal into the setter's own report of its day: the 6
-- numbers from p_valori (his correction: any of dm_outbound, dm_inbound,
-- follow_up, conversazioni, call_proposte, discovery_prenotate, integers 0 to
-- 9999) or from the proposal. Creates the report if missing; every other
-- field stays as it was. security invoker: the report is written through the
-- setter's own policies, as "Oggi" writes it (never a day to come). Returns
-- the saved report.
-- p_calcolato_il: when the proposal he saw was computed. A proposal still to
-- decide is recomputed by the nightly job or the admin's "Ricalcola ieri"
-- (instagram_salva_proposta): if it changed after he read it, the
-- confirmation is refused (22023) and he looks at the new numbers first.
-- Never a confirmation of numbers he has not seen. Null: no check (the app
-- always passes it).
create function public.conferma_proposta_instagram(
  p_id uuid,
  p_valori jsonb default null,
  p_calcolato_il timestamptz default null
)
returns public.setter_daily_reports
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_campi constant text[] := array['dm_outbound', 'dm_inbound', 'follow_up', 'conversazioni', 'call_proposte', 'discovery_prenotate'];
  v_chiave text;
  v_valore jsonb;
  v_stato public.proposta_stato;
  v_proposta public.report_proposte_instagram;
  v_report public.setter_daily_reports;
begin
  if public.current_role() is distinct from 'setter' then
    raise exception 'La proposta la decide il setter che lavora i DM' using errcode = '42501';
  end if;

  if p_valori is not null then
    if jsonb_typeof(p_valori) <> 'object' then
      raise exception 'Correzione non valida' using errcode = '22023';
    end if;
    for v_chiave, v_valore in select e.key, e.value from jsonb_each(p_valori) e loop
      if not (v_chiave = any (v_campi)) then
        raise exception 'Questo numero non si corregge da qui' using errcode = '22023';
      end if;
      if jsonb_typeof(v_valore) <> 'number'
         or (v_valore #>> '{}')::numeric <> trunc((v_valore #>> '{}')::numeric)
         or (v_valore #>> '{}')::numeric < 0
         or (v_valore #>> '{}')::numeric > 9999 then
        raise exception 'I numeri vanno da 0 a 9999, interi' using errcode = '22023';
      end if;
    end loop;
  end if;

  -- RLS: only the setter's own proposals are there
  select x.stato into v_stato from public.report_proposte_instagram x where x.id = p_id;
  if not found then
    raise exception 'Proposta non trovata' using errcode = 'P0002';
  end if;
  if v_stato = 'confermata' then
    raise exception 'Questa proposta è già stata confermata' using errcode = '22023';
  elsif v_stato = 'scartata' then
    raise exception 'Questa proposta è già stata scartata' using errcode = '22023';
  end if;

  -- claims it: a second tap waits here, then finds it decided; a recompute
  -- running meanwhile is waited for too, then the numbers are not the ones
  -- he saw any more
  perform set_config('alpha.conferma_proposta_instagram', p_id::text, true);
  update public.report_proposte_instagram x
  set stato = 'confermata'
  where x.id = p_id and x.stato = 'da_confermare'
    and (p_calcolato_il is null or x.calcolato_il = p_calcolato_il)
  returning x.* into v_proposta;
  if not found then
    select x.stato into v_stato from public.report_proposte_instagram x where x.id = p_id;
    if v_stato = 'da_confermare' then
      raise exception 'I numeri della proposta sono cambiati: ricontrollali e conferma di nuovo'
        using errcode = '22023';
    elsif v_stato = 'confermata' then
      raise exception 'Questa proposta è già stata confermata' using errcode = '22023';
    elsif v_stato = 'scartata' then
      raise exception 'Questa proposta è già stata scartata' using errcode = '22023';
    end if;
    raise exception 'Questa proposta è già stata decisa' using errcode = '22023';
  end if;
  perform set_config('alpha.conferma_proposta_instagram', '', true);

  -- the "Oggi" screen's message: RLS refuses it anyway
  if v_proposta.data > public.oggi() then
    raise exception 'Un giorno che non è ancora arrivato non si compila.' using errcode = '42501';
  end if;

  insert into public.setter_daily_reports as r (
    setter_id, data, dm_outbound, dm_inbound, follow_up, conversazioni, call_proposte,
    discovery_prenotate, created_by
  )
  values (
    v_proposta.setter_id,
    v_proposta.data,
    coalesce((p_valori ->> 'dm_outbound')::numeric::integer, v_proposta.dm_outbound),
    coalesce((p_valori ->> 'dm_inbound')::numeric::integer, v_proposta.dm_inbound),
    coalesce((p_valori ->> 'follow_up')::numeric::integer, v_proposta.follow_up),
    coalesce((p_valori ->> 'conversazioni')::numeric::integer, v_proposta.conversazioni),
    coalesce((p_valori ->> 'call_proposte')::numeric::integer, v_proposta.call_proposte),
    coalesce((p_valori ->> 'discovery_prenotate')::numeric::integer, v_proposta.discovery_prenotate),
    (select auth.uid())
  )
  on conflict (setter_id, data) do update
    set dm_outbound = excluded.dm_outbound,
        dm_inbound = excluded.dm_inbound,
        follow_up = excluded.follow_up,
        conversazioni = excluded.conversazioni,
        call_proposte = excluded.call_proposte,
        discovery_prenotate = excluded.discovery_prenotate
  returning r.* into v_report;

  return v_report;
end;
$$;

comment on function public.conferma_proposta_instagram(uuid, jsonb, timestamptz) is
  'The setter confirms his proposal (only his, only to be decided, only as he saw it: p_calcolato_il): its 6 numbers, or his correction in p_valori, go into his own report of that day through his RLS (created if missing, every other field untouched); the proposal becomes confirmed. A proposal recomputed after he read it is refused (22023). Returns the report.';

revoke all on function public.conferma_proposta_instagram(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.conferma_proposta_instagram(uuid, jsonb, timestamptz) to authenticated;

-- Discards the proposal: the setter keeps his own numbers
create function public.scarta_proposta_instagram(p_id uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_stato public.proposta_stato;
begin
  if public.current_role() is distinct from 'setter' then
    raise exception 'La proposta la decide il setter che lavora i DM' using errcode = '42501';
  end if;

  select x.stato into v_stato from public.report_proposte_instagram x where x.id = p_id;
  if not found then
    raise exception 'Proposta non trovata' using errcode = 'P0002';
  end if;
  if v_stato = 'confermata' then
    raise exception 'Questa proposta è già stata confermata' using errcode = '22023';
  elsif v_stato = 'scartata' then
    raise exception 'Questa proposta è già stata scartata' using errcode = '22023';
  end if;

  update public.report_proposte_instagram x
  set stato = 'scartata'
  where x.id = p_id and x.stato = 'da_confermare';
  if not found then
    raise exception 'Questa proposta è già stata decisa' using errcode = '22023';
  end if;
end;
$$;

comment on function public.scarta_proposta_instagram(uuid) is
  'The setter discards his proposal (only his, only to be decided): his report stays as it is.';

revoke all on function public.scarta_proposta_instagram(uuid) from public, anon;
grant execute on function public.scarta_proposta_instagram(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Two profiles merged. As in 20261002090000_progetto_per_cliente.sql, plus:
--    two proposals of the same day keep the target's, and the Instagram DMs
--    follow the target only if he is an active setter (nobody otherwise).
-- ---------------------------------------------------------------------------
create or replace function public.unisci_profili(p_da uuid, p_a uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  r record;
begin
  if not public.is_admin() then
    raise exception 'Solo l''admin unisce i profili' using errcode = '42501';
  end if;
  if p_da = p_a then
    raise exception 'Scegli due profili diversi' using errcode = '22023';
  end if;
  if p_da = (select auth.uid()) then
    raise exception 'Il tuo account non si può unire a un altro' using errcode = '42501';
  end if;
  select p.email into v_email from public.profiles p where p.id = p_da;
  if v_email is null or not exists (select 1 from public.profiles p where p.id = p_a) then
    raise exception 'Profilo non trovato' using errcode = '22023';
  end if;

  -- what both have: the target's copy stays
  delete from public.setter_daily_reports d
  where d.setter_id = p_da
    and exists (select 1 from public.setter_daily_reports x where x.setter_id = p_a and x.data = d.data);
  delete from public.report_proposte_instagram d
  where d.setter_id = p_da
    and exists (select 1 from public.report_proposte_instagram x where x.setter_id = p_a and x.data = d.data);
  insert into public.pm_task_assegnatari (task_id, profile_id, created_at, created_by)
  select a.task_id, p_a, a.created_at, a.created_by
  from public.pm_task_assegnatari a
  join public.pm_task t on t.id = a.task_id
  where a.profile_id = p_da
    and exists (select 1 from public.pm_membri x where x.profile_id = p_a and x.progetto_id = t.progetto_id)
  on conflict (task_id, profile_id) do nothing;
  update public.pm_progetti p
  set coach_id = case when p.coach_id = p_da then p_a else p.coach_id end,
      responsabile_id = case when p.responsabile_id = p_da then p_a else p.responsabile_id end
  where (p.coach_id = p_da or p.responsabile_id = p_da)
    and exists (select 1 from public.pm_membri x where x.profile_id = p_a and x.progetto_id = p.id);
  delete from public.pm_membri m
  where m.profile_id = p_da
    and exists (select 1 from public.pm_membri x where x.profile_id = p_a and x.progetto_id = m.progetto_id);
  update public.pm_membri set profile_id = p_a where profile_id = p_da;
  -- one set of commission rules per person: the target's, if it has any
  if exists (select 1 from public.commission_rules where profile_id = p_a) then
    delete from public.commission_rules where profile_id = p_da;
  end if;
  -- one running timer per person
  update public.pm_tempo set fine = greatest(clock_timestamp(), inizio + interval '1 second')
  where profile_id = p_da and inizio is not null and fine is null;
  -- the Instagram DMs are worked by an active setter: the target, or nobody
  update public.instagram_collegamento c
  set setter_id = null
  where c.setter_id = p_da
    and not exists (select 1 from public.profiles p where p.id = p_a and p.ruolo = 'setter' and p.attivo);

  -- every column pointing to a person moves to the target
  for r in
    select c.conrelid::regclass as tabella, a.attname as colonna
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and c.confrelid = 'public.profiles'::regclass
  loop
    execute format('update %s set %I = $2 where %I = $1', r.tabella, r.colonna, r.colonna) using p_da, p_a;
  end loop;

  delete from public.invites where email = lower(v_email);
  delete from auth.users where id = p_da;
end;
$$;

revoke all on function public.unisci_profili(uuid, uuid) from public, anon;
grant execute on function public.unisci_profili(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The backup. As in 20260928180000_backup.sql, the proposals left out:
--    report_proposte_instagram is the only table of the app the admin does
--    not read (section 6: the proposal is the setter's, so it never becomes a
--    comparison between what the system counted and what he declared), and
--    the backup is the admin's (downloaded from Impostazioni › Esporta, mailed
--    every Monday). On a new project nothing of the proposals comes back,
--    the decided ones neither: yesterday's is made again only with
--    "Ricalcola ieri" (the next night counts the day of the restore, never
--    yesterday), and it is the setter's to decide again even if he had
--    decided it before ("Tieni i miei" when his report is right); an older
--    day he fills in by hand, as before. The connection's row is already
--    there on a new project (created empty above) and a restore writes only
--    missing rows: the admin pastes the token again and chooses again who
--    works the DMs. A backup without the table restores as ever: a table
--    missing from the file is skipped (lib/backup/formato.ts).
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
      -- the setter's own, never the admin's (section 6)
      and c.relname <> 'report_proposte_instagram'
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
  'service_role only: every table of public read at the time of the call (a table added later is never forgotten), except report_proposte_instagram, the setter''s proposals that the admin never reads (section 6).';

revoke all on function public.backup_completo() from public, anon, authenticated;
grant execute on function public.backup_completo() to service_role;
