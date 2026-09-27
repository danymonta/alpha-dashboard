-- Fixes from the independent QA of 28/09/2026, plus templates for every department.
-- 1. Nobody reads another person's running timer (CLAUDE.md §17, §18), not even
--    through the API: who manages a project reads only time already logged.
-- 2. Removed from a project with the timer running: the timer stops. And a person
--    can always stop their own timer, whatever project it is on.
-- 3. The author of a note and the author/project of a task cannot be rewritten.
-- 4. At most 24 hours of time entered afterwards per person and day.
-- 5. A project created from a template ends where the template ends.
-- 6. A starting template for every department.

-- ---------------------------------------------------------------------------
-- 1. Running timers are private
-- ---------------------------------------------------------------------------
drop policy pm_tempo_select on public.pm_tempo;

create policy pm_tempo_select on public.pm_tempo for select to authenticated
  using (
    profile_id = (select auth.uid())
    or (minuti is not null and public.pm_puo_gestire(progetto_id))
  );

-- ---------------------------------------------------------------------------
-- 2. Stopping is always possible; leaving a project stops its timer
-- ---------------------------------------------------------------------------
-- security definer: the timer may be on a project the caller no longer sees.
-- It only ever touches the caller's own running timer.
create or replace function public.pm_ferma_timer(p_nota text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
  v_id uuid;
begin
  if v_utente is null then
    raise exception 'Sessione scaduta' using errcode = '42501';
  end if;

  update public.pm_tempo
  set fine = greatest(clock_timestamp(), inizio + interval '1 second'),
      nota = coalesce(nullif(trim(p_nota), ''), nota)
  where profile_id = v_utente and inizio is not null and fine is null
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.pm_avvia_timer(
  p_progetto_id uuid,
  p_task_id uuid default null,
  p_nota text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.pm_puo_vedere(p_progetto_id) then
    raise exception 'Progetto non trovato o non tuo' using errcode = '42501';
  end if;

  perform public.pm_ferma_timer();

  insert into public.pm_tempo (profile_id, progetto_id, task_id, data, inizio, nota)
  values ((select auth.uid()), p_progetto_id, p_task_id, public.oggi(), clock_timestamp(), nullif(trim(p_nota), ''))
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.pm_membro_tolto()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.pm_progetti p where p.id = old.progetto_id) then
    return null;
  end if;

  update public.pm_task t
  set assegnatario_id = null
  where t.progetto_id = old.progetto_id and t.assegnatario_id = old.profile_id;

  update public.pm_progetti p
  set responsabile_id = null
  where p.id = old.progetto_id and p.responsabile_id = old.profile_id;

  -- the time worked so far is kept, the clock stops
  update public.pm_tempo t
  set fine = greatest(clock_timestamp(), t.inizio + interval '1 second')
  where t.progetto_id = old.progetto_id and t.profile_id = old.profile_id
    and t.inizio is not null and t.fine is null;

  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Authors stay the authors
-- ---------------------------------------------------------------------------
create or replace function public.pm_note_autore()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and new.autore_id is distinct from old.autore_id
     and public.pm_livello_corrente() is distinct from 'admin' then
    raise exception 'L''autore di una nota non si cambia' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger pm_note_autore
  before update of autore_id on public.pm_note
  for each row execute function public.pm_note_autore();

-- A person creates tasks as themselves; author and project never change afterwards.
-- Without a session (seeds, imports with the secret key) nothing is enforced.
create or replace function public.pm_task_autore()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
  elsif new.created_by is distinct from old.created_by or new.progetto_id is distinct from old.progetto_id then
    raise exception 'Autore e progetto di un task non si cambiano' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger pm_task_autore
  before insert or update of created_by, progetto_id on public.pm_task
  for each row execute function public.pm_task_autore();

revoke all on function public.pm_note_autore() from public, anon, authenticated;
revoke all on function public.pm_task_autore() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. A day has 24 hours: time entered afterwards cannot exceed it
-- ---------------------------------------------------------------------------
create or replace function public.pm_tempo_coerenza()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.inizio is not null and (tg_op = 'INSERT' or new.inizio is distinct from old.inizio) then
    new.data := (new.inizio at time zone 'Europe/Rome')::date;
  end if;

  if new.inizio is not null and new.fine is not null then
    new.minuti := greatest(1, least(1440, round(extract(epoch from (new.fine - new.inizio)) / 60)::integer));
  end if;

  if new.task_id is not null and not exists (
    select 1 from public.pm_task t where t.id = new.task_id and t.progetto_id = new.progetto_id
  ) then
    raise exception 'Il task non appartiene a questo progetto' using errcode = '22023';
  end if;

  if new.data > public.oggi() then
    raise exception 'Il tempo si registra per oggi o per un giorno passato' using errcode = '22023';
  end if;

  -- entered afterwards only: a running timer must always be stoppable
  if new.inizio is null and new.minuti is not null and (
    select coalesce(sum(t.minuti), 0) from public.pm_tempo t
    where t.profile_id = new.profile_id and t.data = new.data and t.id <> new.id and t.minuti is not null
  ) + new.minuti > 1440 then
    raise exception 'In questo giorno risulterebbero più di 24 ore: controlla le voci già registrate'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. pm_crea_progetto: without an end date, a template sets it
-- ---------------------------------------------------------------------------
create or replace function public.pm_crea_progetto(
  p_reparto_id uuid,
  p_nome text,
  p_descrizione text default null,
  p_client_id uuid default null,
  p_modello_id uuid default null,
  p_data_inizio date default null,
  p_data_fine date default null,
  p_membri uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
  v_livello public.pm_livello := public.pm_livello_corrente();
  v_inizio date := coalesce(p_data_inizio, public.oggi());
  v_fine date := p_data_fine;
  v_progetto uuid;
  v_lista record;
  v_id_lista uuid;
begin
  if v_livello is null or v_livello = 'employee' then
    raise exception 'I progetti li crea un admin o un manager' using errcode = '42501';
  end if;
  if nullif(trim(p_nome), '') is null then
    raise exception 'Scrivi il nome del progetto' using errcode = '22023';
  end if;
  if not exists (select 1 from public.pm_reparti r where r.id = p_reparto_id and r.attivo) then
    raise exception 'Reparto non trovato' using errcode = '22023';
  end if;
  if p_client_id is not null and public.current_role() is distinct from 'admin' then
    raise exception 'Solo l''admin collega un cliente al progetto' using errcode = '42501';
  end if;
  if p_modello_id is not null and not exists (
    select 1 from public.pm_modelli m where m.id = p_modello_id and m.attivo
  ) then
    raise exception 'Modello non trovato' using errcode = '22023';
  end if;

  if v_fine is null and p_modello_id is not null then
    select v_inizio + max(v.inizio_giorni + v.durata_giorni) - 1 into v_fine
    from public.pm_modelli_voci v
    where v.modello_id = p_modello_id;
  end if;

  insert into public.pm_progetti (
    reparto_id, nome, descrizione, client_id, data_inizio, data_fine, responsabile_id, created_by
  )
  values (
    p_reparto_id, trim(p_nome), nullif(trim(p_descrizione), ''), p_client_id,
    v_inizio, v_fine, v_utente, v_utente
  )
  returning id into v_progetto;

  insert into public.pm_membri (progetto_id, profile_id, aggiunto_da)
  select v_progetto, p.id, v_utente
  from public.profiles p
  where p.attivo and (p.id = v_utente or p.id = any (coalesce(p_membri, '{}')))
  on conflict (progetto_id, profile_id) do nothing;

  if p_modello_id is not null then
    for v_lista in
      select v.tasklist,
             min(v.ordine) as ordine,
             min(v.inizio_giorni) as da,
             max(v.inizio_giorni + v.durata_giorni) - 1 as a
      from public.pm_modelli_voci v
      where v.modello_id = p_modello_id
      group by v.tasklist
      order by min(v.ordine)
    loop
      insert into public.pm_tasklist (progetto_id, nome, ordine, data_inizio, data_fine, created_by)
      values (v_progetto, v_lista.tasklist, v_lista.ordine, v_inizio + v_lista.da, v_inizio + v_lista.a, v_utente)
      returning id into v_id_lista;

      insert into public.pm_task (
        progetto_id, tasklist_id, titolo, descrizione, ordine, data_inizio, scadenza, created_by
      )
      select v_progetto, v_id_lista, v.titolo, v.descrizione, v.ordine,
             v_inizio + v.inizio_giorni, v_inizio + v.inizio_giorni + v.durata_giorni - 1, v_utente
      from public.pm_modelli_voci v
      where v.modello_id = p_modello_id and v.tasklist = v_lista.tasklist
      order by v.ordine;
    end loop;
  end if;

  return v_progetto;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Starting templates for the other departments (editable in Impostazioni)
-- ---------------------------------------------------------------------------
with nuovi (reparto, nome, descrizione) as (
  values
    ('Contenuti e Video', 'Contenuto video', 'Dall’idea alla pubblicazione di un reel o di un video.'),
    ('Vendite e Marketing', 'Campagna', 'Una campagna o un lancio: preparazione, messa online, analisi.'),
    ('Amministrazione', 'Chiusura del mese', 'I controlli di inizio mese e i dati per la commercialista.')
),
modelli as (
  insert into public.pm_modelli (reparto_id, nome, descrizione)
  select r.id, n.nome, n.descrizione
  from nuovi n
  join public.pm_reparti r on r.nome = n.reparto
  where not exists (select 1 from public.pm_modelli m where m.reparto_id = r.id and m.nome = n.nome)
  returning id, nome
)
insert into public.pm_modelli_voci (modello_id, tasklist, titolo, ordine, inizio_giorni, durata_giorni)
select m.id, v.tasklist, v.titolo, v.ordine, v.inizio, v.durata
from modelli m
join (values
  ('Contenuto video', 'Preparazione', 'Idea, gancio e script', 1, 0, 2),
  ('Contenuto video', 'Preparazione', 'Riprese', 2, 2, 2),
  ('Contenuto video', 'Montaggio', 'Montaggio', 3, 4, 3),
  ('Contenuto video', 'Montaggio', 'Revisione di Dany', 4, 7, 1),
  ('Contenuto video', 'Montaggio', 'Correzioni, copertina e testi', 5, 8, 1),
  ('Contenuto video', 'Pubblicazione', 'Pubblicazione', 6, 9, 1),
  ('Contenuto video', 'Pubblicazione', 'Risultati dopo 7 giorni', 7, 16, 1),
  ('Campagna', 'Preparazione', 'Obiettivo, pubblico e budget', 1, 0, 2),
  ('Campagna', 'Preparazione', 'Messaggio e offerta', 2, 2, 3),
  ('Campagna', 'Preparazione', 'Creatività e testi', 3, 5, 5),
  ('Campagna', 'Lancio', 'Messa online', 4, 10, 1),
  ('Campagna', 'Lancio', 'Monitoraggio dei risultati', 5, 11, 14),
  ('Campagna', 'Analisi', 'Report e decisioni', 6, 25, 2),
  ('Chiusura del mese', 'Controlli', 'Sollecitare le rate in ritardo', 1, 0, 3),
  ('Chiusura del mese', 'Controlli', 'Pagare le provvigioni maturate', 2, 0, 5),
  ('Chiusura del mese', 'Controlli', 'Registrare i costi del mese e i ricorrenti', 3, 0, 3),
  ('Chiusura del mese', 'Commercialista', 'Esportare i CSV per la commercialista', 4, 3, 2),
  ('Chiusura del mese', 'Commercialista', 'Controllare il margine operativo', 5, 5, 2)
) as v(modello, tasklist, titolo, ordine, inizio, durata) on v.modello = m.nome;
