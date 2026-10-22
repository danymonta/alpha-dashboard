-- «Aggiorna dati» of the Insight for the setter too (1.50.0, Dany, 22/10/2026:
-- «No, anche Loris deve poter aggiornare i dati!!!!»). insight_richiedi()
-- answers the admin and every active setter; a deactivated setter, the other
-- roles and an OAuth token of Claude (the setter's and the admin's) get 42501.
-- The 8 manual runs a day are shared by the admin and the setters, one run at
-- a time. No trace of who pressed (section 17): richiesta_da stays null. The
-- setter reads the run's state from insight_stato() without cost, errors,
-- warnings or the admin's keys, and never reads insight_esecuzioni.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(31);

create temp table valori (nome text primary key, id uuid) on commit drop;
grant all on valori to authenticated, service_role;

-- a clean start: no run active, no manual run today, no step URL (nothing is sent)
delete from public.insight_esecuzioni e
where e.stato in ('in_coda', 'in_corso') or (e.motivo = 'manuale' and e.giorno = public.oggi());
update public.insight_impostazioni set url_passo = null where id;

-- ---------------------------------------------------------------------------
-- 1. The function
-- ---------------------------------------------------------------------------
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'public.insight_richiedi()'::regprocedure),
  'insight_richiedi resta security definer con search_path vuoto'
);
select ok(not has_function_privilege('anon', 'public.insight_richiedi()', 'execute'), 'anon non la esegue');
select ok(has_function_privilege('authenticated', 'public.insight_richiedi()', 'execute'),
  'una sessione la esegue: decide la funzione');

-- ---------------------------------------------------------------------------
-- 2. The active setter asks for a run
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select lives_ok($$ insert into valori (nome, id) values ('setter', public.insight_richiedi()) $$,
  'il setter attivo aggiorna i dati');
reset role;
select is(
  (select row(e.giorno = public.oggi(), e.motivo, e.stato, e.richiesta_da)::text
   from public.insight_esecuzioni e join valori v on v.id = e.id and v.nome = 'setter'),
  row(true, 'manuale', 'in_coda'::public.insight_stato_esecuzione, null::uuid)::text,
  'un''esecuzione manuale di oggi, in coda, senza il nome di chi l''ha chiesta'
);

-- one run at a time, for both
set local role authenticated;
select throws_ok($$ select public.insight_richiedi() $$, '22023', 'Un aggiornamento è già in corso.',
  'un secondo tocco del setter mentre gira no');
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$ select public.insight_richiedi() $$, '22023', 'Un aggiornamento è già in corso.',
  'nemmeno l''admin mentre gira quella del setter');

-- ---------------------------------------------------------------------------
-- 3. What the setter reads of the run
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.insight_stato() -> 'esecuzione') k),
  array['blocchi_fatti', 'blocchi_totali', 'creata_il', 'finita_il', 'passo', 'stato'],
  'il setter legge dello stato solo i campi neutri: stato, passo, avanzamento, quando'
);
select is(public.insight_stato() #>> '{esecuzione,stato}', 'in_coda', 'e vede che l''aggiornamento è in coda');
select is(
  (select array_agg(k order by k) from jsonb_object_keys(public.insight_stato()) k),
  array['attivo', 'esecuzione', 'ora'],
  'niente ultimo tick né manuali di oggi'
);
select ok(
  public.insight_stato()::text !~ '(costo_usd|errore|avvisi|token_|dettagli_recap|motivo)',
  'mai costi, errori, avvisi, token o dettagli'
);
select is((select count(*)::integer from public.insight_esecuzioni), 0, 'la tabella delle esecuzioni il setter non la legge');

-- the admin keeps his reading
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select ok(public.insight_stato() ? 'manuali_oggi' and (public.insight_stato() -> 'esecuzione') ? 'costo_usd',
  'l''admin legge ancora manuali di oggi e costo');
reset role;

-- ---------------------------------------------------------------------------
-- 4. The 8 a day, shared by the admin and the setters
-- ---------------------------------------------------------------------------
update public.insight_esecuzioni set stato = 'pronta' where id = (select id from valori where nome = 'setter');
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok($$ insert into valori (nome, id) values ('admin', public.insight_richiedi()) $$,
  'dopo quella del setter l''admin aggiorna');
reset role;
select is((select richiesta_da from public.insight_esecuzioni where id = (select id from valori where nome = 'admin')),
  null::uuid, 'anche la sua senza nome');
update public.insight_esecuzioni set stato = 'pronta' where id = (select id from valori where nome = 'admin');
-- five more done today: seven with the two above
insert into public.insight_esecuzioni (giorno, motivo, stato)
select public.oggi(), 'manuale', 'pronta' from generate_series(1, 5);
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select lives_ok($$ insert into valori (nome, id) values ('ottava', public.insight_richiedi()) $$,
  'l''ottava di oggi la chiede il setter');
reset role;
update public.insight_esecuzioni set stato = 'pronta' where id = (select id from valori where nome = 'ottava');
set local role authenticated;
select throws_ok($$ select public.insight_richiedi() $$, '22023', 'Hai già aggiornato 8 volte oggi: riprova domani.',
  'la nona no, per il setter');
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$ select public.insight_richiedi() $$, '22023', 'Hai già aggiornato 8 volte oggi: riprova domani.',
  'né per l''admin: il limite è uno solo');
reset role;
-- the next tests start again from zero
delete from public.insight_esecuzioni e where e.motivo = 'manuale' and e.giorno = public.oggi();

-- ---------------------------------------------------------------------------
-- 5. Who never asks
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select throws_ok($$ select public.insight_richiedi() $$, '42501',
  'I dati dell’Insight li aggiornano l’admin e i setter.', 'il closer no');
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select throws_ok($$ select public.insight_richiedi() $$, '42501', null, 'il coach no');
set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
select throws_ok($$ select public.insight_richiedi() $$, '42501', null, 'il video editor no');
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select throws_ok($$ select public.insight_richiedi() $$, '42501', null, 'il marketing no');
reset role;
set local request.jwt.claims to '{}';
update public.profiles set ruolo = 'nutrizione' where id = '44444444-4444-4444-8444-444444444444';
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select throws_ok($$ select public.insight_richiedi() $$, '42501', null, 'la nutrizione no');
reset role;
set local request.jwt.claims to '{}';
update public.profiles set ruolo = 'dev' where id = '44444444-4444-4444-8444-444444444444';
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select throws_ok($$ select public.insight_richiedi() $$, '42501', null, 'lo sviluppo no');
reset role;
set local request.jwt.claims to '{}';
update public.profiles set attivo = false where id = '22222222-2222-4222-8222-222222222222';
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok($$ select public.insight_richiedi() $$, '42501', null, 'un setter disattivato no');
reset role;
set local request.jwt.claims to '{}';
update public.profiles set attivo = true where id = '22222222-2222-4222-8222-222222222222';

-- Claude connected with the MCP: an OAuth token (client_id in the JWT), the setter's and the admin's
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated","client_id":"7c000000-0000-4000-8000-000000000099","session_id":"7e000000-0000-4000-8000-000000000099"}';
select throws_ok($$ select public.insight_richiedi() $$, '42501', null, 'un token di Claude del setter no');
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","client_id":"7c000000-0000-4000-8000-000000000099","session_id":"7e000000-0000-4000-8000-000000000199"}';
select throws_ok($$ select public.insight_richiedi() $$, '42501', null, 'né uno dell''admin');
reset role;
select is(
  (select count(*)::integer from public.insight_esecuzioni e where e.motivo = 'manuale' and e.giorno = public.oggi()),
  0, 'nessuno di questi ha creato un''esecuzione'
);

-- ---------------------------------------------------------------------------
-- 6. No trace of who pressed
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.insight_esecuzioni (giorno, motivo, richiesta_da)
     values (public.oggi(), 'manuale', '11111111-1111-4111-8111-111111111111') $$,
  '23514', null, 'nemmeno il service role scrive chi l''ha chiesta'
);
select is((select count(*)::integer from public.insight_esecuzioni where richiesta_da is not null), 0,
  'nessuna esecuzione porta un nome');
select is(
  (select count(*)::integer from information_schema.columns
   where table_schema = 'public' and table_name = 'insight_esecuzioni'
     and column_name ~ '(chiest|premut|utente|setter)' and column_name <> 'richiesta_da'),
  0, 'nessuna colonna nuova con la persona'
);

select * from finish();
rollback;
