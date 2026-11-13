-- Guided onboarding, release B1a (1.79.0): a client is an authenticated user without a profile, so every
-- policy and every function of the team must close for him. Checked here, as an active client, a suspended
-- client and a user with neither a profile nor an account (the seed's clients, 61_percorso.sql): every table
-- and view of public counted from the catalog (zero rows, but his own row of clienti_account), every write
-- refused, every security definer function the team reaches called with null arguments (an error, null or
-- nothing, never a row of somebody else), the buckets «avatari» and «onboarding-allegati» (1.80.0) closed, no
-- table of the onboarding in Realtime, and cliente_corrente() null for an OAuth token of a client.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(23);

create temp table righe_viste (persona text, relazione text, righe bigint, errore text) on commit drop;
create temp table scritture (persona text, relazione text, esito text) on commit drop;
create temp table funzioni (persona text, funzione text, esito text) on commit drop;
grant select, insert on righe_viste, scritture, funzioni to authenticated;

create or replace function pg_temp.come(p_utente uuid, p_extra jsonb default '{}')
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims',
    (jsonb_build_object('sub', p_utente, 'role', 'authenticated') || p_extra)::text, true);
  perform set_config('alpha.mcp_filtro', '', true);
  perform set_config('request.path', '', true);
  set local role authenticated;
end;
$$;

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

-- every table: an insert of default values, a delete and an update of its first column. Each inside its own
-- block: a write that errors writes nothing, a write that passes must have touched no row
create or replace function pg_temp.scrivi_tutto(p_persona text)
returns void
language plpgsql
as $$
declare
  r record;
  n bigint;
  v_col text;
begin
  for r in select tablename::text as nome from pg_catalog.pg_tables where schemaname = 'public' loop
    begin
      execute format('insert into public.%I default values', r.nome);
      insert into pg_temp.scritture values (p_persona, r.nome, 'insert passato');
    exception when others then
      null;
    end;
    begin
      execute format('delete from public.%I', r.nome);
      get diagnostics n = row_count;
      if n > 0 then
        insert into pg_temp.scritture values (p_persona, r.nome, 'delete ' || n);
      end if;
    exception when others then
      null;
    end;
    select a.attname::text into v_col
    from pg_attribute a
    where a.attrelid = ('public.' || quote_ident(r.nome))::regclass and a.attnum > 0 and not a.attisdropped
      and a.attgenerated = ''
    order by a.attnum limit 1;
    begin
      execute format('update public.%I set %I = %I', r.nome, v_col, v_col);
      get diagnostics n = row_count;
      if n > 0 then
        insert into pg_temp.scritture values (p_persona, r.nome, 'update ' || n);
      end if;
    exception when others then
      null;
    end;
  end loop;
end;
$$;

-- every security definer function the team reaches, with null arguments
create or replace function pg_temp.chiama_tutto(p_persona text, p_salta text[] default '{}')
returns void
language plpgsql
as $$
declare
  r record;
  v text;
  v_sql text;
begin
  for r in
    select p.oid, p.proname::text as nome, p.proretset, p.pronargs,
           (select coalesce(string_agg('null::' || format_type(t.oid, null), ', ' order by o.n), '')
            from unnest(p.proargtypes) with ordinality as o(tipo, n)
            join pg_type t on t.oid = o.tipo) as argomenti
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.prosecdef
      and p.prorettype <> 'trigger'::regtype
      and has_function_privilege('authenticated', p.oid, 'execute')
      and not (p.proname::text = any (p_salta))
  loop
    if r.proretset then
      v_sql := format('select count(*)::text from public.%I(%s)', r.nome, r.argomenti);
    else
      v_sql := format('select public.%I(%s)::text', r.nome, r.argomenti);
    end if;
    begin
      execute v_sql into v;
      insert into pg_temp.funzioni values (p_persona, r.nome, coalesce(v, 'null'));
    exception when others then
      insert into pg_temp.funzioni values (p_persona, r.nome, sqlstate);
    end;
  end loop;
end;
$$;

-- An authenticated user with neither a profile nor an account (a sub that is nobody)
select pg_temp.come('0b0b0000-0000-4000-8000-0000000000ff');
do $$ begin perform pg_temp.conta_tutto('nessuno'); end $$;
reset role;
-- The active client (Davide Ferri) and the suspended one (Luca Marini)
select pg_temp.come('0b0b0000-0000-4000-8000-000000000031');
do $$ begin perform pg_temp.conta_tutto('attivo'); end $$;
reset role;
select pg_temp.come('0b0b0000-0000-4000-8000-000000000032');
do $$ begin perform pg_temp.conta_tutto('sospeso'); end $$;
reset role;
set local request.jwt.claims to '{}';

select is(
  (select count(*)::integer from righe_viste where persona = 'attivo'),
  (select count(*)::integer from pg_tables where schemaname = 'public')
    + (select count(*)::integer from pg_views where schemaname = 'public'),
  'il conteggio ha letto tutte le tabelle e le view di public'
);
select is(
  (select coalesce(string_agg(relazione || ' ' || righe, ', ' order by relazione), '')
   from righe_viste where persona = 'attivo' and coalesce(righe, 0) > 0 and relazione <> 'clienti_account'),
  '', 'il cliente attivo non legge nessuna riga di nessuna tabella o view'
);
select is((select righe from righe_viste where persona = 'attivo' and relazione = 'clienti_account'), 1::bigint,
  'tranne la sua riga di clienti_account');
select is(
  (select coalesce(string_agg(relazione || ' ' || righe, ', ' order by relazione), '')
   from righe_viste where persona = 'sospeso' and coalesce(righe, 0) > 0 and relazione <> 'clienti_account'),
  '', 'il cliente sospeso nemmeno'
);
select is((select righe from righe_viste where persona = 'sospeso' and relazione = 'clienti_account'), 1::bigint,
  'e legge la sua riga (la pagina «sospeso» la usa)');
select is(
  (select coalesce(string_agg(relazione || ' ' || righe, ', ' order by relazione), '')
   from righe_viste where persona = 'nessuno' and coalesce(righe, 0) > 0),
  '', 'un utente senza profilo né account non legge niente'
);
do $$ begin perform pg_temp.conta_tutto('postgres'); end $$;
select is(
  (select coalesce(string_agg(relazione, ', ' order by relazione), '')
   from righe_viste
   where persona = 'postgres' and coalesce(righe, 0) = 0
     and relazione in ('clients', 'sales', 'payments', 'profiles', 'onboarding_inviti', 'onboarding_percorsi',
                       'onboarding_passi', 'contenuti_blocchi', 'clienti_consensi', 'onboarding_video_visti',
                       'clienti_account', 'clienti_call')),
  '', 'e con postgres le stesse tabelle hanno righe'
);

-- Writes
select pg_temp.come('0b0b0000-0000-4000-8000-000000000031');
do $$ begin perform pg_temp.scrivi_tutto('attivo'); end $$;
reset role;
select pg_temp.come('0b0b0000-0000-4000-8000-000000000032');
do $$ begin perform pg_temp.scrivi_tutto('sospeso'); end $$;
reset role;
set local request.jwt.claims to '{}';
select is(
  (select coalesce(string_agg(persona || ' ' || relazione || ' ' || esito, ', ' order by persona, relazione), '')
   from scritture),
  '', 'ogni scrittura del cliente, attivo o sospeso, è rifiutata o non tocca niente'
);
select is((select count(*)::int from public.clienti_account), 3, 'gli account del seed sono ancora lì (61_percorso.sql e 62_percorso_team.sql)');

-- Functions: the team's reject him, or answer nothing about anybody
select pg_temp.come('0b0b0000-0000-4000-8000-000000000032');
do $$ begin perform pg_temp.chiama_tutto('sospeso'); end $$;
reset role;
select pg_temp.come('0b0b0000-0000-4000-8000-000000000031');
-- his own functions answer about him: 113_percorso_cliente.sql checks them
do $$ begin perform pg_temp.chiama_tutto('attivo', array['percorso_cliente', 'percorso_avanza', 'consenso_dai', 'video_progresso',
  'questionario_cliente', 'questionario_salva', 'questionario_invia', 'allegato_prepara', 'allegato_togli']); end $$;
reset role;
set local request.jwt.claims to '{}';
select is(
  (select coalesce(string_agg(persona || ' ' || funzione || ' ' || esito, ', ' order by persona, funzione), '')
   from funzioni
   where esito !~ '^[0-9A-Z]{5}$'
     and esito not in ('null', '0', 'false', '[]', '{}', '')
     -- what an ordinary session is to Claude's server: nothing about anybody
     and not (funzione = 'mcp_chi_sono' and esito = '{"esito": "non_oauth"}')),
  '', 'ogni funzione security definer raggiungibile rifiuta il cliente, o non risponde niente'
);
select is(
  (select coalesce(string_agg(funzione || ' ' || esito, ', ' order by funzione), '')
   from funzioni
   where persona = 'sospeso' and funzione in ('percorso_cliente', 'percorso_avanza', 'consenso_dai', 'video_progresso',
                                              'questionario_cliente', 'questionario_salva', 'questionario_invia',
                                              'allegato_prepara', 'allegato_togli')
     and esito <> '42501'),
  '', 'un cliente sospeso: le sue funzioni rispondono 42501'
);
select is(
  (select count(*)::int from funzioni where persona = 'sospeso'),
  (select count(*)::int from pg_proc p
   where p.pronamespace = 'public'::regnamespace and p.prosecdef and p.prorettype <> 'trigger'::regtype
     and has_function_privilege('authenticated', p.oid, 'execute')),
  'le ha chiamate tutte'
);

-- Storage: the bucket «avatari» is for the team only
select pg_temp.come('0b0b0000-0000-4000-8000-000000000031');
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('avatari', '0b0b0000-0000-4000-8000-000000000031/foto.webp') $$,
  '42501', null, 'il cliente non carica un file in avatari, nemmeno nella sua cartella'
);
select is((select count(*)::int from storage.objects where bucket_id = 'avatari'), 0, 'e non elenca niente');
-- the bucket of the questionnaire (1.80.0): private, no policy, every read and write is a URL the server signs
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('onboarding-allegati', '0b0b0000-0000-4000-8000-000000000001/0b0b0000-0000-4000-8000-0000000000aa') $$,
  '42501', null, 'il cliente non carica un file in onboarding-allegati, nemmeno nella sua cartella'
);
reset role;
set local request.jwt.claims to '{}';
insert into storage.objects (bucket_id, name, metadata)
values ('onboarding-allegati', '0b0b0000-0000-4000-8000-000000000001/0b0b0000-0000-4000-8000-0000000000ab',
        '{"size": 1000, "mimetype": "image/jpeg"}');
select pg_temp.come('0b0b0000-0000-4000-8000-000000000031');
select is((select count(*)::int from storage.objects where bucket_id = 'onboarding-allegati'), 0,
  'e non legge i file del bucket, nemmeno i suoi');
create or replace function pg_temp.cambia_allegati() returns integer language plpgsql as $$
declare n integer;
begin
  update storage.objects set name = name where bucket_id = 'onboarding-allegati';
  get diagnostics n = row_count;
  return n;
end;
$$;
select is(pg_temp.cambia_allegati(), 0, 'né li cambia');
reset role;
set local request.jwt.claims to '{}';
select is(
  (select count(*)::int from pg_policies where schemaname = 'storage' and tablename = 'objects'
     and (coalesce(qual, '') || coalesce(with_check, '')) like '%onboarding-allegati%'),
  0, 'nessuna policy di storage.objects nomina il bucket onboarding-allegati'
);
select is((select public from storage.buckets where id = 'onboarding-allegati'), false, 'il bucket è privato');
select ok(
  not has_function_privilege('authenticated', 'public.cliente_corrente()', 'execute'),
  'cliente_corrente() non è eseguibile da una sessione'
);

-- Realtime: no table of the onboarding or of the clients
select is(
  (select coalesce(string_agg(tablename::text, ', ' order by tablename::text), '')
   from pg_publication_tables
   where pubname = 'supabase_realtime'
     and (tablename like 'onboarding\_%' or tablename like 'clienti\_%'
          or tablename in ('contenuti_blocchi', 'clients'))),
  '', 'nessuna tabella dell''onboarding o dei clienti in Realtime'
);

-- An OAuth token of a client (if one ever existed): never a client
set local request.jwt.claims to '{"sub":"0b0b0000-0000-4000-8000-000000000031","role":"authenticated","client_id":"9c000000-0000-4000-8000-000000000112","session_id":"9e112000-0000-4000-8000-000000000001"}';
select is(public.cliente_corrente(), null, 'cliente_corrente() è null per un token OAuth');
set local role authenticated;
select throws_ok($$ select public.percorso_cliente() $$, '42501', null, 'e percorso_cliente() lo rifiuta');
reset role;
set local request.jwt.claims to '{}';

select * from finish();
rollback;
