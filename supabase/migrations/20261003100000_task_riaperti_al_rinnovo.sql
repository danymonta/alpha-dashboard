-- At the renewal the client's tasks reopen by themselves (Dany, 03/10/2026,
-- asked whether the completed tasks should reopen at the renewal: «fai che si
-- riaprano da soli se rinnova»).
--
-- The moment is the one that already opens the client's project
-- (20261002110000_progetto_riaperto.sql): the first cashed instalment of a path
-- (a "nuovo" or "rinnovo" sale whose path is not over), or a paid sale
-- corrected into one. When the client already had its project before that
-- moment, the template tasks completed before that path go back to "da_fare",
-- whatever the project's state: reopened now from "completato" or
-- "archiviato", still "attivo" (a renewal paid while the coach keeps it open),
-- or "in_pausa" (the project stays paused, its tasks reopen for when it starts
-- again). The instalment that creates the project does nothing more: its tasks
-- are new.
--
-- Only a renewal: the path must follow another one of the client (a "nuovo"
-- or "rinnovo" sale that started earlier: a renewal, or a client back with a
-- new sale). "First instalment" is read from the instalments cashed now, so in
-- the first path it can come again (the cash of the first one undone and done
-- again, another one cashed with an earlier date, an expired sale extended):
-- it reopens the project as since 1.17.0, never the coach's tasks.
-- Only the tasks completed before that path: before it started, or before it
-- was registered when that came later. A renewal signed in advance and paid
-- later reopens what the coach completed in between, until the new path
-- starts; the first instalment of the renewal cashed again, or the renewal
-- extended, never reopens what the coach completed during the renewal itself.
--
-- Template tasks: the main tasks the app made from the template together with
-- the project (pm_crea_progetto_cliente, 20261002090000_progetto_per_cliente.sql):
-- no author (the app leaves none; a person always has one, pm_task_autore),
-- created in the same transaction as the project (same created_at: a task of a
-- person deleted afterwards loses its author too, elimina_persona, but was
-- created later), and no deadline in the past. The 8 tasks of "Percorso
-- cliente" have no dates: they are the buckets of the whole path, where the
-- coach logs time. A task whose deadline is over (a dated item of a template,
-- or a date the coach gave a bucket) would go straight among the tasks in
-- delay: it stays as it is, and whoever works on it reopens it with a tap; a
-- deadline still to come reopens with its date.
-- Untouched: tasks made by people, sub-tasks, tasks not completed (in corso,
-- in revisione, da fare), assignees, time entries, notes, members, coach.
-- completato_il is cleared by pm_task_coerenza, as when a person reopens.
--
-- A second instalment of the same path never reopens the tasks the coach
-- completed during the path, and an upsell never reopens them (the same rule
-- as the project: 20261002110000).
-- Rows touched by the app leave no person on them: pm_task has no author of
-- its changes (pm_task_autore only guards created_by and progetto_id), no
-- audit; a closer cashing his sale, who is not a member, reopens them too.
-- Nothing here ever blocks the cash: the triggers keep their warning; tasks
-- that cannot reopen are a warning of their own and never keep the project
-- closed.

-- ---------------------------------------------------------------------------
-- 1. The one helper of both triggers, now told which sale opens the path: the
--    client's project opens, created when missing; when it was there already,
--    reopened when closed and, at a renewal, its template tasks completed
--    before the path back to do. One signature (the one with the client only
--    goes). No grants: only the triggers call it.
-- ---------------------------------------------------------------------------
drop function if exists public.pm_apri_progetto_cliente(uuid);

create or replace function public.pm_apri_progetto_cliente(p_client_id uuid, p_sale_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_progetto uuid;
  v_creato_il timestamptz;
  v_prima_del timestamptz;
begin
  if p_client_id is null then
    return null;
  end if;

  select p.id, p.created_at into v_progetto, v_creato_il
  from public.pm_progetti p
  where p.client_id = p_client_id;

  -- the first path: a new project, its tasks just made
  if v_progetto is null then
    return public.pm_crea_progetto_cliente(p_client_id);
  end if;

  -- a new path for a project that was there: the path is not over any more
  update public.pm_progetti p
  set stato = 'attivo'
  where p.id = v_progetto
    and p.stato in ('completato', 'archiviato');

  -- a renewal: the path follows another one of the client; the tasks
  -- completed before it (its start, or its registration when later) reopen
  select greatest((s.data_inizio::timestamp at time zone 'Europe/Rome'), s.created_at)
  into v_prima_del
  from public.sales s
  where s.id = p_sale_id
    and s.client_id = p_client_id
    and exists (
      select 1 from public.sales prima
      where prima.client_id = s.client_id
        and prima.id <> s.id
        and prima.tipo in ('nuovo', 'rinnovo')
        and prima.data_inizio < s.data_inizio
    );
  if v_prima_del is null then
    return v_progetto;
  end if;

  -- the template's buckets are open again; never at the cost of the project
  begin
    update public.pm_task t
    set stato = 'da_fare'
    where t.progetto_id = v_progetto
      and t.stato = 'completato'
      and coalesce(t.completato_il, '-infinity'::timestamptz) < v_prima_del
      and t.parent_id is null
      and t.created_by is null
      and t.created_at = v_creato_il
      and (t.scadenza is null or t.scadenza >= public.oggi());
  exception when others then
    raise warning 'Task del progetto % non riaperti: %', v_progetto, sqlerrm;
  end;

  return v_progetto;
end;
$$;

revoke all on function public.pm_apri_progetto_cliente(uuid, uuid) from public, anon, authenticated;

comment on function public.pm_apri_progetto_cliente(uuid, uuid) is
  'Internal: the client''s project at the first cashed instalment of a path (the sale): created when missing; when it was there, back to attivo when completato or archiviato and, when the path follows another one, its template tasks (no author, made with the project, no past deadline) completed before the path (start, or registration when later) back to da_fare.';

-- ---------------------------------------------------------------------------
-- 2. The first cashed instalment: the helper whatever the project's state
--    (before: nothing when attivo or in_pausa), with its sale. Everything else
--    as in 20261002110000_progetto_riaperto.sql.
-- ---------------------------------------------------------------------------

-- Only the first instalment cashed on a path (nuovo or rinnovo) that is not
-- over yet: a project deleted on purpose does not come back at the next
-- instalment, only with a new path; a project closed again, or a task
-- completed again, by whoever works on it is not reopened by the next
-- instalment, only by a new path.
-- Several instalments cashed in one statement: only the earliest counts.
-- "First" is read from the instalments cashed now: the cash of the first one
-- undone and done again, or another one cashed with an earlier date, counts as
-- a first instalment again (and brings back a project deleted on purpose, or
-- reopens a closed one; the tasks only those completed before the path).
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

  begin
    perform public.pm_apri_progetto_cliente(v_cliente, new.sale_id);
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
--    the helper now, with that sale, as it would have run at that instalment,
--    whatever the project's state. The dates follow the sales as before.
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
     and exists (select 1 from public.payments x where x.sale_id = new.id and x.stato = 'incassata') then
    begin
      perform public.pm_apri_progetto_cliente(new.client_id, new.id);
    exception when others then
      raise warning 'Progetto del cliente % non aperto: %', new.client_id, sqlerrm;
    end;
  end if;

  return null;
end;
$$;

revoke all on function public.pm_progetto_segue_vendite() from public, anon, authenticated;
