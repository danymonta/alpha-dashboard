-- The setter's report precompiled from Instagram (Dany, 08/10/2026). The
-- connection and the excluded accounts: admin only. The token: in Vault, set
-- and removed by the admin, never readable from a session, read only by the
-- service role, never in an error or in the backup. The proposals: only their
-- setter reads them and decides (never their numbers), the admin does not see
-- them (not even in the backup), only the service role writes them and never
-- over a decision. The confirmation writes the 6 numbers (his correction or
-- the proposal's) into his own report of that day, leaving the rest as it
-- was, and only as he saw them (a proposal recomputed after he read it is
-- refused); discarding keeps his numbers. discovery_prenotate counts his bookings of the day, follow-up calls
-- left out. Merging and deleting a person carry the proposals along.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(147);

-- No token left from local use: the test starts disconnected
delete from vault.secrets where name = 'instagram_token';

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
select has_table('public', 'instagram_collegamento', 'il collegamento di Instagram esiste');
select has_table('public', 'instagram_esclusi', 'gli account esclusi esistono');
select has_table('public', 'report_proposte_instagram', 'le proposte del report esistono');
select enum_has_labels('public', 'proposta_stato', array['da_confermare', 'confermata', 'scartata'],
  'una proposta è da confermare, confermata o scartata');
select is((select count(*)::integer from public.instagram_collegamento), 1, 'il collegamento ha la sua riga, già pronta');
select throws_ok($$ insert into public.instagram_collegamento (id) values (false) $$, '23514', null,
  'e una seconda riga non entra');
select is(
  (select array_agg(username order by username) from public.instagram_esclusi),
  array['coachplus.app', 'createcontent.club', 'danymonta.raw', 'loris_explore'],
  'i quattro account esclusi della migration'
);
select ok((select bool_and(motivo is not null) from public.instagram_esclusi), 'ognuno col suo motivo');
select throws_ok($$ insert into public.instagram_esclusi (username) values ('Mario.Rossi') $$, '23514', null,
  'un account escluso è in minuscolo');
select throws_ok($$ insert into public.instagram_esclusi (username) values ('@mario') $$, '23514', null,
  'senza @');
select throws_ok($$ insert into public.instagram_esclusi (username) values (repeat('a', 31)) $$, '23514', null,
  'al massimo 30 caratteri');
select throws_ok($$ insert into public.instagram_esclusi (username, motivo) values ('mario', repeat('x', 121)) $$, '23514', null,
  'il motivo al massimo 120 caratteri');

select ok(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
   from pg_proc p
   where p.oid in (
     'public.instagram_imposta_token(text)'::regprocedure,
     'public.instagram_togli_token()'::regprocedure,
     'public.instagram_token_presente()'::regprocedure,
     'public.instagram_token()'::regprocedure,
     'public.instagram_token_rinnovato(text, text, timestamptz)'::regprocedure,
     'public.instagram_errore(text)'::regprocedure
   )),
  'le funzioni del token sono security definer con search_path vuoto'
);
select ok(
  (select bool_and(not p.prosecdef and p.proconfig @> array['search_path=""'])
   from pg_proc p
   where p.oid in (
     'public.conferma_proposta_instagram(uuid, jsonb, timestamptz)'::regprocedure,
     'public.scarta_proposta_instagram(uuid)'::regprocedure,
     'public.instagram_salva_proposta(uuid, date, integer, integer, integer, integer, integer, integer, integer, integer)'::regprocedure,
     'public.discovery_prenotate_del_giorno(uuid, date)'::regprocedure
   )),
  'conferma, scarto e calcolo girano coi permessi di chi li chiama, con search_path vuoto'
);
select ok(
  (select bool_and(
     not has_function_privilege('anon', f, 'execute')
     and not has_function_privilege('authenticated', f, 'execute')
     and has_function_privilege('service_role', f, 'execute'))
   from unnest(array[
     'public.instagram_token()',
     'public.instagram_token_rinnovato(text, text, timestamptz)',
     'public.instagram_errore(text)',
     'public.instagram_salva_proposta(uuid, date, integer, integer, integer, integer, integer, integer, integer, integer)',
     'public.discovery_prenotate_del_giorno(uuid, date)'
   ]) as f),
  'il token, il rinnovo, gli errori e il calcolo li chiama solo il service role'
);
select ok(
  (select bool_and(
     not has_function_privilege('anon', f, 'execute')
     and has_function_privilege('authenticated', f, 'execute'))
   from unnest(array[
     'public.instagram_imposta_token(text)',
     'public.instagram_togli_token()',
     'public.instagram_token_presente()',
     'public.conferma_proposta_instagram(uuid, jsonb, timestamptz)',
     'public.scarta_proposta_instagram(uuid)'
   ]) as f),
  'collegare, scollegare, confermare e scartare: chi è entrato, mai anon'
);

-- ---------------------------------------------------------------------------
-- Fixtures. Seed: admin 1111, setter 2222, closer 3333, coach 4444. Three more
-- setters: one to compare, one to merge, one to delete. Days in March 2025,
-- far from the seed: A (no report yet), B (a report already there), C
-- (discarded), D (discarded by hand), X (both setters have one, merged).
-- ---------------------------------------------------------------------------
insert into public.invites (email, ruolo) values
  ('setter63@alpha.test', 'setter'),
  ('setter64@alpha.test', 'setter'),
  ('setter65@alpha.test', 'setter');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', '63636363-6363-4363-8363-636363636363',
   'authenticated', 'authenticated', 'setter63@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Setter Sessantatre"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '64646464-6464-4464-8464-646464646464',
   'authenticated', 'authenticated', 'setter64@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Setter Sessantaquattro"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '65656565-6565-4565-8565-656565656565',
   'authenticated', 'authenticated', 'setter65@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Setter Sessantacinque"}'::jsonb, now(), now(), '', '', '', '');

-- the setter's bookings around 10/03/2025, in Rome (UTC+1)
insert into public.leads (id, nome, setter_id, fonte, created_at) values
  ('63630000-0000-4000-8000-000000000001', 'Lead Notte', '22222222-2222-4222-8222-222222222222', 'dm_outbound', '2025-03-09 12:00+01'),
  ('63630000-0000-4000-8000-000000000002', 'Lead Altro Setter', '63636363-6363-4363-8363-636363636363', 'dm_inbound', '2025-03-09 12:00+01');
insert into public.calls (lead_id, setter_id, closer_id, tipo, programmata_il, di_follow_up, created_at) values
  -- 00:30 in Rome, still 9 March in UTC: the 10th
  ('63630000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   'discovery', '2025-03-12 18:00+01', false, '2025-03-10 00:30+01'),
  -- 23:30 of the 9th: the day before
  ('63630000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   'discovery', '2025-03-12 19:00+01', false, '2025-03-09 23:30+01'),
  -- the last minute of the 10th
  ('63630000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   'discovery', '2025-03-13 18:00+01', false, '2025-03-10 23:59+01'),
  -- a type changed later by the closer: still booked by the setter that day
  ('63630000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   'strategy', '2025-03-14 18:00+01', false, '2025-03-10 15:00+01'),
  -- a follow-up call: booked by the closer, not by the setter
  ('63630000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111',
   'discovery', '2025-03-15 18:00+01', true, '2025-03-10 12:00+01'),
  -- another setter's
  ('63630000-0000-4000-8000-000000000002', '63636363-6363-4363-8363-636363636363', '11111111-1111-4111-8111-111111111111',
   'discovery', '2025-03-12 18:00+01', false, '2025-03-10 12:00+01');

-- B: the setter already wrote his day, numbers and answers
delete from public.setter_daily_reports
where setter_id = '22222222-2222-4222-8222-222222222222' and data between '2025-03-09' and '2025-03-16';
insert into public.setter_daily_reports (
  setter_id, data, dm_outbound, dm_inbound, follow_up, conversazioni, call_proposte, discovery_prenotate,
  discovery_svolte, call_qualificate, strategy_prenotate, contenuto_pubblicato, note,
  lead_in_target, qualita_conversazioni, cosa_frenava, domande_contenuti, created_by, created_at
) values (
  '22222222-2222-4222-8222-222222222222', '2025-03-11', 99, 9, 9, 9, 9, 9,
  3, 2, 2, true, 'Giornata piena',
  'quasi_tutti', 'buone', 'Il prezzo', 'Quanto dura il percorso', '22222222-2222-4222-8222-222222222222', '2025-03-11 20:00+01'
);

create temp table proposte (giorno text primary key, id uuid) on commit drop;
grant all on proposte to authenticated, service_role;
-- when the proposal the setter's page read was computed
create temp table lette (giorno text primary key, calcolato_il timestamptz) on commit drop;
grant all on lette to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The connection: admin only
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ update public.instagram_collegamento
     set setter_id = '22222222-2222-4222-8222-222222222222', account_username = 'alpha.prova', account_id = '17841400000000001'
     where id $$,
  'l''admin sceglie il setter che lavora i DM e registra l''account'
);
select is(
  (select row(setter_id, account_username, updated_by)::text from public.instagram_collegamento),
  row('22222222-2222-4222-8222-222222222222'::uuid, 'alpha.prova', '11111111-1111-4111-8111-111111111111'::uuid)::text,
  'e risulta lui l''ultimo a cambiarlo'
);
select throws_ok(
  $$ update public.instagram_collegamento set setter_id = '33333333-3333-4333-8333-333333333333' where id $$,
  '22023', 'I DM di Instagram li lavora un setter attivo: scegli un setter del team',
  'un closer non lavora i DM'
);
select throws_ok(
  $$ update public.instagram_collegamento set setter_id = '11111111-1111-4111-8111-111111111111' where id $$,
  '22023', 'I DM di Instagram li lavora un setter attivo: scegli un setter del team',
  'l''admin nemmeno: la proposta la legge solo un setter'
);
select throws_ok(
  $$ update public.instagram_collegamento set ultimo_errore = null, token_scade_il = now() where id $$,
  '42501', null,
  'date del token, calcoli ed errori non si scrivono a mano'
);
select throws_ok($$ delete from public.instagram_collegamento $$, '42501', null, 'e la riga non si cancella');
select is((select count(*)::integer from public.instagram_esclusi), 4, 'l''admin vede gli esclusi');
select lives_ok($$ insert into public.instagram_esclusi (username, motivo) values ('servizio.prova', 'Servizio di prova') $$,
  'e ne aggiunge');
select is((select created_by from public.instagram_esclusi where username = 'servizio.prova'),
  '11111111-1111-4111-8111-111111111111'::uuid, 'col suo nome');

-- the setter and the coach: nothing
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::integer from public.instagram_collegamento), 0, 'il setter non vede il collegamento');
select is((select count(*)::integer from public.instagram_esclusi), 0, 'né gli esclusi');
select throws_ok($$ insert into public.instagram_esclusi (username) values ('mario') $$, '42501', null,
  'e non ne aggiunge');
select throws_ok(
  $$ select public.instagram_imposta_token('IGAAtokenDelSetterDiProva1234567890') $$,
  '42501', 'Instagram lo collega l''admin',
  'il setter non collega Instagram'
);
select throws_ok($$ select public.instagram_token_presente() $$, '42501', null, 'né sa se il token c''è');
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select is((select count(*)::integer from public.instagram_collegamento), 0, 'il coach non vede il collegamento');
select is((select count(*)::integer from public.instagram_esclusi), 0, 'né gli esclusi');
select throws_ok($$ select public.instagram_togli_token() $$, '42501', 'Instagram lo scollega l''admin',
  'e non scollega Instagram');

-- ---------------------------------------------------------------------------
-- The token
-- ---------------------------------------------------------------------------
-- an error left from a run before the token
reset role;
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select lives_ok($$ select public.instagram_errore('Rete non raggiungibile') $$, 'il lavoro notturno segna un errore');
select is(public.instagram_token(), null, 'senza collegamento il token non c''è');

reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(public.instagram_token_presente(), false, 'l''admin sa che il token non c''è');
select throws_ok($$ select public.instagram_imposta_token('troppo corto') $$, '22023',
  'Il token non sembra valido: copialo di nuovo per intero', 'un testo che non è un token no');
select throws_ok($$ select public.instagram_imposta_token('IGAA token con spazi dentro 1234567890') $$, '22023',
  'Il token non sembra valido: copialo di nuovo per intero', 'né un token con spazi in mezzo');
select lives_ok($$ select public.instagram_imposta_token('  IGAAprimoTokenDiProva1234567890abcdef  ') $$,
  'l''admin collega Instagram col token');
select is(public.instagram_token_presente(), true, 'ora il token c''è');
select is(
  (select row(token_aggiornato_il = now(), token_scade_il = now() + interval '60 days', ultimo_errore, ultimo_errore_il)::text
   from public.instagram_collegamento),
  row(true, true, null::text, null::timestamptz)::text,
  'datato oggi, scade tra 60 giorni, l''errore di prima tolto'
);
select is(
  (select position('IGAAprimo' in to_jsonb(c)::text) from public.instagram_collegamento c),
  0,
  'nel collegamento il token non c''è'
);
select throws_ok($$ select public.instagram_token() $$, '42501', null, 'nemmeno l''admin legge il token');
select throws_ok($$ select decrypted_secret from vault.decrypted_secrets $$, '42501', null, 'né il Vault');
select throws_ok($$ select secret from vault.secrets $$, '42501', null, 'né i segreti cifrati');
select throws_ok($$ select public.instagram_errore('x') $$, '42501', null, 'né scrive gli errori del lavoro notturno');
select throws_ok($$ select public.instagram_token_rinnovato('IGAAprimoTokenDiProva1234567890abcdef', 'IGAAtokenRinnovatoAMano1234567890', now() + interval '1 day') $$,
  '42501', null, 'né il rinnovo');
select lives_ok($$ select public.instagram_imposta_token('IGAAsecondoTokenDiProva1234567890abcdef') $$,
  'un secondo token prende il posto del primo');

reset role;
select is((select count(*)::integer from vault.secrets where name = 'instagram_token'), 1,
  'un solo segreto, col suo nome fisso');

set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select is(public.instagram_token(), 'IGAAsecondoTokenDiProva1234567890abcdef', 'il service role legge l''ultimo token, senza spazi');
select throws_ok(
  $$ select public.instagram_token_rinnovato('IGAAsecondoTokenDiProva1234567890abcdef', 'IGAArinnovatoTokenDiProva1234567890ab', now() - interval '1 day') $$,
  '22023', 'La scadenza del token rinnovato è già passata', 'un rinnovo già scaduto no'
);
select is(public.instagram_token_rinnovato('IGAAprimoTokenDiProva1234567890abcdef', 'IGAArinnovatoTokenDiProva1234567890ab', now() + interval '59 days'), false,
  'il rinnovo di un token che non è più nel Vault non si salva');
select is(public.instagram_token(), 'IGAAsecondoTokenDiProva1234567890abcdef', 'e il Vault tiene il token che c''era');
select is(public.instagram_token_rinnovato('IGAAsecondoTokenDiProva1234567890abcdef', 'IGAArinnovatoTokenDiProva1234567890ab', now() + interval '59 days'), true,
  'il rinnovo del token che c''è si salva');
select is(public.instagram_token(), 'IGAArinnovatoTokenDiProva1234567890ab', 'col token nuovo');
select is((select token_scade_il from public.instagram_collegamento), now() + interval '59 days', 'e la sua scadenza');

-- an error never keeps the token
select lives_ok(
  $$ select public.instagram_errore('Graph 190 su https://graph.instagram.com/v26.0/me?fields=id&access_token=IGAArinnovatoTokenDiProva1234567890ab: il token IGAArinnovatoTokenDiProva1234567890ab è scaduto') $$,
  'un errore col token dentro'
);
select ok(
  (select position('IGAArinnovato' in ultimo_errore) = 0
          and ultimo_errore like '%access_token=[token]%'
          and ultimo_errore like '%è scaduto'
          and ultimo_errore_il = now()
   from public.instagram_collegamento),
  'si salva senza il token'
);
select lives_ok($$ select public.instagram_errore('chiave EAAaltroTokenSconosciutoLungo1234567890abcdef rifiutata') $$,
  'un errore con un altro token');
select is((select ultimo_errore from public.instagram_collegamento), 'chiave [token] rifiutata',
  'anche un token che non è il nostro sparisce');
select lives_ok($$ select public.instagram_errore(repeat('errore ', 200)) $$, 'un errore lunghissimo');
select is((select char_length(ultimo_errore) from public.instagram_collegamento), 500, 'si taglia a 500 caratteri');

-- the job has read the token and is refreshing it when the admin pastes a
-- new one (another account, say): the refresh of the old one never covers it
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$ select public.instagram_imposta_token('IGAAterzoTokenIncollatoDuranteIlRinnovo12') $$,
  'l''admin incolla un token nuovo mentre il lavoro notturno rinnova il vecchio');
reset role;
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select is(
  public.instagram_token_rinnovato('IGAArinnovatoTokenDiProva1234567890ab', 'IGAArinnovatoDalVecchioToken1234567890ab', now() + interval '58 days'),
  false,
  'il rinnovo del token di prima non si salva'
);
select is(public.instagram_token(), 'IGAAterzoTokenIncollatoDuranteIlRinnovo12', 'il Vault tiene il token appena incollato');
select is((select token_scade_il from public.instagram_collegamento), now() + interval '60 days',
  'con la sua scadenza, non quella del rinnovo');

-- ---------------------------------------------------------------------------
-- The bookings of a day
-- ---------------------------------------------------------------------------
select is(public.discovery_prenotate_del_giorno('22222222-2222-4222-8222-222222222222', '2025-03-10'), 3,
  'le call fissate dal setter quel giorno a Roma, senza le call di follow-up né quelle di un altro setter');
select is(public.discovery_prenotate_del_giorno('22222222-2222-4222-8222-222222222222', '2025-03-09'), 1,
  'quella delle 23:30 del giorno prima resta nel suo giorno');

-- ---------------------------------------------------------------------------
-- The nightly job saves the proposals
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.instagram_salva_proposta('63636363-6363-4363-8363-636363636363', '2025-03-10', 1, 1, 1, 1, 1, 10, 0) $$,
  '22023', 'La proposta va al setter attivo collegato a Instagram',
  'solo al setter collegato'
);
select throws_ok(
  $$ select public.instagram_salva_proposta('22222222-2222-4222-8222-222222222222', public.oggi(), 1, 1, 1, 1, 1, 10, 0) $$,
  '22023', 'La proposta è di un giorno già finito',
  'mai per il giorno in corso'
);
select throws_ok(
  $$ select public.instagram_salva_proposta('22222222-2222-4222-8222-222222222222', '2025-03-10', -1, 1, 1, 1, 1, 10, 0) $$,
  '22023', 'I numeri della proposta vanno da 0 a 9999',
  'mai un numero negativo'
);
select throws_ok(
  $$ select public.instagram_salva_proposta('22222222-2222-4222-8222-222222222222', '2025-03-10', 1, 1, 1, 1, 1, 10, 11) $$,
  '22023', 'Chat lette e incerte non valide',
  'mai più chat incerte che lette'
);

insert into proposte (giorno, id) values
  ('A', public.instagram_salva_proposta('22222222-2222-4222-8222-222222222222', '2025-03-10', 53, 4, 16, 12, 4, 120, 3)),
  ('B', public.instagram_salva_proposta('22222222-2222-4222-8222-222222222222', '2025-03-11', 30, 2, 5, 8, 2, 80, 0, 1)),
  ('C', public.instagram_salva_proposta('22222222-2222-4222-8222-222222222222', '2025-03-12', 10, 1, 2, 3, 1, 40, 1)),
  ('D', public.instagram_salva_proposta('22222222-2222-4222-8222-222222222222', '2025-03-14', 7, 0, 1, 2, 0, 15, 0)),
  ('X', public.instagram_salva_proposta('22222222-2222-4222-8222-222222222222', '2025-03-13', 5, 5, 5, 5, 5, 20, 0));

select is(
  (select row(p.data, p.dm_outbound, p.dm_inbound, p.follow_up, p.conversazioni, p.call_proposte,
              p.discovery_prenotate, p.chat_lette, p.chat_incerte, p.stato, p.deciso_il)::text
   from public.report_proposte_instagram p join proposte x on x.id = p.id where x.giorno = 'A'),
  row('2025-03-10'::date, 53, 4, 16, 12, 4, 3, 120, 3, 'da_confermare'::public.proposta_stato, null::timestamptz)::text,
  'la proposta del giorno, con le discovery prenotate contate dalle call'
);
select is(
  (select discovery_prenotate from public.report_proposte_instagram p join proposte x on x.id = p.id where x.giorno = 'B'),
  1,
  'o passate dal lavoro notturno'
);
select is(
  (select row(ultimo_calcolo_il = now(), ultimo_calcolo_giorno, ultimo_calcolo_chat, ultimo_errore, ultimo_errore_il)::text
   from public.instagram_collegamento),
  row(true, '2025-03-13'::date, 20, null::text, null::timestamptz)::text,
  'il calcolo riuscito si segna sul collegamento e toglie l''errore'
);
select is(
  public.instagram_salva_proposta('22222222-2222-4222-8222-222222222222', '2025-03-10', 54, 4, 16, 12, 4, 121, 3),
  (select id from proposte where giorno = 'A'),
  'una proposta ancora da confermare si ricalcola, sempre la stessa'
);
select is(
  (select row(dm_outbound, chat_lette)::text from public.report_proposte_instagram p join proposte x on x.id = p.id where x.giorno = 'A'),
  row(54, 121)::text,
  'coi numeri nuovi'
);

-- a proposal for tomorrow, only possible by hand: the confirmation refuses it below
reset role;
with n as (
  insert into public.report_proposte_instagram (setter_id, data, dm_outbound)
  values ('22222222-2222-4222-8222-222222222222', public.oggi() + 1, 5)
  returning id
)
insert into proposte (giorno, id) select 'F', id from n;

-- ---------------------------------------------------------------------------
-- Who reads the proposals
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::integer from public.report_proposte_instagram), 6, 'il setter legge le sue proposte');
select throws_ok(
  $$ select public.discovery_prenotate_del_giorno('22222222-2222-4222-8222-222222222222', '2025-03-10') $$,
  '42501', null, 'il conteggio delle prenotate resta al lavoro notturno'
);
select throws_ok(
  $$ update public.report_proposte_instagram set dm_outbound = 1 where data = '2025-03-10' $$,
  '42501', null, 'non ne cambia i numeri'
);
select throws_ok(
  $$ insert into public.report_proposte_instagram (setter_id, data) values ('22222222-2222-4222-8222-222222222222', '2025-03-20') $$,
  '42501', null, 'non ne crea'
);
select throws_ok($$ delete from public.report_proposte_instagram $$, '42501', null, 'non ne cancella');
select throws_ok(
  $$ update public.report_proposte_instagram set stato = 'confermata' where data = '2025-03-10' $$,
  '42501', 'La proposta si conferma con Conferma, che scrive i numeri nel report',
  'non la segna confermata senza scrivere il report'
);
select throws_ok(
  $$ update public.report_proposte_instagram set stato = 'da_confermare' where data = '2025-03-10' $$,
  '22023', 'Una proposta si conferma o si scarta',
  'e una proposta si conferma o si scarta'
);

set local request.jwt.claims to '{"sub":"63636363-6363-4363-8363-636363636363","role":"authenticated"}';
select is((select count(*)::integer from public.report_proposte_instagram), 0, 'un altro setter non le vede');
select throws_ok(
  format('select public.conferma_proposta_instagram(%L)', (select id from proposte where giorno = 'A')),
  'P0002', 'Proposta non trovata', 'né le conferma'
);
select throws_ok(
  format('select public.scarta_proposta_instagram(%L)', (select id from proposte where giorno = 'A')),
  'P0002', 'Proposta non trovata', 'né le scarta'
);

set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is((select count(*)::integer from public.report_proposte_instagram), 0,
  'l''admin non vede le proposte: vede il report come lo conferma il setter');
select throws_ok(
  format('select public.conferma_proposta_instagram(%L)', (select id from proposte where giorno = 'A')),
  '42501', 'La proposta la decide il setter che lavora i DM', 'e non le conferma'
);
select throws_ok(
  format('select public.scarta_proposta_instagram(%L)', (select id from proposte where giorno = 'A')),
  '42501', 'La proposta la decide il setter che lavora i DM', 'né le scarta'
);
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is((select count(*)::integer from public.report_proposte_instagram), 0, 'il closer non le vede');
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select is((select count(*)::integer from public.report_proposte_instagram), 0, 'il coach nemmeno');

-- ---------------------------------------------------------------------------
-- The setter confirms
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok(
  format('select public.conferma_proposta_instagram(%L, %L)', (select id from proposte where giorno = 'A'), '[1, 2]'),
  '22023', 'Correzione non valida', 'una correzione è un oggetto'
);
select throws_ok(
  format('select public.conferma_proposta_instagram(%L, %L)', (select id from proposte where giorno = 'A'), '{"note": "ciao"}'),
  '22023', 'Questo numero non si corregge da qui', 'solo i sei numeri della proposta'
);
select throws_ok(
  format('select public.conferma_proposta_instagram(%L, %L)', (select id from proposte where giorno = 'A'), '{"dm_outbound": -1}'),
  '22023', 'I numeri vanno da 0 a 9999, interi', 'mai negativi'
);
select throws_ok(
  format('select public.conferma_proposta_instagram(%L, %L)', (select id from proposte where giorno = 'A'), '{"dm_outbound": 1.5}'),
  '22023', 'I numeri vanno da 0 a 9999, interi', 'sempre interi'
);
select throws_ok(
  format('select public.conferma_proposta_instagram(%L, %L)', (select id from proposte where giorno = 'A'), '{"dm_outbound": "3"}'),
  '22023', 'I numeri vanno da 0 a 9999, interi', 'numeri, non testo'
);
select throws_ok(
  format('select public.conferma_proposta_instagram(%L, %L)', (select id from proposte where giorno = 'A'), '{"follow_up": 10000}'),
  '22023', 'I numeri vanno da 0 a 9999, interi', 'al massimo 9999, come in Oggi'
);
select is(
  (select stato from public.report_proposte_instagram p join proposte x on x.id = p.id where x.giorno = 'A'),
  'da_confermare'::public.proposta_stato,
  'una correzione rifiutata lascia la proposta da confermare'
);

-- A: as it is, no report yet
select is(
  (select row(r.setter_id, r.data, r.dm_outbound, r.dm_inbound, r.follow_up, r.conversazioni, r.call_proposte,
              r.discovery_prenotate, r.dm_totali)::text
   from public.conferma_proposta_instagram((select id from proposte where giorno = 'A')) r),
  row('22222222-2222-4222-8222-222222222222'::uuid, '2025-03-10'::date, 54, 4, 16, 12, 4, 3, 74)::text,
  'confermata così com''è: il report del giorno nasce coi numeri della proposta'
);
select is(
  (select row(strategy_prenotate, discovery_svolte, call_qualificate, contenuto_pubblicato, note, lead_in_target,
              qualita_conversazioni, cosa_frenava, domande_contenuti, created_by)::text
   from public.setter_daily_reports
   where setter_id = '22222222-2222-4222-8222-222222222222' and data = '2025-03-10'),
  row(0, 0, 0, false, null::text, null::public.quota_in_target, null::public.qualita_conversazioni,
      null::text, null::text, '22222222-2222-4222-8222-222222222222'::uuid)::text,
  'il resto del report resta vuoto: le domande della giornata sono sue'
);
select is(
  (select row(stato, deciso_il = now())::text from public.report_proposte_instagram p join proposte x on x.id = p.id where x.giorno = 'A'),
  row('confermata'::public.proposta_stato, true)::text,
  'e la proposta è confermata adesso'
);
select throws_ok(
  format('select public.conferma_proposta_instagram(%L)', (select id from proposte where giorno = 'A')),
  '22023', 'Questa proposta è già stata confermata', 'una volta sola'
);
select throws_ok(
  format('select public.scarta_proposta_instagram(%L)', (select id from proposte where giorno = 'A')),
  '22023', 'Questa proposta è già stata confermata', 'e confermata non si scarta più'
);

-- B: corrected, over the report he had already written
select lives_ok(
  format('select public.conferma_proposta_instagram(%L, %L)', (select id from proposte where giorno = 'B'),
    '{"dm_outbound": 40, "follow_up": 7.0}'),
  'confermata con la sua correzione'
);
select is(
  (select row(dm_outbound, dm_inbound, follow_up, conversazioni, call_proposte, discovery_prenotate)::text
   from public.setter_daily_reports
   where setter_id = '22222222-2222-4222-8222-222222222222' and data = '2025-03-11'),
  row(40, 2, 7, 8, 2, 1)::text,
  'la correzione vince, gli altri numeri dalla proposta'
);
select is(
  (select row(discovery_svolte, call_qualificate, strategy_prenotate, contenuto_pubblicato, note, lead_in_target,
              qualita_conversazioni, cosa_frenava, domande_contenuti, created_by, created_at)::text
   from public.setter_daily_reports
   where setter_id = '22222222-2222-4222-8222-222222222222' and data = '2025-03-11'),
  row(3, 2, 2, true, 'Giornata piena', 'quasi_tutti'::public.quota_in_target, 'buone'::public.qualita_conversazioni,
      'Il prezzo', 'Quanto dura il percorso', '22222222-2222-4222-8222-222222222222'::uuid,
      '2025-03-11 20:00+01'::timestamptz)::text,
  'le risposte della giornata, le note, i campi storici e chi l''ha creato restano com''erano'
);
select is(
  (select row(dm_outbound, follow_up, stato)::text from public.report_proposte_instagram p join proposte x on x.id = p.id where x.giorno = 'B'),
  row(30, 5, 'confermata'::public.proposta_stato)::text,
  'la proposta resta come l''ha calcolata il lavoro notturno'
);

-- C: discarded
select lives_ok(
  format('select public.scarta_proposta_instagram(%L)', (select id from proposte where giorno = 'C')),
  'il setter scarta una proposta'
);
select is(
  (select row(stato, deciso_il = now())::text from public.report_proposte_instagram p join proposte x on x.id = p.id where x.giorno = 'C'),
  row('scartata'::public.proposta_stato, true)::text,
  'scartata adesso'
);
select is(
  (select count(*)::integer from public.setter_daily_reports
   where setter_id = '22222222-2222-4222-8222-222222222222' and data = '2025-03-12'),
  0,
  'e il suo report resta com''era: qui non c''era'
);
select throws_ok(
  format('select public.conferma_proposta_instagram(%L)', (select id from proposte where giorno = 'C')),
  '22023', 'Questa proposta è già stata scartata', 'scartata non si conferma più'
);
select throws_ok(
  format('select public.scarta_proposta_instagram(%L)', (select id from proposte where giorno = 'C')),
  '22023', 'Questa proposta è già stata scartata', 'né si scarta due volte'
);

-- D: discarded with a plain update, as the column grant allows
select lives_ok(
  $$ update public.report_proposte_instagram set stato = 'scartata' where data = '2025-03-14' $$,
  'scartare è anche cambiare il solo stato'
);
select is(
  (select row(stato, deciso_il = now())::text from public.report_proposte_instagram p join proposte x on x.id = p.id where x.giorno = 'D'),
  row('scartata'::public.proposta_stato, true)::text,
  'con il momento della decisione'
);
select lives_ok(
  $$ update public.report_proposte_instagram set stato = 'scartata' where data = '2025-03-14' $$,
  'una proposta già decisa non si tocca più'
);

-- G: recomputed after he read it (the admin's "Ricalcola ieri", a second
-- nightly run): the numbers on his screen are not the ones there now, so
-- nothing is confirmed until he has seen the new ones. H: recomputed with the
-- same numbers (the cron delivered twice, "Ricalcola ieri" on a day already
-- counted): nothing changed, so his confirmation goes through.
reset role;
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
insert into proposte (giorno, id) values
  ('G', public.instagram_salva_proposta('22222222-2222-4222-8222-222222222222', '2025-03-09', 53, 4, 16, 12, 4, 30, 2)),
  ('H', public.instagram_salva_proposta('22222222-2222-4222-8222-222222222222', '2025-03-16', 20, 2, 3, 4, 1, 25, 1));
-- now() stands still inside one transaction: the run his page read was an earlier one
reset role;
update public.report_proposte_instagram p set calcolato_il = p.calcolato_il - interval '5 minutes'
from proposte x where x.id = p.id and x.giorno in ('G', 'H');
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
insert into lette (giorno, calcolato_il)
select x.giorno, p.calcolato_il from public.report_proposte_instagram p join proposte x on x.id = p.id where x.giorno in ('G', 'H');

reset role;
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select is(
  public.instagram_salva_proposta('22222222-2222-4222-8222-222222222222', '2025-03-16', 20, 2, 3, 4, 1, 25, 1),
  (select id from proposte where giorno = 'H'),
  'un ricalcolo con gli stessi numeri: la stessa proposta'
);
select is(
  (select p.calcolato_il from public.report_proposte_instagram p join proposte x on x.id = p.id where x.giorno = 'H'),
  (select calcolato_il from lette where giorno = 'H'),
  'e il momento del calcolo resta quello che il setter ha visto'
);
select is(
  public.instagram_salva_proposta('22222222-2222-4222-8222-222222222222', '2025-03-09', 9, 1, 2, 3, 0, 12, 0),
  (select id from proposte where giorno = 'G'),
  'la proposta si ricalcola mentre il setter la guarda'
);
select is(
  (select p.calcolato_il = now() from public.report_proposte_instagram p join proposte x on x.id = p.id where x.giorno = 'G'),
  true,
  'con numeri nuovi, un momento nuovo'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok(
  format('select public.conferma_proposta_instagram(%L, null, %L)',
    (select id from proposte where giorno = 'G'), (select calcolato_il from lette where giorno = 'G')),
  '22023', 'I numeri della proposta sono cambiati: ricontrollali e conferma di nuovo',
  'non conferma numeri che il setter non ha visto'
);
select throws_ok(
  format('select public.conferma_proposta_instagram(%L, %L, %L)',
    (select id from proposte where giorno = 'G'), '{"dm_outbound": 50}', (select calcolato_il from lette where giorno = 'G')),
  '22023', 'I numeri della proposta sono cambiati: ricontrollali e conferma di nuovo',
  'nemmeno corretti a partire da quelli vecchi'
);
select is(
  (select row(p.stato, (select count(*) from public.setter_daily_reports
                         where setter_id = '22222222-2222-4222-8222-222222222222' and data = '2025-03-09'))::text
   from public.report_proposte_instagram p join proposte x on x.id = p.id where x.giorno = 'G'),
  row('da_confermare'::public.proposta_stato, 0)::text,
  'il report resta com''era e la proposta da confermare'
);
select is(
  (select row(r.dm_outbound, r.dm_inbound, r.follow_up, r.conversazioni, r.call_proposte, r.discovery_prenotate)::text
   from public.conferma_proposta_instagram(
     (select id from proposte where giorno = 'G'),
     null,
     (select p.calcolato_il from public.report_proposte_instagram p join proposte x on x.id = p.id where x.giorno = 'G')
   ) r),
  row(9, 1, 2, 3, 0, 1)::text,
  'riletti i numeri nuovi, li conferma: nel report quelli che ha visto'
);
select is(
  (select row(r.dm_outbound, r.dm_inbound, r.follow_up, r.conversazioni, r.call_proposte, r.discovery_prenotate)::text
   from public.conferma_proposta_instagram(
     (select id from proposte where giorno = 'H'), null, (select calcolato_il from lette where giorno = 'H')
   ) r),
  (select row(20, 2, 3, 4, 1, p.discovery_prenotate)::text
   from public.report_proposte_instagram p join proposte x on x.id = p.id where x.giorno = 'H'),
  'un ricalcolo con gli stessi numeri non blocca la conferma'
);

-- F: a day to come, like "Oggi"
select throws_ok(
  format('select public.conferma_proposta_instagram(%L)', (select id from proposte where giorno = 'F')),
  '42501', 'Un giorno che non è ancora arrivato non si compila.', 'un giorno che deve ancora arrivare non si conferma'
);
select is(
  (select row(stato, (select count(*) from public.setter_daily_reports
                       where setter_id = '22222222-2222-4222-8222-222222222222' and data = public.oggi() + 1))::text
   from public.report_proposte_instagram p join proposte x on x.id = p.id where x.giorno = 'F'),
  row('da_confermare'::public.proposta_stato, 0)::text,
  'e resta da confermare, senza report'
);

-- the nightly job never goes over a decision
reset role;
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select is(
  public.instagram_salva_proposta('22222222-2222-4222-8222-222222222222', '2025-03-10', 1, 1, 1, 1, 1, 10, 0),
  null,
  'una proposta confermata non si ricalcola'
);
select is(
  public.instagram_salva_proposta('22222222-2222-4222-8222-222222222222', '2025-03-12', 1, 1, 1, 1, 1, 10, 0),
  null,
  'nemmeno una scartata'
);
select is(
  (select array_agg(row(p.dm_outbound, p.stato)::text order by p.data)
   from public.report_proposte_instagram p join proposte x on x.id = p.id where x.giorno in ('A', 'C')),
  array[row(54, 'confermata'::public.proposta_stato)::text, row(10, 'scartata'::public.proposta_stato)::text],
  'restano come le ha decise il setter'
);

-- ---------------------------------------------------------------------------
-- The backup takes the connection and the excluded accounts, never the
-- token, never the proposals (the admin's file: section 6)
-- ---------------------------------------------------------------------------
select ok(
  (select b ? 'instagram_collegamento' and b ? 'instagram_esclusi' and not (b ? 'report_proposte_instagram')
          and not (b ? 'secrets') and not (b ? 'decrypted_secrets')
          and position('IGAArinnovato' in b::text) = 0
   from (select public.backup_completo() as b) x),
  'il backup prende il collegamento e le chat escluse, mai il token né le proposte'
);

-- ---------------------------------------------------------------------------
-- Merging and deleting a person
-- ---------------------------------------------------------------------------
-- 63 works the DMs, with a proposal on X (the seed setter has one too) and on 15/03
reset role;
update public.instagram_collegamento set setter_id = '63636363-6363-4363-8363-636363636363' where id;
insert into public.report_proposte_instagram (setter_id, data, dm_outbound) values
  ('63636363-6363-4363-8363-636363636363', '2025-03-13', 77),
  ('63636363-6363-4363-8363-636363636363', '2025-03-15', 88);

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select public.unisci_profili('63636363-6363-4363-8363-636363636363', '22222222-2222-4222-8222-222222222222') $$,
  'l''admin unisce un setter al seed'
);
reset role;
select is(
  (select array_agg(row(data, dm_outbound)::text order by data)
   from public.report_proposte_instagram
   where setter_id = '22222222-2222-4222-8222-222222222222' and data in ('2025-03-13', '2025-03-15')),
  array[row('2025-03-13'::date, 5)::text, row('2025-03-15'::date, 88)::text],
  'lo stesso giorno resta la proposta del setter in cui si unisce, le altre passano a lui'
);
select is((select setter_id from public.instagram_collegamento), '22222222-2222-4222-8222-222222222222'::uuid,
  'e i DM passano a lui, che è un setter attivo');

-- 64 works the DMs and is merged into the coach: nobody works them any more
update public.instagram_collegamento set setter_id = '64646464-6464-4464-8464-646464646464' where id;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select public.unisci_profili('64646464-6464-4464-8464-646464646464', '44444444-4444-4444-8444-444444444444') $$,
  'l''admin unisce un setter a un coach'
);
reset role;
select is((select setter_id from public.instagram_collegamento), null::uuid,
  'i DM non vanno a un coach: il collegamento resta senza setter');

-- 65 works the DMs and is deleted: his proposals go with him
update public.instagram_collegamento set setter_id = '65656565-6565-4565-8565-656565656565' where id;
insert into public.report_proposte_instagram (setter_id, data, dm_outbound) values
  ('65656565-6565-4565-8565-656565656565', '2025-03-10', 3);
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$ select public.elimina_persona('65656565-6565-4565-8565-656565656565') $$,
  'l''admin elimina un setter collegato');
reset role;
select is(
  (select row((select count(*) from public.report_proposte_instagram where setter_id = '65656565-6565-4565-8565-656565656565'),
              (select setter_id from public.instagram_collegamento))::text),
  row(0, null::uuid)::text,
  'le sue proposte se ne vanno con lui, il collegamento resta senza setter'
);

-- ---------------------------------------------------------------------------
-- A deactivated setter
-- ---------------------------------------------------------------------------
update public.instagram_collegamento set setter_id = '22222222-2222-4222-8222-222222222222' where id;
update public.profiles set attivo = false where id = '22222222-2222-4222-8222-222222222222';
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::integer from public.report_proposte_instagram), 0, 'un setter disattivato non legge le sue proposte');
select throws_ok(
  format('select public.conferma_proposta_instagram(%L)', (select id from proposte where giorno = 'F')),
  '42501', 'La proposta la decide il setter che lavora i DM', 'né le conferma'
);
reset role;
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select throws_ok(
  $$ select public.instagram_salva_proposta('22222222-2222-4222-8222-222222222222', '2025-03-16', 1, 1, 1, 1, 1, 10, 0) $$,
  '22023', 'La proposta va al setter attivo collegato a Instagram',
  'e il lavoro notturno non gliene prepara'
);
reset role;
update public.profiles set attivo = true where id = '22222222-2222-4222-8222-222222222222';

-- ---------------------------------------------------------------------------
-- The admin disconnects the account
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$ select public.instagram_togli_token() $$, 'l''admin scollega Instagram');
select is(public.instagram_token_presente(), false, 'il token non c''è più');
select is(
  (select row(token_aggiornato_il, token_scade_il, setter_id)::text from public.instagram_collegamento),
  row(null::timestamptz, null::timestamptz, '22222222-2222-4222-8222-222222222222'::uuid)::text,
  'le date del token vanno via, il setter resta'
);
reset role;
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select is(public.instagram_token(), null, 'il lavoro notturno non ha più un token');
select is(public.instagram_token_rinnovato('IGAArinnovatoTokenDiProva1234567890ab', 'IGAAtokenRinnovatoInRitardo1234567890', now() + interval '60 days'), false,
  'e un rinnovo arrivato dopo non lo riporta');
reset role;
select is((select count(*)::integer from vault.secrets where name = 'instagram_token'), 0, 'il Vault è vuoto');

select * from finish();
rollback;
