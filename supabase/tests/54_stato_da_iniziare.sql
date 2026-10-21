-- Derived client status with da_iniziare (04/10/2026). A path not started yet
-- has not ended: a new client in the week before the start, or a renewal that
-- starts after a gap, is "da_iniziare", never "scaduto". The other states keep
-- their rules: a sale in progress today wins (a renewal signed in advance keeps
-- the client attivo), and scaduto always means an end in the past.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(17);

select is(
  enum_range(null::public.client_status)::text[],
  array['attivo', 'in_scadenza', 'da_iniziare', 'sospeso', 'scaduto', 'chiuso', 'ex_cliente', 'mai_attivato'],
  'da_iniziare sta dopo in_scadenza (l''elenco Clienti è ordinato per stato)'
);

insert into public.clients (id, nome, cognome, fonte, closer_id) values
  ('54540000-0000-4000-8000-0000000000a1', 'Aldo', 'Nuovo', 'dm_inbound', '33333333-3333-4333-8333-333333333333'),
  ('54540000-0000-4000-8000-0000000000b1', 'Bruno', 'Pausa', 'dm_inbound', null),
  ('54540000-0000-4000-8000-0000000000c1', 'Carlo', 'Anticipo', 'dm_inbound', null),
  ('54540000-0000-4000-8000-0000000000d1', 'Dario', 'Quasifinito', 'dm_inbound', null),
  ('54540000-0000-4000-8000-0000000000e1', 'Enzo', 'Incorso', 'dm_inbound', null),
  ('54540000-0000-4000-8000-0000000000f1', 'Fabio', 'Oggi', 'dm_inbound', null),
  ('54540000-0000-4000-8000-0000000000a9', 'Gino', 'Finito', 'dm_inbound', null),
  ('54540000-0000-4000-8000-0000000000b9', 'Ugo', 'Exclient', 'dm_inbound', null),
  ('54540000-0000-4000-8000-0000000000c9', 'Ivo', 'Senzavendite', 'dm_inbound', null);

-- The first path of each client, dates around today
insert into public.sales (id, client_id, prodotto_personalizzato, tipo, closer_id, data_vendita, data_inizio, data_fine, valore_contratto, numero_rate)
select v.id::uuid, v.cliente::uuid, 'Percorso di prova', 'nuovo', v.closer::uuid,
       public.oggi() + v.vendita, public.oggi() + v.inizio, public.oggi() + v.fine, 1500, 1
from (values
  -- A: signed today, starts in a week (the form's default since 02/10/2026)
  ('54540000-0000-4000-8000-0000000000a2', '54540000-0000-4000-8000-0000000000a1', '33333333-3333-4333-8333-333333333333', 0, 7, 96),
  -- B: ended 5 days ago, renewed below with a start in 3 days
  ('54540000-0000-4000-8000-0000000000b2', '54540000-0000-4000-8000-0000000000b1', null, -100, -95, -5),
  -- C: ends in 10 days, renewed in advance below
  ('54540000-0000-4000-8000-0000000000c2', '54540000-0000-4000-8000-0000000000c1', null, -65, -60, 10),
  -- D: ends in 10 days, no renewal
  ('54540000-0000-4000-8000-0000000000d2', '54540000-0000-4000-8000-0000000000d1', null, -85, -80, 10),
  -- E: in progress, far from the end
  ('54540000-0000-4000-8000-0000000000e2', '54540000-0000-4000-8000-0000000000e1', null, -15, -10, 80),
  -- F: starts today
  ('54540000-0000-4000-8000-0000000000f2', '54540000-0000-4000-8000-0000000000f1', null, -7, 0, 89),
  -- G: ended 10 days ago
  ('54540000-0000-4000-8000-0000000000aa', '54540000-0000-4000-8000-0000000000a9', null, -105, -100, -10),
  -- U: ended 120 days ago
  ('54540000-0000-4000-8000-0000000000ba', '54540000-0000-4000-8000-0000000000b9', null, -305, -300, -120)
) as v(id, cliente, closer, vendita, inizio, fine);

-- The renewals, once the first path exists
insert into public.sales (id, client_id, prodotto_personalizzato, tipo, data_vendita, data_inizio, data_fine, valore_contratto, numero_rate)
select v.id::uuid, v.cliente::uuid, 'Percorso di prova', 'rinnovo',
       public.oggi() + v.vendita, public.oggi() + v.inizio, public.oggi() + v.fine, 1500, 1
from (values
  ('54540000-0000-4000-8000-0000000000b3', '54540000-0000-4000-8000-0000000000b1', -1, 3, 92),
  ('54540000-0000-4000-8000-0000000000c3', '54540000-0000-4000-8000-0000000000c1', -2, 11, 100)
) as v(id, cliente, vendita, inizio, fine);

create function pg_temp.stato(p_cliente uuid)
returns text
language sql
as $$
  select stato::text from public.v_client_status where client_id = p_cliente;
$$;

select is(pg_temp.stato('54540000-0000-4000-8000-0000000000a1'), 'da_iniziare',
  'cliente nuovo nella settimana prima dell''inizio: da iniziare, mai scaduto');
select is(pg_temp.stato('54540000-0000-4000-8000-0000000000b1'), 'da_iniziare',
  'percorso finito e rinnovo che parte tra 3 giorni: da iniziare, mai scaduto');
select is(pg_temp.stato('54540000-0000-4000-8000-0000000000c1'), 'attivo',
  'rinnovo firmato in anticipo: resta attivo, né in scadenza né da iniziare');
select is(pg_temp.stato('54540000-0000-4000-8000-0000000000d1'), 'in_scadenza',
  'finisce tra 10 giorni senza rinnovo: in scadenza');
select is(pg_temp.stato('54540000-0000-4000-8000-0000000000e1'), 'attivo',
  'percorso in corso: attivo');
select is(pg_temp.stato('54540000-0000-4000-8000-0000000000f1'), 'attivo',
  'il giorno dell''inizio il percorso è già in corso: attivo');
select is(pg_temp.stato('54540000-0000-4000-8000-0000000000a9'), 'scaduto',
  'finito da 10 giorni: scaduto');
select is(pg_temp.stato('54540000-0000-4000-8000-0000000000b9'), 'ex_cliente',
  'finito da 120 giorni: ex cliente');
select is(pg_temp.stato('54540000-0000-4000-8000-0000000000c9'), 'mai_attivato',
  'nessuna vendita: mai attivato');

select is(
  (select count(*)::integer from public.v_client_status
   where stato = 'scaduto' and data_fine_ultima >= public.oggi()),
  0,
  'nessun cliente scaduto ha una fine da oggi in poi'
);

-- The start of the renewal comes: B is attivo, as soon as it starts
update public.sales set data_inizio = public.oggi()
where id = '54540000-0000-4000-8000-0000000000b3';
select is(pg_temp.stato('54540000-0000-4000-8000-0000000000b1'), 'attivo',
  'il rinnovo comincia oggi: attivo');
update public.sales set data_inizio = public.oggi() + 3
where id = '54540000-0000-4000-8000-0000000000b3';

-- What the admin's pages read (v_clienti, with RLS)
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select is(
  (select stato::text from public.v_clienti where client_id = '54540000-0000-4000-8000-0000000000a1'),
  'da_iniziare',
  'l''admin legge da iniziare in Clienti'
);
-- Rinnovi: who ended less than 90 days ago (the page's query)
select is(
  (select array_agg(cognome order by cognome) from public.v_clienti
   where stato = 'scaduto' and data_fine_ultima < public.oggi() and client_id::text like '54540000-%'),
  array['Finito'],
  'Rinnovi, tra chi ha finito: solo chi ha davvero finito, mai chi deve iniziare'
);
-- Rinnovi: who ends within 30 days, started or not (the page's query)
select is(
  (select array_agg(cognome order by cognome) from public.v_clienti
   where data_fine_ultima between public.oggi() and public.oggi() + 30
     and client_id::text like '54540000-%'),
  array['Quasifinito'],
  'Rinnovi, chi finisce entro 30 giorni: chi rinnova dopo una pausa non c''è, finisce più avanti'
);

-- The closer reads the status of his client from his own sales
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(pg_temp.stato('54540000-0000-4000-8000-0000000000a1'), 'da_iniziare',
  'il closer legge da iniziare sul cliente della sua vendita');

-- The setter never reads clients' rows: the view gives him nothing
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(
  (select count(*)::integer from public.v_client_status where client_id::text like '54540000-%'),
  0,
  'il setter non legge lo stato dei clienti dalla view'
);

select * from finish();
rollback;
