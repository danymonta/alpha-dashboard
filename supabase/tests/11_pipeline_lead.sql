-- Manual lead pipeline: who may move a lead, and only its status.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(8);

select ok(
  'follow_up' = any(enum_range(null::public.lead_status)::text[]),
  'lo stato follow_up esiste'
);

-- Fixtures: a lead of the seed setter with a call of the closer, one without calls,
-- and a lead of another setter
insert into public.invites (email, ruolo) values ('setter3@alpha.test', 'setter');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', '77777777-7777-4777-8777-777777777777',
  'authenticated', 'authenticated', 'setter3@alpha.test', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');

insert into public.leads (id, nome, setter_id, fonte) values
  ('ffff0000-0000-4000-8000-000000000001', 'Pipeline Uno', '22222222-2222-4222-8222-222222222222', 'dm_inbound'),
  ('ffff0000-0000-4000-8000-000000000002', 'Pipeline Due', '22222222-2222-4222-8222-222222222222', 'dm_inbound'),
  ('ffff0000-0000-4000-8000-000000000003', 'Pipeline Tre', '77777777-7777-4777-8777-777777777777', 'dm_inbound');

insert into public.calls (lead_id, setter_id, closer_id, tipo, programmata_il)
values ('ffff0000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
        '33333333-3333-4333-8333-333333333333', 'discovery', now());

set local role authenticated;

-- The setter moves his own lead
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select is(
  public.aggiorna_stato_lead('ffff0000-0000-4000-8000-000000000002', 'follow_up')::text,
  'follow_up',
  'il setter aggiorna lo stato di un suo lead'
);

select throws_ok(
  $$ select public.aggiorna_stato_lead('ffff0000-0000-4000-8000-000000000003', 'perso') $$,
  '42501'
);

-- The closer moves the lead of his call, not others
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

select is(
  public.aggiorna_stato_lead('ffff0000-0000-4000-8000-000000000001', 'cliente')::text,
  'cliente',
  'il closer aggiorna il lead di una sua call'
);

select throws_ok(
  $$ select public.aggiorna_stato_lead('ffff0000-0000-4000-8000-000000000002', 'perso') $$,
  '42501'
);

select throws_ok(
  $$ select public.aggiorna_stato_lead('00000000-0000-4000-8000-000000000000', 'perso') $$,
  '42501'
);

-- ... and still cannot edit the rest of the lead directly
with modificati as (
  update public.leads set nome = 'Rinominato'
  where id = 'ffff0000-0000-4000-8000-000000000001'
  returning 1
)
select is((select count(*)::int from modificati), 0, 'il closer non modifica i dati del lead');

reset role;
select is(
  (select array[nome, stato::text] from public.leads where id = 'ffff0000-0000-4000-8000-000000000001'),
  array['Pipeline Uno', 'cliente'],
  'cambia solo lo stato, il resto del lead resta com''era'
);

select * from finish();
rollback;
