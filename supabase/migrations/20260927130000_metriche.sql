-- Fase 3: every metric of CLAUDE.md section 9, computed in SQL.
-- Months are Europe/Rome months. Zero denominators give null (the UI shows "–").

create or replace function public.rapporto(p_numeratore numeric, p_denominatore numeric)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select case when p_denominatore is null or p_denominatore = 0 then null
              else p_numeratore / p_denominatore end;
$$;

-- ---------------------------------------------------------------------------
-- Commission accrues on cash, per instalment (section 8). A refund carries a
-- negative amount, so it produces a negative commission in its own month.
-- The rule is the one valid on the cash-in date for that sale type.
-- ---------------------------------------------------------------------------
create view public.v_provvigioni_maturate
with (security_invoker = true)
as
select
  p.id as payment_id,
  s.id as sale_id,
  s.setter_id as profile_id,
  s.tipo,
  p.incassato_il,
  date_trunc('month', p.incassato_il)::date as mese,
  p.importo_incassato,
  r.percentuale,
  round(p.importo_incassato * r.percentuale, 2)::numeric(12, 2) as provvigione
from public.payments p
join public.sales s on s.id = p.sale_id
join lateral (
  select cr.percentuale
  from public.commission_rules cr
  where cr.profile_id = s.setter_id
    and s.tipo = any (cr.applica_a)
    and p.incassato_il >= cr.valida_dal
    and (cr.valida_al is null or p.incassato_il <= cr.valida_al)
  order by cr.valida_dal desc
  limit 1
) r on true
where p.stato in ('incassata', 'rimborsata')
  and s.setter_id is not null;

revoke all on public.v_provvigioni_maturate from anon;

-- ---------------------------------------------------------------------------
-- Every instalment with its client, and the derived "in ritardo".
-- ---------------------------------------------------------------------------
create view public.v_rate
with (security_invoker = true)
as
select
  p.id as payment_id,
  p.sale_id,
  s.client_id,
  trim(concat_ws(' ', c.nome, c.cognome)) as cliente,
  s.tipo,
  s.closer_id,
  s.setter_id,
  p.numero_rata,
  p.scadenza,
  p.importo_previsto,
  p.incassato_il,
  p.importo_incassato,
  p.metodo,
  p.stato,
  (p.stato = 'prevista' and p.scadenza < public.oggi()) as in_ritardo,
  case when p.stato = 'prevista' and p.scadenza < public.oggi()
       then public.oggi() - p.scadenza end as giorni_ritardo
from public.payments p
join public.sales s on s.id = p.sale_id
join public.clients c on c.id = s.client_id;

revoke all on public.v_rate from anon;

-- ---------------------------------------------------------------------------
-- All the numbers of one month. Admin only.
-- ---------------------------------------------------------------------------
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
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_inizio date := date_trunc('month', p_mese)::date;
  v_fine date := (date_trunc('month', p_mese) + interval '1 month')::date - 1;
begin
  if not public.is_admin() then
    raise exception 'Le metriche economiche le vede solo l''admin' using errcode = '42501';
  end if;

  return query
  with setting as (
    select
      coalesce(sum(r.dm_outbound + r.dm_inbound), 0)::bigint as dm,
      coalesce(sum(r.conversazioni), 0)::bigint as conv,
      coalesce(sum(r.call_proposte), 0)::bigint as proposte,
      coalesce(sum(r.discovery_prenotate + r.strategy_prenotate), 0)::bigint as prenotate,
      coalesce(sum(r.strategy_prenotate), 0)::bigint as strategy
    from public.setter_daily_reports r
    where r.data between v_inizio and v_fine
  ),
  chiamate as (
    select
      count(*) filter (where c.stato = 'svolta') as svolte,
      count(*) filter (where c.stato = 'no_show') as noshow,
      count(*) filter (where c.stato = 'svolta' and c.qualificata) as qualif,
      count(*) filter (where c.esito = 'chiusa') as chiuse
    from public.calls c
    where (c.programmata_il at time zone 'Europe/Rome')::date between v_inizio and v_fine
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
      and p.incassato_il between v_inizio and v_fine
  ),
  vendite as (
    select
      coalesce(sum(s.valore_contratto), 0)::numeric(12, 2) as revenue,
      count(*) as n,
      count(*) filter (where s.tipo = 'nuovo') as nuovi,
      count(*) filter (where s.tipo = 'rinnovo') as rinnovi
    from public.sales s
    where s.data_vendita between v_inizio and v_fine
  ),
  provvigioni as (
    select coalesce(sum(v.provvigione), 0)::numeric(12, 2) as tot
    from public.v_provvigioni_maturate v
    where v.incassato_il between v_inizio and v_fine
  ),
  spese as (
    select coalesce(sum(e.importo), 0)::numeric(12, 2) as tot
    from public.expenses e
    where e.data between v_inizio and v_fine
  ),
  scadenze as (
    -- clients whose contract ends this month, and those who renewed within 30 days
    select
      count(distinct s.client_id) as scad,
      count(distinct s.client_id) filter (where exists (
        select 1 from public.sales r
        where r.client_id = s.client_id
          and r.tipo = 'rinnovo'
          and r.data_vendita > s.data_vendita
          and r.data_vendita <= s.data_fine + 30
      )) as rinnovati
    from public.sales s
    where s.data_fine between v_inizio and v_fine
  )
  select
    v_inizio,
    setting.dm, setting.conv, setting.proposte, setting.prenotate, setting.strategy,
    public.rapporto(setting.conv, setting.dm),
    public.rapporto(setting.prenotate, setting.proposte),
    public.rapporto(setting.dm, setting.prenotate),
    public.rapporto(setting.dm, setting.strategy),
    chiamate.svolte, chiamate.noshow, chiamate.qualif, chiamate.chiuse,
    public.rapporto(chiamate.svolte, chiamate.svolte + chiamate.noshow),
    public.rapporto(chiamate.qualif, chiamate.svolte),
    public.rapporto(chiamate.chiuse, chiamate.svolte),
    public.rapporto(chiamate.chiuse, chiamate.qualif),
    cassa.tot, cassa.nuovo, cassa.rinnovo, cassa.upsell,
    vendite.revenue, vendite.n, vendite.nuovi, vendite.rinnovi,
    public.rapporto(vendite.revenue, vendite.n),
    public.rapporto(cassa.nuovo, chiamate.svolte),
    public.rapporto(cassa.tot, setting.dm),
    public.rapporto(vendite.revenue, setting.dm),
    provvigioni.tot,
    spese.tot,
    (cassa.tot - provvigioni.tot - spese.tot)::numeric(12, 2),
    scadenze.scad, scadenze.rinnovati,
    public.rapporto(scadenze.rinnovati, scadenze.scad)
  from setting, chiamate, cassa, vendite, provvigioni, spese, scadenze;
end;
$$;

-- ---------------------------------------------------------------------------
-- The five tiles of the overview, with the previous month and the delta.
-- ---------------------------------------------------------------------------
create or replace function public.kpi_panoramica(p_mese date)
returns table (chiave text, valore numeric, precedente numeric, delta numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with c as (select * from public.metriche_mese(p_mese)),
       p as (select * from public.metriche_mese((date_trunc('month', p_mese) - interval '1 month')::date))
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

-- ---------------------------------------------------------------------------
-- Cash per month, split by sale type: the overview chart. Admin only.
-- ---------------------------------------------------------------------------
create or replace function public.cash_mensile(p_mesi integer default 12, p_fino date default null)
returns table (mese date, nuovo numeric, rinnovo numeric, upsell numeric, totale numeric)
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
      sum(p.importo_incassato) filter (where s.tipo = 'nuovo') as nuovo,
      sum(p.importo_incassato) filter (where s.tipo = 'rinnovo') as rinnovo,
      sum(p.importo_incassato) filter (where s.tipo = 'upsell') as upsell,
      sum(p.importo_incassato) as totale
    from public.payments p
    join public.sales s on s.id = p.sale_id
    where p.stato in ('incassata', 'rimborsata')
      and p.incassato_il >= (v_ultimo - (interval '1 month' * (greatest(p_mesi, 1) - 1)))::date
    group by 1
  )
  select
    mesi.m,
    coalesce(cassa.nuovo, 0)::numeric(12, 2),
    coalesce(cassa.rinnovo, 0)::numeric(12, 2),
    coalesce(cassa.upsell, 0)::numeric(12, 2),
    coalesce(cassa.totale, 0)::numeric(12, 2)
  from mesi
  left join cassa on cassa.m = mesi.m
  order by mesi.m;
end;
$$;

-- ---------------------------------------------------------------------------
-- What is still to be collected: overdue, next 30 days, later. Admin only.
-- ---------------------------------------------------------------------------
create or replace function public.da_incassare()
returns table (fascia text, totale numeric, numero bigint)
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
  select f.fascia,
         coalesce(sum(p.importo_previsto), 0)::numeric(12, 2),
         count(p.id)
  from (values (1, 'in_ritardo'), (2, 'prossimi_30'), (3, 'oltre')) as f(ordine, fascia)
  left join public.payments p
    on p.stato = 'prevista'
   and case
         when p.scadenza < public.oggi() then 'in_ritardo'
         when p.scadenza <= public.oggi() + 30 then 'prossimi_30'
         else 'oltre'
       end = f.fascia
  group by f.ordine, f.fascia
  order by f.ordine;
end;
$$;

-- ---------------------------------------------------------------------------
-- Setting and call metrics per setter over a period; the row with a null
-- setter is the total. Admin only.
-- ---------------------------------------------------------------------------
create or replace function public.metriche_setting(p_da date, p_a date)
returns table (
  setter_id uuid,
  nome text,
  giorni_compilati bigint,
  dm_totali bigint,
  conversazioni bigint,
  call_proposte bigint,
  call_prenotate bigint,
  tasso_conversazione numeric,
  tasso_prenotazione numeric,
  dm_per_call numeric,
  call_svolte bigint,
  no_show bigint,
  chiuse bigint,
  show_rate numeric,
  close_rate numeric
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
    select r.setter_id as sid,
           count(*) as giorni,
           sum(r.dm_outbound + r.dm_inbound) as dm,
           sum(r.conversazioni) as conv,
           sum(r.call_proposte) as proposte,
           sum(r.discovery_prenotate + r.strategy_prenotate) as prenotate
    from public.setter_daily_reports r
    where r.data between p_da and p_a
    group by rollup (r.setter_id)
  ),
  chiamate as (
    select c.setter_id as sid,
           count(*) filter (where c.stato = 'svolta') as svolte,
           count(*) filter (where c.stato = 'no_show') as noshow,
           count(*) filter (where c.esito = 'chiusa') as chiuse
    from public.calls c
    where (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
    group by rollup (c.setter_id)
  )
  select
    r.sid,
    coalesce(pr.nome, 'Totale'),
    coalesce(r.giorni, 0)::bigint,
    coalesce(r.dm, 0)::bigint,
    coalesce(r.conv, 0)::bigint,
    coalesce(r.proposte, 0)::bigint,
    coalesce(r.prenotate, 0)::bigint,
    public.rapporto(r.conv, r.dm),
    public.rapporto(r.prenotate, r.proposte),
    public.rapporto(r.dm, r.prenotate),
    coalesce(ch.svolte, 0)::bigint,
    coalesce(ch.noshow, 0)::bigint,
    coalesce(ch.chiuse, 0)::bigint,
    public.rapporto(ch.svolte, ch.svolte + ch.noshow),
    public.rapporto(ch.chiuse, ch.svolte)
  from report r
  left join chiamate ch on ch.sid is not distinct from r.sid
  left join public.profiles pr on pr.id = r.sid
  order by (r.sid is null), pr.nome;
end;
$$;

-- ---------------------------------------------------------------------------
-- Commissions per collaborator and month: accrued, paid, balance. Admin only.
-- ---------------------------------------------------------------------------
create or replace function public.provvigioni_riepilogo(p_mesi integer default 6)
returns table (
  profile_id uuid,
  nome text,
  mese date,
  maturato numeric,
  pagato numeric,
  saldo_mese numeric,
  saldo_progressivo numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_ultimo date := date_trunc('month', public.oggi())::date;
  v_primo date := (date_trunc('month', public.oggi()) - (interval '1 month' * (greatest(p_mesi, 1) - 1)))::date;
begin
  if not public.is_admin() then
    raise exception 'Le provvigioni di tutti le vede solo l''admin' using errcode = '42501';
  end if;

  return query
  with persone as (
    select distinct cr.profile_id as pid from public.commission_rules cr
    union
    select distinct cp.profile_id from public.commission_payouts cp
  ),
  mesi as (
    select (v_primo + (interval '1 month' * g))::date as m
    from generate_series(0, greatest(p_mesi, 1) - 1) as g
  ),
  maturato as (
    select v.profile_id as pid, v.mese as m, sum(v.provvigione) as tot
    from public.v_provvigioni_maturate v
    group by 1, 2
  ),
  pagato as (
    select cp.profile_id as pid, cp.periodo as m, sum(cp.importo) as tot
    from public.commission_payouts cp
    group by 1, 2
  ),
  -- the balance carries what was accrued (and paid) before the window too
  pregresso as (
    select x.pid, sum(x.tot) as tot
    from (
      select pid, tot from maturato where m < v_primo
      union all
      select pid, -tot from pagato where m < v_primo
    ) x
    group by x.pid
  ),
  righe as (
    select
      persone.pid,
      mesi.m,
      coalesce(maturato.tot, 0)::numeric(12, 2) as mat,
      coalesce(pagato.tot, 0)::numeric(12, 2) as pag
    from persone
    cross join mesi
    left join maturato on maturato.pid = persone.pid and maturato.m = mesi.m
    left join pagato on pagato.pid = persone.pid and pagato.m = mesi.m
  )
  select
    righe.pid,
    pr.nome,
    righe.m,
    righe.mat,
    righe.pag,
    (righe.mat - righe.pag)::numeric(12, 2),
    (coalesce(pregresso.tot, 0)
      + sum(righe.mat - righe.pag) over (partition by righe.pid order by righe.m))::numeric(12, 2)
  from righe
  join public.profiles pr on pr.id = righe.pid
  left join pregresso on pregresso.pid = righe.pid
  where righe.m <= v_ultimo
  order by pr.nome, righe.m;
end;
$$;

-- ---------------------------------------------------------------------------
-- The setter's own numbers: totals only, never a client's amount (section 6).
-- security definer with an explicit filter on the caller.
-- ---------------------------------------------------------------------------
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
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
  v_inizio date := date_trunc('month', p_mese)::date;
  v_fine date := (date_trunc('month', p_mese) + interval '1 month')::date - 1;
begin
  if public.current_role() is distinct from 'setter' then
    raise exception 'Questi sono i numeri del setter' using errcode = '42501';
  end if;

  return query
  with report as (
    select
      coalesce(sum(r.dm_outbound + r.dm_inbound), 0)::bigint as dm,
      coalesce(sum(r.conversazioni), 0)::bigint as conv,
      coalesce(sum(r.call_proposte), 0)::bigint as proposte,
      coalesce(sum(r.discovery_prenotate + r.strategy_prenotate), 0)::bigint as prenotate,
      count(*) as giorni
    from public.setter_daily_reports r
    where r.setter_id = v_utente and r.data between v_inizio and v_fine
  ),
  chiamate as (
    select
      count(*) as fissate,
      count(*) filter (where c.stato = 'svolta') as svolte,
      count(*) filter (where c.stato = 'no_show') as noshow,
      count(*) filter (where c.esito = 'chiusa') as chiuse
    from public.calls c
    where c.setter_id = v_utente
      and (c.programmata_il at time zone 'Europe/Rome')::date between v_inizio and v_fine
  ),
  provvigioni as (
    select coalesce(sum(v.provvigione), 0)::numeric(12, 2) as tot
    from public.v_provvigioni_maturate v
    where v.profile_id = v_utente and v.incassato_il between v_inizio and v_fine
  ),
  pagate as (
    select coalesce(sum(cp.importo), 0)::numeric(12, 2) as tot
    from public.commission_payouts cp
    where cp.profile_id = v_utente and cp.periodo = v_inizio
  )
  select
    report.dm, report.conv, report.proposte, report.prenotate,
    public.rapporto(report.conv, report.dm),
    public.rapporto(report.prenotate, report.proposte),
    public.rapporto(report.dm, report.prenotate),
    report.giorni,
    chiamate.fissate, chiamate.svolte, chiamate.noshow, chiamate.chiuse,
    public.rapporto(chiamate.svolte, chiamate.svolte + chiamate.noshow),
    public.rapporto(chiamate.chiuse, chiamate.svolte),
    provvigioni.tot, pagate.tot
  from report, chiamate, provvigioni, pagate;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.rapporto(numeric, numeric) from public, anon;
grant execute on function public.rapporto(numeric, numeric) to authenticated;

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.metriche_mese(date)',
    'public.kpi_panoramica(date)',
    'public.cash_mensile(integer, date)',
    'public.da_incassare()',
    'public.metriche_setting(date, date)',
    'public.provvigioni_riepilogo(integer)',
    'public.miei_numeri(date)'
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Realtime: the overview refreshes itself when Loris saves or cash comes in.
-- Realtime respects RLS: each subscriber only hears about rows they can read.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table
  public.setter_daily_reports,
  public.calls,
  public.payments,
  public.sales,
  public.expenses;
