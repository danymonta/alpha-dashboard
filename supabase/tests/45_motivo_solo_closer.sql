-- The reason for not closing: the setter reads it on his calls, only the
-- closer (and the admin) write it.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(7);

insert into public.leads (id, nome, setter_id, fonte) values
  ('45450000-0000-4000-8000-000000000001', 'Lead Motivo', '22222222-2222-4222-8222-222222222222', 'dm_outbound');
insert into public.calls (id, lead_id, setter_id, closer_id, tipo, programmata_il, stato, qualificata, esito, obiezione_principale)
values ('45451111-0000-4000-8000-000000000001', '45450000-0000-4000-8000-000000000001',
  '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'discovery',
  '2025-02-10 11:00+01', 'svolta', true, 'persa', 'Fuori budget');

set local role authenticated;

-- the setter who booked it
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(
  (select obiezione_principale from public.calls where id = '45451111-0000-4000-8000-000000000001'),
  'Fuori budget',
  'il setter legge il motivo di non chiusura della call che ha fissato'
);
select throws_ok(
  $$ update public.calls set obiezione_principale = 'Cambiato dal setter' where id = '45451111-0000-4000-8000-000000000001' $$,
  '42501', null,
  'ma non lo cambia'
);
select lives_ok(
  $$ update public.calls set note = 'Nota del setter' where id = '45451111-0000-4000-8000-000000000001' $$,
  'le note della sua call le scrive ancora'
);
select throws_ok(
  $$ insert into public.calls (lead_id, setter_id, closer_id, tipo, programmata_il, obiezione_principale)
     values ('45450000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
       '33333333-3333-4333-8333-333333333333', 'discovery', now() + interval '1 day', 'Scritto dal setter') $$,
  '42501', null,
  'e non lo scrive nemmeno creando una call'
);

-- the closer of the call
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select lives_ok(
  $$ update public.calls set obiezione_principale = 'Deve parlarne con la compagna' where id = '45451111-0000-4000-8000-000000000001' $$,
  'il closer lo scrive'
);

-- the admin
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ update public.calls set obiezione_principale = 'Non è il momento' where id = '45451111-0000-4000-8000-000000000001' $$,
  'l''admin lo scrive'
);
select is(
  (select obiezione_principale from public.calls where id = '45451111-0000-4000-8000-000000000001'),
  'Non è il momento',
  'e resta l''ultimo scritto da chi può'
);

select * from finish();
rollback;
