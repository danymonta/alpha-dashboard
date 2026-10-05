-- The client's Drive folder now has two writers (20261005100000: the admin and
-- the coach of the client's project). Two notes after the review, 05/10/2026.
--
-- 1. Who sees it follows pm_progetti.coach_id, and the coach is picked by who
--    manages the project (the admin, or a manager who is a member: section 18,
--    pm_scegli_coach and the update policy of pm_progetti). So whoever manages
--    a client's project also decides who reads that client's folder: a manager
--    who names himself (or anyone active) coach reads it as long as that person
--    stays the coach, and loses it when the coach changes again. A manager who
--    is not the coach still reads nothing. Whether a manager may name himself,
--    or only people with the coach role may be coaches, is Dany's call: nothing
--    changes here on pm_progetti.
--
-- 2. Who linked the folder is the truth: a coach's insert gets his own id and
--    now() whatever he sends, and a coach's update keeps created_by and
--    created_at as they were. The admin is not touched (section 19: he
--    corrects everything; elimina_persona and unisci_profili rewrite
--    created_by), nor are the seed, the restore and the service role (no
--    session).

create or replace function public.clienti_cartelle_autore()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

comment on function public.clienti_cartelle_autore() is
  'clienti_cartelle: whoever is not the admin cannot write created_by or created_at (his own id and now() on insert, unchanged on update).';

revoke all on function public.clienti_cartelle_autore() from public, anon, authenticated;

create trigger clienti_cartelle_autore
  before insert or update on public.clienti_cartelle
  for each row execute function public.clienti_cartelle_autore();

comment on table public.clienti_cartelle is
  'The link to the client''s Google Drive folder (https://drive.google.com/...). The admin and the coach of the client''s project (picked by who manages the project); never the closer, the setter, other coaches or the other members of the project.';
