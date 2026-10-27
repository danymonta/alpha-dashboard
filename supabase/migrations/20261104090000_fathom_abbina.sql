-- Recordings of Fathom found by the app (1.65.0). Dany, 27/10/2026, on Marketing ›
-- Dalle call with «0 call analizzate su 15 svolte»: «devi analizzarle da fathom e
-- darmi recap qui». Until now a recording came only from a link the closer
-- pasted (decision of 16/10/2026); the held calls before that day, and those
-- where nobody pasted it, never reached Claude.
--
-- Now the app also looks on Fathom by itself (lib/fathom/abbina.ts): for a held
-- call with an outcome and no link, the meeting of Dany's account with the name
-- of the lead and the nearest time. Found, this function writes its link on the
-- call and what Fathom said for it, in one transaction, as the outcome sheet
-- and «Verifica il link» do; the triggers of 1.37.0 then put the call in the
-- queue of the analyses (call_analisi_valuta: analyses on, the month's limit).
--
-- Never on a call marked «non registrata»: that is also how a lead who opposed
-- the recording is respected (CLAUDE.md section 22), so the app does not
-- overrule it. Never over a link a person wrote, never a recording already tied
-- to another call. Service role only: the route checks the admin first.

create function public.fathom_collega_trovata(
  p_call_id uuid, p_url text, p_recording_id bigint, p_durata integer, p_inizio timestamptz)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.calls;
  r public.call_registrazioni;
begin
  if p_url is null or p_url !~* '^https://([a-z0-9-]+\.)?fathom\.(video|ai)/\S+$' or char_length(p_url) > 500 then
    raise exception 'Link di Fathom non valido.' using errcode = '22023';
  end if;
  select * into c from public.calls x where x.id = p_call_id for update;
  if not found then
    return 'sparita';
  end if;
  if c.stato <> 'svolta' or c.esito is null then
    return 'non_svolta';
  end if;
  if c.link_registrazione is not null then
    return 'ha_link';
  end if;
  select * into r from public.call_registrazioni x where x.call_id = p_call_id;
  if found and r.stato = 'non_registrata' then
    return 'non_registrata';
  end if;
  if exists (select 1 from public.call_registrazioni x where x.recording_id = p_recording_id and x.call_id <> p_call_id) then
    return 'usata';
  end if;

  -- the link first (the trigger opens the row and asks for the analysis), then what Fathom said for it
  update public.calls x set link_registrazione = p_url where x.id = p_call_id;
  insert into public.call_registrazioni as x
    (call_id, stato, link_verificato, recording_id, durata_secondi, inizio_registrazione, verificata_il, created_by)
  values (p_call_id, 'collegata', p_url, p_recording_id, least(greatest(coalesce(p_durata, 0), 0), 21600), p_inizio, now(), null)
  on conflict (call_id) do update
    set stato = 'collegata', link_verificato = excluded.link_verificato, recording_id = excluded.recording_id,
        durata_secondi = excluded.durata_secondi, inizio_registrazione = excluded.inizio_registrazione,
        verificata_il = now();
  update public.call_analisi a set recording_id = p_recording_id
  where a.call_id = p_call_id and a.stato = 'in_coda' and a.recording_id is null;
  return 'collegata';
end;
$$;
revoke all on function public.fathom_collega_trovata(uuid, text, bigint, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.fathom_collega_trovata(uuid, text, bigint, integer, timestamptz) to service_role;

comment on function public.fathom_collega_trovata(uuid, text, bigint, integer, timestamptz) is
  'Service role (the route checked the admin): ties a held call without a link to the Fathom recording the app found for it (same lead name, nearest time), writing calls.link_registrazione and call_registrazioni in one transaction; the 1.37.0 triggers queue the analysis. Answers collegata, or why not: sparita, non_svolta, ha_link, non_registrata (never overruled: also how an opposed lead is respected), usata.';
