-- Guided onboarding, release B1b (1.80.0): the questionnaire (docs/onboarding/rilascio-b.md, «Schema di B1b»).
--
-- * onboarding_questionari: the answers of the client (health data). The admin reads them; nobody writes them
--   from a session: only the client's functions below. Outside the backup (already named by B1a).
-- * onboarding_allegati and the private bucket onboarding-allegati: the files of the questionnaire. No policy
--   on storage.objects for this bucket: the server signs the upload after allegato_prepara and the read after
--   checking who asks.
-- * onboarding_risposte_valide(jsonb): the keys of the questionnaire, the questions of Dany's Google form
--   «Modulo Onboarding Coaching Online» (Dany, 12/11/2026), each of its type; onboarding_risposte_mancanti and
--   onboarding_risposte_complete: what the sending needs. The same rule as lib/validation/questionario.ts.
--   No rule on the age (Dany: «può avere anche 17 anni, non è rilevante»).
-- * The client's functions: questionario_cliente, questionario_salva, questionario_invia, allegato_prepara,
--   allegato_togli (security definer, granted to authenticated, the first line cliente_corrente());
--   allegato_conferma (service role only: the route reads the first bytes of the object first).
-- * The admin: onboarding_revoca_consenso (security invoker): the consent revoked, the answers deleted, the
--   files to delete, regole and questionario open again.
-- * onboarding_allegati_da_togliere (service role): the files the evening cron removes from Storage.
-- * onboarding_ultimo_passo_servito() is 'questionario' now, and every registered path is unlocked again.
-- * Kept for the whole relationship with the client (Dany, 12/11/2026: «i dati sulla salute conservali dove
--   serve»): deleted only with the client or at the revocation of the consent. The nightly cleanup marks only
--   the files left half uploaded.
--
-- The answers (jsonb, every key optional while it is filled in; null = not answered):
--   screen 1 «Chi sei»: nome_cognome, email (text), telefono, altezza_peso { altezza: integer cm 120-230,
--     peso: kg 35-250 with at most one decimal }, data_nascita ('YYYY-MM-DD', any valid date), occupazione
--   screen 2 «Allenamento»: storia_allenamento, giorni_settimana (integer 1-7), minuti_giorno
--     ('20_30', '30_40', '40_60', '60_90', '90_120': «20-30 minuti» … «90-120 minuti»), infortuni,
--     attrezzatura, massimali { piegamenti, trazioni, dip: integer 0-200 or 'non_lo_so' }, esercizi_difficolta,
--     importanza_tecnica
--   screen 3 «Stile di vita»: ore_sonno, livello_attivita ('sedentario', 'attivo', 'molto_attivo'),
--     organizzazione_giornata, seguito_alimentazione ('si', 'no'), conoscenza_alimentazione,
--     cattive_abitudini { scelte: distinct of 'fumo', 'alcol', 'motivazione', 'stimolanti', 'sonno';
--     altro: text } (optional: «Fumo», «Bere alcol», «Scarsa motivazione e autostima», «Abuso di stimolanti
--     (caffeina, redbull, monster)», «Dormire meno di 6 ore a notte», and «altrimenti scrivi tu…»)
--   screen 4 «Obiettivi»: obiettivo_principale, perche_noi, obiettivi_3_6_mesi, successo, pronto ('si', 'no'),
--     note (optional)
--   Every text: a string of at most 2,000 characters (the email at most 320, and a valid address when it is
--   not empty). Answered = testo_scritto() for a text, every part present for altezza_peso and massimali.

-- ---------------------------------------------------------------------------
-- 1. The rule of the answers
-- ---------------------------------------------------------------------------
create function public.onboarding_risposte_valide(p_risposte jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  k text;
  v jsonb;
  w jsonb;
  s text;
  n numeric;
  v_chiave text;
begin
  if p_risposte is null or jsonb_typeof(p_risposte) <> 'object' then
    return false;
  end if;

  for k, v in select e.key, e.value from jsonb_each(p_risposte) as e loop
    if jsonb_typeof(v) = 'null' then
      continue;
    end if;

    if k in ('nome_cognome', 'telefono', 'occupazione', 'storia_allenamento', 'infortuni', 'attrezzatura',
             'esercizi_difficolta', 'importanza_tecnica', 'ore_sonno', 'organizzazione_giornata',
             'conoscenza_alimentazione', 'obiettivo_principale', 'perche_noi', 'obiettivi_3_6_mesi', 'successo',
             'note') then
      if jsonb_typeof(v) <> 'string' or char_length(v #>> '{}') > 2000 then
        return false;
      end if;

    elsif k = 'email' then
      if jsonb_typeof(v) <> 'string' then
        return false;
      end if;
      s := btrim(v #>> '{}');
      if char_length(v #>> '{}') > 320 or (s <> '' and s !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$') then
        return false;
      end if;

    elsif k = 'data_nascita' then
      if jsonb_typeof(v) <> 'string' then
        return false;
      end if;
      s := v #>> '{}';
      if s <> '' and (s !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or not pg_input_is_valid(s, 'date')) then
        return false;
      end if;

    elsif k = 'altezza_peso' then
      if jsonb_typeof(v) <> 'object' then
        return false;
      end if;
      for v_chiave, w in select e.key, e.value from jsonb_each(v) as e loop
        if jsonb_typeof(w) = 'null' then
          continue;
        end if;
        if jsonb_typeof(w) <> 'number' then
          return false;
        end if;
        n := (w #>> '{}')::numeric;
        if v_chiave = 'altezza' then
          if n <> trunc(n) or n not between 120 and 230 then
            return false;
          end if;
        elsif v_chiave = 'peso' then
          if n * 10 <> trunc(n * 10) or n not between 35 and 250 then
            return false;
          end if;
        else
          return false;
        end if;
      end loop;

    elsif k = 'giorni_settimana' then
      if jsonb_typeof(v) <> 'number' then
        return false;
      end if;
      n := (v #>> '{}')::numeric;
      if n <> trunc(n) or n not between 1 and 7 then
        return false;
      end if;

    elsif k = 'minuti_giorno' then
      if jsonb_typeof(v) <> 'string' or (v #>> '{}') not in ('20_30', '30_40', '40_60', '60_90', '90_120') then
        return false;
      end if;

    elsif k = 'massimali' then
      if jsonb_typeof(v) <> 'object' then
        return false;
      end if;
      for v_chiave, w in select e.key, e.value from jsonb_each(v) as e loop
        if v_chiave not in ('piegamenti', 'trazioni', 'dip') then
          return false;
        end if;
        if jsonb_typeof(w) = 'null' then
          continue;
        end if;
        if jsonb_typeof(w) = 'string' then
          if (w #>> '{}') <> 'non_lo_so' then
            return false;
          end if;
        elsif jsonb_typeof(w) = 'number' then
          n := (w #>> '{}')::numeric;
          if n <> trunc(n) or n not between 0 and 200 then
            return false;
          end if;
        else
          return false;
        end if;
      end loop;

    elsif k = 'livello_attivita' then
      if jsonb_typeof(v) <> 'string' or (v #>> '{}') not in ('sedentario', 'attivo', 'molto_attivo') then
        return false;
      end if;

    elsif k in ('seguito_alimentazione', 'pronto') then
      if jsonb_typeof(v) <> 'string' or (v #>> '{}') not in ('si', 'no') then
        return false;
      end if;

    elsif k = 'cattive_abitudini' then
      if jsonb_typeof(v) <> 'object' then
        return false;
      end if;
      for v_chiave, w in select e.key, e.value from jsonb_each(v) as e loop
        if jsonb_typeof(w) = 'null' then
          continue;
        end if;
        if v_chiave = 'scelte' then
          if jsonb_typeof(w) <> 'array' or jsonb_array_length(w) > 5
             or exists (
               select 1 from jsonb_array_elements(w) as x(el)
               where jsonb_typeof(x.el) <> 'string'
                  or (x.el #>> '{}') not in ('fumo', 'alcol', 'motivazione', 'stimolanti', 'sonno')
             )
             or (select count(distinct x.el) from jsonb_array_elements(w) as x(el)) <> jsonb_array_length(w) then
            return false;
          end if;
        elsif v_chiave = 'altro' then
          if jsonb_typeof(w) <> 'string' or char_length(w #>> '{}') > 2000 then
            return false;
          end if;
        else
          return false;
        end if;
      end loop;

    else
      -- a key that is not a question of the form
      return false;
    end if;
  end loop;

  return true;
end;
$$;

comment on function public.onboarding_risposte_valide(jsonb) is
  'True when the answers of the questionnaire have only the keys of the questions of Dany''s Google form, each of its type (texts at most 2,000 characters, the options of the form, the numbers in their ranges; null = not answered). No rule on the age. The same rule as lib/validation/questionario.ts; the check of onboarding_questionari.';

revoke all on function public.onboarding_risposte_valide(jsonb) from public, anon, authenticated;

-- The required questions not answered, in the order of the questionnaire (the page goes to the first)
create function public.onboarding_risposte_mancanti(p_risposte jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(q.chiave order by q.ordine), '{}')
  from (values
    (1, 'nome_cognome', 'testo'), (2, 'email', 'testo'), (3, 'telefono', 'testo'), (4, 'altezza_peso', 'altezza_peso'),
    (5, 'data_nascita', 'testo'), (6, 'occupazione', 'testo'),
    (7, 'storia_allenamento', 'testo'), (8, 'giorni_settimana', 'valore'), (9, 'minuti_giorno', 'valore'),
    (10, 'infortuni', 'testo'), (11, 'attrezzatura', 'testo'), (12, 'massimali', 'massimali'),
    (13, 'esercizi_difficolta', 'testo'), (14, 'importanza_tecnica', 'testo'),
    (15, 'ore_sonno', 'testo'), (16, 'livello_attivita', 'valore'), (17, 'organizzazione_giornata', 'testo'),
    (18, 'seguito_alimentazione', 'valore'), (19, 'conoscenza_alimentazione', 'testo'),
    (20, 'obiettivo_principale', 'testo'), (21, 'perche_noi', 'testo'), (22, 'obiettivi_3_6_mesi', 'testo'),
    (23, 'successo', 'testo'), (24, 'pronto', 'valore')
  ) as q(ordine, chiave, tipo)
  where not coalesce(case q.tipo
    when 'testo' then
      jsonb_typeof(coalesce(p_risposte, '{}'::jsonb) -> q.chiave) = 'string'
      and public.testo_scritto(coalesce(p_risposte, '{}'::jsonb) ->> q.chiave)
    when 'valore' then
      jsonb_typeof(coalesce(p_risposte, '{}'::jsonb) -> q.chiave) in ('string', 'number')
      and coalesce(p_risposte, '{}'::jsonb) ->> q.chiave <> ''
    when 'altezza_peso' then
      jsonb_typeof(coalesce(p_risposte, '{}'::jsonb) -> q.chiave -> 'altezza') = 'number'
      and jsonb_typeof(coalesce(p_risposte, '{}'::jsonb) -> q.chiave -> 'peso') = 'number'
    when 'massimali' then
      jsonb_typeof(coalesce(p_risposte, '{}'::jsonb) -> q.chiave -> 'piegamenti') in ('number', 'string')
      and jsonb_typeof(coalesce(p_risposte, '{}'::jsonb) -> q.chiave -> 'trazioni') in ('number', 'string')
      and jsonb_typeof(coalesce(p_risposte, '{}'::jsonb) -> q.chiave -> 'dip') in ('number', 'string')
  end, false);
$$;

comment on function public.onboarding_risposte_mancanti(jsonb) is
  'The keys of the required questions not answered yet, in the order of the questionnaire (cattive_abitudini and note are optional). A text is answered when testo_scritto() is true, altezza_peso with both parts, massimali with all three.';

revoke all on function public.onboarding_risposte_mancanti(jsonb) from public, anon, authenticated;

create function public.onboarding_risposte_complete(p_risposte jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select public.onboarding_risposte_valide(p_risposte)
     and cardinality(public.onboarding_risposte_mancanti(p_risposte)) = 0;
$$;

comment on function public.onboarding_risposte_complete(jsonb) is
  'The answers can be sent: valid, and every required question answered (the same rule as the Zod schema of the sending).';

revoke all on function public.onboarding_risposte_complete(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The answers and the files
-- ---------------------------------------------------------------------------
create table public.onboarding_questionari (
  client_id uuid primary key references public.clients (id) on delete cascade,
  risposte jsonb not null default '{}'::jsonb check (public.onboarding_risposte_valide(risposte)),
  -- goes up at every save: a save writes only over the version it read
  versione integer not null default 0 check (versione >= 0),
  schermata integer not null default 1 check (schermata between 1 and 4),
  inviato_il timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.onboarding_questionari is
  'The answers of a client''s onboarding questionnaire (1.80.0): health data, with the consent of the client. The admin reads them; written only by the client''s functions; outside the backup; kept as long as the client exists, deleted with him or at the revocation of the consent.';

create trigger onboarding_questionari_set_updated_at before update on public.onboarding_questionari
  for each row execute function public.set_updated_at();

alter table public.onboarding_questionari enable row level security;

create policy onboarding_questionari_admin_lettura on public.onboarding_questionari
  for select to authenticated using ((select public.is_admin()));
create policy onboarding_questionari_mai_da_oauth on public.onboarding_questionari
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

revoke all on public.onboarding_questionari from anon;
revoke all on public.onboarding_questionari from authenticated;
grant select on public.onboarding_questionari to authenticated;

create table public.onboarding_allegati (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  campo text not null check (campo in ('attrezzatura', 'vecchia_scheda', 'piano_alimentare')),
  -- '<client_id>/<id>' in the bucket onboarding-allegati
  percorso text not null unique,
  nome_file text not null check (
    char_length(btrim(nome_file)) between 1 and 120
    and nome_file !~ '[/\\[:cntrl:]]'
  ),
  tipo text not null check (tipo in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  byte integer not null check (byte between 1 and 10485760),
  stato text not null default 'in_caricamento' check (stato in ('in_caricamento', 'caricato', 'da_cancellare')),
  caricato_il timestamptz,
  created_at timestamptz not null default now(),
  constraint onboarding_allegati_percorso check (percorso = client_id::text || '/' || id::text),
  constraint onboarding_allegati_caricato check ((stato = 'caricato') <= (caricato_il is not null))
);
create index onboarding_allegati_client_idx on public.onboarding_allegati (client_id, campo);
create index onboarding_allegati_da_cancellare_idx on public.onboarding_allegati (stato) where stato = 'da_cancellare';

comment on table public.onboarding_allegati is
  'The files of the questionnaire (photos of the equipment, the old programme, the meal plan) in the private bucket onboarding-allegati. The admin reads them; written only by the client''s functions and allegato_conferma; outside the backup. da_cancellare: removed from Storage by the evening cron, then the row.';

alter table public.onboarding_allegati enable row level security;

create policy onboarding_allegati_admin_lettura on public.onboarding_allegati
  for select to authenticated using ((select public.is_admin()));
create policy onboarding_allegati_mai_da_oauth on public.onboarding_allegati
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

revoke all on public.onboarding_allegati from anon;
revoke all on public.onboarding_allegati from authenticated;
grant select on public.onboarding_allegati to authenticated;

-- The private bucket. No policy on storage.objects for it: every read and write is a URL the server signs.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('onboarding-allegati', 'onboarding-allegati', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------------
-- 3. The content of the step (the CMS)
-- ---------------------------------------------------------------------------
insert into public.contenuti_blocchi (versione_flusso, pagina, passo, ordine, tipo, titolo, corpo, obbligatorio) values
  (1, 'passo', 'questionario', 1, 'testo', 'Il questionario',
   E'Queste domande servono al tuo coach per costruire il programma su di te. Rispondi con calma: si salva tutto da solo e puoi riprendere anche da un altro dispositivo.\n\nLe foto della tua attrezzatura, la vecchia scheda e il piano alimentare li carichi qui, insieme alle risposte.',
   false),
  (1, 'passo', 'questionario', 2, 'avviso', null,
   'Niente foto del fisico qui: quelle vanno su Coach Plus.',
   false);

-- ---------------------------------------------------------------------------
-- 4. How far the path goes in this release: the questionnaire
-- ---------------------------------------------------------------------------
create or replace function public.onboarding_ultimo_passo_servito()
returns text
language sql
immutable
set search_path = ''
as $$
  select 'questionario'::text;
$$;

comment on function public.onboarding_ultimo_passo_servito() is
  'The last step this release serves to the client: ''regole'' in B1a, ''questionario'' in B1b, null (all) in B2. onboarding_sblocca never opens a step after it.';

revoke all on function public.onboarding_ultimo_passo_servito() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. The client's functions
-- ---------------------------------------------------------------------------
-- The living consent of the client to the version in force of the health text
create function public.onboarding_consenso_salute(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.clienti_consensi c
    join public.clienti_consensi_testi t on t.tipo = c.tipo and t.versione = c.versione and t.in_vigore
    where c.client_id = p_client_id and c.tipo = 'salute' and c.revocato_il is null
  );
$$;
revoke all on function public.onboarding_consenso_salute(uuid) from public, anon, authenticated;

-- The step of the questionnaire, locked, open for the client (22023 otherwise); with p_consenso also the
-- consent in force. Returns its state.
create function public.onboarding_questionario_aperto(p_client_id uuid, p_consenso boolean)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_stato text;
begin
  select s.stato into v_stato
  from public.onboarding_passi s
  where s.client_id = p_client_id and s.passo = 'questionario'
  for update;

  if v_stato = 'fatto' and exists (
    select 1 from public.onboarding_questionari q where q.client_id = p_client_id and q.inviato_il is not null
  ) then
    raise exception 'Il questionario è già stato inviato.' using errcode = '22023';
  end if;
  if v_stato is null or v_stato not in ('disponibile', 'in_corso') then
    raise exception 'Questo passo non è ancora disponibile.' using errcode = '22023';
  end if;
  if p_consenso and not public.onboarding_consenso_salute(p_client_id) then
    raise exception 'Serve il consenso al trattamento dei dati sulla salute per compilare il questionario.'
      using errcode = '22023';
  end if;
  return v_stato;
end;
$$;
revoke all on function public.onboarding_questionario_aperto(uuid, boolean) from public, anon, authenticated;

-- The files of a client the page shows (uploaded ones only)
create function public.onboarding_allegati_cliente(p_client_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', a.id,
           'campo', a.campo,
           'nome_file', a.nome_file,
           'tipo', a.tipo,
           'byte', a.byte
         ) order by a.campo, a.created_at), '[]'::jsonb)
  from public.onboarding_allegati a
  where a.client_id = p_client_id and a.stato = 'caricato';
$$;
revoke all on function public.onboarding_allegati_cliente(uuid) from public, anon, authenticated;

create function public.questionario_cliente()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := public.cliente_corrente();
  v_stato text;
  q public.onboarding_questionari;
  v_risposte jsonb;
begin
  if v_cliente is null then
    raise exception 'Accesso non valido: entra di nuovo.' using errcode = '42501';
  end if;

  select s.stato into v_stato
  from public.onboarding_passi s
  where s.client_id = v_cliente and s.passo = 'questionario';
  select * into q from public.onboarding_questionari x where x.client_id = v_cliente;

  if v_stato = 'fatto' and q.inviato_il is not null then
    raise exception 'Il questionario è già stato inviato.' using errcode = '22023';
  end if;
  if v_stato is null or v_stato not in ('disponibile', 'in_corso') then
    raise exception 'Questo passo non è ancora disponibile.' using errcode = '22023';
  end if;

  if q.client_id is null then
    -- nothing saved yet: name and email from the client's card, already written (they can be corrected)
    select jsonb_strip_nulls(jsonb_build_object(
             'nome_cognome', nullif(btrim(concat_ws(' ', btrim(c.nome), btrim(c.cognome))), ''),
             'email', nullif(lower(btrim(c.email)), '')
           ))
      into v_risposte
    from public.clients c where c.id = v_cliente;
    return jsonb_build_object(
      'risposte', coalesce(v_risposte, '{}'::jsonb),
      'versione', 0,
      'schermata', 1,
      'inviato_il', null,
      'allegati', public.onboarding_allegati_cliente(v_cliente)
    );
  end if;

  return jsonb_build_object(
    'risposte', q.risposte,
    'versione', q.versione,
    'schermata', q.schermata,
    'inviato_il', q.inviato_il,
    'allegati', public.onboarding_allegati_cliente(v_cliente)
  );
end;
$$;

comment on function public.questionario_cliente() is
  'The client''s questionnaire: { risposte, versione, schermata, inviato_il, allegati [{ id, campo, nome_file, tipo, byte }] (uploaded only) }. Nothing saved yet: name and email from the client''s card, versione 0. The step questionario available or in progress (22023 otherwise). Only the caller''s own client (cliente_corrente(), else 42501).';

revoke all on function public.questionario_cliente() from public, anon;
grant execute on function public.questionario_cliente() to authenticated;

create function public.questionario_salva(p_risposte jsonb, p_schermata integer, p_versione integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := public.cliente_corrente();
  v_stato text;
  q public.onboarding_questionari;
begin
  if v_cliente is null then
    raise exception 'Accesso non valido: entra di nuovo.' using errcode = '42501';
  end if;

  v_stato := public.onboarding_questionario_aperto(v_cliente, true);

  insert into public.onboarding_questionari (client_id) values (v_cliente) on conflict (client_id) do nothing;
  select * into q from public.onboarding_questionari x where x.client_id = v_cliente for update;

  if q.inviato_il is not null then
    raise exception 'Il questionario è già stato inviato.' using errcode = '22023';
  end if;
  -- another device saved meanwhile: nothing written, the answers as they are now
  if p_versione is null or p_versione <> q.versione then
    return jsonb_build_object('esito', 'cambiato', 'risposte', q.risposte, 'versione', q.versione);
  end if;
  if p_schermata is null or p_schermata not between 1 and 4 then
    raise exception 'Schermata non valida' using errcode = '22023';
  end if;
  if not public.onboarding_risposte_valide(p_risposte) then
    raise exception 'Alcune risposte non sono valide: controllale e riprova.' using errcode = '22023';
  end if;

  update public.onboarding_questionari x
  set risposte = p_risposte, schermata = p_schermata, versione = x.versione + 1
  where x.client_id = v_cliente
  returning * into q;

  -- the first save starts the step
  if v_stato = 'disponibile' then
    update public.onboarding_passi s
    set stato = 'in_corso', iniziato_il = coalesce(s.iniziato_il, now())
    where s.client_id = v_cliente and s.passo = 'questionario';
  end if;

  return jsonb_build_object('esito', 'salvato', 'versione', q.versione);
end;
$$;

comment on function public.questionario_salva(jsonb, integer, integer) is
  'The client saves the questionnaire (all the answers, the screen he is on) only over the version he read: with another version nothing is written and the answer is { esito: cambiato, risposte, versione }; else { esito: salvato, versione }. The consent to the health data in force (22023 otherwise), not sent yet, valid answers. The first save starts the step. Only the caller''s own client (else 42501).';

revoke all on function public.questionario_salva(jsonb, integer, integer) from public, anon;
grant execute on function public.questionario_salva(jsonb, integer, integer) to authenticated;

create function public.questionario_invia(p_versione integer)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := public.cliente_corrente();
  q public.onboarding_questionari;
  v_mancanti text[];
  v_nome text;
begin
  if v_cliente is null then
    raise exception 'Accesso non valido: entra di nuovo.' using errcode = '42501';
  end if;

  perform public.onboarding_questionario_aperto(v_cliente, true);

  select * into q from public.onboarding_questionari x where x.client_id = v_cliente for update;
  if q.inviato_il is not null then
    raise exception 'Il questionario è già stato inviato.' using errcode = '22023';
  end if;
  if q.client_id is null or p_versione is null or p_versione <> q.versione then
    return jsonb_build_object('esito', 'cambiato', 'risposte', coalesce(q.risposte, '{}'::jsonb),
                              'versione', coalesce(q.versione, 0));
  end if;

  v_mancanti := public.onboarding_risposte_mancanti(q.risposte);
  if cardinality(v_mancanti) > 0 or not public.onboarding_risposte_complete(q.risposte) then
    raise exception 'Mancano delle risposte: completa le parti segnate.'
      using errcode = '22023', detail = to_jsonb(v_mancanti)::text;
  end if;

  update public.onboarding_questionari x set inviato_il = now() where x.client_id = v_cliente returning * into q;

  update public.onboarding_passi s
  set stato = 'fatto',
      iniziato_il = coalesce(s.iniziato_il, now()),
      inviato_il = now(),
      completato_il = now()
  where s.client_id = v_cliente and s.passo = 'questionario';

  -- the log says the step, never an answer
  insert into public.onboarding_eventi (client_id, tipo, attore, dettagli)
  values (v_cliente, 'passo_completato', 'cliente', jsonb_build_object('passo', 'questionario'));

  perform public.onboarding_sblocca(v_cliente);

  v_nome := btrim(concat_ws(' ', (select btrim(c.nome) from public.clients c where c.id = v_cliente),
                                 (select btrim(c.cognome) from public.clients c where c.id = v_cliente)));
  begin
    perform public.notifiche_avviso_admin(
      'onboarding_cliente',
      left('Questionario inviato da ' || coalesce(nullif(v_nome, ''), 'un cliente'), 300),
      'Le risposte sono nella sua scheda di onboarding.',
      null,
      '/onboarding/' || v_cliente::text,
      'onboarding/' || v_cliente::text || '/questionario/' || floor(extract(epoch from q.inviato_il))::bigint::text
    );
  exception when others then
    raise warning 'Onboarding: notifica del questionario del cliente % non scritta: %', v_cliente, sqlerrm;
  end;

  return jsonb_build_object('esito', 'inviato', 'versione', q.versione, 'inviato_il', q.inviato_il);
end;
$$;

comment on function public.questionario_invia(integer) is
  'The client sends the questionnaire, at the version he read (another version: { esito: cambiato, risposte, versione }). Every required answer (22023 «Mancano delle risposte: completa le parti segnate.» with the missing keys, in order, as a JSON array in the detail of the error). Then inviato_il, the step done, the unlock, the log (never an answer) and the notification to the admins. Returns { esito: inviato, versione, inviato_il }. Only the caller''s own client (else 42501).';

revoke all on function public.questionario_invia(integer) from public, anon;
grant execute on function public.questionario_invia(integer) to authenticated;

create function public.allegato_prepara(p_campo text, p_nome text, p_tipo text, p_byte integer)
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
      where a.client_id = v_cliente and a.campo = p_campo and a.stato in ('in_caricamento', 'caricato')) >= 3 then
    raise exception 'Hai già caricato 3 file qui: togline uno per aggiungerne un altro.' using errcode = '22023';
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
  if v_oggi >= 20 or v_byte_oggi + p_byte > 104857600 then
    raise exception 'Hai caricato troppi file oggi: riprova domani.' using errcode = '22023';
  end if;

  v_percorso := v_cliente::text || '/' || v_id::text;
  insert into public.onboarding_allegati (id, client_id, campo, percorso, nome_file, tipo, byte)
  values (v_id, v_cliente, p_campo, v_percorso, v_nome, p_tipo, p_byte);

  return jsonb_build_object('id', v_id, 'percorso', v_percorso);
end;
$$;

comment on function public.allegato_prepara(text, text, text, integer) is
  'The client prepares the upload of a file of the questionnaire: the questionnaire not sent, the consent in force, a photo (JPG, PNG, WebP) or a PDF up to 10 MB, at most 3 files per field, at most 20 preparations and 100 MB declared per day (every row created today, in any state). Creates the row in_caricamento and returns { id, percorso }: the server signs the upload on that path only. Only the caller''s own client (else 42501).';

revoke all on function public.allegato_prepara(text, text, text, integer) from public, anon;
grant execute on function public.allegato_prepara(text, text, text, integer) to authenticated;

create function public.allegato_togli(p_id uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_cliente uuid := public.cliente_corrente();
  n integer;
begin
  if v_cliente is null then
    raise exception 'Accesso non valido: entra di nuovo.' using errcode = '42501';
  end if;

  perform public.onboarding_questionario_aperto(v_cliente, false);

  if exists (select 1 from public.onboarding_questionari q where q.client_id = v_cliente and q.inviato_il is not null) then
    raise exception 'Il questionario è già stato inviato.' using errcode = '22023';
  end if;

  update public.onboarding_allegati a
  set stato = 'da_cancellare'
  where a.id = p_id and a.client_id = v_cliente and a.stato in ('in_caricamento', 'caricato');
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'Questo file non c''è più.' using errcode = '22023';
  end if;

  return jsonb_build_object('id', p_id, 'percorso', v_cliente::text || '/' || p_id::text,
                            'allegati', public.onboarding_allegati_cliente(v_cliente));
end;
$$;

comment on function public.allegato_togli(uuid) is
  'The client removes a file of the questionnaire before sending it: the row becomes da_cancellare (the server action removes the object now, the evening cron again). Returns { id, percorso, allegati }. Only the caller''s own client (else 42501).';

revoke all on function public.allegato_togli(uuid) from public, anon;
grant execute on function public.allegato_togli(uuid) to authenticated;

-- Called by the route after it verified the client's session (requireCliente gives p_client_id) and read the
-- first 16 bytes of the object: the type they say must be the one of the row. A refusal is an answer, not an
-- error, so that the row stays da_cancellare.
create function public.allegato_conferma(p_client_id uuid, p_id uuid, p_tipo_letto text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.onboarding_allegati;
  v_byte bigint;
  v_mime text;
begin
  select * into a
  from public.onboarding_allegati x
  where x.id = p_id and x.client_id = p_client_id and x.stato = 'in_caricamento'
  for update;
  if not found then
    raise exception 'Il file non è arrivato: riprova.' using errcode = '22023';
  end if;

  -- the questionnaire sent, or the consent revoked, in the meantime: the file is no longer welcome
  if exists (select 1 from public.onboarding_questionari q where q.client_id = p_client_id and q.inviato_il is not null)
     or not public.onboarding_consenso_salute(p_client_id) then
    update public.onboarding_allegati x set stato = 'da_cancellare' where x.id = a.id;
    return jsonb_build_object('esito', 'chiuso', 'messaggio', 'Il questionario è già stato inviato.');
  end if;

  select (o.metadata ->> 'size')::bigint, o.metadata ->> 'mimetype' into v_byte, v_mime
  from storage.objects o
  where o.bucket_id = 'onboarding-allegati' and o.name = a.percorso;

  if v_byte is null or v_byte not between 1 and 10485760 then
    update public.onboarding_allegati x set stato = 'da_cancellare' where x.id = a.id;
    return jsonb_build_object('esito', 'non_arrivato', 'messaggio', 'Il file non è arrivato: riprova.');
  end if;
  -- the size declared, the type read from the first bytes and the Content-Type of the upload (the one
  -- the storage serves the file with) all equal to the row: a polyglot declared as a photo and served
  -- as a PDF, or a bigger file on a small declaration, never becomes a file of the questionnaire
  if v_byte <> a.byte or p_tipo_letto is null or p_tipo_letto <> a.tipo or v_mime is distinct from a.tipo then
    update public.onboarding_allegati x set stato = 'da_cancellare' where x.id = a.id;
    return jsonb_build_object('esito', 'non_valido',
      'messaggio', 'File non valido: puoi caricare foto (JPG, PNG, WebP) o PDF fino a 10 MB.');
  end if;

  update public.onboarding_allegati x
  set stato = 'caricato', caricato_il = now()
  where x.id = a.id
  returning * into a;

  return jsonb_build_object('esito', 'caricato', 'id', a.id, 'campo', a.campo, 'nome_file', a.nome_file,
                            'tipo', a.tipo, 'byte', a.byte);
end;
$$;

comment on function public.allegato_conferma(uuid, uuid, text) is
  'The route confirms an upload: the row of that client in_caricamento (22023 «Il file non è arrivato: riprova.» otherwise), the questionnaire not sent and the consent in force, the object in the bucket with the size the row declared, the type read from its first bytes and the Content-Type of the upload equal to the one of the row. Returns { esito: caricato, id, campo, nome_file, tipo, byte }, or { esito: chiuso | non_arrivato | non_valido, messaggio } with the row da_cancellare. Service role only.';

revoke all on function public.allegato_conferma(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.allegato_conferma(uuid, uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- 6. The admin registers the revocation of the consent to the health data
-- ---------------------------------------------------------------------------
-- The admin updates the revocation of a consent only from onboarding_revoca_consenso
create policy clienti_consensi_admin_revoca on public.clienti_consensi
  for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
grant update (revocato_il, revocato_da) on public.clienti_consensi to authenticated;

-- Security invoker on purpose: current_user is the session's role only for a direct update
create function public.clienti_consensi_coerenza()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user = 'authenticated' then
    if coalesce(current_setting('alpha.onboarding_consenso', true), '') <> old.client_id::text then
      raise exception 'Un consenso si revoca solo con «Registra la revoca».' using errcode = '42501';
    end if;
    if old.revocato_il is not null then
      raise exception 'Questo consenso è già revocato.' using errcode = '22023';
    end if;
    new.revocato_il := now();
    new.revocato_da := (select auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function public.clienti_consensi_coerenza() from public, anon, authenticated;

create trigger clienti_consensi_coerenza before update on public.clienti_consensi
  for each row execute function public.clienti_consensi_coerenza();

-- What a revocation of the health consent (revocato_da: an admin, not a newer version) takes away
create function public.clienti_consensi_revocato()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_versione integer;
begin
  if not (old.revocato_il is null and new.revocato_il is not null and new.revocato_da is not null
          and new.tipo = 'salute') then
    return null;
  end if;

  -- the answers go; the files are to delete (the server action removes them now, the evening cron the rest)
  delete from public.onboarding_questionari q where q.client_id = new.client_id;
  -- the names of the files go too (a name can say something about health): the rows wait for the cron
  update public.onboarding_allegati a set stato = 'da_cancellare', nome_file = 'file tolto'
  where a.client_id = new.client_id;

  -- regole and questionario open again; what depends on them and is not done is locked again
  select p.versione_flusso into v_versione from public.onboarding_percorsi p where p.client_id = new.client_id;

  update public.onboarding_passi s
  set stato = 'bloccato'
  where s.client_id = new.client_id
    and s.stato <> 'fatto'
    and s.passo in (
      with recursive dipende (chiave) as (
        select d.chiave from public.onboarding_passi_def d
        where d.versione = v_versione and d.sblocca_dopo && array['regole', 'questionario']
        union
        select d.chiave from public.onboarding_passi_def d
        join dipende x on x.chiave = any (d.sblocca_dopo)
        where d.versione = v_versione
      )
      select x.chiave from dipende x where x.chiave not in ('regole', 'questionario')
    );

  update public.onboarding_passi s
  set stato = 'disponibile', iniziato_il = null, inviato_il = null, completato_il = null
  where s.client_id = new.client_id and s.passo in ('regole', 'questionario');

  return null;
end;
$$;
revoke all on function public.clienti_consensi_revocato() from public, anon, authenticated;

create trigger clienti_consensi_revocato after update on public.clienti_consensi
  for each row execute function public.clienti_consensi_revocato();

create function public.onboarding_revoca_consenso(p_client_id uuid, p_tipo text, p_motivo text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_consenso uuid;
  v_percorsi jsonb;
begin
  if public.da_client_oauth() or not public.is_admin() then
    raise exception 'Un consenso lo revoca l''admin' using errcode = '42501';
  end if;
  if p_tipo is distinct from 'salute' then
    raise exception 'Consenso non valido' using errcode = '22023';
  end if;
  -- how the client asked, from a closed list: never a free text, that could say something about health
  -- and would reach the log and the backup
  if p_motivo is null or p_motivo not in ('telegram', 'email', 'di_persona', 'altro') then
    raise exception 'Scegli come il cliente ha chiesto la revoca.' using errcode = '22023';
  end if;

  select c.id into v_consenso
  from public.clienti_consensi c
  where c.client_id = p_client_id and c.tipo = p_tipo and c.revocato_il is null
  for update;
  if v_consenso is null then
    raise exception 'Questo cliente non ha un consenso da revocare.' using errcode = '22023';
  end if;

  perform set_config('alpha.onboarding_consenso', p_client_id::text, true);
  update public.clienti_consensi c
  set revocato_il = now(), revocato_da = (select auth.uid())
  where c.id = v_consenso;
  perform set_config('alpha.onboarding_consenso', '', true);

  insert into public.onboarding_eventi (client_id, tipo, attore, autore_id, dettagli)
  values (p_client_id, 'consenso_revocato', 'team', (select auth.uid()),
          jsonb_build_object('tipo', p_tipo, 'come', p_motivo));

  select coalesce(jsonb_agg(a.percorso order by a.created_at), '[]'::jsonb) into v_percorsi
  from public.onboarding_allegati a
  where a.client_id = p_client_id and a.stato = 'da_cancellare';

  return jsonb_build_object('client_id', p_client_id, 'tipo', p_tipo, 'percorsi', v_percorsi);
end;
$$;

comment on function public.onboarding_revoca_consenso(uuid, text, text) is
  'The admin registers the revocation of the health consent the client asked for, with how he asked (telegram, email, di_persona, altro: a closed list, never a free text in the log): revocato_il and revocato_da, the answers of the questionnaire deleted, the files da_cancellare, regole and questionario available again (and what depends on them, not done, locked). Returns { client_id, tipo, percorsi } (the files the server action removes now). Admin only, never an OAuth token. Security invoker.';

revoke all on function public.onboarding_revoca_consenso(uuid, text, text) from public, anon;
grant execute on function public.onboarding_revoca_consenso(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. The files the evening cron removes from Storage
-- ---------------------------------------------------------------------------
-- Every row da_cancellare and the objects of the bucket without a row (a client deleted, a row already gone).
-- The object goes every evening, also for today's rows: a signed upload URL stays valid for two hours after
-- «togli» or a revocation, and a file put there afterwards must not wait another day. The row of today stays
-- (solo_oggetto) so that the daily limit of allegato_prepara counts it; the rows of before go after their
-- object. The cron removes the objects with the API of Storage, then the rows (id not null, not solo_oggetto).
create function public.onboarding_allegati_da_togliere()
returns table (id uuid, percorso text, solo_oggetto boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select a.id, a.percorso, (a.created_at at time zone 'Europe/Rome')::date >= public.oggi()
  from public.onboarding_allegati a
  where a.stato = 'da_cancellare'
  union all
  select null::uuid, o.name, false
  from storage.objects o
  where o.bucket_id = 'onboarding-allegati'
    and not exists (select 1 from public.onboarding_allegati a where a.percorso = o.name);
$$;

comment on function public.onboarding_allegati_da_togliere() is
  'The files the evening cron removes from the bucket onboarding-allegati: { id, percorso, solo_oggetto } of every row da_cancellare (solo_oggetto for today''s rows, Rome: the object goes, the row stays for the daily limit), and { null, percorso, false } of the objects without a row. Service role only.';

revoke all on function public.onboarding_allegati_da_togliere() from public, anon, authenticated;
grant execute on function public.onboarding_allegati_da_togliere() to service_role;

-- ---------------------------------------------------------------------------
-- 8. The preview of a deletion: the body of 20261109090100; «cliente» says the questionnaire and the files
-- ---------------------------------------------------------------------------
create or replace function public.anteprima_eliminazione(p_tipo text, p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo l''admin elimina' using errcode = '42501';
  end if;

  case p_tipo
    when 'persona' then
      return jsonb_build_object(
        'report', (select count(*) from public.setter_daily_reports where setter_id = p_id),
        'regole', (select count(*) from public.commission_rules where profile_id = p_id),
        'pagamenti_provvigioni', (select count(*) from public.commission_payouts where profile_id = p_id),
        'vendite', (select count(*) from public.sales where setter_id = p_id or closer_id = p_id),
        'call', (select count(*) from public.calls where setter_id = p_id or closer_id = p_id),
        'lead', (select count(*) from public.leads where setter_id = p_id),
        'progetti', (select count(*) from public.pm_membri where profile_id = p_id),
        'voci_tempo', (select count(*) from public.pm_tempo where profile_id = p_id),
        'note', (select count(*) from public.pm_note where autore_id = p_id)
      );
    when 'cliente' then
      return jsonb_build_object(
        'vendite', (select count(*) from public.sales where client_id = p_id),
        'rate', (select count(*) from public.payments p join public.sales s on s.id = p.sale_id where s.client_id = p_id),
        'incassato', (
          select public.euro_testo(coalesce(sum(p.importo_incassato), 0))
          from public.payments p join public.sales s on s.id = p.sale_id
          where s.client_id = p_id and p.importo_incassato is not null
        ),
        'progetti', (select count(*) from public.pm_progetti where client_id = p_id),
        'cartella_drive', (select count(*) from public.clienti_cartelle where client_id = p_id),
        -- the onboarding (invite, path, steps, log, Telegram) goes with the client (1.77.0)
        'onboarding', (
          exists (select 1 from public.onboarding_inviti where client_id = p_id)
          or exists (select 1 from public.onboarding_percorsi where client_id = p_id)
        ),
        -- and the client's access to the path (1.79.0)
        'accesso_cliente', exists (select 1 from public.clienti_account where client_id = p_id),
        -- and the questionnaire with its files (1.80.0)
        'questionario', (
          exists (select 1 from public.onboarding_questionari where client_id = p_id)
          or exists (select 1 from public.onboarding_allegati where client_id = p_id and stato <> 'da_cancellare')
        )
      );
    when 'onboarding' then
      return jsonb_build_object(
        'task_onboarding', (
          select count(*)
          from public.pm_task t
          join public.pm_progetti pg on pg.id = t.progetto_id
          where pg.client_id = p_id and t.chiave_onboarding is not null
        ),
        'passi', (select count(*) from public.onboarding_passi where client_id = p_id),
        'eventi', (select count(*) from public.onboarding_eventi where client_id = p_id),
        'accesso_cliente', exists (select 1 from public.clienti_account where client_id = p_id)
      );
    when 'vendita' then
      return jsonb_build_object(
        'rate', (select count(*) from public.payments where sale_id = p_id),
        'rate_incassate', (select count(*) from public.payments where sale_id = p_id and stato = 'incassata'),
        'incassato', (
          select public.euro_testo(coalesce(sum(importo_incassato), 0))
          from public.payments where sale_id = p_id and importo_incassato is not null
        )
      );
    when 'lead' then
      return jsonb_build_object(
        'call', (select count(*) from public.calls where lead_id = p_id),
        'clienti_collegati', (select count(*) from public.clients where lead_id = p_id)
      );
    when 'prodotto' then
      return jsonb_build_object(
        'vendite', (select count(*) from public.sales where product_id = p_id),
        'call', (select count(*) from public.calls where prodotto_proposto_id = p_id)
      );
    when 'reparto' then
      return jsonb_build_object(
        'progetti', (select count(*) from public.pm_progetti where reparto_id = p_id),
        'modelli', (select count(*) from public.pm_modelli where reparto_id = p_id)
      );
    else
      raise exception 'Tipo non valido' using errcode = '22023';
  end case;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. The nightly cleanup: the body of 20261109090100, plus the files left half uploaded. The questionnaire
--    and the files of a closed account stay (Dany, 12/11/2026: kept as long as the client exists).
-- ---------------------------------------------------------------------------
create or replace function public.onboarding_pulizia()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_chiusi uuid[];
  n_chiusi integer;
  n_video integer;
  n_registrazioni integer;
  n_limiti integer;
  n_token integer;
  n_eventi integer;
  n_allegati integer;
begin
  -- the accounts whose last path (nuovo or rinnovo) ended more than 12 months ago: closed, their videos gone.
  -- The questionnaire and the files stay.
  with chiusi as (
    update public.clienti_account a
    set stato = 'chiuso', chiuso_il = now()
    where a.stato in ('attivo', 'sospeso')
      and (
        select max(s.data_fine)
        from public.sales s
        where s.client_id = a.client_id and s.tipo in ('nuovo', 'rinnovo')
      ) < (public.oggi() - interval '12 months')::date
    returning a.client_id
  )
  select coalesce(array_agg(client_id), '{}') into v_chiusi from chiusi;
  n_chiusi := cardinality(v_chiusi);

  delete from public.onboarding_video_visti v where v.client_id = any (v_chiusi);
  get diagnostics n_video = row_count;

  delete from public.onboarding_registrazioni r where r.chiave_scade_il < now() - interval '1 day';
  get diagnostics n_registrazioni = row_count;

  delete from public.clienti_accesso_limiti l
  where l.dal < now() - interval '1 day'
    and (l.ultimo_invio_il is null or l.ultimo_invio_il < now() - interval '1 day');
  get diagnostics n_limiti = row_count;

  delete from public.onboarding_inviti_token t
  using public.onboarding_inviti i
  where i.id = t.invito_id
    and (
      (i.stato = 'revocato' and i.revocato_il < now() - interval '30 days')
      or (i.stato = 'scaduto' and coalesce(i.scade_il, i.updated_at) < now() - interval '30 days')
      -- an active link past its days and never opened again (it becomes scaduto only on /join)
      or (i.stato = 'attivo' and i.scade_il is not null and i.scade_il < now() - interval '30 days')
    );
  get diagnostics n_token = row_count;

  delete from public.onboarding_eventi e where e.created_at < now() - interval '24 months';
  get diagnostics n_eventi = row_count;

  -- the files left half uploaded for more than a day: to delete (the evening cron removes them)
  update public.onboarding_allegati a
  set stato = 'da_cancellare'
  where a.stato = 'in_caricamento' and a.created_at < now() - interval '1 day';
  get diagnostics n_allegati = row_count;

  return jsonb_build_object(
    'account_chiusi', n_chiusi,
    'video', n_video,
    'registrazioni', n_registrazioni,
    'limiti', n_limiti,
    'token', n_token,
    'eventi', n_eventi,
    'allegati', n_allegati
  );
end;
$$;

comment on function public.onboarding_pulizia() is
  'Every night (pg_cron onboarding-pulizia): closes the accounts of the clients whose last path ended more than 12 months ago (their videos seen go; questionnaire and files stay as long as the client exists), deletes the registrations expired since a day, the limits older than a day, the tokens in clear of links expired or revoked since 30 days, the log older than 24 months, and marks da_cancellare the files left half uploaded for more than a day. Returns the counts. Service role only.';

revoke all on function public.onboarding_pulizia() from public, anon, authenticated;
grant execute on function public.onboarding_pulizia() to service_role;

-- ---------------------------------------------------------------------------
-- 10. A test client waiting after the rules starts again by himself
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in select p.client_id from public.onboarding_percorsi p where p.giorno_zero is not null loop
    perform public.onboarding_sblocca(r.client_id);
  end loop;
end;
$$;
