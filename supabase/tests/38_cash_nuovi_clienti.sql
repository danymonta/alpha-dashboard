-- The cash of a period in four parts (Dany, 29/09/2026): new clients of the
-- period, instalments of clients who entered before, renewals, upsells. They
-- always add up to the cash incassato; the acquisition ratios, the chart and
-- the per-source cash only count the new clients. May 2037, far from the seed;
-- expected values on paper in the comments.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(24);

-- ---------------------------------------------------------------------------
-- Clients, one per source
--  A (DM inbound)   nuovo 05/05/2037 1.200 in 3: 400 on 05/05, 400 on 25/05,
--                   refund -100 on 28/05                  -> new client of May
--  B (referral)     nuovo 10/03/2037 900 in 3: 300 on 10/03, rata 3 300 on 12/05
--                                                         -> entered before May
--                   rinnovo 15/05/2037 600, paid 16/05    -> renewal
--  C (ads)          nuovo 10/01/2037 1.000 paid 10/01; upsell 20/05 200 paid 21/05
--  D (DM outbound)  nuovo signed 02/06/2037 250, deposit paid 30/05
--                                                         -> entering: new client
-- May: new clients 400 + 400 - 100 + 250 = 950, entered before 300,
--      renewals 600, upsells 200; cash 2.050
-- ---------------------------------------------------------------------------
insert into public.clients (id, nome, fonte, setter_id, closer_id) values
  ('38380000-0000-4000-8000-0000000000a0', 'Quattro A', 'dm_inbound', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'),
  ('38380000-0000-4000-8000-0000000000b0', 'Quattro B', 'referral', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'),
  ('38380000-0000-4000-8000-0000000000c0', 'Quattro C', 'ads', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'),
  ('38380000-0000-4000-8000-0000000000d0', 'Quattro D', 'dm_outbound', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333');

insert into public.sales (id, client_id, product_id, tipo, setter_id, closer_id, data_vendita, data_inizio, valore_contratto, numero_rate) values
  ('38380000-0000-4000-8000-0000000000a1', '38380000-0000-4000-8000-0000000000a0', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '2037-05-05', '2037-05-05', 1200, 3),
  ('38380000-0000-4000-8000-0000000000b1', '38380000-0000-4000-8000-0000000000b0', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '2037-03-10', '2037-03-10', 900, 3),
  ('38380000-0000-4000-8000-0000000000c1', '38380000-0000-4000-8000-0000000000c0', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '2037-01-10', '2037-01-10', 1000, 1),
  ('38380000-0000-4000-8000-0000000000d1', '38380000-0000-4000-8000-0000000000d0', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '2037-06-02', '2037-06-02', 250, 1);

-- renewal and upsell: no setter (20260929140000)
insert into public.sales (id, client_id, product_id, tipo, closer_id, data_vendita, data_inizio, valore_contratto, numero_rate) values
  ('38380000-0000-4000-8000-0000000000b2', '38380000-0000-4000-8000-0000000000b0', 'aaaaaaa1-0000-4000-8000-000000000001', 'rinnovo',
   '11111111-1111-4111-8111-111111111111', '2037-05-15', '2037-06-10', 600, 1),
  ('38380000-0000-4000-8000-0000000000c2', '38380000-0000-4000-8000-0000000000c0', 'aaaaaaa1-0000-4000-8000-000000000001', 'upsell',
   '11111111-1111-4111-8111-111111111111', '2037-05-20', '2037-05-20', 200, 1);

update public.payments p set stato = 'incassata', incassato_il = v.il::date, importo_incassato = v.importo, metodo = 'bonifico'
from (values
  ('38380000-0000-4000-8000-0000000000a1', 1, '2037-05-05', 400),
  ('38380000-0000-4000-8000-0000000000a1', 2, '2037-05-25', 400),
  ('38380000-0000-4000-8000-0000000000b1', 1, '2037-03-10', 300),
  ('38380000-0000-4000-8000-0000000000b1', 3, '2037-05-12', 300),
  ('38380000-0000-4000-8000-0000000000b2', 1, '2037-05-16', 600),
  ('38380000-0000-4000-8000-0000000000c1', 1, '2037-01-10', 1000),
  ('38380000-0000-4000-8000-0000000000c2', 1, '2037-05-21', 200),
  ('38380000-0000-4000-8000-0000000000d1', 1, '2037-05-30', 250)
) as v(vendita, rata, il, importo)
where p.sale_id = v.vendita::uuid and p.numero_rata = v.rata;

insert into public.payments (sale_id, numero_rata, scadenza, importo_previsto, incassato_il, importo_incassato, stato)
values ('38380000-0000-4000-8000-0000000000a1', 1, '2037-05-05', 0, '2037-05-28', -100, 'rimborsata');

-- Setting: DM 40 + 10 + 10 follow up = 60 on 04/05. Calls on 20/05 with a DM
-- inbound lead: 2 held (1 closed), 1 no-show.
insert into public.setter_daily_reports (setter_id, data, dm_outbound, dm_inbound, follow_up)
values ('22222222-2222-4222-8222-222222222222', '2037-05-04', 40, 10, 10);

insert into public.leads (id, nome, setter_id, fonte)
values ('38380000-0000-4000-8000-000000000001', 'Quattro Lead', '22222222-2222-4222-8222-222222222222', 'dm_inbound');

insert into public.calls (lead_id, setter_id, closer_id, tipo, programmata_il, stato, qualificata, esito)
select '38380000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
       '11111111-1111-4111-8111-111111111111', 'discovery', '2037-05-20 15:00+02', v.stato::public.call_status,
       v.qualificata, v.esito::public.call_outcome
from (values ('svolta', true, 'chiusa'), ('svolta', false, 'persa'), ('no_show', null, null)) as v(stato, qualificata, esito);

-- ---------------------------------------------------------------------------
-- The admin reads May
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

create temp table maggio on commit drop as select * from public.metriche_periodo('2037-05-01', '2037-05-31');

select is(
  (select array[cash_nuovi_clienti, cash_rate_precedenti, cash_rinnovo, cash_upsell] from maggio),
  array[950, 300, 600, 200]::numeric[],
  'maggio in quattro parti: nuovi clienti 950 (rimborso e acconto compresi), già entrati 300, rinnovi 600, upsell 200'
);

select is(
  (select cash_incassato from maggio),
  2050.00::numeric,
  'il cash incassato resta tutto: 2.050'
);

select is(
  (select cash_nuovi_clienti + cash_rate_precedenti + cash_rinnovo + cash_upsell from maggio),
  (select cash_incassato from maggio),
  'le quattro parti fanno il cash incassato'
);

select is(
  (select array[revenue_firmata, revenue_nuovi, nuovi_clienti, valore_medio_nuovo] from maggio),
  array[2000, 1200, 1, 1200]::numeric[],
  'revenue di ogni tipo 2.000; dei nuovi clienti 1.200 su 1 vendita: valore medio nuovo cliente 1.200'
);

select is(
  (select array[round(cash_per_dm, 4), revenue_per_dm, cash_per_call_svolta] from maggio),
  array[15.8333, 20, 475]::numeric[],
  'indicatori sui nuovi clienti: 950 / 60 DM, 1.200 / 60 DM, 950 / 2 call svolte'
);

select is(
  (select to_jsonb(p) - array['inizio', 'fine', 'in_scadenza', 'rinnovati'] from maggio p),
  (select to_jsonb(m) - array['mese', 'in_scadenza_nel_mese', 'rinnovati_nel_mese'] from public.metriche_mese('2037-05-01') m),
  'metriche_mese dà gli stessi numeri del periodo'
);

-- A range that starts after A signed: A's later instalment and refund are
-- instalments of a client who entered before the range
select is(
  (select array[cash_nuovi_clienti, cash_rate_precedenti, cash_rinnovo, cash_upsell, cash_incassato]
   from public.metriche_periodo('2037-05-10', '2037-05-31')),
  array[250, 600, 600, 200, 1650]::numeric[],
  'dal 10/05: nuovi clienti solo l’acconto di D; A (firmato il 05/05) passa tra i già entrati'
);

select is(
  (select array[coalesce(valore_medio_nuovo, -1), coalesce(cash_per_dm, -1), cash_per_call_svolta]
   from public.metriche_periodo('2037-05-10', '2037-05-31')),
  array[-1, -1, 125]::numeric[],
  'senza vendite nuove né DM nel periodo niente divisione per zero; 250 / 2 call svolte'
);

select is(
  (select array[valore, precedente] from public.kpi_periodo('2037-05-01', '2037-05-31') where chiave = 'cash_incassato'),
  array[2050, 0]::numeric[],
  'il KPI del cash non cambia: tutto l’incassato'
);

-- ---------------------------------------------------------------------------
-- The 12-month chart: the same four parts, month by month
-- ---------------------------------------------------------------------------
select is(
  (select array[nuovi_clienti, rate_precedenti, rinnovo, upsell, totale]
   from public.cash_mensile(3, '2037-05-01') where mese = '2037-05-01'),
  array[950, 300, 600, 200, 2050]::numeric[],
  'grafico: maggio nelle quattro parti'
);

select is(
  (select array[nuovi_clienti, rate_precedenti, rinnovo, upsell, totale]
   from public.cash_mensile(3, '2037-05-01') where mese = '2037-03-01'),
  array[300, 0, 0, 0, 300]::numeric[],
  'grafico: a marzo la prima rata di B è di un cliente entrato quel mese'
);

select is(
  (select count(*)::integer from public.cash_mensile(3, '2037-05-01')
   where nuovi_clienti + rate_precedenti + rinnovo + upsell <> totale),
  0,
  'in ogni mese le quattro serie fanno il totale'
);

-- ---------------------------------------------------------------------------
-- By source: only the new clients of the period
-- ---------------------------------------------------------------------------
select is(
  (select array[cash, quota_cash, nuovi_clienti::numeric, call_svolte::numeric, chiuse::numeric, close_rate]
   from public.metriche_per_fonte('2037-05-01', '2037-05-31') where fonte = 'dm_inbound'),
  array[700, 0.7368, 1, 2, 1, 0.5]::numeric[],
  'DM inbound: 700 dal nuovo cliente A, 74% del cash dei nuovi; call e close rate per fonte del lead'
);

select is(
  (select array[cash, quota_cash] from public.metriche_per_fonte('2037-05-01', '2037-05-31') where fonte = 'dm_outbound'),
  array[250, 0.2632]::numeric[],
  'DM outbound: l’acconto di D'
);

select is(
  (select array_agg(cash order by fonte) from public.metriche_per_fonte('2037-05-01', '2037-05-31') where fonte in ('referral', 'ads')),
  array[0, 0]::numeric[],
  'referral e ads: la rata di un cliente entrato prima, il rinnovo e l’upsell non contano'
);

select is(
  (select sum(cash) from public.metriche_per_fonte('2037-05-01', '2037-05-31')),
  (select cash_nuovi_clienti from maggio),
  'il cash per fonte fa il cash dei nuovi clienti del periodo'
);

-- ---------------------------------------------------------------------------
-- On the seed, whatever the data: the parts always add up
-- ---------------------------------------------------------------------------
select is(
  (select cash_nuovi_clienti + cash_rate_precedenti + cash_rinnovo + cash_upsell - cash_incassato
   from public.metriche_periodo((public.oggi() - interval '1 year')::date, public.oggi())),
  0.00::numeric,
  'sull’ultimo anno del seed le quattro parti fanno il cash incassato'
);

select is(
  (select count(*)::integer from public.cash_mensile(12)
   where nuovi_clienti + rate_precedenti + rinnovo + upsell <> totale),
  0,
  'e nel grafico degli ultimi 12 mesi'
);

-- ---------------------------------------------------------------------------
-- Today: all the cash, and the part of the clients who entered today
-- ---------------------------------------------------------------------------
create temp table prima on commit drop as select cash_incassato, cash_nuovi_clienti from public.oggi_team();

reset role;
-- a client signed today pays 500; an older one pays his second instalment, 200
insert into public.clients (id, nome, fonte) values
  ('38380000-0000-4000-8000-0000000000e0', 'Quattro Oggi', 'organico'),
  ('38380000-0000-4000-8000-0000000000f0', 'Quattro Vecchio', 'organico');
insert into public.sales (id, client_id, product_id, tipo, data_vendita, data_inizio, valore_contratto, numero_rate) values
  ('38380000-0000-4000-8000-0000000000e1', '38380000-0000-4000-8000-0000000000e0', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   public.oggi(), public.oggi(), 1500, 3),
  ('38380000-0000-4000-8000-0000000000f1', '38380000-0000-4000-8000-0000000000f0', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   public.oggi() - 40, public.oggi() - 40, 600, 3);
update public.payments set stato = 'incassata', incassato_il = public.oggi(), importo_incassato = 500, metodo = 'bonifico'
where sale_id = '38380000-0000-4000-8000-0000000000e1' and numero_rata = 1;
update public.payments set stato = 'incassata', incassato_il = public.oggi(), importo_incassato = 200, metodo = 'bonifico'
where sale_id = '38380000-0000-4000-8000-0000000000f1' and numero_rata = 2;
set local role authenticated;

select is(
  (select array[o.cash_incassato - p.cash_incassato, o.cash_nuovi_clienti - p.cash_nuovi_clienti]
   from public.oggi_team() o, prima p),
  array[700, 500]::numeric[],
  'oggi: incassati 700, di cui 500 dal cliente entrato oggi'
);

-- ---------------------------------------------------------------------------
-- The evening email: what each cash-in is, and the day's sales by type
-- ---------------------------------------------------------------------------
reset role;
set local role service_role;

select is(
  (select (public.riepilogo_serale('2037-05-05') -> 'incassi' -> 0) - 'cliente' - 'importo' - 'metodo'),
  '{"tipo": "nuovo", "parte": "nuovi_clienti", "rimborso": false, "numero_rata": 1, "numero_rate": 3}'::jsonb,
  'la prima rata di A: vendita nuova, rata 1 di 3, un cliente entrato quel giorno'
);

select is(
  (select public.riepilogo_serale('2037-05-12') -> 'incassi' -> 0 ->> 'parte'),
  'rate_precedenti',
  'la terza rata di B è di un cliente già entrato'
);

select is(
  (select public.riepilogo_serale('2037-05-28') -> 'incassi' -> 0 -> 'rimborso'),
  'true'::jsonb,
  'un rimborso si dice rimborso'
);

select is(
  (select public.riepilogo_serale('2037-05-05') -> 'vendite_per_tipo'),
  '{"nuovo": 1, "rinnovo": 0, "upsell": 0}'::jsonb,
  'le vendite del giorno divise per tipo'
);

-- ---------------------------------------------------------------------------
-- Admin only
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

select throws_ok($$ select * from public.cash_mensile(3, '2037-05-01') $$, '42501');

select * from finish();
rollback;
