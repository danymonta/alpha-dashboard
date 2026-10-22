-- The post a lead came from (1.37.0, 20261018090200_lead_contenuto.sql): written only by the app from the
-- Insight's chats, the first origin stays, a reel of another account never breaks fissa_call, only the admin reads.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(14);

create or replace function pg_temp.codice(p_sql text) returns text language plpgsql as $$
begin execute p_sql; return 'ok'; exception when others then return sqlstate; end; $$;

insert into public.instagram_contenuti (media_id, shortcode, permalink, media_type, reel, pubblicato_il) values
  ('8500000000000001', 'T85Reel01', 'https://www.instagram.com/reel/T85Reel01/', 'VIDEO', true, now() - interval '5 days');
insert into public.insight_chat (canale, conversazione_id, username, utente_id, origine_tipo, origine_shortcode, origine_il, origine_giorno, aggiornata_il)
values
  ('instagram', 't85-c1', 'lead.t85a', '850000000001', 'condivisione', 'T85Reel01', now() - interval '3 days', (now() - interval '3 days')::date, now()),
  ('instagram', 't85-c2', 'lead.t85b', '850000000002', 'condivisione', 'AltroAccount9', now() - interval '3 days', (now() - interval '3 days')::date, now()),
  ('instagram', 't85-c3', 'lead.t85c', '850000000003', 'storia', null, now() - interval '3 days', (now() - interval '3 days')::date, now());

select has_table('public', 'lead_contenuto', 'l''origine del lead ha la sua tabella');
select policies_are('public', 'lead_contenuto', array['lead_contenuto_admin', 'lead_contenuto_lettura_come_admin', 'lead_contenuto_mai_da_oauth'], 'la legge solo l''admin');
select ok((select bool_and(not has_table_privilege('authenticated', 'public.lead_contenuto', p)) from unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) p), 'nessuna sessione scrive');

insert into public.leads (id, nome, instagram_handle, setter_id, fonte, stato) values
  ('85850000-0000-4000-8000-000000000001', 'Lead Reel', '@Lead.T85A', '22222222-2222-4222-8222-222222222222', 'dm_inbound', 'call_fissata'),
  ('85850000-0000-4000-8000-000000000002', 'Lead Altro Account', '@lead.t85b', '22222222-2222-4222-8222-222222222222', 'dm_inbound', 'call_fissata'),
  ('85850000-0000-4000-8000-000000000003', 'Lead Storia', 'lead.t85c', '22222222-2222-4222-8222-222222222222', 'dm_inbound', 'call_fissata'),
  ('85850000-0000-4000-8000-000000000004', 'Lead Senza Chat', '@lead.t85d', '22222222-2222-4222-8222-222222222222', 'dm_inbound', 'call_fissata'),
  ('85850000-0000-4000-8000-000000000005', 'Lead Senza Handle', null, '22222222-2222-4222-8222-222222222222', 'organico', 'call_fissata');

select is((select shortcode from public.lead_contenuto where lead_id = '85850000-0000-4000-8000-000000000001'), 'T85Reel01', 'un lead nuovo riceve il reel da cui arriva, anche con la maiuscola e la chiocciola');
select is((select certo from public.lead_contenuto where lead_id = '85850000-0000-4000-8000-000000000001'), true, 'una condivisione è certa');
select is((select count(*)::integer from public.lead_contenuto where lead_id = '85850000-0000-4000-8000-000000000002'), 0,
  'un reel di un altro account non scrive niente, e il lead c''è comunque');
select is((select come || '/' || coalesce(shortcode, 'nessuno') from public.lead_contenuto where lead_id = '85850000-0000-4000-8000-000000000003'), 'storia/nessuno', 'una storia senza post resta senza shortcode');
select is((select count(*)::integer from public.lead_contenuto where lead_id in ('85850000-0000-4000-8000-000000000004', '85850000-0000-4000-8000-000000000005')), 0, 'senza chat o senza handle niente');

-- the first origin stays
update public.insight_chat set origine_shortcode = 'T85Reel01', origine_tipo = 'parola_chiave' where conversazione_id = 't85-c2';
update public.leads set instagram_handle = '@lead.t85b' where id = '85850000-0000-4000-8000-000000000002';
select is((select come from public.lead_contenuto where lead_id = '85850000-0000-4000-8000-000000000002'), 'parola_chiave', 'una chat attribuita dopo arriva alla prossima modifica');
update public.insight_chat set origine_tipo = 'condivisione' where conversazione_id = 't85-c2';
update public.leads set instagram_handle = '@lead.t85b' where id = '85850000-0000-4000-8000-000000000002';
select is((select come from public.lead_contenuto where lead_id = '85850000-0000-4000-8000-000000000002'), 'parola_chiave', 'la prima origine resta');
select ok(not has_function_privilege('authenticated', 'public.lead_contenuto_da_insight()', 'execute')
          and has_function_privilege('service_role', 'public.lead_contenuto_da_insight()', 'execute'), 'il passo dell''Insight lo chiama il service role');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select ok((select count(*) from public.lead_contenuto) >= 1, 'l''admin legge');
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is((select count(*)::integer from public.lead_contenuto), 0, 'il closer no');
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is((select count(*)::integer from public.lead_contenuto), 0, 'il marketing no');
reset role;

select * from finish();
rollback;
