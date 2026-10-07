-- The weekly summary (Dany, 07/10/2026, 20261007110000): the admins' email
-- goes out on Friday evening with the week from Saturday to Friday, no longer
-- every evening. riepilogo_settimana is riepilogo_serale over an interval:
-- every cash-in and sale with its day, oldest first, the cash in its four
-- parts, late and due in 7 days from the last day, the setters' DM,
-- conversations and calls booked, the calls held, no-shows and closes by day
-- in Rome; the 8 clients late the longest and how many are late. Team totals
-- only; the cron (service role) alone reads it.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(26);

select has_function('public', 'riepilogo_settimana', array['date', 'date'], 'riepilogo_settimana esiste');
select hasnt_function('public', 'riepilogo_serale', array['date'], 'il riepilogo serale non c''è più');
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'public.riepilogo_settimana(date, date)'::regprocedure),
  'security definer con search_path vuoto'
);
select ok(
  has_function_privilege('service_role', 'public.riepilogo_settimana(date, date)', 'execute')
  and not has_function_privilege('authenticated', 'public.riepilogo_settimana(date, date)', 'execute')
  and not has_function_privilege('anon', 'public.riepilogo_settimana(date, date)', 'execute'),
  'solo il cron (service role) lo legge'
);

-- ---------------------------------------------------------------------------
-- The week from Saturday 05/06/2032 to Friday 11/06/2032, far from the seed.
--  A nuovo signed 06/06, 1.200 in 3: 400 on 06/06, refund -50 on 09/06;
--    rata 2 due 15/06 (in the next 7 days), rata 3 due 19/06 (after)
--  B nuovo signed 10/01, 900 in 3: rata 2 300 on 10/06 (already in),
--    rata 3 due 11/06 (the last day: neither late nor coming);
--    rinnovo signed 07/06 600 paid 07/06; upsell signed 11/06 100 paid 11/06
--  C nuovo signed and paid 12/06 (the Saturday after: out)
--  D nuovo signed 04/06 (the Friday before), 300 paid 05/06: already in
-- Cash 400 - 50 + 300 + 600 + 100 + 300 = 1.650: new clients 350, already in
-- 600, renewals 600, upsells 100.
-- ---------------------------------------------------------------------------
insert into public.clients (id, nome, cognome, fonte) values
  ('61610000-0000-4000-8000-0000000000a0', 'Anna', 'Settimana', 'dm_inbound'),
  ('61610000-0000-4000-8000-0000000000b0', 'Bruno', 'Settimana', 'referral'),
  ('61610000-0000-4000-8000-0000000000c0', 'Carla', 'Settimana', 'ads'),
  ('61610000-0000-4000-8000-0000000000d0', 'Dario', 'Settimana', 'dm_outbound');
insert into public.sales (id, client_id, product_id, tipo, closer_id, data_vendita, data_inizio, valore_contratto, numero_rate) values
  ('61610000-0000-4000-8000-0000000000a1', '61610000-0000-4000-8000-0000000000a0', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   '33333333-3333-4333-8333-333333333333', '2032-06-06', '2032-06-13', 1200, 3),
  ('61610000-0000-4000-8000-0000000000b1', '61610000-0000-4000-8000-0000000000b0', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   '33333333-3333-4333-8333-333333333333', '2032-01-10', '2032-01-10', 900, 3),
  ('61610000-0000-4000-8000-0000000000c1', '61610000-0000-4000-8000-0000000000c0', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   '33333333-3333-4333-8333-333333333333', '2032-06-12', '2032-06-19', 500, 1),
  ('61610000-0000-4000-8000-0000000000d1', '61610000-0000-4000-8000-0000000000d0', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   '33333333-3333-4333-8333-333333333333', '2032-06-04', '2032-06-11', 300, 1);
insert into public.sales (id, client_id, product_id, tipo, closer_id, data_vendita, data_inizio, valore_contratto, numero_rate) values
  ('61610000-0000-4000-8000-0000000000b2', '61610000-0000-4000-8000-0000000000b0', 'aaaaaaa1-0000-4000-8000-000000000001', 'rinnovo',
   '11111111-1111-4111-8111-111111111111', '2032-06-07', '2032-06-20', 600, 1),
  ('61610000-0000-4000-8000-0000000000b3', '61610000-0000-4000-8000-0000000000b0', 'aaaaaaa1-0000-4000-8000-000000000001', 'upsell',
   '11111111-1111-4111-8111-111111111111', '2032-06-11', '2032-06-11', 100, 1);

update public.payments p set stato = 'incassata', incassato_il = v.il::date, importo_incassato = v.importo, metodo = 'bonifico'
from (values
  ('61610000-0000-4000-8000-0000000000a1', 1, '2032-06-06', 400),
  ('61610000-0000-4000-8000-0000000000b1', 1, '2032-01-10', 300),
  ('61610000-0000-4000-8000-0000000000b1', 2, '2032-06-10', 300),
  ('61610000-0000-4000-8000-0000000000b2', 1, '2032-06-07', 600),
  ('61610000-0000-4000-8000-0000000000b3', 1, '2032-06-11', 100),
  ('61610000-0000-4000-8000-0000000000c1', 1, '2032-06-12', 500),
  ('61610000-0000-4000-8000-0000000000d1', 1, '2032-06-05', 300)
) as v(vendita, rata, il, importo)
where p.sale_id = v.vendita::uuid and p.numero_rata = v.rata;
update public.payments p set scadenza = v.scadenza::date
from (values
  ('61610000-0000-4000-8000-0000000000a1', 2, '2032-06-15'),
  ('61610000-0000-4000-8000-0000000000a1', 3, '2032-06-19'),
  ('61610000-0000-4000-8000-0000000000b1', 3, '2032-06-11')
) as v(vendita, rata, scadenza)
where p.sale_id = v.vendita::uuid and p.numero_rata = v.rata;
insert into public.payments (sale_id, numero_rata, scadenza, importo_previsto, incassato_il, importo_incassato, stato)
values ('61610000-0000-4000-8000-0000000000a1', 1, '2032-06-06', 0, '2032-06-09', -50, 'rimborsata');

-- Late clients: nine more with an instalment due on 01/06/2032, and Zeno, the
-- one late the longest (due 01/01/2020) with the highest uuid of all: the
-- list of names takes the 8 late the longest, never the first 8 by uuid.
insert into public.clients (id, nome, cognome, fonte)
select ('61610000-0000-4000-8000-0000000001' || lpad(n::text, 2, '0'))::uuid, 'Ritardo', n::text, 'altro'
from generate_series(1, 9) n;
insert into public.clients (id, nome, cognome, fonte)
values ('ffffffff-ffff-4fff-8fff-ffffffffffff', 'Zeno', 'Ritardo', 'altro');
insert into public.sales (client_id, product_id, tipo, closer_id, data_vendita, data_inizio, valore_contratto, numero_rate)
select c.id, 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo', '33333333-3333-4333-8333-333333333333',
       '2019-12-01', '2019-12-01', 100, 1
from public.clients c where c.cognome = 'Ritardo' or c.nome = 'Ritardo';
update public.payments p set scadenza = case when s.client_id = 'ffffffff-ffff-4fff-8fff-ffffffffffff' then date '2020-01-01' else date '2032-06-01' end
from public.sales s
where s.id = p.sale_id and s.client_id in (select id from public.clients where cognome = 'Ritardo' or nome = 'Ritardo');

-- The setters: DM 10 + 5 + 2 follow up and 3 = 20, conversations 4 + 1 = 5,
-- calls booked 2 + 1 + 1 strategy = 4; the days before and after stay out
insert into public.setter_daily_reports
  (setter_id, data, dm_outbound, dm_inbound, follow_up, conversazioni, discovery_prenotate, strategy_prenotate)
values
  ('22222222-2222-4222-8222-222222222222', '2032-06-04', 70, 0, 0, 30, 5, 0),
  ('22222222-2222-4222-8222-222222222222', '2032-06-05', 10, 5, 2, 4, 2, 0),
  ('22222222-2222-4222-8222-222222222222', '2032-06-11', 3, 0, 0, 1, 1, 1),
  ('22222222-2222-4222-8222-222222222222', '2032-06-12', 100, 0, 0, 50, 9, 0);

-- Calls by their day in Rome: held 05, 08, 11 (23:30); no-show 05 (00:30) and
-- 09; closed 05. The 12th at 00:30 in Rome is still the 11th in UTC: out.
insert into public.leads (id, nome, setter_id, fonte)
values ('61610000-0000-4000-8000-000000000001', 'Lead Settimana', '22222222-2222-4222-8222-222222222222', 'dm_inbound');
insert into public.calls (lead_id, setter_id, closer_id, tipo, programmata_il, stato, qualificata, esito)
select '61610000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
       '33333333-3333-4333-8333-333333333333', 'discovery', v.il::timestamptz, v.stato::public.call_status,
       v.qualificata, v.esito::public.call_outcome
from (values
  ('2032-06-04 18:00+02', 'svolta', true, 'chiusa'),
  ('2032-06-05 00:30+02', 'no_show', null, null),
  ('2032-06-05 20:00+02', 'svolta', true, 'chiusa'),
  ('2032-06-08 18:00+02', 'svolta', true, 'follow_up'),
  ('2032-06-09 18:00+02', 'no_show', null, null),
  ('2032-06-11 23:30+02', 'svolta', false, 'persa'),
  ('2032-06-12 00:30+02', 'svolta', true, 'chiusa')
) as v(il, stato, qualificata, esito);

-- ---------------------------------------------------------------------------
-- Nobody signed in reads it
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok(
  $$ select public.riepilogo_settimana('2032-06-05', '2032-06-11') $$,
  '42501', null,
  'nemmeno l''admin lo legge dall''app: solo il cron'
);
reset role;
set local role anon;
select throws_ok(
  $$ select public.riepilogo_settimana('2032-06-05', '2032-06-11') $$,
  '42501', null,
  'chi non è entrato no'
);

-- ---------------------------------------------------------------------------
-- The cron
-- ---------------------------------------------------------------------------
reset role;
set local role service_role;

create temp table r on commit drop as
select public.riepilogo_settimana('2032-06-05', '2032-06-11') as j;

select is(
  (select array_agg(k order by k) from r, jsonb_object_keys(r.j) k),
  array['a', 'call_prenotate', 'call_svolte', 'cash', 'cash_per_parte', 'chiuse', 'clienti_in_ritardo', 'clienti_in_ritardo_totale',
        'conversazioni', 'da', 'dm_totali', 'in_ritardo', 'in_scadenza_7_giorni', 'incassi', 'no_show', 'vendite', 'vendite_per_tipo'],
  'i campi del riepilogo serale su un intervallo, più conversazioni, call prenotate, no show, le quattro parti del cash e quanti clienti sono in ritardo: solo totali del team'
);
select is(
  (select array[j ->> 'da', j ->> 'a'] from r),
  array['2032-06-05', '2032-06-11'],
  'dice la settimana'
);
select is(
  (select (j ->> 'cash')::numeric from r),
  1650.00,
  'il cash della settimana, rimborso compreso: 1.650'
);
select is(
  (select j -> 'cash_per_parte' from r),
  '{"nuovi_clienti": 350.00, "rate_precedenti": 600.00, "rinnovo": 600.00, "upsell": 100.00}'::jsonb,
  'in quattro parti: nuovi clienti della settimana 350, già entrati 600 (anche chi ha firmato il venerdì prima), rinnovi 600, upsell 100'
);
select is(
  (select array_agg(row(e ->> 'giorno', e ->> 'cliente', (e ->> 'importo')::numeric, e ->> 'parte', (e ->> 'rimborso')::boolean)::text order by n)
   from r, jsonb_array_elements(r.j -> 'incassi') with ordinality as x(e, n)),
  array[
    row('2032-06-05', 'Dario Settimana', 300.00, 'rate_precedenti', false)::text,
    row('2032-06-06', 'Anna Settimana', 400.00, 'nuovi_clienti', false)::text,
    row('2032-06-07', 'Bruno Settimana', 600.00, 'rinnovo', false)::text,
    row('2032-06-09', 'Anna Settimana', -50.00, 'nuovi_clienti', true)::text,
    row('2032-06-10', 'Bruno Settimana', 300.00, 'rate_precedenti', false)::text,
    row('2032-06-11', 'Bruno Settimana', 100.00, 'upsell', false)::text
  ],
  'ogni incasso col suo giorno, dal più vecchio, e la sua parte'
);
select is(
  (select array_agg(row(e ->> 'giorno', e ->> 'cliente', e ->> 'tipo', (e ->> 'valore')::numeric)::text order by n)
   from r, jsonb_array_elements(r.j -> 'vendite') with ordinality as x(e, n)),
  array[
    row('2032-06-06', 'Anna Settimana', 'nuovo', 1200.00)::text,
    row('2032-06-07', 'Bruno Settimana', 'rinnovo', 600.00)::text,
    row('2032-06-11', 'Bruno Settimana', 'upsell', 100.00)::text
  ],
  'ogni vendita col suo giorno, dalla più vecchia: né quella del venerdì prima né quella del sabato dopo'
);
select is(
  (select j -> 'vendite_per_tipo' from r),
  '{"nuovo": 1, "rinnovo": 1, "upsell": 1}'::jsonb,
  'le vendite della settimana per tipo'
);
select is(
  (select j -> 'in_scadenza_7_giorni' from r),
  '{"numero": 1, "totale": 400.00}'::jsonb,
  'in scadenza nei 7 giorni dopo l''ultimo: la rata 2 di A, non la 3 né quella dell''ultimo giorno'
);
select is(
  (select (j -> 'in_ritardo' ->> 'numero')::bigint from r),
  (select count(*) from public.payments where stato = 'prevista' and scadenza < '2032-06-11'),
  'in ritardo: le rate previste scadute prima dell''ultimo giorno'
);
select is(
  (select count(*) from public.payments where stato = 'prevista' and scadenza <= '2032-06-11'),
  (select (j -> 'in_ritardo' ->> 'numero')::bigint + 1 from r),
  'quella che scade l''ultimo giorno non è ancora in ritardo'
);
select is(
  (select (j ->> 'clienti_in_ritardo_totale')::bigint from r),
  (select count(distinct s.client_id) from public.payments p join public.sales s on s.id = p.sale_id
   where p.stato = 'prevista' and p.scadenza < '2032-06-11'),
  'quanti sono i clienti con rate in ritardo, tutti (più di 8)'
);
select is(
  (select array[jsonb_array_length(j -> 'clienti_in_ritardo')::text, j -> 'clienti_in_ritardo' ->> 0] from r),
  array['8', 'Zeno Ritardo'],
  'i nomi sono 8, e il primo è il cliente in ritardo da più tempo, anche con l''uuid più alto'
);
select is(
  (select array_agg(e order by n) from r, jsonb_array_elements_text(r.j -> 'clienti_in_ritardo') with ordinality as x(e, n)),
  (select array_agg(d.nome order by d.scadenza, d.nome) from (
     select x.nome, x.scadenza from (
       select distinct on (s.client_id) concat_ws(' ', cl.nome, cl.cognome) as nome, p.scadenza
       from public.payments p join public.sales s on s.id = p.sale_id join public.clients cl on cl.id = s.client_id
       where p.stato = 'prevista' and p.scadenza < '2032-06-11'
       order by s.client_id, p.scadenza) x
     order by x.scadenza, x.nome limit 8) d),
  'gli 8 in ritardo da più tempo, ognuno con la sua rata più vecchia, dal più vecchio'
);
select is(
  (select array[(j ->> 'dm_totali')::integer, (j ->> 'conversazioni')::integer, (j ->> 'call_prenotate')::integer] from r),
  array[20, 5, 4],
  'dal setting: 20 DM, 5 conversazioni, 4 call prenotate'
);
select is(
  (select array[(j ->> 'call_svolte')::integer, (j ->> 'no_show')::integer, (j ->> 'chiuse')::integer] from r),
  array[3, 2, 1],
  'dalle call, per giorno a Roma: 3 svolte, 2 no show, 1 chiusa'
);

-- one day is a valid interval; 31 days at most
select is(
  (select public.riepilogo_settimana('2032-06-07', '2032-06-07') ->> 'cash')::numeric,
  600.00,
  'un giorno solo è un intervallo'
);
select lives_ok(
  $$ select public.riepilogo_settimana('2032-06-01', '2032-07-01') $$,
  '31 giorni sì'
);
select throws_ok(
  $$ select public.riepilogo_settimana('2032-06-01', '2032-07-02') $$,
  '22023', 'Periodo non valido: al massimo 31 giorni',
  '32 no'
);
select throws_ok(
  $$ select public.riepilogo_settimana('2032-06-11', '2032-06-05') $$,
  '22023', 'Periodo non valido: la data di inizio deve venire prima della fine',
  'la fine prima dell''inizio no'
);
select throws_ok(
  $$ select public.riepilogo_settimana(null, '2032-06-05') $$,
  '22023', null,
  'senza inizio no'
);

select * from finish();
rollback;
