-- The weekly brief of the Marketing area (1.37.0, 20261018090300_spunti_dati.sql and 20261018090600_spunti.sql):
-- what may reach Claude (sentinels: the sources it must never get), the brief readable by the Marketing area and by a
-- connected Claude, the requests, the origin of the ideas in the calendar.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(34);

create or replace function pg_temp.codice(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end; $$;

-- fixtures: a lead with a call analysed, notes, a setter's report
insert into public.leads (id, nome, instagram_handle, setter_id, fonte, stato, note) values
  ('87870000-0000-4000-8000-000000000001', 'Giovanni Sentinella', '@gio_sentinella', '22222222-2222-4222-8222-222222222222', 'dm_inbound', 'follow_up', 'SENTINELLA-NOTA-LEAD');
insert into public.calls (id, lead_id, setter_id, closer_id, tipo, programmata_il, stato, qualificata, esito, obiezione_principale, note, note_closer, link_registrazione, created_by) values
  ('87870000-0000-4000-8000-0000000000a1', '87870000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333',
   'discovery', now() - interval '2 days', 'svolta', true, 'follow_up', 'Il tempo la sera è poco', 'SENTINELLA-NOTA-SETTER-CALL', 'Vuole sentire la compagna',
   'https://fathom.video/share/T87A1', '22222222-2222-4222-8222-222222222222');
insert into public.call_analisi (call_id, stato, riassunto, in_target, lead, obiezioni, categorie_obiezioni, pain, desideri, domande, motivo_proposto, spunti_contenuto, analizzata_il)
values ('87870000-0000-4000-8000-0000000000a1', 'pronta', 'SENTINELLA-RIASSUNTO-CALL', 'si',
  '{"frasi":["SENTINELLA-FRASE-LEAD"],"punto_a":"SENTINELLA-PUNTO-A","gia_provato":["palestra"]}',
  '[{"categoria":"tempo","sintesi":"Poco tempo la sera","gestita":"si","risposta":"SENTINELLA-RISPOSTA-CLOSER"},
    {"categoria":"condizioni_personali","sintesi":"SENTINELLA-CONDIZIONI","gestita":"no","risposta":null}]',
  array['tempo', 'condizioni_personali'], array['maglia'], array['fit_non_grosso'], '["Bastano 40 minuti?"]', 'SENTINELLA-MOTIVO-PROPOSTO',
  '[{"idea":"Allenarsi la sera","perche":"Il tempo torna"}]', now())
on conflict (call_id) do update set stato = 'pronta', riassunto = excluded.riassunto, in_target = excluded.in_target, lead = excluded.lead,
  obiezioni = excluded.obiezioni, categorie_obiezioni = excluded.categorie_obiezioni, pain = excluded.pain, desideri = excluded.desideri,
  domande = excluded.domande, motivo_proposto = excluded.motivo_proposto, spunti_contenuto = excluded.spunti_contenuto, analizzata_il = now();
insert into public.call_analisi_setter (call_id, in_target, sapeva, sorprese, analizzata_il)
values ('87870000-0000-4000-8000-0000000000a1', 'si', array['percorso_a_casa'], '["Non pensava servisse solo una sbarra"]', now())
on conflict (call_id) do nothing;
insert into public.call_spunti_setter (call_id, setter_id, spunti) values
  ('87870000-0000-4000-8000-0000000000a1', '22222222-2222-4222-8222-222222222222', '["SENTINELLA-SPUNTI-SETTER"]') on conflict (call_id) do nothing;
insert into public.call_valutazioni (call_id, closer_id, criteri, perche) values
  ('87870000-0000-4000-8000-0000000000a1', '33333333-3333-4333-8333-333333333333', '{"scoperta":"si"}', '["SENTINELLA-VALUTAZIONE"]') on conflict (call_id) do nothing;
insert into public.setter_daily_reports (setter_id, data, dm_outbound, conversazioni, cosa_frenava, domande_contenuti, note, lead_in_target, qualita_conversazioni) values
  ('22222222-2222-4222-8222-222222222222', public.oggi() - 3, 5, 3, 'Molti non hanno tempo la sera', 'Chiedono se serve la palestra', 'SENTINELLA-ALTRE-NOTE', 'circa_meta', 'medie')
on conflict (setter_id, data) do update set cosa_frenava = excluded.cosa_frenava, domande_contenuti = excluded.domande_contenuti,
  note = excluded.note, lead_in_target = excluded.lead_in_target, qualita_conversazioni = excluded.qualita_conversazioni;

insert into auth.oauth_clients (id, client_name, registration_type, client_type, redirect_uris, grant_types, token_endpoint_auth_method)
values ('7c000000-0000-4000-8000-000000000087', 'Claude', 'manual', 'public', 'https://claude.ai/api/mcp/auth_callback,https://claude.com/api/mcp/auth_callback',
        'authorization_code,refresh_token', 'none');
insert into auth.sessions (id, user_id, created_at, updated_at, aal, oauth_client_id, not_after)
values ('7e000000-0000-4000-8000-000000000087', '61616161-6161-4161-8161-616161616161', now(), now(), 'aal1', '7c000000-0000-4000-8000-000000000087', null);

-- what reaches Claude
select ok(not has_function_privilege('authenticated', 'public.marketing_fonti_spunti(date,date)', 'execute')
          and has_function_privilege('service_role', 'public.marketing_fonti_spunti(date,date)', 'execute'), 'solo il service role');
select throws_ok($$ select public.marketing_fonti_spunti(current_date - 90, current_date) $$, '22023', null, 'un periodo oltre 60 giorni no');
select throws_ok($$ select public.marketing_fonti_spunti(current_date, current_date - 3) $$, '22023', null, 'né rovesciato');
create temp table f87 as select public.marketing_fonti_spunti(public.oggi() - 28, public.oggi() - 1) as j;
select is((select j ->> 'note_team' from f87), 'true', 'le note del team sono accese di base');
select ok((select j::text not like '%SENTINELLA-NOTA-LEAD%' from f87), 'mai le note del lead');
select ok((select j::text not like '%SENTINELLA-NOTA-SETTER-CALL%' from f87), 'mai le note del setter sulla call');
select ok((select j::text not like '%SENTINELLA-ALTRE-NOTE%' from f87), 'mai «Altre note» del setter');
select ok((select j::text not like '%SENTINELLA-RIASSUNTO-CALL%' from f87), 'mai il riassunto dell''analisi');
select ok((select j::text not like '%SENTINELLA-FRASE-LEAD%' and j::text not like '%SENTINELLA-PUNTO-A%' from f87), 'mai le frasi del lead né il punto A');
select ok((select j::text not like '%SENTINELLA-RISPOSTA-CLOSER%' from f87), 'mai la risposta del closer');
select ok((select j::text not like '%SENTINELLA-MOTIVO-PROPOSTO%' from f87), 'mai il motivo proposto da Claude');
select ok((select j::text not like '%SENTINELLA-SPUNTI-SETTER%' from f87), 'mai gli spunti per il setter');
select ok((select j::text not like '%SENTINELLA-VALUTAZIONE%' from f87), 'mai la valutazione');
select ok((select j::text not like '%SENTINELLA-CONDIZIONI%' from f87), 'le condizioni personali arrivano come categoria, senza il testo');
select ok((select j::text not like '%setter_id%' and j::text not like '%closer_id%' and j::text not like '%performance%'
                  and j::text not like '%importo%' and j::text not like '%dm_outbound%' from f87), 'nessun identificativo, importo, performance o volume');
select ok((select j -> 'setter' -> 'note' -> 0 ->> 'testo' like 'Molti non hanno tempo%' from f87), 'le risposte del setter sì, senza il giorno');
select ok((select j -> 'setter' -> 'note' -> 0 ->> 'quando' in ('questa_settimana', 'prima') from f87), 'solo «questa settimana» o «prima»');
select ok((select jsonb_array_length(j -> 'call' -> 'analisi') >= 1 from f87), 'le call analizzate: la parte del lead');
select ok((select (j -> 'call' -> 'analisi' -> 0 -> 'obiezioni' -> 1 ->> 'sintesi') is null from f87
           where j -> 'call' -> 'analisi' -> 0 -> 'obiezioni' -> 1 ->> 'categoria' = 'condizioni_personali'), 'condizioni_personali senza sintesi');
select ok((select j -> 'da_oscurare' @> '"giovanni sentinella"' from f87), 'i nomi da oscurare restano accanto, per il server');

update public.marketing_lavori_stato set note_team = false;
create temp table g87 as select public.marketing_fonti_spunti(public.oggi() - 28, public.oggi() - 1) as j;
select is((select j ->> 'note_team' from g87), 'false', 'con le note del team spente');
select is((select jsonb_array_length(j -> 'call' -> 'analisi') + jsonb_array_length(j -> 'setter' -> 'note') + jsonb_array_length(j -> 'closer' -> 'motivi')
                  + jsonb_array_length(j -> 'dm' -> 'temi') from g87), 0, 'DM, setting, closer e call sono vuoti');
update public.marketing_lavori_stato set note_team = true;

-- the brief for the Marketing area and for a connected Claude
insert into public.marketing_spunti (id, motivo, stato, periodo_da, periodo_a, contenuto, fonti, finita_il)
values ('87870000-0000-4000-8000-0000000000b1', 'automatica', 'pronta', public.oggi() - 28, public.oggi() - 1, '{"in_breve":"Prova","idee":[{"name":"Idea 0"}]}', '{"note_team":true}', now());
create temp table s87 (chi text, n integer, codice text);
grant all on s87 to public;
create or replace function pg_temp.brief87(p_chi text) returns void language plpgsql as $$
declare v jsonb;
begin
  v := public.spunti_per_claude();
  insert into s87 values (p_chi, case when v ->> 'spunti' is null then 1 else 0 end, null);
exception when others then insert into s87 values (p_chi, null, sqlstate);
end; $$;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
do $$ begin perform pg_temp.brief87('admin'); end $$;
set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
do $$ begin perform pg_temp.brief87('editor'); end $$;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
do $$ begin perform pg_temp.brief87('marketing'); end $$;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
do $$ begin perform pg_temp.brief87('setter'); end $$;
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
do $$ begin perform pg_temp.brief87('closer'); end $$;
select set_config('request.jwt.claims', json_build_object('sub', '61616161-6161-4161-8161-616161616161',
  'role', 'authenticated', 'client_id', '7c000000-0000-4000-8000-000000000087',
  'session_id', '7e000000-0000-4000-8000-000000000087')::text, true);
do $$ begin perform pg_temp.brief87('marketing_con_claude'); end $$;
reset role;
select is((select array_agg(chi order by chi) from s87 where codice is null), array['admin', 'editor', 'marketing', 'marketing_con_claude'],
  'il brief lo legge l''area Marketing, anche con un Claude collegato');
select is((select array_agg(chi order by chi) from s87 where codice = '42501'), array['closer', 'setter'], 'il setter e il closer no');
select ok((public.spunti_per_claude() ? 'contenuto') is not null, 'la funzione risponde anche senza sessione come service role');

-- requests: admin and marketing, 2 a day, one at a time
delete from public.marketing_spunti where id <> '87870000-0000-4000-8000-0000000000b1';
set local role authenticated;
set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
select is(pg_temp.codice($$ select public.marketing_spunti_richiedi() $$), '42501', 'il video editor non chiede gli spunti');
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is(pg_temp.codice($$ select public.marketing_spunti_richiedi() $$), 'ok', 'il marketing sì');
select is(pg_temp.codice($$ select public.marketing_spunti_richiedi() $$), '22023', 'una alla volta: Claude ci sta già lavorando');
reset role;
update public.marketing_spunti set stato = 'fallita', errore = 'x', finita_il = now() where stato = 'in_coda';
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(pg_temp.codice($$ select public.marketing_spunti_richiedi() $$), 'ok', 'la seconda del giorno passa');
reset role;
update public.marketing_spunti set stato = 'fallita', errore = 'x', finita_il = now() where stato = 'in_coda';
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(pg_temp.codice($$ select public.marketing_spunti_richiedi() $$), '22023', 'la terza no: riprova domani');
reset role;

-- the calendar: an idea of a brief
set local role authenticated;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is(pg_temp.codice($$ insert into public.marketing_contenuti (tipo, nome, da_spunti, da_spunti_idea) values ('reel', 'Idea 0', '87870000-0000-4000-8000-0000000000b1', 0) $$), 'ok', 'il marketing aggiunge al calendario un''idea valida');
select is(pg_temp.codice($$ insert into public.marketing_contenuti (tipo, nome, da_spunti, da_spunti_idea) values ('reel', 'Idea 0 bis', '87870000-0000-4000-8000-0000000000b1', 0) $$), '23505', 'la stessa idea due volte no');
select is(pg_temp.codice($$ insert into public.marketing_contenuti (tipo, nome, da_spunti, da_spunti_idea) values ('reel', 'Idea 5', '87870000-0000-4000-8000-0000000000b1', 5) $$), '22023', 'né un''idea che non c''è');
reset role;

select ok((select pg_get_functiondef('public.mcp_filtro_richiesta()'::regprocedure) like '%rpc/spunti_per_claude%'), 'il filtro delle Data API lascia passare solo il brief');

select * from finish();
rollback;
