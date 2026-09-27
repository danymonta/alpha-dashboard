-- "Interrompi il percorso" (Dany, 27/09/2026): a client who stops early.
-- The sale ends on the chosen day, so the client's derived state follows
-- (scaduto from the day after, ex cliente after 90 days). Optionally the
-- instalments not yet paid that fall after that day go away and the contract
-- drops by as much, so the plan still adds up. Cashed instalments and refunds
-- are never touched. With p_esegui false it only says what would happen: the
-- sheet shows it before the confirmation.
create or replace function public.interrompi_percorso(
  p_sale_id uuid,
  p_ultimo_giorno date,
  p_togli_rate boolean,
  p_esegui boolean default false
)
returns table (
  rate_tolte integer,
  importo_tolto numeric,
  valore_prima numeric,
  valore_dopo numeric,
  rate_restanti integer
)
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_sale public.sales;
  v_tolte integer := 0;
  v_importo numeric(12, 2) := 0;
  v_totali integer;
begin
  if not public.is_admin() then
    raise exception 'Solo l''admin interrompe un percorso' using errcode = '42501';
  end if;

  select * into v_sale from public.sales where id = p_sale_id;
  if not found then
    raise exception 'Vendita non trovata' using errcode = 'P0002';
  end if;
  if p_ultimo_giorno is null or p_ultimo_giorno < v_sale.data_inizio or p_ultimo_giorno > v_sale.data_fine then
    raise exception 'L''ultimo giorno va dal % al %',
      to_char(v_sale.data_inizio, 'DD/MM/YYYY'), to_char(v_sale.data_fine, 'DD/MM/YYYY')
      using errcode = '22023';
  end if;

  if p_togli_rate then
    select count(*)::integer, coalesce(sum(p.importo_previsto), 0)::numeric(12, 2)
      into v_tolte, v_importo
    from public.payments p
    where p.sale_id = p_sale_id and p.stato in ('prevista', 'fallita') and p.scadenza > p_ultimo_giorno;
  end if;

  select count(*)::integer into v_totali from public.payments p where p.sale_id = p_sale_id;
  if v_totali - v_tolte = 0 then
    raise exception 'Non resterebbe nessuna rata: se non ha pagato niente, elimina la vendita'
      using errcode = '22023';
  end if;

  if p_esegui then
    if v_tolte > 0 then
      delete from public.payments p
      where p.sale_id = p_sale_id and p.stato in ('prevista', 'fallita') and p.scadenza > p_ultimo_giorno;
    end if;
    update public.sales s
    set data_fine = p_ultimo_giorno,
        valore_contratto = s.valore_contratto - v_importo,
        numero_rate = v_totali - v_tolte
    where s.id = p_sale_id;
  end if;

  return query select v_tolte, v_importo, v_sale.valore_contratto,
    (v_sale.valore_contratto - v_importo)::numeric(12, 2), v_totali - v_tolte;
end;
$$;

comment on function public.interrompi_percorso(uuid, date, boolean, boolean) is
  'Admin only: ends a sale early; optionally drops the unpaid instalments after that day and lowers the contract.';

revoke all on function public.interrompi_percorso(uuid, date, boolean, boolean) from public, anon;
grant execute on function public.interrompi_percorso(uuid, date, boolean, boolean) to authenticated;
