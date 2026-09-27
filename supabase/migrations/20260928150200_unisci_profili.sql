-- Two profiles of the same person become one (Dany, 28/09/2026): typically the
-- placeholder "Loris (da collegare)" of the Excel import and the real Loris after
-- his first Google sign-in. Everything recorded under the first moves to the
-- second; where both have the same thing (a report of the same day, the same
-- project), the second wins. Then the first account is removed.
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
  delete from public.pm_membri m
  where m.profile_id = p_da
    and exists (select 1 from public.pm_membri x where x.profile_id = p_a and x.progetto_id = m.progetto_id);
  -- one set of commission rules per person: the target's, if it has any
  if exists (select 1 from public.commission_rules where profile_id = p_a) then
    delete from public.commission_rules where profile_id = p_da;
  end if;
  -- one running timer per person
  update public.pm_tempo set fine = greatest(clock_timestamp(), inizio + interval '1 second')
  where profile_id = p_da and inizio is not null and fine is null;

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
