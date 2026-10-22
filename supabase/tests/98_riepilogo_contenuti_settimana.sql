-- The weekend email of the contents: leads of the week in and out of target, from the Insight's
-- chats, the best contents and the Fathom side, summed in SQL for the cron. Only the service
-- role reads it; nothing in it names a person.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(17);

select ok(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.proname = 'riepilogo_contenuti_settimana'),
  'la RPC è security definer con search_path vuoto'
);
select ok(
  not has_function_privilege('anon', 'public.riepilogo_contenuti_settimana(date, date)', 'execute'),
  'anon non la esegue'
);
select ok(
  not has_function_privilege('authenticated', 'public.riepilogo_contenuti_settimana(date, date)', 'execute'),
  'nessun utente la esegue, nemmeno l''admin: è del cron'
);
select ok(
  has_function_privilege('service_role', 'public.riepilogo_contenuti_settimana(date, date)', 'execute'),
  'il service role (il cron) la esegue'
);

select throws_ok(
  $$select public.riepilogo_contenuti_settimana('2031-03-09', '2031-03-03')$$,
  '22023', 'Periodo non valido', 'un periodo al contrario è rifiutato'
);
select throws_ok(
  $$select public.riepilogo_contenuti_settimana('2031-01-01', '2031-03-09')$$,
  '22023', 'Periodo non valido', 'oltre 31 giorni è rifiutato'
);

-- A post of Dany's and the chats of the week 03/03 to 09/03/2031 (far from the seed's days)
insert into public.instagram_contenuti (media_id, shortcode, permalink, media_type, media_product_type, reel,
  pubblicato_il, didascalia, letto_il)
values ('17990000000000001', 'SetCont001', 'https://www.instagram.com/reel/SetCont001/', 'VIDEO', 'REELS', true,
  '2031-03-04 17:00+01', E'Trazioni da zero\nCome iniziare', now());

insert into public.instagram_esclusi (username, motivo) values ('amico.escluso', 'prova');

insert into public.insight_chat (canale, conversazione_id, username, utente_id, nome, messaggi, completa,
  origine_tipo, origine_shortcode, origine_il, origine_giorno, ultimo_target, non_lead, minore_14)
values
  -- three leads from the post: two in target, one outside
  ('instagram', 'c1', 'lead.uno', null, 'Uno', '[]', false,
   'condivisione', 'SetCont001', '2031-03-04 18:00+01', '2031-03-04', 'si', false, false),
  ('instagram', 'c2', 'lead.due', null, 'Due', '[]', false,
   'parola_chiave', 'SetCont001', '2031-03-05 10:00+01', '2031-03-05', 'si', false, false),
  ('instagram', 'c3', 'lead.tre', null, 'Tre', '[]', false,
   'condivisione', 'SetCont001', '2031-03-06 10:00+01', '2031-03-06', 'no', false, false),
  -- a story reply with no post, still to verify
  ('instagram', 'c4', 'lead.quattro', null, 'Quattro', '[]', false,
   'storia', null, '2031-03-07 10:00+01', '2031-03-07', 'da verificare', false, false),
  -- no origin found, chat read from its start: arrival from the first message
  ('messenger', 'c5', null, '5550001', 'Cinque',
   '[{"da":"lead","il":"2031-03-08T09:00:00Z","testo":"ciao","codici":[],"storia":false}]', true,
   null, null, null, null, 'si', false, false),
  -- out of the week
  ('instagram', 'c6', 'lead.sei', null, 'Sei', '[]', false,
   'condivisione', 'SetCont001', '2031-03-02 10:00+01', '2031-03-02', 'si', false, false),
  -- never counted: a non-lead, an under-14 chat and an excluded account
  ('instagram', 'c7', 'non.lead', null, 'Sette', '[]', false,
   'condivisione', 'SetCont001', '2031-03-05 11:00+01', '2031-03-05', 'si', true, false),
  ('instagram', 'c8', 'minore', null, 'Otto', '[]', false,
   'condivisione', 'SetCont001', '2031-03-05 12:00+01', '2031-03-05', 'si', false, true),
  ('instagram', 'c9', 'amico.escluso', null, 'Nove', '[]', false,
   'condivisione', 'SetCont001', '2031-03-05 13:00+01', '2031-03-05', 'si', false, false);

create temp table r as select public.riepilogo_contenuti_settimana('2031-03-03', '2031-03-09') as j;

select is((select (j -> 'lead' ->> 'totale')::int from r), 5, 'cinque lead nella settimana (non lead, minori, escluse e fuori settimana non contano)');
select is((select (j -> 'lead' ->> 'in_target')::int from r), 3, 'tre in target');
select is((select (j -> 'lead' ->> 'fuori_target')::int from r), 1, 'uno fuori target');
select is((select (j -> 'lead' ->> 'da_verificare')::int from r), 1, 'uno da verificare');
select is((select (j -> 'lead' ->> 'da_un_contenuto')::int from r), 3, 'tre arrivano da un contenuto');
select is((select (j -> 'lead' ->> 'da_storie')::int from r), 1, 'una risposta a una storia senza post');

select is((select j -> 'contenuti' -> 'migliori' -> 0 ->> 'in_target' from r), '2', 'il contenuto migliore ha due lead in target');
select is((select j -> 'contenuti' -> 'migliori' -> 0 ->> 'lead' from r), '3', 'e tre lead in tutto');
select is((select j -> 'contenuti' -> 'migliori' -> 0 ->> 'titolo' from r), 'Trazioni da zero', 'il titolo viene dalla didascalia quando non è nel piano');

select is(
  (select jsonb_typeof(j -> 'fathom' -> 'obiezioni') from r), 'array',
  'le obiezioni di Fathom sono sempre un elenco, anche vuoto'
);

select is(
  (select count(*)::int from jsonb_object_keys((select j from r)) k
   where k in ('nome', 'cognome', 'email', 'telefono', 'username', 'handle')),
  0, 'nessuna chiave con dati di una persona'
);

select * from finish();
rollback;
