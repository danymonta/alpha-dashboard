-- Setter and closer day by day: everyone sees only their own half, the wrong
-- roles are refused; cash and revenue are the new clients only (29/09/2026):
-- the first instalment of the new sales on the day of the sale, their contracts.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(19);

-- what each role should get, read with full rights before switching role
create temp table atteso on commit drop as
select
  (select count(*) from public.calls c
    where c.stato = 'svolta' and (c.programmata_il at time zone 'Europe/Rome')::date between '2026-01-01' and '2026-12-31')::integer as call_tutte,
  (select count(*) from public.calls c
    where c.stato = 'svolta' and c.closer_id = '33333333-3333-4333-8333-333333333333'
      and (c.programmata_il at time zone 'Europe/Rome')::date between '2026-01-01' and '2026-12-31')::integer as call_closer,
  (select coalesce(sum(p.importo_incassato), 0) from public.payments p join public.sales s on s.id = p.sale_id
    where s.tipo = 'nuovo' and p.numero_rata = 1 and p.stato = 'incassata'
      and s.closer_id = '33333333-3333-4333-8333-333333333333'
      and s.data_vendita between '2026-01-01' and '2026-12-31') as cash_closer,
  (select coalesce(sum(p.importo_incassato), 0) from public.payments p join public.sales s on s.id = p.sale_id
    where s.tipo = 'nuovo' and p.numero_rata = 1 and p.stato = 'incassata'
      and s.data_vendita between '2026-01-01' and '2026-12-31') as cash_nuovi,
  (select coalesce(sum(s.valore_contratto), 0) from public.sales s
    where s.tipo = 'nuovo' and s.data_vendita between '2026-01-01' and '2026-12-31') as revenue_nuovi,
  (select coalesce(sum(r.dm_outbound), 0) from public.setter_daily_reports r
    where r.setter_id = '22222222-2222-4222-8222-222222222222' and r.data between '2026-01-01' and '2026-12-31')::integer as dm_out_setter,
  (select count(*) from public.calls c
    where c.stato = 'svolta' and c.setter_id = '22222222-2222-4222-8222-222222222222'
      and (c.programmata_il at time zone 'Europe/Rome')::date between '2026-01-01' and '2026-12-31')::integer as call_setter,
  (select coalesce(sum(p.importo_incassato), 0) from public.payments p join public.sales s on s.id = p.sale_id
    where s.tipo = 'nuovo' and p.numero_rata = 1 and p.stato = 'incassata'
      and s.setter_id = '22222222-2222-4222-8222-222222222222'
      and s.data_vendita between '2026-01-01' and '2026-12-31') as cash_setter;
grant select on atteso to authenticated;

-- a quiet month with known numbers: a new client who pays the first instalment
-- two days after the sale and the second one a month later, and his renewal
create temp table prova on commit drop as
select gen_random_uuid() as cliente, gen_random_uuid() as nuova, gen_random_uuid() as rinnovo;
insert into public.clients (id, nome, fonte, setter_id, closer_id)
select cliente, 'Prova giornate', 'dm_outbound', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333' from prova;
insert into public.sales (id, client_id, product_id, tipo, setter_id, closer_id, data_vendita, data_inizio, valore_contratto, numero_rate)
select nuova, cliente, 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
  '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '2025-03-10', '2025-03-10', 1500, 3 from prova;
update public.payments set stato = 'incassata', incassato_il = '2025-03-12', importo_incassato = 500, metodo = 'bonifico'
where sale_id = (select nuova from prova) and numero_rata = 1;
update public.payments set stato = 'incassata', incassato_il = '2025-04-10', importo_incassato = 500, metodo = 'bonifico'
where sale_id = (select nuova from prova) and numero_rata = 2;
insert into public.sales (id, client_id, product_id, tipo, setter_id, closer_id, data_vendita, data_inizio, valore_contratto, numero_rate)
select rinnovo, cliente, 'aaaaaaa1-0000-4000-8000-000000000001', 'rinnovo',
  '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '2025-04-10', '2025-06-10', 900, 1 from prova;
update public.payments set stato = 'incassata', incassato_il = '2025-04-10', importo_incassato = 900, metodo = 'bonifico'
where sale_id = (select rinnovo from prova);
grant select on prova to authenticated;

set local role authenticated;

-- admin: the closer's day for everyone, totals as the official metrics
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select cmp_ok((select call_tutte from atteso), '>', 0, 'il seed ha call svolte nell''anno');
select is(
  (select call from public.giornate_closer('2026-01-01', '2026-12-31') where data is null),
  (select call_tutte from atteso),
  'l''admin vede tutte le call svolte'
);
select is(
  (select row(cash, revenue)::text from public.giornate_closer('2026-01-01', '2026-12-31') where data is null),
  (select row(cash_nuovi, revenue_nuovi)::text from atteso),
  'cash e revenue sono quelli dei clienti nuovi: prima rata e contratti delle vendite nuove'
);
select is(
  (select sum(call)::integer from public.giornate_closer('2026-01-01', '2026-12-31') where data is not null),
  (select call from public.giornate_closer('2026-01-01', '2026-12-31') where data is null),
  'la riga del totale è la somma dei giorni'
);
select is(
  (select count(*)::integer from public.giornate_closer('2026-01-01', '2026-12-31')
    where data is not null and call + no_show + cancellate = 0 and cash = 0 and revenue = 0),
  0,
  'solo giorni in cui è successo qualcosa'
);
select is(
  (select row(dm_outbound, closer_call, cash)::text from public.giornate_setter('2026-01-01', '2026-12-31', '22222222-2222-4222-8222-222222222222') where data is null),
  (select row(dm_out_setter, call_setter, cash_setter)::text from atteso),
  'l''admin vede la giornata di un setter'
);
-- the new client's first instalment lands on the day of the sale; the second
-- instalment and the renewal stay out (Incassi and Panoramica count them)
select is(
  (select array_agg(row(data, cash, revenue)::text order by data nulls first)
   from public.giornate_closer('2025-03-01', '2025-04-30', '33333333-3333-4333-8333-333333333333')),
  array[row(null::date, 500.00, 1500.00)::text, row('2025-03-10'::date, 500.00, 1500.00)::text],
  'closer: la prima rata sul giorno della vendita nuova, niente rate successive né rinnovi'
);
select is(
  (select array_agg(row(data, cash, revenue)::text order by data nulls first)
   from public.giornate_setter('2025-03-01', '2025-04-30', '22222222-2222-4222-8222-222222222222')),
  array[row(null::date, 500.00, 1500.00)::text, row('2025-03-10'::date, 500.00, 1500.00)::text],
  'setter: lo stesso, solo per il cliente nuovo che ha portato'
);
select is(
  (select count(*)::integer from public.giornate_closer('2025-03-11', '2025-04-30', '33333333-3333-4333-8333-333333333333')
    where data is not null),
  0,
  'un giorno con solo una rata successiva o un rinnovo non compare'
);
select is(
  (select cash_incassato from public.metriche_periodo('2025-03-01', '2025-04-30')),
  1900.00,
  'la Panoramica invece conta tutti gli incassi del periodo: rate e rinnovi compresi'
);


-- the closer: only his own calls and sales, whatever he asks
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(
  (select row(call, cash)::text from public.giornate_closer('2026-01-01', '2026-12-31', null) where data is null),
  (select row(call_closer, cash_closer)::text from atteso),
  'il closer vede solo le sue call e i suoi incassi'
);
select is(
  (select call from public.giornate_closer('2026-01-01', '2026-12-31', '11111111-1111-4111-8111-111111111111') where data is null),
  (select call_closer from atteso),
  'e non può chiedere quelli di un altro'
);
select throws_ok(
  $$ select * from public.giornate_setter('2026-01-01', '2026-12-31') $$,
  '42501', null,
  'il closer non vede le giornate del setter'
);

-- the setter: his report, the closer on his calls, the money of his clients
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(
  (select row(dm_outbound, closer_call, cash)::text from public.giornate_setter('2026-01-01', '2026-12-31') where data is null),
  (select row(dm_out_setter, call_setter, cash_setter)::text from atteso),
  'il setter vede il suo setting, il closer sulle sue call e i soldi dei suoi clienti'
);
select is(
  (select row(dm_outbound, closer_call, cash)::text from public.giornate_setter('2026-01-01', '2026-12-31', '11111111-1111-4111-8111-111111111111') where data is null),
  (select row(dm_out_setter, call_setter, cash_setter)::text from atteso),
  'e non può chiedere quella di un altro'
);
select throws_ok(
  $$ select * from public.giornate_closer('2026-01-01', '2026-12-31') $$,
  '42501', null,
  'il setter non vede la giornata intera del closer'
);
select is(
  (select row(cash, revenue)::text from public.giornate_setter('2025-03-01', '2025-04-30', '11111111-1111-4111-8111-111111111111') where data is null),
  row(500.00, 1500.00)::text,
  'chiedendo i giorni di un altro, il setter riceve solo i soldi dei suoi clienti nuovi'
);

-- nobody else
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select throws_ok($$ select * from public.giornate_closer('2026-01-01', '2026-12-31') $$, '42501', null, 'il coach no');
reset role;
set local role anon;
select throws_ok($$ select * from public.giornate_setter('2026-01-01', '2026-12-31') $$, '42501', null, 'chi non è entrato no');

select * from finish();
rollback;
