-- A no-show never moves (Dany, 02/10/2026: "blocca lo spostamento dei no
-- show"). A call with stato 'no_show' stays where it is, for everyone, the
-- admin included: like a held call (svolta), "Sposta" never takes it, and
-- neither does the pencil (2.). The lead did not show up on that day, and the
-- call stays a no-show in that day's show rate. Before this, "Sposta"
-- (sposta_call) took it to a new day, still to be held, and the no-show left
-- the show rate.
--
-- A wrong outcome is still corrected as for a held call: the closer (or the
-- admin) undoes it first ("Annulla l'esito, torna da fare", already in the
-- outcome sheet), then the call moves. To see the lead again a new call is
-- booked: by the setter or the admin (the closer books none).
--
-- 1. sposta_call: svolta and no_show refuse with 22023, for every role, before
--    the setter's own check. The words are the same as lib/call/spostamento.ts
--    (SPOSTA), apostrophes included. The setter reads his own sentence: he
--    never undoes an outcome and he books the new call himself; until now he
--    read "la sposta lui (o l'admin)" on a held call, which nobody moves.
-- 2. calls_esito_solo_closer: a no-show keeps its day and time, for every
--    session with a role, the admin included: the pencil (modifica_call) or a
--    direct update that changes programmata_il while the call stays a no-show
--    is refused with 22023 and the words of sposta_call. Without this the
--    pencil would do what "Sposta" no longer does: take the no-show to another
--    day (even to the future), out of its day's show rate, without a trace.
--    Saving notes or details with day and time as they are still works (by
--    the minute, as for the setter). Undoing the outcome and moving the call
--    in one update stays possible: it is the correction above, in one step.
--    The service role, the seed and the imports (no session) are untouched.
--    The setter's pencil or direct update on a held call says the same as
--    sposta_call to him, with the same code (22023); a cancelled call or one
--    marked riprogrammata still says the closer moves it (42501): closer and
--    admin still move them.
--
-- The pencil of the closer and the admin still corrects the date and time of
-- a held call (svolta) without a trace, as in 20261002100000: a typo is not a
-- move. Not of a no-show: that is the one a closer would want to "move", the
-- lead asking to be seen another day.

-- ---------------------------------------------------------------------------
-- 1. sposta_call (same signature: create or replace, grants stay)
-- ---------------------------------------------------------------------------
create or replace function public.sposta_call(
  p_call_id uuid,
  p_data date,
  p_ora time
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ruolo public.app_role := public.current_role();
  v_stato public.call_status;
  v_prima timestamptz;
  v_nuovo timestamptz;
begin
  if v_ruolo is null or v_ruolo not in ('admin', 'setter', 'closer') then
    raise exception 'Operazione non consentita' using errcode = '42501';
  end if;

  if p_data is null or p_ora is null then
    raise exception 'Scegli il giorno e l’ora della call' using errcode = '22023';
  end if;

  -- RLS decides which calls one sees and may update: the setter his own, the
  -- closer those assigned to him, the admin all
  select c.stato, c.programmata_il
  into v_stato, v_prima
  from public.calls c
  where c.id = p_call_id
  for update;

  if not found then
    raise exception 'Call non trovata o non tua' using errcode = '42501';
  end if;

  -- a held call happened (a closed one may have its sale) and a no-show stays
  -- in its day's show rate: neither moves, for anyone. The setter never undoes
  -- an outcome and books the new call himself: his own words
  if v_stato in ('svolta', 'no_show') then
    raise exception '%',
      case
        when v_stato = 'svolta' and v_ruolo = 'setter'
          then 'Questa call è stata fatta: non si sposta. Se l’esito è sbagliato lo corregge il closer (o l’admin); per rivedere il lead fissa una nuova call'
        when v_stato = 'svolta'
          then 'Questa call è stata fatta: non si sposta. Se l’esito è sbagliato annullalo prima; per rivedere il lead serve una nuova call, che fissa il setter (o l’admin)'
        when v_ruolo = 'setter'
          then 'Il lead non si è presentato: la call resta un no show, così conta nello show rate. Se l’esito è sbagliato lo corregge il closer (o l’admin); per rivederlo fissa una nuova call'
        else 'Il lead non si è presentato: la call resta un no show, così conta nello show rate. Se l’esito è sbagliato annullalo prima; per rivederlo serve una nuova call, che fissa il setter (o l’admin)'
      end
      using errcode = '22023';
  end if;

  -- the setter moves a call still to be held; the others with an outcome
  -- (cancelled, marked riprogrammata) the closer or the admin
  if v_ruolo = 'setter' and v_stato <> 'programmata' then
    raise exception '%',
      case when v_stato = 'riprogrammata'
        then 'Questa call è segnata come riprogrammata: la nuova data la mette il closer (o l’admin)'
        else 'Questa call ha già un esito del closer: la sposta lui (o l’admin)'
      end
      using errcode = '42501';
  end if;

  v_nuovo := (p_data + p_ora) at time zone 'Europe/Rome';

  if v_nuovo = date_trunc('minute', v_prima) then
    raise exception 'La call è già a quel giorno e a quell’ora: scegline un altro' using errcode = '22023';
  end if;

  -- a move goes from today on; the admin also records one in the past
  if v_ruolo <> 'admin' and p_data < public.oggi() then
    raise exception 'Una call si sposta da oggi in avanti' using errcode = '22023';
  end if;

  update public.calls c
  set programmata_il = v_nuovo,
      -- to be held again: no outcome. A call already to be held keeps what it
      -- has (nothing of the closer's to clear), so the setter's move never
      -- touches a column of the closer's
      stato = 'programmata',
      esito = null,
      qualificata = null,
      obiezione_principale = case when c.stato = 'programmata' then c.obiezione_principale else null end,
      spostata_dal = c.programmata_il,
      volte_spostata = c.volte_spostata + 1
  where c.id = p_call_id;
end;
$$;

comment on function public.sposta_call(uuid, date, time) is
  'Move a call to a new day and time (Europe/Rome): the same call, still to be held again (stato programmata, no outcome), with the trace spostata_dal and volte_spostata; created_at never changes. Closer of the call, admin (any call, also to the past) and the setter who booked it while it is still to be held; from today on for everyone but the admin; a held call (svolta) and a no-show never move, for anyone (22023).';

revoke all on function public.sposta_call(uuid, date, time) from public, anon;
grant execute on function public.sposta_call(uuid, date, time) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. A no-show keeps its day and time for everyone, from the pencil or a
--    direct update too; the setter's words on a held call. Same as
--    20261002100000 but the no-show check and the last message. Same
--    signature: create or replace, the trigger stays.
-- ---------------------------------------------------------------------------
create or replace function public.calls_esito_solo_closer()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ruolo public.app_role := public.current_role();
begin
  -- a no-show never moves, for anyone with a session, the admin included: not
  -- with sposta_call, not with the pencil, not with a direct update. By the
  -- minute: the pencil sends day and time with the notes, and a call saved
  -- with seconds must not count as a move
  if tg_op = 'UPDATE'
     and v_ruolo is not null
     and old.stato = 'no_show'
     and new.stato = 'no_show'
     and date_trunc('minute', new.programmata_il) is distinct from date_trunc('minute', old.programmata_il) then
    raise exception '%',
      case
        when v_ruolo = 'setter'
          then 'Il lead non si è presentato: la call resta un no show, così conta nello show rate. Se l’esito è sbagliato lo corregge il closer (o l’admin); per rivederlo fissa una nuova call'
        else 'Il lead non si è presentato: la call resta un no show, così conta nello show rate. Se l’esito è sbagliato annullalo prima; per rivederlo serve una nuova call, che fissa il setter (o l’admin)'
      end
      using errcode = '22023';
  end if;

  -- the closer reads the setter's note and never writes it (he has no insert policy)
  if v_ruolo = 'closer' then
    if tg_op = 'UPDATE' and new.note is distinct from old.note then
      raise exception 'Le note del setter le scrive il setter' using errcode = '42501';
    end if;
    return new;
  end if;

  if v_ruolo is distinct from 'setter' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- a call the setter books is always still to be held, with nothing of the closer's
    if new.stato is distinct from 'programmata'
       or new.esito is not null
       or new.qualificata is not null
       or new.obiezione_principale is not null
       or new.note_closer is not null then
      raise exception 'L''esito della call e le note del closer li scrive il closer'
        using errcode = '42501';
    end if;
    return new;
  end if;

  if new.stato is distinct from old.stato
     or new.esito is distinct from old.esito
     or new.qualificata is distinct from old.qualificata
     or new.obiezione_principale is distinct from old.obiezione_principale
     or new.note_closer is distinct from old.note_closer then
    raise exception 'L''esito della call e le note del closer li scrive il closer'
      using errcode = '42501';
  end if;

  -- the setter moves only a call still to be held: the same words and codes
  -- as sposta_call, from the pencil or a direct update too. By the minute, as
  -- above. A held call nobody moves (22023, the no-show is refused above);
  -- the other outcomes the closer moves (42501)
  if date_trunc('minute', new.programmata_il) is distinct from date_trunc('minute', old.programmata_il)
     and old.stato <> 'programmata' then
    if old.stato = 'svolta' then
      raise exception 'Questa call è stata fatta: non si sposta. Se l’esito è sbagliato lo corregge il closer (o l’admin); per rivedere il lead fissa una nuova call'
        using errcode = '22023';
    end if;
    raise exception '%',
      case old.stato
        when 'riprogrammata'
          then 'Questa call è segnata come riprogrammata: la nuova data la mette il closer (o l’admin)'
        else 'Questa call ha già un esito del closer: la sposta lui (o l’admin)'
      end
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.calls_esito_solo_closer() is
  'A no-show keeps its day and time for every session with a role, the admin included (22023, the words of sposta_call). The setter reads the outcome of his calls (stato, esito, qualificata, reason for not closing) and the closer''s notes, but never writes them: only the call''s closer and the admin do; he moves (programmata_il) only a call still to be held, and reads why not in the words and codes of sposta_call. The closer reads the setter''s note and never writes it.';
