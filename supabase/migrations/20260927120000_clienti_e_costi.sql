-- Clienti e costi.
-- v_clienti: derived status plus lifetime value, from the sales summary.
-- riepilogo_costi / copia_costi_ricorrenti: the admin's monthly routine.

create view public.v_clienti
with (security_invoker = true)
as
select
  s.client_id,
  s.nome,
  s.cognome,
  s.stato,
  s.numero_vendite,
  s.data_fine_ultima,
  c.instagram_handle,
  c.fonte,
  c.setter_id,
  c.closer_id,
  c.created_at,
  coalesce(sum(v.valore_contratto), 0)::numeric(12, 2) as valore_firmato,
  -- lifetime value: cash actually in, net of refunds
  coalesce(sum(v.incassato), 0)::numeric(12, 2) as incassato,
  coalesce(sum(v.da_incassare), 0)::numeric(12, 2) as da_incassare,
  coalesce(sum(v.in_ritardo), 0)::numeric(12, 2) as in_ritardo,
  max(v.data_vendita) as ultima_vendita
from public.v_client_status s
join public.clients c on c.id = s.client_id
left join public.v_vendite v on v.client_id = s.client_id
group by s.client_id, s.nome, s.cognome, s.stato, s.numero_vendite, s.data_fine_ultima,
         c.instagram_handle, c.fonte, c.setter_id, c.closer_id, c.created_at;

revoke all on public.v_clienti from anon;

comment on view public.v_clienti is
  'Client with derived status and lifetime value (cash in net of refunds), still due and overdue.';

-- ---------------------------------------------------------------------------
-- Costs of a month, per category. Admin only.
-- ---------------------------------------------------------------------------
create or replace function public.riepilogo_costi(p_mese date)
returns table (categoria public.expense_category, totale numeric, numero integer)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'I costi li vede solo l''admin' using errcode = '42501';
  end if;

  return query
  select e.categoria, sum(e.importo)::numeric(12, 2), count(*)::integer
  from public.expenses e
  where e.data >= date_trunc('month', p_mese)::date
    and e.data < (date_trunc('month', p_mese) + interval '1 month')::date
  group by e.categoria
  order by sum(e.importo) desc;
end;
$$;

revoke all on function public.riepilogo_costi(date) from public, anon;
grant execute on function public.riepilogo_costi(date) to authenticated;

-- ---------------------------------------------------------------------------
-- 1st of the month: bring the recurring costs of the previous month forward.
-- Idempotent: a cost with the same category and description is not copied twice.
-- ---------------------------------------------------------------------------
create or replace function public.copia_costi_ricorrenti(p_mese date)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_inizio date := date_trunc('month', p_mese)::date;
  v_copiati integer;
begin
  if not public.is_admin() then
    raise exception 'I costi li gestisce solo l''admin' using errcode = '42501';
  end if;

  insert into public.expenses (data, categoria, descrizione, importo, ricorrente, created_by)
  select
    -- same day of the month, clamped to the month's last day
    least(
      v_inizio + (extract(day from e.data)::int - 1),
      (v_inizio + interval '1 month')::date - 1
    ),
    e.categoria,
    e.descrizione,
    e.importo,
    true,
    (select auth.uid())
  from public.expenses e
  where e.ricorrente
    and e.data >= (v_inizio - interval '1 month')::date
    and e.data < v_inizio
    and not exists (
      select 1 from public.expenses x
      where x.data >= v_inizio
        and x.data < (v_inizio + interval '1 month')::date
        and x.categoria = e.categoria
        and lower(x.descrizione) = lower(e.descrizione)
    );

  get diagnostics v_copiati = row_count;
  return v_copiati;
end;
$$;

revoke all on function public.copia_costi_ricorrenti(date) from public, anon;
grant execute on function public.copia_costi_ricorrenti(date) to authenticated;
