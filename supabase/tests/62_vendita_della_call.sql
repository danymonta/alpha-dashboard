-- The sale of a closed call (07/10/2026, 20261007120000): call_ha_vendita says
-- whether a call has its sale whatever RLS lets the closer read of sales (a
-- sale of his call that carries another closer), only on a call he reads, only
-- a boolean. The admin ties a sale registered without the call to it
-- (vendite_da_collegare, collega_vendita_call): one sale per call, nothing
-- else of the sale changes, nobody but the admin; the call's closer reads the
-- candidates among his own sales. calls.importata marks the imported calls,
-- which never ask: never the missing author, which elimina_persona empties too.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(37);

select has_function('public', 'call_ha_vendita', array['calls'], 'call_ha_vendita esiste');
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
     and not has_function_privilege('anon', p.oid, 'execute')
     and has_function_privilege('authenticated', p.oid, 'execute')
   from pg_proc p where p.oid = 'public.call_ha_vendita(public.calls)'::regprocedure),
  'call_ha_vendita: campo calcolato security definer, per chi è entrato'
);
select has_column('public', 'calls', 'importata', 'calls.importata esiste');
select col_not_null('public', 'calls', 'importata', 'calls.importata non è mai null');
select col_default_is('public', 'calls', 'importata', 'false', 'una call nasce non importata');
select ok(
  not has_function_privilege('anon', 'public.vendite_da_collegare(uuid)', 'execute')
  and not has_function_privilege('anon', 'public.collega_vendita_call(uuid, uuid)', 'execute'),
  'anon non propone né collega vendite'
);

-- ---------------------------------------------------------------------------
-- Fixtures. Seed: admin 1111, setter 2222, closer 3333, coach 4444.
--  A: closed in the app by the closer, its sale carries the admin as closer
--  B: closed in the app, its sale registered without the call (Vendite)
--  C: closed in the app, nothing at all
--  D: still to be held
--  E: closed in the app, the admin's call
--  F: a sale of the closer without the call, client named as C's lead
--  A person to delete, who booked a closed call without its sale (G)
-- ---------------------------------------------------------------------------
insert into public.invites (email, ruolo) values ('setter.62@alpha.test', 'setter');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', '62629999-0000-4000-8000-000000000001',
  'authenticated', 'authenticated', 'setter.62@alpha.test', '', now(),
  '{}'::jsonb, '{"full_name":"Setter Sessantadue"}'::jsonb, now(), now(), '', '', '', '');

insert into public.leads (id, nome, instagram_handle, setter_id, fonte, stato, created_at) values
  ('62620000-0000-4000-8000-00000000000a', 'Aldo Vendita', null, '22222222-2222-4222-8222-222222222222', 'dm_inbound', 'cliente', now() - interval '20 days'),
  ('62620000-0000-4000-8000-00000000000b', 'Bianca Scollegata', '@bianca.scollegata', '22222222-2222-4222-8222-222222222222', 'dm_inbound', 'cliente', now() - interval '20 days'),
  ('62620000-0000-4000-8000-00000000000c', 'Carlo Senza', null, '22222222-2222-4222-8222-222222222222', 'dm_inbound', 'cliente', now() - interval '20 days'),
  ('62620000-0000-4000-8000-00000000000d', 'Dora Dafare', null, '22222222-2222-4222-8222-222222222222', 'dm_inbound', 'call_fissata', now() - interval '20 days'),
  ('62620000-0000-4000-8000-00000000000e', 'Elio Admin', null, '22222222-2222-4222-8222-222222222222', 'dm_inbound', 'cliente', now() - interval '20 days'),
  ('62620000-0000-4000-8000-00000000000f', 'Gino Eliminato', null, '62629999-0000-4000-8000-000000000001', 'dm_inbound', 'cliente', now() - interval '20 days');

insert into public.calls (id, lead_id, setter_id, closer_id, tipo, programmata_il, stato, qualificata, esito, created_by, created_at)
values
  ('62621111-0000-4000-8000-00000000000a', '62620000-0000-4000-8000-00000000000a', '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333', 'discovery', now() - interval '5 days', 'svolta', true, 'chiusa',
   '22222222-2222-4222-8222-222222222222', now() - interval '20 days'),
  ('62621111-0000-4000-8000-00000000000b', '62620000-0000-4000-8000-00000000000b', '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333', 'discovery', now() - interval '5 days', 'svolta', true, 'chiusa',
   '22222222-2222-4222-8222-222222222222', now() - interval '20 days'),
  ('62621111-0000-4000-8000-00000000000c', '62620000-0000-4000-8000-00000000000c', '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333', 'discovery', now() - interval '5 days', 'svolta', true, 'chiusa',
   '22222222-2222-4222-8222-222222222222', now() - interval '20 days'),
  ('62621111-0000-4000-8000-00000000000d', '62620000-0000-4000-8000-00000000000d', '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333', 'discovery', now() + interval '2 days', 'programmata', null, null,
   '22222222-2222-4222-8222-222222222222', now() - interval '20 days'),
  ('62621111-0000-4000-8000-00000000000e', '62620000-0000-4000-8000-00000000000e', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'discovery', now() - interval '5 days', 'svolta', true, 'chiusa',
   '22222222-2222-4222-8222-222222222222', now() - interval '20 days'),
  ('62621111-0000-4000-8000-00000000000f', '62620000-0000-4000-8000-00000000000f', '62629999-0000-4000-8000-000000000001',
   '33333333-3333-4333-8333-333333333333', 'discovery', now() - interval '5 days', 'svolta', true, 'chiusa',
   '62629999-0000-4000-8000-000000000001', now() - interval '20 days');

insert into public.clients (id, nome, cognome, instagram_handle, lead_id, fonte, setter_id, closer_id) values
  ('62622222-0000-4000-8000-00000000000a', 'Aldo', 'Vendita', null, '62620000-0000-4000-8000-00000000000a', 'dm_inbound',
   '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111'),
  -- registered from Vendite, without the lead: same handle, another spelling of the name
  ('62622222-0000-4000-8000-00000000000b', 'Bianca', 'Scolegata', 'Bianca.Scollegata', null, 'dm_inbound',
   null, '11111111-1111-4111-8111-111111111111'),
  -- someone else, signed far from the call: never proposed
  ('62622222-0000-4000-8000-0000000000ee', 'Ettore', 'Lontano', null, null, 'altro', null, '11111111-1111-4111-8111-111111111111'),
  -- registered by the closer from Vendite: C's lead's name, without the lead
  ('62622222-0000-4000-8000-0000000000f1', 'Carlo', 'Senza', null, null, 'dm_inbound', null, '33333333-3333-4333-8333-333333333333');

insert into public.sales (id, client_id, product_id, tipo, call_id, setter_id, closer_id, data_vendita, data_inizio, valore_contratto, numero_rate)
values
  ('62623333-0000-4000-8000-00000000000a', '62622222-0000-4000-8000-00000000000a', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   '62621111-0000-4000-8000-00000000000a', '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   public.oggi() - 5, public.oggi() + 2, 1500, 3),
  ('62623333-0000-4000-8000-00000000000b', '62622222-0000-4000-8000-00000000000b', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   null, null, '11111111-1111-4111-8111-111111111111', public.oggi() - 4, public.oggi() + 3, 1200, 2),
  ('62623333-0000-4000-8000-0000000000ee', '62622222-0000-4000-8000-0000000000ee', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   null, null, '11111111-1111-4111-8111-111111111111', public.oggi() - 200, public.oggi() - 193, 900, 1),
  ('62623333-0000-4000-8000-0000000000f1', '62622222-0000-4000-8000-0000000000f1', 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo',
   null, null, '33333333-3333-4333-8333-333333333333', public.oggi() - 4, public.oggi() + 3, 1100, 1);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- call_ha_vendita
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(
  (select count(*) from public.sales where call_id = '62621111-0000-4000-8000-00000000000a'),
  0::bigint,
  'il closer non legge la vendita della sua call che porta un altro closer'
);
select is(
  (select array_agg(public.call_ha_vendita(c) order by c.id) from public.calls c
   where c.id in ('62621111-0000-4000-8000-00000000000a', '62621111-0000-4000-8000-00000000000b', '62621111-0000-4000-8000-00000000000c')),
  array[true, false, false],
  'ma sa che c''è: la call non chiede la vendita; le altre due sì'
);
select is(
  (select count(*) from public.calls c
   where c.closer_id = '33333333-3333-4333-8333-333333333333' and c.esito = 'chiusa'
     and not c.importata and c.id::text like '6262%' and public.call_ha_vendita(c) = false),
  3::bigint,
  'il filtro sulla pagina: le tre call senza vendita'
);
select throws_ok(
  $$ update public.calls set importata = true where id = '62621111-0000-4000-8000-00000000000c' $$,
  '42501', 'Una call importata la segna solo l''import',
  'il closer non nasconde una call segnandola importata'
);
select is(
  public.call_ha_vendita(jsonb_populate_record(null::public.calls,
    '{"id": "62621111-0000-4000-8000-00000000000a", "closer_id": "44444444-4444-4444-8444-444444444444"}')),
  true,
  'chi può chiederlo lo decide la call salvata, non la riga passata'
);

set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(
  (select public.call_ha_vendita(c) from public.calls c where c.id = '62621111-0000-4000-8000-00000000000a'),
  null::boolean,
  'il setter non lo chiede: non legge le vendite'
);
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select is(
  public.call_ha_vendita(jsonb_populate_record(null::public.calls, '{"id": "62621111-0000-4000-8000-00000000000a"}')),
  null::boolean,
  'mai su una call che non legge, nemmeno passandola a mano'
);

-- ---------------------------------------------------------------------------
-- vendite_da_collegare and collega_vendita_call: the admin only
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(
  (select array_agg(row(v.sale_id, v.cliente, v.stesso_cliente)::text)
   from public.vendite_da_collegare('62621111-0000-4000-8000-00000000000c') v
   where v.stesso_cliente),
  array[row('62623333-0000-4000-8000-0000000000f1'::uuid, 'Carlo Senza', true)::text],
  'il closer della call legge le sue vendite senza call: la nuova vendita lo avvisa'
);
select ok(
  not exists (select 1 from public.vendite_da_collegare('62621111-0000-4000-8000-00000000000b') v
              where v.sale_id = '62623333-0000-4000-8000-00000000000b'),
  'mai una vendita di un altro closer'
);
select throws_ok(
  $$ select * from public.vendite_da_collegare('62621111-0000-4000-8000-00000000000e') $$,
  'P0002', 'Call non trovata.',
  'né le vendite di una call che non è sua'
);
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok(
  $$ select * from public.vendite_da_collegare('62621111-0000-4000-8000-00000000000c') $$,
  '42501', 'Le vendite da collegare alla call le vedono il suo closer e l''admin.',
  'il setter non riceve vendite da collegare'
);
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select throws_ok(
  $$ select public.collega_vendita_call('62621111-0000-4000-8000-00000000000b', '62623333-0000-4000-8000-00000000000b') $$,
  '42501', 'La vendita la collega alla call solo l''admin.',
  'né collega una vendita'
);

set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(
  (select row(v.sale_id, v.cliente, v.tipo, v.valore_contratto, v.stesso_cliente)::text
   from public.vendite_da_collegare('62621111-0000-4000-8000-00000000000b') v limit 1),
  row('62623333-0000-4000-8000-00000000000b'::uuid, 'Bianca Scolegata', 'nuovo'::public.sale_type, 1200.00::numeric, true)::text,
  'prima la vendita senza call del cliente con lo stesso handle del lead'
);
select ok(
  not exists (select 1 from public.vendite_da_collegare('62621111-0000-4000-8000-00000000000b') v
              where v.sale_id in ('62623333-0000-4000-8000-00000000000a', '62623333-0000-4000-8000-0000000000ee')),
  'mai una vendita già collegata, mai una lontana di un altro cliente'
);
select ok(
  exists (select 1 from public.vendite_da_collegare('62621111-0000-4000-8000-00000000000c') v
          where v.sale_id = '62623333-0000-4000-8000-00000000000b' and not v.stesso_cliente),
  'per un''altra call la stessa vendita c''è perché è vicina, ma non come stesso cliente'
);
select throws_ok(
  $$ select * from public.vendite_da_collegare('62621111-0000-4000-8000-0000000000ff') $$,
  'P0002', 'Call non trovata.',
  'una call che non c''è'
);

select throws_ok(
  $$ select public.collega_vendita_call('62621111-0000-4000-8000-00000000000d', '62623333-0000-4000-8000-00000000000b') $$,
  '22023', 'La call non risulta chiusa: registra prima l''esito',
  'solo su una call chiusa'
);
select throws_ok(
  $$ select public.collega_vendita_call('62621111-0000-4000-8000-00000000000c', '62623333-0000-4000-8000-00000000000a') $$,
  '22023', 'Questa vendita è già collegata a un''altra call.',
  'una vendita collegata a un''altra call resta dov''è'
);
select throws_ok(
  $$ select public.collega_vendita_call('62621111-0000-4000-8000-00000000000a', '62623333-0000-4000-8000-00000000000b') $$,
  '23505', 'Questa call ha già una vendita registrata',
  'una call ha una sola vendita'
);
select throws_ok(
  $$ select public.collega_vendita_call('62621111-0000-4000-8000-00000000000b', '62623333-0000-4000-8000-0000000000ff') $$,
  'P0002', 'Vendita non trovata.',
  'una vendita che non c''è'
);

create temp table prima on commit drop as
select row(s.client_id, s.setter_id, s.closer_id, s.tipo, s.data_vendita, s.valore_contratto, s.numero_rate)::text as riga
from public.sales s where s.id = '62623333-0000-4000-8000-00000000000b';

select lives_ok(
  $$ select public.collega_vendita_call('62621111-0000-4000-8000-00000000000b', '62623333-0000-4000-8000-00000000000b') $$,
  'l''admin collega la vendita registrata senza call'
);
select is(
  (select call_id from public.sales where id = '62623333-0000-4000-8000-00000000000b'),
  '62621111-0000-4000-8000-00000000000b'::uuid,
  'la vendita porta la call'
);
select is(
  (select row(s.client_id, s.setter_id, s.closer_id, s.tipo, s.data_vendita, s.valore_contratto, s.numero_rate)::text
   from public.sales s where s.id = '62623333-0000-4000-8000-00000000000b'),
  (select riga from prima),
  'e niente altro cambia: setter, closer e importi restano della vendita'
);
select ok(
  exists (select 1 from public.audit_log
          where tabella = 'sales' and record_id = '62623333-0000-4000-8000-00000000000b' and azione = 'update'
            and utente_id = '11111111-1111-4111-8111-111111111111'
            and dati_prima ->> 'call_id' is null
            and dati_dopo ->> 'call_id' = '62621111-0000-4000-8000-00000000000b'),
  'il registro delle modifiche dice chi l''ha collegata'
);
select lives_ok(
  $$ select public.collega_vendita_call('62621111-0000-4000-8000-00000000000b', '62623333-0000-4000-8000-00000000000b') $$,
  'collegarla di nuovo non cambia niente'
);

set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(
  (select public.call_ha_vendita(c) from public.calls c where c.id = '62621111-0000-4000-8000-00000000000b'),
  true,
  'e per il closer la call non chiede più la vendita'
);

-- ---------------------------------------------------------------------------
-- calls.importata, never the missing author
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select public.elimina_persona('62629999-0000-4000-8000-000000000001') $$,
  'l''admin elimina il setter che aveva fissato la call G'
);
select is(
  (select created_by from public.calls where id = '62621111-0000-4000-8000-00000000000f'),
  null::uuid,
  'la call resta senza autore'
);
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select ok(
  exists (select 1 from public.calls c
          where c.id = '62621111-0000-4000-8000-00000000000f'
            and c.esito = 'chiusa' and not c.importata and public.call_ha_vendita(c) = false),
  'ma chiede ancora la sua vendita: la provvigione non si perde'
);
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ update public.calls set importata = true where id = '62621111-0000-4000-8000-00000000000f' $$,
  'l''admin segna a mano una call importata'
);
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(
  (select count(*) from public.calls c
   where c.id = '62621111-0000-4000-8000-00000000000f' and c.esito = 'chiusa' and not c.importata
     and public.call_ha_vendita(c) = false),
  0::bigint,
  'e la call importata non la chiede più'
);

select * from finish();
rollback;
