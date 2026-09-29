-- Section 9 metrics on a month built by hand (March 2031, far from the seed).
-- Expected values are computed on paper in the comments.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(22);

-- ---------------------------------------------------------------------------
-- Setting: 2 days. DM 30+10 and 20+0 = 60; convos 10; pitched 5;
-- booked (disc+strat) 2+1 and 0+1 = 4; strategy 2
-- ---------------------------------------------------------------------------
insert into public.setter_daily_reports (setter_id, data, dm_outbound, dm_inbound, conversazioni,
  call_proposte, discovery_prenotate, strategy_prenotate) values
  ('22222222-2222-4222-8222-222222222222', '2031-03-02', 30, 10, 8, 4, 2, 1),
  ('22222222-2222-4222-8222-222222222222', '2031-03-03', 20, 0, 2, 1, 0, 1);

-- ---------------------------------------------------------------------------
-- Calls: 4 held (3 qualified, 2 closed), 1 no-show, 1 cancelled
-- ---------------------------------------------------------------------------
insert into public.leads (id, nome, setter_id, fonte)
values ('abab0000-0000-4000-8000-000000000001', 'Metriche Lead', '22222222-2222-4222-8222-222222222222', 'dm_inbound');

insert into public.calls (lead_id, setter_id, closer_id, tipo, programmata_il, stato, qualificata, esito)
select 'abab0000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
       '33333333-3333-4333-8333-333333333333', 'discovery', '2031-03-10 15:00+01', v.stato::public.call_status,
       v.qualificata, v.esito::public.call_outcome
from (values
  ('svolta', true, 'chiusa'), ('svolta', true, 'chiusa'), ('svolta', true, 'follow_up'),
  ('svolta', false, 'persa'), ('no_show', null, null), ('cancellata', null, null)
) as v(stato, qualificata, esito);

-- ---------------------------------------------------------------------------
-- Sales and cash
--  A: nuovo Dec 2030 ending 15/03/2031, then a rinnovo 10/03/2031 (900, 3 rate,
--     first one cashed 300)       -> renewed within 30 days of the end
--  B: nuovo 05/03/2031 1500 cashed, refund -100 on 20/03
--  C: nuovo Dec 2030 ending 20/03/2031, not renewed
-- ---------------------------------------------------------------------------
insert into public.clients (id, nome, setter_id, closer_id) values
  ('acac0000-0000-4000-8000-00000000000a', 'Cliente A', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'),
  ('acac0000-0000-4000-8000-00000000000b', 'Cliente B', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'),
  ('acac0000-0000-4000-8000-00000000000c', 'Cliente C', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333');

insert into public.sales (id, client_id, product_id, tipo, setter_id, closer_id, data_vendita, data_inizio, data_fine, valore_contratto, numero_rate) values
  ('adad0000-0000-4000-8000-0000000000a1', 'acac0000-0000-4000-8000-00000000000a', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '2030-12-01', '2030-12-01', '2031-03-15', 1500, 1),
  ('adad0000-0000-4000-8000-0000000000c1', 'acac0000-0000-4000-8000-00000000000c', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '2030-12-20', '2030-12-20', '2031-03-20', 1500, 1);

insert into public.sales (id, client_id, product_id, tipo, setter_id, closer_id, data_vendita, data_inizio, valore_contratto, numero_rate) values
  ('adad0000-0000-4000-8000-0000000000a2', 'acac0000-0000-4000-8000-00000000000a', 'aaaaaaa1-0000-4000-8000-000000000001', 'rinnovo',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '2031-03-10', '2031-03-16', 900, 3),
  ('adad0000-0000-4000-8000-0000000000b1', 'acac0000-0000-4000-8000-00000000000b', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '2031-03-05', '2031-03-05', 1500, 1);

update public.payments set stato = 'incassata', incassato_il = '2031-03-11', importo_incassato = 300
where sale_id = 'adad0000-0000-4000-8000-0000000000a2' and numero_rata = 1;
update public.payments set stato = 'incassata', incassato_il = '2031-03-06', importo_incassato = 1500
where sale_id = 'adad0000-0000-4000-8000-0000000000b1';
insert into public.payments (sale_id, numero_rata, scadenza, importo_previsto, incassato_il, importo_incassato, stato)
values ('adad0000-0000-4000-8000-0000000000b1', 1, '2031-03-05', 0, '2031-03-20', -100, 'rimborsata');

insert into public.expenses (data, categoria, descrizione, importo) values ('2031-03-02', 'team', 'Coach', 500);

-- ---------------------------------------------------------------------------
-- The admin reads the month
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

create temp table m on commit drop as select * from public.metriche_mese('2031-03-01');

select is(
  (select array[dm_totali, conversazioni, call_proposte, call_prenotate, strategy_prenotate] from m),
  array[60, 10, 5, 4, 2]::bigint[],
  'setting: DM 60, conversazioni 10, proposte 5, prenotate 4, strategy 2'
);

select is(
  (select array[round(tasso_conversazione, 4), tasso_prenotazione, dm_per_call, dm_per_strategy] from m),
  array[0.1667, 0.8, 15, 30]::numeric[],
  'tassi setting: 10/60, 4/5, 60/4, 60/2'
);

select is(
  (select array[call_svolte, no_show, qualificate, chiuse] from m),
  array[4, 1, 3, 2]::bigint[],
  'call: 4 svolte, 1 no show, 3 qualificate, 2 chiuse'
);

select is(
  (select array[show_rate, tasso_qualificazione, close_rate, round(close_rate_qualificate, 4)] from m),
  array[0.8, 0.75, 0.5, 0.6667]::numeric[],
  'show 4/5, qualificazione 3/4, close 2/4, close su qualificate 2/3 (cancellate escluse)'
);

select is(
  (select array[cash_incassato, cash_nuovi_clienti, cash_rate_precedenti, cash_rinnovo, cash_upsell] from m),
  array[1700, 1400, 0, 300, 0]::numeric[],
  'cash 1.500 + 300 - 100 = 1.700: nuovi clienti del mese 1.400 al netto del rimborso, nessuna rata di clienti entrati prima, rinnovo 300'
);

select is(
  (select array[revenue_firmata, revenue_nuovi, numero_vendite, nuovi_clienti, rinnovi, valore_medio_nuovo] from m),
  array[2400, 1500, 2, 1, 1, 1500]::numeric[],
  'revenue 2.400 su 2 vendite: 1 nuovo da 1.500, 1 rinnovo; valore medio nuovo cliente 1.500'
);

select is(
  (select array[cash_per_call_svolta, round(cash_per_dm, 4), revenue_per_dm] from m),
  array[350, 23.3333, 25]::numeric[],
  'solo nuovi clienti: cash per call svolta 1.400/4, cash per DM 1.400/60, revenue per DM 1.500/60'
);

select is(
  (select provvigioni_maturate from m),
  70.00::numeric,
  'provvigioni: 5% di 1.500 meno 5% del rimborso da 100; il rinnovo non matura (regola solo nuovo)'
);

select is(
  (select array[costi, margine_operativo] from m),
  array[500, 1130]::numeric[],
  'margine operativo = 1.700 - 70 - 500'
);

select is(
  (select array[in_scadenza_nel_mese::numeric, rinnovati_nel_mese::numeric, tasso_rinnovo] from m),
  array[2, 1, 0.5]::numeric[],
  'rinnovo: A e C scadono a marzo, solo A rinnova entro 30 giorni'
);

select is(
  (select array_agg(chiave order by chiave) from public.kpi_panoramica('2031-03-01')),
  array['cash_incassato', 'margine_operativo', 'nuovi_clienti', 'revenue_firmata', 'rinnovi'],
  'la panoramica ha i cinque KPI della specifica'
);

select is(
  (select array[valore::text, precedente::text, coalesce(delta::text, 'nullo')]
   from public.kpi_panoramica('2031-03-01') where chiave = 'cash_incassato'),
  array['1700.00', '0.00', 'nullo'],
  'confronto col mese prima: da zero il delta non esiste (mai Infinity)'
);

select is(
  (select array[nuovi_clienti, rate_precedenti, rinnovo, upsell, totale] from public.cash_mensile(3, '2031-03-01') where mese = '2031-03-01'),
  array[1400, 0, 300, 0, 1700]::numeric[],
  'grafico: marzo in nuovi clienti, rate di clienti già entrati, rinnovi, upsell'
);

select is(
  (select count(*)::int from public.cash_mensile(3, '2031-03-01')),
  3,
  'un punto per ogni mese richiesto, anche quelli a zero'
);

select is(
  (select array_agg(fascia) from public.da_incassare()),
  array['in_ritardo', 'prossimi_30', 'oltre'],
  'da incassare diviso in ritardo, prossimi 30 giorni, oltre'
);

select is(
  (select array[dm_totali, giorni_compilati, call_svolte, chiuse]
   from public.metriche_setting('2031-03-01', '2031-03-31') where setter_id = '22222222-2222-4222-8222-222222222222'),
  array[60, 2, 4, 2]::bigint[],
  'metriche per setter sul periodo'
);

select is(
  (select nome from public.metriche_setting('2031-03-01', '2031-03-31') where setter_id is null),
  'Totale',
  'la riga senza setter è il totale del team'
);

select is(
  (select sum(maturato) from public.provvigioni_riepilogo(6) where profile_id = '22222222-2222-4222-8222-222222222222'),
  (select coalesce(sum(provvigione), 0) from public.v_provvigioni_maturate
   where profile_id = '22222222-2222-4222-8222-222222222222'
     and mese >= (date_trunc('month', public.oggi()) - interval '5 months')::date
     and mese <= date_trunc('month', public.oggi())::date),
  'il riepilogo provvigioni coincide con la somma per rata'
);

-- ---------------------------------------------------------------------------
-- The setter: own totals only
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select throws_ok($$ select * from public.metriche_mese('2031-03-01') $$, '42501');

select is(
  (select array[dm_totali, giorni_compilati, call_fissate, call_svolte, chiuse]
   from public.miei_numeri('2031-03-01')),
  array[60, 2, 6, 4, 2]::bigint[],
  'i miei numeri: setting e call del setter'
);

select is(
  (select array[provvigioni_maturate, provvigioni_pagate] from public.miei_numeri('2031-03-01')),
  array[70, 0]::numeric[],
  'il setter vede il totale maturato, non il dettaglio'
);

select is(
  (select count(*)::int from public.v_provvigioni_maturate),
  0,
  'il dettaglio per rata delle provvigioni resta invisibile al setter'
);

select * from finish();
rollback;
