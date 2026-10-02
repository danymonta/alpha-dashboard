-- At the renewal the client's tasks reopen by themselves (Dany, 03/10/2026:
-- «fai che si riaprano da soli se rinnova»): at the first cashed instalment of
-- a path that follows another one, when the client already had its project,
-- the completed template tasks (no author, made with the project, no past
-- deadline) completed before that path (before it started, or before it was
-- registered when that came later) go back to "da fare", whether the project
-- was completato, attivo or in pausa (it stays paused).
-- A person's task, a sub-task, a task with a past deadline and a task not
-- completed stay as they are; assignees, time and notes too. A second
-- instalment never reopens what the coach completed again, nor does the first
-- one cashed again; the first path never reopens (the cash undone and done
-- again, an expired sale extended); an upsell never reopens, the instalment
-- that creates the project does nothing more, the closer cashing his sale
-- reopens them too, a sale corrected into a renewal reopens them, and nothing
-- ever blocks the cash, nor the project reopening.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(54);

-- Seed: admin 1111, closer 3333, coach 4444 (PM manager), product 3 months.
create temp table ids (chiave text primary key, id uuid);
grant all on ids to authenticated;

-- every update of a task or a project while the instalments are cashed
create temp table scritture (tabella text, progetto uuid, titolo text);
grant all on scritture to authenticated;
create function pg_temp.conta_task() returns trigger language plpgsql as $$
begin
  insert into scritture values ('task', new.progetto_id, new.titolo);
  return new;
end;
$$;
create function pg_temp.conta_progetti() returns trigger language plpgsql as $$
begin
  insert into scritture values ('progetto', new.id, new.nome);
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Fixtures: seven clients whose first path (paid) is over, each with the
-- project the app made for it and Marco Coach on it; one client still to buy
-- ---------------------------------------------------------------------------
insert into public.clients (id, nome, cognome, created_by) values
  ('f5000000-0000-4000-8000-0000000000c1', 'Cliente50', 'Completato', '11111111-1111-4111-8111-111111111111'),
  ('f5000000-0000-4000-8000-0000000000c2', 'Cliente50', 'Attivo', '11111111-1111-4111-8111-111111111111'),
  ('f5000000-0000-4000-8000-0000000000c3', 'Cliente50', 'In pausa', '11111111-1111-4111-8111-111111111111'),
  ('f5000000-0000-4000-8000-0000000000c4', 'Cliente50', 'Upsell', '11111111-1111-4111-8111-111111111111'),
  ('f5000000-0000-4000-8000-0000000000c5', 'Cliente50', 'Del closer', '11111111-1111-4111-8111-111111111111'),
  ('f5000000-0000-4000-8000-0000000000c6', 'Cliente50', 'Corretto', '11111111-1111-4111-8111-111111111111'),
  ('f5000000-0000-4000-8000-0000000000c7', 'Cliente50', 'Bloccato', '11111111-1111-4111-8111-111111111111'),
  ('f5000000-0000-4000-8000-0000000000c9', 'Cliente50', 'Nuovo', '11111111-1111-4111-8111-111111111111');

insert into public.sales (client_id, product_id, tipo, data_vendita, data_inizio, valore_contratto, numero_rate, created_by)
select c.id, 'aaaaaaa1-0000-4000-8000-000000000001', 'nuovo', public.oggi() - 120, public.oggi() - 120, 1500, 1,
       '11111111-1111-4111-8111-111111111111'
from public.clients c where c.nome = 'Cliente50' and c.cognome <> 'Nuovo';
update public.payments x
set stato = 'incassata', incassato_il = public.oggi() - 120, importo_incassato = x.importo_previsto
from public.sales s
join public.clients c on c.id = s.client_id
where x.sale_id = s.id and c.nome = 'Cliente50';

select pm_crea_progetto_cliente(c.id) from public.clients c where c.nome = 'Cliente50' and c.cognome <> 'Nuovo';
insert into ids
select lower(c.cognome), p.id
from public.pm_progetti p join public.clients c on c.id = p.client_id
where c.nome = 'Cliente50';

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select public.pm_scegli_coach(i.id, '44444444-4444-4444-8444-444444444444') from ids i;

-- ---------------------------------------------------------------------------
-- What the coach did during the first path
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';

-- every client: the 8 tasks completed, but the active one (below)
update public.pm_task set stato = 'completato'
where progetto_id in (select id from ids where chiave <> 'attivo') and parent_id is null;

-- the completed one: a task of his own, a sub-task, time and a note
insert into public.pm_task (progetto_id, titolo, stato)
values ((select id from ids where chiave = 'completato'), 'Piano extra per le vacanze', 'completato');
insert into public.pm_task (progetto_id, parent_id, titolo, stato)
select t.progetto_id, t.id, 'Check di metà percorso', 'completato'
from public.pm_task t
where t.progetto_id = (select id from ids where chiave = 'completato') and t.titolo = 'Call di check';
insert into public.pm_task (progetto_id, titolo, stato)
values ((select id from ids where chiave = 'completato'), 'Compito di chi non c''è più', 'completato');
select public.pm_registra_tempo(t.progetto_id, public.oggi() - 30, 45, null, null, t.id, 'Lavoro del primo percorso')
from public.pm_task t
where t.progetto_id = (select id from ids where chiave = 'completato')
  and t.titolo in ('Call di check', 'Revisione video', 'Piano extra per le vacanze');
insert into public.pm_note (progetto_id, testo)
values ((select id from ids where chiave = 'completato'), 'Obiettivo raggiunto: -6 kg');

-- the active one: two completed, one in progress, one to review, one with a deadline
update public.pm_task set stato = 'completato'
where progetto_id = (select id from ids where chiave = 'attivo')
  and titolo in ('Call di onboarding', 'Analisi e strategia iniziale', 'Altre attività');
update public.pm_task set stato = 'in_corso'
where progetto_id = (select id from ids where chiave = 'attivo') and titolo = 'Revisione video';
update public.pm_task set stato = 'in_revisione'
where progetto_id = (select id from ids where chiave = 'attivo') and titolo = 'Assistenza chat';

-- the project states at the end of the first path
update public.pm_progetti set stato = 'completato'
where id in (select id from ids where chiave in ('completato', 'upsell', 'del closer', 'corretto', 'bloccato'));
update public.pm_progetti set stato = 'in_pausa' where id = (select id from ids where chiave = 'in pausa');

reset role;
set local request.jwt.claims to '';
-- the task of a person deleted since then: no author left, made after the project
update public.pm_task
set created_by = null, created_at = created_at + interval '20 days'
where progetto_id = (select id from ids where chiave = 'completato') and titolo = 'Compito di chi non c''è più';
-- a template task with a past deadline (a dated item, or a date the coach gave it)
update public.pm_task
set data_inizio = public.oggi() - 120, scadenza = public.oggi() - 114
where progetto_id = (select id from ids where chiave = 'attivo') and titolo = 'Altre attività';
-- and one the coach dated in the future
update public.pm_task
set scadenza = public.oggi() + 20
where progetto_id = (select id from ids where chiave = 'completato') and titolo = 'Revisione video';
-- all of it completed during the first path, long before the renewal
-- (the date stays: pm_task_coerenza sets it only when the state changes)
update public.pm_task
set completato_il = now() - interval '40 days'
where progetto_id in (select id from ids) and stato = 'completato';

-- what must not change
create temp table prima as
select p.id as progetto, p.coach_id, p.nome,
       (select array_agg(m.profile_id order by m.profile_id) from public.pm_membri m where m.progetto_id = p.id) as membri,
       (select array_agg(a.task_id::text || a.profile_id::text order by a.task_id, a.profile_id)
        from public.pm_task_assegnatari a join public.pm_task t on t.id = a.task_id where t.progetto_id = p.id) as assegnatari,
       (select array_agg(row(x.task_id, x.profile_id, x.data, x.minuti, x.nota)::text order by x.id)
        from public.pm_tempo x where x.progetto_id = p.id) as tempo,
       (select array_agg(row(n.autore_id, n.data, n.testo)::text order by n.id)
        from public.pm_note n where n.progetto_id = p.id) as note,
       (select array_agg(t.titolo || ' · ' || coalesce(t.created_by::text, 'app') order by t.ordine, t.id)
        from public.pm_task t where t.progetto_id = p.id) as task
from public.pm_progetti p where p.id in (select id from ids);
grant all on prima to authenticated;

create trigger conta_task after update on public.pm_task
  for each row execute function pg_temp.conta_task();
create trigger conta_progetti after update on public.pm_progetti
  for each row execute function pg_temp.conta_progetti();

-- ---------------------------------------------------------------------------
-- 1. Completato: the client renews, the first instalment reopens the project
--    and its 8 tasks; the coach's own work stays as it is
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
with r as (
  select c.cognome, v.*
  from public.clients c,
  lateral public.registra_vendita(
    p_product_id => 'aaaaaaa1-0000-4000-8000-000000000001',
    p_tipo => case when c.cognome in ('Upsell', 'Corretto') then 'upsell'
                   when c.cognome = 'Nuovo' then 'nuovo'
                   else 'rinnovo' end::public.sale_type,
    p_data_vendita => public.oggi(),
    -- the renewal of the active one signed in advance; the new client starts in a week
    p_data_inizio => case c.cognome when 'Attivo' then public.oggi() + 10
                                    when 'Nuovo' then public.oggi() + 7
                                    else public.oggi() end,
    p_valore_contratto => 1500,
    p_numero_rate => case when c.cognome = 'Completato' then 2 else 1 end,
    p_client_id => c.id
  ) v
  where c.nome = 'Cliente50' and c.cognome <> 'Del closer'
)
insert into ids select 'vendita ' || lower(cognome), id_vendita from r;

select is(
  (select count(*)::int from scritture where tabella = 'task'),
  0,
  'firmare il rinnovo, senza incasso, non tocca i task'
);

select lives_ok(
  $$ select * from public.segna_rata_incassata(
       (select id from public.payments where sale_id = (select id from ids where chiave = 'vendita completato') and numero_rata = 1)) $$,
  'la prima rata del rinnovo è incassata'
);
select is(
  (select stato::text from public.pm_progetti where id = (select id from ids where chiave = 'completato')),
  'attivo',
  'il progetto completato torna attivo'
);
select is(
  (select array_agg(t.stato::text || ' · ' || coalesce(t.completato_il::text, '-') order by t.ordine)
   from public.pm_task t
   where t.progetto_id = (select id from ids where chiave = 'completato') and t.created_by is null
     and t.titolo <> 'Compito di chi non c''è più'),
  array_fill('da_fare · -'::text, array[8]),
  'gli 8 task del modello si riaprono da soli, senza data di completamento'
);
select is(
  (select stato::text || ' · ' || scadenza::text from public.pm_task
   where progetto_id = (select id from ids where chiave = 'completato') and titolo = 'Revisione video'),
  'da_fare · ' || (public.oggi() + 20)::text,
  'anche quello con una scadenza futura, che resta la sua: non finisce tra quelli in ritardo'
);
select is(
  (select stato::text from public.pm_task
   where progetto_id = (select id from ids where chiave = 'completato') and titolo = 'Piano extra per le vacanze'),
  'completato',
  'il task che il coach ha aggiunto lui resta completato'
);
select is(
  (select stato::text from public.pm_task
   where progetto_id = (select id from ids where chiave = 'completato') and titolo = 'Check di metà percorso'),
  'completato',
  'il sotto-task resta completato'
);
select is(
  (select stato::text from public.pm_task
   where progetto_id = (select id from ids where chiave = 'completato') and titolo = 'Compito di chi non c''è più'),
  'completato',
  'il task di una persona eliminata (senza autore, nato dopo il progetto) resta completato'
);
select is(
  (select array_agg(t.titolo || ' · ' || coalesce(t.created_by::text, 'app') order by t.ordine, t.id)
   from public.pm_task t where t.progetto_id = (select id from ids where chiave = 'completato')),
  (select task from prima where progetto = (select id from ids where chiave = 'completato')),
  'gli stessi task, con gli stessi autori: l''app non ci lascia il nome di chi incassa'
);

reset role;
select is(
  (select array_agg(a.task_id::text || a.profile_id::text order by a.task_id, a.profile_id)
   from public.pm_task_assegnatari a join public.pm_task t on t.id = a.task_id
   where t.progetto_id = (select id from ids where chiave = 'completato')),
  (select assegnatari from prima where progetto = (select id from ids where chiave = 'completato')),
  'restano al coach'
);
select is(
  (select array_agg(row(x.task_id, x.profile_id, x.data, x.minuti, x.nota)::text order by x.id)
   from public.pm_tempo x where x.progetto_id = (select id from ids where chiave = 'completato')),
  (select tempo from prima where progetto = (select id from ids where chiave = 'completato')),
  'il tempo registrato resta dov''era'
);
select is(
  (select count(*)::int from public.pm_tempo where progetto_id = (select id from ids where chiave = 'completato')),
  3,
  'tutte e tre le voci'
);
select is(
  (select array_agg(row(n.autore_id, n.data, n.testo)::text order by n.id)
   from public.pm_note n where n.progetto_id = (select id from ids where chiave = 'completato')),
  (select note from prima where progetto = (select id from ids where chiave = 'completato')),
  'le note restano'
);
select is(
  (select row(p.coach_id, p.nome,
              (select array_agg(m.profile_id order by m.profile_id) from public.pm_membri m where m.progetto_id = p.id))::text
   from public.pm_progetti p where p.id = (select id from ids where chiave = 'completato')),
  (select row(coach_id, nome, membri)::text from prima where progetto = (select id from ids where chiave = 'completato')),
  'coach, nome e membri restano'
);

-- the coach finds them among his tasks again
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select is(
  (select count(*)::int from public.v_pm_task t
   where t.progetto_id = (select id from ids where chiave = 'completato')
     and t.stato <> 'completato'
     and '44444444-4444-4444-8444-444444444444'::uuid = any (t.assegnatari)),
  8,
  'il coach ritrova gli 8 task da fare'
);

-- he completes one again during the renewal: the second instalment leaves it
update public.pm_task set stato = 'completato'
where progetto_id = (select id from ids where chiave = 'completato') and titolo = 'Call di check';
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select * from public.segna_rata_incassata(
       (select id from public.payments where sale_id = (select id from ids where chiave = 'vendita completato') and numero_rata = 2)) $$,
  'anche la seconda rata del rinnovo è incassata'
);
select is(
  (select stato::text from public.pm_task
   where progetto_id = (select id from ids where chiave = 'completato') and titolo = 'Call di check'),
  'completato',
  'la seconda rata non riapre un task che il coach ha completato di nuovo'
);

-- the cash of the renewal's first instalment undone and done again: it counts
-- as the first instalment again, and still leaves what the coach completed in
-- the renewal
select lives_ok(
  $$ update public.payments set stato = 'prevista', incassato_il = null, importo_incassato = null, metodo = null
     where sale_id = (select id from ids where chiave = 'vendita completato') and numero_rata = 1 $$,
  'l''admin annulla l''incasso della prima rata del rinnovo'
);
select lives_ok(
  $$ select * from public.segna_rata_incassata(
       (select id from public.payments where sale_id = (select id from ids where chiave = 'vendita completato') and numero_rata = 1)) $$,
  'e la segna di nuovo incassata'
);
select is(
  (select stato::text from public.pm_task
   where progetto_id = (select id from ids where chiave = 'completato') and titolo = 'Call di check'),
  'completato',
  'la prima rata incassata di nuovo non riapre un task completato nel rinnovo'
);

-- ---------------------------------------------------------------------------
-- 2. Attivo: the renewal, signed in advance (it starts in 10 days), paid while
--    the project is still open; in between the coach completed one more task
--    of the first path: it reopens too
-- ---------------------------------------------------------------------------
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
update public.pm_task set stato = 'completato'
where progetto_id = (select id from ids where chiave = 'attivo')
  and titolo = 'Programmazione allenamento (creazione e aggiornamenti)';
reset role;
delete from scritture;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select * from public.segna_rata_incassata(
       (select id from public.payments where sale_id = (select id from ids where chiave = 'vendita attivo'))) $$,
  'la prima rata del rinnovo di un cliente col progetto ancora attivo è incassata'
);
reset role;
select is(
  (select array_agg(t.titolo || ' · ' || t.stato order by t.ordine)
   from public.pm_task t where t.progetto_id = (select id from ids where chiave = 'attivo')),
  array[
    'Call di onboarding · da_fare',
    'Analisi e strategia iniziale · da_fare',
    'Programmazione allenamento (creazione e aggiornamenti) · da_fare',
    'Programmazione alimentare (creazione e aggiornamenti) · da_fare',
    'Revisione video · in_corso',
    'Call di check · da_fare',
    'Assistenza chat · in_revisione',
    'Altre attività · completato'
  ],
  'i completati senza scadenza si riaprono; in corso e in revisione restano; quello con la scadenza passata resta completato'
);
select is(
  (select array_agg(s.titolo order by s.titolo) from scritture s
   where s.tabella = 'task' and s.progetto = (select id from ids where chiave = 'attivo')),
  array['Analisi e strategia iniziale', 'Call di onboarding', 'Programmazione allenamento (creazione e aggiornamenti)'],
  'anche quello completato dopo la firma, prima che il rinnovo inizi; gli altri non vengono nemmeno toccati'
);
select is(
  (select count(*)::int from scritture s
   where s.tabella = 'progetto' and s.progetto = (select id from ids where chiave = 'attivo')),
  0,
  'e il progetto attivo nemmeno'
);

-- ---------------------------------------------------------------------------
-- 3. In pausa: the project stays paused, its tasks reopen
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select * from public.segna_rata_incassata(
       (select id from public.payments where sale_id = (select id from ids where chiave = 'vendita in pausa'))) $$,
  'la prima rata del rinnovo di un cliente col progetto in pausa è incassata'
);
reset role;
select is(
  (select stato::text from public.pm_progetti where id = (select id from ids where chiave = 'in pausa')),
  'in_pausa',
  'il progetto resta in pausa'
);
select is(
  (select count(*)::int from public.pm_task
   where progetto_id = (select id from ids where chiave = 'in pausa') and stato = 'da_fare'),
  8,
  'e i suoi 8 task si riaprono, pronti per quando riparte'
);

-- ---------------------------------------------------------------------------
-- 4. An upsell never reopens them; corrected into a renewal, it does
-- ---------------------------------------------------------------------------
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select public.segna_rata_incassata(x.id)
     from public.payments x
     where x.sale_id in (select id from ids where chiave in ('vendita upsell', 'vendita corretto')) $$,
  'le prime rate degli upsell sono incassate'
);
reset role;
select is(
  (select count(*)::int from public.pm_task
   where progetto_id in (select id from ids where chiave in ('upsell', 'corretto')) and stato = 'completato'),
  16,
  'un upsell non riapre nessun task'
);
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ update public.sales set tipo = 'rinnovo' where id = (select id from ids where chiave = 'vendita corretto') $$,
  'l''admin corregge l''upsell in rinnovo'
);
reset role;
select is(
  (select count(*)::int from public.pm_task
   where progetto_id = (select id from ids where chiave = 'corretto') and stato = 'da_fare'),
  8,
  'e i task si riaprono, come alla prima rata'
);
select is(
  (select stato::text from public.pm_progetti where id = (select id from ids where chiave = 'corretto')),
  'attivo',
  'insieme al progetto'
);
select is(
  (select count(*)::int from public.pm_task
   where progetto_id = (select id from ids where chiave = 'upsell') and stato = 'completato'),
  8,
  'l''upsell rimasto upsell li lascia completati'
);

-- the first path, over, extended by the admin: the project reopens (as since
-- 1.17.0), its tasks stay: no renewal, the same path
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ update public.sales set data_fine = public.oggi() + 13
     where client_id = 'f5000000-0000-4000-8000-0000000000c4' and tipo = 'nuovo' $$,
  'l''admin proroga il primo percorso, già finito'
);
reset role;
select is(
  (select stato::text from public.pm_progetti where id = (select id from ids where chiave = 'upsell')),
  'attivo',
  'il progetto torna attivo'
);
select is(
  (select count(*)::int from public.pm_task
   where progetto_id = (select id from ids where chiave = 'upsell') and stato = 'completato'),
  8,
  'e i task del primo percorso prorogato restano completati'
);

-- ---------------------------------------------------------------------------
-- 5. The closer cashes the renewal of his sale: the tasks reopen, though he
--    is not a member and never sees them, and no trace of him is left
-- ---------------------------------------------------------------------------
insert into public.sales (id, client_id, product_id, tipo, closer_id, data_vendita, data_inizio, valore_contratto, numero_rate, created_by)
values ('f5000000-0000-4000-8000-0000000000a5', 'f5000000-0000-4000-8000-0000000000c5',
        'aaaaaaa1-0000-4000-8000-000000000001', 'rinnovo', '33333333-3333-4333-8333-333333333333',
        public.oggi(), public.oggi(), 1500, 1, '33333333-3333-4333-8333-333333333333');

set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';
select is(
  (select count(*)::int from public.pm_task where progetto_id = (select id from ids where chiave = 'del closer')),
  0,
  'il closer non vede i task del cliente'
);
select lives_ok(
  $$ select * from public.segna_rata_incassata(
       (select id from public.payments where sale_id = 'f5000000-0000-4000-8000-0000000000a5')) $$,
  'il closer incassa la prima rata del rinnovo'
);
select is(
  (select auth.uid()),
  '33333333-3333-4333-8333-333333333333'::uuid,
  'e la sua sessione resta la sua'
);
reset role;
select is(
  (select count(*)::int from public.pm_task
   where progetto_id = (select id from ids where chiave = 'del closer') and stato = 'da_fare' and created_by is null),
  8,
  'anche quando incassa il closer gli 8 task si riaprono, e restano dell''app'
);

-- ---------------------------------------------------------------------------
-- 6. The instalment that creates the project does nothing more: its tasks
--    are new
-- ---------------------------------------------------------------------------
delete from scritture;
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select * from public.segna_rata_incassata(
       (select id from public.payments where sale_id = (select id from ids where chiave = 'vendita nuovo'))) $$,
  'la prima rata del primo percorso è incassata'
);
reset role;
select is(
  (select count(*)::int from public.pm_task t
   join public.pm_progetti p on p.id = t.progetto_id
   where p.client_id = 'f5000000-0000-4000-8000-0000000000c9' and t.stato = 'da_fare'),
  8,
  'il progetto nasce con i suoi 8 task da fare'
);
select is(
  (select count(*)::int from scritture),
  0,
  'e nessun task o progetto viene riscritto'
);

-- the first path goes on: the coach does the onboarding before the start; the
-- cash of the first instalment undone and done again is not a renewal
insert into ids
select 'nuovo', p.id from public.pm_progetti p where p.client_id = 'f5000000-0000-4000-8000-0000000000c9';
set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select public.pm_scegli_coach((select id from ids where chiave = 'nuovo'), '44444444-4444-4444-8444-444444444444');
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
update public.pm_task set stato = 'completato'
where progetto_id = (select id from ids where chiave = 'nuovo')
  and titolo in ('Call di onboarding', 'Analisi e strategia iniziale');
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ update public.payments set stato = 'prevista', incassato_il = null, importo_incassato = null, metodo = null
     where sale_id = (select id from ids where chiave = 'vendita nuovo') $$,
  'l''admin annulla l''incasso della prima rata del primo percorso'
);
select lives_ok(
  $$ select * from public.segna_rata_incassata(
       (select id from public.payments where sale_id = (select id from ids where chiave = 'vendita nuovo'))) $$,
  'e la segna di nuovo incassata'
);
reset role;
select is(
  (select array_agg(t.titolo order by t.ordine) from public.pm_task t
   where t.progetto_id = (select id from ids where chiave = 'nuovo') and t.stato = 'completato'),
  array['Call di onboarding', 'Analisi e strategia iniziale'],
  'nel primo percorso i task completati dal coach restano completati'
);

-- ---------------------------------------------------------------------------
-- 7. Nothing ever blocks the cash: tasks that cannot reopen are a warning
-- ---------------------------------------------------------------------------
create function pg_temp.blocca_task() returns trigger language plpgsql as $$
begin
  raise exception 'task bloccati dal test';
end;
$$;
create trigger blocca_task before update on public.pm_task
  for each row when (old.progetto_id is not null)
  execute function pg_temp.blocca_task();

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';
select lives_ok(
  $$ select * from public.segna_rata_incassata(
       (select id from public.payments where sale_id = (select id from ids where chiave = 'vendita bloccato'))) $$,
  'task che non si riescono a riaprire non bloccano l''incasso'
);
reset role;
drop trigger blocca_task on public.pm_task;
select is(
  (select x.stato::text from public.payments x where x.sale_id = (select id from ids where chiave = 'vendita bloccato')),
  'incassata',
  'la rata resta incassata'
);
select is(
  (select count(*)::int from public.pm_task
   where progetto_id = (select id from ids where chiave = 'bloccato') and stato = 'completato'),
  8,
  'e i task restano com''erano'
);
select is(
  (select stato::text from public.pm_progetti where id = (select id from ids where chiave = 'bloccato')),
  'attivo',
  'ma il progetto torna attivo lo stesso'
);

-- ---------------------------------------------------------------------------
-- 8. The helper stays internal, with one signature
-- ---------------------------------------------------------------------------
select ok(
  (select p.prosecdef and p.proconfig @> array['search_path=""']
   from pg_proc p where p.oid = 'public.pm_apri_progetto_cliente(uuid, uuid)'::regprocedure),
  'la funzione che riapre gira come l''app, search_path vuoto'
);
select ok(
  not has_function_privilege('authenticated', 'public.pm_apri_progetto_cliente(uuid, uuid)', 'execute')
  and not has_function_privilege('anon', 'public.pm_apri_progetto_cliente(uuid, uuid)', 'execute'),
  'nessuna grant: la chiamano solo i trigger'
);
select is(
  (select count(*)::int from pg_proc where proname = 'pm_apri_progetto_cliente' and pronamespace = 'public'::regnamespace),
  1,
  'una sola firma: quella col solo cliente non c''è più'
);
set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}';
select throws_ok(
  $$ select public.pm_apri_progetto_cliente('f5000000-0000-4000-8000-0000000000c1',
                                            (select id from ids where chiave = 'vendita completato')) $$,
  '42501', null, 'il coach non riapre i task chiamandola'
);

select * from finish();
rollback;
