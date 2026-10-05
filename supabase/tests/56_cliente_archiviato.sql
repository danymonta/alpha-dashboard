-- "Archivia come ex cliente" (Dany, 05/10/2026): a closed client who does not
-- buy again is archived by the admin and becomes ex_cliente; "Togli
-- dall'archivio" brings him back to chiuso; "Riapri" and a new nuovo or
-- rinnovo path end the closure and the archiving with it; an upsell does not.
-- The archiving day lives on the closure: the admin writes it, the client's
-- closer reads it, nobody else. Still no path reminders; the metrics from the
-- sale dates do not change.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(37);

select has_column('public', 'clienti_chiusure', 'archiviato_il', 'la chiusura ha il giorno dell''archivio');
select col_type_is('public', 'clienti_chiusure', 'archiviato_il', 'date', 'una data');
select col_is_null('public', 'clienti_chiusure', 'archiviato_il', 'vuota finché non si archivia');

insert into public.clients (id, nome, cognome, fonte, closer_id) values
  -- A: the seed closer's client, ends in 20 days
  ('56560000-0000-4000-8000-0000000000a1', 'Aldo', 'Archivio', 'dm_inbound', '33333333-3333-4333-8333-333333333333'),
  -- B: ended 20 days ago
  ('56560000-0000-4000-8000-0000000000b1', 'Bruno', 'Archivio', 'dm_inbound', null),
  -- C: ended 40 days ago
  ('56560000-0000-4000-8000-0000000000c1', 'Carlo', 'Archivio', 'dm_inbound', null);

insert into public.sales (id, client_id, prodotto_personalizzato, tipo, closer_id, data_vendita, data_inizio, data_fine, valore_contratto, numero_rate)
select v.id::uuid, v.cliente::uuid, 'Percorso di prova', 'nuovo', v.closer::uuid,
       public.oggi() + v.vendita, public.oggi() + v.inizio, public.oggi() + v.fine, 1500, 1
from (values
  ('56560000-0000-4000-8000-0000000000a2', '56560000-0000-4000-8000-0000000000a1', '33333333-3333-4333-8333-333333333333', -170, -160, 20),
  ('56560000-0000-4000-8000-0000000000b2', '56560000-0000-4000-8000-0000000000b1', null, -110, -100, -20),
  ('56560000-0000-4000-8000-0000000000c2', '56560000-0000-4000-8000-0000000000c1', null, -130, -120, -40)
) as v(id, cliente, closer, vendita, inizio, fine);

create function pg_temp.stato(p_cliente uuid)
returns text
language sql
as $$
  select stato::text from public.v_client_status where client_id = p_cliente;
$$;

-- ---------------------------------------------------------------------------
-- The admin closes, then archives
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

insert into public.clienti_chiusure (client_id, chiuso_il, motivo) values
  ('56560000-0000-4000-8000-0000000000a1', public.oggi() - 2, 'Non prosegue'),
  ('56560000-0000-4000-8000-0000000000b1', public.oggi() - 10, null),
  ('56560000-0000-4000-8000-0000000000c1', public.oggi() - 5, null);

select is(pg_temp.stato('56560000-0000-4000-8000-0000000000b1'), 'chiuso', 'prima dell''archivio: chiuso');

select lives_ok(
  $$ update public.clienti_chiusure set archiviato_il = public.oggi() - 5
     where client_id = '56560000-0000-4000-8000-0000000000b1' $$,
  'l''admin archivia un cliente chiuso'
);
select is(pg_temp.stato('56560000-0000-4000-8000-0000000000b1'), 'ex_cliente', 'chiuso e archiviato: ex cliente');
select is(
  (select stato::text from public.v_clienti where client_id = '56560000-0000-4000-8000-0000000000b1'),
  'ex_cliente',
  'Clienti legge ex cliente (il filtro «Ex cliente»)'
);
select is(
  (select archiviato_il from public.v_clienti_chiusi where client_id = '56560000-0000-4000-8000-0000000000b1'),
  public.oggi() - 5,
  'la chiusura in vigore dice da quando è archiviato'
);
select is(pg_temp.stato('56560000-0000-4000-8000-0000000000c1'), 'chiuso', 'un chiuso non archiviato resta chiuso');

-- Rinnovi: "Non rinnovano" is the closed ones only, the archived one goes
select is(
  (select array_agg(cognome || ' ' || nome order by nome) from public.v_clienti
   where stato = 'chiuso' and client_id::text like '56560000-%'),
  array['Archivio Aldo', 'Archivio Carlo'],
  'Non rinnovano: senza l''archiviato'
);

-- the day: never in the future, never before the closing day
select throws_ok(
  $$ update public.clienti_chiusure set archiviato_il = public.oggi() + 1
     where client_id = '56560000-0000-4000-8000-0000000000c1' $$,
  '22023', 'Il giorno dell''archivio non può essere nel futuro',
  'mai archiviato nel futuro'
);
select throws_like(
  $$ update public.clienti_chiusure set archiviato_il = public.oggi() - 6
     where client_id = '56560000-0000-4000-8000-0000000000c1' $$,
  'Il giorno dell''archivio (%) non può venire prima della chiusura (%)',
  'mai archiviato prima del giorno della chiusura'
);
select throws_like(
  $$ update public.clienti_chiusure set chiuso_il = public.oggi() - 3
     where client_id = '56560000-0000-4000-8000-0000000000b1' $$,
  'Il giorno dell''archivio (%) non può venire prima della chiusura (%)',
  'la chiusura non si sposta dopo il giorno dell''archivio'
);
select lives_ok(
  $$ update public.clienti_chiusure set motivo = 'Si allena da solo'
     where client_id = '56560000-0000-4000-8000-0000000000b1' $$,
  'il motivo di un archiviato si corregge'
);
select is(
  (select archiviato_il from public.clienti_chiusure where client_id = '56560000-0000-4000-8000-0000000000b1'),
  public.oggi() - 5,
  'e l''archivio resta'
);

-- archived with the path still running: ex cliente, never among the ones that end soon
update public.clienti_chiusure set archiviato_il = public.oggi()
where client_id = '56560000-0000-4000-8000-0000000000a1';
select is(pg_temp.stato('56560000-0000-4000-8000-0000000000a1'), 'ex_cliente',
  'archiviato anche col percorso in corso: ex cliente');
select is(
  (select count(*)::integer from public.v_clienti
   where data_fine_ultima between public.oggi() and public.oggi() + 30
     and stato not in ('chiuso', 'ex_cliente') and client_id::text like '56560000-%'),
  0,
  'In scadenza (Rinnovi e Panoramica): nessun archiviato'
);
select is(
  (select count(*)::integer from public.sales
   where public.oggi() between data_inizio and data_fine and client_id::text like '56560000-%'),
  1,
  'le metriche dalle date non cambiano'
);

reset role;   -- the reminders are the cron's (service_role)
select is(
  (select count(*)::integer from public.promemoria_percorso_da_inviare(public.oggi()) x
   where x.client_id = '56560000-0000-4000-8000-0000000000a1'),
  0,
  'archiviato: nessun promemoria del percorso'
);

-- ---------------------------------------------------------------------------
-- Who reads and writes it
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(
  (select array_agg(client_id::text || ':' || coalesce(archiviato_il::text, '-'))
   from public.clienti_chiusure where client_id::text like '56560000-%'),
  array['56560000-0000-4000-8000-0000000000a1:' || public.oggi()::text],
  'il closer legge l''archivio solo del suo cliente'
);
select is(pg_temp.stato('56560000-0000-4000-8000-0000000000a1'), 'ex_cliente',
  'e lo vede ex cliente come l''admin');
update public.clienti_chiusure set archiviato_il = null where client_id = '56560000-0000-4000-8000-0000000000a1';
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(
  (select archiviato_il from public.clienti_chiusure where client_id = '56560000-0000-4000-8000-0000000000a1'),
  public.oggi(),
  'il closer non toglie l''archivio'
);

set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(
  (select count(*)::integer from public.clienti_chiusure where client_id::text like '56560000-%'),
  0,
  'il setter non legge l''archivio'
);
update public.clienti_chiusure set archiviato_il = public.oggi() where client_id = '56560000-0000-4000-8000-0000000000c1';
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select is(
  (select count(*)::integer from public.clienti_chiusure where client_id::text like '56560000-%'),
  0,
  'il coach nemmeno'
);
update public.clienti_chiusure set archiviato_il = public.oggi() where client_id = '56560000-0000-4000-8000-0000000000c1';
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(
  (select archiviato_il from public.clienti_chiusure where client_id = '56560000-0000-4000-8000-0000000000c1'),
  null,
  'né il setter né il coach archiviano'
);

-- ---------------------------------------------------------------------------
-- "Togli dall'archivio", "Riapri", buying again
-- ---------------------------------------------------------------------------
update public.clienti_chiusure set archiviato_il = null where client_id = '56560000-0000-4000-8000-0000000000a1';
select is(pg_temp.stato('56560000-0000-4000-8000-0000000000a1'), 'chiuso', 'tolto dall''archivio: di nuovo chiuso');
select is(
  (select row(chiuso_il = public.oggi() - 2, motivo)::text from public.clienti_chiusure
   where client_id = '56560000-0000-4000-8000-0000000000a1'),
  '(t,"Non prosegue")',
  'con il giorno e il motivo della chiusura di prima'
);

-- "Riapri" on an archived client: the closure goes, the archiving with it
delete from public.clienti_chiusure where client_id = '56560000-0000-4000-8000-0000000000b1';
select is(pg_temp.stato('56560000-0000-4000-8000-0000000000b1'), 'scaduto', 'riaperto: lo stato dalle date');
select is(
  (select count(*)::integer from public.clienti_chiusure where client_id = '56560000-0000-4000-8000-0000000000b1'),
  0,
  'niente chiusura né archivio'
);

-- C archived; an upsell does not reopen him, a renewal does
update public.clienti_chiusure set archiviato_il = public.oggi() where client_id = '56560000-0000-4000-8000-0000000000c1';
select is(pg_temp.stato('56560000-0000-4000-8000-0000000000c1'), 'ex_cliente', 'C archiviato');
insert into public.sales (id, client_id, prodotto_personalizzato, tipo, data_vendita, data_inizio, data_fine, valore_contratto, numero_rate)
values ('56560000-0000-4000-8000-0000000000c3', '56560000-0000-4000-8000-0000000000c1', 'Corso', 'upsell',
        public.oggi(), public.oggi(), public.oggi() + 30, 200, 1);
select is(pg_temp.stato('56560000-0000-4000-8000-0000000000c1'), 'ex_cliente', 'un upsell non lo toglie dall''archivio');
insert into public.sales (id, client_id, prodotto_personalizzato, tipo, data_vendita, data_inizio, data_fine, valore_contratto, numero_rate)
values ('56560000-0000-4000-8000-0000000000c4', '56560000-0000-4000-8000-0000000000c1', 'Percorso di prova', 'rinnovo',
        public.oggi(), public.oggi() + 7, public.oggi() + 97, 1500, 1);
select is(pg_temp.stato('56560000-0000-4000-8000-0000000000c1'), 'attivo',
  'un rinnovo lo riapre da solo, anche archiviato (lo stato dalle date: l''upsell è in corso)');
select is(
  (select count(*)::integer from public.clienti_chiusure where client_id = '56560000-0000-4000-8000-0000000000c1'),
  0,
  'e chiusura e archivio se ne vanno'
);

-- closed again later: a new closure starts without the old archiving
insert into public.clienti_chiusure (client_id, chiuso_il) values ('56560000-0000-4000-8000-0000000000c1', public.oggi());
select is(pg_temp.stato('56560000-0000-4000-8000-0000000000c1'), 'chiuso', 'richiuso: chiuso, non archiviato');
select is(
  (select archiviato_il from public.clienti_chiusure where client_id = '56560000-0000-4000-8000-0000000000c1'),
  null,
  'l''archivio di prima non torna'
);

-- archiving and closing in one go (a restore): the same rules
select lives_ok(
  $$ update public.clienti_chiusure set archiviato_il = public.oggi()
     where client_id = '56560000-0000-4000-8000-0000000000c1' $$,
  'archiviato il giorno stesso della chiusura'
);

reset role;
select is(
  (select has_table_privilege('anon', 'public.v_clienti_chiusi', 'select')),
  false,
  'anon niente'
);

select * from finish();
rollback;
