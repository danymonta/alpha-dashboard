-- Everything that is entered stays editable (Dany, 27/09/2026).
-- 1. The setter corrects any of their own past reports; the future stays closed.
-- 2. Call details from the prospect sheet: recording link, performance, product pitched.
-- 3. The amount pitched lives in its own table: the setter never reads an amount (section 6),
--    and RLS works per row, not per column.
-- 4. modifica_call: reschedule, change type or closer, notes. The date is read in Europe/Rome.
-- 5. dettagli_call: the closer's record of how the call went, amount included.

-- ---------------------------------------------------------------------------
-- 1. Setter reports: no 7-day window any more, still no future days
-- ---------------------------------------------------------------------------
drop policy setter_daily_reports_insert_own_recent on public.setter_daily_reports;
drop policy setter_daily_reports_update_own_recent on public.setter_daily_reports;

create policy setter_daily_reports_insert_own
  on public.setter_daily_reports for insert
  to authenticated
  with check (
    public.current_role() = 'setter'
    and setter_id = (select auth.uid())
    and data <= public.oggi()
  );

create policy setter_daily_reports_update_own
  on public.setter_daily_reports for update
  to authenticated
  using (
    public.current_role() = 'setter'
    and setter_id = (select auth.uid())
  )
  with check (
    public.current_role() = 'setter'
    and setter_id = (select auth.uid())
    and data <= public.oggi()
  );

-- ---------------------------------------------------------------------------
-- 2. Call details
-- ---------------------------------------------------------------------------
create type public.call_performance as enum ('buona', 'media', 'scarsa');

alter table public.calls
  add column link_registrazione text
    constraint calls_link_registrazione_valido
    check (link_registrazione ~* '^https?://\S+$' and length(link_registrazione) <= 500),
  add column performance public.call_performance,
  add column prodotto_proposto_id uuid references public.products (id);

comment on column public.calls.link_registrazione is 'Recording of the call (e.g. Fathom).';
comment on column public.calls.performance is 'How the call went, as judged by the closer.';
comment on column public.calls.prodotto_proposto_id is 'Product pitched during the call.';

-- ---------------------------------------------------------------------------
-- 3. Amount pitched: admin and the assigned closer only
-- ---------------------------------------------------------------------------
create table public.call_pitch (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null unique references public.calls (id) on delete cascade,
  importo_proposto numeric(12, 2) not null check (importo_proposto >= 0),
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.call_pitch is
  'Amount pitched in a call. Separate from calls because the setter reads calls but never amounts.';

create trigger call_pitch_set_updated_at
  before update on public.call_pitch
  for each row execute function public.set_updated_at();

alter table public.call_pitch enable row level security;
revoke all on public.call_pitch from anon;

create policy call_pitch_all_admin
  on public.call_pitch for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy call_pitch_select_assigned_closer
  on public.call_pitch for select
  to authenticated
  using (
    public.current_role() = 'closer'
    and exists (
      select 1 from public.calls c
      where c.id = call_pitch.call_id and c.closer_id = (select auth.uid())
    )
  );

create policy call_pitch_insert_assigned_closer
  on public.call_pitch for insert
  to authenticated
  with check (
    public.current_role() = 'closer'
    and exists (
      select 1 from public.calls c
      where c.id = call_pitch.call_id and c.closer_id = (select auth.uid())
    )
  );

create policy call_pitch_update_assigned_closer
  on public.call_pitch for update
  to authenticated
  using (
    public.current_role() = 'closer'
    and exists (
      select 1 from public.calls c
      where c.id = call_pitch.call_id and c.closer_id = (select auth.uid())
    )
  )
  with check (
    public.current_role() = 'closer'
    and exists (
      select 1 from public.calls c
      where c.id = call_pitch.call_id and c.closer_id = (select auth.uid())
    )
  );

create policy call_pitch_delete_assigned_closer
  on public.call_pitch for delete
  to authenticated
  using (
    public.current_role() = 'closer'
    and exists (
      select 1 from public.calls c
      where c.id = call_pitch.call_id and c.closer_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------------------
-- 4. modifica_call: who may change what is decided by the calls policies
--    (admin all, setter own, closer assigned). This only adds readable errors.
-- ---------------------------------------------------------------------------
create or replace function public.modifica_call(
  p_call_id uuid,
  p_tipo public.call_type,
  p_data date,
  p_ora time,
  p_closer_id uuid,
  p_note text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ruolo public.app_role := public.current_role();
  v_righe integer;
begin
  if v_ruolo is null or v_ruolo not in ('admin', 'setter', 'closer') then
    raise exception 'Operazione non consentita' using errcode = '42501';
  end if;

  if v_ruolo = 'closer' and p_closer_id is distinct from (select auth.uid()) then
    raise exception 'La call la riassegna il setter o l''admin' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_closer_id
      and p.attivo
      and p.ruolo in ('admin', 'closer')
  ) then
    raise exception 'Il closer scelto non è attivo o non può chiudere' using errcode = '22023';
  end if;

  update public.calls
  set tipo = p_tipo,
      programmata_il = (p_data + p_ora) at time zone 'Europe/Rome',
      closer_id = p_closer_id,
      note = nullif(trim(p_note), '')
  where id = p_call_id;

  get diagnostics v_righe = row_count;
  if v_righe = 0 then
    raise exception 'Call non trovata o non tua' using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.modifica_call(uuid, public.call_type, date, time, uuid, text) from public, anon;
grant execute on function public.modifica_call(uuid, public.call_type, date, time, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. dettagli_call: the closer's side. A null amount removes the pitch row.
-- ---------------------------------------------------------------------------
create or replace function public.dettagli_call(
  p_call_id uuid,
  p_link_registrazione text default null,
  p_performance public.call_performance default null,
  p_prodotto_proposto_id uuid default null,
  p_importo_proposto numeric default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ruolo public.app_role := public.current_role();
  v_righe integer;
begin
  if v_ruolo is null or v_ruolo not in ('admin', 'closer') then
    raise exception 'I dettagli della call li registra chi la fa' using errcode = '42501';
  end if;

  update public.calls
  set link_registrazione = nullif(trim(p_link_registrazione), ''),
      performance = p_performance,
      prodotto_proposto_id = p_prodotto_proposto_id
  where id = p_call_id;

  get diagnostics v_righe = row_count;
  if v_righe = 0 then
    raise exception 'Call non trovata o non assegnata a te' using errcode = '42501';
  end if;

  if p_importo_proposto is null then
    delete from public.call_pitch where call_id = p_call_id;
  else
    insert into public.call_pitch (call_id, importo_proposto, created_by)
    values (p_call_id, p_importo_proposto, (select auth.uid()))
    on conflict (call_id) do update set importo_proposto = excluded.importo_proposto;
  end if;
end;
$$;

revoke all on function public.dettagli_call(uuid, text, public.call_performance, uuid, numeric) from public, anon;
grant execute on function public.dettagli_call(uuid, text, public.call_performance, uuid, numeric) to authenticated;
