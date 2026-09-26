-- Calls booked by the setter and run by the closer.

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads (id) on delete cascade,
  setter_id uuid references public.profiles (id),
  closer_id uuid references public.profiles (id),
  tipo public.call_type not null,
  programmata_il timestamptz not null,
  stato public.call_status not null default 'programmata',
  qualificata boolean,
  esito public.call_outcome,
  obiezione_principale text,
  note text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- qualificata and esito only make sense once the call actually happened
  constraint calls_qualificata_solo_se_svolta
    check (stato = 'svolta' or qualificata is null),
  constraint calls_esito_solo_se_svolta
    check (stato = 'svolta' or esito is null)
);

create index calls_programmata_il_idx on public.calls (programmata_il desc);
create index calls_closer_idx on public.calls (closer_id);
create index calls_setter_idx on public.calls (setter_id);
create index calls_lead_idx on public.calls (lead_id);

create trigger calls_set_updated_at
  before update on public.calls
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.calls enable row level security;
revoke all on public.calls from anon;

-- Checking lead ownership from a policy on calls, while a policy on leads looks
-- at calls, makes Postgres see mutually recursive policies. A security definer
-- helper breaks the cycle: it answers the one question without applying RLS.
create or replace function public.lead_appartiene_al_setter(p_lead_id uuid, p_setter_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.leads l
    where l.id = p_lead_id
      and l.setter_id = p_setter_id
  );
$$;

revoke all on function public.lead_appartiene_al_setter(uuid, uuid) from anon;

create policy calls_all_admin
  on public.calls for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy calls_select_own_setter
  on public.calls for select
  to authenticated
  using (
    public.current_role() = 'setter'
    and setter_id = (select auth.uid())
  );

create policy calls_insert_own_setter
  on public.calls for insert
  to authenticated
  with check (
    public.current_role() = 'setter'
    and setter_id = (select auth.uid())
    and public.lead_appartiene_al_setter(lead_id, (select auth.uid()))
  );

create policy calls_update_own_setter
  on public.calls for update
  to authenticated
  using (
    public.current_role() = 'setter'
    and setter_id = (select auth.uid())
  )
  with check (
    public.current_role() = 'setter'
    and setter_id = (select auth.uid())
  );

create policy calls_select_assigned_closer
  on public.calls for select
  to authenticated
  using (
    public.current_role() = 'closer'
    and closer_id = (select auth.uid())
  );

create policy calls_update_assigned_closer
  on public.calls for update
  to authenticated
  using (
    public.current_role() = 'closer'
    and closer_id = (select auth.uid())
  )
  with check (
    public.current_role() = 'closer'
    and closer_id = (select auth.uid())
  );

-- The closer sees the leads behind the calls assigned to them (needs calls).
create policy leads_select_assigned_closer
  on public.leads for select
  to authenticated
  using (
    public.current_role() = 'closer'
    and exists (
      select 1 from public.calls c
      where c.lead_id = leads.id
        and c.closer_id = (select auth.uid())
    )
  );
