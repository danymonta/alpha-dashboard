-- Path reminders (Dany, 04/10/2026): "Call dei 3 mesi" 3 months before the end
-- of a path longer than 3 months, "Call di rinnovo" 1 month before; never
-- after a renewal, never for an ended or interrupted path; catch-up sends only
-- the renewal one; once per client, kind and end, a new end makes new ones;
-- booked before the email, so two runs of the cron never send one twice.
-- Only the service role (the cron) computes and books them; the admin reads
-- what was sent, nobody writes it from a session. The client's Drive folder:
-- admin only.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(53);

-- Paths in 2040, far from the seed. Products: 3 months ...01, 6 months ...02.
insert into public.clients (id, nome, cognome, telefono, fonte, closer_id) values
  ('53530000-0000-4000-8000-0000000000a1', 'Mario', 'Rossi', '+39 349 000 0001', 'dm_inbound', '33333333-3333-4333-8333-333333333333'),
  ('53530000-0000-4000-8000-0000000000b1', 'Bruno', 'Tremesi', null, 'dm_inbound', null),
  ('53530000-0000-4000-8000-0000000000c1', 'Carlo', 'Rinnovato', null, 'dm_inbound', null),
  ('53530000-0000-4000-8000-0000000000d1', 'Dario', 'Finito', null, 'dm_inbound', null),
  ('53530000-0000-4000-8000-0000000000e1', 'Enzo', 'Interrotto', null, 'dm_inbound', null),
  ('53530000-0000-4000-8000-0000000000f1', 'Fabio', 'Fuoricatalogo', null, 'dm_inbound', null),
  ('53530000-0000-4000-8000-0000000000a9', 'Gino', 'Finemese', null, 'dm_inbound', null);

-- data_fine from the product's duration: start + n months - 1 day
insert into public.sales (id, client_id, product_id, prodotto_personalizzato, tipo, data_vendita, data_inizio, data_fine, valore_contratto, numero_rate) values
  -- A: 6 months, 01/03 -> 31/08/2040
  ('53530000-0000-4000-8000-0000000000a2', '53530000-0000-4000-8000-0000000000a1', 'aaaaaaa1-0000-4000-8000-000000000002', null,
   'nuovo', '2040-02-20', '2040-03-01', null, 2400, 1),
  -- B: 3 months, 01/06 -> 31/08/2040
  ('53530000-0000-4000-8000-0000000000b2', '53530000-0000-4000-8000-0000000000b1', 'aaaaaaa1-0000-4000-8000-000000000001', null,
   'nuovo', '2040-05-25', '2040-06-01', null, 1500, 1),
  -- C: 6 months to 30/06, renewed for 3 months to 30/09, and an upsell to 31/12
  ('53530000-0000-4000-8000-0000000000c2', '53530000-0000-4000-8000-0000000000c1', 'aaaaaaa1-0000-4000-8000-000000000002', null,
   'nuovo', '2039-12-20', '2040-01-01', null, 2400, 1),
  ('53530000-0000-4000-8000-0000000000c3', '53530000-0000-4000-8000-0000000000c1', 'aaaaaaa1-0000-4000-8000-000000000001', null,
   'rinnovo', '2040-06-10', '2040-07-01', null, 1500, 1),
  ('53530000-0000-4000-8000-0000000000c4', '53530000-0000-4000-8000-0000000000c1', null, 'Corso universitario',
   'upsell', '2040-06-10', '2040-07-01', '2040-12-31', 300, 1),
  -- D: 6 months, ended 30/06/2040
  ('53530000-0000-4000-8000-0000000000d2', '53530000-0000-4000-8000-0000000000d1', 'aaaaaaa1-0000-4000-8000-000000000002', null,
   'nuovo', '2039-12-20', '2040-01-01', null, 2400, 1),
  -- E: 6 months, 01/03 -> 31/08/2040, interrupted below
  ('53530000-0000-4000-8000-0000000000e2', '53530000-0000-4000-8000-0000000000e1', 'aaaaaaa1-0000-4000-8000-000000000002', null,
   'nuovo', '2040-02-20', '2040-03-01', null, 2400, 2),
  -- F: off the catalogue, typed as 01/06 -> 01/09/2040: still a 3-month path
  ('53530000-0000-4000-8000-0000000000f2', '53530000-0000-4000-8000-0000000000f1', null, 'Percorso su misura',
   'nuovo', '2040-05-25', '2040-06-01', '2040-09-01', 1500, 1),
  -- G: off the catalogue from the end of a month, typed as 30/11/2040 -> 01/03/2041: 3 months too
  ('53530000-0000-4000-8000-0000000000aa', '53530000-0000-4000-8000-0000000000a9', null, 'Percorso su misura',
   'nuovo', '2040-11-20', '2040-11-30', '2041-03-01', 1500, 1);

-- What the cron would get on a day, for the clients of this test
create function pg_temp.dovuti(p_giorno date, p_cliente uuid)
returns text[]
language sql
as $$
  select coalesce(array_agg(d.tipo || ':' || d.azione || ':' || d.data_fine order by d.ordine), '{}')
  from (
    select x.tipo::text as tipo, x.azione, x.data_fine, row_number() over () as ordine
    from public.promemoria_percorso_da_inviare(p_giorno) x
    where x.client_id = p_cliente
  ) d;
$$;

set local role service_role;

-- A: 6 months. The feedback one from 3 months before the end
select is(pg_temp.dovuti('2040-05-30', '53530000-0000-4000-8000-0000000000a1'), '{}'::text[],
  'il giorno prima dei 3 mesi niente');
select is(pg_temp.dovuti('2040-05-31', '53530000-0000-4000-8000-0000000000a1'),
  array['feedback_3_mesi:invia:2040-08-31'],
  'a 3 mesi dalla fine di un percorso di 6 mesi: la call dei 3 mesi');
select is(
  (select row(x.nome, x.cognome, x.telefono, x.prodotto, x.data_inizio, x.giorni_mancanti)::text
   from public.promemoria_percorso_da_inviare('2040-05-31') x
   where x.client_id = '53530000-0000-4000-8000-0000000000a1'),
  row('Mario', 'Rossi', '+39 349 000 0001', 'Percorso Alpha 6 mesi', '2040-03-01'::date, 92)::text,
  'con nome, telefono, prodotto, inizio e giorni alla fine'
);
select is(pg_temp.dovuti('2040-06-30', '53530000-0000-4000-8000-0000000000a1'),
  array['feedback_3_mesi:invia:2040-08-31'],
  'un mese dopo non è ancora il rinnovo: la call dei 3 mesi resta da mandare');

-- B: a 3-month path gets only the renewal one
select is(pg_temp.dovuti('2040-06-01', '53530000-0000-4000-8000-0000000000b1'), '{}'::text[],
  'un percorso di 3 mesi non ha la call dei 3 mesi');
select is(pg_temp.dovuti('2040-07-30', '53530000-0000-4000-8000-0000000000b1'), '{}'::text[],
  'né il rinnovo prima di un mese dalla fine');
select is(pg_temp.dovuti('2040-07-31', '53530000-0000-4000-8000-0000000000b1'),
  array['rinnovo_1_mese:invia:2040-08-31'],
  'a un mese dalla fine: la call di rinnovo');

-- F: an end typed as start + 3 months is a 3-month path too
select is(pg_temp.dovuti('2040-06-01', '53530000-0000-4000-8000-0000000000f1'), '{}'::text[],
  'un percorso di 3 mesi con la fine scritta a mano non ha la call dei 3 mesi il primo giorno');
select is(
  (select array_agg(x.tipo::text || ':' || x.prodotto)
   from public.promemoria_percorso_da_inviare('2040-08-01') x
   where x.client_id = '53530000-0000-4000-8000-0000000000f1'),
  array['rinnovo_1_mese:Percorso su misura'],
  'solo il rinnovo, a un mese dalla fine, col nome del percorso fuori catalogo');

-- A, never sent: past both thresholds only the renewal one goes
select is(pg_temp.dovuti('2040-07-31', '53530000-0000-4000-8000-0000000000a1'),
  array['rinnovo_1_mese:invia:2040-08-31', 'feedback_3_mesi:salta:2040-08-31'],
  'recupero: oltre le due soglie parte solo il rinnovo, la call dei 3 mesi si salta');
select is(pg_temp.dovuti('2040-08-31', '53530000-0000-4000-8000-0000000000a1'),
  array['rinnovo_1_mese:invia:2040-08-31', 'feedback_3_mesi:salta:2040-08-31'],
  'anche l''ultimo giorno del percorso');
select is(pg_temp.dovuti('2040-09-01', '53530000-0000-4000-8000-0000000000a1'), '{}'::text[],
  'finito il percorso, niente');

-- C renewed: nothing for the old end; the renewal (3 months) has its own; upsells never count
select is(pg_temp.dovuti('2040-06-15', '53530000-0000-4000-8000-0000000000c1'), '{}'::text[],
  'chi ha già rinnovato non riceve il rinnovo della fine vecchia');
select is(pg_temp.dovuti('2040-08-30', '53530000-0000-4000-8000-0000000000c1'),
  array['rinnovo_1_mese:invia:2040-09-30'],
  'il rinnovo arriva per la fine nuova, mai per l''upsell che finisce dopo');

-- D ended
select is(pg_temp.dovuti('2040-07-01', '53530000-0000-4000-8000-0000000000d1'), '{}'::text[],
  'un percorso finito non riceve niente');

-- G: months last 28 to 31 days, a 3-month path from the end of November ends on 01/03
select is(pg_temp.dovuti('2040-12-01', '53530000-0000-4000-8000-0000000000a9'), '{}'::text[],
  'un percorso di 3 mesi dal 30/11 al 01/03 non ha la call dei 3 mesi il giorno dopo l''inizio');
select is(pg_temp.dovuti('2041-02-01', '53530000-0000-4000-8000-0000000000a9'),
  array['rinnovo_1_mese:invia:2041-03-01'],
  'solo il rinnovo, a un mese dalla fine');

-- Booked before the email: two runs of the cron, one email
select isnt(
  public.promemoria_percorso_prenota('53530000-0000-4000-8000-0000000000b1', 'rinnovo_1_mese', '2040-08-31',
    '53530000-0000-4000-8000-0000000000b2'),
  null,
  'il cron prenota il promemoria prima di mandarlo'
);
select is(
  public.promemoria_percorso_prenota('53530000-0000-4000-8000-0000000000b1', 'rinnovo_1_mese', '2040-08-31',
    '53530000-0000-4000-8000-0000000000b2'),
  null,
  'un secondo giro del cron non lo prende: una sola email'
);
select is(pg_temp.dovuti('2040-07-31', '53530000-0000-4000-8000-0000000000b1'), '{}'::text[],
  'prenotato, non è più tra i dovuti');
select throws_ok(
  $$ select public.promemoria_percorso_prenota('53530000-0000-4000-8000-0000000000b1', 'feedback_3_mesi', '2040-08-31',
       '53530000-0000-4000-8000-0000000000b2', 'inviato') $$,
  '22023', null,
  'si prenota un invio o si salta: «inviato» lo scrive solo la conferma'
);
-- F's renewal booked: the interruption below takes it over
select isnt(
  public.promemoria_percorso_prenota('53530000-0000-4000-8000-0000000000f1', 'rinnovo_1_mese', '2040-09-01',
    '53530000-0000-4000-8000-0000000000f2'),
  null,
  'il rinnovo di F è prenotato'
);

-- a run that died left its booking: after 30 minutes it is due again
reset role;
set local session_replication_role = replica;   -- the updated_at trigger stays out
update public.promemoria_percorso set updated_at = now() - interval '31 minutes'
where client_id = '53530000-0000-4000-8000-0000000000b1';
set local session_replication_role = origin;
set local role service_role;
select is(pg_temp.dovuti('2040-07-31', '53530000-0000-4000-8000-0000000000b1'),
  array['rinnovo_1_mese:invia:2040-08-31'],
  'una prenotazione di oltre 30 minuti fa (un giro morto) torna dovuta');
select isnt(
  public.promemoria_percorso_prenota('53530000-0000-4000-8000-0000000000b1', 'rinnovo_1_mese', '2040-08-31',
    '53530000-0000-4000-8000-0000000000b2'),
  null,
  'e il giro della sera dopo la riprende'
);

-- Only the service role
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok(
  $$ select * from public.promemoria_percorso_da_inviare('2040-05-31') $$,
  '42501', null,
  'nemmeno l''admin chiama la funzione dei promemoria: solo il cron'
);
select throws_ok(
  $$ select public.promemoria_percorso_prenota('53530000-0000-4000-8000-0000000000d1', 'rinnovo_1_mese', '2040-06-30', null) $$,
  '42501', null,
  'né quella che li prenota'
);

-- F interrupted on its last day: the renewal booked above is not sent any more
select lives_ok(
  $$ select * from public.interrompi_percorso('53530000-0000-4000-8000-0000000000f2', '2040-09-01', false, true) $$,
  'l''admin interrompe F sull''ultimo giorno'
);
select is(
  (select array_agg(p.tipo::text || ':' || p.esito::text order by p.tipo)
   from public.promemoria_percorso p where p.client_id = '53530000-0000-4000-8000-0000000000f1'),
  array['feedback_3_mesi:interrotto', 'rinnovo_1_mese:interrotto'],
  'la prenotazione diventa interrotto'
);

-- E interrupted by the admin on 20/07: no reminder for that end
select lives_ok(
  $$ select * from public.interrompi_percorso('53530000-0000-4000-8000-0000000000e2', '2040-07-20', false, true) $$,
  'l''admin interrompe il percorso'
);
select is(
  (select array_agg(p.tipo::text || ':' || p.esito::text || ':' || p.data_fine order by p.tipo)
   from public.promemoria_percorso p where p.client_id = '53530000-0000-4000-8000-0000000000e1'),
  array['feedback_3_mesi:interrotto:2040-07-20', 'rinnovo_1_mese:interrotto:2040-07-20'],
  'l''interruzione segna i due promemoria della fine nuova, e l''admin li legge'
);
select throws_ok(
  $$ insert into public.promemoria_percorso (client_id, tipo, data_fine, esito)
     values ('53530000-0000-4000-8000-0000000000a1', 'feedback_3_mesi', '2040-08-31', 'inviato') $$,
  '42501', null,
  'nessuna sessione scrive i promemoria, nemmeno l''admin'
);

set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select throws_ok(
  $$ select public.promemoria_percorso_interrotto('53530000-0000-4000-8000-0000000000a2') $$,
  '42501', null,
  'il closer non segna un percorso interrotto'
);

reset role;
set local role service_role;
select is(pg_temp.dovuti('2040-07-01', '53530000-0000-4000-8000-0000000000e1'), '{}'::text[],
  'un percorso interrotto non riceve il rinnovo');
select is(pg_temp.dovuti('2040-06-01', '53530000-0000-4000-8000-0000000000e1'), '{}'::text[],
  'né la call dei 3 mesi');

-- E's interruption day corrected (still short of 6 months): still interrupted
update public.sales set data_fine = '2040-07-25' where id = '53530000-0000-4000-8000-0000000000e2';
select is(pg_temp.dovuti('2040-07-01', '53530000-0000-4000-8000-0000000000e1'), '{}'::text[],
  'corretto il giorno dell''interruzione, il percorso resta interrotto: niente');
-- back to the whole 6 months (the interruption was a mistake): the reminders come back
update public.sales set data_fine = '2040-08-31' where id = '53530000-0000-4000-8000-0000000000e2';
select is(pg_temp.dovuti('2040-08-01', '53530000-0000-4000-8000-0000000000e1'),
  array['rinnovo_1_mese:invia:2040-08-31', 'feedback_3_mesi:salta:2040-08-31'],
  'riportato a tutta la durata del prodotto, i promemoria tornano');

-- Idempotence: what the cron recorded does not go again
insert into public.promemoria_percorso (client_id, tipo, data_fine, sale_id, esito)
values ('53530000-0000-4000-8000-0000000000a1', 'feedback_3_mesi', '2040-08-31', '53530000-0000-4000-8000-0000000000a2', 'inviato');
select is(pg_temp.dovuti('2040-05-31', '53530000-0000-4000-8000-0000000000a1'), '{}'::text[],
  'la call dei 3 mesi già mandata non riparte');
select is(pg_temp.dovuti('2040-07-31', '53530000-0000-4000-8000-0000000000a1'),
  array['rinnovo_1_mese:invia:2040-08-31'],
  'a un mese dalla fine parte il rinnovo, una volta');
select throws_ok(
  $$ insert into public.promemoria_percorso (client_id, tipo, data_fine, esito)
     values ('53530000-0000-4000-8000-0000000000a1', 'feedback_3_mesi', '2040-08-31', 'inviato') $$,
  '23505', null,
  'un promemoria per cliente, tipo e fine'
);

-- A new end (corrected): new reminders for it
update public.sales set data_fine = '2040-11-30' where id = '53530000-0000-4000-8000-0000000000a2';
select is(pg_temp.dovuti('2040-08-31', '53530000-0000-4000-8000-0000000000a1'),
  array['feedback_3_mesi:invia:2040-11-30'],
  'con la fine spostata al 30/11 la call dei 3 mesi riparte per la fine nuova');

-- ---------------------------------------------------------------------------
-- Who reads the reminders: the admin, nobody else
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select ok(
  (select count(*) from public.promemoria_percorso where client_id = '53530000-0000-4000-8000-0000000000a1') = 1,
  'l''admin legge i promemoria mandati'
);
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is((select count(*)::integer from public.promemoria_percorso), 0, 'il closer non li legge');
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::integer from public.promemoria_percorso), 0, 'il setter nemmeno');

-- ---------------------------------------------------------------------------
-- The Drive folder: admin only
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ insert into public.clienti_cartelle (client_id, url)
     values ('53530000-0000-4000-8000-0000000000a1', 'https://drive.google.com/drive/folders/1AbC-xyz_53') $$,
  'l''admin collega la cartella Drive del cliente'
);
select throws_ok(
  $$ insert into public.clienti_cartelle (client_id, url)
     values ('53530000-0000-4000-8000-0000000000b1', 'https://example.com/drive.google.com/x') $$,
  '23514', null,
  'solo un link di Google Drive'
);
select is(
  (select url from public.clienti_cartelle where client_id = '53530000-0000-4000-8000-0000000000a1'),
  'https://drive.google.com/drive/folders/1AbC-xyz_53',
  'e la legge'
);

-- the closer reads his client, never the folder
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(
  (select row(
     (select count(*) from public.clients where id = '53530000-0000-4000-8000-0000000000a1'),
     (select count(*) from public.clienti_cartelle))::text),
  '(1,0)',
  'il closer vede il suo cliente ma non la cartella Drive'
);
select throws_ok(
  $$ insert into public.clienti_cartelle (client_id, url)
     values ('53530000-0000-4000-8000-0000000000a1', 'https://drive.google.com/drive/folders/altro') $$,
  '42501', null,
  'e non la scrive'
);
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::integer from public.clienti_cartelle), 0, 'il setter non la vede');
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select is(
  (select row((select count(*) from public.clienti_cartelle), (select count(*) from public.promemoria_percorso))::text),
  '(0,0)',
  'il coach non vede né la cartella né i promemoria'
);

-- deleting the client: the preview says it, the folder and the reminders go with him
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(
  public.anteprima_eliminazione('cliente', '53530000-0000-4000-8000-0000000000a1') ->> 'cartella_drive',
  '1',
  'l''anteprima dell''eliminazione conta la cartella Drive'
);
select lives_ok(
  $$ select public.elimina_cliente('53530000-0000-4000-8000-0000000000a1') $$,
  'l''admin elimina il cliente'
);
reset role;
select is(
  (select row(
     (select count(*) from public.clienti_cartelle where client_id = '53530000-0000-4000-8000-0000000000a1'),
     (select count(*) from public.promemoria_percorso where client_id = '53530000-0000-4000-8000-0000000000a1'))::text),
  '(0,0)',
  'eliminato il cliente, se ne vanno la cartella e i promemoria'
);

select * from finish();
rollback;
