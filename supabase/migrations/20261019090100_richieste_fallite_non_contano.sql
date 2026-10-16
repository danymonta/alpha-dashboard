-- A request that failed does not use up the day (1.37.1). Dany asked for the brief twice, both ended
-- «fallita» for an error of the app or of the provider, and «Gli spunti di oggi sono già stati chiesti»
-- stopped the third. The daily limits count only the requests that went well or are still going:
--   - the brief of the Marketing (2 a day): marketing_spunti_richiedi
--   - the analysis of a reel asked by hand (10 a day): marketing_analisi_richiedi
--   - the analysis of a call asked by hand (10 a day): a counter, given back when the analysis of
--     that day's request ends «fallita», whoever ends it (the step or the watchdog): a trigger.
-- The limits themselves, the roles and the messages are the ones of 20261016090200 and 20261018090400.

create or replace function public.marketing_analisi_richiedi(p_media_id text, p_rileggi boolean default false)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r public.instagram_contenuti;
  l public.instagram_letture;
  s public.marketing_lavori_stato;
  v_id uuid;
  v_inizio_oggi timestamptz := public.oggi()::timestamp at time zone 'Europe/Rome';
begin
  if public.current_role() is null or public.current_role() not in ('admin', 'marketing') then
    raise exception 'Le analisi le chiedono l’admin e il marketing.' using errcode = '42501';
  end if;
  select * into r from public.instagram_contenuti i where i.media_id = p_media_id;
  if not found then
    raise exception 'Questo reel non c’è tra quelli letti da Instagram.' using errcode = 'P0002';
  end if;
  if not (r.reel or r.media_type = 'VIDEO') then
    raise exception 'L’analisi di Claude per i caroselli arriva più avanti.' using errcode = '22023';
  end if;
  if r.eliminato_il is not null then
    raise exception 'Questo reel non è più su Instagram.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('alpha.marketing_lavori', 0));

  select * into s from public.marketing_lavori_stato x where x.id;
  if public.marketing_costo_mese() >= s.costo_max_mese then
    raise exception 'Le analisi di questo mese hanno raggiunto il limite di spesa: lo cambia l’admin in Impostazioni.'
      using errcode = '22023';
  end if;
  if exists (select 1 from public.marketing_analisi a where a.media_id = p_media_id and a.stato in ('in_coda', 'in_corso')) then
    raise exception 'Claude sta già analizzando questo reel.' using errcode = '22023';
  end if;
  if (select count(*) from public.marketing_analisi a
      where a.motivo = 'richiesta' and a.stato <> 'fallita' and a.created_at >= v_inizio_oggi) >= 10 then
    raise exception 'Le analisi di oggi sono finite: riprova domani.' using errcode = '22023';
  end if;

  select * into l from public.instagram_letture x where x.media_id = p_media_id for update;
  if not found then
    insert into public.instagram_letture (media_id, richiesta, stato, motivo, priorita)
    values (p_media_id, 'completa', 'in_coda', 'richiesta', 2);
  elsif l.stato <> 'in_corso' and (l.richiesta = 'trascrizione' or l.stato = 'fallita' or l.stato = 'in_coda'
                                   or coalesce(p_rileggi, false)) then
    update public.instagram_letture x
    set richiesta = 'completa', stato = 'in_coda', motivo = 'richiesta', priorita = 2,
        tentativi = 0, ripresa_usata = false, prossimo_il = null, errore = null,
        -- a speech that did not come out for a reason that can pass (Whisper failed or was off, the video was not
        -- there) is asked again: a transcript that came out, or a reel with no speech, is kept
        trascrizione_esito = case when x.trascrizione_esito in ('fallita', 'spenta', 'senza_video') then null else x.trascrizione_esito end
    where x.media_id = p_media_id;
  end if;

  insert into public.marketing_analisi (media_id, motivo, periodo_da, periodo_a)
  values (p_media_id, 'richiesta', public.oggi() - 28, public.oggi() - 1)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.marketing_spunti_richiedi()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.call_lavori_stato;
  v_id uuid;
  v_inizio_oggi timestamptz := public.oggi()::timestamp at time zone 'Europe/Rome';
begin
  if public.current_role() is null or public.current_role() not in ('admin', 'marketing') then
    raise exception 'Gli spunti li chiedono l’admin e il marketing.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('alpha.call_lavori', 0));
  select * into s from public.call_lavori_stato x where x.id;
  if public.call_costo_mese() >= s.costo_max_mese then
    raise exception 'Le analisi di questo mese hanno raggiunto il limite di spesa: lo cambia l’admin in Impostazioni.'
      using errcode = '22023';
  end if;
  if exists (select 1 from public.marketing_spunti m where m.stato in ('in_coda', 'in_corso')) then
    raise exception 'Claude sta già scrivendo gli spunti.' using errcode = '22023';
  end if;
  if (select count(*) from public.marketing_spunti m where m.motivo = 'richiesta' and m.stato <> 'fallita' and m.created_at >= v_inizio_oggi) >= 2 then
    raise exception 'Gli spunti di oggi sono già stati chiesti: riprova domani.' using errcode = '22023';
  end if;
  insert into public.marketing_spunti (motivo, periodo_da, periodo_a)
  values ('richiesta', public.oggi() - 28, public.oggi() - 1)
  returning id into v_id;
  return v_id;
end;
$$;

create function public.call_analisi_restituisci_richiesta()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  -- a request of a person, made today, that ends failed: the day gets it back (never below zero)
  if new.stato = 'fallita' and old.stato is distinct from 'fallita' and new.motivo = 'richiesta'
     and new.in_attesa_dal is not null and (new.in_attesa_dal at time zone 'Europe/Rome')::date = public.oggi() then
    update public.call_lavori_stato x
    set richieste_oggi = greatest(x.richieste_oggi - 1, 0)
    where x.id and x.giorno_richieste = public.oggi();
  end if;
  return new;
end;
$$;
revoke all on function public.call_analisi_restituisci_richiesta() from public, anon, authenticated, service_role;

create trigger call_analisi_restituisci_richiesta after update of stato on public.call_analisi
  for each row execute function public.call_analisi_restituisci_richiesta();

comment on function public.call_analisi_restituisci_richiesta() is
  'Trigger: a request of a person made today whose analysis ends failed gives its place back to the daily limit of 10.';
