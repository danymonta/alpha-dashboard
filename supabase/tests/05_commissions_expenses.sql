-- Commissions and costs: percentages and margin are the admin's business only.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(8);

insert into public.commission_payouts (profile_id, periodo, importo, pagato_il)
values (
  '33333333-3333-4333-8333-333333333333',
  date_trunc('month', public.oggi())::date,
  120.00,
  public.oggi()
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.commission_rules),
  0,
  'il setter non vede la propria percentuale provvigionale'
);

select ok(
  (select count(*) from public.commission_payouts) > 0,
  'il setter vede i propri pagamenti di provvigione'
);

select is(
  (select count(*)::int from public.commission_payouts
   where profile_id <> '22222222-2222-4222-8222-222222222222'),
  0,
  'il setter non vede le provvigioni di un altro collaboratore'
);

select is(
  (select count(*)::int from public.expenses),
  0,
  'il setter non vede alcun costo'
);

set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

select is(
  (select count(*)::int from public.expenses),
  0,
  'il closer non vede alcun costo'
);

select is(
  (select count(*)::int from public.commission_payouts
   where profile_id <> '33333333-3333-4333-8333-333333333333'),
  0,
  'il closer non vede le provvigioni del setter'
);

set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select ok(
  (select count(*) from public.expenses) > 0,
  'l''admin vede i costi'
);

select ok(
  (select count(*) from public.commission_rules) > 0,
  'l''admin vede le regole provvigionali'
);

select * from finish();
rollback;
