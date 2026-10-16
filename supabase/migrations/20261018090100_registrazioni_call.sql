-- The recording of a held call (1.37.0, CLAUDE.md section 31). Dany, 16/10/2026:
-- «per le call svolte il link della registrazione Fathom è obbligatorio, con la
-- via d'uscita Call non registrata»; the link goes in calls.link_registrazione,
-- and from it the app finds the recording through Fathom's API.
--
-- call_registrazioni: what the app knows of the recording behind that link
-- (the id on Fathom, how long it is, when it began) or that the call was not
-- recorded. Admin and the call's closer read it; the setter never does.
-- Written only by the functions below and by the server route that checked the
-- link with Fathom (service role). Never a transcript, a summary, a title or an
-- invitee.
--
-- Also here: the setter can no longer write the closer's columns that were
-- left out of calls_esito_solo_closer (performance, the product pitched, the
-- recording link): the policy of his own calls let a direct update through.

create table public.call_registrazioni (
  call_id uuid primary key references public.calls on delete cascade,
  stato text not null check (stato in ('collegata', 'non_registrata')),
  -- the link Fathom answered for, as the app normalised it; the recording below is valid only while calls.link_registrazione equals it
  link_verificato text check (link_verificato ~ '^https://\S+$' and char_length(link_verificato) <= 500),
  recording_id bigint check (recording_id > 0),
  durata_secondi integer check (durata_secondi between 0 and 21600),
  inizio_registrazione timestamptz,
  verificata_il timestamptz,
  created_by uuid references public.profiles on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint call_registrazioni_verifica check (recording_id is null or link_verificato is not null),
  constraint call_registrazioni_non_registrata check (stato = 'collegata' or (recording_id is null and link_verificato is null))
);
create index call_registrazioni_recording_idx on public.call_registrazioni (recording_id) where recording_id is not null;

create trigger call_registrazioni_set_updated_at before update on public.call_registrazioni
  for each row execute function public.set_updated_at();

alter table public.call_registrazioni enable row level security;
revoke all on public.call_registrazioni from anon;
revoke insert, update, delete, truncate on public.call_registrazioni from authenticated;

-- admin: every call; the closer: the calls assigned to him; nobody else (the setter never)
create policy call_registrazioni_lettura on public.call_registrazioni
  for select to authenticated
  using (
    public.is_admin()
    or (public.current_role() = 'closer'
        and exists (select 1 from public.calls c where c.id = call_registrazioni.call_id and c.closer_id = (select auth.uid())))
  );
create policy call_registrazioni_mai_da_oauth on public.call_registrazioni
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

comment on table public.call_registrazioni is
  'The recording of a held call: calls.link_registrazione is the link the closer pasted; this row says what Fathom answered for it (recording id, length, start) or that the call was not recorded. Admin and the call''s closer read it, the setter never. Written only by collega_registrazione, scollega_registrazione and the server route that asked Fathom (service role). No transcript, summary, title or invitee, ever.';

-- ---------------------------------------------------------------------------
-- A recording is valid only for the link it was found with
-- ---------------------------------------------------------------------------
create function public.calls_link_registrazione_cambiato()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.link_registrazione is not distinct from old.link_registrazione then
    return new;
  end if;
  if new.link_registrazione is null then
    delete from public.call_registrazioni r where r.call_id = new.id and r.stato = 'collegata';
  else
    -- another link: what was found for the old one is not about this call any more
    update public.call_registrazioni r
    set recording_id = null, durata_secondi = null, inizio_registrazione = null, verificata_il = null,
        link_verificato = null, stato = 'collegata'
    where r.call_id = new.id and r.link_verificato is distinct from new.link_registrazione;
  end if;
  return new;
end;
$$;
revoke all on function public.calls_link_registrazione_cambiato() from public, anon, authenticated;

create trigger calls_link_registrazione_cambiato
  after update of link_registrazione on public.calls
  for each row execute function public.calls_link_registrazione_cambiato();

-- ---------------------------------------------------------------------------
-- The closer's side of calls_esito_solo_closer: the setter does not write
-- performance, the product pitched or the recording link. The rest is copied
-- from 20261003090000_matita_no_show.sql as it was.
-- ---------------------------------------------------------------------------
create or replace function public.calls_esito_solo_closer()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ruolo public.app_role := public.current_role();
begin
  if tg_op = 'UPDATE'
     and v_ruolo = 'setter'
     and old.stato = 'no_show'
     and new.stato = 'no_show'
     and date_trunc('minute', new.programmata_il) is distinct from date_trunc('minute', old.programmata_il) then
    raise exception 'Il lead non si è presentato: la call resta un no show, così conta nello show rate. Se l’esito è sbagliato lo corregge il closer (o l’admin); per rivederlo fissa una nuova call'
      using errcode = '22023';
  end if;

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
    if new.stato is distinct from 'programmata'
       or new.esito is not null
       or new.qualificata is not null
       or new.obiezione_principale is not null
       or new.note_closer is not null
       or new.performance is not null
       or new.prodotto_proposto_id is not null
       or new.link_registrazione is not null then
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

  -- 1.37.0: how the call went, the product pitched and the recording are the closer's too
  if new.performance is distinct from old.performance
     or new.prodotto_proposto_id is distinct from old.prodotto_proposto_id
     or new.link_registrazione is distinct from old.link_registrazione then
    raise exception 'La performance, il prodotto proposto e la registrazione li scrive il closer della call'
      using errcode = '42501';
  end if;

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
  'The setter reads the outcome of his calls (stato, esito, qualificata, reason for not closing), the closer''s notes, the performance, the product pitched and the recording link, but never writes them: only the call''s closer and the admin do; he changes the day and time (programmata_il) only of a call still to be held, and reads why not in the words and codes of sposta_call (a held call or a no-show 22023, the other outcomes 42501). The closer reads the setter''s note and never writes it. Since 1.37.0 the setter''s direct updates of performance, prodotto_proposto_id and link_registrazione are refused too (42501).';

-- ---------------------------------------------------------------------------
-- The closer or the admin ties the call to its recording, or says it was not recorded
-- ---------------------------------------------------------------------------
-- p_scelta: {tipo: 'link', url} | {tipo: 'non_registrata'}. The link is written in
-- calls.link_registrazione; what Fathom said for it (if the server route already
-- checked it) stays only when it was found for this very link.
create function public.collega_registrazione(p_call_id uuid, p_scelta jsonb)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ruolo public.app_role := public.current_role();
  v_call public.calls;
  v_tipo text := p_scelta ->> 'tipo';
  v_url text := btrim(coalesce(p_scelta ->> 'url', ''));
  r public.call_registrazioni;
begin
  if v_ruolo is null or v_ruolo not in ('admin', 'closer') then
    raise exception 'La registrazione la collegano il closer della call e l’admin.' using errcode = '42501';
  end if;
  select * into v_call from public.calls c where c.id = p_call_id;
  if not found then
    raise exception 'Call non trovata.' using errcode = 'P0002';
  end if;
  if v_ruolo = 'closer' and v_call.closer_id is distinct from (select auth.uid()) then
    raise exception 'Questa call non è assegnata a te.' using errcode = '42501';
  end if;

  if v_tipo = 'link' then
    if v_url !~ '^https://\S+$' or char_length(v_url) > 500 then
      raise exception 'Incolla il link completo, con https://' using errcode = '22023';
    end if;
    update public.calls c set link_registrazione = v_url where c.id = p_call_id;
    insert into public.call_registrazioni as x (call_id, stato)
    values (p_call_id, 'collegata')
    on conflict (call_id) do update set stato = 'collegata';
  elsif v_tipo = 'non_registrata' then
    update public.calls c set link_registrazione = null where c.id = p_call_id;
    insert into public.call_registrazioni as x (call_id, stato)
    values (p_call_id, 'non_registrata')
    on conflict (call_id) do update
      set stato = 'non_registrata', link_verificato = null, recording_id = null, durata_secondi = null,
          inizio_registrazione = null, verificata_il = null;
  else
    raise exception 'Scelta non valida.' using errcode = '22023';
  end if;

  select * into r from public.call_registrazioni x where x.call_id = p_call_id;
  return jsonb_build_object('stato', r.stato, 'verificata', r.recording_id is not null);
end;
$$;

create function public.scollega_registrazione(p_call_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ruolo public.app_role := public.current_role();
  v_closer uuid;
begin
  if v_ruolo is null or v_ruolo not in ('admin', 'closer') then
    raise exception 'La registrazione la collegano il closer della call e l’admin.' using errcode = '42501';
  end if;
  select c.closer_id into v_closer from public.calls c where c.id = p_call_id;
  if not found then
    raise exception 'Call non trovata.' using errcode = 'P0002';
  end if;
  if v_ruolo = 'closer' and v_closer is distinct from (select auth.uid()) then
    raise exception 'Questa call non è assegnata a te.' using errcode = '42501';
  end if;
  update public.calls c set link_registrazione = null where c.id = p_call_id;
  delete from public.call_registrazioni r where r.call_id = p_call_id;
end;
$$;

-- What Fathom answered for a link, written by the server route after it asked
-- (service role). The call's own link is not touched.
create function public.fathom_salva_verifica(
  p_call_id uuid, p_url text, p_recording_id bigint, p_durata integer, p_inizio timestamptz)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.calls c where c.id = p_call_id) then
    raise exception 'Call non trovata.' using errcode = 'P0002';
  end if;
  insert into public.call_registrazioni as x
    (call_id, stato, link_verificato, recording_id, durata_secondi, inizio_registrazione, verificata_il, created_by)
  values (p_call_id, 'collegata', p_url, p_recording_id, least(greatest(p_durata, 0), 21600), p_inizio, now(), null)
  on conflict (call_id) do update
    set stato = 'collegata', link_verificato = excluded.link_verificato, recording_id = excluded.recording_id,
        durata_secondi = excluded.durata_secondi, inizio_registrazione = excluded.inizio_registrazione,
        verificata_il = now();
end;
$$;

revoke all on function public.collega_registrazione(uuid, jsonb) from public, anon;
grant execute on function public.collega_registrazione(uuid, jsonb) to authenticated;
revoke all on function public.scollega_registrazione(uuid) from public, anon;
grant execute on function public.scollega_registrazione(uuid) to authenticated;
revoke all on function public.fathom_salva_verifica(uuid, text, bigint, integer, timestamptz) from public, anon, authenticated;
grant execute on function public.fathom_salva_verifica(uuid, text, bigint, integer, timestamptz) to service_role;

comment on function public.collega_registrazione(uuid, jsonb) is
  'Admin and the call''s closer: ties the call to the link of its Fathom recording ({tipo: link, url}, written in calls.link_registrazione) or says it was not recorded ({tipo: non_registrata}). What the server route found on Fathom for that very link stays; for another link it is cleared.';
