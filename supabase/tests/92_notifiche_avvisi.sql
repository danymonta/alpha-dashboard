-- The in-app alerts of the notification center (1.42.0, 20261022090000_notifiche_avvisi.sql): the writers
-- (service_role only, once per key, even if the admin deleted the alert), the overdue-instalments digest, a
-- new Instagram proposal, Claude's spend near the monthly limit, what the evening scan reads of the
-- connections, and who reads the alerts (only their recipient).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(73);

-- a clean slate for the kinds this test looks at (the seed has one example of each)
delete from public.notifiche where tipo in ('rate_in_ritardo', 'chiave_in_scadenza', 'chiave_rifiutata', 'proposta_da_approvare', 'spesa_claude');
delete from public.notifiche_avvisi_emessi;
delete from public.rate_notificate;

-- ---------------------------------------------------------------------------
-- 1. Structure and grants
-- ---------------------------------------------------------------------------
select has_column('public', 'notifiche', 'canale', 'canale c''è');
select has_column('public', 'notifiche', 'dettagli', 'dettagli c''è');
select col_is_null('public', 'notifiche', 'corpo_html', 'solo un''email porta l''HTML: per un avviso è null');
select ok((select relrowsecurity from pg_class where oid = 'public.rate_notificate'::regclass), 'rate_notificate: RLS abilitata');
select ok((select relrowsecurity from pg_class where oid = 'public.notifiche_avvisi_emessi'::regclass), 'notifiche_avvisi_emessi: RLS abilitata');
select is(
  (select array_agg(policyname::text order by policyname::text) from pg_policies
   where schemaname = 'public' and tablename in ('rate_notificate', 'notifiche_avvisi_emessi')),
  array['notifiche_avvisi_emessi_mai_da_oauth', 'notifiche_avvisi_emessi_nessuna_sessione',
        'rate_notificate_mai_da_oauth', 'rate_notificate_nessuna_sessione'],
  'le due tabelle di servizio: una policy che nega tutto e il rifiuto dei token di Claude');
select ok(not has_table_privilege('authenticated', 'public.rate_notificate', 'select'), 'nessuna sessione legge le rate già annunciate');
select ok(not has_table_privilege('authenticated', 'public.notifiche_avvisi_emessi', 'select'), 'né le chiavi già emesse');

select is(
  (select coalesce(string_agg(f, ', ' order by f), '') from unnest(array[
     'notifiche_avviso(uuid[], text, text, text, jsonb, text, text)',
     'notifiche_avviso_admin(text, text, text, jsonb, text, text)',
     'notifiche_rate_in_ritardo(date)', 'notifiche_collegamenti_stato()', 'notifiche_proposta(uuid)',
     'notifiche_spesa(text, date, numeric, numeric, numeric)',
     'notifiche_euro(numeric)', 'notifiche_dollari(numeric)', 'notifiche_data(date)']) as f
   where has_function_privilege('authenticated', 'public.' || f, 'execute')
      or has_function_privilege('anon', 'public.' || f, 'execute')),
  '', 'nessuna sessione chiama le funzioni degli avvisi');
select ok(
  has_function_privilege('service_role', 'public.notifiche_avviso(uuid[], text, text, text, jsonb, text, text)', 'execute')
  and has_function_privilege('service_role', 'public.notifiche_rate_in_ritardo(date)', 'execute')
  and has_function_privilege('service_role', 'public.notifiche_collegamenti_stato()', 'execute')
  and has_function_privilege('service_role', 'public.notifiche_spesa(text, date, numeric, numeric, numeric)', 'execute'),
  'le chiama il service_role');

-- ---------------------------------------------------------------------------
-- 2. The writer: an alert, once per key
-- ---------------------------------------------------------------------------
select is(
  public.notifiche_avviso(array['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']::uuid[],
    'chiave_in_scadenza', 'Titolo avviso 92', 'Una riga', jsonb_build_array('Riga uno', 'Riga due'), '/settings/chiavi', 'test92/uno'),
  2, 'una riga per destinatario');
select is(
  (select row(canale, corpo_html is null, email_inviata, dettagli)::text from public.notifiche
   where chiave = 'test92/uno' and destinatario_id = '11111111-1111-4111-8111-111111111111'),
  row('app'::text, true, false, '["Riga uno", "Riga due"]'::jsonb)::text,
  'è un avviso solo nell''app: niente HTML, nessuna email');
select is(
  public.notifiche_avviso(array['11111111-1111-4111-8111-111111111111']::uuid[],
    'chiave_in_scadenza', 'Titolo avviso 92', 'Una riga', null, '/settings/chiavi', 'test92/uno'),
  0, 'la stessa chiave non scrive niente');
delete from public.notifiche where chiave = 'test92/uno' and destinatario_id = '11111111-1111-4111-8111-111111111111';
select is(
  public.notifiche_avviso(array['11111111-1111-4111-8111-111111111111']::uuid[],
    'chiave_in_scadenza', 'Titolo avviso 92', 'Una riga', null, '/settings/chiavi', 'test92/uno'),
  0, 'nemmeno dopo che l''admin l''ha eliminata: è lo stesso avviso');
select is(public.notifiche_avviso(array['00000000-0000-4000-8000-0000000000aa']::uuid[],
    'chiave_in_scadenza', 'Nessuno', '', null, null, 'test92/nessuno'), 0, 'un destinatario che non è un profilo non scrive');
select is((select count(*)::int from public.notifiche_avvisi_emessi where chiave = 'test92/nessuno'), 0,
  'e non brucia la chiave: resta libera per quando c''è qualcuno');

select throws_ok($$select public.notifiche_avviso(array['11111111-1111-4111-8111-111111111111']::uuid[], 'sconosciuto', 'T', '', null, null, 'test92/t1')$$,
  '23514', null, 'un tipo che non c''è si rifiuta');
select throws_ok($$select public.notifiche_avviso(array['11111111-1111-4111-8111-111111111111']::uuid[], 'spesa_claude', 'T', '', null, 'https://evil.example', 'test92/l1')$$,
  '23514', null, 'un link esterno si rifiuta');
select throws_ok($$select public.notifiche_avviso(array['11111111-1111-4111-8111-111111111111']::uuid[], 'spesa_claude', 'T', '', '{"a":1}'::jsonb, null, 'test92/d1')$$,
  '23514', null, 'i dettagli sono una lista');
select throws_ok($$select public.notifiche_avviso(array['11111111-1111-4111-8111-111111111111']::uuid[], 'spesa_claude', 'T', '', '[1, 2]'::jsonb, null, 'test92/d2')$$,
  '23514', null, 'di righe di testo');
select throws_ok($$select public.notifiche_avviso(array['11111111-1111-4111-8111-111111111111']::uuid[], 'spesa_claude', 'T', '', (select jsonb_agg('x'::text) from generate_series(1, 32)), null, 'test92/d3')$$,
  '23514', null, 'al massimo 31');
select is((select count(*)::int from public.notifiche_avvisi_emessi where chiave in ('test92/t1', 'test92/l1', 'test92/d1', 'test92/d2', 'test92/d3')), 0,
  'un avviso rifiutato non lascia la chiave emessa');

-- an email still needs its HTML; an alert never says an email left
select throws_ok($$insert into public.notifiche (destinatario_id, tipo, titolo, chiave) values ('11111111-1111-4111-8111-111111111111', 'backup', 'Senza corpo', 'test92/senza')$$,
  '23514', null, 'un''email senza corpo si rifiuta');
select throws_ok($$insert into public.notifiche (destinatario_id, tipo, titolo, chiave, canale, email_inviata) values ('11111111-1111-4111-8111-111111111111', 'spesa_claude', 'Finta', 'test92/finta', 'app', true)$$,
  '23514', null, 'un avviso non dice mai che un''email è partita');

-- ---------------------------------------------------------------------------
-- 3. Overdue instalments: the digest
-- ---------------------------------------------------------------------------
create temp table attese92 on commit drop as
select count(*)::int as n, coalesce(sum(p.importo_previsto), 0) as totale
from public.payments p where p.stato = 'prevista' and p.scadenza < public.oggi();

select ok((select n from attese92) >= 1, 'il seed ha almeno una rata in ritardo');
select is(public.notifiche_rate_in_ritardo(public.oggi()), (select n from attese92), 'il primo giro annuncia tutte quelle in ritardo');
select is(
  (select count(*)::int from public.notifiche where chiave = 'rate-in-ritardo/' || public.oggi()),
  (select count(*)::int from public.profiles where ruolo = 'admin' and attivo),
  'un avviso per ogni admin attivo');
select is(
  (select count(*)::int from public.notifiche where chiave = 'rate-in-ritardo/' || public.oggi() and destinatario_id <> '11111111-1111-4111-8111-111111111111'
     and destinatario_id not in (select id from public.profiles where ruolo = 'admin')),
  0, 'e a nessun altro');
select is(
  (select row(tipo, canale, link, email_inviata, corpo_html is null)::text from public.notifiche
   where chiave = 'rate-in-ritardo/' || public.oggi() and destinatario_id = '11111111-1111-4111-8111-111111111111'),
  row('rate_in_ritardo'::text, 'app'::text, '/payments?vista=ritardo'::text, false, true)::text,
  'tipo, solo nell''app e il link alla vista in ritardo');
select matches(
  (select dettagli ->> 0 from public.notifiche where chiave = 'rate-in-ritardo/' || public.oggi() and destinatario_id = '11111111-1111-4111-8111-111111111111'),
  '· Rata \d+ di \d+ · [\d.]+,\d\d € · scaduta il \d\d/\d\d/\d{4}$',
  'ogni riga dice cliente, rata «Rata 2 di 4», importo e scadenza');
select is((select count(*)::int from public.rate_notificate), (select n from attese92), 'le rate annunciate sono segnate');
select is(public.notifiche_rate_in_ritardo(public.oggi()), 0, 'un secondo giro dello stesso cron non annuncia niente');
select is(
  (select count(*)::int from public.notifiche where tipo = 'rate_in_ritardo' and destinatario_id = '11111111-1111-4111-8111-111111111111'),
  1, 'e non raddoppia l''avviso');

-- a rata that falls overdue after the digest goes in the next day's one, alone
insert into public.payments (sale_id, numero_rata, scadenza, importo_previsto, stato)
select s.id, 99, public.oggi() - 1, 123.40, 'prevista' from public.sales s limit 1;
select is(public.notifiche_rate_in_ritardo(public.oggi()), 0,
  'una rata nuova lo stesso giorno non cambia l''avviso di oggi (la chiave è la stessa)');
select is((select count(*)::int from public.rate_notificate), (select n from attese92),
  'e resta da annunciare: non viene segnata se non è stata annunciata');
create temp table giorno_dopo92 on commit drop as
select count(*)::int as n from public.payments p
where p.stato = 'prevista' and p.scadenza < public.oggi() + 1 and p.id not in (select payment_id from public.rate_notificate);
select is(public.notifiche_rate_in_ritardo(public.oggi() + 1), (select n from giorno_dopo92), 'il giorno dopo annuncia solo le nuove');
select ok(
  (select dettagli::text like '%Rata 99 di %123,40 €%' from public.notifiche
   where chiave = 'rate-in-ritardo/' || (public.oggi() + 1) and destinatario_id = '11111111-1111-4111-8111-111111111111'),
  'tra cui quella nuova, con l''importo in euro');
select is(public.notifiche_rate_in_ritardo(public.oggi() + 1), 0, 'e il giorno dopo non si ripete');

-- paid in the meantime: not announced
update public.payments set stato = 'incassata', incassato_il = public.oggi(), importo_incassato = importo_previsto
where numero_rata = 99;
insert into public.payments (sale_id, numero_rata, scadenza, importo_previsto, stato)
select s.id, 98, public.oggi(), 50, 'prevista' from public.sales s limit 1;
select is(public.notifiche_rate_in_ritardo(public.oggi()), 0, 'una rata che scade oggi non è ancora in ritardo');

select throws_ok($$select public.notifiche_rate_in_ritardo(null)$$, '22023', null, 'senza giorno no');

-- the formatting helpers
select is(public.notifiche_euro(1234.5), '1.234,50 €', 'euro con il punto delle migliaia e la virgola');
select is(public.notifiche_euro(500), '500,00 €', 'euro piccoli');
select is(public.notifiche_dollari(21.456), '21,46 $', 'dollari con la virgola');

-- ---------------------------------------------------------------------------
-- 4. A new Instagram proposal
-- ---------------------------------------------------------------------------
update public.instagram_collegamento set setter_id = '22222222-2222-4222-8222-222222222222', account_username = 'alpha.prova',
  account_id = '17841400000000001';
create temp table prop92 on commit drop as
select public.instagram_salva_proposta('22222222-2222-4222-8222-222222222222', public.oggi() - 1, 10, 5, 3, 4, 2, 12, 1) as id;
select is(
  (select count(*)::int from public.notifiche where tipo = 'proposta_da_approvare' and chiave = 'proposta/' || (select id from prop92)),
  (select count(*)::int from public.profiles where ruolo = 'admin' and attivo),
  'una proposta nuova avvisa gli admin attivi');
select matches(
  (select titolo from public.notifiche where chiave = 'proposta/' || (select id from prop92) and destinatario_id = '11111111-1111-4111-8111-111111111111'),
  '^Da approvare: il tracciamento di Loris di ieri, [a-zì]+ \d\d/\d\d$',
  'con il nome vero del setter: «Da approvare: il tracciamento di Loris di ieri, mercoledì 07/10»');
select is(
  (select row(link, canale, tipo)::text from public.notifiche where chiave = 'proposta/' || (select id from prop92) and destinatario_id = '11111111-1111-4111-8111-111111111111'),
  row('/setting#da-approvare'::text, 'app'::text, 'proposta_da_approvare'::text)::text, 'porta alla scheda da approvare');
select is(
  (select count(*)::int from public.notifiche where tipo = 'proposta_da_approvare' and destinatario_id = '22222222-2222-4222-8222-222222222222'),
  0, 'e il setter non riceve niente da qui');
-- a recalculation (even with other numbers) is not a new proposal
select public.instagram_salva_proposta('22222222-2222-4222-8222-222222222222', public.oggi() - 1, 11, 5, 3, 4, 2, 12, 1);
select public.instagram_salva_proposta('22222222-2222-4222-8222-222222222222', public.oggi() - 1, 11, 5, 3, 4, 2, 12, 1);
select is((select count(*)::int from public.notifiche where tipo = 'proposta_da_approvare' and destinatario_id = '11111111-1111-4111-8111-111111111111'),
  1, 'un ricalcolo della stessa proposta non avvisa di nuovo');
-- one the admin deleted is not recreated by the next recalculation
delete from public.notifiche where tipo = 'proposta_da_approvare';
select public.instagram_salva_proposta('22222222-2222-4222-8222-222222222222', public.oggi() - 1, 12, 5, 3, 4, 2, 12, 1);
select is((select count(*)::int from public.notifiche where tipo = 'proposta_da_approvare'), 0, 'nemmeno se l''admin l''aveva eliminata');
-- a decided one never tells
update public.report_proposte_instagram set stato = 'scartata', deciso_il = now(), deciso_da = '11111111-1111-4111-8111-111111111111'
where id = (select id from prop92);
select is(public.notifiche_proposta((select id from prop92)), 0, 'una proposta già decisa non avvisa');

-- ---------------------------------------------------------------------------
-- 5. Claude's spend near the limit
-- ---------------------------------------------------------------------------
update public.marketing_lavori_stato set mese = date_trunc('month', public.oggi())::date, token_input = 0, token_cache_scritti = 0,
  token_cache_letti = 0, token_output = 0, secondi_audio = 0, costo_mese_usd = 0, costo_max_mese = 25,
  passo_id = gen_random_uuid(), passo_cosa = 'analisi', passo_rif = 'x', lease_fino_al = now() + interval '5 minutes';
select public.marketing_passo_finito((select passo_id from public.marketing_lavori_stato), 'ok', '{"input":5000000}');
select is((select count(*)::int from public.notifiche where tipo = 'spesa_claude'), 0, '10 $ su 25: niente');
update public.marketing_lavori_stato set passo_id = gen_random_uuid(), passo_cosa = 'analisi', passo_rif = 'x', lease_fino_al = now() + interval '5 minutes';
select public.marketing_passo_finito((select passo_id from public.marketing_lavori_stato), 'ok', '{"input":6000000}');
select is(
  (select array_agg(chiave order by chiave) from public.notifiche where tipo = 'spesa_claude' and destinatario_id = '11111111-1111-4111-8111-111111111111'),
  array['spesa/reel/' || to_char(date_trunc('month', public.oggi()), 'YYYY-MM') || '/80'],
  '22 $ su 25: supera l''80%, una notifica con la chiave del mese');
select matches(
  (select anteprima from public.notifiche where chiave like 'spesa/reel/%/80' and destinatario_id = '11111111-1111-4111-8111-111111111111'),
  '^22,00 \$ su 25,00 \$ questo mese\.', 'dice quanto, in dollari');
select is((select link from public.notifiche where chiave like 'spesa/reel/%/80' and destinatario_id = '11111111-1111-4111-8111-111111111111'),
  '/settings/instagram#analisi-reel', 'e porta alle impostazioni delle analisi dei reel');
-- a step that stays above 80% does not tell again, nor after the admin deleted it
delete from public.notifiche where tipo = 'spesa_claude';
update public.marketing_lavori_stato set passo_id = gen_random_uuid(), passo_cosa = 'analisi', passo_rif = 'x', lease_fino_al = now() + interval '5 minutes';
select public.marketing_passo_finito((select passo_id from public.marketing_lavori_stato), 'ok', '{"input":500000}');
select is((select count(*)::int from public.notifiche where tipo = 'spesa_claude'), 0, 'un passo che resta sopra l''80% non avvisa di nuovo');
update public.marketing_lavori_stato set passo_id = gen_random_uuid(), passo_cosa = 'analisi', passo_rif = 'x', lease_fino_al = now() + interval '5 minutes';
select public.marketing_passo_finito((select passo_id from public.marketing_lavori_stato), 'ok', '{"input":2000000}');
select is(
  (select array_agg(chiave) from public.notifiche where tipo = 'spesa_claude' and destinatario_id = '11111111-1111-4111-8111-111111111111'),
  array['spesa/reel/' || to_char(date_trunc('month', public.oggi()), 'YYYY-MM') || '/100'],
  '26,50 $ su 25: al limite, la seconda notifica');
select matches((select anteprima from public.notifiche where chiave like 'spesa/reel/%/100' and destinatario_id = '11111111-1111-4111-8111-111111111111'),
  'sono ferme fino al 1° ', 'dice fino a quando sono ferme');
update public.marketing_lavori_stato set passo_id = gen_random_uuid(), passo_cosa = 'analisi', passo_rif = 'x', lease_fino_al = now() + interval '5 minutes';
select public.marketing_passo_finito((select passo_id from public.marketing_lavori_stato), 'ok', '{"input":2000000}');
select is((select count(*)::int from public.notifiche where tipo = 'spesa_claude' and destinatario_id = '11111111-1111-4111-8111-111111111111'), 1, 'e non si ripete');

-- the calls and the Spunti: a step that jumps over both thresholds tells only the 100
update public.call_lavori_stato set mese = date_trunc('month', public.oggi())::date, token_input = 0, token_cache_scritti = 0,
  token_cache_letti = 0, token_output = 0, costo_mese_usd = 0, costo_max_mese = 10,
  passo_id = gen_random_uuid(), passo_cosa = 'analisi', passo_rif = 'x', lease_fino_al = now() + interval '5 minutes';
select public.call_passo_finito((select passo_id from public.call_lavori_stato), 'ok', '{"input":6000000}');
select is(
  (select array_agg(chiave) from public.notifiche where chiave like 'spesa/call/%' and destinatario_id = '11111111-1111-4111-8111-111111111111'),
  array['spesa/call/' || to_char(date_trunc('month', public.oggi()), 'YYYY-MM') || '/100'],
  'le call: 12 $ su 10 saltano l''80% e dicono solo il limite');
select is((select link from public.notifiche where chiave like 'spesa/call/%/100' and destinatario_id = '11111111-1111-4111-8111-111111111111'),
  '/settings/fathom', 'con il link alle impostazioni di Fathom');

-- ---------------------------------------------------------------------------
-- 6. What the evening scan reads of the connections
-- ---------------------------------------------------------------------------
update public.instagram_collegamento set token_scade_il = now() + interval '3 days', ultimo_errore = 'Token scaduto', ultimo_errore_il = now();
update public.messenger_collegamento set ultimo_errore = 'Errore Messenger', ultimo_errore_il = now();
select is(
  (select jsonb_object_keys(public.notifiche_collegamenti_stato()) order by 1 limit 1), 'fathom', 'lo stato ha le tre connessioni');
select is((public.notifiche_collegamenti_stato() -> 'instagram' ->> 'errore'), 'Token scaduto', 'l''errore di Instagram');
select is((public.notifiche_collegamenti_stato() -> 'messenger' ->> 'errore'), 'Errore Messenger', 'quello di Messenger');
select ok(not (public.notifiche_collegamenti_stato()::text ~* 'token_valore|decrypted'), 'mai un token o una chiave');
select ok((public.notifiche_collegamenti_stato() -> 'instagram') ? 'presente', 'dice solo se il token c''è');

select is((public.notifiche_collegamenti_stato() -> 'fathom' ->> 'presente')::boolean, false, 'Fathom senza chiave: presente = false');
select vault.create_secret('chiave-di-prova-del-test-92', 'fathom_chiave', 'test 92');
select is((public.notifiche_collegamenti_stato() -> 'fathom' ->> 'presente')::boolean, true, 'con la chiave nel Vault: presente = true');
select ok(public.notifiche_collegamenti_stato()::text not like '%chiave-di-prova-del-test-92%', 'e la chiave non esce mai dalla funzione');

-- ---------------------------------------------------------------------------
-- 7. Who reads the alerts
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select ok((select count(*)::int from public.notifiche where canale = 'app') >= 3, 'l''admin legge i suoi avvisi');
select is((select count(*)::int from public.notifiche where destinatario_id <> '11111111-1111-4111-8111-111111111111'), 0, 'e solo i suoi');
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.notifiche where canale = 'app' and chiave not like 'test92/%'), 0, 'il setter non ne riceve: soldi e chiavi sono dell''admin');
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","client_id":"92000000-0000-4000-8000-000000000092","session_id":"92000000-0000-4000-8000-000000000192"}';
select is((select count(*)::int from public.notifiche), 0, 'un token di Claude dell''admin non legge niente');
select throws_ok($$select count(*) from public.rate_notificate$$, '42501', null, 'e le tabelle di servizio non si leggono');

select * from finish();
rollback;
