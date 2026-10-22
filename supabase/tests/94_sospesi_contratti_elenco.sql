-- "Sospendi" and the client list with the contract (Dany, 21/10/2026).
-- A client on hold is "sospeso": it wins over the states from the sales, never
-- over closed; closing him or a new nuovo/rinnovo path ends the hold (an upsell
-- does not); no path reminders while on hold. The contract link of a sale is
-- the admin's alone. clienti_elenco gives month and week of the current path,
-- paid, instalments left and lifetime paid, to the admin only.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(32);

insert into public.clients (id, nome, cognome, fonte, closer_id) values
  -- A: the seed closer's client, in progress, ends in 20 days
  ('94940000-0000-4000-8000-0000000000a1', 'Aldo', 'Sosta', 'dm_inbound', '33333333-3333-4333-8333-333333333333'),
  -- B: in progress, far from the end, 3 instalments of 500 (one paid, one late, one to come)
  ('94940000-0000-4000-8000-0000000000b1', 'Bruno', 'Paga', 'dm_inbound', null),
  -- C: another client in progress, for the closure and the new path
  ('94940000-0000-4000-8000-0000000000c1', 'Carlo', 'Pausa', 'dm_inbound', null);

insert into public.sales (id, client_id, prodotto_personalizzato, tipo, closer_id, data_vendita, data_inizio, data_fine, valore_contratto, numero_rate)
select v.id::uuid, v.cliente::uuid, 'Percorso di prova', 'nuovo', v.closer::uuid,
       public.oggi() + v.vendita, public.oggi() + v.inizio, public.oggi() + v.fine, v.valore, v.rate
from (values
  ('94940000-0000-4000-8000-0000000000a2', '94940000-0000-4000-8000-0000000000a1', '33333333-3333-4333-8333-333333333333', -170, -160, 20, 1500, 1),
  ('94940000-0000-4000-8000-0000000000b2', '94940000-0000-4000-8000-0000000000b1', null, -45, -45, 135, 1500, 3),
  ('94940000-0000-4000-8000-0000000000c2', '94940000-0000-4000-8000-0000000000c1', null, -20, -10, 170, 1500, 1)
) as v(id, cliente, closer, vendita, inizio, fine, valore, rate);

-- the sales came with their instalment plan: B's is paid, late, to come
update public.payments set scadenza = public.oggi() - 45, incassato_il = public.oggi() - 45,
  importo_incassato = 500, metodo = 'bonifico', stato = 'incassata'
  where sale_id = '94940000-0000-4000-8000-0000000000b2' and numero_rata = 1;
update public.payments set scadenza = public.oggi() - 5
  where sale_id = '94940000-0000-4000-8000-0000000000b2' and numero_rata = 2;
update public.payments set scadenza = public.oggi() + 25
  where sale_id = '94940000-0000-4000-8000-0000000000b2' and numero_rata = 3;
-- A and C paid their only instalment, by card
update public.payments p set incassato_il = s.data_vendita, importo_incassato = p.importo_previsto,
  metodo = 'stripe', stato = 'incassata'
  from public.sales s
  where p.sale_id = s.id and s.id in ('94940000-0000-4000-8000-0000000000a2', '94940000-0000-4000-8000-0000000000c2');

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

select is(pg_temp.stato('94940000-0000-4000-8000-0000000000a1'), 'in_scadenza', 'prima: A in scadenza');
select is(pg_temp.promemoria('94940000-0000-4000-8000-0000000000a1'), array['feedback_3_mesi:salta', 'rinnovo_1_mese:invia'],
  'prima: ad A tocca la call di rinnovo');

-- ---------------------------------------------------------------------------
-- The admin puts on hold
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select lives_ok(
  $$ insert into public.clienti_sospensioni (client_id, sospeso_il, motivo) values
       ('94940000-0000-4000-8000-0000000000a1', public.oggi(), 'Infortunio'),
       ('94940000-0000-4000-8000-0000000000b1', public.oggi() - 3, null),
       ('94940000-0000-4000-8000-0000000000c1', public.oggi(), null) $$,
  'l''admin sospende tre clienti'
);
select is(
  (select created_by::text from public.clienti_sospensioni where client_id = '94940000-0000-4000-8000-0000000000a1'),
  '11111111-1111-4111-8111-111111111111',
  'la sospensione ricorda chi l''ha fatta'
);
select throws_ok(
  $$ update public.clienti_sospensioni set sospeso_il = public.oggi() + 1
     where client_id = '94940000-0000-4000-8000-0000000000a1' $$,
  '22023', 'Il giorno della sospensione non può essere nel futuro',
  'mai un giorno nel futuro'
);
select throws_ok(
  $$ update public.clienti_sospensioni set motivo = repeat('x', 501)
     where client_id = '94940000-0000-4000-8000-0000000000a1' $$,
  '23514', null,
  'il motivo al massimo 500 caratteri'
);

select is(pg_temp.stato('94940000-0000-4000-8000-0000000000a1'), 'sospeso', 'in scadenza e sospeso: sospeso');
select is(pg_temp.stato('94940000-0000-4000-8000-0000000000b1'), 'sospeso', 'in corso e sospeso: sospeso');
select is(
  (select stato::text from public.v_clienti where client_id = '94940000-0000-4000-8000-0000000000a1'),
  'sospeso',
  'Clienti legge sospeso'
);
reset role;   -- the reminders are the cron's (service_role)
select is(pg_temp.promemoria('94940000-0000-4000-8000-0000000000a1'), '{}'::text[],
  'nessun promemoria del percorso a un cliente sospeso');
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';


-- ---------------------------------------------------------------------------
-- Closing, a new path, an upsell
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.clienti_chiusure (client_id, chiuso_il) values ('94940000-0000-4000-8000-0000000000c1', public.oggi()) $$,
  'l''admin chiude C mentre è sospeso'
);
select is(pg_temp.stato('94940000-0000-4000-8000-0000000000c1'), 'chiuso', 'chiuso vince su sospeso');
select is(
  (select count(*)::integer from public.clienti_sospensioni where client_id = '94940000-0000-4000-8000-0000000000c1'),
  0,
  'chiudere un cliente toglie la sua sospensione'
);

reset role;
insert into public.sales (client_id, prodotto_personalizzato, tipo, data_vendita, data_inizio, data_fine, valore_contratto, numero_rate)
values ('94940000-0000-4000-8000-0000000000b1', 'Upsell di prova', 'upsell', public.oggi(), public.oggi(), public.oggi() + 30, 100, 1);
select is(pg_temp.stato('94940000-0000-4000-8000-0000000000b1'), 'sospeso', 'un upsell non riattiva');
insert into public.sales (client_id, prodotto_personalizzato, tipo, data_vendita, data_inizio, data_fine, valore_contratto, numero_rate)
values ('94940000-0000-4000-8000-0000000000b1', 'Rinnovo di prova', 'rinnovo', public.oggi(), public.oggi() + 140, public.oggi() + 320, 900, 1);
select is(
  (select count(*)::integer from public.clienti_sospensioni where client_id = '94940000-0000-4000-8000-0000000000b1'),
  0,
  'un nuovo percorso (rinnovo) toglie la sospensione'
);
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(pg_temp.stato('94940000-0000-4000-8000-0000000000b1'), 'attivo', 'B torna attivo');

select lives_ok(
  $$ delete from public.clienti_sospensioni where client_id = '94940000-0000-4000-8000-0000000000a1' $$,
  '«Riattiva» toglie la sospensione'
);
select is(pg_temp.stato('94940000-0000-4000-8000-0000000000a1'), 'in_scadenza', 'A torna in scadenza');
reset role;
select is(pg_temp.promemoria('94940000-0000-4000-8000-0000000000a1'), array['feedback_3_mesi:salta', 'rinnovo_1_mese:invia'],
  'e ha di nuovo i promemoria dovuti');
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';


-- ---------------------------------------------------------------------------
-- The contract: the admin's alone
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into public.vendite_contratti (sale_id, url) values
       ('94940000-0000-4000-8000-0000000000a2', 'https://drive.google.com/file/d/abc123/view') $$,
  'l''admin lega il contratto di una vendita'
);
select throws_ok(
  $$ insert into public.vendite_contratti (sale_id, url) values
       ('94940000-0000-4000-8000-0000000000b2', 'https://example.com/contratto.pdf') $$,
  '23514', null,
  'solo link di Google Drive'
);
select throws_ok(
  $$ insert into public.vendite_contratti (sale_id, url) values
       ('94940000-0000-4000-8000-0000000000b2', 'http://drive.google.com/file/d/abc/view') $$,
  '23514', null,
  'solo https'
);

-- ---------------------------------------------------------------------------
-- The list
-- ---------------------------------------------------------------------------
select is(
  (select array[mese, mesi_totali]
   from public.clienti_elenco() where client_id = '94940000-0000-4000-8000-0000000000a1'),
  array[6, 6],
  'A: ultimo mese del suo percorso'
);
select is(
  (select array[settimana, settimane_totali]
   from public.clienti_elenco() where client_id = '94940000-0000-4000-8000-0000000000a1'),
  array[23, 26],
  'A: settimana 23 di 26 (160 giorni dal primo giorno: la 23ª)'
);
select is(
  (select array[incassato, da_incassare, in_ritardo, ltv]
   from public.clienti_elenco() where client_id = '94940000-0000-4000-8000-0000000000a1'),
  array[1500::numeric, 0, 0, 1500],
  'A: pagato e LTV'
);
select is(
  (select contratto_url from public.clienti_elenco() where client_id = '94940000-0000-4000-8000-0000000000a1'),
  'https://drive.google.com/file/d/abc123/view',
  'il contratto della vendita corrente sta nell''elenco'
);
select is(
  (select array[rate_totali, rate_incassate] from public.clienti_elenco(array['sospeso']::public.client_status[])
   where client_id = '94940000-0000-4000-8000-0000000000b1'),
  null,
  'il filtro per stato: B non è più sospeso'
);
select is(
  (select array_agg(client_id::text order by client_id) from public.clienti_elenco(array['chiuso']::public.client_status[])
   where client_id::text like '94940000-%'),
  array['94940000-0000-4000-8000-0000000000c1'],
  'il filtro per stato: solo C è chiuso'
);

-- ---------------------------------------------------------------------------
-- Nobody else
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select throws_ok(
  $$ select * from public.clienti_elenco() $$,
  '42501', null,
  'il closer non vede l''elenco con i contratti'
);
select is(
  (select count(*)::integer from public.vendite_contratti),
  0,
  'il closer non legge il contratto nemmeno delle sue vendite'
);
select is(
  (select count(*)::integer from public.clienti_sospensioni where client_id::text like '94940000-%'),
  0,
  'il closer legge le sospensioni dei suoi clienti: A non è più sospeso'
);
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok(
  $$ insert into public.clienti_sospensioni (client_id, sospeso_il) values ('94940000-0000-4000-8000-0000000000a1', public.oggi()) $$,
  '42501', null,
  'il setter non sospende'
);

select * from finish();
rollback;
