-- The notification center (1.41.0, 20261021090000_notifiche.sql): RLS (a person reads, marks as read and deletes
-- only their own; the admin reads nobody else's; no session inserts; Claude connected nothing), the writer
-- (service_role only, idempotent, the table's checks), the retention and the backup that skips the table.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(45);

create function pg_temp.righe(p_sql text) returns integer language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
end;
$$;


-- ---------------------------------------------------------------------------
-- 1. Structure
-- ---------------------------------------------------------------------------
select has_table('public', 'notifiche', 'la tabella notifiche esiste');
select ok((select relrowsecurity from pg_class where oid = 'public.notifiche'::regclass), 'RLS abilitata');
select is(
  (select array_agg(policyname::text order by policyname::text) from pg_policies
   where schemaname = 'public' and tablename = 'notifiche'),
  array['notifiche_eliminazione', 'notifiche_lettura', 'notifiche_mai_da_oauth', 'notifiche_segna_lette'],
  'quattro policy: leggere, segnare lette, eliminare, e il rifiuto dei token di Claude; nessuna di inserimento'
);
select ok(not has_table_privilege('anon', 'public.notifiche', 'select'), 'anon non legge');
select ok(not has_table_privilege('authenticated', 'public.notifiche', 'insert'), 'nessuna sessione inserisce');
select ok(has_column_privilege('authenticated', 'public.notifiche', 'letta_il', 'update'), 'una sessione aggiorna letta_il');
select ok(not has_column_privilege('authenticated', 'public.notifiche', 'titolo', 'update'), 'e nessun''altra colonna');
select ok(not has_function_privilege('authenticated', 'public.notifiche_registra(uuid[], text, text, text, text, text, boolean, text)', 'execute'),
  'notifiche_registra non è raggiungibile da una sessione');
select ok(has_function_privilege('service_role', 'public.notifiche_registra(uuid[], text, text, text, text, text, boolean, text)', 'execute'),
  'solo il service_role la chiama');

-- ---------------------------------------------------------------------------
-- 2. The writer: one row per recipient, idempotent
-- ---------------------------------------------------------------------------
select is(
  public.notifiche_registra(
    array['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']::uuid[],
    'riepilogo_settimana', 'Riepilogo del test 91', 'Cash della settimana: prova', '<p>Corpo del test 91</p>',
    '/payments', false, 'test91/riepilogo'),
  2,
  'una riga per destinatario'
);
select is(
  public.notifiche_registra(
    array['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222']::uuid[],
    'riepilogo_settimana', 'Riepilogo del test 91', 'Cash della settimana: prova', '<p>Corpo del test 91</p>',
    '/payments', false, 'test91/riepilogo'),
  2,
  'la stessa chiave, un secondo giro dello stesso cron'
);
select is((select count(*)::int from public.notifiche where chiave = 'test91/riepilogo'), 2, 'ma le righe restano due');

update public.notifiche set letta_il = now() where chiave = 'test91/riepilogo' and destinatario_id = '11111111-1111-4111-8111-111111111111';
select public.notifiche_registra(
  array['11111111-1111-4111-8111-111111111111']::uuid[],
  'riepilogo_settimana', 'Titolo cambiato', 'Altro', '<p>Altro</p>', '/', true, 'test91/riepilogo');
select is(
  (select row(email_inviata, letta_il is not null, titolo)::text from public.notifiche
   where chiave = 'test91/riepilogo' and destinatario_id = '11111111-1111-4111-8111-111111111111'),
  row(true, true, 'Riepilogo del test 91')::text,
  'un nuovo giro che manda davvero l''email accende email_inviata e non tocca il resto, letta compresa'
);
select public.notifiche_registra(
  array['11111111-1111-4111-8111-111111111111']::uuid[],
  'riepilogo_settimana', 'x', '', '<p>x</p>', null, false, 'test91/riepilogo');
select ok(
  (select email_inviata from public.notifiche
   where chiave = 'test91/riepilogo' and destinatario_id = '11111111-1111-4111-8111-111111111111'),
  'e un giro dopo, senza email, non la spegne'
);
select is(
  public.notifiche_registra(array['00000000-0000-4000-8000-0000000000aa']::uuid[],
    'backup', 'Nessuno', '', '<p>x</p>', null, false, 'test91/nessuno'),
  0,
  'un destinatario che non è un profilo non crea niente'
);

-- the checks of the table
select throws_ok(
  $$select public.notifiche_registra(array['11111111-1111-4111-8111-111111111111']::uuid[], 'backup', 'T', '', '<p>x</p>', '//evil.example/x', false, 'test91/l1')$$,
  '23514', null, 'un link con due slash si rifiuta');
select throws_ok(
  $$select public.notifiche_registra(array['11111111-1111-4111-8111-111111111111']::uuid[], 'backup', 'T', '', '<p>x</p>', 'https://evil.example/x', false, 'test91/l2')$$,
  '23514', null, 'un link esterno si rifiuta');
select throws_ok(
  $$select public.notifiche_registra(array['11111111-1111-4111-8111-111111111111']::uuid[], 'backup', 'T', '', '<p>x</p>', 'javascript:alert(1)', false, 'test91/l3')$$,
  '23514', null, 'javascript: si rifiuta');
select throws_ok(
  $$select public.notifiche_registra(array['11111111-1111-4111-8111-111111111111']::uuid[], 'backup', 'T', '', '<p>x</p>', E'/a\\b', false, 'test91/l4')$$,
  '23514', null, 'un backslash si rifiuta');
select throws_ok(
  $$select public.notifiche_registra(array['11111111-1111-4111-8111-111111111111']::uuid[], 'sconosciuto', 'T', '', '<p>x</p>', null, false, 'test91/t1')$$,
  '23514', null, 'un tipo che non c''è si rifiuta');
select throws_ok(
  $$select public.notifiche_registra(array['11111111-1111-4111-8111-111111111111']::uuid[], 'backup', 'T', '', repeat('x', 200001), null, false, 'test91/h1')$$,
  '23514', null, 'un corpo oltre il limite si rifiuta');
select lives_ok(
  $$select public.notifiche_registra(array['11111111-1111-4111-8111-111111111111']::uuid[], 'backup', 'Backup del test 91', 'Mandato per email', '<p>ok</p>', '/settings/export', true, 'test91/backup')$$,
  'un link interno va bene');

-- a recipient of the marketing role (none gets one today): the table accepts any profile
select public.notifiche_registra(array['61616161-6161-4161-8161-616161616161']::uuid[],
  'promemoria_rinnovo', 'Per il marketing del test 91', '', '<p>m</p>', null, false, 'test91/marketing');

-- ---------------------------------------------------------------------------
-- 3. RLS: who reads what
-- ---------------------------------------------------------------------------
set local role authenticated;

set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(
  (select count(*)::int from public.notifiche where chiave like 'test91/%'),
  2,
  'l''admin legge le sue (il riepilogo e il backup) e non quelle degli altri'
);
select is(
  (select count(*)::int from public.notifiche where destinatario_id <> '11111111-1111-4111-8111-111111111111'),
  0,
  'nemmeno quelle del setter o del marketing: un promemoria è di chi lo riceve'
);

set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is((select count(*)::int from public.notifiche), 1, 'il setter legge solo la sua');

set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is((select count(*)::int from public.notifiche), 1, 'il marketing legge solo la sua');

set local request.jwt.claims to '{"sub":"55555555-5555-4555-8555-555555555555","role":"authenticated"}';
select is((select count(*)::int from public.notifiche), 0, 'il video editor, che non ne ha, nessuna');

set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is((select count(*)::int from public.notifiche), 0, 'il closer nessuna');

-- Claude connected: nothing, even for the owner of the rows
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated","client_id":"91000000-0000-4000-8000-000000000091","session_id":"91000000-0000-4000-8000-000000000191"}';
select is((select count(*)::int from public.notifiche), 0, 'un token di Claude dell''admin non legge niente');

-- ---------------------------------------------------------------------------
-- 4. Writes of a session
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select throws_ok(
  $$insert into public.notifiche (destinatario_id, tipo, titolo, corpo_html, chiave)
    values ('22222222-2222-4222-8222-222222222222', 'backup', 'Mia', '<p>x</p>', 'test91/mia')$$,
  '42501', null, 'una sessione non crea una notifica, nemmeno per sé');
select throws_ok(
  $$update public.notifiche set titolo = 'Cambiato' where destinatario_id = '22222222-2222-4222-8222-222222222222'$$,
  '42501', null, 'una sessione non cambia il testo di una notifica');
select is(
  pg_temp.righe($q$update public.notifiche set letta_il = now() where destinatario_id = '11111111-1111-4111-8111-111111111111'$q$),
  0,
  'il setter non segna lette quelle dell''admin');
select is(
  pg_temp.righe($q$delete from public.notifiche where destinatario_id = '11111111-1111-4111-8111-111111111111'$q$),
  0,
  'né le elimina');
select is(
  pg_temp.righe($q$update public.notifiche set letta_il = now() where destinatario_id = '22222222-2222-4222-8222-222222222222' and letta_il is null$q$),
  1,
  'segna letta la sua');
select ok(
  (select letta_il is not null from public.notifiche where destinatario_id = '22222222-2222-4222-8222-222222222222'),
  'ed è letta');
select is(
  pg_temp.righe($q$delete from public.notifiche where destinatario_id = '22222222-2222-4222-8222-222222222222'$q$),
  1,
  'elimina la sua');

-- the admin marks all of their own as read
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(
  pg_temp.righe($q$update public.notifiche set letta_il = now() where letta_il is null and chiave like 'test91/%'$q$),
  1,
  'l''admin ne ha una ancora da leggere (il backup) e la segna: quelle di prima erano già lette o sono sue');

-- an account that was switched off reads nothing
reset role;
set local request.jwt.claims to '{}';
update public.profiles set attivo = false where id = '61616161-6161-4161-8161-616161616161';
set local role authenticated;
set local request.jwt.claims to '{"sub":"61616161-6161-4161-8161-616161616161","role":"authenticated"}';
select is((select count(*)::int from public.notifiche), 0, 'un account disattivato non legge niente, nemmeno le sue');
reset role;
set local request.jwt.claims to '{}';
update public.profiles set attivo = true where id = '61616161-6161-4161-8161-616161616161';

-- ---------------------------------------------------------------------------
-- 5. Retention and backup
-- ---------------------------------------------------------------------------
insert into public.notifiche (destinatario_id, tipo, titolo, corpo_html, chiave, created_at) values
  ('11111111-1111-4111-8111-111111111111', 'backup', 'Vecchia', '<p>x</p>', 'test91/vecchia', now() - interval '13 months'),
  ('11111111-1111-4111-8111-111111111111', 'backup', 'Quasi vecchia', '<p>x</p>', 'test91/quasi', now() - interval '11 months');
select is(public.notifiche_pulizia(), 1, 'la pulizia toglie solo quello che ha più di 12 mesi');
select is(
  (select count(*)::int from public.notifiche where chiave in ('test91/vecchia', 'test91/quasi')), 1, 'e tiene l''altra');
select is((select count(*)::int from cron.job where jobname = 'notifiche-pulizia' and schedule = '40 2 * * *'), 1,
  'il lavoro notturno di pg_cron c''è');
select ok(not (public.backup_completo() ? 'notifiche'), 'il backup non legge le notifiche');
select ok(public.backup_completo() ? 'clients', 'ma legge ancora le altre tabelle');

-- ---------------------------------------------------------------------------
-- 6. The notices of the clients of the onboarding (1.78.0): an app-only kind, to the admins
-- ---------------------------------------------------------------------------
select is(
  public.notifiche_avviso_admin('onboarding_cliente', 'Mario Rossi si è registrato al percorso',
    'Il suo accesso al percorso è attivo.', null, '/onboarding/x', 'test91/onboarding_cliente'),
  (select count(*)::int from public.profiles where ruolo = 'admin' and attivo),
  'il tipo onboarding_cliente si scrive, per ogni admin attivo'
);
select is(
  (select array_agg(distinct canale) from public.notifiche where chiave = 'test91/onboarding_cliente'),
  array['app'], 'solo nell''app'
);

select * from finish();
rollback;
