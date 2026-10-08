-- The admin decides the Instagram proposals too (Dany, 08/10/2026: "ma anche
-- io come admin posso approvare? se sì dove? si riesce ad avere una tab con
-- una notifica 'tracciamento setter da approvare'"; asked whether only Loris
-- decides or him too: "Anche tu, con una scheda e la notifica").
--
-- Sections 6, 17 and 19 change with this: the proposal is no longer the
-- setter's alone. The active admin reads the proposals of every setter and
-- decides those still to decide, as the setter does: confirms them (as they
-- are, or corrected) into the SETTER's report of that day, or discards them
-- (the setter's numbers stay). The first decision wins, his or the setter's;
-- who decided stays written (deciso_da) and the setter sees it on his day.
--
-- 1. deciso_da: who decided (null while the proposal is to be decided).
--    Written by the trigger with the session's user, never by hand: the
--    decisions taken before this migration were the setter's (nobody else
--    could decide), so they get his id. on delete set null: a decision of a
--    person deleted later keeps its state and its moment, without a name.
--    corretta: the confirmation wrote numbers other than the proposal's
--    ("Correggi"), so the setter's day says "ha corretto", never "ha
--    confermato i numeri di Instagram" over numbers that are not Instagram's.
--    Written by the trigger too.
-- 2. RLS: the active admin reads every proposal and changes the state of
--    those to decide. The column grant stays update (stato): never the
--    numbers, never deciso_da, never corretta.
-- 3. The trigger: the admin decides only through the two functions (each
--    sets its transaction-local mark, which PostgREST never lets a client
--    set), never a number. Without a change of state (unisci_profili moving
--    setter_id or deciso_da, the foreign key emptying deciso_da) he stays
--    free, as before. The setter keeps his rules (a plain update of the state
--    still discards).
-- 4. conferma_proposta_instagram and scarta_proposta_instagram: the admin's
--    branch. Same checks, same messages, same version check (calcolato_il)
--    for both; the admin writes into the report of the proposal's setter (a
--    report that is missing is born with that setter and created_by = the
--    admin; an existing one keeps every other field, created_by included).
--    p_visti, new: the setter's numbers of that day as the admin's card
--    showed them. The report is read and locked in the same transaction as
--    the write, so the admin never replaces numbers the setter wrote after
--    the card was read, not even an instant before the tap (22023, with the
--    setter's first name). The signature changes: the function is dropped
--    and created again with the fourth argument (a default, so a call with
--    three named arguments still finds it).
-- 5. unisci_profili and elimina_persona need nothing: the loop of
--    unisci_profili over the columns pointing to profiles carries deciso_da
--    to the target, and the foreign key empties it when elimina_persona
--    removes the person.
-- 6. backup_completo: the proposals go in again. They were left out only
--    because the admin did not read them, and the backup is his; a restore
--    brings them back with their state and who decided (lib/backup/formato.ts
--    writes every table it finds in the file, only the missing rows).

-- ---------------------------------------------------------------------------
-- 1. Who decided
-- ---------------------------------------------------------------------------
alter table public.report_proposte_instagram
  add column deciso_da uuid references public.profiles (id) on delete set null;

comment on column public.report_proposte_instagram.deciso_da is
  'Who decided the proposal: its setter or the admin (null while to be decided). Written by report_proposte_instagram_coerenza with the session''s user, never by hand. Null on a decided proposal: the person who decided is no longer in the team, or no session decided it.';

-- the decisions taken so far: only the setter could take them. updated_at
-- stays as it was (nothing the setter did changed); the trigger that runs
-- here is still the one of 20261008090000, which leaves a decided row as it is
alter table public.report_proposte_instagram disable trigger report_proposte_instagram_set_updated_at;
update public.report_proposte_instagram
set deciso_da = setter_id
where stato <> 'da_confermare' and deciso_da is null;
alter table public.report_proposte_instagram enable trigger report_proposte_instagram_set_updated_at;

-- null while to be decided. Not the other way round: a decision keeps its
-- state when the person who took it is deleted (on delete set null).
alter table public.report_proposte_instagram
  add constraint report_proposte_instagram_deciso_da
  check (stato <> 'da_confermare' or deciso_da is null);

-- Confirmed with numbers other than the proposal's. The decisions taken so
-- far stay false: they were the setter's own, and his day says nothing about
-- his own decisions.
alter table public.report_proposte_instagram
  add column corretta boolean not null default false;

alter table public.report_proposte_instagram
  add constraint report_proposte_instagram_corretta
  check (not corretta or stato = 'confermata');

comment on column public.report_proposte_instagram.corretta is
  'The confirmation wrote numbers other than the proposal''s («Correggi» with a number changed): the setter''s day says that whoever decided corrected Instagram''s numbers. Written by report_proposte_instagram_coerenza from the values conferma_proposta_instagram received, never by hand; false while to be decided and on a discarded proposal.';

comment on table public.report_proposte_instagram is
  'The setter''s report of a day as proposed from the Instagram DMs (numbers only, never a text or a username). Read by its setter and by the admin (08/10/2026), who decide it: confirmed into the setter''s report (corrected or not) or discarded; the first decision wins, deciso_da says whose. Written only by the nightly job (service role).';

-- ---------------------------------------------------------------------------
-- 2. The admin reads and decides
-- ---------------------------------------------------------------------------
create policy report_proposte_instagram_admin_lettura on public.report_proposte_instagram
  for select to authenticated
  using (public.is_admin());

-- the state only (column grant), only through the two functions (trigger)
create policy report_proposte_instagram_admin_decide on public.report_proposte_instagram
  for update to authenticated
  using (
    public.is_admin()
    and stato = 'da_confermare'
  )
  with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. The trigger
-- ---------------------------------------------------------------------------
-- A session only decides; the confirmation goes through
-- conferma_proposta_instagram, which writes the report in the same
-- transaction and marks it with a transaction-local setting that PostgREST
-- never lets a client set. The setter may also discard with a plain update of
-- the state; the admin only through scarta_proposta_instagram (its own mark).
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
drop function public.conferma_proposta_instagram(uuid, jsonb, timestamptz);

create function public.conferma_proposta_instagram(
  p_id uuid,
  p_valori jsonb default null,
  p_calcolato_il timestamptz default null,
  p_visti jsonb default null
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

  insert into public.setter_daily_reports as r (
    setter_id, data, dm_outbound, dm_inbound, follow_up, conversazioni, call_proposte,
    discovery_prenotate, created_by
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
    (select auth.uid())
  )
  on conflict (setter_id, data) do update
    set dm_outbound = excluded.dm_outbound,
        dm_inbound = excluded.dm_inbound,
        follow_up = excluded.follow_up,
        conversazioni = excluded.conversazioni,
        call_proposte = excluded.call_proposte,
        discovery_prenotate = excluded.discovery_prenotate
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

  return v_report;
end;
$$;

comment on function public.conferma_proposta_instagram(uuid, jsonb, timestamptz, jsonb) is
  'The setter confirms his proposal, the admin any proposal (only to be decided, only as they saw it: p_calcolato_il, and with p_visti only over the setter''s numbers the card showed): its 6 numbers, or the correction in p_valori, go into the report of the proposal''s setter for that day through the caller''s RLS (created if missing with created_by the caller, every other field untouched); the proposal becomes confirmed, deciso_da the caller, corretta whether p_valori changed a number. The first decision wins (22023 after). A proposal recomputed after it was read, or a setter''s report changed after the card was read, is refused (22023). Returns the report.';

revoke all on function public.conferma_proposta_instagram(uuid, jsonb, timestamptz, jsonb) from public, anon;
grant execute on function public.conferma_proposta_instagram(uuid, jsonb, timestamptz, jsonb) to authenticated;

-- Discards the proposal: the setter's own numbers stay
create or replace function public.scarta_proposta_instagram(p_id uuid)
returns void
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  v_stato public.proposta_stato;
begin
  if public.current_role() is distinct from 'setter' and not public.is_admin() then
    raise exception 'La proposta la decidono il setter che lavora i DM e l''admin' using errcode = '42501';
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

  -- the admin discards only from here (report_proposte_instagram_coerenza);
  -- a second tap (his, or the other one's) waits on the row, then finds it
  -- decided
  perform set_config('alpha.scarta_proposta_instagram', p_id::text, true);
  update public.report_proposte_instagram x
  set stato = 'scartata'
  where x.id = p_id and x.stato = 'da_confermare';
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
end;
$$;

comment on function public.scarta_proposta_instagram(uuid) is
  'The setter discards his proposal, the admin any proposal (only to be decided): the setter''s report stays as it is; deciso_da the caller. The first decision wins (22023 after).';

-- ---------------------------------------------------------------------------
-- 5. unisci_profili and elimina_persona: unchanged (see the header)
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 6. The backup. As in 20260928180000_backup.sql: every table of public, the
--    proposals included again (with their state and who decided). The token
--    stays out (Vault is another schema).
-- ---------------------------------------------------------------------------
create or replace function public.backup_completo()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_risultato jsonb := '{}'::jsonb;
  v_tabella text;
  v_righe jsonb;
begin
  for v_tabella in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
    order by c.relname
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', v_tabella)
      into v_righe;
    v_risultato := v_risultato || jsonb_build_object(v_tabella, v_righe);
  end loop;
  return v_risultato;
end;
$$;

comment on function public.backup_completo() is
  'service_role only: every table of public read at the time of the call (a table added later is never forgotten), the Instagram proposals included (08/10/2026). Never the token: it is in Vault.';

revoke all on function public.backup_completo() from public, anon, authenticated;
grant execute on function public.backup_completo() to service_role;
