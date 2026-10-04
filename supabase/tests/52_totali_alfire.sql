-- The two totals Alfire reads (04/10/2026): the closer's still-to-collect,
-- split as "Da incassare" (overdue, next 30 days, later), and what the setter's
-- clients paid in a period with the commission on it. Each one only his own:
-- a second setter and a second closer are never counted for anybody else.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(24);

-- A second closer and a second setter, invited like everyone else
insert into public.invites (email, ruolo) values
  ('closer52@alpha.test', 'closer'),
  ('setter52@alpha.test', 'setter');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999990052',
   'authenticated', 'authenticated', 'closer52@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Closer Cinquantadue"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999990053',
   'authenticated', 'authenticated', 'setter52@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Setter Cinquantadue"}'::jsonb, now(), now(), '', '', '', '');

-- ---------------------------------------------------------------------------
-- The closer: two sales of the second closer, with known instalments
-- ---------------------------------------------------------------------------
insert into public.clients (id, nome, fonte, closer_id) values
  ('52520000-0000-4000-8000-0000000000c1', 'Cliente Closer52', 'organico', '99999999-9999-4999-8999-999999990052');
insert into public.sales (id, client_id, product_id, tipo, closer_id, data_vendita, data_inizio, valore_contratto, numero_rate) values
  ('52520000-0000-4000-8000-0000000000c2', '52520000-0000-4000-8000-0000000000c1', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   '99999999-9999-4999-8999-999999990052', public.oggi() - 10, public.oggi() - 10, 1200, 4),
  ('52520000-0000-4000-8000-0000000000c3', '52520000-0000-4000-8000-0000000000c1', 'aaaaaaa1-0000-4000-8000-000000000001', 'upsell',
   '99999999-9999-4999-8999-999999990052', public.oggi() - 10, public.oggi() - 10, 600, 2);
-- 300 each: one overdue, two in the next 30 days (today and the 30th day), one later
update public.payments set scadenza = public.oggi() - 5 where sale_id = '52520000-0000-4000-8000-0000000000c2' and numero_rata = 1;
update public.payments set scadenza = public.oggi() where sale_id = '52520000-0000-4000-8000-0000000000c2' and numero_rata = 2;
update public.payments set scadenza = public.oggi() + 30 where sale_id = '52520000-0000-4000-8000-0000000000c2' and numero_rata = 3;
update public.payments set scadenza = public.oggi() + 31 where sale_id = '52520000-0000-4000-8000-0000000000c2' and numero_rata = 4;
-- a failed one and a collected one: neither is still to collect
update public.payments set stato = 'fallita', scadenza = public.oggi() - 2
where sale_id = '52520000-0000-4000-8000-0000000000c3' and numero_rata = 1;
update public.payments set stato = 'incassata', incassato_il = public.oggi() - 1, importo_incassato = 300, metodo = 'bonifico'
where sale_id = '52520000-0000-4000-8000-0000000000c3' and numero_rata = 2;

-- ---------------------------------------------------------------------------
-- The setter: the second setter's sales in March 2038, with a refund
-- ---------------------------------------------------------------------------
insert into public.commission_rules (profile_id, percentuale, applica_a, valida_dal)
values ('99999999-9999-4999-8999-999999990053', 0.10, '{nuovo}', '2000-01-01');

insert into public.clients (id, nome, fonte, setter_id) values
  ('52520000-0000-4000-8000-0000000000a1', 'Cliente Setter52', 'dm_inbound', '99999999-9999-4999-8999-999999990053'),
  ('52520000-0000-4000-8000-0000000000b1', 'Cliente Del Seed52', 'dm_outbound', '22222222-2222-4222-8222-222222222222');
insert into public.sales (id, client_id, product_id, tipo, setter_id, closer_id, data_vendita, data_inizio, valore_contratto, numero_rate) values
  ('52520000-0000-4000-8000-0000000000a2', '52520000-0000-4000-8000-0000000000a1', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   '99999999-9999-4999-8999-999999990053', '11111111-1111-4111-8111-111111111111', '2038-03-01', '2038-03-01', 900, 3),
  ('52520000-0000-4000-8000-0000000000b2', '52520000-0000-4000-8000-0000000000b1', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', '2038-03-02', '2038-03-02', 1500, 3);
-- a renewal with his name (set by hand): cash, but no rule applies to it
insert into public.sales (id, client_id, product_id, tipo, setter_id, closer_id, data_vendita, data_inizio, valore_contratto, numero_rate) values
  ('52520000-0000-4000-8000-0000000000a3', '52520000-0000-4000-8000-0000000000a1', 'aaaaaaa1-0000-4000-8000-000000000001', 'rinnovo',
   '99999999-9999-4999-8999-999999990053', '11111111-1111-4111-8111-111111111111', '2038-03-10', '2038-06-01', 400, 1);

update public.payments set stato = 'incassata', incassato_il = '2038-03-05', importo_incassato = 300, metodo = 'bonifico'
where sale_id = '52520000-0000-4000-8000-0000000000a2' and numero_rata = 1;
update public.payments set stato = 'incassata', incassato_il = '2038-04-05', importo_incassato = 300, metodo = 'bonifico'
where sale_id = '52520000-0000-4000-8000-0000000000a2' and numero_rata = 2;
update public.payments set stato = 'incassata', incassato_il = '2038-03-12', importo_incassato = 400, metodo = 'bonifico'
where sale_id = '52520000-0000-4000-8000-0000000000a3' and numero_rata = 1;
-- a refund of 100 on the first instalment, in March: its own negative row
insert into public.payments (sale_id, numero_rata, scadenza, importo_previsto, incassato_il, importo_incassato, stato)
values ('52520000-0000-4000-8000-0000000000a2', 1, '2038-03-05', 0, '2038-03-20', -100, 'rimborsata');
-- the seed setter's client pays 500 in March 2038: never the second setter's
update public.payments set stato = 'incassata', incassato_il = '2038-03-15', importo_incassato = 500, metodo = 'bonifico'
where sale_id = '52520000-0000-4000-8000-0000000000b2' and numero_rata = 1;

-- what the seed closer and the admin should see, read with full rights
create temp table atteso_closer on commit drop as
select s.closer_id,
       coalesce(sum(p.importo_previsto), 0)::numeric(12, 2) as totale,
       coalesce(sum(p.importo_previsto) filter (where p.scadenza < public.oggi()), 0)::numeric(12, 2) as in_ritardo
from public.sales s
join public.payments p on p.sale_id = s.id and p.stato = 'prevista'
where s.closer_id in ('33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111')
group by s.closer_id;
grant select on atteso_closer to authenticated;

-- the seed's own months (a period is at most 3 years)
create temp table periodo_seed on commit drop as select public.oggi() - 1000 as da, public.oggi() as a;
create temp table atteso_setter on commit drop as
select s.setter_id,
       coalesce(sum(p.importo_incassato), 0)::numeric(12, 2) as incassato,
       (select coalesce(sum(v.provvigione), 0)::numeric(12, 2) from public.v_provvigioni_maturate v
         where v.profile_id = s.setter_id and v.incassato_il between (select da from periodo_seed) and (select a from periodo_seed)) as provvigione
from public.sales s
join public.payments p on p.sale_id = s.id and p.stato in ('incassata', 'rimborsata')
  and p.incassato_il between (select da from periodo_seed) and (select a from periodo_seed)
where s.setter_id in ('22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111')
group by s.setter_id;
grant select on atteso_setter, periodo_seed to authenticated;

set local role authenticated;

-- ---------------------------------------------------------------------------
-- da_incassare_closer
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999990052","role":"authenticated"}';
select is(
  (select row(totale, numero_rate, vendite)::text from public.da_incassare_closer()),
  row(1200.00, 4, 1)::text,
  'il closer: le sue rate previste, mai la fallita né l''incassata'
);
select is(
  (select row(in_ritardo, numero_in_ritardo)::text from public.da_incassare_closer()),
  row(300.00, 1)::text,
  'in ritardo: scadenza prima di oggi'
);
select is(
  (select row(prossimi_30, numero_prossimi_30)::text from public.da_incassare_closer()),
  row(600.00, 2)::text,
  'prossimi 30 giorni: da oggi al trentesimo giorno compreso'
);
select is(
  (select row(oltre, numero_oltre)::text from public.da_incassare_closer()),
  row(300.00, 1)::text,
  'oltre: dal trentunesimo giorno'
);

set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(
  (select totale from public.da_incassare_closer()),
  coalesce((select totale from atteso_closer where closer_id = '33333333-3333-4333-8333-333333333333'), 0),
  'il closer del seed: solo le sue vendite, mai quelle del secondo closer'
);
select is(
  (select in_ritardo from public.da_incassare_closer()),
  coalesce((select in_ritardo from atteso_closer where closer_id = '33333333-3333-4333-8333-333333333333'), 0),
  'e il suo in ritardo'
);
select is(
  (select in_ritardo + prossimi_30 + oltre from public.da_incassare_closer()),
  (select totale from public.da_incassare_closer()),
  'le tre parti sommano al totale'
);

set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(
  (select totale from public.da_incassare_closer()),
  coalesce((select totale from atteso_closer where closer_id = '11111111-1111-4111-8111-111111111111'), 0),
  'l''admin: solo le vendite chiuse da lui, mai tutto il team'
);

set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok($$ select * from public.da_incassare_closer() $$, '42501', null, 'il setter non passa di qui');

-- ---------------------------------------------------------------------------
-- incassi_clienti_setter
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999990053","role":"authenticated"}';
select is(
  (select row(incassato, numero_incassi, rimborsato, numero_rimborsi, clienti)::text
   from public.incassi_clienti_setter('2038-03-01', '2038-03-31')),
  row(600.00, 2, 100.00, 1, 1)::text,
  'marzo: 300 + 400 di rinnovo - 100 di rimborso; mai i 500 del cliente del setter del seed'
);
select is(
  (select provvigione from public.incassi_clienti_setter('2038-03-01', '2038-03-31')),
  20.00::numeric,
  'provvigione: 10% di 300, meno 10% del rimborso; il rinnovo senza regola non ne dà'
);
select is(
  (select provvigione from public.incassi_clienti_setter('2038-03-01', '2038-03-31')),
  (select provvigioni_maturate from public.miei_numeri_periodo('2038-03-01', '2038-03-31')),
  'la stessa provvigione di I miei numeri'
);
select is(
  (select incassato from public.incassi_clienti_setter('2038-03-01', '2038-03-31')),
  (select coalesce(sum(importo_incassato), 0)::numeric(12, 2) from public.mie_vendite_setter()
    where stato in ('incassata', 'rimborsata') and incassato_il between '2038-03-01' and '2038-03-31'),
  'lo stesso incassato degli incassi di I tuoi clienti'
);
select is(
  (select row(incassato, numero_incassi, provvigione)::text from public.incassi_clienti_setter('2038-04-01', '2038-04-30')),
  row(300.00, 1, 30.00)::text,
  'aprile: solo la seconda rata'
);
select is(
  (select row(incassato, numero_incassi, numero_rimborsi, clienti, provvigione)::text
   from public.incassi_clienti_setter('2038-05-01', '2038-05-31')),
  row(0.00, 0, 0, 0, 0.00)::text,
  'un periodo senza incassi: zero, mai vuoto'
);
select throws_ok($$ select * from public.incassi_clienti_setter('2038-03-31', '2038-03-01') $$,
  '22023', null, 'un periodo al contrario è rifiutato');
select throws_ok($$ select * from public.incassi_clienti_setter(null, '2038-03-01') $$,
  '22023', null, 'un periodo senza inizio è rifiutato');
select throws_ok($$ select * from public.da_incassare_closer() $$, '42501', null, 'e il setter non legge il da incassare del closer');

set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(
  (select incassato from public.incassi_clienti_setter((select da from periodo_seed), (select a from periodo_seed))),
  coalesce((select incassato from atteso_setter where setter_id = '22222222-2222-4222-8222-222222222222'), 0),
  'il setter del seed: solo i suoi clienti, mai quelli del secondo setter'
);
select is(
  (select provvigione from public.incassi_clienti_setter((select da from periodo_seed), (select a from periodo_seed))),
  coalesce((select provvigione from atteso_setter where setter_id = '22222222-2222-4222-8222-222222222222'), 0),
  'e la sua provvigione'
);

set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(
  (select incassato from public.incassi_clienti_setter((select da from periodo_seed), (select a from periodo_seed))),
  coalesce((select incassato from atteso_setter where setter_id = '11111111-1111-4111-8111-111111111111'), 0),
  'l''admin: solo i clienti che ha portato lui'
);

set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select throws_ok($$ select * from public.incassi_clienti_setter('2038-03-01', '2038-03-31') $$,
  '42501', null, 'il closer non legge gli incassi dei clienti del setter');

-- deactivated: nothing
reset role;
update public.profiles set attivo = false
where id in ('99999999-9999-4999-8999-999999990052', '99999999-9999-4999-8999-999999990053');
set local role authenticated;
set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999990053","role":"authenticated"}';
select throws_ok($$ select * from public.incassi_clienti_setter('2038-03-01', '2038-03-31') $$,
  '42501', null, 'un setter disattivato non legge niente');
set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999990052","role":"authenticated"}';
select throws_ok($$ select * from public.da_incassare_closer() $$, '42501', null, 'un closer disattivato non legge niente');

select * from finish();
rollback;
