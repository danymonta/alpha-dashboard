-- Two setters with numbers on the same day: each one sees only his own report,
-- the calls he booked and the new clients he brought, never the other's; a
-- deactivated setter sees nothing. Every public view runs with the caller's
-- rights and every security definer function has an empty search_path.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(16);

-- A second setter, invited like everyone else
insert into public.invites (email, ruolo) values ('setter39@alpha.test', 'setter');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999990039',
  'authenticated', 'authenticated', 'setter39@alpha.test', '', now(),
  '{}'::jsonb, '{"full_name":"Setter Trentanove"}'::jsonb, now(), now(), '', '', '', '');

-- A quiet day (no seed data) where both setters have a report, a call held and
-- a new client who paid the first instalment
insert into public.setter_daily_reports (setter_id, data, dm_outbound) values
  ('22222222-2222-4222-8222-222222222222', '2025-02-10', 3),
  ('99999999-9999-4999-8999-999999990039', '2025-02-10', 7);

insert into public.leads (id, nome, setter_id, fonte) values
  ('39390000-0000-4000-8000-000000000001', 'Lead Del Seed', '22222222-2222-4222-8222-222222222222', 'dm_outbound'),
  ('39390000-0000-4000-8000-000000000002', 'Lead Del Trentanove', '99999999-9999-4999-8999-999999990039', 'dm_inbound');
insert into public.calls (lead_id, setter_id, closer_id, tipo, programmata_il, stato, qualificata, esito) values
  ('39390000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333', 'discovery', '2025-02-10 11:00+01', 'svolta', true, 'chiusa'),
  ('39390000-0000-4000-8000-000000000002', '99999999-9999-4999-8999-999999990039',
   '11111111-1111-4111-8111-111111111111', 'discovery', '2025-02-10 15:00+01', 'svolta', true, 'chiusa');

insert into public.clients (id, lead_id, nome, fonte, setter_id, closer_id) values
  ('39391111-0000-4000-8000-000000000001', '39390000-0000-4000-8000-000000000001', 'Cliente Del Seed', 'dm_outbound',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'),
  ('39391111-0000-4000-8000-000000000002', '39390000-0000-4000-8000-000000000002', 'Cliente Del Trentanove', 'dm_inbound',
   '99999999-9999-4999-8999-999999990039', '11111111-1111-4111-8111-111111111111');
insert into public.sales (id, client_id, product_id, tipo, setter_id, closer_id, data_vendita, data_inizio, valore_contratto, numero_rate) values
  ('39392222-0000-4000-8000-000000000001', '39391111-0000-4000-8000-000000000001', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', '2025-02-10', '2025-02-10', 1200, 3),
  ('39392222-0000-4000-8000-000000000002', '39391111-0000-4000-8000-000000000002', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   '99999999-9999-4999-8999-999999990039', '11111111-1111-4111-8111-111111111111', '2025-02-10', '2025-02-10', 900, 3);
update public.payments set stato = 'incassata', incassato_il = '2025-02-10', importo_incassato = 400, metodo = 'bonifico'
where sale_id = '39392222-0000-4000-8000-000000000001' and numero_rata = 1;
update public.payments set stato = 'incassata', incassato_il = '2025-02-10', importo_incassato = 300, metodo = 'bonifico'
where sale_id = '39392222-0000-4000-8000-000000000002' and numero_rata = 1;

set local role authenticated;

-- The seed setter: his day, whatever he asks for
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(
  (select row(dm_outbound, closer_call, closer_chiuse, cash, revenue)::text
   from public.giornate_setter('2025-02-10', '2025-02-10') where data is null),
  row(3, 1, 1, 400.00, 1200.00)::text,
  'il setter vede solo il suo report, la sua call e il suo cliente nuovo'
);
select is(
  (select row(dm_outbound, closer_call, cash, revenue)::text
   from public.giornate_setter('2025-02-10', '2025-02-10', '99999999-9999-4999-8999-999999990039') where data is null),
  row(3, 1, 400.00, 1200.00)::text,
  'chiedendo la giornata dell''altro setter riceve comunque la sua'
);
select is(
  (select count(*)::integer from public.mie_vendite_setter() where cliente = 'Cliente Del Trentanove'),
  0,
  'tra i suoi clienti non c''è il cliente dell''altro setter'
);
select ok(
  exists (select 1 from public.mie_vendite_setter() where cliente = 'Cliente Del Seed'),
  'c''è il suo'
);
select is(
  (select count(*)::integer from public.miei_clienti() where nome = 'Cliente Del Trentanove'),
  0,
  'nemmeno per nome e stato'
);
select is(
  (select count(*)::integer from public.calls where lead_id = '39390000-0000-4000-8000-000000000002'),
  0,
  'non legge la call dell''altro setter'
);
select is(
  (select count(*)::integer from public.setter_daily_reports where setter_id = '99999999-9999-4999-8999-999999990039'),
  0,
  'né il suo report'
);

-- The second setter: the mirror image
set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999990039","role":"authenticated"}';
select is(
  (select row(dm_outbound, closer_call, closer_chiuse, cash, revenue)::text
   from public.giornate_setter('2025-02-10', '2025-02-10') where data is null),
  row(7, 1, 1, 300.00, 900.00)::text,
  'l''altro setter vede solo i suoi numeri'
);
select is(
  (select array_agg(distinct cliente) from public.mie_vendite_setter()),
  array['Cliente Del Trentanove'],
  'e solo il cliente che ha portato lui'
);
select is(
  (select dm_outbound::integer from public.miei_numeri_periodo('2025-02-10', '2025-02-10')),
  7,
  'i suoi numeri del periodo sono i suoi'
);

-- The admin sees both, one at a time or together
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(
  (select row(dm_outbound, closer_call, cash, revenue)::text
   from public.giornate_setter('2025-02-10', '2025-02-10') where data is null),
  row(10, 2, 700.00, 2100.00)::text,
  'l''admin vede i due setter insieme'
);

-- Deactivated: nothing at all
reset role;
update public.profiles set attivo = false where id = '99999999-9999-4999-8999-999999990039';
set local role authenticated;
set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999990039","role":"authenticated"}';
select throws_ok($$ select * from public.giornate_setter('2025-02-10', '2025-02-10') $$, '42501', null,
  'un setter disattivato non vede le sue giornate');
select throws_ok($$ select * from public.mie_vendite_setter() $$, '42501', null,
  'né i suoi clienti');
select throws_ok($$ select * from public.miei_numeri_periodo('2025-02-10', '2025-02-10') $$, '42501', null,
  'né i suoi numeri');

-- Catalogue guards: a new view or security definer function cannot slip in
-- without the options that keep RLS and the search path safe
reset role;
select is(
  (select coalesce(array_agg(c.relname::text order by c.relname), '{}')
   from pg_class c
   join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('v', 'm')
     and not exists (select 1 from unnest(coalesce(c.reloptions, '{}')) o where o ~* '^security_invoker=(true|on|1)$')),
  '{}'::text[],
  'ogni view di public gira con i permessi di chi la legge (security_invoker)'
);
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef
     and not ('search_path=""' = any (coalesce(p.proconfig, '{}')))),
  '{}'::text[],
  'ogni funzione security definer di public ha search_path vuoto'
);

select * from finish();
rollback;
