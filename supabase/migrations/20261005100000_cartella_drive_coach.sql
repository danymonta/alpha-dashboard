-- Dany, 05/10/2026: «la scheda Drive deve essere visibile anche dal progetto
-- del cliente perché fa parte delle sue info, e deve poterla modificare ed
-- editare il fitness coach». Asked who else besides him: «Anche i coach».
--
-- The client's Google Drive folder (clienti_cartelle, 20261004110000) was
-- admin only. Now the coach of the client's project reads it, links it,
-- changes it and takes it away too: the person in pm_progetti.coach_id of the
-- project whose client_id is the folder's client, with an active account.
-- Nobody else: not the closer or the setter of the client, not another coach,
-- not the members of the project who are not its coach, not a project manager
-- who is not the coach (Dany named the coach only). The coach keeps never
-- reading clients, sales or instalments: the helper below reads pm_progetti
-- with the owner's rights and answers only "is the caller this client's
-- coach?". A coach changed or gone from the project (pm_scegli_coach,
-- pm_membro_tolto) loses the folder at once: the policy asks every time.

create or replace function public.pm_coach_del_cliente(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.pm_progetti p
    join public.profiles pr on pr.id = p.coach_id
    where p.client_id = p_client_id
      and p.coach_id = (select auth.uid())
      and pr.attivo
  );
$$;

comment on function public.pm_coach_del_cliente(uuid) is
  'True when the caller (active) is the coach of this client''s project. Used by the policies of clienti_cartelle; says nothing about anyone else.';

revoke all on function public.pm_coach_del_cliente(uuid) from public, anon;
grant execute on function public.pm_coach_del_cliente(uuid) to authenticated;

-- the admin's policy (clienti_cartelle_admin) stays as it is; this one adds the coach
create policy clienti_cartelle_coach on public.clienti_cartelle for all to authenticated
  using (public.pm_coach_del_cliente(client_id))
  with check (public.pm_coach_del_cliente(client_id));

comment on table public.clienti_cartelle is
  'The link to the client''s Google Drive folder (https://drive.google.com/...). The admin and the coach of the client''s project; never the closer, the setter, other coaches or the other members of the project.';
