-- "Sospendi" (Dany, 21/10/2026: "clienti in status potrebbero andare in
-- sospeso, chiusi che non hanno rinnovato e attivi; in questo modo calcoliamo
-- il LTV del cliente come dato").
--
-- The admin puts a client on hold from his sheet ("Sospendi": the day, today by
-- default, and an optional reason) and takes him back with "Riattiva". Like
-- "Non rinnova" (clienti_chiusure), a table of its own, so the client's status
-- stays derived and nobody has to set "attivo" by hand:
-- - the path and the instalments do not change (decided by Dany: no shifting
--   of dates);
-- - v_client_status: sospeso wins over every state from the sales, but not over
--   chiuso or ex_cliente (a closed client is not on hold);
-- - closing a client ("Non rinnova") ends his hold, and so does a new path (a
--   nuovo or rinnovo sale of the client): paying again means he is back;
-- - no path reminders ("Call dei 3 mesi", "Call di rinnovo") while on hold;
-- - metrics computed from the sale dates (cash, revenue, renewal rate, active
--   clients) do not change, as for the closed ones. Lists that ask "who is about
--   to end" skip him in the pages (Rinnovi, Panoramica), where the state is read.

create table public.clienti_sospensioni (
  client_id uuid primary key references public.clients (id) on delete cascade,
  sospeso_il date not null,
  motivo text
    constraint clienti_sospensioni_motivo
    check (motivo is null or (char_length(motivo) <= 500 and btrim(motivo) <> '')),
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger clienti_sospensioni_updated_at
  before update on public.clienti_sospensioni
  for each row execute function public.set_updated_at();

-- The day of the hold: never in the future. Checked when the day is written
-- (elimina_persona and unisci_profili only rewrite created_by).
create or replace function public.clienti_sospensioni_coerenza()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sospeso_il > public.oggi() then
    raise exception 'Il giorno della sospensione non può essere nel futuro' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger clienti_sospensioni_coerenza
  before insert or update of sospeso_il, client_id on public.clienti_sospensioni
  for each row execute function public.clienti_sospensioni_coerenza();

alter table public.clienti_sospensioni enable row level security;
revoke all on public.clienti_sospensioni from anon;

create policy clienti_sospensioni_admin on public.clienti_sospensioni for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- The closer reads the hold of the clients he reads (clients RLS decides which:
-- born from his calls), never writes it: his Clienti list shows the same state.
create policy clienti_sospensioni_closer_lettura on public.clienti_sospensioni for select to authenticated
  using (
    public.current_role() = 'closer'
    and exists (select 1 from public.clients c where c.id = clienti_sospensioni.client_id)
  );

-- A token of Claude (MCP OAuth, 1.34.0) never reaches it, like every table since 20261014090300.
create policy clienti_sospensioni_mai_da_oauth on public.clienti_sospensioni as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

comment on table public.clienti_sospensioni is
  'Clients the admin put on hold ("Sospendi"): day and optional reason. A closure ("Non rinnova") or a new nuovo/rinnovo path of the client deletes the row. Admin writes, the client''s closer reads.';

-- A new path of the client brings him back: a nuovo or rinnovo sale inserted, or
-- a sale that becomes one or moves to him. Never an upsell.
create or replace function public.clienti_sospensioni_riattiva_da_vendita()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tipo not in ('nuovo', 'rinnovo') then
    return null;
  end if;
  if tg_op = 'INSERT'
     or old.tipo not in ('nuovo', 'rinnovo')
     or old.client_id is distinct from new.client_id then
    delete from public.clienti_sospensioni sp where sp.client_id = new.client_id;
  end if;
  return null;
end;
$$;

comment on function public.clienti_sospensioni_riattiva_da_vendita() is
  'Trigger of sales: a new nuovo/rinnovo path of the client ends his hold ("Sospendi"). Never an upsell.';

revoke all on function public.clienti_sospensioni_riattiva_da_vendita() from public, anon, authenticated;

create trigger sales_riattiva_cliente_sospeso
  after insert or update of tipo, client_id on public.sales
  for each row execute function public.clienti_sospensioni_riattiva_da_vendita();

-- A closed client is not on hold: the closure ends it.
create or replace function public.clienti_sospensioni_chiusa()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.clienti_sospensioni sp where sp.client_id = new.client_id;
  return null;
end;
$$;

revoke all on function public.clienti_sospensioni_chiusa() from public, anon, authenticated;

create trigger clienti_chiusure_toglie_sospensione
  after insert on public.clienti_chiusure
  for each row execute function public.clienti_sospensioni_chiusa();

-- ---------------------------------------------------------------------------
-- Derived client status: on hold wins over the sales' states, not over closed.
-- ---------------------------------------------------------------------------
create or replace view public.v_client_status
with (security_invoker = true)
as
with ultima_vendita as (
  select
    s.client_id,
    count(*) as numero_vendite,
    max(s.data_fine) as data_fine_ultima,
    bool_or(public.oggi() between s.data_inizio and s.data_fine) as attiva,
    bool_or(s.data_inizio > public.oggi()) as da_iniziare
  from public.sales s
  group by s.client_id
)
select
  c.id as client_id,
  c.nome,
  c.cognome,
  coalesce(u.numero_vendite, 0) as numero_vendite,
  u.data_fine_ultima,
  (case
    when ch.client_id is not null and ch.archiviato_il is not null then 'ex_cliente'
    when ch.client_id is not null then 'chiuso'
    when sp.client_id is not null then 'sospeso'
    when u.client_id is null then 'mai_attivato'
    when u.attiva and u.data_fine_ultima <= public.oggi() + 30 then 'in_scadenza'
    when u.attiva then 'attivo'
    when u.da_iniziare then 'da_iniziare'
    when u.data_fine_ultima >= public.oggi() - 90 then 'scaduto'
    else 'ex_cliente'
  end)::public.client_status as stato
from public.clients c
left join ultima_vendita u on u.client_id = c.id
left join public.v_clienti_chiusi ch on ch.client_id = c.id
left join public.clienti_sospensioni sp on sp.client_id = c.id;

revoke all on public.v_client_status from anon;

comment on view public.v_client_status is
  'Client status: chiuso (closed by the admin) or ex_cliente once archived win over everything; then sospeso (on hold, set by the admin); then from sales: attivo, in_scadenza (<= 30gg), da_iniziare, scaduto (< 90gg), ex_cliente, mai_attivato.';

-- No path reminders while a client is on hold (the function of 20261004130100, one more clause).
create or replace function public.promemoria_percorso_da_inviare(p_giorno date)
 RETURNS TABLE(client_id uuid, sale_id uuid, tipo promemoria_tipo, azione text, nome text, cognome text, telefono text, prodotto text, data_inizio date, data_fine date, giorni_mancanti integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with percorso as (
    -- the path: the latest nuovo or rinnovo sale of each client, upsells never
    select distinct on (s.client_id)
      s.client_id as cliente,
      s.id as vendita,
      s.data_inizio as inizio,
      s.data_fine as fine,
      coalesce(pr.nome, s.prodotto_personalizzato) as nome_prodotto,
      -- the end the product's duration gives (null off the catalogue)
      (s.data_inizio + make_interval(months => pr.durata_mesi))::date - 1 as fine_prevista
    from public.sales s
    left join public.products pr on pr.id = s.product_id
    where s.tipo in ('nuovo', 'rinnovo')
    order by s.client_id, s.data_fine desc, s.data_inizio desc, s.created_at desc, s.id
  ),
  in_corso as (
    select
      p.*,
      p_giorno >= (p.fine - interval '1 month')::date as rinnovo_dovuto,
      -- longer than 3 months: a 3-month path has no "call dei 3 mesi". Its end
      -- is start + 3 months - 1 day; typed by hand it may be start + 3 months,
      -- or a few days later from a start at the end of a month (months last 28
      -- to 31 days: 30/11 -> 01/03): up to 3 days past start + 3 months it is
      -- still a 3-month path
      p.fine > (p.inizio + interval '3 months')::date + 3
        and p_giorno >= (p.fine - interval '3 months')::date as feedback_dovuto
    from percorso p
    where p.fine >= p_giorno                     -- an ended path gets nothing
      and not exists (                           -- nor an interrupted one: at the
        select 1 from public.promemoria_percorso x   -- end the interruption set, or
        where x.esito = 'interrotto'                 -- moved since and still short
          and ((x.client_id = p.cliente and x.data_fine = p.fine)
            or (x.sale_id = p.vendita and (p.fine_prevista is null or p.fine < p.fine_prevista)))
      )
      -- nor a client the admin closed ("Non rinnova", 04/10/2026): nothing is
      -- recorded, so reopened he gets the reminders still due
      and not exists (select 1 from public.v_clienti_chiusi ch where ch.client_id = p.cliente)
      -- nor a client on hold ("Sospendi", 21/10/2026): same, nothing is recorded
      and not exists (select 1 from public.clienti_sospensioni sp where sp.client_id = p.cliente)
  ),
  dovuti as (
    select i.cliente, i.vendita, i.inizio, i.fine, i.nome_prodotto,
      'rinnovo_1_mese'::public.promemoria_tipo as tipo_promemoria, 'invia' as cosa_fare
    from in_corso i
    where i.rinnovo_dovuto
    union all
    -- catch-up: past both thresholds, only the renewal one goes
    select i.cliente, i.vendita, i.inizio, i.fine, i.nome_prodotto,
      'feedback_3_mesi'::public.promemoria_tipo,
      case when i.rinnovo_dovuto then 'salta' else 'invia' end
    from in_corso i
    where i.feedback_dovuto
  )
  select d.cliente, d.vendita, d.tipo_promemoria, d.cosa_fare,
    c.nome, c.cognome, c.telefono, d.nome_prodotto, d.inizio, d.fine,
    (d.fine - p_giorno)::integer
  from dovuti d
  join public.clients c on c.id = d.cliente
  where not exists (                             -- once per client, kind and end
    select 1 from public.promemoria_percorso x
    where x.client_id = d.cliente and x.tipo = d.tipo_promemoria and x.data_fine = d.fine
      -- booked by a run of the cron that may still be sending it
      and (x.esito <> 'in_invio' or x.updated_at >= now() - interval '30 minutes')
  )
  order by (d.tipo_promemoria = 'rinnovo_1_mese') desc, d.fine, c.nome, c.cognome, d.cliente;
$function$;

comment on function public.promemoria_percorso_da_inviare(date) is
  'Path reminders due on a day (feedback 3 months before the end, renewal 1 month before), not yet handled, never for a closed client or a client on hold. service_role only: the daily cron.';
revoke all on function public.promemoria_percorso_da_inviare(date) from public, anon, authenticated;
grant execute on function public.promemoria_percorso_da_inviare(date) to service_role;
