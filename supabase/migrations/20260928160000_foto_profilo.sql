-- Profile photo and self-service profile (Dany, 27/09/2026).
-- By default the Google account photo; anyone may upload their own. Files live
-- in the public bucket "avatari", one folder per person: the URL is readable by
-- whoever has it (it is shown to the team), writing is only in your own folder.

alter table public.profiles add column foto_url text;
alter table public.profiles
  add constraint profiles_foto_url_https check (foto_url is null or foto_url ~ '^https?://');

-- New members start with their Google photo
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

  insert into public.profiles (id, email, nome, ruolo, foto_url)
  values (new.id, v_email, v_nome, v_ruolo, public.foto_google(new.raw_user_meta_data))
  on conflict (id) do nothing;

  update public.invites
  set usato_at = coalesce(usato_at, now())
  where email = v_email;

  return new;
end;
$$;

-- Google puts the photo in avatar_url (and picture): https only
create or replace function public.foto_google(p_meta jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when u ~ '^https://' then u end
  from (select coalesce(nullif(p_meta ->> 'avatar_url', ''), nullif(p_meta ->> 'picture', '')) as u) x;
$$;

-- Those already in: their Google photo, where there is one
update public.profiles p
set foto_url = public.foto_google(u.raw_user_meta_data)
from auth.users u
where u.id = p.id and p.foto_url is null;

-- Everyone edits their own name and photo, nothing else of their row: no
-- update policy on profiles for non-admins (it would open role and state too).
-- The photo must be their Google one or a file in their own folder.
create or replace function public.aggiorna_mio_profilo(p_nome text, p_foto_url text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid := (select auth.uid());
  v_google text;
begin
  if v_id is null or public.current_role() is null then
    raise exception 'Sessione scaduta' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_nome, ''))) < 2 then
    raise exception 'Scrivi il tuo nome' using errcode = '22023';
  end if;

  select public.foto_google(u.raw_user_meta_data) into v_google from auth.users u where u.id = v_id;
  if p_foto_url is not null
     and p_foto_url is distinct from v_google
     and p_foto_url !~ ('/storage/v1/object/public/avatari/' || v_id::text || '/[A-Za-z0-9._-]+$') then
    raise exception 'Foto non valida' using errcode = '22023';
  end if;

  update public.profiles
  set nome = trim(p_nome), foto_url = p_foto_url
  where id = v_id;
end;
$$;

revoke all on function public.aggiorna_mio_profilo(text, text) from public, anon;
grant execute on function public.aggiorna_mio_profilo(text, text) to authenticated;
revoke all on function public.foto_google(jsonb) from public, anon;

-- The Google photo as it is now (it changes on Google's side), for "Usa la foto di Google"
create or replace function public.mia_foto_google()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.foto_google(u.raw_user_meta_data) from auth.users u where u.id = (select auth.uid());
$$;

revoke all on function public.mia_foto_google() from public, anon;
grant execute on function public.mia_foto_google() to authenticated;

-- Storage: public bucket, 2 MB, images only; writes only in your own folder
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatari', 'avatari', true, 2097152, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy avatari_insert_propri
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'avatari' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatari_update_propri
  on storage.objects for update
  to authenticated
  using (bucket_id = 'avatari' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatari' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy avatari_delete_propri
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'avatari' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- listing your own folder (to clean up old photos)
create policy avatari_select_propri
  on storage.objects for select
  to authenticated
  using (bucket_id = 'avatari' and (storage.foldername(name))[1] = (select auth.uid())::text);
