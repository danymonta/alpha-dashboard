-- Nuova vendita: instalment split, client from the call, one sale per call.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(14);

-- ---------------------------------------------------------------------------
-- piano_rate: the one place where instalments are computed
-- ---------------------------------------------------------------------------
select is(
  (select string_agg(importo::text, ',' order by numero_rata) from public.piano_rate(1000, 3, '2026-01-31')),
  '333.33,333.33,333.34',
  'rate uguali, l''ultima assorbe l''arrotondamento'
);

select is(
  (select string_agg(scadenza::text, ',' order by numero_rata) from public.piano_rate(1000, 3, '2026-01-31')),
  '2026-01-31,2026-02-28,2026-03-31',
  'scadenze mensili, a fine mese si ferma all''ultimo giorno valido'
);

select is(
  (select sum(importo) from public.piano_rate(2400, 7, '2026-09-26')),
  2400.00::numeric,
  'la somma delle rate è sempre il valore del contratto'
);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres): a closed call and an open one for the closer
-- ---------------------------------------------------------------------------
insert into public.leads (id, nome, instagram_handle, setter_id, fonte)
values ('aaaa0000-0000-4000-8000-000000000001', 'Paolo Verdi', '@paolo.verdi',
        '22222222-2222-4222-8222-222222222222', 'referral');

insert into public.calls (id, lead_id, setter_id, closer_id, tipo, programmata_il, stato, qualificata, esito)
values
  ('cccc0000-0000-4000-8000-000000000001', 'aaaa0000-0000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333',
   'discovery', now() - interval '1 hour', 'svolta', true, 'chiusa'),
  ('cccc0000-0000-4000-8000-000000000002', 'aaaa0000-0000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333',
   'strategy', now() + interval '1 day', 'programmata', null, null),
  ('cccc0000-0000-4000-8000-000000000003', 'aaaa0000-0000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333',
   'strategy', now() - interval '2 hour', 'svolta', true, 'chiusa');

-- ---------------------------------------------------------------------------
-- The closer registers the sale of the closed call
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

create temp table v1 on commit drop as
select * from public.registra_vendita(
  'aaaaaaa1-0000-4000-8000-000000000002', 'nuovo', '2026-09-26', '2026-10-01', 2400, 3,
  'cccc0000-0000-4000-8000-000000000001', null, 'Paolo', 'Verdi', 'Paolo@Example.test'
);

select is((select cliente_nuovo from v1), true, 'dal lead nasce un cliente nuovo');

select is(
  (select array[c.lead_id::text, c.setter_id::text, c.closer_id::text, c.fonte::text, c.email, c.instagram_handle]
   from public.clients c where c.id = (select id_cliente from v1)),
  array['aaaa0000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333', 'referral', 'paolo@example.test', '@paolo.verdi'],
  'il cliente eredita lead, setter, closer, fonte e handle; email in minuscolo'
);

select is(
  (select array[s.setter_id::text, s.closer_id::text, s.call_id::text, s.data_fine::text]
   from public.sales s where s.id = (select id_vendita from v1)),
  array['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333',
        'cccc0000-0000-4000-8000-000000000001', '2027-03-31'],
  'la vendita porta setter e closer della call; 6 mesi dal 01/10 finiscono il 31/03'
);

select is(
  (select count(*)::int from public.payments where sale_id = (select id_vendita from v1)),
  3,
  'il piano rate nasce con la vendita'
);

-- A double tap cannot create a second sale for the same call
select throws_ok(
  $$ select * from public.registra_vendita(
       'aaaaaaa1-0000-4000-8000-000000000002', 'nuovo', '2026-09-26', '2026-10-01', 2400, 3,
       'cccc0000-0000-4000-8000-000000000001', null, 'Paolo', 'Verdi') $$,
  '23505'
);

-- A call without the "chiusa" outcome does not produce a sale
select throws_ok(
  $$ select * from public.registra_vendita(
       'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo', '2026-09-26', '2026-09-26', 1500, 1,
       'cccc0000-0000-4000-8000-000000000002', null, 'Paolo', 'Verdi') $$,
  '22023'
);

-- Second closed call of the same lead: the existing client is reused
create temp table v2 on commit drop as
select * from public.registra_vendita(
  'aaaaaaa1-0000-4000-8000-000000000001', 'upsell', '2026-09-26', '2026-09-26', 600, 1,
  'cccc0000-0000-4000-8000-000000000003'
);

select is(
  (select array[(select cliente_nuovo from v2)::text, (select id_cliente from v2)::text]),
  array['false', (select id_cliente from v1)::text],
  'un lead già cliente non diventa un secondo cliente'
);

-- A brand new client cannot start with a renewal
select throws_ok(
  $$ select * from public.registra_vendita(
       'aaaaaaa1-0000-4000-8000-000000000001', 'rinnovo', '2026-09-26', '2026-09-26', 1500, 1,
       null, null, 'Nuovo', 'Cliente') $$,
  '22023'
);

-- ---------------------------------------------------------------------------
-- The admin registers a renewal without a call: no setter (29/09/2026)
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

create temp table v3 on commit drop as
select * from public.registra_vendita(
  'aaaaaaa1-0000-4000-8000-000000000002', 'rinnovo', '2027-04-01', '2027-04-01', 2200, 2,
  null, (select id_cliente from v1)
);

select is(
  (select array[s.tipo::text, s.setter_id::text, s.closer_id::text]
   from public.sales s where s.id = (select id_vendita from v3)),
  array['rinnovo', null, '11111111-1111-4111-8111-111111111111'],
  'il rinnovo senza call non ha setter (niente provvigione, non compare al setter); il closer è chi lo registra'
);

-- ---------------------------------------------------------------------------
-- The setter never registers sales; the call of another closer is invisible
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select throws_ok(
  $$ select * from public.registra_vendita(
       'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo', '2026-09-26', '2026-09-26', 1500, 1,
       null, null, 'Da', 'Setter') $$,
  '42501'
);

reset role;
-- fixtures without a session: the setter's claims would still say "setter",
-- and the outcome of a call is never his (calls_esito_solo_closer)
set local request.jwt.claims to '{}';
update public.calls set closer_id = '11111111-1111-4111-8111-111111111111'
where id = 'cccc0000-0000-4000-8000-000000000002';
update public.calls set stato = 'svolta', qualificata = true, esito = 'chiusa'
where id = 'cccc0000-0000-4000-8000-000000000002';
set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

select throws_ok(
  $$ select * from public.registra_vendita(
       'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo', '2026-09-26', '2026-09-26', 1500, 1,
       'cccc0000-0000-4000-8000-000000000002', null, 'Paolo', 'Verdi') $$,
  '22023'
);

select * from finish();
rollback;
