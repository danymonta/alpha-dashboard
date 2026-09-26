-- Derived client status. Never stored: it is a function of the sales.

create type public.client_status as enum (
  'attivo', 'in_scadenza', 'scaduto', 'ex_cliente', 'mai_attivato'
);

-- security_invoker: the view must run with the caller's permissions, otherwise
-- it silently bypasses RLS.
create view public.v_client_status
with (security_invoker = true)
as
with ultima_vendita as (
  select
    s.client_id,
    count(*) as numero_vendite,
    max(s.data_fine) as data_fine_ultima,
    bool_or(public.oggi() between s.data_inizio and s.data_fine) as attiva
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
    when u.client_id is null then 'mai_attivato'
    when u.attiva and u.data_fine_ultima <= public.oggi() + 30 then 'in_scadenza'
    when u.attiva then 'attivo'
    when u.data_fine_ultima >= public.oggi() - 90 then 'scaduto'
    else 'ex_cliente'
  end)::public.client_status as stato
from public.clients c
left join ultima_vendita u on u.client_id = c.id;

revoke all on public.v_client_status from anon;

comment on view public.v_client_status is
  'Client status derived from sales: attivo, in_scadenza (<= 30gg), scaduto (< 90gg), ex_cliente, mai_attivato.';

-- ---------------------------------------------------------------------------
-- The setter never gets row access to clients (contacts live there). They read
-- name and status of the clients born from their own leads through this RPC.
-- ---------------------------------------------------------------------------

create or replace function public.miei_clienti()
returns table (
  id uuid,
  nome text,
  stato public.client_status
)
language sql
stable
security definer
set search_path = ''
as $$
  select v.client_id, v.nome, v.stato
  from public.v_client_status v
  join public.clients c on c.id = v.client_id
  left join public.leads l on l.id = c.lead_id
  where public.current_role() = 'setter'
    and (l.setter_id = (select auth.uid()) or c.setter_id = (select auth.uid()))
  order by v.nome;
$$;

revoke all on function public.miei_clienti() from public, anon;
grant execute on function public.miei_clienti() to authenticated;
