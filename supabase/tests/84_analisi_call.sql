-- Claude's analysis of the held calls (1.37.0, 20261018090400_analisi_call.sql): the queue,
-- who reads each table (the valuation only the closer who led the call, the suggestions only
-- the call's setter), what reaches Claude, the planner with its lease and its cost, the
-- performance written only by the closer of the call.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(57);

create or replace function pg_temp.codice(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end; $$;

-- A: Dany's closer (3333) · B: the admin's own call (1111). Same setter (2222).
insert into public.leads (id, nome, instagram_handle, setter_id, fonte, stato, note) values
  ('84840000-0000-4000-8000-000000000001', 'Marco Sentinella', '@marco_sentinella', '22222222-2222-4222-8222-222222222222', 'dm_inbound', 'follow_up', 'SENTINELLA-NOTA-LEAD'),
  ('84840000-0000-4000-8000-000000000002', 'Luca Secondo', '@luca_secondo', '22222222-2222-4222-8222-222222222222', 'dm_outbound', 'follow_up', null);
insert into public.calls (id, lead_id, setter_id, closer_id, tipo, programmata_il, stato, qualificata, esito, obiezione_principale, note, note_closer, created_by) values
  ('84840000-0000-4000-8000-0000000000a1', '84840000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   '33333333-3333-4333-8333-333333333333', 'discovery', now() - interval '2 days', 'programmata', null, null, null, 'SENTINELLA-NOTA-SETTER', null, '22222222-2222-4222-8222-222222222222'),
  ('84840000-0000-4000-8000-0000000000b1', '84840000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'discovery', now() - interval '3 days', 'svolta', true, 'follow_up', 'Poco tempo la sera', null, null, '22222222-2222-4222-8222-222222222222');
insert into public.call_pitch (call_id, importo_proposto) values ('84840000-0000-4000-8000-0000000000a1', 7777.00);

-- the queue: nothing until the call is held, has an outcome, and a Fathom link with its row
select is((select count(*)::integer from public.call_analisi where call_id = '84840000-0000-4000-8000-0000000000a1'), 0, 'una call da fare non entra in coda');
update public.calls set stato = 'svolta', esito = 'follow_up', qualificata = true, obiezione_principale = 'Tempo' where id = '84840000-0000-4000-8000-0000000000a1';
select is((select count(*)::integer from public.call_analisi where call_id = '84840000-0000-4000-8000-0000000000a1'), 0, 'svolta ma senza registrazione: no');
update public.calls set link_registrazione = 'https://zoom.example.test/rec/1' where id = '84840000-0000-4000-8000-0000000000a1';
-- (a link written on a call makes its row of call_registrazioni)
insert into public.call_registrazioni (call_id, stato) values ('84840000-0000-4000-8000-0000000000a1', 'collegata') on conflict (call_id) do nothing;
select is((select count(*)::integer from public.call_analisi where call_id = '84840000-0000-4000-8000-0000000000a1'), 0, 'un link che non è di Fathom: no');
update public.calls set link_registrazione = 'https://fathom.video/share/T84A1' where id = '84840000-0000-4000-8000-0000000000a1';
select public.call_analisi_valuta('84840000-0000-4000-8000-0000000000a1');
select is((select stato from public.call_analisi where call_id = '84840000-0000-4000-8000-0000000000a1'), 'in_coda', 'svolta, con esito e link di Fathom: in coda');
select is((select motivo from public.call_analisi where call_id = '84840000-0000-4000-8000-0000000000a1'), 'automatica', 'automatica');

-- the other call: a recording found, an analysis ready
update public.calls set link_registrazione = 'https://fathom.video/share/T84B1' where id = '84840000-0000-4000-8000-0000000000b1';
insert into public.call_registrazioni (call_id, stato, link_verificato, recording_id, durata_secondi, verificata_il)
values ('84840000-0000-4000-8000-0000000000b1', 'collegata', 'https://fathom.video/share/T84B1', 9400002, 2400, now())
on conflict (call_id) do update set link_verificato = excluded.link_verificato, recording_id = excluded.recording_id,
  durata_secondi = excluded.durata_secondi, verificata_il = excluded.verificata_il;
update public.call_analisi set stato = 'pronta', riassunto = 'Riassunto di prova', analizzata_il = now(), recording_id = 9400002
where call_id = '84840000-0000-4000-8000-0000000000b1';
insert into public.call_analisi_setter (call_id, in_target, sorprese, analizzata_il) values ('84840000-0000-4000-8000-0000000000b1', 'si', '[]', now());
insert into public.call_spunti_setter (call_id, setter_id, spunti) values ('84840000-0000-4000-8000-0000000000b1', '22222222-2222-4222-8222-222222222222', '["Chiedi le sere libere"]');
insert into public.call_valutazioni (call_id, closer_id, criteri, livello_proposto) values
  ('84840000-0000-4000-8000-0000000000b1', '11111111-1111-4111-8111-111111111111', '{"scoperta":"si"}', 'buona');
-- a second one of the other closer, to see that the admin does not read it
insert into public.call_analisi_setter (call_id, in_target, analizzata_il) values ('84840000-0000-4000-8000-0000000000a1', 'si', now());
insert into public.call_spunti_setter (call_id, setter_id, spunti) values ('84840000-0000-4000-8000-0000000000a1', '22222222-2222-4222-8222-222222222222', '["Altro spunto"]');
insert into public.call_valutazioni (call_id, closer_id, criteri, livello_proposto) values
  ('84840000-0000-4000-8000-0000000000a1', '33333333-3333-4333-8333-333333333333', '{"scoperta":"no"}', 'scarsa');

-- who reads what
create temp table viste84 (persona text, analisi integer, setter integer, spunti integer, valutazioni integer, stato integer);
grant all on viste84 to public;
create or replace function pg_temp.conta84(p_persona text) returns void language plpgsql as $$
begin
  insert into viste84 select p_persona,
    (select count(*)::integer from public.call_analisi where call_id::text like '84840000%'),
    (select count(*)::integer from public.call_analisi_setter where call_id::text like '84840000%'),
    (select count(*)::integer from public.call_spunti_setter where call_id::text like '84840000%'),
    (select count(*)::integer from public.call_valutazioni where call_id::text like '84840000%'),
    (select count(*)::integer from public.call_lavori_stato);
exception when others then insert into viste84 values (p_persona, null, null, null, null, null);
end; $$;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
do $$ begin perform pg_temp.conta84('admin'); end $$;
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
do $$ begin perform pg_temp.conta84('closer'); end $$;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
do $$ begin perform pg_temp.conta84('setter'); end $$;
set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
do $$ begin perform pg_temp.conta84('editor'); end $$;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
do $$ begin perform pg_temp.conta84('marketing'); end $$;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
do $$ begin perform pg_temp.conta84('coach'); end $$;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111',
  'role', 'authenticated', 'client_id', '7c000000-0000-4000-8000-000000000001',
  'session_id', '7e000000-0000-4000-8000-000000000001')::text, true);
do $$ begin perform pg_temp.conta84('oauth'); end $$;
reset role;

select is((select analisi from viste84 where persona = 'admin'), 2, 'l''admin legge le analisi di tutte le call');
select is((select analisi from viste84 where persona = 'closer'), 1, 'il closer solo quelle delle sue');
select is((select array_agg(persona order by persona) from viste84 where coalesce(analisi, 0) = 0), array['coach', 'editor', 'marketing', 'oauth', 'setter'],
  'il setter non legge l''analisi intera, né il marketing, né un token di Claude');
select is((select setter from viste84 where persona = 'setter'), 2, 'il setter legge «Dalla call» delle sue call');
select is((select setter from viste84 where persona = 'closer'), 1, 'il closer quello delle sue');
select is((select array_agg(persona order by persona) from viste84 where coalesce(setter, 0) = 0), array['coach', 'editor', 'marketing', 'oauth'], 'nessun altro');
select is((select spunti from viste84 where persona = 'setter'), 2, 'gli spunti per i DM li legge il setter della call');
select is((select array_agg(persona order by persona) from viste84 where coalesce(spunti, 0) = 0), array['admin', 'closer', 'coach', 'editor', 'marketing', 'oauth'],
  'non l''admin, non il closer, nessun altro');
select is((select valutazioni from viste84 where persona = 'admin'), 1, 'l''admin legge la valutazione solo delle call che ha fatto lui');
select is((select valutazioni from viste84 where persona = 'closer'), 1, 'il closer quella della sua');
select is((select array_agg(persona order by persona) from viste84 where coalesce(valutazioni, 0) = 0), array['coach', 'editor', 'marketing', 'oauth', 'setter'],
  'mai il setter né gli altri');
select is((select array_agg(persona order by persona) from viste84 where stato > 0), array['admin'], 'lo stato dei lavori lo legge solo l''admin');
select ok((select bool_and(not has_table_privilege('authenticated', t, p))
           from unnest(array['public.call_analisi', 'public.call_analisi_setter', 'public.call_spunti_setter', 'public.call_valutazioni', 'public.call_lavori_stato']) t,
                unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p), 'nessuna sessione scrive');
select policies_are('public', 'call_valutazioni', array['call_valutazioni_proprie', 'call_valutazioni_mai_da_oauth'], 'una sola policy di lettura per la valutazione');
select policies_are('public', 'call_spunti_setter', array['call_spunti_setter_propri', 'call_spunti_setter_mai_da_oauth'], 'e una per gli spunti');

-- another recording: the old analysis goes
update public.call_registrazioni set recording_id = 9400003, link_verificato = 'https://fathom.video/share/T84B1' where call_id = '84840000-0000-4000-8000-0000000000b1';
select is((select count(*)::integer from public.call_analisi where call_id = '84840000-0000-4000-8000-0000000000b1'), 0, 'un''altra registrazione: l''analisi della vecchia se ne va');
select is((select count(*)::integer from public.call_valutazioni where call_id = '84840000-0000-4000-8000-0000000000b1'), 0, 'e la valutazione');
select is((select count(*)::integer from public.call_spunti_setter where call_id = '84840000-0000-4000-8000-0000000000b1'), 0, 'e gli spunti');

-- a request of the closer or the admin
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(pg_temp.codice($$ select public.call_analisi_richiedi('84840000-0000-4000-8000-0000000000a1') $$), '42501', 'il setter non chiede l''analisi');
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(pg_temp.codice($$ select public.call_analisi_richiedi('84840000-0000-4000-8000-0000000000b1') $$), '42501', 'il closer non chiede quella di un altro');
select is(pg_temp.codice($$ select public.call_analisi_richiedi('84840000-0000-4000-8000-0000000000a1') $$), '22023', 'una già in coda: Claude ci sta già lavorando');
reset role;
update public.call_analisi set stato = 'fallita', errore = 'x' where call_id = '84840000-0000-4000-8000-0000000000a1';
set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(pg_temp.codice($$ select public.call_analisi_richiedi('84840000-0000-4000-8000-0000000000a1') $$), 'ok', 'una fallita si rifà');
reset role;
select is((select stato || '/' || motivo from public.call_analisi where call_id = '84840000-0000-4000-8000-0000000000a1'), 'in_coda/richiesta', 'in coda, chiesta da una persona');
select is((select richieste_oggi::integer from public.call_lavori_stato where id), 1, 'la richiesta è contata nel limite del giorno');
update public.call_lavori_stato set analisi_attive = false;
update public.call_analisi set stato = 'fallita', errore = 'x' where call_id = '84840000-0000-4000-8000-0000000000a1';
select is((select richieste_oggi::integer from public.call_lavori_stato where id), 0, 'finita fallita: il posto torna al limite del giorno (1.37.1)');
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(pg_temp.codice($$ select public.call_analisi_richiedi('84840000-0000-4000-8000-0000000000a1') $$), '22023', 'con le analisi spente no');
select is(pg_temp.codice($$ select public.call_imposta_interruttori(true, null) $$), 'ok', 'l''admin le accende');
select is(pg_temp.codice($$ select public.call_imposta_costo_max(300) $$), '22023', 'il limite va da 0 a 200');
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(pg_temp.codice($$ select public.call_imposta_interruttori(false, null) $$), '42501', 'il closer non spegne');
select is(pg_temp.codice($$ select public.call_imposta_costo_max(5) $$), '42501', 'né cambia il limite');
reset role;

-- performance: only the closer of the call
set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(pg_temp.codice($$ select public.decidi_performance('84840000-0000-4000-8000-0000000000a1', 'discreta') $$), 'ok', 'il closer della call decide');
select is((select decisa_livello::text from public.call_valutazioni where call_id = '84840000-0000-4000-8000-0000000000a1'), 'discreta', 'e resta scritto per la taratura');
reset role;

-- the planner: lease, cost, the Insight in the way
update public.call_analisi set stato = 'in_coda', motivo = 'richiesta', errore = null where call_id = '84840000-0000-4000-8000-0000000000a1';
select is((select cosa from public.call_scegli_lavoro()), 'analisi', 'il lavoro dovuto è l''analisi chiesta');
select ok((select passo is not null from public.call_prendi_passo(330)), 'un passo con il suo lease');
select is((select stato from public.call_analisi where call_id = '84840000-0000-4000-8000-0000000000a1'), 'in_corso', 'l''analisi è in corso');
select is((select count(*)::integer from public.call_prendi_passo(330)), 0, 'un secondo passo mentre il lease è preso: niente');
select is(public.call_passo_finito(gen_random_uuid(), 'ok', '{}'), false, 'chiudere un passo che non è il suo no');
select is(public.call_passo_finito((select passo_id from public.call_lavori_stato), 'ok',
  '{"input":1000000,"cache_scritti":0,"cache_letti":0,"output":100000}'), true, 'il passo finisce');
select is((select costo_mese_usd from public.call_lavori_stato), 3.0000::numeric, 'il costo si calcola in SQL: 1 M in entrata a 2 $ e 100 mila in uscita a 10 $');
select is((select lease_fino_al from public.call_lavori_stato), null, 'e il lease si libera');
update public.call_lavori_stato set costo_mese_usd = 10;
select is((select count(*)::integer from public.call_scegli_lavoro()), 0, 'al limite di spesa nessun lavoro');
update public.call_lavori_stato set costo_mese_usd = 0;
insert into public.insight_esecuzioni (giorno, motivo, stato) values (public.oggi(), 'manuale', 'in_corso');
select is((select count(*)::integer from public.call_scegli_lavoro()), 0, 'con un''esecuzione dell''Insight in corso nessun lavoro');
delete from public.insight_esecuzioni where stato = 'in_corso' and giorno = public.oggi() and motivo = 'manuale';

-- the watchdog
update public.call_analisi set stato = 'in_corso', iniziata_il = now() - interval '20 minutes', tentativi = 2 where call_id = '84840000-0000-4000-8000-0000000000a1';
select public.call_tick();
select is((select stato from public.call_analisi where call_id = '84840000-0000-4000-8000-0000000000a1'), 'fallita', 'un passo perso tre volte è fallito, con la sua frase');

-- what reaches Claude: never the amount pitched, the other notes, an email, the lead's contact
select ok(public.call_fonti_analisi('84840000-0000-4000-8000-0000000000a1')::text not like '%7777%', 'mai l''importo proposto');
select ok(public.call_fonti_analisi('84840000-0000-4000-8000-0000000000a1')::text not like '%SENTINELLA-NOTA-LEAD%', 'mai le note del lead');
select ok(public.call_fonti_analisi('84840000-0000-4000-8000-0000000000a1')::text like '%SENTINELLA-NOTA-SETTER%', 'la nota del setter sì, è la sua parte della call');
select ok(public.call_fonti_analisi('84840000-0000-4000-8000-0000000000a1')::text not like '%marco_sentinella@%', 'mai un contatto');
select ok(public.call_fonti_analisi('84840000-0000-4000-8000-0000000000a1') -> 'da_oscurare' @> '"marco sentinella"', 'i nomi da oscurare restano accanto, per il server');
select ok(not has_function_privilege('authenticated', 'public.call_fonti_analisi(uuid)', 'execute'), 'solo il service role');

-- the backup does not take the two tables only the valued person reads
select ok(not (public.backup_completo() ? 'call_valutazioni') and not (public.backup_completo() ? 'call_spunti_setter')
          and (public.backup_completo() ? 'call_analisi') and (public.backup_completo() ? 'call_registrazioni'), 'il backup: le tabelle di tutti sì, le due personali no');

-- 24 months
update public.calls set programmata_il = now() - interval '25 months' where id = '84840000-0000-4000-8000-0000000000a1';
select public.call_analisi_pulizia();
select is((select count(*)::integer from public.call_analisi where call_id = '84840000-0000-4000-8000-0000000000a1'), 0, 'oltre 24 mesi dalla call l''analisi se ne va');
select ok(exists (select 1 from cron.job where jobname = 'call-tick' and schedule = '4-59/5 * * * *'), 'il job call-tick esiste');

select * from finish();
rollback;
