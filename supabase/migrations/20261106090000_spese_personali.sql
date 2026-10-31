-- Personal expenses (1.68.0). Dany, 31/10/2026: «semmai dividi una sezione in
-- amministrazione per le spese personali così tipo il resto delle spese le
-- carichiamo lì». Business costs stay in public.expenses (Costi); Dany's own
-- expenses (rent, groceries, bills, transport, personal subscriptions…) get a
-- table of their own that no business number ever reads: metriche_periodo,
-- kpi_periodo, the Panoramica, the weekly summary, the sales recap and Claude's
-- numbers all read public.expenses only, and nothing here touches them.
--
-- 1. public.spese_personali: admin only (read, insert, update, delete), plus the
--    restrictive spese_personali_mai_da_oauth like every table outside the MCP
--    allow-list: Claude connected never reaches it, not even the admin's token.
--    Not in mcp_filtro_richiesta, not in the backup exclusions (it is the admin's
--    own data, and the backup goes to the active admins).
-- 2. riepilogo_spese_personali(p_da, p_a): per category with the rollup row
--    (categoria null = the period total), like riepilogo_costi_periodo. security
--    invoker, admin only, 42501 for anyone else and for every OAuth token.
-- 3. copia_spese_personali_ricorrenti(p_mese): the recurring expenses of the
--    previous month brought forward, like copia_costi_ricorrenti. Idempotent.

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------
create table public.spese_personali (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  categoria text not null
    check (categoria in ('casa', 'spesa', 'cibo_fuori', 'trasporti', 'salute', 'cura_persona', 'abbonamenti', 'altro')),
  descrizione text not null check (char_length(btrim(descrizione)) between 2 and 160),
  importo numeric(12, 2) not null check (importo > 0),
  ricorrente boolean not null default false,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.spese_personali is
  'Dany''s personal expenses (1.68.0): admin only, never in any business metric (those read public.expenses).';

create index spese_personali_data_idx on public.spese_personali (data desc);

create trigger spese_personali_set_updated_at before update on public.spese_personali
  for each row execute function public.set_updated_at();

alter table public.spese_personali enable row level security;

create policy spese_personali_admin_lettura on public.spese_personali
  for select to authenticated
  using ((select public.is_admin()));

create policy spese_personali_admin_inserimento on public.spese_personali
  for insert to authenticated
  with check ((select public.is_admin()));

create policy spese_personali_admin_modifica on public.spese_personali
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

create policy spese_personali_admin_eliminazione on public.spese_personali
  for delete to authenticated
  using ((select public.is_admin()));

-- Claude connected (1.34.0, section 28) never reaches a personal expense: same expression as the other tables
create policy spese_personali_mai_da_oauth on public.spese_personali
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

revoke all on public.spese_personali from anon;
revoke all on public.spese_personali from authenticated;
grant select, insert, update, delete on public.spese_personali to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Totals of a period per category; the row with categoria null is the total
-- ---------------------------------------------------------------------------
create or replace function public.riepilogo_spese_personali(p_da date, p_a date)
returns table (categoria text, totale numeric, numero integer)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if public.da_client_oauth() or not public.is_admin() then
    raise exception 'Le spese personali le vede solo l''admin' using errcode = '42501';
  end if;
  perform public.verifica_periodo(p_da, p_a);

  return query
  select s.categoria, sum(s.importo)::numeric(12, 2), count(*)::integer
  from public.spese_personali s
  where s.data between p_da and p_a
  group by rollup (s.categoria)
  order by (s.categoria is null), sum(s.importo) desc;
end;
$$;

comment on function public.riepilogo_spese_personali(date, date) is
  'Personal expenses over [p_da, p_a] per category; the row with categoria null is the total. Admin only, never an OAuth token.';

revoke all on function public.riepilogo_spese_personali(date, date) from public, anon;
grant execute on function public.riepilogo_spese_personali(date, date) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. 1st of the month: bring the recurring personal expenses of the previous
-- month forward. Idempotent: same category and description are not copied twice.
-- ---------------------------------------------------------------------------
create or replace function public.copia_spese_personali_ricorrenti(p_mese date)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inizio date := date_trunc('month', p_mese)::date;
  v_copiati integer;
begin
  if public.da_client_oauth() or not public.is_admin() then
    raise exception 'Le spese personali le gestisce solo l''admin' using errcode = '42501';
  end if;

  insert into public.spese_personali (data, categoria, descrizione, importo, ricorrente, created_by)
  select
    -- same day of the month, clamped to the month's last day
    least(
      v_inizio + (extract(day from s.data)::int - 1),
      (v_inizio + interval '1 month')::date - 1
    ),
    s.categoria,
    s.descrizione,
    s.importo,
    true,
    (select auth.uid())
  from public.spese_personali s
  where s.ricorrente
    and s.data >= (v_inizio - interval '1 month')::date
    and s.data < v_inizio
    and not exists (
      select 1 from public.spese_personali x
      where x.data >= v_inizio
        and x.data < (v_inizio + interval '1 month')::date
        and x.categoria = s.categoria
        and lower(x.descrizione) = lower(s.descrizione)
    );

  get diagnostics v_copiati = row_count;
  return v_copiati;
end;
$$;

comment on function public.copia_spese_personali_ricorrenti(date) is
  'Copies the recurring personal expenses of the month before p_mese into p_mese. Admin only, never an OAuth token.';

revoke all on function public.copia_spese_personali_ricorrenti(date) from public, anon;
grant execute on function public.copia_spese_personali_ricorrenti(date) to authenticated;
