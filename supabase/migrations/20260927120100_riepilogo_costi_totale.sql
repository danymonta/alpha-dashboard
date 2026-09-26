-- The month total comes from SQL too: a rollup row with categoria null.
create or replace function public.riepilogo_costi(p_mese date)
returns table (categoria public.expense_category, totale numeric, numero integer)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'I costi li vede solo l''admin' using errcode = '42501';
  end if;

  return query
  select e.categoria, sum(e.importo)::numeric(12, 2), count(*)::integer
  from public.expenses e
  where e.data >= date_trunc('month', p_mese)::date
    and e.data < (date_trunc('month', p_mese) + interval '1 month')::date
  group by rollup (e.categoria)
  order by (e.categoria is null), sum(e.importo) desc;
end;
$$;

comment on function public.riepilogo_costi(date) is
  'Costs of the month per category; the row with categoria null is the month total. Admin only.';
