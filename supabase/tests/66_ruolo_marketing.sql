-- The marketing role (Dany, 08/10/2026): the Marketing area plus Progetti, like
-- the video editor, and never money, leads, calls, clients, setter reports,
-- Instagram proposals or DMs (Dany's own Instagram posts and their links with the
-- calendar, 1.33.0, yes; of the Insight, 1.35.0, only the leads per post, never a
-- chat or a name). Every Economics policy is an allow-list: this test
-- reads every table and view of public as marketing and as the video editor and
-- accepts rows only from the allow-list, so a table added later is covered
-- without editing it.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(42);

-- ---------------------------------------------------------------------------
-- 1. The role, and an invite that uses it
-- ---------------------------------------------------------------------------
select enum_has_labels('public', 'app_role',
  array['admin', 'setter', 'closer', 'coach', 'editor', 'marketing', 'nutrizione', 'dev'],
  'app_role ha marketing, dopo il video editor');

insert into public.invites (email, ruolo) values
  ('marketing66@alpha.test', 'marketing'),
  ('nutrizione66@alpha.test', 'nutrizione'),
  ('dev66@alpha.test', 'dev');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999990066',
   'authenticated', 'authenticated', 'marketing66@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Marta Sessantasei"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999990166',
   'authenticated', 'authenticated', 'nutrizione66@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Nina Sessantasei"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999990266',
   'authenticated', 'authenticated', 'dev66@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Dario Sessantasei"}'::jsonb, now(), now(), '', '', '', '');

select is(
  (select row(ruolo, livello_pm, attivo)::text from public.profiles where id = '99999999-9999-4999-8999-999999990066'),
  row('marketing'::public.app_role, 'employee'::public.pm_livello, true)::text,
  'l''invito come marketing crea il profilo marketing, employee nei progetti'
);

-- ---------------------------------------------------------------------------
-- 2. vede_marketing(): admin, video editor and marketing, active
-- ---------------------------------------------------------------------------
set local role authenticated;

set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select ok(public.vede_marketing(), 'l''admin vede l''area Marketing');
set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
select ok(public.vede_marketing(), 'il video editor la vede');
set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999990066","role":"authenticated"}';
select ok(public.vede_marketing(), 'il marketing la vede');
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select ok(not public.vede_marketing(), 'il setter no');
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select ok(not public.vede_marketing(), 'il closer no');
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select ok(not public.vede_marketing(), 'il coach no');
set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999990166","role":"authenticated"}';
select ok(not public.vede_marketing(), 'la nutrizione no');
set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999990266","role":"authenticated"}';
select ok(not public.vede_marketing(), 'lo sviluppo no');
set local request.jwt.claims to '{}';
select ok(not public.vede_marketing(), 'senza sessione no');

reset role;
set local request.jwt.claims to '{}';
update public.profiles set attivo = false where id = '99999999-9999-4999-8999-999999990066';
set local role authenticated;
set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999990066","role":"authenticated"}';
select ok(not public.vede_marketing(), 'un account marketing disattivato no');
reset role;
set local request.jwt.claims to '{}';
update public.profiles set attivo = true where id = '99999999-9999-4999-8999-999999990066';

-- ---------------------------------------------------------------------------
-- 3. Every table and view of public, counted as marketing and as the editor
-- ---------------------------------------------------------------------------
-- A row in every table the seed leaves empty, so "0 rows" means something
insert into public.call_pitch (call_id, importo_proposto)
select c.id, 1500 from public.calls c
where not exists (select 1 from public.call_pitch p where p.call_id = c.id)
limit 1;
insert into public.clienti_cartelle (client_id, url)
select c.id, 'https://drive.google.com/drive/folders/test-66' from public.clients c
where not exists (select 1 from public.clienti_cartelle x where x.client_id = c.id)
limit 1;
insert into public.clienti_chiusure (client_id, chiuso_il, motivo)
select c.id, public.oggi(), 'Prova del test 66' from public.clients c
where not exists (select 1 from public.clienti_chiusure x where x.client_id = c.id)
  and not exists (select 1 from public.sales s where s.client_id = c.id and s.data_vendita > public.oggi())
limit 1;
insert into public.report_proposte_instagram (setter_id, data, dm_outbound, chat_lette)
values ('22222222-2222-4222-8222-222222222222', '2024-01-15', 12, 20)
on conflict (setter_id, data) do nothing;
insert into public.instagram_esclusi (username, motivo) values ('prova_test_66', 'Prova del test 66')
on conflict (username) do nothing;
insert into public.promemoria_percorso (client_id, tipo, data_fine, esito)
select c.id, 'rinnovo_1_mese', '2024-02-29', 'inviato' from public.clients c limit 1
on conflict (client_id, tipo, data_fine) do nothing;
insert into public.obiettivi_mese (mese, cash, nuovi_clienti) values ('2024-01-01', 10000, 5)
on conflict (mese) do nothing;
-- The Instagram posts and their links with the calendar (1.33.0): allowed below,
-- one row each so the check that marketing and the editor read them means something
insert into public.marketing_contenuti (id, tipo, nome, stato, post_date) values
  ('66660000-0000-4000-8000-000000000066', 'reel', 'Contenuto del test 66', 'posted', public.oggi() - 1)
on conflict (id) do nothing;
insert into public.instagram_contenuti (media_id, shortcode, permalink, media_type, reel, pubblicato_il) values
  ('6600000000000001', 'Test66Post1', 'https://www.instagram.com/reel/Test66Post1/', 'VIDEO', true, now() - interval '1 day'),
  ('6600000000000002', 'Test66Post2', 'https://www.instagram.com/p/Test66Post2/', 'IMAGE', false, now() - interval '1 day')
on conflict (media_id) do nothing;
insert into public.marketing_abbinamenti (shortcode, contenuto_id, esito, punteggio, somiglianza, giorni, motivi)
values ('Test66Post1', '66660000-0000-4000-8000-000000000066', 'proposto', 50, 0.4, 0, array['stessa_data'])
on conflict (shortcode, contenuto_id) do nothing;
insert into public.marketing_abbinamenti_rifiutati (shortcode, contenuto_id)
values ('Test66Rifiutato', '66660000-0000-4000-8000-000000000066')
on conflict (shortcode, contenuto_id) do nothing;
insert into public.marketing_post_esclusi (shortcode) values ('Test66Post2')
on conflict (shortcode) do nothing;
-- The Insight (1.35.0): the leads per post are allowed below; the chats, the
-- profiles, the runs, the AI work and the Messenger exclusions never (the
-- recaps have the seed's rows, the automation and the Messenger Page their row)
insert into public.instagram_contenuti_dm (shortcode, giorno, dm, lead_in_target, call_prenotate, dm_certi)
values ('Test66Post1', public.oggi() - 1, 2, 1, 1, 1)
on conflict (shortcode, giorno) do nothing;
insert into public.instagram_contenuti_dm_giorni (giorno) values (public.oggi() - 1)
on conflict (giorno) do nothing;
insert into public.insight_esecuzioni (id, giorno, motivo, stato, passo) values
  ('66660000-0000-4000-8000-000000000166', public.oggi() - 2, 'manuale', 'pronta', 'unione')
on conflict (id) do nothing;
insert into public.insight_chat (canale, conversazione_id, username, nome, messaggi, messaggi_letti, completa)
values ('instagram', 'test66-chat', 'lead.test66', 'Lead Test 66',
        '[{"da":"lead","il":"2026-10-10T10:00:00Z","testo":"Ciao","codici":[],"storia":false}]', 1, true)
on conflict (canale, conversazione_id) do nothing;
insert into public.insight_profili (username, nome) values ('lead.test66', 'Lead Test 66')
on conflict (username) do nothing;
insert into public.insight_blocchi (esecuzione_id, canale, tipo, indice)
values ('66660000-0000-4000-8000-000000000166', 'instagram', 'sintesi', 0)
on conflict (esecuzione_id, canale, tipo, indice) do nothing;
insert into public.insight_schede (esecuzione_id, giorno, canale, tipo, chiave, impronta, dati)
values ('66660000-0000-4000-8000-000000000166', public.oggi() - 2, 'instagram', 'lead', 'test66-chat', repeat('f', 64), '{}')
on conflict (esecuzione_id, canale, tipo, chiave) do nothing;
insert into public.insight_recap (giorno, canale, esecuzione_id, generato_il, stato, dati)
values (public.oggi() - 2, 'instagram', '66660000-0000-4000-8000-000000000166', now(), 'completo',
        '{"leads":[{"username":"lead.test66","name":"Lead Test 66"}]}')
on conflict (giorno, canale) do nothing;
insert into public.insight_fatto (giorno, canale, chiave, fatto) values (public.oggi() - 2, 'instagram', 'lead.test66', true)
on conflict (giorno, canale, chiave) do nothing;
insert into public.messenger_esclusi (utente_id, nome) values ('6600000000000066', 'Escluso Test 66')
on conflict (utente_id) do nothing;
select is(
  (select coalesce(array_agg(t order by t), '{}') from unnest(array[
     'insight_impostazioni', 'insight_esecuzioni', 'insight_chat', 'insight_profili', 'insight_blocchi',
     'insight_schede', 'insight_recap', 'insight_fatto', 'messenger_collegamento', 'messenger_esclusi',
     'instagram_contenuti_dm', 'instagram_contenuti_dm_giorni']) as t
   where (xpath('/row/n/text()', query_to_xml(format('select count(*) as n from public.%I', t), false, true, '')))[1]::text::integer = 0),
  '{}'::text[],
  'ogni tabella dell''Insight ha righe: 0 righe qui sotto vuol dire RLS'
);

create temp table righe_viste (persona text, relazione text, righe bigint, errore text) on commit drop;
grant select, insert on righe_viste to authenticated;

create or replace function pg_temp.conta_tutto(p_persona text)
returns void
language plpgsql
as $$
declare
  r record;
  n bigint;
begin
  for r in
    select tablename::text as nome from pg_catalog.pg_tables where schemaname = 'public'
    union
    select viewname::text from pg_catalog.pg_views where schemaname = 'public'
  loop
    begin
      execute format('select count(*) from public.%I', r.nome) into n;
      insert into pg_temp.righe_viste values (p_persona, r.nome, n, null);
    exception when others then
      insert into pg_temp.righe_viste values (p_persona, r.nome, null, sqlstate);
    end;
  end loop;
end;
$$;

set local role authenticated;
-- the seed marketing account (supabase/seeds/25_marketing.sql), member of the reels project
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
do $$ begin perform pg_temp.conta_tutto('marketing'); end $$;
set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
do $$ begin perform pg_temp.conta_tutto('editor'); end $$;
reset role;

select is(
  (select count(*)::integer from righe_viste where persona = 'marketing'),
  (select count(*)::integer from pg_tables where schemaname = 'public')
    + (select count(*)::integer from pg_views where schemaname = 'public'),
  'il conteggio ha letto tutte le tabelle e le view di public (una relazione che dà errore non mostra righe)'
);
select ok(
  (select righe from righe_viste where persona = 'marketing' and relazione = 'marketing_contenuti') > 0
  and (select righe from righe_viste where persona = 'marketing' and relazione = 'pm_progetti') > 0,
  'il marketing legge il calendario dei contenuti e i progetti di cui fa parte'
);
-- Allowed: the team directory, the content calendar, the Instagram posts and
-- their links with the calendar (1.33.0, 69_post_instagram.sql), the leads per
-- post of the Insight and their counted days (1.35.0, 78_contenuti_dm.sql), the Projects area.
-- products: its own rule and test (20261009120200, 68_prodotti_solo_economics.sql).
create temp table ammesse (relazione text primary key) on commit drop;
insert into ammesse values
  ('profiles'), ('marketing_contenuti'), ('products'),
  ('instagram_contenuti'), ('instagram_contenuti_stato'), ('marketing_abbinamenti'),
  ('marketing_abbinamenti_rifiutati'), ('marketing_post_esclusi'),
  ('v_instagram_post'), ('v_marketing_proposte'), ('instagram_contenuti_dm'), ('instagram_contenuti_dm_giorni');
select is(
  (select coalesce(array_agg(relazione order by relazione), '{}') from righe_viste
   where persona = 'marketing' and righe > 0
     and relazione not in (select relazione from ammesse)
     and relazione not like 'pm\_%' and relazione not like 'v\_pm\_%'),
  '{}'::text[],
  'il marketing non legge nient''altro: né soldi, né lead, call, clienti, report, proposte o DM'
);
select is(
  (select coalesce(array_agg(relazione order by relazione), '{}') from righe_viste
   where persona = 'editor' and righe > 0
     and relazione not in (select relazione from ammesse)
     and relazione not like 'pm\_%' and relazione not like 'v\_pm\_%'),
  '{}'::text[],
  'nemmeno il video editor'
);
select is(
  (select coalesce(array_agg(a.relazione order by a.relazione), '{}') from ammesse a
   where a.relazione not in ('profiles', 'marketing_contenuti', 'products')
     and not exists (select 1 from righe_viste r
                     where r.persona = 'marketing' and r.relazione = a.relazione and r.righe > 0)),
  '{}'::text[],
  'il marketing legge i post di Instagram, i loro legami col calendario e i lead per post'
);
select is(
  (select coalesce(array_agg(a.relazione order by a.relazione), '{}') from ammesse a
   where a.relazione not in ('profiles', 'marketing_contenuti', 'products')
     and not exists (select 1 from righe_viste r
                     where r.persona = 'editor' and r.relazione = a.relazione and r.righe > 0)),
  '{}'::text[],
  'anche il video editor'
);

-- ---------------------------------------------------------------------------
-- 4. The Economics functions refuse marketing
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';

select throws_ok($$ select * from public.giornate_closer('2026-10-01', '2026-10-31') $$, '42501', null,
  'giornate_closer: no');
select throws_ok($$ select * from public.giornate_setter('2026-10-01', '2026-10-31') $$, '42501', null,
  'giornate_setter: no');
select throws_ok($$ select * from public.commenti_setter_periodo('2026-10-01', '2026-10-31', null, 10) $$, '42501', null,
  'commenti_setter_periodo: no');
select throws_ok($$ select * from public.motivi_non_chiusura_periodo('2026-10-01', '2026-10-31', null, 10) $$, '42501', null,
  'motivi_non_chiusura_periodo: no');
select throws_ok($$ select * from public.metriche_periodo('2026-10-01', '2026-10-31') $$, '42501', null,
  'metriche_periodo: no');
select throws_ok($$ select * from public.metriche_setting('2026-10-01', '2026-10-31') $$, '42501', null,
  'metriche_setting: no');
select throws_ok($$ select * from public.metriche_per_fonte('2026-10-01', '2026-10-31') $$, '42501', null,
  'metriche_per_fonte: no');
select throws_ok($$ select * from public.cash_mensile(12, '2026-10-31') $$, '42501', null,
  'cash_mensile: no');
select throws_ok($$ select * from public.previsione_cassa(3) $$, '42501', null,
  'previsione_cassa: no');
select throws_ok($$ select * from public.avanzamento_obiettivi('2026-10-01') $$, '42501', null,
  'avanzamento_obiettivi: no');
select throws_ok($$ select * from public.provvigioni_per_vendita(null) $$, '42501', null,
  'provvigioni_per_vendita: no');
select throws_ok($$ select * from public.pm_tempo_per_persona('2026-10-01', '2026-10-31', null, null, 10) $$, '42501', null,
  'pm_tempo_per_persona: no');
select throws_ok($$ select * from public.incassi_clienti_setter('2026-10-01', '2026-10-31') $$, '42501', null,
  'incassi_clienti_setter: no');
select throws_ok($$ select * from public.da_incassare_closer() $$, '42501', null,
  'da_incassare_closer: no');
select throws_ok($$ select * from public.mie_vendite_setter() $$, '42501', null,
  'mie_vendite_setter: no');
select throws_ok($$ select * from public.vendite_da_collegare('66666666-0000-4000-8000-000000000066') $$, '42501', null,
  'vendite_da_collegare: no');
select throws_ok($$ select * from public.anteprima_eliminazione('cliente', '66666666-0000-4000-8000-000000000066') $$, '42501', null,
  'anteprima_eliminazione: no');
select throws_ok($$ select * from public.backup_completo() $$, '42501', null,
  'backup_completo: no (solo il service role)');
select throws_ok($$ select * from public.riepilogo_settimana('2026-10-03', '2026-10-09') $$, '42501', null,
  'riepilogo_settimana: no (solo il service role)');

-- ---------------------------------------------------------------------------
-- 5. No Economics writes
-- ---------------------------------------------------------------------------
select throws_ok($$
  insert into public.leads (nome, setter_id, fonte)
  values ('Lead Del Marketing', '61616161-6161-4161-8161-616161616161', 'organico') $$,
  '42501', null, 'il marketing non crea lead');
select throws_ok($$
  insert into public.calls (lead_id, setter_id, closer_id, tipo, programmata_il)
  values ((select id from public.leads limit 1), '22222222-2222-4222-8222-222222222222',
          '11111111-1111-4111-8111-111111111111', 'discovery', now() + interval '1 day') $$,
  '42501', null, 'né call');
select throws_ok($$
  insert into public.setter_daily_reports (setter_id, data, dm_outbound)
  values ('61616161-6161-4161-8161-616161616161', '2026-10-01', 5) $$,
  '42501', null, 'né report del setting');
select throws_ok($$
  insert into public.products (nome, durata_mesi, prezzo_listino)
  values ('Prodotto Del Marketing', 3, 999) $$,
  '42501', null, 'né prodotti');

reset role;
select * from finish();
rollback;
