-- Custom periods: every monthly metric also over any [da, a] range of
-- Europe/Rome business dates, both ends included.
-- The monthly RPCs become thin wrappers over the period ones: same signature,
-- same columns, same numbers (13_metriche, 14_panoramica, 12_clienti_e_costi).

-- ---------------------------------------------------------------------------
-- The comparison window. Same rule as lib/periodo.ts:
--   whole calendar months -> the same number of whole months right before
--                            (September -> August; Jul-Sep -> Apr-Jun)
--   anything else         -> the same number of days right before
-- ---------------------------------------------------------------------------
create or replace function public.periodo_precedente(p_da date, p_a date)
returns table (da date, a date)
language sql
immutable
set search_path = ''
as $$
  select
    case
      when x.mesi_interi then (p_da - make_interval(months => x.mesi))::date
      else p_da - (p_a - p_da + 1)
    end,
    p_da - 1
  from (
    select
      extract(day from p_da) = 1 and extract(day from p_a + 1) = 1 as mesi_interi,
      ((extract(year from p_a + 1) * 12 + extract(month from p_a + 1))
        - (extract(year from p_da) * 12 + extract(month from p_da)))::integer as mesi
  ) x;
$$;

comment on function public.periodo_precedente(date, date) is
  'Comparison window of a period: the same whole months before, or the same number of days before.';

-- A period is valid when da <= a and it lasts less than 3 years (the UI also
-- caps the end at today + 1 year; the database only refuses nonsense).
create or replace function public.verifica_periodo(p_da date, p_a date)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_da is null or p_a is null or p_da > p_a then
    raise exception 'Periodo non valido: la data di inizio deve venire prima della fine'
      using errcode = '22023';
  end if;
  if p_a >= (p_da + interval '3 years')::date then
    raise exception 'Periodo non valido: al massimo 3 anni' using errcode = '22023';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- All the numbers of a period. Admin only. Same definitions as section 9;
-- "in scadenza" and "rinnovati" count the contracts ending inside the period.
-- ---------------------------------------------------------------------------
create or replace function public.metriche_periodo(p_da date, p_a date)
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
  cash_nuovo numeric,
  cash_rinnovo numeric,
  cash_upsell numeric,
  revenue_firmata numeric,
  numero_vendite bigint,
  nuovi_clienti bigint,
  rinnovi bigint,
  valore_medio_vendita numeric,
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
      coalesce(sum(r.dm_outbound + r.dm_inbound), 0)::bigint as dm,
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
  cassa as (
    select
      coalesce(sum(p.importo_incassato), 0)::numeric(12, 2) as tot,
      coalesce(sum(p.importo_incassato) filter (where s.tipo = 'nuovo'), 0)::numeric(12, 2) as nuovo,
      coalesce(sum(p.importo_incassato) filter (where s.tipo = 'rinnovo'), 0)::numeric(12, 2) as rinnovo,
      coalesce(sum(p.importo_incassato) filter (where s.tipo = 'upsell'), 0)::numeric(12, 2) as upsell
    from public.payments p
    join public.sales s on s.id = p.sale_id
    where p.stato in ('incassata', 'rimborsata')
      and p.incassato_il between p_da and p_a
  ),
  vendite as (
    select
      coalesce(sum(s.valore_contratto), 0)::numeric(12, 2) as revenue,
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
    cassa.tot, cassa.nuovo, cassa.rinnovo, cassa.upsell,
    vendite.revenue, vendite.n, vendite.nuovi, vendite.rinn,
    public.rapporto(vendite.revenue, vendite.n),
    public.rapporto(cassa.nuovo, chiamate.svolte),
    public.rapporto(cassa.tot, setting.dm),
    public.rapporto(vendite.revenue, setting.dm),
    provvigioni.tot,
    spese.tot,
    (cassa.tot - provvigioni.tot - spese.tot)::numeric(12, 2),
    scadenze.scad, scadenze.rinnovati_,
    public.rapporto(scadenze.rinnovati_, scadenze.scad)
  from setting, chiamate, cassa, vendite, provvigioni, spese, scadenze;
end;
$$;

comment on function public.metriche_periodo(date, date) is
  'Every section 9 metric over [p_da, p_a], both included. Admin only.';

-- The monthly version, now a wrapper: same columns, same numbers.
create or replace function public.metriche_mese(p_mese date)
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
  cash_nuovo numeric,
  cash_rinnovo numeric,
  cash_upsell numeric,
  revenue_firmata numeric,
  numero_vendite bigint,
  nuovi_clienti bigint,
  rinnovi bigint,
  valore_medio_vendita numeric,
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
    m.cash_incassato, m.cash_nuovo, m.cash_rinnovo, m.cash_upsell,
    m.revenue_firmata, m.numero_vendite, m.nuovi_clienti, m.rinnovi,
    m.valore_medio_vendita, m.cash_per_call_svolta, m.cash_per_dm, m.revenue_per_dm,
    m.provvigioni_maturate, m.costi, m.margine_operativo,
    m.in_scadenza, m.rinnovati, m.tasso_rinnovo
  from public.metriche_periodo(
    date_trunc('month', p_mese)::date,
    (date_trunc('month', p_mese) + interval '1 month')::date - 1
  ) m;
$$;

-- ---------------------------------------------------------------------------
-- The five tiles of the overview over a period, against the previous period.
-- ---------------------------------------------------------------------------
create or replace function public.kpi_periodo(p_da date, p_a date)
returns table (chiave text, valore numeric, precedente numeric, delta numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  -- metriche_periodo enforces the admin check and validates the range
  with c as (select * from public.metriche_periodo(p_da, p_a)),
       p as (
         select m.*
         from public.periodo_precedente(p_da, p_a) pp,
         lateral public.metriche_periodo(pp.da, pp.a) m
       )
  select t.chiave, t.valore, t.precedente, public.rapporto(t.valore - t.precedente, abs(t.precedente))
  from c, p,
  lateral (values
    (1, 'cash_incassato', c.cash_incassato, p.cash_incassato),
    (2, 'revenue_firmata', c.revenue_firmata, p.revenue_firmata),
    (3, 'nuovi_clienti', c.nuovi_clienti::numeric, p.nuovi_clienti::numeric),
    (4, 'rinnovi', c.rinnovi::numeric, p.rinnovi::numeric),
    (5, 'margine_operativo', c.margine_operativo, p.margine_operativo)
  ) as t(ordine, chiave, valore, precedente)
  order by t.ordine;
$$;

comment on function public.kpi_periodo(date, date) is
  'Overview KPIs over [p_da, p_a] with the previous period (periodo_precedente) and the relative delta.';

create or replace function public.kpi_panoramica(p_mese date)
returns table (chiave text, valore numeric, precedente numeric, delta numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select k.chiave, k.valore, k.precedente, k.delta
  from public.kpi_periodo(
    date_trunc('month', p_mese)::date,
    (date_trunc('month', p_mese) + interval '1 month')::date - 1
  ) with ordinality as k(chiave, valore, precedente, delta, n)
  order by k.n;
$$;

-- ---------------------------------------------------------------------------
-- Funnel over a period, with step-to-step conversion.
-- ---------------------------------------------------------------------------
create or replace function public.funnel_periodo(p_da date, p_a date)
returns table (ordine integer, fase text, valore bigint, passaggio numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  -- metriche_periodo enforces the admin check
  with m as (select * from public.metriche_periodo(p_da, p_a))
  select t.ordine, t.fase, t.valore, t.passaggio
  from m,
  lateral (values
    (1, 'DM totali', m.dm_totali, null::numeric),
    (2, 'Conversazioni', m.conversazioni, public.rapporto(m.conversazioni, m.dm_totali)),
    (3, 'Call prenotate', m.call_prenotate, public.rapporto(m.call_prenotate, m.conversazioni)),
    (4, 'Call svolte', m.call_svolte, public.rapporto(m.call_svolte, m.call_prenotate)),
    (5, 'Chiuse', m.chiuse, public.rapporto(m.chiuse, m.call_svolte))
  ) as t(ordine, fase, valore, passaggio)
  order by t.ordine;
$$;

create or replace function public.funnel_mese(p_mese date)
returns table (ordine integer, fase text, valore bigint, passaggio numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  select f.ordine, f.fase, f.valore, f.passaggio
  from public.funnel_periodo(
    date_trunc('month', p_mese)::date,
    (date_trunc('month', p_mese) + interval '1 month')::date - 1
  ) f
  order by f.ordine;
$$;

-- ---------------------------------------------------------------------------
-- Costs of a period per category; the row with categoria null is the total.
-- ---------------------------------------------------------------------------
create or replace function public.riepilogo_costi_periodo(p_da date, p_a date)
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
  perform public.verifica_periodo(p_da, p_a);

  return query
  select e.categoria, sum(e.importo)::numeric(12, 2), count(*)::integer
  from public.expenses e
  where e.data between p_da and p_a
  group by rollup (e.categoria)
  order by (e.categoria is null), sum(e.importo) desc;
end;
$$;

comment on function public.riepilogo_costi_periodo(date, date) is
  'Costs over [p_da, p_a] per category; the row with categoria null is the total. Admin only.';

create or replace function public.riepilogo_costi(p_mese date)
returns table (categoria public.expense_category, totale numeric, numero integer)
language sql
stable
security invoker
set search_path = ''
as $$
  select r.categoria, r.totale, r.numero
  from public.riepilogo_costi_periodo(
    date_trunc('month', p_mese)::date,
    (date_trunc('month', p_mese) + interval '1 month')::date - 1
  ) with ordinality as r(categoria, totale, numero, n)
  order by r.n;
$$;

-- ---------------------------------------------------------------------------
-- The setter's own numbers over a period: totals only, never a client's
-- amount (section 6). security definer with an explicit filter on the caller.
-- Payouts refer to a month (commission_payouts.periodo): a period counts the
-- payouts of every month it touches. For whole months that is exactly those
-- months, as in the monthly version.
-- ---------------------------------------------------------------------------
create or replace function public.miei_numeri_periodo(p_da date, p_a date)
returns table (
  dm_totali bigint,
  conversazioni bigint,
  call_proposte bigint,
  call_prenotate bigint,
  tasso_conversazione numeric,
  tasso_prenotazione numeric,
  dm_per_call numeric,
  giorni_compilati bigint,
  call_fissate bigint,
  call_svolte bigint,
  no_show bigint,
  chiuse bigint,
  show_rate numeric,
  close_rate numeric,
  provvigioni_maturate numeric,
  provvigioni_pagate numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
begin
  if public.current_role() is distinct from 'setter' then
    raise exception 'Questi sono i numeri del setter' using errcode = '42501';
  end if;
  perform public.verifica_periodo(p_da, p_a);

  return query
  with report as (
    select
      coalesce(sum(r.dm_outbound + r.dm_inbound), 0)::bigint as dm,
      coalesce(sum(r.conversazioni), 0)::bigint as conv,
      coalesce(sum(r.call_proposte), 0)::bigint as proposte,
      coalesce(sum(r.discovery_prenotate + r.strategy_prenotate), 0)::bigint as prenotate,
      count(*) as giorni
    from public.setter_daily_reports r
    where r.setter_id = v_utente and r.data between p_da and p_a
  ),
  chiamate as (
    select
      count(*) as fissate,
      count(*) filter (where c.stato = 'svolta') as svolte,
      count(*) filter (where c.stato = 'no_show') as noshow,
      count(*) filter (where c.esito = 'chiusa') as chiuse_
    from public.calls c
    where c.setter_id = v_utente
      and (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
  ),
  provvigioni as (
    select coalesce(sum(v.provvigione), 0)::numeric(12, 2) as tot
    from public.v_provvigioni_maturate v
    where v.profile_id = v_utente and v.incassato_il between p_da and p_a
  ),
  pagate as (
    select coalesce(sum(cp.importo), 0)::numeric(12, 2) as tot
    from public.commission_payouts cp
    where cp.profile_id = v_utente
      and cp.periodo between date_trunc('month', p_da)::date and p_a
  )
  select
    report.dm, report.conv, report.proposte, report.prenotate,
    public.rapporto(report.conv, report.dm),
    public.rapporto(report.prenotate, report.proposte),
    public.rapporto(report.dm, report.prenotate),
    report.giorni,
    chiamate.fissate, chiamate.svolte, chiamate.noshow, chiamate.chiuse_,
    public.rapporto(chiamate.svolte, chiamate.svolte + chiamate.noshow),
    public.rapporto(chiamate.chiuse_, chiamate.svolte),
    provvigioni.tot, pagate.tot
  from report, chiamate, provvigioni, pagate;
end;
$$;

comment on function public.miei_numeri_periodo(date, date) is
  'The calling setter''s totals over [p_da, p_a]; payouts of every month the period touches.';

-- The wrapper itself needs no privileges: miei_numeri_periodo checks the caller.
create or replace function public.miei_numeri(p_mese date)
returns table (
  dm_totali bigint,
  conversazioni bigint,
  call_proposte bigint,
  call_prenotate bigint,
  tasso_conversazione numeric,
  tasso_prenotazione numeric,
  dm_per_call numeric,
  giorni_compilati bigint,
  call_fissate bigint,
  call_svolte bigint,
  no_show bigint,
  chiuse bigint,
  show_rate numeric,
  close_rate numeric,
  provvigioni_maturate numeric,
  provvigioni_pagate numeric
)
language sql
stable
security invoker
set search_path = ''
as $$
  select n.*
  from public.miei_numeri_periodo(
    date_trunc('month', p_mese)::date,
    (date_trunc('month', p_mese) + interval '1 month')::date - 1
  ) n;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
do $$
declare
  f text;
begin
  foreach f in array array[
    'public.periodo_precedente(date, date)',
    'public.verifica_periodo(date, date)',
    'public.metriche_periodo(date, date)',
    'public.kpi_periodo(date, date)',
    'public.funnel_periodo(date, date)',
    'public.riepilogo_costi_periodo(date, date)',
    'public.miei_numeri_periodo(date, date)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
