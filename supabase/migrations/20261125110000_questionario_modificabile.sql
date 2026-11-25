-- 1.88.0: the questionnaire of the onboarding editable from the settings (Dany, 25/11/2026: «basta che dai la
-- possibilità nelle impostazioni a me come admin di modificare tutto anche domande eventuali così non devo farlo da
-- codice»; on the questionnaire: «Anche aggiungere e togliere»). CLAUDE.md section 34.
--
-- 1. onboarding_domande: the questions, seeded with the 26 of Dany's Google form exactly as lib/percorso/questionario.ts
--    had them (sistema = true: their key, kind and column of the sheet A-AC never change; their words, help, options,
--    order, section and «required» do). The admin adds questions (text, single or multiple choice, number, date, files):
--    each takes a column of the sheet after AH (AI, AJ, …) that it keeps forever. A question is never deleted: «Togli»
--    hides it (attiva = false) and «Rimetti» brings it back, so a column is never reused.
-- 2. The answers: the check of onboarding_questionari.risposte becomes a rule of shape only (any key of a question,
--    each kind of value); what a question accepts is read from its definition when the client saves
--    (onboarding_risposte_filtra keeps only the answers that hold) and when he sends (onboarding_risposte_mancanti).
-- 3. The files: a field of files is the one of a question (allegato->>'campo'), not a fixed list.
-- 4. questionario_cliente gives the client the questions too.
-- The answers already saved stay as they are: the keys of the 26 questions do not change.

-- ---------------------------------------------------------------------------
-- 1. The questions
-- ---------------------------------------------------------------------------
create function public.onboarding_opzioni_valide(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'array'
     and jsonb_array_length(p) between 1 and 30
     and not exists (
       select 1 from jsonb_array_elements(p) as o(x)
       where jsonb_typeof(o.x) <> 'object'
          or jsonb_typeof(o.x -> 'valore') <> 'string'
          or (o.x ->> 'valore') !~ '^[a-z0-9_]{1,40}$'
          or jsonb_typeof(o.x -> 'etichetta') <> 'string'
          or char_length(btrim(o.x ->> 'etichetta')) not between 1 and 200
          or (o.x ? 'dettaglio' and (jsonb_typeof(o.x -> 'dettaglio') <> 'string' or char_length(o.x ->> 'dettaglio') > 300))
          or exists (select 1 from jsonb_object_keys(o.x) as k(nome) where k.nome not in ('valore', 'etichetta', 'dettaglio'))
     )
     and (select count(distinct o.x ->> 'valore') from jsonb_array_elements(p) as o(x)) = jsonb_array_length(p);
$$;

comment on function public.onboarding_opzioni_valide(jsonb) is
  'The options of a question: 1 to 30 objects { valore (a slug, unique), etichetta (1-200), dettaglio (at most 300, optional) }. The check of onboarding_domande.opzioni.';

revoke all on function public.onboarding_opzioni_valide(jsonb) from public, anon;
-- the check runs with the admin's session when he saves a question
grant execute on function public.onboarding_opzioni_valide(jsonb) to authenticated;

create function public.onboarding_allegato_def_valido(p jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(p) = 'object'
     and jsonb_typeof(p -> 'campo') = 'string' and (p ->> 'campo') ~ '^[a-z][a-z0-9_]{1,59}$'
     and jsonb_typeof(p -> 'etichetta') = 'string' and char_length(btrim(p ->> 'etichetta')) between 1 and 120
     and (not p ? 'aiuto' or (jsonb_typeof(p -> 'aiuto') = 'string' and char_length(p ->> 'aiuto') <= 300))
     and not exists (select 1 from jsonb_object_keys(p) as k(nome) where k.nome not in ('campo', 'etichetta', 'aiuto'));
$$;

comment on function public.onboarding_allegato_def_valido(jsonb) is
  'The files that go with a question: { campo (a slug), etichetta (1-120), aiuto (at most 300, optional) }. The check of onboarding_domande.allegato.';

revoke all on function public.onboarding_allegato_def_valido(jsonb) from public, anon;
grant execute on function public.onboarding_allegato_def_valido(jsonb) to authenticated;

create table public.onboarding_domande (
  chiave text primary key check (chiave ~ '^[a-z][a-z0-9_]{1,59}$'),
  ordine integer not null check (ordine between 1 and 100000),
  sezione smallint not null check (sezione between 1 and 4),
  tipo text not null check (tipo in ('testo', 'email', 'data', 'altezza_peso', 'scelta', 'scelte', 'numero',
                                     'massimali', 'abitudini', 'file')),
  testo text not null check (char_length(btrim(testo)) between 1 and 500),
  aiuto text check (aiuto is null or char_length(aiuto) <= 1000),
  obbligatoria boolean not null default true,
  attiva boolean not null default true,
  -- a long answer (a textarea), for a text
  lungo boolean not null default false,
  -- a choice whose answer is saved as a number (the days of the week)
  numerica boolean not null default false,
  opzioni jsonb check (opzioni is null or public.onboarding_opzioni_valide(opzioni)),
  -- the label of the free text under the choices (cattive_abitudini)
  altro text check (altro is null or char_length(btrim(altro)) between 1 and 120),
  allegato jsonb check (allegato is null or public.onboarding_allegato_def_valido(allegato)),
  -- the 26 questions of the form: their columns of the sheet are A-AC
  sistema boolean not null default false,
  -- the column of the sheet of a question added by the admin, 0-based: AI = 34; kept forever
  colonna smallint unique check (colonna is null or colonna between 34 and 700),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles (id) on delete set null default auth.uid(),
  constraint onboarding_domande_opzioni_per_tipo check (
    (tipo in ('scelta', 'scelte', 'abitudini')) = (opzioni is not null)
  ),
  constraint onboarding_domande_file check (
    tipo <> 'file' or (allegato is not null and allegato ->> 'campo' = chiave)
  ),
  constraint onboarding_domande_tipi_nuovi check (
    sistema or tipo in ('testo', 'scelta', 'scelte', 'numero', 'data', 'file')
  ),
  constraint onboarding_domande_colonna check (sistema = (colonna is null)),
  constraint onboarding_domande_lungo check (not lungo or tipo = 'testo'),
  constraint onboarding_domande_numerica check (not numerica or tipo = 'scelta'),
  constraint onboarding_domande_altro check ((altro is not null) = (tipo = 'abitudini'))
);

create unique index onboarding_domande_campo_allegato on public.onboarding_domande ((allegato ->> 'campo'))
  where allegato is not null;
create index onboarding_domande_ordine_idx on public.onboarding_domande (sezione, ordine);

comment on table public.onboarding_domande is
  'The questions of the onboarding questionnaire (1.88.0): the admin edits their words, help, options, order, section and «required», adds new ones and hides them (attiva). The 26 of Dany''s form (sistema) keep key, kind and column; a question added takes a column of the sheet after AH. Never deleted. The admin writes; the admin and the people with a task in an onboarding read; the client receives them from questionario_cliente().';

create function public.onboarding_domande_guardia()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_prima text[];
  v_dopo text[];
begin
  if tg_op = 'INSERT' then
    -- a question added takes the next column of the sheet, never one used before (a hidden one keeps its own)
    if not new.sistema then
      new.colonna := greatest(33, coalesce((select max(d.colonna) from public.onboarding_domande d), 33)) + 1;
    end if;
    return new;
  end if;

  if new.chiave is distinct from old.chiave or new.tipo is distinct from old.tipo
     or new.sistema is distinct from old.sistema or new.colonna is distinct from old.colonna
     or new.numerica is distinct from old.numerica then
    raise exception 'Il tipo di una domanda non si cambia: toglila e creane una nuova.' using errcode = '22023';
  end if;
  if old.sistema and (old.allegato ->> 'campo') is distinct from (new.allegato ->> 'campo')
     and old.allegato is not null and new.allegato is not null then
    raise exception 'I file di questa domanda non si spostano su un altro campo.' using errcode = '22023';
  end if;
  -- the days of the week are saved as numbers: their options keep their values
  if old.numerica then
    select array_agg(o.x ->> 'valore' order by o.x ->> 'valore') into v_prima from jsonb_array_elements(old.opzioni) as o(x);
    select array_agg(o.x ->> 'valore' order by o.x ->> 'valore') into v_dopo from jsonb_array_elements(new.opzioni) as o(x);
    if v_prima is distinct from v_dopo then
      raise exception 'Le opzioni di questa domanda si rinominano, non si aggiungono né si tolgono.' using errcode = '22023';
    end if;
  end if;
  new.updated_by := coalesce(auth.uid(), old.updated_by);
  return new;
end;
$$;

comment on function public.onboarding_domande_guardia() is
  'Before a question is written: a new one added by the admin takes the next column of the sheet (never reused); key, kind, column and «numerica» never change; the files of a question of the form stay on their field; the options of a numeric choice keep their values.';

revoke all on function public.onboarding_domande_guardia() from public, anon, authenticated;

create trigger onboarding_domande_guardia before insert or update on public.onboarding_domande
  for each row execute function public.onboarding_domande_guardia();
create trigger onboarding_domande_set_updated_at before update on public.onboarding_domande
  for each row execute function public.set_updated_at();

alter table public.onboarding_domande enable row level security;

-- the admin and whoever has a task in an onboarding (the coach reads the answers with their questions)
create policy onboarding_domande_lettura on public.onboarding_domande
  for select to authenticated
  using (
    (select public.is_admin())
    or ((select public.current_role()) is not null and exists (
      select 1 from public.onboarding_incarichi i
      where (select auth.uid()) in (i.coach_id, i.revisore_id, i.responsabile_id)
    ))
  );
create policy onboarding_domande_admin_inserimento on public.onboarding_domande
  for insert to authenticated with check ((select public.is_admin()));
create policy onboarding_domande_admin_modifica on public.onboarding_domande
  for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy onboarding_domande_mai_da_oauth on public.onboarding_domande
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

revoke all on public.onboarding_domande from anon, authenticated;
grant select, insert, update on public.onboarding_domande to authenticated;

insert into public.onboarding_domande
  (chiave, ordine, sezione, tipo, testo, aiuto, obbligatoria, lungo, numerica, opzioni, altro, allegato, sistema)
values
  ('email', 1, 1, 'email', 'Email', null, true, false, false, null, null, null, true),
  ('telefono', 2, 1, 'testo', 'Numero di telefono (dove ti darò supporto 24/7) (Telegram)', 'Con il prefisso, per esempio +39 333 123 4567.', true, false, false, null, null, null, true),
  ('nome_cognome', 3, 1, 'testo', 'Nome e Cognome', null, true, false, false, null, null, null, true),
  ('altezza_peso', 4, 1, 'altezza_peso', 'Altezza / Peso (a digiuno)', null, true, false, false, null, null, null, true),
  ('data_nascita', 5, 1, 'data', 'Data di nascita', null, true, false, false, null, null, null, true),
  ('obiettivo_principale', 6, 1, 'testo', 'Il tuo obiettivo N°1 (Più specifico sei e meglio è)', null, true, true, false, null, null, null, true),
  ('occupazione', 7, 1, 'testo', 'Occupazione (che lavoro fai, studente etc..)', null, true, false, false, null, null, null, true),
  ('storia_allenamento', 8, 2, 'testo', 'Da quanto tempo ti alleni (e in quali sport)', null, true, true, false, null, null, null, true),
  ('livello_attivita', 9, 2, 'scelta', 'Qual è il tuo livello attuale di attività fisica?', null, true, false, false, '[{"valore":"sedentario","etichetta":"Sedentario","dettaglio":"(meno di 2h a settimana di esercizio fisico e/o meno di 10.000 passi al giorno)"},{"valore":"attivo","etichetta":"Attivo","dettaglio":"(meno di 5h a settimana di attività fisica e/o circa 10.000 passi al giorno)"},{"valore":"molto_attivo","etichetta":"Molto attivo","dettaglio":"(più di 5h a settimana di esercizio fisico) ps: escluse le attività lavorative di routine"}]'::jsonb, null, null, true),
  ('importanza_tecnica', 10, 2, 'testo', 'Quanto reputi importante la tecnica nei tuoi allenamenti?', null, true, true, false, null, null, null, true),
  ('seguito_alimentazione', 11, 2, 'scelta', 'Sei già seguito da qualcun altro sul piano alimentare?', 'Che ti segua qualcuno o no, se stai seguendo una dieta, caricala qui sotto.', true, false, false, '[{"valore":"si","etichetta":"Sì, ho un professionista che mi segue"},{"valore":"no","etichetta":"No, mi affido a voi!"}]'::jsonb, null, '{"campo":"piano_alimentare","etichetta":"La tua dieta","aiuto":"Foto o PDF, anche più file insieme. Se non segui una dieta, lascia vuoto."}'::jsonb, true),
  ('conoscenza_alimentazione', 12, 2, 'testo', 'Hai idea di come si mangia bene?', null, true, true, false, null, null, null, true),
  ('giorni_settimana', 13, 2, 'scelta', 'Quanti giorni a settimana puoi dedicare all’allenamento?', null, true, false, true, '[{"valore":"1","etichetta":"1"},{"valore":"2","etichetta":"2"},{"valore":"3","etichetta":"3"},{"valore":"4","etichetta":"4"},{"valore":"5","etichetta":"5"},{"valore":"6","etichetta":"6"},{"valore":"7","etichetta":"7"}]'::jsonb, null, null, true),
  ('minuti_giorno', 14, 2, 'scelta', 'Quanto tempo puoi dedicare all’allenamento per ogni giorno che hai indicato?', null, true, false, false, '[{"valore":"20_30","etichetta":"20-30 minuti"},{"valore":"30_40","etichetta":"30-40 minuti"},{"valore":"40_60","etichetta":"40-60 minuti"},{"valore":"60_90","etichetta":"60-90 minuti"},{"valore":"90_120","etichetta":"90-120 minuti"}]'::jsonb, null, null, true),
  ('ore_sonno', 15, 3, 'testo', 'Quante ore dormi al giorno circa?', null, true, false, false, null, null, null, true),
  ('organizzazione_giornata', 16, 3, 'testo', 'Organizzi la tua giornata solitamente? Se sì, come strutturi i tuoi impegni principali (lavoro/studio, pasti, allenamento, sonno)?', 'Ad esempio: «Mi sveglio alle 7, lavoro 9-18, ceno alle 20, mi alleno dopo cena».', true, true, false, null, null, null, true),
  ('infortuni', 17, 3, 'testo', 'Hai infortuni / problematiche fisiche particolari da indicare?', 'Se non ne hai, scrivi «Nessuno».', true, true, false, null, null, null, true),
  ('cattive_abitudini', 18, 3, 'abitudini', 'Quali cattive abitudini hai di quelle elencate qui sotto?', 'Altrimenti scrivi tu sotto quello che ritieni più rilevante. Tocca tutte quelle che ti riguardano.', true, false, false, '[{"valore":"alcol","etichetta":"Bere alcol"},{"valore":"fumo","etichetta":"Fumo"},{"valore":"altre_sostanze","etichetta":"Altre sostanze"},{"valore":"sonno","etichetta":"Dormire meno di 6 ore a notte"},{"valore":"stimolanti","etichetta":"Abuso di stimolanti (caffeina, redbull, monster)"},{"valore":"motivazione","etichetta":"Scarsa motivazione e autostima"}]'::jsonb, 'Altro', null, true),
  ('successo', 19, 4, 'testo', 'Cosa significherebbe per te avere successo in questo programma?', 'Scrivilo con parole tue, come una frase. Ad esempio: «Per me avere successo in questo programma significherebbe finalmente ottenere i risultati su cui ero bloccato da tempo, vedermi più definito allo specchio e sentirmi sicuro quando tolgo la maglietta.»', true, true, false, null, null, null, true),
  ('perche_noi', 20, 4, 'testo', 'Cosa ti ha spinto a farti seguire da me?', null, true, true, false, null, null, null, true),
  ('obiettivi_3_6_mesi', 21, 4, 'testo', 'Cosa ti piacerebbe ottenere nei prossimi 3-6 mesi? (obiettivi di forza specifici, risultati estetici specifici, etc)', null, true, true, false, null, null, null, true),
  ('attrezzatura', 22, 4, 'testo', 'Di quale attrezzatura disponi per fare esercizio?', 'Tocca quella che hai o scrivila tu. Non sai cos’è? Tocca la «i».', true, true, false, null, null, '{"campo":"attrezzatura","etichetta":"Le foto della tua attrezzatura","aiuto":"Una foto per attrezzo ci aiuta a costruire il programma."}'::jsonb, true),
  ('massimali', 23, 4, 'massimali', 'Massimo numero di ripetizioni nei seguenti esercizi: piegamenti, trazioni, dip', 'Il numero di ripetizioni di fila, fatte bene. Se non l’hai mai provato, tocca «Non lo so».', true, false, false, null, null, null, true),
  ('esercizi_difficolta', 24, 4, 'testo', 'Esercizi su cui hai maggiore difficoltà ed esercizi su cui invece hai minore difficoltà', 'Se hai già una vecchia scheda che facevi prima, caricala qui sotto.', true, true, false, null, null, '{"campo":"vecchia_scheda","etichetta":"La tua vecchia scheda","aiuto":"Caricala come foto o PDF, anche più file."}'::jsonb, true),
  ('note', 25, 4, 'testo', 'Vuoi aggiungere qualcosa di rilevante sulla tua situazione, sul tuo stile di vita o sulla tua motivazione che pensi possa aiutarmi a seguirti al meglio?', null, false, true, false, null, null, null, true),
  ('pronto', 26, 4, 'scelta', 'Ti senti pronto e motivato?', null, true, false, false, '[{"valore":"si","etichetta":"Sì, sono pronto a spaccare il mondo!"},{"valore":"no","etichetta":"No"}]'::jsonb, null, null, true);

-- ---------------------------------------------------------------------------
-- 2. The answers
-- ---------------------------------------------------------------------------

-- The check of onboarding_questionari.risposte: a rule of shape only, for any question. The three questions of the
-- form with a structured answer (height and weight, maximums, bad habits), the email and the date of birth keep their
-- rules; any other answer is a text of at most 2,000 characters, a number, or a list of options. What a question
-- accepts (its options, its kind) is read from onboarding_domande by onboarding_risposte_filtra.
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
  if (select count(*) from jsonb_object_keys(p_risposte)) > 300 then
    return false;
  end if;

  for k, v in select e.key, e.value from jsonb_each(p_risposte) as e loop
    if k !~ '^[a-z][a-z0-9_]{1,59}$' then
      return false;
    end if;
    if jsonb_typeof(v) = 'null' then
      continue;
    end if;

    if k = 'email' then
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

    elsif k = 'cattive_abitudini' then
      if jsonb_typeof(v) <> 'object' then
        return false;
      end if;
      for v_chiave, w in select e.key, e.value from jsonb_each(v) as e loop
        if jsonb_typeof(w) = 'null' then
          continue;
        end if;
        if v_chiave = 'scelte' then
          if jsonb_typeof(w) <> 'array' or jsonb_array_length(w) > 30
             or exists (
               select 1 from jsonb_array_elements(w) as x(el)
               where jsonb_typeof(x.el) <> 'string' or (x.el #>> '{}') !~ '^[a-z0-9_]{1,40}$'
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

    elsif jsonb_typeof(v) = 'string' then
      if char_length(v #>> '{}') > 2000 then
        return false;
      end if;

    elsif jsonb_typeof(v) = 'number' then
      n := (v #>> '{}')::numeric;
      if abs(n) > 1000000000 then
        return false;
      end if;

    elsif jsonb_typeof(v) = 'array' then
      if jsonb_array_length(v) > 30
         or exists (
           select 1 from jsonb_array_elements(v) as x(el)
           where jsonb_typeof(x.el) <> 'string' or (x.el #>> '{}') !~ '^[a-z0-9_]{1,40}$'
         )
         or (select count(distinct x.el) from jsonb_array_elements(v) as x(el)) <> jsonb_array_length(v) then
        return false;
      end if;

    else
      return false;
    end if;
  end loop;

  return true;
end;
$$;

comment on function public.onboarding_risposte_valide(jsonb) is
  'The shape of the answers of the questionnaire (1.88.0, the questions are editable): at most 300 keys, each a slug; height and weight, maximums, bad habits, email and date of birth with their rules; any other answer a text of at most 2,000 characters, a number or a list of option values. What a question accepts is read from onboarding_domande (onboarding_risposte_filtra). The check of onboarding_questionari.';

-- One answer against its question: null always; otherwise the kind and the options of the question.
create function public.onboarding_risposta_conforme(p_tipo text, p_numerica boolean, p_opzioni jsonb, p_valore jsonb)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  t text := jsonb_typeof(p_valore);
begin
  if p_valore is null or t = 'null' then
    return true;
  end if;
  case p_tipo
    when 'testo', 'email' then
      return t = 'string';
    when 'data' then
      return t = 'string' and ((p_valore #>> '{}') = ''
        or ((p_valore #>> '{}') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' and pg_input_is_valid(p_valore #>> '{}', 'date')));
    when 'numero' then
      return t = 'number';
    when 'altezza_peso', 'massimali' then
      return t = 'object';
    when 'scelta' then
      if p_numerica then
        if t <> 'number' then
          return false;
        end if;
      elsif t <> 'string' then
        return false;
      end if;
      return exists (select 1 from jsonb_array_elements(p_opzioni) as o(x) where o.x ->> 'valore' = p_valore #>> '{}');
    when 'scelte' then
      return t = 'array' and not exists (
        select 1 from jsonb_array_elements(p_valore) as e(el)
        where not exists (select 1 from jsonb_array_elements(p_opzioni) as o(x) where o.x ->> 'valore' = e.el #>> '{}')
      );
    when 'abitudini' then
      return t = 'object' and (jsonb_typeof(p_valore -> 'scelte') is distinct from 'array' or not exists (
        select 1 from jsonb_array_elements(p_valore -> 'scelte') as e(el)
        where not exists (select 1 from jsonb_array_elements(p_opzioni) as o(x) where o.x ->> 'valore' = e.el #>> '{}')
      ));
    else
      -- a question of files has no answer: its files are in onboarding_allegati
      return false;
  end case;
end;
$$;

comment on function public.onboarding_risposta_conforme(text, boolean, jsonb, jsonb) is
  'One answer against its question (kind, numeric choice, options): null always holds; a choice among its options, a list of choices all among its options, a number, a valid date, a text. A question of files has no answer. No grants.';

revoke all on function public.onboarding_risposta_conforme(text, boolean, jsonb, jsonb) from public, anon, authenticated;

-- The answers of the questions in use, each as its question accepts it: what the client's save keeps. An answer
-- of a question hidden meanwhile, or of an option taken away, goes.
create function public.onboarding_risposte_filtra(p_risposte jsonb)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb)
  from jsonb_each(coalesce(p_risposte, '{}'::jsonb)) as e
  join public.onboarding_domande d on d.chiave = e.key and d.attiva
  where jsonb_typeof(e.value) <> 'null'
    and public.onboarding_risposta_conforme(d.tipo, d.numerica, d.opzioni, e.value);
$$;

comment on function public.onboarding_risposte_filtra(jsonb) is
  'The answers of the questions in use (onboarding_domande.attiva), each only if its question accepts it; null answers go. What questionario_salva writes. No grants.';

revoke all on function public.onboarding_risposte_filtra(jsonb) from public, anon, authenticated;

-- What the sending needs: the required questions in use not answered, in their order; a question of files is
-- answered by one file uploaded on its field (with the client).
drop function public.onboarding_risposte_complete(jsonb);
drop function public.onboarding_risposte_mancanti(jsonb);

create function public.onboarding_risposte_mancanti(p_risposte jsonb, p_client_id uuid default null)
returns text[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(d.chiave order by d.sezione, d.ordine, d.chiave), '{}')
  from public.onboarding_domande d
  cross join lateral (select coalesce(p_risposte, '{}'::jsonb) -> d.chiave as v) as r
  where d.attiva and d.obbligatoria
    and not coalesce(case d.tipo
      when 'file' then
        p_client_id is not null and exists (
          select 1 from public.onboarding_allegati a
          where a.client_id = p_client_id and a.campo = d.allegato ->> 'campo' and a.stato = 'caricato'
        )
      else public.onboarding_risposta_conforme(d.tipo, d.numerica, d.opzioni, r.v) and case
        when d.tipo in ('testo', 'email', 'data') then jsonb_typeof(r.v) = 'string' and public.testo_scritto(r.v #>> '{}')
        when d.tipo in ('scelta', 'numero') then jsonb_typeof(r.v) in ('string', 'number') and (r.v #>> '{}') <> ''
        when d.tipo = 'scelte' then jsonb_typeof(r.v) = 'array' and jsonb_array_length(r.v) > 0
        when d.tipo = 'altezza_peso' then jsonb_typeof(r.v -> 'altezza') = 'number' and jsonb_typeof(r.v -> 'peso') = 'number'
        when d.tipo = 'massimali' then
          jsonb_typeof(r.v -> 'piegamenti') in ('number', 'string')
          and jsonb_typeof(r.v -> 'trazioni') in ('number', 'string')
          and jsonb_typeof(r.v -> 'dip') in ('number', 'string')
        when d.tipo = 'abitudini' then
          (jsonb_typeof(r.v -> 'scelte') = 'array' and jsonb_array_length(r.v -> 'scelte') > 0)
          or (jsonb_typeof(r.v -> 'altro') = 'string' and public.testo_scritto(r.v ->> 'altro'))
        else false
      end
    end, false);
$$;

comment on function public.onboarding_risposte_mancanti(jsonb, uuid) is
  'The keys of the required questions in use not answered yet, in their order (section, then order): a text written (testo_scritto), a choice among its options, a list with one choice at least, height and weight both, the three maximums, a bad habit or a text in «Altro»; a question of files with one file uploaded by the client (p_client_id). No grants.';

revoke all on function public.onboarding_risposte_mancanti(jsonb, uuid) from public, anon, authenticated;

create function public.onboarding_risposte_complete(p_risposte jsonb, p_client_id uuid default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.onboarding_risposte_valide(p_risposte)
     and cardinality(public.onboarding_risposte_mancanti(p_risposte, p_client_id)) = 0;
$$;

comment on function public.onboarding_risposte_complete(jsonb, uuid) is
  'The answers can be sent: valid in shape and every required question in use answered. No grants.';

revoke all on function public.onboarding_risposte_complete(jsonb, uuid) from public, anon, authenticated;

-- The questions in use, as the client's page reads them (never who changed them)
create function public.onboarding_domande_attive()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'chiave', d.chiave,
           'sezione', d.sezione,
           'tipo', d.tipo,
           'testo', d.testo,
           'aiuto', d.aiuto,
           'obbligatoria', d.obbligatoria,
           'lungo', d.lungo,
           'numerica', d.numerica,
           'opzioni', d.opzioni,
           'altro', d.altro,
           'allegato', d.allegato,
           'sistema', d.sistema
         )) order by d.sezione, d.ordine, d.chiave), '[]'::jsonb)
  from public.onboarding_domande d
  where d.attiva;
$$;

comment on function public.onboarding_domande_attive() is
  'The questions in use of the questionnaire, in order, as the client''s page reads them: key, section, kind, words, help, required, options, files. No grants (questionario_cliente gives them).';

revoke all on function public.onboarding_domande_attive() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. The files: a field is the one of a question
-- ---------------------------------------------------------------------------
alter table public.onboarding_allegati drop constraint onboarding_allegati_campo_check;
alter table public.onboarding_allegati add constraint onboarding_allegati_campo_check
  check (campo ~ '^[a-z][a-z0-9_]{1,59}$');

-- the body of 20261113090000_allegati_piu_file.sql, with only the check of the field changed
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

  -- a field of files is the one of a question in use (1.88.0)
  if p_campo is null or not exists (
    select 1 from public.onboarding_domande d where d.attiva and d.allegato ->> 'campo' = p_campo
  ) then
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

-- ---------------------------------------------------------------------------
-- 4. The client's functions: the bodies of 20261109100000_questionario.sql, with the questions given to the page,
--    the answers kept by their questions at the save and the files of a question of files at the sending
-- ---------------------------------------------------------------------------
create or replace function public.questionario_cliente()
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
      'allegati', public.onboarding_allegati_cliente(v_cliente),
      'domande', public.onboarding_domande_attive()
    );
  end if;

  return jsonb_build_object(
    'risposte', q.risposte,
    'versione', q.versione,
    'schermata', q.schermata,
    'inviato_il', q.inviato_il,
    'allegati', public.onboarding_allegati_cliente(v_cliente),
    'domande', public.onboarding_domande_attive()
  );
end;
$$;

comment on function public.questionario_cliente() is
  'The client''s questionnaire: { risposte, versione, schermata, inviato_il, allegati [{ id, campo, nome_file, tipo, byte }] (uploaded only), domande (the questions in use, 1.88.0) }. Nothing saved yet: name and email from the client''s card, versione 0. The step questionario available or in progress (22023 otherwise). Only the caller''s own client (cliente_corrente(), else 42501).';

create or replace function public.questionario_salva(p_risposte jsonb, p_schermata integer, p_versione integer)
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
  -- only the answers of the questions in use, each as its question accepts it (1.88.0: the admin edits them)
  p_risposte := public.onboarding_risposte_filtra(p_risposte);

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
  'The client saves the questionnaire (all the answers, the screen he is on) only over the version he read: with another version nothing is written and the answer is { esito: cambiato, risposte, versione }; else { esito: salvato, versione }. The consent to the health data in force (22023 otherwise), not sent yet, answers of a valid shape; only the answers of the questions in use that hold are kept (1.88.0). The first save starts the step. Only the caller''s own client (else 42501).';

create or replace function public.questionario_invia(p_versione integer)
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

  v_mancanti := public.onboarding_risposte_mancanti(q.risposte, v_cliente);
  if cardinality(v_mancanti) > 0 or not public.onboarding_risposte_complete(q.risposte, v_cliente) then
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
  'The client sends the questionnaire, at the version he read (another version: { esito: cambiato, risposte, versione }). Every required question in use answered, a question of files with a file uploaded (22023 «Mancano delle risposte: completa le parti segnate.» with the missing keys, in order, as a JSON array in the detail of the error). Then inviato_il, the step done, the unlock, the log (never an answer) and the notification to the admins. Returns { esito: inviato, versione, inviato_il }. Only the caller''s own client (else 42501).';
