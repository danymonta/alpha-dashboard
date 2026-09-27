-- The admin has full control (Dany, 28/09/2026):
-- 1. Custom sales: a path outside the catalogue ("Annuale" at 2.500 €) with its
--    own end date, and a hand-written instalment plan (3 × 500, then 3 × 333,33).
-- 2. Instalments can be added and deleted on a recorded sale.
-- 3. Every record can be deleted, people included. What a deletion takes with
--    it is shown first (anteprima_eliminazione) and done in one transaction.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
-- "2.500,00": amounts inside error messages read the Italian way
create or replace function public.euro_testo(p_importo numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select replace(replace(replace(to_char(p_importo, 'FM999G999G990D00'), ',', '#'), '.', ','), '#', '.') || ' €';
$$;

-- ---------------------------------------------------------------------------
-- 1. Custom sales
-- ---------------------------------------------------------------------------
alter table public.sales
  add column prodotto_personalizzato text
    constraint sales_prodotto_personalizzato_lunghezza
    check (prodotto_personalizzato is null or length(trim(prodotto_personalizzato)) between 1 and 120);

alter table public.sales
  add constraint sales_prodotto_o_personalizzato
  check (product_id is not null or prodotto_personalizzato is not null);

comment on column public.sales.prodotto_personalizzato is
  'What was sold when it is not a catalogue product (e.g. "Annuale"). The catalogue product wins when both are set.';

-- The automatic plan is skipped when the plan comes written by hand
create or replace function public.sales_genera_piano_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(current_setting('alpha.piano_personalizzato', true), '') = 'on' then
    return new;
  end if;

  insert into public.payments (
    sale_id, numero_rata, scadenza, importo_previsto, stato, created_by
  )
  select new.id, p.numero_rata, p.scadenza, p.importo, 'prevista', new.created_by
  from public.piano_rate(new.valore_contratto, new.numero_rate, new.data_vendita) p;

  return new;
end;
$$;

-- A hand-written plan must be complete and add up to the contract
create or replace function public.verifica_piano(p_rate jsonb, p_valore numeric)
returns void
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_totale numeric;
begin
  if p_rate is null or jsonb_typeof(p_rate) <> 'array' or jsonb_array_length(p_rate) = 0 then
    raise exception 'Aggiungi almeno una rata' using errcode = '22023';
  end if;
  if jsonb_array_length(p_rate) > 60 then
    raise exception 'Al massimo 60 rate' using errcode = '22023';
  end if;
  if exists (
    select 1 from jsonb_to_recordset(p_rate) as r(scadenza date, importo numeric)
    where r.scadenza is null or r.importo is null or r.importo <= 0
  ) then
    raise exception 'Ogni rata ha una data e un importo maggiore di zero' using errcode = '22023';
  end if;

  select round(sum(r.importo), 2) into v_totale
  from jsonb_to_recordset(p_rate) as r(scadenza date, importo numeric);

  if v_totale <> round(p_valore, 2) then
    raise exception 'Le rate sommano %, il contratto vale %: devono coincidere',
      public.euro_testo(v_totale), public.euro_testo(p_valore)
      using errcode = '22023';
  end if;
end;
$$;

-- Sum of a plan being typed, for the form: the total is computed here, not in the browser
create or replace function public.anteprima_piano(p_rate jsonb, p_valore numeric)
returns table (numero_rate integer, totale numeric, scarto numeric)
language sql
immutable
set search_path = ''
as $$
  select count(*)::integer,
         coalesce(round(sum(r.importo), 2), 0),
         round(coalesce(p_valore, 0) - coalesce(sum(r.importo), 0), 2)
  from jsonb_to_recordset(coalesce(p_rate, '[]'::jsonb)) as r(scadenza date, importo numeric)
  where r.importo is not null;
$$;

-- The hand-written plan of a sale just created. security definer because a
-- closer may create a sale but not write payments: allowed only on a sale the
-- caller created that has no instalments yet.
create or replace function public.inserisci_piano(p_sale_id uuid, p_rate jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.sales s
    where s.id = p_sale_id
      and (s.created_by = (select auth.uid()) or public.is_admin())
  ) then
    raise exception 'Vendita non trovata' using errcode = '42501';
  end if;
  if exists (select 1 from public.payments p where p.sale_id = p_sale_id) then
    raise exception 'La vendita ha già un piano rate' using errcode = '22023';
  end if;

  insert into public.payments (sale_id, numero_rata, scadenza, importo_previsto, stato, created_by)
  select p_sale_id, row_number() over (order by r.scadenza, r.ordine), r.scadenza, round(r.importo, 2), 'prevista', (select auth.uid())
  from rows from (jsonb_to_recordset(p_rate) as (scadenza date, importo numeric)) with ordinality as r(scadenza, importo, ordine);
end;
$$;

revoke all on function public.inserisci_piano(uuid, jsonb) from public, anon;
grant execute on function public.inserisci_piano(uuid, jsonb) to authenticated;
grant execute on function public.anteprima_piano(jsonb, numeric) to authenticated;

drop function public.registra_vendita(
  uuid, public.sale_type, date, date, numeric, integer, uuid, uuid, text, text, text, text, text, text
);

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
    coalesce(v_call_setter, v_cliente_setter),
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

-- ---------------------------------------------------------------------------
-- 2. Instalments on a recorded sale (admin)
-- ---------------------------------------------------------------------------
-- 1, 2, 3… by due date. Sales with refunds keep their numbers: a refund points
-- to its instalment by number.
create or replace function public.rinumera_rate(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.sales s
  set numero_rate = greatest(1, (select count(*) from public.payments p where p.sale_id = p_sale_id and p.stato <> 'rimborsata'))
  where s.id = p_sale_id;

  if exists (select 1 from public.payments p where p.sale_id = p_sale_id and p.stato = 'rimborsata') then
    return;
  end if;

  -- two steps: the unique index on (sale_id, numero_rata) is checked row by row
  update public.payments set numero_rata = numero_rata + 1000 where sale_id = p_sale_id;
  update public.payments p
  set numero_rata = x.n
  from (
    select id, row_number() over (order by scadenza, numero_rata) as n
    from public.payments where sale_id = p_sale_id
  ) x
  where p.id = x.id;
end;
$$;

revoke all on function public.rinumera_rate(uuid) from public, anon, authenticated;

create or replace function public.aggiungi_rata(p_sale_id uuid, p_scadenza date, p_importo numeric)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Il piano rate lo modifica l''admin' using errcode = '42501';
  end if;
  if p_scadenza is null or p_importo is null or p_importo <= 0 then
    raise exception 'Scrivi la scadenza e un importo maggiore di zero' using errcode = '22023';
  end if;
  if not exists (select 1 from public.sales s where s.id = p_sale_id) then
    raise exception 'Vendita non trovata' using errcode = '22023';
  end if;

  insert into public.payments (sale_id, numero_rata, scadenza, importo_previsto, stato, created_by)
  select p_sale_id, coalesce(max(p.numero_rata), 0) + 1, p_scadenza, round(p_importo, 2), 'prevista', (select auth.uid())
  from public.payments p where p.sale_id = p_sale_id
  returning id into v_id;

  perform public.rinumera_rate(p_sale_id);
  return v_id;
end;
$$;

create or replace function public.elimina_rata(p_payment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale uuid;
begin
  if not public.is_admin() then
    raise exception 'Il piano rate lo modifica l''admin' using errcode = '42501';
  end if;
  select p.sale_id into v_sale from public.payments p where p.id = p_payment_id;
  if v_sale is null then
    raise exception 'Rata non trovata' using errcode = '22023';
  end if;
  if (select count(*) from public.payments p where p.sale_id = v_sale and p.stato <> 'rimborsata') <= 1
     and exists (select 1 from public.payments p where p.id = p_payment_id and p.stato <> 'rimborsata') then
    raise exception 'È l''ultima rata: per togliere tutto elimina la vendita' using errcode = '22023';
  end if;

  delete from public.payments where id = p_payment_id;
  perform public.rinumera_rate(v_sale);
end;
$$;

revoke all on function public.aggiungi_rata(uuid, date, numeric) from public, anon;
revoke all on function public.elimina_rata(uuid) from public, anon;
grant execute on function public.aggiungi_rata(uuid, date, numeric) to authenticated;
grant execute on function public.elimina_rata(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Deleting, with a preview of what goes with it (admin)
-- ---------------------------------------------------------------------------
-- The admin may change who wrote a task while deleting a person
create or replace function public.pm_task_autore()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
  elsif (new.created_by is distinct from old.created_by or new.progetto_id is distinct from old.progetto_id)
        and not public.is_admin() then
    raise exception 'Autore e progetto di un task non si cambiano' using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function public.anteprima_eliminazione(p_tipo text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo l''admin elimina' using errcode = '42501';
  end if;

  case p_tipo
    when 'persona' then
      return jsonb_build_object(
        'report', (select count(*) from public.setter_daily_reports where setter_id = p_id),
        'regole', (select count(*) from public.commission_rules where profile_id = p_id),
        'pagamenti_provvigioni', (select count(*) from public.commission_payouts where profile_id = p_id),
        'vendite', (select count(*) from public.sales where setter_id = p_id or closer_id = p_id),
        'call', (select count(*) from public.calls where setter_id = p_id or closer_id = p_id),
        'lead', (select count(*) from public.leads where setter_id = p_id),
        'progetti', (select count(*) from public.pm_membri where profile_id = p_id),
        'voci_tempo', (select count(*) from public.pm_tempo where profile_id = p_id),
        'note', (select count(*) from public.pm_note where autore_id = p_id)
      );
    when 'cliente' then
      return jsonb_build_object(
        'vendite', (select count(*) from public.sales where client_id = p_id),
        'rate', (select count(*) from public.payments p join public.sales s on s.id = p.sale_id where s.client_id = p_id),
        'incassato', (
          select public.euro_testo(coalesce(sum(p.importo_incassato), 0))
          from public.payments p join public.sales s on s.id = p.sale_id
          where s.client_id = p_id and p.importo_incassato is not null
        )
      );
    when 'vendita' then
      return jsonb_build_object(
        'rate', (select count(*) from public.payments where sale_id = p_id),
        'rate_incassate', (select count(*) from public.payments where sale_id = p_id and stato = 'incassata'),
        'incassato', (
          select public.euro_testo(coalesce(sum(importo_incassato), 0))
          from public.payments where sale_id = p_id and importo_incassato is not null
        )
      );
    when 'lead' then
      return jsonb_build_object(
        'call', (select count(*) from public.calls where lead_id = p_id),
        'clienti_collegati', (select count(*) from public.clients where lead_id = p_id)
      );
    when 'prodotto' then
      return jsonb_build_object(
        'vendite', (select count(*) from public.sales where product_id = p_id),
        'call', (select count(*) from public.calls where prodotto_proposto_id = p_id)
      );
    when 'reparto' then
      return jsonb_build_object(
        'progetti', (select count(*) from public.pm_progetti where reparto_id = p_id),
        'modelli', (select count(*) from public.pm_modelli where reparto_id = p_id)
      );
    else
      raise exception 'Tipo non valido' using errcode = '22023';
  end case;
end;
$$;

create or replace function public.elimina_cliente(p_client_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo l''admin elimina' using errcode = '42501';
  end if;
  delete from public.sales where client_id = p_client_id;   -- instalments go with them
  delete from public.clients where id = p_client_id;
end;
$$;

create or replace function public.elimina_lead(p_lead_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo l''admin elimina' using errcode = '42501';
  end if;
  -- sales and clients stay: they only lose the link to the call and the lead
  update public.sales set call_id = null where call_id in (select id from public.calls where lead_id = p_lead_id);
  update public.clients set lead_id = null where lead_id = p_lead_id;
  delete from public.leads where id = p_lead_id;               -- calls go with it
end;
$$;

create or replace function public.elimina_call(p_call_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo l''admin elimina' using errcode = '42501';
  end if;
  update public.sales set call_id = null where call_id = p_call_id;
  delete from public.calls where id = p_call_id;
end;
$$;

create or replace function public.elimina_prodotto(p_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo l''admin elimina' using errcode = '42501';
  end if;
  -- past sales keep the name of what was sold
  update public.sales s
  set prodotto_personalizzato = coalesce(s.prodotto_personalizzato, p.nome), product_id = null
  from public.products p
  where p.id = p_product_id and s.product_id = p_product_id;
  update public.calls set prodotto_proposto_id = null where prodotto_proposto_id = p_product_id;
  delete from public.products where id = p_product_id;
end;
$$;

-- A person leaves for good: their own records go, every other link is emptied,
-- then the account itself is removed (they cannot sign in again unless invited).
create or replace function public.elimina_persona(p_profile_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
  r record;
begin
  if not public.is_admin() then
    raise exception 'Solo l''admin elimina' using errcode = '42501';
  end if;
  if p_profile_id = (select auth.uid()) then
    raise exception 'Non puoi eliminare il tuo account' using errcode = '42501';
  end if;
  select p.email into v_email from public.profiles p where p.id = p_profile_id;
  if v_email is null then
    raise exception 'Persona non trovata' using errcode = '22023';
  end if;

  delete from public.setter_daily_reports where setter_id = p_profile_id;
  delete from public.commission_rules where profile_id = p_profile_id;
  delete from public.commission_payouts where profile_id = p_profile_id;

  -- every other column pointing to the person (setter, closer, author, assignee…)
  for r in
    select c.conrelid::regclass as tabella, a.attname as colonna
    from pg_constraint c
    join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.contype = 'f'
      and c.confrelid = 'public.profiles'::regclass
      and c.confdeltype in ('a', 'r')
  loop
    execute format('update %s set %I = null where %I = $1', r.tabella, r.colonna, r.colonna) using p_profile_id;
  end loop;

  delete from public.invites where email = lower(v_email);
  delete from auth.users where id = p_profile_id;              -- the profile, memberships, time and notes go with it
end;
$$;

revoke all on function public.anteprima_eliminazione(text, uuid) from public, anon;
revoke all on function public.elimina_cliente(uuid) from public, anon;
revoke all on function public.elimina_lead(uuid) from public, anon;
revoke all on function public.elimina_call(uuid) from public, anon;
revoke all on function public.elimina_prodotto(uuid) from public, anon;
revoke all on function public.elimina_persona(uuid) from public, anon;
grant execute on function public.anteprima_eliminazione(text, uuid) to authenticated;
grant execute on function public.elimina_cliente(uuid) to authenticated;
grant execute on function public.elimina_lead(uuid) to authenticated;
grant execute on function public.elimina_call(uuid) to authenticated;
grant execute on function public.elimina_prodotto(uuid) to authenticated;
grant execute on function public.elimina_persona(uuid) to authenticated;
