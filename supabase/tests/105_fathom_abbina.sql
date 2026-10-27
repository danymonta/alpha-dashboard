-- Recordings found on Fathom by the app (1.65.0, 20261104090000_fathom_abbina.sql):
-- fathom_collega_trovata ties a held call without a link to the recording the app
-- found, queues the analysis, and never touches a call marked «non registrata»,
-- a call with a link of a person, a recording of another call. Service role only.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(13);

update public.call_lavori_stato set analisi_attive = true where id;

insert into public.leads (id, nome, setter_id, fonte, stato) values
  ('10510000-0000-4000-8000-000000000001', 'Lead Abbinata', '22222222-2222-4222-8222-222222222222', 'dm_inbound', 'follow_up');
insert into public.calls (id, lead_id, setter_id, closer_id, tipo, programmata_il, stato, qualificata, esito, obiezione_principale, created_by) values
  ('10510000-0000-4000-8000-0000000000a1', '10510000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'discovery', now() - interval '2 days', 'svolta', true, 'persa', 'Prezzo', null),
  ('10510000-0000-4000-8000-0000000000a2', '10510000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'discovery', now() - interval '3 days', 'svolta', true, 'persa', 'Tempo', null),
  ('10510000-0000-4000-8000-0000000000a3', '10510000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'discovery', now() + interval '1 day', 'programmata', null, null, null, null);
insert into public.call_registrazioni (call_id, stato) values ('10510000-0000-4000-8000-0000000000a2', 'non_registrata');

select ok(not has_function_privilege('authenticated', 'public.fathom_collega_trovata(uuid,text,bigint,integer,timestamptz)', 'execute'),
  'nessuna sessione collega da sola');
select ok(not has_function_privilege('anon', 'public.fathom_collega_trovata(uuid,text,bigint,integer,timestamptz)', 'execute'), 'anon no');
select ok(has_function_privilege('service_role', 'public.fathom_collega_trovata(uuid,text,bigint,integer,timestamptz)', 'execute'), 'il service role sì');

set local role service_role;
select is(public.fathom_collega_trovata('10510000-0000-4000-8000-0000000000a1', 'https://fathom.video/calls/90510001', 90510001, 1800, now() - interval '2 days'),
  'collegata', 'una call svolta senza link si collega');
reset role;
select is((select link_registrazione from public.calls where id = '10510000-0000-4000-8000-0000000000a1'),
  'https://fathom.video/calls/90510001', 'il link sta sulla call');
select is((select recording_id from public.call_registrazioni where call_id = '10510000-0000-4000-8000-0000000000a1'),
  90510001::bigint, 'con la registrazione che Fathom ha dato');
select is((select link_verificato from public.call_registrazioni where call_id = '10510000-0000-4000-8000-0000000000a1'),
  'https://fathom.video/calls/90510001', 'verificata per quel link: l’analisi non la cerca di nuovo');
select is((select stato from public.call_analisi where call_id = '10510000-0000-4000-8000-0000000000a1'),
  'in_coda', 'e la sua analisi è in coda');

set local role service_role;
select is(public.fathom_collega_trovata('10510000-0000-4000-8000-0000000000a1', 'https://fathom.video/calls/90510009', 90510009, 1800, now()),
  'ha_link', 'mai sopra un link che c’è già');
select is(public.fathom_collega_trovata('10510000-0000-4000-8000-0000000000a2', 'https://fathom.video/calls/90510002', 90510002, 1800, now()),
  'non_registrata', 'mai su una call segnata non registrata');
select is(public.fathom_collega_trovata('10510000-0000-4000-8000-0000000000a3', 'https://fathom.video/calls/90510003', 90510003, 1800, now()),
  'non_svolta', 'mai su una call da fare');
reset role;
update public.call_registrazioni set stato = 'collegata' where call_id = '10510000-0000-4000-8000-0000000000a2';
set local role service_role;
select is(public.fathom_collega_trovata('10510000-0000-4000-8000-0000000000a2', 'https://fathom.video/calls/90510001', 90510001, 1800, now()),
  'usata', 'mai una registrazione di un’altra call');
select throws_ok($$ select public.fathom_collega_trovata('10510000-0000-4000-8000-0000000000a2', 'https://esempio.test/x', 1, 10, now()) $$,
  '22023', null, 'solo un link di Fathom');
reset role;

select * from finish();
rollback;
