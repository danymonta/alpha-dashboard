-- Pause for the timer (1.66.0). Dany, 29/10/2026: «integra una funzione di pausa
-- per il timer dell'app per tracciare il tempo disponibile». A running timer can
-- be paused and resumed: the minutes it saves are the time it ran, without the
-- pauses. Still self-declared time (CLAUDE.md sections 17 and 18): the person
-- presses the buttons, the app never pauses anything by itself.
--
-- 1. pm_tempo gets pausa_dal (when the running timer was paused, null when it
--    runs) and pausa_secondi (the pauses already ended). Only a running timer
--    has a pause.
-- 2. pm_tempo_coerenza: with a session the pause follows the clock like the
--    start and the end (pausa_dal is now, the seconds are added by the trigger,
--    never written by a client). Stopping a timer that had pauses saves only
--    the minutes it ran, without a range: «Dalle–Alle» would say more time than
--    the minutes, and every page, form, email, Alfire and Claude read the range
--    as the whole entry. Its day is the start's, as for every timer.
-- 3. pm_pausa_timer() and pm_riprendi_timer(): security invoker, the caller's
--    own running timer under RLS (pm_tempo_update), nothing to do answers null.
-- 4. pm_timer_attivo() also says the pause, so the clock on every device stops.

alter table public.pm_tempo
  add column pausa_dal timestamptz,
  add column pausa_secondi integer not null default 0 check (pausa_secondi >= 0);

alter table public.pm_tempo
  add constraint pm_tempo_pausa_solo_acceso check (
    (pausa_dal is null or (inizio is not null and fine is null))
    and (pausa_secondi = 0 or (inizio is not null and fine is null))
  );

comment on column public.pm_tempo.pausa_dal is
  'When the running timer was paused (pm_pausa_timer), null while it runs. Only on a running timer.';
comment on column public.pm_tempo.pausa_secondi is
  'Seconds of the pauses already ended of the running timer; a stopped timer that had pauses keeps only its minutes.';

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
  v_ora timestamptz := clock_timestamp();
  v_pausa integer;
begin
  -- The timer follows the clock (pm_avvia_timer, pm_ferma_timer, the pause, a
  -- member removed, profiles merged: they already write exactly this).
  if v_sessione then
    if tg_op = 'INSERT' then
      if new.inizio is not null and new.fine is null then
        new.inizio := v_ora;
      end if;
      new.pausa_dal := null;
      new.pausa_secondi := 0;
    elsif old.inizio is not null and old.fine is null then
      if new.inizio is distinct from old.inizio then
        raise exception 'L’inizio di un timer acceso non si cambia' using errcode = '22023';
      end if;
      -- the pause: never written by a client, only paused or resumed now
      new.pausa_secondi := old.pausa_secondi;
      if new.fine is not null then
        new.fine := greatest(v_ora, new.inizio + interval '1 second');
        v_ferma := true;
        if old.pausa_dal is not null then
          new.pausa_secondi := old.pausa_secondi + greatest(0, floor(extract(epoch from (new.fine - old.pausa_dal))))::integer;
        end if;
        new.pausa_dal := null;
      elsif old.pausa_dal is null and new.pausa_dal is not null then
        new.pausa_dal := v_ora;
      elsif old.pausa_dal is not null and new.pausa_dal is null then
        new.pausa_secondi := old.pausa_secondi + greatest(0, floor(extract(epoch from (v_ora - old.pausa_dal))))::integer;
      else
        new.pausa_dal := old.pausa_dal;
      end if;
    elsif new.inizio is not null and new.fine is null then
      raise exception 'Una voce già ferma non torna un timer acceso' using errcode = '22023';
    else
      -- a stopped entry has no pause
      new.pausa_dal := null;
      new.pausa_secondi := 0;
    end if;
  elsif new.fine is not null and new.pausa_dal is not null then
    -- without a session (seeds, imports, the service role): a pause still open ends with the timer
    new.pausa_secondi := new.pausa_secondi + greatest(0, floor(extract(epoch from (new.fine - new.pausa_dal))))::integer;
    new.pausa_dal := null;
  end if;

  -- the day is the start's, in Europe/Rome
  if new.inizio is not null then
    new.data := (new.inizio at time zone 'Europe/Rome')::date;
  end if;

  -- A stopped timer that had pauses: only the minutes it ran, no range (see the header).
  if new.inizio is not null and new.fine is not null and new.pausa_secondi > 0 then
    v_pausa := new.pausa_secondi;
    new.minuti := greatest(1, least(1440, round((extract(epoch from (new.fine - new.inizio)) - v_pausa) / 60)::integer));
    new.inizio := null;
    new.fine := null;
    new.pausa_secondi := 0;
    v_ferma := true;
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
    if new.fine > v_ora then
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
  if not v_ferma and ((new.inizio is null and new.minuti is not null) or v_a_mano) and (
    select coalesce(sum(t.minuti), 0) from public.pm_tempo t
    where t.profile_id = new.profile_id and t.data = new.data and t.id <> new.id and t.minuti is not null
  ) + new.minuti > 1440 then
    raise exception 'In questo giorno risulterebbero più di 24 ore: controlla le voci già registrate'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

-- Pause and resume: the caller's own running timer, under RLS. Null when there
-- is nothing to do (no timer, already paused, already running).
create function public.pm_pausa_timer()
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Sessione scaduta' using errcode = '42501';
  end if;
  update public.pm_tempo t
  set pausa_dal = clock_timestamp()
  where t.profile_id = (select auth.uid()) and t.inizio is not null and t.fine is null and t.pausa_dal is null
  returning t.id into v_id;
  return v_id;
end;
$$;

create function public.pm_riprendi_timer()
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'Sessione scaduta' using errcode = '42501';
  end if;
  update public.pm_tempo t
  set pausa_dal = null
  where t.profile_id = (select auth.uid()) and t.inizio is not null and t.fine is null and t.pausa_dal is not null
  returning t.id into v_id;
  return v_id;
end;
$$;

revoke all on function public.pm_pausa_timer() from public, anon;
revoke all on function public.pm_riprendi_timer() from public, anon;
grant execute on function public.pm_pausa_timer() to authenticated;
grant execute on function public.pm_riprendi_timer() to authenticated;

-- The running timer, with its pause
drop function public.pm_timer_attivo();
create function public.pm_timer_attivo()
returns table (
  id uuid,
  progetto_id uuid,
  progetto text,
  task_id uuid,
  task text,
  inizio timestamptz,
  nota text,
  pausa_dal timestamptz,
  pausa_secondi integer
)
language sql
stable
security invoker
set search_path = ''
as $$
  select t.id, t.progetto_id, p.nome, t.task_id, k.titolo, t.inizio, t.nota, t.pausa_dal, t.pausa_secondi
  from public.pm_tempo t
  left join public.pm_progetti p on p.id = t.progetto_id
  left join public.pm_task k on k.id = t.task_id
  where t.profile_id = (select auth.uid())
    and t.inizio is not null
    and t.fine is null;
$$;
revoke all on function public.pm_timer_attivo() from public, anon;
grant execute on function public.pm_timer_attivo() to authenticated;
