-- A deactivated member reads their own profile (to be told so) and nothing else.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(4);

update public.profiles set attivo = false where id = '33333333-3333-4333-8333-333333333333';

set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

select is(
  (select attivo from public.profiles where id = '33333333-3333-4333-8333-333333333333'),
  false,
  'il disattivato legge il proprio profilo e scopre di esserlo'
);

select is(
  (select count(*)::int from public.profiles where id <> '33333333-3333-4333-8333-333333333333'),
  0,
  'ma non vede nessun altro membro del team'
);

select is(
  (select count(*)::int from public.calls),
  0,
  'e nessuna call, nemmeno le sue'
);

select is(public.current_role(), null::public.app_role, 'il suo ruolo effettivo è nullo');

select * from finish();
rollback;
