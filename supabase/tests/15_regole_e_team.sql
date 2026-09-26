-- Fase 4: commission rule history and team management permissions.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(10);

-- Two cashed "nuovo" sales for the seed setter, one before and one after 2030-01-01
insert into public.clients (id, nome, setter_id, closer_id) values
  ('afaf0000-0000-4000-8000-000000000001', 'Regola Prima', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'),
  ('afaf0000-0000-4000-8000-000000000002', 'Regola Dopo', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333');

insert into public.sales (id, client_id, product_id, tipo, setter_id, closer_id, data_vendita, data_inizio, valore_contratto, numero_rate) values
  ('afaf0000-0000-4000-8000-0000000000a1', 'afaf0000-0000-4000-8000-000000000001', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '2029-12-10', '2029-12-10', 1000, 1),
  ('afaf0000-0000-4000-8000-0000000000b1', 'afaf0000-0000-4000-8000-000000000002', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '2030-02-10', '2030-02-10', 1000, 1);

update public.payments set stato = 'incassata', incassato_il = scadenza, importo_incassato = importo_previsto
where sale_id in ('afaf0000-0000-4000-8000-0000000000a1', 'afaf0000-0000-4000-8000-0000000000b1');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ select public.nuova_regola_provvigione('22222222-2222-4222-8222-222222222222', 0.10, '{nuovo,rinnovo}', '2030-01-01') $$,
  'l''admin crea una nuova regola dal 01/01/2030'
);

select is(
  (select valida_al::text from public.commission_rules
   where profile_id = '22222222-2222-4222-8222-222222222222' and percentuale = 0.05),
  '2029-12-31',
  'la regola precedente si chiude il giorno prima'
);

select is(
  (select array_agg(provvigione order by incassato_il) from public.v_provvigioni_maturate
   where sale_id in ('afaf0000-0000-4000-8000-0000000000a1', 'afaf0000-0000-4000-8000-0000000000b1')),
  array[50.00, 100.00]::numeric[],
  'lo storico non cambia: dicembre al 5%, febbraio al 10%'
);

select throws_ok(
  $$ select public.nuova_regola_provvigione('22222222-2222-4222-8222-222222222222', 0.08, '{nuovo}', '2030-01-01') $$,
  '22023'
);

select throws_ok(
  $$ select public.nuova_regola_provvigione('22222222-2222-4222-8222-222222222222', 1.5, '{nuovo}', '2031-01-01') $$,
  '22023'
);

select throws_ok(
  $$ select public.chiudi_regola_provvigione(
       (select id from public.commission_rules where percentuale = 0.10), '2029-06-30') $$,
  '22023'
);

-- The setter manages nothing
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select throws_ok(
  $$ select public.nuova_regola_provvigione('22222222-2222-4222-8222-222222222222', 0.5, '{nuovo}', '2031-01-01') $$,
  '42501'
);

select throws_ok(
  $$ insert into public.invites (email, ruolo) values ('amico@alpha.test', 'admin') $$,
  '42501'
);

-- Team: the admin changes someone else's role and deactivates them
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ update public.profiles set ruolo = 'coach' where id = '33333333-3333-4333-8333-333333333333' $$,
  'l''admin cambia il ruolo di un collaboratore'
);

select lives_ok(
  $$ update public.profiles set attivo = false where id = '33333333-3333-4333-8333-333333333333' $$,
  'l''admin disattiva un collaboratore'
);

select * from finish();
rollback;
