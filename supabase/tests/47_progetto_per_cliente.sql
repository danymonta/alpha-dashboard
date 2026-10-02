-- One project for every paying client (Dany, 02/10/2026): the first cashed
-- instalment of a path opens it with the 8 tasks of the template for new
-- clients, its dates follow the path, an upsell never opens one, the coach is
-- picked with one tap and sees no money; the backfill finds every client on a
-- paid path.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(68);

-- People: two coaches (PM employees) and one person for nutrition, who comes
-- in later. Nobody else does nutrition during this test.
insert into public.invites (email, ruolo) values
  ('coach.a47@alpha.test', 'coach'),
  ('coach.b47@alpha.test', 'coach'),
  ('nutrizione47@alpha.test', 'nutrizione');
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, email_change, email_change_token_new, recovery_token)
values
  ('00000000-0000-0000-0000-000000000000', 'f4700000-0000-4000-8000-00000000000a',
   'authenticated', 'authenticated', 'coach.a47@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Coach Anna"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f4700000-0000-4000-8000-00000000000b',
   'authenticated', 'authenticated', 'coach.b47@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Coach Bruno"}'::jsonb, now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f4700000-0000-4000-8000-00000000000c',
   'authenticated', 'authenticated', 'nutrizione47@alpha.test', '', now(),
   '{}'::jsonb, '{"full_name":"Nina Nutrizione"}'::jsonb, now(), now(), '', '', '', '');
update public.profiles set attivo = false where ruolo = 'nutrizione';

create temp table ids (chiave text primary key, id uuid);
grant all on ids to authenticated;

create temp table titoli as
select array[
  'Call di onboarding',
  'Analisi e strategia iniziale',
  'Programmazione allenamento (creazione e aggiornamenti)',
  'Programmazione alimentare (creazione e aggiornamenti)',
  'Revisione video',
  'Call di check',
  'Assistenza chat',
  'Altre attività'
] as attesi;
grant all on titoli to authenticated;

-- ---------------------------------------------------------------------------
-- 1. The template for new clients
-- ---------------------------------------------------------------------------
select is(
  (select array_agg(m.nome || ' · ' || r.nome) from public.pm_modelli m
   join public.pm_reparti r on r.id = m.reparto_id where m.per_nuovi_clienti),
  array['Percorso cliente · Fitness Coaching'],
  'un solo modello per i nuovi clienti: Percorso cliente, nel Fitness Coaching'
);
select is(
  (select array_agg(v.titolo order by v.ordine) from public.pm_modelli_voci v
   join public.pm_modelli m on m.id = v.modello_id where m.per_nuovi_clienti),
  (select attesi from titoli),
  'con le sue 8 attività, nell''ordine'
);
select ok(
  (select bool_and(v.tasklist is null and v.inizio_giorni is null and v.durata_giorni is null)
   from public.pm_modelli_voci v join public.pm_modelli m on m.id = v.modello_id where m.per_nuovi_clienti),
  'fuori dalle liste e senza date: restano aperte per tutto il percorso'
);
select is(
  (select array_agg(v.titolo) from public.pm_modelli_voci v
   join public.pm_modelli m on m.id = v.modello_id where m.per_nuovi_clienti and v.per_ruolo = 'nutrizione'),
  array['Programmazione alimentare (creazione e aggiornamenti)'],
  'la programmazione alimentare è della nutrizione'
);
select throws_ok(
  $$ update public.pm_modelli set per_nuovi_clienti = true where nome = 'Campagna' $$,
  '22023', 'Il modello dei nuovi clienti va in un reparto che lavora sui clienti, come Fitness Coaching',
  'il modello dei nuovi clienti sta in un reparto che lavora sui clienti'
);

-- A client with upsells only (a university course sold on its own), a client
-- with three instalments for the deleted-project case, and a client whose
-- coaching is over (paid) while only an upsell is running
insert into public.clients (id, nome, cognome, created_by) values
  ('f4700000-0000-4000-8000-0000000000c2', 'Università', 'Prova47', '11111111-1111-4111-8111-111111111111'),
  ('f4700000-0000-4000-8000-0000000000c3', 'Cliente47', 'Tre rate', '11111111-1111-4111-8111-111111111111'),
  ('f4700000-0000-4000-8000-0000000000c4', 'Cliente47', 'Solo upsell in corso', '11111111-1111-4111-8111-111111111111');
insert into public.sales (id, client_id, product_id, tipo, data_vendita, data_inizio, valore_contratto, numero_rate, created_by)
values
  ('f4700000-0000-4000-8000-0000000000a2', 'f4700000-0000-4000-8000-0000000000c2',
   'aaaaaaa1-0000-4000-8000-000000000001', 'upsell', public.oggi(), public.oggi(), 900, 1,
   '11111111-1111-4111-8111-111111111111'),
  ('f4700000-0000-4000-8000-0000000000a3', 'f4700000-0000-4000-8000-0000000000c3',
   'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo', public.oggi(), public.oggi(), 1500, 3,
   '11111111-1111-4111-8111-111111111111'),
  ('f4700000-0000-4000-8000-0000000000a4', 'f4700000-0000-4000-8000-0000000000c4',
   'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo', public.oggi() - 120, public.oggi() - 120, 1500, 1,
   '11111111-1111-4111-8111-111111111111'),
  ('f4700000-0000-4000-8000-0000000000a5', 'f4700000-0000-4000-8000-0000000000c4',
   'aaaaaaa1-0000-4000-8000-000000000001', 'upsell', public.oggi() - 10, public.oggi() - 10, 600, 1,
   '11111111-1111-4111-8111-111111111111');
update public.payments
set stato = 'incassata', incassato_il = public.oggi() - 120, importo_incassato = importo_previsto
where sale_id in ('f4700000-0000-4000-8000-0000000000a4', 'f4700000-0000-4000-8000-0000000000a5');

-- Two sales cashed and corrected afterwards: one saved as an upsell by
-- mistake, one with a start (and so an end) in the past by mistake
insert into public.clients (id, nome, cognome, created_by) values
  ('f4700000-0000-4000-8000-0000000000c5', 'Cliente47', 'Tipo corretto', '11111111-1111-4111-8111-111111111111'),
  ('f4700000-0000-4000-8000-0000000000c6', 'Cliente47', 'Date corrette', '11111111-1111-4111-8111-111111111111');
insert into public.sales (id, client_id, product_id, tipo, data_vendita, data_inizio, valore_contratto, numero_rate, created_by)
values
  ('f4700000-0000-4000-8000-0000000000a6', 'f4700000-0000-4000-8000-0000000000c5',
   'aaaaaaa1-0000-4000-8000-000000000001', 'upsell', public.oggi(), public.oggi(), 1500, 1,
   '11111111-1111-4111-8111-111111111111'),
  ('f4700000-0000-4000-8000-0000000000a7', 'f4700000-0000-4000-8000-0000000000c6',
   'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo', public.oggi(), public.oggi() - 200, 1500, 1,
   '11111111-1111-4111-8111-111111111111');
update public.payments
set stato = 'incassata', incassato_il = public.oggi(), importo_incassato = importo_previsto
where sale_id in ('f4700000-0000-4000-8000-0000000000a6', 'f4700000-0000-4000-8000-0000000000a7');

-- ---------------------------------------------------------------------------
-- 2. A new sale: the first cashed instalment opens the project
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

with r as (
  select * from public.registra_vendita(
    p_product_id => 'aaaaaaa1-0000-4000-8000-000000000001',
    p_tipo => 'nuovo',
    p_data_vendita => public.oggi(),
    p_data_inizio => public.oggi() + 7,
    p_valore_contratto => 1500,
    p_numero_rate => 2,
    p_nome => 'Cliente47',
    p_cognome => 'Pagante'
  )
)
insert into ids
select 'vendita', id_vendita from r
union all
select 'cliente', id_cliente from r;

select is(
  (select count(*)::int from public.pm_progetti where client_id = (select id from ids where chiave = 'cliente')),
  0,
  'una vendita con le rate ancora da pagare non apre il progetto'
);

select lives_ok(
  $$ select * from public.segna_rata_incassata(
       (select id from public.payments where sale_id = (select id from ids where chiave = 'vendita') and numero_rata = 1)) $$,
  'la prima rata è incassata'
);
insert into ids select 'progetto', id from public.pm_progetti where client_id = (select id from ids where chiave = 'cliente');

select is(
  (select count(*)::int from public.pm_progetti where client_id = (select id from ids where chiave = 'cliente')),
  1,
  'la prima rata incassata apre il progetto del cliente'
);
select is(
  (select p.nome || ' · ' || r.nome from public.pm_progetti p join public.pm_reparti r on r.id = p.reparto_id
   where p.id = (select id from ids where chiave = 'progetto')),
  'Cliente47 Pagante · Fitness Coaching',
  'col nome del cliente, nel Fitness Coaching'
);
select is(
  (select array[p.data_inizio, p.data_fine] from public.pm_progetti p where p.id = (select id from ids where chiave = 'progetto')),
  (select array[s.data_inizio, s.data_fine] from public.sales s where s.id = (select id from ids where chiave = 'vendita')),
  'dall''inizio alla fine del percorso'
);
select is(
  (select array_agg(t.titolo order by t.ordine) from public.pm_task t where t.progetto_id = (select id from ids where chiave = 'progetto')),
  (select attesi from titoli),
  'con gli 8 task del modello'
);
select ok(
  (select bool_and(t.data_inizio is null and t.scadenza is null and t.tasklist_id is null)
   from public.pm_task t where t.progetto_id = (select id from ids where chiave = 'progetto')),
  'senza date e senza liste'
);
select is(
  (select count(*)::int from public.pm_membri where progetto_id = (select id from ids where chiave = 'progetto'))
  + (select count(*)::int from public.pm_task_assegnatari a join public.pm_task t on t.id = a.task_id
     where t.progetto_id = (select id from ids where chiave = 'progetto')),
  0,
  'nessun membro e nessun assegnatario: il coach si sceglie dopo'
);
select is(
  (select coach_id from public.v_pm_progetti where id = (select id from ids where chiave = 'progetto')),
  null,
  'e la vista lo dice senza coach'
);

select lives_ok(
  $$ select * from public.segna_rata_incassata(
       (select id from public.payments where sale_id = (select id from ids where chiave = 'vendita') and numero_rata = 2)) $$,
  'anche la seconda rata è incassata'
);
select is(
  (select count(*)::int from public.pm_progetti where client_id = (select id from ids where chiave = 'cliente'))
  * 100 + (select count(*)::int from public.pm_task where progetto_id = (select id from ids where chiave = 'progetto')),
  108,
  'la seconda rata non apre un altro progetto né altri task'
);

select throws_ok(
  $$ select public.pm_crea_progetto((select id from public.pm_reparti where nome = 'Fitness Coaching'), 'Doppione', null,
       (select id from ids where chiave = 'cliente')) $$,
  '22023', 'Questo cliente ha già il suo progetto: lo apri dalla scheda del cliente',
  'un cliente ha un solo progetto, anche creandolo a mano'
);

-- An upsell never opens one
select lives_ok(
  $$ select * from public.segna_rata_incassata(
       (select id from public.payments where sale_id = 'f4700000-0000-4000-8000-0000000000a2' and numero_rata = 1)) $$,
  'l''upsell è incassato'
);
select is(
  (select count(*)::int from public.pm_progetti where client_id = 'f4700000-0000-4000-8000-0000000000c2'),
  0,
  'un upsell non apre mai un progetto'
);

-- A project deleted on purpose does not come back at the next instalment
select public.segna_rata_incassata(
  (select id from public.payments where sale_id = 'f4700000-0000-4000-8000-0000000000a3' and numero_rata = 1));
delete from public.pm_progetti where client_id = 'f4700000-0000-4000-8000-0000000000c3';
select public.segna_rata_incassata(
  (select id from public.payments where sale_id = 'f4700000-0000-4000-8000-0000000000a3' and numero_rata = 2));
select is(
  (select count(*)::int from public.pm_progetti where client_id = 'f4700000-0000-4000-8000-0000000000c3'),
  0,
  'un progetto eliminato apposta non torna alla rata dopo'
);

-- The closer cashes the first instalment of his own sale: the project is the
-- app's, not his (he would be the author of the coach's tasks otherwise)
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
with r as (
  select * from public.registra_vendita(
    p_product_id => 'aaaaaaa1-0000-4000-8000-000000000001',
    p_tipo => 'nuovo',
    p_data_vendita => public.oggi(),
    p_data_inizio => public.oggi(),
    p_valore_contratto => 1500,
    p_numero_rate => 1,
    p_nome => 'Cliente47',
    p_cognome => 'Del closer'
  )
)
insert into ids
select 'vendita_closer', id_vendita from r
union all
select 'cliente_closer', id_cliente from r;
select lives_ok(
  $$ select * from public.segna_rata_incassata(
       (select id from public.payments where sale_id = (select id from ids where chiave = 'vendita_closer'))) $$,
  'il closer incassa la prima rata della sua vendita'
);
select is(
  (select auth.uid()),
  '33333333-3333-4333-8333-333333333333'::uuid,
  'e la sua sessione resta la sua, dopo il progetto'
);
reset role;
select is(
  (select count(*)::int from public.pm_progetti where client_id = (select id from ids where chiave = 'cliente_closer')),
  1,
  'anche quando incassa il closer, il progetto del cliente nasce'
);
select ok(
  (select p.created_by is null from public.pm_progetti p where p.client_id = (select id from ids where chiave = 'cliente_closer'))
  and (select bool_and(t.created_by is null) from public.pm_task t
       join public.pm_progetti p on p.id = t.progetto_id
       where p.client_id = (select id from ids where chiave = 'cliente_closer')),
  'progetto e task senza autore: sono dell''app, non di chi ha incassato'
);

-- A sale corrected after its first instalment was cashed opens the project then
select is(
  (select count(*)::int from public.pm_progetti
   where client_id in ('f4700000-0000-4000-8000-0000000000c5', 'f4700000-0000-4000-8000-0000000000c6')),
  0,
  'un upsell incassato e un percorso già finito non aprono il progetto'
);
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ update public.sales set tipo = 'nuovo' where id = 'f4700000-0000-4000-8000-0000000000a6' $$,
  'l''admin corregge l''upsell in vendita nuova'
);
select is(
  (select count(*)::int from public.pm_task t join public.pm_progetti p on p.id = t.progetto_id
   where p.client_id = 'f4700000-0000-4000-8000-0000000000c5'),
  8,
  'e il progetto del cliente si apre, con i suoi task'
);
select lives_ok(
  $$ update public.sales set data_inizio = public.oggi(), data_fine = public.oggi() + 90
     where id = 'f4700000-0000-4000-8000-0000000000a7' $$,
  'l''admin corregge le date del percorso'
);
select is(
  (select array[p.data_inizio, p.data_fine] from public.pm_progetti p
   where p.client_id = 'f4700000-0000-4000-8000-0000000000c6'),
  array[public.oggi(), public.oggi() + 90],
  'e il progetto si apre con le date giuste'
);

-- ---------------------------------------------------------------------------
-- 3. The dates follow the path
-- ---------------------------------------------------------------------------
with r as (
  select * from public.registra_vendita(
    p_product_id => 'aaaaaaa1-0000-4000-8000-000000000001',
    p_tipo => 'rinnovo',
    p_data_vendita => public.oggi(),
    p_data_inizio => (select data_fine + 1 from public.sales where id = (select id from ids where chiave = 'vendita')),
    p_valore_contratto => 1500,
    p_numero_rate => 1,
    p_client_id => (select id from ids where chiave = 'cliente')
  )
)
insert into ids select 'rinnovo', id_vendita from r;

select is(
  (select data_fine from public.pm_progetti where id = (select id from ids where chiave = 'progetto')),
  (select data_fine from public.sales where id = (select id from ids where chiave = 'rinnovo')),
  'il rinnovo allunga il progetto'
);

select lives_ok(
  $$ select * from public.interrompi_percorso(
       (select id from ids where chiave = 'rinnovo'),
       (select data_inizio + 10 from public.sales where id = (select id from ids where chiave = 'rinnovo')),
       false, true) $$,
  'il rinnovo si interrompe dopo dieci giorni'
);
select is(
  (select data_fine from public.pm_progetti where id = (select id from ids where chiave = 'progetto')),
  (select data_inizio + 10 from public.sales where id = (select id from ids where chiave = 'rinnovo')),
  'interrompere il percorso accorcia il progetto'
);

delete from public.sales where id = (select id from ids where chiave = 'rinnovo');
select is(
  (select array[p.data_inizio, p.data_fine] from public.pm_progetti p where p.id = (select id from ids where chiave = 'progetto')),
  (select array[s.data_inizio, s.data_fine] from public.sales s where s.id = (select id from ids where chiave = 'vendita')),
  'eliminato il rinnovo, il progetto torna alla fine del primo percorso'
);

-- A client renamed renames the project, unless it was renamed by hand
update public.clients set nome = 'Cliente47b' where id = (select id from ids where chiave = 'cliente');
select is(
  (select nome from public.pm_progetti where id = (select id from ids where chiave = 'progetto')),
  'Cliente47b Pagante',
  'il progetto prende il nuovo nome del cliente'
);
update public.pm_progetti set nome = 'Percorso speciale' where client_id = 'f4700000-0000-4000-8000-0000000000c5';
update public.clients set cognome = 'Tipo giusto' where id = 'f4700000-0000-4000-8000-0000000000c5';
select is(
  (select nome from public.pm_progetti where client_id = 'f4700000-0000-4000-8000-0000000000c5'),
  'Percorso speciale',
  'un nome scelto a mano resta'
);

-- ---------------------------------------------------------------------------
-- 4. Nobody calls the internal functions
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ select public.pm_crea_progetto_cliente((select id from ids where chiave = 'cliente')) $$,
  '42501', null, 'neanche l''admin chiama la funzione interna che crea il progetto'
);
select throws_ok(
  $$ select public.pm_crea_progetti_clienti_attivi() $$,
  '42501', null, 'né il recupero dei progetti mancanti'
);
select throws_ok(
  $$ select public.pm_allinea_progetto_cliente((select id from ids where chiave = 'cliente')) $$,
  '42501', null, 'né l''allineamento delle date'
);
select throws_ok(
  $$ select public.pm_applica_modello((select id from ids where chiave = 'progetto'),
       (select id from public.pm_modelli where per_nuovi_clienti), public.oggi(), null) $$,
  '42501', null, 'né l''applicazione di un modello'
);

-- ---------------------------------------------------------------------------
-- 5. The coach: picked with one tap, sees the project and no money
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"f4700000-0000-4000-8000-00000000000a","role":"authenticated"}';
select is(
  (select count(*)::int from public.pm_progetti where id = (select id from ids where chiave = 'progetto')),
  0,
  'il coach non vede il progetto finché non è il suo coach'
);
select throws_ok(
  $$ select public.pm_scegli_coach((select id from ids where chiave = 'progetto'), 'f4700000-0000-4000-8000-00000000000a') $$,
  '42501', 'Il coach lo sceglie chi gestisce il progetto',
  'un coach non si sceglie da solo'
);
select throws_ok(
  $$ select public.pm_crea_progetto_cliente((select id from ids where chiave = 'cliente')) $$,
  '42501', null, 'e non crea progetti di clienti'
);

-- nobody does nutrition yet: every task goes to the coach
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select public.pm_scegli_coach((select id from ids where chiave = 'progetto'), 'f4700000-0000-4000-8000-00000000000a') $$,
  'l''admin sceglie il coach'
);
select is(
  (select array_agg(profile_id) from public.pm_membri where progetto_id = (select id from ids where chiave = 'progetto')),
  array['f4700000-0000-4000-8000-00000000000a']::uuid[],
  'il coach entra nel progetto'
);
select is(
  (select count(*)::int from public.pm_task t
   where t.progetto_id = (select id from ids where chiave = 'progetto')
     and exists (select 1 from public.pm_task_assegnatari a
                 where a.task_id = t.id and a.profile_id = 'f4700000-0000-4000-8000-00000000000a')),
  8,
  'senza nessuno della nutrizione, gli 8 task vanno tutti al coach'
);
select is(
  (select coach_id from public.v_pm_progetti where id = (select id from ids where chiave = 'progetto')),
  'f4700000-0000-4000-8000-00000000000a'::uuid,
  'ed è il coach del progetto'
);
select throws_ok(
  $$ select public.pm_scegli_coach(
       (select id from public.pm_progetti where client_id is null order by created_at limit 1),
       'f4700000-0000-4000-8000-00000000000a') $$,
  '22023', 'Il coach si sceglie nei progetti dei clienti',
  'il coach si sceglie solo nei progetti dei clienti'
);

-- nutrition arrives; the admin works on a task of his own in the project; the
-- first coach is a PM manager, and as a member he hands the client over
reset role;
update public.profiles set attivo = true where id = 'f4700000-0000-4000-8000-00000000000c';
update public.profiles set livello_pm = 'manager' where id = 'f4700000-0000-4000-8000-00000000000a';
insert into public.pm_membri (progetto_id, profile_id)
select id, '11111111-1111-4111-8111-111111111111' from ids where chiave = 'progetto';
with t as (
  insert into public.pm_task (progetto_id, titolo, ordine)
  select id, 'Montaggio del video', 99 from ids where chiave = 'progetto'
  returning id
)
insert into public.pm_task_assegnatari (task_id, profile_id)
select id, '11111111-1111-4111-8111-111111111111' from t;
set local role authenticated;
set local request.jwt.claims to '{"sub":"f4700000-0000-4000-8000-00000000000a","role":"authenticated"}';
select lives_ok(
  $$ select public.pm_scegli_coach((select id from ids where chiave = 'progetto'), 'f4700000-0000-4000-8000-00000000000b') $$,
  'un manager membro del progetto cambia coach'
);
select is(
  (select array_agg(a.profile_id) from public.pm_task_assegnatari a join public.pm_task t on t.id = a.task_id
   where t.progetto_id = (select id from ids where chiave = 'progetto')
     and t.titolo = 'Programmazione alimentare (creazione e aggiornamenti)'),
  array['f4700000-0000-4000-8000-00000000000c']::uuid[],
  'la programmazione alimentare va a chi fa nutrizione'
);
select is(
  (select count(*)::int from public.pm_task_assegnatari a join public.pm_task t on t.id = a.task_id
   where t.progetto_id = (select id from ids where chiave = 'progetto')
     and a.profile_id = 'f4700000-0000-4000-8000-00000000000b'),
  7,
  'gli altri 7 task al nuovo coach'
);
select is(
  (select count(*)::int from public.pm_task_assegnatari a join public.pm_task t on t.id = a.task_id
   where t.progetto_id = (select id from ids where chiave = 'progetto')
     and a.profile_id = 'f4700000-0000-4000-8000-00000000000a'),
  0,
  'il coach di prima lascia i suoi task'
);
select is(
  (select array_agg(profile_id order by profile_id) from public.pm_membri
   where progetto_id = (select id from ids where chiave = 'progetto')),
  array['11111111-1111-4111-8111-111111111111', 'f4700000-0000-4000-8000-00000000000a',
        'f4700000-0000-4000-8000-00000000000b', 'f4700000-0000-4000-8000-00000000000c']::uuid[],
  'e resta nel team, con il nuovo coach e chi fa nutrizione'
);
select is(
  (select array_agg(a.profile_id) from public.pm_task_assegnatari a join public.pm_task t on t.id = a.task_id
   where t.progetto_id = (select id from ids where chiave = 'progetto') and t.titolo = 'Montaggio del video'),
  array['11111111-1111-4111-8111-111111111111']::uuid[],
  'un task di un''altra persona resta a lei'
);

-- the coach sees the project and its tasks, never a client's money
set local request.jwt.claims to '{"sub":"f4700000-0000-4000-8000-00000000000b","role":"authenticated"}';
select is(
  (select count(*)::int from public.v_pm_task where progetto_id = (select id from ids where chiave = 'progetto')),
  9,
  'il coach vede il progetto del suo cliente e i suoi task'
);
select is(
  (select count(*)::int from public.sales) + (select count(*)::int from public.payments)
  + (select count(*)::int from public.clients) + (select count(*)::int from public.v_vendite),
  0,
  'e nessun importo: clienti, vendite e rate restano chiusi'
);

-- two profiles merged: the project keeps its coach
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select is(
  (public.anteprima_eliminazione('cliente', (select id from ids where chiave = 'cliente')) ->> 'progetti')::int,
  1,
  'eliminando il cliente, l''anteprima conta il suo progetto'
);
select public.unisci_profili('f4700000-0000-4000-8000-00000000000b', 'f4700000-0000-4000-8000-00000000000c');
select is(
  (select coach_id from public.pm_progetti where id = (select id from ids where chiave = 'progetto')),
  'f4700000-0000-4000-8000-00000000000c'::uuid,
  'unendo il coach a un altro membro del progetto, il progetto tiene il coach'
);

-- ---------------------------------------------------------------------------
-- 6. The backfill: every client on a paid path, never an upsell-only one
-- ---------------------------------------------------------------------------
reset role;
delete from public.pm_progetti where client_id is not null;

select is(
  (select stato::text from public.v_client_status where client_id = 'f4700000-0000-4000-8000-0000000000c4'),
  'attivo',
  'chi ha in corso solo un upsell risulta attivo tra i clienti'
);

-- expected: a paid path (nuovo or rinnovo) and a path today, in progress or
-- paid and starting later; upsells never count
create temp table attesi as
with percorsi as (
  select s.id, s.client_id, s.data_inizio, s.data_fine,
         exists (select 1 from public.payments x where x.sale_id = s.id and x.stato = 'incassata') as pagato
  from public.sales s
  where s.tipo <> 'upsell'
)
select distinct p.client_id as id
from percorsi p
where p.data_fine >= public.oggi()
  and (p.data_inizio <= public.oggi() or p.pagato)
  and exists (select 1 from percorsi q where q.client_id = p.client_id and q.pagato);

select is(
  public.pm_crea_progetti_clienti_attivi(),
  (select count(*)::int from attesi),
  'il recupero apre un progetto per ogni cliente in un percorso pagato'
);
select is(
  (select array_agg(client_id order by client_id) from public.pm_progetti where client_id is not null),
  (select array_agg(id order by id) from attesi),
  'esattamente quelli'
);
select ok(
  exists (select 1 from public.pm_progetti where client_id = (select id from ids where chiave = 'cliente')),
  'anche chi ha pagato e inizia tra una settimana'
);
select is(
  (select count(*)::int from public.pm_progetti where client_id = 'f4700000-0000-4000-8000-0000000000c2'),
  0,
  'mai per chi ha solo upsell'
);
select is(
  (select count(*)::int from public.pm_progetti where client_id = 'f4700000-0000-4000-8000-0000000000c4'),
  0,
  'né per chi ha finito il percorso e ha in corso solo un upsell, anche se risulta attivo'
);
select is(public.pm_crea_progetti_clienti_attivi(), 0, 'rilanciato, non crea doppioni');

-- ---------------------------------------------------------------------------
-- 7. One template for new clients: choosing another one moves the flag
-- ---------------------------------------------------------------------------
insert into public.pm_modelli (reparto_id, nome, per_nuovi_clienti)
select id, 'Percorso breve', true from public.pm_reparti where nome = 'Fitness Coaching';
select is(
  (select array_agg(nome) from public.pm_modelli where per_nuovi_clienti),
  array['Percorso breve'],
  'scegliendo un altro modello per i nuovi clienti, il primo smette di esserlo'
);
select throws_ok(
  $$ update public.pm_modelli set attivo = false where nome = 'Percorso breve' $$,
  '22023', 'Il modello dei nuovi clienti resta attivo: per spegnerlo togli prima «Per i nuovi clienti» dal modello',
  'il modello dei nuovi clienti non si spegne: i progetti nascerebbero senza task'
);
insert into public.pm_modelli (reparto_id, nome, attivo, per_nuovi_clienti)
select id, 'Percorso spento', false, true from public.pm_reparti where nome = 'Fitness Coaching';
select is(
  (select attivo from public.pm_modelli where nome = 'Percorso spento'),
  true,
  'scelto per i nuovi clienti, un modello spento torna attivo'
);
select throws_ok(
  $$ insert into public.pm_progetti (reparto_id, nome, client_id)
     select (select id from public.pm_reparti where nome = 'Fitness Coaching'), 'Doppione',
            (select id from ids where chiave = 'cliente') $$,
  '23505', null,
  'il database rifiuta un secondo progetto per lo stesso cliente'
);

select * from finish();
rollback;
