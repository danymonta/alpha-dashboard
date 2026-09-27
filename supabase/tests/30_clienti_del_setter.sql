-- The setter sees his own clients' sales and instalments, with his commission;
-- nobody else's, and no other role goes through this door.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(9);

-- a rule for the seed setter, so commissions are there to compare
insert into public.commission_rules (profile_id, percentuale, applica_a, valida_dal)
select '22222222-2222-4222-8222-222222222222', 0.05, '{nuovo}', '2000-01-01'
where not exists (select 1 from public.commission_rules where profile_id = '22222222-2222-4222-8222-222222222222');

-- what the setter should see, read with full rights before switching role
create temp table atteso on commit drop as
select
  (select count(*) from public.payments p join public.sales s on s.id = p.sale_id
    where s.setter_id = '22222222-2222-4222-8222-222222222222')::integer as righe,
  (select coalesce(sum(v.provvigione), 0) from public.v_provvigioni_maturate v
    where v.profile_id = '22222222-2222-4222-8222-222222222222') as provvigioni,
  (select coalesce(sum(p.importo_incassato), 0) from public.payments p join public.sales s on s.id = p.sale_id
    where s.setter_id = '22222222-2222-4222-8222-222222222222' and p.stato in ('incassata', 'rimborsata')) as incassato;
create temp table vendite_sue on commit drop as
select s.id from public.sales s where s.setter_id = '22222222-2222-4222-8222-222222222222';
grant select on atteso, vendite_sue to authenticated;

set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select cmp_ok((select righe from atteso), '>', 0, 'il setter del seed ha vendite con rate');
select is(
  (select count(*)::integer from public.mie_vendite_setter()),
  (select righe from atteso),
  'il setter vede tutte le rate delle sue vendite'
);
select is(
  (select count(*)::integer from public.mie_vendite_setter() m
    where m.sale_id not in (select id from vendite_sue)),
  0,
  'e nessuna vendita di altri'
);
select is(
  (select coalesce(sum(provvigione), 0) from public.mie_vendite_setter()),
  (select provvigioni from atteso),
  'la provvigione per incasso è la stessa della pagina Provvigioni'
);
select is(
  (select coalesce(sum(distinct_incassato), 0) from (
     select distinct on (sale_id) incassato_vendita as distinct_incassato from public.mie_vendite_setter()) x),
  (select incassato from atteso),
  'l''incassato per vendita somma gli incassi delle sue vendite'
);
select is(
  (select count(*)::integer from public.mie_vendite_setter() where provvigione is not null and stato = 'prevista'),
  0,
  'una rata non ancora pagata non dà provvigione'
);

-- nobody else
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select throws_ok($$ select * from public.mie_vendite_setter() $$, '42501', null, 'il closer non passa di qui');
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$ select * from public.mie_vendite_setter() $$, '42501', null, 'l''admin ha le sue pagine, non questa');

reset role;
set local role anon;
select throws_ok($$ select * from public.mie_vendite_setter() $$, '42501', null, 'chi non è entrato non la chiama');

select * from finish();
rollback;
