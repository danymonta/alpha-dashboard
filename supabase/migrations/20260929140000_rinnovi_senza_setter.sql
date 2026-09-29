-- Renewals and upsells have no setter (Dany, 29/09/2026): "le call di rinnovo le
-- registro io come nuova vendita ma senza passare dal setter, siccome non c'è un
-- setter"; the setter's numbers are about the new clients he brought, not about
-- clients who are already in. registra_vendita copied the client's setter onto
-- every later sale of that client; now only a new sale (or one from a booked
-- call) takes a setter. The setter never sees a renewal or an upsell in «I tuoi
-- clienti» and no commission can mature on it. Existing sales are untouched:
-- their setter can still be changed from the sale.
-- Same signature as 20260928150000: create or replace.

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
  p_note text default null,
  p_prodotto_personalizzato text default null,
  p_data_fine date default null,
  p_rate jsonb default null
)
returns table (id_vendita uuid, id_cliente uuid, cliente_nuovo boolean)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
  v_ruolo public.app_role := public.current_role();
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
  v_personalizzato text := nullif(trim(p_prodotto_personalizzato), '');
begin
  if v_ruolo is distinct from 'admin' and v_ruolo is distinct from 'closer' then
    raise exception 'Le vendite le registra chi le chiude' using errcode = '42501';
  end if;

  -- what was sold: a catalogue product, or a path written by hand with its end
  if p_product_id is null and v_personalizzato is null then
    raise exception 'Scegli un prodotto del catalogo o scrivi il percorso personalizzato' using errcode = '22023';
  end if;
  if p_product_id is null and p_data_fine is null then
    raise exception 'Per un percorso personalizzato indica quando finisce' using errcode = '22023';
  end if;
  if p_data_fine is not null and p_data_fine < p_data_inizio then
    raise exception 'La fine del percorso viene dopo l''inizio' using errcode = '22023';
  end if;
  if p_rate is not null then
    perform public.verifica_piano(p_rate, p_valore_contratto);
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

  -- a hand-written plan replaces the automatic one
  if p_rate is not null then
    perform set_config('alpha.piano_personalizzato', 'on', true);
  end if;

  insert into public.sales (
    client_id, product_id, prodotto_personalizzato, tipo, call_id, setter_id, closer_id,
    data_vendita, data_inizio, data_fine, valore_contratto, numero_rate, note, created_by
  )
  values (
    v_cliente,
    p_product_id,
    v_personalizzato,
    p_tipo,
    p_call_id,
    -- renewals and upsells are the admin's own, without a setter (Dany, 29/09/2026):
    -- only a new sale (or one from a booked call) takes the setter of the client
    case when p_tipo = 'nuovo' then coalesce(v_call_setter, v_cliente_setter) else v_call_setter end,
    coalesce(v_call_closer, v_utente),
    p_data_vendita,
    p_data_inizio,
    p_data_fine,
    p_valore_contratto,
    case when p_rate is not null then jsonb_array_length(p_rate) else p_numero_rate end,
    nullif(trim(p_note), ''),
    v_utente
  )
  returning id into v_vendita;

  if p_rate is not null then
    perform set_config('alpha.piano_personalizzato', 'off', true);
    perform public.inserisci_piano(v_vendita, p_rate);
  end if;

  return query select v_vendita, v_cliente, v_nuovo;
end;
$$;

revoke all on function public.registra_vendita(
  uuid, public.sale_type, date, date, numeric, integer, uuid, uuid, text, text, text, text, text, text, text, date, jsonb
) from public, anon;
grant execute on function public.registra_vendita(
  uuid, public.sale_type, date, date, numeric, integer, uuid, uuid, text, text, text, text, text, text, text, date, jsonb
) to authenticated;
