-- Commission per sale: the admin sees it, summed like the monthly page; nobody else.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(5);

insert into public.commission_rules (profile_id, percentuale, applica_a, valida_dal)
select '22222222-2222-4222-8222-222222222222', 0.05, '{nuovo}', '2000-01-01'
where not exists (select 1 from public.commission_rules where profile_id = '22222222-2222-4222-8222-222222222222');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select cmp_ok((select count(*)::integer from public.provvigioni_per_vendita()), '>', 0, 'l''admin vede le provvigioni per vendita');
select is(
  (select sum(provvigione) from public.provvigioni_per_vendita()),
  (select sum(provvigione) from public.v_provvigioni_maturate),
  'sommano come le provvigioni maturate'
);
select is(
  (select count(*)::integer from public.provvigioni_per_vendita(
     (select sale_id from public.v_provvigioni_maturate order by incassato_il desc limit 1))),
  1,
  'con una vendita, solo quella'
);
select is(
  (select count(*)::integer from public.provvigioni_per_vendita() where percentuale is distinct from 0.05),
  0,
  'la percentuale della regola, per ogni vendita'
);

set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok($$ select * from public.provvigioni_per_vendita() $$, '42501', null, 'il setter usa i suoi clienti, non questa');

select * from finish();
rollback;
