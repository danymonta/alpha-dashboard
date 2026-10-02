-- Moving a call (Dany, 02/10/2026): "inserisci nelle call, oltre a Registra
-- esito, un pulsante che ti fa spostare la call; e se la call viene
-- riprogrammata, quando clicco su Riprogrammata mi deve far segnare la data
-- successiva a cui è stata riprogrammata".
--
-- The same call moves: no second call, no second lead. Its programmata_il
-- becomes the new moment and it is still to be held again (stato
-- 'programmata', no outcome). Every call metric reads programmata_il, so the
-- call simply counts on its new day; created_at never changes, so the setter's
-- bookings ("prenotate", by created_at) stay where they were. After this a
-- call is never left in 'riprogrammata': the enum value stays for the calls
-- recorded before, which the closer or the admin move.
--
-- 1. calls.spostata_dal / calls.volte_spostata: the trace on the card
--    ("Spostata dal 30/09 alle 19:00"): the moment before the last move and
--    how many moves. Kept simple on purpose: the last origin and a count, no
--    history table. Both empty (0) for a call never moved.
-- 2. sposta_call(p_call_id, p_data, p_ora): the one path of a move, from the
--    "Sposta" button, the outcome sheet's "Riprogrammata" and Alfire.
--    security invoker: the calls policies decide which calls one may touch,
--    as in modifica_call. Who: the closer of the call, the admin (any call)
--    and the setter who booked it, only while it is still to be held: an
--    outcome is the closer's (calls_esito_solo_closer), and moving a call
--    clears it. A held call (svolta) never moves, for anyone: it happened, a
--    closed one may have its sale (sales_una_per_call), and moving it would
--    take its outcome off its day. A wrong outcome is undone first ("Annulla
--    l'esito"); to see the lead again a new call is booked. A move goes from
--    today on; the admin also records a move in the past (history), as he
--    books calls already done.
-- 3. calls_esito_solo_closer: the setter moves only a call still to be held,
--    whatever the path (sposta_call, the pencil modifica_call, a direct
--    update): changing programmata_il of a call with an outcome, or marked
--    riprogrammata, is the closer's.
-- 4. calls_traccia_spostamento: the trace is written only by a real move. For
--    a session that is not the admin's, spostata_dal and volte_spostata change
--    only as sposta_call changes them (one more move, from where the call
--    was), and a new call has none.
--
-- The pencil (modifica_call) still corrects date and time without a trace: a
-- typo is not a move.

-- ---------------------------------------------------------------------------
-- 1. The trace of the last move
-- ---------------------------------------------------------------------------
alter table public.calls
  add column spostata_dal timestamptz,
  add column volte_spostata integer not null default 0,
  add constraint calls_volte_spostata_non_negative check (volte_spostata >= 0),
  -- a call moved at least once knows where it came from, and only then
  add constraint calls_spostata_coerente check ((volte_spostata = 0) = (spostata_dal is null));

comment on column public.calls.spostata_dal is
  'Where the call was before its last move (sposta_call), shown on the card as "Spostata dal …". Null for a call never moved.';
comment on column public.calls.volte_spostata is
  'How many times the call was moved with sposta_call. The pencil (modifica_call) corrects date and time without counting.';

-- ---------------------------------------------------------------------------
-- 2. sposta_call
-- ---------------------------------------------------------------------------
create function public.sposta_call(
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
    raise exception 'Scegli il giorno e l''ora della call' using errcode = '22023';
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

  -- the setter moves a call still to be held; an outcome is the closer's
  if v_ruolo = 'setter' and v_stato <> 'programmata' then
    raise exception '%',
      case when v_stato = 'riprogrammata'
        then 'Questa call è segnata come riprogrammata: la nuova data la mette il closer (o l''admin)'
        else 'Questa call ha già un esito del closer: la sposta lui (o l''admin)'
      end
      using errcode = '42501';
  end if;

  -- a held call happened: it never moves (a closed one may have its sale)
  if v_stato = 'svolta' then
    raise exception 'Questa call è stata fatta: non si sposta. Se l''esito è sbagliato annullalo prima; per rivedere il lead serve una nuova call'
      using errcode = '22023';
  end if;

  v_nuovo := (p_data + p_ora) at time zone 'Europe/Rome';

  if v_nuovo = date_trunc('minute', v_prima) then
    raise exception 'La call è già a quel giorno e a quell''ora: scegline un altro' using errcode = '22023';
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
  'Move a call to a new day and time (Europe/Rome): the same call, still to be held again (stato programmata, no outcome), with the trace spostata_dal and volte_spostata; created_at never changes. Closer of the call, admin (any call, also to the past) and the setter who booked it while it is still to be held; from today on for everyone but the admin; a held call (svolta) never moves.';

revoke all on function public.sposta_call(uuid, date, time) from public, anon;
grant execute on function public.sposta_call(uuid, date, time) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. The setter moves only a call still to be held, whatever the path
--    Same as 20260930110000 plus the last check. Same signature: create or
--    replace, the trigger stays.
-- ---------------------------------------------------------------------------
create or replace function public.calls_esito_solo_closer()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ruolo public.app_role := public.current_role();
begin
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

  -- moving a call with an outcome, or marked riprogrammata, is the closer's:
  -- the same words as sposta_call, from the pencil or a direct update too.
  -- By the minute: the pencil sends day and time, and saving only his notes
  -- on a call booked with seconds must not count as a move
  if date_trunc('minute', new.programmata_il) is distinct from date_trunc('minute', old.programmata_il)
     and old.stato <> 'programmata' then
    raise exception '%',
      case when old.stato = 'riprogrammata'
        then 'Questa call è segnata come riprogrammata: la nuova data la mette il closer (o l''admin)'
        else 'Questa call ha già un esito del closer: la sposta lui (o l''admin)'
      end
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.calls_esito_solo_closer() is
  'The setter reads the outcome of his calls (stato, esito, qualificata, reason for not closing) and the closer''s notes, but never writes them: only the call''s closer and the admin do; he moves (programmata_il) only a call still to be held. The closer reads the setter''s note and never writes it.';

-- ---------------------------------------------------------------------------
-- 4. The trace is written only by a real move
-- ---------------------------------------------------------------------------
create function public.calls_traccia_spostamento()
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
    -- what sposta_call writes: one more move, from where the call was
    and not (
      new.volte_spostata = old.volte_spostata + 1
      and new.spostata_dal = old.programmata_il
      and new.programmata_il is distinct from old.programmata_il
    ) then
    raise exception 'La traccia dello spostamento la scrive solo «Sposta»' using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.calls_traccia_spostamento() is
  'spostata_dal and volte_spostata change only as a move changes them (sposta_call: one more move, from the moment before) for every session but the admin''s; a new call starts without a trace.';

create trigger calls_traccia_spostamento
  before insert or update on public.calls
  for each row execute function public.calls_traccia_spostamento();
