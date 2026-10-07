-- The setter sees the closer's day (Dany, 07/10/2026, 20261007100000): the
-- Closer page day by day, of every closer or one, with the calls of every
-- setter and the money (cash and revenue of the new clients). Aggregates
-- only: no new permission on calls or sales. The closer still sees only his
-- own, whatever he asks; the admin as before; a deactivated setter, the coach
-- and nobody signed in are refused.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(19);

select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'public.giornate_closer(date, date, uuid)'::regprocedure),
  'giornate_closer è security definer con search_path vuoto: i filtri per ruolo sono espliciti'
);

-- ---------------------------------------------------------------------------
-- Fixtures: March 2031, far from the seed. Seed: admin 1111, setter 2222,
-- closer 3333, coach 4444; a second closer, a second setter, a deactivated one.
--   closer 3333, setter 2222   10/03 held and closed; new client Y 900 in 1, paid
--   closer 6060, setter 6061   10/03 held and closed; new client X 1.200 in 2,
--                              first instalment 600 paid; 12/03 a no-show
-- ---------------------------------------------------------------------------
insert into public.invites (email, ruolo) values
  ('closer.due@alpha.test', 'closer'),
  ('setter.due@alpha.test', 'setter'),
  ('setter.spento.closer@alpha.test', 'setter');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', '60606060-6060-4060-8060-606060606060',
   'authenticated', 'authenticated', 'closer.due@alpha.test', '', now(),
   '{}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '60616061-6061-4061-8061-606160616061',
   'authenticated', 'authenticated', 'setter.due@alpha.test', '', now(),
   '{}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '60626062-6062-4062-8062-606260626062',
   'authenticated', 'authenticated', 'setter.spento.closer@alpha.test', '', now(),
   '{}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
update public.profiles set attivo = false where id = '60626062-6062-4062-8062-606260626062';

insert into public.leads (id, nome, setter_id, fonte) values
  ('60600000-0000-4000-8000-000000000001', 'Lead Di Loris', '22222222-2222-4222-8222-222222222222', 'dm_inbound'),
  ('60600000-0000-4000-8000-000000000002', 'Lead Dell Altro Setter', '60616061-6061-4061-8061-606160616061', 'dm_outbound'),
  ('60600000-0000-4000-8000-000000000003', 'Lead Assente', '60616061-6061-4061-8061-606160616061', 'dm_outbound');

insert into public.calls (id, lead_id, setter_id, closer_id, tipo, programmata_il, stato, qualificata, esito) values
  ('60601111-0000-4000-8000-000000000001', '60600000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333', 'discovery', '2031-03-10 18:00+01', 'svolta', true, 'chiusa'),
  ('60601111-0000-4000-8000-000000000002', '60600000-0000-4000-8000-000000000002', '60616061-6061-4061-8061-606160616061',
   '60606060-6060-4060-8060-606060606060', 'discovery', '2031-03-10 19:00+01', 'svolta', true, 'chiusa'),
  ('60601111-0000-4000-8000-000000000003', '60600000-0000-4000-8000-000000000003', '60616061-6061-4061-8061-606160616061',
   '60606060-6060-4060-8060-606060606060', 'discovery', '2031-03-12 19:00+01', 'no_show', null, null);

insert into public.clients (id, nome, fonte, setter_id, closer_id) values
  ('60602222-0000-4000-8000-0000000000a0', 'Cliente Y', 'dm_inbound', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'),
  ('60602222-0000-4000-8000-0000000000b0', 'Cliente X', 'dm_outbound', '60616061-6061-4061-8061-606160616061', '60606060-6060-4060-8060-606060606060');
insert into public.sales (id, client_id, product_id, tipo, call_id, setter_id, closer_id, data_vendita, data_inizio, valore_contratto, numero_rate) values
  ('60602222-0000-4000-8000-0000000000a1', '60602222-0000-4000-8000-0000000000a0', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   '60601111-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333',
   '2031-03-10', '2031-03-17', 900, 1),
  ('60602222-0000-4000-8000-0000000000b1', '60602222-0000-4000-8000-0000000000b0', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   '60601111-0000-4000-8000-000000000002', '60616061-6061-4061-8061-606160616061', '60606060-6060-4060-8060-606060606060',
   '2031-03-10', '2031-03-17', 1200, 2);
update public.payments p set stato = 'incassata', incassato_il = '2031-03-10', importo_incassato = v.importo, metodo = 'bonifico'
from (values ('60602222-0000-4000-8000-0000000000a1', 900), ('60602222-0000-4000-8000-0000000000b1', 600)) as v(vendita, importo)
where p.sale_id = v.vendita::uuid and p.numero_rata = 1;

set local role authenticated;

-- ---------------------------------------------------------------------------
-- The admin: unchanged
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(
  (select row(call, no_show, chiuse, cash, revenue)::text
   from public.giornate_closer('2031-03-01', '2031-03-31') where data is null),
  row(2, 1, 2, 1500.00, 2100.00)::text,
  'l''admin vede tutti i closer: 2 svolte, 1 no show, 2 chiuse, 1.500 di cash e 2.100 di revenue'
);
select is(
  (select array[show_rate, close_rate] from public.giornate_closer('2031-03-01', '2031-03-31') where data is null),
  array[2::numeric / 3, 1],
  'show rate 2 su 3, close rate 2 su 2'
);
select is(
  (select row(call, no_show, cash, revenue)::text
   from public.giornate_closer('2031-03-01', '2031-03-31', '60606060-6060-4060-8060-606060606060') where data is null),
  row(1, 1, 600.00, 1200.00)::text,
  'o un closer solo'
);

-- ---------------------------------------------------------------------------
-- The setter: everything of the Closer page, of every setter's calls
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(
  (select array_agg(row(data, call, qualificate, no_show, follow_up, cancellate, chiuse, cash, revenue)::text
                    order by data nulls first)
   from public.giornate_closer('2031-03-01', '2031-03-31')),
  array[
    row(null::date, 2, 2, 1, 0, 0, 2, 1500.00, 2100.00)::text,
    row('2031-03-10'::date, 2, 2, 0, 0, 0, 2, 1500.00, 2100.00)::text,
    row('2031-03-12'::date, 0, 0, 1, 0, 0, 0, 0.00, 0.00)::text
  ],
  'il setter vede la giornata di tutti i closer, giorno per giorno, anche gli euro e le call chiuse di altri setter'
);
select is(
  (select array[show_rate, close_rate] from public.giornate_closer('2031-03-01', '2031-03-31') where data is null),
  array[2::numeric / 3, 1],
  'con show rate e close rate'
);
select is(
  (select row(call, no_show, cash, revenue)::text
   from public.giornate_closer('2031-03-01', '2031-03-31', '60606060-6060-4060-8060-606060606060') where data is null),
  row(1, 1, 600.00, 1200.00)::text,
  'o di un closer solo'
);
select is(
  (select row(call, cash, revenue)::text
   from public.giornate_closer('2031-03-01', '2031-03-31', '33333333-3333-4333-8333-333333333333') where data is null),
  row(1, 900.00, 900.00)::text,
  'anche quella del closer delle sue call'
);
-- the numbers, never the rows behind them: no new permission
select is(
  (select count(*)::integer from public.calls where id = '60601111-0000-4000-8000-000000000002'),
  0,
  'ma la call dell''altro setter non la legge'
);
select is(
  (select count(*)::integer from public.sales where id in ('60602222-0000-4000-8000-0000000000a1', '60602222-0000-4000-8000-0000000000b1')),
  0,
  'né le vendite'
);
select is(
  (select count(*)::integer from public.payments
   where sale_id in ('60602222-0000-4000-8000-0000000000a1', '60602222-0000-4000-8000-0000000000b1')),
  0,
  'né gli incassi'
);
select is(
  (select count(*)::integer from public.leads where id = '60600000-0000-4000-8000-000000000002'),
  0,
  'né il lead dell''altro setter'
);

-- a deactivated setter no
set local request.jwt.claims to '{"sub":"60626062-6062-4062-8062-606260626062","role":"authenticated"}';
select throws_ok(
  $$ select * from public.giornate_closer('2031-03-01', '2031-03-31') $$,
  '42501', 'La giornata del closer la vedono l''admin, i closer e i setter.',
  'un setter disattivato no'
);

-- ---------------------------------------------------------------------------
-- The closer: always and only his own
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(
  (select row(call, no_show, chiuse, cash, revenue)::text
   from public.giornate_closer('2031-03-01', '2031-03-31') where data is null),
  row(1, 0, 1, 900.00, 900.00)::text,
  'il closer vede solo la sua giornata'
);
select is(
  (select row(call, no_show, chiuse, cash, revenue)::text
   from public.giornate_closer('2031-03-01', '2031-03-31', '60606060-6060-4060-8060-606060606060') where data is null),
  row(1, 0, 1, 900.00, 900.00)::text,
  'anche chiedendo quella di un altro closer'
);
set local request.jwt.claims to '{"sub":"60606060-6060-4060-8060-606060606060","role":"authenticated"}';
select is(
  (select row(call, no_show, cash, revenue)::text
   from public.giornate_closer('2031-03-01', '2031-03-31', null) where data is null),
  row(1, 1, 600.00, 1200.00)::text,
  'e l''altro closer la sua'
);

-- ---------------------------------------------------------------------------
-- Nobody else
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select throws_ok(
  $$ select * from public.giornate_closer('2031-03-01', '2031-03-31') $$,
  '42501', 'La giornata del closer la vedono l''admin, i closer e i setter.',
  'il coach no'
);
set local request.jwt.claims to '{"role":"authenticated"}';
select throws_ok(
  $$ select * from public.giornate_closer('2031-03-01', '2031-03-31') $$,
  '42501', 'La giornata del closer la vedono l''admin, i closer e i setter.',
  'una sessione senza utente no'
);
reset role;
set local role anon;
select throws_ok(
  $$ select * from public.giornate_closer('2031-03-01', '2031-03-31') $$,
  '42501', null,
  'chi non è entrato no'
);

select * from finish();
rollback;
