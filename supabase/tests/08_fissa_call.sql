-- fissa_call: lead and call together, atomically, with RLS still in charge.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(10);

set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

-- A brand new lead
create temp table esito1 on commit drop as
select * from public.fissa_call(
  'Test Nuovo', 'dm_outbound', 'discovery', '2026-10-01', '15:30',
  '11111111-1111-4111-8111-111111111111', '@Test.Nuovo'
);

select is(
  (select lead_esistente from esito1),
  false,
  'un handle mai visto crea un lead nuovo'
);

select is(
  (select array[l.setter_id::text, l.stato::text, l.instagram_handle]
   from public.leads l where l.id = (select id_lead from esito1)),
  array['22222222-2222-4222-8222-222222222222', 'call_fissata', '@test.nuovo'],
  'il lead è del setter, in stato call_fissata, con handle normalizzato'
);

select is(
  (select c.programmata_il from public.calls c where c.id = (select id_call from esito1)),
  '2026-10-01 13:30:00+00'::timestamptz,
  'le 15:30 italiane di ottobre (ora legale) diventano le 13:30 UTC'
);

select is(
  (select c.stato::text from public.calls c where c.id = (select id_call from esito1)),
  'programmata',
  'la call nasce programmata'
);

-- Same person books again (different case, no @): same lead, second call
create temp table esito2 on commit drop as
select * from public.fissa_call(
  'Test Nuovo', 'dm_outbound', 'strategy', '2026-10-08', '10:00',
  '11111111-1111-4111-8111-111111111111', 'TEST.NUOVO'
);

select is(
  (select array[(select id_lead from esito2)::text, (select lead_esistente from esito2)::text]),
  array[(select id_lead from esito1)::text, 'true'],
  'lo stesso handle riusa il lead invece di duplicarlo'
);

select is(
  (select count(*)::int from public.calls where lead_id = (select id_lead from esito1)),
  2,
  'il lead ha ora due call'
);

-- Winter time: 15:30 in January is 14:30 UTC
create temp table esito3 on commit drop as
select * from public.fissa_call(
  'Test Inverno', 'referral', 'discovery', '2027-01-12', '15:30',
  '33333333-3333-4333-8333-333333333333'
);

select is(
  (select c.programmata_il from public.calls c where c.id = (select id_call from esito3)),
  '2027-01-12 14:30:00+00'::timestamptz,
  'le 15:30 italiane di gennaio (ora solare) diventano le 14:30 UTC'
);

-- The closer must be able to close: the setter is not a closer
select throws_ok(
  $$ select * from public.fissa_call(
       'Orfano', 'dm_inbound', 'discovery', '2026-10-02', '11:00',
       '22222222-2222-4222-8222-222222222222', '@orfano') $$,
  '22023'
);

select is(
  (select count(*)::int from public.leads where instagram_handle = '@orfano'),
  0,
  'se la call fallisce non resta nessun lead orfano'
);

-- Only the setter books from here
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

select throws_ok(
  $$ select * from public.fissa_call(
       'Dal closer', 'dm_inbound', 'discovery', '2026-10-02', '11:00',
       '33333333-3333-4333-8333-333333333333') $$,
  '42501'
);

select * from finish();
rollback;
