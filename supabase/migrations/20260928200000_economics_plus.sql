-- Economics, round two (Dany, 27/09/2026): monthly targets, cash forecast,
-- where the money comes from, the evening summary. Every number in SQL; the
-- cash definition is the one of metriche_periodo (incassata and rimborsata,
-- by incassato_il: refunds count negative).

-- 1. Monthly targets -----------------------------------------------------------
create table public.obiettivi_mese (
  mese date primary key check (mese = date_trunc('month', mese)::date),
  cash numeric(12, 2) check (cash is null or cash > 0),
  nuovi_clienti integer check (nuovi_clienti is null or nuovi_clienti > 0),
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger obiettivi_mese_updated_at
  before update on public.obiettivi_mese
  for each row execute function public.set_updated_at();

create trigger obiettivi_mese_audit
  after insert or update or delete on public.obiettivi_mese
  for each row execute function public.audit_row();

alter table public.obiettivi_mese enable row level security;
revoke all on public.obiettivi_mese from anon;

create policy obiettivi_mese_admin on public.obiettivi_mese for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Progress of the month against its targets.
create or replace function public.avanzamento_obiettivi(p_mese date)
returns table (
  mese date,
  obiettivo_cash numeric,
  cash numeric,
  quota_cash numeric,
  obiettivo_nuovi integer,
  nuovi integer,
  quota_nuovi numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_mese date := date_trunc('month', p_mese)::date;
  v_fine date := (date_trunc('month', p_mese) + interval '1 month - 1 day')::date;
begin
  if not public.is_admin() then
    raise exception 'Gli obiettivi li vede solo l''admin' using errcode = '42501';
  end if;
  return query
  with o as (select * from public.obiettivi_mese where obiettivi_mese.mese = v_mese),
  c as (
    select coalesce(sum(p.importo_incassato), 0)::numeric(12, 2) as tot
    from public.payments p
    where p.stato in ('incassata', 'rimborsata') and p.incassato_il between v_mese and v_fine
  ),
  n as (
    select count(*)::integer as tot from public.sales s
    where s.tipo = 'nuovo' and s.data_vendita between v_mese and v_fine
  )
  select
    v_mese,
    o.cash,
    c.tot,
    case when o.cash is null then null else round(c.tot / o.cash, 4) end,
    o.nuovi_clienti,
    n.tot,
    case when o.nuovi_clienti is null then null else round(n.tot::numeric / o.nuovi_clienti, 4) end
  from c cross join n left join o on true;
end;
$$;

revoke all on function public.avanzamento_obiettivi(date) from public, anon;
grant execute on function public.avanzamento_obiettivi(date) to authenticated;

-- 2. Cash forecast -------------------------------------------------------------
-- Per month from the current one: what is already in, what is still expected
-- from instalments due from today on. Late instalments apart: they are owed,
-- not planned, and would inflate a month that already passed.
create or replace function public.previsione_cassa(p_mesi integer default 3)
returns table (
  mese date,
  incassato numeric,
  previsto numeric,
  rate_previste integer,
  in_ritardo numeric,
  rate_in_ritardo integer
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_oggi date := public.oggi();
  v_primo date := date_trunc('month', public.oggi())::date;
begin
  if not public.is_admin() then
    raise exception 'La previsione di cassa la vede solo l''admin' using errcode = '42501';
  end if;
  return query
  with mesi as (
    select (v_primo + make_interval(months => i))::date as m
    from generate_series(0, greatest(1, least(p_mesi, 12)) - 1) as i
  ),
  ritardo as (
    select coalesce(sum(p.importo_previsto), 0)::numeric(12, 2) as tot, count(*)::integer as n
    from public.payments p
    where p.stato = 'prevista' and p.scadenza < v_oggi
  )
  select
    mesi.m,
    (select coalesce(sum(p.importo_incassato), 0)::numeric(12, 2) from public.payments p
      where p.stato in ('incassata', 'rimborsata')
        and p.incassato_il between mesi.m and (mesi.m + interval '1 month - 1 day')::date),
    (select coalesce(sum(p.importo_previsto), 0)::numeric(12, 2) from public.payments p
      where p.stato = 'prevista' and p.scadenza >= v_oggi
        and p.scadenza between mesi.m and (mesi.m + interval '1 month - 1 day')::date),
    (select count(*)::integer from public.payments p
      where p.stato = 'prevista' and p.scadenza >= v_oggi
        and p.scadenza between mesi.m and (mesi.m + interval '1 month - 1 day')::date),
    case when mesi.m = v_primo then ritardo.tot else 0::numeric end,
    case when mesi.m = v_primo then ritardo.n else 0 end
  from mesi cross join ritardo
  order by mesi.m;
end;
$$;

revoke all on function public.previsione_cassa(integer) from public, anon;
grant execute on function public.previsione_cassa(integer) to authenticated;

-- 3. Where the money comes from ------------------------------------------------
-- By the source of the client (clients.fonte) for cash and new clients, by the
-- source of the lead (leads.fonte) for calls and close rate.
create or replace function public.metriche_per_fonte(p_da date, p_a date)
returns table (
  fonte public.lead_source,
  cash numeric,
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
  return query
  select
    f.fonte,
    (select coalesce(sum(p.importo_incassato), 0)::numeric(12, 2)
       from public.payments p
       join public.sales s on s.id = p.sale_id
       join public.clients cl on cl.id = s.client_id
      where cl.fonte = f.fonte and p.stato in ('incassata', 'rimborsata') and p.incassato_il between p_da and p_a),
    (select count(*)::integer
       from public.sales s
       join public.clients cl on cl.id = s.client_id
      where cl.fonte = f.fonte and s.tipo = 'nuovo' and s.data_vendita between p_da and p_a),
    (select count(*)::integer from public.leads l
      where l.fonte = f.fonte and (l.created_at at time zone 'Europe/Rome')::date between p_da and p_a),
    c.svolte,
    c.chiuse,
    case when c.svolte = 0 then null else round(c.chiuse::numeric / c.svolte, 4) end
  from unnest(enum_range(null::public.lead_source)) as f(fonte)
  cross join lateral (
    select
      count(*) filter (where ca.stato = 'svolta')::integer as svolte,
      count(*) filter (where ca.stato = 'svolta' and ca.esito = 'chiusa')::integer as chiuse
    from public.calls ca
    join public.leads l on l.id = ca.lead_id
    where l.fonte = f.fonte and (ca.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
  ) c
  order by 2 desc, 1;
end;
$$;

revoke all on function public.metriche_per_fonte(date, date) from public, anon;
grant execute on function public.metriche_per_fonte(date, date) to authenticated;

-- 4. The evening summary -------------------------------------------------------
-- Business numbers of the day for the admins' email. Team totals only: nobody
-- is listed for what they did or did not fill in (CLAUDE.md section 17).
-- Called by the daily cron with the service role, never by a signed-in user.
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
    'dm_totali', (select coalesce(sum(r.dm_outbound + r.dm_inbound), 0) from public.setter_daily_reports r where r.data = p_giorno),
    'call_svolte', (select count(*) from public.calls c
                    where c.stato = 'svolta' and (c.programmata_il at time zone 'Europe/Rome')::date = p_giorno),
    'chiuse', (select count(*) from public.calls c
               where c.esito = 'chiusa' and (c.programmata_il at time zone 'Europe/Rome')::date = p_giorno)
  );
$$;

revoke all on function public.riepilogo_serale(date) from public, anon, authenticated;
grant execute on function public.riepilogo_serale(date) to service_role;
