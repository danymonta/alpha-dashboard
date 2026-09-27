-- The first-sign-in tour: each person marks only their own as seen.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(4);

update public.profiles set tutorial_visto = false
where id in ('22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333');

set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select lives_ok($$ select public.segna_tutorial_visto() $$, 'il setter segna il suo tour come visto');
select is(
  (select tutorial_visto from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  true,
  'il suo flag è acceso'
);
select is(
  (select tutorial_visto from public.profiles where id = '33333333-3333-4333-8333-333333333333'),
  false,
  'quello del closer no'
);

-- no update policy for non-admins: the flag of someone else stays as it is
update public.profiles set tutorial_visto = true where id = '33333333-3333-4333-8333-333333333333';
select is(
  (select tutorial_visto from public.profiles where id = '33333333-3333-4333-8333-333333333333'),
  false,
  'e non lo può accendere al posto suo'
);

select * from finish();
rollback;
