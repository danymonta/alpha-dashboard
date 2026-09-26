-- Commission rules, commission payouts and costs.
-- Kept in their own tables: RLS filters rows, not columns, so the percentage
-- must never sit on profiles (spec section 6).

create table public.commission_rules (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id),
  percentuale numeric(5, 4) not null check (percentuale >= 0 and percentuale <= 1),
  applica_a public.sale_type[] not null default '{nuovo}',
  valida_dal date not null,
  valida_al date,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commission_rules_periodo_valido
    check (valida_al is null or valida_al >= valida_dal)
);

create index commission_rules_profile_idx on public.commission_rules (profile_id);

create trigger commission_rules_set_updated_at
  before update on public.commission_rules
  for each row execute function public.set_updated_at();

create table public.commission_payouts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id),
  periodo date not null,
  importo numeric(12, 2) not null,
  pagato_il date not null,
  metodo public.payment_method,
  note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint commission_payouts_periodo_primo_del_mese
    check (periodo = date_trunc('month', periodo)::date)
);

create index commission_payouts_profile_periodo_idx
  on public.commission_payouts (profile_id, periodo);

create trigger commission_payouts_set_updated_at
  before update on public.commission_payouts
  for each row execute function public.set_updated_at();

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  categoria public.expense_category not null,
  descrizione text not null,
  importo numeric(12, 2) not null,
  ricorrente boolean not null default false,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index expenses_data_idx on public.expenses (data desc);

create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.commission_rules enable row level security;
alter table public.commission_payouts enable row level security;
alter table public.expenses enable row level security;

revoke all on public.commission_rules from anon;
revoke all on public.commission_payouts from anon;
revoke all on public.expenses from anon;

-- Rules are admin-only: a collaborator reads their accrued total through the
-- dedicated RPC, never the percentage table.
create policy commission_rules_all_admin
  on public.commission_rules for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy commission_payouts_all_admin
  on public.commission_payouts for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Everyone may read what was paid to them, and only to them.
create policy commission_payouts_select_own
  on public.commission_payouts for select
  to authenticated
  using (profile_id = (select auth.uid()));

create policy expenses_all_admin
  on public.expenses for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());
