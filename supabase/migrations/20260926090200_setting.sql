-- Setting: the setter's daily self-declared numbers, and the leads they book.

create table public.setter_daily_reports (
  id uuid primary key default gen_random_uuid(),
  setter_id uuid not null references public.profiles (id),
  data date not null,
  dm_outbound integer not null default 0 check (dm_outbound >= 0),
  dm_inbound integer not null default 0 check (dm_inbound >= 0),
  conversazioni integer not null default 0 check (conversazioni >= 0),
  call_proposte integer not null default 0 check (call_proposte >= 0),
  discovery_prenotate integer not null default 0 check (discovery_prenotate >= 0),
  discovery_svolte integer not null default 0 check (discovery_svolte >= 0),
  call_qualificate integer not null default 0 check (call_qualificate >= 0),
  strategy_prenotate integer not null default 0 check (strategy_prenotate >= 0),
  follow_up integer not null default 0 check (follow_up >= 0),
  contenuto_pubblicato boolean not null default false,
  note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (setter_id, data)
);

create index setter_daily_reports_data_idx on public.setter_daily_reports (data desc);

create trigger setter_daily_reports_set_updated_at
  before update on public.setter_daily_reports
  for each row execute function public.set_updated_at();

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  instagram_handle text,
  setter_id uuid references public.profiles (id),
  fonte public.lead_source not null default 'dm_inbound',
  stato public.lead_status not null default 'call_fissata',
  note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index leads_setter_idx on public.leads (setter_id);

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.setter_daily_reports enable row level security;
alter table public.leads enable row level security;

revoke all on public.setter_daily_reports from anon;
revoke all on public.leads from anon;

create policy setter_daily_reports_all_admin
  on public.setter_daily_reports for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy setter_daily_reports_select_own
  on public.setter_daily_reports for select
  to authenticated
  using (
    public.current_role() = 'setter'
    and setter_id = (select auth.uid())
  );

-- A setter may only write their own report, and only inside the last 7 days:
-- the daily report is a self-declaration, not a retroactive ledger.
create policy setter_daily_reports_insert_own_recent
  on public.setter_daily_reports for insert
  to authenticated
  with check (
    public.current_role() = 'setter'
    and setter_id = (select auth.uid())
    and data between public.oggi() - 7 and public.oggi()
  );

create policy setter_daily_reports_update_own_recent
  on public.setter_daily_reports for update
  to authenticated
  using (
    public.current_role() = 'setter'
    and setter_id = (select auth.uid())
    and data between public.oggi() - 7 and public.oggi()
  )
  with check (
    public.current_role() = 'setter'
    and setter_id = (select auth.uid())
    and data between public.oggi() - 7 and public.oggi()
  );

create policy leads_all_admin
  on public.leads for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy leads_select_own_setter
  on public.leads for select
  to authenticated
  using (
    public.current_role() = 'setter'
    and setter_id = (select auth.uid())
  );

create policy leads_insert_own_setter
  on public.leads for insert
  to authenticated
  with check (
    public.current_role() = 'setter'
    and setter_id = (select auth.uid())
  );

create policy leads_update_own_setter
  on public.leads for update
  to authenticated
  using (
    public.current_role() = 'setter'
    and setter_id = (select auth.uid())
  )
  with check (
    public.current_role() = 'setter'
    and setter_id = (select auth.uid())
  );
