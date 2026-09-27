-- A client who stops early: the preview changes nothing, the real run ends the
-- sale and, if asked, drops the unpaid instalments after that day; cash stays.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(12);

-- a 6 × 250 sale from 1 June: three paid, three to come
insert into public.clients (id, nome, created_by)
values ('cccccccc-0000-4000-8000-000000000032', 'Cliente Interrotto', '11111111-1111-4111-8111-111111111111');
insert into public.sales (id, client_id, product_id, tipo, data_vendita, data_inizio, valore_contratto, numero_rate, created_by)
select 'dddddddd-0000-4000-8000-000000000032', 'cccccccc-0000-4000-8000-000000000032', p.id, 'nuovo',
  '2026-06-01', '2026-06-01', 1500, 6, '11111111-1111-4111-8111-111111111111'
from public.products p where p.nome = 'Percorso Alpha 6 mesi';
update public.payments set stato = 'incassata', incassato_il = scadenza, importo_incassato = importo_previsto
where sale_id = 'dddddddd-0000-4000-8000-000000000032' and numero_rata <= 3;

-- sold on 10 June, started on 1 June: nothing paid, every instalment after the 5th
insert into public.sales (id, client_id, product_id, tipo, data_vendita, data_inizio, valore_contratto, numero_rate, created_by)
select 'dddddddd-0000-4000-8000-000000000033', 'cccccccc-0000-4000-8000-000000000032', p.id, 'nuovo',
  '2026-06-10', '2026-06-01', 1500, 6, '11111111-1111-4111-8111-111111111111'
from public.products p where p.nome = 'Percorso Alpha 6 mesi';

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

-- preview: what would go, nothing changes
select is(
  (select row(rate_tolte, importo_tolto, valore_dopo, rate_restanti)::text
     from public.interrompi_percorso('dddddddd-0000-4000-8000-000000000032', '2026-08-15', true)),
  '(3,750.00,750.00,3)',
  'l''anteprima dice 3 rate e 750 € da togliere'
);
select is(
  (select count(*)::integer from public.payments where sale_id = 'dddddddd-0000-4000-8000-000000000032'),
  6,
  'e non cambia niente'
);

-- keeping the instalments: only the end date moves
select is(
  (select row(rate_tolte, valore_dopo)::text
     from public.interrompi_percorso('dddddddd-0000-4000-8000-000000000032', '2026-08-31', false, true)),
  '(0,1500.00)',
  'tenendo le rate il contratto resta'
);
select is(
  (select data_fine from public.sales where id = 'dddddddd-0000-4000-8000-000000000032'),
  '2026-08-31'::date,
  'il percorso finisce nel giorno scelto'
);

-- dropping them: after the day, only the unpaid ones
select lives_ok(
  $$ select * from public.interrompi_percorso('dddddddd-0000-4000-8000-000000000032', '2026-08-15', true, true) $$,
  'interrompe togliendo le rate'
);
select is(
  (select count(*)::integer from public.payments where sale_id = 'dddddddd-0000-4000-8000-000000000032'),
  3,
  'restano le 3 rate pagate'
);
select is(
  (select count(*)::integer from public.payments where sale_id = 'dddddddd-0000-4000-8000-000000000032' and stato = 'incassata'),
  3,
  'gli incassi non si toccano'
);
select is(
  (select row(valore_contratto, numero_rate, data_fine)::text from public.sales where id = 'dddddddd-0000-4000-8000-000000000032'),
  '(750.00,3,2026-08-15)',
  'contratto, numero di rate e fine tornano col piano'
);

-- guards
select throws_ok(
  $$ select * from public.interrompi_percorso('dddddddd-0000-4000-8000-000000000032', '2027-12-31', false) $$,
  '22023', null,
  'l''ultimo giorno sta dentro il percorso'
);
select throws_ok(
  $$ select * from public.interrompi_percorso('dddddddd-0000-4000-8000-000000000033', '2026-06-05', true) $$,
  '22023', null,
  'se non resterebbe nessuna rata si elimina la vendita, non si interrompe'
);

set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok(
  $$ select * from public.interrompi_percorso('dddddddd-0000-4000-8000-000000000032', '2026-08-01', false) $$,
  '42501', null,
  'solo l''admin'
);
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select throws_ok(
  $$ select * from public.interrompi_percorso('dddddddd-0000-4000-8000-000000000032', '2026-08-01', false) $$,
  '42501', null,
  'nemmeno il closer'
);

select * from finish();
rollback;
