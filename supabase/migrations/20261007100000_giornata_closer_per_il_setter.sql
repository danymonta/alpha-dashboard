-- The setter sees the closer's day (Dany, 07/10/2026: "il setter può accedere
-- alla tab closer"; "secondo me dovrebbero vedere tutto anche le call chiuse
-- da altri setter, massima trasparenza verso i setter", and on the money
-- "Anche gli euro"). The Closer page, day by day, for every closer or one:
-- calls held, qualified, no show, follow up, cancelled, closed, show rate,
-- close rate, cash and revenue of the new clients, of every setter's calls.
-- Only these aggregate numbers by day: no call, lead, note, sale or payment
-- of the other setters reaches him, and no new permission on leads, calls,
-- sales or payments.
--
-- giornate_closer was security invoker: RLS gave the closer his calls, sales
-- and instalments, and refused the setter the rest. Now it is security
-- definer (RLS would not give the setter the calls and sales of the others),
-- so the filters by role are explicit and complete:
--   admin          p_closer, or every closer (null)            as before
--   closer         always and only himself, p_closer ignored   as before (RLS
--                  gave him exactly closer_id = his own id, on calls and sales)
--   setter         active (current_role()): p_closer, or every closer
--   anyone else, a deactivated user, no session: 42501
-- Same signature, same columns, the 20260929130000 body: create or replace,
-- grants unchanged.
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
security definer
set search_path = ''
as $$
declare
  -- null for a deactivated user or no session
  v_ruolo public.app_role := public.current_role();
  v_closer uuid;
begin
  if v_ruolo in ('admin', 'setter') then
    v_closer := p_closer;
  elsif v_ruolo = 'closer' then
    v_closer := (select auth.uid());
  else
    raise exception 'La giornata del closer la vedono l''admin, i closer e i setter.' using errcode = '42501';
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
  -- the first instalment of the new clients, on the day of the sale
  incassi as (
    select s.data_vendita as giorno, sum(p.importo_incassato) as cash_
    from public.payments p
    join public.sales s on s.id = p.sale_id
    where s.tipo = 'nuovo'
      and p.numero_rata = 1
      and p.stato = 'incassata'
      and s.data_vendita between p_da and p_a
      and (v_closer is null or s.closer_id = v_closer)
    group by 1
  ),
  firmate as (
    select s.data_vendita as giorno, sum(s.valore_contratto) as revenue_
    from public.sales s
    where s.tipo = 'nuovo'
      and s.data_vendita between p_da and p_a
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
  'The closer''s day by day (calls, qualified, no show, follow up, cancelled, closes; cash and revenue of the new clients only, on the day of the sale); total row with data null. Admin and active setter: every closer or one (p_closer); closer: always and only his own. Aggregates only: security definer with explicit filters.';
