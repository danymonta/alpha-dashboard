-- Insight ultime 24h (1.35.0, Dany 08 to 10/10/2026): the tables. The admin and
-- every active setter read the recaps and tick the shared Fatto switches
-- (never delete them); the runs, the automation, the Messenger Page and its
-- exclusions are the admin's; the chats, the profiles, the AI blocks and the
-- cards (third-party DM text) are read by no session at all, only by the
-- service role. anon has nothing. The recap is always upserted (a delete would
-- take its Fatto rows), the Fatto key never carries a username (Realtime), and
-- the weekly backup never takes an insight_* table.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(112);

-- ---------------------------------------------------------------------------
-- People: a second active setter, a deactivated setter, nutrizione and dev
-- ---------------------------------------------------------------------------
insert into public.invites (email, ruolo) values
  ('setter76@alpha.test', 'setter'),
  ('spento76@alpha.test', 'setter'),
  ('nutrizione76@alpha.test', 'nutrizione'),
  ('dev76@alpha.test', 'dev');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999990076',
   'authenticated', 'authenticated', 'setter76@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Sergio Settantasei"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999990176',
   'authenticated', 'authenticated', 'spento76@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Spento Settantasei"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999990276',
   'authenticated', 'authenticated', 'nutrizione76@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Nadia Settantasei"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '99999999-9999-4999-8999-999999990376',
   'authenticated', 'authenticated', 'dev76@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Davide Settantasei"}'::jsonb, now(), now(), '', '', '', '');
update public.profiles set attivo = false where id = '99999999-9999-4999-8999-999999990176';

-- ---------------------------------------------------------------------------
-- A row in every Insight table (as postgres: the service role's place), so
-- "0 rows" below means RLS, not an empty table
-- ---------------------------------------------------------------------------
insert into public.insight_esecuzioni (id, giorno, motivo, stato, passo, finita_il) values
  ('76760000-0000-4000-8000-000000000001', public.oggi() - 3, 'manuale', 'pronta', 'unione', now() - interval '3 days');
insert into public.insight_recap (giorno, canale, esecuzione_id, generato_il, stato, dati) values
  (public.oggi() - 3, 'instagram', '76760000-0000-4000-8000-000000000001', now() - interval '3 days', 'completo',
   '{"date":"2026-10-01","leads":[{"username":"lead.settantasei","conversation_id":"c76"}]}'::jsonb);
insert into public.insight_chat (id, canale, conversazione_id, username, messaggi, messaggi_letti, completa,
  ultimo_da, ultimo_il, letta_da) values
  ('76761111-0000-4000-8000-000000000001', 'instagram', 'c76', 'lead.settantasei',
   jsonb_build_array(jsonb_build_object('da', 'lead', 'il', now() - interval '1 hour', 'testo', 'Ciao, ho visto il reel',
                                        'codici', '[]'::jsonb, 'storia', false)),
   1, true, 'lead', now() - interval '1 hour', '76760000-0000-4000-8000-000000000001');
insert into public.insight_profili (username, nome, follower) values ('lead.settantasei', 'Lead Settantasei', 120);
insert into public.insight_blocchi (esecuzione_id, canale, tipo, indice, chiavi, stato) values
  ('76760000-0000-4000-8000-000000000001', 'instagram', 'schede', 0, array['c76'], 'fatto');
insert into public.insight_schede (esecuzione_id, giorno, canale, tipo, chiave, impronta, dati) values
  ('76760000-0000-4000-8000-000000000001', public.oggi() - 3, 'instagram', 'lead', 'c76', repeat('a', 64), '{}'::jsonb);
insert into public.messenger_esclusi (utente_id, nome, motivo) values ('7600000000000001', 'Cliente Settantasei', 'Cliente');

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

-- every Insight table counted by one person: the rows, or the error
create temp table viste (persona text, tabella text, righe bigint, errore text) on commit drop;
grant select, insert on viste to authenticated, anon;

create or replace function pg_temp.conta_insight(p_persona text)
returns void
language plpgsql
as $$
declare
  t text;
  n bigint;
begin
  foreach t in array array['insight_impostazioni', 'insight_esecuzioni', 'insight_chat', 'insight_profili',
                           'insight_blocchi', 'insight_schede', 'insight_recap', 'insight_fatto',
                           'messenger_collegamento', 'messenger_esclusi'] loop
    begin
      execute format('select count(*) from public.%I', t) into n;
      insert into pg_temp.viste values (p_persona, t, n, null);
    exception when others then
      insert into pg_temp.viste values (p_persona, t, null, sqlstate);
    end;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. Schema
-- ---------------------------------------------------------------------------
select has_table('public', t, 'la tabella ' || t || ' c''è')
from unnest(array['insight_impostazioni', 'insight_esecuzioni', 'insight_chat', 'insight_profili',
                  'insight_blocchi', 'insight_schede', 'insight_recap', 'insight_fatto',
                  'messenger_collegamento', 'messenger_esclusi']) as t;
select enum_has_labels('public', 'insight_canale', array['instagram', 'messenger'], 'i due canali');
select enum_has_labels('public', 'insight_stato_esecuzione', array['in_coda', 'in_corso', 'pronta', 'fallita'],
  'gli stati di un''esecuzione');
select enum_has_labels('public', 'insight_passo', array['lettura', 'analisi', 'unione'], 'i tre passi');
select ok(
  (select bool_and(c.relrowsecurity) from pg_class c
   where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
     and (c.relname like 'insight\_%' or c.relname like 'messenger\_%')),
  'RLS attiva su ogni tabella nuova'
);
select is((select count(*)::integer from public.insight_impostazioni), 1, 'l''automazione ha la sua riga, già pronta');
select is(
  (select row(attivo, ora, anticipo_minuti, url_passo, storico_dal)::text from public.insight_impostazioni),
  row(false, time '19:00', 15, null::text, null::date)::text,
  'spenta, pronta alle 19:00, parte 15 minuti prima, senza indirizzo né storico'
);
select is((select count(*)::integer from public.messenger_collegamento), 1, 'il collegamento di Messenger ha la sua riga');
select is((select count(*)::integer from vault.secrets where name = 'insight_chiave'), 1,
  'la chiave dei passi è nel Vault, una sola');

-- ---------------------------------------------------------------------------
-- 2. Policies, exactly
-- ---------------------------------------------------------------------------
select policies_are('public', 'insight_impostazioni', array['insight_impostazioni_admin_lettura'],
  'l''automazione: solo la lettura dell''admin');
select policies_are('public', 'insight_esecuzioni', array['insight_esecuzioni_admin_lettura'],
  'le esecuzioni: solo la lettura dell''admin');
select policies_are('public', 'insight_chat', array['insight_chat_nessuna_sessione'],
  'le chat: nessuna sessione');
select policies_are('public', 'insight_profili', array['insight_profili_nessuna_sessione'],
  'i profili: nessuna sessione');
select policies_are('public', 'insight_blocchi', array['insight_blocchi_nessuna_sessione'],
  'i blocchi: nessuna sessione');
select policies_are('public', 'insight_schede', array['insight_schede_nessuna_sessione'],
  'le schede: nessuna sessione');
select policies_are('public', 'insight_recap', array['insight_recap_lettura'],
  'il recap: solo la lettura');
select policies_are('public', 'insight_fatto',
  array['insight_fatto_lettura', 'insight_fatto_inserimento', 'insight_fatto_modifica'],
  'Fatto: lettura, inserimento e modifica, nessuna eliminazione');
select policies_are('public', 'messenger_collegamento', array['messenger_collegamento_admin_lettura'],
  'il collegamento di Messenger: solo la lettura dell''admin');
select policies_are('public', 'messenger_esclusi', array['messenger_esclusi_admin'],
  'le chat escluse di Messenger: l''admin');

-- ---------------------------------------------------------------------------
-- 3. Grants: anon nothing; the tables no session writes
-- ---------------------------------------------------------------------------
select is(
  (select count(*)::integer from information_schema.role_table_grants
   where grantee = 'anon' and table_schema = 'public'
     and (table_name like 'insight\_%' or table_name like 'messenger\_%')),
  0,
  'anon non ha nessun permesso sulle tabelle nuove'
);
select ok(
  (select bool_and(not has_table_privilege('authenticated', t, p))
   from unnest(array['public.insight_chat', 'public.insight_profili', 'public.insight_blocchi',
                     'public.insight_schede']) as t,
        unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as p),
  'chat, profili, blocchi e schede: nessun permesso alle sessioni'
);
select ok(
  (select bool_and(not has_table_privilege('authenticated', t, p) and has_table_privilege('authenticated', t, 'SELECT'))
   from unnest(array['public.insight_impostazioni', 'public.insight_esecuzioni', 'public.insight_recap',
                     'public.messenger_collegamento']) as t,
        unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) as p),
  'automazione, esecuzioni, recap e collegamento di Messenger: le sessioni li leggono e basta'
);
select ok(
  not has_table_privilege('authenticated', 'public.insight_fatto', 'DELETE')
  and not has_table_privilege('authenticated', 'public.insight_fatto', 'TRUNCATE')
  and has_table_privilege('authenticated', 'public.insight_fatto', 'INSERT')
  and has_table_privilege('authenticated', 'public.insight_fatto', 'UPDATE'),
  'Fatto si accende e si spegne, non si cancella'
);
select ok(
  not has_table_privilege('authenticated', 'public.messenger_esclusi', 'TRUNCATE'),
  'le chat escluse di Messenger non si svuotano con un truncate (salterebbe RLS)'
);

-- ---------------------------------------------------------------------------
-- 4. Who reads what, person by person
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
do $$ begin perform pg_temp.conta_insight('admin'); end $$;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
do $$ begin perform pg_temp.conta_insight('setter'); end $$;
set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999990076","role":"authenticated"}';
do $$ begin perform pg_temp.conta_insight('setter_secondo'); end $$;
set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999990176","role":"authenticated"}';
do $$ begin perform pg_temp.conta_insight('setter_spento'); end $$;
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
do $$ begin perform pg_temp.conta_insight('closer'); end $$;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
do $$ begin perform pg_temp.conta_insight('coach'); end $$;
set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
do $$ begin perform pg_temp.conta_insight('editor'); end $$;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
do $$ begin perform pg_temp.conta_insight('marketing'); end $$;
set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999990276","role":"authenticated"}';
do $$ begin perform pg_temp.conta_insight('nutrizione'); end $$;
set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999990376","role":"authenticated"}';
do $$ begin perform pg_temp.conta_insight('dev'); end $$;
reset role;
set local request.jwt.claims to '{}';
set local role anon;
do $$ begin perform pg_temp.conta_insight('anon'); end $$;
reset role;

select is((select count(distinct persona)::integer from viste), 11, 'undici persone hanno contato le dieci tabelle');
select is(
  (select array_agg(persona order by persona) from viste where tabella = 'insight_recap' and righe > 0),
  array['admin', 'setter', 'setter_secondo'],
  'il recap lo leggono l''admin e ogni setter attivo, nessun altro'
);
select is(
  (select array_agg(persona order by persona) from viste where tabella = 'insight_fatto' and righe > 0),
  array['admin', 'setter', 'setter_secondo'],
  'Fatto lo leggono gli stessi'
);
select is(
  (select array_agg(distinct persona order by persona) from viste
   where tabella in ('insight_esecuzioni', 'insight_impostazioni', 'messenger_collegamento', 'messenger_esclusi')
     and righe > 0),
  array['admin'],
  'esecuzioni, automazione, collegamento e chat escluse di Messenger: solo l''admin'
);
select is(
  (select count(*)::integer from viste where tabella in ('insight_esecuzioni', 'insight_impostazioni',
     'messenger_collegamento', 'messenger_esclusi') and persona = 'admin' and righe > 0),
  4,
  'e l''admin le legge tutte e quattro'
);
select is(
  (select count(*)::integer from viste
   where tabella in ('insight_chat', 'insight_profili', 'insight_blocchi', 'insight_schede') and righe > 0),
  0,
  'chat, profili, blocchi e schede: nessuno, nemmeno l''admin'
);
select is(
  (select array_agg(distinct errore) from viste
   where tabella in ('insight_chat', 'insight_profili', 'insight_blocchi', 'insight_schede')),
  array['42501'],
  'e a chiunque ci provi il database risponde che non ha il permesso'
);
select is(
  (select array_agg(distinct coalesce(errore, 'righe')) from viste where persona = 'anon'),
  array['42501'],
  'anon non legge nessuna tabella dell''Insight'
);

-- ---------------------------------------------------------------------------
-- 5. Writes: Fatto for the readers, nothing else by a session
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select lives_ok(
  $$ insert into public.insight_fatto (giorno, canale, chiave, fatto)
     values (public.oggi() - 3, 'instagram', 'lead.settantasei', true)
     on conflict (giorno, canale, chiave) do update set fatto = excluded.fatto $$,
  'il setter segna Fatto una chat'
);
select is(
  pg_temp.righe($$ update public.insight_fatto set fatto = false
                   where giorno = public.oggi() - 3 and chiave = 'lead.settantasei' $$),
  1,
  'e lo toglie'
);
set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999990076","role":"authenticated"}';
select lives_ok(
  $$ insert into public.insight_fatto (giorno, canale, chiave, fatto)
     values (public.oggi() - 3, 'instagram', 'lead.settantasei', true)
     on conflict (giorno, canale, chiave) do update set fatto = excluded.fatto $$,
  'un altro setter lo rimette con lo stesso upsert della pagina'
);
select is(
  (select fatto from public.insight_fatto where giorno = public.oggi() - 3 and chiave = 'lead.settantasei'),
  true,
  'una riga sola per chat, condivisa'
);
select throws_ok(
  $$ delete from public.insight_fatto where giorno = public.oggi() - 3 $$,
  '42501', null,
  'nessuno cancella un Fatto'
);
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok(
  $$ delete from public.insight_fatto where giorno = public.oggi() - 3 $$,
  '42501', null,
  'nemmeno l''admin'
);
select is(
  pg_temp.righe($$ update public.insight_fatto set fatto = false
                   where giorno = public.oggi() - 3 and chiave = 'lead.settantasei' $$),
  1,
  'l''admin lo spegne come il setter'
);
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select throws_ok(
  $$ insert into public.insight_fatto (giorno, canale, chiave, fatto)
     values (public.oggi() - 3, 'instagram', 'altro.lead', true) $$,
  '42501', null,
  'il closer non segna Fatto'
);
select is(
  pg_temp.righe($$ update public.insight_fatto set fatto = true where giorno = public.oggi() - 3 $$),
  0,
  'e non ne cambia nessuno'
);
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select throws_ok(
  $$ insert into public.insight_fatto (giorno, canale, chiave, fatto)
     values (public.oggi() - 3, 'instagram', 'altro.lead', true) $$,
  '42501', null,
  'il marketing nemmeno'
);
set local request.jwt.claims to '{"sub":"99999999-9999-4999-8999-999999990176","role":"authenticated"}';
select throws_ok(
  $$ insert into public.insight_fatto (giorno, canale, chiave, fatto)
     values (public.oggi() - 3, 'instagram', 'altro.lead', true) $$,
  '42501', null,
  'né un setter disattivato'
);

-- the admin: nothing written by hand outside Fatto and the Messenger exclusions
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok(
  $$ insert into public.insight_recap (giorno, canale, generato_il, stato, dati)
     values (public.oggi() - 4, 'instagram', now(), 'completo', '{}') $$,
  '42501', null,
  'l''admin non scrive un recap a mano'
);
select throws_ok(
  $$ update public.insight_impostazioni set attivo = true where id $$,
  '42501', null,
  'né l''automazione: passa dalla sua funzione'
);
select throws_ok(
  $$ insert into public.insight_esecuzioni (giorno, motivo) values (public.oggi(), 'manuale') $$,
  '42501', null,
  'né un''esecuzione'
);
select throws_ok(
  $$ update public.messenger_collegamento set pagina_nome = 'Altra' where id $$,
  '42501', null,
  'né il collegamento di Messenger'
);
select throws_ok(
  $$ insert into public.insight_chat (canale, conversazione_id) values ('instagram', 'c77') $$,
  '42501', null,
  'né una chat'
);
select throws_ok(
  $$ update public.insight_profili set nome = 'Altro' $$,
  '42501', null,
  'né un profilo'
);
select throws_ok(
  $$ delete from public.insight_schede $$,
  '42501', null,
  'né cancella una scheda'
);
select throws_ok(
  $$ insert into public.insight_blocchi (esecuzione_id, canale, tipo, indice)
     values ('76760000-0000-4000-8000-000000000001', 'instagram', 'sintesi', 0) $$,
  '42501', null,
  'né un blocco'
);
select lives_ok(
  $$ insert into public.messenger_esclusi (utente_id, nome, motivo) values ('7600000000000002', 'Amico Settantasei', 'Amico') $$,
  'l''admin esclude una chat di Messenger'
);
select is(
  (select created_by from public.messenger_esclusi where utente_id = '7600000000000002'),
  '11111111-1111-4111-8111-111111111111'::uuid,
  'col suo nome'
);
select is(
  pg_temp.righe($$ delete from public.messenger_esclusi where utente_id = '7600000000000002' $$),
  1,
  'e la rimette'
);
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok(
  $$ insert into public.messenger_esclusi (utente_id, nome) values ('7600000000000003', 'Altro') $$,
  '42501', null,
  'il setter non esclude una chat di Messenger'
);
select is(
  pg_temp.righe($$ delete from public.messenger_esclusi $$),
  0,
  'e non ne toglie'
);
select throws_ok(
  $$ insert into public.insight_recap (giorno, canale, generato_il, stato, dati)
     values (public.oggi() - 4, 'instagram', now(), 'completo', '{}') $$,
  '42501', null,
  'né scrive un recap'
);
reset role;
set local request.jwt.claims to '{}';

-- ---------------------------------------------------------------------------
-- 6. Keys and Realtime: no username in a Fatto key
-- ---------------------------------------------------------------------------
select col_is_pk('public', 'insight_fatto', array['id'], 'la chiave di Fatto è solo il suo id');
select col_is_unique('public', 'insight_fatto', array['giorno', 'canale', 'chiave'], 'una riga per giorno, canale e chat');
select ok(
  exists (select 1 from pg_publication_tables
          where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'insight_fatto'),
  'Fatto arriva in tempo reale'
);
select is(
  (select c.relreplident::text from pg_class c where c.oid = 'public.insight_fatto'::regclass),
  'd',
  'e un DELETE manda solo la chiave primaria (nessun username)'
);
select is(
  (select count(*)::integer from pg_publication_tables
   where pubname = 'supabase_realtime' and schemaname = 'public'
     and (tablename like 'insight\_%' or tablename like 'messenger\_%') and tablename <> 'insight_fatto'),
  0,
  'nessun''altra tabella dell''Insight è in tempo reale'
);
select col_is_pk('public', 'insight_recap', array['giorno', 'canale'], 'un recap per giorno e canale');
select hasnt_column('public', 'insight_fatto', 'created_by', 'Fatto non dice chi l''ha toccato');
select hasnt_column('public', 'insight_fatto', 'created_at', 'né quando');

-- ---------------------------------------------------------------------------
-- 7. Constraints
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.insight_fatto (giorno, canale, chiave, fatto) values ('2020-01-01', 'instagram', 'x', true) $$,
  '23503', null,
  'un Fatto senza il suo recap no'
);
select throws_ok(
  $$ insert into public.insight_fatto (giorno, canale, chiave, fatto) values (public.oggi() - 3, 'instagram', '', true) $$,
  '23514', null,
  'né con una chiave vuota'
);
select throws_ok(
  $$ insert into public.insight_chat (canale, conversazione_id, username) values ('instagram', 'c78', 'Mario.Rossi') $$,
  '23514', null,
  'uno username con le maiuscole no'
);
select throws_ok(
  $$ insert into public.insight_chat (canale, conversazione_id, username) values ('instagram', 'c78', '@mario') $$,
  '23514', null,
  'né con la chiocciola'
);
select throws_ok(
  $$ insert into public.insight_chat (canale, conversazione_id, utente_id) values ('messenger', 'c78', 'abc123') $$,
  '23514', null,
  'un PSID che non è di sole cifre no'
);
select throws_ok(
  $$ insert into public.messenger_esclusi (utente_id, nome) values ('psid-1', 'Prova') $$,
  '23514', null,
  'nemmeno tra le chat escluse'
);
select throws_ok(
  $$ insert into public.insight_chat (canale, conversazione_id, messaggi) values ('instagram', 'c78', '{"a":1}') $$,
  '23514', null,
  'i messaggi sono un elenco'
);
select throws_ok(
  $$ insert into public.insight_chat (canale, conversazione_id, messaggi)
     select 'instagram', 'c78', jsonb_agg(jsonb_build_object('da', 'lead', 'testo', 'x')) from generate_series(1, 26) $$,
  '23514', null,
  'al massimo 25'
);
select throws_ok(
  $$ insert into public.insight_chat (canale, conversazione_id, non_lead, messaggi)
     values ('instagram', 'c78', true, '[{"da":"lead","testo":"x"}]') $$,
  '23514', null,
  'un non lead non tiene messaggi'
);
select throws_ok(
  $$ insert into public.insight_chat (canale, conversazione_id, minore_14, messaggi)
     values ('instagram', 'c78', true, '[{"da":"lead","testo":"x"}]') $$,
  '23514', null,
  'un minore di 14 anni nemmeno'
);
select throws_ok(
  $$ insert into public.insight_chat (canale, conversazione_id, minore_14, codici_condivisi)
     values ('instagram', 'c78', true, array['SeedDemo01']) $$,
  '23514', null,
  'né i codici dei post condivisi'
);
select throws_ok(
  $$ insert into public.insight_chat (canale, conversazione_id, origine_tipo, origine_il, origine_giorno)
     values ('instagram', 'c78', 'testo', now(), public.oggi()) $$,
  '23514', null,
  'un''origine dal testo senza il post no'
);
select throws_ok(
  $$ insert into public.insight_chat (canale, conversazione_id, origine_tipo, origine_shortcode, origine_il)
     values ('instagram', 'c78', 'condivisione', 'SeedDemo01', now()) $$,
  '23514', null,
  'né un''origine senza il suo giorno'
);
select lives_ok(
  $$ insert into public.insight_chat (canale, conversazione_id, origine_tipo, origine_il, origine_giorno)
     values ('instagram', 'c79', 'storia', now(), public.oggi()) $$,
  'una risposta a una storia senza post sì'
);
select throws_ok(
  $$ update public.insight_impostazioni set ora = '19:03' where id $$,
  '23514', null,
  'l''orario va a passi di 5 minuti'
);
select lives_ok($$ update public.insight_impostazioni set ora = '19:05' where id $$, '19:05 va bene');
select throws_ok(
  $$ update public.insight_impostazioni set url_passo = 'http://esempio.it/api/cron/insight' where id $$,
  '23514', null,
  'un indirizzo http su un host che non è locale no'
);
select throws_ok(
  $$ update public.insight_impostazioni set url_passo = 'https://dashboard.percorsoalpha.com/api/cron/altro' where id $$,
  '23514', null,
  'né un percorso che non è quello dei passi'
);
select lives_ok(
  $$ update public.insight_impostazioni set url_passo = 'https://dashboard.percorsoalpha.com/api/cron/insight' where id $$,
  'l''indirizzo https dell''app sì'
);
select lives_ok(
  $$ update public.insight_impostazioni set url_passo = 'http://host.docker.internal:3200/api/cron/insight' where id $$,
  'e quello locale con cui Supabase raggiunge il server di sviluppo'
);
select throws_ok(
  $$ update public.insight_impostazioni set anticipo_minuti = 4 where id $$,
  '23514', null,
  'l''anticipo va da 5 minuti'
);
select throws_ok(
  $$ update public.insight_impostazioni set anticipo_minuti = 61 where id $$,
  '23514', null,
  'a un''ora'
);
select throws_ok(
  $$ insert into public.insight_impostazioni (id) values (false) $$,
  '23514', null,
  'l''automazione ha una riga sola'
);
select throws_ok(
  $$ insert into public.messenger_collegamento (id) values (false) $$,
  '23514', null,
  'il collegamento di Messenger anche'
);
select throws_ok(
  $$ insert into public.insight_recap (giorno, canale, generato_il, stato, dati)
     values (public.oggi() - 4, 'instagram', now(), 'completo', '[]') $$,
  '23514', null,
  'il documento del recap è un oggetto'
);
select throws_ok(
  $$ insert into public.insight_schede (esecuzione_id, giorno, canale, tipo, chiave, impronta, dati)
     values ('76760000-0000-4000-8000-000000000001', public.oggi(), 'instagram', 'lead', 'c80', 'abc', '{}') $$,
  '23514', null,
  'l''impronta di una scheda è uno sha-256'
);

-- ---------------------------------------------------------------------------
-- 8. The recap is upserted: its Fatto rows stay
-- ---------------------------------------------------------------------------
insert into public.insight_fatto (giorno, canale, chiave, fatto)
values (public.oggi() - 3, 'instagram', 'altro.lead', true);
select lives_ok(
  $$ insert into public.insight_recap (giorno, canale, generato_il, stato, dati)
     values (public.oggi() - 3, 'instagram', now(), 'parziale', '{"date":"rifatto"}')
     on conflict (giorno, canale) do update
       set generato_il = excluded.generato_il, stato = excluded.stato, dati = excluded.dati $$,
  'un recap rifatto si scrive sopra quello di prima'
);
select is(
  (select count(*)::integer from public.insight_fatto where giorno = public.oggi() - 3 and canale = 'instagram'),
  2,
  'e i suoi Fatto restano'
);
select is(
  (select dati->>'date' from public.insight_recap where giorno = public.oggi() - 3 and canale = 'instagram'),
  'rifatto',
  'col documento nuovo'
);

-- ---------------------------------------------------------------------------
-- 9. One run at a time, one planned run per day
-- ---------------------------------------------------------------------------
insert into public.insight_esecuzioni (giorno, motivo, stato) values (public.oggi() + 5, 'manuale', 'in_coda');
select throws_ok(
  $$ insert into public.insight_esecuzioni (giorno, motivo, stato) values (public.oggi() + 5, 'manuale', 'in_corso') $$,
  '23505', null,
  'due esecuzioni attive insieme no'
);
insert into public.insight_esecuzioni (giorno, motivo, stato) values (public.oggi() + 6, 'pianificata', 'fallita');
select throws_ok(
  $$ insert into public.insight_esecuzioni (giorno, motivo, stato) values (public.oggi() + 6, 'pianificata', 'pronta') $$,
  '23505', null,
  'due esecuzioni pianificate per lo stesso giorno no'
);
select lives_ok(
  $$ insert into public.insight_esecuzioni (giorno, motivo, stato) values (public.oggi() + 6, 'manuale', 'pronta') $$,
  'una manuale lo stesso giorno sì'
);
select throws_ok(
  $$ update public.insight_esecuzioni set errore = repeat('x', 501) where id = '76760000-0000-4000-8000-000000000001' $$,
  '23514', null,
  'l''errore di un''esecuzione sta in 500 caratteri'
);
select throws_ok(
  $$ update public.insight_esecuzioni set invocazioni = 41 where id = '76760000-0000-4000-8000-000000000001' $$,
  '23514', null,
  'al massimo 40 invocazioni'
);

-- ---------------------------------------------------------------------------
-- 10. The backup: never an insight_* table
-- ---------------------------------------------------------------------------
create temp table backup76 (dati jsonb) on commit drop;
grant all on backup76 to service_role;
set local role service_role;
set local request.jwt.claims to '{"role":"service_role"}';
insert into backup76 select public.backup_completo();
reset role;
set local request.jwt.claims to '{}';
select is(
  (select coalesce(array_agg(k order by k), '{}') from backup76, jsonb_object_keys(dati) as k where k like 'insight\_%'),
  '{}'::text[],
  'il backup non prende mai una tabella insight_*'
);
select ok(
  (select dati ? 'instagram_contenuti_dm' and dati ? 'messenger_esclusi' and dati ? 'messenger_collegamento'
          and dati ? 'instagram_contenuti' and dati ? 'instagram_esclusi' and dati ? 'report_proposte_instagram'
   from backup76),
  'e tiene i conteggi per post, Messenger, i post e le proposte'
);
select is(
  (select position('Cliente Settantasei' in (dati->'messenger_esclusi')::text) > 0 from backup76),
  true,
  'le chat escluse di Messenger ci sono, col loro nome'
);

-- ---------------------------------------------------------------------------
-- 11. The comment of instagram_contenuti points to the counts
-- ---------------------------------------------------------------------------
select ok(
  obj_description('public.instagram_contenuti'::regclass, 'pg_class') like '%instagram_contenuti_dm%',
  'il commento dei post dice dove sono i lead per post'
);

select * from finish();
rollback;
