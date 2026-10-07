-- The follow-up call (Dany, 07/10/2026): a held call that ended in follow-up
-- gets, if the closer booked one, a NEW call on the chosen day, linked to the
-- first (calls.follow_up_di): same lead, setter, closer and type. Only the
-- call's closer and the admin book it (fissa_follow_up), once per call, from
-- today on (the admin also up to a year back), always after the first call.
-- The link stays coherent (calls_follow_up_coerenza): same lead for everyone,
-- the setter never inserts it, no session but the admin's changes it. The
-- follow-up counts in the closer's numbers like every call, never in the
-- setter's bookings, also once its first call is deleted (calls.di_follow_up
-- stays). A closer whose follow-up was handed to another closer knows it is
-- there (call_ha_follow_up) and hears so, never its day; the call's closer
-- must be active to get one.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(70);

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
select col_type_is('public', 'calls', 'follow_up_di', 'uuid', 'la call di cui questa è il follow-up');
select col_is_null('public', 'calls', 'follow_up_di', 'vuota per ogni altra call');
select col_type_is('public', 'calls', 'di_follow_up', 'boolean', 'il segno della call di follow-up');
select col_default_is('public', 'calls', 'di_follow_up', 'false', 'falso per ogni altra call');
select has_index('public', 'calls', 'calls_follow_up_di_unico', 'una sola call di follow-up per call');
select has_function('public', 'fissa_follow_up', array['uuid', 'date', 'time without time zone'], 'fissa_follow_up esiste');
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'public.fissa_follow_up(uuid, date, time)'::regprocedure),
  'fissa_follow_up è security definer con search_path vuoto'
);
select ok(
  not has_function_privilege('anon', 'public.fissa_follow_up(uuid, date, time)', 'execute')
  and has_function_privilege('authenticated', 'public.fissa_follow_up(uuid, date, time)', 'execute'),
  'anon non la chiama, chi è entrato sì'
);
select has_trigger('public', 'calls', 'calls_follow_up_coerenza', 'il collegamento resta coerente');
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
     and not has_function_privilege('anon', p.oid, 'execute')
   from pg_proc p where p.oid = 'public.call_ha_follow_up(public.calls)'::regprocedure),
  'call_ha_follow_up è un campo calcolato security definer, mai per anon'
);

-- ---------------------------------------------------------------------------
-- Fixtures. Seed: admin 1111, setter 2222, closer 3333, coach 4444; one more
-- closer. The first calls three days ago, at 18:00 in Rome.
-- ---------------------------------------------------------------------------
insert into public.invites (email, ruolo) values ('closer.follow.up@alpha.test', 'closer');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', '59595959-5959-4959-8959-595959595959',
  'authenticated', 'authenticated', 'closer.follow.up@alpha.test', '', now(),
  '{}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');

insert into public.leads (id, nome, setter_id, fonte, stato, created_at) values
  ('59590000-0000-4000-8000-000000000001', 'Lead Follow Up', '22222222-2222-4222-8222-222222222222', 'dm_inbound', 'follow_up', now() - interval '10 days'),
  ('59590000-0000-4000-8000-000000000002', 'Lead Da Fare', '22222222-2222-4222-8222-222222222222', 'dm_inbound', 'call_fissata', now() - interval '10 days'),
  ('59590000-0000-4000-8000-000000000003', 'Lead Persa', '22222222-2222-4222-8222-222222222222', 'dm_inbound', 'perso', now() - interval '10 days'),
  ('59590000-0000-4000-8000-000000000004', 'Lead Strategy', '22222222-2222-4222-8222-222222222222', 'dm_inbound', 'follow_up', now() - interval '10 days'),
  ('59590000-0000-4000-8000-000000000005', 'Lead Altro Closer', '22222222-2222-4222-8222-222222222222', 'dm_inbound', 'follow_up', now() - interval '10 days');

create temp table momenti on commit drop as
select ((public.oggi() - 3) + time '18:00') at time zone 'Europe/Rome' as partenza;
grant select on momenti to authenticated;

insert into public.calls
  (id, lead_id, setter_id, closer_id, tipo, programmata_il, stato, qualificata, esito, obiezione_principale, created_at)
select v.id, v.lead_id, '22222222-2222-4222-8222-222222222222', v.closer_id, v.tipo, m.partenza,
       v.stato::public.call_status, v.qualificata, v.esito::public.call_outcome, v.motivo, now() - interval '10 days'
from momenti m, (values
  -- held, ended in follow-up: the closer books its follow-up
  ('59591111-0000-4000-8000-000000000001'::uuid, '59590000-0000-4000-8000-000000000001'::uuid,
   '33333333-3333-4333-8333-333333333333'::uuid, 'discovery'::public.call_type, 'svolta', true, 'follow_up', 'Ci deve pensare'),
  -- still to be held
  ('59591111-0000-4000-8000-000000000002', '59590000-0000-4000-8000-000000000002',
   '33333333-3333-4333-8333-333333333333', 'discovery', 'programmata', null, null, null),
  -- held and lost
  ('59591111-0000-4000-8000-000000000003', '59590000-0000-4000-8000-000000000003',
   '33333333-3333-4333-8333-333333333333', 'discovery', 'svolta', true, 'persa', 'Fuori budget'),
  -- a strategy call ended in follow-up: the admin records its follow-up already held
  ('59591111-0000-4000-8000-000000000004', '59590000-0000-4000-8000-000000000004',
   '33333333-3333-4333-8333-333333333333', 'strategy', 'svolta', true, 'follow_up', 'Sente la moglie'),
  -- the other closer's
  ('59591111-0000-4000-8000-000000000005', '59590000-0000-4000-8000-000000000005',
   '59595959-5959-4959-8959-595959595959', 'discovery', 'svolta', true, 'follow_up', 'Richiamare'),
  -- a second call of the first lead, still to be held: the link never goes on it
  ('59591111-0000-4000-8000-000000000007', '59590000-0000-4000-8000-000000000001',
   '33333333-3333-4333-8333-333333333333', 'discovery', 'programmata', null, null, null)
) as v(id, lead_id, closer_id, tipo, stato, qualificata, esito, motivo);

-- the setter's report on both days, so his row is in metriche_setting
insert into public.setter_daily_reports (setter_id, data, dm_outbound)
values ('22222222-2222-4222-8222-222222222222', public.oggi(), 1),
       ('22222222-2222-4222-8222-222222222222', public.oggi() - 1, 1)
on conflict (setter_id, data) do nothing;

-- the setter's bookings and the closer's day before any follow-up
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
create temp table prima on commit drop as
select
  (select prenotate_inbound from public.metriche_setting(public.oggi() - 1, public.oggi())
    where setter_id = '22222222-2222-4222-8222-222222222222') as metriche,
  (select prenotate_inbound from public.giornate_setter(public.oggi() - 1, public.oggi(), '22222222-2222-4222-8222-222222222222')
    where data is null) as giornate,
  coalesce((select call from public.giornate_closer(public.oggi() - 1, public.oggi() - 1, '33333333-3333-4333-8333-333333333333')
    where data is null), 0) as closer_ieri,
  (select count(*) from public.leads) as lead;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
alter table prima add column miei bigint;
update prima set miei = (select prenotate_inbound from public.miei_numeri_periodo(public.oggi() - 1, public.oggi()));
grant select on prima to authenticated;
select ok(
  (select metriche is not null and giornate is not null and miei is not null from prima),
  'i numeri di partenza del setter ci sono'
);

-- no session (the seed, the imports, the service role)
set local request.jwt.claims to '{}';
select throws_ok(
  $$ update public.calls set follow_up_di = id where id = '59591111-0000-4000-8000-000000000007' $$,
  '23514', null,
  'una call non è il follow-up di sé stessa'
);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- The link (calls_follow_up_coerenza)
-- ---------------------------------------------------------------------------
-- the setter: never inserts it, never changes it
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok(
  $$ insert into public.calls (lead_id, setter_id, closer_id, tipo, programmata_il, follow_up_di)
     values ('59590000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
             '33333333-3333-4333-8333-333333333333', 'discovery', now() + interval '2 days',
             '59591111-0000-4000-8000-000000000001') $$,
  '42501', 'La call di follow-up la fissano il closer della call e l''admin.',
  'il setter non inserisce una call di follow-up'
);
select throws_ok(
  $$ update public.calls set follow_up_di = '59591111-0000-4000-8000-000000000001'
     where id = '59591111-0000-4000-8000-000000000007' $$,
  '42501', 'Il collegamento della call di follow-up non si cambia',
  'né collega una sua call a un''altra'
);
select throws_ok(
  $$ insert into public.calls (lead_id, setter_id, closer_id, tipo, programmata_il, di_follow_up)
     values ('59590000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
             '33333333-3333-4333-8333-333333333333', 'discovery', now() + interval '2 days', true) $$,
  '42501', 'La call di follow-up la fissano il closer della call e l''admin.',
  'né una call segnata come call di follow-up, senza collegamento'
);

-- the closer: never changes it either
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select throws_ok(
  $$ update public.calls set follow_up_di = '59591111-0000-4000-8000-000000000001'
     where id = '59591111-0000-4000-8000-000000000007' $$,
  '42501', 'Il collegamento della call di follow-up non si cambia',
  'il closer non cambia il collegamento con un update'
);
select throws_ok(
  $$ update public.calls set di_follow_up = true where id = '59591111-0000-4000-8000-000000000007' $$,
  '42501', 'Il collegamento della call di follow-up non si cambia',
  'né il segno della call di follow-up'
);

-- the admin is free, but the follow-up is always of the same lead
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok(
  $$ insert into public.calls (lead_id, setter_id, closer_id, tipo, programmata_il, follow_up_di)
     values ('59590000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
             '33333333-3333-4333-8333-333333333333', 'discovery', now() + interval '2 days',
             '59591111-0000-4000-8000-000000000001') $$,
  '22023', 'La call di follow-up è dello stesso lead della call di partenza',
  'una call di follow-up di un altro lead no, nemmeno per l''admin'
);
select lives_ok(
  $$ update public.calls set follow_up_di = '59591111-0000-4000-8000-000000000001'
     where id = '59591111-0000-4000-8000-000000000007' $$,
  'l''admin collega a mano una call dello stesso lead'
);
select is(
  (select di_follow_up from public.calls where id = '59591111-0000-4000-8000-000000000007'),
  true,
  'e il collegamento porta con sé il segno della call di follow-up'
);
select lives_ok(
  $$ update public.calls set follow_up_di = null, di_follow_up = false where id = '59591111-0000-4000-8000-000000000007' $$,
  'e la scollega, segno compreso'
);

-- ---------------------------------------------------------------------------
-- Who books it
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok(
  $$ select public.fissa_follow_up('59591111-0000-4000-8000-000000000001', public.oggi() + 2, '18:00') $$,
  '42501', 'La call di follow-up la fissano il closer della call e l''admin.',
  'il setter non fissa la call di follow-up'
);
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select throws_ok(
  $$ select public.fissa_follow_up('59591111-0000-4000-8000-000000000001', public.oggi() + 2, '18:00') $$,
  '42501', 'La call di follow-up la fissano il closer della call e l''admin.',
  'il coach nemmeno'
);
set local request.jwt.claims to '{"sub":"59595959-5959-4959-8959-595959595959","role":"authenticated"}';
select throws_ok(
  $$ select public.fissa_follow_up('59591111-0000-4000-8000-000000000001', public.oggi() + 2, '18:00') $$,
  '42501', 'Questa call non è assegnata a te.',
  'un altro closer non la fissa su una call che non è sua'
);
reset role;
set local role anon;
select throws_ok(
  $$ select public.fissa_follow_up('59591111-0000-4000-8000-000000000001', public.oggi() + 2, '18:00') $$,
  '42501', null,
  'chi non è entrato no'
);
reset role;
set local role authenticated;

-- the closer of the call
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select throws_ok(
  $$ select public.fissa_follow_up('59591111-0000-4000-8000-000000000005', public.oggi() + 2, '18:00') $$,
  '42501', 'Questa call non è assegnata a te.',
  'il closer non la fissa sulla call di un altro closer'
);
select throws_ok(
  $$ select public.fissa_follow_up('59591111-0000-4000-8000-0000000000ff', public.oggi() + 2, '18:00') $$,
  'P0002', 'Call non trovata.',
  'una call che non c''è'
);
select throws_ok(
  $$ select public.fissa_follow_up('59591111-0000-4000-8000-000000000002', public.oggi() + 2, '18:00') $$,
  '22023', 'La call di follow-up si fissa su una call svolta finita in follow-up.',
  'una call ancora da fare non ha follow-up'
);
select throws_ok(
  $$ select public.fissa_follow_up('59591111-0000-4000-8000-000000000003', public.oggi() + 2, '18:00') $$,
  '22023', 'La call di follow-up si fissa su una call svolta finita in follow-up.',
  'una call persa nemmeno'
);
select throws_ok(
  $$ select public.fissa_follow_up('59591111-0000-4000-8000-000000000001', null, '18:00') $$,
  '22023', 'Scegli il giorno e l''ora della call di follow-up',
  'senza giorno no'
);

-- the closer's window: from today on, six months ahead at most
select throws_ok(
  $$ select public.fissa_follow_up('59591111-0000-4000-8000-000000000001', public.oggi() - 1, '18:00') $$,
  '22023', 'Una call di follow-up si fissa da oggi in avanti',
  'il closer non la fissa nel passato'
);
select throws_ok(
  $$ select public.fissa_follow_up('59591111-0000-4000-8000-000000000001', public.oggi() + 181, '18:00') $$,
  '22023', 'Al massimo 6 mesi da oggi',
  'né oltre 6 mesi'
);

-- today at 00:01, an hour already gone: the follow-up held this morning
create temp table nuova on commit drop as
select public.fissa_follow_up('59591111-0000-4000-8000-000000000001', public.oggi(), '00:01') as id;

select is(
  (select row(c.lead_id, c.setter_id, c.closer_id, c.tipo, c.stato, c.esito, c.qualificata, c.follow_up_di,
              c.programmata_il, c.created_by, c.spostata_dal, c.volte_spostata)::text
   from public.calls c where c.id = (select id from nuova)),
  row('59590000-0000-4000-8000-000000000001'::uuid, '22222222-2222-4222-8222-222222222222'::uuid,
      '33333333-3333-4333-8333-333333333333'::uuid, 'discovery'::public.call_type,
      'programmata'::public.call_status, null::public.call_outcome, null::boolean,
      '59591111-0000-4000-8000-000000000001'::uuid,
      (public.oggi() + time '00:01') at time zone 'Europe/Rome',
      '33333333-3333-4333-8333-333333333333'::uuid, null::timestamptz, 0)::text,
  'il closer fissa la call di follow-up: stesso lead, setter, closer e tipo, da fare, collegata alla prima, anche a un''ora di oggi già passata'
);
select is(
  (select c.di_follow_up from public.calls c where c.id = (select id from nuova)),
  true,
  'ed è segnata come call di follow-up'
);
select is(
  (select c.created_at from public.calls c where c.id = (select id from nuova)),
  (public.oggi() + time '00:01') at time zone 'Europe/Rome',
  'una call di follow-up già passata risulta prenotata alla sua ora'
);
select is(
  (select row(c.stato, c.esito, c.obiezione_principale)::text from public.calls c
   where c.id = '59591111-0000-4000-8000-000000000001'),
  row('svolta'::public.call_status, 'follow_up'::public.call_outcome, 'Ci deve pensare')::text,
  'la call di partenza resta com''era'
);
select is(
  (select stato from public.leads where id = '59590000-0000-4000-8000-000000000001'),
  'follow_up'::public.lead_status,
  'lo stato del lead non cambia: la pipeline è a mano'
);

-- once per call
select throws_ok(
  $$ select public.fissa_follow_up('59591111-0000-4000-8000-000000000001', public.oggi() + 3, '18:00') $$,
  '22023', null,
  'una seconda call di follow-up no'
);
select throws_like(
  $$ select public.fissa_follow_up('59591111-0000-4000-8000-000000000001', public.oggi() + 3, '18:00') $$,
  'Questa call ha già la sua call di follow-up, il ' || to_char(public.oggi(), 'DD/MM/YYYY') || ' alle 00:01: per cambiarla usa Sposta su quella.',
  'e la frase dice giorno e ora di quella che c''è, e come cambiarla'
);
select throws_ok(
  $$ update public.calls set follow_up_di = null where id = (select id from nuova) $$,
  '42501', 'Il collegamento della call di follow-up non si cambia',
  'il closer non scollega la sua call di follow-up'
);

-- call_ha_follow_up: on the calls he reads, never on someone else's
select is(
  (select array[public.call_ha_follow_up(c), public.call_ha_follow_up(p)]
   from public.calls c, public.calls p
   where c.id = '59591111-0000-4000-8000-000000000001' and p.id = '59591111-0000-4000-8000-000000000003'),
  array[true, false],
  'call_ha_follow_up: sì sulla call col suo follow-up, no sulla call persa'
);
select is(
  public.call_ha_follow_up(jsonb_populate_record(null::public.calls, '{"id": "59591111-0000-4000-8000-000000000005"}')),
  null::boolean,
  'mai su una call che non legge, nemmeno passandola a mano'
);

-- the setter hands the follow-up call to another closer (it is his call)
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select lives_ok(
  $$ update public.calls set closer_id = '59595959-5959-4959-8959-595959595959' where id = (select id from nuova) $$,
  'il setter passa la call di follow-up a un altro closer'
);
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(
  (select count(*) from public.calls where follow_up_di = '59591111-0000-4000-8000-000000000001'),
  0::bigint,
  'il closer della prima call non la vede più'
);
select is(
  (select public.call_ha_follow_up(c) from public.calls c where c.id = '59591111-0000-4000-8000-000000000001'),
  true,
  'ma sa che c''è: la scheda non dice «in chat» e non offre di fissarla'
);
select throws_ok(
  $$ select public.fissa_follow_up('59591111-0000-4000-8000-000000000001', public.oggi() + 3, '18:00') $$,
  '22023', 'Questa call ha già la sua call di follow-up, assegnata a un altro closer.',
  'e la frase non dice il giorno di una call che non è più sua'
);

-- ---------------------------------------------------------------------------
-- The admin: also a follow-up already held, up to a year back, after the first
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok(
  $$ select public.fissa_follow_up('59591111-0000-4000-8000-000000000004', public.oggi() - 367, '10:00') $$,
  '22023', 'Al massimo un anno indietro',
  'l''admin va indietro al massimo di un anno'
);
select throws_ok(
  $$ select public.fissa_follow_up('59591111-0000-4000-8000-000000000004', public.oggi() + 181, '10:00') $$,
  '22023', 'Al massimo 6 mesi da oggi',
  'e avanti al massimo di 6 mesi'
);
select throws_ok(
  $$ select public.fissa_follow_up('59591111-0000-4000-8000-000000000004', public.oggi() - 4, '10:00') $$,
  '22023', null,
  'la call di follow-up viene sempre dopo la call di partenza'
);
select throws_like(
  $$ select public.fissa_follow_up('59591111-0000-4000-8000-000000000004', public.oggi() - 3, '18:00') $$,
  'La call di follow-up viene dopo la call di partenza, del ' || to_char(public.oggi() - 3, 'DD/MM/YYYY') || ' alle 18:00: %',
  'anche alla stessa ora: la frase dice quando era la prima'
);

create temp table dell_admin on commit drop as
select public.fissa_follow_up('59591111-0000-4000-8000-000000000004', public.oggi() - 1, '10:00') as id;

select is(
  (select row(c.lead_id, c.setter_id, c.closer_id, c.tipo, c.follow_up_di, c.created_by, c.created_at = c.programmata_il)::text
   from public.calls c where c.id = (select id from dell_admin)),
  row('59590000-0000-4000-8000-000000000004'::uuid, '22222222-2222-4222-8222-222222222222'::uuid,
      '33333333-3333-4333-8333-333333333333'::uuid, 'strategy'::public.call_type,
      '59591111-0000-4000-8000-000000000004'::uuid, '11111111-1111-4111-8111-111111111111'::uuid, true)::text,
  'l''admin registra un follow-up già fatto: eredita setter, closer, tipo e lead, prenotato alla sua ora'
);
-- a closer deactivated since: the follow-up call would have nobody to run it
reset role;
update public.profiles set attivo = false where id = '59595959-5959-4959-8959-595959595959';
set local role authenticated;
select throws_ok(
  $$ select public.fissa_follow_up('59591111-0000-4000-8000-000000000005', public.oggi() + 2, '18:30') $$,
  '22023', 'Il closer di questa call non è attivo o non può chiudere: cambialo prima con la matita',
  'con il closer della call disattivato no, nemmeno per l''admin'
);
reset role;
update public.profiles set attivo = true where id = '59595959-5959-4959-8959-595959595959';
set local role authenticated;
select lives_ok(
  $$ select public.fissa_follow_up('59591111-0000-4000-8000-000000000005', public.oggi() + 2, '18:30') $$,
  'l''admin la fissa su una call di qualunque closer'
);
select is(
  (select closer_id from public.calls where follow_up_di = '59591111-0000-4000-8000-000000000005'),
  '59595959-5959-4959-8959-595959595959'::uuid,
  'e la call di follow-up resta di quel closer'
);
select is(
  (select count(*) from public.leads),
  (select lead from prima),
  'nessun lead nuovo'
);

-- the closer records the outcome of the follow-up: held, closed
update public.calls set stato = 'svolta', qualificata = true, esito = 'chiusa'
where id = (select id from dell_admin);

-- ---------------------------------------------------------------------------
-- Numbers: the closer's day counts it, the setter's bookings do not
-- ---------------------------------------------------------------------------
select is(
  (select call from public.giornate_closer(public.oggi() - 1, public.oggi() - 1, '33333333-3333-4333-8333-333333333333')
    where data is null),
  (select closer_ieri + 1 from prima),
  'svolta, la call di follow-up conta nella giornata del closer'
);
select is(
  (select chiuse from public.giornate_closer(public.oggi() - 1, public.oggi() - 1, '33333333-3333-4333-8333-333333333333')
    where data = public.oggi() - 1) >= 1,
  true,
  'e la sua chiusa pure'
);
select is(
  (select prenotate_inbound from public.metriche_setting(public.oggi() - 1, public.oggi())
    where setter_id = '22222222-2222-4222-8222-222222222222'),
  (select metriche from prima),
  'le call di follow-up non sono prenotate del setter (metriche del setting)'
);
select is(
  (select prenotate_inbound from public.giornate_setter(public.oggi() - 1, public.oggi(), '22222222-2222-4222-8222-222222222222')
    where data is null),
  (select giornate from prima),
  'né nella sua giornata'
);
select is(
  (select closer_call from public.giornate_setter(public.oggi() - 1, public.oggi() - 1, '22222222-2222-4222-8222-222222222222')
    where data is null) >= 1,
  true,
  'ma l''esito del closer sulla call di follow-up sta nella giornata del setter, come ogni sua call'
);
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(
  (select prenotate_inbound from public.miei_numeri_periodo(public.oggi() - 1, public.oggi())),
  (select miei from prima),
  'né nei suoi numeri'
);
select ok(
  exists (select 1 from public.calls where follow_up_di = '59591111-0000-4000-8000-000000000001'),
  'il setter vede la call di follow-up della sua call (è sua)'
);

-- a control: a call the setter books himself today still counts
select lives_ok(
  $$ select public.fissa_call('Prenotata Davvero', 'dm_inbound', 'discovery', public.oggi() + 1, '18:00',
                              '33333333-3333-4333-8333-333333333333') $$,
  'il setter fissa una call'
);
select is(
  (select prenotate_inbound from public.miei_numeri_periodo(public.oggi() - 1, public.oggi())),
  (select miei + 1 from prima),
  'e quella conta tra le sue prenotate'
);

-- ---------------------------------------------------------------------------
-- The first call goes: the follow-up stays, without the link
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims to '{}';
select throws_ok(
  $$ insert into public.calls (lead_id, setter_id, closer_id, tipo, programmata_il, follow_up_di)
     values ('59590000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222',
             '33333333-3333-4333-8333-333333333333', 'discovery', now() + interval '3 days',
             '59591111-0000-4000-8000-000000000004') $$,
  '23505', null,
  'anche senza sessione, una sola call di follow-up per call'
);
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ delete from public.calls where id = '59591111-0000-4000-8000-000000000004' $$,
  'l''admin elimina la call di partenza'
);
select is(
  (select row(follow_up_di, di_follow_up)::text from public.calls where id = (select id from dell_admin)),
  row(null::uuid, true)::text,
  'la call di follow-up resta, senza collegamento ma segnata come call di follow-up'
);
select is(
  (select prenotate_inbound from public.metriche_setting(public.oggi() - 1, public.oggi())
    where setter_id = '22222222-2222-4222-8222-222222222222'),
  (select metriche + 1 from prima),
  'e non diventa una prenotata del setter (metriche del setting: solo quella che ha fissato lui)'
);
select is(
  (select prenotate_inbound from public.giornate_setter(public.oggi() - 1, public.oggi(), '22222222-2222-4222-8222-222222222222')
    where data is null),
  (select giornate + 1 from prima),
  'né nella sua giornata'
);
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(
  (select prenotate_inbound from public.miei_numeri_periodo(public.oggi() - 1, public.oggi())),
  (select miei + 1 from prima),
  'né nei suoi numeri'
);

select * from finish();
rollback;
