-- 1.84.0: more files per field in the questionnaire (Dany, 14/11/2026: «la possibilità di caricare più foto o più file»).
-- allegato_prepara is the same as in 20261109100000_questionario.sql, copied word by word, with three numbers changed:
-- 10 files per field (was 3), 40 preparations a day (was 20), 300 MB declared a day (was 100).
create or replace function public.allegato_prepara(p_campo text, p_nome text, p_tipo text, p_byte integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := public.cliente_corrente();
  q public.onboarding_questionari;
  v_nome text := btrim(p_nome);
  v_id uuid := gen_random_uuid();
  v_percorso text;
  v_oggi integer;
  v_byte_oggi bigint;
begin
  if v_cliente is null then
    raise exception 'Accesso non valido: entra di nuovo.' using errcode = '42501';
  end if;

  perform public.onboarding_questionario_aperto(v_cliente, true);

  insert into public.onboarding_questionari (client_id) values (v_cliente) on conflict (client_id) do nothing;
  select * into q from public.onboarding_questionari x where x.client_id = v_cliente for update;
  if q.inviato_il is not null then
    raise exception 'Il questionario è già stato inviato.' using errcode = '22023';
  end if;

  if p_campo is null or p_campo not in ('attrezzatura', 'vecchia_scheda', 'piano_alimentare') then
    raise exception 'File non valido: puoi caricare foto (JPG, PNG, WebP) o PDF fino a 10 MB.' using errcode = '22023';
  end if;
  if p_tipo is null or p_tipo not in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
     or p_byte is null or p_byte not between 1 and 10485760
     or v_nome is null or char_length(v_nome) not between 1 and 120 or v_nome ~ '[/\\[:cntrl:]]' then
    raise exception 'File non valido: puoi caricare foto (JPG, PNG, WebP) o PDF fino a 10 MB.' using errcode = '22023';
  end if;

  if (select count(*) from public.onboarding_allegati a
      where a.client_id = v_cliente and a.campo = p_campo and a.stato in ('in_caricamento', 'caricato')) >= 10 then
    raise exception 'Hai già caricato 10 file qui: togline uno per aggiungerne un altro.' using errcode = '22023';
  end if;

  -- every row created today (Rome), in any state: the loop prepare, upload, remove does not fill the Storage.
  -- A row not confirmed counts the larger of what it declared and what is in the bucket for its path.
  select count(*), coalesce(sum(greatest(a.byte::bigint, coalesce((
           select (o.metadata ->> 'size')::bigint
           from storage.objects o
           where o.bucket_id = 'onboarding-allegati' and o.name = a.percorso), 0))), 0)
  into v_oggi, v_byte_oggi
  from public.onboarding_allegati a
  where a.client_id = v_cliente and (a.created_at at time zone 'Europe/Rome')::date = public.oggi();
  if v_oggi >= 40 or v_byte_oggi + p_byte > 314572800 then
    raise exception 'Hai caricato troppi file oggi: riprova domani.' using errcode = '22023';
  end if;

  v_percorso := v_cliente::text || '/' || v_id::text;
  insert into public.onboarding_allegati (id, client_id, campo, percorso, nome_file, tipo, byte)
  values (v_id, v_cliente, p_campo, v_percorso, v_nome, p_tipo, p_byte);

  return jsonb_build_object('id', v_id, 'percorso', v_percorso);
end;
$$;

comment on function public.allegato_prepara(text, text, text, integer) is
  'The client prepares the upload of a file of the questionnaire: the questionnaire not sent, the consent in force, a photo (JPG, PNG, WebP) or a PDF up to 10 MB, at most 10 files per field, at most 40 preparations and 300 MB declared per day (every row created today, in any state). Creates the row in_caricamento and returns { id, percorso }: the server signs the upload on that path only. Only the caller''s own client (else 42501).';

-- ---------------------------------------------------------------------------
-- The client does not wait for the team to go on (Dany, 14/11/2026: «finché noi non approviamo la call di
-- onboarding, lui rimane bloccato… intanto che aspetti che Ivan ti raggiunga per confermare la tua call, entra
-- nella community e presentati»). A step of the client opens when the steps before it are done, or sent to the
-- team (inviato): the community opens as soon as the call is booked. A step of the team (the call) still waits
-- for its steps done. The body of 20261109090200, with only the condition on the state changed.
-- ---------------------------------------------------------------------------
create or replace function public.onboarding_sblocca(p_client_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ultimo text := public.onboarding_ultimo_passo_servito();
  n integer;
begin
  update public.onboarding_passi s
  set stato = 'disponibile'
  from public.onboarding_passi_def d
  where s.client_id = p_client_id
    and s.stato = 'bloccato'
    and d.versione = s.versione
    and d.chiave = s.passo
    and d.sblocco = 'automatico'
    and (
      v_ultimo is null
      or d.ordine <= (select d2.ordine from public.onboarding_passi_def d2 where d2.versione = d.versione and d2.chiave = v_ultimo)
    )
    and not exists (
      select 1
      from unnest(d.sblocca_dopo) as k(chiave)
      where not exists (
        select 1 from public.onboarding_passi s2
        where s2.client_id = p_client_id and s2.passo = k.chiave
          and (s2.stato = 'fatto' or (d.attore = 'cliente' and s2.stato = 'inviato'))
      )
    );
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.onboarding_sblocca(uuid) is
  'Opens (disponibile) every locked step of the client with sblocco automatico whose steps of sblocca_dopo are all done (for a step of the client, also sent to the team: inviato) and that does not come after onboarding_ultimo_passo_servito(). Never a step of the team (obiettivo, programma). Returns how many it opened. No grants.';

revoke all on function public.onboarding_sblocca(uuid) from public, anon, authenticated;

-- a step that goes to inviato (the call booked) opens what comes after it for the client, at once
create function public.onboarding_passi_inviato_sblocca()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.onboarding_sblocca(new.client_id);
  return null;
end;
$$;

comment on function public.onboarding_passi_inviato_sblocca() is
  'After a step of the client goes to inviato, the unlock: the next step of the client opens without waiting for the team. No grants.';

revoke all on function public.onboarding_passi_inviato_sblocca() from public, anon, authenticated;

create trigger onboarding_passi_inviato_sblocca
  after update of stato on public.onboarding_passi
  for each row
  when (new.stato = 'inviato' and old.stato is distinct from 'inviato')
  execute function public.onboarding_passi_inviato_sblocca();

-- the clients who already booked and wait for the confirmation: the community opens now
do $$
declare
  r record;
begin
  for r in select distinct s.client_id from public.onboarding_passi s where s.passo = 'prenotazione' and s.stato = 'inviato' loop
    perform public.onboarding_sblocca(r.client_id);
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who receives an email when a client sends the questionnaire (Dany, 14/11/2026: «uno spazio nelle impostazioni
-- dove io posso mettere le mail di chi riceve il questionario di onboarding»). Only the addresses, at most 10;
-- the email says who sent it and links to the client's card, never an answer (they are health data).
-- ---------------------------------------------------------------------------
create function public.onboarding_email_valide(p text[])
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(cardinality(p), 0) <= 10
     and not exists (
       select 1 from unnest(coalesce(p, '{}'::text[])) as e(x)
       where e.x is null or char_length(e.x) > 320 or e.x <> lower(e.x)
          or e.x !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
     );
$$;

comment on function public.onboarding_email_valide(text[]) is
  'The addresses of onboarding_impostazioni.email_questionario: at most 10, lowercase, each one an email. Executable by authenticated: the check runs with the session that writes the settings.';

revoke all on function public.onboarding_email_valide(text[]) from public, anon;
-- the check of the column runs with the admin's session when he saves the settings
grant execute on function public.onboarding_email_valide(text[]) to authenticated;

alter table public.onboarding_impostazioni
  add column email_questionario text[] not null default '{}'
    check (public.onboarding_email_valide(email_questionario));

comment on column public.onboarding_impostazioni.email_questionario is
  'Who receives an email when a client sends the questionnaire (Impostazioni › Onboarding): at most 10 addresses. The email has the client''s name and the link to the card, never an answer.';

grant update (email_questionario) on public.onboarding_impostazioni to authenticated;

-- ---------------------------------------------------------------------------
-- The words of the booking and of the community as Dany asked them (14/11/2026): the calendar is in the page now,
-- and while the coach confirms the call the client enters the community and introduces himself. Only the blocks
-- still as the migration of B2 wrote them: a text Dany already changed stays his.
-- ---------------------------------------------------------------------------
update public.contenuti_blocchi
set corpo = E'Scegli qui sotto, nel calendario del tuo coach, il giorno e l''ora che ti vanno meglio, poi segna quello che hai scelto. Il tuo coach conferma la call e ti scrive sul tuo gruppo Telegram con il link di Google Meet. Intanto vai avanti: entra nella community e presentati.'
where versione_flusso = 1 and pagina = 'passo' and passo = 'prenotazione' and ordine = 1
  and corpo = E'Apri il calendario del tuo coach e scegli il giorno e l''ora che ti vanno meglio. Poi torna qui e scrivi quello che hai scelto: il tuo coach conferma la call e ti manda il link di Google Meet.';

update public.contenuti_blocchi
set corpo = E'Nella community su Telegram trovi gli altri allievi e le risposte alle domande utili a tutti. Tre passi: scrivi il tuo username di Telegram, chiedi l''accesso con «Entra nella community» e, quando sei dentro, presentati nel canale «Presentazioni».'
where versione_flusso = 1 and pagina = 'passo' and passo = 'community' and ordine = 1
  and corpo = E'Nella community su Telegram trovi gli altri allievi e le risposte alle domande utili a tutti. Tre passi: scrivi il tuo username di Telegram, chiedi l''accesso con «Entra nella community» e, quando sei dentro, presentati nel topic «Presentazioni».';

update public.contenuti_blocchi
set corpo = E'Ciao a tutti, sono [il tuo nome] e sono contento di iniziare questo percorso!\n\n**Da dove parto:** \n\n**Il mio obiettivo nei prossimi 6 mesi:** \n\n**Perché ho deciso di iniziare adesso:** '
where versione_flusso = 1 and pagina = 'passo' and passo = 'community' and ordine = 2
  and corpo = E'Ciao a tutti, sono [il tuo nome].\n\n**Chi sono:** \n\n**Da dove parto:** \n\n**Il mio obiettivo a 6 mesi:** \n\n**Perché adesso:** ';
