-- "Archivia come ex cliente" (Dany, 05/10/2026: "cliente chiuso: metti un
-- pulsante per farlo diventare ex cliente, così se non ricompra lo mettiamo
-- in archivio").
--
-- - clienti_chiusure.archiviato_il: the day the admin archived a closed
--   client. On the closure itself, so the same RLS holds (the admin writes,
--   the closer of the client reads) and everything that ends the closure ends
--   the archiving too: "Riapri" deletes the row, a new nuovo or rinnovo path
--   deletes it by itself (trigger sales_riapre_cliente_chiuso, 20261004130200).
--   "Togli dall'archivio" clears the day: the client is "chiuso" again.
-- - The day: never in the future, never before the closing day.
-- - v_clienti_chiusi: the day too (Rinnovi, the client sheet, Alfire).
-- - v_client_status: a closed and archived client is ex_cliente, the value
--   that already says "an old client" (and the Clienti filter "Ex cliente");
--   a closed one not archived stays chiuso. The other rules do not change.
-- Still a closure: no path reminders (promemoria_percorso_da_inviare reads
-- v_clienti_chiusi, archived or not). Metrics computed from the sale dates do
-- not change.

alter table public.clienti_chiusure add column archiviato_il date;

comment on column public.clienti_chiusure.archiviato_il is
  'Archived as ex cliente by the admin on this day (null: closed, not archived). Never in the future, never before chiuso_il.';

-- Checked when the day is written, or the closing day moves under it; its own
-- trigger, so archiving never runs the closing day's check against the sales.
create or replace function public.clienti_chiusure_archivio_coerenza()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.archiviato_il is null then
    return new;
  end if;
  if new.archiviato_il > public.oggi() then
    raise exception 'Il giorno dell''archivio non può essere nel futuro' using errcode = '22023';
  end if;
  if new.archiviato_il < new.chiuso_il then
    raise exception 'Il giorno dell''archivio (%) non può venire prima della chiusura (%)',
      to_char(new.archiviato_il, 'DD/MM/YYYY'), to_char(new.chiuso_il, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger clienti_chiusure_archivio_coerenza
  before insert or update of archiviato_il, chiuso_il on public.clienti_chiusure
  for each row execute function public.clienti_chiusure_archivio_coerenza();

-- ---------------------------------------------------------------------------
-- The closures in force, with the archiving day (a new last column).
-- ---------------------------------------------------------------------------
create or replace view public.v_clienti_chiusi
with (security_invoker = true)
as
select ch.client_id, ch.chiuso_il, ch.motivo, ch.created_at, ch.archiviato_il
from public.clienti_chiusure ch
where not exists (
  select 1 from public.sales s
  where s.client_id = ch.client_id
    and s.tipo in ('nuovo', 'rinnovo')
    and s.data_vendita > ch.chiuso_il
);

revoke all on public.v_clienti_chiusi from anon;

comment on view public.v_clienti_chiusi is
  'Closures in force, with the archiving day (archiviato_il: ex cliente). The trigger sales_riapre_cliente_chiuso deletes a closure when the client buys again; the date rule here is a safety net for rows written with the triggers off.';

-- ---------------------------------------------------------------------------
-- Derived client status: closed and archived = ex_cliente.
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
    when u.client_id is null then 'mai_attivato'
    when u.attiva and u.data_fine_ultima <= public.oggi() + 30 then 'in_scadenza'
    when u.attiva then 'attivo'
    when u.da_iniziare then 'da_iniziare'
    when u.data_fine_ultima >= public.oggi() - 90 then 'scaduto'
    else 'ex_cliente'
  end)::public.client_status as stato
from public.clients c
left join ultima_vendita u on u.client_id = c.id
left join public.v_clienti_chiusi ch on ch.client_id = c.id;

revoke all on public.v_client_status from anon;

comment on view public.v_client_status is
  'Client status: chiuso (closed by the admin, wins over everything) or ex_cliente once he archives it, then from sales: attivo, in_scadenza (<= 30gg), da_iniziare, scaduto (< 90gg), ex_cliente, mai_attivato.';
