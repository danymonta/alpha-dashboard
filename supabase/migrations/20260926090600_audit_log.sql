-- Audit trail on everything that moves money or permissions.

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  tabella text not null,
  record_id uuid,
  azione public.audit_action not null,
  utente_id uuid references public.profiles (id),
  dati_prima jsonb,
  dati_dopo jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_tabella_record_idx on public.audit_log (tabella, record_id);
create index audit_log_created_at_idx on public.audit_log (created_at desc);

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
begin
  -- seed, migrations and cron run without a profile: keep the row, drop the fk
  if v_utente is not null
     and not exists (select 1 from public.profiles p where p.id = v_utente) then
    v_utente := null;
  end if;

  insert into public.audit_log (
    tabella, record_id, azione, utente_id, dati_prima, dati_dopo
  )
  values (
    tg_table_name,
    coalesce((to_jsonb(new) ->> 'id')::uuid, (to_jsonb(old) ->> 'id')::uuid),
    lower(tg_op)::public.audit_action,
    v_utente,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger audit_sales
  after insert or update or delete on public.sales
  for each row execute function public.audit_row();

create trigger audit_payments
  after insert or update or delete on public.payments
  for each row execute function public.audit_row();

create trigger audit_commission_rules
  after insert or update or delete on public.commission_rules
  for each row execute function public.audit_row();

create trigger audit_commission_payouts
  after insert or update or delete on public.commission_payouts
  for each row execute function public.audit_row();

create trigger audit_expenses
  after insert or update or delete on public.expenses
  for each row execute function public.audit_row();

create trigger audit_profiles
  after insert or update or delete on public.profiles
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- RLS: readable by the admin only, written by the definer trigger above.
-- ---------------------------------------------------------------------------

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon;

create policy audit_log_select_admin
  on public.audit_log for select
  to authenticated
  using (public.is_admin());
