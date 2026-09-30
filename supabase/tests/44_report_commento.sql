-- What the leads say, for marketing (30/09/2026).
-- The setter's comment on his day: two scales and two texts on
-- setter_daily_reports, written with the same RLS as the numbers (the setter
-- only his own rows), and read for marketing by the admin alone, counted in
-- SQL: days per level of each scale, then the days with something written.
-- The closer's side: the reason for not closing (calls.obiezione_principale)
-- of the held calls ending in follow-up or persa, read by the admin alone.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(35);

-- ---------------------------------------------------------------------------
-- Columns and constraints
-- ---------------------------------------------------------------------------
select col_type_is('public', 'setter_daily_reports', 'lead_in_target', 'quota_in_target',
  'lead in target è la scala a tre livelli');
select col_type_is('public', 'setter_daily_reports', 'qualita_conversazioni', 'qualita_conversazioni',
  'la qualità delle conversazioni è la scala a tre livelli');
select col_type_is('public', 'setter_daily_reports', 'cosa_frenava', 'text', 'cosa frenava i lead è testo');
select col_type_is('public', 'setter_daily_reports', 'domande_contenuti', 'text', 'domande e contenuti è testo');
select enum_has_labels('public', 'quota_in_target', array['quasi_tutti', 'circa_meta', 'pochi'],
  'quasi tutti, circa metà, pochi, in quest''ordine');
select enum_has_labels('public', 'qualita_conversazioni', array['buone', 'medie', 'scarse'],
  'buone, medie, scarse, in quest''ordine');
select col_is_null('public', 'setter_daily_reports', 'lead_in_target',
  'una scala senza risposta resta vuota: il report si salva lo stesso');

select throws_ok(
  $$ insert into public.setter_daily_reports (setter_id, data, cosa_frenava)
     values ('22222222-2222-4222-8222-222222222222', '2021-02-01', repeat('x', 1001)) $$,
  '23514', null,
  'cosa frenava i lead: al massimo 1000 caratteri'
);
select throws_ok(
  $$ insert into public.setter_daily_reports (setter_id, data, domande_contenuti)
     values ('22222222-2222-4222-8222-222222222222', '2021-02-01', repeat('x', 1001)) $$,
  '23514', null,
  'domande e contenuti: al massimo 1000 caratteri'
);
select throws_ok(
  $$ insert into public.setter_daily_reports (setter_id, data, lead_in_target)
     values ('22222222-2222-4222-8222-222222222222', '2021-02-01', 'tutti') $$,
  '22P02', null,
  'un livello che non esiste non entra'
);

-- The RPCs: invoker rights, empty search_path, no anon
select is(
  (select count(*)::int
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('commenti_setter_periodo', 'motivi_non_chiusura_periodo')
     and not p.prosecdef and p.proconfig @> array['search_path=""']),
  2,
  'le due RPC sono security invoker con search_path vuoto'
);
select ok(
  not has_function_privilege('anon', 'public.commenti_setter_periodo(date, date, uuid, integer)', 'execute')
  and not has_function_privilege('anon', 'public.motivi_non_chiusura_periodo(date, date, uuid, integer)', 'execute'),
  'anon non le esegue'
);

-- ---------------------------------------------------------------------------
-- Fixtures: March 2021, far from the seed. The seed setter and the admin (who
-- does setting too) answer on different days; one blank objection is no text.
-- ---------------------------------------------------------------------------
insert into public.setter_daily_reports
  (setter_id, data, dm_outbound, lead_in_target, qualita_conversazioni, cosa_frenava, domande_contenuti, note)
values
  ('22222222-2222-4222-8222-222222222222', '2021-03-01', 10, 'quasi_tutti', 'buone', 'Costa troppo', null, null),
  ('22222222-2222-4222-8222-222222222222', '2021-03-02', 8, 'quasi_tutti', 'medie', null, null, null),
  ('22222222-2222-4222-8222-222222222222', '2021-03-03', 5, 'pochi', null, null, 'Serve la palestra?', null),
  ('22222222-2222-4222-8222-222222222222', '2021-03-04', 4, null, null, null, null, 'Giornata corta'),
  ('22222222-2222-4222-8222-222222222222', '2021-03-05', 6, 'circa_meta', 'scarse', '   ', null, null),
  ('11111111-1111-4111-8111-111111111111', '2021-03-02', 3, 'circa_meta', 'buone', 'Ci devo pensare', null, null),
  -- outside the period
  ('22222222-2222-4222-8222-222222222222', '2021-04-01', 9, 'quasi_tutti', 'buone', 'Fuori periodo', null, null);

-- The closers' side: March 2021 too. Rome days, not UTC: 2021-03-08 23:30Z is
-- the 9th in Rome, 2021-03-31 22:30Z (summer time) is already April.
insert into public.leads (id, nome, setter_id, fonte) values
  ('abab0000-0000-4000-8000-000000000001', 'Mario Persa', '22222222-2222-4222-8222-222222222222', 'dm_inbound'),
  ('abab0000-0000-4000-8000-000000000002', 'Luca Follow', '11111111-1111-4111-8111-111111111111', 'dm_outbound'),
  ('abab0000-0000-4000-8000-000000000003', 'Paolo Chiusa', '22222222-2222-4222-8222-222222222222', 'dm_inbound');

insert into public.calls
  (id, lead_id, setter_id, closer_id, tipo, programmata_il, stato, qualificata, esito, obiezione_principale, note_closer)
values
  -- in: a lost call with its reason
  ('acac0000-0000-4000-8000-000000000001', 'abab0000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333', 'discovery', '2021-03-05 09:00:00+00', 'svolta', true, 'persa', ' Fuori budget ', null),
  -- in: a follow-up with the closer's notes only, booked by the admin, on the 9th in Rome
  ('acac0000-0000-4000-8000-000000000002', 'abab0000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111',
   '11111111-1111-4111-8111-111111111111', 'discovery', '2021-03-08 23:30:00+00', 'svolta', true, 'follow_up', null, 'Richiamare a gennaio'),
  -- out: closed
  ('acac0000-0000-4000-8000-000000000003', 'abab0000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333', 'discovery', '2021-03-10 09:00:00+00', 'svolta', true, 'chiusa', null, null),
  -- out: lost, nothing written but blanks
  ('acac0000-0000-4000-8000-000000000004', 'abab0000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333', 'discovery', '2021-03-11 09:00:00+00', 'svolta', false, 'persa', '   ', ' '),
  -- out: not held, whatever is written
  ('acac0000-0000-4000-8000-000000000005', 'abab0000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333', 'discovery', '2021-03-12 09:00:00+00', 'no_show', null, null, 'Non si è presentato', null),
  -- out: April in Rome
  ('acac0000-0000-4000-8000-000000000006', 'abab0000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333', 'discovery', '2021-03-31 22:30:00+00', 'svolta', true, 'persa', 'Fuori periodo', null);

-- with ordinality: the order the function returns is part of what is tested
create temp table tutti as
select * from public.commenti_setter_periodo('2021-03-01', '2021-03-31') with ordinality limit 0;
create temp table solo_setter as select * from tutti limit 0;
create temp table nessuno as select * from tutti limit 0;
create temp table motivi as
select * from public.motivi_non_chiusura_periodo('2021-03-01', '2021-03-31') with ordinality limit 0;
create temp table motivi_setter as select * from motivi limit 0;
grant all on tutti, solo_setter, nessuno, motivi, motivi_setter to authenticated;

set local role authenticated;

-- ---------------------------------------------------------------------------
-- The admin reads it
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
insert into tutti select * from public.commenti_setter_periodo('2021-03-01', '2021-03-31') with ordinality;
insert into solo_setter
select * from public.commenti_setter_periodo('2021-03-01', '2021-03-31', '22222222-2222-4222-8222-222222222222') with ordinality;
insert into nessuno
select * from public.commenti_setter_periodo('2021-03-01', '2021-03-31', '33333333-3333-4333-8333-333333333333') with ordinality;
insert into motivi select * from public.motivi_non_chiusura_periodo('2021-03-01', '2021-03-31') with ordinality;
insert into motivi_setter
select * from public.motivi_non_chiusura_periodo('2021-03-01', '2021-03-31', '22222222-2222-4222-8222-222222222222') with ordinality;

select is(
  (select array_agg(scala || ':' || livello || '=' || giorni || '/' || su_giorni order by ordinality)
   from tutti where tipo = 'scala'),
  array[
    'lead_in_target:quasi_tutti=2/5', 'lead_in_target:circa_meta=2/5', 'lead_in_target:pochi=1/5',
    'qualita_conversazioni:buone=2/4', 'qualita_conversazioni:medie=1/4', 'qualita_conversazioni:scarse=1/4'
  ],
  'ogni livello di ogni scala, in ordine: i giorni a quel livello su quelli che hanno risposto'
);
select is(
  (select quota from tutti where tipo = 'scala' and scala = 'lead_in_target' and livello = 'quasi_tutti'),
  0.4000::numeric,
  'la quota la calcola il database: 2 giorni su 5'
);
select is(
  (select array_agg(data::text || ' ' || setter order by ordinality) from tutti where tipo = 'giorno'),
  array[
    '2021-03-04 Loris Setter', '2021-03-03 Loris Setter', '2021-03-02 Dany Montagnolo', '2021-03-01 Loris Setter'
  ],
  'i giorni con qualcosa di scritto, dal più recente; una risposta di soli spazi non è un testo'
);
select is(
  (select row(lead_in_target, qualita_conversazioni, cosa_frenava, domande_contenuti, note)::text
   from tutti where tipo = 'giorno' and data = '2021-03-01'),
  row('quasi_tutti'::public.quota_in_target, 'buone'::public.qualita_conversazioni,
      'Costa troppo', null::text, null::text)::text,
  'ogni giorno porta le due scale e i testi'
);
select is(
  (select count(*)::int from tutti where cosa_frenava = 'Fuori periodo'),
  0,
  'solo il periodo scelto'
);
select ok(
  (select bool_and(tipo <> 'scala') from tutti where ordinality > 6),
  'prima le scale, poi i giorni'
);

select is(
  (select array_agg(livello || '=' || giorni || '/' || su_giorni order by ordinality)
   from solo_setter where tipo = 'scala'),
  array['quasi_tutti=2/4', 'circa_meta=1/4', 'pochi=1/4', 'buone=1/3', 'medie=1/3', 'scarse=1/3'],
  'con un setter scelto conta solo i suoi giorni'
);
select is(
  (select count(*)::int from solo_setter where tipo = 'giorno' and setter <> 'Loris Setter'),
  0,
  'e mostra solo i suoi commenti'
);
select is(
  (select array_agg(giorni::text || '/' || su_giorni || '/' || coalesce(quota::text, 'null') order by ordinality)
   from nessuno where tipo = 'scala'),
  array['0/0/null', '0/0/null', '0/0/null', '0/0/null', '0/0/null', '0/0/null'],
  'nessuna risposta: zero giorni e nessuna quota, mai una divisione per zero'
);
select is(
  (select count(*)::int from public.commenti_setter_periodo('2021-03-01', '2021-03-31', null, 1) where tipo = 'giorno'),
  1,
  'p_limite ferma l''elenco dei giorni'
);

-- The closers' reasons for not closing
select is(
  (select array_agg(data::text || ' ' || lead || ' ' || esito || ' ' || coalesce(motivo, '-') || ' ' || coalesce(note_closer, '-') order by ordinality)
   from motivi),
  array[
    '2021-03-09 Luca Follow follow_up - Richiamare a gennaio',
    '2021-03-05 Mario Persa persa Fuori budget -'
  ],
  'le call svolte non chiuse con qualcosa di scritto, per giorno di Roma, dalla più recente; niente chiuse, no show, spazi o fuori periodo'
);
select is(
  (select row(closer, qualificata)::text from motivi where lead = 'Mario Persa'),
  row('Lorenzo Closer', true)::text,
  'ogni call porta il closer e la qualifica'
);
select is(
  (select array_agg(lead order by ordinality) from motivi_setter),
  array['Mario Persa'],
  'con un setter scelto: le call che ha fissato lui'
);
select is(
  (select count(*)::int from public.motivi_non_chiusura_periodo('2021-03-01', '2021-03-31', null, 1)),
  1,
  'p_limite ferma l''elenco delle call'
);

-- ---------------------------------------------------------------------------
-- Nobody else reads it
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok(
  $$ select * from public.commenti_setter_periodo('2021-03-01', '2021-03-31', '22222222-2222-4222-8222-222222222222') $$,
  '42501', null,
  'il setter non legge i commenti per il marketing, nemmeno i suoi'
);
select throws_ok(
  $$ select * from public.motivi_non_chiusura_periodo('2021-03-01', '2021-03-31', '22222222-2222-4222-8222-222222222222') $$,
  '42501', null,
  'né i motivi di non chiusura delle sue call'
);
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select throws_ok(
  $$ select * from public.commenti_setter_periodo('2021-03-01', '2021-03-31') $$,
  '42501', null,
  'il closer nemmeno'
);
select throws_ok(
  $$ select * from public.motivi_non_chiusura_periodo('2021-03-01', '2021-03-31') $$,
  '42501', null,
  'e nemmeno i motivi di non chiusura, anche delle sue call'
);

-- Old calls without a reason stay editable: the requirement is the app's schema, not a constraint
update public.calls set note_closer = 'Aggiornata dal closer'
where id = 'acac0000-0000-4000-8000-000000000004';
select is(
  (select note_closer from public.calls where id = 'acac0000-0000-4000-8000-000000000004'),
  'Aggiornata dal closer',
  'una call persa senza motivo si aggiorna ancora'
);

-- ---------------------------------------------------------------------------
-- The setter writes his own answers only
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
insert into public.setter_daily_reports (setter_id, data, conversazioni, lead_in_target, qualita_conversazioni, cosa_frenava)
values ('22222222-2222-4222-8222-222222222222', '2021-03-10', 4, 'pochi', 'medie', 'Non ho tempo')
on conflict (setter_id, data) do update
  set lead_in_target = excluded.lead_in_target,
      qualita_conversazioni = excluded.qualita_conversazioni,
      cosa_frenava = excluded.cosa_frenava;
select is(
  (select row(lead_in_target, qualita_conversazioni, cosa_frenava)::text from public.setter_daily_reports
   where setter_id = '22222222-2222-4222-8222-222222222222' and data = '2021-03-10'),
  row('pochi'::public.quota_in_target, 'medie'::public.qualita_conversazioni, 'Non ho tempo')::text,
  'il setter scrive le risposte del suo giorno, con i numeri'
);

-- someone else's day: invisible, so the update touches nothing
update public.setter_daily_reports set cosa_frenava = 'Scritto dal setter'
where setter_id = '11111111-1111-4111-8111-111111111111' and data = '2021-03-02';
select throws_ok(
  $$ insert into public.setter_daily_reports (setter_id, data, lead_in_target)
     values ('11111111-1111-4111-8111-111111111111', '2021-03-11', 'pochi') $$,
  '42501', null,
  'non scrive il giorno di un altro'
);

set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(
  (select cosa_frenava from public.setter_daily_reports
   where setter_id = '11111111-1111-4111-8111-111111111111' and data = '2021-03-02'),
  'Ci devo pensare',
  'le risposte di un altro restano quelle'
);

-- The admin corrects any day, answers included
update public.setter_daily_reports set qualita_conversazioni = 'buone', domande_contenuti = 'Dopo il reel sulla pancia'
where setter_id = '22222222-2222-4222-8222-222222222222' and data = '2021-03-10';
select is(
  (select row(qualita_conversazioni, domande_contenuti)::text from public.setter_daily_reports
   where setter_id = '22222222-2222-4222-8222-222222222222' and data = '2021-03-10'),
  row('buone'::public.qualita_conversazioni, 'Dopo il reel sulla pancia')::text,
  'l''admin corregge le risposte di un setter'
);

select * from finish();
rollback;
