-- The link with Fathom (1.37.0, 20261018090000_fathom.sql): one row, the key only in Vault,
-- read by the service role. Only the admin sets, removes and knows about the key.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(21);

create or replace function pg_temp.codice(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end; $$;

select has_table('public', 'fathom_collegamento', 'il collegamento con Fathom ha la sua tabella');
select is((select count(*)::integer from public.fathom_collegamento), 1, 'una riga sola');
select throws_ok($$ insert into public.fathom_collegamento (id) values (false) $$, '23514', null, 'e non se ne aggiungono');
select ok((select relrowsecurity from pg_class where oid = 'public.fathom_collegamento'::regclass), 'RLS attiva');
select policies_are('public', 'fathom_collegamento', array['fathom_collegamento_admin', 'fathom_collegamento_mai_da_oauth'],
  'solo l''admin legge, e nessun token di Claude');
select ok((select bool_and(not has_table_privilege('authenticated', 'public.fathom_collegamento', p))
           from unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p), 'nessuna sessione scrive');
select is((select count(*)::integer from information_schema.role_table_grants
           where grantee = 'anon' and table_name = 'fathom_collegamento'), 0, 'anon non ha permessi');

-- who calls the functions
select ok(not has_function_privilege('authenticated', 'public.fathom_chiave()', 'execute'), 'la chiave la legge solo il service role');
select ok(has_function_privilege('service_role', 'public.fathom_chiave()', 'execute'), 'il service role sì');
select ok(not has_function_privilege('authenticated', 'public.fathom_salva_verifica(uuid,text,bigint,integer,timestamptz)', 'execute'),
  'la verifica di un link la scrive solo il service role');

set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(pg_temp.codice($$ select public.fathom_imposta_chiave('chiave-lunghissima-di-prova-1234567890') $$), '42501', 'il setter non imposta la chiave');
select is(pg_temp.codice($$ select public.fathom_chiave_presente() $$), '42501', 'il setter non sa se c''è');
select is((select count(*)::integer from public.fathom_collegamento), 0, 'il setter non legge il collegamento');
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(pg_temp.codice($$ select public.fathom_togli_chiave() $$), '42501', 'il closer non la toglie');
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is((select count(*)::integer from public.fathom_collegamento), 0, 'il marketing non legge il collegamento');

set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(pg_temp.codice($$ select public.fathom_imposta_chiave('troppo corta') $$), '22023', 'una chiave che non sembra una chiave');
select is(pg_temp.codice($$ select public.fathom_imposta_chiave('  "chiave-lunghissima-di-prova-1234567890"  ') $$), 'ok',
  'l''admin la salva, anche con spazi e virgolette');
select is((select public.fathom_chiave_presente()), true, 'e sa che c''è');
select is((select count(*)::integer from public.fathom_collegamento where chiave_aggiornata_il is not null), 1, 'con il giorno');
reset role;

select is((select decrypted_secret from vault.decrypted_secrets where name = 'fathom_chiave'),
  'chiave-lunghissima-di-prova-1234567890', 'nel Vault ripulita');
select is((select public.fathom_errore(repeat('x', 40) || ' ok')), '… ok', 'il messaggio perde ogni cosa che somiglia a una chiave');

select * from finish();
rollback;
