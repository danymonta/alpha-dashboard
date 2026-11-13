-- Guided onboarding, release A (1.77.0, 20261108090200_onboarding_avvio_gate.sql): start, payment gate
-- and revocation. Checked here: nuovo_cliente does everything in one transaction; the link waits for the
-- payment and turns active when an instalment is cashed, by anybody (the closer too) and from any road,
-- or when the admin confirms by hand; a minor waits for a parent's consent; a total refund, the sale
-- deleted or moved revoke the link, an undone cash-in never; revoke, reactivate, regenerate; the people in
-- charge and their tasks; «Scegli il coach» and a renewal leave the onboarding tasks alone; a cash-in, a
-- refund and a deletion never fail because of the onboarding; the backup has no token.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(141);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Seed: admin 1111, setter 2222, closer 3333, coach 4444, editor 5555,
-- business coach bc00. Two more coaches (A and B) for the merge and the deletion of a person.
-- ---------------------------------------------------------------------------
insert into auth.oauth_clients (id, client_name, registration_type, client_type, redirect_uris,
  grant_types, token_endpoint_auth_method, deleted_at)
values ('9c000000-0000-4000-8000-000000000110', 'Claude', 'manual', 'public',
  'https://claude.ai/api/mcp/auth_callback', 'authorization_code,refresh_token', 'none', null);
insert into auth.sessions (id, user_id, created_at, updated_at, aal, oauth_client_id, not_after)
values ('9e110000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', now(), now(), 'aal1',
  '9c000000-0000-4000-8000-000000000110', null);

insert into public.invites (email, ruolo) values ('coacha110@alpha.test', 'coach'), ('coachb110@alpha.test', 'coach');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-99999999a110',
   'authenticated', 'authenticated', 'coacha110@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Aldo Centodieci"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-99999999b110',
   'authenticated', 'authenticated', 'coachb110@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Bruno Centodieci"}'::jsonb, now(), now(), '', '', '', '');

create temp table prodotto on commit drop as select id from public.products order by created_at limit 1;
create temp table casi (nome text primary key, sale_id uuid, client_id uuid, invito_id uuid) on commit drop;
create temp table appunti (chiave text primary key, valore text) on commit drop;
grant select on prodotto to authenticated;
grant select, insert, update on casi, appunti to authenticated;

create or replace function pg_temp.web(p_utente uuid)
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_utente, 'role', 'authenticated')::text, true);
  perform set_config('alpha.mcp_filtro', '', true);
  perform set_config('request.path', '', true);
  set local role authenticated;
end;
$$;

-- The admin's token of Claude inside a request the Data API filter approved: current_role() is admin
create or replace function pg_temp.claude_dentro()
returns void
language plpgsql
as $$
begin
  perform set_config('request.jwt.claims', json_build_object(
    'sub', '11111111-1111-4111-8111-111111111111', 'role', 'authenticated',
    'client_id', '9c000000-0000-4000-8000-000000000110',
    'session_id', '9e110000-0000-4000-8000-000000000001')::text, true);
  perform set_config('alpha.mcp_filtro', 'on', true);
  perform set_config('request.path', '', true);
  set local role authenticated;
end;
$$;

create or replace function pg_temp.vendita(p_nome text) returns uuid language sql as $$
  select sale_id from pg_temp.casi where nome = p_nome $$;
create or replace function pg_temp.cliente(p_nome text) returns uuid language sql as $$
  select client_id from pg_temp.casi where nome = p_nome $$;
create or replace function pg_temp.invito(p_nome text) returns uuid language sql as $$
  select invito_id from pg_temp.casi where nome = p_nome $$;
create or replace function pg_temp.progetto(p_nome text) returns uuid language sql as $$
  select p.id from public.pm_progetti p where p.client_id = pg_temp.cliente(p_nome) $$;
create or replace function pg_temp.stato(p_nome text) returns text language sql as $$
  select i.stato from public.onboarding_inviti i where i.id = pg_temp.invito(p_nome) $$;
create or replace function pg_temp.rata(p_nome text, p_numero integer default 1) returns uuid language sql as $$
  select p.id from public.payments p
  where p.sale_id = pg_temp.vendita(p_nome) and p.numero_rata = p_numero and p.stato <> 'rimborsata' $$;

-- The wizard, as whoever is signed in: a new client with a «nuovo» sale of 2.400 € in 3 instalments
create or replace function pg_temp.nuovo(
  p_nome text,
  p_coach uuid default '44444444-4444-4444-8444-444444444444',
  p_revisore uuid default '33333333-3333-4333-8333-333333333333',
  p_responsabile uuid default '11111111-1111-4111-8111-111111111111',
  p_minorenne boolean default false
)
returns text
language plpgsql
as $$
declare
  r jsonb;
begin
  r := public.nuovo_cliente(
    jsonb_build_object(
      'product_id', (select id from pg_temp.prodotto), 'data_vendita', public.oggi(), 'data_inizio', public.oggi() + 7,
      'valore_contratto', 2400, 'numero_rate', 3,
      'nome', p_nome, 'cognome', 'Centodieci', 'email', ' ' || p_nome || '@Example.test '),
    jsonb_build_object(
      'coach', p_coach, 'revisore', p_revisore, 'responsabile', p_responsabile,
      'telegram', '@' || p_nome || '_110', 'minorenne', p_minorenne));
  insert into pg_temp.casi values (p_nome, (r ->> 'sale_id')::uuid, (r ->> 'client_id')::uuid, (r ->> 'invito_id')::uuid);
  return r ->> 'stato';
end;
$$;

create or replace function pg_temp.incassa(p_nome text, p_numero integer default 1)
returns void
language plpgsql
as $$
begin
  perform public.segna_rata_incassata(pg_temp.rata(p_nome, p_numero));
end;
$$;

-- The log of a client, in order: «tipo attore» and whether it carries a name
create or replace function pg_temp.eventi(p_nome text) returns text[] language sql as $$
  select coalesce(array_agg(e.tipo || ' ' || e.attore || case when e.autore_id is null then '' else ' con nome' end
                            order by e.created_at), '{}')
  from public.onboarding_eventi e where e.client_id = pg_temp.cliente(p_nome) $$;

-- The people on the tasks of a client's project, per incarico («-» the tasks of the path without one)
create or replace function pg_temp.assegnati(p_nome text) returns text[] language sql as $$
  select array_agg(x.riga order by x.riga) from (
    select coalesce(t.per_incarico, '-') || ' ' || count(*) || ' task: '
           || coalesce((select string_agg(distinct pr.nome, ', ' order by pr.nome)
                        from public.pm_task t2
                        join public.pm_task_assegnatari a on a.task_id = t2.id
                        join public.profiles pr on pr.id = a.profile_id
                        where t2.progetto_id = pg_temp.progetto(p_nome)
                          and t2.per_incarico is not distinct from t.per_incarico), 'nessuno') as riga
    from public.pm_task t
    where t.progetto_id = pg_temp.progetto(p_nome)
    group by t.per_incarico
  ) x $$;

-- Every RPC of the onboarding as the current identity: the SQLSTATEs they answer
create or replace function pg_temp.rpc_onboarding(p_nome text)
returns text
language plpgsql
as $$
declare
  v_sql text;
  v_esiti text[] := '{}';
begin
  foreach v_sql in array array[
    format('select public.avvia_onboarding(%L, null, null, %L, null, null)', pg_temp.vendita(p_nome), '11111111-1111-4111-8111-111111111111'),
    format('select public.nuovo_cliente(%L::jsonb, %L::jsonb)', '{"nome":"Da Fuori"}', '{}'),
    format('select public.onboarding_conferma_pagamento(%L)', pg_temp.invito(p_nome)),
    format('select public.onboarding_consenso_genitore(%L, null)', pg_temp.invito(p_nome)),
    format('select public.onboarding_revoca(%L, null)', pg_temp.invito(p_nome)),
    format('select public.onboarding_riattiva(%L)', pg_temp.invito(p_nome)),
    format('select public.onboarding_rigenera_link(%L)', pg_temp.invito(p_nome)),
    format('select public.onboarding_imposta_incarichi(%L, null, null, %L)', pg_temp.cliente(p_nome), '11111111-1111-4111-8111-111111111111')
  ] loop
    begin
      execute v_sql;
      v_esiti := v_esiti || 'ok'::text;
    exception when others then
      v_esiti := v_esiti || sqlstate;
    end;
  end loop;
  return array_to_string(v_esiti, ' ');
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
select is(
  (select coalesce(string_agg(p.proname::text, ', ' order by p.proname::text), '')
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('avvia_onboarding', 'nuovo_cliente', 'onboarding_conferma_pagamento', 'onboarding_consenso_genitore',
                       'onboarding_revoca', 'onboarding_riattiva', 'onboarding_rigenera_link', 'onboarding_imposta_incarichi',
                       'onboarding_slug')
     and (p.prosecdef or not has_function_privilege('authenticated', p.oid, 'execute')
          or has_function_privilege('anon', p.oid, 'execute'))),
  '',
  'le RPC dell''onboarding sono security invoker, per authenticated e mai per anon'
);
select is(
  (select coalesce(string_agg(p.proname::text, ', ' order by p.proname::text), '')
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('onboarding_incassato_netto', 'onboarding_altro_percorso_pagato', 'onboarding_evento',
                       'onboarding_inviti_coerenza', 'onboarding_inviti_avviato', 'onboarding_inviti_stato',
                       'onboarding_incarichi_allinea', 'onboarding_gate_pagamento', 'onboarding_revoca_da_rimborso',
                       'onboarding_vendita_eliminata', 'onboarding_vendita_spostata')
     and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))),
  '',
  'le funzioni interne e dei trigger non sono eseguibili da una sessione'
);
select is(
  array[public.onboarding_slug('Niccolò', 'D''Àngelo Müller'), public.onboarding_slug(' ', null),
        public.onboarding_slug(repeat('a', 70), 'b')],
  array['niccolo-d-angelo-muller', 'cliente', repeat('a', 60)],
  'lo slug: minuscolo, senza accenti, coi trattini, al massimo 60 caratteri'
);
select is(
  (select count(*)::int from information_schema.columns
   where table_schema = 'public' and table_name = 'v_vendite_senza_onboarding'
     and column_name ~ 'valore|importo|incassat|prezzo'),
  0, 'v_vendite_senza_onboarding non ha importi'
);

-- ---------------------------------------------------------------------------
-- 2. nuovo_cliente: everything in one transaction, the link waits for the payment
-- ---------------------------------------------------------------------------
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select is(pg_temp.nuovo('Avvio'), 'in_attesa_pagamento', 'nuovo_cliente: il link nasce in attesa del pagamento');
select is(
  (select row(c.nome, c.cognome, c.email, s.tipo, s.valore_contratto,
              (select count(*) from public.payments p where p.sale_id = s.id and p.stato = 'prevista'))::text
   from public.clients c join public.sales s on s.client_id = c.id where c.id = pg_temp.cliente('Avvio')),
  '(Avvio,Centodieci,avvio@example.test,nuovo,2400.00,3)',
  'il cliente e la vendita «nuovo» col suo piano rate'
);
select is(
  (select row(i.stato, i.slug, i.minorenne, i.attivato_il is null, i.scade_il is null, i.email,
              i.created_by = '11111111-1111-4111-8111-111111111111', i.sale_id = pg_temp.vendita('Avvio'))::text
   from public.onboarding_inviti i where i.id = pg_temp.invito('Avvio')),
  '(in_attesa_pagamento,avvio-centodieci,f,t,t,avvio@example.test,t,t)',
  'l''invito: slug dal nome, email del cliente, nessuna scadenza'
);
select ok(
  (select t.token ~ '^[0-9a-f]{64}$' and i.token_hash = encode(sha256(convert_to(t.token, 'UTF8')), 'hex')
   from public.onboarding_inviti i join public.onboarding_inviti_token t on t.invito_id = i.id
   where i.id = pg_temp.invito('Avvio')),
  'il token ha 64 caratteri esadecimali e l''invito ne tiene solo l''hash'
);
select is(
  (select row(i.coach_id, i.revisore_id, i.responsabile_id)::text from public.onboarding_incarichi i
   where i.client_id = pg_temp.cliente('Avvio')),
  '(44444444-4444-4444-8444-444444444444,33333333-3333-4333-8333-333333333333,11111111-1111-4111-8111-111111111111)',
  'gli incarichi'
);
select is(
  (select username from public.clienti_telegram where client_id = pg_temp.cliente('Avvio')), 'avvio_110',
  'lo username Telegram'
);
select is(
  (select row(p.stato, p.sale_id = pg_temp.vendita('Avvio'),
              (select count(*) from public.onboarding_passi s where s.client_id = p.client_id and s.stato = 'bloccato'))::text
   from public.onboarding_percorsi p where p.client_id = pg_temp.cliente('Avvio')),
  '(in_attesa,t,9)',
  'il percorso in attesa, con i nove step bloccati'
);
select is(
  (select row(p.nome, p.stato, p.responsabile_id is null, p.coach_id is null,
              (select array_agg(m.profile_id order by m.profile_id) from public.pm_membri m where m.progetto_id = p.id),
              (select count(*) from public.pm_task t where t.progetto_id = p.id),
              (select count(*) from public.pm_task t where t.progetto_id = p.id and t.chiave_onboarding is not null),
              (select count(*) from public.pm_task t where t.progetto_id = p.id and t.created_by is not null),
              (select count(*) from public.pm_task_assegnatari a join public.pm_task t on t.id = a.task_id where t.progetto_id = p.id),
              (select array_agg(l.nome || case when l.created_by is null then '' else ' con autore' end)
               from public.pm_tasklist l where l.progetto_id = p.id))::text
   from public.pm_progetti p where p.id = pg_temp.progetto('Avvio')),
  '("Avvio Centodieci",attivo,t,t,,18,10,0,0,{Onboarding})',
  'il progetto del cliente: nessun membro né responsabile, i 10 task dell''onboarding nella lista «Onboarding», senza autore né assegnatari: prima del pagamento nessun incaricato lo vede'
);
select is(pg_temp.eventi('Avvio'), array['avviato team con nome'], 'nel registro l''avvio, col nome dell''admin');
select is(
  (select count(*)::int from public.notifiche where chiave like 'onboarding/' || pg_temp.cliente('Avvio') || '/%'), 0,
  'nessuna notifica finché il pagamento non c''è'
);
select is(
  (select row(invito_stato, percorso_stato, passo_corrente, coach_nome)::text from public.v_onboarding
   where client_id = pg_temp.cliente('Avvio')),
  '(in_attesa_pagamento,in_attesa,benvenuto,"Marco Coach")',
  'v_onboarding lo mostra'
);

-- refusals: nothing is left half done
select throws_ok(
  $$ select pg_temp.nuovo('Rotto', p_coach => '99999999-9999-4999-8999-999999999999') $$,
  '22023', 'Coach, revisore e responsabile devono essere persone attive del team.',
  'un coach che non esiste ferma tutto'
);
select is(
  (select count(*)::int from public.clients where nome = 'Rotto') + (select count(*)::int from pg_temp.casi where nome = 'Rotto'),
  0, 'e non resta né il cliente né la vendita'
);
select throws_ok(
  $$ select pg_temp.nuovo('Rotto', p_coach => 'bc000000-0000-4000-8000-000000000001') $$,
  '22023', 'Coach, revisore e responsabile devono essere persone attive del team.',
  'il business coach non prende un incarico'
);
select throws_ok(
  $$ select pg_temp.nuovo('Rotto', p_responsabile => null) $$,
  '22023', 'Scegli il responsabile dell''onboarding.', 'il responsabile è obbligatorio'
);
select throws_ok(
  $$ select public.nuovo_cliente(
       jsonb_build_object('product_id', (select id from pg_temp.prodotto), 'tipo', 'rinnovo', 'client_id', pg_temp.cliente('Avvio'),
         'data_vendita', public.oggi(), 'data_inizio', public.oggi() + 200, 'valore_contratto', 900, 'numero_rate', 1),
       '{"responsabile":"11111111-1111-4111-8111-111111111111"}'::jsonb) $$,
  '22023', 'L''onboarding parte solo da una vendita a un nuovo cliente.', 'nuovo_cliente non registra un rinnovo'
);
select throws_ok(
  $$ select public.avvia_onboarding(pg_temp.vendita('Avvio'), null, null, '11111111-1111-4111-8111-111111111111', null, null) $$,
  '22023', 'Questo cliente ha già un onboarding avviato.', 'un solo onboarding vivo per cliente'
);

-- ---------------------------------------------------------------------------
-- 3. avvia_onboarding on a sale that exists: already cashed, the link is active at once
-- ---------------------------------------------------------------------------
insert into casi (nome, sale_id, client_id)
select 'Pagato', r.id_vendita, r.id_cliente
from public.registra_vendita((select id from prodotto), 'nuovo', public.oggi(), public.oggi() + 7, 2400, 3,
  p_nome => 'Pagato', p_cognome => 'Centodieci', p_telefono => '+39 3330000110') r;
select pg_temp.incassa('Pagato');
select is(
  (select count(*)::int from public.v_vendite_senza_onboarding where sale_id = pg_temp.vendita('Pagato')), 1,
  'una vendita nuova senza onboarding è nell''elenco dell''admin'
);
select throws_ok(
  $$ select public.avvia_onboarding(pg_temp.vendita('Pagato'), null, null, '11111111-1111-4111-8111-111111111111',
       '{"indirizzo":"Via Roma"}'::jsonb, null) $$,
  '22023', 'Contatti non validi', 'i contatti hanno solo le loro chiavi'
);
select throws_ok(
  $$ select public.avvia_onboarding(pg_temp.vendita('Pagato'), null, null, '11111111-1111-4111-8111-111111111111',
       null, 'no') $$,
  '22023', null, 'uno username Telegram non valido è rifiutato'
);
update casi set invito_id = (
  public.avvia_onboarding(pg_temp.vendita('Pagato'), '44444444-4444-4444-8444-444444444444', null,
    '11111111-1111-4111-8111-111111111111', '{"cognome":"Rinominato","email":" Pagato@Example.TEST "}'::jsonb, null) ->> 'invito_id'
)::uuid
where nome = 'Pagato';
select is(
  (select row(i.stato, i.attivato_da, i.attivato_il is not null, i.slug, i.email)::text
   from public.onboarding_inviti i where i.id = pg_temp.invito('Pagato')),
  '(attivo,pagamento,t,pagato-rinominato,pagato@example.test)',
  'una vendita già incassata: il link nasce attivo, per il pagamento'
);
select is(
  (select row(c.nome, c.cognome, c.email, c.telefono)::text from public.clients c where c.id = pg_temp.cliente('Pagato')),
  '(Pagato,Rinominato,pagato@example.test,"+39 3330000110")',
  'i contatti dati si aggiornano, gli altri restano'
);
select is(
  pg_temp.assegnati('Pagato'),
  array['- 8 task: Marco Coach', 'coach 7 task: Marco Coach', 'responsabile 2 task: Dany Montagnolo', 'revisore 1 task: nessuno'],
  'ogni task alla persona del suo incarico; senza revisore il suo task resta senza nessuno'
);
select is(
  (select count(*)::int from public.v_vendite_senza_onboarding where sale_id = pg_temp.vendita('Pagato')), 0,
  'e la vendita esce dall''elenco'
);

-- ---------------------------------------------------------------------------
-- 4. The gate: the closer cashes the first instalment of his sale
-- ---------------------------------------------------------------------------
select pg_temp.nuovo('Gate');
reset role;
set local request.jwt.claims to '{}';
update public.sales set closer_id = '33333333-3333-4333-8333-333333333333' where id = pg_temp.vendita('Gate');
insert into appunti values ('notifiche_closer', (select count(*)::text from public.notifiche
  where destinatario_id = '33333333-3333-4333-8333-333333333333'));

select pg_temp.web('33333333-3333-4333-8333-333333333333');
select lives_ok($$ select pg_temp.incassa('Gate') $$, 'il closer incassa la prima rata della sua vendita');
select is(
  (select count(*)::int from public.onboarding_inviti) + (select count(*)::int from public.onboarding_eventi)
    + (select count(*)::int from public.v_onboarding),
  0, 'e dell''onboarding non legge niente'
);
select is(
  (select count(*)::text from public.notifiche), (select valore from appunti where chiave = 'notifiche_closer'),
  'né riceve una notifica'
);

select pg_temp.web('11111111-1111-4111-8111-111111111111');
select is(
  (select row(i.stato, i.attivato_da, i.attivato_il is not null, i.scade_il is null)::text
   from public.onboarding_inviti i where i.id = pg_temp.invito('Gate')),
  '(attivo,pagamento,t,t)',
  'il link è attivo, per il pagamento; senza l''area clienti non ha scadenza'
);
select is(
  (select row(p.coach_id, p.responsabile_id,
              (select array_agg(pr.nome order by pr.nome) from public.pm_membri m join public.profiles pr on pr.id = m.profile_id
               where m.progetto_id = p.id))::text
   from public.pm_progetti p where p.id = pg_temp.progetto('Gate')),
  '(44444444-4444-4444-8444-444444444444,11111111-1111-4111-8111-111111111111,"{""Dany Montagnolo"",""Lorenzo Closer"",""Marco Coach""}")',
  'coach e revisore entrano nel progetto, il coach è il coach del progetto'
);
select is(
  pg_temp.assegnati('Gate'),
  array['- 8 task: Marco Coach', 'coach 7 task: Marco Coach', 'responsabile 2 task: Dany Montagnolo', 'revisore 1 task: Lorenzo Closer'],
  'i task: quelli del percorso e del coach al coach, gli altri al responsabile e al revisore'
);
select is(
  pg_temp.eventi('Gate'), array['avviato team con nome', 'link_attivo sistema'],
  'nel registro il link attivo è del sistema: mai il nome di chi ha incassato'
);
select is(
  (select row(n.tipo, n.canale, n.titolo, n.anteprima, n.link, n.corpo_html is null, n.dettagli is null)::text
   from public.notifiche n where n.chiave = 'onboarding/' || pg_temp.cliente('Gate') || '/pagamento/' || pg_temp.invito('Gate')),
  '(onboarding_pagamento,app,"Pagamento confermato per Gate Centodieci","Onboarding pronto: il link si apre con l''area clienti.",/onboarding/'
    || pg_temp.cliente('Gate') || ',t,t)',
  'l''admin riceve la notifica nell''app, senza importi'
);
select pg_temp.incassa('Gate', 2);
select is(
  (select row(count(*), (select array_length(pg_temp.eventi('Gate'), 1)))::text from public.notifiche
   where chiave like 'onboarding/' || pg_temp.cliente('Gate') || '/%'),
  '(1,2)', 'la seconda rata non ripete né la notifica né il registro'
);

-- with the client area open (release B) the link gets its days
reset role;
set local request.jwt.claims to '{}';
update public.onboarding_impostazioni set aperto_ai_clienti = true;
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select pg_temp.nuovo('Aperto');
select pg_temp.incassa('Aperto');
select is(
  (select row(i.stato, i.scade_il - i.attivato_il,
              (select n.anteprima from public.notifiche n where n.chiave like 'onboarding/' || i.client_id || '/%'))::text
   from public.onboarding_inviti i where i.id = pg_temp.invito('Aperto')),
  '(attivo,"14 days","Il link di onboarding è attivo.")',
  'con l''area clienti aperta il link scade dopo 14 giorni dall''attivazione, e la notifica lo dice attivo'
);
reset role;
set local request.jwt.claims to '{}';
update public.onboarding_inviti set scade_il = now() - interval '1 day' where id = pg_temp.invito('Aperto');
update public.onboarding_impostazioni set aperto_ai_clienti = false;
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select is(
  (select invito_stato from public.v_onboarding where client_id = pg_temp.cliente('Aperto')), 'scaduto',
  'un link attivo oltre la sua scadenza si legge scaduto'
);

-- ---------------------------------------------------------------------------
-- 5. «Conferma pagamento»
-- ---------------------------------------------------------------------------
select pg_temp.nuovo('Manuale');
select is(
  public.onboarding_conferma_pagamento(pg_temp.invito('Manuale')) ->> 'stato', 'attivo',
  'l''admin conferma il pagamento a mano: il link è attivo'
);
select is(
  (select row(i.attivato_da, (select count(*) from public.payments p where p.sale_id = i.sale_id and p.stato = 'incassata'))::text
   from public.onboarding_inviti i where i.id = pg_temp.invito('Manuale')),
  '(manuale,0)', 'attivato a mano, e nessun incasso registrato'
);
select is(
  pg_temp.eventi('Manuale'), array['avviato team con nome', 'link_attivo team con nome'],
  'nel registro col nome dell''admin'
);
select throws_ok(
  $$ select public.onboarding_conferma_pagamento(pg_temp.invito('Manuale')) $$,
  '22023', 'Il pagamento si conferma solo per un link in attesa di pagamento.', 'due volte no'
);

-- ---------------------------------------------------------------------------
-- 6. A minor waits for a parent's consent
-- ---------------------------------------------------------------------------
select is(pg_temp.nuovo('Minore', p_minorenne => true), 'in_attesa_pagamento', 'un minorenne: il link in attesa');
select lives_ok($$ select pg_temp.incassa('Minore') $$, 'la sua prima rata si incassa');
select pg_temp.incassa('Minore', 2);
select is(
  (select row(i.stato, i.attivato_il is null, i.attivato_da is null,
              (select count(*) from public.payments p where p.sale_id = i.sale_id and p.stato = 'incassata'))::text
   from public.onboarding_inviti i where i.id = pg_temp.invito('Minore')),
  '(in_attesa_pagamento,t,t,2)', 'ma senza il consenso di un genitore il link resta fermo'
);
select is(
  pg_temp.eventi('Minore'), array['avviato team con nome', 'in_attesa_consenso sistema'],
  'il registro lo dice una volta sola'
);
select is(
  public.onboarding_consenso_genitore(pg_temp.invito('Minore'), '  Madre, al telefono  ') ->> 'stato', 'attivo',
  'registrato il consenso, il link già pagato si attiva'
);
select is(
  (select row(i.attivato_da, i.consenso_genitore_il is not null, i.consenso_genitore_nota)::text
   from public.onboarding_inviti i where i.id = pg_temp.invito('Minore')),
  '(pagamento,t,"Madre, al telefono")', 'per il pagamento, con la nota del consenso'
);
select throws_ok(
  $$ select public.onboarding_consenso_genitore(pg_temp.invito('Minore'), null) $$,
  '22023', 'Il consenso del genitore è già registrato.', 'il consenso si registra una volta'
);
select throws_ok(
  $$ select public.onboarding_consenso_genitore(pg_temp.invito('Manuale'), null) $$,
  '22023', 'Il consenso del genitore si registra solo per un cliente minorenne.', 'e solo per un minorenne'
);

select pg_temp.nuovo('MinoreManuale', p_minorenne => true);
select is(
  public.onboarding_conferma_pagamento(pg_temp.invito('MinoreManuale')) ->> 'stato', 'in_attesa_pagamento',
  'la conferma a mano per un minorenne senza consenso lascia il link fermo'
);
select is(
  public.onboarding_consenso_genitore(pg_temp.invito('MinoreManuale'), null) ->> 'stato', 'attivo',
  'col consenso si attiva, perché il pagamento era già stato confermato'
);
select is(
  (select attivato_da from public.onboarding_inviti where id = pg_temp.invito('MinoreManuale')), 'manuale',
  'a mano'
);

select pg_temp.nuovo('MinoreSenza', p_minorenne => true);
select is(
  public.onboarding_consenso_genitore(pg_temp.invito('MinoreSenza'), null) ->> 'stato', 'in_attesa_pagamento',
  'il consenso da solo non attiva: manca il pagamento'
);
select pg_temp.incassa('MinoreSenza');
select is(pg_temp.stato('MinoreSenza'), 'attivo', 'che poi lo attiva');

-- ---------------------------------------------------------------------------
-- 7. Refunds: a total one revokes, a partial one and a link activated by hand do not
-- ---------------------------------------------------------------------------
select pg_temp.nuovo('Rimborso');
select pg_temp.incassa('Rimborso');
select lives_ok(
  $$ select public.registra_rimborso(pg_temp.rata('Rimborso'), public.oggi(), 100) $$, 'un rimborso parziale'
);
select is(pg_temp.stato('Rimborso'), 'attivo', 'non revoca il link');
select lives_ok(
  $$ select public.registra_rimborso(pg_temp.rata('Rimborso'), public.oggi(), 700) $$, 'il rimborso del resto'
);
select is(
  (select row(i.stato, i.revocato_motivo, i.revocato_il is not null,
              (select p.stato from public.onboarding_percorsi p where p.client_id = i.client_id))::text
   from public.onboarding_inviti i where i.id = pg_temp.invito('Rimborso')),
  '(revocato,"Rimborso totale",t,sospeso)', 'il rimborso totale revoca il link e sospende il percorso'
);
select is(
  (select row(e.attore, e.autore_id is null, e.dettagli ->> 'automatica', e.dettagli ->> 'motivo')::text
   from public.onboarding_eventi e where e.client_id = pg_temp.cliente('Rimborso') and e.tipo = 'link_revocato'),
  '(sistema,t,true,"Rimborso totale")', 'nel registro è una revoca automatica'
);

select pg_temp.nuovo('RimborsoManuale');
select public.onboarding_conferma_pagamento(pg_temp.invito('RimborsoManuale'));
select pg_temp.incassa('RimborsoManuale');
select public.registra_rimborso(pg_temp.rata('RimborsoManuale'), public.oggi(), 800);
select is(pg_temp.stato('RimborsoManuale'), 'attivo', 'un link attivato a mano non si revoca per un rimborso');

-- an undone cash-in never revokes
select pg_temp.nuovo('Annullato');
select pg_temp.incassa('Annullato');
update public.payments set stato = 'prevista', incassato_il = null, importo_incassato = null, metodo = null
where id = pg_temp.rata('Annullato');
select is(pg_temp.stato('Annullato'), 'attivo', 'un incasso annullato non revoca il link');

-- ---------------------------------------------------------------------------
-- 8. The sale deleted or moved
-- ---------------------------------------------------------------------------
select pg_temp.nuovo('Eliminata');
select pg_temp.incassa('Eliminata');
select lives_ok($$ delete from public.sales where id = pg_temp.vendita('Eliminata') $$, 'la vendita si elimina');
select is(
  (select row(i.stato, i.revocato_motivo, i.sale_id is null,
              (select p.stato from public.pm_progetti p where p.client_id = i.client_id),
              (select p.stato from public.onboarding_percorsi p where p.client_id = i.client_id))::text
   from public.onboarding_inviti i where i.id = pg_temp.invito('Eliminata')),
  '(revocato,"Vendita eliminata",t,archiviato,sospeso)',
  'il link è revocato, il progetto archiviato, il percorso sospeso'
);

select pg_temp.nuovo('DuePercorsi');
select pg_temp.incassa('DuePercorsi');
insert into casi (nome, sale_id, client_id)
select 'DuePercorsiRinnovo', r.id_vendita, r.id_cliente
from public.registra_vendita((select id from prodotto), 'rinnovo', public.oggi(), public.oggi() + 200, 900, 1,
  p_client_id => pg_temp.cliente('DuePercorsi')) r;
select pg_temp.incassa('DuePercorsiRinnovo');
delete from public.sales where id = pg_temp.vendita('DuePercorsi');
select is(
  (select row(i.stato, i.sale_id is null, (select p.stato from public.pm_progetti p where p.client_id = i.client_id))::text
   from public.onboarding_inviti i where i.id = pg_temp.invito('DuePercorsi')),
  '(attivo,t,attivo)', 'con un altro percorso incassato il link e il progetto restano'
);

select pg_temp.nuovo('Spostata');
select lives_ok(
  $$ update public.sales set client_id = pg_temp.cliente('Manuale') where id = pg_temp.vendita('Spostata') $$,
  'la vendita si sposta su un altro cliente'
);
select is(
  (select row(i.stato, i.revocato_motivo, i.sale_id is null)::text
   from public.onboarding_inviti i where i.id = pg_temp.invito('Spostata')),
  '(revocato,"Vendita spostata su un altro cliente",t)', 'e il link non usato è revocato'
);

-- ---------------------------------------------------------------------------
-- 9. Revoke, reactivate, regenerate
-- ---------------------------------------------------------------------------
select pg_temp.nuovo('Revoca');
select public.onboarding_conferma_pagamento(pg_temp.invito('Revoca'));
select is(
  public.onboarding_revoca(pg_temp.invito('Revoca'), '  Ha cambiato idea  ') ->> 'stato', 'revocato',
  'l''admin revoca un link'
);
select is(
  (select row(i.revocato_motivo, i.revocato_il is not null, i.attivato_il is not null,
              (select p.stato from public.onboarding_percorsi p where p.client_id = i.client_id))::text
   from public.onboarding_inviti i where i.id = pg_temp.invito('Revoca')),
  '("Ha cambiato idea",t,t,sospeso)', 'col motivo; il percorso è sospeso'
);
select is(
  (select row(e.attore, e.autore_id, e.dettagli ->> 'automatica')::text
   from public.onboarding_eventi e where e.client_id = pg_temp.cliente('Revoca') and e.tipo = 'link_revocato'),
  '(team,11111111-1111-4111-8111-111111111111,false)', 'nel registro col nome dell''admin'
);
select throws_ok(
  $$ select public.onboarding_revoca(pg_temp.invito('Revoca'), null) $$,
  '22023', 'Questo link è già revocato.', 'due volte no'
);
select is(
  public.onboarding_riattiva(pg_temp.invito('Revoca')) ->> 'stato', 'attivo', 'riattivato, torna attivo perché lo era stato'
);
select is(
  (select row(i.attivato_da, i.revocato_il is null, i.revocato_motivo is null,
              (select p.stato from public.onboarding_percorsi p where p.client_id = i.client_id))::text
   from public.onboarding_inviti i where i.id = pg_temp.invito('Revoca')),
  '(manuale,t,t,in_attesa)', 'senza più revoca, e il percorso torna in attesa'
);
select is(
  pg_temp.eventi('Revoca'),
  array['avviato team con nome', 'link_attivo team con nome', 'link_revocato team con nome', 'link_riattivato team con nome'],
  'tutto nel registro'
);
select throws_ok(
  $$ select public.onboarding_riattiva(pg_temp.invito('Revoca')) $$,
  '22023', 'Si riattiva solo un link revocato.', 'si riattiva solo un link revocato'
);

select pg_temp.nuovo('RevocaAttesa');
select public.onboarding_revoca(pg_temp.invito('RevocaAttesa'), null);
select is(
  public.onboarding_riattiva(pg_temp.invito('RevocaAttesa')) ->> 'stato', 'in_attesa_pagamento',
  'un link revocato prima del pagamento torna in attesa del pagamento'
);

-- regenerate: a new token on the same invite
insert into appunti select 'token_revoca', token from public.onboarding_inviti_token where invito_id = pg_temp.invito('Revoca');
select is(
  public.onboarding_rigenera_link(pg_temp.invito('Revoca')) ->> 'stato', 'attivo', 'il link si rigenera e resta attivo'
);
select ok(
  (select count(*) = 1
      and bool_and(t.token <> (select valore from appunti where chiave = 'token_revoca'))
      and bool_and(i.token_hash = encode(sha256(convert_to(t.token, 'UTF8')), 'hex'))
   from public.onboarding_inviti_token t join public.onboarding_inviti i on i.id = t.invito_id
   where t.invito_id = pg_temp.invito('Revoca')),
  'un token nuovo, il suo hash sull''invito, e quello di prima non c''è più'
);
select is(
  (pg_temp.eventi('Revoca'))[5], 'link_rigenerato team con nome', 'nel registro'
);
select is(
  public.onboarding_rigenera_link(pg_temp.invito('Rimborso')) ->> 'stato', 'in_attesa_pagamento',
  'rigenerato, un link revocato per rimborso torna in attesa: il pagamento non c''è più'
);
select is(
  (select row(i.attivato_il is null, i.attivato_da is null, i.revocato_il is null)::text
   from public.onboarding_inviti i where i.id = pg_temp.invito('Rimborso')),
  '(t,t,t)', 'pulito'
);
select public.onboarding_revoca(pg_temp.invito('Manuale'), null);
select is(
  public.onboarding_rigenera_link(pg_temp.invito('Manuale')) ->> 'stato', 'attivo',
  'uno confermato a mano torna attivo'
);
reset role;
set local request.jwt.claims to '{}';
update public.onboarding_inviti set stato = 'usato' where id = pg_temp.invito('Annullato');
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select throws_ok(
  $$ select public.onboarding_rigenera_link(pg_temp.invito('Annullato')) $$,
  '22023', 'Il link è già stato usato: non si rigenera.', 'un link usato non si rigenera'
);

-- ---------------------------------------------------------------------------
-- 10. «Scegli il coach» leaves the onboarding tasks alone
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ select public.pm_scegli_coach(pg_temp.progetto('Gate'), '55555555-5555-4555-8555-555555555555') $$,
  '«Scegli il coach» sul progetto di un cliente in onboarding'
);
select is(
  pg_temp.assegnati('Gate'),
  array['- 8 task: Sara Editor', 'coach 7 task: Marco Coach', 'responsabile 2 task: Dany Montagnolo', 'revisore 1 task: Lorenzo Closer'],
  'i task del percorso passano al nuovo coach del progetto, quelli dell''onboarding restano agli incaricati'
);
select is(
  (select coach_id from public.onboarding_incarichi where client_id = pg_temp.cliente('Gate')),
  '44444444-4444-4444-8444-444444444444'::uuid,
  'e l''incarico non segue il coach del progetto'
);

-- ---------------------------------------------------------------------------
-- 11. The people in charge change
-- ---------------------------------------------------------------------------
select is(
  public.onboarding_imposta_incarichi(pg_temp.cliente('Gate'), '99999999-9999-4999-8999-99999999a110', null,
    '22222222-2222-4222-8222-222222222222') ->> 'client_id',
  pg_temp.cliente('Gate')::text, 'l''admin cambia gli incarichi di un cliente col link attivo'
);
select is(
  pg_temp.assegnati('Gate'),
  array['- 8 task: Aldo Centodieci', 'coach 7 task: Aldo Centodieci', 'responsabile 2 task: Loris Setter', 'revisore 1 task: nessuno'],
  'i task seguono: chi aveva un incarico li lascia, chi lo prende li riceve'
);
select is(
  (select row(p.coach_id, p.responsabile_id)::text from public.pm_progetti p where p.id = pg_temp.progetto('Gate')),
  '(99999999-9999-4999-8999-99999999a110,22222222-2222-4222-8222-222222222222)',
  'e così il coach e il responsabile del progetto'
);
select is(
  (pg_temp.eventi('Gate'))[3], 'incarichi_modificati team con nome', 'nel registro, senza dire chi sono'
);
select public.onboarding_imposta_incarichi(pg_temp.cliente('Avvio'), '99999999-9999-4999-8999-99999999a110', null,
  '22222222-2222-4222-8222-222222222222');
select is(
  (select row(p.responsabile_id, p.coach_id is null,
              (select count(*) from public.pm_membri m where m.progetto_id = p.id and m.profile_id = '99999999-9999-4999-8999-99999999a110'))::text
   from public.pm_progetti p where p.id = pg_temp.progetto('Avvio')),
  '(,t,0)',
  'prima del pagamento il progetto non cambia: né il responsabile né il coach'
);
select throws_ok(
  $$ select public.onboarding_imposta_incarichi((select client_id from public.sales
       where client_id not in (select client_id from public.onboarding_percorsi) limit 1), null, null,
       '11111111-1111-4111-8111-111111111111') $$,
  '22023', 'Questo cliente non ha un onboarding.', 'solo per un cliente in onboarding'
);

-- the coach who is also the responsible: before the payment he does not see the project, which would tell
-- him the client has not paid; with the payment he does
select pg_temp.nuovo('CoachResp', p_responsabile => '44444444-4444-4444-8444-444444444444');
select pg_temp.web('44444444-4444-4444-8444-444444444444');
select is(
  (select count(*)::int from public.pm_progetti where client_id = pg_temp.cliente('CoachResp'))
    + (select count(*)::int from public.onboarding_incarichi where client_id = pg_temp.cliente('CoachResp')),
  0, 'il coach responsabile, prima del pagamento, non vede né il progetto né il suo incarico'
);
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select pg_temp.incassa('CoachResp');
select pg_temp.web('44444444-4444-4444-8444-444444444444');
select is(
  (select count(*)::int from public.pm_progetti where client_id = pg_temp.cliente('CoachResp')), 1,
  'col pagamento entra nel progetto'
);
select pg_temp.web('11111111-1111-4111-8111-111111111111');

-- revoked, the coach changed, reactivated: the tasks go to the new coach only
select pg_temp.nuovo('CambioCoach');
select public.onboarding_conferma_pagamento(pg_temp.invito('CambioCoach'));
select public.onboarding_revoca(pg_temp.invito('CambioCoach'), null);
select public.onboarding_imposta_incarichi(pg_temp.cliente('CambioCoach'), '55555555-5555-4555-8555-555555555555',
  '33333333-3333-4333-8333-333333333333', '11111111-1111-4111-8111-111111111111');
select public.onboarding_riattiva(pg_temp.invito('CambioCoach'));
select is(
  (pg_temp.assegnati('CambioCoach'))[2], 'coach 7 task: Sara Editor',
  'riattivato dopo il cambio, i task del coach sono solo del nuovo: quello di prima li lascia'
);

-- a project archived by hand stays archived while the people change before the payment; the payment opens it
select pg_temp.nuovo('Archiviato');
reset role;
set local request.jwt.claims to '{}';
update public.pm_progetti set stato = 'archiviato' where id = pg_temp.progetto('Archiviato');
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select public.onboarding_imposta_incarichi(pg_temp.cliente('Archiviato'), null, null, '22222222-2222-4222-8222-222222222222');
select is(
  (select stato from public.pm_progetti where id = pg_temp.progetto('Archiviato')), 'archiviato',
  'cambiare gli incarichi prima del pagamento non riapre un progetto archiviato'
);

-- never a direct write on the link, not even by the admin: only his functions, with the log
select throws_ok(
  $$ update public.onboarding_inviti set stato = 'attivo', attivato_da = 'pagamento' where id = pg_temp.invito('Archiviato') $$,
  '42501', 'Il link si cambia solo dalle azioni dell''onboarding.',
  'l''admin non attiva un link con un update diretto'
);
select throws_ok(
  $$ update public.onboarding_inviti set minorenne = true where id = pg_temp.invito('Archiviato') $$,
  '42501', null, 'né cambia minorenne, vendita o cliente: colonne che una sessione non scrive'
);
select public.onboarding_conferma_pagamento(pg_temp.invito('Archiviato'));
select is(
  (select stato from public.pm_progetti where id = pg_temp.progetto('Archiviato')), 'attivo',
  'il pagamento confermato lo riapre'
);

-- an emptied Telegram username is taken away
insert into casi (nome, sale_id, client_id)
select 'Telegram', r.id_vendita, r.id_cliente
from public.registra_vendita((select id from prodotto), 'nuovo', public.oggi(), public.oggi() + 7, 900, 1,
  p_nome => 'Telegram', p_cognome => 'Centodieci') r;
insert into public.clienti_telegram (client_id, username) values (pg_temp.cliente('Telegram'), 'vecchio_110');
select public.avvia_onboarding(pg_temp.vendita('Telegram'), null, null, '11111111-1111-4111-8111-111111111111',
  null, '', false);
select is(
  (select username from public.clienti_telegram where client_id = pg_temp.cliente('Telegram')), null,
  'uno username svuotato si toglie'
);

-- a person merged into another, then deleted: the incarichi follow, nothing fails
reset role;
set local request.jwt.claims to '{}';
update public.onboarding_impostazioni set coach_predefinito_id = '99999999-9999-4999-8999-99999999a110';
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select lives_ok(
  $$ select public.unisci_profili('99999999-9999-4999-8999-99999999a110', '99999999-9999-4999-8999-99999999b110') $$,
  'unisci_profili con un incaricato'
);
select is(
  (select row(i.coach_id, p.coach_id)::text
   from public.onboarding_incarichi i join public.pm_progetti p on p.client_id = i.client_id
   where i.client_id = pg_temp.cliente('Gate')),
  '(99999999-9999-4999-8999-99999999b110,99999999-9999-4999-8999-99999999b110)',
  'l''incarico e il coach del progetto passano al profilo di destinazione'
);
select is(
  (pg_temp.assegnati('Gate'))[1:2], array['- 8 task: Bruno Centodieci', 'coach 7 task: Bruno Centodieci'],
  'coi suoi task'
);
select is(
  (select coach_predefinito_id from public.onboarding_impostazioni), '99999999-9999-4999-8999-99999999b110'::uuid,
  'e anche il coach predefinito delle impostazioni'
);
select lives_ok(
  $$ select public.elimina_persona('99999999-9999-4999-8999-99999999b110') $$, 'elimina_persona con un incaricato'
);
select is(
  (select row(i.coach_id is null, i.responsabile_id)::text from public.onboarding_incarichi i
   where i.client_id = pg_temp.cliente('Gate')),
  '(t,22222222-2222-4222-8222-222222222222)', 'l''incarico resta vuoto, gli altri come sono'
);
select is(
  (select coach_predefinito_id from public.onboarding_impostazioni), null::uuid,
  'e il coach predefinito pure'
);

-- ---------------------------------------------------------------------------
-- 12. A renewal never reopens an onboarding task
-- ---------------------------------------------------------------------------
select pg_temp.nuovo('Rinnovo');
select pg_temp.incassa('Rinnovo');
update public.pm_task set stato = 'completato'
where progetto_id = pg_temp.progetto('Rinnovo') and (chiave_onboarding = 'call_onboarding' or titolo = 'Call di check');
insert into casi (nome, sale_id, client_id)
select 'RinnovoDopo', r.id_vendita, r.id_cliente
from public.registra_vendita((select id from prodotto), 'rinnovo', public.oggi(), public.oggi() + 200, 900, 1,
  p_client_id => pg_temp.cliente('Rinnovo')) r;
select pg_temp.incassa('RinnovoDopo');
select is(
  (select array_agg(coalesce(t.chiave_onboarding, t.titolo) || ' ' || t.stato order by t.titolo, t.chiave_onboarding nulls first)
   from public.pm_task t
   where t.progetto_id = pg_temp.progetto('Rinnovo') and (t.chiave_onboarding = 'call_onboarding' or t.titolo = 'Call di check')),
  array['Call di check da_fare', 'call_onboarding completato'],
  'al rinnovo il task del percorso si riapre, quello dell''onboarding no'
);

-- ---------------------------------------------------------------------------
-- 13. Who else: nobody but the admin, and never Claude
-- ---------------------------------------------------------------------------
select pg_temp.web('22222222-2222-4222-8222-222222222222');
select is(pg_temp.rpc_onboarding('Avvio'), '42501 42501 42501 42501 42501 42501 42501 42501', 'il setter: ogni funzione 42501');
select pg_temp.web('33333333-3333-4333-8333-333333333333');
select is(pg_temp.rpc_onboarding('Avvio'), '42501 42501 42501 42501 42501 42501 42501 42501', 'il closer: ogni funzione 42501');
select is((select count(*)::int from public.v_vendite_senza_onboarding), 0, 'e l''elenco delle vendite senza onboarding non è suo');
select pg_temp.web('44444444-4444-4444-8444-444444444444');
select is(pg_temp.rpc_onboarding('Avvio'), '42501 42501 42501 42501 42501 42501 42501 42501', 'il coach incaricato: ogni funzione 42501');
select pg_temp.web('bc000000-0000-4000-8000-000000000001');
select is(pg_temp.rpc_onboarding('Avvio'), '42501 42501 42501 42501 42501 42501 42501 42501', 'il business coach: ogni funzione 42501');
select pg_temp.claude_dentro();
select ok(public.is_admin(), 'il token di Claude dell''admin, dentro una richiesta ammessa, è l''admin');
select is(pg_temp.rpc_onboarding('Avvio'), '42501 42501 42501 42501 42501 42501 42501 42501', 'eppure ogni funzione gli risponde 42501');
-- but an instalment cashed from Claude (the admin's own tool, phase 3) opens the gate like any other
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select pg_temp.nuovo('DaClaude');
select pg_temp.claude_dentro();
select lives_ok($$ select pg_temp.incassa('DaClaude') $$, 'una rata incassata da Claude dell''admin');
select is((select count(*)::int from public.onboarding_inviti), 0, 'Claude non legge l''invito nemmeno adesso');
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select is(
  (select row(i.stato, i.attivato_da)::text from public.onboarding_inviti i where i.id = pg_temp.invito('DaClaude')),
  '(attivo,pagamento)', 'eppure il link si è attivato: il cancello vale da ogni strada'
);

-- ---------------------------------------------------------------------------
-- 14. A cash-in, a refund and a deletion never fail because of the onboarding
-- ---------------------------------------------------------------------------
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select pg_temp.nuovo('Fragile');
select pg_temp.nuovo('FragileDue');
select pg_temp.incassa('FragileDue');
reset role;
set local request.jwt.claims to '{}';
-- the onboarding breaks: no link can turn active nor be revoked any more
alter table public.onboarding_inviti
  add constraint prova_110 check (
    not (stato = 'attivo' and slug = 'fragile-centodieci') and not (stato = 'revocato' and slug = 'fragiledue-centodieci')
  ) not valid;
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select lives_ok($$ select pg_temp.incassa('Fragile') $$, 'con l''onboarding rotto la rata si incassa lo stesso');
select is(
  (select row(p.stato, pg_temp.stato('Fragile'))::text from public.payments p where p.id = pg_temp.rata('Fragile')),
  '(incassata,in_attesa_pagamento)', 'la rata è incassata, il link è rimasto com''era'
);
select lives_ok(
  $$ select public.registra_rimborso(pg_temp.rata('FragileDue'), public.oggi(), 800) $$, 'il rimborso totale si registra lo stesso'
);
select is(
  (select row(count(*), pg_temp.stato('FragileDue'))::text from public.payments p
   where p.sale_id = pg_temp.vendita('FragileDue') and p.stato = 'rimborsata'),
  '(1,attivo)', 'il rimborso c''è, il link è rimasto com''era'
);
select lives_ok($$ delete from public.sales where id = pg_temp.vendita('FragileDue') $$, 'e la vendita si elimina lo stesso');
select is(
  (select count(*)::int from public.sales where id = pg_temp.vendita('FragileDue')), 0, 'eliminata'
);
reset role;
set local request.jwt.claims to '{}';
alter table public.onboarding_inviti drop constraint prova_110;

-- ---------------------------------------------------------------------------
-- 15. Deleting the client, and the backup
-- ---------------------------------------------------------------------------
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select is(
  array[
    public.anteprima_eliminazione('cliente', pg_temp.cliente('Revoca')) ->> 'onboarding',
    public.anteprima_eliminazione('cliente', (select client_id from public.sales
      where client_id not in (select client_id from public.onboarding_percorsi) limit 1)) ->> 'onboarding'
  ],
  array['true', 'false'],
  'la domanda prima di eliminare un cliente dice se ha un onboarding'
);
insert into appunti values ('progetto_revoca', pg_temp.progetto('Revoca')::text);
select lives_ok($$ select public.elimina_cliente(pg_temp.cliente('Revoca')) $$, 'un cliente in onboarding si elimina');
select is(
  (select stato from public.pm_progetti where id = (select valore from appunti where chiave = 'progetto_revoca')::uuid),
  'attivo', 'il suo progetto resta com''era, senza cliente: non si archivia'
);
reset role;
set local request.jwt.claims to '{}';
select is(
  (select count(*) from public.onboarding_inviti where client_id = pg_temp.cliente('Revoca'))
    + (select count(*) from public.onboarding_inviti_token where invito_id = pg_temp.invito('Revoca'))
    + (select count(*) from public.onboarding_percorsi where client_id = pg_temp.cliente('Revoca'))
    + (select count(*) from public.onboarding_passi where client_id = pg_temp.cliente('Revoca'))
    + (select count(*) from public.onboarding_eventi where client_id = pg_temp.cliente('Revoca'))
    + (select count(*) from public.onboarding_incarichi where client_id = pg_temp.cliente('Revoca'))
    + (select count(*) from public.clienti_telegram where client_id = pg_temp.cliente('Revoca')),
  0::bigint, 'e il suo onboarding va via con lui'
);
select ok(
  (select b ? 'onboarding_inviti' and b ? 'onboarding_percorsi' and b ? 'onboarding_incarichi' and b ? 'clienti_telegram'
      and not b ? 'onboarding_inviti_token'
   from (select public.backup_completo() as b) x),
  'il backup ha gli inviti, i percorsi, gli incarichi e Telegram, mai i token'
);

-- ---------------------------------------------------------------------------
-- 16. The test invite (1.79.0, 20261109090000_clienti_account.sql) and the token in clear gone at the use
-- ---------------------------------------------------------------------------
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select pg_temp.nuovo('Prova');
select throws_ok(
  $$ update public.onboarding_inviti set prova = true where id = pg_temp.invito('Prova') $$,
  '42501', 'Il link si cambia solo dalle azioni dell''onboarding.', 'un PATCH diretto di prova è rifiutato'
);
select is(public.onboarding_segna_prova(pg_temp.invito('Prova'), true) ->> 'prova', 'true',
  'onboarding_segna_prova: l''admin segna il cliente di prova');
select is((select scade_il from public.onboarding_inviti where id = pg_temp.invito('Prova')), null,
  'in attesa del pagamento i giorni del link non partono');
select public.onboarding_conferma_pagamento(pg_temp.invito('Prova'));
select ok(
  (select scade_il between now() + interval '13 days' and now() + interval '15 days'
   from public.onboarding_inviti where id = pg_temp.invito('Prova')),
  'attivo e di prova: i 14 giorni partono anche con l''area clienti chiusa'
);
select pg_temp.nuovo('ProvaDopo');
select public.onboarding_conferma_pagamento(pg_temp.invito('ProvaDopo'));
select is((select scade_il from public.onboarding_inviti where id = pg_temp.invito('ProvaDopo')), null,
  'attivo, non di prova, area chiusa: nessuna scadenza');
select public.onboarding_segna_prova(pg_temp.invito('ProvaDopo'), true);
select ok(
  (select scade_il between now() + interval '13 days' and now() + interval '15 days'
   from public.onboarding_inviti where id = pg_temp.invito('ProvaDopo')),
  'segnato di prova da attivo: la scadenza si scrive adesso'
);
select is(
  (select autore_id from public.onboarding_eventi where client_id = pg_temp.cliente('ProvaDopo') and tipo = 'prova'),
  '11111111-1111-4111-8111-111111111111'::uuid, 'il registro dice chi l''ha segnato'
);
select pg_temp.web('22222222-2222-4222-8222-222222222222');
select throws_ok($$ select public.onboarding_segna_prova(pg_temp.invito('ProvaDopo'), false) $$, '42501', null,
  'il setter non segna un cliente di prova');
select pg_temp.claude_dentro();
select throws_ok($$ select public.onboarding_segna_prova(pg_temp.invito('ProvaDopo'), false) $$, '42501', null,
  'nemmeno il token di Claude dell''admin, dentro una richiesta ammessa');
reset role;
set local request.jwt.claims to '{}';
update public.onboarding_inviti set stato = 'usato' where id = pg_temp.invito('Prova');
select is((select count(*)::int from public.onboarding_inviti_token where invito_id = pg_temp.invito('Prova')), 0,
  'usato: il token in chiaro non c''è più');
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select throws_ok($$ select public.onboarding_segna_prova(pg_temp.invito('Prova'), false) $$, '22023',
  'Il cliente è già registrato.', 'un invito usato non cambia');
reset role;
set local request.jwt.claims to '{}';

select * from finish();
rollback;
