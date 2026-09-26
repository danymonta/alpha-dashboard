-- Overview extras: the funnel with step-to-step conversion, and today's
-- team numbers (what visibly moves while the setter fills the report).

create or replace function public.funnel_mese(p_mese date)
returns table (ordine integer, fase text, valore bigint, passaggio numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  -- metriche_mese enforces the admin check
  with m as (select * from public.metriche_mese(p_mese))
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
      coalesce(sum(r.dm_outbound + r.dm_inbound), 0)::bigint as dm,
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

revoke all on function public.funnel_mese(date) from public, anon;
grant execute on function public.funnel_mese(date) to authenticated;
revoke all on function public.oggi_team() from public, anon;
grant execute on function public.oggi_team() to authenticated;
