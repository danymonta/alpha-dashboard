-- The client's project reopens at the renewal (Dany, 02/10/2026: «sì riaprilo
-- al rinnovo»): the first cashed instalment of a path (nuovo or rinnovo, not
-- over) brings a project "completato" or "archiviato" back to "attivo"; "in
-- pausa" stays; a second instalment never reopens a project closed again; an
-- upsell never reopens; the closer cashing his sale reopens it too; a sale
-- corrected into a renewal reopens it; a client back with a new sale reopens
-- it; an active project is not touched; nothing else changes (but the
-- completed template tasks, which reopen since 03/10/2026:
-- 50_task_riaperti.sql), and nothing ever blocks the cash.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(36);

-- Seed: admin 1111, closer 3333, coach 4444 (PM manager), product 3 months.
create temp table ids (chiave text primary key, id uuid);
grant all on ids to authenticated;

-- ---------------------------------------------------------------------------
-- Fixtures: ten clients whose first path (paid) is over, each with the
-- project the app made for it
-- ---------------------------------------------------------------------------
insert into public.clients (id, nome, cognome, created_by) values
  ('f4900000-0000-4000-8000-0000000000c1', 'Cliente49', 'Completato', '11111111-1111-4111-8111-111111111111'),
  ('f4900000-0000-4000-8000-0000000000c2', 'Cliente49', 'Archiviato', '11111111-1111-4111-8111-111111111111'),
  ('f4900000-0000-4000-8000-0000000000c3', 'Cliente49', 'In pausa', '11111111-1111-4111-8111-111111111111'),
  ('f4900000-0000-4000-8000-0000000000c4', 'Cliente49', 'Upsell', '11111111-1111-4111-8111-111111111111'),
  ('f4900000-0000-4000-8000-0000000000c5', 'Cliente49', 'Del closer', '11111111-1111-4111-8111-111111111111'),
  ('f4900000-0000-4000-8000-0000000000c6', 'Cliente49', 'Corretto', '11111111-1111-4111-8111-111111111111'),
  ('f4900000-0000-4000-8000-0000000000c7', 'Cliente49', 'Bloccato', '11111111-1111-4111-8111-111111111111'),
  ('f4900000-0000-4000-8000-0000000000c8', 'Cliente49', 'Ritorno', '11111111-1111-4111-8111-111111111111'),
  ('f4900000-0000-4000-8000-0000000000c9', 'Cliente49', 'Pausa corretta', '11111111-1111-4111-8111-111111111111'),
  ('f4900000-0000-4000-8000-0000000000ca', 'Cliente49', 'Gia attivo', '11111111-1111-4111-8111-111111111111');

insert into public.sales (client_id, product_id, tipo, data_vendita, data_inizio, valore_contratto, numero_rate, created_by)
select c.id, 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo', public.oggi() - 120, public.oggi() - 120, 1500, 1,
       '11111111-1111-4111-8111-111111111111'
from public.clients c where c.nome = 'Cliente49';
update public.payments x
set stato = 'incassata', incassato_il = public.oggi() - 120, importo_incassato = x.importo_previsto
from public.sales s
join public.clients c on c.id = s.client_id
where x.sale_id = s.id and c.nome = 'Cliente49';

select pm_crea_progetto_cliente(c.id) from public.clients c where c.nome = 'Cliente49';
insert into ids
select lower(c.cognome), p.id
from public.pm_progetti p join public.clients c on c.id = p.client_id
where c.nome = 'Cliente49';

-- ---------------------------------------------------------------------------
-- 1. Completato: the coach closed it at the end of the path, the client renews
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select public.pm_scegli_coach((select id from ids where chiave = 'completato'), '44444444-4444-4444-8444-444444444444');

set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
update public.pm_task set stato = 'completato'
where progetto_id = (select id from ids where chiave = 'completato') and titolo = 'Call di onboarding';
select lives_ok(
  $$ update public.pm_progetti set stato = 'completato' where id = (select id from ids where chiave = 'completato') $$,
  'il coach chiude il progetto a fine percorso'
);

-- what must not change
reset role;
-- the task was completed during the first path, long before the renewal
update public.pm_task set completato_il = now() - interval '40 days'
where progetto_id = (select id from ids where chiave = 'completato') and stato = 'completato';
create temp table prima as
select p.nome, p.reparto_id, p.coach_id, p.responsabile_id, p.created_by, p.descrizione,
       (select array_agg(m.profile_id order by m.profile_id) from public.pm_membri m where m.progetto_id = p.id) as membri,
       (select array_agg(t.titolo || ' · ' || t.stato || ' · ' || coalesce(t.completato_il::text, '-') order by t.ordine, t.id)
        from public.pm_task t where t.progetto_id = p.id) as task,
       (select array_agg(a.task_id::text || a.profile_id::text order by a.task_id, a.profile_id)
        from public.pm_task_assegnatari a join public.pm_task t on t.id = a.task_id where t.progetto_id = p.id) as assegnatari
from public.pm_progetti p where p.id = (select id from ids where chiave = 'completato');
grant all on prima to authenticated;

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
with r as (
  select * from public.registra_vendita(
    p_product_id => 'aaaaaaa1-0000-4000-8000-000000000001',
    p_tipo => 'rinnovo',
    p_data_vendita => public.oggi(),
    p_data_inizio => public.oggi(),
    p_valore_contratto => 1500,
    p_numero_rate => 2,
    p_client_id => 'f4900000-0000-4000-8000-0000000000c1'
  )
)
insert into ids select 'rinnovo', id_vendita from r;

select is(
  (select stato::text from public.pm_progetti where id = (select id from ids where chiave = 'completato')),
  'completato',
  'il rinnovo firmato, senza incasso, non riapre il progetto'
);

select lives_ok(
  $$ select * from public.segna_rata_incassata(
       (select id from public.payments where sale_id = (select id from ids where chiave = 'rinnovo') and numero_rata = 1)) $$,
  'la prima rata del rinnovo è incassata'
);
select is(
  (select stato::text from public.pm_progetti where id = (select id from ids where chiave = 'completato')),
  'attivo',
  'la prima rata del rinnovo riporta il progetto completato tra gli attivi'
);
select is(
  (select count(*)::int from public.pm_progetti where client_id = 'f4900000-0000-4000-8000-0000000000c1'),
  1,
  'lo stesso progetto, nessun altro'
);

reset role;
select is(
  (select row(p.nome, p.reparto_id, p.coach_id, p.responsabile_id, p.created_by, p.descrizione)::text
   from public.pm_progetti p where p.id = (select id from ids where chiave = 'completato')),
  (select row(nome, reparto_id, coach_id, responsabile_id, created_by, descrizione)::text from prima),
  'nome, reparto, coach e autore restano'
);
select is(
  (select array_agg(m.profile_id order by m.profile_id) from public.pm_membri m
   where m.progetto_id = (select id from ids where chiave = 'completato')),
  (select membri from prima),
  'i membri restano'
);
-- since 03/10/2026 the completed template tasks reopen too: 50_task_riaperti.sql
select is(
  (select array_agg(t.titolo || ' · ' || t.stato || ' · ' || coalesce(t.completato_il::text, '-') order by t.ordine, t.id)
   from public.pm_task t where t.progetto_id = (select id from ids where chiave = 'completato')),
  (select array_agg(regexp_replace(x, ' · completato · .*$', ' · da_fare · -') order by o)
   from unnest((select task from prima)) with ordinality u(x, o)),
  'gli stessi task, e quello completato si riapre'
);
select is(
  (select array_agg(a.task_id::text || a.profile_id::text order by a.task_id, a.profile_id)
   from public.pm_task_assegnatari a join public.pm_task t on t.id = a.task_id
   where t.progetto_id = (select id from ids where chiave = 'completato')),
  (select assegnatari from prima),
  'e restano al coach'
);
select is(
  (select array[p.data_inizio, p.data_fine] from public.pm_progetti p where p.id = (select id from ids where chiave = 'completato')),
  (select array[min(s.data_inizio), max(s.data_fine)] from public.sales s
   where s.client_id = 'f4900000-0000-4000-8000-0000000000c1'),
  'le date sono quelle del percorso, rinnovo compreso'
);
select is(
  (select scaduto from public.v_pm_progetti where id = (select id from ids where chiave = 'completato')),
  false,
  'e il progetto non risulta scaduto'
);

-- the coach closes it again during the path: the second instalment leaves it closed
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
update public.pm_progetti set stato = 'completato' where id = (select id from ids where chiave = 'completato');
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select * from public.segna_rata_incassata(
       (select id from public.payments where sale_id = (select id from ids where chiave = 'rinnovo') and numero_rata = 2)) $$,
  'anche la seconda rata del rinnovo è incassata'
);
select is(
  (select stato::text from public.pm_progetti where id = (select id from ids where chiave = 'completato')),
  'completato',
  'la seconda rata non riapre un progetto che chi lo gestisce ha chiuso di nuovo'
);

-- ---------------------------------------------------------------------------
-- 2. Archiviato reopens, in pausa stays, an upsell never reopens
-- ---------------------------------------------------------------------------
reset role;
update public.pm_progetti set stato = 'archiviato' where id = (select id from ids where chiave = 'archiviato');
update public.pm_progetti set stato = 'in_pausa' where id = (select id from ids where chiave = 'in pausa');
update public.pm_progetti set stato = 'completato'
where id in (select id from ids where chiave in ('upsell', 'del closer', 'corretto', 'bloccato'));

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
with r as (
  select c.cognome, v.*
  from public.clients c,
  lateral public.registra_vendita(
    p_product_id => 'aaaaaaa1-0000-4000-8000-000000000001',
    p_tipo => case when c.cognome in ('Upsell', 'Corretto') then 'upsell' else 'rinnovo' end::public.sale_type,
    p_data_vendita => public.oggi(),
    p_data_inizio => public.oggi(),
    p_valore_contratto => 1500,
    p_numero_rate => 1,
    p_client_id => c.id
  ) v
  where c.nome = 'Cliente49' and c.cognome in ('Archiviato', 'In pausa', 'Upsell', 'Corretto', 'Bloccato')
)
insert into ids select 'vendita ' || lower(cognome), id_vendita from r;

select lives_ok(
  $$ select public.segna_rata_incassata(x.id)
     from public.payments x
     where x.sale_id in (select id from ids where chiave in ('vendita archiviato', 'vendita in pausa', 'vendita upsell', 'vendita corretto')) $$,
  'le prime rate di rinnovi e upsell sono incassate'
);
select is(
  (select stato::text from public.pm_progetti where id = (select id from ids where chiave = 'archiviato')),
  'attivo',
  'un progetto archiviato torna attivo al rinnovo'
);
select is(
  (select stato::text from public.pm_progetti where id = (select id from ids where chiave = 'in pausa')),
  'in_pausa',
  'un progetto in pausa resta in pausa: il rinnovo non smentisce una pausa'
);
select is(
  (select stato::text from public.pm_progetti where id = (select id from ids where chiave = 'upsell')),
  'completato',
  'un upsell non riapre mai il progetto'
);

-- ---------------------------------------------------------------------------
-- 3. A sale saved as an upsell by mistake, corrected into a renewal
-- ---------------------------------------------------------------------------
select is(
  (select stato::text from public.pm_progetti where id = (select id from ids where chiave = 'corretto')),
  'completato',
  'l''upsell incassato per errore non lo riapre'
);
select lives_ok(
  $$ update public.sales set tipo = 'rinnovo' where id = (select id from ids where chiave = 'vendita corretto') $$,
  'l''admin corregge l''upsell in rinnovo'
);
select is(
  (select stato::text from public.pm_progetti where id = (select id from ids where chiave = 'corretto')),
  'attivo',
  'e il progetto torna attivo, come alla prima rata'
);

-- ---------------------------------------------------------------------------
-- 4. The closer cashes the renewal of his sale: the project reopens, though he
--    is not a member and never sees it
-- ---------------------------------------------------------------------------
reset role;
insert into public.sales (id, client_id, product_id, tipo, closer_id, data_vendita, data_inizio, valore_contratto, numero_rate, created_by)
values ('f4900000-0000-4000-8000-0000000000a5', 'f4900000-0000-4000-8000-0000000000c5',
        'aaaaaaa1-0000-4000-8000-000000000001', 'rinnovo', '33333333-3333-4333-8333-333333333333',
        public.oggi(), public.oggi(), 1500, 1, '33333333-3333-4333-8333-333333333333');

set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(
  (select count(*)::int from public.pm_progetti where id = (select id from ids where chiave = 'del closer')),
  0,
  'il closer non vede il progetto del cliente'
);
select lives_ok(
  $$ select * from public.segna_rata_incassata(
       (select id from public.payments where sale_id = 'f4900000-0000-4000-8000-0000000000a5')) $$,
  'il closer incassa la prima rata del rinnovo'
);
select is(
  (select auth.uid()),
  '33333333-3333-4333-8333-333333333333'::uuid,
  'e la sua sessione resta la sua'
);
reset role;
select is(
  (select stato::text || ' · ' || coalesce(created_by::text, 'app') from public.pm_progetti
   where id = (select id from ids where chiave = 'del closer')),
  'attivo · app',
  'anche quando incassa il closer, il progetto torna attivo e resta dell''app'
);

-- ---------------------------------------------------------------------------
-- 5. Nothing ever blocks the cash: a project that cannot reopen is a warning
-- ---------------------------------------------------------------------------
create function pg_temp.blocca_progetto() returns trigger language plpgsql as $$
begin
  raise exception 'progetto bloccato dal test';
end;
$$;
create trigger blocca_progetto before update on public.pm_progetti
  for each row when (old.client_id = 'f4900000-0000-4000-8000-0000000000c7')
  execute function pg_temp.blocca_progetto();

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select * from public.segna_rata_incassata(
       (select id from public.payments where sale_id = (select id from ids where chiave = 'vendita bloccato'))) $$,
  'un progetto che non si riesce a riaprire non blocca l''incasso'
);
reset role;
select is(
  (select x.stato::text || ' · ' || p.stato::text
   from public.payments x, public.pm_progetti p
   where x.sale_id = (select id from ids where chiave = 'vendita bloccato')
     and p.id = (select id from ids where chiave = 'bloccato')),
  'incassata · completato',
  'la rata resta incassata, il progetto com''era'
);
drop trigger blocca_progetto on public.pm_progetti;

-- ---------------------------------------------------------------------------
-- 6. A client back with a new sale reopens it too; a paused project stays
--    paused when an upsell is corrected into a renewal; an active project is
--    not even touched by the renewal's cash
-- ---------------------------------------------------------------------------
update public.pm_progetti set stato = 'completato' where id = (select id from ids where chiave = 'ritorno');
update public.pm_progetti set stato = 'in_pausa' where id = (select id from ids where chiave = 'pausa corretta');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
with r as (
  select c.cognome, v.*
  from public.clients c,
  lateral public.registra_vendita(
    p_product_id => 'aaaaaaa1-0000-4000-8000-000000000001',
    p_tipo => case c.cognome when 'Ritorno' then 'nuovo' when 'Pausa corretta' then 'upsell' else 'rinnovo' end::public.sale_type,
    p_data_vendita => public.oggi(),
    p_data_inizio => public.oggi(),
    p_valore_contratto => 1500,
    p_numero_rate => 1,
    p_client_id => c.id
  ) v
  where c.nome = 'Cliente49' and c.cognome in ('Ritorno', 'Pausa corretta', 'Gia attivo')
)
insert into ids select 'vendita ' || lower(cognome), id_vendita from r;

select lives_ok(
  $$ select * from public.segna_rata_incassata(
       (select id from public.payments where sale_id = (select id from ids where chiave = 'vendita ritorno'))) $$,
  'il cliente tornato con una vendita nuova paga la prima rata'
);
select is(
  (select stato::text from public.pm_progetti where id = (select id from ids where chiave = 'ritorno')),
  'attivo',
  'una vendita nuova riapre il progetto come un rinnovo'
);

select public.segna_rata_incassata(x.id)
from public.payments x where x.sale_id = (select id from ids where chiave = 'vendita pausa corretta');
select lives_ok(
  $$ update public.sales set tipo = 'rinnovo' where id = (select id from ids where chiave = 'vendita pausa corretta') $$,
  'l''admin corregge in rinnovo l''upsell di un cliente col progetto in pausa'
);
select is(
  (select stato::text from public.pm_progetti where id = (select id from ids where chiave = 'pausa corretta')),
  'in_pausa',
  'e il progetto resta in pausa'
);

-- every write on the active project while the renewal is cashed
reset role;
create temp table scritture (progetto uuid);
grant all on scritture to authenticated;
create function pg_temp.conta_scritture() returns trigger language plpgsql as $$
begin
  insert into scritture values (new.id);
  return new;
end;
$$;
create trigger conta_scritture after update on public.pm_progetti
  for each row when (old.client_id = 'f4900000-0000-4000-8000-0000000000ca')
  execute function pg_temp.conta_scritture();

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select * from public.segna_rata_incassata(
       (select id from public.payments where sale_id = (select id from ids where chiave = 'vendita gia attivo'))) $$,
  'la prima rata del rinnovo di un cliente col progetto attivo è incassata'
);
reset role;
select is(
  (select count(*)::int from scritture),
  0,
  'il progetto attivo non viene toccato'
);
select is(
  (select stato::text from public.pm_progetti where id = (select id from ids where chiave = 'gia attivo')),
  'attivo',
  'e resta attivo'
);
drop trigger conta_scritture on public.pm_progetti;

-- ---------------------------------------------------------------------------
-- 7. Nobody calls the internal helper
-- ---------------------------------------------------------------------------
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'public.pm_apri_progetto_cliente(uuid, uuid)'::regprocedure),
  'la funzione che apre il progetto gira come l''app, search_path vuoto'
);
select ok(
  not has_function_privilege('authenticated', 'public.pm_apri_progetto_cliente(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.pm_apri_progetto_cliente(uuid, uuid)', 'execute'),
  'nessuna grant: la chiamano solo i trigger'
);
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select throws_ok(
  $$ select public.pm_apri_progetto_cliente('f4900000-0000-4000-8000-0000000000c3', null) $$,
  '42501', null, 'neanche l''admin la chiama'
);

select * from finish();
rollback;
