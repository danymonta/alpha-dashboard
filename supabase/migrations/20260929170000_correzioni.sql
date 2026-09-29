-- Review fixes of 29/09/2026, on top of 20260929150000 and 20260929160000.
-- 1. fissa_call: a call recorded after it happened (the admin's "Aggiungi una
--    call" on a past day, the setter's week back) was booked no later than it
--    took place. "Prenotate da inbound / outbound" count calls by created_at, so
--    a call of 10/03 added today counted as booked today: the call, and the lead
--    born with it, now take least(now(), programmata_il). Calls booked ahead keep
--    now(). A reused lead keeps its own date.
-- 2. metriche_per_fonte: a client with no source (the client form allows it)
--    dropped out of the per-source cash, so the sources no longer added up to
--    cash_nuovi_clienti. Such clients count under 'altro'.
-- Same signatures and columns: create or replace, grants unchanged.

-- ---------------------------------------------------------------------------
-- 1. fissa_call: booked no later than the call
-- ---------------------------------------------------------------------------
create or replace function public.fissa_call(
  p_nome text,
  p_fonte public.lead_source,
  p_tipo public.call_type,
  p_data date,
  p_ora time,
  p_closer_id uuid,
  p_instagram_handle text default null,
  p_setter_id uuid default null
)
returns table (id_call uuid, id_lead uuid, lead_esistente boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
  v_ruolo public.app_role := public.current_role();
  v_setter uuid;
  v_handle text := nullif(ltrim(lower(trim(coalesce(p_instagram_handle, ''))), '@'), '');
  v_lead uuid;
  v_stato public.lead_status;
  v_esistente boolean := false;
  v_call uuid;
  -- Italian wall-clock time; Postgres handles DST
  v_programmata timestamptz := (p_data + p_ora) at time zone 'Europe/Rome';
  -- a call already held was booked on its day at the latest
  v_prenotata timestamptz := least(now(), v_programmata);
begin
  if v_ruolo = 'setter' then
    -- the setter books only for himself, whatever is passed
    v_setter := v_utente;
  elsif v_ruolo = 'admin' then
    v_setter := coalesce(p_setter_id, v_utente);
    if v_setter <> v_utente and not exists (
      select 1 from public.profiles p
      where p.id = v_setter
        and p.attivo
        and p.ruolo = 'setter'
    ) then
      raise exception 'Il setter scelto non è attivo o non è un setter'
        using errcode = '22023';
    end if;
  else
    raise exception 'Le call le fissano il setter e l''admin'
      using errcode = '42501';
  end if;

  if nullif(trim(p_nome), '') is null then
    raise exception 'Il nome del lead è obbligatorio' using errcode = '22023';
  end if;

  -- Whoever runs the call must be able to close it
  if not exists (
    select 1 from public.profiles p
    where p.id = p_closer_id
      and p.attivo
      and p.ruolo in ('admin', 'closer')
  ) then
    raise exception 'Il closer scelto non è attivo o non può chiudere'
      using errcode = '22023';
  end if;

  if v_handle is not null then
    v_handle := '@' || v_handle;

    -- Same person, second call: reuse the lead of the same setter
    select l.id, l.stato into v_lead, v_stato
    from public.leads l
    where l.setter_id = v_setter
      and lower(l.instagram_handle) = v_handle
    order by l.created_at desc
    limit 1;
  end if;

  if v_lead is null then
    insert into public.leads (nome, instagram_handle, setter_id, fonte, created_by, created_at)
    values (trim(p_nome), v_handle, v_setter, p_fonte, v_utente, v_prenotata)
    returning id into v_lead;
  else
    v_esistente := true;
    -- A lost lead that books again is back in play
    if v_stato = 'perso' then
      update public.leads set stato = 'call_fissata' where id = v_lead;
    end if;
  end if;

  insert into public.calls (
    lead_id, setter_id, closer_id, tipo, programmata_il, created_by, created_at
  )
  values (
    v_lead,
    v_setter,
    p_closer_id,
    p_tipo,
    v_programmata,
    v_utente,
    v_prenotata
  )
  returning id into v_call;

  return query select v_call, v_lead, v_esistente;
end;
$$;

comment on function public.fissa_call(text, public.lead_source, public.call_type, date, time, uuid, text, uuid) is
  'Books a call and creates (or reuses) its lead. Setter: always for himself. Admin: for himself or an active setter (p_setter_id). A call in the past is booked on its own time (created_at = least(now(), programmata_il)).';

-- ---------------------------------------------------------------------------
-- 2. By source: clients with no source count under 'altro'
-- ---------------------------------------------------------------------------
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
    -- a client with no source is 'altro': the sources add up to cash_nuovi_clienti
    (select coalesce(sum(p.importo_incassato), 0)::numeric(12, 2)
       from public.payments p
       join public.sales s on s.id = p.sale_id
       join public.clients cl on cl.id = s.client_id
      where coalesce(cl.fonte, 'altro') = f.fonte
        and s.tipo = 'nuovo' and s.data_vendita >= p_da
        and p.stato in ('incassata', 'rimborsata') and p.incassato_il between p_da and p_a) as cash,
    (select count(*)::integer
       from public.sales s
       join public.clients cl on cl.id = s.client_id
      where coalesce(cl.fonte, 'altro') = f.fonte and s.tipo = 'nuovo' and s.data_vendita between p_da and p_a) as nuovi,
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

comment on function public.metriche_per_fonte(date, date) is
  'By source over [p_da, p_a]: cash and count of the new clients of the period by clients.fonte (no source = altro, so the sources add up to cash_nuovi_clienti); leads, held calls, closes and close rate by leads.fonte. Admin only.';
