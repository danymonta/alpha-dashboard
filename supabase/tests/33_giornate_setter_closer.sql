-- Setter and closer day by day: totals match the official metrics, everyone
-- sees only their own half, the wrong roles are refused.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(14);

-- what each role should get, read with full rights before switching role
create temp table atteso on commit drop as
select
  (select count(*) from public.calls c
    where c.stato = 'svolta' and (c.programmata_il at time zone 'Europe/Rome')::date between '2026-01-01' and '2026-12-31')::integer as call_tutte,
  (select count(*) from public.calls c
    where c.stato = 'svolta' and c.closer_id = '33333333-3333-4333-8333-333333333333'
      and (c.programmata_il at time zone 'Europe/Rome')::date between '2026-01-01' and '2026-12-31')::integer as call_closer,
  (select coalesce(sum(p.importo_incassato), 0) from public.payments p join public.sales s on s.id = p.sale_id
    where p.stato in ('incassata', 'rimborsata') and s.closer_id = '33333333-3333-4333-8333-333333333333'
      and p.incassato_il between '2026-01-01' and '2026-12-31') as cash_closer,
  (select coalesce(sum(r.dm_outbound), 0) from public.setter_daily_reports r
    where r.setter_id = '22222222-2222-4222-8222-222222222222' and r.data between '2026-01-01' and '2026-12-31')::integer as dm_out_setter,
  (select count(*) from public.calls c
    where c.stato = 'svolta' and c.setter_id = '22222222-2222-4222-8222-222222222222'
      and (c.programmata_il at time zone 'Europe/Rome')::date between '2026-01-01' and '2026-12-31')::integer as call_setter,
  (select coalesce(sum(p.importo_incassato), 0) from public.payments p join public.sales s on s.id = p.sale_id
    where p.stato in ('incassata', 'rimborsata') and s.setter_id = '22222222-2222-4222-8222-222222222222'
      and p.incassato_il between '2026-01-01' and '2026-12-31') as cash_setter;
grant select on atteso to authenticated;

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
  (select row(cash_incassato, revenue_firmata)::text from public.metriche_periodo('2026-01-01', '2026-12-31')),
  'cash e revenue sono quelli della Panoramica'
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

-- nobody else
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select throws_ok($$ select * from public.giornate_closer('2026-01-01', '2026-12-31') $$, '42501', null, 'il coach no');
reset role;
set local role anon;
select throws_ok($$ select * from public.giornate_setter('2026-01-01', '2026-12-31') $$, '42501', null, 'chi non è entrato no');

select * from finish();
rollback;
