-- The setter's comment on his day is required (Dany, 08/10/2026: "il commento
-- che lascia il setter quando compila e carica i volumi di chat deve essere
-- obbligatorio, che sia lui o Instagram poi a caricare deve lui sempre
-- lasciare un commento della giornata").
--
-- Required: the two scales (lead_in_target, qualita_conversazioni) and "Cosa
-- frenava i lead dal fissare la call" (cosa_frenava, some text). "Domande e
-- contenuti" and "Altre note" stay optional. From 08/10/2026 on: a day before
-- it keeps the rule it had ("Da completare" on the two scales, never
-- required). Only on a day with activity (DM totali > 0 or conversazioni > 0).
--
-- Nothing here ever blocks a save of the report: "Oggi" saves at every tap,
-- and the day just stays with its comment to write. No column, no constraint
-- on setter_daily_reports. What is required is the setter's decision on an
-- Instagram proposal: he confirms ("Conferma", "Usa quelli di Instagram",
-- "Correggi") or keeps his numbers ("Tieni i miei") only with the comment of
-- that day complete, his saved answers plus the ones he gives with the
-- decision (p_commento, written in the same transaction). The admin decides
-- without it and never writes it: the comment stays the setter's to write
-- (his number in "Oggi" reminds him), never a list or a count for the admin.
--
-- 1. testo_scritto(text): some text, blanks aside (the app's trim(): a blank
--    answer is no answer).
-- 2. commento_da_scrivere(the values of a report): whether the day's
--    required comment is missing. 2026-10-08 is
--    COMMENTO_OBBLIGATORIO_DAL of lib/setting/commento.ts: they change
--    together.
-- 3. report_proposte_instagram_coerenza: the setter's plain discard (an
--    update of the state, without scarta_proposta_instagram) is refused too
--    while his report of that day misses the comment. Copied from
--    20261008100000_proposte_anche_admin.sql, that check added.
-- 4. conferma_proposta_instagram and scarta_proposta_instagram: p_commento,
--    new (copied from 20261008100000_proposte_anche_admin.sql, the new
--    argument and its check added). The signatures change: both are dropped
--    and created again, the new argument last with a default, so every call
--    of the app still finds them.
-- 5. setter_daily_reports_testi_vuoti: a blank "cosa frenava" or "domande e
--    contenuti" is saved as null by every write, not only by the app's
--    forms (a direct PostgREST write of the setter, a correction by hand), so
--    "not written" is always null and the app's count of the days without
--    the comment (cosa_frenava is null) says what commento_da_scrivere says.
--    Never refuses a save.

-- ---------------------------------------------------------------------------
-- 1. Some text
-- ---------------------------------------------------------------------------
-- The whitespace of JavaScript's trim(), and only that: tab, line feed,
-- vertical tab, form feed, carriage return, the Unicode spaces (Zs), the line
-- and paragraph separators and the BOM, so the database and the app agree on
-- a blank answer. Never \s: in the database's locale it takes U+001C-U+001F
-- and U+0085 too, which trim() keeps (a text of them is an answer for the app).
create function public.testo_scritto(p_testo text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    regexp_replace(p_testo, '[\t\n\v\f\r \u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]+', '', 'g') <> '',
    false
  )
$$;

comment on function public.testo_scritto(text) is
  'Whether a free answer says something: not null and not only blanks (the whitespace of JavaScript''s trim()).';

revoke all on function public.testo_scritto(text) from public, anon;
grant execute on function public.testo_scritto(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. The comment to write
-- ---------------------------------------------------------------------------
-- The values of a report, never the row: a function of the row would be a
-- computed field of setter_daily_reports for PostgREST and its generated
-- types, and the row type of the app would carry it.
create function public.commento_da_scrivere(
  p_data date,
  p_dm_outbound integer,
  p_dm_inbound integer,
  p_follow_up integer,
  p_conversazioni integer,
  p_lead_in_target public.quota_in_target,
  p_qualita_conversazioni public.qualita_conversazioni,
  p_cosa_frenava text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_data >= date '2026-10-08'
    and (p_dm_outbound > 0 or p_dm_inbound > 0 or p_follow_up > 0 or p_conversazioni > 0)
    and (
      p_lead_in_target is null
      or p_qualita_conversazioni is null
      or not public.testo_scritto(p_cosa_frenava)
    )
$$;

comment on function public.commento_da_scrivere(date, integer, integer, integer, integer, public.quota_in_target, public.qualita_conversazioni, text) is
  'The setter''s report of a day from 08/10/2026 (COMMENTO_OBBLIGATORIO_DAL) with activity (DM or conversazioni) misses its required comment: lead in target, qualità delle conversazioni or cosa frenava i lead. Never blocks a save; the setter''s decisions on an Instagram proposal need it. Shown to the setter only, on his own days.';

revoke all on function public.commento_da_scrivere(date, integer, integer, integer, integer, public.quota_in_target, public.qualita_conversazioni, text) from public, anon;
grant execute on function public.commento_da_scrivere(date, integer, integer, integer, integer, public.quota_in_target, public.qualita_conversazioni, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The trigger: the setter's plain discard needs the comment too
-- ---------------------------------------------------------------------------
-- A session only decides; the confirmation goes through
-- conferma_proposta_instagram, which writes the report in the same
-- transaction and marks it with a transaction-local setting that PostgREST
-- never lets a client set. The setter may also discard with a plain update of
-- the state; the admin only through scarta_proposta_instagram (its own mark).
-- The setter's plain discard keeps his report as it is, so it needs the
-- report's comment complete (commento_da_scrivere); scarta_proposta_instagram
-- checks it itself, after writing the answers given with the decision.
-- Whoever decides is written in deciso_da, and whether the confirmation
-- corrected the proposal's numbers in corretta (from the values the function
-- received, in its own transaction-local setting). No session (the nightly
-- job, the seed) and the admin without a change of state (unisci_profili
-- moving setter_id or deciso_da, the foreign key emptying deciso_da when
-- elimina_persona removes a person: only those reach the other columns) are
-- free.
create or replace function public.report_proposte_instagram_coerenza()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ruolo public.app_role := public.current_role();
  v_valori jsonb;
begin
  if tg_op = 'UPDATE' and v_ruolo is not null
     and (v_ruolo <> 'admin' or new.stato is distinct from old.stato) then
    if (new.setter_id, new.data, new.dm_outbound, new.dm_inbound, new.follow_up, new.conversazioni,
        new.call_proposte, new.discovery_prenotate, new.chat_lette, new.chat_incerte,
        new.calcolato_il, new.created_at)
       is distinct from
       (old.setter_id, old.data, old.dm_outbound, old.dm_inbound, old.follow_up, old.conversazioni,
        old.call_proposte, old.discovery_prenotate, old.chat_lette, old.chat_incerte,
        old.calcolato_il, old.created_at) then
      raise exception 'Della proposta decidi solo se confermarla o scartarla: i numeri si correggono confermando'
        using errcode = '42501';
    end if;
    if old.stato <> 'da_confermare' then
      raise exception 'Questa proposta è già stata decisa' using errcode = '22023';
    end if;
    if new.stato = 'confermata'
       and current_setting('alpha.conferma_proposta_instagram', true) is distinct from new.id::text then
      raise exception 'La proposta si conferma con Conferma, che scrive i numeri nel report'
        using errcode = '42501';
    end if;
    -- the admin discards from the proposal's card, never with a plain update
    if v_ruolo = 'admin' and new.stato = 'scartata'
       and current_setting('alpha.scarta_proposta_instagram', true) is distinct from new.id::text then
      raise exception 'La proposta si scarta dalla sua scheda, che tiene i numeri del setter'
        using errcode = '42501';
    end if;
    if new.stato not in ('confermata', 'scartata') then
      raise exception 'Una proposta si conferma o si scarta' using errcode = '22023';
    end if;
    -- the setter keeps his numbers only with the comment of his day
    -- (20261008110000): scarta_proposta_instagram checks it after writing
    -- the answers given with the decision, a plain update here
    if v_ruolo = 'setter' and new.stato = 'scartata'
       and current_setting('alpha.scarta_proposta_instagram', true) is distinct from new.id::text
       and exists (
         select 1 from public.setter_daily_reports r
         where r.setter_id = new.setter_id and r.data = new.data
           and public.commento_da_scrivere(r.data, r.dm_outbound, r.dm_inbound, r.follow_up, r.conversazioni,
                                           r.lead_in_target, r.qualita_conversazioni, r.cosa_frenava)
       ) then
      raise exception 'Prima di tenere i tuoi numeri scrivi com''è andata la giornata: lead in target, qualità delle conversazioni e cosa frenava i lead.'
        using errcode = '22023';
    end if;
    new.deciso_il := now();
    new.deciso_da := (select auth.uid());
    -- corrected: one of the numbers written is not the proposal's
    v_valori := nullif(current_setting('alpha.conferma_proposta_valori', true), '')::jsonb;
    new.corretta := new.stato = 'confermata' and v_valori is not null and exists (
      select 1 from jsonb_each(v_valori) e
      where (e.value #>> '{}')::numeric is distinct from (to_jsonb(new) ->> e.key)::numeric
    );
    return new;
  end if;

  -- the moment of the decision follows the state; to decide, nobody decided
  if new.stato = 'da_confermare' then
    new.deciso_il := null;
    new.deciso_da := null;
  elsif new.deciso_il is null or (tg_op = 'UPDATE' and new.stato is distinct from old.stato) then
    new.deciso_il := now();
  end if;
  -- only a confirmation corrects
  if new.stato <> 'confermata' then
    new.corretta := false;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The setter or the admin decides
-- ---------------------------------------------------------------------------
-- Checks p_commento, the setter's answers given with a decision: null or {}
-- for none; otherwise an object with some of lead_in_target,
-- qualita_conversazioni (a level of their scale or null) and cosa_frenava
-- (a text up to 1000 characters or null). A key given is written, a key left
-- out keeps what is saved, null clears it. Never from the admin: the comment
-- is the setter's.
create function public.commento_proposta_valido(p_commento jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_chiave text;
  v_valore jsonb;
begin
  if p_commento is null or p_commento = '{}'::jsonb then
    return '{}'::jsonb;
  end if;
  if public.current_role() is distinct from 'setter' then
    raise exception 'Il commento della giornata lo scrive il setter.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_commento) <> 'object' then
    raise exception 'Commento non valido' using errcode = '22023';
  end if;
  for v_chiave, v_valore in select e.key, e.value from jsonb_each(p_commento) e loop
    if not (v_chiave = any (array['lead_in_target', 'qualita_conversazioni', 'cosa_frenava'])) then
      raise exception 'Questa risposta non si scrive da qui' using errcode = '22023';
    end if;
    if jsonb_typeof(v_valore) = 'null' then
      continue;
    end if;
    if jsonb_typeof(v_valore) <> 'string' then
      raise exception 'Commento non valido' using errcode = '22023';
    end if;
    if v_chiave = 'lead_in_target'
       and not ((v_valore #>> '{}') = any (enum_range(null::public.quota_in_target)::text[])) then
      raise exception 'Scegli uno dei tre livelli' using errcode = '22023';
    end if;
    if v_chiave = 'qualita_conversazioni'
       and not ((v_valore #>> '{}') = any (enum_range(null::public.qualita_conversazioni)::text[])) then
      raise exception 'Scegli uno dei tre livelli' using errcode = '22023';
    end if;
    if v_chiave = 'cosa_frenava' and char_length(v_valore #>> '{}') > 1000 then
      raise exception 'Al massimo 1000 caratteri' using errcode = '22023';
    end if;
  end loop;
  return p_commento;
end;
$$;

comment on function public.commento_proposta_valido(jsonb) is
  'Internal: checks the answers the setter gives with a decision on an Instagram proposal (p_commento of conferma_proposta_instagram and scarta_proposta_instagram) and returns them, {} for none. Refuses them from anyone but the setter (42501).';

revoke all on function public.commento_proposta_valido(jsonb) from public, anon;
grant execute on function public.commento_proposta_valido(jsonb) to authenticated;

-- Confirms the proposal into the report of its setter for its day: the 6
-- numbers from p_valori (the correction: any of dm_outbound, dm_inbound,
-- follow_up, conversazioni, call_proposte, discovery_prenotate, integers 0 to
-- 9999) or from the proposal. Creates the report if missing (setter_id the
-- proposal's setter, created_by whoever confirms); every other field stays as
-- it was. security invoker: the report is written through the policies of
-- whoever calls, the setter's own as "Oggi" writes it (never a day to come),
-- the admin's for every setter. Returns the saved report.
-- p_calcolato_il: when the proposal he saw was computed. A proposal still to
-- decide is recomputed by the nightly job or the admin's "Ricalcola ieri"
-- (instagram_salva_proposta): if it changed after he read it, the
-- confirmation is refused (22023) and he looks at the new numbers first.
-- Never a confirmation of numbers he has not seen, the setter's or the
-- admin's. Null: no check (the app always passes it).
-- p_visti: the setter's own numbers of that day as the card showed them, {}
-- when it showed none (no report, or all six at zero) or all six. The
-- admin's page passes it (the setter's "Oggi" does not: his form saves before
-- he decides). The report is read and locked here, in the transaction of the
-- write: numbers the setter wrote after the card was read are never replaced
-- unseen, not even an instant before the tap (22023 «Loris ha cambiato i suoi
-- numeri di quel giorno…»), and an autosave of his that comes while this
-- runs waits on the row and then finds it changed (salvaReportGiornaliero
-- writes only over the version it read). Null: no check.
-- p_commento (20261008110000): the setter's answers of "Com'è andata la
-- giornata" given with the decision (commento_proposta_valido), written in
-- the same upsert. The setter confirms a day from 08/10/2026 with activity
-- (the numbers he confirms) only with the comment complete, his saved
-- answers plus these (22023). The admin never passes it and never needs it.
drop function public.conferma_proposta_instagram(uuid, jsonb, timestamptz, jsonb);

create function public.conferma_proposta_instagram(
  p_id uuid,
  p_valori jsonb default null,
  p_calcolato_il timestamptz default null,
  p_visti jsonb default null,
  p_commento jsonb default null
)
returns public.setter_daily_reports
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_campi constant text[] := array['dm_outbound', 'dm_inbound', 'follow_up', 'conversazioni', 'call_proposte', 'discovery_prenotate'];
  v_chiave text;
  v_valore jsonb;
  v_stato public.proposta_stato;
  v_proposta public.report_proposte_instagram;
  v_report public.setter_daily_reports;
  v_attuale public.setter_daily_reports;
  v_esiste boolean := false;
  v_visti jsonb;
  v_ora jsonb;
  v_nome text;
  v_commento jsonb;
begin
  if public.current_role() is distinct from 'setter' and not public.is_admin() then
    raise exception 'La proposta la decidono il setter che lavora i DM e l''admin' using errcode = '42501';
  end if;

  if p_valori is not null then
    if jsonb_typeof(p_valori) <> 'object' then
      raise exception 'Correzione non valida' using errcode = '22023';
    end if;
    for v_chiave, v_valore in select e.key, e.value from jsonb_each(p_valori) e loop
      if not (v_chiave = any (v_campi)) then
        raise exception 'Questo numero non si corregge da qui' using errcode = '22023';
      end if;
      if jsonb_typeof(v_valore) <> 'number'
         or (v_valore #>> '{}')::numeric <> trunc((v_valore #>> '{}')::numeric)
         or (v_valore #>> '{}')::numeric < 0
         or (v_valore #>> '{}')::numeric > 9999 then
        raise exception 'I numeri vanno da 0 a 9999, interi' using errcode = '22023';
      end if;
    end loop;
  end if;

  -- the setter's answers given with the decision; never the admin's
  v_commento := public.commento_proposta_valido(p_commento);

  -- the setter's numbers as the card showed them: none, or all six
  if p_visti is not null then
    if jsonb_typeof(p_visti) <> 'object'
       or (select count(*) from jsonb_object_keys(p_visti)) not in (0, 6)
       or exists (
         select 1 from jsonb_each(p_visti) e
         where not (e.key = any (v_campi))
            or jsonb_typeof(e.value) <> 'number'
            or (e.value #>> '{}')::numeric <> trunc((e.value #>> '{}')::numeric)
            or (e.value #>> '{}')::numeric < 0
       ) then
      raise exception 'Numeri del setter non validi' using errcode = '22023';
    end if;
    -- six zeros are no numbers, as on the card
    v_visti := case
      when exists (select 1 from jsonb_each(p_visti) e where (e.value #>> '{}')::numeric > 0)
        then (select jsonb_object_agg(e.key, (e.value #>> '{}')::numeric::integer) from jsonb_each(p_visti) e)
      else '{}'::jsonb
    end;
  end if;

  -- RLS: the setter's own proposals, every proposal for the admin
  select x.stato into v_stato from public.report_proposte_instagram x where x.id = p_id;
  if not found then
    raise exception 'Proposta non trovata' using errcode = 'P0002';
  end if;
  if v_stato = 'confermata' then
    raise exception 'Questa proposta è già stata confermata' using errcode = '22023';
  elsif v_stato = 'scartata' then
    raise exception 'Questa proposta è già stata scartata' using errcode = '22023';
  end if;

  -- claims it: a second tap (his, or the other one's) waits here, then finds
  -- it decided; a recompute running meanwhile is waited for too, then the
  -- numbers are not the ones he saw any more. The trigger reads the values to
  -- write whether they correct the proposal (corretta)
  perform set_config('alpha.conferma_proposta_instagram', p_id::text, true);
  perform set_config('alpha.conferma_proposta_valori', coalesce(p_valori::text, ''), true);
  update public.report_proposte_instagram x
  set stato = 'confermata'
  where x.id = p_id and x.stato = 'da_confermare'
    and (p_calcolato_il is null or x.calcolato_il = p_calcolato_il)
  returning x.* into v_proposta;
  if not found then
    select x.stato into v_stato from public.report_proposte_instagram x where x.id = p_id;
    if v_stato = 'da_confermare' then
      raise exception 'I numeri della proposta sono cambiati: ricontrollali e conferma di nuovo'
        using errcode = '22023';
    elsif v_stato = 'confermata' then
      raise exception 'Questa proposta è già stata confermata' using errcode = '22023';
    elsif v_stato = 'scartata' then
      raise exception 'Questa proposta è già stata scartata' using errcode = '22023';
    end if;
    raise exception 'Questa proposta è già stata decisa' using errcode = '22023';
  end if;
  perform set_config('alpha.conferma_proposta_instagram', '', true);
  perform set_config('alpha.conferma_proposta_valori', '', true);

  -- the "Oggi" screen's message: RLS refuses it anyway for the setter
  if v_proposta.data > public.oggi() then
    raise exception 'Un giorno che non è ancora arrivato non si compila.' using errcode = '42501';
  end if;

  -- over the numbers the card showed only: the setter's report of that day,
  -- locked until the end of this transaction
  if p_visti is not null then
    select r.* into v_attuale
    from public.setter_daily_reports r
    where r.setter_id = v_proposta.setter_id and r.data = v_proposta.data
    for update;
    v_esiste := found;
    v_ora := case
      when v_esiste and greatest(v_attuale.dm_outbound, v_attuale.dm_inbound, v_attuale.follow_up,
                                 v_attuale.conversazioni, v_attuale.call_proposte, v_attuale.discovery_prenotate) > 0
        then jsonb_build_object(
          'dm_outbound', v_attuale.dm_outbound,
          'dm_inbound', v_attuale.dm_inbound,
          'follow_up', v_attuale.follow_up,
          'conversazioni', v_attuale.conversazioni,
          'call_proposte', v_attuale.call_proposte,
          'discovery_prenotate', v_attuale.discovery_prenotate)
      else '{}'::jsonb
    end;
    if v_ora is distinct from v_visti then
      select nullif(split_part(btrim(p.nome), ' ', 1), '') into v_nome
      from public.profiles p where p.id = v_proposta.setter_id;
      raise exception '% ha cambiato i suoi numeri di quel giorno: ricontrollali e decidi di nuovo',
        coalesce(v_nome, 'Il setter')
        using errcode = '22023';
    end if;
  end if;

  -- the answers: a blank text is no answer (null), as "Oggi" saves it
  insert into public.setter_daily_reports as r (
    setter_id, data, dm_outbound, dm_inbound, follow_up, conversazioni, call_proposte,
    discovery_prenotate, lead_in_target, qualita_conversazioni, cosa_frenava, created_by
  )
  values (
    v_proposta.setter_id,
    v_proposta.data,
    coalesce((p_valori ->> 'dm_outbound')::numeric::integer, v_proposta.dm_outbound),
    coalesce((p_valori ->> 'dm_inbound')::numeric::integer, v_proposta.dm_inbound),
    coalesce((p_valori ->> 'follow_up')::numeric::integer, v_proposta.follow_up),
    coalesce((p_valori ->> 'conversazioni')::numeric::integer, v_proposta.conversazioni),
    coalesce((p_valori ->> 'call_proposte')::numeric::integer, v_proposta.call_proposte),
    coalesce((p_valori ->> 'discovery_prenotate')::numeric::integer, v_proposta.discovery_prenotate),
    (v_commento ->> 'lead_in_target')::public.quota_in_target,
    (v_commento ->> 'qualita_conversazioni')::public.qualita_conversazioni,
    case when public.testo_scritto(v_commento ->> 'cosa_frenava') then v_commento ->> 'cosa_frenava' end,
    (select auth.uid())
  )
  on conflict (setter_id, data) do update
    set dm_outbound = excluded.dm_outbound,
        dm_inbound = excluded.dm_inbound,
        follow_up = excluded.follow_up,
        conversazioni = excluded.conversazioni,
        call_proposte = excluded.call_proposte,
        discovery_prenotate = excluded.discovery_prenotate,
        -- a key left out keeps what is saved
        lead_in_target = case when v_commento ? 'lead_in_target'
                              then excluded.lead_in_target else r.lead_in_target end,
        qualita_conversazioni = case when v_commento ? 'qualita_conversazioni'
                                     then excluded.qualita_conversazioni else r.qualita_conversazioni end,
        cosa_frenava = case when v_commento ? 'cosa_frenava'
                            then excluded.cosa_frenava else r.cosa_frenava end
    -- checked against the card: the report it saw (locked above), never one
    -- the setter created in the instant between the check and this write
    where p_visti is null or v_esiste
  returning r.* into v_report;
  if not found then
    select nullif(split_part(btrim(p.nome), ' ', 1), '') into v_nome
    from public.profiles p where p.id = v_proposta.setter_id;
    raise exception '% ha cambiato i suoi numeri di quel giorno: ricontrollali e decidi di nuovo',
      coalesce(v_nome, 'Il setter')
      using errcode = '22023';
  end if;

  -- the setter confirms only with the comment of his day (08/10/2026), on
  -- the report as written: the numbers he confirms, his answers
  if public.current_role() = 'setter'
     and public.commento_da_scrivere(v_report.data, v_report.dm_outbound, v_report.dm_inbound, v_report.follow_up,
                                     v_report.conversazioni, v_report.lead_in_target, v_report.qualita_conversazioni,
                                     v_report.cosa_frenava) then
    raise exception 'Prima di confermare scrivi com''è andata la giornata: lead in target, qualità delle conversazioni e cosa frenava i lead.'
      using errcode = '22023';
  end if;

  return v_report;
end;
$$;

comment on function public.conferma_proposta_instagram(uuid, jsonb, timestamptz, jsonb, jsonb) is
  'The setter confirms his proposal, the admin any proposal (only to be decided, only as they saw it: p_calcolato_il, and with p_visti only over the setter''s numbers the card showed): its 6 numbers, or the correction in p_valori, go into the report of the proposal''s setter for that day through the caller''s RLS (created if missing with created_by the caller, every other field untouched); the proposal becomes confirmed, deciso_da the caller, corretta whether p_valori changed a number. The first decision wins (22023 after). A proposal recomputed after it was read, or a setter''s report changed after the card was read, is refused (22023). p_commento: the setter''s answers of the day, written in the same upsert; the setter confirms a day from 08/10/2026 with activity only with the comment complete (22023), the admin never writes it (42501) and never needs it. Returns the report.';

revoke all on function public.conferma_proposta_instagram(uuid, jsonb, timestamptz, jsonb, jsonb) from public, anon;
grant execute on function public.conferma_proposta_instagram(uuid, jsonb, timestamptz, jsonb, jsonb) to authenticated;

-- Discards the proposal: the setter's own numbers stay.
-- p_commento (20261008110000): the setter's answers of "Com'è andata la
-- giornata" given with the decision (commento_proposta_valido), written into
-- his report of that day (created with only them if missing). The setter
-- keeps his numbers of a day from 08/10/2026 with activity only with the
-- comment complete (22023). The admin never passes it and never needs it.
drop function public.scarta_proposta_instagram(uuid);

create function public.scarta_proposta_instagram(p_id uuid, p_commento jsonb default null)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_stato public.proposta_stato;
  v_commento jsonb;
  v_setter uuid;
  v_data date;
  v_report public.setter_daily_reports;
begin
  if public.current_role() is distinct from 'setter' and not public.is_admin() then
    raise exception 'La proposta la decidono il setter che lavora i DM e l''admin' using errcode = '42501';
  end if;

  -- the setter's answers given with the decision; never the admin's
  v_commento := public.commento_proposta_valido(p_commento);

  -- RLS: the setter's own proposals, every proposal for the admin
  select x.stato into v_stato from public.report_proposte_instagram x where x.id = p_id;
  if not found then
    raise exception 'Proposta non trovata' using errcode = 'P0002';
  end if;
  if v_stato = 'confermata' then
    raise exception 'Questa proposta è già stata confermata' using errcode = '22023';
  elsif v_stato = 'scartata' then
    raise exception 'Questa proposta è già stata scartata' using errcode = '22023';
  end if;

  -- the admin discards only from here (report_proposte_instagram_coerenza);
  -- a second tap (his, or the other one's) waits on the row, then finds it
  -- decided
  perform set_config('alpha.scarta_proposta_instagram', p_id::text, true);
  update public.report_proposte_instagram x
  set stato = 'scartata'
  where x.id = p_id and x.stato = 'da_confermare'
  returning x.setter_id, x.data into v_setter, v_data;
  if not found then
    select x.stato into v_stato from public.report_proposte_instagram x where x.id = p_id;
    if v_stato = 'confermata' then
      raise exception 'Questa proposta è già stata confermata' using errcode = '22023';
    elsif v_stato = 'scartata' then
      raise exception 'Questa proposta è già stata scartata' using errcode = '22023';
    end if;
    raise exception 'Questa proposta è già stata decisa' using errcode = '22023';
  end if;
  perform set_config('alpha.scarta_proposta_instagram', '', true);

  -- the setter keeps his numbers only with the comment of his day
  -- (08/10/2026): his answers given now, then the report as it is
  if public.current_role() = 'setter' then
    if v_commento <> '{}'::jsonb then
      -- the "Oggi" screen's message: RLS refuses it anyway
      if v_data > public.oggi() then
        raise exception 'Un giorno che non è ancora arrivato non si compila.' using errcode = '42501';
      end if;
      insert into public.setter_daily_reports as r (
        setter_id, data, lead_in_target, qualita_conversazioni, cosa_frenava, created_by
      )
      values (
        v_setter,
        v_data,
        (v_commento ->> 'lead_in_target')::public.quota_in_target,
        (v_commento ->> 'qualita_conversazioni')::public.qualita_conversazioni,
        case when public.testo_scritto(v_commento ->> 'cosa_frenava') then v_commento ->> 'cosa_frenava' end,
        (select auth.uid())
      )
      on conflict (setter_id, data) do update
        -- a key left out keeps what is saved
        set lead_in_target = case when v_commento ? 'lead_in_target'
                                  then excluded.lead_in_target else r.lead_in_target end,
            qualita_conversazioni = case when v_commento ? 'qualita_conversazioni'
                                         then excluded.qualita_conversazioni else r.qualita_conversazioni end,
            cosa_frenava = case when v_commento ? 'cosa_frenava'
                                then excluded.cosa_frenava else r.cosa_frenava end
      returning r.* into v_report;
    else
      select r.* into v_report
      from public.setter_daily_reports r
      where r.setter_id = v_setter and r.data = v_data;
    end if;
    -- no report: no numbers, nothing to say
    if v_report.id is not null
       and public.commento_da_scrivere(v_report.data, v_report.dm_outbound, v_report.dm_inbound, v_report.follow_up,
                                       v_report.conversazioni, v_report.lead_in_target, v_report.qualita_conversazioni,
                                       v_report.cosa_frenava) then
      raise exception 'Prima di tenere i tuoi numeri scrivi com''è andata la giornata: lead in target, qualità delle conversazioni e cosa frenava i lead.'
        using errcode = '22023';
    end if;
  end if;
end;
$$;

comment on function public.scarta_proposta_instagram(uuid, jsonb) is
  'The setter discards his proposal, the admin any proposal (only to be decided): the setter''s numbers stay as they are; deciso_da the caller. The first decision wins (22023 after). p_commento: the setter''s answers of the day, written into his report; the setter keeps his numbers of a day from 08/10/2026 with activity only with the comment complete (22023), the admin never writes it (42501) and never needs it.';

revoke all on function public.scarta_proposta_instagram(uuid, jsonb) from public, anon;
grant execute on function public.scarta_proposta_instagram(uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. A blank answer is saved as no answer
-- ---------------------------------------------------------------------------
-- The forms of the app (Oggi, the admin's sheets, Alfire) already send null
-- for a blank text; this holds it for every other write too, so a report
-- never keeps an answer made of blanks. It changes the value, never refuses:
-- "Oggi" saves at every tap. Not the notes ("Altre note"): no rule reads them.
create function public.setter_daily_reports_testi_vuoti()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.cosa_frenava is not null and not public.testo_scritto(new.cosa_frenava) then
    new.cosa_frenava := null;
  end if;
  if new.domande_contenuti is not null and not public.testo_scritto(new.domande_contenuti) then
    new.domande_contenuti := null;
  end if;
  return new;
end;
$$;

comment on function public.setter_daily_reports_testi_vuoti() is
  'Trigger: a blank cosa_frenava or domande_contenuti (only the blanks of JavaScript''s trim(), testo_scritto) is saved as null, by every write: "not written" is always null for the app''s filters (FILTRO_COMMENTO_MANCANTE) as for commento_da_scrivere. Never refuses a save.';

revoke all on function public.setter_daily_reports_testi_vuoti() from public, anon, authenticated;

create trigger setter_daily_reports_testi_vuoti
  before insert or update of cosa_frenava, domande_contenuti on public.setter_daily_reports
  for each row execute function public.setter_daily_reports_testi_vuoti();

-- the rows written before with only blanks (a direct write, a restore with
-- the triggers off): the same rule now
update public.setter_daily_reports
set cosa_frenava = case when public.testo_scritto(cosa_frenava) then cosa_frenava end,
    domande_contenuti = case when public.testo_scritto(domande_contenuti) then domande_contenuti end
where (cosa_frenava is not null and not public.testo_scritto(cosa_frenava))
   or (domande_contenuti is not null and not public.testo_scritto(domande_contenuti));
