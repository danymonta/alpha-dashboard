-- Two totals for Alfire (Dany, 04/10/2026), computed here and never summed in
-- TypeScript, each on the caller's own money only (CLAUDE.md sections 6, 9, 20).
--
-- 1. da_incassare_closer(): "quanto mi resta da incassare?" for the closer (or
--    the admin as the closer he is): the planned instalments of the sales he
--    closed (sales.closer_id = auth.uid()), split as "Da incassare" of section 9:
--    overdue (scadenza < oggi), next 30 days (scadenza <= oggi + 30), later.
--    A failed instalment is not planned: not counted, as in v_vendite.
--    security invoker: the closer already reads his own sales and instalments
--    (RLS); the explicit filter keeps the admin, who reads everything, to his own.
--
-- 2. incassi_clienti_setter(p_da, p_a): "quanto hanno pagato i miei clienti nel
--    periodo?" for the setter (or the admin for the clients he brought): over the
--    sales where he is the setter (the base of mie_vendite_setter), the cash of
--    the period net of refunds (a refund is its own row with a negative amount,
--    stato rimborsata, on its own date), the cash-ins and refunds counted, and the
--    commission accrued on them: v_provvigioni_maturate, the rule valid on the
--    cash date and applicable to the sale type, the same sum as miei_numeri_periodo.
--    security definer: the setter has no policy on sales and payments.

create or replace function public.da_incassare_closer()
returns table (
  totale numeric,
  numero_rate integer,
  vendite integer,
  in_ritardo numeric,
  numero_in_ritardo integer,
  prossimi_30 numeric,
  numero_prossimi_30 integer,
  oltre numeric,
  numero_oltre integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
  v_oggi date := public.oggi();
begin
  if public.current_role() is distinct from 'closer' and public.current_role() is distinct from 'admin' then
    raise exception 'Questo è il da incassare del closer' using errcode = '42501';
  end if;

  return query
  select
    coalesce(sum(p.importo_previsto), 0)::numeric(12, 2),
    count(p.id)::integer,
    count(distinct s.id)::integer,
    coalesce(sum(p.importo_previsto) filter (where p.scadenza < v_oggi), 0)::numeric(12, 2),
    (count(p.id) filter (where p.scadenza < v_oggi))::integer,
    coalesce(sum(p.importo_previsto) filter (where p.scadenza >= v_oggi and p.scadenza <= v_oggi + 30), 0)::numeric(12, 2),
    (count(p.id) filter (where p.scadenza >= v_oggi and p.scadenza <= v_oggi + 30))::integer,
    coalesce(sum(p.importo_previsto) filter (where p.scadenza > v_oggi + 30), 0)::numeric(12, 2),
    (count(p.id) filter (where p.scadenza > v_oggi + 30))::integer
  from public.sales s
  join public.payments p on p.sale_id = s.id
  where s.closer_id = v_utente
    and p.stato = 'prevista';
end;
$$;

comment on function public.da_incassare_closer() is
  'The calling closer''s (or admin''s own) planned instalments: total, overdue, next 30 days, later. Never another person''s.';

revoke all on function public.da_incassare_closer() from public, anon;
grant execute on function public.da_incassare_closer() to authenticated;

create or replace function public.incassi_clienti_setter(p_da date, p_a date)
returns table (
  incassato numeric,
  numero_incassi integer,
  rimborsato numeric,
  numero_rimborsi integer,
  clienti integer,
  provvigione numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
begin
  if public.current_role() is distinct from 'setter' and public.current_role() is distinct from 'admin' then
    raise exception 'Questi sono gli incassi dei clienti del setter' using errcode = '42501';
  end if;
  perform public.verifica_periodo(p_da, p_a);

  return query
  with incassi as (
    select
      coalesce(sum(p.importo_incassato), 0)::numeric(12, 2) as netto,
      (count(*) filter (where p.stato = 'incassata'))::integer as n_incassi,
      coalesce(-sum(p.importo_incassato) filter (where p.stato = 'rimborsata'), 0)::numeric(12, 2) as rimb,
      (count(*) filter (where p.stato = 'rimborsata'))::integer as n_rimborsi,
      (count(distinct s.client_id) filter (where p.stato = 'incassata'))::integer as n_clienti
    from public.sales s
    join public.payments p on p.sale_id = s.id
    where s.setter_id = v_utente
      and p.stato in ('incassata', 'rimborsata')
      and p.incassato_il between p_da and p_a
  ),
  provvigioni as (
    select coalesce(sum(v.provvigione), 0)::numeric(12, 2) as tot
    from public.v_provvigioni_maturate v
    where v.profile_id = v_utente
      and v.incassato_il between p_da and p_a
  )
  select incassi.netto, incassi.n_incassi, incassi.rimb, incassi.n_rimborsi, incassi.n_clienti, provvigioni.tot
  from incassi, provvigioni;
end;
$$;

comment on function public.incassi_clienti_setter(date, date) is
  'What the calling setter''s clients (sales with his setter_id) paid in [p_da, p_a], net of refunds, and the commission accrued on it. Never another person''s.';

revoke all on function public.incassi_clienti_setter(date, date) from public, anon;
grant execute on function public.incassi_clienti_setter(date, date) to authenticated;
