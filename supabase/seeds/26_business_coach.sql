-- The business coach (1.52.0, Dany 22/10/2026): an external consultant who
-- reads what the admin reads and never writes. Invented person only.
-- One more sign-in account (password alpha1234, like seed.sql):
--   businesscoach@alpha.test  Paolo Consulente  business_coach
-- Fixed id and "on conflict do nothing": running it again changes nothing.
-- Before 30_tutorial.sql, so the tour stays closed for this account too.

insert into public.invites (email, ruolo) values
  ('businesscoach@alpha.test', 'business_coach')
on conflict (email) do update set ruolo = excluded.ruolo, revocato = false;

do $$
declare
  v_id uuid := 'bc000000-0000-4000-8000-000000000001';
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    v_id,
    'authenticated',
    'authenticated',
    'businesscoach@alpha.test',
    extensions.crypt('alpha1234', extensions.gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('full_name', 'Paolo Consulente'),
    now(), now(), '', '', '', ''
  )
  on conflict (id) do nothing;

  insert into auth.identities (
    id, user_id, provider_id, identity_data, provider,
    last_sign_in_at, created_at, updated_at
  )
  values (
    gen_random_uuid(),
    v_id,
    v_id::text,
    jsonb_build_object('sub', v_id::text, 'email', 'businesscoach@alpha.test', 'email_verified', true),
    'email',
    now(), now(), now()
  )
  on conflict do nothing;
end $$;
