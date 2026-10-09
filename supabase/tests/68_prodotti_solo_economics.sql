-- The product list (list prices, usual instalment plan) only for admin, setter
-- and closer (1.32.0, 20261009120200_prodotti_solo_economics.sql): video
-- editor, marketing and the other Projects roles never see money. Its own file,
-- like its migration (open question 6 of the 1.32.0 spec): both can be left
-- out of a deploy together.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(8);

select policies_are('public', 'products',
  array['products_select_economics', 'products_write_admin'],
  'prodotti: lettura per l''area Economics, scrittura per l''admin');

create temp table tutti_prodotti on commit drop as
select count(*)::integer as n from public.products;
grant select on tutti_prodotti to authenticated;

set local role authenticated;

-- the seed marketing account (supabase/seeds/25_marketing.sql)
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is((select count(*)::integer from public.products), 0, 'il marketing non legge il listino');
set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
select is((select count(*)::integer from public.products), 0, 'il video editor nemmeno');
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select is((select count(*)::integer from public.products), 0, 'né il coach');
set local request.jwt.claims to '{}';
select is((select count(*)::integer from public.products), 0, 'né chi non ha una sessione');

set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select ok((select count(*) from (select id, nome from public.products where attivo) p) > 0,
  'il setter legge ancora i prodotti in vendita');
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select ok((select count(*) from (select id, nome from public.products where attivo) p) > 0,
  'il closer anche (prodotto proposto in call, nuova vendita)');

set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select count(*)::integer from public.products), (select n from tutti_prodotti),
  'l''admin li legge tutti');

reset role;
select * from finish();
rollback;
