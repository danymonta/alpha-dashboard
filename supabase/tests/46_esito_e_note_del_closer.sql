-- Only the closer records how a call went, and his notes are his (Dany,
-- 30/09/2026). The setter reads stato, esito, qualificata, the reason for not
-- closing and note_closer on the calls he booked, and never writes them; he
-- still books, moves and reassigns his calls and writes his own note. The
-- closer and the admin write the outcome; the closer reads the setter's note
-- and moves his call without rewriting it. "Dalle call" lists the closer's
-- words, never the setter's note.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(51);

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
select col_type_is('public', 'calls', 'note_closer', 'text', 'le note del closer sono una colonna di calls');
select col_is_null('public', 'calls', 'note_closer', 'facoltative');
select has_trigger('public', 'calls', 'calls_esito_solo_closer', 'un trigger protegge esito e note del closer');
select hasnt_trigger('public', 'calls', 'calls_motivo_solo_closer', 'e sostituisce quello del solo motivo');
select ok(
  (select not p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'public.calls_esito_solo_closer()'::regprocedure),
  'il trigger gira coi permessi di chi scrive, search_path vuoto'
);
select ok(
  not has_function_privilege('anon', 'public.dettagli_call(uuid, text, public.call_performance, uuid, numeric, text)', 'execute')
  and has_function_privilege('authenticated', 'public.dettagli_call(uuid, text, public.call_performance, uuid, numeric, text)', 'execute')
  and not exists (
    select 1 from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname = 'dettagli_call' and p.pronargs = 5
  ),
  'dettagli_call ha una sola firma, con le note del closer, senza anon'
);

-- ---------------------------------------------------------------------------
-- Fixtures: May 2019, far from the seed. Seed setter 2222, closer 3333, admin 1111.
-- ---------------------------------------------------------------------------
insert into public.leads (id, nome, setter_id, fonte) values
  ('46460000-0000-4000-8000-000000000001', 'Lead Tenuta', '22222222-2222-4222-8222-222222222222', 'dm_inbound'),
  ('46460000-0000-4000-8000-000000000002', 'Lead Da Fare', '22222222-2222-4222-8222-222222222222', 'dm_outbound'),
  ('46460000-0000-4000-8000-000000000003', 'Lead Solo Setter', '22222222-2222-4222-8222-222222222222', 'dm_inbound'),
  ('46460000-0000-4000-8000-000000000004', 'Lead Solo Note', '22222222-2222-4222-8222-222222222222', 'dm_inbound');

-- no session: seeds and imports write every column
select lives_ok(
  $$ insert into public.calls
       (id, lead_id, setter_id, closer_id, tipo, programmata_il, stato, qualificata, esito, obiezione_principale, note, note_closer)
     values
       -- held and lost: the closer's reason and notes, the setter's note
       ('46461111-0000-4000-8000-000000000001', '46460000-0000-4000-8000-000000000001',
        '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'discovery',
        '2019-05-10 09:00:00+00', 'svolta', true, 'persa', 'Fuori budget', 'Nota del setter', 'Richiamare a giugno'),
       -- still to be held
       ('46461111-0000-4000-8000-000000000002', '46460000-0000-4000-8000-000000000002',
        '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'discovery',
        '2019-05-12 09:00:00+00', 'programmata', null, null, null, 'Da confermare', null),
       -- held, not closed, only the setter wrote: not a closer's word
       ('46461111-0000-4000-8000-000000000003', '46460000-0000-4000-8000-000000000003',
        '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'discovery',
        '2019-05-14 09:00:00+00', 'svolta', false, 'follow_up', null, 'Solo la nota del setter', null),
       -- held, not closed, only the closer's notes (spaces around)
       ('46461111-0000-4000-8000-000000000004', '46460000-0000-4000-8000-000000000004',
        '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'discovery',
        '2019-05-16 09:00:00+00', 'svolta', true, 'follow_up', '  ', null, ' Vuole vedere altri contenuti ') $$,
  'senza sessione (seed, import) si scrivono tutte le colonne'
);

select throws_ok(
  $$ update public.calls set note_closer = repeat('x', 2001) where id = '46461111-0000-4000-8000-000000000001' $$,
  '23514', null,
  'le note del closer: al massimo 2000 caratteri'
);

create temp table motivi as
select * from public.motivi_non_chiusura_periodo('2019-05-01', '2019-05-31') limit 0;
grant all on motivi to authenticated;

set local role authenticated;

-- ---------------------------------------------------------------------------
-- The setter who booked the calls
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select is(
  (select row(stato, esito, qualificata, obiezione_principale, note_closer)::text
   from public.calls where id = '46461111-0000-4000-8000-000000000001'),
  row('svolta'::public.call_status, 'persa'::public.call_outcome, true, 'Fuori budget', 'Richiamare a giugno')::text,
  'il setter legge esito, qualifica, motivo e note del closer delle call che ha fissato'
);

select throws_ok(
  $$ update public.calls set stato = 'no_show' where id = '46461111-0000-4000-8000-000000000002' $$,
  '42501', 'L''esito della call e le note del closer li scrive il closer',
  'il setter non cambia lo stato'
);
select throws_ok(
  $$ update public.calls set stato = 'svolta', qualificata = true, esito = 'chiusa'
     where id = '46461111-0000-4000-8000-000000000002' $$,
  '42501', null,
  'non registra l''esito'
);
select throws_ok(
  $$ update public.calls set esito = 'follow_up' where id = '46461111-0000-4000-8000-000000000001' $$,
  '42501', null,
  'non corregge l''esito'
);
select throws_ok(
  $$ update public.calls set qualificata = false where id = '46461111-0000-4000-8000-000000000001' $$,
  '42501', null,
  'non corregge la qualifica'
);
select throws_ok(
  $$ update public.calls set obiezione_principale = 'Scritto dal setter' where id = '46461111-0000-4000-8000-000000000001' $$,
  '42501', null,
  'non cambia il motivo di non chiusura'
);
select throws_ok(
  $$ update public.calls set note_closer = 'Scritto dal setter' where id = '46461111-0000-4000-8000-000000000001' $$,
  '42501', null,
  'non cambia le note del closer'
);
select throws_ok(
  $$ update public.calls set note_closer = null where id = '46461111-0000-4000-8000-000000000001' $$,
  '42501', null,
  'e non le cancella'
);
select throws_ok(
  $$ update public.calls set stato = 'programmata', esito = null, qualificata = null, obiezione_principale = null
     where id = '46461111-0000-4000-8000-000000000001' $$,
  '42501', null,
  'non annulla l''esito'
);

select lives_ok(
  $$ update public.calls
     set programmata_il = '2019-05-13 10:00:00+00',
         closer_id = '11111111-1111-4111-8111-111111111111',
         note = 'Spostata dal setter',
         stato = stato, esito = esito, note_closer = note_closer
     where id = '46461111-0000-4000-8000-000000000002' $$,
  'sposta la call, la riassegna e scrive le sue note (le colonne del closer riscritte uguali passano)'
);
select lives_ok(
  $$ select public.modifica_call('46461111-0000-4000-8000-000000000002', 'discovery',
       '2019-05-15', '18:30', '33333333-3333-4333-8333-333333333333', 'Riassegnata a Lorenzo') $$,
  'con modifica_call sposta, riassegna e scrive le note del setter'
);
select is(
  (select row(programmata_il, closer_id, note, stato)::text
   from public.calls where id = '46461111-0000-4000-8000-000000000002'),
  row('2019-05-15 16:30:00+00'::timestamptz, '33333333-3333-4333-8333-333333333333'::uuid,
      'Riassegnata a Lorenzo', 'programmata'::public.call_status)::text,
  'data, closer e note del setter salvati, lo stato non si tocca'
);
select lives_ok(
  $$ select public.modifica_call('46461111-0000-4000-8000-000000000001', 'discovery',
       '2019-05-10', '11:00', '33333333-3333-4333-8333-333333333333', 'Nota del setter, corretta') $$,
  'anche su una call già svolta corregge le sue note'
);
select is(
  (select row(note, note_closer, obiezione_principale, esito)::text
   from public.calls where id = '46461111-0000-4000-8000-000000000001'),
  row('Nota del setter, corretta', 'Richiamare a giugno', 'Fuori budget', 'persa'::public.call_outcome)::text,
  'e l''esito e le parole del closer restano come sono'
);
select throws_ok(
  $$ select public.dettagli_call('46461111-0000-4000-8000-000000000001', null, null, null, null, 'Dal setter') $$,
  '42501', 'I dettagli della call li registra chi la fa',
  'i dettagli della call, note del closer comprese, non sono suoi'
);

-- creating a call: always still to be held, with nothing of the closer's
select throws_ok(
  $$ insert into public.calls (lead_id, setter_id, closer_id, tipo, programmata_il, stato)
     values ('46460000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
       '33333333-3333-4333-8333-333333333333', 'discovery', '2019-05-20 09:00:00+00', 'no_show') $$,
  '42501', null,
  'il setter non crea una call con uno stato diverso da programmata'
);
select throws_ok(
  $$ insert into public.calls (lead_id, setter_id, closer_id, tipo, programmata_il, stato, qualificata, esito)
     values ('46460000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
       '33333333-3333-4333-8333-333333333333', 'discovery', '2019-05-20 09:00:00+00', 'svolta', true, 'chiusa') $$,
  '42501', null,
  'né già svolta con un esito'
);
select throws_ok(
  $$ insert into public.calls (lead_id, setter_id, closer_id, tipo, programmata_il, qualificata)
     values ('46460000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
       '33333333-3333-4333-8333-333333333333', 'discovery', '2019-05-20 09:00:00+00', false) $$,
  '42501', null,
  'né con la qualifica'
);
select throws_ok(
  $$ insert into public.calls (lead_id, setter_id, closer_id, tipo, programmata_il, obiezione_principale)
     values ('46460000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
       '33333333-3333-4333-8333-333333333333', 'discovery', '2019-05-20 09:00:00+00', 'Fuori budget') $$,
  '42501', null,
  'né con il motivo di non chiusura'
);
select throws_ok(
  $$ insert into public.calls (lead_id, setter_id, closer_id, tipo, programmata_il, note_closer)
     values ('46460000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
       '33333333-3333-4333-8333-333333333333', 'discovery', '2019-05-20 09:00:00+00', 'Scritto dal setter') $$,
  '42501', null,
  'né con le note del closer'
);
select lives_ok(
  $$ insert into public.calls (lead_id, setter_id, closer_id, tipo, programmata_il, stato, note)
     values ('46460000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
       '33333333-3333-4333-8333-333333333333', 'discovery', '2019-05-20 09:00:00+00', 'programmata', 'Nota del setter') $$,
  'una call da fare con le sue note sì'
);
select lives_ok(
  $$ select * from public.fissa_call('Lead Fissato', 'dm_inbound', 'discovery', '2019-05-21', '10:00',
       '33333333-3333-4333-8333-333333333333', '@lead.fissato.46') $$,
  'e fissa_call funziona come prima'
);

-- ---------------------------------------------------------------------------
-- The closer of the calls
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

select is(
  (select note from public.calls where id = '46461111-0000-4000-8000-000000000002'),
  'Riassegnata a Lorenzo',
  'il closer legge le note del setter'
);
select lives_ok(
  $$ update public.calls
     set stato = 'svolta', qualificata = true, esito = 'follow_up',
         obiezione_principale = 'Deve parlarne con la compagna', note_closer = 'Richiamare lunedì'
     where id = '46461111-0000-4000-8000-000000000002' $$,
  'il closer registra esito, qualifica, motivo e le sue note'
);
select lives_ok(
  $$ update public.calls set stato = 'programmata', esito = null, qualificata = null, obiezione_principale = null
     where id = '46461111-0000-4000-8000-000000000001' $$,
  'e annulla un esito'
);
select lives_ok(
  $$ update public.calls set stato = 'svolta', qualificata = true, esito = 'persa', obiezione_principale = 'Fuori budget'
     where id = '46461111-0000-4000-8000-000000000001' $$,
  'e lo registra di nuovo'
);
select lives_ok(
  $$ select public.dettagli_call('46461111-0000-4000-8000-000000000002',
       'https://fathom.video/share/46', 'buona', null, 1200, '  Vuole la versione da 3 mesi  ') $$,
  'con dettagli_call salva le sue note insieme agli altri dettagli'
);
select is(
  (select row(note_closer, link_registrazione, note)::text
   from public.calls where id = '46461111-0000-4000-8000-000000000002'),
  row('Vuole la versione da 3 mesi', 'https://fathom.video/share/46', 'Riassegnata a Lorenzo')::text,
  'le note del closer sono salvate senza spazi ai lati, quelle del setter restano'
);
select lives_ok(
  $$ select public.modifica_call('46461111-0000-4000-8000-000000000002', 'discovery',
       '2019-05-15', '19:00', '33333333-3333-4333-8333-333333333333', 'Riscritta dal closer') $$,
  'il closer sposta la sua call'
);
select is(
  (select row(programmata_il, note)::text from public.calls where id = '46461111-0000-4000-8000-000000000002'),
  row('2019-05-15 17:00:00+00'::timestamptz, 'Riassegnata a Lorenzo')::text,
  'senza riscrivere le note del setter'
);

-- ---------------------------------------------------------------------------
-- The admin
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ update public.calls
     set esito = 'persa', qualificata = false, obiezione_principale = 'Non è il momento', note_closer = 'Scritto dall''admin'
     where id = '46461111-0000-4000-8000-000000000002' $$,
  'l''admin corregge esito, motivo e note del closer'
);
select lives_ok(
  $$ select public.modifica_call('46461111-0000-4000-8000-000000000002', 'strategy',
       '2019-05-15', '19:00', '33333333-3333-4333-8333-333333333333', 'Note del setter dall''admin') $$,
  'e con modifica_call le note del setter'
);
select lives_ok(
  $$ select public.dettagli_call('46461111-0000-4000-8000-000000000002',
       'https://fathom.video/share/46', 'buona', null, 1200, 'Note del closer dall''admin') $$,
  'e con dettagli_call quelle del closer'
);
select is(
  (select row(note, note_closer, esito, tipo)::text from public.calls where id = '46461111-0000-4000-8000-000000000002'),
  row('Note del setter dall''admin', 'Note del closer dall''admin', 'persa'::public.call_outcome, 'strategy'::public.call_type)::text,
  'tutto salvato'
);
select lives_ok(
  $$ select public.dettagli_call('46461111-0000-4000-8000-000000000002', null, null, null, null, '   ') $$,
  'un testo vuoto toglie le note del closer'
);
select is(
  (select note_closer from public.calls where id = '46461111-0000-4000-8000-000000000002'),
  null,
  'tolte'
);
update public.calls set note_closer = 'Note del closer dall''admin' where id = '46461111-0000-4000-8000-000000000002';

-- "Dalle call": the closer's words only
insert into motivi select * from public.motivi_non_chiusura_periodo('2019-05-01', '2019-05-31');
select is(
  (select array_agg(data::text || ' ' || lead || ' ' || esito || ' ' || coalesce(motivo, '-') || ' ' || coalesce(note_closer, '-')
     order by programmata_il desc)
   from motivi),
  array[
    '2019-05-16 Lead Solo Note follow_up - Vuole vedere altri contenuti',
    '2019-05-15 Lead Da Fare persa Non è il momento Note del closer dall''admin',
    '2019-05-10 Lead Tenuta persa Fuori budget Richiamare a giugno'
  ],
  'Dalle call: il motivo e le note del closer; una call con le sole note del setter non c''è'
);
select is(
  (select count(*)::int from motivi
   where motivo like '%setter%' or note_closer like '%setter%'),
  0,
  'le note del setter non compaiono mai'
);

-- ---------------------------------------------------------------------------
-- Back to the setter: he reads what the closer and the admin wrote
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select is(
  (select row(esito, obiezione_principale, note_closer, note)::text
   from public.calls where id = '46461111-0000-4000-8000-000000000002'),
  row('persa'::public.call_outcome, 'Non è il momento', 'Note del closer dall''admin', 'Note del setter dall''admin')::text,
  'il setter legge l''esito, il motivo e le note del closer, accanto alle sue'
);
select throws_ok(
  $$ update public.calls set note_closer = 'Corretto dal setter' where id = '46461111-0000-4000-8000-000000000002' $$,
  '42501', null,
  'e non le corregge'
);
select throws_ok(
  $$ select * from public.motivi_non_chiusura_periodo('2019-05-01', '2019-05-31') $$,
  '42501', null,
  'Dalle call resta dell''admin'
);


-- the closer reads the setter's note and never writes it; the admin does
reset role;
create temp table nota_setter on commit drop as
select c.id from public.calls c
where c.closer_id = '33333333-3333-4333-8333-333333333333' and c.setter_id = '22222222-2222-4222-8222-222222222222'
limit 1;
grant select on nota_setter to authenticated;
set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select throws_ok(
  $$ update public.calls set note = 'Scritta dal closer' where id = (select id from nota_setter) $$,
  '42501', null,
  'il closer non scrive le note del setter'
);
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ update public.calls set note = 'Corretta dall''admin' where id = (select id from nota_setter) $$,
  'l''admin sì'
);

select * from finish();
rollback;
