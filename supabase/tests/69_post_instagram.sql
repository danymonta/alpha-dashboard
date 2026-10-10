-- Post di Instagram e calendario (1.33.0, Dany 09/10/2026). The posts and reels
-- of the connected account (instagram_contenuti), the listing run's state, the
-- run's links and the people's "no" (refused pairs, excluded posts). Admin,
-- video editor and marketing read everything and add or remove refusals and
-- exclusions; posts, state and the run's links are written only by the service
-- role through its functions; nobody else sees a row. The run links a post by
-- itself only to a Posted content without URL, never over a person's "no";
-- a session that changes a content's URL leaves the "no", the run never does.
-- One run at a time (lease), and the run's error never keeps the token. Only a
-- run that failed for the token lets "Aggiorna da Instagram" start again at once.
-- The sign "Collegato da solo" is only the run's: it waits 10 minutes with a
-- person's "no" for «Annulla», and a link made by hand never shows it.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(173);

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

-- No token left from local use: the error masking below uses its own
delete from vault.secrets where name = 'instagram_token';

-- A deactivated marketing account, invited as usual
insert into public.invites (email, ruolo) values ('marketing69@alpha.test', 'marketing');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999990369',
   'authenticated', 'authenticated', 'marketing69@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Marina Sessantanove"}'::jsonb, now(), now(), '', '', '', '');
update public.profiles set attivo = false where id = '99999999-9999-4999-8999-999999990369';

-- Contents, written as postgres (no session)
insert into public.marketing_contenuti (id, tipo, nome, stato, post_date, url, bozza, created_by) values
  ('69690000-0000-4000-8000-000000000001', 'reel', 'Contenuto 69 da collegare a mano', 'posted', public.oggi(), null, null,
   '11111111-1111-4111-8111-111111111111'),
  ('69690000-0000-4000-8000-000000000002', 'reel', 'Contenuto 69 da collegare da solo', 'posted', public.oggi() - 1, null, null,
   '11111111-1111-4111-8111-111111111111'),
  ('69690000-0000-4000-8000-000000000003', 'reel', 'Contenuto 69 da montare', 'to_be_edited', public.oggi(), null,
   repeat('b', 4000), '11111111-1111-4111-8111-111111111111'),
  ('69690000-0000-4000-8000-000000000004', 'reel', 'Contenuto 69 con URL', 'posted', public.oggi(),
   'https://www.instagram.com/reel/T69Manuale/', null, '11111111-1111-4111-8111-111111111111'),
  ('69690000-0000-4000-8000-000000000005', 'reel', 'Contenuto 69 rifiutato', 'posted', public.oggi(), null, null,
   '11111111-1111-4111-8111-111111111111'),
  ('69690000-0000-4000-8000-000000000006', 'carousel', 'Contenuto 69 con proposte', 'posted', public.oggi() - 2, null, null,
   '11111111-1111-4111-8111-111111111111'),
  ('69690000-0000-4000-8000-000000000007', 'reel', 'Contenuto 69 cancellato', 'canceled', public.oggi(), null, null,
   '11111111-1111-4111-8111-111111111111'),
  ('69690000-0000-4000-8000-000000000008', 'carousel', 'Contenuto 69 dal feed', 'posted', public.oggi(),
   'https://www.instagram.com/p/T69Pagina1/', null, '11111111-1111-4111-8111-111111111111');

-- Posts, as the run would write them (service role: here postgres)
insert into public.instagram_contenuti (media_id, shortcode, permalink, media_type, media_product_type, reel,
  pubblicato_il, didascalia, eliminato_il)
select x.media_id, x.shortcode, x.permalink, x.media_type, x.tipo, x.reel,
       ((public.oggi() + x.giorni)::timestamp + x.ora::time) at time zone 'Europe/Rome',
       'Didascalia di prova del test 69', case when x.eliminato then now() - interval '1 day' end
from (values
  ('6900000000000001', 'T69Post01', 'https://www.instagram.com/reel/T69Post01/', 'VIDEO', 'REELS', true, 0, '10:00', false),
  ('6900000000000002', 'T69Post02', 'https://www.instagram.com/reel/T69Post02/', 'VIDEO', 'REELS', true, 0, '11:00', false),
  ('6900000000000003', 'T69Post03', 'https://www.instagram.com/reel/T69Post03/', 'VIDEO', 'REELS', true, 0, '12:00', false),
  ('6900000000000004', 'T69Post04', 'https://www.instagram.com/p/T69Post04/', 'IMAGE', 'FEED', false, 0, '13:00', false),
  ('6900000000000005', 'T69Post05', 'https://www.instagram.com/reel/T69Post05/', 'VIDEO', 'REELS', true, 0, '09:00', true),
  ('6900000000000006', 'T69Post06', 'https://www.instagram.com/p/T69Post06/', 'CAROUSEL_ALBUM', 'FEED', false, 0, '14:00', false),
  ('6900000000000007', 'T69Post07', 'https://www.instagram.com/reel/T69Post07/', 'VIDEO', 'REELS', true, -400, '18:00', false),
  ('6900000000000008', 'T69Post08', 'https://www.instagram.com/reel/T69Post08/', 'VIDEO', null, true, 0, '15:00', false)
) as x(media_id, shortcode, permalink, media_type, tipo, reel, giorni, ora, eliminato);

-- A proposal, a refused pair and an excluded post, so "0 rows" below means RLS
insert into public.marketing_abbinamenti (shortcode, contenuto_id, esito, punteggio, somiglianza, giorni, motivi)
values ('T69Post08', '69690000-0000-4000-8000-000000000006', 'proposto', 50, 0.4, 2, array['didascalia_simile']);
insert into public.marketing_abbinamenti_rifiutati (shortcode, contenuto_id)
values ('T69Post06', '69690000-0000-4000-8000-000000000005');
insert into public.marketing_post_esclusi (shortcode) values ('T69Post04');

create temp table giri (nome text primary key, id uuid, risposta jsonb) on commit drop;
grant all on giri to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
select has_table('public', 'instagram_contenuti', 'i post di Instagram hanno la loro tabella');
select has_table('public', 'instagram_contenuti_stato', 'lo stato del giro c''è');
select has_table('public', 'marketing_abbinamenti', 'i legami calcolati dal giro ci sono');
select has_table('public', 'marketing_abbinamenti_rifiutati', 'i no delle persone ci sono');
select has_table('public', 'marketing_post_esclusi', 'i post fuori dal calendario ci sono');
select has_view('public', 'v_marketing_proposte', 'la view delle proposte c''è');
select has_view('public', 'v_instagram_post', 'la view dei post c''è');
select has_column('public', 'instagram_contenuti_stato', 'ultimo_giro_motivo', 'lo stato dice se l''ultimo giro era di notte o a mano');
select has_column('public', 'instagram_contenuti_stato', 'ultimo_giro_causa', 'e perché l''ultimo giro non è riuscito');
select has_index('public', 'instagram_contenuti', 'instagram_contenuti_pubblicato_idx', 'pubblicato_il',
  'l''indice sul giorno di pubblicazione, quello che 1.35.0 si aspetta');
select is((select count(*)::integer from public.instagram_contenuti_stato), 1, 'lo stato del giro ha la sua riga, già pronta');
select ok(
  (select bool_and(c.relrowsecurity) from pg_class c
   where c.oid in ('public.instagram_contenuti'::regclass, 'public.instagram_contenuti_stato'::regclass,
                   'public.marketing_abbinamenti'::regclass, 'public.marketing_abbinamenti_rifiutati'::regclass,
                   'public.marketing_post_esclusi'::regclass)),
  'RLS attiva sulle cinque tabelle'
);
-- <tabella>_mai_da_oauth: Claude's OAuth tokens never reach the posts nor their links
-- (1.34.0, 20261010090000_mcp_oauth.sql, 75_mcp_oauth.sql)
select policies_are('public', 'instagram_contenuti',
  array['instagram_contenuti_lettura', 'instagram_contenuti_mai_da_oauth'],
  'i post: solo la lettura');
select policies_are('public', 'instagram_contenuti_stato',
  array['instagram_contenuti_stato_lettura', 'instagram_contenuti_stato_mai_da_oauth'],
  'lo stato del giro: solo la lettura');
select policies_are('public', 'marketing_abbinamenti',
  array['marketing_abbinamenti_lettura', 'marketing_abbinamenti_mai_da_oauth'],
  'i legami del giro: solo la lettura');
select policies_are('public', 'marketing_abbinamenti_rifiutati',
  array['marketing_abbinamenti_rifiutati_lettura', 'marketing_abbinamenti_rifiutati_inserimento',
        'marketing_abbinamenti_rifiutati_eliminazione', 'marketing_abbinamenti_rifiutati_mai_da_oauth'],
  'i no: lettura, inserimento ed eliminazione, nessuna modifica');
select policies_are('public', 'marketing_post_esclusi',
  array['marketing_post_esclusi_lettura', 'marketing_post_esclusi_inserimento',
        'marketing_post_esclusi_eliminazione', 'marketing_post_esclusi_mai_da_oauth'],
  'gli esclusi: lettura, inserimento ed eliminazione, nessuna modifica');
select ok(
  (select bool_and(c.reloptions @> array['security_invoker=true']) from pg_class c
   where c.oid in ('public.v_marketing_proposte'::regclass, 'public.v_instagram_post'::regclass)),
  'le due view girano con i permessi di chi legge'
);
select ok(
  (select bool_and(p.prosecdef and p.proconfig @> array['search_path=""'])
   from pg_proc p
   where p.oid in (
     'public.instagram_contenuti_inizia_giro(text)'::regprocedure,
     'public.instagram_contenuti_fine_giro(uuid, text, integer, integer, integer, text, text, text, text)'::regprocedure,
     'public.instagram_contenuti_segna_eliminati(timestamptz, text[])'::regprocedure,
     'public.marketing_contenuti_per_abbinamento()'::regprocedure,
     'public.instagram_collega_da_solo(text, uuid, smallint, numeric, smallint, text[])'::regprocedure,
     'public.instagram_salva_proposte(jsonb)'::regprocedure,
     'public.marketing_contenuti_post_scollegato()'::regprocedure
   )),
  'le funzioni del giro e il trigger: security definer con search_path vuoto'
);
select ok(
  (select bool_and(
     not has_function_privilege('anon', f, 'execute')
     and not has_function_privilege('authenticated', f, 'execute')
     and has_function_privilege('service_role', f, 'execute'))
   from unnest(array[
     'public.instagram_contenuti_inizia_giro(text)',
     'public.instagram_contenuti_fine_giro(uuid, text, integer, integer, integer, text, text, text, text)',
     'public.instagram_contenuti_segna_eliminati(timestamptz, text[])',
     'public.marketing_contenuti_per_abbinamento()',
     'public.instagram_collega_da_solo(text, uuid, smallint, numeric, smallint, text[])',
     'public.instagram_salva_proposte(jsonb)'
   ]) as f),
  'le funzioni del giro le chiama solo il service role'
);
select ok(
  not has_function_privilege('anon', 'public.marketing_contenuti_post_scollegato()', 'execute')
  and not has_function_privilege('authenticated', 'public.marketing_contenuti_post_scollegato()', 'execute'),
  'nessuna sessione chiama la funzione del trigger'
);
select has_trigger('public', 'marketing_contenuti', 'marketing_contenuti_post_scollegato',
  'un trigger ricorda il no di chi scollega un post');
select is(
  (select count(*)::integer from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public'
     and table_name in ('instagram_contenuti', 'instagram_contenuti_stato', 'marketing_abbinamenti',
                        'marketing_abbinamenti_rifiutati', 'marketing_post_esclusi',
                        'v_marketing_proposte', 'v_instagram_post')),
  0,
  'anon non ha nessun permesso sulle tabelle e sulle view nuove'
);
select ok(
  (select bool_and(not has_table_privilege('authenticated', t, p))
   from unnest(array['public.instagram_contenuti', 'public.instagram_contenuti_stato', 'public.marketing_abbinamenti']) as t,
        unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as p),
  'nessuna sessione scrive i post, lo stato del giro o i legami del giro'
);
select ok(
  (select bool_and(not has_table_privilege('authenticated', t, 'UPDATE')
                   and not has_table_privilege('authenticated', t, 'TRUNCATE')
                   and has_table_privilege('authenticated', t, 'DELETE'))
   from unnest(array['public.marketing_abbinamenti_rifiutati', 'public.marketing_post_esclusi']) as t)
  and has_table_privilege('authenticated', 'public.marketing_post_esclusi', 'INSERT'),
  'i no e gli esclusi si aggiungono e si tolgono, non si modificano'
);
select ok(
  has_column_privilege('authenticated', 'public.marketing_abbinamenti_rifiutati', 'shortcode', 'INSERT')
  and has_column_privilege('authenticated', 'public.marketing_abbinamenti_rifiutati', 'contenuto_id', 'INSERT')
  and not has_column_privilege('authenticated', 'public.marketing_abbinamenti_rifiutati', 'created_at', 'INSERT')
  and not has_table_privilege('authenticated', 'public.marketing_abbinamenti_rifiutati', 'INSERT'),
  'di un no la sessione scrive la coppia, mai il momento (i 10 minuti del segno «Collegato da solo»)'
);

-- ---------------------------------------------------------------------------
-- 2. What a row can hold
-- ---------------------------------------------------------------------------
select throws_ok($$
  insert into public.instagram_contenuti (media_id, shortcode, permalink, media_type, reel, pubblicato_il)
  values ('6900000000000090', 'ab', 'https://www.instagram.com/reel/ab/', 'VIDEO', true, now()) $$,
  '23514', null, 'uno shortcode troppo corto no');
select throws_ok($$
  insert into public.instagram_contenuti (media_id, shortcode, permalink, media_type, reel, pubblicato_il)
  values ('6900000000000091', 'T69Tipo01', 'https://www.instagram.com/reel/T69Tipo01/', 'REEL', true, now()) $$,
  '23514', null, 'un tipo che Instagram non dà no');
select throws_ok($$
  insert into public.instagram_contenuti (media_id, shortcode, permalink, media_type, reel, pubblicato_il)
  values ('6900000000000092', 'T69Link01', 'https://example.com/reel/T69Link01/', 'VIDEO', true, now()) $$,
  '23514', null, 'un link che non è di Instagram no');
select throws_ok($$
  insert into public.instagram_contenuti (media_id, shortcode, permalink, media_type, reel, pubblicato_il, didascalia)
  values ('6900000000000093', 'T69Lunga1', 'https://www.instagram.com/reel/T69Lunga1/', 'VIDEO', true, now(), repeat('x', 2201)) $$,
  '23514', null, 'una didascalia oltre i 2200 caratteri no');
select throws_ok($$
  insert into public.instagram_contenuti (media_id, shortcode, permalink, media_type, reel, pubblicato_il)
  values ('6900000000000094', 'T69Post01', 'https://www.instagram.com/reel/T69Post01/', 'VIDEO', true, now()) $$,
  '23505', null, 'uno shortcode sta su un solo post');
select throws_ok($$ insert into public.instagram_contenuti_stato (id) values (false) $$, '23514', null,
  'lo stato del giro ha una riga sola');
select throws_ok($$
  insert into public.marketing_abbinamenti (shortcode, contenuto_id, esito, punteggio, somiglianza, motivi)
  values ('T69Post02', '69690000-0000-4000-8000-000000000001', 'proposto', 50, 0.5, array['a_caso']) $$,
  '23514', null, 'un motivo fuori elenco no');
select is(
  (select row(metriche_stato, views, letto_il is not null)::text from public.instagram_contenuti where shortcode = 'T69Post01'),
  row('da_leggere', null::integer, true)::text,
  'le statistiche partono vuote, da leggere: mai 0 per un numero che manca'
);
select is((select instagram_shortcode from public.marketing_contenuti where id = '69690000-0000-4000-8000-000000000004'),
  'T69Manuale', 'un URL /reel/ dà lo shortcode del post');
select is((select instagram_shortcode from public.marketing_contenuti where id = '69690000-0000-4000-8000-000000000008'),
  'T69Pagina1', 'anche un URL /p/');

-- ---------------------------------------------------------------------------
-- 3. Who reads, who writes
-- ---------------------------------------------------------------------------
set local role authenticated;

-- the video editor and marketing add and remove a "no" and an excluded post
set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
select lives_ok($$ insert into public.marketing_post_esclusi (shortcode) values ('T69Post08') $$,
  'il video editor mette un post fuori dal calendario');
select is(pg_temp.righe($$ delete from public.marketing_post_esclusi where shortcode = 'T69Post08' $$), 1,
  'e lo rimette');
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select lives_ok($$ insert into public.marketing_abbinamenti_rifiutati (shortcode, contenuto_id)
                   values ('T69Post02', '69690000-0000-4000-8000-000000000003') $$,
  'il marketing scrive un no');
select is(pg_temp.righe($$ delete from public.marketing_abbinamenti_rifiutati
                           where shortcode = 'T69Post02' and contenuto_id = '69690000-0000-4000-8000-000000000003' $$), 1,
  'e lo toglie');
select throws_ok($$ update public.marketing_abbinamenti_rifiutati set shortcode = 'T69Post03' $$, '42501', null,
  'un no non si modifica');
select throws_ok($$ insert into public.instagram_contenuti (media_id, shortcode, permalink, media_type, reel, pubblicato_il)
                    values ('6900000000000095', 'T69Mano01', 'https://www.instagram.com/reel/T69Mano01/', 'VIDEO', true, now()) $$,
  '42501', null, 'il marketing non scrive un post');
select throws_ok($$ update public.instagram_contenuti_stato set ultimo_errore = 'scritto a mano' $$, '42501', null,
  'né lo stato del giro');
select throws_ok($$ insert into public.marketing_abbinamenti (shortcode, contenuto_id, esito, punteggio, somiglianza)
                    values ('T69Post02', '69690000-0000-4000-8000-000000000001', 'automatico', 90, 0.9) $$,
  '42501', null, 'né un collegamento automatico');
select throws_ok($$ delete from public.marketing_abbinamenti $$, '42501', null, 'né cancella le proposte');

set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$ update public.instagram_contenuti set didascalia = 'Cambiata a mano' $$, '42501', null,
  'nemmeno l''admin scrive i post: li scrive solo il giro');

-- reading
select ok(
  (select count(*) from public.instagram_contenuti) > 0
  and (select count(*) from public.instagram_contenuti_stato) = 1
  and (select count(*) from public.marketing_abbinamenti) > 0
  and (select count(*) from public.marketing_abbinamenti_rifiutati) > 0
  and (select count(*) from public.marketing_post_esclusi) > 0
  and (select count(*) from public.v_instagram_post) > 0
  and (select count(*) from public.v_marketing_proposte) > 0,
  'l''admin legge post, stato, proposte, no ed esclusi'
);
set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
select ok(
  (select count(*) from public.instagram_contenuti) > 0
  and (select count(*) from public.instagram_contenuti_stato) = 1
  and (select count(*) from public.marketing_abbinamenti) > 0
  and (select count(*) from public.marketing_abbinamenti_rifiutati) > 0
  and (select count(*) from public.marketing_post_esclusi) > 0
  and (select count(*) from public.v_instagram_post) > 0
  and (select count(*) from public.v_marketing_proposte) > 0,
  'anche il video editor'
);
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select ok(
  (select count(*) from public.instagram_contenuti) > 0
  and (select count(*) from public.instagram_contenuti_stato) = 1
  and (select count(*) from public.marketing_abbinamenti) > 0
  and (select count(*) from public.marketing_abbinamenti_rifiutati) > 0
  and (select count(*) from public.marketing_post_esclusi) > 0
  and (select count(*) from public.v_instagram_post) > 0
  and (select count(*) from public.v_marketing_proposte) > 0,
  'e il marketing'
);

create or replace function pg_temp.visti()
returns bigint
language sql
as $$
  select (select count(*) from public.instagram_contenuti)
       + (select count(*) from public.instagram_contenuti_stato)
       + (select count(*) from public.marketing_abbinamenti)
       + (select count(*) from public.marketing_abbinamenti_rifiutati)
       + (select count(*) from public.marketing_post_esclusi)
       + (select count(*) from public.v_instagram_post)
       + (select count(*) from public.v_marketing_proposte);
$$;

set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(pg_temp.visti(), 0::bigint, 'il setter non legge niente dei post');
select throws_ok($$ insert into public.marketing_abbinamenti_rifiutati (shortcode, contenuto_id)
                    values ('T69Post02', '69690000-0000-4000-8000-000000000003') $$,
  '42501', null, 'né scrive un no');
select throws_ok($$ insert into public.marketing_post_esclusi (shortcode) values ('T69Post08') $$,
  '42501', null, 'né esclude un post');
select is(pg_temp.righe($$ delete from public.marketing_post_esclusi $$), 0, 'né rimette un post escluso');
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(pg_temp.visti(), 0::bigint, 'il closer nemmeno');
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select is(pg_temp.visti(), 0::bigint, 'il coach nemmeno');
set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999990369","role":"authenticated"}';
select is(pg_temp.visti(), 0::bigint, 'un account marketing disattivato nemmeno');
select throws_ok($$ insert into public.marketing_post_esclusi (shortcode) values ('T69Post08') $$,
  '42501', null, 'e non esclude niente');

reset role;
set local request.jwt.claims to '{}';
set local role anon;
select throws_ok($$ select count(*) from public.instagram_contenuti $$, '42501', null, 'anon non legge i post');
select throws_ok($$ select count(*) from public.v_instagram_post $$, '42501', null, 'né la view dei post');
reset role;

-- ---------------------------------------------------------------------------
-- 4. The "no" of a person (trigger marketing_contenuti_post_scollegato)
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is(pg_temp.righe($$ update public.marketing_contenuti set url = 'https://www.instagram.com/reel/T69Post01/'
                           where id = '69690000-0000-4000-8000-000000000001' $$), 1,
  'il marketing collega un post a mano');
select is((select count(*)::integer from public.marketing_abbinamenti_rifiutati
           where contenuto_id = '69690000-0000-4000-8000-000000000001'), 0,
  'collegare non scrive nessun no');
select is(pg_temp.righe($$ update public.marketing_contenuti set audio = 'Audio 69'
                           where id = '69690000-0000-4000-8000-000000000001' $$), 1,
  'poi cambia un''altra proprietà');
select is(pg_temp.righe($$ update public.marketing_contenuti set url = 'https://www.instagram.com/reel/T69Post01/'
                           where id = '69690000-0000-4000-8000-000000000001' $$), 1,
  'e riscrive lo stesso URL');
select is((select count(*)::integer from public.marketing_abbinamenti_rifiutati
           where contenuto_id = '69690000-0000-4000-8000-000000000001'), 0,
  'un salvataggio che lascia l''URL com''è non scrive nessun no');
select is(pg_temp.righe($$ update public.marketing_contenuti set url = null
                           where id = '69690000-0000-4000-8000-000000000001' $$), 1,
  'poi lo scollega');
select is((select array_agg(shortcode order by shortcode) from public.marketing_abbinamenti_rifiutati
           where contenuto_id = '69690000-0000-4000-8000-000000000001'), array['T69Post01'],
  'scollegare scrive il no per quella coppia');
select is(pg_temp.righe($$ update public.marketing_contenuti set url = 'https://www.instagram.com/reel/T69Post01/'
                           where id = '69690000-0000-4000-8000-000000000001' $$), 1,
  'lo ricollega a mano');
select is((select count(*)::integer from public.marketing_abbinamenti_rifiutati
           where contenuto_id = '69690000-0000-4000-8000-000000000001'), 0,
  'ricollegarlo toglie il no');
select is(pg_temp.righe($$ update public.marketing_contenuti set url = 'https://www.instagram.com/reel/T69Post02/'
                           where id = '69690000-0000-4000-8000-000000000001' $$), 1,
  'poi cambia l''URL con un altro post');
select is((select array_agg(shortcode order by shortcode) from public.marketing_abbinamenti_rifiutati
           where contenuto_id = '69690000-0000-4000-8000-000000000001'), array['T69Post01'],
  'il post di prima diventa un no, quello nuovo no');

reset role;
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select is(pg_temp.righe($$ update public.marketing_contenuti set url = null
                           where id = '69690000-0000-4000-8000-000000000001' $$), 1,
  'senza sessione (il giro, un ripristino) l''URL si toglie');
select is((select array_agg(shortcode order by shortcode) from public.marketing_abbinamenti_rifiutati
           where contenuto_id = '69690000-0000-4000-8000-000000000001'), array['T69Post01'],
  'e nessun no si scrive');

-- ---------------------------------------------------------------------------
-- 5. The run links a post by itself (instagram_collega_da_solo)
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$ select public.instagram_collega_da_solo('T69Post03', '69690000-0000-4000-8000-000000000002',
                      80::smallint, 0.8, 0::smallint, array['stessa_data']) $$,
  '42501', null, 'nemmeno l''admin collega da solo: lo fa il giro');

reset role;
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select is(public.instagram_collega_da_solo('T69Post03', '69690000-0000-4000-8000-000000000002',
            80::smallint, 0.8, 1::smallint, array['giorno_vicino', 'didascalia_simile']), true,
  'il giro collega un post a un contenuto Posted senza URL');
select is(
  (select row(url, instagram_shortcode, stato, post_date = public.oggi() - 1)::text
   from public.marketing_contenuti where id = '69690000-0000-4000-8000-000000000002'),
  row('https://www.instagram.com/reel/T69Post03/', 'T69Post03', 'posted'::public.contenuto_status, true)::text,
  'scrive solo l''URL del post: Status e Post Date restano'
);
select is(
  (select row(esito, punteggio, motivi)::text from public.marketing_abbinamenti
   where shortcode = 'T69Post03' and contenuto_id = '69690000-0000-4000-8000-000000000002'),
  row('automatico', 80::smallint, array['giorno_vicino', 'didascalia_simile'])::text,
  'e lascia il segno «Collegato da solo»'
);
select is(public.instagram_collega_da_solo('T69Post03', '69690000-0000-4000-8000-000000000001',
            80::smallint, 0.8, 0::smallint, null), false,
  'un post già su un contenuto non va su un altro');
select is(public.instagram_collega_da_solo('T69Post06', '69690000-0000-4000-8000-000000000003',
            80::smallint, 0.8, 0::smallint, null), false,
  'un contenuto non ancora Posted no: resta una proposta');
select is(public.instagram_collega_da_solo('T69Post06', '69690000-0000-4000-8000-000000000004',
            80::smallint, 0.8, 0::smallint, null), false,
  'un contenuto che ha già un URL no');
select is(public.instagram_collega_da_solo('T69Post06', '69690000-0000-4000-8000-000000000005',
            80::smallint, 0.8, 0::smallint, null), false,
  'una coppia che una persona ha rifiutato no');
select is(public.instagram_collega_da_solo('T69Post01', '69690000-0000-4000-8000-000000000001',
            80::smallint, 0.8, 0::smallint, null), false,
  'nemmeno il post appena scollegato da quel contenuto');
select is(public.instagram_collega_da_solo('T69Post04', '69690000-0000-4000-8000-000000000001',
            80::smallint, 0.8, 0::smallint, null), false,
  'un post fuori dal calendario no');
select is(public.instagram_collega_da_solo('T69Post05', '69690000-0000-4000-8000-000000000001',
            80::smallint, 0.8, 0::smallint, null), false,
  'un post non più su Instagram no');
select is(public.instagram_collega_da_solo('T69Nessuno', '69690000-0000-4000-8000-000000000001',
            80::smallint, 0.8, 0::smallint, null), false,
  'un post che non c''è no');
select is(
  (select count(*)::integer from public.marketing_contenuti
   where id in ('69690000-0000-4000-8000-000000000001', '69690000-0000-4000-8000-000000000003',
                '69690000-0000-4000-8000-000000000005') and url is not null),
  0,
  'dopo un no del giro, nessun URL scritto'
);
select is(
  (select count(*)::integer from public.marketing_abbinamenti
   where esito = 'automatico' and contenuto_id::text like '69690000-%'),
  1,
  'e nessun segno «Collegato da solo» in più'
);

-- ---------------------------------------------------------------------------
-- 6. The run's proposals (instagram_salva_proposte)
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims to '{}';
-- a superseded automatic link: its content no longer has that post
insert into public.marketing_abbinamenti (shortcode, contenuto_id, esito, punteggio, somiglianza, giorni)
values ('T69Post02', '69690000-0000-4000-8000-000000000003', 'automatico', 90, 0.9, 0);

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$ select public.instagram_salva_proposte('[]'::jsonb) $$, '42501', null,
  'le proposte le salva solo il giro');

reset role;
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select throws_ok($$ select public.instagram_salva_proposte('{"shortcode":"T69Post06"}'::jsonb) $$, '22023',
  'Le proposte sono un elenco.', 'le proposte sono un elenco');
select is(
  public.instagram_salva_proposte(jsonb_build_array(
    jsonb_build_object('shortcode', 'T69Post06', 'contenuto_id', '69690000-0000-4000-8000-000000000006',
      'punteggio', 70, 'somiglianza', 0.6, 'giorni', 0, 'motivi', jsonb_build_array('stessa_data', 'didascalia_simile')),
    jsonb_build_object('shortcode', 'T69Post02', 'contenuto_id', '69690000-0000-4000-8000-000000000001',
      'punteggio', 45, 'somiglianza', 0.35, 'giorni', 0, 'motivi', jsonb_build_array('didascalia_simile')),
    -- skipped: a refused pair, an excluded post, a content with a URL, a deleted
    -- post, a post already linked, a Canceled content, a post nobody read
    jsonb_build_object('shortcode', 'T69Post06', 'contenuto_id', '69690000-0000-4000-8000-000000000005',
      'punteggio', 50, 'somiglianza', 0.4, 'giorni', 0, 'motivi', '[]'::jsonb),
    jsonb_build_object('shortcode', 'T69Post04', 'contenuto_id', '69690000-0000-4000-8000-000000000001',
      'punteggio', 60, 'somiglianza', 0.5, 'giorni', 0),
    jsonb_build_object('shortcode', 'T69Post06', 'contenuto_id', '69690000-0000-4000-8000-000000000004',
      'punteggio', 55, 'somiglianza', 0.5, 'giorni', 0),
    jsonb_build_object('shortcode', 'T69Post05', 'contenuto_id', '69690000-0000-4000-8000-000000000001',
      'punteggio', 55, 'somiglianza', 0.5, 'giorni', 0),
    jsonb_build_object('shortcode', 'T69Post03', 'contenuto_id', '69690000-0000-4000-8000-000000000001',
      'punteggio', 55, 'somiglianza', 0.5, 'giorni', 0),
    jsonb_build_object('shortcode', 'T69Post06', 'contenuto_id', '69690000-0000-4000-8000-000000000007',
      'punteggio', 55, 'somiglianza', 0.5, 'giorni', 0),
    jsonb_build_object('shortcode', 'T69Mai0001', 'contenuto_id', '69690000-0000-4000-8000-000000000001',
      'punteggio', 55, 'somiglianza', 0.5, 'giorni', 0)
  )),
  2,
  'il giro salva le proposte valide e salta le altre'
);
select is(
  (select array_agg(shortcode || ' ' || right(contenuto_id::text, 2) order by shortcode, contenuto_id)
   from public.marketing_abbinamenti where esito = 'proposto' and contenuto_id::text like '69690000-%'),
  array['T69Post02 01', 'T69Post06 06'],
  'le proposte di prima sono sostituite: restano solo le nuove'
);
select is(
  (select array_agg(shortcode order by shortcode) from public.marketing_abbinamenti where esito = 'automatico'
   and contenuto_id::text like '69690000-%'),
  array['T69Post03'],
  'un collegamento automatico superato se ne va, quello vero resta'
);

-- «Scollega» then «Annulla»: the sign «Collegato da solo» waits 10 minutes with the "no"
reset role;
set local request.jwt.claims to '{}';
-- the two valid proposals above, as the run would save them again
create or replace function pg_temp.proposte()
returns jsonb
language sql
as $$
  select jsonb_build_array(
    jsonb_build_object('shortcode', 'T69Post06', 'contenuto_id', '69690000-0000-4000-8000-000000000006',
      'punteggio', 70, 'somiglianza', 0.6, 'giorni', 0, 'motivi', jsonb_build_array('stessa_data', 'didascalia_simile')),
    jsonb_build_object('shortcode', 'T69Post02', 'contenuto_id', '69690000-0000-4000-8000-000000000001',
      'punteggio', 45, 'somiglianza', 0.35, 'giorni', 0, 'motivi', jsonb_build_array('didascalia_simile')));
$$;
set local role authenticated;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is(pg_temp.righe($$ update public.marketing_contenuti set url = null
                           where id = '69690000-0000-4000-8000-000000000002' $$), 1,
  'il marketing scollega il post collegato da solo');
reset role;
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select is(public.instagram_salva_proposte(pg_temp.proposte()), 2, 'dopo il tocco le proposte si rifanno');
select is(
  (select row(esito, punteggio, giorni, motivi)::text from public.marketing_abbinamenti
   where shortcode = 'T69Post03' and contenuto_id = '69690000-0000-4000-8000-000000000002'),
  row('automatico', 80::smallint, 1::smallint, array['giorno_vicino', 'didascalia_simile'])::text,
  'il segno del giro resta nel database, col no, per 10 minuti'
);
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is((select collegato_da_solo from public.v_instagram_post where shortcode = 'T69Post03'), false,
  'scollegato, il post non si dice «Collegato da solo»');
select is(pg_temp.righe($$ update public.marketing_contenuti set url = 'https://www.instagram.com/reel/T69Post03/'
                           where id = '69690000-0000-4000-8000-000000000002' $$), 1,
  '«Annulla» rimette il post sul contenuto, con la sessione');
select is(
  (select row(collegato_da_solo, motivi_collegamento)::text from public.v_instagram_post where shortcode = 'T69Post03'),
  row(true, array['giorno_vicino', 'didascalia_simile'])::text,
  'e il segno torna com''era prima del tocco, senza che la sessione lo scriva'
);
select is((select count(*)::integer from public.marketing_abbinamenti_rifiutati
           where shortcode = 'T69Post03' and contenuto_id = '69690000-0000-4000-8000-000000000002'), 0,
  'e il no del tocco annullato non resta');
select throws_ok($$ insert into public.marketing_abbinamenti_rifiutati (shortcode, contenuto_id, created_at)
                    values ('T69Post01', '69690000-0000-4000-8000-000000000005', now()) $$,
  '42501', null, 'una sessione non sceglie il momento di un no');

-- after 10 minutes the sign is gone; a link by hand never has it
reset role;
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select is(public.instagram_collega_da_solo('T69Post01', '69690000-0000-4000-8000-000000000005',
            70::smallint, 0.7, 0::smallint, array['stessa_data', 'didascalia_simile', 'unico_del_giorno']), true,
  'il giro collega da solo un altro post');
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is(pg_temp.righe($$ update public.marketing_contenuti set url = null
                           where id = '69690000-0000-4000-8000-000000000005' $$), 1,
  'il marketing lo scollega');
reset role;
set local request.jwt.claims to '{}';
update public.marketing_abbinamenti_rifiutati set created_at = now() - interval '11 minutes'
where shortcode = 'T69Post01' and contenuto_id = '69690000-0000-4000-8000-000000000005';
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select is(public.instagram_salva_proposte(pg_temp.proposte()), 2, 'passati 10 minuti, il giro rifà le proposte');
select is((select count(*)::integer from public.marketing_abbinamenti
           where shortcode = 'T69Post01' and contenuto_id = '69690000-0000-4000-8000-000000000005'), 0,
  'e il segno non aspetta più');
reset role;
set local request.jwt.claims to '{}';
-- a sign no run has cleaned up yet (nothing ran in those 10 minutes)
insert into public.marketing_abbinamenti (shortcode, contenuto_id, esito, punteggio, somiglianza, giorni, motivi)
values ('T69Post01', '69690000-0000-4000-8000-000000000005', 'automatico', 70, 0.7, 0, array['stessa_data']);
set local role authenticated;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is(pg_temp.righe($$ update public.marketing_contenuti set url = 'https://www.instagram.com/reel/T69Post01/'
                           where id = '69690000-0000-4000-8000-000000000005' $$), 1,
  'dopo 10 minuti il marketing lo ricollega a mano');
select is(
  (select row(collegato_da_solo, (select count(*) from public.marketing_abbinamenti
                                   where shortcode = 'T69Post01' and esito = 'automatico'))::text
   from public.v_instagram_post where shortcode = 'T69Post01'),
  row(false, 0::bigint)::text,
  'collegato a mano: nessun segno, e la riga vecchia del giro se ne va'
);
select is(pg_temp.righe($$ update public.marketing_contenuti set url = null
                           where id = '69690000-0000-4000-8000-000000000005' $$), 1,
  'poi lo scollega');
select is(pg_temp.righe($$ update public.marketing_contenuti set url = 'https://www.instagram.com/reel/T69Post01/'
                           where id = '69690000-0000-4000-8000-000000000005' $$), 1,
  'e lo rimette subito, come «Annulla»');
select is((select collegato_da_solo from public.v_instagram_post where shortcode = 'T69Post01'), false,
  '«Annulla» di un post collegato a mano non gli dà mai il segno');

-- ---------------------------------------------------------------------------
-- 7. Where every post stands (v_instagram_post, v_marketing_proposte)
-- ---------------------------------------------------------------------------
reset role;
set local role authenticated;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is(
  (select row(stato_collegamento, contenuto_nome, collegato_da_solo, motivi_collegamento)::text
   from public.v_instagram_post where shortcode = 'T69Post03'),
  row('collegato', 'Contenuto 69 da collegare da solo', true, array['giorno_vicino', 'didascalia_simile'])::text,
  'collegato da solo, col perché'
);
select is((select stato_collegamento from public.v_instagram_post where shortcode = 'T69Post05'), 'eliminato',
  'non più su Instagram');
select is((select stato_collegamento from public.v_instagram_post where shortcode = 'T69Post04'), 'escluso',
  'fuori dal calendario');
select is((select stato_collegamento from public.v_instagram_post where shortcode = 'T69Post07'), 'prima_del_calendario',
  'più vecchio del calendario');
select is((select stato_collegamento from public.v_instagram_post where shortcode = 'T69Post06'), 'proposto',
  'con una proposta: da collegare');
select is((select stato_collegamento from public.v_instagram_post where shortcode = 'T69Post08'), 'senza_contenuto',
  'senza nessun contenuto: da collegare');
select is(
  (select giorno from public.v_instagram_post where shortcode = 'T69Post01'),
  public.oggi(),
  'il giorno del post è quello di Roma'
);
select is(
  (select row(nome, tipo, stato, giorni)::text from public.v_marketing_proposte
   where shortcode = 'T69Post06' and contenuto_id = '69690000-0000-4000-8000-000000000006'),
  row('Contenuto 69 con proposte', 'carousel'::public.contenuto_tipo, 'posted'::public.contenuto_status, 0::smallint)::text,
  'la proposta porta nome, tipo, Status e giorni del contenuto'
);

-- a superseded proposal disappears at once, without waiting for the run
select lives_ok($$ insert into public.marketing_abbinamenti_rifiutati (shortcode, contenuto_id)
                   values ('T69Post06', '69690000-0000-4000-8000-000000000006') $$,
  'il marketing dice «Non è questo» a una proposta');
select is((select count(*)::integer from public.v_marketing_proposte where shortcode = 'T69Post06'), 0,
  'la proposta rifiutata sparisce');
select is((select stato_collegamento from public.v_instagram_post where shortcode = 'T69Post06'), 'senza_contenuto',
  'e il post resta da collegare, senza proposte');
select is(pg_temp.righe($$ delete from public.marketing_abbinamenti_rifiutati
                           where shortcode = 'T69Post06' and contenuto_id = '69690000-0000-4000-8000-000000000006' $$), 1,
  '«Annulla» toglie il no');
select is((select stato_collegamento from public.v_instagram_post where shortcode = 'T69Post06'), 'proposto',
  'e la proposta torna');
select lives_ok($$ insert into public.marketing_post_esclusi (shortcode) values ('T69Post06') $$,
  'poi il post va fuori dal calendario');
select is((select count(*)::integer from public.v_marketing_proposte where shortcode = 'T69Post06'), 0,
  'la proposta di un post escluso sparisce');
select is(pg_temp.righe($$ delete from public.marketing_post_esclusi where shortcode = 'T69Post06' $$), 1,
  '«Rimetti»');
select is(pg_temp.righe($$ update public.marketing_contenuti set url = 'https://www.instagram.com/p/T69Altro01/'
                           where id = '69690000-0000-4000-8000-000000000006' $$), 1,
  'poi il contenuto riceve a mano l''URL di un altro post');
select is((select count(*)::integer from public.v_marketing_proposte where shortcode = 'T69Post06'), 0,
  'la proposta su un contenuto che ha già un post sparisce');
select is(pg_temp.righe($$ update public.marketing_contenuti set url = 'https://www.instagram.com/reel/T69Post02/'
                           where id = '69690000-0000-4000-8000-000000000005' $$), 1,
  'un altro contenuto prende a mano il post proposto a un terzo');
select is((select count(*)::integer from public.v_marketing_proposte where shortcode = 'T69Post02'), 0,
  'la proposta di un post collegato altrove sparisce');

-- a content deleted with its post: the post goes back to "Da collegare"
select is(pg_temp.righe($$ delete from public.marketing_contenuti where id = '69690000-0000-4000-8000-000000000002' $$), 1,
  'il marketing elimina un contenuto collegato da solo');
select is(
  (select row(stato_collegamento, contenuto_id, collegato_da_solo)::text from public.v_instagram_post where shortcode = 'T69Post03'),
  row('senza_contenuto', null::uuid, false)::text,
  'il suo post torna da collegare'
);
select is((select count(*)::integer from public.marketing_abbinamenti where shortcode = 'T69Post03'), 0,
  'e il segno «Collegato da solo» se ne va con il contenuto');

-- ---------------------------------------------------------------------------
-- 8. One run at a time (inizia_giro, fine_giro)
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims to '{}';
update public.instagram_contenuti_stato
set giro_id = null, giro_dal = null, giro_motivo = null, ultimo_giro_il = null, ultimo_giro_esito = null,
    ultimo_giro_motivo = null, campi = null, account_username = null, ultimo_errore = null, ultimo_errore_il = null;

set local role authenticated;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select throws_ok($$ select public.instagram_contenuti_inizia_giro('manuale') $$, '42501', null,
  'una sessione non prende il giro: «Aggiorna da Instagram» passa dal server');

reset role;
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select throws_ok($$ select public.instagram_contenuti_inizia_giro('sempre') $$, '22023', 'Motivo del giro non valido.',
  'un motivo fuori elenco no');
insert into giri (nome, risposta) values ('primo', public.instagram_contenuti_inizia_giro('notte'));
update giri set id = (risposta ->> 'giro')::uuid where nome = 'primo';
select ok((select id is not null from giri where nome = 'primo'), 'il giro della notte prende il turno');
select is(public.instagram_contenuti_inizia_giro('manuale') ->> 'rifiutato', 'in_corso',
  'un secondo giro mentre il primo lavora: in corso');
select is(public.instagram_contenuti_inizia_giro('notte') ->> 'rifiutato', 'in_corso',
  'anche il cron consegnato due volte');
select is(public.instagram_contenuti_fine_giro(gen_random_uuid(), 'ok', 1, 0, 0, 'completi', 'altro', null), false,
  'un giro che non ha il turno non scrive niente');
select is(public.instagram_contenuti_fine_giro((select id from giri where nome = 'primo'), 'ok', 10, 1, 2,
            'completi', '@_DanyMonta', 'ignorato su ok'), true,
  'il giro che ha il turno chiude');
select is(
  (select row(giro_id, ultimo_giro_esito, ultimo_giro_motivo, ultimo_giro_letti, ultimo_giro_collegati,
              ultimo_giro_proposti, campi, account_username, ultimo_errore, ultimo_errore_il, ultimo_giro_il = now())::text
   from public.instagram_contenuti_stato),
  row(null::uuid, 'ok', 'notte', 10, 1, 2, 'completi', '_danymonta', null::text, null::timestamptz, true)::text,
  'lo stato dice com''è andato, di notte, e il turno è libero'
);
select is(public.instagram_contenuti_fine_giro((select id from giri where nome = 'primo'), 'ok', 10, 1, 2, null, null, null), false,
  'lo stesso giro non chiude due volte');
select is(public.instagram_contenuti_inizia_giro('manuale') ->> 'rifiutato', 'appena_fatto',
  '«Aggiorna da Instagram» entro 5 minuti dall''ultimo giro: appena fatto');
insert into giri (nome, risposta) values ('secondo', public.instagram_contenuti_inizia_giro('notte'));
update giri set id = (risposta ->> 'giro')::uuid where nome = 'secondo';
select ok((select id is not null from giri where nome = 'secondo'), 'il giro della notte non aspetta i 5 minuti');

-- a run that died: its lease expires after 6 minutes
reset role;
update public.instagram_contenuti_stato set giro_dal = now() - interval '7 minutes';
set local role service_role;
insert into giri (nome, risposta) values ('terzo', public.instagram_contenuti_inizia_giro('notte'));
update giri set id = (risposta ->> 'giro')::uuid where nome = 'terzo';
select ok(
  (select t.id is not null and t.id <> s.id from giri t, giri s where t.nome = 'terzo' and s.nome = 'secondo'),
  'un turno più vecchio di 6 minuti si riprende'
);
select is(public.instagram_contenuti_fine_giro((select id from giri where nome = 'secondo'), 'ok', 1, 0, 0, null, null, null), false,
  'e il giro morto, se si sveglia, non scrive niente');

-- the error never keeps the token
reset role;
select ok(vault.create_secret('IGAAcorto69Segreto', 'instagram_token') is not null, 'un token nel Vault, per la prova');
set local role service_role;
select is(public.instagram_contenuti_fine_giro((select id from giri where nome = 'terzo'), 'fallito', 0, 0, 0,
            'bucato', 'Non Valido!',
            'Instagram ha detto IGAAcorto69Segreto su https://graph.instagram.com/v26.0/me/media?access_token=abc123def&limit=50 e '
            || repeat('Z', 45), 'token'),
  true, 'un giro fallito per il token chiude con l''errore');
select is(
  (select row(position('IGAAcorto69Segreto' in ultimo_errore), position('abc123def' in ultimo_errore),
              position(repeat('Z', 40) in ultimo_errore), position('[token]' in ultimo_errore) > 0,
              ultimo_errore_il is not null)::text
   from public.instagram_contenuti_stato),
  row(0, 0, 0, true, true)::text,
  'nell''errore il token del Vault, access_token= e ogni sequenza lunga diventano [token]'
);
select is(
  (select row(ultimo_giro_esito, ultimo_giro_causa, campi, account_username)::text from public.instagram_contenuti_stato),
  row('fallito', 'token', 'completi', '_danymonta')::text,
  'lo stato ricorda la causa; campi e account fuori elenco lasciano quelli di prima'
);
-- after a run failed for the token (none, or refused) the admin tries again at once
insert into giri (nome, risposta) values ('quarto', public.instagram_contenuti_inizia_giro('manuale'));
update giri set id = (risposta ->> 'giro')::uuid where nome = 'quarto';
select ok((select id is not null from giri where nome = 'quarto'),
  'dopo un giro fallito per il token «Aggiorna da Instagram» parte subito, senza i 5 minuti');
select is(public.instagram_contenuti_fine_giro((select id from giri where nome = 'quarto'), 'parziale', -3, 0, 0,
            'senza_didascalia', null, repeat('errore ', 100)), true,
  'un giro a metà chiude');
select is(public.instagram_contenuti_inizia_giro('manuale') ->> 'rifiutato', 'appena_fatto',
  'dopo un giro a metà i 5 minuti valgono');
select is(
  (select row(char_length(ultimo_errore), ultimo_giro_letti, campi)::text from public.instagram_contenuti_stato),
  row(500, 0, 'senza_didascalia')::text,
  'l''errore resta entro 500 caratteri, un conteggio negativo vale 0, i campi scesi si salvano'
);
select throws_ok($$ select public.instagram_contenuti_fine_giro(gen_random_uuid(), 'boh', 0, 0, 0, null, null, null) $$,
  '22023', 'Esito del giro non valido.', 'un esito fuori elenco no');

-- a manual run, after the 5 minutes
reset role;
update public.instagram_contenuti_stato set ultimo_giro_il = now() - interval '6 minutes';
set local role service_role;
insert into giri (nome, risposta) values ('quinto', public.instagram_contenuti_inizia_giro('manuale'));
update giri set id = (risposta ->> 'giro')::uuid where nome = 'quinto';
select ok((select id is not null from giri where nome = 'quinto'), 'dopo 5 minuti «Aggiorna da Instagram» parte');
select is(public.instagram_contenuti_fine_giro((select id from giri where nome = 'quinto'), 'ok', 7, 0, 1, 'completi', null, null), true,
  'e chiude');
select is(
  (select row(ultimo_giro_motivo, ultimo_giro_causa, ultimo_errore, ultimo_errore_il)::text from public.instagram_contenuti_stato),
  row('manuale', null::text, null::text, null::timestamptz)::text,
  'lo stato dice che era a mano, e l''errore e la causa di prima sono tolti'
);

-- failed for Meta's limits: the manual run waits the 5 minutes too (the token is also the DMs')
reset role;
update public.instagram_contenuti_stato set ultimo_giro_il = now() - interval '6 minutes';
set local role service_role;
insert into giri (nome, risposta) values ('sesto', public.instagram_contenuti_inizia_giro('manuale'));
update giri set id = (risposta ->> 'giro')::uuid where nome = 'sesto';
select is(public.instagram_contenuti_fine_giro((select id from giri where nome = 'sesto'), 'fallito', 0, 0, 0, null, null,
            'Instagram ha chiesto di rallentare: il resto arriva col prossimo aggiornamento.', 'limite'), true,
  'un giro fallito per un limite di Meta chiude');
select is(
  (select row(ultimo_giro_esito, ultimo_giro_causa, ultimo_giro_letti)::text from public.instagram_contenuti_stato),
  row('fallito', 'limite', 0)::text,
  'lo stato dice fallito per limite, nessun post letto'
);
select is(
  (select row(r ->> 'rifiutato', r ->> 'esito')::text from (select public.instagram_contenuti_inizia_giro('manuale') as r) x),
  row('appena_fatto', 'fallito')::text,
  'fallito per limite: «Aggiorna da Instagram» aspetta i 5 minuti, e sa che l''ultimo giro non è riuscito'
);

-- failed without a token: the manual run starts at once
insert into giri (nome, risposta) values ('settimo', public.instagram_contenuti_inizia_giro('notte'));
update giri set id = (risposta ->> 'giro')::uuid where nome = 'settimo';
select is(public.instagram_contenuti_fine_giro((select id from giri where nome = 'settimo'), 'fallito', 0, 0, 0, null, null,
            'Instagram non è collegato: l’admin incolla il token in Impostazioni › Instagram.', 'senza_token'), true,
  'il giro della notte non aspetta, e fallisce senza token');
insert into giri (nome, risposta) values ('ottavo', public.instagram_contenuti_inizia_giro('manuale'));
update giri set id = (risposta ->> 'giro')::uuid where nome = 'ottavo';
select ok((select id is not null from giri where nome = 'ottavo'), 'senza token: «Aggiorna da Instagram» parte subito');
select is(public.instagram_contenuti_fine_giro((select id from giri where nome = 'ottavo'), 'ok', 3, 0, 0, 'completi', null, null,
            'limite'), true,
  'e riesce');
select is((select ultimo_giro_causa from public.instagram_contenuti_stato), null::text,
  'un giro riuscito non ha causa, anche se gliene passano una');

-- a cause out of the list is none: the manual run waits
insert into giri (nome, risposta) values ('nono', public.instagram_contenuti_inizia_giro('notte'));
update giri set id = (risposta ->> 'giro')::uuid where nome = 'nono';
select is(public.instagram_contenuti_fine_giro((select id from giri where nome = 'nono'), 'fallito', 0, 0, 0, null, null,
            'errore', 'boh'), true,
  'un giro fallito con una causa fuori elenco chiude');
select is(
  (select row(ultimo_giro_causa, public.instagram_contenuti_inizia_giro('manuale') ->> 'rifiutato')::text
   from public.instagram_contenuti_stato),
  row(null::text, 'appena_fatto')::text,
  'la causa non vale, e «Aggiorna da Instagram» aspetta'
);

-- ---------------------------------------------------------------------------
-- 9. What the run reads and marks
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok($$ select * from public.marketing_contenuti_per_abbinamento() $$, '42501', null,
  'i contenuti da abbinare li legge solo il giro');
select throws_ok($$ select public.instagram_contenuti_segna_eliminati(now(), '{}') $$, '42501', null,
  'e solo il giro segna i post eliminati');

reset role;
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
select is(
  (select array_agg(right(id::text, 2) order by id) from public.marketing_contenuti_per_abbinamento()
   where id::text like '69690000-%'),
  array['01', '03'],
  'il giro legge solo i contenuti senza URL e non cancellati'
);
select is(
  (select char_length(bozza) from public.marketing_contenuti_per_abbinamento()
   where id = '69690000-0000-4000-8000-000000000003'),
  3000,
  'con le sezioni tagliate a 3000 caratteri'
);
select throws_ok($$ select public.instagram_contenuti_segna_eliminati(null, '{}') $$, '22023',
  'Manca il giorno da cui contare.', 'senza il giorno non segna niente');
select is(
  public.instagram_contenuti_segna_eliminati(
    (public.oggi()::timestamp) at time zone 'Europe/Rome',
    array['6900000000000001', '6900000000000002', '6900000000000003', '6900000000000004', '6900000000000006', null]),
  1,
  'dopo una lettura completa, il post di oggi che manca risulta eliminato'
);
select is(
  (select array_agg(shortcode order by shortcode) from public.instagram_contenuti
   where shortcode like 'T69%' and eliminato_il is not null),
  array['T69Post05', 'T69Post08'],
  'solo quello, e quello eliminato prima resta com''era'
);

-- ---------------------------------------------------------------------------
-- 10. Backup
-- ---------------------------------------------------------------------------
reset role;
set local request.jwt.claims to '{}';
select ok(
  public.backup_completo() ?& array['instagram_contenuti', 'instagram_contenuti_stato', 'marketing_abbinamenti',
                                     'marketing_abbinamenti_rifiutati', 'marketing_post_esclusi'],
  'il backup prende da sé le cinque tabelle nuove'
);

select * from finish();
rollback;
