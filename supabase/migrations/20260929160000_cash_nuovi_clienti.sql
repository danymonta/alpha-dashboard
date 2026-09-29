-- The cash of the new clients, apart from the instalments of the clients who
-- entered before (Dany, 29/09/2026). "Da nuovi" used to be every instalment of
-- every sale of tipo 'nuovo', whenever it was signed: a month with no new
-- client could still show thousands "da nuovi". The cash of a period is now
-- told in four parts that always add up to the whole:
--   nuovi clienti del periodo    payments of tipo 'nuovo' sales signed in the
--                                period. A deposit cashed before the signing
--                                day counts here too: that client is entering,
--                                he is not an old one (signed after the period)
--   rate di clienti già entrati  payments of tipo 'nuovo' sales signed before
--                                the period
--   rinnovi, upsell              payments of those sale types, as before
-- The acquisition ratios only look at the new clients of the period: cash and
-- revenue per DM, cash per call svolta, the average new client, the cash per
-- source. The totals (cash incassato, revenue firmata, margine) do not change.

-- 1. All the numbers of a period: new return type, drop and recreate ----------
-- The monthly wrapper returns the same columns, so it goes too. Nothing else
-- reads the replaced columns: cash_nuovo becomes the first two parts,
-- valore_medio_vendita becomes valore_medio_nuovo.
drop function public.metriche_mese(date);
drop function public.metriche_periodo(date, date);

create function public.metriche_periodo(p_da date, p_a date)
returns table (
  inizio date,
  fine date,
  dm_totali bigint,
  conversazioni bigint,
  call_proposte bigint,
  call_prenotate bigint,
  strategy_prenotate bigint,
  tasso_conversazione numeric,
  tasso_prenotazione numeric,
  dm_per_call numeric,
  dm_per_strategy numeric,
  call_svolte bigint,
  no_show bigint,
  qualificate bigint,
  chiuse bigint,
  show_rate numeric,
  tasso_qualificazione numeric,
  close_rate numeric,
  close_rate_qualificate numeric,
  cash_incassato numeric,
  cash_nuovi_clienti numeric,
  cash_rate_precedenti numeric,
  cash_rinnovo numeric,
  cash_upsell numeric,
  revenue_firmata numeric,
  revenue_nuovi numeric,
  numero_vendite bigint,
  nuovi_clienti bigint,
  rinnovi bigint,
  valore_medio_nuovo numeric,
  cash_per_call_svolta numeric,
  cash_per_dm numeric,
  revenue_per_dm numeric,
  provvigioni_maturate numeric,
  costi numeric,
  margine_operativo numeric,
  in_scadenza bigint,
  rinnovati bigint,
  tasso_rinnovo numeric
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
  perform public.verifica_periodo(p_da, p_a);

  return query
  with setting as (
    select
      coalesce(sum(r.dm_outbound + r.dm_inbound + r.follow_up), 0)::bigint as dm,
      coalesce(sum(r.conversazioni), 0)::bigint as conv,
      coalesce(sum(r.call_proposte), 0)::bigint as proposte,
      coalesce(sum(r.discovery_prenotate + r.strategy_prenotate), 0)::bigint as prenotate,
      coalesce(sum(r.strategy_prenotate), 0)::bigint as strategy
    from public.setter_daily_reports r
    where r.data between p_da and p_a
  ),
  chiamate as (
    select
      count(*) filter (where c.stato = 'svolta') as svolte,
      count(*) filter (where c.stato = 'no_show') as noshow,
      count(*) filter (where c.stato = 'svolta' and c.qualificata) as qualif,
      count(*) filter (where c.esito = 'chiusa') as chiuse_
    from public.calls c
    where (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
  ),
  -- the four parts: every payment of the period falls in exactly one
  cassa as (
    select
      coalesce(sum(p.importo_incassato), 0)::numeric(12, 2) as tot,
      coalesce(sum(p.importo_incassato) filter (where s.tipo = 'nuovo' and s.data_vendita >= p_da), 0)::numeric(12, 2) as entrati,
      coalesce(sum(p.importo_incassato) filter (where s.tipo = 'nuovo' and s.data_vendita < p_da), 0)::numeric(12, 2) as precedenti,
      coalesce(sum(p.importo_incassato) filter (where s.tipo = 'rinnovo'), 0)::numeric(12, 2) as rinn,
      coalesce(sum(p.importo_incassato) filter (where s.tipo = 'upsell'), 0)::numeric(12, 2) as ups
    from public.payments p
    join public.sales s on s.id = p.sale_id
    where p.stato in ('incassata', 'rimborsata')
      and p.incassato_il between p_da and p_a
  ),
  vendite as (
    select
      coalesce(sum(s.valore_contratto), 0)::numeric(12, 2) as revenue,
      coalesce(sum(s.valore_contratto) filter (where s.tipo = 'nuovo'), 0)::numeric(12, 2) as revenue_nuove,
      count(*) as n,
      count(*) filter (where s.tipo = 'nuovo') as nuovi,
      count(*) filter (where s.tipo = 'rinnovo') as rinn
    from public.sales s
    where s.data_vendita between p_da and p_a
  ),
  provvigioni as (
    select coalesce(sum(v.provvigione), 0)::numeric(12, 2) as tot
    from public.v_provvigioni_maturate v
    where v.incassato_il between p_da and p_a
  ),
  spese as (
    select coalesce(sum(e.importo), 0)::numeric(12, 2) as tot
    from public.expenses e
    where e.data between p_da and p_a
  ),
  scadenze as (
    -- clients whose contract ends in the period, and those who renewed within 30 days
    select
      count(distinct s.client_id) as scad,
      count(distinct s.client_id) filter (where exists (
        select 1 from public.sales r
        where r.client_id = s.client_id
          and r.tipo = 'rinnovo'
          and r.data_vendita > s.data_vendita
          and r.data_vendita <= s.data_fine + 30
      )) as rinnovati_
    from public.sales s
    where s.data_fine between p_da and p_a
  )
  select
    p_da, p_a,
    setting.dm, setting.conv, setting.proposte, setting.prenotate, setting.strategy,
    public.rapporto(setting.conv, setting.dm),
    public.rapporto(setting.prenotate, setting.proposte),
    public.rapporto(setting.dm, setting.prenotate),
    public.rapporto(setting.dm, setting.strategy),
    chiamate.svolte, chiamate.noshow, chiamate.qualif, chiamate.chiuse_,
    public.rapporto(chiamate.svolte, chiamate.svolte + chiamate.noshow),
    public.rapporto(chiamate.qualif, chiamate.svolte),
    public.rapporto(chiamate.chiuse_, chiamate.svolte),
    public.rapporto(chiamate.chiuse_, chiamate.qualif),
    cassa.tot, cassa.entrati, cassa.precedenti, cassa.rinn, cassa.ups,
    vendite.revenue, vendite.revenue_nuove, vendite.n, vendite.nuovi, vendite.rinn,
    -- acquisition: only the new clients of the period
    public.rapporto(vendite.revenue_nuove, vendite.nuovi),
    public.rapporto(cassa.entrati, chiamate.svolte),
    public.rapporto(cassa.entrati, setting.dm),
    public.rapporto(vendite.revenue_nuove, setting.dm),
    provvigioni.tot,
    spese.tot,
    (cassa.tot - provvigioni.tot - spese.tot)::numeric(12, 2),
    scadenze.scad, scadenze.rinnovati_,
    public.rapporto(scadenze.rinnovati_, scadenze.scad)
  from setting, chiamate, cassa, vendite, provvigioni, spese, scadenze;
end;
$$;

comment on function public.metriche_periodo(date, date) is
  'Every section 9 metric over [p_da, p_a], both included. Cash in four parts (new clients of the period, instalments of clients who entered before, renewals, upsells); acquisition ratios on the new clients only. Admin only.';

-- The monthly version: a wrapper, same columns, same numbers.
create function public.metriche_mese(p_mese date)
returns table (
  mese date,
  dm_totali bigint,
  conversazioni bigint,
  call_proposte bigint,
  call_prenotate bigint,
  strategy_prenotate bigint,
  tasso_conversazione numeric,
  tasso_prenotazione numeric,
  dm_per_call numeric,
  dm_per_strategy numeric,
  call_svolte bigint,
  no_show bigint,
  qualificate bigint,
  chiuse bigint,
  show_rate numeric,
  tasso_qualificazione numeric,
  close_rate numeric,
  close_rate_qualificate numeric,
  cash_incassato numeric,
  cash_nuovi_clienti numeric,
  cash_rate_precedenti numeric,
  cash_rinnovo numeric,
  cash_upsell numeric,
  revenue_firmata numeric,
  revenue_nuovi numeric,
  numero_vendite bigint,
  nuovi_clienti bigint,
  rinnovi bigint,
  valore_medio_nuovo numeric,
  cash_per_call_svolta numeric,
  cash_per_dm numeric,
  revenue_per_dm numeric,
  provvigioni_maturate numeric,
  costi numeric,
  margine_operativo numeric,
  in_scadenza_nel_mese bigint,
  rinnovati_nel_mese bigint,
  tasso_rinnovo numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  -- metriche_periodo enforces the admin check
  select
    m.inizio,
    m.dm_totali, m.conversazioni, m.call_proposte, m.call_prenotate, m.strategy_prenotate,
    m.tasso_conversazione, m.tasso_prenotazione, m.dm_per_call, m.dm_per_strategy,
    m.call_svolte, m.no_show, m.qualificate, m.chiuse,
    m.show_rate, m.tasso_qualificazione, m.close_rate, m.close_rate_qualificate,
    m.cash_incassato, m.cash_nuovi_clienti, m.cash_rate_precedenti, m.cash_rinnovo, m.cash_upsell,
    m.revenue_firmata, m.revenue_nuovi, m.numero_vendite, m.nuovi_clienti, m.rinnovi,
    m.valore_medio_nuovo, m.cash_per_call_svolta, m.cash_per_dm, m.revenue_per_dm,
    m.provvigioni_maturate, m.costi, m.margine_operativo,
    m.in_scadenza, m.rinnovati, m.tasso_rinnovo
  from public.metriche_periodo(
    date_trunc('month', p_mese)::date,
    (date_trunc('month', p_mese) + interval '1 month')::date - 1
  ) m;
$$;

revoke all on function public.metriche_periodo(date, date) from public, anon;
grant execute on function public.metriche_periodo(date, date) to authenticated;
revoke all on function public.metriche_mese(date) from public, anon;
grant execute on function public.metriche_mese(date) to authenticated;

-- 2. The 12-month chart: the same four parts per month -------------------------
-- "Nuovi clienti" of a month = the sales of tipo 'nuovo' signed in that month
-- (or later: a deposit); the older ones are instalments of clients already in.
drop function public.cash_mensile(integer, date);

create function public.cash_mensile(p_mesi integer default 12, p_fino date default null)
returns table (
  mese date,
  nuovi_clienti numeric,
  rate_precedenti numeric,
  rinnovo numeric,
  upsell numeric,
  totale numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_ultimo date := date_trunc('month', coalesce(p_fino, public.oggi()))::date;
begin
  if not public.is_admin() then
    raise exception 'Le metriche economiche le vede solo l''admin' using errcode = '42501';
  end if;

  return query
  with mesi as (
    select (v_ultimo - (interval '1 month' * g))::date as m
    from generate_series(0, greatest(p_mesi, 1) - 1) as g
  ),
  cassa as (
    select
      date_trunc('month', p.incassato_il)::date as m,
      sum(p.importo_incassato) filter (
        where s.tipo = 'nuovo' and s.data_vendita >= date_trunc('month', p.incassato_il)::date
      ) as entrati,
      sum(p.importo_incassato) filter (
        where s.tipo = 'nuovo' and s.data_vendita < date_trunc('month', p.incassato_il)::date
      ) as precedenti,
      sum(p.importo_incassato) filter (where s.tipo = 'rinnovo') as rinn,
      sum(p.importo_incassato) filter (where s.tipo = 'upsell') as ups,
      sum(p.importo_incassato) as tot
    from public.payments p
    join public.sales s on s.id = p.sale_id
    where p.stato in ('incassata', 'rimborsata')
      and p.incassato_il >= (v_ultimo - (interval '1 month' * (greatest(p_mesi, 1) - 1)))::date
    group by 1
  )
  select
    mesi.m,
    coalesce(cassa.entrati, 0)::numeric(12, 2),
    coalesce(cassa.precedenti, 0)::numeric(12, 2),
    coalesce(cassa.rinn, 0)::numeric(12, 2),
    coalesce(cassa.ups, 0)::numeric(12, 2),
    coalesce(cassa.tot, 0)::numeric(12, 2)
  from mesi
  left join cassa on cassa.m = mesi.m
  order by mesi.m;
end;
$$;

comment on function public.cash_mensile(integer, date) is
  'Cash per month in four parts: new clients of the month, instalments of clients who entered before, renewals, upsells. Admin only.';

revoke all on function public.cash_mensile(integer, date) from public, anon;
grant execute on function public.cash_mensile(integer, date) to authenticated;

-- 3. By source: the cash of the new clients of the period only -----------------
-- Same columns as 20260928210000: create or replace. The share is a share of
-- that cash, so the sources add up to cash_nuovi_clienti. Leads, calls and the
-- close rate are unchanged (they are by the lead's source).
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
  perform public.verifica_periodo(p_da, p_a);

  return query
  with per_fonte as (
  select
    f.fonte,
    (select coalesce(sum(p.importo_incassato), 0)::numeric(12, 2)
       from public.payments p
       join public.sales s on s.id = p.sale_id
       join public.clients cl on cl.id = s.client_id
      where cl.fonte = f.fonte
        and s.tipo = 'nuovo' and s.data_vendita >= p_da
        and p.stato in ('incassata', 'rimborsata') and p.incassato_il between p_da and p_a) as cash,
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
    -- share of the new clients' cash (refunds included), null when none came in
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

-- 4. Today: everything that came in, and the part of the clients who entered today
drop function public.oggi_team();

create function public.oggi_team()
returns table (
  dm_totali bigint,
  conversazioni bigint,
  call_prenotate bigint,
  report_compilati bigint,
  call_in_programma bigint,
  call_svolte bigint,
  chiuse bigint,
  cash_incassato numeric,
  cash_nuovi_clienti numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Le metriche del team le vede solo l''admin' using errcode = '42501';
  end if;

  return query
  with report as (
    select
      coalesce(sum(r.dm_outbound + r.dm_inbound + r.follow_up), 0)::bigint as dm,
      coalesce(sum(r.conversazioni), 0)::bigint as conv,
      coalesce(sum(r.discovery_prenotate + r.strategy_prenotate), 0)::bigint as prenotate,
      count(*) as compilati
    from public.setter_daily_reports r
    where r.data = public.oggi()
  ),
  chiamate as (
    select
      count(*) filter (where c.stato = 'programmata') as programmate,
      count(*) filter (where c.stato = 'svolta') as svolte,
      count(*) filter (where c.esito = 'chiusa') as chiuse
    from public.calls c
    where (c.programmata_il at time zone 'Europe/Rome')::date = public.oggi()
  ),
  -- every cash-in of today; "di cui" the new clients signed today (the same
  -- rule as metriche_periodo over [oggi, oggi])
  cassa as (
    select
      coalesce(sum(p.importo_incassato), 0)::numeric(12, 2) as tot,
      coalesce(sum(p.importo_incassato) filter (where s.tipo = 'nuovo' and s.data_vendita >= public.oggi()), 0)::numeric(12, 2) as entrati
    from public.payments p
    join public.sales s on s.id = p.sale_id
    where p.stato in ('incassata', 'rimborsata') and p.incassato_il = public.oggi()
  )
  select report.dm, report.conv, report.prenotate, report.compilati,
         chiamate.programmate, chiamate.svolte, chiamate.chiuse, cassa.tot, cassa.entrati
  from report, chiamate, cassa;
end;
$$;

revoke all on function public.oggi_team() from public, anon;
grant execute on function public.oggi_team() to authenticated;

-- 5. The evening email says what each cash-in is ------------------------------
-- Every payment line carries its sale type, which instalment it is and which
-- of the four parts it belongs to; the sales signed today are also counted by
-- type. Still team totals and clients only: nobody is named for what they
-- filled in or not (section 17). Same signature: create or replace.
create or replace function public.riepilogo_serale(p_giorno date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'giorno', p_giorno,
    'cash', (select coalesce(sum(p.importo_incassato), 0)::numeric(12, 2) from public.payments p
             where p.stato in ('incassata', 'rimborsata') and p.incassato_il = p_giorno),
    'incassi', coalesce((select jsonb_agg(jsonb_build_object(
                  'cliente', concat_ws(' ', cl.nome, cl.cognome),
                  'importo', p.importo_incassato,
                  'metodo', p.metodo,
                  'rimborso', p.stato = 'rimborsata',
                  'tipo', s.tipo,
                  'numero_rata', p.numero_rata,
                  'numero_rate', s.numero_rate,
                  'parte', case
                             when s.tipo = 'nuovo' and s.data_vendita >= p_giorno then 'nuovi_clienti'
                             when s.tipo = 'nuovo' then 'rate_precedenti'
                             else s.tipo::text
                           end)
                  order by p.importo_incassato desc)
               from public.payments p join public.sales s on s.id = p.sale_id join public.clients cl on cl.id = s.client_id
               where p.stato in ('incassata', 'rimborsata') and p.incassato_il = p_giorno), '[]'::jsonb),
    'vendite', coalesce((select jsonb_agg(jsonb_build_object(
                  'cliente', concat_ws(' ', cl.nome, cl.cognome), 'tipo', s.tipo, 'valore', s.valore_contratto)
                  order by s.valore_contratto desc)
               from public.sales s join public.clients cl on cl.id = s.client_id
               where s.data_vendita = p_giorno), '[]'::jsonb),
    'vendite_per_tipo', (select jsonb_build_object(
                  'nuovo', count(*) filter (where s.tipo = 'nuovo'),
                  'rinnovo', count(*) filter (where s.tipo = 'rinnovo'),
                  'upsell', count(*) filter (where s.tipo = 'upsell'))
               from public.sales s where s.data_vendita = p_giorno),
    'in_ritardo', (select jsonb_build_object('numero', count(*), 'totale', coalesce(sum(p.importo_previsto), 0)::numeric(12, 2))
                   from public.payments p where p.stato = 'prevista' and p.scadenza < p_giorno),
    'clienti_in_ritardo', coalesce((select jsonb_agg(x.nome order by x.scadenza) from (
                   select distinct on (s.client_id) concat_ws(' ', cl.nome, cl.cognome) as nome, p.scadenza
                   from public.payments p join public.sales s on s.id = p.sale_id join public.clients cl on cl.id = s.client_id
                   where p.stato = 'prevista' and p.scadenza < p_giorno
                   order by s.client_id, p.scadenza limit 8) x), '[]'::jsonb),
    'in_scadenza_7_giorni', (select jsonb_build_object('numero', count(*), 'totale', coalesce(sum(p.importo_previsto), 0)::numeric(12, 2))
                   from public.payments p
                   where p.stato = 'prevista' and p.scadenza between p_giorno + 1 and p_giorno + 7),
    'dm_totali', (select coalesce(sum(r.dm_outbound + r.dm_inbound + r.follow_up), 0) from public.setter_daily_reports r where r.data = p_giorno),
    'call_svolte', (select count(*) from public.calls c
                    where c.stato = 'svolta' and (c.programmata_il at time zone 'Europe/Rome')::date = p_giorno),
    'chiuse', (select count(*) from public.calls c
               where c.esito = 'chiusa' and (c.programmata_il at time zone 'Europe/Rome')::date = p_giorno)
  );
$$;

-- only the cron (service role) reads it: unchanged, stated again
revoke all on function public.riepilogo_serale(date) from public, anon, authenticated;
grant execute on function public.riepilogo_serale(date) to service_role;
