-- "Non rinnova" (20261004130100), reopened by the sale itself.
--
-- Before: a closure stayed in the table and only stopped counting when a
-- nuovo or rinnovo sale was signed strictly after chiuso_il (v_clienti_chiusi).
-- A renewal registered the same day as the closure ("Ha rinnovato" proposes
-- today) or dated a few days before it (registered late) left the client
-- "chiuso": out of In scadenza and Da recuperare, no reminders for the new
-- path. And the rows that no longer counted kept tripping the closure's
-- coherence check (elimina_persona and unisci_profili update created_by) and
-- showed "chiuso" to a closer who cannot read the sale that reopened him.
--
-- Now: a new path of the client (a nuovo or rinnovo sale inserted, or a sale
-- that becomes one: upsell corrected into rinnovo, moved to this client)
-- deletes his closure, whatever its signing day, unless it is history (signed
-- and ended before the closing day: an old path recorded late). A path whose
-- signing day moves after the closing day deletes it too (the closure would
-- come before his latest signing). An upsell never. The row goes, so the
-- client stays open even if that sale is deleted later: closing him again is
-- "Non rinnova" again. v_clienti_chiusi keeps its date rule as a safety net
-- (a restore with the triggers off), and v_client_status does not change.

create or replace function public.clienti_chiusure_riapri_da_vendita()
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
    delete from public.clienti_chiusure ch
    where ch.client_id = new.client_id
      and greatest(new.data_vendita, new.data_fine) >= ch.chiuso_il;
  elsif new.data_vendita is distinct from old.data_vendita then
    delete from public.clienti_chiusure ch
    where ch.client_id = new.client_id
      and new.data_vendita > ch.chiuso_il;
  end if;
  return null;
end;
$$;

comment on function public.clienti_chiusure_riapri_da_vendita() is
  'Trigger of sales: a new nuovo/rinnovo path of the client (not one signed and ended before the closing day) deletes his closure ("Non rinnova"); so does a path signed after the closing day. Never an upsell.';

revoke all on function public.clienti_chiusure_riapri_da_vendita() from public, anon, authenticated;

create trigger sales_riapre_cliente_chiuso
  after insert or update of tipo, client_id, data_vendita on public.sales
  for each row execute function public.clienti_chiusure_riapri_da_vendita();

-- The coherence check of the closing day runs when the day is written, not on
-- every update: elimina_persona and unisci_profili rewrite created_by only.
drop trigger clienti_chiusure_coerenza on public.clienti_chiusure;
create trigger clienti_chiusure_coerenza
  before insert or update of chiuso_il, client_id on public.clienti_chiusure
  for each row execute function public.clienti_chiusure_coerenza();

-- The closures that no longer count (a path signed after the closing day): gone.
delete from public.clienti_chiusure ch
where exists (
  select 1 from public.sales s
  where s.client_id = ch.client_id
    and s.tipo in ('nuovo', 'rinnovo')
    and s.data_vendita > ch.chiuso_il
);

comment on table public.clienti_chiusure is
  'Clients the admin closed ("Non rinnova"): day and optional reason. A new nuovo/rinnovo path of the client deletes the row (trigger sales_riapre_cliente_chiuso). Admin writes, the client''s closer reads.';

comment on view public.v_clienti_chiusi is
  'Closures in force. The trigger sales_riapre_cliente_chiuso deletes a closure when the client buys again; the date rule here is a safety net for rows written with the triggers off.';
