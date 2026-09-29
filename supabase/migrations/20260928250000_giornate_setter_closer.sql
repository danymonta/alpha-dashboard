-- Setter and closer, day by day (Dany, 28/09/2026): the two halves of the
-- Excel tracking sheet (SETTER and CLOSER columns) side by side, every number
-- computed here. The closer's day comes from the calls and the sales he
-- records, never typed twice:
--   call        calls held (stato svolta), by the day they were scheduled
--   qualificate held and qualified (a closed call is always qualified)
--   no_show     stato no_show
--   follow_up   held with esito follow_up
--   cancellate  stato cancellata
--   chiuse      esito chiusa
--   cash        cash in that day (incassata and rimborsata, by incassato_il)
--   revenue     contracts signed that day (valore_contratto by data_vendita)
-- Days in Europe/Rome, as every other call metric. A row with data null is the
-- total of the period.

-- 1. The closer's days -----------------------------------------------------------
-- Admin: every closer (p_closer null) or one. Closer: only his own, whatever
-- p_closer says. Anyone else: refused. security invoker: RLS already lets the
-- closer read his calls, sales and their instalments, and nothing else.
create or replace function public.giornate_closer(p_da date, p_a date, p_closer uuid default null)
returns table (
  data date,
  call integer,
  qualificate integer,
  no_show integer,
  follow_up integer,
  cancellate integer,
  chiuse integer,
  cash numeric,
  revenue numeric,
  show_rate numeric,
  close_rate numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_ruolo public.app_role := public.current_role();
  v_closer uuid;
begin
  if v_ruolo = 'admin' then
    v_closer := p_closer;
  elsif v_ruolo = 'closer' then
    v_closer := (select auth.uid());
  else
    raise exception 'La giornata del closer la vedono l''admin e il closer' using errcode = '42501';
  end if;
  perform public.verifica_periodo(p_da, p_a);

  return query
  with chiamate as (
    select
      (c.programmata_il at time zone 'Europe/Rome')::date as giorno,
      count(*) filter (where c.stato = 'svolta') as svolte,
      count(*) filter (where c.stato = 'svolta' and c.qualificata) as qualificate_,
      count(*) filter (where c.stato = 'no_show') as noshow,
      count(*) filter (where c.stato = 'svolta' and c.esito = 'follow_up') as followup,
      count(*) filter (where c.stato = 'cancellata') as cancellate_,
      count(*) filter (where c.esito = 'chiusa') as chiuse_
    from public.calls c
    where (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
      and (v_closer is null or c.closer_id = v_closer)
    group by 1
  ),
  incassi as (
    select p.incassato_il as giorno, sum(p.importo_incassato) as cash_
    from public.payments p
    join public.sales s on s.id = p.sale_id
    where p.stato in ('incassata', 'rimborsata')
      and p.incassato_il between p_da and p_a
      and (v_closer is null or s.closer_id = v_closer)
    group by 1
  ),
  firmate as (
    select s.data_vendita as giorno, sum(s.valore_contratto) as revenue_
    from public.sales s
    where s.data_vendita between p_da and p_a
      and (v_closer is null or s.closer_id = v_closer)
    group by 1
  ),
  giorni as (
    select ch.giorno from chiamate ch
    union select i.giorno from incassi i
    union select f.giorno from firmate f
  ),
  righe as (
    select
      g.giorno,
      coalesce(ch.svolte, 0) as svolte,
      coalesce(ch.qualificate_, 0) as qualificate_,
      coalesce(ch.noshow, 0) as noshow,
      coalesce(ch.followup, 0) as followup,
      coalesce(ch.cancellate_, 0) as cancellate_,
      coalesce(ch.chiuse_, 0) as chiuse_,
      coalesce(i.cash_, 0) as cash_,
      coalesce(f.revenue_, 0) as revenue_
    from giorni g
    left join chiamate ch on ch.giorno = g.giorno
    left join incassi i on i.giorno = g.giorno
    left join firmate f on f.giorno = g.giorno
  )
  select
    r.giorno,
    sum(r.svolte)::integer,
    sum(r.qualificate_)::integer,
    sum(r.noshow)::integer,
    sum(r.followup)::integer,
    sum(r.cancellate_)::integer,
    sum(r.chiuse_)::integer,
    sum(r.cash_)::numeric(12, 2),
    sum(r.revenue_)::numeric(12, 2),
    public.rapporto(sum(r.svolte), sum(r.svolte) + sum(r.noshow)),
    public.rapporto(sum(r.chiuse_), sum(r.svolte))
  from righe r
  where r.svolte + r.noshow + r.cancellate_ > 0 or r.cash_ <> 0 or r.revenue_ <> 0
  group by grouping sets ((r.giorno), ())
  order by r.giorno desc nulls first;
end;
$$;

comment on function public.giornate_closer(date, date, uuid) is
  'The closer''s day by day (calls, qualified, no show, follow up, cancelled, closes, cash, revenue); total row with data null.';

revoke all on function public.giornate_closer(date, date, uuid) from public, anon;
grant execute on function public.giornate_closer(date, date, uuid) to authenticated;

-- 2. The setter's days, crossed with the closer ---------------------------------
-- The setter's own report, what happened to the calls he booked (counts only)
-- and the money of the clients he brought (the exception of section 6: only
-- sales where he is the setter). security definer: the setter has no policy
-- on sales and payments; the filter on the caller is explicit.
-- Admin: one setter (p_setter) or every setter together (p_setter null).
create or replace function public.giornate_setter(p_da date, p_a date, p_setter uuid default null)
returns table (
  data date,
  dm_outbound integer,
  dm_inbound integer,
  conversazioni integer,
  call_proposte integer,
  discovery_prenotate integer,
  discovery_svolte integer,
  call_qualificate integer,
  strategy_prenotate integer,
  follow_up integer,
  dm_totali integer,
  prenotate_inbound integer,
  prenotate_outbound integer,
  closer_call integer,
  closer_qualificate integer,
  closer_no_show integer,
  closer_follow_up integer,
  closer_cancellate integer,
  closer_chiuse integer,
  cash numeric,
  revenue numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ruolo public.app_role := public.current_role();
  v_setter uuid;
begin
  if v_ruolo = 'admin' then
    v_setter := p_setter;
  elsif v_ruolo = 'setter' then
    v_setter := (select auth.uid());
  else
    raise exception 'La giornata del setter la vedono l''admin e il setter' using errcode = '42501';
  end if;
  perform public.verifica_periodo(p_da, p_a);

  return query
  with report as (
    select
      r.data as giorno,
      sum(r.dm_outbound) as dm_out,
      sum(r.dm_inbound) as dm_in,
      sum(r.conversazioni) as conv,
      sum(r.call_proposte) as proposte,
      sum(r.discovery_prenotate) as disc_pren,
      sum(r.discovery_svolte) as disc_svolte,
      sum(r.call_qualificate) as qualif,
      sum(r.strategy_prenotate) as strat_pren,
      sum(r.follow_up) as fup
    from public.setter_daily_reports r
    where r.data between p_da and p_a
      and (v_setter is null or r.setter_id = v_setter)
    group by 1
  ),
  chiamate as (
    select
      (c.programmata_il at time zone 'Europe/Rome')::date as giorno,
      count(*) filter (where c.stato = 'svolta') as svolte,
      count(*) filter (where c.stato = 'svolta' and c.qualificata) as qualificate_,
      count(*) filter (where c.stato = 'no_show') as noshow,
      count(*) filter (where c.stato = 'svolta' and c.esito = 'follow_up') as followup,
      count(*) filter (where c.stato = 'cancellata') as cancellate_,
      count(*) filter (where c.esito = 'chiusa') as chiuse_
    from public.calls c
    where (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
      and (case when v_setter is null then c.setter_id is not null else c.setter_id = v_setter end)
    group by 1
  ),
  -- calls booked that day (created), by the lead's source: not typed in the report
  prenotazioni as (
    select
      (c.created_at at time zone 'Europe/Rome')::date as giorno,
      count(*) filter (where l.fonte = 'dm_inbound') as da_inbound,
      count(*) filter (where l.fonte = 'dm_outbound') as da_outbound
    from public.calls c
    join public.leads l on l.id = c.lead_id
    where (c.created_at at time zone 'Europe/Rome')::date between p_da and p_a
      and (case when v_setter is null then c.setter_id is not null else c.setter_id = v_setter end)
    group by 1
  ),
  incassi as (
    select p.incassato_il as giorno, sum(p.importo_incassato) as cash_
    from public.payments p
    join public.sales s on s.id = p.sale_id
    where p.stato in ('incassata', 'rimborsata')
      and p.incassato_il between p_da and p_a
      and (case when v_setter is null then s.setter_id is not null else s.setter_id = v_setter end)
    group by 1
  ),
  firmate as (
    select s.data_vendita as giorno, sum(s.valore_contratto) as revenue_
    from public.sales s
    where s.data_vendita between p_da and p_a
      and (case when v_setter is null then s.setter_id is not null else s.setter_id = v_setter end)
    group by 1
  ),
  giorni as (
    select rp.giorno from report rp
    union select pz.giorno from prenotazioni pz
    union select ch.giorno from chiamate ch
    union select i.giorno from incassi i
    union select f.giorno from firmate f
  ),
  righe as (
    select
      g.giorno,
      coalesce(rp.dm_out, 0) as dm_out, coalesce(rp.dm_in, 0) as dm_in, coalesce(rp.conv, 0) as conv,
      coalesce(rp.proposte, 0) as proposte, coalesce(rp.disc_pren, 0) as disc_pren,
      coalesce(rp.disc_svolte, 0) as disc_svolte, coalesce(rp.qualif, 0) as qualif,
      coalesce(rp.strat_pren, 0) as strat_pren, coalesce(rp.fup, 0) as fup,
      coalesce(pz.da_inbound, 0) as da_inbound, coalesce(pz.da_outbound, 0) as da_outbound,
      coalesce(ch.svolte, 0) as svolte, coalesce(ch.qualificate_, 0) as qualificate_,
      coalesce(ch.noshow, 0) as noshow, coalesce(ch.followup, 0) as followup,
      coalesce(ch.cancellate_, 0) as cancellate_, coalesce(ch.chiuse_, 0) as chiuse_,
      coalesce(i.cash_, 0) as cash_, coalesce(f.revenue_, 0) as revenue_
    from giorni g
    left join report rp on rp.giorno = g.giorno
    left join prenotazioni pz on pz.giorno = g.giorno
    left join chiamate ch on ch.giorno = g.giorno
    left join incassi i on i.giorno = g.giorno
    left join firmate f on f.giorno = g.giorno
  )
  select
    r.giorno,
    sum(r.dm_out)::integer, sum(r.dm_in)::integer, sum(r.conv)::integer, sum(r.proposte)::integer,
    sum(r.disc_pren)::integer, sum(r.disc_svolte)::integer, sum(r.qualif)::integer,
    sum(r.strat_pren)::integer, sum(r.fup)::integer,
    -- DM totali: outbound + inbound + follow up (conversations do not count)
    (sum(r.dm_out) + sum(r.dm_in) + sum(r.fup))::integer,
    sum(r.da_inbound)::integer, sum(r.da_outbound)::integer,
    sum(r.svolte)::integer, sum(r.qualificate_)::integer, sum(r.noshow)::integer,
    sum(r.followup)::integer, sum(r.cancellate_)::integer, sum(r.chiuse_)::integer,
    sum(r.cash_)::numeric(12, 2), sum(r.revenue_)::numeric(12, 2)
  from righe r
  -- a day counts when the setter wrote it or something happened on it
  where r.giorno in (select rp.giorno from report rp)
     or r.svolte + r.noshow + r.cancellate_ > 0 or r.cash_ <> 0 or r.revenue_ <> 0
     or r.da_inbound + r.da_outbound > 0
  group by grouping sets ((r.giorno), ())
  order by r.giorno desc nulls first;
end;
$$;

comment on function public.giornate_setter(date, date, uuid) is
  'The setter''s day by day: his report, the closer''s results on the calls he booked, cash and revenue of the clients he brought; total row with data null.';

revoke all on function public.giornate_setter(date, date, uuid) from public, anon;
grant execute on function public.giornate_setter(date, date, uuid) to authenticated;
