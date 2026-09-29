-- The admin books calls too: for himself or for an active setter. The setter
-- books only for himself, and cannot move his call onto someone else's lead.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(17);

-- Fixtures: a second setter with a lead of his own, and a deactivated setter
insert into public.invites (email, ruolo) values
  ('setter.call.admin@alpha.test', 'setter'),
  ('setter.spento@alpha.test', 'setter');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', '9a9a9a9a-0000-4000-8000-000000000001',
   'authenticated', 'authenticated', 'setter.call.admin@alpha.test', '', now(),
   '{}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '9a9a9a9a-0000-4000-8000-000000000002',
   'authenticated', 'authenticated', 'setter.spento@alpha.test', '', now(),
   '{}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
update public.profiles set attivo = false where id = '9a9a9a9a-0000-4000-8000-000000000002';

insert into public.leads (id, nome, setter_id, fonte) values
  ('9a9a0000-0000-4000-8000-000000000001', 'Lead Altro Setter', '9a9a9a9a-0000-4000-8000-000000000001', 'dm_inbound');

set local role authenticated;

-- ---------------------------------------------------------------------------
-- Admin
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

-- For himself (no setter passed), and in the past: a call that happened but is not in the app
create temp table da_admin on commit drop as
select * from public.fissa_call(
  'Admin Per Se', 'referral', 'discovery', '2026-09-01', '10:00',
  '11111111-1111-4111-8111-111111111111', '@admin.perse'
);

select is(
  (select array[c.setter_id::text, c.closer_id::text, c.created_by::text]
   from public.calls c where c.id = (select id_call from da_admin)),
  array['11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111',
        '11111111-1111-4111-8111-111111111111'],
  'senza setter, l''admin fissa la call per sé stesso'
);

select is(
  (select l.setter_id from public.leads l where l.id = (select id_lead from da_admin)),
  '11111111-1111-4111-8111-111111111111'::uuid,
  'il lead è dell''admin, che l''ha settato'
);

select is(
  (select c.programmata_il from public.calls c where c.id = (select id_call from da_admin)),
  '2026-09-01 08:00:00+00'::timestamptz,
  'una call nel passato si registra, con l''ora italiana'
);

-- For the seed setter, run by the seed closer
create temp table per_setter on commit drop as
select * from public.fissa_call(
  'Admin Per Loris', 'dm_inbound', 'discovery', '2026-09-28', '18:00',
  '33333333-3333-4333-8333-333333333333', '@admin.perloris',
  '22222222-2222-4222-8222-222222222222'
);

select is(
  (select array[c.setter_id::text, c.closer_id::text, c.created_by::text]
   from public.calls c where c.id = (select id_call from per_setter)),
  array['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333',
        '11111111-1111-4111-8111-111111111111'],
  'l''admin fissa la call per il setter: setter scelto, creata dall''admin'
);

select is(
  (select array[l.setter_id::text, l.created_by::text, l.stato::text]
   from public.leads l where l.id = (select id_lead from per_setter)),
  array['22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'call_fissata'],
  'il lead nasce del setter scelto'
);

-- Same handle, same setter: the lead is reused, never duplicated
create temp table di_nuovo on commit drop as
select * from public.fissa_call(
  'Admin Per Loris', 'dm_inbound', 'discovery', '2026-09-29', '11:00',
  '11111111-1111-4111-8111-111111111111', 'ADMIN.PERLORIS',
  '22222222-2222-4222-8222-222222222222'
);

select is(
  (select array[(select id_lead from di_nuovo)::text, (select lead_esistente from di_nuovo)::text]),
  array[(select id_lead from per_setter)::text, 'true'],
  'lo stesso handle dello stesso setter riusa il lead'
);

-- Same handle, a different setter (the admin himself): a lead of his own
create temp table altro_setter on commit drop as
select * from public.fissa_call(
  'Admin Per Loris', 'dm_inbound', 'discovery', '2026-09-29', '12:00',
  '11111111-1111-4111-8111-111111111111', '@admin.perloris'
);

select isnt(
  (select id_lead from altro_setter),
  (select id_lead from per_setter),
  'il lead di un altro setter non si riusa: ognuno ha i suoi'
);

-- The setter must be an active setter (or the admin himself)
select throws_ok(
  $$ select * from public.fissa_call(
       'Per Il Closer', 'dm_inbound', 'discovery', '2026-09-29', '11:00',
       '11111111-1111-4111-8111-111111111111', '@per.ilcloser',
       '33333333-3333-4333-8333-333333333333') $$,
  '22023',
  'Il setter scelto non è attivo o non è un setter',
  'il closer non è un setter'
);

select throws_ok(
  $$ select * from public.fissa_call(
       'Per Lo Spento', 'dm_inbound', 'discovery', '2026-09-29', '11:00',
       '11111111-1111-4111-8111-111111111111', '@per.lospento',
       '9a9a9a9a-0000-4000-8000-000000000002') $$,
  '22023',
  'Il setter scelto non è attivo o non è un setter',
  'un setter disattivato non riceve call'
);

select is(
  (select count(*)::int from public.leads where instagram_handle in ('@per.ilcloser', '@per.lospento')),
  0,
  'un setter rifiutato non lascia lead orfani'
);

-- ---------------------------------------------------------------------------
-- Setter: always for himself
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

create temp table dal_setter on commit drop as
select * from public.fissa_call(
  'Setter Per Altri', 'dm_outbound', 'discovery', '2026-10-02', '11:00',
  '11111111-1111-4111-8111-111111111111', '@setter.peraltri',
  '9a9a9a9a-0000-4000-8000-000000000001'
);

select is(
  (select array[c.setter_id::text, c.created_by::text]
   from public.calls c where c.id = (select id_call from dal_setter)),
  array['22222222-2222-4222-8222-222222222222', '22222222-2222-4222-8222-222222222222'],
  'il setter non fissa per un altro: il setter passato si ignora'
);

select is(
  (select l.setter_id from public.leads l where l.id = (select id_lead from dal_setter)),
  '22222222-2222-4222-8222-222222222222'::uuid,
  'e il lead resta suo'
);

-- The hardened update policy: his call cannot move onto another setter's lead.
-- A row that fails WITH CHECK is an error, not a silent no-op.
select throws_ok(
  format(
    $$ update public.calls set lead_id = '9a9a0000-0000-4000-8000-000000000001' where id = %L $$,
    (select id_call from dal_setter)
  ),
  '42501',
  null,
  'il setter non sposta la sua call sul lead di un altro setter'
);

select lives_ok(
  format(
    $$ update public.calls set note = 'richiamare dopo le 18' where id = %L $$,
    (select id_call from dal_setter)
  ),
  'il setter aggiorna ancora la sua call sul suo lead'
);

-- ---------------------------------------------------------------------------
-- Closer and coach: no booking
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

select throws_ok(
  $$ select * from public.fissa_call(
       'Dal Closer', 'dm_inbound', 'discovery', '2026-10-02', '11:00',
       '33333333-3333-4333-8333-333333333333', null,
       '22222222-2222-4222-8222-222222222222') $$,
  '42501',
  'Le call le fissano il setter e l''admin',
  'il closer non fissa call'
);

set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';

select throws_ok(
  $$ select * from public.fissa_call(
       'Dal Coach', 'dm_inbound', 'discovery', '2026-10-02', '11:00',
       '11111111-1111-4111-8111-111111111111') $$,
  '42501',
  'Le call le fissano il setter e l''admin',
  'il coach non fissa call'
);

-- the admin still sees the setter's call where it was
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select is(
  (select c.lead_id from public.calls c where c.id = (select id_call from dal_setter)),
  (select id_lead from dal_setter),
  'la call del setter è rimasta sul suo lead'
);

select * from finish();
rollback;
