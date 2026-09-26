-- Clients, products, sales and the instalment plan.
-- `clients` is shared with the future time-tracking area: never duplicate it.

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads (id),
  nome text not null,
  cognome text,
  email text,
  telefono text,
  instagram_handle text,
  fonte public.lead_source,
  setter_id uuid references public.profiles (id),
  closer_id uuid references public.profiles (id),
  note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index clients_setter_idx on public.clients (setter_id);
create index clients_closer_idx on public.clients (closer_id);
create index clients_lead_idx on public.clients (lead_id);

create trigger clients_set_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

create table public.products (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  durata_mesi integer not null check (durata_mesi > 0),
  prezzo_listino numeric(12, 2) not null check (prezzo_listino >= 0),
  attivo boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id),
  product_id uuid references public.products (id),
  tipo public.sale_type not null,
  call_id uuid references public.calls (id),
  setter_id uuid references public.profiles (id),
  closer_id uuid references public.profiles (id),
  data_vendita date not null,
  data_inizio date not null,
  data_fine date not null,
  valore_contratto numeric(12, 2) not null check (valore_contratto >= 0),
  numero_rate integer not null default 1 check (numero_rate >= 1),
  note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sales_periodo_valido check (data_fine >= data_inizio)
);

create index sales_client_idx on public.sales (client_id);
create index sales_data_vendita_idx on public.sales (data_vendita desc);
create index sales_data_fine_idx on public.sales (data_fine);
create index sales_closer_idx on public.sales (closer_id);
create index sales_setter_idx on public.sales (setter_id);

create trigger sales_set_updated_at
  before update on public.sales
  for each row execute function public.set_updated_at();

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  sale_id uuid not null references public.sales (id) on delete cascade,
  numero_rata integer not null check (numero_rata >= 1),
  scadenza date not null,
  importo_previsto numeric(12, 2) not null,
  incassato_il date,
  importo_incassato numeric(12, 2),
  metodo public.payment_method,
  stato public.payment_status not null default 'prevista',
  note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A cashed instalment carries a date and an amount; a refund is a separate
  -- row with a negative amount, so the original month keeps its cash.
  constraint payments_incasso_coerente check (
    case stato
      when 'incassata' then
        incassato_il is not null and importo_incassato is not null and importo_incassato > 0
      when 'rimborsata' then
        incassato_il is not null and importo_incassato is not null and importo_incassato < 0
      else
        incassato_il is null and importo_incassato is null
    end
  )
);

-- One row per instalment number, refunds excluded from the uniqueness.
create unique index payments_rata_unica
  on public.payments (sale_id, numero_rata)
  where stato <> 'rimborsata';

create index payments_scadenza_idx on public.payments (scadenza);
create index payments_incassato_il_idx on public.payments (incassato_il);
create index payments_sale_idx on public.payments (sale_id);
create index payments_stato_idx on public.payments (stato);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Sale rules: end date, renewal check, automatic instalment plan.
-- ---------------------------------------------------------------------------

-- data_fine defaults to the product duration from data_inizio.
create or replace function public.sales_fill_data_fine()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_durata integer;
begin
  if new.data_fine is null then
    select p.durata_mesi into v_durata
    from public.products p
    where p.id = new.product_id;

    new.data_fine := (new.data_inizio + (interval '1 month' * coalesce(v_durata, 1)))::date - 1;
  end if;
  return new;
end;
$$;

create trigger sales_fill_data_fine
  before insert on public.sales
  for each row execute function public.sales_fill_data_fine();

create or replace function public.sales_check_rinnovo()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tipo = 'rinnovo' and not exists (
    select 1 from public.sales s
    where s.client_id = new.client_id
      and s.id <> new.id
      and s.data_vendita <= new.data_vendita
  ) then
    raise exception 'Un rinnovo richiede almeno una vendita precedente per il cliente'
      using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger sales_check_rinnovo
  before insert or update of tipo, client_id on public.sales
  for each row execute function public.sales_check_rinnovo();

-- Instalment plan: equal amounts, the last one absorbs the rounding.
-- security definer so the plan is created even when the closer inserts a sale.
create or replace function public.sales_genera_piano_rate()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rata numeric(12, 2);
  v_assegnato numeric(12, 2) := 0;
  v_importo numeric(12, 2);
  v_i integer;
begin
  v_rata := round(new.valore_contratto / new.numero_rate, 2);

  for v_i in 1..new.numero_rate loop
    if v_i < new.numero_rate then
      v_importo := v_rata;
      v_assegnato := v_assegnato + v_rata;
    else
      v_importo := new.valore_contratto - v_assegnato;
    end if;

    insert into public.payments (
      sale_id, numero_rata, scadenza, importo_previsto, stato, created_by
    )
    values (
      new.id,
      v_i,
      (new.data_vendita + (interval '1 month' * (v_i - 1)))::date,
      v_importo,
      'prevista',
      new.created_by
    );
  end loop;

  return new;
end;
$$;

create trigger sales_genera_piano_rate
  after insert on public.sales
  for each row execute function public.sales_genera_piano_rate();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.clients enable row level security;
alter table public.products enable row level security;
alter table public.sales enable row level security;
alter table public.payments enable row level security;

revoke all on public.clients from anon;
revoke all on public.products from anon;
revoke all on public.sales from anon;
revoke all on public.payments from anon;

create policy clients_all_admin
  on public.clients for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- The closer sees the clients born from their own calls.
-- The setter has NO row access here (contacts live on this row): they read
-- name and status through public.miei_clienti().
create policy clients_select_own_closer
  on public.clients for select
  to authenticated
  using (
    public.current_role() = 'closer'
    and (
      closer_id = (select auth.uid())
      or exists (
        select 1 from public.calls c
        where c.lead_id = clients.lead_id
          and c.closer_id = (select auth.uid())
      )
    )
  );

create policy clients_insert_own_closer
  on public.clients for insert
  to authenticated
  with check (
    public.current_role() = 'closer'
    and closer_id = (select auth.uid())
  );

create policy products_select_authenticated
  on public.products for select
  to authenticated
  using (public.current_role() is not null);

create policy products_write_admin
  on public.products for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy sales_all_admin
  on public.sales for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy sales_select_own_closer
  on public.sales for select
  to authenticated
  using (
    public.current_role() = 'closer'
    and closer_id = (select auth.uid())
  );

create policy sales_insert_own_closer
  on public.sales for insert
  to authenticated
  with check (
    public.current_role() = 'closer'
    and closer_id = (select auth.uid())
  );

create policy payments_all_admin
  on public.payments for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy payments_select_own_closer
  on public.payments for select
  to authenticated
  using (
    public.current_role() = 'closer'
    and exists (
      select 1 from public.sales s
      where s.id = payments.sale_id
        and s.closer_id = (select auth.uid())
    )
  );

-- The closer may register the cash-in of their own sales, nothing else.
create policy payments_update_own_closer
  on public.payments for update
  to authenticated
  using (
    public.current_role() = 'closer'
    and exists (
      select 1 from public.sales s
      where s.id = payments.sale_id
        and s.closer_id = (select auth.uid())
    )
  )
  with check (
    public.current_role() = 'closer'
    and exists (
      select 1 from public.sales s
      where s.id = payments.sale_id
        and s.closer_id = (select auth.uid())
    )
  );
