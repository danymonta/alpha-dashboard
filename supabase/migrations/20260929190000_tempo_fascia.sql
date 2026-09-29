-- Time typed afterwards can carry its range (Dany, 29/09/2026): "quando uno
-- traccia, oltre a tracciare il tempo può avere la possibilità di inserire la
-- fascia a mano anche quando inserisci a mano il tempo (facoltativa)".
--
-- An entry typed by hand is either minutes only (as before) or "Dalle"–"Alle"
-- on its day: then start and end are built here from the day and HH:mm in
-- Europe/Rome (DST included) and the minutes come from them (pm_tempo_coerenza),
-- never typed. The check constraint pm_tempo_coerente already allows
-- start + end + minutes, so the table does not change.
--
-- 1. pm_tempo_coerenza: a range typed by hand ends after it starts, stays on
--    its day, never ends in the future, lasts 24 hours at most (a stopped timer
--    is still clamped, a range typed by hand is refused), and counts in the
--    24 hours per person and day.
-- 2. pm_registra_tempo, pm_modifica_tempo: the saves of the forms and of Alfire
--    (security invoker: RLS on pm_tempo decides, as for the direct writes).

-- ---------------------------------------------------------------------------
-- 1. The trigger
-- ---------------------------------------------------------------------------
create or replace function public.pm_tempo_coerenza()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_a_mano boolean := false;
begin
  if new.inizio is not null and (tg_op = 'INSERT' or new.inizio is distinct from old.inizio) then
    new.data := (new.inizio at time zone 'Europe/Rome')::date;
  end if;

  -- A range typed by hand: a new entry with start and end, or a stopped entry
  -- whose start or end change. Stopping a running timer is not one (the clock
  -- sets the end), nor are seeds and imports without a session.
  if (select auth.uid()) is not null and new.inizio is not null and new.fine is not null then
    if tg_op = 'INSERT' then
      v_a_mano := true;
    elsif not (old.inizio is not null and old.fine is null)
          and (new.inizio is distinct from old.inizio or new.fine is distinct from old.fine) then
      v_a_mano := true;
    end if;
  end if;

  if v_a_mano then
    if new.fine <= new.inizio then
      raise exception 'L’ora di fine deve essere dopo quella di inizio' using errcode = '22023';
    end if;
    if new.fine > clock_timestamp() then
      raise exception 'La fascia non può finire nel futuro' using errcode = '22023';
    end if;
    if (new.fine at time zone 'Europe/Rome')::date <> new.data then
      raise exception 'Inizio e fine devono stare nello stesso giorno' using errcode = '22023';
    end if;
    -- the day DST ends has 25 hours: 00:00–23:59 is more than a day
    if new.fine - new.inizio > interval '24 hours' then
      raise exception 'Al massimo 24 ore in una voce' using errcode = '22023';
    end if;
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

  -- typed afterwards (minutes or a range): a running timer must always be stoppable
  if ((new.inizio is null and new.minuti is not null) or v_a_mano) and (
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
-- 2. The saves
-- ---------------------------------------------------------------------------

-- "Dalle"–"Alle" of a day, as instants: both or neither. At the hour skipped
-- in March a time counts before the change, at the hour repeated in October
-- after it (what Postgres does with a local time).
create or replace function public.pm_fascia_tempo(
  p_data date,
  p_dalle time,
  p_alle time,
  out inizio timestamptz,
  out fine timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if (p_dalle is null) <> (p_alle is null) then
    raise exception 'Indica sia l’inizio sia la fine, o nessuno dei due' using errcode = '22023';
  end if;
  if p_dalle is not null then
    inizio := (p_data + date_trunc('minute', p_dalle::interval)) at time zone 'Europe/Rome';
    fine := (p_data + date_trunc('minute', p_alle::interval)) at time zone 'Europe/Rome';
  end if;
end;
$$;

create or replace function public.pm_registra_tempo(
  p_progetto_id uuid,
  p_data date,
  p_minuti integer default null,
  p_dalle time default null,
  p_alle time default null,
  p_task_id uuid default null,
  p_nota text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_fascia record;
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Sessione scaduta' using errcode = '42501';
  end if;
  if not public.pm_puo_vedere(p_progetto_id) then
    raise exception 'Progetto non trovato o non tuo' using errcode = '42501';
  end if;

  select f.inizio, f.fine into v_fascia from public.pm_fascia_tempo(p_data, p_dalle, p_alle) f;
  if v_fascia.inizio is null and p_minuti is null then
    raise exception 'Scrivi la durata o la fascia oraria' using errcode = '22023';
  end if;

  -- with a range the minutes come from it (pm_tempo_coerenza)
  insert into public.pm_tempo (profile_id, progetto_id, task_id, data, inizio, fine, minuti, nota)
  values (
    (select auth.uid()), p_progetto_id, p_task_id, p_data, v_fascia.inizio, v_fascia.fine,
    case when v_fascia.inizio is null then p_minuti end,
    nullif(trim(p_nota), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- Correcting an entry: the range can be added, changed or removed (removing
-- it keeps the minutes typed). The same range as shown keeps a timer's
-- seconds. A timer across midnight has no one-day range: while its day and
-- minutes stay, its start and end stay too.
-- Returns null when RLS lets the caller read the entry but not change it.
create or replace function public.pm_modifica_tempo(
  p_id uuid,
  p_progetto_id uuid,
  p_data date,
  p_minuti integer default null,
  p_dalle time default null,
  p_alle time default null,
  p_task_id uuid default null,
  p_nota text default null
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_prima record;
  v_fascia record;
  v_inizio timestamptz;
  v_fine timestamptz;
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Sessione scaduta' using errcode = '42501';
  end if;

  select t.data, t.inizio, t.fine, t.minuti into v_prima from public.pm_tempo t where t.id = p_id;
  if not found then
    raise exception 'Voce non trovata' using errcode = '22023';
  end if;
  if v_prima.inizio is not null and v_prima.fine is null then
    raise exception 'Il timer è ancora acceso: fermalo prima di correggerlo' using errcode = '22023';
  end if;

  select f.inizio, f.fine into v_fascia from public.pm_fascia_tempo(p_data, p_dalle, p_alle) f;
  v_inizio := v_fascia.inizio;
  v_fine := v_fascia.fine;

  if v_inizio is not null then
    if v_prima.fine is not null and v_prima.data = p_data
       and date_trunc('minute', v_prima.inizio) = v_inizio
       and date_trunc('minute', v_prima.fine) = v_fine then
      v_inizio := v_prima.inizio;
      v_fine := v_prima.fine;
    end if;
  elsif p_minuti is null then
    raise exception 'Scrivi la durata o la fascia oraria' using errcode = '22023';
  elsif v_prima.fine is not null
        and (v_prima.fine at time zone 'Europe/Rome')::date <> v_prima.data
        and v_prima.data = p_data and v_prima.minuti = p_minuti then
    v_inizio := v_prima.inizio;
    v_fine := v_prima.fine;
  end if;

  update public.pm_tempo t
  set progetto_id = p_progetto_id,
      task_id = p_task_id,
      nota = nullif(trim(p_nota), ''),
      data = p_data,
      inizio = v_inizio,
      fine = v_fine,
      -- with a range the trigger computes them
      minuti = case when v_inizio is null then p_minuti else t.minuti end
  where t.id = p_id
  returning t.id into v_id;

  return v_id;
end;
$$;

revoke all on function public.pm_fascia_tempo(date, time, time) from public, anon;
revoke all on function public.pm_registra_tempo(uuid, date, integer, time, time, uuid, text) from public, anon;
revoke all on function public.pm_modifica_tempo(uuid, uuid, date, integer, time, time, uuid, text) from public, anon;
grant execute on function public.pm_fascia_tempo(date, time, time) to authenticated;
grant execute on function public.pm_registra_tempo(uuid, date, integer, time, time, uuid, text) to authenticated;
grant execute on function public.pm_modifica_tempo(uuid, uuid, date, integer, time, time, uuid, text) to authenticated;
