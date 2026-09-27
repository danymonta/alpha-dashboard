-- Projects area, round two (Dany, 27/09/2026).
-- 1. A client belongs only on projects of a department that works on clients:
--    in Fitness Coaching the project is the client's path; Vendite e Marketing,
--    Contenuti, Amministrazione run internal work.
alter table public.pm_reparti add column progetti_con_cliente boolean not null default false;

update public.pm_reparti
set progetti_con_cliente = true
where nome = 'Fitness Coaching'
   or id in (select reparto_id from public.pm_progetti where client_id is not null);

create or replace function public.pm_cliente_nel_reparto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.client_id is not null and not exists (
    select 1 from public.pm_reparti r where r.id = new.reparto_id and r.progetti_con_cliente
  ) then
    raise exception 'Questo reparto non lavora sui clienti: togli il cliente o scegli un reparto per clienti'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger pm_progetti_cliente_nel_reparto
  before insert or update of client_id, reparto_id on public.pm_progetti
  for each row execute function public.pm_cliente_nel_reparto();

create or replace function public.pm_reparto_senza_clienti()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.progetti_con_cliente and not new.progetti_con_cliente and exists (
    select 1 from public.pm_progetti p where p.reparto_id = new.id and p.client_id is not null
  ) then
    raise exception 'Il reparto ha progetti legati a un cliente: togli prima il cliente da quei progetti'
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger pm_reparti_senza_clienti
  before update of progetti_con_cliente on public.pm_reparti
  for each row execute function public.pm_reparto_senza_clienti();

-- 2. The project overview: tasks by status and the time spent, counted in SQL.
-- Security invoker: tasks and time entries go through their own RLS, so an
-- employee counts only the time they may see (their own).
create or replace function public.pm_panoramica_progetto(p_progetto uuid)
returns table (
  da_fare integer,
  in_corso integer,
  in_revisione integer,
  completati integer,
  in_ritardo integer,
  senza_assegnatario integer,
  in_scadenza_7_giorni integer,
  minuti_totali integer,
  minuti_ultimi_7_giorni integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    count(*) filter (where t.stato = 'da_fare')::integer,
    count(*) filter (where t.stato = 'in_corso')::integer,
    count(*) filter (where t.stato = 'in_revisione')::integer,
    count(*) filter (where t.stato = 'completato')::integer,
    count(*) filter (where t.stato <> 'completato' and t.scadenza < public.oggi())::integer,
    count(*) filter (where t.stato <> 'completato' and t.assegnatario_id is null)::integer,
    count(*) filter (
      where t.stato <> 'completato' and t.scadenza between public.oggi() and public.oggi() + 7
    )::integer,
    (select coalesce(sum(v.minuti), 0)::integer from public.pm_tempo v where v.progetto_id = p_progetto),
    (select coalesce(sum(v.minuti), 0)::integer from public.pm_tempo v
      where v.progetto_id = p_progetto and v.data >= public.oggi() - 6)
  from public.pm_task t
  where t.progetto_id = p_progetto;
$$;

revoke all on function public.pm_panoramica_progetto(uuid) from public, anon;
grant execute on function public.pm_panoramica_progetto(uuid) to authenticated;
