-- Release C of the guided onboarding (1.82.0, Dany, 13/11/2026: «devi collegarlo allo sheet che ti ho
-- mandato così abbiamo i dati di back up per le domande di onboarding»; «Riga completa»; and the
-- questionnaire «deve essere impostato così», his Google form copied in chat). CLAUDE.md section 34.
--
-- 1. The questionnaire as the form: every question required except «note» (cattive_abitudini too:
--    at least one choice or a text in «Altro»), in the order of the form, and the option
--    «Altre sostanze». The same rules as lib/validation/questionario.ts.
-- 2. A new version of the health consent text (lib/percorso/consensi.ts): a copy of the answers
--    goes to a Google sheet of Percorso Alpha, and leaves it at a revocation.
-- 3. The Google service account (its JSON key only in Vault, read by the service role) and the
--    queue that writes one row per sent questionnaire on the sheet «questionario-e-mappatura-allievi»,
--    tab «Risposte del modulo», and clears it at a revocation. The queue holds only the client and
--    an opaque reference written in the last column (AH), never an answer.

-- ---------------------------------------------------------------------------
-- 1. The questionnaire as the form
-- ---------------------------------------------------------------------------
create or replace function public.onboarding_risposte_valide(p_risposte jsonb)
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
          if jsonb_typeof(w) <> 'array' or jsonb_array_length(w) > 6
             or exists (
               select 1 from jsonb_array_elements(w) as x(el)
               where jsonb_typeof(x.el) <> 'string'
                  or (x.el #>> '{}') not in ('alcol', 'fumo', 'altre_sostanze', 'sonno', 'stimolanti', 'motivazione')
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
  'True when the answers of the questionnaire have only the keys of the questions of Dany''s Google form, each of its type (texts at most 2,000 characters, the options of the form with «Altre sostanze» from 1.82.0, the numbers in their ranges; null = not answered). No rule on the age. The same rule as lib/validation/questionario.ts; the check of onboarding_questionari.';

create or replace function public.onboarding_risposte_mancanti(p_risposte jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select coalesce(array_agg(q.chiave order by q.ordine), '{}')
  from (values
    (1, 'email', 'testo'), (2, 'telefono', 'testo'), (3, 'nome_cognome', 'testo'), (4, 'altezza_peso', 'altezza_peso'),
    (5, 'data_nascita', 'testo'), (6, 'obiettivo_principale', 'testo'), (7, 'occupazione', 'testo'),
    (8, 'storia_allenamento', 'testo'), (9, 'livello_attivita', 'valore'), (10, 'importanza_tecnica', 'testo'),
    (11, 'seguito_alimentazione', 'valore'), (12, 'conoscenza_alimentazione', 'testo'),
    (13, 'giorni_settimana', 'valore'), (14, 'minuti_giorno', 'valore'),
    (15, 'ore_sonno', 'testo'), (16, 'organizzazione_giornata', 'testo'), (17, 'infortuni', 'testo'),
    (18, 'cattive_abitudini', 'abitudini'),
    (19, 'successo', 'testo'), (20, 'perche_noi', 'testo'), (21, 'obiettivi_3_6_mesi', 'testo'),
    (22, 'attrezzatura', 'testo'), (23, 'massimali', 'massimali'), (24, 'esercizi_difficolta', 'testo'),
    (25, 'pronto', 'valore')
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
    when 'abitudini' then
      (jsonb_typeof(coalesce(p_risposte, '{}'::jsonb) -> q.chiave -> 'scelte') = 'array'
        and jsonb_array_length(coalesce(p_risposte, '{}'::jsonb) -> q.chiave -> 'scelte') > 0)
      or (jsonb_typeof(coalesce(p_risposte, '{}'::jsonb) -> q.chiave -> 'altro') = 'string'
        and public.testo_scritto(coalesce(p_risposte, '{}'::jsonb) -> q.chiave ->> 'altro'))
  end, false);
$$;

comment on function public.onboarding_risposte_mancanti(jsonb) is
  'The keys of the required questions not answered yet, in the order of Dany''s form (only note is optional, 1.82.0). A text is answered when testo_scritto() is true, altezza_peso with both parts, massimali with all three, cattive_abitudini with at least one choice or a text in «Altro».';

-- ---------------------------------------------------------------------------
-- 2. The new version of the health consent text
-- ---------------------------------------------------------------------------
update public.clienti_consensi_testi t set in_vigore = false where t.tipo = 'salute' and t.in_vigore;
insert into public.clienti_consensi_testi (tipo, versione, testo_sha256, in_vigore) values
  ('salute', '2026-11-13', '52dbbaf3e31c8623515f20ae1714658c6091e68f0330d252cd4ccb2758e5d0e7', true);

-- ---------------------------------------------------------------------------
-- 3a. The Google service account
-- ---------------------------------------------------------------------------
create table public.google_collegamento (
  id boolean primary key default true check (id),
  -- the address of the service account (not a secret: the sheet is shared with it)
  account_email text check (account_email ~ '^[^@[:space:]]+@[^@[:space:]]+\.iam\.gserviceaccount\.com$'),
  chiave_aggiornata_il timestamptz,
  ultima_scrittura_il timestamptz,
  -- a fixed sentence (lib/google/frasi.ts), never the key or an answer
  ultimo_errore text check (char_length(ultimo_errore) <= 300),
  ultimo_errore_il timestamptz,
  updated_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.google_collegamento default values;

create trigger google_collegamento_set_updated_at before update on public.google_collegamento
  for each row execute function public.set_updated_at();

alter table public.google_collegamento enable row level security;
revoke all on public.google_collegamento from anon;
revoke insert, update, delete, truncate on public.google_collegamento from authenticated;

create policy google_collegamento_admin on public.google_collegamento
  for select to authenticated using ((select public.is_admin()));
create policy google_collegamento_mai_da_oauth on public.google_collegamento
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

comment on table public.google_collegamento is
  'One row: the Google service account that writes the onboarding sheet (1.82.0): its address, when its key was saved (the key lives only in Vault), the last write and the last error in words. Admin reads; written only by the google_* functions.';

-- The admin saves the JSON key of the service account. Keeps only the address and the private
-- key; never returns or echoes the key.
create function public.google_imposta_chiave(p_json text)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v jsonb;
  v_email text;
  v_chiave text;
  v_id uuid;
begin
  if not public.is_admin() or public.da_client_oauth() then
    raise exception 'La chiave di Google la imposta l’admin.' using errcode = '42501';
  end if;
  begin
    v := btrim(coalesce(p_json, ''))::jsonb;
  exception when others then
    raise exception 'Questo non è il file JSON di un service account: scaricalo di nuovo da Google Cloud.'
      using errcode = '22023';
  end;
  v_email := lower(btrim(coalesce(v ->> 'client_email', '')));
  v_chiave := coalesce(v ->> 'private_key', '');
  if jsonb_typeof(v) <> 'object' or v ->> 'type' is distinct from 'service_account'
     or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.iam\.gserviceaccount\.com$'
     or v_chiave not like '-----BEGIN PRIVATE KEY-----%' or char_length(v_chiave) > 10000 then
    raise exception 'Questo non è il file JSON di un service account: scaricalo di nuovo da Google Cloud.'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('alpha.google_chiave', 0));
  select s.id into v_id from vault.secrets s where s.name = 'google_service_account';
  if v_id is null then
    perform vault.create_secret(jsonb_build_object('client_email', v_email, 'private_key', v_chiave)::text,
      'google_service_account', 'Google service account of Percorso Alpha: read only by the service role (google_chiave)');
  else
    perform vault.update_secret(v_id, jsonb_build_object('client_email', v_email, 'private_key', v_chiave)::text);
  end if;

  update public.google_collegamento c
  set account_email = v_email, chiave_aggiornata_il = now(), ultimo_errore = null, ultimo_errore_il = null,
      updated_by = (select auth.uid())
  where c.id;
  return v_email;
end;
$$;

create function public.google_togli_chiave()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() or public.da_client_oauth() then
    raise exception 'La chiave di Google la toglie l’admin.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('alpha.google_chiave', 0));
  delete from vault.secrets s where s.name = 'google_service_account';
  update public.google_collegamento c
  set account_email = null, chiave_aggiornata_il = null, updated_by = (select auth.uid()) where c.id;
end;
$$;

create function public.google_chiave_presente()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() or public.da_client_oauth() then
    raise exception 'Il collegamento di Google lo vede l’admin.' using errcode = '42501';
  end if;
  return exists (select 1 from vault.secrets s where s.name = 'google_service_account');
end;
$$;

-- The key, for the server only (service role)
create function public.google_chiave()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.decrypted_secret from vault.decrypted_secrets d where d.name = 'google_service_account';
$$;

revoke all on function public.google_imposta_chiave(text) from public, anon;
grant execute on function public.google_imposta_chiave(text) to authenticated;
revoke all on function public.google_togli_chiave() from public, anon;
grant execute on function public.google_togli_chiave() to authenticated;
revoke all on function public.google_chiave_presente() from public, anon;
grant execute on function public.google_chiave_presente() to authenticated;
revoke all on function public.google_chiave() from public, anon, authenticated;
grant execute on function public.google_chiave() to service_role;

comment on function public.google_imposta_chiave(text) is
  'Admin only, never an OAuth token: stores the JSON key of the Google service account in Vault (only client_email and private_key, fixed name) and returns the address of the account. Never returns the key.';
comment on function public.google_chiave() is
  'service_role only: the Google service account ({client_email, private_key}), for the server.';

-- ---------------------------------------------------------------------------
-- 3b. Where the rows go: the sheet and its tab (the admin can change them)
-- ---------------------------------------------------------------------------
alter table public.onboarding_impostazioni
  add column foglio_id text not null default '1gS0fl9dWmqEUKFlfhIt56hayJtpU5DPR1YrWuU47_DQ'
    check (foglio_id ~ '^[A-Za-z0-9_-]{20,100}$'),
  add column foglio_scheda text not null default 'Risposte del modulo'
    check (char_length(btrim(foglio_scheda)) between 1 and 100 and foglio_scheda !~ '[''!]');

grant update (foglio_id, foglio_scheda) on public.onboarding_impostazioni to authenticated;

-- ---------------------------------------------------------------------------
-- 3c. The queue of the sheet
-- ---------------------------------------------------------------------------
create table public.onboarding_foglio (
  client_id uuid primary key references public.clients (id) on delete cascade,
  -- written in column AH of the row: finds it again at a rewrite or a revocation, even if the sheet is sorted
  rif uuid not null unique default gen_random_uuid(),
  stato text not null default 'da_scrivere' check (stato in ('da_scrivere', 'scritta', 'da_svuotare', 'svuotata')),
  tentativi integer not null default 0 check (tentativi >= 0),
  prossimo_il timestamptz not null default now(),
  preso_il timestamptz,
  riga integer check (riga > 1),
  scritta_il timestamptz,
  svuotata_il timestamptz,
  -- a fixed sentence, never an answer
  errore text check (char_length(errore) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index onboarding_foglio_dovuti on public.onboarding_foglio (prossimo_il)
  where stato in ('da_scrivere', 'da_svuotare');

create trigger onboarding_foglio_set_updated_at before update on public.onboarding_foglio
  for each row execute function public.set_updated_at();

alter table public.onboarding_foglio enable row level security;
revoke all on public.onboarding_foglio from anon;
revoke all on public.onboarding_foglio from authenticated;
grant select on public.onboarding_foglio to authenticated;

create policy onboarding_foglio_admin_lettura on public.onboarding_foglio
  for select to authenticated using ((select public.is_admin()));
create policy onboarding_foglio_mai_da_oauth on public.onboarding_foglio
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

comment on table public.onboarding_foglio is
  'One row per client whose questionnaire goes to the Google sheet (1.82.0): the state of the row on the sheet and the opaque reference written in its last column. Never an answer. Admin reads; written only by the triggers and the service role.';

-- A sent questionnaire goes in the queue (again after a revocation and a new sending)
create function public.onboarding_questionari_foglio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    if tg_op = 'DELETE' then
      update public.onboarding_foglio f
      set stato = 'da_svuotare', tentativi = 0, prossimo_il = now(), errore = null, preso_il = null
      where f.client_id = old.client_id and f.stato <> 'svuotata';
      return old;
    end if;
    if new.inviato_il is not null and (tg_op = 'INSERT' or old.inviato_il is null) then
      insert into public.onboarding_foglio (client_id) values (new.client_id)
      on conflict (client_id) do update
      set stato = case when public.onboarding_foglio.stato = 'da_svuotare' then 'da_svuotare' else 'da_scrivere' end,
          tentativi = 0, prossimo_il = now(), errore = null;
    end if;
  exception when others then
    raise warning '[onboarding_foglio] coda non aggiornata: %', sqlstate;
  end;
  return coalesce(new, old);
end;
$$;

revoke all on function public.onboarding_questionari_foglio() from public, anon, authenticated;

create trigger onboarding_questionari_foglio
  after insert or update of inviato_il or delete on public.onboarding_questionari
  for each row execute function public.onboarding_questionari_foglio();

-- The work due, taken for 10 minutes: what to write (the answers only when the questionnaire is
-- sent and the consent is in force) and what to clear. service_role only.
create function public.onboarding_foglio_prendi(p_limite integer default 20, p_client uuid default null)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_foglio text;
  v_scheda text;
  v_lavori jsonb;
begin
  select i.foglio_id, i.foglio_scheda into v_foglio, v_scheda from public.onboarding_impostazioni i where i.id;

  with presi as (
    select f.client_id
    from public.onboarding_foglio f
    where f.stato in ('da_scrivere', 'da_svuotare') and f.prossimo_il <= now()
      and (f.preso_il is null or f.preso_il < now() - interval '10 minutes')
      and (p_client is null or f.client_id = p_client)
    order by f.prossimo_il
    limit greatest(1, least(coalesce(p_limite, 20), 50))
    for update skip locked
  ), aggiornati as (
    update public.onboarding_foglio f set preso_il = now()
    from presi where f.client_id = presi.client_id
    returning f.client_id, f.rif, f.stato
  ), lavori as (
    select a.client_id, a.rif,
      (a.stato = 'da_scrivere' and q.inviato_il is not null and public.onboarding_consenso_salute(a.client_id)) as scrivi,
      q.risposte, q.inviato_il
    from aggiornati a
    left join public.onboarding_questionari q on q.client_id = a.client_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'client_id', l.client_id,
    'rif', l.rif,
    'azione', case when l.scrivi then 'scrivi' else 'svuota' end,
    'risposte', case when l.scrivi then l.risposte end,
    'inviato_il', case when l.scrivi then l.inviato_il end,
    'data_inizio', case when l.scrivi then (
      select s.data_inizio from public.onboarding_inviti oi join public.sales s on s.id = oi.sale_id
      where oi.client_id = l.client_id order by oi.created_at desc limit 1) end
  )), '[]'::jsonb) into v_lavori
  from lavori l;

  return jsonb_build_object('foglio_id', v_foglio, 'scheda', v_scheda, 'lavori', v_lavori);
end;
$$;

-- The outcome of one job. A write done while a revocation arrived leaves the row to clear; a clear
-- done while the client sent again puts it back to write.
create function public.onboarding_foglio_esito(p_client uuid, p_rif uuid, p_azione text, p_riga integer, p_errore text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_errore text := nullif(left(btrim(coalesce(p_errore, '')), 300), '');
begin
  if p_azione not in ('scrivi', 'svuota') then
    raise exception 'azione non valida' using errcode = '22023';
  end if;

  update public.onboarding_foglio f
  set preso_il = null,
      stato = case
        when v_errore is not null then f.stato
        when p_azione = 'scrivi' then case when f.stato = 'da_scrivere' then 'scritta' else f.stato end
        when exists (select 1 from public.onboarding_questionari q where q.client_id = f.client_id and q.inviato_il is not null)
             and public.onboarding_consenso_salute(f.client_id) then 'da_scrivere'
        else 'svuotata' end,
      riga = case when v_errore is not null then f.riga when p_azione = 'scrivi' then p_riga else null end,
      scritta_il = case when v_errore is null and p_azione = 'scrivi' then now() else f.scritta_il end,
      svuotata_il = case when v_errore is null and p_azione = 'svuota' then now() else f.svuotata_il end,
      tentativi = case when v_errore is null then 0 else f.tentativi + 1 end,
      prossimo_il = case when v_errore is null then now()
        else now() + least(interval '6 hours', interval '10 minutes' * power(2, least(f.tentativi, 6))) end,
      errore = v_errore
  where f.client_id = p_client and f.rif = p_rif;

  update public.google_collegamento c
  set ultima_scrittura_il = case when v_errore is null then now() else c.ultima_scrittura_il end,
      ultimo_errore = v_errore,
      ultimo_errore_il = case when v_errore is null then null else now() end
  where c.id;
end;
$$;

-- A failure before any job (no key, Google refusing the token): said once for the admin
create function public.google_segna_errore(p_errore text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  update public.google_collegamento c
  set ultimo_errore = nullif(left(btrim(coalesce(p_errore, '')), 300), ''),
      ultimo_errore_il = case when nullif(btrim(coalesce(p_errore, '')), '') is null then null else now() end
  where c.id;
$$;

revoke all on function public.onboarding_foglio_prendi(integer, uuid) from public, anon, authenticated;
grant execute on function public.onboarding_foglio_prendi(integer, uuid) to service_role;
revoke all on function public.onboarding_foglio_esito(uuid, uuid, text, integer, text) from public, anon, authenticated;
grant execute on function public.onboarding_foglio_esito(uuid, uuid, text, integer, text) to service_role;
revoke all on function public.google_segna_errore(text) from public, anon, authenticated;
grant execute on function public.google_segna_errore(text) to service_role;

comment on function public.onboarding_foglio_prendi(integer, uuid) is
  'service_role only: takes for 10 minutes the rows of the sheet due (at most 50), with the answers only when the questionnaire is sent and the health consent is in force (otherwise the row is to clear). Returns { foglio_id, scheda, lavori }.';
comment on function public.onboarding_foglio_esito(uuid, uuid, text, integer, text) is
  'service_role only: the outcome of a write or a clear of the sheet; an error retries later (10 minutes doubling, at most 6 hours).';

-- The questionnaires already sent with the consent in force go in the queue (release B, test clients)
insert into public.onboarding_foglio (client_id)
select q.client_id from public.onboarding_questionari q
where q.inviato_il is not null and public.onboarding_consenso_salute(q.client_id)
on conflict (client_id) do nothing;
