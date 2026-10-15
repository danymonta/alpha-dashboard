-- Insight ultime 24h (1.35.0): the functions. The scheduler starts the planned
-- run at «Pronto alle» minus the advance, in Rome time across the DST changes;
-- «Aggiorna dati» is the admin's, one run at a time and 8 a day; each step is
-- taken with a lease longer than the route lives, and a dead invocation's
-- blocks go back to work (or fail at 3 attempts); the cost is computed in SQL;
-- the watchdog fails a stuck run and a failed run leaves no message it read;
-- the cleanup keeps no message older than 30 days, inside the chats and inside
-- the recaps, and never touches the counts per post; the app's agenda and lead
-- state never carry notes, amounts, contacts or the closer; the right to
-- erasure takes a chat out of everything; the Messenger Page token stays in
-- Vault. The internal functions are executable by no session.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(187);

-- helper: rows touched by an update or a delete, under the current role
create or replace function pg_temp.righe(p_sql text)
returns integer
language plpgsql
as $$
declare
  n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- the requests pg_net has queued in this transaction (it sends after commit:
-- the rollback at the end sends nothing)
create or replace function pg_temp.in_coda_net()
returns integer
language sql
as $$
  select count(*)::integer from net.http_request_queue;
$$;

-- No token left from local use
delete from vault.secrets where name = 'messenger_token';

create temp table valori (nome text primary key, testo text, numero integer, id uuid) on commit drop;
grant all on valori to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Who reads the Insight: security invoker, admin and every active setter
-- ---------------------------------------------------------------------------
select is(
  (select p.prosecdef from pg_proc p where p.oid = 'public.insight_puo_leggere()'::regprocedure),
  false,
  'insight_puo_leggere è security invoker'
);
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select ok(public.insight_puo_leggere(), 'l''admin legge l''Insight');
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select ok(public.insight_puo_leggere(), 'il setter anche');
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select ok(not public.insight_puo_leggere(), 'il closer no');
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select ok(not public.insight_puo_leggere(), 'il marketing no');
set local request.jwt.claims to '{}';
select ok(not public.insight_puo_leggere(), 'senza sessione no');

-- ---------------------------------------------------------------------------
-- 2. insight_stato(): every reader the same base, the admin the details
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.insight_stato()) as k),
  array['attivo', 'esecuzione', 'ora'],
  'il setter riceve automazione, orario e l''ultima esecuzione'
);
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.insight_stato()->'esecuzione') as k),
  array['blocchi_fatti', 'blocchi_totali', 'creata_il', 'finita_il', 'passo', 'stato'],
  'dell''esecuzione solo stato e avanzamento: mai errori, avvisi, costo o token'
);
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select ok(
  (select public.insight_stato() ?& array['ultimo_tick_il', 'manuali_oggi'])
  and (select (public.insight_stato()->'esecuzione') ?& array['errore', 'avvisi', 'costo_usd', 'token_input',
                                                             'chat_attribuite', 'motivo']),
  'l''admin riceve anche l''ultimo tick, le manuali di oggi, errori, avvisi, costo e contatori'
);
select ok(
  not (public.insight_stato() ? 'configurato') and not ((public.insight_stato()->'esecuzione') ? 'configurato'),
  'nessuno sa dal database se la chiave di Anthropic c''è'
);
select is(public.insight_stato()->>'ora', '19:00:00', 'l''orario come lo legge la pagina');
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select throws_ok($$ select public.insight_stato() $$, '42501', 'L’Insight lo vedono l’admin e i setter.',
  'il closer non legge lo stato dell''Insight');
set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
select throws_ok($$ select public.insight_stato() $$, '42501', 'L’Insight lo vedono l’admin e i setter.',
  'né il video editor');

-- ---------------------------------------------------------------------------
-- 3. insight_imposta_url(): only the server; insight_imposta_automazione(): the admin's
-- ---------------------------------------------------------------------------
select ok(
  not has_function_privilege('authenticated', 'public.insight_imposta_url(text)', 'execute')
  and not has_function_privilege('anon', 'public.insight_imposta_url(text)', 'execute')
  and has_function_privilege('service_role', 'public.insight_imposta_url(text)', 'execute'),
  'l''indirizzo dei passi lo scrive solo il server: nessuna sessione lo sceglie'
);
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok(
  $$ select public.insight_imposta_url('https://esempio-esterno.net/api/cron/insight') $$,
  '42501', null,
  'nemmeno l''admin, con la sua sessione, punta la chiave dei passi altrove'
);
select throws_ok(
  $$ select public.insight_imposta_automazione(true, '19:00', 'https://esempio-esterno.net/api/cron/insight') $$,
  '42883', null,
  'e l''automazione non prende più un indirizzo'
);
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok(
  $$ select public.insight_imposta_automazione(true, '19:00') $$,
  '42501', 'Solo l’admin imposta l’automazione.',
  'il setter non imposta l''automazione'
);
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok(
  $$ select public.insight_imposta_automazione(true, '19:00') $$,
  '22023', 'Indirizzo dell’app non valido.',
  'accenderla senza l''indirizzo dei passi no'
);
reset role;
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select throws_ok(
  $$ select public.insight_imposta_url('http://esempio.it/api/cron/insight') $$,
  '22023', 'Indirizzo dell’app non valido.',
  'il server non scrive un indirizzo http che non è locale'
);
select throws_ok(
  $$ select public.insight_imposta_url('https://dashboard.percorsoalpha.com/altro/percorso') $$,
  '22023', 'Indirizzo dell’app non valido.',
  'né un percorso che non è quello dei passi'
);
select lives_ok(
  $$ select public.insight_imposta_url('http://host.docker.internal:3200/api/cron/insight') $$,
  'scrive quello dell''app (qui il dev server in locale)'
);
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok(
  $$ select public.insight_imposta_automazione(true, '19:03') $$,
  '22023', null,
  'l''automazione non parte a un minuto che non è un passo di 5'
);
select lives_ok(
  $$ select public.insight_imposta_automazione(true, '19:05') $$,
  'l''admin accende il recap automatico alle 19:05'
);
select is(
  (select row(attivo, ora, url_passo, updated_by)::text from public.insight_impostazioni),
  row(true, time '19:05', 'http://host.docker.internal:3200/api/cron/insight',
      '11111111-1111-4111-8111-111111111111'::uuid)::text,
  'e la riga lo dice, col suo nome e con l''indirizzo scritto dal server'
);
select lives_ok($$ select public.insight_imposta_automazione(false, '20:00') $$, 'e lo spegne');
select is(
  (select row(attivo, ora, url_passo)::text from public.insight_impostazioni),
  row(false, time '20:00', 'http://host.docker.internal:3200/api/cron/insight')::text,
  'spento, l''indirizzo resta'
);
reset role;
set local request.jwt.claims to '{}';

-- ---------------------------------------------------------------------------
-- 4. insight_da_avviare(): the planned run, in Rome time
-- ---------------------------------------------------------------------------
update public.insight_impostazioni
set attivo = true, ora = '19:00', anticipo_minuti = 15, url_passo = 'http://host.docker.internal:3200/api/cron/insight'
where id;
-- the days below have no run, whatever day the test runs (the seed's are relative to today)
delete from public.insight_esecuzioni
where giorno in ('2026-03-28', '2026-03-29', '2026-10-24', '2026-10-25', '2026-11-10', '2026-11-11');

-- November: Rome is UTC+1, «Pronto alle 19:00» starts at 17:45 UTC
select is(public.insight_da_avviare('2026-11-10 17:44:59+00'), null::date, 'prima dell''avvio niente');
select is(public.insight_da_avviare('2026-11-10 17:45:00+00'), date '2026-11-10', 'all''avvio il giorno');
select is(public.insight_da_avviare('2026-11-10 19:44:00+00'), date '2026-11-10', 'fino a un''ora e 59 dopo');
select is(public.insight_da_avviare('2026-11-10 19:45:00+00'), null::date, 'due ore dopo non più');
update public.insight_impostazioni set attivo = false where id;
select is(public.insight_da_avviare('2026-11-10 17:45:00+00'), null::date, 'automazione spenta: niente');
update public.insight_impostazioni set attivo = true, url_passo = null where id;
select is(public.insight_da_avviare('2026-11-10 17:45:00+00'), null::date, 'senza indirizzo dei passi: niente');
update public.insight_impostazioni set url_passo = 'http://host.docker.internal:3200/api/cron/insight' where id;
insert into public.insight_esecuzioni (id, giorno, motivo, stato)
values ('77770000-0000-4000-8000-000000000001', '2026-11-10', 'pianificata', 'pronta');
select is(public.insight_da_avviare('2026-11-10 17:50:00+00'), null::date, 'già pianificata quel giorno: niente');
delete from public.insight_esecuzioni where id = '77770000-0000-4000-8000-000000000001';
insert into public.insight_esecuzioni (id, giorno, motivo, stato)
values ('77770000-0000-4000-8000-000000000002', public.oggi(), 'manuale', 'in_corso');
select is(public.insight_da_avviare('2026-11-10 17:50:00+00'), null::date, 'un''esecuzione in corso: niente');
delete from public.insight_esecuzioni where id = '77770000-0000-4000-8000-000000000002';
-- a recap at 00:10 starts the evening before
update public.insight_impostazioni set ora = '00:10' where id;
select is(public.insight_da_avviare('2026-11-10 22:58:00+00'), date '2026-11-11',
  'pronto alle 00:10: alle 23:58 della sera prima parte quello del giorno dopo');
select is(public.insight_da_avviare('2026-11-10 22:54:00+00'), null::date, 'alle 23:54 non ancora');
update public.insight_impostazioni set ora = '19:00' where id;
-- 25/10/2026, the end of DST: 19:00 Rome is 18:00 UTC; the day before 17:00 UTC
select is(public.insight_da_avviare('2026-10-24 16:45:00+00'), date '2026-10-24', '24/10, ora legale: avvio alle 16:45 UTC');
select is(public.insight_da_avviare('2026-10-25 16:45:00+00'), null::date, '25/10, ora solare: alle 16:45 UTC non ancora');
select is(public.insight_da_avviare('2026-10-25 17:44:00+00'), null::date, 'alle 17:44 UTC nemmeno');
select is(public.insight_da_avviare('2026-10-25 17:45:00+00'), date '2026-10-25', 'alle 17:45 UTC sì');
-- 29/03/2026, the start of DST: 19:00 Rome is 17:00 UTC
select is(public.insight_da_avviare('2026-03-29 16:44:00+00'), null::date, '29/03, ora legale: alle 16:44 UTC non ancora');
select is(public.insight_da_avviare('2026-03-29 16:45:00+00'), date '2026-03-29', 'alle 16:45 UTC sì');
select is(public.insight_da_avviare('2026-03-28 17:45:00+00'), date '2026-03-28', 'il giorno prima, ora solare, alle 17:45 UTC');
update public.insight_impostazioni set attivo = false, url_passo = null where id;

-- ---------------------------------------------------------------------------
-- 5. insight_richiedi(): «Aggiorna dati», the admin's
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok($$ select public.insight_richiedi() $$, '42501', null, 'il setter non aggiorna i dati');
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select throws_ok($$ select public.insight_richiedi() $$, '42501', null, 'né il marketing');
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
reset role;
insert into valori (nome, numero) values ('coda_prima', pg_temp.in_coda_net());
set local role authenticated;
insert into valori (nome, id) values ('manuale_senza_url', public.insight_richiedi());
select is(
  (select row(e.giorno = public.oggi(), e.motivo, e.stato, e.passo, e.richiesta_da, e.inviata_il)::text
   from public.insight_esecuzioni e join valori v on v.id = e.id and v.nome = 'manuale_senza_url'),
  row(true, 'manuale', 'in_coda'::public.insight_stato_esecuzione, 'lettura'::public.insight_passo,
      '11111111-1111-4111-8111-111111111111'::uuid, null::timestamptz)::text,
  'l''admin chiede un aggiornamento: un''esecuzione manuale di oggi, in coda, a suo nome'
);
reset role;
select is(pg_temp.in_coda_net(), (select numero from valori where nome = 'coda_prima'),
  'senza indirizzo dei passi non parte niente: aspetta chi la guida (in locale)');
set local role authenticated;
select throws_ok($$ select public.insight_richiedi() $$, '22023', 'Un aggiornamento è già in corso.',
  'un secondo tocco mentre la prima è in corso no');
reset role;
update public.insight_esecuzioni set stato = 'pronta' where id = (select id from valori where nome = 'manuale_senza_url');
set local role authenticated;
select throws_ok($$ select public.insight_richiedi('http://esempio.it/api/cron/insight') $$, '42883', null,
  'chiedere un aggiornamento non prende un indirizzo: la sessione non lo sceglie');
reset role;
-- the server writes the address, the session asks for the run
update public.insight_impostazioni set url_passo = null where id;
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select lives_ok($$ select public.insight_imposta_url('http://host.docker.internal:3200/api/cron/insight') $$,
  'il server scrive l''indirizzo dei passi');
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
insert into valori (nome, id) values ('manuale_con_url', public.insight_richiedi());
reset role;
select is((select url_passo from public.insight_impostazioni), 'http://host.docker.internal:3200/api/cron/insight',
  'l''indirizzo dei passi è quello scritto dal server');
select is(pg_temp.in_coda_net(), (select numero from valori where nome = 'coda_prima') + 1,
  'e pg_net ha in coda il primo passo');
select ok(
  (select q.url = 'http://host.docker.internal:3200/api/cron/insight'
          and (convert_from(q.body, 'utf8')::jsonb->>'esecuzione')::uuid = (select id from valori where nome = 'manuale_con_url')
          and q.headers->>'Authorization' = 'Bearer ' || public.insight_chiave()
   from net.http_request_queue q order by q.id desc limit 1),
  'col solo id dell''esecuzione e la chiave del Vault'
);
select isnt((select inviata_il from public.insight_esecuzioni where id = (select id from valori where nome = 'manuale_con_url')),
  null, 'e l''esecuzione sa quando è partita');
update public.insight_esecuzioni set stato = 'pronta' where id = (select id from valori where nome = 'manuale_con_url');
insert into public.insight_esecuzioni (giorno, motivo, stato)
select public.oggi(), 'manuale', 'pronta'
from generate_series(1, 8 - (select count(*)::integer from public.insight_esecuzioni
                             where motivo = 'manuale' and giorno = public.oggi()));
set local role authenticated;
select throws_ok($$ select public.insight_richiedi() $$, '22023', 'Hai già aggiornato 8 volte oggi: riprova domani.',
  'la nona manuale di oggi no');
reset role;
set local request.jwt.claims to '{}';

-- ---------------------------------------------------------------------------
-- 6. insight_prendi_passo(): the lease
-- ---------------------------------------------------------------------------
insert into public.insight_esecuzioni (id, giorno, motivo, stato)
values ('77770000-0000-4000-8000-000000000010', public.oggi(), 'pianificata', 'in_coda');
insert into public.insight_blocchi (id, esecuzione_id, canale, tipo, indice, stato, tentativi) values
  ('77771111-0000-4000-8000-000000000001', '77770000-0000-4000-8000-000000000010', 'instagram', 'schede', 0, 'in_corso', 0),
  ('77771111-0000-4000-8000-000000000002', '77770000-0000-4000-8000-000000000010', 'instagram', 'schede', 1, 'in_corso', 2),
  ('77771111-0000-4000-8000-000000000003', '77770000-0000-4000-8000-000000000010', 'instagram', 'schede', 2, 'da_fare', 0),
  ('77771111-0000-4000-8000-000000000004', '77770000-0000-4000-8000-000000000010', 'messenger', 'sintesi', 0, 'fatto', 1);

set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select is(
  (select row(passo, giorno = public.oggi(), motivo)::text
   from public.insight_prendi_passo('77770000-0000-4000-8000-000000000010')),
  row('lettura'::public.insight_passo, true, 'pianificata')::text,
  'il primo passo si prende: lettura, col giorno e il motivo'
);
select is((select count(*)::integer from public.insight_prendi_passo('77770000-0000-4000-8000-000000000010')), 0,
  'un secondo tentativo mentre il primo lavora non prende niente');
reset role;
select ok(
  (select lease_fino_al - now() >= interval '330 seconds' and stato = 'in_corso' and invocazioni = 1
          and iniziata_il = now()
   from public.insight_esecuzioni where id = '77770000-0000-4000-8000-000000000010'),
  'il lease dura almeno 330 secondi, più dei 300 della route'
);
select is(
  (select array_agg(row(stato, tentativi, errore)::text order by indice) from public.insight_blocchi
   where esecuzione_id = '77770000-0000-4000-8000-000000000010' and canale = 'instagram'),
  array[row('da_fare', 1, null::text)::text, row('fallito', 3, 'interrotto')::text, row('da_fare', 0, null::text)::text],
  'i blocchi lasciati a metà da un''invocazione morta tornano da fare, al terzo tentativo falliscono'
);
-- the new invocation works a block, then dies: the lease expires
update public.insight_blocchi set stato = 'in_corso' where id = '77771111-0000-4000-8000-000000000001';
update public.insight_esecuzioni set lease_fino_al = now() - interval '1 second'
where id = '77770000-0000-4000-8000-000000000010';
set local role service_role;
select is((select count(*)::integer from public.insight_prendi_passo('77770000-0000-4000-8000-000000000010', 60)), 1,
  'scaduto il lease, il passo si riprende');
reset role;
select is(
  (select array_agg(row(stato, tentativi, errore)::text order by indice) from public.insight_blocchi
   where esecuzione_id = '77770000-0000-4000-8000-000000000010' and canale = 'instagram'),
  array[row('da_fare', 2, null::text)::text, row('fallito', 3, 'interrotto')::text, row('da_fare', 0, null::text)::text],
  'e il blocco rimasto a metà torna da fare, col tentativo contato'
);
select is(
  (select stato from public.insight_blocchi where id = '77771111-0000-4000-8000-000000000004'),
  'fatto',
  'quelli fatti restano fatti'
);
update public.insight_esecuzioni set invocazioni = 40, lease_fino_al = null
where id = '77770000-0000-4000-8000-000000000010';
set local role service_role;
select is((select count(*)::integer from public.insight_prendi_passo('77770000-0000-4000-8000-000000000010')), 0,
  'dopo 40 invocazioni niente più passi, senza errori');
select throws_ok($$ select * from public.insight_prendi_passo('77770000-0000-4000-8000-000000000010', 0) $$,
  '22023', null, 'una durata del passo assurda no');
reset role;
update public.insight_esecuzioni set invocazioni = 2 where id = '77770000-0000-4000-8000-000000000010';

-- ---------------------------------------------------------------------------
-- 7. insight_passo_finito(): counters, cost, storico_dal, the next step
-- ---------------------------------------------------------------------------
update public.insight_impostazioni set url_passo = null, storico_dal = null where id;
insert into valori (nome, numero) values ('coda_passo', pg_temp.in_coda_net());
set local role service_role;
select is(
  public.insight_passo_finito('77770000-0000-4000-8000-000000000010', 'analisi', '{"instagram":{"lette":12}}',
    array['Avviso uno', 'Avviso uno', '', null],
    '{"token_input":1000,"token_output":200,"chat_instagram":9,"storico_dal":"2026-09-20","modello":"claude-sonnet-5-5","non_ammesso":5}'),
  true,
  'la fine della lettura'
);
reset role;
select is(
  (select row(stato, passo, lease_fino_al, tentativi, avvisi, token_input, token_output, chat_instagram, modello)::text
   from public.insight_esecuzioni where id = '77770000-0000-4000-8000-000000000010'),
  row('in_corso'::public.insight_stato_esecuzione, 'analisi'::public.insight_passo, null::timestamptz, 0,
      array['Avviso uno'], 1000::bigint, 200::bigint, 9, 'claude-sonnet-5-5')::text,
  'passa all''analisi: lease libero, avvisi senza doppioni, contatori scritti'
);
select is((select storico_dal from public.insight_impostazioni), date '2026-09-20', 'il primo giorno delle chat si scrive');
select is(pg_temp.in_coda_net(), (select numero from valori where nome = 'coda_passo'),
  'senza indirizzo dei passi il passo dopo non parte');
set local role service_role;
select ok(
  public.insight_passo_finito('77770000-0000-4000-8000-000000000010', 'analisi', '{"messenger":{"lette":3}}',
    array['Avviso due', 'Avviso uno'],
    '{"token_input":2000,"token_cache_letti":500000,"storico_dal":"2026-10-01","servito_da_fallback":1}'),
  'un passo fuori tempo resta all''analisi'
);
reset role;
select is(
  (select row(token_input, token_output, token_cache_letti, token_cache_scritti, avvisi, servito_da_fallback,
              progresso ? 'instagram' and progresso ? 'messenger')::text
   from public.insight_esecuzioni where id = '77770000-0000-4000-8000-000000000010'),
  row(3000::bigint, 200::bigint, 500000::bigint, null::bigint, array['Avviso uno', 'Avviso due'], 1, true)::text,
  'i token si sommano, gli avvisi si accodano, il progresso si unisce'
);
select is(
  (select costo_usd from public.insight_esecuzioni where id = '77770000-0000-4000-8000-000000000010'),
  public.insight_costo_usd(3000, null, 500000, 200),
  'il costo è quello del SQL sui totali'
);
select is((select storico_dal from public.insight_impostazioni), date '2026-09-20',
  'il primo giorno delle chat non si sposta più');
update public.insight_impostazioni set url_passo = 'http://host.docker.internal:3200/api/cron/insight' where id;
set local role service_role;
select ok(
  public.insight_passo_finito('77770000-0000-4000-8000-000000000010', 'unione', null, null, null),
  'la fine dell''analisi'
);
reset role;
select is(pg_temp.in_coda_net(), (select numero from valori where nome = 'coda_passo') + 1,
  'con l''indirizzo dei passi parte l''unione');
set local role service_role;
select ok(
  public.insight_passo_finito('77770000-0000-4000-8000-000000000010', null, null, null, '{}'),
  'la fine dell''unione'
);
reset role;
select is(
  (select row(stato, finita_il = now(), lease_fino_al)::text from public.insight_esecuzioni
   where id = '77770000-0000-4000-8000-000000000010'),
  row('pronta'::public.insight_stato_esecuzione, true, null::timestamptz)::text,
  'senza passo dopo, l''esecuzione è pronta'
);
select is(pg_temp.in_coda_net(), (select numero from valori where nome = 'coda_passo') + 1,
  'e non parte niente');
set local role service_role;
select is(
  public.insight_passo_finito('77770000-0000-4000-8000-000000000010', 'analisi', null, null, null),
  false,
  'un''esecuzione finita non riparte'
);
reset role;

-- ---------------------------------------------------------------------------
-- 8. insight_costo_usd(): Claude Sonnet 5.5 prices
-- ---------------------------------------------------------------------------
select is(public.insight_costo_usd(1000000, 1000000, 1000000, 1000000), 14.7000::numeric,
  'un milione di ogni contatore: 2 + 2,50 + 0,20 + 10 dollari');
select is(public.insight_costo_usd(null, null, null, null), 0.0000::numeric, 'i contatori vuoti valgono zero');
select is(public.insight_costo_usd(180000, 21000, 600000, 52000), 1.0525::numeric, 'una giornata tipo, al decimillesimo');

-- ---------------------------------------------------------------------------
-- 9. The chats a run wrote, for the watchdog and insight_fallita
-- ---------------------------------------------------------------------------
insert into public.insight_esecuzioni (id, giorno, motivo, stato, passo, tentativi, lease_fino_al, inviata_il, creata_il)
values ('77770000-0000-4000-8000-000000000020', public.oggi(), 'manuale', 'in_corso', 'analisi', 3,
        now() - interval '1 second', now() - interval '6 minutes', now() - interval '10 minutes');
insert into public.insight_chat (id, canale, conversazione_id, username, aggiornata_il, messaggi, messaggi_letti, completa,
  codici_condivisi, letta_da, origine_tipo, origine_shortcode, origine_il, origine_giorno) values
  ('77772222-0000-4000-8000-000000000001', 'instagram', 'c77-a', 'lettore.uno', now() - interval '1 hour',
   '[{"da":"lead","il":"2026-10-15T08:00:00Z","testo":"Ciao","codici":["SeedDemo01"],"storia":false}]', 1, true,
   array['SeedDemo01'], '77770000-0000-4000-8000-000000000020',
   'condivisione', 'SeedDemo01', now() - interval '1 hour', public.oggi()),
  ('77772222-0000-4000-8000-000000000002', 'instagram', 'c77-b', 'lettore.due', now() - interval '1 hour',
   '[{"da":"lead","il":"2026-10-15T08:00:00Z","testo":"Salve","codici":[],"storia":false}]', 1, true,
   '{}', '77770000-0000-4000-8000-000000000010', null, null, null, null);

-- ---------------------------------------------------------------------------
-- 10. The watchdog (insight_tick)
-- ---------------------------------------------------------------------------
update public.insight_impostazioni
set attivo = false, url_passo = 'http://host.docker.internal:3200/api/cron/insight', ultimo_tick_il = null
where id;
select lives_ok($$ select public.insight_tick() $$, 'il tick gira');
select is((select ultimo_tick_il from public.insight_impostazioni), now(), 'e lascia l''ora dell''ultimo tick');
select is(
  (select row(stato, errore, lease_fino_al)::text from public.insight_esecuzioni
   where id = '77770000-0000-4000-8000-000000000020'),
  row('fallita'::public.insight_stato_esecuzione,
      'Aggiornamento interrotto: il server non ha completato i passi. Riprova con Aggiorna dati.',
      null::timestamptz)::text,
  'un''esecuzione bloccata al terzo tentativo fallisce, con la sua frase'
);
select is(
  (select row(messaggi, codici_condivisi, aggiornata_il, origine_tipo, origine_shortcode)::text
   from public.insight_chat where id = '77772222-0000-4000-8000-000000000001'),
  row('[]'::jsonb, '{}'::text[], null::timestamptz, 'condivisione', 'SeedDemo01')::text,
  'e le chat che aveva letto perdono i messaggi: si rileggono da Meta, l''origine resta'
);
select is(
  (select jsonb_array_length(messaggi) from public.insight_chat where id = '77772222-0000-4000-8000-000000000002'),
  1,
  'le chat lette da un''altra esecuzione restano'
);
insert into public.insight_esecuzioni (id, giorno, motivo, stato, inviata_il, creata_il)
values ('77770000-0000-4000-8000-000000000021', public.oggi(), 'manuale', 'in_coda',
        now() - interval '1 minute', now() - interval '1 minute');
insert into valori (nome, numero) values ('coda_tick', pg_temp.in_coda_net());
select public.insight_tick();
select is(
  (select tentativi from public.insight_esecuzioni where id = '77770000-0000-4000-8000-000000000021'),
  0,
  'un passo partito da meno di 2 minuti non si rimanda'
);
select is(pg_temp.in_coda_net(), (select numero from valori where nome = 'coda_tick'), 'e non parte niente');
update public.insight_esecuzioni set inviata_il = now() - interval '3 minutes'
where id = '77770000-0000-4000-8000-000000000021';
select public.insight_tick();
select is(
  (select row(stato, tentativi, inviata_il = now())::text from public.insight_esecuzioni
   where id = '77770000-0000-4000-8000-000000000021'),
  row('in_coda'::public.insight_stato_esecuzione, 1, true)::text,
  'un passo che nessuno ha preso in 2 minuti si rimanda, contando il tentativo'
);
select is(pg_temp.in_coda_net(), (select numero from valori where nome = 'coda_tick') + 1, 'pg_net lo rimanda');
update public.insight_esecuzioni set creata_il = now() - interval '46 minutes', inviata_il = now() - interval '3 minutes'
where id = '77770000-0000-4000-8000-000000000021';
select public.insight_tick();
select is(
  (select stato from public.insight_esecuzioni where id = '77770000-0000-4000-8000-000000000021'),
  'fallita'::public.insight_stato_esecuzione,
  'dopo 45 minuti un''esecuzione non finita fallisce'
);
-- the planned run of the day
update public.insight_impostazioni set attivo = true, ora = '19:00' where id;
select public.insight_tick();
select is(
  (select count(*)::integer from public.insight_esecuzioni where motivo = 'pianificata' and stato = 'in_coda'),
  case when now() >= ((public.oggi() + time '19:00') at time zone 'Europe/Rome') - interval '15 minutes'
            and now() < ((public.oggi() + time '19:00') at time zone 'Europe/Rome') + interval '1 hour 45 minutes'
            and not exists (select 1 from public.insight_esecuzioni where motivo = 'pianificata' and giorno = public.oggi()
                            and stato <> 'in_coda')
       then 1 else 0 end,
  'il tick avvia l''esecuzione pianificata solo nella sua finestra'
);
update public.insight_impostazioni set attivo = false where id;
delete from public.insight_esecuzioni where motivo = 'pianificata' and stato = 'in_coda';

-- ---------------------------------------------------------------------------
-- 11. insight_fallita(): a fixed sentence, no message left
-- ---------------------------------------------------------------------------
insert into public.insight_esecuzioni (id, giorno, motivo, stato, passo)
values ('77770000-0000-4000-8000-000000000030', public.oggi(), 'manuale', 'in_corso', 'analisi');
update public.insight_chat set letta_da = '77770000-0000-4000-8000-000000000030',
  messaggi = '[{"da":"lead","il":"2026-10-15T08:00:00Z","testo":"Ciao","codici":[],"storia":false}]',
  aggiornata_il = now()
where id = '77772222-0000-4000-8000-000000000001';
set local role service_role;
select is(
  public.insight_fallita('77770000-0000-4000-8000-000000000030',
    'Lettura di Instagram non riuscita IGAAtokenDiProvaLunghissimo1234567890abcdefghijk'),
  true,
  'l''esecuzione fallisce'
);
reset role;
select is(
  (select row(stato, errore, finita_il = now())::text from public.insight_esecuzioni
   where id = '77770000-0000-4000-8000-000000000030'),
  row('fallita'::public.insight_stato_esecuzione, 'Lettura di Instagram non riuscita [token]', true)::text,
  'con la frase, mai una stringa che sembra un token'
);
select is(
  (select row(messaggi, aggiornata_il)::text from public.insight_chat where id = '77772222-0000-4000-8000-000000000001'),
  row('[]'::jsonb, null::timestamptz)::text,
  'e nessun messaggio letto da lei resta'
);
select is(
  (select jsonb_array_length(messaggi) from public.insight_chat where id = '77772222-0000-4000-8000-000000000002'),
  1,
  'quelli di un''altra esecuzione sì'
);
set local role service_role;
select is(public.insight_fallita('77770000-0000-4000-8000-000000000030', 'x'), false, 'una fallita non fallisce due volte');
reset role;

-- the tokens a failing step had spent are added to the run, the cost recomputed
insert into public.insight_esecuzioni (id, giorno, motivo, stato, passo, token_input, token_output)
values ('77770000-0000-4000-8000-000000000031', public.oggi(), 'manuale', 'in_corso', 'analisi', 500, 100);
set local role service_role;
select is(
  public.insight_fallita('77770000-0000-4000-8000-000000000031', 'Claude ha rifiutato la richiesta',
    '{"token_input": 1000, "token_cache_letti": 4000, "token_output": 200, "servito_da_fallback": 1}'::jsonb),
  true,
  'una fallita porta i token già spesi'
);
reset role;
select is(
  (select row(token_input, token_cache_letti, token_output, servito_da_fallback, costo_usd is not null,
              costo_usd = public.insight_costo_usd(1500, null, 4000, 300))::text
   from public.insight_esecuzioni where id = '77770000-0000-4000-8000-000000000031'),
  row(1500, 4000, 300, 1, true, true)::text,
  'sommati a quelli che aveva, col costo ricalcolato nel database'
);
set local role service_role;
select throws_ok(
  $$ select public.insight_fallita('77770000-0000-4000-8000-000000000031', 'x', '[1]'::jsonb) $$,
  '22023', 'Contatori non validi',
  'i contatori sono un oggetto'
);
reset role;

-- ---------------------------------------------------------------------------
-- 12. insight_pulizia(): nothing older than 30 days
-- ---------------------------------------------------------------------------
insert into public.insight_chat (id, canale, conversazione_id, username, ultimo_il, letta_il, messaggi, messaggi_letti, completa) values
  ('77773333-0000-4000-8000-000000000001', 'instagram', 'c77-vecchia', 'vecchia.chat', now() - interval '31 days',
   now() - interval '31 days', '[]', 0, true),
  ('77773333-0000-4000-8000-000000000002', 'instagram', 'c77-recente', 'recente.chat', now() - interval '29 days',
   now() - interval '29 days',
   jsonb_build_array(
     jsonb_build_object('da', 'lead', 'il', now() - interval '31 days', 'testo', 'vecchio'),
     jsonb_build_object('da', 'alpha', 'il', now() - interval '29 days', 'testo', 'recente'),
     jsonb_build_object('da', 'lead', 'testo', 'senza istante')),
   3, true);
insert into public.insight_profili (username, letto_il) values
  ('profilo.vecchio', now() - interval '31 days'), ('profilo.recente', now() - interval '2 days');
insert into public.insight_esecuzioni (id, giorno, motivo, stato, creata_il)
values ('77770000-0000-4000-8000-000000000040', public.oggi() - 31, 'pianificata', 'pronta', now() - interval '31 days');
insert into public.insight_blocchi (esecuzione_id, canale, tipo, indice)
values ('77770000-0000-4000-8000-000000000040', 'instagram', 'sintesi', 0);
insert into public.insight_schede (esecuzione_id, giorno, canale, tipo, chiave, impronta, dati)
values ('77770000-0000-4000-8000-000000000040', public.oggi() - 31, 'instagram', 'lead', 'c77-vecchia', repeat('b', 64), '{}');
insert into public.insight_recap (giorno, canale, generato_il, stato, dati) values
  (public.oggi() - 31, 'instagram', now() - interval '31 days', 'completo', '{"leads":[]}'),
  (public.oggi() - 5, 'instagram', now() - interval '5 days', 'completo',
   jsonb_build_object(
     'leads', jsonb_build_array(jsonb_build_object('username', 'cinque.giorni', 'messages', jsonb_build_array(
       jsonb_build_object('from', 'lead', 'text', 'trentuno giorni fa', 'at', to_char((now() - interval '31 days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
       jsonb_build_object('from', 'alpha', 'text', 'ieri', 'at', to_char((now() - interval '1 day') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
       jsonb_build_object('from', 'lead', 'text', 'senza istante')))),
     'reactivate', jsonb_build_array(jsonb_build_object('username', 'quaranta.giorni', 'days_silent', 40, 'messages', jsonb_build_array(
       jsonb_build_object('from', 'alpha', 'text', 'quaranta giorni fa', 'at', to_char((now() - interval '40 days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'))))),
     'headline', 'resta'));
insert into public.insight_fatto (giorno, canale, chiave, fatto) values (public.oggi() - 31, 'instagram', 'vecchio.fatto', true);
insert into public.instagram_contenuti_dm (shortcode, giorno, dm, lead_in_target, call_prenotate, dm_certi)
values ('SeedDemo01', public.oggi() - 60, 2, 1, 0, 1);
-- an under-14 chat outlives the 30 days with its sign only; a recap lives through its 29th day after
insert into public.insight_chat (id, canale, conversazione_id, username, nome, ultimo_il, letta_il, messaggi, messaggi_letti, completa,
  minore_14, ultimo_target, origine_tipo, origine_shortcode, origine_il, origine_giorno) values
  ('77773333-0000-4000-8000-000000000003', 'instagram', 'c77-minore', 'minore.uno', 'Nome Minore', now() - interval '40 days',
   now() - interval '40 days', '[]', 0, true, true, 'no', 'condivisione', 'SeedDemo01', now() - interval '41 days', public.oggi() - 41);
insert into public.insight_recap (giorno, canale, generato_il, stato, dati) values
  (public.oggi() - 30, 'messenger', now() - interval '30 days', 'completo', '{"leads":[]}'),
  (public.oggi() - 29, 'messenger', now() - interval '29 days', 'completo', '{"leads":[]}');
insert into valori (nome, numero) values
  ('recap_seed', (select count(*)::integer from public.insight_recap where giorno >= public.oggi() - 1));

select lives_ok($$ select public.insight_pulizia() $$, 'la pulizia della notte gira');
select is(
  (select row(c.minore_14, c.nome, c.ultimo_target, c.origine_tipo, c.origine_shortcode, c.origine_giorno, c.messaggi)::text
   from public.insight_chat c where c.id = '77773333-0000-4000-8000-000000000003'),
  row(true, null, null, null, null, null, '[]'::jsonb)::text,
  'una chat di un minore resta oltre i 30 giorni, col solo segno: il nome e l''origine se ne vanno'
);
select is(
  (select array_agg(r.giorno order by r.giorno) from public.insight_recap r
   where r.canale = 'messenger' and r.giorno in (public.oggi() - 30, public.oggi() - 29)),
  array[public.oggi() - 29],
  'un recap sparisce nella pulizia del suo trentesimo giorno dopo, non una notte più tardi'
);
select is((select count(*)::integer from public.insight_chat where id = '77773333-0000-4000-8000-000000000001'), 0,
  'una chat ferma da 31 giorni se ne va');
select is(
  (select array_agg(m->>'testo' order by n) from public.insight_chat c,
     jsonb_array_elements(c.messaggi) with ordinality as x(m, n)
   where c.id = '77773333-0000-4000-8000-000000000002'),
  array['recente'],
  'una chat di 29 giorni resta, senza il messaggio di 31 giorni fa né quello senza istante'
);
select is(
  (select array_agg(m->>'text' order by n) from public.insight_recap r,
     jsonb_array_elements(r.dati->'leads'->0->'messages') with ordinality as x(m, n)
   where r.giorno = public.oggi() - 5 and r.canale = 'instagram'),
  array['ieri'],
  'dentro un recap di 5 giorni fa i messaggi di 31 giorni fa, e quelli senza istante, se ne vanno'
);
select is(
  (select jsonb_array_length(r.dati->'reactivate'->0->'messages') from public.insight_recap r
   where r.giorno = public.oggi() - 5 and r.canale = 'instagram'),
  0,
  'anche nelle chat da riattivare'
);
select is(
  (select row(r.dati->>'headline', r.dati->'leads'->0->>'username', r.dati->'reactivate'->0->>'days_silent')::text
   from public.insight_recap r where r.giorno = public.oggi() - 5 and r.canale = 'instagram'),
  row('resta', 'cinque.giorni', '40')::text,
  'il resto del recap resta com''è'
);
select is((select count(*)::integer from public.insight_recap where giorno = public.oggi() - 31), 0,
  'un recap di 31 giorni fa se ne va');
select is((select count(*)::integer from public.insight_fatto where giorno = public.oggi() - 31), 0,
  'coi suoi Fatto');
select is((select count(*)::integer from public.insight_recap where giorno >= public.oggi() - 1),
  (select numero from valori where nome = 'recap_seed'), 'quelli di oggi e di ieri restano');
select is((select count(*)::integer from public.insight_esecuzioni where id = '77770000-0000-4000-8000-000000000040'), 0,
  'un''esecuzione di 31 giorni fa se ne va');
select is(
  (select count(*)::integer from public.insight_blocchi where esecuzione_id = '77770000-0000-4000-8000-000000000040')
  + (select count(*)::integer from public.insight_schede where esecuzione_id = '77770000-0000-4000-8000-000000000040'),
  0,
  'coi suoi blocchi e le sue schede'
);
select is(
  (select array_agg(username order by username) from public.insight_profili
   where username in ('profilo.vecchio', 'profilo.recente')),
  array['profilo.recente'],
  'i profili letti più di 30 giorni fa se ne vanno'
);
select is(
  (select count(*)::integer from public.instagram_contenuti_dm where shortcode = 'SeedDemo01' and giorno = public.oggi() - 60),
  1,
  'i conteggi per post di 60 giorni fa restano'
);

-- ---------------------------------------------------------------------------
-- 13. insight_agenda(): yesterday, today and tomorrow in Rome
-- ---------------------------------------------------------------------------
insert into public.leads (id, nome, instagram_handle, setter_id, fonte, stato) values
  ('77774444-0000-4000-8000-000000000001', 'Agenda Uno', '@Agenda.Uno', '22222222-2222-4222-8222-222222222222', 'dm_inbound', 'call_fissata'),
  ('77774444-0000-4000-8000-000000000002', 'Agenda Due', 'non è un handle', '22222222-2222-4222-8222-222222222222', 'dm_outbound', 'call_fissata');
insert into public.calls (id, lead_id, setter_id, closer_id, tipo, programmata_il, stato, note, note_closer) values
  -- 00:10 in Rome on 11/11, still 10/11 in UTC: today
  ('77775555-0000-4000-8000-000000000001', '77774444-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'discovery', '2026-11-10 23:10:00+00', 'programmata', 'nota del setter', 'nota del closer'),
  -- 23:50 in Rome on 10/11: yesterday
  ('77775555-0000-4000-8000-000000000002', '77774444-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'discovery', '2026-11-10 22:50:00+00', 'programmata', null, null),
  -- 23:30 in Rome on 12/11: tomorrow
  ('77775555-0000-4000-8000-000000000003', '77774444-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'discovery', '2026-11-12 22:30:00+00', 'programmata', null, null),
  -- 00:10 in Rome on 13/11: out
  ('77775555-0000-4000-8000-000000000004', '77774444-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'discovery', '2026-11-12 23:10:00+00', 'programmata', null, null),
  -- 23:50 in Rome on 09/11: out
  ('77775555-0000-4000-8000-000000000005', '77774444-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'discovery', '2026-11-09 22:50:00+00', 'programmata', null, null),
  -- today, cancelled: out
  ('77775555-0000-4000-8000-000000000006', '77774444-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'discovery', '2026-11-11 15:00:00+00', 'cancellata', null, null),
  -- a no-show a month before
  ('77775555-0000-4000-8000-000000000007', '77774444-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'discovery', '2026-10-01 17:00:00+00', 'no_show', null, null);

set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select is(
  (select array_agg(row(call_id, giorno)::text order by programmata_il)
   from public.insight_agenda('2026-11-10 23:30:00+00')
   where lead_id in ('77774444-0000-4000-8000-000000000001', '77774444-0000-4000-8000-000000000002')),
  array[row('77775555-0000-4000-8000-000000000002'::uuid, 'ieri')::text,
        row('77775555-0000-4000-8000-000000000001'::uuid, 'oggi')::text,
        row('77775555-0000-4000-8000-000000000003'::uuid, 'domani')::text],
  'ieri, oggi e domani a Roma, anche a cavallo della mezzanotte UTC; le cancellate no'
);
select is(
  (select row(nome, username, fonte, stato, no_show_precedenti)::text
   from public.insight_agenda('2026-11-10 23:30:00+00') where call_id = '77775555-0000-4000-8000-000000000001'),
  row('Agenda Uno', 'agenda.uno', 'dm_inbound'::public.lead_source, 'programmata'::public.call_status, 1)::text,
  'col nome, l''handle senza chiocciola e in minuscolo, la fonte e i no show di prima'
);
select is(
  (select username from public.insight_agenda('2026-11-10 23:30:00+00') where call_id = '77775555-0000-4000-8000-000000000002'),
  null,
  'un handle che non è un handle resta vuoto'
);
reset role;
select ok(
  (select pg_get_function_result('public.insight_agenda(timestamptz)'::regprocedure)
          !~* '(note|importo|closer|email|telefono|pitch)'),
  'l''agenda non ha note, importi, contatti né il closer'
);

-- ---------------------------------------------------------------------------
-- 14. insight_stato_lead(): the app's state, never notes or amounts
-- ---------------------------------------------------------------------------
insert into public.leads (id, nome, instagram_handle, setter_id, fonte, stato) values
  ('77776666-0000-4000-8000-000000000001', 'Stato Uno', '@Stato.Uno', '22222222-2222-4222-8222-222222222222', 'dm_inbound', 'call_fissata'),
  ('77776666-0000-4000-8000-000000000002', 'Solo Follow', 'solo.follow', '22222222-2222-4222-8222-222222222222', 'dm_inbound', 'follow_up'),
  ('77776666-0000-4000-8000-000000000003', 'Nome Doppio', null, '22222222-2222-4222-8222-222222222222', 'altro', 'call_fissata'),
  ('77776666-0000-4000-8000-000000000004', 'nome doppio', null, '22222222-2222-4222-8222-222222222222', 'altro', 'perso'),
  ('77776666-0000-4000-8000-000000000005', 'Nome Unico Settantasette', null, '22222222-2222-4222-8222-222222222222', 'altro', 'follow_up');
insert into public.calls (id, lead_id, setter_id, closer_id, tipo, programmata_il, stato, di_follow_up) values
  ('77777777-0000-4000-8000-000000000001', '77776666-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'discovery', now() + interval '2 days', 'programmata', false),
  ('77777777-0000-4000-8000-000000000002', '77776666-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'discovery', now() + interval '3 days', 'programmata', true),
  ('77777777-0000-4000-8000-000000000003', '77776666-0000-4000-8000-000000000005', '22222222-2222-4222-8222-222222222222',
   '11111111-1111-4111-8111-111111111111', 'discovery', now() - interval '3 days', 'no_show', false);
insert into public.clients (id, nome, cognome, instagram_handle, fonte) values
  ('77778888-0000-4000-8000-000000000001', 'Stato', 'Uno', 'stato.uno', 'dm_inbound');
insert into public.sales (client_id, prodotto_personalizzato, tipo, closer_id, data_vendita, data_inizio, data_fine,
  valore_contratto, numero_rate)
values ('77778888-0000-4000-8000-000000000001', 'Corso di prova', 'upsell', '11111111-1111-4111-8111-111111111111',
        public.oggi() - 10, public.oggi() - 10, public.oggi() + 20, 100, 1);

set local role service_role;
select is(
  (select row(per, stato_lead, fonte, prossima_call_il = now() + interval '2 days', prossima_call_stato, cliente, ha_call)::text
   from public.insight_stato_lead(array['@Stato.Uno']) where chiave = 'stato.uno'),
  row('username', 'call_fissata'::public.lead_status, 'dm_inbound'::public.lead_source, true,
      'programmata'::public.call_status, false, true)::text,
  'per handle: stato del lead, fonte, prossima call; un upsell non fa un cliente'
);
reset role;
insert into public.sales (client_id, prodotto_personalizzato, tipo, closer_id, data_vendita, data_inizio, data_fine,
  valore_contratto, numero_rate)
values ('77778888-0000-4000-8000-000000000001', 'Percorso di prova', 'nuovo', '11111111-1111-4111-8111-111111111111',
        public.oggi() - 5, public.oggi() + 2, public.oggi() + 92, 1500, 3);
set local role service_role;
select is(
  (select cliente from public.insight_stato_lead(array['stato.uno']) where chiave = 'stato.uno'),
  true,
  'una vendita nuovo sì'
);
select is(
  (select ha_call from public.insight_stato_lead(array['solo.follow']) where chiave = 'solo.follow'),
  false,
  'una sola call di follow-up non vale come call fissata dal setter'
);
select is(
  (select count(*)::integer from public.insight_stato_lead('{}', array['Nome Doppio'])),
  0,
  'un nome che hanno due lead non dà niente'
);
select is(
  (select array_agg(row(chiave, per, no_show_precedenti)::text order by per)
   from public.insight_stato_lead(array['stato.uno'], array['  Nome Unico Settantasette '])),
  array[row('nome unico settantasette', 'nome', 1)::text, row('stato.uno', 'username', 0)::text],
  'un handle e un nome nella stessa chiamata, ognuno con la sua riga'
);
select is(
  (select count(*)::integer from public.insight_stato_lead(array['nessuno.cosi', 'Non Valido!'])),
  0,
  'chi non è né un lead né un cliente non c''è, e un handle non valido nemmeno'
);
reset role;
select ok(
  (select pg_get_function_result('public.insight_stato_lead(text[], text[])'::regprocedure)
          !~* '(note|importo|valore|email|telefono|closer)'),
  'lo stato dei lead non ha note, importi, contatti né il closer'
);

-- ---------------------------------------------------------------------------
-- 15. insight_chat_messenger(): the admin's picker
-- ---------------------------------------------------------------------------
insert into public.insight_chat (canale, conversazione_id, utente_id, nome, ultimo_il, messaggi, messaggi_letti, completa) values
  ('messenger', 'm77-1', '7700000000000001', 'Anna Messenger', now() - interval '1 hour', '[]', 0, true),
  ('messenger', 'm77-2', '7700000000000002', 'Bruno Messenger', now() - interval '2 hours', '[]', 0, true),
  ('messenger', 'm77-3', '7700000000000003', 'Escluso Messenger', now() - interval '30 minutes', '[]', 0, true),
  ('messenger', 'm77-4', '7700000000000004', null, now() - interval '10 minutes', '[]', 0, true);
insert into public.messenger_esclusi (utente_id, nome) values ('7700000000000003', 'Escluso Messenger');
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(
  (select array_agg(row(utente_id, nome)::text) from public.insight_chat_messenger()
   where utente_id like '77000000000000%'),
  array[row('7700000000000001', 'Anna Messenger')::text, row('7700000000000002', 'Bruno Messenger')::text],
  'l''admin vede le ultime chat di Messenger col nome, dalla più recente, senza le escluse'
);
select is(
  pg_get_function_result('public.insight_chat_messenger()'::regprocedure),
  'TABLE(utente_id text, nome text)',
  'solo il PSID e il nome'
);
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok($$ select * from public.insight_chat_messenger() $$, '42501', null, 'il setter no');
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select throws_ok($$ select * from public.insight_chat_messenger() $$, '42501', null, 'il closer no');
reset role;
set local request.jwt.claims to '{}';

-- ---------------------------------------------------------------------------
-- 16. insight_dimentica(): the right to erasure
-- ---------------------------------------------------------------------------
insert into public.insight_esecuzioni (id, giorno, motivo, stato, contesto_app) values
  ('77770000-0000-4000-8000-000000000050', public.oggi() - 2, 'manuale', 'pronta',
   jsonb_build_object(
     'agenda', jsonb_build_array(
       jsonb_build_object('call_id', '77779999-0000-4000-8000-000000000001', 'username', 'da.dimenticare', 'nome', 'Da Dimenticare'),
       jsonb_build_object('call_id', '77779999-0000-4000-8000-000000000002', 'username', 'resta.qui', 'nome', 'Resta Qui')),
     'stato_lead', jsonb_build_array(
       jsonb_build_object('chiave', 'da.dimenticare', 'per', 'username', 'stato_lead', 'call_fissata'),
       jsonb_build_object('chiave', 'resta.qui', 'per', 'username', 'stato_lead', 'follow_up'))));
insert into public.insight_recap (giorno, canale, esecuzione_id, generato_il, stato, dati) values
  (public.oggi() - 2, 'instagram', '77770000-0000-4000-8000-000000000050', now(), 'completo',
   jsonb_build_object(
     'headline', 'Due chat',
     'leads', jsonb_build_array(
       jsonb_build_object('username', 'da.dimenticare', 'conversation_id', 'conv-dim', 'name', 'Da Dimenticare'),
       jsonb_build_object('username', 'resta.qui', 'conversation_id', 'conv-resta', 'name', 'Resta Qui')),
     'reactivate', jsonb_build_array(
       jsonb_build_object('username', 'da.dimenticare', 'conversation_id', 'conv-dim'),
       jsonb_build_object('username', 'resta.qui', 'conversation_id', 'conv-resta')),
     'objections', jsonb_build_array(
       jsonb_build_object('username', 'da.dimenticare', 'text', 'costa troppo'),
       jsonb_build_object('username', 'resta.qui', 'text', 'non ho tempo')),
     'non_leads', jsonb_build_array(
       jsonb_build_object('username', 'da.dimenticare', 'reason', 'amico'),
       jsonb_build_object('username', 'resta.qui', 'reason', 'servizio')),
     'agenda', jsonb_build_array(
       jsonb_build_object('call_id', '77779999-0000-4000-8000-000000000001', 'username', 'da.dimenticare'),
       jsonb_build_object('call_id', '77779999-0000-4000-8000-000000000002', 'username', 'resta.qui')),
     'show_up', jsonb_build_array(
       jsonb_build_object('call_id', '77779999-0000-4000-8000-000000000001', 'username', 'da.dimenticare'),
       jsonb_build_object('call_id', '77779999-0000-4000-8000-000000000002', 'username', 'resta.qui'))));
insert into public.insight_fatto (giorno, canale, chiave, fatto) values
  (public.oggi() - 2, 'instagram', 'da.dimenticare', true),
  (public.oggi() - 2, 'instagram', 'resta.qui', true),
  (public.oggi() - 2, 'instagram', '77779999-0000-4000-8000-000000000001', true);
insert into public.insight_chat (canale, conversazione_id, username, messaggi, messaggi_letti, completa) values
  ('instagram', 'conv-dim', 'da.dimenticare', '[{"da":"lead","il":"2026-10-14T08:00:00Z","testo":"Ciao"}]', 1, true),
  ('instagram', 'conv-resta', 'resta.qui', '[{"da":"lead","il":"2026-10-14T08:00:00Z","testo":"Salve"}]', 1, true);
insert into public.insight_profili (username) values ('da.dimenticare'), ('resta.qui');
insert into public.insight_schede (esecuzione_id, giorno, canale, tipo, chiave, impronta, dati) values
  ('77770000-0000-4000-8000-000000000050', public.oggi() - 2, 'instagram', 'lead', 'conv-dim', repeat('c', 64), '{}'),
  ('77770000-0000-4000-8000-000000000050', public.oggi() - 2, 'instagram', 'agenda', '77779999-0000-4000-8000-000000000001', repeat('d', 64), '{}'),
  ('77770000-0000-4000-8000-000000000050', public.oggi() - 2, 'instagram', 'lead', 'conv-resta', repeat('e', 64), '{}');

set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok($$ select public.insight_dimentica('instagram', 'da.dimenticare') $$, '42501', null,
  'il setter non cancella una chat');
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$ select public.insight_dimentica('instagram', 'Non Valido!') $$, '22023', 'Chat non valida.',
  'una chiave che non è uno username no');
select throws_ok($$ select public.insight_dimentica('messenger', 'da.dimenticare') $$, '22023', 'Chat non valida.',
  'su Messenger la chiave è un PSID');
insert into valori (nome, testo) values ('dimentica', public.insight_dimentica('instagram', '@Da.Dimenticare')::text);
reset role;
set local request.jwt.claims to '{}';
select is(
  (select array_agg(a order by a) from public.insight_recap r,
     unnest(array['leads', 'reactivate', 'objections', 'non_leads', 'agenda', 'show_up']) as a
   where r.giorno = public.oggi() - 2 and r.canale = 'instagram'
     and jsonb_array_length(r.dati->a) = 1
     and r.dati->a->0->>'username' = 'resta.qui'),
  array['agenda', 'leads', 'non_leads', 'objections', 'reactivate', 'show_up'],
  'la chat esce da tutti e sei gli elenchi del recap, le altre restano'
);
select is(
  (select position('dimenticare' in dati::text) from public.insight_recap
   where giorno = public.oggi() - 2 and canale = 'instagram'),
  0,
  'e nel recap non c''è più il suo nome'
);
select is(
  (select position('dimenticare' in contesto_app::text) from public.insight_esecuzioni
   where id = '77770000-0000-4000-8000-000000000050'),
  0,
  'né nello stato dell''app tenuto con l''esecuzione'
);
select is(
  (select jsonb_array_length(contesto_app->'agenda') + jsonb_array_length(contesto_app->'stato_lead')
   from public.insight_esecuzioni where id = '77770000-0000-4000-8000-000000000050'),
  2,
  'dove le altre persone restano'
);
select is(
  (select array_agg(username order by username) from public.insight_chat where username in ('da.dimenticare', 'resta.qui')),
  array['resta.qui'],
  'la chat se ne va'
);
select is(
  (select array_agg(username order by username) from public.insight_profili where username in ('da.dimenticare', 'resta.qui')),
  array['resta.qui'],
  'il profilo anche'
);
select is(
  (select array_agg(chiave order by chiave) from public.insight_schede
   where esecuzione_id = '77770000-0000-4000-8000-000000000050'),
  array['conv-resta'],
  'e le sue schede, anche quella della call in agenda'
);
select is(
  (select array_agg(chiave order by chiave) from public.insight_fatto where giorno = public.oggi() - 2),
  array['resta.qui'],
  'e i suoi Fatto'
);
select ok(
  (select (testo::jsonb->>'chat')::integer = 1 and (testo::jsonb->>'voci_recap')::integer = 6
   from valori where nome = 'dimentica'),
  'la funzione dice quanto ha cancellato'
);

-- ---------------------------------------------------------------------------
-- 17. Messenger: the Page token in Vault
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok(
  $$ select public.messenger_imposta_token('EAAtokenDelSetterDiProva1234567890', '123456789', 'Pagina') $$,
  '42501', 'Messenger lo collega l’admin.',
  'il setter non collega Messenger'
);
select throws_ok($$ select public.messenger_token_presente() $$, '42501', null, 'né sa se il token c''è');
select throws_ok($$ select public.messenger_togli_token() $$, '42501', null, 'né lo toglie');
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(public.messenger_token_presente(), false, 'l''admin sa che il token della Pagina non c''è');
select throws_ok(
  $$ select public.messenger_imposta_token('corto', '123456789', 'Pagina') $$,
  '22023', 'Token della Pagina non valido.',
  'un testo corto non è un token'
);
select throws_ok(
  $$ select public.messenger_imposta_token('EAA token con spazi dentro 1234567890', '123456789', 'Pagina') $$,
  '22023', 'Token della Pagina non valido.',
  'né un token con gli spazi in mezzo'
);
select throws_ok(
  $$ select public.messenger_imposta_token('EAAtokenDellaPaginaDiProva1234567890', 'pagina', 'Pagina') $$,
  '22023', null,
  'né una Pagina senza il suo id di cifre'
);
select lives_ok(
  $$ select public.messenger_imposta_token('  EAAtokenDellaPaginaDiProva1234567890  ', '123456789', 'Percorso Alpha') $$,
  'l''admin collega la Pagina'
);
select is(public.messenger_token_presente(), true, 'ora il token c''è');
select is(
  (select row(pagina_id, pagina_nome, token_aggiornato_il = now(), ultimo_errore, updated_by)::text
   from public.messenger_collegamento),
  row('123456789', 'Percorso Alpha', true, null::text, '11111111-1111-4111-8111-111111111111'::uuid)::text,
  'il collegamento dice la Pagina e quando'
);
select is(
  (select position('EAAtoken' in to_jsonb(m)::text) from public.messenger_collegamento m),
  0,
  'mai il token'
);
select throws_ok($$ select public.messenger_token() $$, '42501', null, 'nemmeno l''admin legge il token');
select throws_ok($$ select public.messenger_errore('x') $$, '42501', null, 'né scrive gli errori della lettura');
reset role;
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select is(public.messenger_token(), 'EAAtokenDellaPaginaDiProva1234567890', 'il service role legge il token, senza spazi');
select lives_ok(
  $$ select public.messenger_errore('Graph 190 su /me?access_token=EAAtokenDellaPaginaDiProva1234567890: scaduto, anche EAAaltroTokenSconosciutoLungo1234567890abcdef') $$,
  'un errore col token dentro'
);
select ok(
  (select position('EAAtoken' in ultimo_errore) = 0 and position('EAAaltro' in ultimo_errore) = 0
          and ultimo_errore like '%scaduto%' and ultimo_errore_il = now()
   from public.messenger_collegamento),
  'si salva senza il token, né il nostro né un altro'
);
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$ select public.messenger_togli_token() $$, 'l''admin toglie il token');
select is(public.messenger_token_presente(), false, 'e non c''è più');
select is((select pagina_nome from public.messenger_collegamento), 'Percorso Alpha', 'il nome della Pagina resta');

-- ---------------------------------------------------------------------------
-- 18. The key of the steps
-- ---------------------------------------------------------------------------
select throws_ok($$ select public.insight_chiave() $$, '42501', null, 'l''admin non legge la chiave dei passi');
reset role;
set local role service_role;
insert into valori (nome, testo) values ('chiave_prima', public.insight_chiave());
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok($$ select public.insight_ruota_chiave() $$, '42501', null, 'il setter non cambia la chiave');
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$ select public.insight_ruota_chiave() $$, 'l''admin la cambia');
reset role;
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select ok(
  public.insight_chiave() ~ '^[0-9a-f]{64}$' and public.insight_chiave() <> (select testo from valori where nome = 'chiave_prima'),
  'la chiave nuova è di 32 byte casuali, diversa da prima'
);
reset role;
set local request.jwt.claims to '{}';
select is((select count(*)::integer from vault.secrets where name = 'insight_chiave'), 1, 'sempre una sola');

-- ---------------------------------------------------------------------------
-- 18b. insight_scarta_minore(): a chat found to be under 14 loses what the earlier recaps and cards kept
-- ---------------------------------------------------------------------------
insert into public.insight_esecuzioni (id, giorno, motivo, stato) values
  ('77770000-0000-4000-8000-0000000000f0', public.oggi() - 9, 'manuale', 'pronta'),
  ('77770000-0000-4000-8000-0000000000f1', public.oggi() - 8, 'manuale', 'pronta');
insert into public.insight_chat (id, canale, conversazione_id, username, ultimo_il, letta_il, messaggi, messaggi_letti, completa) values
  ('77773333-0000-4000-8000-000000000004', 'instagram', 'c77-min2', 'minore.due', now(), now(), '[]', 0, true);
insert into public.insight_recap (giorno, canale, esecuzione_id, generato_il, stato, dati) values
  (public.oggi() - 9, 'instagram', '77770000-0000-4000-8000-0000000000f0', now() - interval '9 days', 'completo',
   jsonb_build_object(
     'headline', 'resta',
     'leads', jsonb_build_array(
       jsonb_build_object('conversation_id', 'c77-min2', 'username', 'minore.due', 'name', 'Marco', 'age', '', 'priority', 'media',
         'target', 'si', 'stage', 'qualifica', 'status', 'in conversazione', 'situation', 'vuole mettere massa', 'pain', 'si sente piccolo',
         'next_action', 'proporre la call', 'suggested_message', 'Ti va una call? Costa 100 euro', 'suggested_message_alt', '',
         'alt_condition', '', 'needs_dany', '', 'flow', 'inbound', 'source', 'reel condiviso', 'topics', jsonb_build_array('massa'),
         'last_from', 'alpha', 'last_message_at', '2026-10-06T09:00:00Z',
         'messages', jsonb_build_array(jsonb_build_object('from', 'lead', 'time', '06/10 10:00', 'text', 'ho 13 anni', 'at', '2026-10-06T08:00:00Z')),
         'origine', jsonb_build_object('tipo', 'condivisione', 'shortcode', 'SeedDemo01')),
       jsonb_build_object('conversation_id', 'c77-adulto', 'username', 'adulto.uno', 'name', 'Luca', 'situation', 'resta',
         'messages', jsonb_build_array(jsonb_build_object('from', 'lead', 'time', '06/10 10:00', 'text', 'ciao', 'at', '2026-10-06T08:00:00Z')))),
     'reactivate', jsonb_build_array(
       jsonb_build_object('conversation_id', 'c77-min2', 'username', 'minore.due', 'days_silent', 6, 'messages', '[]'::jsonb),
       jsonb_build_object('conversation_id', 'c77-altro', 'username', 'altro.uno', 'days_silent', 7, 'messages', '[]'::jsonb)),
     'objections', jsonb_build_array(
       jsonb_build_object('username', 'minore.due', 'text', 'costa troppo', 'suggested_reply', 'una risposta'),
       jsonb_build_object('username', 'adulto.uno', 'text', 'ci penso', 'suggested_reply', 'altra risposta')),
     'non_leads', '[]'::jsonb));
insert into public.insight_schede (esecuzione_id, giorno, canale, tipo, chiave, impronta, dati) values
  ('77770000-0000-4000-8000-0000000000f0', public.oggi() - 9, 'instagram', 'lead', 'c77-min2', repeat('d', 64),
   '{"tipo":"lead","situation":"vuole massa","pain":"si sente piccolo","suggested_message":"Ti va una call? Costa 100 euro"}'),
  ('77770000-0000-4000-8000-0000000000f0', public.oggi() - 9, 'instagram', 'lead', 'c77-adulto', repeat('e', 64),
   '{"tipo":"lead","situation":"resta"}'),
  ('77770000-0000-4000-8000-0000000000f1', public.oggi() - 8, 'instagram', 'lead', 'c77-min2', repeat('f', 64),
   '{"tipo":"lead","situation":"sotto i 14","fascia_eta":"sotto_14","suggested_message":"Ciao, ti lascio i contenuti gratuiti"}');

set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select is(
  public.insight_scarta_minore('instagram', 'c77-min2', '77770000-0000-4000-8000-0000000000f1'),
  '{"voci_recap": 3, "schede": 2}'::jsonb,
  'toglie il minore dai recap (la scheda, le riattivazioni, le obiezioni) e dalle schede'
);
reset role;
select is(
  (select row(l->>'minore_14', jsonb_array_length(l->'messages'), l->>'situation', l->>'pain', l->>'suggested_message',
              l->'topics', l ? 'origine', l->>'username')::text
   from public.insight_recap r, jsonb_array_elements(r.dati->'leads') l
   where r.giorno = public.oggi() - 9 and r.canale = 'instagram' and l->>'conversation_id' = 'c77-min2'),
  row('true', 0, 'Minore sotto i 14 anni.', '', '', '[]'::jsonb, false, 'minore.due')::text,
  'nel recap dei giorni prima il minore non ha più messaggi, situazione, pain, risposte suggerite né origine'
);
select is(
  (select row(l->>'situation', jsonb_array_length(l->'messages'))::text
   from public.insight_recap r, jsonb_array_elements(r.dati->'leads') l
   where r.giorno = public.oggi() - 9 and r.canale = 'instagram' and l->>'conversation_id' = 'c77-adulto'),
  row('resta', 1)::text,
  'un altro lead di quel giorno non si tocca'
);
select is(
  (select array_agg(x->>'username' order by x->>'username')
   from public.insight_recap r, jsonb_array_elements(r.dati->'reactivate') x
   where r.giorno = public.oggi() - 9 and r.canale = 'instagram'),
  array['altro.uno'],
  'esce dalle chat da riattivare'
);
select is(
  (select array_agg(x->>'username') from public.insight_recap r, jsonb_array_elements(r.dati->'objections') x
   where r.giorno = public.oggi() - 9 and r.canale = 'instagram'),
  array['adulto.uno'],
  'e dalle obiezioni, che citano le sue parole'
);
select is(
  (select r.dati->>'headline' from public.insight_recap r where r.giorno = public.oggi() - 9 and r.canale = 'instagram'),
  'resta',
  'il resto del recap resta com''è'
);
select is(
  (select s.dati::text from public.insight_schede s
   where s.esecuzione_id = '77770000-0000-4000-8000-0000000000f0' and s.chiave = 'c77-min2'),
  '{"tipo": "lead", "minore_14": true, "ultima_chiusura": ""}',
  'le schede dei giorni prima perdono tutto, anche la risposta ordinaria che aveva dato (un prezzo)'
);
select is(
  (select s.dati::text from public.insight_schede s
   where s.esecuzione_id = '77770000-0000-4000-8000-0000000000f1' and s.chiave = 'c77-min2'),
  '{"tipo": "lead", "minore_14": true, "ultima_chiusura": "Ciao, ti lascio i contenuti gratuiti"}',
  'quella dell''esecuzione che l''ha riconosciuto tiene la chiusura calorosa'
);
select is(
  (select s.dati->>'situation' from public.insight_schede s
   where s.esecuzione_id = '77770000-0000-4000-8000-0000000000f0' and s.chiave = 'c77-adulto'),
  'resta',
  'la scheda di un altro lead non si tocca'
);
set local role service_role;
select is(
  public.insight_scarta_minore('instagram', 'c77-min2', '77770000-0000-4000-8000-0000000000f1'),
  '{"voci_recap": 0, "schede": 0}'::jsonb,
  'rifarlo non cambia niente'
);
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok(
  $$ select public.insight_scarta_minore('instagram', 'c77-min2', '77770000-0000-4000-8000-0000000000f1') $$,
  '42501', null,
  'nessuna sessione, nemmeno l''admin, la chiama'
);
reset role;
set local request.jwt.claims to '{}';

-- the recaps the setter reads carry no warnings and no model details (they are on the run, the admin's)
select is(
  (select count(*)::integer from public.insight_recap r where r.dati ? 'avvisi' or r.dati ? 'generato_con'),
  0,
  'nei recap di seed, quelli che legge il setter, non ci sono gli avvisi né i dettagli del modello'
);
select col_type_is('public', 'insight_esecuzioni', 'dettagli_recap', 'jsonb',
  'stanno sull''esecuzione (dettagli_recap), che legge solo l''admin');

-- ---------------------------------------------------------------------------
-- 19. Grants: the internal functions belong to no session
-- ---------------------------------------------------------------------------
select ok(
  (select bool_and(not has_function_privilege('anon', f, 'execute')
                   and not has_function_privilege('authenticated', f, 'execute'))
   from unnest(array[
     'public.insight_tick()', 'public.insight_dispatch(uuid)', 'public.insight_pulizia()', 'public.insight_chiave()',
     'public.insight_prendi_passo(uuid, integer)',
     'public.insight_passo_finito(uuid, public.insight_passo, jsonb, text[], jsonb)',
     'public.insight_fallita(uuid, text, jsonb)', 'public.insight_scarta_letture(uuid)',
     'public.insight_scarta_minore(public.insight_canale, text, uuid)', 'public.insight_imposta_url(text)',
     'public.insight_agenda(timestamptz)', 'public.insight_stato_lead(text[], text[])',
     'public.insight_costo_usd(bigint, bigint, bigint, bigint)', 'public.insight_da_avviare(timestamptz)',
     'public.insight_istante(text)', 'public.messenger_token()', 'public.messenger_errore(text)'
   ]) as f),
  'nessuna sessione chiama le funzioni interne dell''Insight'
);
select ok(
  (select bool_and(has_function_privilege('service_role', f, 'execute'))
   from unnest(array[
     'public.insight_prendi_passo(uuid, integer)',
     'public.insight_passo_finito(uuid, public.insight_passo, jsonb, text[], jsonb)',
     'public.insight_fallita(uuid, text, jsonb)', 'public.insight_chiave()', 'public.insight_agenda(timestamptz)',
     'public.insight_scarta_minore(public.insight_canale, text, uuid)', 'public.insight_imposta_url(text)',
     'public.insight_stato_lead(text[], text[])', 'public.messenger_token()', 'public.messenger_errore(text)'
   ]) as f),
  'il service role chiama quelle della route'
);
select ok(
  (select bool_and(not has_function_privilege('service_role', f, 'execute'))
   from unnest(array['public.insight_tick()', 'public.insight_dispatch(uuid)', 'public.insight_pulizia()',
                     'public.insight_scarta_letture(uuid)', 'public.insight_da_avviare(timestamptz)']) as f),
  'e non quelle del pianificatore'
);
select is(
  (select array_agg(p.proname::text order by p.proname)
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and (p.proname like 'insight\_%' or p.proname like 'messenger\_%')
     and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))),
  array['insight_chat_messenger', 'insight_dimentica', 'insight_imposta_automazione', 'insight_puo_leggere',
        'insight_richiedi', 'insight_ruota_chiave', 'insight_stato', 'messenger_imposta_token',
        'messenger_togli_token', 'messenger_token_presente'],
  'le sessioni chiamano solo le funzioni che controllano prima il ruolo'
);
select ok(
  (select bool_and(not has_function_privilege('anon', p.oid, 'execute'))
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace and (p.proname like 'insight\_%' or p.proname like 'messenger\_%')),
  'anon non chiama nessuna funzione dell''Insight'
);
select diag('net.http_post eseguibile da authenticated: ' || coalesce((
  select has_function_privilege('authenticated', p.oid, 'execute')::text
  from pg_proc p where p.pronamespace = 'net'::regnamespace and p.proname = 'http_post' limit 1), 'non trovata')
  || ' (lo schema net non è esposto dalla Data API)');
select is(
  (select coalesce(array_agg(p.proname::text order by p.proname), '{}')
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and (p.prosrc ~ 'http_post' or p.prosrc ~ 'insight_dispatch')
     and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))),
  array['insight_richiedi'],
  'una sessione arriva a pg_net solo da «Aggiorna dati», che controlla prima l''admin'
);
select ok(
  (select bool_and(p.proconfig @> array['search_path=""'])
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and (p.proname like 'insight\_%' or p.proname like 'messenger\_%' or p.proname = 'instagram_contenuti_dm_salva')),
  'ogni funzione dell''Insight ha il search_path vuoto'
);

-- ---------------------------------------------------------------------------
-- 20. The two pg_cron jobs
-- ---------------------------------------------------------------------------
select is(
  (select array_agg(row(jobname, schedule, command)::text order by jobname) from cron.job
   where jobname like 'insight-%'),
  array[row('insight-pulizia', '20 2 * * *', 'select public.insight_pulizia()')::text,
        row('insight-tick', '*/5 * * * *', 'select public.insight_tick()')::text],
  'il tick ogni 5 minuti e la pulizia ogni notte, senza la chiave nel comando'
);

select * from finish();
rollback;
