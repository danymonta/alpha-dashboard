-- Custom periods: the range versions of the monthly RPCs, on data built by
-- hand in April-June 2033 (far from the seed). Expected values on paper below.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(28);

-- ---------------------------------------------------------------------------
-- Setting: 20/05 DM 10, conv 4, proposte 2, prenotate 1
--          10/06 DM 30, conv 6, proposte 3, prenotate 2
-- ---------------------------------------------------------------------------
insert into public.setter_daily_reports (setter_id, data, dm_outbound, dm_inbound, conversazioni,
  call_proposte, discovery_prenotate, strategy_prenotate) values
  ('22222222-2222-4222-8222-222222222222', '2033-05-20', 10, 0, 4, 2, 1, 0),
  ('22222222-2222-4222-8222-222222222222', '2033-06-10', 20, 10, 6, 3, 1, 1);

-- Calls: 25/05 held and closed, 05/06 held and lost, 06/06 no-show
insert into public.leads (id, nome, setter_id, fonte)
values ('20330000-0000-4000-8000-000000000001', 'Periodo Lead', '22222222-2222-4222-8222-222222222222', 'dm_inbound');

insert into public.calls (lead_id, setter_id, closer_id, tipo, programmata_il, stato, qualificata, esito)
select '20330000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
       '33333333-3333-4333-8333-333333333333', 'discovery', v.quando::timestamptz, v.stato::public.call_status,
       v.qualificata, v.esito::public.call_outcome
from (values
  ('2033-05-25 15:00+02', 'svolta', true, 'chiusa'),
  ('2033-06-05 15:00+02', 'svolta', false, 'persa'),
  ('2033-06-06 15:00+02', 'no_show', null, null)
) as v(quando, stato, qualificata, esito);

-- ---------------------------------------------------------------------------
-- Sales and cash (setter rule: 5% on "nuovo" only)
--  W nuovo 20/04 400, cashed 20/04
--  X nuovo 15/05 1.000, cashed 16/05
--  Y nuovo 03/06 600 in 2 rate, first 300 cashed 04/06
--  U upsell for X 20/06 200, cashed 21/06 (no commission)
-- ---------------------------------------------------------------------------
insert into public.clients (id, nome, setter_id, closer_id) values
  ('20330000-0000-4000-8000-0000000000c1', 'Periodo W', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'),
  ('20330000-0000-4000-8000-0000000000c2', 'Periodo X', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'),
  ('20330000-0000-4000-8000-0000000000c3', 'Periodo Y', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333');

insert into public.sales (id, client_id, product_id, tipo, setter_id, closer_id, data_vendita, data_inizio, valore_contratto, numero_rate) values
  ('20330000-0000-4000-8000-0000000000a1', '20330000-0000-4000-8000-0000000000c1', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '2033-04-20', '2033-04-20', 400, 1),
  ('20330000-0000-4000-8000-0000000000a2', '20330000-0000-4000-8000-0000000000c2', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '2033-05-15', '2033-05-15', 1000, 1),
  ('20330000-0000-4000-8000-0000000000a3', '20330000-0000-4000-8000-0000000000c3', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '2033-06-03', '2033-06-03', 600, 2),
  ('20330000-0000-4000-8000-0000000000a4', '20330000-0000-4000-8000-0000000000c2', 'aaaaaaa1-0000-4000-8000-000000000001', 'upsell',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '2033-06-20', '2033-06-20', 200, 1);

update public.payments set stato = 'incassata', incassato_il = '2033-04-20', importo_incassato = 400
where sale_id = '20330000-0000-4000-8000-0000000000a1';
update public.payments set stato = 'incassata', incassato_il = '2033-05-16', importo_incassato = 1000
where sale_id = '20330000-0000-4000-8000-0000000000a2';
update public.payments set stato = 'incassata', incassato_il = '2033-06-04', importo_incassato = 300
where sale_id = '20330000-0000-4000-8000-0000000000a3' and numero_rata = 1;
update public.payments set stato = 'incassata', incassato_il = '2033-06-21', importo_incassato = 200
where sale_id = '20330000-0000-4000-8000-0000000000a4';

-- Costs: 10/05 100, 15/06 50. Payout to the setter for May: 50.
insert into public.expenses (data, categoria, descrizione, importo) values
  ('2033-05-10', 'team', 'Coach periodo', 100),
  ('2033-06-15', 'software', 'Hosting periodo', 50);

insert into public.commission_payouts (profile_id, periodo, importo, pagato_il, metodo)
values ('22222222-2222-4222-8222-222222222222', '2033-05-01', 50, '2033-06-25', 'bonifico');

-- ---------------------------------------------------------------------------
-- The comparison window (same cases as tests/periodo.test.ts)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select is(
  (select array[da, a] from public.periodo_precedente('2033-06-01', '2033-06-30')),
  array['2033-05-01', '2033-05-31']::date[],
  'un mese: il mese prima'
);

select is(
  (select array[da, a] from public.periodo_precedente('2033-07-01', '2033-09-30')),
  array['2033-04-01', '2033-06-30']::date[],
  'mesi interi: gli stessi mesi prima (lug–set → apr–giu)'
);

select is(
  (select array[da, a] from public.periodo_precedente('2032-03-01', '2032-03-31')),
  array['2032-02-01', '2032-02-29']::date[],
  'marzo bisestile: febbraio fino al 29'
);

select is(
  (select array[da, a] from public.periodo_precedente('2033-05-15', '2033-06-15')),
  array['2033-04-13', '2033-05-14']::date[],
  'intervallo di 32 giorni: i 32 giorni subito prima'
);

select is(
  (select array[da, a] from public.periodo_precedente('2026-08-29', '2026-09-27')),
  array['2026-07-30', '2026-08-28']::date[],
  'ultimi 30 giorni: i 30 giorni prima'
);

-- ---------------------------------------------------------------------------
-- A whole month as a period = the monthly RPC
-- ---------------------------------------------------------------------------
select is(
  (select to_jsonb(p) - array['inizio', 'fine', 'in_scadenza', 'rinnovati']
   from public.metriche_periodo('2033-06-01', '2033-06-30') p),
  (select to_jsonb(m) - array['mese', 'in_scadenza_nel_mese', 'rinnovati_nel_mese']
   from public.metriche_mese('2033-06-01') m),
  'giugno come periodo dà gli stessi numeri di metriche_mese'
);

select is(
  (select array[cash_incassato, cash_nuovo, cash_upsell, revenue_firmata, provvigioni_maturate, costi, margine_operativo]
   from public.metriche_periodo('2033-06-01', '2033-06-30')),
  array[500, 300, 200, 800, 15, 50, 435]::numeric[],
  'giugno: cash 300 + 200, revenue 600 + 200, provvigioni 5% di 300, margine 500 - 15 - 50'
);

select results_eq(
  $$ select * from public.kpi_periodo('2033-06-01', '2033-06-30') $$,
  $$ select * from public.kpi_panoramica('2033-06-01') $$,
  'KPI di giugno: periodo e mese coincidono, riga per riga'
);

select results_eq(
  $$ select * from public.kpi_periodo('2033-05-01', '2033-05-31') $$,
  $$ select * from public.kpi_panoramica('2033-05-01') $$,
  'KPI di maggio: periodo e mese coincidono, riga per riga'
);

select is(
  (select array[valore, precedente, delta] from public.kpi_periodo('2033-05-01', '2033-05-31') where chiave = 'cash_incassato'),
  array[1000, 400, 1.5]::numeric[],
  'maggio contro aprile: 1.000 contro 400, +150%'
);

select results_eq(
  $$ select * from public.funnel_periodo('2033-06-01', '2033-06-30') $$,
  $$ select * from public.funnel_mese('2033-06-01') $$,
  'funnel di giugno: periodo e mese coincidono'
);

select results_eq(
  $$ select * from public.riepilogo_costi_periodo('2033-06-01', '2033-06-30') $$,
  $$ select * from public.riepilogo_costi('2033-06-01') $$,
  'costi di giugno: periodo e mese coincidono'
);

-- ---------------------------------------------------------------------------
-- A range across two months: 15/05 – 15/06 (32 days)
-- ---------------------------------------------------------------------------
select is(
  (select array[dm_totali, conversazioni, call_proposte, call_prenotate, call_svolte, no_show, chiuse]
   from public.metriche_periodo('2033-05-15', '2033-06-15')),
  array[40, 10, 5, 3, 2, 1, 1]::bigint[],
  'setting e call a cavallo dei due mesi: 20/05 e 10/06, tre call'
);

select is(
  (select array[cash_incassato, revenue_firmata, nuovi_clienti, provvigioni_maturate, costi, margine_operativo]
   from public.metriche_periodo('2033-05-15', '2033-06-15')),
  array[1300, 1600, 2, 65, 50, 1185]::numeric[],
  'cash 1.000 + 300 (il 21/06 resta fuori), revenue 1.000 + 600, costi solo il 15/06, margine 1.300 - 65 - 50'
);

select is(
  (select array[valore, precedente, delta] from public.kpi_periodo('2033-05-15', '2033-06-15') where chiave = 'cash_incassato'),
  array[1300, 400, 2.25]::numeric[],
  'confronto con 13/04 – 14/05: c’è solo l’incasso del 20/04'
);

select is(
  (select precedente from public.kpi_periodo('2033-05-15', '2033-06-15') where chiave = 'margine_operativo'),
  280.00::numeric,
  'margine del periodo precedente: 400 - 20 di provvigioni - 100 di costi del 10/05'
);

select is(
  (select array_agg(valore order by ordine) from public.funnel_periodo('2033-05-15', '2033-06-15')),
  array[40, 10, 3, 2, 1]::bigint[],
  'funnel dell’intervallo'
);

select is(
  (select array[totale::text, numero::text] from public.riepilogo_costi_periodo('2033-05-15', '2033-06-15') where categoria is null),
  array['50.00', '1'],
  'totale costi dell’intervallo, calcolato in SQL'
);

select is(
  (select array[cash_incassato, revenue_firmata, margine_operativo] from public.metriche_periodo('2033-05-01', '2033-06-30')),
  (select array[sum(cash_incassato), sum(revenue_firmata), sum(margine_operativo)]
   from (select * from public.metriche_mese('2033-05-01') union all select * from public.metriche_mese('2033-06-01')) x),
  'maggio + giugno come periodo = somma dei due mesi'
);

-- ---------------------------------------------------------------------------
-- Invalid ranges and permissions
-- ---------------------------------------------------------------------------
select throws_ok($$ select * from public.metriche_periodo('2033-06-30', '2033-06-01') $$, '22023');
select throws_ok($$ select * from public.metriche_periodo('2030-01-01', '2033-01-01') $$, '22023');
select throws_ok($$ select * from public.miei_numeri_periodo('2033-06-01', '2033-06-30') $$, '42501');

set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

select throws_ok($$ select * from public.kpi_periodo('2033-06-01', '2033-06-30') $$, '42501');

-- ---------------------------------------------------------------------------
-- The setter: own totals over the range
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select throws_ok($$ select * from public.metriche_periodo('2033-06-01', '2033-06-30') $$, '42501');
select throws_ok($$ select * from public.riepilogo_costi_periodo('2033-06-01', '2033-06-30') $$, '42501');

select is(
  (select array[dm_totali, giorni_compilati, call_fissate, call_svolte, chiuse]
   from public.miei_numeri_periodo('2033-05-15', '2033-06-15')),
  array[40, 2, 3, 2, 1]::bigint[],
  'i miei numeri dell’intervallo'
);

select is(
  (select array[provvigioni_maturate, provvigioni_pagate] from public.miei_numeri_periodo('2033-05-15', '2033-06-15')),
  array[65, 50]::numeric[],
  'maturate 50 + 15; pagate: il pagamento di maggio, mese toccato dall’intervallo'
);

select results_eq(
  $$ select * from public.miei_numeri_periodo('2033-05-01', '2033-05-31') $$,
  $$ select * from public.miei_numeri('2033-05-01') $$,
  'i miei numeri di maggio: periodo e mese coincidono'
);

select * from finish();
rollback;
