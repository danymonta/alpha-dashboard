-- Fathom (1.37.0, «Call da Fathom nel closing e Spunti nel Marketing», CLAUDE.md section 31).
-- Dany, 16/10/2026: the recording of a held call comes from a link the closer
-- pastes in the outcome sheet, and the app finds that recording through
-- Fathom's API with the admin's key. No automatic matching, no round that
-- reads the list of meetings to look for calls.
--
-- This file: the link with Fathom. One row (the key is only in Vault, like the
-- Instagram token: read only by the service role), and the functions that set,
-- remove and report the key. Never a transcript, a summary or an invitee here.

create table public.fathom_collegamento (
  id boolean primary key default true check (id),
  chiave_aggiornata_il timestamptz,
  ultima_prova_il timestamptz,
  -- a fixed sentence (lib/fathom/frasi.ts), never the key
  ultimo_errore text check (char_length(ultimo_errore) <= 500),
  ultimo_errore_il timestamptz,
  updated_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.fathom_collegamento default values;

create trigger fathom_collegamento_set_updated_at before update on public.fathom_collegamento
  for each row execute function public.set_updated_at();

alter table public.fathom_collegamento enable row level security;
revoke all on public.fathom_collegamento from anon;
revoke insert, update, delete, truncate on public.fathom_collegamento from authenticated;

create policy fathom_collegamento_admin on public.fathom_collegamento
  for select to authenticated using (public.is_admin());
create policy fathom_collegamento_mai_da_oauth on public.fathom_collegamento
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

comment on table public.fathom_collegamento is
  'One row: when the Fathom API key was saved (the key itself lives in Vault, read only by the service role), the last check and the last error in words. Admin reads; written only by the fathom_* functions.';

-- The admin saves the key. Never returns it, never echoes it in an error.
create function public.fathom_imposta_chiave(p_chiave text)
returns date
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_chiave text := btrim(coalesce(p_chiave, ''), E' \t\r\n"''');
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'La chiave di Fathom la imposta l’admin.' using errcode = '42501';
  end if;
  if char_length(v_chiave) not between 20 and 200 or v_chiave ~ '\s' then
    raise exception 'Questa non sembra una chiave di Fathom: copiala di nuovo da Impostazioni › API Access.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('alpha.fathom_chiave', 0));
  select s.id into v_id from vault.secrets s where s.name = 'fathom_chiave';
  if v_id is null then
    perform vault.create_secret(v_chiave, 'fathom_chiave',
      'Fathom API key of Percorso Alpha: read only by the service role (fathom_chiave)');
  else
    perform vault.update_secret(v_id, v_chiave);
  end if;

  update public.fathom_collegamento c
  set chiave_aggiornata_il = now(), ultimo_errore = null, ultimo_errore_il = null, updated_by = (select auth.uid())
  where c.id;
  return (now() at time zone 'Europe/Rome')::date;
end;
$$;

create function public.fathom_togli_chiave()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'La chiave di Fathom la toglie l’admin.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('alpha.fathom_chiave', 0));
  delete from vault.secrets s where s.name = 'fathom_chiave';
  update public.fathom_collegamento c
  set chiave_aggiornata_il = null, updated_by = (select auth.uid()) where c.id;
end;
$$;

-- Whether a key is there, never its value
create function public.fathom_chiave_presente()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Il collegamento di Fathom lo vede l’admin.' using errcode = '42501';
  end if;
  return exists (select 1 from vault.secrets s where s.name = 'fathom_chiave');
end;
$$;

-- The key, for the server routes only (service role)
create function public.fathom_chiave()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.decrypted_secret from vault.decrypted_secrets d where d.name = 'fathom_chiave';
$$;

-- Takes from a text everything that looks like a key (20 or more characters
-- without a space) and cuts it to 500
create function public.fathom_errore(p_testo text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select left(regexp_replace(coalesce(p_testo, ''), '[^\s]{20,}', '…', 'g'), 500);
$$;

-- The outcome of a call to Fathom, for the settings page: null clears the error
create function public.fathom_segna_esito(p_errore text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.fathom_collegamento c
  set ultima_prova_il = now(),
      ultimo_errore = nullif(public.fathom_errore(p_errore), ''),
      ultimo_errore_il = case when nullif(btrim(coalesce(p_errore, '')), '') is null then null else now() end
  where c.id;
end;
$$;

revoke all on function public.fathom_imposta_chiave(text) from public, anon;
grant execute on function public.fathom_imposta_chiave(text) to authenticated;
revoke all on function public.fathom_togli_chiave() from public, anon;
grant execute on function public.fathom_togli_chiave() to authenticated;
revoke all on function public.fathom_chiave_presente() from public, anon;
grant execute on function public.fathom_chiave_presente() to authenticated;
revoke all on function public.fathom_chiave() from public, anon, authenticated;
grant execute on function public.fathom_chiave() to service_role;
revoke all on function public.fathom_errore(text) from public, anon, authenticated;
grant execute on function public.fathom_errore(text) to service_role;
revoke all on function public.fathom_segna_esito(text) from public, anon, authenticated;
grant execute on function public.fathom_segna_esito(text) to service_role;

comment on function public.fathom_imposta_chiave(text) is
  'Admin only: stores the Fathom API key in Vault (one secret, fixed name) and clears the last error. Never returns it.';
comment on function public.fathom_chiave() is
  'service_role only: the Fathom API key, for the server routes.';
