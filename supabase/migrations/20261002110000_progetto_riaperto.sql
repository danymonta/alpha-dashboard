-- The client's project reopens at the renewal (Dany, 02/10/2026: «sì riaprilo
-- al rinnovo»).
--
-- The moment that creates the client's project (the first cashed instalment of
-- a "nuovo" or "rinnovo" sale whose path is not over, or a sale corrected into
-- one after its instalments were cashed: 20261002090000_progetto_per_cliente.sql)
-- now also reopens it: a project marked "completato" or "archiviato" goes back
-- to "attivo": both say the path is over, and the renewal says otherwise. A
-- project "in_pausa" stays as it is (a pause does not say the path is over);
-- an active one has nothing to do. Only that moment: a second instalment of
-- the same path never reopens a project closed again by whoever manages it,
-- and an upsell never reopens one (as it never creates one).
--
-- Nothing else changes: name, coach, members, tasks (whoever is assigned
-- reopens the ones they need) and dates (the renewal already moved them,
-- sales_progetto_cliente). Deleting, interrupting or correcting the renewal
-- after the reopen never closes the project again (the sales never remove or
-- close a project): whoever manages it closes it by hand.
-- The project has no completion date and no author of its changes: setting
-- the state back writes no person on it, so whoever cashed (a closer, who is
-- not a member) leaves no trace on the coach's project.
-- Nothing here ever blocks the cash: a project that cannot be reopened is a
-- warning, like one that cannot be created.

-- ---------------------------------------------------------------------------
-- 1. One internal helper for both triggers, so they cannot drift: the client's
--    project opens, created when missing, reopened when closed. No grants:
--    only the triggers below call it.
-- ---------------------------------------------------------------------------
create or replace function public.pm_apri_progetto_cliente(p_client_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_progetto uuid;
begin
  if p_client_id is null then
    return null;
  end if;

  update public.pm_progetti p
  set stato = 'attivo'
  where p.client_id = p_client_id
    and p.stato in ('completato', 'archiviato')
  returning p.id into v_progetto;
  if v_progetto is not null then
    return v_progetto;
  end if;

  -- the one it has (active or paused), or a new one
  return public.pm_crea_progetto_cliente(p_client_id);
end;
$$;

revoke all on function public.pm_apri_progetto_cliente(uuid) from public, anon, authenticated;

comment on function public.pm_apri_progetto_cliente(uuid) is
  'Internal: the client''s project at the first cashed instalment of a path: created when missing, back to attivo when completato or archiviato.';

-- ---------------------------------------------------------------------------
-- 2. The first cashed instalment: creates or reopens. Everything else as in
--    20261002090000_progetto_per_cliente.sql.
-- ---------------------------------------------------------------------------

-- Only the first instalment cashed on a path (nuovo or rinnovo) that is not
-- over yet: a project deleted on purpose does not come back at the next
-- instalment, only with a new path; a project closed again by whoever manages
-- it is not reopened by the next instalment, only by a new path.
-- Several instalments cashed in one statement: only the earliest counts.
-- "First" is read from the instalments cashed now: the cash of the first one
-- undone and done again, or another one cashed with an earlier date, counts as
-- a first instalment again (and brings back a project deleted on purpose, or
-- reopens a closed one).
-- Nothing here ever blocks the cash: a project that cannot be made is a warning.
create or replace function public.pm_progetto_da_incasso()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cliente uuid;
begin
  if tg_op = 'UPDATE' and old.stato = 'incassata' then
    return null;
  end if;

  select s.client_id into v_cliente
  from public.sales s
  where s.id = new.sale_id
    and s.tipo in ('nuovo', 'rinnovo')
    and s.data_fine >= public.oggi();
  if v_cliente is null then
    return null;
  end if;

  if exists (
    select 1 from public.payments p
    where p.sale_id = new.sale_id
      and p.id <> new.id
      and p.stato = 'incassata'
      and (p.incassato_il, p.numero_rata, p.id) < (new.incassato_il, new.numero_rata, new.id)
  ) then
    return null;
  end if;

  -- active or paused: nothing to do
  if exists (
    select 1 from public.pm_progetti p
    where p.client_id = v_cliente and p.stato in ('attivo', 'in_pausa')
  ) then
    return null;
  end if;

  begin
    perform public.pm_apri_progetto_cliente(v_cliente);
  exception when others then
    raise warning 'Progetto del cliente % non aperto: %', v_cliente, sqlerrm;
  end;

  return null;
end;
$$;

revoke all on function public.pm_progetto_da_incasso() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. A sale corrected into a path after its first instalment was cashed (an
--    upsell that was a renewal, a past end fixed, the right client chosen):
--    the client's project opens now, created or reopened, as it would have at
--    that instalment. The dates follow the sales as before.
-- ---------------------------------------------------------------------------
create or replace function public.pm_progetto_segue_vendite()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.pm_allinea_progetto_cliente(old.client_id);
  end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.client_id is distinct from old.client_id) then
    perform public.pm_allinea_progetto_cliente(new.client_id);
  end if;

  if tg_op = 'UPDATE'
     and new.tipo in ('nuovo', 'rinnovo')
     and new.data_fine >= public.oggi()
     and (
       old.tipo not in ('nuovo', 'rinnovo')
       or coalesce(old.data_fine < public.oggi(), true)
       or old.client_id is distinct from new.client_id
     )
     and exists (select 1 from public.payments x where x.sale_id = new.id and x.stato = 'incassata')
     and not exists (
       select 1 from public.pm_progetti p
       where p.client_id = new.client_id and p.stato in ('attivo', 'in_pausa')
     ) then
    begin
      perform public.pm_apri_progetto_cliente(new.client_id);
    exception when others then
      raise warning 'Progetto del cliente % non aperto: %', new.client_id, sqlerrm;
    end;
  end if;

  return null;
end;
$$;

revoke all on function public.pm_progetto_segue_vendite() from public, anon, authenticated;
