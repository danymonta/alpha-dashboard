-- Commission per sale, for the admin (Dany, 27/09/2026): "Gabriele Americani,
-- setter Loris: 5% of 1.500 € = 75 €". The numbers of v_provvigioni_maturate,
-- summed per sale and setter. p_sale_id narrows it to one sale (its page).
create or replace function public.provvigioni_per_vendita(p_sale_id uuid default null)
returns table (
  profile_id uuid,
  setter text,
  sale_id uuid,
  cliente text,
  tipo public.sale_type,
  incassato numeric,
  percentuale numeric,
  provvigione numeric,
  ultimo_incasso date
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Le provvigioni per vendita le vede solo l''admin' using errcode = '42501';
  end if;

  return query
  select
    v.profile_id,
    pr.nome,
    v.sale_id,
    trim(concat_ws(' ', c.nome, c.cognome)),
    v.tipo,
    sum(v.importo_incassato)::numeric(12, 2),
    -- one rate for the whole sale; null when the rule changed along the way
    case when count(distinct v.percentuale) = 1 then max(v.percentuale) end,
    sum(v.provvigione)::numeric(12, 2),
    max(v.incassato_il)
  from public.v_provvigioni_maturate v
  join public.sales s on s.id = v.sale_id
  join public.clients c on c.id = s.client_id
  join public.profiles pr on pr.id = v.profile_id
  where p_sale_id is null or v.sale_id = p_sale_id
  group by v.profile_id, pr.nome, v.sale_id, c.nome, c.cognome, v.tipo
  order by max(v.incassato_il) desc, 4;
end;
$$;

comment on function public.provvigioni_per_vendita(uuid) is
  'Admin only: commission per sale and setter, summed from v_provvigioni_maturate.';

revoke all on function public.provvigioni_per_vendita(uuid) from public, anon;
grant execute on function public.provvigioni_per_vendita(uuid) to authenticated;
