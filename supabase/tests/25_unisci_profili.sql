-- A placeholder profile merges into the real one: data moves, duplicates keep the real copy.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(6);

insert into public.invites (email, ruolo) values ('segnaposto@prova.invalid', 'setter'), ('vero@alpha.test', 'setter');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', 'eeee9999-0000-4000-8000-00000000000a',
   'authenticated', 'authenticated', 'segnaposto@prova.invalid', '', now(), '{}'::jsonb, '{"full_name":"Segnaposto"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'eeee9999-0000-4000-8000-00000000000b',
   'authenticated', 'authenticated', 'vero@alpha.test', '', now(), '{}'::jsonb, '{"full_name":"Vero"}'::jsonb, now(), now(), '', '', '', '');

insert into public.setter_daily_reports (setter_id, data, dm_outbound) values
  ('eeee9999-0000-4000-8000-00000000000a', '2031-07-01', 10),
  ('eeee9999-0000-4000-8000-00000000000a', '2031-07-02', 20),
  ('eeee9999-0000-4000-8000-00000000000b', '2031-07-02', 99);
insert into public.commission_rules (profile_id, percentuale, applica_a, valida_dal)
values ('eeee9999-0000-4000-8000-00000000000a', 0.05, '{nuovo}', '2031-07-01');
insert into public.commission_payouts (profile_id, periodo, importo, pagato_il)
values ('eeee9999-0000-4000-8000-00000000000a', '2031-07-01', 25, '2031-07-15');

set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select throws_ok(
  $$ select public.unisci_profili('eeee9999-0000-4000-8000-00000000000a', 'eeee9999-0000-4000-8000-00000000000b') $$,
  '42501', null, 'solo l''admin unisce i profili'
);

set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select public.unisci_profili('eeee9999-0000-4000-8000-00000000000a', 'eeee9999-0000-4000-8000-00000000000b') $$,
  'l''admin unisce il segnaposto al profilo vero'
);
select is(
  (select array_agg(dm_outbound order by data) from public.setter_daily_reports where setter_id = 'eeee9999-0000-4000-8000-00000000000b'),
  array[10, 99],
  'i report passano al profilo vero; nel giorno in comune resta il suo'
);
select is(
  (select row((select count(*) from public.commission_rules where profile_id = 'eeee9999-0000-4000-8000-00000000000b'),
              (select count(*) from public.commission_payouts where profile_id = 'eeee9999-0000-4000-8000-00000000000b'))::text),
  '(1,1)',
  'regola e pagamento passano al profilo vero'
);
select is(
  (select count(*)::int from public.profiles where id = 'eeee9999-0000-4000-8000-00000000000a'),
  0,
  'il segnaposto non esiste più'
);
select throws_ok(
  $$ select public.unisci_profili('11111111-1111-4111-8111-111111111111', 'eeee9999-0000-4000-8000-00000000000b') $$,
  '42501', 'Il tuo account non si può unire a un altro',
  'l''admin non unisce sé stesso'
);

select * from finish();
rollback;
