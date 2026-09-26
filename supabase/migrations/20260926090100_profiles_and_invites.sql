-- Users: profiles mirror auth.users, access is invite-only.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  nome text not null,
  ruolo public.app_role not null,
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_email_lowercase check (email = lower(email))
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create index profiles_ruolo_idx on public.profiles (ruolo) where attivo;

create table public.invites (
  email text primary key,
  ruolo public.app_role not null,
  invitato_da uuid references public.profiles (id),
  usato_at timestamptz,
  revocato boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint invites_email_lowercase check (email = lower(email))
);

create trigger invites_set_updated_at
  before update on public.invites
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Role helpers. security definer so that policies on profiles cannot recurse.
-- ---------------------------------------------------------------------------

create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.ruolo
  from public.profiles p
  where p.id = (select auth.uid())
    and p.attivo;
$$;

comment on function public.current_role() is
  'Active role of the caller, or null when unknown/deactivated. Use in policies.';

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_role() = 'admin', false);
$$;

revoke all on function public.current_role() from anon;
revoke all on function public.is_admin() from anon;

-- ---------------------------------------------------------------------------
-- Invite gate: a new auth user is accepted only if invited and not revoked.
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
begin
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

  insert into public.profiles (id, email, nome, ruolo)
  values (new.id, v_email, v_nome, v_ruolo)
  on conflict (id) do nothing;

  update public.invites
  set usato_at = coalesce(usato_at, now())
  where email = v_email;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Nobody can deactivate themselves or change their own role (spec section 7).
-- ---------------------------------------------------------------------------

create or replace function public.guard_profile_self_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) = old.id then
    if new.attivo is distinct from old.attivo then
      raise exception 'Non puoi disattivare il tuo stesso account'
        using errcode = '42501';
    end if;
    if new.ruolo is distinct from old.ruolo then
      raise exception 'Non puoi cambiare il tuo stesso ruolo'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_self_change
  before update on public.profiles
  for each row execute function public.guard_profile_self_change();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.invites enable row level security;

revoke all on public.profiles from anon;
revoke all on public.invites from anon;

-- Every signed-in member can read the team directory: names are needed to pick
-- a closer, to label a call, to show "chi ha chiuso". No money lives here.
create policy profiles_select_authenticated
  on public.profiles for select
  to authenticated
  using (public.current_role() is not null);

create policy profiles_update_admin
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy profiles_insert_admin
  on public.profiles for insert
  to authenticated
  with check (public.is_admin());

create policy invites_all_admin
  on public.invites for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
