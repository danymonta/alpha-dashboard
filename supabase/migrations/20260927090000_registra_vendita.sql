-- Nuova vendita.
-- 1. piano_rate: the single implementation of the instalment split, used by the
--    form preview and by the trigger, so the preview can never lie.
-- 2. registra_vendita: client (new or existing) and sale in one transaction.
-- 3. one closed call, one sale: a double tap must not create two sales.

create or replace function public.piano_rate(
  p_valore numeric,
  p_numero_rate integer,
  p_data_vendita date
)
returns table (numero_rata integer, scadenza date, importo numeric)
language sql
immutable
set search_path = ''
as $$
  select
    i,
    (p_data_vendita + (interval '1 month' * (i - 1)))::date,
    case
      when i < p_numero_rate then round(p_valore / p_numero_rate, 2)
      -- the last instalment absorbs the rounding
      else p_valore - round(p_valore / p_numero_rate, 2) * (p_numero_rate - 1)
    end::numeric(12, 2)
  from generate_series(1, greatest(p_numero_rate, 1)) as i;
$$;

comment on function public.piano_rate(numeric, integer, date) is
  'Monthly instalments, equal amounts, last one absorbs rounding. Used by the sales trigger and the form preview.';

revoke all on function public.piano_rate(numeric, integer, date) from public, anon;
grant execute on function public.piano_rate(numeric, integer, date) to authenticated;

-- Same behaviour as before, now built on piano_rate
create or replace function public.sales_genera_piano_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.payments (
    sale_id, numero_rata, scadenza, importo_previsto, stato, created_by
  )
  select new.id, p.numero_rata, p.scadenza, p.importo, 'prevista', new.created_by
  from public.piano_rate(new.valore_contratto, new.numero_rate, new.data_vendita) p;

  return new;
end;
$$;

create unique index sales_una_per_call on public.sales (call_id) where call_id is not null;

create or replace function public.registra_vendita(
  p_product_id uuid,
  p_tipo public.sale_type,
  p_data_vendita date,
  p_data_inizio date,
  p_valore_contratto numeric,
  p_numero_rate integer,
  p_call_id uuid default null,
  p_client_id uuid default null,
  p_nome text default null,
  p_cognome text default null,
  p_email text default null,
  p_telefono text default null,
  p_instagram_handle text default null,
  p_note text default null
)
returns table (id_vendita uuid, id_cliente uuid, cliente_nuovo boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
  v_ruolo public.app_role := public.current_role();
  -- scalars, not a record: an unassigned record cannot be read when there is no call
  v_lead uuid;
  v_call_setter uuid;
  v_call_closer uuid;
  v_call_esito public.call_outcome;
  v_lead_fonte public.lead_source;
  v_lead_handle text;
  v_cliente uuid := p_client_id;
  v_cliente_setter uuid;
  v_nuovo boolean := false;
  v_fonte public.lead_source;
  v_vendita uuid;
begin
  if v_ruolo is distinct from 'admin' and v_ruolo is distinct from 'closer' then
    raise exception 'Le vendite le registra chi le chiude' using errcode = '42501';
  end if;

  if p_call_id is not null then
    select c.lead_id, c.setter_id, c.closer_id, c.esito, l.fonte, l.instagram_handle
      into v_lead, v_call_setter, v_call_closer, v_call_esito, v_lead_fonte, v_lead_handle
    from public.calls c
    join public.leads l on l.id = c.lead_id
    where c.id = p_call_id;

    if not found then
      raise exception 'Call non trovata o non assegnata a te' using errcode = '22023';
    end if;
    if v_call_esito is distinct from 'chiusa' then
      raise exception 'La call non risulta chiusa: registra prima l''esito' using errcode = '22023';
    end if;
    if exists (select 1 from public.sales s where s.call_id = p_call_id) then
      raise exception 'Questa call ha già una vendita registrata' using errcode = '23505';
    end if;

    -- the lead may already be a client (e.g. a second product)
    if v_cliente is null then
      select cl.id into v_cliente
      from public.clients cl
      where cl.lead_id = v_lead
      order by cl.created_at
      limit 1;
    end if;
  end if;

  if v_cliente is null then
    if nullif(trim(p_nome), '') is null then
      raise exception 'Il nome del cliente è obbligatorio' using errcode = '22023';
    end if;
    if p_tipo <> 'nuovo' then
      raise exception 'Un cliente nuovo parte da una vendita di tipo nuovo' using errcode = '22023';
    end if;

    v_fonte := coalesce(v_lead_fonte, 'altro');

    insert into public.clients (
      lead_id, nome, cognome, email, telefono, instagram_handle, fonte,
      setter_id, closer_id, created_by
    )
    values (
      v_lead,
      trim(p_nome),
      nullif(trim(p_cognome), ''),
      nullif(lower(trim(p_email)), ''),
      nullif(trim(p_telefono), ''),
      coalesce(nullif(lower(trim(p_instagram_handle)), ''), v_lead_handle),
      v_fonte,
      v_call_setter,
      coalesce(v_call_closer, v_utente),
      v_utente
    )
    returning id into v_cliente;

    v_nuovo := true;
  end if;

  select cl.setter_id into v_cliente_setter from public.clients cl where cl.id = v_cliente;
  if not found then
    raise exception 'Cliente non trovato' using errcode = '22023';
  end if;

  insert into public.sales (
    client_id, product_id, tipo, call_id, setter_id, closer_id,
    data_vendita, data_inizio, valore_contratto, numero_rate, note, created_by
  )
  values (
    v_cliente,
    p_product_id,
    p_tipo,
    p_call_id,
    -- who brought the client: the call's setter, otherwise the client's
    coalesce(v_call_setter, v_cliente_setter),
    coalesce(v_call_closer, v_utente),
    p_data_vendita,
    p_data_inizio,
    p_valore_contratto,
    p_numero_rate,
    nullif(trim(p_note), ''),
    v_utente
  )
  returning id into v_vendita;

  return query select v_vendita, v_cliente, v_nuovo;
end;
$$;

revoke all on function public.registra_vendita(
  uuid, public.sale_type, date, date, numeric, integer, uuid, uuid, text, text, text, text, text, text
) from public, anon;

grant execute on function public.registra_vendita(
  uuid, public.sale_type, date, date, numeric, integer, uuid, uuid, text, text, text, text, text, text
) to authenticated;
