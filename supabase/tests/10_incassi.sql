-- Registrazione incasso: money summary, one-tap cash-in, refunds, closer guard.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(16);

-- Fixture (as postgres): 900 € in 3 instalments, two already overdue
insert into public.clients (id, nome, cognome, setter_id, closer_id)
values ('dddd0000-0000-4000-8000-000000000001', 'Incasso', 'Prova',
        '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333');

insert into public.sales (id, client_id, product_id, tipo, setter_id, closer_id,
                          data_vendita, data_inizio, valore_contratto, numero_rate)
values ('eeee0000-0000-4000-8000-000000000001', 'dddd0000-0000-4000-8000-000000000001',
        'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
        '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333',
        public.oggi() - 45, public.oggi() - 45, 900, 3);

-- a sale of the admin, to prove the closer cannot touch it
insert into public.sales (id, client_id, product_id, tipo, closer_id,
                          data_vendita, data_inizio, valore_contratto, numero_rate)
values ('eeee0000-0000-4000-8000-000000000002', 'dddd0000-0000-4000-8000-000000000001',
        'aaaaaaa1-0000-4000-8000-000000000001', 'upsell',
        '11111111-1111-4111-8111-111111111111', public.oggi() - 5, public.oggi() - 5, 300, 1);

create temp table rate on commit drop as
select numero_rata, id from public.payments
where sale_id = 'eeee0000-0000-4000-8000-000000000001';
grant select on rate to authenticated;

select is(
  (select array[totale_piano, scarto_piano, incassato, da_incassare, in_ritardo]
   from public.v_vendite where sale_id = 'eeee0000-0000-4000-8000-000000000001'),
  array[900.00, 0.00, 0.00, 900.00, 600.00]::numeric[],
  'v_vendite: piano, scarto, incassato, da incassare, in ritardo'
);

select is(
  (select rate_in_ritardo from public.v_vendite where sale_id = 'eeee0000-0000-4000-8000-000000000001'),
  2,
  'due rate su tre sono in ritardo'
);

-- ---------------------------------------------------------------------------
-- The closer records the cash of his own sale in one tap
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

select is(
  (select array[importo_registrato::text, (data_registrata = public.oggi())::text]
   from public.segna_rata_incassata((select id from rate where numero_rata = 1))),
  array['300.00', 'true'],
  'un tocco: importo previsto e data di oggi'
);

select is(
  (select array[incassato, in_ritardo] from public.v_vendite
   where sale_id = 'eeee0000-0000-4000-8000-000000000001'),
  array[300.00, 300.00]::numeric[],
  'dopo l''incasso: 300 incassati, 300 ancora in ritardo'
);

select throws_ok(
  $$ select * from public.segna_rata_incassata((select id from rate where numero_rata = 1)) $$,
  '22023'
);

select throws_ok(
  $$ select * from public.segna_rata_incassata((select id from rate where numero_rata = 2), public.oggi() + 1) $$,
  '22023'
);

select lives_ok(
  $$ select * from public.segna_rata_incassata((select id from rate where numero_rata = 2), public.oggi() - 3, 280, 'bonifico') $$,
  'si può registrare un incasso con data, importo e metodo diversi'
);

select is(
  (select array[importo_incassato::text, metodo::text, (incassato_il = public.oggi() - 3)::text]
   from public.payments where id = (select id from rate where numero_rata = 2)),
  array['280.00', 'bonifico', 'true'],
  'importo parziale, metodo e data restano quelli dichiarati'
);

select throws_ok(
  $$ update public.payments set importo_previsto = 250
     where id = (select id from rate where numero_rata = 3) $$,
  '42501'
);

select throws_ok(
  $$ select * from public.segna_rata_incassata(
       (select id from public.payments where sale_id = 'eeee0000-0000-4000-8000-000000000002')) $$,
  '22023'
);

select throws_ok(
  $$ select public.registra_rimborso((select id from rate where numero_rata = 1), public.oggi(), 100) $$,
  '42501'
);

-- ---------------------------------------------------------------------------
-- The admin: refunds and plan changes
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ select public.registra_rimborso((select id from rate where numero_rata = 1), public.oggi(), 100, 'recesso') $$,
  'l''admin registra un rimborso parziale'
);

select is(
  (select incassato from public.v_vendite where sale_id = 'eeee0000-0000-4000-8000-000000000001'),
  480.00::numeric,
  'l''incassato è al netto del rimborso (300 + 280 - 100)'
);

select throws_ok(
  $$ select public.registra_rimborso((select id from rate where numero_rata = 1), public.oggi(), 250) $$,
  '22023'
);

update public.payments set importo_previsto = 250
where id = (select id from rate where numero_rata = 3);

select is(
  (select scarto_piano from public.v_vendite where sale_id = 'eeee0000-0000-4000-8000-000000000001'),
  50.00::numeric,
  'se l''admin cambia una rata, la view mostra lo scarto dal contratto'
);

-- ---------------------------------------------------------------------------
-- The setter sees no sale summary at all
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select is(
  (select count(*)::int from public.v_vendite),
  0,
  'il setter non vede nessun riepilogo di vendita'
);

select * from finish();
rollback;
