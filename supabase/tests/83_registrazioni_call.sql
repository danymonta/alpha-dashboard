-- The recording of a held call (1.37.0, 20261018090100_registrazioni_call.sql): the link in
-- calls.link_registrazione, what Fathom answered for it in call_registrazioni, who reads it
-- (admin, the call's closer: never the setter), who writes it (only the functions), and the
-- setter no longer writing performance, product pitched and link with a direct update.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(38);

create or replace function pg_temp.codice(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end; $$;

insert into public.leads (id, nome, setter_id, fonte, stato) values
  ('83830000-0000-4000-8000-000000000001', 'Lead Registrazione', '22222222-2222-4222-8222-222222222222', 'dm_inbound', 'follow_up');
insert into public.calls (id, lead_id, setter_id, closer_id, tipo, programmata_il, stato, qualificata, esito, obiezione_principale, created_by) values
  ('83830000-0000-4000-8000-0000000000a1', '83830000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333', 'discovery', now() - interval '2 days', 'svolta', true, 'follow_up', 'Tempo', '22222222-2222-4222-8222-222222222222'),
  ('83830000-0000-4000-8000-0000000000a2', '83830000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'discovery', now() - interval '3 days', 'svolta', true, 'persa', 'Prezzo', '22222222-2222-4222-8222-222222222222');

select has_table('public', 'call_registrazioni', 'la registrazione di una call ha la sua tabella');
select ok((select relrowsecurity from pg_class where oid = 'public.call_registrazioni'::regclass), 'RLS attiva');
select policies_are('public', 'call_registrazioni', array['call_registrazioni_lettura', 'call_registrazioni_mai_da_oauth'],
  'solo la lettura: admin e closer della call');
select ok((select bool_and(not has_table_privilege('authenticated', 'public.call_registrazioni', p))
           from unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p), 'nessuna sessione scrive');
select throws_ok($$ insert into public.call_registrazioni (call_id, stato, recording_id) values ('83830000-0000-4000-8000-0000000000a1', 'collegata', 5) $$,
  '23514', null, 'un id di Fathom senza il link per cui è stato trovato non esiste');
select throws_ok($$ insert into public.call_registrazioni (call_id, stato, link_verificato, recording_id) values ('83830000-0000-4000-8000-0000000000a1', 'non_registrata', 'https://fathom.video/share/x1', 5) $$,
  '23514', null, 'una call non registrata non ha registrazione');
select ok(not has_function_privilege('anon', 'public.collega_registrazione(uuid,jsonb)', 'execute'), 'anon non collega');

-- who writes the link
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(pg_temp.codice($$ select public.collega_registrazione('83830000-0000-4000-8000-0000000000a1', '{"tipo":"link","url":"https://fathom.video/share/AAA111"}') $$),
  '42501', 'il setter non collega la registrazione');
select is(pg_temp.codice($$ update public.calls set link_registrazione = 'https://fathom.video/share/AAA111' where id = '83830000-0000-4000-8000-0000000000a1' $$),
  '42501', 'né scrive il link con un update diretto');
select is(pg_temp.codice($$ update public.calls set performance = 'buona' where id = '83830000-0000-4000-8000-0000000000a1' $$),
  '42501', 'né la performance');
select is(pg_temp.codice($$ update public.calls set prodotto_proposto_id = 'aaaaaaa1-0000-4000-8000-000000000001' where id = '83830000-0000-4000-8000-0000000000a1' $$),
  '42501', 'né il prodotto proposto');
select is(pg_temp.codice($$ update public.calls set note = 'una nota del setter' where id = '83830000-0000-4000-8000-0000000000a1' $$),
  'ok', 'le sue note sì, come prima');
select is(pg_temp.codice($$ select public.decidi_performance('83830000-0000-4000-8000-0000000000a1', 'buona') $$), '42501', 'e decidi_performance non lo lascia entrare');
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is(pg_temp.codice($$ select public.collega_registrazione('83830000-0000-4000-8000-0000000000a1', '{"tipo":"non_registrata"}') $$), '42501', 'il marketing no');

-- the closer of the call
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(pg_temp.codice($$ select public.collega_registrazione('83830000-0000-4000-8000-0000000000a2', '{"tipo":"non_registrata"}') $$), '42501',
  'un closer non collega la call di un altro (quella di Dany)');
select is(pg_temp.codice($$ select public.collega_registrazione('83830000-0000-4000-8000-0000000000a1', '{"tipo":"link","url":"fathom.video/senza-https"}') $$), '22023',
  'serve il link completo, con https');
select is(pg_temp.codice($$ select public.collega_registrazione('83830000-0000-4000-8000-0000000000a1', '{"tipo":"boh"}') $$), '22023', 'una scelta sconosciuta');
select is((select public.collega_registrazione('83830000-0000-4000-8000-0000000000a1', '{"tipo":"link","url":"https://fathom.video/share/AAA111"}') ->> 'verificata'),
  'false', 'il link si salva, non ancora verificato su Fathom');
select is((select link_registrazione from public.calls where id = '83830000-0000-4000-8000-0000000000a1'), 'https://fathom.video/share/AAA111',
  'nella call');
select is((select stato from public.call_registrazioni where call_id = '83830000-0000-4000-8000-0000000000a1'), 'collegata', 'e la registrazione è collegata');

-- what Fathom said, written by the route (service role)
reset role;
select public.fathom_salva_verifica('83830000-0000-4000-8000-0000000000a1', 'https://fathom.video/share/AAA111', 9100001, 2460, now() - interval '2 days');
select is((select recording_id from public.call_registrazioni where call_id = '83830000-0000-4000-8000-0000000000a1'), 9100001::bigint, 'Fathom ha risposto per quel link');
set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is((select public.collega_registrazione('83830000-0000-4000-8000-0000000000a1', '{"tipo":"link","url":"https://fathom.video/share/AAA111"}') ->> 'verificata'),
  'true', 'ricollegare lo stesso link tiene la verifica');
select is((select count(*)::integer from public.call_registrazioni where call_id = '83830000-0000-4000-8000-0000000000a1'), 1, 'il closer legge la sua registrazione');
select is(pg_temp.codice($$ update public.calls set link_registrazione = 'https://fathom.video/share/BBB222' where id = '83830000-0000-4000-8000-0000000000a1' $$), 'ok',
  'il closer cambia il link con la matita');
select is((select recording_id from public.call_registrazioni where call_id = '83830000-0000-4000-8000-0000000000a1'), null,
  'un altro link: quello che Fathom aveva detto per il primo non vale più');
select is(pg_temp.codice($$ select public.decidi_performance('83830000-0000-4000-8000-0000000000a1', 'buona') $$), 'ok', 'il closer decide la performance');
select is((select performance::text from public.calls where id = '83830000-0000-4000-8000-0000000000a1'), 'buona', 'scritta');
select is(pg_temp.codice($$ select public.decidi_performance('83830000-0000-4000-8000-0000000000a2', 'buona') $$), '42501', 'ma non sulla call di un altro');

select is((select public.collega_registrazione('83830000-0000-4000-8000-0000000000a1', '{"tipo":"non_registrata"}') ->> 'stato'), 'non_registrata', 'Call non registrata');
select is((select link_registrazione from public.calls where id = '83830000-0000-4000-8000-0000000000a1'), null, 'senza link');
select is(pg_temp.codice($$ select public.scollega_registrazione('83830000-0000-4000-8000-0000000000a1') $$), 'ok', 'scollega');
select is((select count(*)::integer from public.call_registrazioni where call_id = '83830000-0000-4000-8000-0000000000a1'), 0, 'la registrazione non c''è più');

-- who reads
reset role;
insert into public.call_registrazioni (call_id, stato) values
  ('83830000-0000-4000-8000-0000000000a1', 'non_registrata'), ('83830000-0000-4000-8000-0000000000a2', 'non_registrata');
create temp table viste83 (persona text, n integer);
grant all on viste83 to public;
create or replace function pg_temp.conta83(p_persona text) returns void language plpgsql as $$
begin
  insert into viste83 select p_persona, count(*)::integer from public.call_registrazioni where call_id in ('83830000-0000-4000-8000-0000000000a1', '83830000-0000-4000-8000-0000000000a2');
exception when others then insert into viste83 values (p_persona, null);
end; $$;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
do $$ begin perform pg_temp.conta83('admin'); end $$;
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
do $$ begin perform pg_temp.conta83('closer'); end $$;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
do $$ begin perform pg_temp.conta83('setter'); end $$;
set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
do $$ begin perform pg_temp.conta83('editor'); end $$;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
do $$ begin perform pg_temp.conta83('marketing'); end $$;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
do $$ begin perform pg_temp.conta83('coach'); end $$;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111',
  'role', 'authenticated', 'client_id', '7c000000-0000-4000-8000-000000000001',
  'session_id', '7e000000-0000-4000-8000-000000000001')::text, true);
do $$ begin perform pg_temp.conta83('oauth'); end $$;
reset role;

select is((select n from viste83 where persona = 'admin'), 2, 'l''admin le legge tutte');
select is((select n from viste83 where persona = 'closer'), 1, 'il closer solo le sue');
select is((select array_agg(persona order by persona) from viste83 where coalesce(n, 0) = 0),
  array['coach', 'editor', 'marketing', 'oauth', 'setter'], 'il setter mai, e nessun altro ruolo né un token di Claude');

-- a call deleted takes its recording; the link check
select is(pg_temp.codice($$ update public.calls set link_registrazione = 'http://fathom.video/x' where id = '83830000-0000-4000-8000-0000000000a2' $$), 'ok',
  'il vincolo di prima sul link resta (https o http)');
select throws_ok($$ update public.calls set link_registrazione = 'non è un link' where id = '83830000-0000-4000-8000-0000000000a2' $$, '23514', null, 'ma deve essere un indirizzo');
delete from public.calls where id = '83830000-0000-4000-8000-0000000000a2';
select is((select count(*)::integer from public.call_registrazioni where call_id = '83830000-0000-4000-8000-0000000000a2'), 0, 'eliminata la call se ne va la registrazione');

select * from finish();
rollback;
