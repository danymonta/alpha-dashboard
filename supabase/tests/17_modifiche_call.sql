-- Editing a call after the fact: who may reschedule it, and who may read the amount pitched.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(13);

-- Fixtures: a call of the seed setter assigned to the seed closer, and a call of
-- another setter assigned to the admin
insert into public.invites (email, ruolo) values ('setter4@alpha.test', 'setter');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', '88888888-8888-4888-8888-888888888888',
  'authenticated', 'authenticated', 'setter4@alpha.test', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');

insert into public.leads (id, nome, setter_id, fonte) values
  ('eeee0000-0000-4000-8000-000000000001', 'Modifica Uno', '22222222-2222-4222-8222-222222222222', 'dm_inbound'),
  ('eeee0000-0000-4000-8000-000000000002', 'Modifica Due', '88888888-8888-4888-8888-888888888888', 'dm_inbound');

insert into public.calls (id, lead_id, setter_id, closer_id, tipo, programmata_il) values
  ('eeee1111-0000-4000-8000-000000000001', 'eeee0000-0000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'discovery', now()),
  ('eeee1111-0000-4000-8000-000000000002', 'eeee0000-0000-4000-8000-000000000002',
   '88888888-8888-4888-8888-888888888888', '11111111-1111-4111-8111-111111111111', 'discovery', now());

insert into public.call_pitch (call_id, importo_proposto) values
  ('eeee1111-0000-4000-8000-000000000001', 1500),
  ('eeee1111-0000-4000-8000-000000000002', 1800);

set local role authenticated;

-- Setter: reschedules their own call, the time is read in Europe/Rome
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select lives_ok(
  $$ select public.modifica_call('eeee1111-0000-4000-8000-000000000001', 'strategy',
       '2026-10-10', '18:30', '33333333-3333-4333-8333-333333333333', 'spostata dal lead') $$,
  'il setter riprogramma una sua call'
);

select is(
  (select programmata_il from public.calls where id = 'eeee1111-0000-4000-8000-000000000001'),
  '2026-10-10 16:30:00+00'::timestamptz,
  'le 18:30 del 10/10 sono ora di Roma (UTC+2)'
);

select throws_ok(
  $$ select public.modifica_call('eeee1111-0000-4000-8000-000000000002', 'strategy',
       '2026-10-10', '18:30', '11111111-1111-4111-8111-111111111111') $$,
  '42501', 'Call non trovata o non tua',
  'il setter non tocca le call di un altro setter'
);

select throws_ok(
  $$ select public.modifica_call('eeee1111-0000-4000-8000-000000000001', 'strategy',
       '2026-10-10', '18:30', '22222222-2222-4222-8222-222222222222') $$,
  '22023', 'Il closer scelto non è attivo o non può chiudere',
  'una call si assegna solo a un closer o a un admin'
);

select is(
  (select count(*)::int from public.call_pitch),
  0,
  'il setter non legge mai l''importo proposto, neanche delle sue call'
);

select throws_ok(
  $$ select public.dettagli_call('eeee1111-0000-4000-8000-000000000001', null, 'buona', null, 900) $$,
  '42501', 'I dettagli della call li registra chi la fa',
  'il setter non registra i dettagli della call'
);

-- Closer: sees and records the pitch of the calls assigned to them only
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

select is(
  (select array_agg(importo_proposto) from public.call_pitch),
  array[1500.00]::numeric[],
  'il closer vede l''importo proposto solo delle sue call'
);

select lives_ok(
  $$ select public.dettagli_call('eeee1111-0000-4000-8000-000000000001',
       'https://fathom.video/share/abc', 'media', null, 1200) $$,
  'il closer registra link, performance e importo'
);

select is(
  (select row(c.link_registrazione, c.performance::text, p.importo_proposto)::text
   from public.calls c join public.call_pitch p on p.call_id = c.id
   where c.id = 'eeee1111-0000-4000-8000-000000000001'),
  '(https://fathom.video/share/abc,media,1200.00)',
  'i dettagli sono salvati'
);

select throws_ok(
  $$ select public.modifica_call('eeee1111-0000-4000-8000-000000000001', 'strategy',
       '2026-10-11', '10:00', '11111111-1111-4111-8111-111111111111') $$,
  '42501', 'La call la riassegna il setter o l''admin',
  'il closer non riassegna la call a un altro'
);

select lives_ok(
  $$ select public.modifica_call('eeee1111-0000-4000-8000-000000000001', 'strategy',
       '2026-10-11', '10:00', '33333333-3333-4333-8333-333333333333') $$,
  'il closer sposta una call assegnata a lui'
);

select lives_ok(
  $$ select public.dettagli_call('eeee1111-0000-4000-8000-000000000001', null, null, null, null) $$,
  'svuotare i dettagli toglie anche l''importo'
);

reset role;

select is(
  (select count(*)::int from public.call_pitch where call_id = 'eeee1111-0000-4000-8000-000000000001'),
  0,
  'la riga dell''importo è stata tolta'
);

select * from finish();
rollback;
