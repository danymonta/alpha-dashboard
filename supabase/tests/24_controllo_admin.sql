-- The admin has full control: custom sales and plans, instalments added and
-- removed, every record deletable with what goes with it.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(20);

-- Fixtures: a client with a first sale (so a renewal is allowed), a person to delete
insert into public.invites (email, ruolo) values ('da.eliminare@alpha.test', 'setter');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values ('00000000-0000-0000-0000-000000000000', 'dddd1111-0000-4000-8000-00000000000d',
  'authenticated', 'authenticated', 'da.eliminare@alpha.test', '', now(),
  '{}'::jsonb, '{"full_name":"Da Eliminare"}'::jsonb, now(), now(), '', '', '', '');

insert into public.clients (id, nome, cognome, setter_id)
values ('dddd2222-0000-4000-8000-000000000001', 'Cliente', 'Rinnovo Custom', 'dddd1111-0000-4000-8000-00000000000d');
insert into public.sales (id, client_id, product_id, tipo, data_vendita, data_inizio, data_fine, valore_contratto, numero_rate, setter_id)
select 'dddd3333-0000-4000-8000-000000000001', 'dddd2222-0000-4000-8000-000000000001', id, 'nuovo',
       '2031-01-10', '2031-01-10', '2031-04-09', 1500, 1, 'dddd1111-0000-4000-8000-00000000000d'
from public.products order by created_at limit 1;
insert into public.setter_daily_reports (setter_id, data, dm_outbound) values ('dddd1111-0000-4000-8000-00000000000d', '2031-01-10', 10);
insert into public.commission_rules (profile_id, percentuale, applica_a, valida_dal)
values ('dddd1111-0000-4000-8000-00000000000d', 0.05, '{nuovo}', '2031-01-01');
insert into public.leads (id, nome, setter_id, fonte) values ('dddd4444-0000-4000-8000-000000000001', 'Lead da eliminare', 'dddd1111-0000-4000-8000-00000000000d', 'altro');
insert into public.calls (id, lead_id, setter_id, closer_id, tipo, programmata_il, stato, esito, qualificata)
values ('dddd5555-0000-4000-8000-000000000001', 'dddd4444-0000-4000-8000-000000000001', 'dddd1111-0000-4000-8000-00000000000d',
        '11111111-1111-4111-8111-111111111111', 'strategy', '2031-01-09 12:00+00', 'svolta', 'chiusa', true);
update public.sales set call_id = 'dddd5555-0000-4000-8000-000000000001' where id = 'dddd3333-0000-4000-8000-000000000001';

create temp table ids (chiave text primary key, id uuid);
grant all on ids to authenticated;

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

-- Saverio's case: a yearly renewal at 2.500 €, 3 × 500 then 3 × 333,33
insert into ids
select 'vendita', id_vendita from public.registra_vendita(
  null, 'rinnovo', '2031-05-10', '2031-05-10', 2500, 1,
  p_client_id => 'dddd2222-0000-4000-8000-000000000001',
  p_prodotto_personalizzato => 'Annuale',
  p_data_fine => '2032-05-09',
  p_rate => '[{"scadenza":"2031-05-10","importo":500},{"scadenza":"2031-06-10","importo":500},{"scadenza":"2031-07-10","importo":500},
              {"scadenza":"2031-10-10","importo":333.33},{"scadenza":"2031-11-10","importo":333.33},{"scadenza":"2031-12-10","importo":333.34}]'::jsonb
);

select is(
  (select row(prodotto_personalizzato, numero_rate, data_fine)::text from public.sales where id = (select id from ids where chiave = 'vendita')),
  '(Annuale,6,2032-05-09)',
  'una vendita personalizzata tiene il nome del percorso, le sue rate e la sua fine'
);
select is(
  (select array_agg(importo_previsto order by numero_rata) from public.payments where sale_id = (select id from ids where chiave = 'vendita')),
  array[500, 500, 500, 333.33, 333.33, 333.34]::numeric[],
  'il piano scritto a mano sostituisce quello automatico'
);
select is(
  (select array_agg(scadenza order by numero_rata) from public.payments where sale_id = (select id from ids where chiave = 'vendita'))[4],
  '2031-10-10'::date,
  'con le sue date, anche dopo una pausa'
);

select throws_ok(
  $$ select * from public.registra_vendita(null, 'rinnovo', '2031-05-10', '2031-05-10', 2500, 1,
       p_client_id => 'dddd2222-0000-4000-8000-000000000001', p_prodotto_personalizzato => 'Annuale', p_data_fine => '2032-05-09',
       p_rate => '[{"scadenza":"2031-05-10","importo":500}]'::jsonb) $$,
  '22023', 'Le rate sommano 500,00 €, il contratto vale 2.500,00 €: devono coincidere',
  'se le rate non tornano col contratto lo dice, in euro'
);
select throws_ok(
  $$ select * from public.registra_vendita(null, 'rinnovo', '2031-05-10', '2031-05-10', 2500, 1,
       p_client_id => 'dddd2222-0000-4000-8000-000000000001') $$,
  '22023', 'Scegli un prodotto del catalogo o scrivi il percorso personalizzato',
  'senza prodotto né percorso non parte'
);
select is(
  (select row(numero_rate, totale, scarto)::text from public.anteprima_piano('[{"scadenza":"2031-05-10","importo":500},{"scadenza":"2031-06-10","importo":"250.5"}]'::jsonb, 1000)),
  '(2,750.50,249.50)',
  'l''anteprima del piano somma in SQL'
);

-- Instalments added and removed, numbered by date
select lives_ok(
  $$ select public.aggiungi_rata((select id from ids where chiave = 'vendita'), '2031-08-10', 100) $$,
  'l''admin aggiunge una rata'
);
select is(
  (select array[numero_rata]::int[] from public.payments where sale_id = (select id from ids where chiave = 'vendita') and scadenza = '2031-08-10'),
  array[4],
  'la nuova rata prende il suo posto in ordine di data'
);
select lives_ok(
  $$ select public.elimina_rata((select id from public.payments where sale_id = (select id from ids where chiave = 'vendita') and scadenza = '2031-08-10')) $$,
  'e la toglie'
);
select is(
  (select row(count(*), max(numero_rata))::text from public.payments where sale_id = (select id from ids where chiave = 'vendita')),
  '(6,6)',
  'le rate tornano 1…6'
);

-- Previews, then deletions
select is(
  public.anteprima_eliminazione('persona', 'dddd1111-0000-4000-8000-00000000000d') ->> 'report',
  '1',
  'l''anteprima dice cosa si porta dietro l''eliminazione'
);
select throws_ok(
  $$ select public.elimina_persona('11111111-1111-4111-8111-111111111111') $$,
  '42501', 'Non puoi eliminare il tuo account',
  'l''admin non elimina sé stesso'
);
select lives_ok($$ select public.elimina_persona('dddd1111-0000-4000-8000-00000000000d') $$, 'l''admin elimina una persona');
select is(
  (select row(
     (select count(*) from public.profiles where id = 'dddd1111-0000-4000-8000-00000000000d'),
     (select count(*) from public.setter_daily_reports where setter_id is null or setter_id = 'dddd1111-0000-4000-8000-00000000000d'),
     (select setter_id is null from public.sales where id = 'dddd3333-0000-4000-8000-000000000001'),
     (select setter_id is null from public.clients where id = 'dddd2222-0000-4000-8000-000000000001')
   )::text),
  '(0,0,t,t)',
  'i suoi report spariscono, vendite e clienti restano senza setter'
);

select lives_ok($$ select public.elimina_lead('dddd4444-0000-4000-8000-000000000001') $$, 'l''admin elimina un lead');
select is(
  (select row((select count(*) from public.calls where id = 'dddd5555-0000-4000-8000-000000000001'),
              (select call_id is null from public.sales where id = 'dddd3333-0000-4000-8000-000000000001'))::text),
  '(0,t)',
  'le sue call spariscono, la vendita resta senza call'
);

select lives_ok($$ select public.elimina_cliente('dddd2222-0000-4000-8000-000000000001') $$, 'l''admin elimina un cliente');
select is(
  (select count(*)::int from public.payments where sale_id = (select id from ids where chiave = 'vendita')),
  0,
  'con le sue vendite e le loro rate'
);

-- Nobody else deletes
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select throws_ok(
  $$ select public.elimina_call('dddd5555-0000-4000-8000-000000000001') $$,
  '42501', 'Solo l''admin elimina',
  'il closer non elimina'
);
select throws_ok(
  $$ select public.aggiungi_rata('dddd3333-0000-4000-8000-000000000001', '2031-08-10', 100) $$,
  '42501', null,
  'e non tocca il piano rate'
);

select * from finish();
rollback;
