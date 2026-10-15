-- The data of the reel analysis (1.36.0, 20261016090100_analisi_dati.sql): the
-- reading of a reel, Claude's analysis, the state of the work, the origin of a
-- calendar content born from an idea, and who reads what.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(64);

insert into public.instagram_contenuti (media_id, shortcode, permalink, media_type, reel, pubblicato_il) values
  ('8000000000000001', 'T80Reel01', 'https://www.instagram.com/reel/T80Reel01/', 'VIDEO', true, now() - interval '5 days'),
  ('8000000000000002', 'T80Reel02', 'https://www.instagram.com/reel/T80Reel02/', 'VIDEO', true, now() - interval '6 days');

create or replace function pg_temp.codice(p_sql text)
returns text
language plpgsql
as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Structure and defaults
-- ---------------------------------------------------------------------------
select has_table('public', 'instagram_letture', 'la lettura di un reel ha la sua tabella');
select has_table('public', 'marketing_analisi', 'l''analisi di Claude ha la sua tabella');
select has_table('public', 'marketing_lavori_stato', 'lo stato dei lavori ha la sua tabella');
select enum_has_labels('public', 'analisi_stato', array['in_coda', 'in_corso', 'pronta', 'fallita'], 'gli stati dell''analisi');
select col_is_pk('public', 'instagram_letture', 'media_id', 'una lettura per media');
select fk_ok('public', 'instagram_letture', 'media_id', 'public', 'instagram_contenuti', 'media_id', 'ogni lettura è di un media');
select ok(
  (select bool_and(relrowsecurity) from pg_class
   where oid in ('public.instagram_letture'::regclass, 'public.marketing_analisi'::regclass,
                 'public.marketing_lavori_stato'::regclass)),
  'RLS attiva sulle tre');
select policies_are('public', 'instagram_letture',
  array['instagram_letture_lettura', 'instagram_letture_mai_da_oauth'], 'le letture: solo la lettura');
select policies_are('public', 'marketing_analisi',
  array['marketing_analisi_lettura', 'marketing_analisi_mai_da_oauth'], 'le analisi: solo la lettura');
select policies_are('public', 'marketing_lavori_stato',
  array['marketing_lavori_stato_admin', 'marketing_lavori_stato_mai_da_oauth'], 'lo stato: solo l''admin legge');
-- the defaults of the columns (the seed turns the automatic analyses off for the e2e tests)
select is(
  (select array_agg(column_name || '=' || column_default order by column_name) from information_schema.columns
   where table_schema = 'public' and table_name = 'marketing_lavori_stato'
     and column_name in ('automatiche', 'note_team', 'costo_max_mese', 'costo_mese_usd')),
  array['automatiche=true', 'costo_max_mese=25', 'costo_mese_usd=0', 'note_team=true'],
  'i default: analisi automatiche accese, note del team accese (Dany, 15/10/2026), limite 25 $, costo zero');
select is((select count(*)::integer from public.marketing_lavori_stato), 1, 'una riga sola');
select throws_ok($$ insert into public.marketing_lavori_stato (id) values (false) $$, '23514', null, 'e non se ne aggiungono');
select ok(
  (select bool_and(not has_table_privilege('authenticated', t, p))
   from unnest(array['public.instagram_letture', 'public.marketing_analisi', 'public.marketing_lavori_stato']) as t,
        unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as p),
  'nessuna sessione scrive');
select is(
  (select count(*)::integer from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public'
     and table_name in ('instagram_letture', 'marketing_analisi', 'marketing_lavori_stato')),
  0, 'anon non ha nessun permesso');

-- ---------------------------------------------------------------------------
-- 2. The checks of the reading
-- ---------------------------------------------------------------------------
insert into public.instagram_letture (media_id, richiesta, motivo) values ('8000000000000001', 'completa', 'automatica');
select is(pg_temp.codice($$ update public.instagram_letture set stato = 'fatta' where media_id = '8000000000000001' $$),
  '23514', 'una lettura fatta ha l''esito della trascrizione');
select is(pg_temp.codice($$ update public.instagram_letture set stato = 'fatta', trascrizione_esito = 'senza_parlato'
  where media_id = '8000000000000001' $$),
  '23514', 'una lettura completa e fatta ha l''esito della visione');
select is(pg_temp.codice($$ update public.instagram_letture set stato = 'fatta', trascrizione_esito = 'senza_parlato',
  visione_esito = 'rifiutata' where media_id = '8000000000000001' $$),
  'ok', 'con tutti e due è fatta');
select is(pg_temp.codice($$ update public.instagram_letture set visione_esito = 'pronta' where media_id = '8000000000000001' $$),
  '23514', 'una visione pronta ha la sua scheda');
select is(pg_temp.codice($$ update public.instagram_letture set visione_esito = 'pronta', scheda = '{"a":1}'
  where media_id = '8000000000000001' $$),
  'ok', 'con la scheda sì');
select is(pg_temp.codice($$ update public.instagram_letture set visione_esito = null where media_id = '8000000000000001' $$),
  '23514', 'una scheda senza esito no (la scheda non passa con l''esito null)');
select is(pg_temp.codice($$ update public.instagram_letture set scheda = '{"a":1}', visione_esito = 'fallita'
  where media_id = '8000000000000001' $$),
  '23514', 'una scheda con una visione non pronta no');
select is(pg_temp.codice($$ update public.instagram_letture set visione_esito = 'rifiutata', scheda = null
  where media_id = '8000000000000001' $$), 'ok', 'senza scheda e rifiutata sì');
select is(pg_temp.codice($$ update public.instagram_letture set trascrizione = 'Ciao', trascrizione_esito = 'senza_audio'
  where media_id = '8000000000000001' $$),
  '23514', 'il testo c''è solo con una trascrizione pronta');
select is(pg_temp.codice($$ update public.instagram_letture set stato = 'fallita' where media_id = '8000000000000001' $$),
  '23514', 'una lettura fallita ha la sua frase');
select is(pg_temp.codice($$ update public.instagram_letture set stato = 'fallita', errore = 'La lettura non è riuscita.'
  where media_id = '8000000000000001' $$), 'ok', 'con la frase sì');
select is(pg_temp.codice($$ update public.instagram_letture set lato_px = 1000 where media_id = '8000000000000001' $$),
  '23514', 'il lato dei fotogrammi è 896 o 1280');
select is(pg_temp.codice($$ update public.instagram_letture set priorita = 3 where media_id = '8000000000000001' $$),
  '23514', 'la priorità va da 0 a 2');
select is(pg_temp.codice($$ update public.instagram_letture set segmenti = '{"a":1}' where media_id = '8000000000000001' $$),
  '23514', 'i segmenti sono un elenco');

-- ---------------------------------------------------------------------------
-- 3. The checks of the analysis
-- ---------------------------------------------------------------------------
select is(pg_temp.codice($$ insert into public.marketing_analisi (media_id, motivo, stato, periodo_da, periodo_a)
  values ('8000000000000001', 'richiesta', 'pronta', public.oggi() - 28, public.oggi() - 1) $$),
  '23514', 'una pronta ha il contenuto');
select is(pg_temp.codice($$ insert into public.marketing_analisi (media_id, motivo, stato, periodo_da, periodo_a)
  values ('8000000000000001', 'richiesta', 'fallita', public.oggi() - 28, public.oggi() - 1) $$),
  '23514', 'una fallita ha la sua frase');
select is(pg_temp.codice($$ insert into public.marketing_analisi (media_id, motivo, stato, periodo_da, periodo_a)
  values ('8000000000000001', 'richiesta', 'in_coda', public.oggi() - 1, public.oggi() - 28) $$),
  '23514', 'il periodo non è rovesciato');
select is(pg_temp.codice($$ insert into public.marketing_analisi (media_id, motivo, stato, periodo_da, periodo_a, finita_il)
  values ('8000000000000001', 'richiesta', 'in_coda', public.oggi() - 28, public.oggi() - 1, now()) $$),
  '23514', 'una in coda non è finita');
select is(pg_temp.codice($$ insert into public.marketing_analisi (media_id, motivo, periodo_da, periodo_a, eta_confronto)
  values ('8000000000000001', 'richiesta', public.oggi() - 28, public.oggi() - 1, 30) $$),
  '23514', 'il confronto è a 3 o a 7 giorni');
select is(pg_temp.codice($$ insert into public.marketing_analisi (media_id, motivo, periodo_da, periodo_a)
  values ('8000000000000001', 'settimanale', public.oggi() - 28, public.oggi() - 1) $$),
  '23514', 'le idee della settimana non ci sono ancora (1.37.0)');

insert into public.marketing_analisi (id, media_id, motivo, periodo_da, periodo_a)
values ('80800000-0000-4000-8000-000000000001', '8000000000000001', 'automatica', public.oggi() - 28, public.oggi() - 1);
select is(pg_temp.codice($$ insert into public.marketing_analisi (media_id, motivo, periodo_da, periodo_a)
  values ('8000000000000001', 'richiesta', public.oggi() - 28, public.oggi() - 1) $$),
  '23505', 'una sola analisi aperta per reel');
update public.marketing_analisi set stato = 'pronta', finita_il = now(),
  contenuto = '{"sintesi":"ok","idee":[{"name":"Una"},{"name":"Due"}]}'
where id = '80800000-0000-4000-8000-000000000001';
select is(pg_temp.codice($$ insert into public.marketing_analisi (media_id, motivo, periodo_da, periodo_a)
  values ('8000000000000001', 'automatica', public.oggi() - 28, public.oggi() - 1) $$),
  '23505', 'e una sola automatica');
select is(pg_temp.codice($$ insert into public.marketing_analisi (media_id, motivo, periodo_da, periodo_a)
  values ('8000000000000001', 'richiesta', public.oggi() - 28, public.oggi() - 1) $$),
  'ok', 'chiusa la prima, una richiesta nuova sì');
delete from public.marketing_analisi where media_id = '8000000000000001' and motivo = 'richiesta';

select is(pg_temp.codice($$ update public.marketing_lavori_stato set url_passo = 'http://esempio.test/api/cron/marketing' $$),
  '23514', 'l''indirizzo dei passi: https su un host pubblico');
select is(pg_temp.codice($$ update public.marketing_lavori_stato set url_passo = 'https://dashboard.percorsoalpha.com/api/cron/insight' $$),
  '23514', 'e il percorso è quello del marketing');
select is(pg_temp.codice($$ update public.marketing_lavori_stato set url_passo = 'http://127.0.0.1:3200/api/cron/marketing' $$),
  'ok', 'in locale va bene http su 127.0.0.1');
update public.marketing_lavori_stato set url_passo = null;
select is(pg_temp.codice($$ update public.marketing_lavori_stato set costo_max_mese = 201 $$),
  '23514', 'il limite di spesa va da 0 a 200');
select is(pg_temp.codice($$ update public.marketing_lavori_stato set passo_id = gen_random_uuid() $$),
  '23514', 'il passo ha il suo lavoro');

-- ---------------------------------------------------------------------------
-- 4. The speech in the proposals
-- ---------------------------------------------------------------------------
insert into public.marketing_contenuti (id, tipo, nome, stato) values
  ('80800000-0000-4000-8000-0000000000c1', 'reel', 'Contenuto del test 80', 'posted');
select is(pg_temp.codice($$ insert into public.marketing_abbinamenti (shortcode, contenuto_id, esito, punteggio, somiglianza, motivi)
  values ('T80Reel01', '80800000-0000-4000-8000-0000000000c1', 'proposto', 40, 0.4, array['parlato_simile']) $$),
  'ok', 'il parlato simile è un motivo ammesso');
select is(pg_temp.codice($$ update public.marketing_abbinamenti set motivi = array['altro'] $$),
  '23514', 'un motivo inventato no');
delete from public.marketing_abbinamenti where shortcode = 'T80Reel01';

-- ---------------------------------------------------------------------------
-- 5. Who reads
-- ---------------------------------------------------------------------------
insert into public.invites (email, ruolo) values ('marketing80@alpha.test', 'marketing'), ('nutrizione80@alpha.test', 'nutrizione');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999990080',
   'authenticated', 'authenticated', 'marketing80@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Marco Ottanta"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999990180',
   'authenticated', 'authenticated', 'nutrizione80@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Nora Ottanta"}'::jsonb, now(), now(), '', '', '', '');
update public.profiles set attivo = false where id = '99999999-9999-4999-8999-999999990080';

create temp table viste80 (persona text, letture bigint, analisi bigint, stato bigint, errore text) on commit drop;
grant select, insert on viste80 to authenticated, anon;
create or replace function pg_temp.conta80(p_persona text)
returns void
language plpgsql
as $$
declare
  a bigint; b bigint; c bigint;
begin
  select count(*) into a from public.instagram_letture;
  select count(*) into b from public.marketing_analisi;
  select count(*) into c from public.marketing_lavori_stato;
  insert into pg_temp.viste80 values (p_persona, a, b, c, null);
exception when others then
  insert into pg_temp.viste80 values (p_persona, null, null, null, sqlstate);
end;
$$;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
do $$ begin perform pg_temp.conta80('admin'); end $$;
set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
do $$ begin perform pg_temp.conta80('editor'); end $$;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
do $$ begin perform pg_temp.conta80('marketing'); end $$;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
do $$ begin perform pg_temp.conta80('setter'); end $$;
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
do $$ begin perform pg_temp.conta80('closer'); end $$;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
do $$ begin perform pg_temp.conta80('coach'); end $$;
set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999990180","role":"authenticated"}';
do $$ begin perform pg_temp.conta80('nutrizione'); end $$;
set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999990080","role":"authenticated"}';
do $$ begin perform pg_temp.conta80('marketing_spento'); end $$;
-- a Claude OAuth token of the admin: the three tables refuse it
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111',
  'role', 'authenticated', 'client_id', '7c000000-0000-4000-8000-000000000001',
  'session_id', '7e000000-0000-4000-8000-000000000001')::text, true);
do $$ begin perform pg_temp.conta80('oauth'); end $$;
reset role;
set local request.jwt.claims to '{}';
set local role anon;
do $$ begin perform pg_temp.conta80('anon'); end $$;
reset role;

select is(
  (select array_agg(persona order by persona) from viste80 where letture > 0 and analisi > 0),
  array['admin', 'editor', 'marketing'],
  'le letture e le analisi le leggono l''admin, il video editor e il marketing');
select is(
  (select array_agg(persona order by persona) from viste80 where letture = 0 and analisi = 0),
  array['closer', 'coach', 'marketing_spento', 'nutrizione', 'oauth', 'setter'],
  'setter, closer, coach, nutrizione, un account disattivato e un token di Claude non vedono niente');
select is((select array_agg(persona order by persona) from viste80 where stato > 0), array['admin'],
  'lo stato dei lavori, con il costo, lo legge solo l''admin');
select is((select errore from viste80 where persona = 'anon'), '42501', 'anon nemmeno');

-- ---------------------------------------------------------------------------
-- 6. A content born from an idea of Claude
-- ---------------------------------------------------------------------------
-- 8080...01 is ready with 2 ideas (indexes 0 and 1)
set local role authenticated;
set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
select is(pg_temp.codice($$ insert into public.marketing_contenuti (id, tipo, nome, da_analisi, da_idea)
  values ('80800000-0000-4000-8000-0000000000a1', 'reel', 'Idea 0', '80800000-0000-4000-8000-000000000001', 0) $$),
  'ok', 'il video editor aggiunge al calendario una idea valida');
select is(pg_temp.codice($$ insert into public.marketing_contenuti (id, tipo, nome, da_analisi, da_idea)
  values ('80800000-0000-4000-8000-0000000000a2', 'reel', 'Idea 0 bis', '80800000-0000-4000-8000-000000000001', 0) $$),
  '23505', 'la stessa idea due volte no');
select is(pg_temp.codice($$ insert into public.marketing_contenuti (tipo, nome, da_idea) values ('reel', 'Senza analisi', 1) $$),
  '22023', 'un''idea senza analisi no');
select is(pg_temp.codice($$ insert into public.marketing_contenuti (tipo, nome, da_analisi)
  values ('reel', 'Senza indice', '80800000-0000-4000-8000-000000000001') $$),
  '22023', 'un''analisi senza idea no');
select is(pg_temp.codice($$ insert into public.marketing_contenuti (tipo, nome, da_analisi, da_idea)
  values ('reel', 'Idea 2', '80800000-0000-4000-8000-000000000001', 2) $$),
  '22023', 'un''idea oltre quelle dell''analisi no');
select is(pg_temp.codice($$ insert into public.marketing_contenuti (tipo, nome, da_analisi, da_idea)
  values ('reel', 'Analisi che non c''è', gen_random_uuid(), 0) $$),
  '22023', 'un''analisi che non c''è no');
select is(pg_temp.codice($$ update public.marketing_contenuti set da_idea = 1 where id = '80800000-0000-4000-8000-0000000000a1' $$),
  '42501', 'il legame con l''idea non si cambia da una sessione');
select is(pg_temp.codice($$ update public.marketing_contenuti set nome = 'Idea 0 rinominata' where id = '80800000-0000-4000-8000-0000000000a1' $$),
  'ok', 'ma il contenuto si modifica come gli altri');
reset role;
set local request.jwt.claims to '{}';

-- an analysis not ready
insert into public.marketing_analisi (id, media_id, motivo, periodo_da, periodo_a)
values ('80800000-0000-4000-8000-000000000002', '8000000000000002', 'richiesta', public.oggi() - 28, public.oggi() - 1);
set local role authenticated;
set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
select is(pg_temp.codice($$ insert into public.marketing_contenuti (tipo, nome, da_analisi, da_idea)
  values ('reel', 'Da analisi non pronta', '80800000-0000-4000-8000-000000000002', 0) $$),
  '22023', 'un''analisi non pronta non ha idee da aggiungere');
reset role;
set local request.jwt.claims to '{}';

-- Claude through the MCP server: only if it touches the origin
select set_config('request.jwt.claims', json_build_object('sub', '11111111-1111-4111-8111-111111111111',
  'role', 'authenticated', 'client_id', '7c000000-0000-4000-8000-000000000001')::text, true);
select is(pg_temp.codice($$ insert into public.marketing_contenuti (tipo, nome, da_analisi, da_idea)
  values ('reel', 'Dal token', '80800000-0000-4000-8000-000000000001', 1) $$),
  '42501', 'un token di Claude non scrive l''origine di un''idea');
select is(pg_temp.codice($$ update public.marketing_contenuti set nome = 'Modificato da Claude'
  where id = '80800000-0000-4000-8000-0000000000a1' $$),
  'ok', 'ma modifica un contenuto nato da un''idea come gli altri');
select is(pg_temp.codice($$ update public.marketing_contenuti set da_idea = 1 where id = '80800000-0000-4000-8000-0000000000a1' $$),
  '42501', 'il legame con l''idea no');
set local request.jwt.claims to '{}';

-- the prune: the service role's «set null» passes and leaves the idea's index
update public.marketing_analisi set stato = 'fallita', errore = 'x', contenuto = null, finita_il = now()
where id = '80800000-0000-4000-8000-000000000001';
select is(pg_temp.codice($$ delete from public.marketing_analisi where id = '80800000-0000-4000-8000-000000000001' $$),
  'ok', 'la potatura di un''analisi passa');
select is(
  (select row(da_analisi, da_idea)::text from public.marketing_contenuti where id = '80800000-0000-4000-8000-0000000000a1'),
  row(null::uuid, 0::smallint)::text,
  'il contenuto resta, senza analisi: «Nato da un''idea di Claude» senza link');

-- ---------------------------------------------------------------------------
-- 7. Backup
-- ---------------------------------------------------------------------------
select ok(public.backup_completo() ?& array['instagram_letture', 'marketing_analisi', 'marketing_lavori_stato'],
  'il backup ha le tabelle nuove');

select * from finish();
rollback;
