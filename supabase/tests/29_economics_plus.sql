-- Targets, cash forecast, money by source, evening summary: in SQL, admin only.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(13);

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

-- targets: the admin sets them, the month's numbers come from payments and sales
select lives_ok(
  $$ insert into public.obiettivi_mese (mese, cash, nuovi_clienti) values (date_trunc('month', public.oggi())::date, 10000, 4) $$,
  'l''admin imposta gli obiettivi del mese'
);
select throws_ok(
  $$ insert into public.obiettivi_mese (mese, cash) values (date_trunc('month', public.oggi())::date + 3, 1) $$,
  '23514', null,
  'il mese è sempre il primo giorno'
);
select is(
  (select row(obiettivo_cash, obiettivo_nuovi)::text from public.avanzamento_obiettivi(public.oggi())),
  '(10000.00,4)',
  'l''avanzamento riporta gli obiettivi'
);
select is(
  (select cash from public.avanzamento_obiettivi(public.oggi())),
  (select cash_incassato from public.metriche_periodo(date_trunc('month', public.oggi())::date,
     (date_trunc('month', public.oggi()) + interval '1 month - 1 day')::date)),
  'e il cash del mese è lo stesso della panoramica'
);

-- forecast: the current month, then the next ones; late instalments apart
select is(
  (select count(*)::integer from public.previsione_cassa(3)),
  3,
  'tre mesi di previsione'
);
select is(
  (select in_ritardo from public.previsione_cassa(3) order by mese limit 1),
  (select coalesce(sum(importo_previsto), 0)::numeric(12, 2) from public.payments where stato = 'prevista' and scadenza < public.oggi()),
  'il ritardo è a parte, sul mese corrente'
);
select is(
  (select sum(previsto) from public.previsione_cassa(3)),
  (select coalesce(sum(importo_previsto), 0)::numeric from public.payments
    where stato = 'prevista' and scadenza >= public.oggi()
      and scadenza < (date_trunc('month', public.oggi()) + interval '3 months')::date),
  'il previsto somma le rate dei tre mesi, da oggi in poi'
);

-- by source: the cash split adds up to the cash of the period
select is(
  (select sum(cash) from public.metriche_per_fonte(date_trunc('month', public.oggi())::date, public.oggi())),
  (select cash_incassato from public.metriche_periodo(date_trunc('month', public.oggi())::date, public.oggi())),
  'il cash per fonte fa il cash del periodo'
);
select is(
  (select round(sum(quota_cash), 2) from public.metriche_per_fonte(date_trunc('month', public.oggi())::date, public.oggi())),
  case when (select cash_incassato from public.metriche_periodo(date_trunc('month', public.oggi())::date, public.oggi())) = 0
    then null else 1.00 end,
  'le quote per fonte fanno il 100% del cash'
);
select is(
  (select count(*)::integer from public.metriche_per_fonte('1990-01-01', '1990-01-31') where quota_cash is not null),
  0,
  'senza incassi nessuna quota (mai divisione per zero)'
);

-- the evening summary: only the service role (the cron)
select throws_ok(
  $$ select public.riepilogo_serale(public.oggi()) $$,
  '42501', null,
  'un utente non legge il riepilogo serale'
);

-- nobody else
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok(
  $$ select * from public.previsione_cassa(3) $$,
  '42501', null,
  'il setter non vede la previsione di cassa'
);
select is(
  (select count(*)::integer from public.obiettivi_mese),
  0,
  'né gli obiettivi'
);

select * from finish();
rollback;
