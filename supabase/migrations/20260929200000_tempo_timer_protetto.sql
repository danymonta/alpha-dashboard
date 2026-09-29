-- Review of the time range (29/09/2026), two fixes.
--
-- 1. pm_tempo_coerenza: with a session (the app, Alfire, a direct API call) the
--    clock decides a timer. It starts now, its start never moves, it stops now,
--    and a stopped entry never runs again. Before, a PATCH on one's own running
--    timer could write any start and end (in the future, over 24 hours a day)
--    and skip every check of a range typed by hand. The day always follows the
--    start: a PATCH on the day alone no longer moves an entry away from its
--    range. Seeds and imports without a session write what they have, as before.
-- 2. pm_modifica_tempo: a stopped timer with no range the forms can show
--    (inside one minute, across midnight, in the hour repeated in October)
--    keeps its start and end while its day and minutes stay. Before, only the
--    timer across midnight did, and a note-only edit of a timer stopped within
--    its first minute was refused ("L’ora di fine deve essere dopo...") or lost
--    its range.

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
  v_sessione boolean := (select auth.uid()) is not null;
  v_ferma boolean := false;
  v_a_mano boolean := false;
begin
  -- The timer follows the clock (pm_avvia_timer, pm_ferma_timer, a member
  -- removed, profiles merged: they already write exactly this).
  if v_sessione then
    if tg_op = 'INSERT' then
      if new.inizio is not null and new.fine is null then
        new.inizio := clock_timestamp();
      end if;
    elsif old.inizio is not null and old.fine is null then
      if new.inizio is distinct from old.inizio then
        raise exception 'L’inizio di un timer acceso non si cambia' using errcode = '22023';
      end if;
      if new.fine is not null then
        new.fine := greatest(clock_timestamp(), new.inizio + interval '1 second');
        v_ferma := true;
      end if;
    elsif new.inizio is not null and new.fine is null then
      raise exception 'Una voce già ferma non torna un timer acceso' using errcode = '22023';
    end if;
  end if;

  -- the day is the start's, in Europe/Rome
  if new.inizio is not null then
    new.data := (new.inizio at time zone 'Europe/Rome')::date;
  end if;

  -- A range typed by hand: a new entry with start and end, or a stopped entry
  -- whose start or end change. Stopping a running timer is not one (the clock
  -- sets the end), nor are seeds and imports without a session.
  if v_sessione and not v_ferma and new.inizio is not null and new.fine is not null then
    if tg_op = 'INSERT' then
      v_a_mano := true;
    elsif new.inizio is distinct from old.inizio or new.fine is distinct from old.fine then
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
-- 2. Correcting an entry
-- ---------------------------------------------------------------------------
-- The range can be added, changed or removed (removing it keeps the minutes
-- typed). The same range as shown keeps a timer's seconds. A stopped timer
-- with no range the forms can show (lib/validation/tempo.ts, fasciaDellaVoce:
-- the HH:mm of its start and end, rebuilt on its day, give back the minutes
-- they fall in, the end in a later minute) keeps its start and end while its
-- day and minutes stay.
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
  v_mostrata boolean := false;
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

  -- the range the forms show for it, if any
  if v_prima.fine is not null then
    select coalesce(
             f.inizio = date_trunc('minute', v_prima.inizio)
             and f.fine = date_trunc('minute', v_prima.fine)
             and f.inizio < f.fine,
             false)
    into v_mostrata
    from public.pm_fascia_tempo(
      v_prima.data,
      (v_prima.inizio at time zone 'Europe/Rome')::time,
      (v_prima.fine at time zone 'Europe/Rome')::time
    ) f;
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
  elsif v_prima.fine is not null and not v_mostrata
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

revoke all on function public.pm_modifica_tempo(uuid, uuid, date, integer, time, time, uuid, text) from public, anon;
grant execute on function public.pm_modifica_tempo(uuid, uuid, date, integer, time, time, uuid, text) to authenticated;
