-- Only the closer records how a call went, and the closer's notes are his
-- (Dany, 30/09/2026): "Solo il closer registra l'esito, e le note del closer
-- non le può modificare il setter."
--
-- 1. calls.note_closer: the closer's "Note aggiuntive" (the column of the same
--    name in his prospect sheet). Written by the closer of the call (outcome
--    sheet, call details) and by the admin; the setter reads it on the calls he
--    booked and never writes it. calls.note stays the setter's note ("Note del
--    setter"): written by the setter with the pencil of the call and by the
--    admin; the closer reads it and never writes it (Dany: "sì, come per il
--    setter"). The notes imported from Dany's prospect sheet are its "Note
--    aggiuntive" column, the closer's: they move to note_closer (Dany, 51 calls
--    in production); every other note stays in calls.note.
-- 2. The outcome is the closer's: stato, esito, qualificata,
--    obiezione_principale ("Motivo di non chiusura") and note_closer are
--    written only by the call's closer and by the admin. RLS works by row and
--    the setter may update his own calls (date, closer, his notes): a trigger
--    guards the columns. It replaces calls_motivo_solo_closer
--    (20260930100000), which guarded the reason only. Admin, closer, service
--    role, seeds and imports (no session, current_role() null) are untouched.
-- 3. modifica_call: the closer moves his call without rewriting the setter's
--    note, which his sheet shows read only.
-- 4. dettagli_call also saves note_closer: the closer's (and the admin's)
--    sheet, with the other details of the call.
-- 5. motivi_non_chiusura_periodo ("Dalle call", for marketing): the closer's
--    reason and note_closer, never the setter's note. A returned column
--    changes name: drop and create, same signature and grants.

-- ---------------------------------------------------------------------------
-- 1. The closer's notes
-- ---------------------------------------------------------------------------
alter table public.calls
  add column note_closer text
    constraint calls_note_closer_lunghezza check (char_length(note_closer) <= 2000);

comment on column public.calls.note_closer is
  'Note aggiuntive of the closer (his prospect sheet): written by the call''s closer and the admin, read by the setter who booked the call, never written by him.';
comment on column public.calls.note is
  'Note del setter: written by the setter (pencil of the call) and by the admin; the closer reads it and never writes it.';

-- the prospect sheet's "Note aggiuntive" are the closer's (scripts/import-prospect.ts)
update public.calls c
set note_closer = c.note,
    note = null
from public.leads l
where l.id = c.lead_id
  and l.note = 'Importato dal foglio delle call'
  and c.note is not null
  and c.note_closer is null
  and char_length(c.note) <= 2000;

-- ---------------------------------------------------------------------------
-- 2. The outcome and the closer's notes: never from the setter
-- ---------------------------------------------------------------------------
drop trigger calls_motivo_solo_closer on public.calls;
drop function public.calls_motivo_solo_closer();

create function public.calls_esito_solo_closer()
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
  elsif new.stato is distinct from old.stato
     or new.esito is distinct from old.esito
     or new.qualificata is distinct from old.qualificata
     or new.obiezione_principale is distinct from old.obiezione_principale
     or new.note_closer is distinct from old.note_closer then
    raise exception 'L''esito della call e le note del closer li scrive il closer'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.calls_esito_solo_closer() is
  'The setter reads the outcome of his calls (stato, esito, qualificata, reason for not closing) and the closer''s notes, but never writes them: only the call''s closer and the admin do. The closer reads the setter''s note and never writes it.';

create trigger calls_esito_solo_closer
  before insert or update on public.calls
  for each row execute function public.calls_esito_solo_closer();

-- ---------------------------------------------------------------------------
-- 3. modifica_call: the closer keeps the setter's note
--    Same signature: create or replace, grants unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.modifica_call(
  p_call_id uuid,
  p_tipo public.call_type,
  p_data date,
  p_ora time,
  p_closer_id uuid,
  p_note text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ruolo public.app_role := public.current_role();
  v_righe integer;
begin
  if v_ruolo is null or v_ruolo not in ('admin', 'setter', 'closer') then
    raise exception 'Operazione non consentita' using errcode = '42501';
  end if;

  if v_ruolo = 'closer' and p_closer_id is distinct from (select auth.uid()) then
    raise exception 'La call la riassegna il setter o l''admin' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.profiles p
    where p.id = p_closer_id
      and p.attivo
      and p.ruolo in ('admin', 'closer')
  ) then
    raise exception 'Il closer scelto non è attivo o non può chiudere' using errcode = '22023';
  end if;

  update public.calls c
  set tipo = p_tipo,
      programmata_il = (p_data + p_ora) at time zone 'Europe/Rome',
      closer_id = p_closer_id,
      -- the setter's note: the closer reads it, his notes are note_closer (dettagli_call)
      note = case when v_ruolo = 'closer' then c.note else nullif(trim(p_note), '') end
  where c.id = p_call_id;

  get diagnostics v_righe = row_count;
  if v_righe = 0 then
    raise exception 'Call non trovata o non tua' using errcode = '42501';
  end if;
end;
$$;

comment on function public.modifica_call(uuid, public.call_type, date, time, uuid, text) is
  'Reschedule a call, change its type, closer or the setter''s note (p_note). Who may touch which call is decided by the calls policies; the closer never reassigns it and never rewrites the setter''s note.';

-- ---------------------------------------------------------------------------
-- 4. dettagli_call: the closer's side, now with his notes. A null clears, as
--    for the other details; a null amount removes the pitch row.
-- ---------------------------------------------------------------------------
drop function public.dettagli_call(uuid, text, public.call_performance, uuid, numeric);

create function public.dettagli_call(
  p_call_id uuid,
  p_link_registrazione text default null,
  p_performance public.call_performance default null,
  p_prodotto_proposto_id uuid default null,
  p_importo_proposto numeric default null,
  p_note_closer text default null
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_ruolo public.app_role := public.current_role();
  v_righe integer;
begin
  if v_ruolo is null or v_ruolo not in ('admin', 'closer') then
    raise exception 'I dettagli della call li registra chi la fa' using errcode = '42501';
  end if;

  update public.calls
  set link_registrazione = nullif(trim(p_link_registrazione), ''),
      performance = p_performance,
      prodotto_proposto_id = p_prodotto_proposto_id,
      note_closer = nullif(trim(p_note_closer), '')
  where id = p_call_id;

  get diagnostics v_righe = row_count;
  if v_righe = 0 then
    raise exception 'Call non trovata o non assegnata a te' using errcode = '42501';
  end if;

  if p_importo_proposto is null then
    delete from public.call_pitch where call_id = p_call_id;
  else
    insert into public.call_pitch (call_id, importo_proposto, created_by)
    values (p_call_id, p_importo_proposto, (select auth.uid()))
    on conflict (call_id) do update set importo_proposto = excluded.importo_proposto;
  end if;
end;
$$;

comment on function public.dettagli_call(uuid, text, public.call_performance, uuid, numeric, text) is
  'The closer''s record of a call (closer of the call and admin): recording, performance, product and amount pitched, his notes (note_closer). Every value replaces the saved one; null clears it.';

revoke all on function public.dettagli_call(uuid, text, public.call_performance, uuid, numeric, text) from public, anon;
grant execute on function public.dettagli_call(uuid, text, public.call_performance, uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. "Dalle call": the closer's reason and notes. Admin only.
--
-- The held calls of the period (by Europe/Rome day of programmata_il) that did
-- not close, follow_up or persa, with something the closer wrote: the reason
-- for not closing, his notes (note_closer), or both. Newest first. p_setter
-- narrows it to the calls that setter booked. The setter's note is his side of
-- the call, not the lead's words after it: it is not listed.
-- ---------------------------------------------------------------------------
drop function public.motivi_non_chiusura_periodo(date, date, uuid, integer);

create function public.motivi_non_chiusura_periodo(
  p_da date,
  p_a date,
  p_setter uuid default null,
  p_limite integer default 200
)
returns table (
  call_id uuid,
  data date,
  programmata_il timestamptz,
  lead text,
  closer text,
  esito public.call_outcome,
  qualificata boolean,
  motivo text,
  note_closer text
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_limite integer := least(greatest(coalesce(p_limite, 200), 1), 1000);
begin
  if not public.is_admin() then
    raise exception 'I motivi di non chiusura per il marketing li legge solo l''admin' using errcode = '42501';
  end if;
  perform public.verifica_periodo(p_da, p_a);

  return query
  select
    c.id,
    (c.programmata_il at time zone 'Europe/Rome')::date,
    c.programmata_il,
    l.nome,
    pc.nome,
    c.esito,
    c.qualificata,
    nullif(btrim(c.obiezione_principale), ''),
    nullif(btrim(c.note_closer), '')
  from public.calls c
  left join public.leads l on l.id = c.lead_id
  left join public.profiles pc on pc.id = c.closer_id
  where c.stato = 'svolta'
    and c.esito in ('follow_up', 'persa')
    and (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
    and (p_setter is null or c.setter_id = p_setter)
    and (nullif(btrim(c.obiezione_principale), '') is not null or nullif(btrim(c.note_closer), '') is not null)
  order by c.programmata_il desc, c.id
  limit v_limite;
end;
$$;

comment on function public.motivi_non_chiusura_periodo(date, date, uuid, integer) is
  'Admin only: the held calls of a period that did not close (follow_up, persa) with the closer''s reason for not closing or his notes (note_closer), newest first; optionally only the calls one setter booked.';

revoke all on function public.motivi_non_chiusura_periodo(date, date, uuid, integer) from public, anon;
grant execute on function public.motivi_non_chiusura_periodo(date, date, uuid, integer) to authenticated;
