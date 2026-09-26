-- Invite gate and profile self-protection (spec section 7).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(7);

-- An uninvited address cannot become a user
select throws_ok(
  $$
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      '99999999-9999-4999-8999-999999999999',
      'authenticated', 'authenticated', 'sconosciuto@alpha.test', '', now(),
      '{}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''
    )
  $$,
  '42501'
);

-- An invited address gets the role of the invite
insert into public.invites (email, ruolo) values ('coach@alpha.test', 'coach');

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '44444444-4444-4444-8444-444444444444',
  'authenticated', 'authenticated', 'coach@alpha.test', '', now(),
  '{}'::jsonb, '{"full_name":"Nuovo Coach"}'::jsonb, now(), now(), '', '', '', ''
);

select is(
  (select ruolo::text from public.profiles where email = 'coach@alpha.test'),
  'coach',
  'l''invito determina il ruolo del profilo'
);

select is(
  (select nome from public.profiles where email = 'coach@alpha.test'),
  'Nuovo Coach',
  'il nome arriva dai metadati dell''utente'
);

select isnt(
  (select usato_at from public.invites where email = 'coach@alpha.test'),
  null,
  'l''invito viene marcato come usato'
);

-- A revoked invite does not let anybody in
insert into public.invites (email, ruolo, revocato)
values ('revocato@alpha.test', 'setter', true);

select throws_ok(
  $$
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000',
      '55555555-5555-4555-8555-555555555555',
      'authenticated', 'authenticated', 'revocato@alpha.test', '', now(),
      '{}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''
    )
  $$,
  '42501'
);

-- The admin cannot deactivate themselves nor drop their own admin role
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select throws_ok(
  $$ update public.profiles set attivo = false
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501'
);

select throws_ok(
  $$ update public.profiles set ruolo = 'setter'
     where id = '11111111-1111-4111-8111-111111111111' $$,
  '42501'
);

select * from finish();
rollback;
