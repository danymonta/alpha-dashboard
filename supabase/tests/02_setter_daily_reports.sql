-- Daily setting report: own rows only, any past day writable, never the future.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(8);

-- A second setter, to prove one setter never sees the other's numbers
insert into public.invites (email, ruolo) values ('setter2@alpha.test', 'setter');
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token
) values (
  '00000000-0000-0000-0000-000000000000',
  '66666666-6666-4666-8666-666666666666',
  'authenticated', 'authenticated', 'setter2@alpha.test', '', now(),
  '{}'::jsonb, '{"full_name":"Secondo Setter"}'::jsonb, now(), now(), '', '', '', ''
);

insert into public.setter_daily_reports (setter_id, data, dm_outbound)
values ('66666666-6666-4666-8666-666666666666', public.oggi(), 42);

-- Free today's slot for the insert test
delete from public.setter_daily_reports
where setter_id = '22222222-2222-4222-8222-222222222222'
  and data = public.oggi();

set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select ok(
  (select count(*) from public.setter_daily_reports) > 0,
  'il setter vede i propri report'
);

select is(
  (select count(*)::int from public.setter_daily_reports
   where setter_id <> '22222222-2222-4222-8222-222222222222'),
  0,
  'il setter non vede i report di un altro setter'
);

-- Today's report can be created
insert into public.setter_daily_reports (setter_id, data, dm_outbound, conversazioni)
values ('22222222-2222-4222-8222-222222222222', public.oggi(), 30, 12);

select is(
  (select dm_outbound from public.setter_daily_reports
   where setter_id = '22222222-2222-4222-8222-222222222222' and data = public.oggi()),
  30,
  'il setter crea il report di oggi'
);

-- Any past day can be filled in later (Dany, 27/09/2026) ...
insert into public.setter_daily_reports (setter_id, data, dm_outbound)
values ('22222222-2222-4222-8222-222222222222', public.oggi() - 60, 5)
on conflict (setter_id, data) do update set dm_outbound = excluded.dm_outbound;

-- ... but a day that has not happened yet cannot
select throws_ok(
  $$ insert into public.setter_daily_reports (setter_id, data, dm_outbound)
     values ('22222222-2222-4222-8222-222222222222', public.oggi() + 1, 5) $$,
  '42501'
);

with modificati as (
  update public.setter_daily_reports set dm_outbound = 999
  where setter_id = '22222222-2222-4222-8222-222222222222'
    and data = public.oggi() - 60
  returning 1
)
select is(
  (select count(*)::int from modificati),
  1,
  'il setter corregge un suo report di due mesi fa'
);

with modificati as (
  update public.setter_daily_reports set dm_outbound = 77
  where setter_id = '22222222-2222-4222-8222-222222222222'
    and data = public.oggi()
  returning 1
)
select is(
  (select count(*)::int from modificati),
  1,
  'il setter può correggere il report di oggi'
);

-- The closer has nothing to do with setting
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

select is(
  (select count(*)::int from public.setter_daily_reports),
  0,
  'il closer non vede alcun report di setting'
);

-- The admin sees everything, including the second setter
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select ok(
  (select count(*) from public.setter_daily_reports
   where setter_id = '66666666-6666-4666-8666-666666666666') = 1,
  'l''admin vede i report di tutti i setter'
);

select * from finish();
rollback;
