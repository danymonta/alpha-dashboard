-- The hard requirement of the project: a collaborator never sees what a single
-- client pays. Plus the instalment plan arithmetic.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(10);

-- ---------------------------------------------------------------------------
-- Instalment plan: equal rates, the last one absorbs the rounding
-- ---------------------------------------------------------------------------
insert into public.sales (
  id, client_id, product_id, tipo, data_vendita, data_inizio, data_fine,
  valore_contratto, numero_rate
)
select
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  (select id from public.clients order by created_at limit 1),
  (select id from public.products order by durata_mesi limit 1),
  'upsell', public.oggi(), public.oggi(), public.oggi() + 90,
  1000.00, 3;

select is(
  (select string_agg(importo_previsto::text, ',' order by numero_rata)
   from public.payments
   where sale_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  '333.33,333.33,333.34',
  'il piano rate divide in parti uguali e l''ultima assorbe l''arrotondamento'
);

select is(
  (select sum(importo_previsto)
   from public.payments
   where sale_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
  1000.00::numeric,
  'la somma delle rate è esattamente il valore del contratto'
);

select is(
  (select count(*)::int from public.payments
   where sale_id = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
     and stato = 'prevista'),
  3,
  'le rate nascono tutte previste'
);

-- ---------------------------------------------------------------------------
-- A renewal needs a previous sale
-- ---------------------------------------------------------------------------
insert into public.clients (id, nome, cognome)
values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Cliente', 'Senza Storico');

select throws_ok(
  $$ insert into public.sales (
       client_id, product_id, tipo, data_vendita, data_inizio, data_fine,
       valore_contratto, numero_rate
     ) values (
       'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
       (select id from public.products limit 1),
       'rinnovo', public.oggi(), public.oggi(), public.oggi() + 90, 900.00, 1
     ) $$,
  '23514'
);

-- ---------------------------------------------------------------------------
-- Setter: no client row, no sale, no instalment. Only name and status via RPC.
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.clients),
  0,
  'il setter non legge nessuna riga di clients: i contatti vivono lì'
);

select is(
  (select count(*)::int from public.sales),
  0,
  'il setter non vede alcuna vendita'
);

select is(
  (select count(*)::int from public.payments),
  0,
  'il setter non vede alcuna rata: non sa quanto paga un cliente'
);

select ok(
  (select count(*) from public.miei_clienti()) > 0,
  'il setter legge nome e stato dei clienti nati dai suoi lead tramite RPC'
);

-- ---------------------------------------------------------------------------
-- Closer: only their own sales, and only the instalments of those sales
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

select is(
  (select count(*)::int from public.sales
   where closer_id is distinct from '33333333-3333-4333-8333-333333333333'),
  0,
  'il closer vede solo le vendite che ha chiuso lui'
);

select is(
  (select count(*)::int
   from public.payments p
   where not exists (
     select 1 from public.sales s
     where s.id = p.sale_id
       and s.closer_id = '33333333-3333-4333-8333-333333333333'
   )),
  0,
  'il closer vede solo le rate delle proprie vendite'
);

select * from finish();
rollback;
