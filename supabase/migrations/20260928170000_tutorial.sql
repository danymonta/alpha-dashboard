-- Guided tour at the first sign-in (Dany, 27/09/2026). A flag, not a date:
-- the team directory is readable by everyone, and when someone first came in
-- is nobody's business (CLAUDE.md section 17).
alter table public.profiles add column tutorial_visto boolean not null default false;

-- Whoever is already in has found their way around
update public.profiles set tutorial_visto = true;

-- Each person marks only their own tour as seen; no update policy on profiles
-- for non-admins, so this is the only column they can touch this way.
create or replace function public.segna_tutorial_visto()
returns void
language sql
security definer
set search_path = ''
as $$
  update public.profiles set tutorial_visto = true
  where id = (select auth.uid()) and not tutorial_visto;
$$;

revoke all on function public.segna_tutorial_visto() from public, anon;
grant execute on function public.segna_tutorial_visto() to authenticated;
