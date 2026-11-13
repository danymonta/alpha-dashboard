-- Guided onboarding, release B1a (1.79.0, 20261109090000_clienti_account.sql): the client's account.
-- The client's branch of handle_new_user (only a user born with the id a verified registration reserved;
-- any condition missing is 42501 and never the team's branch), the team's branch as it was, the addresses
-- of team and clients that never cross (invites, email changes), no password for a client, every row of the
-- life cycle of the account, the functions of /join and of /entra (service role only, their limits).
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(97);

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres). Seed: admin 1111, setter 2222.
-- ---------------------------------------------------------------------------
create temp table casi (nome text primary key, sale_id uuid, client_id uuid, invito_id uuid, utente uuid) on commit drop;
grant select on casi to authenticated;

create or replace function pg_temp.h(p text) returns text language sql immutable as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex') $$;
create or replace function pg_temp.admin() returns void language sql as $$
  select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true) $$;
create or replace function pg_temp.nessuno() returns void language sql as $$
  select set_config('request.jwt.claims', '{}', true) $$;
create or replace function pg_temp.cliente(p_nome text) returns uuid language sql as $$
  select client_id from pg_temp.casi where nome = p_nome $$;
create or replace function pg_temp.invito(p_nome text) returns uuid language sql as $$
  select invito_id from pg_temp.casi where nome = p_nome $$;
create or replace function pg_temp.vendita(p_nome text) returns uuid language sql as $$
  select sale_id from pg_temp.casi where nome = p_nome $$;
create or replace function pg_temp.utente(p_nome text) returns uuid language sql as $$
  select utente from pg_temp.casi where nome = p_nome $$;
create or replace function pg_temp.token(p_nome text) returns text language sql as $$
  select t.token from public.onboarding_inviti_token t where t.invito_id = pg_temp.invito(p_nome) $$;
create or replace function pg_temp.stato_account(p_nome text) returns text language sql as $$
  select a.stato from public.clienti_account a where a.client_id = pg_temp.cliente(p_nome) $$;

-- The wizard, as the admin (postgres with his claims): a «nuovo» sale, the onboarding; a test link and the
-- payment confirmed by hand when asked
create or replace function pg_temp.prepara(p_nome text, p_prova boolean default true, p_paga boolean default true)
returns void
language plpgsql
as $$
declare
  r jsonb;
begin
  perform pg_temp.admin();
  r := public.nuovo_cliente(
    jsonb_build_object(
      'product_id', (select id from public.products order by created_at limit 1), 'data_vendita', public.oggi(),
      'data_inizio', public.oggi() + 7, 'valore_contratto', 2400, 'numero_rate', 3,
      'nome', p_nome, 'cognome', 'Centoundici', 'email', lower(p_nome) || '@example.test'),
    jsonb_build_object('responsabile', '11111111-1111-4111-8111-111111111111'));
  insert into pg_temp.casi (nome, sale_id, client_id, invito_id)
  values (p_nome, (r ->> 'sale_id')::uuid, (r ->> 'client_id')::uuid, (r ->> 'invito_id')::uuid);
  if p_prova then
    perform public.onboarding_segna_prova((r ->> 'invito_id')::uuid, true);
  end if;
  if p_paga then
    perform public.onboarding_conferma_pagamento((r ->> 'invito_id')::uuid);
  end if;
  perform pg_temp.nessuno();
end;
$$;

-- A user in auth.users, as GoTrue would create it
create or replace function pg_temp.nuovo_utente(p_id uuid, p_email text, p_meta jsonb default '{"tipo":"cliente"}')
returns void
language sql
as $$
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email, '', now(),
    p_meta, '{}'::jsonb, now(), now(), '', '', '', '');
$$;

-- The road of /join, as the server action walks it (the functions run as postgres here: no session)
create or replace function pg_temp.registra(p_nome text, p_email text)
returns uuid
language plpgsql
as $$
declare
  v_chiave text := md5(random()::text) || md5(random()::text);
  v jsonb;
begin
  perform public.onboarding_join_apri(pg_temp.h(pg_temp.token(p_nome)), pg_temp.h(v_chiave));
  v := public.onboarding_join_codice(pg_temp.h(v_chiave), p_email, pg_temp.h('12345678'));
  if v ->> 'esito' <> 'invia' then
    raise exception 'codice: %', v;
  end if;
  v := public.onboarding_join_verifica(pg_temp.h(v_chiave), '12345678');
  if v ->> 'esito' <> 'ok' then
    raise exception 'verifica: %', v;
  end if;
  perform pg_temp.nuovo_utente((v ->> 'utente_id')::uuid, v ->> 'email');
  update pg_temp.casi set utente = (v ->> 'utente_id')::uuid where nome = p_nome;
  return (v ->> 'utente_id')::uuid;
end;
$$;

-- A registration written by hand, to break one condition at a time
create or replace function pg_temp.riserva(p_nome text, p_email text, p_verificato interval default interval '1 minute')
returns uuid
language plpgsql
as $$
declare
  v uuid := gen_random_uuid();
begin
  delete from public.onboarding_registrazioni where invito_id = pg_temp.invito(p_nome);
  insert into public.onboarding_registrazioni (invito_id, utente_id, chiave_hash, chiave_scade_il, email, verificato_il)
  values (pg_temp.invito(p_nome), v, pg_temp.h(v::text), now() + interval '30 minutes', p_email,
          case when p_verificato is not null then now() - p_verificato end);
  return v;
end;
$$;

insert into public.invites (email, ruolo) values ('team111@alpha.test', 'coach');

-- ---------------------------------------------------------------------------
-- 1. Schema and grants
-- ---------------------------------------------------------------------------
select policies_are('public', 'clienti_account', array[
  'clienti_account_admin_lettura', 'clienti_account_propria_lettura', 'clienti_account_nessuna_sessione',
  'clienti_account_mai_da_oauth'
], 'account: l''admin legge, l''utente la sua riga, nessuna sessione scrive');
select policies_are('public', 'onboarding_registrazioni', array[
  'onboarding_registrazioni_nessuna_sessione', 'onboarding_registrazioni_mai_da_oauth'
], 'registrazioni: nessuna sessione');
select policies_are('public', 'clienti_accesso_limiti', array[
  'clienti_accesso_limiti_nessuna_sessione', 'clienti_accesso_limiti_mai_da_oauth'
], 'limiti: nessuna sessione');
select ok(
  not has_table_privilege('authenticated', 'public.clienti_account', 'insert')
  and not has_table_privilege('authenticated', 'public.clienti_account', 'update')
  and not has_table_privilege('authenticated', 'public.onboarding_registrazioni', 'select')
  and not has_table_privilege('authenticated', 'public.clienti_accesso_limiti', 'select'),
  'nessun grant di scrittura sugli account, nessun grant sulle registrazioni e sui limiti'
);
select is(
  (select coalesce(string_agg(p.oid::regprocedure::text, ', ' order by p.oid::regprocedure::text), '')
   from pg_proc p
   where p.pronamespace = 'public'::regnamespace
     and p.proname in ('onboarding_join_leggi', 'onboarding_join_apri', 'onboarding_join_stato', 'onboarding_join_codice',
                       'onboarding_join_verifica', 'cliente_accesso_per_email', 'cliente_accesso_conta', 'accesso_ip_conta',
                       'onboarding_registra_cliente', 'email_del_team', 'email_di_cliente', 'onboarding_invito_apribile',
                       'onboarding_nome_cliente')
     and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))),
  '', 'le funzioni di /join, di /entra e quelle interne non sono eseguibili da una sessione'
);
select ok(
  has_function_privilege('service_role', 'public.onboarding_join_leggi(text, text)', 'execute')
  and has_function_privilege('service_role', 'public.onboarding_join_codice(text, text, text)', 'execute')
  and has_function_privilege('service_role', 'public.cliente_accesso_conta(text, text)', 'execute')
  and has_function_privilege('service_role', 'public.accesso_ip_conta(text, text)', 'execute'),
  'le chiama il service role'
);

-- ---------------------------------------------------------------------------
-- 2. The team's branch, as it was
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select pg_temp.nuovo_utente(gen_random_uuid(), 'sconosciuto111@example.test', '{}') $$,
  '42501', null, 'un''email senza riserva e senza invito del team è rifiutata (come generateLink su un''email nuova)'
);
select lives_ok(
  $$ select pg_temp.nuovo_utente('99999999-9999-4999-8999-999999990111', 'team111@alpha.test', '{}') $$,
  'un invito del team crea l''utente'
);
select is(
  (select row(p.ruolo, p.email)::text from public.profiles p where p.id = '99999999-9999-4999-8999-999999990111'),
  '(coach,team111@alpha.test)', 'col suo profilo, come prima'
);

-- ---------------------------------------------------------------------------
-- 3. The client's branch: every condition
-- ---------------------------------------------------------------------------
select pg_temp.prepara('Rami');
select throws_ok(
  format($$ select pg_temp.nuovo_utente(%L, 'team111b@alpha.test') $$, pg_temp.riserva('Rami', 'team111b@alpha.test', null)),
  '42501', 'Registrazione non valida', 'senza il codice verificato no'
);
insert into public.invites (email, ruolo) values ('team111b@alpha.test', 'coach');
select throws_ok(
  format($$ select pg_temp.nuovo_utente(%L, 'team111b@alpha.test', '{}') $$, pg_temp.riserva('Rami', 'team111b@alpha.test', null)),
  '42501', 'Registrazione non valida', 'un id riservato non scende mai al ramo del team, nemmeno con un''email invitata'
);
select is((select count(*)::int from public.profiles where email = 'team111b@alpha.test'), 0, 'e nessun profilo nasce');
select throws_ok(
  format($$ select pg_temp.nuovo_utente(%L, 'rami@example.test') $$, pg_temp.riserva('Rami', 'rami@example.test', interval '11 minutes')),
  '42501', 'Registrazione non valida', 'un codice verificato più di 10 minuti fa non vale'
);
select throws_ok(
  format($$ select pg_temp.nuovo_utente(%L, 'altra111@example.test') $$, pg_temp.riserva('Rami', 'rami@example.test')),
  '42501', 'Registrazione non valida', 'un''email diversa da quella del codice no'
);
insert into public.invites (email, ruolo) values ('team111d@alpha.test', 'coach');
select throws_ok(
  format($$ select pg_temp.nuovo_utente(%L, 'team111d@alpha.test') $$, pg_temp.riserva('Rami', 'team111d@alpha.test')),
  '42501', 'Registrazione non valida', 'l''email di un invito del team no, anche se il codice è partito lì'
);
-- the link not of test, with the area closed
update public.onboarding_inviti set prova = false where id = pg_temp.invito('Rami');
select throws_ok(
  format($$ select pg_temp.nuovo_utente(%L, 'rami@example.test') $$, pg_temp.riserva('Rami', 'rami@example.test')),
  '42501', 'Registrazione non valida', 'un invito non di prova con l''area chiusa no'
);
update public.onboarding_impostazioni set aperto_ai_clienti = true;
select lives_ok(
  format($$ select pg_temp.nuovo_utente(%L, 'rami@example.test') $$, pg_temp.riserva('Rami', 'rami@example.test')),
  'con l''area aperta sì'
);
update public.onboarding_impostazioni set aperto_ai_clienti = false;
select throws_ok(
  format($$ select pg_temp.nuovo_utente(%L, 'rami2@example.test') $$, gen_random_uuid()),
  '42501', null, 'un secondo utente con un''email nuova: nessuna riserva, rifiutato dal ramo del team'
);

select pg_temp.prepara('Attesa', true, false);
select throws_ok(
  format($$ select pg_temp.nuovo_utente(%L, 'attesa@example.test') $$, pg_temp.riserva('Attesa', 'attesa@example.test')),
  '42501', 'Registrazione non valida', 'un invito in attesa del pagamento no'
);
select pg_temp.prepara('Scaduto');
update public.onboarding_inviti set scade_il = now() - interval '1 minute' where id = pg_temp.invito('Scaduto');
select throws_ok(
  format($$ select pg_temp.nuovo_utente(%L, 'scaduto@example.test') $$, pg_temp.riserva('Scaduto', 'scaduto@example.test')),
  '42501', 'Registrazione non valida', 'un invito coi giorni finiti no'
);

-- ---------------------------------------------------------------------------
-- 4. The registration that passes
-- ---------------------------------------------------------------------------
select pg_temp.prepara('Uno');
select isnt(pg_temp.registra('Uno', 'uno@example.test'), null, 'la strada di /join crea l''utente');
select is(pg_temp.stato_account('Uno'), 'attivo', 'l''account nasce attivo');
select is((select count(*)::int from public.profiles where id = pg_temp.utente('Uno')), 0, 'mai una riga in profiles');
select is(
  (select row(i.stato, i.usato_il is not null, (select count(*) from public.onboarding_inviti_token t where t.invito_id = i.id))::text
   from public.onboarding_inviti i where i.id = pg_temp.invito('Uno')),
  '(usato,t,0)', 'l''invito è usato e il token in chiaro non c''è più'
);
select is(
  (select row(p.stato, p.giorno_zero is not null)::text from public.onboarding_percorsi p where p.client_id = pg_temp.cliente('Uno')),
  '(in_corso,t)', 'il percorso è in corso dal giorno zero'
);
select is(
  (select array_agg(s.passo || ':' || s.stato order by d.ordine)
   from public.onboarding_passi s join public.onboarding_passi_def d on d.versione = s.versione and d.chiave = s.passo
   where s.client_id = pg_temp.cliente('Uno') and d.ordine <= 3),
  array['benvenuto:disponibile', 'regole:bloccato', 'questionario:bloccato'], 'il primo step è disponibile'
);
select is(
  (select row(e.attore, e.autore_id)::text from public.onboarding_eventi e where e.client_id = pg_temp.cliente('Uno') and e.tipo = 'registrato'),
  '(cliente,)', 'il registro dice registrato, dal cliente'
);
select is(
  (select count(*)::int from public.notifiche n
   where n.destinatario_id = '11111111-1111-4111-8111-111111111111' and n.tipo = 'onboarding_cliente'
     and n.chiave like 'onboarding/' || pg_temp.cliente('Uno') || '/registrato/%'),
  1, 'gli admin lo sanno'
);
select is((select count(*)::int from public.onboarding_registrazioni where invito_id = pg_temp.invito('Uno')), 0,
  'la registrazione non c''è più');
select throws_ok(
  format($$ select pg_temp.nuovo_utente(%L, 'uno.bis@example.test') $$, pg_temp.riserva('Uno', 'uno.bis@example.test')),
  '42501', 'Registrazione non valida', 'un cliente registrato non ne apre un secondo'
);

select pg_temp.prepara('Diversa');
select pg_temp.registra('Diversa', 'altra.diversa@example.test');
select is(
  (select row(c.email, (select count(*) from public.onboarding_eventi e where e.client_id = c.id and e.tipo = 'email_cambiata'),
              (select count(*) from public.notifiche n where n.chiave like 'onboarding/' || c.id || '/email/%' and n.destinatario_id = '11111111-1111-4111-8111-111111111111'))::text
   from public.clients c where c.id = pg_temp.cliente('Diversa')),
  '(altra.diversa@example.test,1,1)', 'un''email diversa aggiorna la scheda, con l''evento senza indirizzi e la notifica'
);
select ok(
  (select not (e.dettagli::text like '%@%') from public.onboarding_eventi e
   where e.client_id = pg_temp.cliente('Diversa') and e.tipo = 'email_cambiata'),
  'l''evento non porta l''indirizzo'
);

-- ---------------------------------------------------------------------------
-- 5. The addresses of team and clients never cross
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ insert into public.invites (email, ruolo) values ('uno@example.test', 'coach') $$,
  '22023', 'Questo indirizzo è di un cliente: usa un''altra email per il team.', 'un invito con l''email di un cliente no'
);
select throws_ok(
  $$ update public.invites set email = 'uno@example.test' where email = 'team111b@alpha.test' $$,
  '22023', null, 'nemmeno cambiando l''email di un invito'
);
insert into public.invites (email, ruolo, revocato) values ('diverso.revocato@example.test', 'coach', true);
update public.invites set email = 'altra.diversa@example.test' where email = 'diverso.revocato@example.test';
select throws_ok(
  $$ update public.invites set revocato = false where email = 'altra.diversa@example.test' $$,
  '22023', null, 'un invito revocato con l''email di un cliente non torna valido'
);
select throws_ok(
  format($$ update auth.users set email = 'team111b@alpha.test' where id = %L $$, pg_temp.utente('Uno')),
  '42501', 'Questo indirizzo non si può usare per il tuo accesso.', 'un cliente non prende l''email di un invito del team'
);
select throws_ok(
  format($$ update auth.users set email_change = 'admin@alpha.test' where id = %L $$, pg_temp.utente('Uno')),
  '42501', null, 'né quella di un profilo, nemmeno in attesa di conferma'
);
select throws_ok(
  format($$ update auth.users set email = 'altra.diversa@example.test' where id = %L $$, pg_temp.utente('Uno')),
  '42501', null, 'né quella di un altro cliente'
);
select throws_ok(
  $$ update auth.users set email = 'uno@example.test' where id = '99999999-9999-4999-8999-999999990111' $$,
  '42501', null, 'una persona del team non prende l''email di un cliente'
);
select lives_ok(
  format($$ update auth.users set email = 'uno.nuova@example.test', raw_user_meta_data = '{"x":1}' where id = %L $$, pg_temp.utente('Uno')),
  'un indirizzo libero sì'
);
select lives_ok(
  format($$ update auth.users set email = email, last_sign_in_at = now() where id = %L $$, pg_temp.utente('Uno')),
  'un update che non cambia l''email passa'
);

-- ---------------------------------------------------------------------------
-- 6. No password for a client
-- ---------------------------------------------------------------------------
select throws_ok(
  format($$ update auth.users set encrypted_password = extensions.crypt('x', extensions.gen_salt('bf')) where id = %L $$, pg_temp.utente('Uno')),
  '42501', 'L''accesso al percorso è solo con il codice via email.', 'a un cliente non si scrive una password'
);
insert into public.invites (email, ruolo) values ('orfano111@alpha.test', 'coach');
select pg_temp.nuovo_utente('99999999-9999-4999-8999-999999991113', 'orfano111@alpha.test', '{"tipo":"cliente"}');
select throws_ok(
  $$ update auth.users set encrypted_password = 'qualcosa' where id = '99999999-9999-4999-8999-999999991113' $$,
  '42501', null, 'nemmeno a un utente segnato cliente senza account'
);
select lives_ok(
  $$ update auth.users set encrypted_password = extensions.crypt('x', extensions.gen_salt('bf')) where id = '99999999-9999-4999-8999-999999990111' $$,
  'a una persona del team sì'
);

-- ---------------------------------------------------------------------------
-- 7. The life cycle of the account
-- ---------------------------------------------------------------------------
select pg_temp.admin();
select public.onboarding_revoca(pg_temp.invito('Uno'), 'Prova 111');
select is(pg_temp.stato_account('Uno'), 'sospeso', 'invito revocato: account sospeso');
select throws_ok($$ select public.onboarding_rigenera_link(pg_temp.invito('Uno')) $$, '22023',
  'Il cliente è già registrato: usa Riattiva.', '«Rigenera link» mai su un cliente registrato');
select is(
  (select row(pg_temp.stato_account('Uno'), i.stato,
              (select count(*) from public.onboarding_inviti_token t where t.invito_id = i.id))::text
   from public.onboarding_inviti i where i.id = pg_temp.invito('Uno')),
  '(sospeso,revocato,0)', 'e l''account resta sospeso, senza un token nuovo'
);
select public.onboarding_riattiva(pg_temp.invito('Uno'));
select is(
  (select row(pg_temp.stato_account('Uno'), i.stato)::text from public.onboarding_inviti i where i.id = pg_temp.invito('Uno')),
  '(attivo,usato)', '«Riattiva»: account attivo, invito di nuovo usato'
);

-- a total refund with the link activated by hand: nothing changes (rule of A)
select public.segna_rata_incassata((select id from public.payments where sale_id = pg_temp.vendita('Uno') and numero_rata = 1));
select public.registra_rimborso((select id from public.payments where sale_id = pg_temp.vendita('Uno') and numero_rata = 1),
  public.oggi(), 800);
select is(pg_temp.stato_account('Uno'), 'attivo', 'rimborso totale con l''invito attivato a mano: l''account resta com''è');

-- a new instalment cashed with the account suspended: the admins are told, the account stays
select pg_temp.prepara('Sospeso');
select pg_temp.registra('Sospeso', 'sospeso@example.test');
select pg_temp.admin();
select public.onboarding_revoca(pg_temp.invito('Sospeso'), 'Prova 111');
select public.segna_rata_incassata((select id from public.payments where sale_id = pg_temp.vendita('Sospeso') and numero_rata = 1));
select is(
  (select row(pg_temp.stato_account('Sospeso'),
              (select count(*) from public.notifiche n where n.destinatario_id = '11111111-1111-4111-8111-111111111111'
                 and n.tipo = 'onboarding_cliente' and n.chiave like 'onboarding/' || pg_temp.cliente('Sospeso') || '/pagamento-sospeso/%'))::text),
  '(sospeso,1)', 'una rata incassata con l''account sospeso: la notifica, e l''account resta sospeso'
);
select public.segna_rata_incassata((select id from public.payments where sale_id = pg_temp.vendita('Sospeso') and numero_rata = 2));
select is(
  (select count(*)::int from public.notifiche n where n.destinatario_id = '11111111-1111-4111-8111-111111111111'
     and n.chiave like 'onboarding/' || pg_temp.cliente('Sospeso') || '/pagamento-sospeso/%'),
  2, 'una notifica per rata'
);

-- the sale moved to another client with the invite used: the admins are told, nothing else changes
select pg_temp.prepara('Spostata');
select pg_temp.registra('Spostata', 'spostata@example.test');
select pg_temp.admin();
update public.sales set client_id = pg_temp.cliente('Diversa') where id = pg_temp.vendita('Spostata');
select is(
  (select row(i.stato, pg_temp.stato_account('Spostata'),
              (select count(*) from public.notifiche n where n.destinatario_id = '11111111-1111-4111-8111-111111111111'
                 and n.chiave like 'onboarding/' || pg_temp.cliente('Spostata') || '/vendita-spostata/%'))::text
   from public.onboarding_inviti i where i.id = pg_temp.invito('Spostata')),
  '(usato,attivo,1)', 'vendita spostata con l''invito usato: niente revoca, la notifica'
);

-- 12 months after the end of the last path: closed, and never active again
select pg_temp.prepara('Vecchio');
select pg_temp.registra('Vecchio', 'vecchio@example.test');
insert into public.onboarding_video_visti (client_id, blocco_id, durata, visti)
select pg_temp.cliente('Vecchio'), b.id, 10, '1111111111'::varbit
from public.contenuti_blocchi b where b.passo = 'benvenuto' and b.tipo = 'video' limit 1;
select pg_temp.nessuno();
update public.sales set data_inizio = public.oggi() - 800, data_fine = public.oggi() - 400 where client_id = pg_temp.cliente('Vecchio');
select public.onboarding_pulizia();
select is(
  (select row(a.stato, a.chiuso_il is not null,
              (select count(*) from public.onboarding_video_visti v where v.client_id = a.client_id))::text
   from public.clienti_account a where a.client_id = pg_temp.cliente('Vecchio')),
  '(chiuso,t,0)', 'dopo 12 mesi l''account è chiuso e i video visti vanno via'
);
select is(pg_temp.stato_account('Uno'), 'attivo', 'un percorso ancora in corso no');
select pg_temp.admin();
select public.onboarding_revoca(pg_temp.invito('Vecchio'), 'Prova 111');
select public.onboarding_riattiva(pg_temp.invito('Vecchio'));
select is(pg_temp.stato_account('Vecchio'), 'chiuso', 'un account chiuso non torna mai attivo');

-- the client deleted: the account goes with it (the user is removed by the server action)
select public.elimina_cliente(pg_temp.cliente('Vecchio'));
select is((select count(*)::int from public.clienti_account where client_id = pg_temp.cliente('Vecchio')), 0,
  'cliente eliminato: l''account va via con lui');
select pg_temp.nessuno();

-- ---------------------------------------------------------------------------
-- 8. /join
-- ---------------------------------------------------------------------------
select pg_temp.prepara('Join');
select is(public.onboarding_join_leggi('nonvalido'), '{"stato": "non_valido"}'::jsonb, 'un token non valido');
select is(public.onboarding_join_leggi(pg_temp.h(pg_temp.token('Join')), 'altro-slug'), '{"stato": "non_valido"}'::jsonb,
  'uno slug che non corrisponde');
select is(public.onboarding_join_leggi(pg_temp.h(pg_temp.token('Join')), 'join-centoundici'),
  '{"stato": "attivo", "nome": "Join"}'::jsonb, 'un link di prova attivo, col nome di battesimo');
select is(public.onboarding_join_leggi(pg_temp.h(pg_temp.token('Attesa'))) ->> 'stato', 'in_attesa', 'in attesa del pagamento');
select pg_temp.prepara('Chiusa', false, true);
select is(public.onboarding_join_leggi(pg_temp.h(pg_temp.token('Chiusa'))) ->> 'stato', 'non_attivo',
  'un link attivo non di prova con l''area chiusa: non ancora attivo, mai «in attesa del pagamento»');
select is(public.onboarding_join_leggi(pg_temp.h(pg_temp.token('Scaduto'))) ->> 'stato', 'scaduto', 'coi giorni finiti');
select is((select stato from public.onboarding_inviti where id = pg_temp.invito('Scaduto')), 'scaduto', 'e l''invito diventa scaduto');
select pg_temp.prepara('Revocato');
select pg_temp.admin();
select public.onboarding_revoca(pg_temp.invito('Revocato'), 'Prova 111');
select pg_temp.nessuno();
select is(public.onboarding_join_leggi(pg_temp.h(pg_temp.token('Revocato'))) ->> 'stato', 'revocato', 'revocato');
select is(public.onboarding_join_leggi(pg_temp.h(pg_temp.h('qualsiasi'))) ->> 'stato', 'non_valido', 'un token che non c''è');

select is(public.onboarding_join_apri(pg_temp.h(pg_temp.token('Join')), pg_temp.h('chiave-join')), '{"esito": "ok"}'::jsonb,
  '«Continua» apre la registrazione');
select is(public.onboarding_join_apri(pg_temp.h(pg_temp.token('Attesa')), pg_temp.h('chiave-attesa')), '{"esito": "in_attesa"}'::jsonb,
  'non su un link in attesa');
select is(public.onboarding_join_stato(pg_temp.h('chiave-join')),
  '{"nome": "Join", "email_proposta": "join@example.test", "codice_inviato_a": null}'::jsonb, 'la pagina della registrazione');
select is(public.onboarding_join_stato(pg_temp.h('chiave-sbagliata')), null, 'una chiave che non c''è: niente');

-- every call counts: five addresses not admitted, then too many requests
select is(
  (select array_agg(public.onboarding_join_codice(pg_temp.h('chiave-join'), 'admin@alpha.test', pg_temp.h('00000000')) ->> 'esito')
   from generate_series(1, 6)),
  array['email_non_ammessa', 'email_non_ammessa', 'email_non_ammessa', 'email_non_ammessa', 'email_non_ammessa', 'troppe_richieste'],
  'sei richieste di fila: la sesta è troppe_richieste'
);

select pg_temp.prepara('Indirizzi');
select public.onboarding_join_apri(pg_temp.h(pg_temp.token('Indirizzi')), pg_temp.h('chiave-indirizzi'));
select is(
  array[
    public.onboarding_join_codice(pg_temp.h('chiave-indirizzi'), 'a.111@example.test', pg_temp.h('11111111')) ->> 'esito',
    public.onboarding_join_codice(pg_temp.h('chiave-indirizzi'), 'b.111@example.test', pg_temp.h('11111111')) ->> 'esito',
    public.onboarding_join_codice(pg_temp.h('chiave-indirizzi'), 'c.111@example.test', pg_temp.h('11111111')) ->> 'esito',
    public.onboarding_join_codice(pg_temp.h('chiave-indirizzi'), 'd.111@example.test', pg_temp.h('11111111')) ->> 'esito',
    public.onboarding_join_codice(pg_temp.h('chiave-indirizzi'), 'a.111@example.test', pg_temp.h('22222222')) ->> 'esito'
  ],
  array['invia', 'invia', 'invia', 'email_non_ammessa', 'invia'],
  'al massimo tre indirizzi: il quarto è rifiutato anche se ammesso, i primi tre restano'
);
select is(public.onboarding_join_stato(pg_temp.h('chiave-indirizzi')) ->> 'codice_inviato_a', 'a.111@example.test',
  'la pagina sa a chi è partito il codice');
select is(public.onboarding_join_codice(pg_temp.h('chiave-scaduta'), 'x@example.test', pg_temp.h('1')), '{"esito": "scaduta"}'::jsonb,
  'una chiave che non c''è: scaduta');

-- the code: wrong, then blocked, then a new one
select is(
  (select array_agg(public.onboarding_join_verifica(pg_temp.h('chiave-indirizzi'), '99999999') ->> 'esito')
   from generate_series(1, 5)),
  array['errato', 'errato', 'errato', 'errato', 'bloccato'], 'cinque codici sbagliati: bloccato'
);
select is(public.onboarding_join_verifica(pg_temp.h('chiave-indirizzi'), '22222222') ->> 'esito', 'bloccato',
  'e nemmeno quello giusto passa più');
select public.onboarding_join_apri(pg_temp.h(pg_temp.token('Indirizzi')), pg_temp.h('chiave-indirizzi-2'));
select is(
  (select row(r.invii, cardinality(r.email_provate), r.errori, r.codice_hash is null)::text
   from public.onboarding_registrazioni r where r.invito_id = pg_temp.invito('Indirizzi')),
  '(5,3,0,t)', 'riaperta: le richieste e gli indirizzi restano, il codice e gli errori no'
);
select is(
  public.onboarding_join_codice(pg_temp.h('chiave-indirizzi-2'), 'b.111@example.test', pg_temp.h('33333333')) ->> 'esito',
  'troppe_richieste', 'e il limite dell''ora vale ancora'
);
update public.onboarding_registrazioni set invii_dal = now() - interval '2 hours' where invito_id = pg_temp.invito('Indirizzi');
select public.onboarding_join_codice(pg_temp.h('chiave-indirizzi-2'), 'b.111@example.test', pg_temp.h('33333333'));
select is(
  (select v - 'utente_id' from (select public.onboarding_join_verifica(pg_temp.h('chiave-indirizzi-2'), '33333333') as v) x),
  '{"esito": "ok", "email": "b.111@example.test"}'::jsonb, 'dopo un''ora un codice nuovo, quello giusto passa'
);
select ok(
  (select verificato_il is not null and codice_hash is null from public.onboarding_registrazioni where invito_id = pg_temp.invito('Indirizzi')),
  'verificato: il codice non vale una seconda volta'
);

-- ---------------------------------------------------------------------------
-- 9. /entra
-- ---------------------------------------------------------------------------
select is(
  (select row(c.stato, c.nome)::text from public.cliente_accesso_per_email(' UNO.NUOVA@example.test ') c),
  '(attivo,Uno)', 'l''account del cliente dall''email'
);
select is((select count(*)::int from public.cliente_accesso_per_email('admin@alpha.test')), 0, 'mai una persona del team');
select ok(not public.cliente_accesso_conta('uno.nuova@example.test', 'verifica'), 'senza un codice partito, la verifica no');
select is(
  (select array_agg(public.cliente_accesso_conta('uno.nuova@example.test', 'invio')) from generate_series(1, 6)),
  array[true, true, true, true, true, false], 'cinque invii l''ora per indirizzo'
);
select ok(public.cliente_accesso_conta('uno.nuova@example.test', 'verifica'), 'dopo un invio la verifica sì');
do $$ begin perform public.cliente_accesso_conta('sconosciuto' || n || '@example.test', 'errore') from generate_series(1, 100) n; end $$;
select ok(public.cliente_accesso_conta('uno.nuova@example.test', 'verifica'),
  'cento email sconosciute (nessun codice partito) non bloccano un cliente vero');
select is((select errori from public.clienti_accesso_limiti where chiave = 'tutti'), 0, 'e non contano niente su tutti');
select is(
  (select array_agg(public.cliente_accesso_conta('team.111@example.test', 'invio_team')) from generate_series(1, 11)),
  array_fill(true, array[10]) || false, 'il codice del team: dieci l''ora per indirizzo'
);
select is((select invii from public.clienti_accesso_limiti where chiave = 'tutti'), 5, 'senza contare sugli invii di tutti');
select ok(public.cliente_accesso_conta('team.111@example.test', 'verifica'), 'e la sua verifica passa');
do $$ begin perform public.cliente_accesso_conta('team.111@example.test', 'errore') from generate_series(1, 5); end $$;
select ok(not public.cliente_accesso_conta('team.111@example.test', 'verifica'), 'cinque codici sbagliati fermano l''indirizzo');
do $$
begin
  perform public.cliente_accesso_conta('cliente' || n || '.111@example.test', 'invio') from generate_series(1, 19) n;
  perform public.cliente_accesso_conta('cliente' || n || '.111@example.test', 'errore')
  from generate_series(1, 19) n, generate_series(1, 5);
end $$;
select ok(not public.cliente_accesso_conta('uno.nuova@example.test', 'verifica'), 'cento errori veri in tutto fermano ogni verifica');
select is(
  (select array_agg(public.accesso_ip_conta('203.0.113.7', 'richiesta')) from generate_series(1, 21)),
  array_fill(true, array[20]) || false, 'venti richieste di codice l''ora per IP'
);
select is(
  (select array_agg(public.accesso_ip_conta('203.0.113.7', 'verifica')) from generate_series(1, 31)),
  array_fill(true, array[30]) || false, 'trenta verifiche l''ora per IP'
);
select ok(public.accesso_ip_conta('198.51.100.9', 'richiesta'), 'un altro IP non è toccato');
select ok(public.accesso_ip_conta(null, 'verifica') and public.accesso_ip_conta('', 'verifica'), 'senza IP nessun limite');
select is((select count(*)::int from public.clienti_accesso_limiti where chiave like 'ip:%' and chiave !~ '^ip:[0-9a-f]{64}$'), 0,
  'l''IP si salva solo come sha256');
select throws_ok($$ select public.cliente_accesso_conta('x@example.test', 'altro') $$, '22023', null, 'un tipo che non c''è');

select * from finish();
rollback;
