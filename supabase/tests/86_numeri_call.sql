-- The numbers of the recorded calls (1.37.0, 20261018090500_numeri_call.sql): the definitions of section 9
-- grouped as a total, by source and by the post the lead comes from; who asks (admin, closer: never the setter);
-- coverage, length and performance only on the calls of whoever asks; euros only for the admin.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(29);

create or replace function pg_temp.codice(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end; $$;

-- an isolated window: 300 days ago (the seed has six months). Closer 3333: 3 held calls, 1 no-show, 1 cancelled. Admin: 1 held call.
insert into public.instagram_contenuti (media_id, shortcode, permalink, media_type, reel, pubblicato_il) values
  ('8600000000000001', 'T86Reel01', 'https://www.instagram.com/reel/T86Reel01/', 'VIDEO', true, now() - interval '320 days');
insert into public.leads (id, nome, setter_id, fonte, stato) values
  ('86860000-0000-4000-8000-000000000001', 'Lead 1', '22222222-2222-4222-8222-222222222222', 'dm_inbound', 'cliente'),
  ('86860000-0000-4000-8000-000000000002', 'Lead 2', '22222222-2222-4222-8222-222222222222', 'dm_inbound', 'follow_up'),
  ('86860000-0000-4000-8000-000000000003', 'Lead 3', '22222222-2222-4222-8222-222222222222', 'dm_outbound', 'perso'),
  ('86860000-0000-4000-8000-000000000004', 'Lead 4', '22222222-2222-4222-8222-222222222222', 'dm_outbound', 'call_fissata'),
  ('86860000-0000-4000-8000-000000000005', 'Lead 5', '22222222-2222-4222-8222-222222222222', 'dm_inbound', 'call_fissata'),
  ('86860000-0000-4000-8000-000000000006', 'Lead 6', '22222222-2222-4222-8222-222222222222', 'organico', 'follow_up');
insert into public.lead_contenuto (lead_id, shortcode, come, certo, giorno) values
  ('86860000-0000-4000-8000-000000000001', 'T86Reel01', 'condivisione', true, (now() - interval '302 days')::date),
  ('86860000-0000-4000-8000-000000000002', 'T86Reel01', 'condivisione', true, (now() - interval '302 days')::date);
insert into public.calls (id, lead_id, setter_id, closer_id, tipo, programmata_il, stato, qualificata, esito, obiezione_principale, performance, created_by) values
  ('86860000-0000-4000-8000-0000000000c1', '86860000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'discovery', now() - interval '300 days', 'svolta', true, 'chiusa', null, 'buona', '22222222-2222-4222-8222-222222222222'),
  ('86860000-0000-4000-8000-0000000000c2', '86860000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'discovery', now() - interval '300 days' + interval '1 hour', 'svolta', true, 'follow_up', 'Tempo', 'media', '22222222-2222-4222-8222-222222222222'),
  ('86860000-0000-4000-8000-0000000000c3', '86860000-0000-4000-8000-000000000003', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'discovery', now() - interval '300 days' + interval '2 hours', 'svolta', false, 'persa', 'Prezzo', null, '22222222-2222-4222-8222-222222222222'),
  ('86860000-0000-4000-8000-0000000000c4', '86860000-0000-4000-8000-000000000004', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'discovery', now() - interval '300 days' + interval '3 hours', 'no_show', null, null, null, null, '22222222-2222-4222-8222-222222222222'),
  ('86860000-0000-4000-8000-0000000000c5', '86860000-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', 'discovery', now() - interval '300 days' + interval '4 hours', 'cancellata', null, null, null, null, '22222222-2222-4222-8222-222222222222'),
  ('86860000-0000-4000-8000-0000000000d1', '86860000-0000-4000-8000-000000000006', '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'discovery', now() - interval '300 days' + interval '5 hours', 'svolta', true, 'follow_up', 'Decisione', 'discreta', '22222222-2222-4222-8222-222222222222');
-- a sale of the closed call: 1.200 contract, first rate 400 collected
insert into public.clients (id, lead_id, nome, cognome, fonte, setter_id, closer_id) values
  ('86860000-0000-4000-8000-0000000000e1', '86860000-0000-4000-8000-000000000001', 'Lead', 'Uno', 'dm_inbound', '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333');
insert into public.sales (id, client_id, prodotto_personalizzato, tipo, call_id, setter_id, closer_id, data_vendita, data_inizio, data_fine, valore_contratto, numero_rate) values
  ('86860000-0000-4000-8000-0000000000f1', '86860000-0000-4000-8000-0000000000e1', 'Percorso di prova', 'nuovo', '86860000-0000-4000-8000-0000000000c1',
   '22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333', (now() - interval '300 days')::date, (now() - interval '293 days')::date, (now() - interval '113 days')::date, 1200, 3);
delete from public.payments where sale_id = '86860000-0000-4000-8000-0000000000f1';
insert into public.payments (sale_id, numero_rata, scadenza, importo_previsto, incassato_il, importo_incassato, metodo, stato) values
  ('86860000-0000-4000-8000-0000000000f1', 1, (now() - interval '300 days')::date, 400, (now() - interval '300 days')::date, 400, 'bonifico', 'incassata'),
  ('86860000-0000-4000-8000-0000000000f1', 2, (now() - interval '270 days')::date, 400, null, null, null, 'prevista'),
  ('86860000-0000-4000-8000-0000000000f1', 3, (now() - interval '240 days')::date, 400, null, null, null, 'prevista');
-- recordings: c1 and c2 recorded (30 and 40 minutes), c3 not; an analysis of c2 with the time objection, c3 with a personal one
insert into public.call_registrazioni (call_id, stato, link_verificato, recording_id, durata_secondi) values
  ('86860000-0000-4000-8000-0000000000c1', 'collegata', 'https://fathom.video/share/T86C1', 9600001, 1800),
  ('86860000-0000-4000-8000-0000000000c2', 'collegata', 'https://fathom.video/share/T86C2', 9600002, 2400);
insert into public.call_analisi (call_id, stato, in_target, categorie_obiezioni, analizzata_il, riassunto) values
  ('86860000-0000-4000-8000-0000000000c2', 'pronta', 'si', array['tempo', 'decisione_condivisa'], now(), 'x'),
  ('86860000-0000-4000-8000-0000000000c3', 'pronta', 'no', array['condizioni_personali'], now(), 'x')
on conflict (call_id) do update set stato = 'pronta', in_target = excluded.in_target, categorie_obiezioni = excluded.categorie_obiezioni, riassunto = 'x', analizzata_il = now();

create temp table r86 (chi text, per text, righe jsonb);
grant all on r86 to public;
create or replace function pg_temp.num86(p_chi text, p_per text, p_closer uuid default null) returns void language plpgsql as $$
begin
  insert into r86 select p_chi, p_per, coalesce(jsonb_agg(to_jsonb(n)), '[]'::jsonb)
  from public.call_numeri_periodo((now() - interval '301 days')::date, (now() - interval '299 days')::date, p_per, p_closer) n;
exception when others then insert into r86 values (p_chi, p_per, jsonb_build_object('errore', sqlstate));
end; $$;

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
do $$ begin
  perform pg_temp.num86('admin_tutti', 'totale');
  perform pg_temp.num86('admin_closer', 'totale', '33333333-3333-4333-8333-333333333333');
  perform pg_temp.num86('admin_sé', 'totale', '11111111-1111-4111-8111-111111111111');
  perform pg_temp.num86('admin_fonte', 'fonte', '33333333-3333-4333-8333-333333333333');
  perform pg_temp.num86('admin_contenuto', 'contenuto', '33333333-3333-4333-8333-333333333333');
end $$;
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
do $$ begin
  perform pg_temp.num86('closer', 'totale');
  perform pg_temp.num86('closer_altro', 'totale', '11111111-1111-4111-8111-111111111111');
end $$;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
do $$ begin perform pg_temp.num86('setter', 'totale'); end $$;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
do $$ begin perform pg_temp.num86('marketing', 'totale'); end $$;
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111',
  'role', 'authenticated', 'client_id', '7c000000-0000-4000-8000-000000000001',
  'session_id', '7e000000-0000-4000-8000-000000000001')::text, true);
do $$ begin perform pg_temp.num86('oauth', 'totale'); end $$;
reset role;

-- the closer's total: 3 held + 1 no-show = 4 calls; show rate 3/4; closed 1; close rate 1/3
select is((select righe -> 0 ->> 'call' from r86 where chi = 'admin_closer'), '4', 'call = svolte + no show, le cancellate fuori');
select is((select righe -> 0 ->> 'svolte' from r86 where chi = 'admin_closer'), '3', 'svolte');
select is((select (righe -> 0 ->> 'show_rate')::numeric from r86 where chi = 'admin_closer'), 0.75, 'show rate = svolte / (svolte + no show)');
select is((select (righe -> 0 ->> 'close_rate')::numeric from r86 where chi = 'admin_closer'), 0.3333, 'close rate = chiuse / svolte');
select is((select (righe -> 0 ->> 'close_rate_qualificate')::numeric from r86 where chi = 'admin_closer'), 0.5, 'close rate sulle qualificate (la chiusa e il follow-up)');
select is((select (righe -> 0 ->> 'quota_in_target')::numeric from r86 where chi = 'admin_closer'), 0.5, 'in target = si / (si + no) sulle analizzate');
select is((select righe -> 0 -> 'obiezioni' -> 0 ->> 'categoria' from r86 where chi = 'admin_closer'), 'condizioni_personali', 'le obiezioni, ordinate (a pari numero, per nome)');
select is((select jsonb_array_length(righe -> 0 -> 'obiezioni') from r86 where chi = 'admin_closer'), 3, 'sulle call analizzate non chiuse');
select is((select righe -> 0 ->> 'vendite_nuove' from r86 where chi = 'admin_closer'), '1', 'l''admin vede le vendite dei clienti nuovi');
select is((select (righe -> 0 ->> 'revenue_nuovi')::numeric from r86 where chi = 'admin_closer'), 1200::numeric, 'la revenue');
select is((select (righe -> 0 ->> 'cash_nuovi')::numeric from r86 where chi = 'admin_closer'), 400::numeric, 'e il cash della prima rata');
-- only the calls of whoever asks
select is((select righe -> 0 ->> 'copertura' from r86 where chi = 'admin_closer'), null, 'con il closer di un altro la copertura non c''è');
select is((select righe -> 0 ->> 'durata_media_min' from r86 where chi = 'admin_tutti'), null, 'né con tutti');
select is((select righe -> 0 ->> 'performance' from r86 where chi = 'admin_closer'), null, 'né la performance');
select is((select righe -> 0 ->> 'copertura' from r86 where chi = 'closer'), '0.6667', 'il closer vede la copertura delle sue: 2 registrate su 3');
select is((select righe -> 0 ->> 'durata_media_min' from r86 where chi = 'closer'), '35.0', 'e la durata media');
select is((select righe -> 0 -> 'performance' ->> 'buona' from r86 where chi = 'closer'), '1', 'e la performance confermata');
select is((select righe -> 0 ->> 'revenue_nuovi' from r86 where chi = 'closer'), null, 'ma mai gli euro');
select is((select righe -> 0 ->> 'call' from r86 where chi = 'closer_altro'), '4', 'il closer con un altro closer scelto ottiene sé stesso');
select is((select righe -> 0 ->> 'copertura' from r86 where chi = 'admin_sé'), '0.0000', 'l''admin su sé stesso vede la copertura (0 registrate su 1)');
-- by source and by post
select is((select jsonb_array_length(righe) from r86 where chi = 'admin_fonte'), 2, 'per fonte: inbound e outbound (la cancellata non conta)');
select is((select righe -> 0 ->> 'etichetta' from r86 where chi = 'admin_fonte'), 'Instagram DM inbound', 'con le etichette');
create temp table rc86 as select e from r86, jsonb_array_elements(righe) e where chi = 'admin_contenuto' and e ->> 'gruppo' = 'T86Reel01';
select is((select count(*)::integer from rc86), 1, 'per contenuto: il reel da cui arriva il lead');
select ok((select e ->> 'etichetta' from rc86) like 'Reel del %', 'con la sua etichetta');
select is((select e ->> 'media_id' from rc86), '8600000000000001', 'e il media per aprire l''analisi');
select ok(exists (select 1 from jsonb_array_elements((select righe from r86 where chi = 'admin_contenuto')) e where e ->> 'gruppo' = 'non_riconosciuto'),
  'i lead senza origine in «Contenuto non riconosciuto»');
-- who may ask
select is((select array_agg(chi order by chi) from r86 where righe ? 'errore'), array['marketing', 'oauth', 'setter'], 'il setter, il marketing e un token di Claude: 42501');
select is((select righe ->> 'errore' from r86 where chi = 'setter'), '42501', 'con quel codice');
select is(pg_temp.codice($$ select * from public.call_numeri_periodo(current_date - 400, current_date, 'totale') $$), '42501', 'senza sessione');

select * from finish();
rollback;
