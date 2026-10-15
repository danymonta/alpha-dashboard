-- The admin decides the Instagram proposals too (Dany, 08/10/2026: "Anche tu,
-- con una scheda e la notifica"). The active admin reads the proposals of
-- every setter and decides those still to decide, only through the two
-- functions: confirmed (as they are, or corrected) into the report of the
-- proposal's SETTER, never his own (a missing report is born with that setter
-- and created_by = the admin; an existing one keeps every other field), or
-- discarded (the setter's numbers stay). Same version check as the setter.
-- The first decision wins, the setter's or the admin's; deciso_da says whose
-- and the setter reads it on his days (corretta: whether the confirmation
-- changed a number). The admin's confirmation goes only over the setter's
-- numbers his card showed (p_visti), checked under a lock on the report.
-- Closer, coach, another setter and a deactivated admin: nothing. The backup takes the proposals with their state
-- and who decided; merging moves deciso_da, deleting a person empties it.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(94);

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
select has_column('public', 'report_proposte_instagram', 'deciso_da', 'la proposta dice chi l''ha decisa');
select has_column('public', 'report_proposte_instagram', 'corretta', 'e se l''ha confermata correggendo i numeri');
select fk_ok('public', 'report_proposte_instagram', 'deciso_da', 'public', 'profiles', 'id',
  'una persona del team');
select is(
  (select c.confdeltype::text
   from pg_constraint c
   join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
   where c.conrelid = 'public.report_proposte_instagram'::regclass and c.contype = 'f' and a.attname = 'deciso_da'),
  'n',
  'una persona eliminata lascia la decisione senza nome'
);
select policies_are('public', 'report_proposte_instagram', array[
  'report_proposte_instagram_setter_lettura',
  'report_proposte_instagram_setter_decide',
  'report_proposte_instagram_admin_lettura',
  'report_proposte_instagram_admin_decide',
  -- Claude's OAuth tokens never reach it (20261010090000_mcp_oauth.sql, 75_mcp_oauth.sql)
  'report_proposte_instagram_mai_da_oauth'
], 'le proposte le leggono e le decidono il loro setter e l''admin');
select ok(
  not has_column_privilege('authenticated', 'public.report_proposte_instagram', 'deciso_da', 'update')
  and not has_column_privilege('authenticated', 'public.report_proposte_instagram', 'corretta', 'update')
  and has_column_privilege('authenticated', 'public.report_proposte_instagram', 'stato', 'update')
  and not has_column_privilege('authenticated', 'public.report_proposte_instagram', 'dm_outbound', 'update'),
  'da una sessione si cambia solo lo stato: mai i numeri, mai chi ha deciso, mai se ha corretto'
);

-- ---------------------------------------------------------------------------
-- Fixtures. Seed: admin 1111 (Dany Montagnolo), setter 2222, closer 3333,
-- coach 4444. Two more setters (B, merged into 2222 at the end; C, deleted)
-- and a second admin (A2, deactivated, then deleted). Days in April 2025.
-- ---------------------------------------------------------------------------
insert into public.invites (email, ruolo) values
  ('setter64b@alpha.test', 'setter'),
  ('setter64c@alpha.test', 'setter'),
  ('admin64@alpha.test', 'admin');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', '64646464-0000-4000-8000-00000000000b',
   'authenticated', 'authenticated', 'setter64b@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Setter Bi"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '64646464-0000-4000-8000-00000000000c',
   'authenticated', 'authenticated', 'setter64c@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Setter Ci"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '64646464-0000-4000-8000-00000000000a',
   'authenticated', 'authenticated', 'admin64@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Admin Due"}'::jsonb, now(), now(), '', '', '', '');

-- the seed setter works the DMs (the nightly job recomputes his proposals)
update public.instagram_collegamento set setter_id = '22222222-2222-4222-8222-222222222222' where id;

-- 2 and 3 April: the setter already wrote his day
delete from public.setter_daily_reports
where setter_id = '22222222-2222-4222-8222-222222222222' and data between '2025-04-01' and '2025-04-30';
insert into public.setter_daily_reports (
  setter_id, data, dm_outbound, dm_inbound, follow_up, conversazioni, call_proposte, discovery_prenotate,
  discovery_svolte, call_qualificate, strategy_prenotate, contenuto_pubblicato, note,
  lead_in_target, qualita_conversazioni, cosa_frenava, domande_contenuti, created_by, created_at
) values
  ('22222222-2222-4222-8222-222222222222', '2025-04-02', 52, 3, 18, 9, 4, 4,
   1, 1, 0, true, 'Giornata buona',
   'circa_meta', 'medie', 'Il tempo', 'Allenamento a casa', '22222222-2222-4222-8222-222222222222', '2025-04-02 20:00+02'),
  ('22222222-2222-4222-8222-222222222222', '2025-04-03', 11, 11, 11, 11, 11, 11,
   0, 0, 0, false, null,
   null, null, null, null, '22222222-2222-4222-8222-222222222222', '2025-04-03 20:00+02'),
  -- 11 and 12 April: his numbers, as the admin's card shows them (12: he changes them)
  ('22222222-2222-4222-8222-222222222222', '2025-04-11', 52, 3, 18, 9, 4, 4,
   0, 0, 0, false, null,
   'quasi_tutti', null, null, null, '22222222-2222-4222-8222-222222222222', '2025-04-11 20:00+02'),
  ('22222222-2222-4222-8222-222222222222', '2025-04-12', 40, 4, 4, 4, 4, 4,
   0, 0, 0, false, null,
   null, null, null, null, '22222222-2222-4222-8222-222222222222', '2025-04-12 20:00+02'),
  -- 15 April: only the answers, the numbers at zero (the card shows none)
  ('22222222-2222-4222-8222-222222222222', '2025-04-15', 0, 0, 0, 0, 0, 0,
   0, 0, 0, false, null,
   'pochi', 'scarse', null, null, '22222222-2222-4222-8222-222222222222', '2025-04-15 20:00+02');

-- the proposals: P1..P9, V11..V15 and PF (tomorrow) of the seed setter, Q1 and Q2 of B, R1 of C
insert into public.report_proposte_instagram
  (id, setter_id, data, dm_outbound, dm_inbound, follow_up, conversazioni, call_proposte, discovery_prenotate,
   chat_lette, chat_incerte, calcolato_il)
values
  ('64640000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', '2025-04-01', 10, 1, 2, 3, 1, 1, 30, 0, now()),
  ('64640000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', '2025-04-02', 53, 3, 16, 9, 4, 4, 60, 2, now()),
  ('64640000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', '2025-04-03', 30, 3, 3, 3, 3, 3, 30, 0, now()),
  ('64640000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', '2025-04-04', 40, 4, 4, 4, 4, 4, 40, 0, now()),
  ('64640000-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222', '2025-04-05', 50, 5, 5, 5, 5, 5, 50, 0, now()),
  ('64640000-0000-4000-8000-000000000006', '22222222-2222-4222-8222-222222222222', '2025-04-06', 6, 6, 6, 6, 6, 6, 6, 0, now()),
  -- what the admin's page read, ten minutes ago
  ('64640000-0000-4000-8000-000000000007', '22222222-2222-4222-8222-222222222222', '2025-04-07', 60, 6, 6, 6, 6, 6, 40, 0, now() - interval '10 minutes'),
  ('64640000-0000-4000-8000-000000000008', '22222222-2222-4222-8222-222222222222', '2025-04-08', 8, 8, 8, 8, 8, 8, 8, 0, now()),
  ('64640000-0000-4000-8000-00000000000f', '22222222-2222-4222-8222-222222222222', public.oggi() + 1, 1, 1, 1, 1, 1, 1, 1, 0, now()),
  ('64640000-0000-4000-8000-000000000011', '22222222-2222-4222-8222-222222222222', '2025-04-11', 53, 3, 16, 9, 4, 4, 60, 0, now()),
  ('64640000-0000-4000-8000-000000000012', '22222222-2222-4222-8222-222222222222', '2025-04-12', 44, 4, 4, 4, 4, 4, 40, 0, now()),
  ('64640000-0000-4000-8000-000000000013', '22222222-2222-4222-8222-222222222222', '2025-04-13', 30, 3, 3, 3, 3, 3, 30, 0, now()),
  ('64640000-0000-4000-8000-000000000014', '22222222-2222-4222-8222-222222222222', '2025-04-14', 20, 2, 2, 2, 2, 2, 20, 0, now()),
  ('64640000-0000-4000-8000-000000000015', '22222222-2222-4222-8222-222222222222', '2025-04-15', 15, 1, 1, 1, 1, 1, 15, 0, now()),
  ('64640000-0000-4000-8000-000000000021', '64646464-0000-4000-8000-00000000000b', '2025-04-21', 21, 2, 1, 4, 1, 0, 21, 0, now()),
  ('64640000-0000-4000-8000-000000000022', '64646464-0000-4000-8000-00000000000b', '2025-04-22', 22, 2, 2, 2, 2, 0, 22, 0, now()),
  ('64640000-0000-4000-8000-000000000023', '64646464-0000-4000-8000-00000000000c', '2025-04-23', 23, 2, 3, 2, 3, 0, 23, 0, now());

-- a proposal to decide never says who decided it
insert into public.report_proposte_instagram (id, setter_id, data, dm_outbound, deciso_da)
values ('64640000-0000-4000-8000-000000000009', '22222222-2222-4222-8222-222222222222', '2025-04-09', 9,
        '11111111-1111-4111-8111-111111111111');
select is(
  (select deciso_da from public.report_proposte_instagram where id = '64640000-0000-4000-8000-000000000009'),
  null::uuid,
  'da decidere: nessuno l''ha decisa, qualunque cosa si scriva'
);

-- the check under the trigger: to decide means nobody decided
alter table public.report_proposte_instagram disable trigger report_proposte_instagram_coerenza;
select throws_ok(
  $$ update public.report_proposte_instagram set deciso_da = '11111111-1111-4111-8111-111111111111'
     where id = '64640000-0000-4000-8000-000000000009' $$,
  '23514', null,
  'una proposta da decidere senza chi l''ha decisa, anche senza il trigger'
);
alter table public.report_proposte_instagram enable trigger report_proposte_instagram_coerenza;
-- a decided proposal without a name: whoever decided it is gone (a restore, a person deleted)
select lives_ok(
  $$ insert into public.report_proposte_instagram (setter_id, data, stato, deciso_il)
     values ('22222222-2222-4222-8222-222222222222', '2025-04-10', 'scartata', now()) $$,
  'una proposta decisa da una persona che non c''è più resta decisa, senza nome'
);
delete from public.report_proposte_instagram
where setter_id = '22222222-2222-4222-8222-222222222222' and data = '2025-04-10';

-- ---------------------------------------------------------------------------
-- Who reads and who decides
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select count(*)::integer from public.report_proposte_instagram where id::text like '64640000-%'), 18,
  'l''admin legge le proposte di tutti i setter');
select throws_ok(
  $$ update public.report_proposte_instagram set dm_outbound = 1 where id = '64640000-0000-4000-8000-000000000001' $$,
  '42501', null, 'non ne cambia i numeri'
);
select throws_ok(
  $$ update public.report_proposte_instagram set deciso_da = '11111111-1111-4111-8111-111111111111'
     where id = '64640000-0000-4000-8000-000000000001' $$,
  '42501', null, 'né scrive a mano chi l''ha decisa'
);
select throws_ok(
  $$ insert into public.report_proposte_instagram (setter_id, data) values ('22222222-2222-4222-8222-222222222222', '2025-04-30') $$,
  '42501', null, 'non ne crea'
);
select throws_ok($$ delete from public.report_proposte_instagram $$, '42501', null, 'non ne cancella');
select throws_ok(
  $$ update public.report_proposte_instagram set corretta = true where id = '64640000-0000-4000-8000-000000000001' $$,
  '42501', null, 'né scrive a mano se è stata corretta'
);

set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::integer from public.report_proposte_instagram where id::text like '64640000-%'), 15,
  'il setter legge solo le sue');
set local request.jwt.claims to '{"sub":"64646464-0000-4000-8000-00000000000b","role":"authenticated"}';
select is((select count(*)::integer from public.report_proposte_instagram where id::text like '64640000-%'), 2,
  'un altro setter le sue');
select throws_ok(
  $$ select public.conferma_proposta_instagram('64640000-0000-4000-8000-000000000001') $$,
  'P0002', 'Proposta non trovata', 'e non conferma quelle di un altro setter'
);

set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is((select count(*)::integer from public.report_proposte_instagram), 0, 'il closer non le legge');
select throws_ok(
  $$ select public.conferma_proposta_instagram('64640000-0000-4000-8000-000000000001') $$,
  '42501', 'La proposta la decidono il setter che lavora i DM e l''admin', 'né le conferma'
);
select throws_ok(
  $$ select public.scarta_proposta_instagram('64640000-0000-4000-8000-000000000001') $$,
  '42501', 'La proposta la decidono il setter che lavora i DM e l''admin', 'né le scarta'
);
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select is((select count(*)::integer from public.report_proposte_instagram), 0, 'il coach nemmeno');
select throws_ok(
  $$ select public.conferma_proposta_instagram('64640000-0000-4000-8000-000000000001') $$,
  '42501', 'La proposta la decidono il setter che lavora i DM e l''admin', 'né le conferma'
);
select throws_ok(
  $$ select public.scarta_proposta_instagram('64640000-0000-4000-8000-000000000001') $$,
  '42501', 'La proposta la decidono il setter che lavora i DM e l''admin', 'né le scarta'
);

-- ---------------------------------------------------------------------------
-- The admin confirms, corrects, discards
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

-- P1: as it is, no report yet
select is(
  (select row(r.setter_id, r.data, r.dm_outbound, r.dm_inbound, r.follow_up, r.conversazioni, r.call_proposte,
              r.discovery_prenotate, r.dm_totali)::text
   from public.conferma_proposta_instagram(
     '64640000-0000-4000-8000-000000000001', null,
     (select calcolato_il from public.report_proposte_instagram where id = '64640000-0000-4000-8000-000000000001')
   ) r),
  row('22222222-2222-4222-8222-222222222222'::uuid, '2025-04-01'::date, 10, 1, 2, 3, 1, 1, 13)::text,
  'l''admin conferma così com''è: nel report del setter della proposta'
);
select is(
  (select row(strategy_prenotate, discovery_svolte, call_qualificate, contenuto_pubblicato, note, lead_in_target,
              qualita_conversazioni, cosa_frenava, domande_contenuti, created_by)::text
   from public.setter_daily_reports
   where setter_id = '22222222-2222-4222-8222-222222222222' and data = '2025-04-01'),
  row(0, 0, 0, false, null::text, null::public.quota_in_target, null::public.qualita_conversazioni,
      null::text, null::text, '11111111-1111-4111-8111-111111111111'::uuid)::text,
  'il report nasce col nome di chi l''ha confermato, e le domande della giornata restano al setter'
);
select is(
  (select count(*)::integer from public.setter_daily_reports
   where setter_id = '11111111-1111-4111-8111-111111111111' and data = '2025-04-01'),
  0,
  'mai nel report dell''admin'
);
select is(
  (select row(stato, deciso_da, deciso_il = now())::text
   from public.report_proposte_instagram where id = '64640000-0000-4000-8000-000000000001'),
  row('confermata'::public.proposta_stato, '11111111-1111-4111-8111-111111111111'::uuid, true)::text,
  'confermata adesso, decisa dall''admin'
);
select is(
  (select corretta from public.report_proposte_instagram where id = '64640000-0000-4000-8000-000000000001'),
  false,
  'così com''era: non corretta'
);
select throws_ok(
  $$ update public.report_proposte_instagram set stato = 'confermata' where id = '64640000-0000-4000-8000-000000000005' $$,
  '42501', 'La proposta si conferma con Conferma, che scrive i numeri nel report',
  'la conferma di una proposta non vale per un''altra'
);

-- P2: corrected, over the report the setter had written
select lives_ok(
  $$ select public.conferma_proposta_instagram('64640000-0000-4000-8000-000000000002',
       '{"dm_outbound": 52, "follow_up": 18}',
       (select calcolato_il from public.report_proposte_instagram where id = '64640000-0000-4000-8000-000000000002')) $$,
  'l''admin conferma con la sua correzione'
);
select is(
  (select row(dm_outbound, dm_inbound, follow_up, conversazioni, call_proposte, discovery_prenotate)::text
   from public.setter_daily_reports
   where setter_id = '22222222-2222-4222-8222-222222222222' and data = '2025-04-02'),
  row(52, 3, 18, 9, 4, 4)::text,
  'la correzione vince, gli altri numeri dalla proposta'
);
select is(
  (select row(discovery_svolte, call_qualificate, strategy_prenotate, contenuto_pubblicato, note, lead_in_target,
              qualita_conversazioni, cosa_frenava, domande_contenuti, created_by, created_at)::text
   from public.setter_daily_reports
   where setter_id = '22222222-2222-4222-8222-222222222222' and data = '2025-04-02'),
  row(1, 1, 0, true, 'Giornata buona', 'circa_meta'::public.quota_in_target, 'medie'::public.qualita_conversazioni,
      'Il tempo', 'Allenamento a casa', '22222222-2222-4222-8222-222222222222'::uuid,
      '2025-04-02 20:00+02'::timestamptz)::text,
  'le risposte del setter, le note e chi ha creato il report restano com''erano'
);
select is(
  (select row(dm_outbound, follow_up, stato, deciso_da)::text
   from public.report_proposte_instagram where id = '64640000-0000-4000-8000-000000000002'),
  row(53, 16, 'confermata'::public.proposta_stato, '11111111-1111-4111-8111-111111111111'::uuid)::text,
  'la proposta resta coi numeri calcolati'
);
select is(
  (select corretta from public.report_proposte_instagram where id = '64640000-0000-4000-8000-000000000002'),
  true,
  'e dice che chi l''ha confermata l''ha corretta'
);

-- P3: discarded, the setter's numbers stay
select lives_ok(
  $$ select public.scarta_proposta_instagram('64640000-0000-4000-8000-000000000003') $$,
  'l''admin tiene i numeri del setter'
);
select is(
  (select row(stato, deciso_da, deciso_il = now())::text
   from public.report_proposte_instagram where id = '64640000-0000-4000-8000-000000000003'),
  row('scartata'::public.proposta_stato, '11111111-1111-4111-8111-111111111111'::uuid, true)::text,
  'scartata adesso, dall''admin'
);
select is(
  (select corretta from public.report_proposte_instagram where id = '64640000-0000-4000-8000-000000000003'),
  false,
  'una proposta scartata non è corretta'
);
select is(
  (select row(dm_outbound, dm_inbound, follow_up, conversazioni, call_proposte, discovery_prenotate, created_by)::text
   from public.setter_daily_reports
   where setter_id = '22222222-2222-4222-8222-222222222222' and data = '2025-04-03'),
  row(11, 11, 11, 11, 11, 11, '22222222-2222-4222-8222-222222222222'::uuid)::text,
  'e il report del setter resta com''era'
);

-- P7: recomputed after the admin's page read it
reset role;
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select is(
  public.instagram_salva_proposta('22222222-2222-4222-8222-222222222222', '2025-04-07', 70, 7, 7, 7, 7, 50, 0, 7),
  '64640000-0000-4000-8000-000000000007'::uuid,
  'il lavoro notturno ricalcola la proposta mentre l''admin la guarda'
);
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok(
  format('select public.conferma_proposta_instagram(%L, null, %L)',
    '64640000-0000-4000-8000-000000000007', now() - interval '10 minutes'),
  '22023', 'I numeri della proposta sono cambiati: ricontrollali e conferma di nuovo',
  'l''admin non conferma numeri che non ha visto'
);
select throws_ok(
  format('select public.conferma_proposta_instagram(%L, %L, %L)',
    '64640000-0000-4000-8000-000000000007', '{"dm_outbound": 61}', now() - interval '10 minutes'),
  '22023', 'I numeri della proposta sono cambiati: ricontrollali e conferma di nuovo',
  'nemmeno corretti a partire da quelli vecchi'
);
select is(
  (select row(p.stato, (select count(*) from public.setter_daily_reports
                         where setter_id = '22222222-2222-4222-8222-222222222222' and data = '2025-04-07'))::text
   from public.report_proposte_instagram p where p.id = '64640000-0000-4000-8000-000000000007'),
  row('da_confermare'::public.proposta_stato, 0)::text,
  'il report resta com''era e la proposta da confermare'
);
select is(
  (select row(r.dm_outbound, r.dm_inbound, r.follow_up, r.conversazioni, r.call_proposte, r.discovery_prenotate)::text
   from public.conferma_proposta_instagram('64640000-0000-4000-8000-000000000007', null, now()) r),
  row(70, 7, 7, 7, 7, 7)::text,
  'riletti i numeri nuovi, li conferma'
);

-- PF: a day to come
select throws_ok(
  $$ select public.conferma_proposta_instagram('64640000-0000-4000-8000-00000000000f') $$,
  '42501', 'Un giorno che non è ancora arrivato non si compila.', 'un giorno che deve ancora arrivare non si conferma'
);
select is(
  (select row(stato, deciso_da, (select count(*) from public.setter_daily_reports
                                  where setter_id = '22222222-2222-4222-8222-222222222222' and data = public.oggi() + 1))::text
   from public.report_proposte_instagram where id = '64640000-0000-4000-8000-00000000000f'),
  row('da_confermare'::public.proposta_stato, null::uuid, 0)::text,
  'e resta da confermare, senza report'
);

-- Q1: another setter's, into his report
select is(
  (select row(r.setter_id, r.data, r.dm_outbound, r.created_by)::text
   from public.conferma_proposta_instagram('64640000-0000-4000-8000-000000000021') r),
  row('64646464-0000-4000-8000-00000000000b'::uuid, '2025-04-21'::date, 21,
      '11111111-1111-4111-8111-111111111111'::uuid)::text,
  'l''admin conferma anche la proposta di un altro setter, nel report di quel setter'
);

-- ---------------------------------------------------------------------------
-- Only over the setter's numbers the admin's card showed (p_visti)
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.conferma_proposta_instagram('64640000-0000-4000-8000-000000000012', null, null, '[1]') $$,
  '22023', 'Numeri del setter non validi', 'i numeri visti sono un oggetto'
);
select throws_ok(
  $$ select public.conferma_proposta_instagram('64640000-0000-4000-8000-000000000012', null, null, '{"dm_outbound": 40}') $$,
  '22023', 'Numeri del setter non validi', 'nessuno o tutti e sei'
);
select throws_ok(
  $$ select public.conferma_proposta_instagram('64640000-0000-4000-8000-000000000012', null, null,
       '{"dm_outbound": -1, "dm_inbound": 4, "follow_up": 4, "conversazioni": 4, "call_proposte": 4, "note": 4}') $$,
  '22023', 'Numeri del setter non validi', 'solo i sei numeri, interi e non negativi'
);

-- V11: the card showed his numbers, still the same: confirmed
select is(
  (select row(r.dm_outbound, r.follow_up, r.lead_in_target)::text
   from public.conferma_proposta_instagram('64640000-0000-4000-8000-000000000011', null, null,
     '{"dm_outbound": 52, "dm_inbound": 3, "follow_up": 18, "conversazioni": 9, "call_proposte": 4, "discovery_prenotate": 4}') r),
  row(53, 16, 'quasi_tutti'::public.quota_in_target)::text,
  'sopra i numeri del setter che la scheda ha mostrato, conferma'
);

-- V12: his report says 40, the card showed something else (none, or 39): refused
select throws_ok(
  $$ select public.conferma_proposta_instagram('64640000-0000-4000-8000-000000000012', null, null, '{}') $$,
  '22023', 'Loris ha cambiato i suoi numeri di quel giorno: ricontrollali e decidi di nuovo',
  'la scheda non mostrava numeri e lui li ha scritti: non conferma'
);
select throws_ok(
  $$ select public.conferma_proposta_instagram('64640000-0000-4000-8000-000000000012', '{"dm_outbound": 45}', null,
       '{"dm_outbound": 39, "dm_inbound": 4, "follow_up": 4, "conversazioni": 4, "call_proposte": 4, "discovery_prenotate": 4}') $$,
  '22023', 'Loris ha cambiato i suoi numeri di quel giorno: ricontrollali e decidi di nuovo',
  'né sopra numeri diversi da quelli mostrati, nemmeno correggendo'
);
select is(
  (select row(p.stato, p.deciso_da, r.dm_outbound)::text
   from public.report_proposte_instagram p
   join public.setter_daily_reports r on r.setter_id = p.setter_id and r.data = p.data
   where p.id = '64640000-0000-4000-8000-000000000012'),
  row('da_confermare'::public.proposta_stato, null::uuid, 40)::text,
  'la proposta resta da decidere e il report del setter com''era'
);
select lives_ok(
  $$ select public.conferma_proposta_instagram('64640000-0000-4000-8000-000000000012', null, null,
       '{"dm_outbound": 40, "dm_inbound": 4, "follow_up": 4, "conversazioni": 4, "call_proposte": 4, "discovery_prenotate": 4}') $$,
  'visti i suoi numeri, conferma'
);

-- V13: the card showed numbers, the report is not there any more
select throws_ok(
  $$ select public.conferma_proposta_instagram('64640000-0000-4000-8000-000000000013', null, null,
       '{"dm_outbound": 30, "dm_inbound": 3, "follow_up": 3, "conversazioni": 3, "call_proposte": 3, "discovery_prenotate": 3}') $$,
  '22023', 'Loris ha cambiato i suoi numeri di quel giorno: ricontrollali e decidi di nuovo',
  'un report che non c''è più non è quello che la scheda mostrava'
);
select lives_ok(
  $$ select public.conferma_proposta_instagram('64640000-0000-4000-8000-000000000013', null, null, '{}') $$,
  'nessun numero visto, nessun report: lo crea'
);

-- V14: "Correggi" without changing a number is not a correction
select lives_ok(
  $$ select public.conferma_proposta_instagram('64640000-0000-4000-8000-000000000014',
       '{"dm_outbound": 20, "dm_inbound": 2, "follow_up": 2, "conversazioni": 2, "call_proposte": 2, "discovery_prenotate": 2}',
       null, '{}') $$,
  'conferma dal foglio con i numeri di Instagram'
);
select is(
  (select corretta from public.report_proposte_instagram where id = '64640000-0000-4000-8000-000000000014'),
  false,
  'gli stessi numeri della proposta: non corretta'
);

-- V15: his report has only the answers, the numbers at zero: the card showed none
select is(
  (select row(r.dm_outbound, r.lead_in_target, r.qualita_conversazioni)::text
   from public.conferma_proposta_instagram('64640000-0000-4000-8000-000000000015', null, null,
     '{"dm_outbound": 0, "dm_inbound": 0, "follow_up": 0, "conversazioni": 0, "call_proposte": 0, "discovery_prenotate": 0}') r),
  row(15, 'pochi'::public.quota_in_target, 'scarse'::public.qualita_conversazioni)::text,
  'sei zeri sono nessun numero: conferma, e le risposte restano'
);

-- ---------------------------------------------------------------------------
-- The first decision wins
-- ---------------------------------------------------------------------------
-- P4: the admin first
select lives_ok($$ select public.conferma_proposta_instagram('64640000-0000-4000-8000-000000000004') $$,
  'l''admin conferma per primo');
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok(
  $$ select public.conferma_proposta_instagram('64640000-0000-4000-8000-000000000004') $$,
  '22023', 'Questa proposta è già stata confermata', 'il setter non la conferma di nuovo'
);
select throws_ok(
  $$ select public.scarta_proposta_instagram('64640000-0000-4000-8000-000000000004') $$,
  '22023', 'Questa proposta è già stata confermata', 'né la scarta'
);
select lives_ok(
  $$ update public.report_proposte_instagram set stato = 'scartata' where id = '64640000-0000-4000-8000-000000000004' $$,
  'un update dello stato non trova la proposta già decisa'
);
select is(
  (select row(stato, deciso_da)::text from public.report_proposte_instagram where id = '64640000-0000-4000-8000-000000000004'),
  row('confermata'::public.proposta_stato, '11111111-1111-4111-8111-111111111111'::uuid)::text,
  'e resta come l''ha decisa l''admin'
);

-- P5: the setter first
select lives_ok($$ select public.scarta_proposta_instagram('64640000-0000-4000-8000-000000000005') $$,
  'il setter scarta per primo');
select is(
  (select row(stato, deciso_da)::text from public.report_proposte_instagram where id = '64640000-0000-4000-8000-000000000005'),
  row('scartata'::public.proposta_stato, '22222222-2222-4222-8222-222222222222'::uuid)::text,
  'decisa dal setter'
);
-- P6: confirmed by the setter; P9: discarded by the setter with a plain update
select lives_ok($$ select public.conferma_proposta_instagram('64640000-0000-4000-8000-000000000006') $$,
  'il setter conferma');
select lives_ok(
  $$ update public.report_proposte_instagram set stato = 'scartata' where id = '64640000-0000-4000-8000-000000000009' $$,
  'il setter scarta anche cambiando il solo stato'
);
select is(
  (select array_agg(row(data, stato, deciso_da)::text order by data)
   from public.report_proposte_instagram where id in ('64640000-0000-4000-8000-000000000006', '64640000-0000-4000-8000-000000000009')),
  array[
    row('2025-04-06'::date, 'confermata'::public.proposta_stato, '22222222-2222-4222-8222-222222222222'::uuid)::text,
    row('2025-04-09'::date, 'scartata'::public.proposta_stato, '22222222-2222-4222-8222-222222222222'::uuid)::text
  ],
  'col suo nome in tutti e due i modi'
);
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok(
  $$ select public.conferma_proposta_instagram('64640000-0000-4000-8000-000000000005') $$,
  '22023', 'Questa proposta è già stata scartata', 'l''admin non conferma quella che il setter ha già deciso'
);
select throws_ok(
  $$ select public.scarta_proposta_instagram('64640000-0000-4000-8000-000000000005') $$,
  '22023', 'Questa proposta è già stata scartata', 'né la scarta di nuovo'
);
select throws_ok(
  $$ select public.scarta_proposta_instagram('64640000-0000-4000-8000-000000000006') $$,
  '22023', 'Questa proposta è già stata confermata', 'né scarta quella che il setter ha confermato'
);

-- the nightly job never goes over the admin's decision
reset role;
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select is(
  public.instagram_salva_proposta('22222222-2222-4222-8222-222222222222', '2025-04-04', 1, 1, 1, 1, 1, 10, 0, 0),
  null::uuid,
  'il lavoro notturno non ricalcola una proposta decisa dall''admin'
);

-- ---------------------------------------------------------------------------
-- The setter sees who decided his days
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(
  (select p.nome from public.report_proposte_instagram x join public.profiles p on p.id = x.deciso_da
   where x.id = '64640000-0000-4000-8000-000000000001'),
  'Dany Montagnolo',
  'il setter legge chi ha confermato il suo giorno, col nome'
);
select is(
  (select array_agg(row(data, stato, deciso_da)::text order by data)
   from public.report_proposte_instagram where data between '2025-04-01' and '2025-04-04'),
  array[
    row('2025-04-01'::date, 'confermata'::public.proposta_stato, '11111111-1111-4111-8111-111111111111'::uuid)::text,
    row('2025-04-02'::date, 'confermata'::public.proposta_stato, '11111111-1111-4111-8111-111111111111'::uuid)::text,
    row('2025-04-03'::date, 'scartata'::public.proposta_stato, '11111111-1111-4111-8111-111111111111'::uuid)::text,
    row('2025-04-04'::date, 'confermata'::public.proposta_stato, '11111111-1111-4111-8111-111111111111'::uuid)::text
  ],
  'e cosa ha deciso, solo sulle sue proposte'
);

-- ---------------------------------------------------------------------------
-- Another admin decides; deactivated, nothing
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"64646464-0000-4000-8000-00000000000a","role":"authenticated"}';
select lives_ok($$ select public.scarta_proposta_instagram('64640000-0000-4000-8000-000000000008') $$,
  'un altro admin decide anche lui');
select is(
  (select deciso_da from public.report_proposte_instagram where id = '64640000-0000-4000-8000-000000000008'),
  '64646464-0000-4000-8000-00000000000a'::uuid,
  'col suo nome'
);
reset role;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
update public.profiles set attivo = false where id = '64646464-0000-4000-8000-00000000000a';
set local role authenticated;
set local request.jwt.claims to '{"sub":"64646464-0000-4000-8000-00000000000a","role":"authenticated"}';
select is((select count(*)::integer from public.report_proposte_instagram), 0,
  'un admin disattivato non legge le proposte');
select throws_ok(
  $$ select public.conferma_proposta_instagram('64640000-0000-4000-8000-000000000022') $$,
  '42501', 'La proposta la decidono il setter che lavora i DM e l''admin', 'né le conferma'
);
select throws_ok(
  $$ select public.scarta_proposta_instagram('64640000-0000-4000-8000-000000000022') $$,
  '42501', 'La proposta la decidono il setter che lavora i DM e l''admin', 'né le scarta'
);
reset role;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
update public.profiles set attivo = true where id = '64646464-0000-4000-8000-00000000000a';

-- ---------------------------------------------------------------------------
-- The number to approve: the setter his own, the admin every setter's
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(
  (select count(*)::integer from public.report_proposte_instagram where stato = 'da_confermare' and id::text like '64640000-%'),
  1,
  'il setter conta le sue giornate da approvare'
);
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(
  (select count(*)::integer from public.report_proposte_instagram where stato = 'da_confermare' and id::text like '64640000-%'),
  3,
  'l''admin quelle di tutti i setter'
);
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(
  (select count(*)::integer from public.report_proposte_instagram where stato = 'da_confermare'),
  0,
  'il closer nessuna'
);

-- ---------------------------------------------------------------------------
-- The backup takes the proposals, with their state and who decided
-- ---------------------------------------------------------------------------
reset role;
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select ok(
  (select exists (
     select 1 from jsonb_array_elements(b -> 'report_proposte_instagram') r
     where r ->> 'id' = '64640000-0000-4000-8000-000000000001'
       and r ->> 'stato' = 'confermata'
       and r ->> 'deciso_da' = '11111111-1111-4111-8111-111111111111'
       and r ->> 'deciso_il' is not null)
   from (select public.backup_completo() as b) x),
  'il backup prende le proposte, con lo stato e chi ha deciso'
);
select is(
  (select jsonb_array_length(public.backup_completo() -> 'report_proposte_instagram')),
  (select count(*)::integer from public.report_proposte_instagram),
  'tutte, di ogni setter'
);

-- ---------------------------------------------------------------------------
-- Merging and deleting
-- ---------------------------------------------------------------------------
-- B discards Q2, then is merged into the seed setter
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"64646464-0000-4000-8000-00000000000b","role":"authenticated"}';
select lives_ok($$ select public.scarta_proposta_instagram('64640000-0000-4000-8000-000000000022') $$,
  'il setter B scarta la sua proposta');
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select public.unisci_profili('64646464-0000-4000-8000-00000000000b', '22222222-2222-4222-8222-222222222222') $$,
  'l''admin unisce il setter B al seed'
);
reset role;
select is(
  (select array_agg(row(data, setter_id, stato, deciso_da)::text order by data)
   from public.report_proposte_instagram
   where id in ('64640000-0000-4000-8000-000000000021', '64640000-0000-4000-8000-000000000022')),
  array[
    row('2025-04-21'::date, '22222222-2222-4222-8222-222222222222'::uuid, 'confermata'::public.proposta_stato,
        '11111111-1111-4111-8111-111111111111'::uuid)::text,
    row('2025-04-22'::date, '22222222-2222-4222-8222-222222222222'::uuid, 'scartata'::public.proposta_stato,
        '22222222-2222-4222-8222-222222222222'::uuid)::text
  ],
  'le proposte passano a lui con la loro decisione, e quella di B diventa sua'
);

-- C discards R1 (his own: cascade and set null on the same row), then is deleted
set local role authenticated;
set local request.jwt.claims to '{"sub":"64646464-0000-4000-8000-00000000000c","role":"authenticated"}';
select lives_ok($$ select public.scarta_proposta_instagram('64640000-0000-4000-8000-000000000023') $$,
  'il setter C scarta la sua proposta');
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$ select public.elimina_persona('64646464-0000-4000-8000-00000000000c') $$,
  'l''admin elimina il setter C');
reset role;
select is(
  (select count(*)::integer from public.report_proposte_instagram where id = '64640000-0000-4000-8000-000000000023'),
  0,
  'le sue proposte se ne vanno con lui'
);

-- A2 decided P8, then is deleted: the decision stays, without a name
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$ select public.elimina_persona('64646464-0000-4000-8000-00000000000a') $$,
  'l''admin elimina l''altro admin');
reset role;
select is(
  (select row(stato, deciso_da, deciso_il is not null)::text
   from public.report_proposte_instagram where id = '64640000-0000-4000-8000-000000000008'),
  row('scartata'::public.proposta_stato, null::uuid, true)::text,
  'la sua decisione resta, senza nome'
);

select * from finish();
rollback;
