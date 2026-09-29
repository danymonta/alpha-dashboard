-- DM totali, as Dany defines them (28/09/2026): the people written to that day.
--   DM outbound  new people we wrote to first (counted once, the first day)
--   DM inbound   new people who asked for information and got an answer
--   follow up    nudges to people who did not answer
--   DM totali    = outbound + inbound + follow up; conversations do not count
-- Tasso di conversazione = conversazioni / DM totali; DM per call prenotata =
-- DM totali / call prenotate. Calls booked by source (DM inbound, DM outbound)
-- come from the calls the setter books ("Nuova call" records the lead's source),
-- counted on the day they were booked: nothing more for the setter to type.

-- 1. Same shape, new DM totali ---------------------------------------------------
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

create or replace function public.oggi_team()
returns table (
  dm_totali bigint,
  conversazioni bigint,
  call_prenotate bigint,
  report_compilati bigint,
  call_in_programma bigint,
  call_svolte bigint,
  chiuse bigint,
  cash_incassato numeric
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
  cassa as (
    select coalesce(sum(p.importo_incassato), 0)::numeric(12, 2) as tot
    from public.payments p
    where p.stato in ('incassata', 'rimborsata') and p.incassato_il = public.oggi()
  )
  select report.dm, report.conv, report.prenotate, report.compilati,
         chiamate.programmate, chiamate.svolte, chiamate.chiuse, cassa.tot
  from report, chiamate, cassa;
end;
$$;

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
                  'cliente', concat_ws(' ', cl.nome, cl.cognome), 'importo', p.importo_incassato, 'metodo', p.metodo)
                  order by p.importo_incassato desc)
               from public.payments p join public.sales s on s.id = p.sale_id join public.clients cl on cl.id = s.client_id
               where p.stato in ('incassata', 'rimborsata') and p.incassato_il = p_giorno), '[]'::jsonb),
    'vendite', coalesce((select jsonb_agg(jsonb_build_object(
                  'cliente', concat_ws(' ', cl.nome, cl.cognome), 'tipo', s.tipo, 'valore', s.valore_contratto)
                  order by s.valore_contratto desc)
               from public.sales s join public.clients cl on cl.id = s.client_id
               where s.data_vendita = p_giorno), '[]'::jsonb),
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

-- 2. The setter's metrics grow the split: new return type, drop and recreate ------
drop function public.metriche_setting(date, date);
create or replace function public.metriche_setting(p_da date, p_a date)
returns table (
  setter_id uuid,
  nome text,
  giorni_compilati bigint,
  dm_totali bigint,
  dm_outbound bigint,
  dm_inbound bigint,
  follow_up bigint,
  conversazioni bigint,
  call_proposte bigint,
  call_prenotate bigint,
  prenotate_inbound bigint,
  prenotate_outbound bigint,
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
           sum(r.dm_outbound + r.dm_inbound + r.follow_up) as dm,
           sum(r.dm_outbound) as dm_out,
           sum(r.dm_inbound) as dm_in,
           sum(r.follow_up) as fup,
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
      -- a call whose setter was deleted has none: its null group would collide with the total
      and c.setter_id is not null
    group by rollup (c.setter_id)
  ),
  -- calls booked in the period (the day they were created), by the lead's source
  prenotazioni as (
    select c.setter_id as sid,
           count(*) filter (where l.fonte = 'dm_inbound') as da_inbound,
           count(*) filter (where l.fonte = 'dm_outbound') as da_outbound
    from public.calls c
    join public.leads l on l.id = c.lead_id
    where (c.created_at at time zone 'Europe/Rome')::date between p_da and p_a
      and c.setter_id is not null
    group by rollup (c.setter_id)
  )
  select
    r.sid,
    coalesce(pr.nome, 'Totale'),
    coalesce(r.giorni, 0)::bigint,
    coalesce(r.dm, 0)::bigint,
    coalesce(r.dm_out, 0)::bigint,
    coalesce(r.dm_in, 0)::bigint,
    coalesce(r.fup, 0)::bigint,
    coalesce(r.conv, 0)::bigint,
    coalesce(r.proposte, 0)::bigint,
    coalesce(r.prenotate, 0)::bigint,
    coalesce(pz.da_inbound, 0)::bigint,
    coalesce(pz.da_outbound, 0)::bigint,
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
  left join prenotazioni pz on pz.sid is not distinct from r.sid
  left join public.profiles pr on pr.id = r.sid
  order by (r.sid is null), pr.nome;
end;
$$;

revoke all on function public.metriche_setting(date, date) from public, anon;
grant execute on function public.metriche_setting(date, date) to authenticated;

drop function public.miei_numeri(date);
drop function public.miei_numeri_periodo(date, date);
create or replace function public.miei_numeri_periodo(p_da date, p_a date)
returns table (
  dm_totali bigint,
  dm_outbound bigint,
  dm_inbound bigint,
  follow_up bigint,
  conversazioni bigint,
  call_proposte bigint,
  call_prenotate bigint,
  prenotate_inbound bigint,
  prenotate_outbound bigint,
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
      coalesce(sum(r.dm_outbound + r.dm_inbound + r.follow_up), 0)::bigint as dm,
      coalesce(sum(r.dm_outbound), 0)::bigint as dm_out,
      coalesce(sum(r.dm_inbound), 0)::bigint as dm_in,
      coalesce(sum(r.follow_up), 0)::bigint as fup,
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
  prenotazioni as (
    select
      count(*) filter (where l.fonte = 'dm_inbound') as da_inbound,
      count(*) filter (where l.fonte = 'dm_outbound') as da_outbound
    from public.calls c
    join public.leads l on l.id = c.lead_id
    where c.setter_id = v_utente
      and (c.created_at at time zone 'Europe/Rome')::date between p_da and p_a
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
    report.dm, report.dm_out, report.dm_in, report.fup, report.conv, report.proposte, report.prenotate,
    prenotazioni.da_inbound, prenotazioni.da_outbound,
    public.rapporto(report.conv, report.dm),
    public.rapporto(report.prenotate, report.proposte),
    public.rapporto(report.dm, report.prenotate),
    report.giorni,
    chiamate.fissate, chiamate.svolte, chiamate.noshow, chiamate.chiuse_,
    public.rapporto(chiamate.svolte, chiamate.svolte + chiamate.noshow),
    public.rapporto(chiamate.chiuse_, chiamate.svolte),
    provvigioni.tot, pagate.tot
  from report, chiamate, prenotazioni, provvigioni, pagate;
end;
$$;

comment on function public.miei_numeri_periodo(date, date) is
  'The calling setter''s totals over [p_da, p_a]: DM split, bookings by source, calls, commissions; payouts of every month the period touches.';

create or replace function public.miei_numeri(p_mese date)
returns table (
  dm_totali bigint,
  dm_outbound bigint,
  dm_inbound bigint,
  follow_up bigint,
  conversazioni bigint,
  call_proposte bigint,
  call_prenotate bigint,
  prenotate_inbound bigint,
  prenotate_outbound bigint,
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

revoke all on function public.miei_numeri_periodo(date, date) from public, anon;
grant execute on function public.miei_numeri_periodo(date, date) to authenticated;
revoke all on function public.miei_numeri(date) from public, anon;
grant execute on function public.miei_numeri(date) to authenticated;
