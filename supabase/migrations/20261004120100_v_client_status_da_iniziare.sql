-- Derived client status with da_iniziare (04/10/2026, previous migration).
-- Before: no sale in progress today and the last end within 90 days meant
-- "scaduto", even with an end in the future. Two cases read "Scaduto":
-- - a new client in the week before the start (data_inizio = sale + 7 days);
-- - a renewal starting after a gap (path ended, the new one not started).
-- Both showed up in Rinnovi among the ended ones ("finito il …, -92 giorni fa").
--
-- Order of the rules:
-- 1. no sale                                   -> mai_attivato
-- 2. a sale in progress today                  -> in_scadenza / attivo, as before
--    (a renewal signed in advance keeps the client attivo)
-- 3. none in progress, one starting after today -> da_iniziare
-- 4. otherwise every sale has ended            -> scaduto (< 90 days) / ex_cliente
-- "Clienti attivi" keeps its definition (CLAUDE.md section 9): today between
-- start and end. Same columns: v_clienti and miei_clienti() read it unchanged.

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
    when u.client_id is null then 'mai_attivato'
    when u.attiva and u.data_fine_ultima <= public.oggi() + 30 then 'in_scadenza'
    when u.attiva then 'attivo'
    when u.da_iniziare then 'da_iniziare'
    when u.data_fine_ultima >= public.oggi() - 90 then 'scaduto'
    else 'ex_cliente'
  end)::public.client_status as stato
from public.clients c
left join ultima_vendita u on u.client_id = c.id;

revoke all on public.v_client_status from anon;

comment on view public.v_client_status is
  'Client status derived from sales: attivo, in_scadenza (<= 30gg), da_iniziare (none in progress, one starting later), scaduto (< 90gg), ex_cliente, mai_attivato.';
