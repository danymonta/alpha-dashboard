-- Registrazione incasso.
-- v_vendite: per-sale money summary, computed in SQL (never in TypeScript).
-- segna_rata_incassata: one tap, today and the planned amount as defaults.
-- registra_rimborso: a refund is its own negative row (admin only).
-- guard: the closer records cash, the plan itself is the admin's.

create view public.v_vendite
with (security_invoker = true)
as
select
  s.id as sale_id,
  s.client_id,
  s.product_id,
  s.tipo,
  s.call_id,
  s.setter_id,
  s.closer_id,
  s.data_vendita,
  s.data_inizio,
  s.data_fine,
  s.valore_contratto,
  s.numero_rate,
  coalesce(sum(p.importo_previsto) filter (where p.stato <> 'rimborsata'), 0)::numeric(12, 2)
    as totale_piano,
  (s.valore_contratto
    - coalesce(sum(p.importo_previsto) filter (where p.stato <> 'rimborsata'), 0))::numeric(12, 2)
    as scarto_piano,
  -- net of refunds (refund rows carry a negative amount)
  coalesce(sum(p.importo_incassato) filter (where p.stato in ('incassata', 'rimborsata')), 0)::numeric(12, 2)
    as incassato,
  coalesce(sum(p.importo_previsto) filter (where p.stato = 'prevista'), 0)::numeric(12, 2)
    as da_incassare,
  coalesce(sum(p.importo_previsto) filter (where p.stato = 'prevista' and p.scadenza < public.oggi()), 0)::numeric(12, 2)
    as in_ritardo,
  count(p.id) filter (where p.stato <> 'rimborsata')::integer as rate_totali,
  count(p.id) filter (where p.stato = 'incassata')::integer as rate_incassate,
  count(p.id) filter (where p.stato = 'prevista' and p.scadenza < public.oggi())::integer
    as rate_in_ritardo,
  min(p.scadenza) filter (where p.stato = 'prevista') as prossima_scadenza
from public.sales s
left join public.payments p on p.sale_id = s.id
group by s.id;

revoke all on public.v_vendite from anon;

comment on view public.v_vendite is
  'Per-sale money summary: plan total, gap with the contract, cash in (net of refunds), still due, overdue.';

-- ---------------------------------------------------------------------------
-- One tap: "Segna rata incassata"
-- ---------------------------------------------------------------------------
create or replace function public.segna_rata_incassata(
  p_payment_id uuid,
  p_incassato_il date default null,
  p_importo numeric default null,
  p_metodo public.payment_method default null
)
returns table (importo_registrato numeric, data_registrata date, rata integer)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_importo numeric(12, 2);
  v_data date;
  v_rata integer;
begin
  if p_incassato_il is not null and p_incassato_il > public.oggi() then
    raise exception 'Un incasso non può essere nel futuro' using errcode = '22023';
  end if;

  update public.payments p
  set stato = 'incassata',
      incassato_il = coalesce(p_incassato_il, public.oggi()),
      importo_incassato = coalesce(p_importo, p.importo_previsto),
      metodo = p_metodo
  where p.id = p_payment_id
    and p.stato in ('prevista', 'fallita')
  returning p.importo_incassato, p.incassato_il, p.numero_rata
    into v_importo, v_data, v_rata;

  if not found then
    raise exception 'Rata non trovata, non tua o già incassata' using errcode = '22023';
  end if;

  return query select v_importo, v_data, v_rata;
end;
$$;

revoke all on function public.segna_rata_incassata(uuid, date, numeric, public.payment_method)
  from public, anon;
grant execute on function public.segna_rata_incassata(uuid, date, numeric, public.payment_method)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Refund: a new negative row, so the original month keeps its cash and the
-- refund month carries the negative (commission included). Admin only.
-- ---------------------------------------------------------------------------
create or replace function public.registra_rimborso(
  p_payment_id uuid,
  p_data date,
  p_importo numeric,
  p_note text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_originale public.payments;
  v_gia_rimborsato numeric(12, 2);
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'I rimborsi li registra l''admin' using errcode = '42501';
  end if;

  select * into v_originale from public.payments p where p.id = p_payment_id;
  if not found or v_originale.stato <> 'incassata' then
    raise exception 'Si rimborsa solo una rata incassata' using errcode = '22023';
  end if;

  if p_importo is null or p_importo <= 0 then
    raise exception 'L''importo del rimborso deve essere positivo' using errcode = '22023';
  end if;

  select coalesce(-sum(p.importo_incassato), 0) into v_gia_rimborsato
  from public.payments p
  where p.sale_id = v_originale.sale_id
    and p.numero_rata = v_originale.numero_rata
    and p.stato = 'rimborsata';

  if p_importo + v_gia_rimborsato > v_originale.importo_incassato then
    raise exception 'Il rimborso supera quanto incassato per questa rata' using errcode = '22023';
  end if;

  if p_data is null or p_data > public.oggi() or p_data < v_originale.incassato_il then
    raise exception 'Data del rimborso non valida' using errcode = '22023';
  end if;

  insert into public.payments (
    sale_id, numero_rata, scadenza, importo_previsto, incassato_il,
    importo_incassato, metodo, stato, note, created_by
  )
  values (
    v_originale.sale_id, v_originale.numero_rata, v_originale.scadenza, 0, p_data,
    -p_importo, v_originale.metodo, 'rimborsata', nullif(trim(p_note), ''), (select auth.uid())
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.registra_rimborso(uuid, date, numeric, text) from public, anon;
grant execute on function public.registra_rimborso(uuid, date, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- The closer's update policy on payments is row-level: this trigger narrows it
-- to the cash-in columns. Due dates and planned amounts belong to the admin.
-- ---------------------------------------------------------------------------
create or replace function public.guard_payments_closer()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.current_role() = 'closer' and (
       new.sale_id is distinct from old.sale_id
    or new.numero_rata is distinct from old.numero_rata
    or new.scadenza is distinct from old.scadenza
    or new.importo_previsto is distinct from old.importo_previsto
    or new.stato = 'rimborsata'
  ) then
    raise exception 'Il piano rate lo modifica l''admin: tu registri gli incassi'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger payments_guard_closer
  before update on public.payments
  for each row execute function public.guard_payments_closer();
