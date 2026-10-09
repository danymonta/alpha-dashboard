-- The setter's comment on his day is required from 08/10/2026 (Dany: "che sia
-- lui o Instagram poi a caricare deve lui sempre lasciare un commento della
-- giornata"): lead in target, qualità delle conversazioni and cosa frenava i
-- lead, on a day with activity (DM or conversazioni). The report always saves
-- without it (no constraint on the table); what needs it is the setter's
-- decision on an Instagram proposal: he confirms or keeps his numbers only
-- with the comment of that day complete, his saved answers plus the ones he
-- gives with the decision (p_commento, written in the same transaction). A
-- day before 08/10 and a day without activity ask nothing. The admin decides
-- without it and never writes it: the day stays with its comment to write,
-- for the setter. The version check (calcolato_il) and the first decision
-- work as before.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(73);

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
select ok(
  (select bool_and(not p.prosecdef and p.proconfig @> array['search_path=""'])
   from pg_proc p
   where p.oid in (
     'public.conferma_proposta_instagram(uuid, jsonb, timestamptz, jsonb, jsonb)'::regprocedure,
     'public.scarta_proposta_instagram(uuid, jsonb)'::regprocedure,
     'public.commento_proposta_valido(jsonb)'::regprocedure,
     'public.commento_da_scrivere(date, integer, integer, integer, integer, public.quota_in_target, public.qualita_conversazioni, text)'::regprocedure,
     'public.testo_scritto(text)'::regprocedure,
     'public.setter_daily_reports_testi_vuoti()'::regprocedure
   )),
  'conferma, scarto, i controlli del commento e il trigger dei testi vuoti girano coi permessi di chi li chiama, con search_path vuoto'
);
select ok(
  (select bool_and(
     not has_function_privilege('anon', f, 'execute')
     and has_function_privilege('authenticated', f, 'execute'))
   from unnest(array[
     'public.conferma_proposta_instagram(uuid, jsonb, timestamptz, jsonb, jsonb)',
     'public.scarta_proposta_instagram(uuid, jsonb)',
     'public.commento_proposta_valido(jsonb)',
     'public.commento_da_scrivere(date, integer, integer, integer, integer, public.quota_in_target, public.qualita_conversazioni, text)',
     'public.testo_scritto(text)'
   ]) as f),
  'chi è entrato, mai anon'
);
select is(
  (select count(*)::integer from pg_proc
   where proname in ('conferma_proposta_instagram', 'scarta_proposta_instagram')
     and pronamespace = 'public'::regnamespace),
  2,
  'una sola versione di ognuna: le chiamate dell''app non ne trovano mai due'
);
select is(
  (select count(*)::integer from pg_constraint
   where conrelid = 'public.setter_daily_reports'::regclass and contype = 'c'
     and pg_get_constraintdef(oid) ~ '(lead_in_target|qualita_conversazioni)'),
  0,
  'nessun vincolo sul report: il salvataggio di Oggi non si blocca mai'
);
select has_trigger(
  'public', 'setter_daily_reports', 'setter_daily_reports_testi_vuoti',
  'un testo di soli spazi si salva vuoto, da ogni scrittura'
);

-- Some text: the blanks of JavaScript's trim() are no answer
select is(
  array[
    public.testo_scritto(null), public.testo_scritto(''), public.testo_scritto('   '),
    public.testo_scritto(E'\n\t '), public.testo_scritto(U&'\00A0\2003\3000\FEFF'),
    public.testo_scritto(' Il prezzo ')
  ],
  array[false, false, false, false, false, true],
  'un testo vuoto o fatto di spazi non è una risposta'
);

-- Only trim()'s blanks: U+0085 and U+001C-U+001F stay text for JavaScript
-- ('\u0085'.trim().length is 1), never \s of the database's locale
select is(
  array[
    public.testo_scritto(U&'\0085'), public.testo_scritto(U&'\001f'),
    public.testo_scritto(U&'\001c\001d\001e'), public.testo_scritto(U&'\00a0\3000\feff')
  ],
  array[true, true, true, false],
  'U+0085 e U+001C-U+001F sono testo, come per trim() di JavaScript'
);

-- Every blank of the Basic Multilingual Plane, exactly trim()'s (the same list
-- that JavaScript gives, tests/commento-report.test.ts)
select is(
  array(
    select i from generate_series(1, 65535) i
    where i not between 55296 and 57343 and not public.testo_scritto(chr(i))
    order by i
  ),
  array[
    9, 10, 11, 12, 13, 32, 160, 5760,
    8192, 8193, 8194, 8195, 8196, 8197, 8198, 8199, 8200, 8201, 8202,
    8232, 8233, 8239, 8287, 12288, 65279
  ],
  'gli spazi del database sono esattamente quelli di trim()'
);

-- ---------------------------------------------------------------------------
-- Fixtures. Seed: admin 1111 (Dany Montagnolo), setter 2222 (Loris Setter).
-- Nine more setters, so every case has its own proposal on 08/10/2026 (the
-- first required day, always a day already arrived): A..F decide themselves,
-- 1..3 are decided by the admin.
-- ---------------------------------------------------------------------------
insert into public.invites (email, ruolo)
select 'setter65' || s || '@alpha.test', 'setter'
from unnest(array['a', 'b', 'c', 'd', 'e', 'f', '1', '2', '3']) s;
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
select '00000000-0000-0000-0000-000000000000', ('65656565-0000-4000-8000-00000000000' || s)::uuid,
  'authenticated', 'authenticated', 'setter65' || s || '@alpha.test', '', now(),
  '{}'::jsonb, jsonb_build_object('full_name', 'Setter ' || upper(s)), now(), now(), '', '', '', ''
from unnest(array['a', 'b', 'c', 'd', 'e', 'f', '1', '2', '3']) s;

delete from public.report_proposte_instagram where data between '2026-10-06' and '2026-10-08';
delete from public.setter_daily_reports
where data between '2026-10-06' and '2026-10-08'
  and setter_id = '22222222-2222-4222-8222-222222222222';

-- the reports already there
insert into public.setter_daily_reports (
  setter_id, data, dm_outbound, dm_inbound, follow_up, conversazioni, call_proposte, discovery_prenotate,
  note, lead_in_target, qualita_conversazioni, cosa_frenava, domande_contenuti, created_by
) values
  -- B: the comment complete, written in "Oggi"
  ('65656565-0000-4000-8000-00000000000b', '2026-10-08', 20, 2, 5, 4, 2, 1,
   'Nota di B', 'quasi_tutti', 'buone', 'Il tempo', 'La pancia', '65656565-0000-4000-8000-00000000000b'),
  -- C: only the first scale
  ('65656565-0000-4000-8000-00000000000c', '2026-10-08', 10, 1, 0, 3, 1, 0,
   'Nota di C', 'circa_meta', null, null, 'Domande di C', '65656565-0000-4000-8000-00000000000c'),
  -- E: his numbers, no comment ("Tieni i miei")
  ('65656565-0000-4000-8000-00000000000e', '2026-10-08', 30, 3, 3, 3, 3, 3,
   null, null, null, null, null, '65656565-0000-4000-8000-00000000000e'),
  -- F: conversations only, the comment with a blank cosa_frenava
  ('65656565-0000-4000-8000-00000000000f', '2026-10-08', 0, 0, 0, 6, 0, 0,
   null, 'pochi', 'scarse', '   ', null, '65656565-0000-4000-8000-00000000000f'),
  -- 2: half the comment, then the admin confirms over it
  ('65656565-0000-4000-8000-000000000002', '2026-10-08', 10, 1, 1, 1, 1, 1,
   null, 'quasi_tutti', null, 'Il prezzo', 'Domande di 2', '65656565-0000-4000-8000-000000000002'),
  -- 3: his numbers, no comment, then the admin keeps them
  ('65656565-0000-4000-8000-000000000003', '2026-10-08', 9, 0, 0, 2, 0, 0,
   null, null, null, null, null, '65656565-0000-4000-8000-000000000003'),
  -- the seed setter on 07/10, before the rule: numbers, no comment
  ('22222222-2222-4222-8222-222222222222', '2026-10-07', 40, 4, 4, 4, 4, 4,
   null, null, null, null, null, '22222222-2222-4222-8222-222222222222');

-- the proposals
insert into public.report_proposte_instagram
  (id, setter_id, data, dm_outbound, dm_inbound, follow_up, conversazioni, call_proposte, discovery_prenotate,
   chat_lette, chat_incerte, calcolato_il)
values
  -- the seed setter: 08/10 (no report), 07/10 (before the rule, confirmed), 06/10 (before the rule, kept)
  ('65650000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', '2026-10-08', 53, 3, 16, 9, 4, 4, 60, 2, now()),
  ('65650000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', '2026-10-07', 50, 5, 5, 5, 5, 5, 50, 0, now()),
  ('65650000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', '2026-10-06', 6, 6, 6, 6, 6, 6, 6, 0, now()),
  ('65650000-0000-4000-8000-00000000000a', '65656565-0000-4000-8000-00000000000a', '2026-10-08', 0, 0, 0, 0, 2, 1, 4, 0, now()),
  ('65650000-0000-4000-8000-0000000000a7', '65656565-0000-4000-8000-00000000000a', '2026-10-07', 7, 0, 0, 1, 0, 0, 7, 0, now()),
  ('65650000-0000-4000-8000-0000000000a6', '65656565-0000-4000-8000-00000000000a', '2026-10-06', 6, 0, 0, 1, 0, 0, 6, 0, now()),
  ('65650000-0000-4000-8000-00000000000b', '65656565-0000-4000-8000-00000000000b', '2026-10-08', 21, 2, 5, 4, 2, 1, 30, 0, now()),
  -- C: what his page read, ten minutes ago
  ('65650000-0000-4000-8000-00000000000c', '65656565-0000-4000-8000-00000000000c', '2026-10-08', 11, 1, 0, 3, 1, 0, 12, 0, now() - interval '10 minutes'),
  ('65650000-0000-4000-8000-00000000000d', '65656565-0000-4000-8000-00000000000d', '2026-10-08', 15, 1, 1, 2, 1, 0, 15, 0, now()),
  ('65650000-0000-4000-8000-00000000000e', '65656565-0000-4000-8000-00000000000e', '2026-10-08', 31, 3, 3, 3, 3, 3, 31, 0, now()),
  ('65650000-0000-4000-8000-00000000000f', '65656565-0000-4000-8000-00000000000f', '2026-10-08', 1, 0, 0, 6, 0, 0, 6, 0, now()),
  ('65650000-0000-4000-8000-000000000011', '65656565-0000-4000-8000-000000000001', '2026-10-08', 40, 4, 4, 4, 4, 4, 40, 0, now()),
  ('65650000-0000-4000-8000-000000000012', '65656565-0000-4000-8000-000000000002', '2026-10-08', 12, 1, 1, 1, 1, 1, 12, 0, now()),
  ('65650000-0000-4000-8000-000000000013', '65656565-0000-4000-8000-000000000003', '2026-10-08', 9, 1, 0, 2, 0, 0, 9, 0, now());

-- F wrote only blanks in cosa_frenava: saved as no answer (null)
select is(
  (select row(cosa_frenava, lead_in_target)::text from public.setter_daily_reports
   where setter_id = '65656565-0000-4000-8000-00000000000f' and data = '2026-10-08'),
  row(null::text, 'pochi'::public.quota_in_target)::text,
  'cosa frenava i lead di soli spazi si salva vuoto, le altre risposte restano'
);

-- ---------------------------------------------------------------------------
-- The comment to write, day by day
-- ---------------------------------------------------------------------------
select is(
  (select array_agg(row(setter_id, data, public.commento_da_scrivere(r.data, r.dm_outbound, r.dm_inbound, r.follow_up, r.conversazioni, r.lead_in_target, r.qualita_conversazioni, r.cosa_frenava))::text order by data, setter_id)
   from public.setter_daily_reports r
   where data between '2026-10-07' and '2026-10-08'
     and setter_id in ('22222222-2222-4222-8222-222222222222',
                       '65656565-0000-4000-8000-00000000000b', '65656565-0000-4000-8000-00000000000c',
                       '65656565-0000-4000-8000-00000000000e', '65656565-0000-4000-8000-00000000000f')),
  array[
    row('22222222-2222-4222-8222-222222222222'::uuid, '2026-10-07'::date, false)::text,
    row('65656565-0000-4000-8000-00000000000b'::uuid, '2026-10-08'::date, false)::text,
    row('65656565-0000-4000-8000-00000000000c'::uuid, '2026-10-08'::date, true)::text,
    row('65656565-0000-4000-8000-00000000000e'::uuid, '2026-10-08'::date, true)::text,
    row('65656565-0000-4000-8000-00000000000f'::uuid, '2026-10-08'::date, true)::text
  ],
  'dal 08/10, con attività: il commento manca finché una delle tre risposte manca (anche un testo di soli spazi, salvato vuoto); prima, mai'
);
select is(
  array[
    public.commento_da_scrivere('2026-10-08', 0, 0, 0, 0, null, null, null),
    public.commento_da_scrivere('2026-10-08', 0, 0, 1, 0, null, null, null),
    public.commento_da_scrivere('2026-10-08', 0, 0, 0, 1, 'pochi', 'buone', 'Il prezzo'),
    public.commento_da_scrivere('2026-10-07', 9, 9, 9, 9, null, null, null)
  ],
  array[false, true, false, false],
  'senza DM né conversazioni non serve; un follow up basta perché serva; completo non manca; il 07/10 mai'
);

-- ---------------------------------------------------------------------------
-- The report always saves without the comment
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"65656565-0000-4000-8000-00000000000d","role":"authenticated"}';
select lives_ok(
  $$ insert into public.setter_daily_reports (setter_id, data, dm_outbound, created_by)
     values ('65656565-0000-4000-8000-00000000000d', '2026-10-08', 5, '65656565-0000-4000-8000-00000000000d') $$,
  'il setter salva i numeri di oggi senza commento, come in Oggi'
);
select lives_ok(
  $$ update public.setter_daily_reports set conversazioni = 2, lead_in_target = 'pochi'
     where setter_id = '65656565-0000-4000-8000-00000000000d' and data = '2026-10-08' $$,
  'e li corregge con una risposta sola'
);
select is(
  (select array_agg(data) from public.setter_daily_reports r where public.commento_da_scrivere(r.data, r.dm_outbound, r.dm_inbound, r.follow_up, r.conversazioni, r.lead_in_target, r.qualita_conversazioni, r.cosa_frenava)),
  array['2026-10-08'::date],
  'il giorno resta con il commento da scrivere, e il setter lo trova tra i suoi'
);

-- A write of his own straight to the table (PostgREST, not a form of the
-- app): blanks are no answer here too, so the app's count (cosa_frenava is
-- null, lib/setting/commento.ts) and commento_da_scrivere say the same days
select lives_ok(
  $$ update public.setter_daily_reports
     set qualita_conversazioni = 'scarse', cosa_frenava = '   ', domande_contenuti = E' \n\t'
     where setter_id = '65656565-0000-4000-8000-00000000000d' and data = '2026-10-08' $$,
  'il setter scrive spazi direttamente nel suo report: si salva'
);
select is(
  (select row(qualita_conversazioni, cosa_frenava, domande_contenuti)::text from public.setter_daily_reports
   where setter_id = '65656565-0000-4000-8000-00000000000d' and data = '2026-10-08'),
  row('scarse'::public.qualita_conversazioni, null::text, null::text)::text,
  'ma i testi di soli spazi restano vuoti'
);
select is(
  (select array_agg(data) from public.setter_daily_reports
   where data >= '2026-10-08'
     and (dm_outbound > 0 or dm_inbound > 0 or follow_up > 0 or conversazioni > 0)
     and (lead_in_target is null or qualita_conversazioni is null or cosa_frenava is null)),
  (select array_agg(data) from public.setter_daily_reports r where public.commento_da_scrivere(r.data, r.dm_outbound, r.dm_inbound, r.follow_up, r.conversazioni, r.lead_in_target, r.qualita_conversazioni, r.cosa_frenava)),
  'i filtri dell''app (FILTRO_ATTIVITA, FILTRO_COMMENTO_MANCANTE) contano gli stessi giorni del database'
);

-- ---------------------------------------------------------------------------
-- The setter confirms only with the comment
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

-- P1 (08/10, his numbers from Instagram, no report)
select throws_ok(
  $$ select public.conferma_proposta_instagram('65650000-0000-4000-8000-000000000001') $$,
  '22023', 'Prima di confermare scrivi com''è andata la giornata: lead in target, qualità delle conversazioni e cosa frenava i lead.',
  'senza commento il setter non conferma'
);
select throws_ok(
  $$ select public.conferma_proposta_instagram('65650000-0000-4000-8000-000000000001', '{"dm_outbound": 52}') $$,
  '22023', 'Prima di confermare scrivi com''è andata la giornata: lead in target, qualità delle conversazioni e cosa frenava i lead.',
  'né correggendo i numeri'
);
select throws_ok(
  $$ select public.conferma_proposta_instagram('65650000-0000-4000-8000-000000000001', null, null, null,
       '{"lead_in_target": "quasi_tutti", "qualita_conversazioni": "medie"}') $$,
  '22023', 'Prima di confermare scrivi com''è andata la giornata: lead in target, qualità delle conversazioni e cosa frenava i lead.',
  'le due scale non bastano: serve anche cosa frenava i lead'
);
select throws_ok(
  $$ select public.conferma_proposta_instagram('65650000-0000-4000-8000-000000000001', null, null, null,
       '{"lead_in_target": "quasi_tutti", "qualita_conversazioni": "medie", "cosa_frenava": "   "}') $$,
  '22023', 'Prima di confermare scrivi com''è andata la giornata: lead in target, qualità delle conversazioni e cosa frenava i lead.',
  'e un testo di soli spazi non è una risposta'
);
select throws_ok(
  $$ select public.conferma_proposta_instagram('65650000-0000-4000-8000-000000000001', null, null, null,
       '{"qualita_conversazioni": "medie", "cosa_frenava": "Il prezzo"}') $$,
  '22023', 'Prima di confermare scrivi com''è andata la giornata: lead in target, qualità delle conversazioni e cosa frenava i lead.',
  'né senza i lead in target'
);
select is(
  (select row(p.stato, p.deciso_da,
              (select count(*) from public.setter_daily_reports
               where setter_id = '22222222-2222-4222-8222-222222222222' and data = '2026-10-08'))::text
   from public.report_proposte_instagram p where p.id = '65650000-0000-4000-8000-000000000001'),
  row('da_confermare'::public.proposta_stato, null::uuid, 0)::text,
  'rifiutata: la proposta resta da decidere e il report non nasce'
);

-- the answers are checked
select throws_ok(
  $$ select public.conferma_proposta_instagram('65650000-0000-4000-8000-000000000001', null, null, null, '["pochi"]') $$,
  '22023', 'Commento non valido', 'il commento è un oggetto'
);
select throws_ok(
  $$ select public.conferma_proposta_instagram('65650000-0000-4000-8000-000000000001', null, null, null,
       '{"note": "ciao"}') $$,
  '22023', 'Questa risposta non si scrive da qui', 'solo le tre risposte obbligatorie'
);
select throws_ok(
  $$ select public.conferma_proposta_instagram('65650000-0000-4000-8000-000000000001', null, null, null,
       '{"lead_in_target": "tanti"}') $$,
  '22023', 'Scegli uno dei tre livelli', 'un livello della scala dei lead in target'
);
select throws_ok(
  $$ select public.conferma_proposta_instagram('65650000-0000-4000-8000-000000000001', null, null, null,
       '{"qualita_conversazioni": "ottime"}') $$,
  '22023', 'Scegli uno dei tre livelli', 'e della scala della qualità'
);
select throws_ok(
  $$ select public.conferma_proposta_instagram('65650000-0000-4000-8000-000000000001', null, null, null,
       '{"cosa_frenava": 3}') $$,
  '22023', 'Commento non valido', 'cosa frenava i lead è un testo'
);
select throws_ok(
  format('select public.conferma_proposta_instagram(%L, null, null, null, %L)',
    '65650000-0000-4000-8000-000000000001', jsonb_build_object('cosa_frenava', repeat('x', 1001))),
  '22023', 'Al massimo 1000 caratteri', 'al massimo 1000 caratteri'
);

-- with the comment: confirmed, the answers in the same report
select is(
  (select row(r.setter_id, r.data, r.dm_outbound, r.dm_inbound, r.follow_up, r.conversazioni, r.call_proposte,
              r.discovery_prenotate, r.lead_in_target, r.qualita_conversazioni, r.cosa_frenava, r.created_by)::text
   from public.conferma_proposta_instagram(
     '65650000-0000-4000-8000-000000000001', null,
     (select calcolato_il from public.report_proposte_instagram where id = '65650000-0000-4000-8000-000000000001'),
     null,
     '{"lead_in_target": "circa_meta", "qualita_conversazioni": "medie", "cosa_frenava": "Non hanno tempo"}'
   ) r),
  row('22222222-2222-4222-8222-222222222222'::uuid, '2026-10-08'::date, 53, 3, 16, 9, 4, 4,
      'circa_meta'::public.quota_in_target, 'medie'::public.qualita_conversazioni, 'Non hanno tempo',
      '22222222-2222-4222-8222-222222222222'::uuid)::text,
  'con il commento conferma: i numeri di Instagram e le sue risposte nello stesso report'
);
select is(
  (select row(p.stato, p.deciso_da, p.corretta, public.commento_da_scrivere(r.data, r.dm_outbound, r.dm_inbound, r.follow_up, r.conversazioni, r.lead_in_target, r.qualita_conversazioni, r.cosa_frenava))::text
   from public.report_proposte_instagram p
   join public.setter_daily_reports r on r.setter_id = p.setter_id and r.data = p.data
   where p.id = '65650000-0000-4000-8000-000000000001'),
  row('confermata'::public.proposta_stato, '22222222-2222-4222-8222-222222222222'::uuid, false, false)::text,
  'confermata da lui, e il giorno non ha più il commento da scrivere'
);
select throws_ok(
  $$ select public.conferma_proposta_instagram('65650000-0000-4000-8000-000000000001', null, null, null,
       '{"cosa_frenava": "Un altro motivo"}') $$,
  '22023', 'Questa proposta è già stata confermata', 'un secondo tocco trova la proposta decisa'
);
select is(
  (select cosa_frenava from public.setter_daily_reports
   where setter_id = '22222222-2222-4222-8222-222222222222' and data = '2026-10-08'),
  'Non hanno tempo',
  'e non scrive niente'
);

-- P2 (07/10, before the rule): confirmed without comment; a blank text is no answer
select is(
  (select row(r.dm_outbound, r.lead_in_target, r.cosa_frenava)::text
   from public.conferma_proposta_instagram('65650000-0000-4000-8000-000000000002', null, null, null,
     '{"cosa_frenava": "   "}') r),
  row(50, null::public.quota_in_target, null::text)::text,
  'un giorno prima del 08/10 si conferma senza commento, e un testo di soli spazi resta vuoto'
);

-- B (his comment already in the report): confirmed without p_commento, his answers stay
set local request.jwt.claims to '{"sub":"65656565-0000-4000-8000-00000000000b","role":"authenticated"}';
select is(
  (select row(r.dm_outbound, r.lead_in_target, r.qualita_conversazioni, r.cosa_frenava, r.domande_contenuti, r.note)::text
   from public.conferma_proposta_instagram(
     '65650000-0000-4000-8000-00000000000b', null,
     (select calcolato_il from public.report_proposte_instagram where id = '65650000-0000-4000-8000-00000000000b')) r),
  row(21, 'quasi_tutti'::public.quota_in_target, 'buone'::public.qualita_conversazioni, 'Il tempo',
      'La pancia', 'Nota di B')::text,
  'con il commento già nel report conferma senza ripeterlo, e le risposte restano'
);

-- C (only the first scale): recomputed after his page read it (as the nightly
-- job or "Ricalcola ieri" do: no session)
reset role;
set local request.jwt.claims to '{"role":"service_role"}';
update public.report_proposte_instagram set dm_outbound = 12, calcolato_il = now()
where id = '65650000-0000-4000-8000-00000000000c';
set local role authenticated;
set local request.jwt.claims to '{"sub":"65656565-0000-4000-8000-00000000000c","role":"authenticated"}';
select throws_ok(
  format('select public.conferma_proposta_instagram(%L, null, %L, null, %L)',
    '65650000-0000-4000-8000-00000000000c', now() - interval '10 minutes',
    '{"qualita_conversazioni": "buone", "cosa_frenava": "Ci devono pensare"}'),
  '22023', 'I numeri della proposta sono cambiati: ricontrollali e conferma di nuovo',
  'con il commento, ma sui numeri vecchi: rifiutata come prima'
);
select is(
  (select row(p.stato, r.qualita_conversazioni, r.cosa_frenava)::text
   from public.report_proposte_instagram p
   join public.setter_daily_reports r on r.setter_id = p.setter_id and r.data = p.data
   where p.id = '65650000-0000-4000-8000-00000000000c'),
  row('da_confermare'::public.proposta_stato, null::public.qualita_conversazioni, null::text)::text,
  'e le risposte non si scrivono'
);
select is(
  (select row(r.dm_outbound, r.lead_in_target, r.qualita_conversazioni, r.cosa_frenava, r.domande_contenuti, r.note)::text
   from public.conferma_proposta_instagram('65650000-0000-4000-8000-00000000000c', null, now(), null,
     '{"qualita_conversazioni": "buone", "cosa_frenava": "Ci devono pensare"}') r),
  row(12, 'circa_meta'::public.quota_in_target, 'buone'::public.qualita_conversazioni, 'Ci devono pensare',
      'Domande di C', 'Nota di C')::text,
  'riletti i numeri nuovi conferma: le risposte date completano quelle salvate, il resto resta'
);

-- A (no DM, no conversations from Instagram): nothing asked
set local request.jwt.claims to '{"sub":"65656565-0000-4000-8000-00000000000a","role":"authenticated"}';
select is(
  (select row(r.dm_totali, r.conversazioni, r.call_proposte, r.lead_in_target)::text
   from public.conferma_proposta_instagram('65650000-0000-4000-8000-00000000000a') r),
  row(0, 0, 2, null::public.quota_in_target)::text,
  'una giornata senza DM né conversazioni si conferma senza commento'
);

-- D: the numbers he confirms decide the activity
set local request.jwt.claims to '{"sub":"65656565-0000-4000-8000-00000000000d","role":"authenticated"}';
select lives_ok(
  $$ select public.conferma_proposta_instagram('65650000-0000-4000-8000-00000000000d',
       '{"dm_outbound": 0, "dm_inbound": 0, "follow_up": 0, "conversazioni": 0}') $$,
  'corretta a zero DM e zero conversazioni: niente commento'
);
select is(
  (select row(p.stato, p.corretta, r.dm_totali, r.conversazioni, r.lead_in_target)::text
   from public.report_proposte_instagram p
   join public.setter_daily_reports r on r.setter_id = p.setter_id and r.data = p.data
   where p.id = '65650000-0000-4000-8000-00000000000d'),
  row('confermata'::public.proposta_stato, true, 0, 0, 'pochi'::public.quota_in_target)::text,
  'confermata e corretta, sopra il report che aveva già'
);

-- ---------------------------------------------------------------------------
-- The setter keeps his numbers only with the comment
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"65656565-0000-4000-8000-00000000000e","role":"authenticated"}';
select throws_ok(
  $$ select public.scarta_proposta_instagram('65650000-0000-4000-8000-00000000000e') $$,
  '22023', 'Prima di tenere i tuoi numeri scrivi com''è andata la giornata: lead in target, qualità delle conversazioni e cosa frenava i lead.',
  'senza commento il setter non tiene i suoi numeri'
);
select throws_ok(
  $$ update public.report_proposte_instagram set stato = 'scartata' where id = '65650000-0000-4000-8000-00000000000e' $$,
  '22023', 'Prima di tenere i tuoi numeri scrivi com''è andata la giornata: lead in target, qualità delle conversazioni e cosa frenava i lead.',
  'nemmeno cambiando il solo stato'
);
select throws_ok(
  $$ select public.scarta_proposta_instagram('65650000-0000-4000-8000-00000000000e',
       '{"lead_in_target": "pochi", "qualita_conversazioni": "scarse"}') $$,
  '22023', 'Prima di tenere i tuoi numeri scrivi com''è andata la giornata: lead in target, qualità delle conversazioni e cosa frenava i lead.',
  'né con una risposta che manca'
);
select throws_ok(
  $$ select public.scarta_proposta_instagram('65650000-0000-4000-8000-00000000000e', '{"motivo": "x"}') $$,
  '22023', 'Questa risposta non si scrive da qui', 'le risposte si controllano anche scartando'
);
select is(
  (select row(p.stato, r.lead_in_target, r.qualita_conversazioni, r.cosa_frenava)::text
   from public.report_proposte_instagram p
   join public.setter_daily_reports r on r.setter_id = p.setter_id and r.data = p.data
   where p.id = '65650000-0000-4000-8000-00000000000e'),
  row('da_confermare'::public.proposta_stato, null::public.quota_in_target, null::public.qualita_conversazioni,
      null::text)::text,
  'rifiutata: la proposta resta da decidere e le risposte non si scrivono'
);
select lives_ok(
  $$ select public.scarta_proposta_instagram('65650000-0000-4000-8000-00000000000e',
       '{"lead_in_target": "pochi", "qualita_conversazioni": "scarse", "cosa_frenava": "Sono solo curiosi"}') $$,
  'con il commento tiene i suoi numeri'
);
select is(
  (select row(p.stato, p.deciso_da, r.dm_outbound, r.dm_inbound, r.follow_up, r.conversazioni, r.call_proposte,
              r.discovery_prenotate, r.lead_in_target, r.qualita_conversazioni, r.cosa_frenava)::text
   from public.report_proposte_instagram p
   join public.setter_daily_reports r on r.setter_id = p.setter_id and r.data = p.data
   where p.id = '65650000-0000-4000-8000-00000000000e'),
  row('scartata'::public.proposta_stato, '65656565-0000-4000-8000-00000000000e'::uuid, 30, 3, 3, 3, 3, 3,
      'pochi'::public.quota_in_target, 'scarse'::public.qualita_conversazioni, 'Sono solo curiosi')::text,
  'scartata da lui: i suoi numeri restano, con le sue risposte'
);

-- F (conversations only, a blank cosa_frenava): the plain update needs the comment, then passes
set local request.jwt.claims to '{"sub":"65656565-0000-4000-8000-00000000000f","role":"authenticated"}';
select throws_ok(
  $$ update public.report_proposte_instagram set stato = 'scartata' where id = '65650000-0000-4000-8000-00000000000f' $$,
  '22023', 'Prima di tenere i tuoi numeri scrivi com''è andata la giornata: lead in target, qualità delle conversazioni e cosa frenava i lead.',
  'con le sole conversazioni il commento serve, e cosa frenava i lead di soli spazi non basta'
);
select lives_ok(
  $$ update public.setter_daily_reports set cosa_frenava = 'Vogliono la palestra'
     where setter_id = '65656565-0000-4000-8000-00000000000f' and data = '2026-10-08' $$,
  'lo scrive in Oggi'
);
select lives_ok(
  $$ update public.report_proposte_instagram set stato = 'scartata' where id = '65650000-0000-4000-8000-00000000000f' $$,
  'e poi tiene i suoi numeri anche cambiando il solo stato'
);
select is(
  (select row(stato, deciso_da)::text from public.report_proposte_instagram where id = '65650000-0000-4000-8000-00000000000f'),
  row('scartata'::public.proposta_stato, '65656565-0000-4000-8000-00000000000f'::uuid)::text,
  'scartata da lui'
);

-- the seed setter, 06/10 (before the rule, no report): kept without comment
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select lives_ok(
  $$ select public.scarta_proposta_instagram('65650000-0000-4000-8000-000000000003') $$,
  'un giorno prima del 08/10 si scarta senza commento'
);
select is(
  (select count(*)::integer from public.setter_daily_reports
   where setter_id = '22222222-2222-4222-8222-222222222222' and data = '2026-10-06'),
  0,
  'e senza risposte non nasce nessun report'
);

-- A: without a report the answers given still land; {} writes nothing
set local request.jwt.claims to '{"sub":"65656565-0000-4000-8000-00000000000a","role":"authenticated"}';
select lives_ok(
  $$ select public.scarta_proposta_instagram('65650000-0000-4000-8000-0000000000a7',
       '{"lead_in_target": "circa_meta", "cosa_frenava": "  "}') $$,
  'scartando senza un report le risposte date si salvano'
);
select is(
  (select row(dm_outbound, conversazioni, lead_in_target, qualita_conversazioni, cosa_frenava, created_by)::text
   from public.setter_daily_reports
   where setter_id = '65656565-0000-4000-8000-00000000000a' and data = '2026-10-07'),
  row(0, 0, 'circa_meta'::public.quota_in_target, null::public.qualita_conversazioni, null::text,
      '65656565-0000-4000-8000-00000000000a'::uuid)::text,
  'in un report a zero col suo nome, come al primo tocco di Oggi'
);
select lives_ok(
  $$ select public.scarta_proposta_instagram('65650000-0000-4000-8000-0000000000a6', '{}') $$,
  'un commento vuoto non scrive niente'
);
select is(
  (select count(*)::integer from public.setter_daily_reports
   where setter_id = '65656565-0000-4000-8000-00000000000a' and data = '2026-10-06'),
  0,
  'e non fa nascere un report'
);

-- ---------------------------------------------------------------------------
-- The admin decides without the comment and never writes it
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok(
  $$ select public.conferma_proposta_instagram('65650000-0000-4000-8000-000000000011', null, null, null,
       '{"lead_in_target": "pochi", "qualita_conversazioni": "scarse", "cosa_frenava": "Il prezzo"}') $$,
  '42501', 'Il commento della giornata lo scrive il setter.', 'l''admin non scrive il commento confermando'
);
select throws_ok(
  $$ select public.scarta_proposta_instagram('65650000-0000-4000-8000-000000000013', '{"cosa_frenava": "Il prezzo"}') $$,
  '42501', 'Il commento della giornata lo scrive il setter.', 'né scartando'
);

-- 1 (no report): confirmed without a comment, the answers empty
select is(
  (select row(r.setter_id, r.data, r.dm_outbound, r.lead_in_target, r.qualita_conversazioni, r.cosa_frenava,
              r.created_by)::text
   from public.conferma_proposta_instagram(
     '65650000-0000-4000-8000-000000000011', null,
     (select calcolato_il from public.report_proposte_instagram where id = '65650000-0000-4000-8000-000000000011'),
     '{}') r),
  row('65656565-0000-4000-8000-000000000001'::uuid, '2026-10-08'::date, 40, null::public.quota_in_target,
      null::public.qualita_conversazioni, null::text, '11111111-1111-4111-8111-111111111111'::uuid)::text,
  'l''admin conferma un giorno dal 08/10 senza commento: le risposte restano da dare'
);
select is(
  (select row(p.stato, p.deciso_da, public.commento_da_scrivere(r.data, r.dm_outbound, r.dm_inbound, r.follow_up, r.conversazioni, r.lead_in_target, r.qualita_conversazioni, r.cosa_frenava))::text
   from public.report_proposte_instagram p
   join public.setter_daily_reports r on r.setter_id = p.setter_id and r.data = p.data
   where p.id = '65650000-0000-4000-8000-000000000011'),
  row('confermata'::public.proposta_stato, '11111111-1111-4111-8111-111111111111'::uuid, true)::text,
  'confermata dall''admin, e il commento resta da scrivere al setter'
);

-- 2 (half his comment): corrected over the numbers the card showed, his answers untouched
select is(
  (select row(r.dm_outbound, r.dm_inbound, r.lead_in_target, r.qualita_conversazioni, r.cosa_frenava,
              r.domande_contenuti)::text
   from public.conferma_proposta_instagram('65650000-0000-4000-8000-000000000012', '{"dm_outbound": 11}', null,
     '{"dm_outbound": 10, "dm_inbound": 1, "follow_up": 1, "conversazioni": 1, "call_proposte": 1, "discovery_prenotate": 1}') r),
  row(11, 1, 'quasi_tutti'::public.quota_in_target, null::public.qualita_conversazioni, 'Il prezzo',
      'Domande di 2')::text,
  'l''admin corregge sopra i numeri che ha visto: le risposte del setter restano come sono'
);

-- 3 (his numbers, no comment): kept by the admin
select lives_ok(
  $$ select public.scarta_proposta_instagram('65650000-0000-4000-8000-000000000013', '{}') $$,
  'l''admin tiene i numeri del setter senza commento'
);
select is(
  (select row(p.stato, p.deciso_da, r.dm_outbound, r.lead_in_target, r.cosa_frenava, public.commento_da_scrivere(r.data, r.dm_outbound, r.dm_inbound, r.follow_up, r.conversazioni, r.lead_in_target, r.qualita_conversazioni, r.cosa_frenava))::text
   from public.report_proposte_instagram p
   join public.setter_daily_reports r on r.setter_id = p.setter_id and r.data = p.data
   where p.id = '65650000-0000-4000-8000-000000000013'),
  row('scartata'::public.proposta_stato, '11111111-1111-4111-8111-111111111111'::uuid, 9,
      null::public.quota_in_target, null::text, true)::text,
  'scartata dall''admin: il report del setter resta com''era, col commento da scrivere'
);

-- the first decision wins, as before
select throws_ok(
  $$ select public.conferma_proposta_instagram('65650000-0000-4000-8000-00000000000e') $$,
  '22023', 'Questa proposta è già stata scartata', 'l''admin non decide quella che il setter ha già deciso'
);
set local request.jwt.claims to '{"sub":"65656565-0000-4000-8000-000000000001","role":"authenticated"}';
select throws_ok(
  $$ select public.scarta_proposta_instagram('65650000-0000-4000-8000-000000000011',
       '{"lead_in_target": "pochi", "qualita_conversazioni": "medie", "cosa_frenava": "Il tempo"}') $$,
  '22023', 'Questa proposta è già stata confermata', 'né il setter quella che l''admin ha già deciso'
);
select is(
  (select row(lead_in_target, qualita_conversazioni, cosa_frenava)::text from public.setter_daily_reports
   where setter_id = '65656565-0000-4000-8000-000000000001' and data = '2026-10-08'),
  row(null::public.quota_in_target, null::public.qualita_conversazioni, null::text)::text,
  'e il suo commento non si scrive così'
);
select is(
  (select array_agg(data) from public.setter_daily_reports r where public.commento_da_scrivere(r.data, r.dm_outbound, r.dm_inbound, r.follow_up, r.conversazioni, r.lead_in_target, r.qualita_conversazioni, r.cosa_frenava)),
  array['2026-10-08'::date],
  'il setter trova il giorno col commento da scrivere'
);
select lives_ok(
  $$ update public.setter_daily_reports
     set lead_in_target = 'pochi', qualita_conversazioni = 'medie', cosa_frenava = 'Il tempo'
     where setter_id = '65656565-0000-4000-8000-000000000001' and data = '2026-10-08' $$,
  'lo scrive in Oggi'
);
select is(
  (select count(*)::integer from public.setter_daily_reports r where public.commento_da_scrivere(r.data, r.dm_outbound, r.dm_inbound, r.follow_up, r.conversazioni, r.lead_in_target, r.qualita_conversazioni, r.cosa_frenava)),
  0,
  'e non ha più commenti da scrivere'
);

-- ---------------------------------------------------------------------------
-- Other roles: as before
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select throws_ok(
  $$ select public.conferma_proposta_instagram('65650000-0000-4000-8000-000000000012', null, null, null,
       '{"cosa_frenava": "x"}') $$,
  '42501', 'La proposta la decidono il setter che lavora i DM e l''admin', 'il closer non decide, nemmeno col commento'
);
select throws_ok(
  $$ select public.scarta_proposta_instagram('65650000-0000-4000-8000-000000000012', '{"cosa_frenava": "x"}') $$,
  '42501', 'La proposta la decidono il setter che lavora i DM e l''admin', 'né scarta'
);

select * from finish();
rollback;
