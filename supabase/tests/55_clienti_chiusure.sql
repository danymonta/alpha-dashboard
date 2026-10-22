-- "Non rinnova" (Dany, 04/10/2026): the admin closes a client who does not
-- renew. chiuso wins over every other derived state, even while the path runs;
-- a new nuovo or rinnovo path reopens the client by itself, deleting the
-- closure (the same day, or registered late; never an upsell, never an old
-- path that ended before the closing day); "Riapri" deletes the closure. A closed client gets no path
-- reminder, reopened he gets the ones still due. The table: the admin does
-- everything, the closer of the client reads it, nobody else.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(49);

select is(
  enum_range(null::public.client_status)::text[],
  array['attivo', 'in_scadenza', 'da_iniziare', 'sospeso', 'scaduto', 'chiuso', 'ex_cliente', 'mai_attivato'],
  'chiuso sta dopo scaduto (l''elenco Clienti è ordinato per stato)'
);

insert into public.clients (id, nome, cognome, fonte, closer_id) values
  -- A: the seed closer's client, ends in 20 days (in scadenza)
  ('55550000-0000-4000-8000-0000000000a1', 'Aldo', 'Scade', 'dm_inbound', '33333333-3333-4333-8333-333333333333'),
  -- B: ended 20 days ago (scaduto), no closer
  ('55550000-0000-4000-8000-0000000000b1', 'Bruno', 'Finito', 'dm_inbound', null),
  -- C: in progress, far from the end
  ('55550000-0000-4000-8000-0000000000c1', 'Carlo', 'Incorso', 'dm_inbound', null),
  -- D: ended 10 days ago, then an upsell
  ('55550000-0000-4000-8000-0000000000d1', 'Dario', 'Upsell', 'dm_inbound', null);

insert into public.sales (id, client_id, prodotto_personalizzato, tipo, closer_id, data_vendita, data_inizio, data_fine, valore_contratto, numero_rate)
select v.id::uuid, v.cliente::uuid, 'Percorso di prova', 'nuovo', v.closer::uuid,
       public.oggi() + v.vendita, public.oggi() + v.inizio, public.oggi() + v.fine, 1500, 1
from (values
  ('55550000-0000-4000-8000-0000000000a2', '55550000-0000-4000-8000-0000000000a1', '33333333-3333-4333-8333-333333333333', -170, -160, 20),
  ('55550000-0000-4000-8000-0000000000b2', '55550000-0000-4000-8000-0000000000b1', null, -110, -100, -20),
  ('55550000-0000-4000-8000-0000000000c2', '55550000-0000-4000-8000-0000000000c1', null, -20, -10, 170),
  ('55550000-0000-4000-8000-0000000000d2', '55550000-0000-4000-8000-0000000000d1', null, -100, -90, -10)
) as v(id, cliente, closer, vendita, inizio, fine);

create function pg_temp.stato(p_cliente uuid)
returns text
language sql
as $$
  select stato::text from public.v_client_status where client_id = p_cliente;
$$;

create function pg_temp.promemoria(p_cliente uuid)
returns text[]
language sql
as $$
  select coalesce(array_agg(x.tipo::text || ':' || x.azione order by x.tipo), '{}')
  from public.promemoria_percorso_da_inviare(public.oggi()) x
  where x.client_id = p_cliente;
$$;

select is(pg_temp.stato('55550000-0000-4000-8000-0000000000a1'), 'in_scadenza', 'prima: A in scadenza');
-- past both thresholds (catch-up): the renewal one goes, the feedback one is skipped
select is(pg_temp.promemoria('55550000-0000-4000-8000-0000000000a1'), array['feedback_3_mesi:salta', 'rinnovo_1_mese:invia'],
  'prima: ad A tocca la call di rinnovo');

-- ---------------------------------------------------------------------------
-- The admin closes
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ insert into public.clienti_chiusure (client_id, chiuso_il, motivo) values
       ('55550000-0000-4000-8000-0000000000a1', public.oggi(), 'Non vuole proseguire'),
       ('55550000-0000-4000-8000-0000000000b1', public.oggi() - 3, null),
       ('55550000-0000-4000-8000-0000000000c1', public.oggi(), null),
       ('55550000-0000-4000-8000-0000000000d1', public.oggi() - 5, null) $$,
  'l''admin chiude quattro clienti'
);
select is(
  (select created_by::text from public.clienti_chiusure where client_id = '55550000-0000-4000-8000-0000000000a1'),
  '11111111-1111-4111-8111-111111111111',
  'la chiusura ricorda chi l''ha fatta'
);
select throws_ok(
  $$ update public.clienti_chiusure set chiuso_il = public.oggi() + 1
     where client_id = '55550000-0000-4000-8000-0000000000a1' $$,
  '22023', 'Il giorno della chiusura non può essere nel futuro',
  'mai un giorno nel futuro'
);
select throws_ok(
  $$ update public.clienti_chiusure set chiuso_il = public.oggi() - 30
     where client_id = '55550000-0000-4000-8000-0000000000c1' $$,
  '22023', null,
  'mai prima della firma del suo ultimo percorso (chiusa prima di cominciare)'
);
select throws_ok(
  $$ update public.clienti_chiusure set motivo = repeat('x', 501)
     where client_id = '55550000-0000-4000-8000-0000000000a1' $$,
  '23514', null,
  'il motivo al massimo 500 caratteri'
);

select is(pg_temp.stato('55550000-0000-4000-8000-0000000000a1'), 'chiuso', 'in scadenza e chiuso: chiuso');
select is(pg_temp.stato('55550000-0000-4000-8000-0000000000b1'), 'chiuso', 'scaduto e chiuso: chiuso');
select is(pg_temp.stato('55550000-0000-4000-8000-0000000000c1'), 'chiuso',
  'chiuso vince anche col percorso ancora in corso');
select is(
  (select stato::text from public.v_clienti where client_id = '55550000-0000-4000-8000-0000000000a1'),
  'chiuso',
  'Clienti legge chiuso'
);
-- Rinnovi: "In scadenza" by the dates without the closed, "Da recuperare" the scaduti only (the pages' queries)
select is(
  (select count(*)::integer from public.v_clienti
   where data_fine_ultima between public.oggi() and public.oggi() + 30
     and stato <> 'chiuso' and client_id::text like '55550000-%'),
  0,
  'In scadenza (Rinnovi e Panoramica): nessun chiuso'
);
select is(
  (select count(*)::integer from public.v_clienti where stato = 'scaduto' and client_id::text like '55550000-%'),
  0,
  'Da recuperare: nessun chiuso'
);
select is(
  (select array_agg(c.cognome || ':' || ch.chiuso_il::text order by c.cognome)
   from public.v_clienti_chiusi ch join public.clients c on c.id = ch.client_id
   where ch.client_id::text like '55550000-%'),
  array['Finito:' || (public.oggi() - 3)::text, 'Incorso:' || public.oggi()::text,
        'Scade:' || public.oggi()::text, 'Upsell:' || (public.oggi() - 5)::text],
  'Non rinnovano: i quattro chiusi con il loro giorno'
);
-- the metrics read the sale dates: "Clienti attivi" still counts A and C
select is(
  (select count(*)::integer from public.sales
   where public.oggi() between data_inizio and data_fine and client_id::text like '55550000-%'),
  2,
  'le metriche dalle date non cambiano'
);

-- ---------------------------------------------------------------------------
-- Buying again reopens (the closure row goes), an upsell does not
-- ---------------------------------------------------------------------------
insert into public.sales (id, client_id, prodotto_personalizzato, tipo, data_vendita, data_inizio, data_fine, valore_contratto, numero_rate)
values ('55550000-0000-4000-8000-0000000000d3', '55550000-0000-4000-8000-0000000000d1', 'Corso', 'upsell',
        public.oggi() - 1, public.oggi() - 1, public.oggi() + 60, 300, 1);
select is(pg_temp.stato('55550000-0000-4000-8000-0000000000d1'), 'chiuso', 'un upsell dopo la chiusura non lo riapre');

insert into public.sales (id, client_id, prodotto_personalizzato, tipo, data_vendita, data_inizio, data_fine, valore_contratto, numero_rate)
values ('55550000-0000-4000-8000-0000000000b3', '55550000-0000-4000-8000-0000000000b1', 'Percorso di prova', 'rinnovo',
        public.oggi() - 1, public.oggi() + 7, public.oggi() + 96, 1500, 1);
select is(pg_temp.stato('55550000-0000-4000-8000-0000000000b1'), 'da_iniziare',
  'un rinnovo firmato dopo la chiusura lo riapre da solo, con lo stato dalle date');
select is(
  (select count(*)::integer from public.clienti_chiusure where client_id = '55550000-0000-4000-8000-0000000000b1'),
  0,
  'e la riga della chiusura se ne va'
);
-- the sale that reopened him goes: he stays open (closing again is "Non rinnova" again)
delete from public.sales where id = '55550000-0000-4000-8000-0000000000b3';
select is(pg_temp.stato('55550000-0000-4000-8000-0000000000b1'), 'scaduto',
  'eliminata quella vendita resta aperto, con lo stato dalle date');

-- "Ha rinnovato" the same day as the closure: the form proposes today
select lives_ok(
  $$ insert into public.clienti_chiusure (client_id, chiuso_il) values ('55550000-0000-4000-8000-0000000000b1', public.oggi()) $$,
  'si richiude da oggi'
);
select is(pg_temp.stato('55550000-0000-4000-8000-0000000000b1'), 'chiuso', 'ed è di nuovo chiuso');
insert into public.sales (id, client_id, prodotto_personalizzato, tipo, data_vendita, data_inizio, data_fine, valore_contratto, numero_rate)
values ('55550000-0000-4000-8000-0000000000b4', '55550000-0000-4000-8000-0000000000b1', 'Percorso di prova', 'rinnovo',
        public.oggi(), public.oggi() + 1, public.oggi() + 181, 1500, 1);
select is(pg_temp.stato('55550000-0000-4000-8000-0000000000b1'), 'da_iniziare',
  'un rinnovo firmato il giorno stesso della chiusura lo riapre');
reset role;   -- the reminders are the cron's (service_role)
select is(
  (select coalesce(array_agg(x.tipo::text || ':' || x.azione order by x.tipo), '{}')
   from public.promemoria_percorso_da_inviare(public.oggi() + 161) x
   where x.client_id = '55550000-0000-4000-8000-0000000000b1'),
  array['feedback_3_mesi:salta', 'rinnovo_1_mese:invia'],
  'e il nuovo percorso ha i suoi promemoria'
);
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

-- a renewal recorded late, signed two days before the closing day (D: closed 5 days ago)
insert into public.sales (id, client_id, prodotto_personalizzato, tipo, data_vendita, data_inizio, data_fine, valore_contratto, numero_rate)
values ('55550000-0000-4000-8000-0000000000d4', '55550000-0000-4000-8000-0000000000d1', 'Percorso di prova', 'rinnovo',
        public.oggi() - 7, public.oggi() - 7, public.oggi() + 83, 1500, 1);
select is(pg_temp.stato('55550000-0000-4000-8000-0000000000d1'), 'attivo',
  'un rinnovo registrato in ritardo, firmato prima della chiusura, lo riapre');

-- history: an old path, signed and ended before the closing day, recorded late
select lives_ok(
  $$ insert into public.clienti_chiusure (client_id, chiuso_il) values ('55550000-0000-4000-8000-0000000000d1', public.oggi()) $$,
  'e lo richiude'
);
insert into public.sales (id, client_id, prodotto_personalizzato, tipo, data_vendita, data_inizio, data_fine, valore_contratto, numero_rate)
values ('55550000-0000-4000-8000-0000000000d5', '55550000-0000-4000-8000-0000000000d1', 'Percorso di prova', 'nuovo',
        public.oggi() - 400, public.oggi() - 400, public.oggi() - 310, 1500, 1);
select is(pg_temp.stato('55550000-0000-4000-8000-0000000000d1'), 'chiuso',
  'un vecchio percorso registrato dopo, finito prima della chiusura, non lo riapre');
-- an upsell corrected into a renewal is a new path
update public.sales set tipo = 'rinnovo' where id = '55550000-0000-4000-8000-0000000000d3';
select is(pg_temp.stato('55550000-0000-4000-8000-0000000000d1'), 'attivo',
  'un upsell corretto in rinnovo lo riapre');

-- ---------------------------------------------------------------------------
-- Who reads and writes the table
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(
  (select array_agg(client_id::text) from public.clienti_chiusure where client_id::text like '55550000-%'),
  array['55550000-0000-4000-8000-0000000000a1'],
  'il closer legge solo la chiusura del suo cliente'
);
select is(pg_temp.stato('55550000-0000-4000-8000-0000000000a1'), 'chiuso',
  'e il suo cliente risulta chiuso anche per lui');
select throws_ok(
  $$ insert into public.clienti_chiusure (client_id, chiuso_il)
     values ('55550000-0000-4000-8000-0000000000c1', public.oggi()) $$,
  '42501', null,
  'il closer non chiude un cliente'
);
update public.clienti_chiusure set motivo = 'cambiato dal closer' where client_id = '55550000-0000-4000-8000-0000000000a1';
delete from public.clienti_chiusure where client_id = '55550000-0000-4000-8000-0000000000a1';

set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::integer from public.clienti_chiusure), 0, 'il setter non legge le chiusure');
select throws_ok(
  $$ insert into public.clienti_chiusure (client_id, chiuso_il)
     values ('55550000-0000-4000-8000-0000000000c1', public.oggi()) $$,
  '42501', null,
  'e non le scrive'
);
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select is((select count(*)::integer from public.clienti_chiusure), 0, 'il coach non legge le chiusure');

set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(
  (select motivo from public.clienti_chiusure where client_id = '55550000-0000-4000-8000-0000000000a1'),
  'Non vuole proseguire',
  'il closer non ha cambiato né tolto la chiusura'
);

reset role;
select is(
  (select row(has_table_privilege('anon', 'public.clienti_chiusure', 'select'),
              has_table_privilege('anon', 'public.v_clienti_chiusi', 'select'))::text),
  '(f,f)',
  'anon niente'
);

-- ---------------------------------------------------------------------------
-- Path reminders: none while closed, the ones still due once reopened
-- ---------------------------------------------------------------------------
select is(pg_temp.promemoria('55550000-0000-4000-8000-0000000000a1'), '{}'::text[],
  'chiuso: nessun promemoria del percorso');
select is(
  (select count(*)::integer from public.promemoria_percorso where client_id = '55550000-0000-4000-8000-0000000000a1'),
  0,
  'e niente registrato per lui'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
-- "Riapri": the closure goes
delete from public.clienti_chiusure where client_id = '55550000-0000-4000-8000-0000000000a1';
select is(pg_temp.stato('55550000-0000-4000-8000-0000000000a1'), 'in_scadenza', 'riaperto: di nuovo in scadenza');
reset role;
select is(pg_temp.promemoria('55550000-0000-4000-8000-0000000000a1'), array['feedback_3_mesi:salta', 'rinnovo_1_mese:invia'],
  'riaperto: la call di rinnovo ancora dovuta riparte');

-- ---------------------------------------------------------------------------
-- The closer's client reopened by a sale the closer cannot read
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
insert into public.clienti_chiusure (client_id, chiuso_il) values ('55550000-0000-4000-8000-0000000000a1', public.oggi() - 3);
-- the renewal Dany records himself: he is its closer
insert into public.sales (id, client_id, prodotto_personalizzato, tipo, closer_id, data_vendita, data_inizio, data_fine, valore_contratto, numero_rate)
values ('55550000-0000-4000-8000-0000000000a3', '55550000-0000-4000-8000-0000000000a1', 'Percorso di prova', 'rinnovo',
        '11111111-1111-4111-8111-111111111111', public.oggi(), public.oggi() + 21, public.oggi() + 201, 1500, 1);
select is(pg_temp.stato('55550000-0000-4000-8000-0000000000a1'), 'attivo', 'riaperto dal rinnovo: attivo per l''admin');
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(
  (select count(*)::integer from public.clienti_chiusure where client_id = '55550000-0000-4000-8000-0000000000a1'),
  0,
  'il closer non legge più una chiusura che non vale'
);
select isnt(pg_temp.stato('55550000-0000-4000-8000-0000000000a1'), 'chiuso',
  'e non vede chiuso il suo cliente, anche se il rinnovo non lo legge');

-- ---------------------------------------------------------------------------
-- Removing the person who closed a client: the closing day is not checked again
-- ---------------------------------------------------------------------------
reset role;
insert into public.invites (email, ruolo) values ('chiude.e.va@alpha.test', 'setter');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', '55550000-0000-4000-8000-0000000000e9',
  'authenticated', 'authenticated', 'chiude.e.va@alpha.test', '', now(),
  '{}'::jsonb, '{"full_name":"Chiude E Va"}'::jsonb, now(), now(), '', '', '', '');
update public.clienti_chiusure set created_by = '55550000-0000-4000-8000-0000000000e9'
where client_id = '55550000-0000-4000-8000-0000000000c1';
-- a closure that no longer counts (written with the reopening trigger off, as a restore would)
alter table public.sales disable trigger sales_riapre_cliente_chiuso;
insert into public.sales (id, client_id, prodotto_personalizzato, tipo, data_vendita, data_inizio, data_fine, valore_contratto, numero_rate)
values ('55550000-0000-4000-8000-0000000000c3', '55550000-0000-4000-8000-0000000000c1', 'Percorso di prova', 'rinnovo',
        public.oggi() + 1, public.oggi() + 171, public.oggi() + 260, 1500, 1);
alter table public.sales enable trigger sales_riapre_cliente_chiuso;
select is(pg_temp.stato('55550000-0000-4000-8000-0000000000c1'), 'attivo',
  'una chiusura rimasta dopo una vendita firmata più tardi non vale (la regola delle date resta come rete)');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select public.elimina_persona('55550000-0000-4000-8000-0000000000e9') $$,
  'eliminare chi ha chiuso un cliente non si blocca sul giorno della chiusura'
);
reset role;
select is(
  (select created_by from public.clienti_chiusure where client_id = '55550000-0000-4000-8000-0000000000c1'),
  null,
  'la chiusura resta senza il suo nome'
);

-- ---------------------------------------------------------------------------
-- Deleting the client takes the closure with him
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
insert into public.clienti_chiusure (client_id, chiuso_il) values ('55550000-0000-4000-8000-0000000000b1', public.oggi());
select lives_ok(
  $$ select public.elimina_cliente('55550000-0000-4000-8000-0000000000c1') $$,
  'l''admin elimina un cliente chiuso'
);
reset role;
select is(
  (select count(*)::integer from public.clienti_chiusure where client_id = '55550000-0000-4000-8000-0000000000c1'),
  0,
  'la chiusura se ne va con lui'
);
select is(
  (select array_agg(client_id::text) from public.clienti_chiusure where client_id::text like '55550000-%'),
  array['55550000-0000-4000-8000-0000000000b1'],
  'le altre restano'
);

select * from finish();
rollback;
