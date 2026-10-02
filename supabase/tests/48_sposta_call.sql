-- Moving a call (Dany, 02/10/2026): the same call moves to its new day and
-- time, still to be held again, with the trace of where it came from and how
-- many times it moved. sposta_call is the one path: the closer moves his
-- calls, the admin any (also to the past), the setter the calls he booked
-- while they are still to be held; a held call never moves. The setter's
-- pencil and direct updates never move a call with an outcome either, and
-- only a real move writes the trace. created_at never changes; the call's
-- numbers follow programmata_il, so the old day loses it.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(59);

-- ---------------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------------
select col_type_is('public', 'calls', 'spostata_dal', 'timestamp with time zone', 'da dove arriva la call, alla sua ultima mossa');
select col_is_null('public', 'calls', 'spostata_dal', 'vuota per una call mai spostata');
select col_type_is('public', 'calls', 'volte_spostata', 'integer', 'quante volte è stata spostata');
select col_not_null('public', 'calls', 'volte_spostata', 'sempre un numero');
select col_default_is('public', 'calls', 'volte_spostata', '0', 'zero per una call mai spostata');
select has_function('public', 'sposta_call', array['uuid', 'date', 'time without time zone'], 'sposta_call esiste');
select ok(
  (select not p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'public.sposta_call(uuid, date, time)'::regprocedure),
  'sposta_call gira coi permessi di chi chiama (RLS decide le call), search_path vuoto'
);
select ok(
  not has_function_privilege('anon', 'public.sposta_call(uuid, date, time)', 'execute')
  and has_function_privilege('authenticated', 'public.sposta_call(uuid, date, time)', 'execute'),
  'anon non la chiama, chi è entrato sì'
);
select has_trigger('public', 'calls', 'calls_traccia_spostamento', 'la traccia la scrive solo una mossa vera');

-- ---------------------------------------------------------------------------
-- Fixtures: June 2019, far from the seed; the moves go to 2099.
-- Seed: admin 1111, setter 2222, closer 3333, coach 4444.
-- ---------------------------------------------------------------------------
insert into public.leads (id, nome, setter_id, fonte) values
  ('48480000-0000-4000-8000-000000000001', 'Lead Da Spostare', '22222222-2222-4222-8222-222222222222', 'dm_inbound'),
  ('48480000-0000-4000-8000-000000000002', 'Lead Riprogrammata', '22222222-2222-4222-8222-222222222222', 'dm_inbound'),
  ('48480000-0000-4000-8000-000000000003', 'Lead No Show', '22222222-2222-4222-8222-222222222222', 'dm_outbound'),
  ('48480000-0000-4000-8000-000000000004', 'Lead Persa', '22222222-2222-4222-8222-222222222222', 'dm_inbound'),
  ('48480000-0000-4000-8000-000000000005', 'Lead Dell Admin', '11111111-1111-4111-8111-111111111111', 'referral'),
  ('48480000-0000-4000-8000-000000000006', 'Lead Riprogrammata Due', '22222222-2222-4222-8222-222222222222', 'dm_inbound'),
  ('48480000-0000-4000-8000-000000000007', 'Lead Svolta', '22222222-2222-4222-8222-222222222222', 'dm_inbound');

insert into public.calls
  (id, lead_id, setter_id, closer_id, tipo, programmata_il, stato, qualificata, esito, obiezione_principale, note, note_closer, created_at)
values
  -- still to be held: 19:00 in Rome
  ('48481111-0000-4000-8000-000000000001', '48480000-0000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'discovery',
   '2019-06-10 17:00:00+00', 'programmata', null, null, null, 'Nota del setter', null, '2019-06-01 10:00:00+00'),
  -- recorded as "riprogrammata" before this change, without a new date
  ('48481111-0000-4000-8000-000000000002', '48480000-0000-4000-8000-000000000002',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'discovery',
   '2019-06-11 17:00:00+00', 'riprogrammata', null, null, null, null, null, '2019-06-02 10:00:00+00'),
  ('48481111-0000-4000-8000-000000000003', '48480000-0000-4000-8000-000000000003',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'discovery',
   '2019-06-12 17:00:00+00', 'no_show', null, null, null, null, null, '2019-06-03 10:00:00+00'),
  ('48481111-0000-4000-8000-000000000004', '48480000-0000-4000-8000-000000000004',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'discovery',
   '2019-06-13 17:00:00+00', 'svolta', true, 'persa', 'Fuori budget', null, 'Richiamare a settembre', '2019-06-04 10:00:00+00'),
  -- booked and run by the admin: neither the seed setter nor the seed closer sees it
  ('48481111-0000-4000-8000-000000000005', '48480000-0000-4000-8000-000000000005',
   '11111111-1111-4111-8111-111111111111', '11111111-1111-4111-8111-111111111111', 'discovery',
   '2019-06-14 17:00:00+00', 'programmata', null, null, null, null, null, '2019-06-05 10:00:00+00'),
  ('48481111-0000-4000-8000-000000000006', '48480000-0000-4000-8000-000000000006',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'discovery',
   '2019-06-15 17:00:00+00', 'riprogrammata', null, null, null, null, null, '2019-06-06 10:00:00+00'),
  ('48481111-0000-4000-8000-000000000007', '48480000-0000-4000-8000-000000000007',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'discovery',
   -- booked with seconds (an import, a script): the pencil sends day and time
   '2019-06-16 17:00:42+00', 'svolta', true, 'follow_up', 'Ci deve pensare', null, null, '2019-06-07 10:00:00+00');

select is(
  (select row(spostata_dal, volte_spostata)::text from public.calls where id = '48481111-0000-4000-8000-000000000001'),
  row(null::timestamptz, 0)::text,
  'una call nuova non è mai stata spostata'
);
select throws_ok(
  $$ update public.calls set volte_spostata = 1 where id = '48481111-0000-4000-8000-000000000001' $$,
  '23514', null,
  'una call spostata sa sempre da dove arriva'
);
select throws_ok(
  $$ update public.calls set spostata_dal = now() where id = '48481111-0000-4000-8000-000000000001' $$,
  '23514', null,
  'e una call mai spostata non ha un''origine'
);

set local role authenticated;

-- ---------------------------------------------------------------------------
-- The closer of the calls
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

select lives_ok(
  $$ select public.sposta_call('48481111-0000-4000-8000-000000000001', '2099-06-20', '18:00') $$,
  'il closer sposta una sua call'
);
select is(
  (select row(programmata_il, stato, spostata_dal, volte_spostata, created_at, note)::text
   from public.calls where id = '48481111-0000-4000-8000-000000000001'),
  row('2099-06-20 16:00:00+00'::timestamptz, 'programmata'::public.call_status, '2019-06-10 17:00:00+00'::timestamptz,
      1, '2019-06-01 10:00:00+00'::timestamptz, 'Nota del setter')::text,
  'la stessa call passa alle 18:00 di Roma del nuovo giorno, con la traccia, la prenotazione e le note di prima'
);
select is(
  (select count(*)::integer from public.calls where lead_id = '48480000-0000-4000-8000-000000000001'),
  1,
  'nessuna call nuova'
);

select lives_ok(
  $$ select public.sposta_call('48481111-0000-4000-8000-000000000002', '2099-06-21', '10:30') $$,
  'una call segnata riprogrammata prima di oggi prende la sua nuova data'
);
select is(
  (select row(stato, programmata_il, spostata_dal, volte_spostata)::text
   from public.calls where id = '48481111-0000-4000-8000-000000000002'),
  row('programmata'::public.call_status, '2099-06-21 08:30:00+00'::timestamptz,
      '2019-06-11 17:00:00+00'::timestamptz, 1)::text,
  'e torna da fare'
);

select is(
  (select no_show from public.giornate_closer('2019-06-12', '2019-06-12') where data is null),
  1,
  'prima della mossa il no show conta nel suo giorno'
);
select lives_ok(
  $$ select public.sposta_call('48481111-0000-4000-8000-000000000003', '2099-06-22', '17:00') $$,
  'il closer sposta una call segnata no show'
);
select is(
  (select coalesce(no_show, 0) from public.giornate_closer('2019-06-12', '2019-06-12') where data is null),
  0,
  'il giorno vecchio non ha più quella call'
);
select is(
  (select row(stato, esito, qualificata)::text from public.calls where id = '48481111-0000-4000-8000-000000000003'),
  row('programmata'::public.call_status, null::public.call_outcome, null::boolean)::text,
  'e la call è di nuovo da fare'
);

select throws_ok(
  $$ select public.sposta_call('48481111-0000-4000-8000-000000000004', '2099-06-23', '17:00') $$,
  '22023', 'Questa call è stata fatta: non si sposta. Se l''esito è sbagliato annullalo prima; per rivedere il lead serve una nuova call',
  'una call svolta non si sposta: è stata fatta'
);
select is(
  (select row(stato, esito, obiezione_principale, programmata_il, volte_spostata)::text
   from public.calls where id = '48481111-0000-4000-8000-000000000004'),
  row('svolta'::public.call_status, 'persa'::public.call_outcome, 'Fuori budget',
      '2019-06-13 17:00:00+00'::timestamptz, 0)::text,
  'e resta nel suo giorno, col suo esito e il suo motivo'
);
-- a wrong outcome is undone first ("Annulla l'esito"), then the call moves
select lives_ok(
  $$ update public.calls set stato = 'programmata', esito = null, qualificata = null, obiezione_principale = null
     where id = '48481111-0000-4000-8000-000000000004' $$,
  'il closer annulla l''esito sbagliato'
);
select lives_ok(
  $$ select public.sposta_call('48481111-0000-4000-8000-000000000004', '2099-06-23', '17:00') $$,
  'e poi la sposta'
);
select is(
  (select row(stato, note_closer, volte_spostata)::text
   from public.calls where id = '48481111-0000-4000-8000-000000000004'),
  row('programmata'::public.call_status, 'Richiamare a settembre', 1)::text,
  'le note aggiuntive del closer restano'
);

select throws_ok(
  $$ select public.sposta_call('48481111-0000-4000-8000-000000000001', '2019-01-01', '10:00') $$,
  '22023', 'Una call si sposta da oggi in avanti',
  'il closer non sposta una call nel passato'
);
select throws_ok(
  $$ select public.sposta_call('48481111-0000-4000-8000-000000000001', '2099-06-20', '18:00') $$,
  '22023', 'La call è già a quel giorno e a quell''ora: scegline un altro',
  'né allo stesso momento'
);
select throws_ok(
  $$ select public.sposta_call('48481111-0000-4000-8000-000000000001', null, '18:00') $$,
  '22023', 'Scegli il giorno e l''ora della call',
  'senza giorno non si sposta'
);
select throws_ok(
  $$ select public.sposta_call('48481111-0000-4000-8000-000000000005', '2099-06-24', '17:00') $$,
  '42501', 'Call non trovata o non tua',
  'il closer non sposta la call di un altro closer'
);
select throws_ok(
  $$ update public.calls set volte_spostata = 0, spostata_dal = null where id = '48481111-0000-4000-8000-000000000002' $$,
  '42501', 'La traccia dello spostamento la scrive solo «Sposta»',
  'il closer non cancella la traccia di una mossa'
);

-- ---------------------------------------------------------------------------
-- The setter who booked the calls
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select lives_ok(
  $$ select public.sposta_call('48481111-0000-4000-8000-000000000001', '2099-06-25', '09:15') $$,
  'il setter sposta una sua call ancora da fare'
);
select is(
  (select row(programmata_il, spostata_dal, volte_spostata, stato)::text
   from public.calls where id = '48481111-0000-4000-8000-000000000001'),
  row('2099-06-25 07:15:00+00'::timestamptz, '2099-06-20 16:00:00+00'::timestamptz, 2,
      'programmata'::public.call_status)::text,
  'la traccia dice l''ultima origine e conta due mosse'
);
select throws_ok(
  $$ select public.sposta_call('48481111-0000-4000-8000-000000000006', '2099-06-26', '17:00') $$,
  '42501', 'Questa call è segnata come riprogrammata: la nuova data la mette il closer (o l''admin)',
  'una call segnata riprogrammata la sposta il closer: il setter riceve una frase chiara'
);
select throws_ok(
  $$ select public.sposta_call('48481111-0000-4000-8000-000000000007', '2099-06-26', '17:00') $$,
  '42501', 'Questa call ha già un esito del closer: la sposta lui (o l''admin)',
  'e una call con un esito pure'
);
select is(
  (select row(stato, esito, programmata_il)::text from public.calls where id = '48481111-0000-4000-8000-000000000007'),
  row('svolta'::public.call_status, 'follow_up'::public.call_outcome, '2019-06-16 17:00:42+00'::timestamptz)::text,
  'che resta com''era'
);
select throws_ok(
  $$ update public.calls set stato = 'no_show' where id = '48481111-0000-4000-8000-000000000001' $$,
  '42501', null,
  'l''esito resta del closer anche dopo una mossa'
);
select throws_ok(
  $$ select public.sposta_call('48481111-0000-4000-8000-000000000001', '2019-01-01', '10:00') $$,
  '22023', 'Una call si sposta da oggi in avanti',
  'il setter non sposta nel passato'
);
select throws_ok(
  $$ select public.sposta_call('48481111-0000-4000-8000-000000000005', '2099-06-24', '17:00') $$,
  '42501', 'Call non trovata o non tua',
  'né una call che non ha fissato lui'
);

-- the pencil and direct updates: the setter never moves a call with an outcome
select throws_ok(
  $$ select public.modifica_call('48481111-0000-4000-8000-000000000006', 'discovery', '2099-07-01', '17:00',
       '33333333-3333-4333-8333-333333333333', null) $$,
  '42501', 'Questa call è segnata come riprogrammata: la nuova data la mette il closer (o l''admin)',
  'nemmeno con la matita una call segnata riprogrammata'
);
select throws_ok(
  $$ select public.modifica_call('48481111-0000-4000-8000-000000000007', 'discovery', '2099-07-01', '17:00',
       '33333333-3333-4333-8333-333333333333', null) $$,
  '42501', 'Questa call ha già un esito del closer: la sposta lui (o l''admin)',
  'né una call con un esito'
);
select throws_ok(
  $$ update public.calls set programmata_il = '2099-07-01 15:00:00+00' where id = '48481111-0000-4000-8000-000000000006' $$,
  '42501', 'Questa call è segnata come riprogrammata: la nuova data la mette il closer (o l''admin)',
  'né con un update diretto'
);
select lives_ok(
  $$ select public.modifica_call('48481111-0000-4000-8000-000000000007', 'discovery', '2019-06-16', '19:00',
       '33333333-3333-4333-8333-333333333333', 'Richiamarlo dopo le ferie') $$,
  'sulla call con un esito il setter scrive ancora le sue note, se data e ora restano (al minuto: i secondi non sono una mossa)'
);
select lives_ok(
  $$ select public.modifica_call('48481111-0000-4000-8000-000000000001', 'discovery', '2099-06-25', '09:45',
       '33333333-3333-4333-8333-333333333333', 'Nota del setter') $$,
  'e corregge con la matita l''ora di una call da fare'
);
select is(
  (select row(programmata_il, spostata_dal, volte_spostata)::text
   from public.calls where id = '48481111-0000-4000-8000-000000000001'),
  row('2099-06-25 07:45:00+00'::timestamptz, '2099-06-20 16:00:00+00'::timestamptz, 2)::text,
  'senza traccia: una correzione non è una mossa'
);

-- only a real move writes the trace
select throws_ok(
  $$ update public.calls set volte_spostata = 7, spostata_dal = '2000-01-01' where id = '48481111-0000-4000-8000-000000000001' $$,
  '42501', 'La traccia dello spostamento la scrive solo «Sposta»',
  'il setter non scrive la traccia a mano'
);
select throws_ok(
  $$ update public.calls set volte_spostata = volte_spostata + 1, spostata_dal = programmata_il
     where id = '48481111-0000-4000-8000-000000000001' $$,
  '42501', 'La traccia dello spostamento la scrive solo «Sposta»',
  'nemmeno una mossa senza cambiare giorno e ora'
);
select throws_ok(
  $$ insert into public.calls (lead_id, setter_id, closer_id, tipo, programmata_il, stato, spostata_dal, volte_spostata)
     values ('48480000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
             '33333333-3333-4333-8333-333333333333', 'discovery', '2099-07-02 15:00:00+00', 'programmata',
             '2099-07-01 15:00:00+00', 1) $$,
  '42501', 'La traccia dello spostamento la scrive solo «Sposta»',
  'e una call nuova nasce senza traccia'
);

-- ---------------------------------------------------------------------------
-- The admin: any call, also to the past (a move that happened)
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ select public.sposta_call('48481111-0000-4000-8000-000000000006', '2019-06-17', '18:00') $$,
  'l''admin sposta la call riprogrammata di un closer, anche in un giorno passato'
);
select is(
  (select row(stato, programmata_il, spostata_dal, volte_spostata)::text
   from public.calls where id = '48481111-0000-4000-8000-000000000006'),
  row('programmata'::public.call_status, '2019-06-17 16:00:00+00'::timestamptz,
      '2019-06-15 17:00:00+00'::timestamptz, 1)::text,
  'e la call è da fare nel suo nuovo giorno'
);
select lives_ok(
  $$ select public.sposta_call('48481111-0000-4000-8000-000000000005', '2099-06-24', '17:00') $$,
  'e sposta le sue'
);
select throws_ok(
  $$ select public.sposta_call('48481111-0000-4000-8000-000000000007', '2099-06-27', '17:00') $$,
  '22023', 'Questa call è stata fatta: non si sposta. Se l''esito è sbagliato annullalo prima; per rivedere il lead serve una nuova call',
  'nemmeno l''admin sposta una call svolta'
);
select is(
  (select row(stato, esito, qualificata, obiezione_principale, programmata_il)::text
   from public.calls where id = '48481111-0000-4000-8000-000000000007'),
  row('svolta'::public.call_status, 'follow_up'::public.call_outcome, true, 'Ci deve pensare',
      '2019-06-16 17:00:00+00'::timestamptz)::text,
  'che resta col suo esito nel suo giorno'
);
select is(
  (select count(*)::integer from public.calls
   where id::text like '48481111-%' and created_at <> case id
     when '48481111-0000-4000-8000-000000000001' then '2019-06-01 10:00:00+00'::timestamptz
     when '48481111-0000-4000-8000-000000000002' then '2019-06-02 10:00:00+00'::timestamptz
     when '48481111-0000-4000-8000-000000000003' then '2019-06-03 10:00:00+00'::timestamptz
     when '48481111-0000-4000-8000-000000000004' then '2019-06-04 10:00:00+00'::timestamptz
     when '48481111-0000-4000-8000-000000000005' then '2019-06-05 10:00:00+00'::timestamptz
     when '48481111-0000-4000-8000-000000000006' then '2019-06-06 10:00:00+00'::timestamptz
     else '2019-06-07 10:00:00+00'::timestamptz
   end),
  0,
  'nessuna mossa cambia il giorno della prenotazione (created_at)'
);
select is(
  (select count(*)::integer from public.calls where id::text like '48481111-%' and stato = 'riprogrammata'),
  0,
  'dopo le mosse nessuna call resta riprogrammata'
);
select is(
  (select coalesce(call, 0) from public.giornate_closer('2099-06-22', '2099-06-22', '33333333-3333-4333-8333-333333333333') where data is null),
  0,
  'nel nuovo giorno la call conta quando ha un esito: da fare non è ancora svolta'
);
select lives_ok(
  $$ update public.calls set stato = 'no_show' where id = '48481111-0000-4000-8000-000000000003' $$,
  'il nuovo esito si registra nel nuovo giorno'
);
select is(
  (select no_show from public.giornate_closer('2099-06-22', '2099-06-22', '33333333-3333-4333-8333-333333333333') where data is null),
  1,
  'e conta lì'
);

-- ---------------------------------------------------------------------------
-- Anyone else
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select throws_ok(
  $$ select public.sposta_call('48481111-0000-4000-8000-000000000001', '2099-06-28', '17:00') $$,
  '42501', 'Operazione non consentita',
  'gli altri ruoli non spostano call'
);

select * from finish();
rollback;
