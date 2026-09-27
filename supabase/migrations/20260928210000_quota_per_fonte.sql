-- "Da dove arrivano i soldi" also says each source's share of the cash
-- (design review, 27/09/2026). The return type changes: drop and recreate.
drop function public.metriche_per_fonte(date, date);

create or replace function public.metriche_per_fonte(p_da date, p_a date)
returns table (
  fonte public.lead_source,
  cash numeric,
  quota_cash numeric,
  nuovi_clienti integer,
  lead integer,
  call_svolte integer,
  chiuse integer,
  close_rate numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Le metriche economiche le vede solo l''admin' using errcode = '42501';
  end if;
  return query
  with per_fonte as (
  select
    f.fonte,
    (select coalesce(sum(p.importo_incassato), 0)::numeric(12, 2)
       from public.payments p
       join public.sales s on s.id = p.sale_id
       join public.clients cl on cl.id = s.client_id
      where cl.fonte = f.fonte and p.stato in ('incassata', 'rimborsata') and p.incassato_il between p_da and p_a) as cash,
    (select count(*)::integer
       from public.sales s
       join public.clients cl on cl.id = s.client_id
      where cl.fonte = f.fonte and s.tipo = 'nuovo' and s.data_vendita between p_da and p_a) as nuovi,
    (select count(*)::integer from public.leads l
      where l.fonte = f.fonte and (l.created_at at time zone 'Europe/Rome')::date between p_da and p_a) as lead,
    c.svolte,
    c.chiuse,
    case when c.svolte = 0 then null else round(c.chiuse::numeric / c.svolte, 4) end as close_rate
  from unnest(enum_range(null::public.lead_source)) as f(fonte)
  cross join lateral (
    select
      count(*) filter (where ca.stato = 'svolta')::integer as svolte,
      count(*) filter (where ca.stato = 'svolta' and ca.esito = 'chiusa')::integer as chiuse
    from public.calls ca
    join public.leads l on l.id = ca.lead_id
    where l.fonte = f.fonte and (ca.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
  ) c
  )
  select
    pf.fonte,
    pf.cash,
    -- share of the period's cash (refunds included), null when nothing came in
    case when sum(pf.cash) over () = 0 then null else round(pf.cash / sum(pf.cash) over (), 4) end,
    pf.nuovi,
    pf.lead,
    pf.svolte,
    pf.chiuse,
    pf.close_rate
  from per_fonte pf
  order by pf.cash desc, pf.fonte;
end;
$$;

revoke all on function public.metriche_per_fonte(date, date) from public, anon;
grant execute on function public.metriche_per_fonte(date, date) to authenticated;
