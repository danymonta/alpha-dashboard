-- The setter sees the clients he brought in (Dany, 27/09/2026): for every sale
-- where he is the setter, the revenue, the instalments with what was paid and
-- when, and the commission each cash-in gives him, so he knows what he is owed.
-- Nothing else of the sale (no contacts, no payment method, no notes) and never
-- a sale where someone else is the setter.
-- The commission is the one of v_provvigioni_maturate: the rule valid on the
-- cash-in date for that sale type. Per-sale totals are computed here too.
create or replace function public.mie_vendite_setter()
returns table (
  sale_id uuid,
  cliente text,
  prodotto text,
  tipo public.sale_type,
  data_vendita date,
  valore_contratto numeric,
  numero_rate integer,
  numero_rata integer,
  scadenza date,
  importo_previsto numeric,
  stato public.payment_status,
  incassato_il date,
  importo_incassato numeric,
  in_ritardo boolean,
  percentuale numeric,
  provvigione numeric,
  incassato_vendita numeric,
  rate_incassate integer,
  rate_in_ritardo integer,
  provvigione_vendita numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
  v_oggi date := public.oggi();
begin
  if public.current_role() is distinct from 'setter' then
    raise exception 'Questi sono i clienti del setter' using errcode = '42501';
  end if;

  return query
  with righe as (
    select
      s.id as sid,
      trim(concat_ws(' ', c.nome, c.cognome)) as cli,
      coalesce(pr.nome, s.prodotto_personalizzato) as prod,
      s.tipo as t,
      s.data_vendita as dv,
      s.valore_contratto as valore,
      s.numero_rate as nrate,
      p.numero_rata as nrata,
      p.scadenza as scad,
      p.importo_previsto as previsto,
      p.stato as st,
      p.incassato_il as il,
      p.importo_incassato as incassato,
      (p.stato = 'prevista' and p.scadenza < v_oggi) as ritardo,
      r.percentuale as perc,
      case when p.stato in ('incassata', 'rimborsata') and r.percentuale is not null
        then round(p.importo_incassato * r.percentuale, 2)::numeric(12, 2) end as provv
    from public.sales s
    join public.clients c on c.id = s.client_id
    left join public.products pr on pr.id = s.product_id
    join public.payments p on p.sale_id = s.id
    left join lateral (
      select cr.percentuale
      from public.commission_rules cr
      where cr.profile_id = s.setter_id
        and s.tipo = any (cr.applica_a)
        and p.stato in ('incassata', 'rimborsata')
        and p.incassato_il >= cr.valida_dal
        and (cr.valida_al is null or p.incassato_il <= cr.valida_al)
      order by cr.valida_dal desc
      limit 1
    ) r on true
    where s.setter_id = v_utente
  )
  select
    righe.sid, righe.cli, righe.prod, righe.t, righe.dv, righe.valore, righe.nrate, righe.nrata,
    righe.scad, righe.previsto, righe.st, righe.il, righe.incassato, righe.ritardo, righe.perc, righe.provv,
    (coalesce(sum(righe.incassato) over (partition by righe.sid), 0))::numeric(12, 2),
    (count(*) filter (where righe.st = 'incassata') over (partition by righe.sid))::integer,
    (count(*) filter (where righe.ritardo) over (partition by righe.sid))::integer,
    (sum(righe.provv) over (partition by righe.sid))::numeric(12, 2)
  from righe
  order by righe.dv desc, righe.sid, righe.nrata;
end;
$$;

comment on function public.mie_vendite_setter() is
  'The calling setter''s sales: client name, revenue, instalments and the commission of each cash-in. Nothing else.';

revoke all on function public.mie_vendite_setter() from public, anon;
grant execute on function public.mie_vendite_setter() to authenticated;
