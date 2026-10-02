-- The pencil corrects a no-show's date again (Dany, 03/10/2026: "metti il
-- modifica anche per i no show non si sa mai"). 20261002120000 stopped a
-- no-show from moving everywhere: "Sposta" (sposta_call), "Riprogrammata",
-- and also the pencil (modifica_call) and direct updates, for every role. The
-- last part goes: the pencil of the call's closer and of the admin corrects
-- the date and time of a no-show again, without a trace, exactly as it
-- already does for a held call (svolta). A typo is not a move: the call was
-- entered at the wrong hour, or on the wrong day, and the lead did not show
-- up at the right one.
--
-- What stays as in 1.17.0:
-- - sposta_call refuses a no-show (22023) for everyone: a no-show never goes
--   back to "to be held" on another day. Untouched here.
-- - The pencil never changes stato: a no-show corrected with the pencil is
--   still a no-show, in the show rate of its (corrected) day. No trace
--   (spostata_dal, volte_spostata): modifica_call never writes it, and from
--   2. below no other update of the closer does on a call with an outcome.
-- - The setter: his pencil and his direct updates never change the date and
--   time of a call that is not to be held any more. A held call and a no-show
--   with his own words and 22023 (the closer or the admin corrects the
--   outcome, he books a new call), a cancelled call or one marked
--   riprogrammata with 42501 (the closer moves it). The same words as
--   sposta_call and lib/call/spostamento.ts (SPOSTA), apostrophes included.
-- - The closer never writes the setter's note; the setter never writes the
--   outcome or the closer's notes.
-- - The service role, the seed and the imports (no session) are untouched.
--
-- 1. calls_esito_solo_closer: the 1.17.0 body, with the no-show check at the
--    top for the setter only (it was for every session with a role) and with
--    his words only. Same signature: create or replace, the trigger stays.
-- 2. calls_traccia_spostamento: the trace changes only as sposta_call changes
--    it, and sposta_call always leaves the call to be held. Until now a direct
--    update of the closer shaped like a move (another moment, spostata_dal =
--    the old one, one more move) also passed on a held call, and with 1. it
--    would on a no-show: «Spostata dal…» written on a call that keeps its
--    outcome, which no button and no Alfire action writes. Now the trace
--    changes only with stato = 'programmata', as sposta_call writes it;
--    undoing the outcome and moving in one update (the correction of
--    20261002120000, in one step) still writes it. Same signature.

-- ---------------------------------------------------------------------------
-- 1. The setter never moves a no-show; closer and admin correct its date
-- ---------------------------------------------------------------------------

create or replace function public.calls_esito_solo_closer()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ruolo public.app_role := public.current_role();
begin
  -- the setter never moves a no-show: not with sposta_call, not with his
  -- pencil, not with a direct update. By the minute: the pencil sends day and
  -- time with the notes, and a call saved with seconds must not count as a
  -- move. The pencil of the closer and the admin corrects its date and time,
  -- as for a held call (Dany, 03/10/2026): a typo is not a move
  if tg_op = 'UPDATE'
     and v_ruolo = 'setter'
     and old.stato = 'no_show'
     and new.stato = 'no_show'
     and date_trunc('minute', new.programmata_il) is distinct from date_trunc('minute', old.programmata_il) then
    raise exception 'Il lead non si è presentato: la call resta un no show, così conta nello show rate. Se l’esito è sbagliato lo corregge il closer (o l’admin); per rivederlo fissa una nuova call'
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
  'The setter reads the outcome of his calls (stato, esito, qualificata, reason for not closing) and the closer''s notes, but never writes them: only the call''s closer and the admin do; he changes the day and time (programmata_il) only of a call still to be held, and reads why not in the words and codes of sposta_call (a held call or a no-show 22023, the other outcomes 42501). The closer reads the setter''s note and never writes it. The pencil of the closer and the admin corrects the day and time of a held call and of a no-show without a trace (Dany, 03/10/2026); sposta_call never moves them.';

-- ---------------------------------------------------------------------------
-- 2. The trace only with a real move: the call is to be held again
--    Same as 20261002100000 plus new.stato = 'programmata'. Same signature:
--    create or replace, the trigger stays.
-- ---------------------------------------------------------------------------
create or replace function public.calls_traccia_spostamento()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ruolo public.app_role := public.current_role();
begin
  -- the admin writes everything; seeds, imports and the service role have no session
  if v_ruolo is null or v_ruolo = 'admin' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.volte_spostata <> 0 or new.spostata_dal is not null then
      raise exception 'La traccia dello spostamento la scrive solo «Sposta»' using errcode = '42501';
    end if;
  elsif (new.volte_spostata, new.spostata_dal) is distinct from (old.volte_spostata, old.spostata_dal)
    -- what sposta_call writes: one more move, from where the call was, and the
    -- call to be held again. A pencil correction of a held call or a no-show
    -- keeps its outcome: never a trace
    and not (
      new.volte_spostata = old.volte_spostata + 1
      and new.spostata_dal = old.programmata_il
      and new.programmata_il is distinct from old.programmata_il
      and new.stato = 'programmata'
    ) then
    raise exception 'La traccia dello spostamento la scrive solo «Sposta»' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.calls_traccia_spostamento() is
  'spostata_dal and volte_spostata change only as a move changes them (sposta_call: one more move, from the moment before, the call to be held again) for every session but the admin''s; a new call starts without a trace. A call that keeps its outcome (a held call or a no-show corrected with the pencil) never gets one.';
