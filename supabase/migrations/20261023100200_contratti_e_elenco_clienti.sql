-- The list of clients with their path, contract, Drive folder and instalments
-- (Dany, 21/10/2026: "direttamente vedere la lista clienti attivi, a che mese e
-- settimana sono, con il contratto e la cartella Drive linkata, quanto hanno
-- pagato, come stanno pagando e quali rate devono ancora saldare").
--
-- A. vendite_contratti: the link to the signed contract of a sale, on Google
--    Drive. A table of its own (sensitive data live in separate tables, RLS
--    works by row): only the admin reads and writes it, never the closer of
--    the sale, the setter or a coach. One contract per sale: every path and
--    every renewal has its own. Deleting the sale takes the link away.
-- B. clienti_elenco(p_stati): one row per client, for his current path (the
--    sale that ends last), with month and week of the path, what he paid, how,
--    the instalments left, the contract, the folder and what he paid in his
--    whole life (the LTV, as a figure). Admin only; security invoker, so RLS
--    of every table it reads still applies.

create table public.vendite_contratti (
  sale_id uuid primary key references public.sales (id) on delete cascade,
  url text not null
    constraint vendite_contratti_url
    check (char_length(url) <= 500 and url ~ '^https://(drive|docs)\.google\.com/[^[:space:]]+$'),
  created_by uuid references public.profiles (id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger vendite_contratti_updated_at
  before update on public.vendite_contratti
  for each row execute function public.set_updated_at();

alter table public.vendite_contratti enable row level security;
revoke all on public.vendite_contratti from anon;

create policy vendite_contratti_admin on public.vendite_contratti for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- A token of Claude (MCP OAuth, 1.34.0) never reaches it, like every table since 20261014090300.
create policy vendite_contratti_mai_da_oauth on public.vendite_contratti as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

comment on table public.vendite_contratti is
  'Link to the signed contract of a sale on Google Drive (drive.google.com or docs.google.com). Admin only: never the closer, the setter or a coach.';

-- ---------------------------------------------------------------------------
-- The list. Month and week of the path count from the first day, on 30.4375-day
-- months and 7-day weeks, capped to the path (a path that has not started has
-- none, one that ended shows its last). 'rate' is the plan, instalment by
-- instalment, for the row that opens under the client.
-- ---------------------------------------------------------------------------
create or replace function public.clienti_elenco(p_stati public.client_status[] default null)
returns table (
  client_id uuid,
  nome text,
  cognome text,
  stato public.client_status,
  sale_id uuid,
  prodotto text,
  tipo public.sale_type,
  numero_percorso integer,
  data_inizio date,
  data_fine date,
  mese integer,
  mesi_totali integer,
  settimana integer,
  settimane_totali integer,
  valore_contratto numeric,
  incassato numeric,
  da_incassare numeric,
  in_ritardo numeric,
  rate_totali integer,
  rate_incassate integer,
  prossima_scadenza date,
  prossimo_importo numeric,
  metodi text[],
  contratto_url text,
  cartella_url text,
  ltv numeric,
  sospeso_il date,
  chiuso_il date,
  rate jsonb
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not public.is_admin() then
    raise exception 'L''elenco dei clienti col contratto lo vede solo l''admin' using errcode = '42501';
  end if;

  return query
  with corrente as (
    -- the path that ends last (a renewal after a pause counts), one per client
    select distinct on (s.client_id)
      s.client_id, s.id as sale_id, s.tipo, s.data_inizio, s.data_fine, s.valore_contratto,
      coalesce(pr.nome, s.prodotto_personalizzato) as prodotto,
      s.product_id
    from public.sales s
    left join public.products pr on pr.id = s.product_id
    order by s.client_id, s.data_fine desc, s.data_inizio desc, s.created_at desc
  ),
  numerati as (
    -- "Primo percorso" is 1, the n-th paths after it count up (an upsell is not a path)
    select s.id as sale_id,
           count(*) filter (where s.tipo in ('nuovo', 'rinnovo'))
             over (partition by s.client_id order by s.data_inizio, s.created_at)::integer as n
    from public.sales s
  ),
  pagamenti as (
    select p.sale_id,
           coalesce(jsonb_agg(jsonb_build_object(
             'numero', p.numero_rata,
             'scadenza', p.scadenza,
             'importo_previsto', p.importo_previsto,
             'stato', p.stato,
             'incassato_il', p.incassato_il,
             'importo_incassato', p.importo_incassato,
             'metodo', p.metodo,
             'in_ritardo', p.stato = 'prevista' and p.scadenza < public.oggi()
           ) order by p.numero_rata), '[]'::jsonb) as rate,
           array_remove(array_agg(distinct p.metodo::text) filter (where p.stato = 'incassata'), null) as metodi,
           (array_agg(p.importo_previsto order by p.scadenza, p.numero_rata)
              filter (where p.stato = 'prevista'))[1] as prossimo_importo
    from public.payments p
    group by p.sale_id
  )
  select
    st.client_id,
    st.nome,
    st.cognome,
    st.stato,
    co.sale_id,
    co.prodotto,
    co.tipo,
    nu.n,
    co.data_inizio,
    co.data_fine,
    case when public.oggi() < co.data_inizio then null
         else least(
           greatest(1, round((co.data_fine - co.data_inizio + 1) / 30.4375)::integer),
           floor((public.oggi() - co.data_inizio) / 30.4375)::integer + 1)
    end,
    greatest(1, round((co.data_fine - co.data_inizio + 1) / 30.4375)::integer),
    case when public.oggi() < co.data_inizio then null
         else least(
           ceil((co.data_fine - co.data_inizio + 1) / 7.0)::integer,
           floor((public.oggi() - co.data_inizio) / 7.0)::integer + 1)
    end,
    ceil((co.data_fine - co.data_inizio + 1) / 7.0)::integer,
    co.valore_contratto,
    v.incassato,
    v.da_incassare,
    v.in_ritardo,
    v.rate_totali,
    v.rate_incassate,
    v.prossima_scadenza,
    pa.prossimo_importo,
    coalesce(pa.metodi, '{}'::text[]),
    ct.url,
    cd.url,
    cl.incassato,
    sp.sospeso_il,
    ch.chiuso_il,
    coalesce(pa.rate, '[]'::jsonb)
  from public.v_client_status st
  join corrente co on co.client_id = st.client_id
  join numerati nu on nu.sale_id = co.sale_id
  join public.v_vendite v on v.sale_id = co.sale_id
  join public.v_clienti cl on cl.client_id = st.client_id
  left join pagamenti pa on pa.sale_id = co.sale_id
  left join public.vendite_contratti ct on ct.sale_id = co.sale_id
  left join public.clienti_cartelle cd on cd.client_id = st.client_id
  left join public.clienti_sospensioni sp on sp.client_id = st.client_id
  left join public.v_clienti_chiusi ch on ch.client_id = st.client_id
  where p_stati is null or st.stato = any (p_stati)
  order by st.cognome nulls last, st.nome, st.client_id;
end;
$$;

comment on function public.clienti_elenco(public.client_status[]) is
  'Admin only: one row per client (in the given states, or all) for his current path: month and week of the path, paid, to pay, methods, instalments left, contract, Drive folder, lifetime paid (LTV) and the plan.';

revoke all on function public.clienti_elenco(public.client_status[]) from public, anon;
grant execute on function public.clienti_elenco(public.client_status[]) to authenticated;
