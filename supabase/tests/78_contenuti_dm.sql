-- I lead per post (1.35.0, Dany 10/10/2026: «incrocia lo status dei lead che
-- stanno arrivando»): for each of Dany's posts and arrival day, how many lead
-- chats arrived from it, how many in target, how many with a call in the app,
-- how many attributed by code. Numbers only. Admin, video editor and marketing
-- read them; no session writes them; the Insight (service role) rewrites only
-- the last 30 days, never a day before the chats it has (storico_dal); older
-- days are final and stay in the backup. The days counted after they were
-- over (instagram_contenuti_dm_giorni, asked by the reel analysis, 1.36.0):
-- from greatest(storico_dal, today - 13) to yesterday, never today.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(60);

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

-- People: a deactivated marketing account, nutrizione and dev
insert into public.invites (email, ruolo) values
  ('marketing78@alpha.test', 'marketing'),
  ('nutrizione78@alpha.test', 'nutrizione'),
  ('dev78@alpha.test', 'dev');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999990078',
   'authenticated', 'authenticated', 'marketing78@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Marco Settantotto"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999990178',
   'authenticated', 'authenticated', 'nutrizione78@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Nora Settantotto"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999990278',
   'authenticated', 'authenticated', 'dev78@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Dino Settantotto"}'::jsonb, now(), now(), '', '', '', '');
update public.profiles set attivo = false where id = '99999999-9999-4999-8999-999999990078';

-- A post of the test, with its counts (as postgres: the service role's place)
insert into public.instagram_contenuti (media_id, shortcode, permalink, media_type, reel, pubblicato_il) values
  ('7800000000000001', 'T78Post01', 'https://www.instagram.com/reel/T78Post01/', 'VIDEO', true, now() - interval '3 days');
insert into public.instagram_contenuti_dm (shortcode, giorno, dm, lead_in_target, call_prenotate, dm_certi) values
  ('T78Post01', public.oggi() - 2, 2, 1, 1, 1),
  ('SeedDemo01', public.oggi() - 40, 7, 3, 1, 2);
update public.insight_impostazioni set storico_dal = null where id;
-- a counted day long ago, so "0 rows" below means RLS
insert into public.instagram_contenuti_dm_giorni (giorno, created_at) values (public.oggi() - 60, now() - interval '60 days');

create temp table viste (persona text, righe bigint, errore text, giorni bigint) on commit drop;
grant select, insert on viste to authenticated, anon;
create or replace function pg_temp.conta(p_persona text)
returns void
language plpgsql
as $$
declare
  n bigint;
  g bigint;
begin
  select count(*) into n from public.instagram_contenuti_dm;
  select count(*) into g from public.instagram_contenuti_dm_giorni;
  insert into pg_temp.viste values (p_persona, n, null, g);
exception when others then
  insert into pg_temp.viste values (p_persona, null, sqlstate, null);
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Schema: numbers only
-- ---------------------------------------------------------------------------
select has_table('public', 'instagram_contenuti_dm', 'i lead per post hanno la loro tabella');
select columns_are('public', 'instagram_contenuti_dm',
  array['shortcode', 'giorno', 'dm', 'lead_in_target', 'call_prenotate', 'dm_certi', 'calcolato_il'],
  'solo il post, il giorno, i numeri e quando sono stati calcolati: nessun nome, handle, testo, ora o persona');
select col_is_pk('public', 'instagram_contenuti_dm', array['shortcode', 'giorno'], 'una riga per post e giorno');
select fk_ok('public', 'instagram_contenuti_dm', 'shortcode', 'public', 'instagram_contenuti', 'shortcode',
  'ogni riga è di un post di Instagram');
select has_index('public', 'instagram_contenuti_dm', 'instagram_contenuti_dm_giorno_idx', 'giorno', 'l''indice sul giorno');
select ok((select relrowsecurity from pg_class where oid = 'public.instagram_contenuti_dm'::regclass), 'RLS attiva');
-- instagram_contenuti_dm_mai_da_oauth: Claude connected through the MCP server (1.34.0) never reads
-- them, though vede_marketing() is true for an admin, editor or marketing token (76_insight_dati.sql)
select policies_are('public', 'instagram_contenuti_dm',
  array['instagram_contenuti_dm_lettura', 'instagram_contenuti_dm_mai_da_oauth'], 'solo la lettura');
select is(
  (select count(*)::integer from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public' and table_name = 'instagram_contenuti_dm'),
  0,
  'anon non ha nessun permesso'
);
select ok(
  (select bool_and(not has_table_privilege('authenticated', 'public.instagram_contenuti_dm', p))
   from unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as p),
  'nessuna sessione la scrive'
);
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""'] from pg_proc p
   where p.oid = 'public.instagram_contenuti_dm_salva(jsonb, boolean)'::regprocedure),
  'la funzione che la scrive è security definer con search_path vuoto'
);
select ok(
  not has_function_privilege('anon', 'public.instagram_contenuti_dm_salva(jsonb, boolean)', 'execute')
  and not has_function_privilege('authenticated', 'public.instagram_contenuti_dm_salva(jsonb, boolean)', 'execute')
  and has_function_privilege('service_role', 'public.instagram_contenuti_dm_salva(jsonb, boolean)', 'execute'),
  'e la chiama solo il service role'
);

-- the counted days: a day and when it was marked, nothing else
select has_table('public', 'instagram_contenuti_dm_giorni', 'i giorni contati hanno la loro tabella');
select columns_are('public', 'instagram_contenuti_dm_giorni', array['giorno', 'created_at'],
  'solo il giorno e quando è stato segnato: niente di una persona');
select col_is_pk('public', 'instagram_contenuti_dm_giorni', 'giorno', 'una riga per giorno');
select ok((select relrowsecurity from pg_class where oid = 'public.instagram_contenuti_dm_giorni'::regclass),
  'RLS attiva sui giorni contati');
select policies_are('public', 'instagram_contenuti_dm_giorni',
  array['instagram_contenuti_dm_giorni_lettura', 'instagram_contenuti_dm_giorni_mai_da_oauth'],
  'i giorni contati: solo la lettura');
select is(
  (select count(*)::integer from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public' and table_name = 'instagram_contenuti_dm_giorni'),
  0,
  'anon non ha nessun permesso sui giorni contati'
);
select ok(
  (select bool_and(not has_table_privilege('authenticated', 'public.instagram_contenuti_dm_giorni', p))
   from unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as p),
  'nessuna sessione li scrive'
);

-- ---------------------------------------------------------------------------
-- 2. Who reads: admin, video editor and marketing, active
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
do $$ begin perform pg_temp.conta('admin'); end $$;
set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
do $$ begin perform pg_temp.conta('editor'); end $$;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
do $$ begin perform pg_temp.conta('marketing'); end $$;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
do $$ begin perform pg_temp.conta('setter'); end $$;
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
do $$ begin perform pg_temp.conta('closer'); end $$;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
do $$ begin perform pg_temp.conta('coach'); end $$;
set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999990178","role":"authenticated"}';
do $$ begin perform pg_temp.conta('nutrizione'); end $$;
set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999990278","role":"authenticated"}';
do $$ begin perform pg_temp.conta('dev'); end $$;
set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999990078","role":"authenticated"}';
do $$ begin perform pg_temp.conta('marketing_spento'); end $$;
reset role;
set local request.jwt.claims to '{}';
set local role anon;
do $$ begin perform pg_temp.conta('anon'); end $$;
reset role;

select is(
  (select array_agg(persona order by persona) from viste where righe > 0),
  array['admin', 'editor', 'marketing'],
  'i lead per post li leggono l''admin, il video editor e il marketing'
);
select is(
  (select array_agg(persona order by persona) from viste where righe = 0),
  array['closer', 'coach', 'dev', 'marketing_spento', 'nutrizione', 'setter'],
  'setter, closer, coach, nutrizione, sviluppo e un account disattivato non vedono niente'
);
select is((select errore from viste where persona = 'anon'), '42501', 'anon nemmeno');
select is(
  (select array_agg(persona order by persona) from viste where giorni > 0),
  array['admin', 'editor', 'marketing'],
  'i giorni contati li leggono gli stessi'
);
select is(
  (select array_agg(persona order by persona) from viste where giorni = 0),
  array['closer', 'coach', 'dev', 'marketing_spento', 'nutrizione', 'setter'],
  'e gli altri no'
);
select is(
  (select righe from viste where persona = 'marketing'),
  (select count(*) from public.instagram_contenuti_dm),
  'chi li legge li legge tutti'
);

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok(
  $$ insert into public.instagram_contenuti_dm (shortcode, giorno, dm, lead_in_target, call_prenotate, dm_certi)
     values ('T78Post01', public.oggi() - 1, 1, 0, 0, 0) $$,
  '42501', null,
  'l''admin non scrive un conteggio a mano'
);
select throws_ok($$ update public.instagram_contenuti_dm set dm = 9 $$, '42501', null, 'né lo cambia');
select throws_ok($$ delete from public.instagram_contenuti_dm $$, '42501', null, 'né lo cancella');
select throws_ok(
  $$ insert into public.instagram_contenuti_dm_giorni (giorno) values (public.oggi() - 1) $$,
  '42501', null,
  'né segna contato un giorno'
);
select throws_ok(
  $$ select public.instagram_contenuti_dm_salva('[]') $$,
  '42501', null,
  'né chiama la funzione del giro'
);
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select throws_ok(
  $$ insert into public.instagram_contenuti_dm (shortcode, giorno, dm, lead_in_target, call_prenotate, dm_certi)
     values ('T78Post01', public.oggi() - 1, 1, 0, 0, 0) $$,
  '42501', null,
  'il marketing nemmeno'
);
reset role;
set local request.jwt.claims to '{}';

-- ---------------------------------------------------------------------------
-- 3. The checks
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.instagram_contenuti_dm (shortcode, giorno, dm, lead_in_target, call_prenotate, dm_certi)
     values ('T78Post01', public.oggi() - 3, 2, 3, 0, 0) $$,
  '23514', null,
  'più lead in target che DM no'
);
select throws_ok(
  $$ insert into public.instagram_contenuti_dm (shortcode, giorno, dm, lead_in_target, call_prenotate, dm_certi)
     values ('T78Post01', public.oggi() - 3, 2, 0, 3, 0) $$,
  '23514', null,
  'più call che DM no'
);
select throws_ok(
  $$ insert into public.instagram_contenuti_dm (shortcode, giorno, dm, lead_in_target, call_prenotate, dm_certi)
     values ('T78Post01', public.oggi() - 3, 2, 0, 0, 3) $$,
  '23514', null,
  'più DM certi che DM no'
);
select throws_ok(
  $$ insert into public.instagram_contenuti_dm (shortcode, giorno, dm, lead_in_target, call_prenotate, dm_certi)
     values ('T78Post01', public.oggi() - 3, 0, 0, 0, 0) $$,
  '23514', null,
  'una riga senza DM no'
);
select throws_ok(
  $$ insert into public.instagram_contenuti_dm (shortcode, giorno, dm, lead_in_target, call_prenotate, dm_certi)
     values ('NonEsiste78', public.oggi() - 3, 1, 0, 0, 0) $$,
  '23503', null,
  'un post che non è tra quelli di Dany no'
);

-- ---------------------------------------------------------------------------
-- 4. instagram_contenuti_dm_salva(): the last 30 days, never before storico_dal
-- ---------------------------------------------------------------------------
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select throws_ok($$ select public.instagram_contenuti_dm_salva('{"a":1}') $$, '22023', 'Le righe sono un elenco.',
  'le righe sono un elenco');
select is(
  public.instagram_contenuti_dm_salva(jsonb_build_array(
    jsonb_build_object('shortcode', 'SeedDemo01', 'giorno', public.oggi() - 40, 'dm', 1, 'lead_in_target', 0, 'call_prenotate', 0, 'dm_certi', 0),
    jsonb_build_object('shortcode', 'SeedDemo01', 'giorno', public.oggi() - 29, 'dm', 4, 'lead_in_target', 2, 'call_prenotate', 1, 'dm_certi', 3),
    jsonb_build_object('shortcode', 'SeedDemo01', 'giorno', public.oggi() - 2, 'dm', 3, 'lead_in_target', 1, 'call_prenotate', 0, 'dm_certi', 1),
    jsonb_build_object('shortcode', 'SeedDemo01', 'giorno', public.oggi() - 2, 'dm', 9, 'lead_in_target', 9, 'call_prenotate', 9, 'dm_certi', 9),
    jsonb_build_object('shortcode', 'NonEsiste78', 'giorno', public.oggi() - 2, 'dm', 1, 'lead_in_target', 0, 'call_prenotate', 0, 'dm_certi', 0),
    jsonb_build_object('shortcode', 'SeedPost02', 'giorno', public.oggi() + 1, 'dm', 1, 'lead_in_target', 0, 'call_prenotate', 0, 'dm_certi', 0))),
  2,
  'scrive solo i giorni degli ultimi 30 e i post che ci sono, una riga per post e giorno'
);
reset role;
select is(
  (select array_agg(row(shortcode, public.oggi() - giorno, dm, lead_in_target, call_prenotate, dm_certi)::text
                    order by shortcode, giorno)
   from public.instagram_contenuti_dm
   where shortcode in ('SeedDemo01', 'SeedPost02', 'T78Post01')),
  array[row('SeedDemo01', 40, 7, 3, 1, 2)::text,
        row('SeedDemo01', 29, 4, 2, 1, 3)::text,
        row('SeedDemo01', 2, 3, 1, 0, 1)::text],
  'i giorni nella finestra si riscrivono tutti (anche quelli di altri post), quelli prima restano com''erano'
);
select is((select count(*)::integer from public.instagram_contenuti_dm where giorno > public.oggi()), 0,
  'nessun giorno nel futuro');
select is((select count(*)::integer from public.instagram_contenuti_dm where shortcode = 'NonEsiste78'), 0,
  'nessun post sconosciuto');
-- without storico_dal the window starts 29 days ago, but only the 14 days the
-- Insight re-reads after a pause are counted, and never today (half-read)
select is(
  (select array_agg(public.oggi() - giorno order by giorno) from public.instagram_contenuti_dm_giorni
   where giorno > public.oggi() - 60),
  array[13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  'segna contati i giorni finiti da 13 giorni fa a ieri'
);
select is((select count(*)::integer from public.instagram_contenuti_dm_giorni where giorno >= public.oggi()), 0,
  'mai oggi, che è sempre a metà');
-- marked an hour ago: a run again must leave them as they are (on conflict do nothing)
update public.instagram_contenuti_dm_giorni set created_at = created_at - interval '1 hour';
create temp table giorni78 on commit drop as select giorno, created_at from public.instagram_contenuti_dm_giorni;

-- the same rows again: the same table
create temp table prima78 on commit drop as
  select shortcode, giorno, dm, lead_in_target, call_prenotate, dm_certi from public.instagram_contenuti_dm;
set local role service_role;
select is(
  public.instagram_contenuti_dm_salva(jsonb_build_array(
    jsonb_build_object('shortcode', 'SeedDemo01', 'giorno', public.oggi() - 29, 'dm', 4, 'lead_in_target', 2, 'call_prenotate', 1, 'dm_certi', 3),
    jsonb_build_object('shortcode', 'SeedDemo01', 'giorno', public.oggi() - 2, 'dm', 3, 'lead_in_target', 1, 'call_prenotate', 0, 'dm_certi', 1))),
  2,
  'rifatto con le stesse righe'
);
reset role;
select is(
  (select count(*)::integer from (
     (select shortcode, giorno, dm, lead_in_target, call_prenotate, dm_certi from public.instagram_contenuti_dm
      except select * from prima78)
     union all
     (select * from prima78
      except select shortcode, giorno, dm, lead_in_target, call_prenotate, dm_certi from public.instagram_contenuti_dm)) d),
  0,
  'la tabella è la stessa'
);
select is(
  (select count(*)::integer from (
     (select giorno, created_at from public.instagram_contenuti_dm_giorni except select * from giorni78)
     union all
     (select * from giorni78 except select giorno, created_at from public.instagram_contenuti_dm_giorni)) d),
  0,
  'e i giorni contati pure, con il loro momento'
);

-- the chats start later: the days before are final, and never counted
update public.insight_impostazioni set storico_dal = public.oggi() - 5 where id;
delete from public.instagram_contenuti_dm_giorni where giorno > public.oggi() - 60;
set local role service_role;
select is(
  public.instagram_contenuti_dm_salva(jsonb_build_array(
    jsonb_build_object('shortcode', 'SeedDemo01', 'giorno', public.oggi() - 10, 'dm', 1, 'lead_in_target', 0, 'call_prenotate', 0, 'dm_certi', 0),
    jsonb_build_object('shortcode', 'SeedDemo01', 'giorno', public.oggi() - 5, 'dm', 2, 'lead_in_target', 2, 'call_prenotate', 0, 'dm_certi', 2),
    jsonb_build_object('shortcode', 'T78Post01', 'giorno', public.oggi(), 'dm', 1, 'lead_in_target', 1, 'call_prenotate', 1, 'dm_certi', 0))),
  2,
  'con lo storico dal 5 giorni fa scrive solo da lì'
);
reset role;
select is(
  (select array_agg(row(shortcode, public.oggi() - giorno, dm)::text order by shortcode, giorno)
   from public.instagram_contenuti_dm),
  array[row('SeedDemo01', 40, 7)::text, row('SeedDemo01', 29, 4)::text, row('SeedDemo01', 5, 2)::text,
        row('T78Post01', 0, 1)::text],
  'i giorni prima dello storico non si cancellano né si scrivono'
);
select is(
  (select array_agg(public.oggi() - giorno order by giorno) from public.instagram_contenuti_dm_giorni
   where giorno > public.oggi() - 60),
  array[5, 4, 3, 2, 1],
  'e si contano solo i giorni da storico_dal a ieri'
);
delete from public.instagram_contenuti_dm_giorni where giorno > public.oggi() - 60;
set local role service_role;
select throws_ok(
  $$ select public.instagram_contenuti_dm_salva(jsonb_build_array(
       jsonb_build_object('shortcode', 'SeedDemo01', 'giorno', public.oggi() - 1, 'dm', 0, 'lead_in_target', 0,
                          'call_prenotate', 0, 'dm_certi', 0))) $$,
  '23514', null,
  'una riga senza DM la rifiuta il controllo (chi chiama non la manda mai)'
);
reset role;
select is((select count(*)::integer from public.instagram_contenuti_dm_giorni where giorno > public.oggi() - 60), 0,
  'e un salvataggio rifiutato non segna nessun giorno');
-- the chats start today: nothing is finished yet
update public.insight_impostazioni set storico_dal = public.oggi() where id;
set local role service_role;
select is(
  public.instagram_contenuti_dm_salva(jsonb_build_array(
    jsonb_build_object('shortcode', 'SeedDemo01', 'giorno', public.oggi() - 1, 'dm', 1, 'lead_in_target', 0, 'call_prenotate', 0, 'dm_certi', 0),
    jsonb_build_object('shortcode', 'T78Post01', 'giorno', public.oggi(), 'dm', 1, 'lead_in_target', 1, 'call_prenotate', 1, 'dm_certi', 0))),
  1,
  'con lo storico da oggi scrive solo oggi'
);
reset role;
select is((select count(*)::integer from public.instagram_contenuti_dm_giorni where giorno > public.oggi() - 60), 0,
  'e non segna contato nessun giorno');
-- a partial reading (chats not read, the history cut): its zeros are not known to be zeros
update public.insight_impostazioni set storico_dal = public.oggi() - 5 where id;
set local role service_role;
select is(
  public.instagram_contenuti_dm_salva(jsonb_build_array(
    jsonb_build_object('shortcode', 'SeedDemo01', 'giorno', public.oggi() - 2, 'dm', 1, 'lead_in_target', 0, 'call_prenotate', 0, 'dm_certi', 0)),
    false),
  1,
  'una lettura parziale scrive comunque i conteggi che ha'
);
reset role;
select is((select count(*)::integer from public.instagram_contenuti_dm_giorni where giorno > public.oggi() - 60), 0,
  'ma non segna contato nessun giorno: senza righe non vorrebbe dire zero lead');
set local role service_role;
select is(
  public.instagram_contenuti_dm_salva(jsonb_build_array(
    jsonb_build_object('shortcode', 'SeedDemo01', 'giorno', public.oggi() - 2, 'dm', 1, 'lead_in_target', 0, 'call_prenotate', 0, 'dm_certi', 0))),
  1,
  'una lettura completa (il valore di base) li segna'
);
reset role;
select is((select count(*)::integer from public.instagram_contenuti_dm_giorni where giorno > public.oggi() - 60), 5,
  'i giorni da storico_dal a ieri');

-- ---------------------------------------------------------------------------
-- 5. A post that goes takes its counts; the backup keeps them
-- ---------------------------------------------------------------------------
delete from public.instagram_contenuti where shortcode = 'T78Post01';
select is((select count(*)::integer from public.instagram_contenuti_dm where shortcode = 'T78Post01'), 0,
  'un post eliminato porta via i suoi conteggi');

create temp table backup78 (dati jsonb) on commit drop;
grant all on backup78 to service_role;
set local role service_role;
insert into backup78 select public.backup_completo();
reset role;
select is(
  (select jsonb_array_length(dati->'instagram_contenuti_dm') from backup78),
  (select count(*)::integer from public.instagram_contenuti_dm),
  'il backup tiene i lead per post, tutti'
);
select is(
  (select jsonb_array_length(dati->'instagram_contenuti_dm_giorni') from backup78),
  (select count(*)::integer from public.instagram_contenuti_dm_giorni),
  'e i giorni contati'
);
select ok(
  (select obj_description('public.instagram_contenuti_dm'::regclass, 'pg_class') like '%Numbers only%'),
  'il commento della tabella dice che sono solo numeri'
);

select * from finish();
rollback;
