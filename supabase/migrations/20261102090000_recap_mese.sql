-- The sales recap by month and by day (Dany, 23/10/2026, 1.59.0: «rifai la dashboard per Max… stile
-- calendario dove si vede il mese cosa è successo ogni giorno… visualizzazione a calendario o a tabella»,
-- like the monthly sheets of his Excel). recap_mese(p_mese) answers the business coach (and the admin)
-- with one month of team totals:
--
-- * valori, precedenti, delta: recap_sales() on the month, so the tiles are the ones of 1.58.0
--   (metriche_periodo and metriche_setting, the Panoramica);
-- * riepilogo and riepilogo_precedente: the ratio boxes of the Excel with the definitions of
--   CLAUDE.md section 9, from metriche_periodo (two more ratios, written here with rapporto():
--   qualified calls over total DMs, and the cash of the new clients over the calls closed);
-- * giorni: every day of the month, zeros included. The setter half sums the setters' daily reports
--   (team totals, never a row per person) and counts the calls booked by the lead's source as
--   metriche_setting does; the closer half is giornate_closer for all the closers (calls by
--   programmata_il in Europe/Rome; cash = the first instalment of the «nuovo» sales on the day of the
--   sale, revenue = their contract), plus the calls waiting for a new date (stato riprogrammata);
-- * totali: the sum of the days, with the show rate and the close rate of the sums.
--
-- Same guard as recap_sales: the active admin and business coach from the app; 42501 for every other
-- role, a deactivated account, no session and every Claude token (also the admin's). security definer
-- with an empty search_path; the metric functions it calls answer the business coach only inside it
-- (legge_come_admin() and the alpha.recap_sales flag, 20261101090000), lowered again before it returns.
-- Never a name, a lead, a client, a sale, a payment, costs, margin or commissions.

create or replace function public.recap_mese(p_mese date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ruolo public.app_role := public.current_role();
  v_da date;
  v_a date;
  v_prec_da date;
  v_prec_a date;
  v_base jsonb;
  v_riepilogo jsonb;
  v_riepilogo_prec jsonb;
  v_giorni jsonb;
  v_totali jsonb;
begin
  -- the active admin and business coach, from the app; never a Claude token, never another role
  if public.da_client_oauth() or v_ruolo is null or v_ruolo not in ('admin', 'business_coach') then
    raise exception 'Il recap vendite lo leggono l''admin e il business coach.' using errcode = '42501';
  end if;
  if p_mese is null then
    raise exception 'Mese non valido' using errcode = '22023';
  end if;

  v_da := date_trunc('month', p_mese)::date;
  v_a := ((v_da + interval '1 month')::date - 1);
  v_prec_da := (v_da - interval '1 month')::date;
  v_prec_a := v_da - 1;

  -- the tiles: the recap of 1.58.0 on the whole month (it raises and lowers the flag itself)
  v_base := public.recap_sales(v_da, v_a);

  -- the ratio boxes of the Excel, with the official definitions (section 9)
  perform set_config('alpha.recap_sales', 'on', true);

  select jsonb_build_object(
      'dm_totali', m.dm_totali,
      'conversazioni', m.conversazioni,
      'call_proposte', m.call_proposte,
      'call_prenotate', m.call_prenotate,
      'call_svolte', m.call_svolte,
      'no_show', m.no_show,
      'qualificate', m.qualificate,
      'chiuse', m.chiuse,
      'vendite_nuove', m.nuovi_clienti,
      'tasso_conversazione', m.tasso_conversazione,
      'tasso_prenotazione', m.tasso_prenotazione,
      'tasso_dm_qualificate', public.rapporto(m.qualificate, m.dm_totali),
      'dm_per_call', m.dm_per_call,
      'show_rate', m.show_rate,
      'tasso_qualificazione', m.tasso_qualificazione,
      'close_rate', m.close_rate,
      'close_rate_qualificate', m.close_rate_qualificate,
      'cash_nuovi_clienti', m.cash_nuovi_clienti,
      'revenue_nuovi', m.revenue_nuovi,
      'cash_per_dm', m.cash_per_dm,
      'revenue_per_dm', m.revenue_per_dm,
      'cash_per_call_svolta', m.cash_per_call_svolta,
      'valore_medio_nuovo', m.valore_medio_nuovo,
      'cash_medio_chiusura', public.rapporto(m.cash_nuovi_clienti, m.chiuse))
    into v_riepilogo
  from public.metriche_periodo(v_da, v_a) m;

  select jsonb_build_object(
      'dm_totali', m.dm_totali,
      'conversazioni', m.conversazioni,
      'call_proposte', m.call_proposte,
      'call_prenotate', m.call_prenotate,
      'call_svolte', m.call_svolte,
      'no_show', m.no_show,
      'qualificate', m.qualificate,
      'chiuse', m.chiuse,
      'vendite_nuove', m.nuovi_clienti,
      'tasso_conversazione', m.tasso_conversazione,
      'tasso_prenotazione', m.tasso_prenotazione,
      'tasso_dm_qualificate', public.rapporto(m.qualificate, m.dm_totali),
      'dm_per_call', m.dm_per_call,
      'show_rate', m.show_rate,
      'tasso_qualificazione', m.tasso_qualificazione,
      'close_rate', m.close_rate,
      'close_rate_qualificate', m.close_rate_qualificate,
      'cash_nuovi_clienti', m.cash_nuovi_clienti,
      'revenue_nuovi', m.revenue_nuovi,
      'cash_per_dm', m.cash_per_dm,
      'revenue_per_dm', m.revenue_per_dm,
      'cash_per_call_svolta', m.cash_per_call_svolta,
      'valore_medio_nuovo', m.valore_medio_nuovo,
      'cash_medio_chiusura', public.rapporto(m.cash_nuovi_clienti, m.chiuse))
    into v_riepilogo_prec
  from public.metriche_periodo(v_prec_da, v_prec_a) m;

  perform set_config('alpha.recap_sales', '', true);

  -- every day of the month: the setter half and the closer half of the Excel row
  with giorni as (
    select g::date as giorno
    from generate_series(v_da::timestamp, v_a::timestamp, interval '1 day') as g
  ),
  report as (
    select r.data as giorno,
           sum(r.dm_outbound) as dm_out,
           sum(r.dm_inbound) as dm_in,
           sum(r.follow_up) as fup,
           sum(r.conversazioni) as conv,
           sum(r.call_proposte) as proposte,
           sum(r.discovery_prenotate + r.strategy_prenotate) as prenotate
    from public.setter_daily_reports r
    where r.data between v_da and v_a
    group by r.data
  ),
  -- the calls booked that day, by the lead's source, as metriche_setting (never a follow-up call)
  prenotazioni as (
    select (c.created_at at time zone 'Europe/Rome')::date as giorno,
           count(*) filter (where l.fonte = 'dm_inbound') as da_in,
           count(*) filter (where l.fonte = 'dm_outbound') as da_out
    from public.calls c
    join public.leads l on l.id = c.lead_id
    where (c.created_at at time zone 'Europe/Rome')::date between v_da and v_a
      and c.setter_id is not null
      and not c.di_follow_up
    group by 1
  ),
  -- the closer's day, as giornate_closer for every closer
  chiamate as (
    select (c.programmata_il at time zone 'Europe/Rome')::date as giorno,
           count(*) filter (where c.stato = 'svolta') as svolte,
           count(*) filter (where c.stato = 'svolta' and c.qualificata) as qualif,
           count(*) filter (where c.stato = 'no_show') as noshow,
           count(*) filter (where c.stato = 'svolta' and c.esito = 'follow_up') as followup,
           count(*) filter (where c.stato = 'cancellata') as cancellate,
           count(*) filter (where c.stato = 'riprogrammata') as attesa,
           count(*) filter (where c.esito = 'chiusa') as chiuse
    from public.calls c
    where (c.programmata_il at time zone 'Europe/Rome')::date between v_da and v_a
    group by 1
  ),
  incassi as (
    select s.data_vendita as giorno, sum(p.importo_incassato) as cash
    from public.payments p
    join public.sales s on s.id = p.sale_id
    where s.tipo = 'nuovo'
      and p.numero_rata = 1
      and p.stato = 'incassata'
      and s.data_vendita between v_da and v_a
    group by 1
  ),
  firmate as (
    select s.data_vendita as giorno, sum(s.valore_contratto) as revenue
    from public.sales s
    where s.tipo = 'nuovo'
      and s.data_vendita between v_da and v_a
    group by 1
  ),
  righe as (
    select
      g.giorno,
      coalesce(r.dm_out, 0)::bigint as dm_outbound,
      coalesce(r.dm_in, 0)::bigint as dm_inbound,
      coalesce(r.fup, 0)::bigint as follow_up,
      (coalesce(r.dm_out, 0) + coalesce(r.dm_in, 0) + coalesce(r.fup, 0))::bigint as dm_totali,
      coalesce(r.conv, 0)::bigint as conversazioni,
      coalesce(r.proposte, 0)::bigint as call_proposte,
      coalesce(r.prenotate, 0)::bigint as call_prenotate,
      coalesce(p.da_in, 0)::bigint as prenotate_inbound,
      coalesce(p.da_out, 0)::bigint as prenotate_outbound,
      coalesce(ch.svolte, 0)::bigint as call_svolte,
      coalesce(ch.qualif, 0)::bigint as qualificate,
      coalesce(ch.noshow, 0)::bigint as no_show,
      coalesce(ch.followup, 0)::bigint as call_follow_up,
      coalesce(ch.cancellate, 0)::bigint as cancellate,
      coalesce(ch.attesa, 0)::bigint as in_attesa,
      coalesce(ch.chiuse, 0)::bigint as chiuse,
      coalesce(i.cash, 0)::numeric(12, 2) as cash,
      coalesce(f.revenue, 0)::numeric(12, 2) as revenue
    from giorni g
    left join report r on r.giorno = g.giorno
    left join prenotazioni p on p.giorno = g.giorno
    left join chiamate ch on ch.giorno = g.giorno
    left join incassi i on i.giorno = g.giorno
    left join firmate f on f.giorno = g.giorno
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
        'giorno', x.giorno,
        'dm_outbound', x.dm_outbound,
        'dm_inbound', x.dm_inbound,
        'follow_up', x.follow_up,
        'dm_totali', x.dm_totali,
        'conversazioni', x.conversazioni,
        'call_proposte', x.call_proposte,
        'call_prenotate', x.call_prenotate,
        'prenotate_inbound', x.prenotate_inbound,
        'prenotate_outbound', x.prenotate_outbound,
        'call_svolte', x.call_svolte,
        'qualificate', x.qualificate,
        'no_show', x.no_show,
        'call_follow_up', x.call_follow_up,
        'cancellate', x.cancellate,
        'in_attesa', x.in_attesa,
        'chiuse', x.chiuse,
        'cash', x.cash,
        'revenue', x.revenue,
        'show_rate', public.rapporto(x.call_svolte, x.call_svolte + x.no_show),
        'close_rate', public.rapporto(x.chiuse, x.call_svolte)
      ) order by x.giorno), '[]'::jsonb),
    jsonb_build_object(
      'dm_outbound', coalesce(sum(x.dm_outbound), 0),
      'dm_inbound', coalesce(sum(x.dm_inbound), 0),
      'follow_up', coalesce(sum(x.follow_up), 0),
      'dm_totali', coalesce(sum(x.dm_totali), 0),
      'conversazioni', coalesce(sum(x.conversazioni), 0),
      'call_proposte', coalesce(sum(x.call_proposte), 0),
      'call_prenotate', coalesce(sum(x.call_prenotate), 0),
      'prenotate_inbound', coalesce(sum(x.prenotate_inbound), 0),
      'prenotate_outbound', coalesce(sum(x.prenotate_outbound), 0),
      'call_svolte', coalesce(sum(x.call_svolte), 0),
      'qualificate', coalesce(sum(x.qualificate), 0),
      'no_show', coalesce(sum(x.no_show), 0),
      'call_follow_up', coalesce(sum(x.call_follow_up), 0),
      'cancellate', coalesce(sum(x.cancellate), 0),
      'in_attesa', coalesce(sum(x.in_attesa), 0),
      'chiuse', coalesce(sum(x.chiuse), 0),
      'cash', coalesce(sum(x.cash), 0)::numeric(12, 2),
      'revenue', coalesce(sum(x.revenue), 0)::numeric(12, 2),
      'show_rate', public.rapporto(sum(x.call_svolte), sum(x.call_svolte) + sum(x.no_show)),
      'close_rate', public.rapporto(sum(x.chiuse), sum(x.call_svolte)))
    into v_giorni, v_totali
  from righe x;

  return jsonb_build_object(
    'mese', v_da,
    'da', v_da,
    'a', v_a,
    'oggi', public.oggi(),
    'precedente_da', v_prec_da,
    'precedente_a', v_prec_a,
    'valori', v_base -> 'valori',
    'precedenti', v_base -> 'precedenti',
    'delta', v_base -> 'delta',
    'riepilogo', v_riepilogo,
    'riepilogo_precedente', v_riepilogo_prec,
    'giorni', v_giorni,
    'totali', v_totali
  );
end;
$$;

revoke all on function public.recap_mese(date) from public, anon;
grant execute on function public.recap_mese(date) to authenticated;

comment on function public.recap_mese(date) is
  'The sales recap of one month for the business coach and the admin (1.59.0): the tiles of recap_sales, the ratio boxes from metriche_periodo, every day of the month with the setter half (setter_daily_reports, team totals) and the closer half (as giornate_closer for every closer), and the totals of the days. 42501 for every other role, a deactivated account, no session and every Claude token. Never a name or a row per person.';
