-- Review fixes of 29/09/2026 (20260929170000):
-- 1. a call recorded after it happened is booked on its own time, so it never
--    counts as "prenotata" today; a call booked ahead keeps now();
-- 2. the per-source cash counts a client with no source under 'altro', so the
--    sources add up to the new clients' cash.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(11);

-- ---------------------------------------------------------------------------
-- Fixtures for the per-source block: April 2038, far from the seed
--   X (referral)   nuovo 05/04/2038 500, paid 05/04
--   Y (no source)  nuovo 10/04/2038 700, paid 10/04
-- New clients' cash 1.200: referral 500, altro 700
-- ---------------------------------------------------------------------------
insert into public.clients (id, nome, fonte, setter_id, closer_id) values
  ('40400000-0000-4000-8000-0000000000a0', 'Fonte X', 'referral', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'),
  ('40400000-0000-4000-8000-0000000000b0', 'Fonte Nessuna', null, '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333');

insert into public.sales (id, client_id, product_id, tipo, setter_id, closer_id, data_vendita, data_inizio, valore_contratto, numero_rate) values
  ('40400000-0000-4000-8000-0000000000a1', '40400000-0000-4000-8000-0000000000a0', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '2038-04-05', '2038-04-05', 500, 1),
  ('40400000-0000-4000-8000-0000000000b1', '40400000-0000-4000-8000-0000000000b0', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '2038-04-10', '2038-04-10', 700, 1);

update public.payments p set stato = 'incassata', incassato_il = v.il::date, importo_incassato = v.importo, metodo = 'bonifico'
from (values
  ('40400000-0000-4000-8000-0000000000a1', '2038-04-05', 500),
  ('40400000-0000-4000-8000-0000000000b1', '2038-04-10', 700)
) as v(vendita, il, importo)
where p.sale_id = v.vendita::uuid and p.numero_rata = 1;

set local role authenticated;

-- ---------------------------------------------------------------------------
-- 1. Bookings: what Loris sees today and on 10/03/2025, before
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

create temp table prima on commit drop as
select
  (select coalesce(g.prenotate_inbound, 0) from public.giornate_setter(public.oggi(), public.oggi()) g where g.data is null) as oggi,
  (select coalesce(g.prenotate_inbound, 0) from public.giornate_setter('2025-03-10', '2025-03-10') g where g.data is null) as marzo;

-- The admin adds, for Loris, a DM inbound call held on 10/03/2025 at 15:00
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

create temp table passata on commit drop as
select * from public.fissa_call(
  'Correzioni Passata', 'dm_inbound', 'discovery', '2025-03-10', '15:00',
  '11111111-1111-4111-8111-111111111111', '@correzioni.passata',
  '22222222-2222-4222-8222-222222222222'
);

select is(
  (select c.created_at from public.calls c where c.id = (select id_call from passata)),
  '2025-03-10 14:00:00+00'::timestamptz,
  'una call già fatta risulta prenotata alla sua ora, non oggi'
);

select is(
  (select l.created_at from public.leads l where l.id = (select id_lead from passata)),
  '2025-03-10 14:00:00+00'::timestamptz,
  'il lead nato con lei ha la stessa data'
);

-- The same person booked again, even earlier: the lead is reused and keeps its date
create temp table riuso on commit drop as
select * from public.fissa_call(
  'Correzioni Passata', 'dm_inbound', 'discovery', '2025-02-20', '11:00',
  '11111111-1111-4111-8111-111111111111', '@correzioni.passata',
  '22222222-2222-4222-8222-222222222222'
);

select is(
  (select array[r.lead_esistente::text, l.created_at::text, c.created_at::text]
   from riuso r
   join public.leads l on l.id = r.id_lead
   join public.calls c on c.id = r.id_call),
  array['true', '2025-03-10 14:00:00+00'::timestamptz::text, '2025-02-20 10:00:00+00'::timestamptz::text],
  'un lead riusato tiene la sua data; la nuova call prende la propria'
);

-- A call booked ahead is booked now
create temp table futura on commit drop as
select * from public.fissa_call(
  'Correzioni Futura', 'dm_outbound', 'discovery', (public.oggi() + 3), '10:00',
  '11111111-1111-4111-8111-111111111111', '@correzioni.futura'
);

select is(
  (select c.created_at from public.calls c where c.id = (select id_call from futura)),
  now(),
  'una call fissata in avanti è prenotata adesso'
);

-- Loris: the call of March counts on 10/03/2025, not today
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select is(
  (select coalesce(g.prenotate_inbound, 0) from public.giornate_setter(public.oggi(), public.oggi()) g where g.data is null),
  (select oggi from prima),
  'la call di marzo aggiunta oggi non conta tra le prenotate di oggi'
);

select is(
  (select coalesce(g.prenotate_inbound, 0) from public.giornate_setter('2025-03-10', '2025-03-10') g where g.data is null),
  (select marzo + 1 from prima),
  'conta il 10/03/2025, il giorno in cui si è tenuta'
);

-- The setter recording yesterday's call: same rule
create temp table del_setter on commit drop as
select * from public.fissa_call(
  'Correzioni Ieri', 'dm_inbound', 'discovery', (public.oggi() - 1), '09:30',
  '11111111-1111-4111-8111-111111111111', '@correzioni.ieri'
);

select is(
  (select c.created_at = c.programmata_il from public.calls c where c.id = (select id_call from del_setter)),
  true,
  'anche il setter che registra la call di ieri la prenota ieri'
);

-- ---------------------------------------------------------------------------
-- 2. By source, April 2038
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

create temp table fonti on commit drop as select * from public.metriche_per_fonte('2038-04-01', '2038-04-30');
create temp table aprile on commit drop as select * from public.metriche_periodo('2038-04-01', '2038-04-30');

select is(
  (select sum(cash) from fonti),
  (select cash_nuovi_clienti from aprile),
  'le fonti sommano al cash dei nuovi clienti, anche con un cliente senza fonte'
);

select is(
  (select sum(cash) from fonti),
  1200::numeric,
  'aprile: 500 + 700'
);

select is(
  (select array[cash, nuovi_clienti::numeric, quota_cash] from fonti where fonte = 'altro'),
  array[700, 1, 0.5833]::numeric[],
  'il cliente senza fonte sta in «altro», con la sua quota'
);

select is(
  (select sum(nuovi_clienti)::bigint from fonti),
  (select nuovi_clienti from aprile),
  'i nuovi clienti per fonte sommano ai nuovi clienti del periodo'
);

select * from finish();
rollback;
