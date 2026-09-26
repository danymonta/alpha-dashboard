-- Rules are editable, but one person never has two rules in force on the same day.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(4);

insert into public.invites (email, ruolo) values ('setter5@alpha.test', 'setter');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999999999',
  'authenticated', 'authenticated', 'setter5@alpha.test', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');

insert into public.commission_rules (id, profile_id, percentuale, applica_a, valida_dal, valida_al) values
  ('dddd0000-0000-4000-8000-000000000001', '99999999-9999-4999-8999-999999999999', 0.05, '{nuovo}', '2026-01-01', '2026-06-30'),
  ('dddd0000-0000-4000-8000-000000000002', '99999999-9999-4999-8999-999999999999', 0.07, '{nuovo}', '2026-07-01', null);

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select throws_ok(
  $$ update public.commission_rules set valida_al = '2026-07-15'
     where id = 'dddd0000-0000-4000-8000-000000000001' $$,
  '22023', 'Le date si sovrappongono a un''altra regola della stessa persona: accorcia prima quella',
  'allungare una regola sopra la successiva è rifiutato'
);

select throws_ok(
  $$ insert into public.commission_rules (profile_id, percentuale, applica_a, valida_dal)
     values ('99999999-9999-4999-8999-999999999999', 0.1, '{rinnovo}', '2026-09-01') $$,
  '22023', 'Le date si sovrappongono a un''altra regola della stessa persona: accorcia prima quella',
  'due regole aperte nello stesso periodo non convivono'
);

select lives_ok(
  $$ update public.commission_rules set percentuale = 0.06, valida_dal = '2026-02-01'
     where id = 'dddd0000-0000-4000-8000-000000000001' $$,
  'correggere percentuale e date senza sovrapporsi è permesso'
);

select lives_ok(
  $$ select public.nuova_regola_provvigione('99999999-9999-4999-8999-999999999999', 0.08, '{nuovo}', '2027-01-01') $$,
  'una nuova regola chiude la precedente e passa il controllo'
);

select * from finish();
rollback;
