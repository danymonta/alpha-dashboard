-- Client lifetime value, monthly costs, recurring copy.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(10);

-- A client with two sales: 1.500 cashed, 900 with 300 cashed and a 100 refund
insert into public.clients (id, nome, cognome, setter_id, closer_id)
values ('bbbb0000-0000-4000-8000-000000000001', 'Valore', 'Cliente',
        '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333');

insert into public.sales (id, client_id, product_id, tipo, closer_id, data_vendita, data_inizio,
                          valore_contratto, numero_rate)
values
  ('bbbb0000-0000-4000-8000-000000000011', 'bbbb0000-0000-4000-8000-000000000001',
   'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo', '33333333-3333-4333-8333-333333333333',
   '2030-01-10', '2030-01-10', 1500, 1),
  ('bbbb0000-0000-4000-8000-000000000012', 'bbbb0000-0000-4000-8000-000000000001',
   'aaaaaaa1-0000-4000-8000-000000000001', 'rinnovo', '33333333-3333-4333-8333-333333333333',
   '2030-04-10', '2030-04-10', 900, 3);

update public.payments set stato = 'incassata', incassato_il = scadenza, importo_incassato = importo_previsto
where sale_id = 'bbbb0000-0000-4000-8000-000000000011'
   or (sale_id = 'bbbb0000-0000-4000-8000-000000000012' and numero_rata = 1);

insert into public.payments (sale_id, numero_rata, scadenza, importo_previsto, incassato_il, importo_incassato, stato)
values ('bbbb0000-0000-4000-8000-000000000012', 1, '2030-04-10', 0, '2030-04-20', -100, 'rimborsata');

select is(
  (select array[valore_firmato, incassato, da_incassare]
   from public.v_clienti where client_id = 'bbbb0000-0000-4000-8000-000000000001'),
  array[2400.00, 1700.00, 600.00]::numeric[],
  'valore firmato 2.400, LTV al netto del rimborso 1.700, da incassare 600'
);

select is(
  (select numero_vendite from public.v_clienti where client_id = 'bbbb0000-0000-4000-8000-000000000001'),
  2::bigint,
  'due vendite'
);

-- Costs in a clean month (2030-02) and a recurring one from January
insert into public.expenses (data, categoria, descrizione, importo, ricorrente) values
  ('2030-01-31', 'team', 'Compenso coach', 600, true),
  ('2030-01-15', 'ads', 'Campagna gennaio', 250, false),
  ('2030-02-03', 'software', 'Hosting', 89, true),
  ('2030-02-20', 'software', 'Email', 11, false);

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select is(
  (select array[categoria::text, totale::text, numero::text]
   from public.riepilogo_costi('2030-02-01') where categoria = 'software'),
  array['software', '100.00', '2'],
  'riepilogo per categoria del mese'
);

select is(
  (select totale::text from public.riepilogo_costi('2030-02-01') where categoria is null),
  '100.00',
  'la riga senza categoria è il totale del mese, calcolato in SQL'
);

select is(public.copia_costi_ricorrenti('2030-02-01'), 1, 'copia solo i ricorrenti del mese prima');

select is(
  (select data::text from public.expenses where descrizione = 'Compenso coach' and data >= '2030-02-01'),
  '2030-02-28',
  'il 31 gennaio diventa l''ultimo giorno di febbraio'
);

select is(public.copia_costi_ricorrenti('2030-02-01'), 0, 'rilanciata non duplica');

-- The client summary of the closer only covers his own sales
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

select is(
  (select incassato from public.v_clienti where client_id = 'bbbb0000-0000-4000-8000-000000000001'),
  1700.00::numeric,
  'il closer vede il valore dei suoi clienti'
);

select throws_ok($$ select * from public.riepilogo_costi('2030-02-01') $$, '42501');

-- The setter reads no client row at all (contacts live there)
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select is((select count(*)::int from public.v_clienti), 0, 'il setter non vede il valore dei clienti');

select * from finish();
rollback;
