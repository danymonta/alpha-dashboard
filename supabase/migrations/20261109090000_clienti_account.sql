-- Guided onboarding, release B1a (1.78.0, «Accesso»): the client's account and its registration
-- (docs/onboarding/rilascio-b.md, «Schema di B1a», 1). Dany said to go ahead on 12/11/2026.
--
-- * clienti_account: the user of a client, without a row in profiles. The client reads only its own row.
-- * onboarding_registrazioni: the registration in progress of an invite, with the id reserved for the user
--   that will be born, the code (only its hash) and its limits. No session touches it.
-- * clienti_accesso_limiti: the limits of /entra. No session touches it.
-- * onboarding_inviti.prova: a test invite works while the client area is closed.
-- * handle_new_user: a branch for the client in front of the team's, which stays as it was. A user whose id
--   is reserved by a registration is a client or nothing: it never falls through to the team's branch.
-- * auth.users: never an email of the team for a client (and the opposite), never a password for a client.
-- * invites: never an address of a client.
-- * /join and the return through /entra: functions for the service role only.
-- * The bucket «avatari»: never for a user without a role.
-- * The notification kind onboarding_cliente (app only).

-- ---------------------------------------------------------------------------
-- 0. The notification kind
-- ---------------------------------------------------------------------------
alter table public.notifiche drop constraint notifiche_tipo_check;
alter table public.notifiche
  add constraint notifiche_tipo_check check (tipo in (
    'riepilogo_settimana', 'tempo_team', 'contenuti_settimana', 'backup', 'promemoria_feedback', 'promemoria_rinnovo',
    'rate_in_ritardo', 'chiave_in_scadenza', 'chiave_rifiutata', 'proposta_da_approvare', 'spesa_claude',
    'onboarding_pagamento', 'onboarding_cliente'
  ));

-- ---------------------------------------------------------------------------
-- 1. The client's account
-- ---------------------------------------------------------------------------
create table public.clienti_account (
  user_id uuid primary key references auth.users (id) on delete cascade,
  client_id uuid not null unique references public.clients (id) on delete cascade,
  stato text not null default 'attivo' check (stato in ('attivo', 'sospeso', 'chiuso')),
  registrato_il timestamptz not null default now(),
  chiuso_il timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clienti_account_chiuso check ((chiuso_il is not null) = (stato = 'chiuso'))
);

comment on table public.clienti_account is
  'The sign-in user of a client of the guided onboarding (1.78.0): no row in profiles. Active, suspended (a revoked link) or closed (12 months after the end of the last path). The admin reads all, the user only their own row; written by the triggers on auth.users and on the invite and by onboarding_pulizia, never by a session.';

create trigger clienti_account_set_updated_at before update on public.clienti_account
  for each row execute function public.set_updated_at();

alter table public.clienti_account enable row level security;

create policy clienti_account_admin_lettura on public.clienti_account
  for select to authenticated using ((select public.is_admin()));
create policy clienti_account_propria_lettura on public.clienti_account
  for select to authenticated
  using (user_id = (select auth.uid()) and not (select public.da_client_oauth()));
create policy clienti_account_nessuna_sessione on public.clienti_account
  for all to authenticated using (false) with check (false);
create policy clienti_account_mai_da_oauth on public.clienti_account
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

revoke all on public.clienti_account from anon;
revoke all on public.clienti_account from authenticated;
grant select on public.clienti_account to authenticated;

-- ---------------------------------------------------------------------------
-- 2. The registration in progress of an invite
-- ---------------------------------------------------------------------------
create table public.onboarding_registrazioni (
  invito_id uuid primary key references public.onboarding_inviti (id) on delete cascade,
  -- the id of the user that will be born: only a user with this id enters the client's branch
  utente_id uuid not null unique default gen_random_uuid(),
  -- sha256 of the key in the cookie alpha-registrazione
  chiave_hash text not null unique check (chiave_hash ~ '^[0-9a-f]{64}$'),
  chiave_scade_il timestamptz not null,
  -- the address the last code was sent to
  email text check (email = lower(email) and char_length(email) <= 320),
  -- at most 3 different addresses, admitted or not
  email_provate text[] not null default '{}' check (cardinality(email_provate) <= 3),
  -- sha256(invito_id || ':' || sha256 of the code): the code in clear never reaches the database
  codice_hash text check (codice_hash ~ '^[0-9a-f]{64}$'),
  codice_scade_il timestamptz,
  -- a window of one hour: at most 5 requests of a code, whatever their outcome
  invii_dal timestamptz,
  invii integer not null default 0 check (invii >= 0),
  -- 5 wrong codes: the code dies
  errori integer not null default 0 check (errori >= 0),
  -- the right code: it is worth 10 minutes to create the user
  verificato_il timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.onboarding_registrazioni is
  'The registration in progress of an onboarding invite: the id reserved for the user, the key of the page, the code (its hash only) and its limits. No session reads or writes it; out of the backup.';

create trigger onboarding_registrazioni_set_updated_at before update on public.onboarding_registrazioni
  for each row execute function public.set_updated_at();

alter table public.onboarding_registrazioni enable row level security;

create policy onboarding_registrazioni_nessuna_sessione on public.onboarding_registrazioni
  for all to authenticated using (false) with check (false);
create policy onboarding_registrazioni_mai_da_oauth on public.onboarding_registrazioni
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

revoke all on public.onboarding_registrazioni from anon;
revoke all on public.onboarding_registrazioni from authenticated;

-- ---------------------------------------------------------------------------
-- 3. The limits of the return through /entra
-- ---------------------------------------------------------------------------
create table public.clienti_accesso_limiti (
  -- 'email:' || sha256(email), 'ip:' || sha256(ip of the request), or 'tutti'
  chiave text primary key check (chiave = 'tutti' or chiave ~ '^(email|ip):[0-9a-f]{64}$'),
  dal timestamptz not null default now(),
  invii integer not null default 0 check (invii >= 0),
  errori integer not null default 0 check (errori >= 0),
  -- only for the keys 'email:': the last code sent
  ultimo_invio_il timestamptz,
  constraint clienti_accesso_limiti_invio check (ultimo_invio_il is null or chiave like 'email:%')
);

comment on table public.clienti_accesso_limiti is
  'The limits of the codes of /entra and /login, per address (its sha256), per IP of the request (its sha256) and for everybody, in windows of one hour. No session reads or writes it; rows of at most one day; out of the backup.';

alter table public.clienti_accesso_limiti enable row level security;

create policy clienti_accesso_limiti_nessuna_sessione on public.clienti_accesso_limiti
  for all to authenticated using (false) with check (false);
create policy clienti_accesso_limiti_mai_da_oauth on public.clienti_accesso_limiti
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

revoke all on public.clienti_accesso_limiti from anon;
revoke all on public.clienti_accesso_limiti from authenticated;

-- ---------------------------------------------------------------------------
-- 4. The test invite
-- ---------------------------------------------------------------------------
alter table public.onboarding_inviti add column prova boolean not null default false;

comment on column public.onboarding_inviti.prova is
  'A test invite (an invented client): /join opens it and its days start even while the client area is closed. Written only by onboarding_segna_prova.';

grant update (prova) on public.onboarding_inviti to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Helpers (no grants)
-- ---------------------------------------------------------------------------
-- The address belongs to the team: a profile, or an invite of the team not revoked
create function public.email_del_team(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.email = lower(btrim(p_email)))
      or exists (select 1 from public.invites i where i.email = lower(btrim(p_email)) and not i.revocato);
$$;
revoke all on function public.email_del_team(text) from public, anon, authenticated;

-- The address belongs to the user of a client (other than p_escluso)
create function public.email_di_cliente(p_email text, p_escluso uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join public.clienti_account a on a.user_id = u.id
    where lower(u.email) = lower(btrim(p_email))
      and u.id is distinct from p_escluso
  );
$$;
revoke all on function public.email_di_cliente(text, uuid) from public, anon, authenticated;

-- The first name of a client, for the pages of the link
create function public.onboarding_nome_cliente(p_client_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select nullif(split_part(btrim(c.nome), ' ', 1), '') from public.clients c where c.id = p_client_id;
$$;
revoke all on function public.onboarding_nome_cliente(uuid) from public, anon, authenticated;

-- The invite opens a registration: active, its days not over, the area open or a test invite, and the
-- client without an account yet
create function public.onboarding_invito_apribile(p_invito uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.onboarding_inviti i
    where i.id = p_invito
      and i.stato = 'attivo'
      and (i.scade_il is null or i.scade_il > now())
      and (i.prova or coalesce((select x.aperto_ai_clienti from public.onboarding_impostazioni x), false))
      and not exists (select 1 from public.clienti_account a where a.client_id = i.client_id)
  );
$$;
revoke all on function public.onboarding_invito_apribile(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. The client registers: account, invite used, path in corso, first steps, log, notifications. Called
--    only by handle_new_user, inside the creation of the user. No grants.
-- ---------------------------------------------------------------------------
create function public.onboarding_registra_cliente(p_user_id uuid, p_invito uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente uuid;
  v_email_scheda text;
  v_email text;
  v_nome text;
begin
  select i.client_id into v_cliente from public.onboarding_inviti i where i.id = p_invito;
  select lower(u.email) into v_email from auth.users u where u.id = p_user_id;
  select c.email, concat_ws(' ', nullif(btrim(c.nome), ''), nullif(btrim(c.cognome), ''))
    into v_email_scheda, v_nome
  from public.clients c where c.id = v_cliente;

  insert into public.clienti_account (user_id, client_id) values (p_user_id, v_cliente);

  update public.onboarding_inviti i set stato = 'usato' where i.id = p_invito;

  update public.onboarding_percorsi p
  set stato = 'in_corso', giorno_zero = coalesce(p.giorno_zero, now())
  where p.client_id = v_cliente;

  perform public.onboarding_sblocca(v_cliente);

  insert into public.onboarding_eventi (client_id, tipo, attore, dettagli)
  values (v_cliente, 'registrato', 'cliente', jsonb_build_object('invito_id', p_invito));

  -- the card follows the address the client chose; the log says that it changed, never which
  if v_email is distinct from lower(btrim(v_email_scheda)) then
    update public.clients c set email = v_email where c.id = v_cliente;
    insert into public.onboarding_eventi (client_id, tipo, attore, dettagli)
    values (v_cliente, 'email_cambiata', 'cliente', '{}'::jsonb);
    begin
      perform public.notifiche_avviso_admin(
        'onboarding_cliente',
        left('Email diversa da quella della scheda: ' || coalesce(nullif(v_nome, ''), 'un cliente'), 300),
        'Si è registrato con un altro indirizzo: la scheda del cliente ora ha quello.',
        null,
        '/onboarding/' || v_cliente::text,
        'onboarding/' || v_cliente::text || '/email/' || p_user_id::text
      );
    exception when others then
      raise warning 'Onboarding: notifica dell''email del cliente % non scritta: %', v_cliente, sqlerrm;
    end;
  end if;

  begin
    perform public.notifiche_avviso_admin(
      'onboarding_cliente',
      left(coalesce(nullif(v_nome, ''), 'Un cliente') || ' si è registrato al percorso', 300),
      'Il suo accesso al percorso è attivo.',
      null,
      '/onboarding/' || v_cliente::text,
      'onboarding/' || v_cliente::text || '/registrato/' || p_user_id::text
    );
  exception when others then
    raise warning 'Onboarding: notifica della registrazione del cliente % non scritta: %', v_cliente, sqlerrm;
  end;

  delete from public.onboarding_registrazioni r where r.invito_id = p_invito;
end;
$$;

comment on function public.onboarding_registra_cliente(uuid, uuid) is
  'The client registers (inside the creation of its user): the account, the invite used, the path in corso with day zero, the first steps unlocked, the address of the card aligned, the log and the admins told. No grants.';

revoke all on function public.onboarding_registra_cliente(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. handle_new_user: the body of 20260928160000_foto_profilo.sql, with the client's branch in front
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(new.email);
  v_ruolo public.app_role;
  v_nome text;
  v_reg public.onboarding_registrazioni;
begin
  -- The client's branch: only a user born with the id a verified registration reserved. It never falls
  -- through to the team's branch: whatever is missing, the user is not created.
  select * into v_reg from public.onboarding_registrazioni r where r.utente_id = new.id for update;
  if found then
    if not public.onboarding_invito_apribile(v_reg.invito_id)
       or v_reg.verificato_il is null
       or v_reg.verificato_il < now() - interval '10 minutes'
       or v_reg.email is null
       or v_email is distinct from v_reg.email
       or public.email_del_team(v_email)
       or public.email_di_cliente(v_email, new.id) then
      raise exception 'Registrazione non valida' using errcode = '42501';
    end if;

    perform public.onboarding_registra_cliente(new.id, v_reg.invito_id);
    return new;
  end if;

  -- The team's branch, as it was
  select i.ruolo into v_ruolo
  from public.invites i
  where i.email = v_email
    and not i.revocato;

  if v_ruolo is null then
    raise exception 'Accesso su invito: l''indirizzo % non è stato invitato', v_email
      using errcode = '42501';
  end if;

  v_nome := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    initcap(replace(split_part(v_email, '@', 1), '.', ' '))
  );

  insert into public.profiles (id, email, nome, ruolo, foto_url)
  values (new.id, v_email, v_nome, v_ruolo, public.foto_google(new.raw_user_meta_data))
  on conflict (id) do nothing;

  update public.invites
  set usato_at = coalesce(usato_at, now())
  where email = v_email;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Email and password in auth.users
-- ---------------------------------------------------------------------------
-- A client never takes an address of the team or of another client, and a person of the team never takes
-- the address of a client
create function public.auth_utenti_email_coerente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nuove text[] := '{}';
  v_email text;
begin
  if new.email is distinct from old.email and nullif(btrim(new.email), '') is not null then
    v_nuove := v_nuove || lower(btrim(new.email));
  end if;
  if new.email_change is distinct from old.email_change and nullif(btrim(new.email_change), '') is not null then
    v_nuove := v_nuove || lower(btrim(new.email_change));
  end if;
  if cardinality(v_nuove) = 0 then
    return new;
  end if;

  foreach v_email in array v_nuove loop
    if exists (select 1 from public.clienti_account a where a.user_id = new.id) then
      if public.email_del_team(v_email) or public.email_di_cliente(v_email, new.id) then
        raise exception 'Questo indirizzo non si può usare per il tuo accesso.' using errcode = '42501';
      end if;
    elsif exists (select 1 from public.profiles p where p.id = new.id) then
      if public.email_di_cliente(v_email, new.id) then
        raise exception 'Questo indirizzo non si può usare per il tuo accesso.' using errcode = '42501';
      end if;
    end if;
  end loop;

  return new;
end;
$$;
revoke all on function public.auth_utenti_email_coerente() from public, anon, authenticated;

create trigger auth_utenti_email_coerente
  before update of email, email_change on auth.users
  for each row execute function public.auth_utenti_email_coerente();

-- A client never has a password: the codes by email are its only way in. Inserts (the seed, with a password
-- for the development login) do not pass here.
create function public.auth_utenti_senza_password_cliente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(new.encrypted_password, '') <> ''
     and new.encrypted_password is distinct from old.encrypted_password
     and (
       coalesce(new.raw_app_meta_data ->> 'tipo', '') = 'cliente'
       or exists (select 1 from public.clienti_account a where a.user_id = new.id)
     ) then
    raise exception 'L''accesso al percorso è solo con il codice via email.' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.auth_utenti_senza_password_cliente() from public, anon, authenticated;

create trigger auth_utenti_senza_password_cliente
  before update of encrypted_password on auth.users
  for each row execute function public.auth_utenti_senza_password_cliente();

-- ---------------------------------------------------------------------------
-- 9. An invite of the team is never the address of a client
-- ---------------------------------------------------------------------------
create function public.invites_non_cliente()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not new.revocato and public.email_di_cliente(new.email) then
    raise exception 'Questo indirizzo è di un cliente: usa un''altra email per il team.' using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke all on function public.invites_non_cliente() from public, anon, authenticated;

create trigger invites_non_cliente before insert or update on public.invites
  for each row execute function public.invites_non_cliente();

-- ---------------------------------------------------------------------------
-- 10. The invite, from release A with the additions of B1a
-- ---------------------------------------------------------------------------
-- onboarding_inviti_coerenza: the body of 20261108090200; prova among the columns only the admin's functions
-- change, and the days of the link start with the area open or with a test invite
create or replace function public.onboarding_inviti_coerenza()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tipo public.sale_type;
  v_cliente uuid;
  v_aperto boolean;
  v_giorni integer;
  v_modo text;
begin
  new.slug := lower(btrim(new.slug));

  if tg_op = 'INSERT' then
    if new.stato <> 'in_attesa_pagamento' then
      raise exception 'Un invito nasce in attesa di pagamento' using errcode = '22023';
    end if;
    -- a renewal never starts an onboarding
    select s.tipo, s.client_id into v_tipo, v_cliente from public.sales s where s.id = new.sale_id;
    if not found or v_tipo <> 'nuovo' then
      raise exception 'L''onboarding parte solo da una vendita a un nuovo cliente.' using errcode = '22023';
    end if;
    if v_cliente is distinct from new.client_id then
      raise exception 'La vendita non è di questo cliente' using errcode = '22023';
    end if;
    new.attivato_il := null;
    new.attivato_da := null;
    new.scade_il := null;
    new.usato_il := null;
    new.revocato_il := null;
    new.revocato_motivo := null;
    return new;
  end if;

  if new.client_id is distinct from old.client_id then
    raise exception 'Un invito non cambia cliente' using errcode = '22023';
  end if;
  if new.minorenne is distinct from old.minorenne then
    raise exception 'Un invito non cambia da minorenne a maggiorenne: si decide all''avvio' using errcode = '22023';
  end if;
  -- only the trigger of a sale moved to another client lets go of it; never onto another sale
  if new.sale_id is distinct from old.sale_id and new.sale_id is not null then
    raise exception 'Un invito non cambia vendita' using errcode = '22023';
  end if;
  -- a session changes the link only through the admin's functions (they raise alpha.onboarding_admin);
  -- the triggers of payments and sales run one level deeper. Never a direct PATCH: it would skip the
  -- log with its author, the consent of a parent and the rules of the payment.
  if (select auth.uid()) is not null
     and pg_trigger_depth() = 1
     and coalesce(current_setting('alpha.onboarding_admin', true), '') <> 'on'
     and row(new.stato, new.attivato_da, new.attivato_il, new.token_hash, new.revocato_motivo,
             new.consenso_genitore_il, new.consenso_genitore_nota, new.scade_il, new.usato_il, new.sale_id,
             new.prova)
         is distinct from
         row(old.stato, old.attivato_da, old.attivato_il, old.token_hash, old.revocato_motivo,
             old.consenso_genitore_il, old.consenso_genitore_nota, old.scade_il, old.usato_il, old.sale_id,
             old.prova) then
    raise exception 'Il link si cambia solo dalle azioni dell''onboarding.' using errcode = '42501';
  end if;

  select x.aperto_ai_clienti, x.giorni_validita_link into v_aperto, v_giorni
  from public.onboarding_impostazioni x;

  -- a new token: the one in clear of before is gone, and an active link gets its days again
  if new.token_hash is distinct from old.token_hash then
    delete from public.onboarding_inviti_token t where t.invito_id = new.id;
  end if;

  if new.stato = 'attivo' and old.stato <> 'attivo' then
    if new.minorenne and new.consenso_genitore_il is null then
      -- a minor waits for a parent's consent, whatever paid or confirmed: said once per way in the log
      v_modo := coalesce(new.attivato_da, 'manuale');
      if not exists (
        select 1 from public.onboarding_eventi e
        where e.client_id = new.client_id
          and e.tipo = 'in_attesa_consenso'
          and e.dettagli ->> 'invito_id' = new.id::text
          and e.dettagli ->> 'modo' = v_modo
      ) then
        perform public.onboarding_evento(new.client_id, 'in_attesa_consenso',
          jsonb_build_object('invito_id', new.id, 'modo', v_modo));
      end if;
      new.stato := 'in_attesa_pagamento';
    else
      new.attivato_il := coalesce(new.attivato_il, now());
      new.attivato_da := coalesce(new.attivato_da, 'manuale');
      -- the days of the link start once the client area is open, or at once for a test invite (B1a)
      new.scade_il := case when coalesce(v_aperto, false) or new.prova
                           then now() + make_interval(days => coalesce(v_giorni, 14)) end;
    end if;
  elsif new.stato = 'attivo' and new.token_hash is distinct from old.token_hash then
    new.scade_il := case when coalesce(v_aperto, false) or new.prova
                         then now() + make_interval(days => coalesce(v_giorni, 14)) end;
  elsif new.stato = 'attivo' and new.prova and not old.prova and new.scade_il is null then
    -- an active link marked as a test one: its days start now
    new.scade_il := now() + make_interval(days => coalesce(v_giorni, 14));
  end if;

  if new.stato = 'in_attesa_pagamento' then
    new.attivato_il := null;
    new.attivato_da := null;
    new.scade_il := null;
  end if;

  if new.stato = 'revocato' then
    if old.stato <> 'revocato' then
      new.revocato_il := now();
    end if;
  else
    new.revocato_il := null;
    new.revocato_motivo := null;
  end if;

  if new.stato = 'usato' and new.usato_il is null then
    new.usato_il := now();
  end if;

  return new;
end;
$$;

-- onboarding_inviti_stato: the body of 20261108090200; used, the token in clear is gone; revoked, the
-- client's account is suspended; back from revoked, it is active again (a closed account never moves)
create or replace function public.onboarding_inviti_stato()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin boolean := coalesce(current_setting('alpha.onboarding_admin', true), '') = 'on';
  v_nome text;
  v_aperto boolean;
begin
  if new.stato is not distinct from old.stato then
    return null;
  end if;

  -- the token in clear is never readable after the use
  if new.stato = 'usato' then
    delete from public.onboarding_inviti_token t where t.invito_id = new.id;
  end if;

  if new.stato = 'revocato' then
    update public.onboarding_percorsi p
    set stato = 'sospeso'
    where p.client_id = new.client_id and p.stato in ('in_attesa', 'in_corso');

    update public.clienti_account a
    set stato = 'sospeso'
    where a.client_id = new.client_id and a.stato = 'attivo';

    perform public.onboarding_evento(new.client_id, 'link_revocato',
      jsonb_build_object('invito_id', new.id, 'automatica', not v_admin)
        || case when new.revocato_motivo is null then '{}'::jsonb else jsonb_build_object('motivo', new.revocato_motivo) end);

  elsif old.stato = 'revocato' then
    -- reactivated: the path is back where it was
    update public.onboarding_percorsi p
    set stato = case when p.giorno_zero is null then 'in_attesa' else 'in_corso' end
    where p.client_id = new.client_id and p.stato = 'sospeso';

    if new.stato in ('attivo', 'usato') then
      update public.clienti_account a
      set stato = 'attivo'
      where a.client_id = new.client_id and a.stato = 'sospeso';
    end if;

    perform public.onboarding_evento(new.client_id, 'link_riattivato',
      jsonb_build_object('invito_id', new.id, 'stato', new.stato));

    if new.stato in ('attivo', 'usato') then
      begin
        perform public.onboarding_assegna_incarichi(new.client_id, true);
      exception when others then
        raise warning 'Onboarding: incarichi del cliente % non allineati al progetto: %', new.client_id, sqlerrm;
      end;
    end if;

  elsif new.stato = 'attivo' then
    -- coach and reviewer see the project from now on; never at the cost of the activation
    begin
      perform public.onboarding_assegna_incarichi(new.client_id, true);
    exception when others then
      raise warning 'Onboarding: incarichi del cliente % non allineati al progetto: %', new.client_id, sqlerrm;
    end;

    perform public.onboarding_evento(new.client_id, 'link_attivo',
      jsonb_build_object('invito_id', new.id, 'attivato_da', new.attivato_da));

    -- the admins are told, in the app, once per invite; never an amount
    begin
      select concat_ws(' ', nullif(btrim(c.nome), ''), nullif(btrim(c.cognome), '')) into v_nome
      from public.clients c where c.id = new.client_id;
      select x.aperto_ai_clienti into v_aperto from public.onboarding_impostazioni x;
      perform public.notifiche_avviso_admin(
        'onboarding_pagamento',
        left('Pagamento confermato per ' || coalesce(nullif(v_nome, ''), 'il cliente'), 300),
        case when coalesce(v_aperto, false) or new.prova
             then 'Il link di onboarding è attivo.'
             else 'Onboarding pronto: il link si apre con l''area clienti.' end,
        null,
        '/onboarding/' || new.client_id::text,
        'onboarding/' || new.client_id::text || '/pagamento/' || new.id::text
      );
    exception when others then
      raise warning 'Onboarding: notifica del pagamento del cliente % non scritta: %', new.client_id, sqlerrm;
    end;
  end if;

  return null;
end;
$$;

-- The gate: the body of 20261108090200, and the admins told when a client with a suspended account pays
-- again (once per instalment). The account does not change: the admin decides with «Riattiva».
create or replace function public.onboarding_gate_pagamento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente uuid;
  v_nome text;
begin
  if tg_op = 'UPDATE' and old.stato = 'incassata' then
    return null;
  end if;

  -- never at the cost of the cash-in
  begin
    update public.onboarding_inviti i
    set stato = 'attivo', attivato_da = 'pagamento'
    where i.sale_id = new.sale_id and i.stato = 'in_attesa_pagamento';
  exception when others then
    raise warning 'Onboarding: link della vendita % non attivato: %', new.sale_id, sqlerrm;
  end;

  begin
    select s.client_id, concat_ws(' ', nullif(btrim(c.nome), ''), nullif(btrim(c.cognome), ''))
      into v_cliente, v_nome
    from public.sales s
    join public.clients c on c.id = s.client_id
    where s.id = new.sale_id and s.tipo in ('nuovo', 'rinnovo');

    if v_cliente is not null
       and exists (select 1 from public.clienti_account a where a.client_id = v_cliente and a.stato = 'sospeso') then
      perform public.notifiche_avviso_admin(
        'onboarding_cliente',
        left(coalesce(nullif(v_nome, ''), 'Un cliente') || ' ha pagato: se va riattivato, usa Riattiva nella sua scheda di onboarding.', 300),
        'Il suo accesso al percorso è sospeso.',
        null,
        '/onboarding/' || v_cliente::text,
        'onboarding/' || v_cliente::text || '/pagamento-sospeso/' || new.id::text
      );
    end if;
  exception when others then
    raise warning 'Onboarding: avviso del pagamento della vendita % non scritto: %', new.sale_id, sqlerrm;
  end;

  return null;
end;
$$;

-- The sale moved: the body of 20261108090200; a used invite is not revoked, the admins are told
create or replace function public.onboarding_vendita_spostata()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_nome text;
begin
  begin
    update public.onboarding_inviti i
    set stato = 'revocato', revocato_motivo = 'Vendita spostata su un altro cliente', sale_id = null
    where i.sale_id = new.id
      and i.client_id = old.client_id
      and i.stato in ('in_attesa_pagamento', 'attivo', 'scaduto');

    update public.onboarding_percorsi p
    set sale_id = null
    where p.client_id = old.client_id and p.sale_id = new.id;
  exception when others then
    raise warning 'Onboarding: link della vendita % non revocato dopo lo spostamento: %', new.id, sqlerrm;
  end;

  begin
    if exists (
      select 1 from public.onboarding_inviti i
      where i.sale_id = new.id and i.client_id = old.client_id and i.stato = 'usato'
    ) then
      select concat_ws(' ', nullif(btrim(c.nome), ''), nullif(btrim(c.cognome), '')) into v_nome
      from public.clients c where c.id = old.client_id;
      perform public.notifiche_avviso_admin(
        'onboarding_cliente',
        left('La vendita di ' || coalesce(nullif(v_nome, ''), 'un cliente') || ' è passata a un altro cliente: controlla il suo accesso.', 300),
        'Il suo accesso al percorso non è cambiato.',
        null,
        '/onboarding/' || old.client_id::text,
        'onboarding/' || old.client_id::text || '/vendita-spostata/' || new.id::text || '/' || new.client_id::text
      );
    end if;
  exception when others then
    raise warning 'Onboarding: avviso della vendita spostata % non scritto: %', new.id, sqlerrm;
  end;

  return null;
end;
$$;

-- «Cliente di prova»: the switch of the admin
create function public.onboarding_segna_prova(p_invito uuid, p_prova boolean)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v public.onboarding_inviti;
begin
  if public.da_client_oauth() or not public.is_admin() then
    raise exception 'Il cliente di prova lo segna l''admin' using errcode = '42501';
  end if;
  if p_prova is null then
    raise exception 'Scegli se è un cliente di prova' using errcode = '22023';
  end if;

  select * into v from public.onboarding_inviti i where i.id = p_invito for update;
  if not found then
    raise exception 'Invito non trovato' using errcode = '22023';
  end if;
  if v.stato = 'usato' then
    raise exception 'Il cliente è già registrato.' using errcode = '22023';
  end if;

  if v.prova is distinct from p_prova then
    perform set_config('alpha.onboarding_admin', 'on', true);
    update public.onboarding_inviti i set prova = p_prova where i.id = p_invito;
    perform set_config('alpha.onboarding_admin', '', true);

    insert into public.onboarding_eventi (client_id, tipo, attore, autore_id, dettagli)
    values (v.client_id, 'prova', 'team', (select auth.uid()), jsonb_build_object('invito_id', v.id, 'prova', p_prova));
  end if;

  return (
    select jsonb_build_object('invito_id', i.id, 'client_id', i.client_id, 'stato', i.stato, 'prova', i.prova,
                              'scade_il', i.scade_il)
    from public.onboarding_inviti i where i.id = p_invito
  );
end;
$$;

comment on function public.onboarding_segna_prova(uuid, boolean) is
  'The admin marks an invite as a test one (an invented client): its link works even while the client area is closed, and on an active link its days start now. A used invite does not change. Returns { invito_id, client_id, stato, prova, scade_il }. Admin only, never an OAuth token. Security invoker.';

revoke all on function public.onboarding_segna_prova(uuid, boolean) from public, anon;
grant execute on function public.onboarding_segna_prova(uuid, boolean) to authenticated;

-- v_onboarding: the body of 20261108090200, with prova, the state of the account and the registration
create or replace view public.v_onboarding
with (security_invoker = true) as
select
  p.client_id,
  c.nome,
  c.cognome,
  coalesce(i.sale_id, p.sale_id) as sale_id,
  i.id as invito_id,
  i.slug,
  case
    when i.stato = 'attivo' and i.scade_il is not null and i.scade_il < now() then 'scaduto'
    else i.stato
  end as invito_stato,
  i.attivato_il,
  i.attivato_da,
  i.scade_il,
  i.usato_il,
  i.revocato_il,
  i.revocato_motivo,
  i.minorenne,
  i.consenso_genitore_il,
  p.stato as percorso_stato,
  p.giorno_zero,
  p.completato_il,
  passo.passo as passo_corrente,
  passo.titolo as passo_titolo,
  passo.attore as passo_attore,
  passo.stato as passo_stato,
  inc.coach_id,
  pc.nome as coach_nome,
  inc.revisore_id,
  pr.nome as revisore_nome,
  inc.responsabile_id,
  ps.nome as responsabile_nome,
  pg.id as progetto_id,
  p.created_at,
  -- a link still waiting although the payment is there (cashed, or confirmed by hand): a minor waiting
  -- for the consent of a parent. The same rule onboarding_consenso_genitore follows to activate it.
  (
    i.stato = 'in_attesa_pagamento'
    and (
      coalesce((
        select sum(pay.importo_incassato) filter (where pay.stato in ('incassata', 'rimborsata'))
        from public.payments pay where pay.sale_id = i.sale_id
      ), 0) > 0
      or exists (
        select 1 from public.onboarding_eventi e
        where e.client_id = i.client_id
          and e.tipo = 'in_attesa_consenso'
          and e.dettagli ->> 'invito_id' = i.id::text
          and e.dettagli ->> 'modo' = 'manuale'
      )
    )
  ) as pagamento_confermato,
  coalesce(i.prova, false) as prova,
  acc.stato as account_stato,
  acc.registrato_il
from public.onboarding_percorsi p
join public.clients c on c.id = p.client_id
-- the living invite of the client, else the most recent one
left join lateral (
  select x.*
  from public.onboarding_inviti x
  where x.client_id = p.client_id
  order by (x.stato in ('in_attesa_pagamento', 'attivo', 'usato')) desc, x.created_at desc, x.id
  limit 1
) i on true
-- the current step: the first one not done yet
left join lateral (
  select s.passo, d.titolo, d.attore, s.stato
  from public.onboarding_passi s
  join public.onboarding_passi_def d on d.versione = s.versione and d.chiave = s.passo
  where s.client_id = p.client_id and s.stato <> 'fatto'
  order by d.ordine
  limit 1
) passo on true
left join public.onboarding_incarichi inc on inc.client_id = p.client_id
left join public.profiles pc on pc.id = inc.coach_id
left join public.profiles pr on pr.id = inc.revisore_id
left join public.profiles ps on ps.id = inc.responsabile_id
left join public.pm_progetti pg on pg.client_id = p.client_id
left join public.clienti_account acc on acc.client_id = p.client_id
where (select public.is_admin()) and not (select public.da_client_oauth());

comment on view public.v_onboarding is
  'One row per client with an onboarding: the client, the state of the link (scaduto when its days are over), whether it is a test one, the state of the path, the current step and who it is up to, the people in charge, the project, whether the payment is there while the link still waits (a minor without consent), the client''s account (state and registration). Admin only.';

-- «Rigenera link» (from release A), with the guard of B1a: never on a client who has registered
create or replace function public.onboarding_rigenera_link(p_invito uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v public.onboarding_inviti;
  v_token text;
  v_stato text;
  v_modo text;
begin
  if public.da_client_oauth() or not public.is_admin() then
    raise exception 'Un link lo rigenera l''admin' using errcode = '42501';
  end if;

  select * into v from public.onboarding_inviti i where i.id = p_invito for update;
  if not found then
    raise exception 'Invito non trovato' using errcode = '22023';
  end if;
  if v.stato = 'usato' then
    raise exception 'Il link è già stato usato: non si rigenera.' using errcode = '22023';
  end if;
  -- B1a: a client who has registered (link used once, or an account) never gets a new link: his access
  -- comes back only with «Riattiva» (a revoked invite brought to attivo here would reactivate the account)
  if v.usato_il is not null or exists (select 1 from public.clienti_account a where a.client_id = v.client_id) then
    raise exception 'Il cliente è già registrato: usa Riattiva.' using errcode = '22023';
  end if;

  v_stato := v.stato;
  v_modo := v.attivato_da;
  if v.stato in ('revocato', 'scaduto') then
    if exists (
      select 1 from public.onboarding_inviti i
      where i.client_id = v.client_id and i.id <> v.id and i.stato in ('in_attesa_pagamento', 'attivo', 'usato')
    ) then
      raise exception 'Questo cliente ha già un onboarding avviato.' using errcode = '22023';
    end if;

    if (
      select coalesce(sum(p.importo_incassato) filter (where p.stato in ('incassata', 'rimborsata')), 0)
      from public.payments p where p.sale_id = v.sale_id
    ) > 0 then
      v_stato := 'attivo';
      v_modo := 'pagamento';
    elsif v.attivato_da = 'manuale' then
      v_stato := 'attivo';
      v_modo := 'manuale';
    else
      v_stato := 'in_attesa_pagamento';
      v_modo := null;
    end if;
  end if;

  v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

  perform set_config('alpha.onboarding_admin', 'on', true);
  update public.onboarding_inviti i
  set token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex'),
      stato = v_stato,
      attivato_da = case when v_stato = 'attivo' then v_modo else i.attivato_da end
  where i.id = p_invito;
  perform set_config('alpha.onboarding_admin', '', true);

  insert into public.onboarding_inviti_token (invito_id, token) values (p_invito, v_token);

  insert into public.onboarding_eventi (client_id, tipo, attore, autore_id, dettagli)
  values (v.client_id, 'link_rigenerato', 'team', (select auth.uid()), jsonb_build_object('invito_id', v.id));

  return (
    select jsonb_build_object('invito_id', i.id, 'client_id', i.client_id, 'stato', i.stato)
    from public.onboarding_inviti i where i.id = p_invito
  );
end;
$$;

comment on function public.onboarding_rigenera_link(uuid) is
  'A new token (and hash) on the same invite, not used yet; an expired or revoked one goes back to the state the payment justifies (active with money cashed or a payment confirmed by hand, waiting otherwise). Returns { invito_id, client_id, stato }. Never for a client who has registered (B1a: «Riattiva»). Admin only, never an OAuth token.';


-- ---------------------------------------------------------------------------
-- 11. /join: the service role only (the server action has the token or the key of the cookie, never the
--     browser a database id)
-- ---------------------------------------------------------------------------
create function public.onboarding_join_leggi(p_token_hash text, p_slug text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v public.onboarding_inviti;
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('stato', 'non_valido');
  end if;

  select * into v from public.onboarding_inviti i where i.token_hash = p_token_hash for update;
  if not found or (p_slug is not null and lower(btrim(p_slug)) is distinct from v.slug) then
    return jsonb_build_object('stato', 'non_valido');
  end if;

  if v.stato = 'usato' or exists (select 1 from public.clienti_account a where a.client_id = v.client_id) then
    return jsonb_build_object('stato', 'usato', 'nome', public.onboarding_nome_cliente(v.client_id));
  end if;
  if v.stato = 'revocato' then
    return jsonb_build_object('stato', 'revocato');
  end if;
  if v.stato = 'scaduto' then
    return jsonb_build_object('stato', 'scaduto');
  end if;
  if v.stato = 'in_attesa_pagamento' then
    return jsonb_build_object('stato', 'in_attesa');
  end if;

  -- attivo: its days over, it becomes scaduto here (no session: the invite's guard lets it pass)
  if v.scade_il is not null and v.scade_il <= now() then
    update public.onboarding_inviti i set stato = 'scaduto' where i.id = v.id;
    return jsonb_build_object('stato', 'scaduto');
  end if;
  -- active and paid, but the area is closed and it is not a test link: not active yet (never «waiting for the payment»)
  if not public.onboarding_invito_apribile(v.id) then
    return jsonb_build_object('stato', 'non_attivo');
  end if;

  return jsonb_build_object('stato', 'attivo', 'nome', public.onboarding_nome_cliente(v.client_id));
end;
$$;

comment on function public.onboarding_join_leggi(text, text) is
  'The page of a personal link: { stato, nome } with stato in attivo, in_attesa (payment not confirmed), non_attivo (active, but the area is closed and it is not a test link), usato, scaduto, revocato, non_valido; nome (the first name) only for attivo and usato. An active link past its days becomes scaduto here. With p_slug, a slug that does not match is non_valido. Service role only.';

revoke all on function public.onboarding_join_leggi(text, text) from public, anon, authenticated;
grant execute on function public.onboarding_join_leggi(text, text) to service_role;

create function public.onboarding_join_apri(p_token_hash text, p_chiave_hash text, p_slug text default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_letto jsonb;
  v_invito uuid;
begin
  if p_chiave_hash is null or p_chiave_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Chiave non valida' using errcode = '22023';
  end if;

  v_letto := public.onboarding_join_leggi(p_token_hash, p_slug);
  if v_letto ->> 'stato' <> 'attivo' then
    return jsonb_build_object('esito', v_letto ->> 'stato');
  end if;

  select i.id into v_invito from public.onboarding_inviti i where i.token_hash = p_token_hash;

  -- a new key and no code; the reserved id, the requests of the hour and the addresses tried stay
  insert into public.onboarding_registrazioni (invito_id, chiave_hash, chiave_scade_il)
  values (v_invito, p_chiave_hash, now() + interval '30 minutes')
  on conflict (invito_id) do update
  set chiave_hash = excluded.chiave_hash,
      chiave_scade_il = excluded.chiave_scade_il,
      email = null,
      codice_hash = null,
      codice_scade_il = null,
      errori = 0,
      verificato_il = null;

  return jsonb_build_object('esito', 'ok');
end;
$$;

comment on function public.onboarding_join_apri(text, text, text) is
  '«Continua» on the page of a link that onboarding_join_leggi says attivo: creates or renews the registration of the invite with a new key (30 minutes) and no code. Returns { esito: ok } or { esito: <state of the link> }. Service role only.';

revoke all on function public.onboarding_join_apri(text, text, text) from public, anon, authenticated;
grant execute on function public.onboarding_join_apri(text, text, text) to service_role;

create function public.onboarding_join_stato(p_chiave_hash text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.onboarding_registrazioni;
  v public.onboarding_inviti;
begin
  if p_chiave_hash is null or p_chiave_hash !~ '^[0-9a-f]{64}$' then
    return null;
  end if;
  select * into r from public.onboarding_registrazioni x where x.chiave_hash = p_chiave_hash and x.chiave_scade_il > now();
  if not found or not public.onboarding_invito_apribile(r.invito_id) then
    return null;
  end if;
  select * into v from public.onboarding_inviti i where i.id = r.invito_id;

  return jsonb_build_object(
    'nome', public.onboarding_nome_cliente(v.client_id),
    'email_proposta', v.email,
    'codice_inviato_a', case when r.codice_hash is not null and r.codice_scade_il > now() then r.email end
  );
end;
$$;

comment on function public.onboarding_join_stato(text) is
  'The registration page: { nome, email_proposta, codice_inviato_a } while the key is valid and the link can still be opened; null otherwise. Service role only.';

revoke all on function public.onboarding_join_stato(text) from public, anon, authenticated;
grant execute on function public.onboarding_join_stato(text) to service_role;

-- The code to send. p_codice_hash is the sha256 (hex) of the 8 digits: the code in clear never reaches the
-- database, and what stays is sha256(invito_id || ':' || p_codice_hash).
create function public.onboarding_join_codice(p_chiave_hash text, p_email text, p_codice_hash text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.onboarding_registrazioni;
  v_email text := lower(btrim(p_email));
  v_cliente uuid;
begin
  if p_codice_hash is null or p_codice_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Codice non valido' using errcode = '22023';
  end if;

  -- (1) the key
  if p_chiave_hash is null or p_chiave_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('esito', 'scaduta');
  end if;
  select * into r from public.onboarding_registrazioni x
  where x.chiave_hash = p_chiave_hash and x.chiave_scade_il > now()
  for update;
  if not found or not public.onboarding_invito_apribile(r.invito_id) then
    return jsonb_build_object('esito', 'scaduta');
  end if;

  -- (2) every call counts as a request in the window of the hour, whatever its outcome
  if r.invii_dal is null or r.invii_dal <= now() - interval '1 hour' then
    r.invii_dal := now();
    r.invii := 0;
  end if;
  r.invii := r.invii + 1;
  update public.onboarding_registrazioni x set invii_dal = r.invii_dal, invii = r.invii where x.invito_id = r.invito_id;
  if r.invii > 5 then
    return jsonb_build_object('esito', 'troppe_richieste');
  end if;

  -- (3) at most 3 different addresses per invite: a fourth one is refused, admitted or not
  if v_email is null or v_email = '' or char_length(v_email) > 320 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('esito', 'email_non_ammessa');
  end if;
  if not (v_email = any (r.email_provate)) then
    if cardinality(r.email_provate) >= 3 then
      return jsonb_build_object('esito', 'email_non_ammessa');
    end if;
    update public.onboarding_registrazioni x set email_provate = x.email_provate || v_email where x.invito_id = r.invito_id;
  end if;

  -- (4) never the address of the team, of another client or of another user
  if public.email_del_team(v_email)
     or public.email_di_cliente(v_email, r.utente_id)
     or exists (select 1 from auth.users u where lower(u.email) = v_email and u.id <> r.utente_id) then
    return jsonb_build_object('esito', 'email_non_ammessa');
  end if;

  -- (5) the code
  update public.onboarding_registrazioni x
  set email = v_email,
      codice_hash = encode(sha256(convert_to(r.invito_id::text || ':' || p_codice_hash, 'UTF8')), 'hex'),
      codice_scade_il = now() + interval '15 minutes',
      errori = 0,
      verificato_il = null
  where x.invito_id = r.invito_id;

  select i.client_id into v_cliente from public.onboarding_inviti i where i.id = r.invito_id;
  return jsonb_build_object('esito', 'invia', 'nome', public.onboarding_nome_cliente(v_cliente));
end;
$$;

comment on function public.onboarding_join_codice(text, text, text) is
  '«Inviami il codice»: p_codice_hash is the sha256 (hex) of the 8 digits. In order: scaduta (the key); troppe_richieste (more than 5 calls in the hour, every call counts); email_non_ammessa (a fourth different address, or one of the team, of another client or of another user); invia, with nome, after saving the address and the hash of the code (15 minutes). Service role only.';

revoke all on function public.onboarding_join_codice(text, text, text) from public, anon, authenticated;
grant execute on function public.onboarding_join_codice(text, text, text) to service_role;

create function public.onboarding_join_verifica(p_chiave_hash text, p_codice text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.onboarding_registrazioni;
  v_giusto boolean;
begin
  if p_chiave_hash is null or p_chiave_hash !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('esito', 'scaduto');
  end if;
  select * into r from public.onboarding_registrazioni x
  where x.chiave_hash = p_chiave_hash and x.chiave_scade_il > now()
  for update;
  if not found or not public.onboarding_invito_apribile(r.invito_id) then
    return jsonb_build_object('esito', 'scaduto');
  end if;
  if r.errori >= 5 then
    return jsonb_build_object('esito', 'bloccato');
  end if;

  v_giusto := r.codice_hash is not null
    and r.codice_scade_il > now()
    and p_codice ~ '^[0-9]{8}$'
    and r.codice_hash = encode(sha256(convert_to(
          r.invito_id::text || ':' || encode(sha256(convert_to(p_codice, 'UTF8')), 'hex'), 'UTF8')), 'hex');

  if not v_giusto then
    update public.onboarding_registrazioni x set errori = x.errori + 1 where x.invito_id = r.invito_id;
    if r.errori + 1 >= 5 then
      update public.onboarding_registrazioni x set codice_hash = null, codice_scade_il = null where x.invito_id = r.invito_id;
      return jsonb_build_object('esito', 'bloccato');
    end if;
    return jsonb_build_object('esito', 'errato');
  end if;

  -- the code is used once; the user must be born within 10 minutes
  update public.onboarding_registrazioni x
  set verificato_il = now(), codice_hash = null, codice_scade_il = null
  where x.invito_id = r.invito_id;

  return jsonb_build_object('esito', 'ok', 'utente_id', r.utente_id, 'email', r.email);
end;
$$;

comment on function public.onboarding_join_verifica(text, text) is
  'The code of the registration: ok (with utente_id and email: the user must be created within 10 minutes with that id and that address), errato, bloccato (5 errors: a new code is needed), scaduto (the key, or the link that cannot be opened any more). Service role only.';

revoke all on function public.onboarding_join_verifica(text, text) from public, anon, authenticated;
grant execute on function public.onboarding_join_verifica(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 12. The return through /entra (and the client's branch of /login): the service role only
-- ---------------------------------------------------------------------------
create function public.cliente_accesso_per_email(p_email text)
returns table (user_id uuid, stato text, nome text)
language sql
stable
security definer
set search_path = ''
as $$
  select a.user_id, a.stato, public.onboarding_nome_cliente(a.client_id)
  from auth.users u
  join public.clienti_account a on a.user_id = u.id
  where lower(u.email) = lower(btrim(p_email))
  limit 1;
$$;

comment on function public.cliente_accesso_per_email(text) is
  'The client''s account with this address in auth.users, if any (every state): user_id, stato, nome (the first name). Service role only.';

revoke all on function public.cliente_accesso_per_email(text) from public, anon, authenticated;
grant execute on function public.cliente_accesso_per_email(text) to service_role;

create function public.cliente_accesso_conta(p_email text, p_tipo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_chiave text := 'email:' || encode(sha256(convert_to(lower(btrim(coalesce(p_email, ''))), 'UTF8')), 'hex');
  e public.clienti_accesso_limiti;
  t public.clienti_accesso_limiti;
begin
  if p_tipo not in ('invio', 'invio_team', 'verifica', 'errore') then
    raise exception 'Tipo non valido' using errcode = '22023';
  end if;

  -- the windows of one hour start again when they are over (the last code sent stays)
  insert into public.clienti_accesso_limiti (chiave) values ('tutti') on conflict (chiave) do nothing;
  update public.clienti_accesso_limiti l
  set dal = now(), invii = 0, errori = 0
  where l.chiave in ('tutti', v_chiave) and l.dal <= now() - interval '1 hour';

  select * into t from public.clienti_accesso_limiti l where l.chiave = 'tutti' for update;
  select * into e from public.clienti_accesso_limiti l where l.chiave = v_chiave for update;

  if p_tipo = 'invio' then
    if coalesce(e.invii, 0) >= 5 or t.invii >= 200 then
      return false;
    end if;
    insert into public.clienti_accesso_limiti (chiave, invii, ultimo_invio_il)
    values (v_chiave, 1, now())
    on conflict (chiave) do update set invii = clienti_accesso_limiti.invii + 1, ultimo_invio_il = now();
    update public.clienti_accesso_limiti l set invii = l.invii + 1 where l.chiave = 'tutti';
    return true;
  end if;

  -- the team's code of /login: 10 an hour per address, never counted on everybody (any address
  -- reaches this road, a stranger's too: it must not consume the clients' sends)
  if p_tipo = 'invio_team' then
    if coalesce(e.invii, 0) >= 10 then
      return false;
    end if;
    insert into public.clienti_accesso_limiti (chiave, invii, ultimo_invio_il)
    values (v_chiave, 1, now())
    on conflict (chiave) do update set invii = clienti_accesso_limiti.invii + 1, ultimo_invio_il = now();
    return true;
  end if;

  if p_tipo = 'verifica' then
    return e.chiave is not null
      and e.ultimo_invio_il > now() - interval '60 minutes'
      and e.errori < 5
      and t.errori < 100;
  end if;

  -- errore: only for an address that received a code in the last hour (the only one whose code
  -- reaches Supabase); a stranger's address counts nothing, on itself or on everybody
  if e.chiave is null or e.ultimo_invio_il is null or e.ultimo_invio_il <= now() - interval '60 minutes' then
    return true;
  end if;
  update public.clienti_accesso_limiti l set errori = l.errori + 1 where l.chiave = v_chiave;
  update public.clienti_accesso_limiti l set errori = l.errori + 1 where l.chiave = 'tutti';
  return true;
end;
$$;

comment on function public.cliente_accesso_conta(text, text) is
  'The limits of /entra and /login per address. invio: true and counted if the address has had fewer than 5 codes in the hour and everybody fewer than 200 (writes the last code sent). invio_team: the team''s code of /login, true and counted if the address has had fewer than 10 codes in the hour, never on everybody (writes the last code sent). verifica: counts nothing; true only if a code was sent to the address in the last 60 minutes, with fewer than 5 errors in the hour for it and fewer than 100 for everybody. errore: counts an error on the address and on everybody, only if the address received a code in the last 60 minutes. Service role only.';

revoke all on function public.cliente_accesso_conta(text, text) from public, anon, authenticated;
grant execute on function public.cliente_accesso_conta(text, text) to service_role;

-- The limit per IP of the request (/entra and /login), before every road: one source never consumes
-- the counters of everybody. The app passes the IP Vercel gives (never on loopback: local and e2e).
create function public.accesso_ip_conta(p_ip text, p_tipo text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ip text := lower(btrim(coalesce(p_ip, '')));
  v_chiave text;
  r public.clienti_accesso_limiti;
begin
  if p_tipo not in ('richiesta', 'verifica') then
    raise exception 'Tipo non valido' using errcode = '22023';
  end if;
  if v_ip = '' or length(v_ip) > 100 then
    return true;
  end if;
  v_chiave := 'ip:' || encode(sha256(convert_to(v_ip, 'UTF8')), 'hex');

  insert into public.clienti_accesso_limiti (chiave) values (v_chiave) on conflict (chiave) do nothing;
  update public.clienti_accesso_limiti l
  set dal = now(), invii = 0, errori = 0
  where l.chiave = v_chiave and l.dal <= now() - interval '1 hour';
  select * into r from public.clienti_accesso_limiti l where l.chiave = v_chiave for update;

  -- richiesta: the codes asked (invii), 20 an hour; verifica: the codes typed (errori), 30 an hour
  if p_tipo = 'richiesta' then
    if r.invii >= 20 then
      return false;
    end if;
    update public.clienti_accesso_limiti l set invii = l.invii + 1 where l.chiave = v_chiave;
    return true;
  end if;

  if r.errori >= 30 then
    return false;
  end if;
  update public.clienti_accesso_limiti l set errori = l.errori + 1 where l.chiave = v_chiave;
  return true;
end;
$$;

comment on function public.accesso_ip_conta(text, text) is
  'The limit per IP of /entra and /login (its sha256, windows of one hour): richiesta true and counted below 20 codes asked, verifica true and counted below 30 codes typed. An empty IP is not limited. Service role only.';

revoke all on function public.accesso_ip_conta(text, text) from public, anon, authenticated;
grant execute on function public.accesso_ip_conta(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 13. The bucket «avatari»: the four policies of 20260928160000, only for a user with a role (never a client)
-- ---------------------------------------------------------------------------
drop policy avatari_insert_propri on storage.objects;
drop policy avatari_update_propri on storage.objects;
drop policy avatari_delete_propri on storage.objects;
drop policy avatari_select_propri on storage.objects;

create policy avatari_insert_propri
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatari' and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select public.current_role()) is not null);

create policy avatari_update_propri
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatari' and (storage.foldername(name))[1] = (select auth.uid())::text
         and (select public.current_role()) is not null)
  with check (bucket_id = 'avatari' and (storage.foldername(name))[1] = (select auth.uid())::text
              and (select public.current_role()) is not null);

create policy avatari_delete_propri
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatari' and (storage.foldername(name))[1] = (select auth.uid())::text
         and (select public.current_role()) is not null);

-- listing your own folder (to clean up old photos)
create policy avatari_select_propri
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatari' and (storage.foldername(name))[1] = (select auth.uid())::text
         and (select public.current_role()) is not null);
