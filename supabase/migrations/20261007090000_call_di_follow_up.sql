-- The follow-up call (Dany, 07/10/2026: "quando apro follow up dovrebbe
-- chiedermi se ho fissato una call o meno di follow up, se sì inserire la
-- data della call di follow up"). A held call that ends in follow-up either
-- goes on by chat, or has a follow-up call booked on a day: a NEW call,
-- linked to the first one. Same lead, same setter (a close on the follow-up
-- is still his sale, and his commission), same closer, same type. It counts
-- in the closer's numbers like every call (held, show rate, close rate, by
-- programmata_il), but it is not one of the setter's bookings: he did not
-- book it, the closer did.
--
-- 1. calls.follow_up_di: the call this one is the follow-up of. One follow-up
--    per call (partial unique index), never itself, always of the same lead.
--    Deleting the first call leaves the follow-up, without the link.
--    calls.di_follow_up: the mark that stays, true on every follow-up call
--    (with the link or after its first call was deleted): the setter's
--    bookings leave these calls out for good.
-- 2. calls_follow_up_coerenza (new trigger, so the setter's and the closer's
--    rules of calls_esito_solo_closer stay as they are): the link points to a
--    call of the same lead (22023), for every session; the setter never
--    inserts a call with a link, and no session but the admin's changes it
--    (42501); the same for di_follow_up. The admin and no session (seed,
--    imports, service role) are free. fissa_follow_up, called by the closer, inserts through here with
--    current_role() = 'closer': an insert with the link from the closer is
--    allowed (he has no insert policy on calls: the RPC is his only path).
-- 3. fissa_follow_up(p_call_id, p_data, p_ora): the one path. The call's
--    closer and the admin, on a held call that ended in follow-up, once.
--    From today on (an earlier hour of today too), at most 6 months ahead;
--    the admin also records a follow-up already held, up to a year back.
--    Always after the first call, with an active closer who can close it.
--    No new lead, the lead's status unchanged (the pipeline is manual,
--    section 8). A closer whose first call's follow-up was handed to another
--    closer hears so, without its day.
-- 3b. call_ha_follow_up(calls): a computed field, whether the call has its
--    follow-up call, also when RLS hides that call from the caller (handed to
--    another closer): the card never says "in chat" and never offers a booking
--    that fails.
-- 4. The setter's bookings (prenotate da inbound / outbound, by created_at)
--    leave the follow-up calls out: metriche_setting, miei_numeri_periodo,
--    giornate_setter. Their last definitions, copied as they are, plus the
--    filter (not di_follow_up). Every metric by programmata_il is unchanged.

-- ---------------------------------------------------------------------------
-- 1. The link
-- ---------------------------------------------------------------------------
alter table public.calls
  add column follow_up_di uuid references public.calls (id) on delete set null,
  add column di_follow_up boolean not null default false,
  add constraint calls_follow_up_non_se_stessa check (follow_up_di <> id),
  -- a linked call is a follow-up call; the mark stays when the link goes
  add constraint calls_follow_up_segnata check (follow_up_di is null or di_follow_up);

-- one follow-up call per call
create unique index calls_follow_up_di_unico
  on public.calls (follow_up_di)
  where follow_up_di is not null;

comment on column public.calls.follow_up_di is
  'The call this one is the follow-up of (fissa_follow_up): same lead, setter, closer and type, booked by the closer or the admin after a held call that ended in follow-up. One per call. It counts in the closer''s numbers like every call, never in the setter''s bookings. Null for every other call, and when the first call is deleted.';

comment on column public.calls.di_follow_up is
  'True on a follow-up call (fissa_follow_up), also after its first call was deleted and follow_up_di went null: the setter''s bookings leave it out for good. Only the admin and no session change it.';

-- ---------------------------------------------------------------------------
-- 2. The link stays coherent
-- ---------------------------------------------------------------------------
-- security definer: the lead of the first call is read whatever RLS lets the
-- session see (the closer reads only his calls, the setter only his own).
create function public.calls_follow_up_coerenza()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ruolo public.app_role := public.current_role();
  v_lead uuid;
begin
  -- a linked call is a follow-up call: the mark comes with the link (the
  -- admin linking one by hand included) and stays when the link goes
  if new.follow_up_di is not null then
    new.di_follow_up := true;
  end if;

  -- the follow-up is of the same lead, for every session: checked when the
  -- link is written or the lead changes
  if new.follow_up_di is not null
     and (tg_op = 'INSERT'
          or new.follow_up_di is distinct from old.follow_up_di
          or new.lead_id is distinct from old.lead_id) then
    select c.lead_id into v_lead
    from public.calls c
    where c.id = new.follow_up_di;
    -- a call that is not there: the foreign key says it
    if found and v_lead is distinct from new.lead_id then
      raise exception 'La call di follow-up è dello stesso lead della call di partenza'
        using errcode = '22023';
    end if;
  end if;

  -- and so are the follow-ups of a call whose lead changes
  if tg_op = 'UPDATE'
     and new.lead_id is distinct from old.lead_id
     and exists (
       select 1 from public.calls f
       where f.follow_up_di = new.id
         and f.lead_id is distinct from new.lead_id
     ) then
    raise exception 'La call di follow-up è dello stesso lead della call di partenza'
      using errcode = '22023';
  end if;

  -- the admin writes everything; seeds, imports and the service role have no session
  if v_ruolo is null or v_ruolo = 'admin' then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- only fissa_follow_up, called by the closer of the call, inserts a
    -- linked call for a session that is not the admin's (the closer has no
    -- insert policy: the RPC is his only path)
    if (new.follow_up_di is not null or new.di_follow_up) and v_ruolo is distinct from 'closer' then
      raise exception 'La call di follow-up la fissano il closer della call e l''admin.'
        using errcode = '42501';
    end if;
    return new;
  end if;

  -- the mark of a follow-up call never changes either
  if new.di_follow_up is distinct from old.di_follow_up then
    raise exception 'Il collegamento della call di follow-up non si cambia'
      using errcode = '42501';
  end if;

  -- the link never changes, except when the first call is deleted (on delete
  -- set null: the first call is already gone)
  if new.follow_up_di is distinct from old.follow_up_di
     and not (
       new.follow_up_di is null
       and not exists (select 1 from public.calls p where p.id = old.follow_up_di)
     ) then
    raise exception 'Il collegamento della call di follow-up non si cambia'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.calls_follow_up_coerenza() is
  'calls.follow_up_di points to a call of the same lead (22023, every session). The setter never inserts a linked or marked call; no session but the admin''s changes the link or di_follow_up (42501), except the on delete set null of the first call. The admin and no session (seed, imports, service role) are free.';

create trigger calls_follow_up_coerenza
  before insert or update on public.calls
  for each row execute function public.calls_follow_up_coerenza();

-- ---------------------------------------------------------------------------
-- 3. fissa_follow_up
-- ---------------------------------------------------------------------------
-- security definer: the closer has no insert policy on calls. Who may do what
-- is checked here, explicitly; calls_esito_solo_closer, calls_traccia_spostamento
-- and calls_follow_up_coerenza still run on the insert, with the caller's role.
create function public.fissa_follow_up(
  p_call_id uuid,
  p_data date,
  p_ora time
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
  v_ruolo public.app_role := public.current_role();
  v_oggi date := public.oggi();
  v_call public.calls%rowtype;
  v_esistente public.calls%rowtype;
  v_nuovo timestamptz;
  v_id uuid;
begin
  if v_ruolo is null or v_ruolo not in ('admin', 'closer') then
    raise exception 'La call di follow-up la fissano il closer della call e l''admin.'
      using errcode = '42501';
  end if;

  -- the first call, locked: two taps at once book one follow-up
  select c.* into v_call
  from public.calls c
  where c.id = p_call_id
  for update;

  if not found then
    raise exception 'Call non trovata.' using errcode = 'P0002';
  end if;

  if v_ruolo = 'closer' and v_call.closer_id is distinct from v_utente then
    raise exception 'Questa call non è assegnata a te.' using errcode = '42501';
  end if;

  if v_call.stato <> 'svolta' or v_call.esito is distinct from 'follow_up' then
    raise exception 'La call di follow-up si fissa su una call svolta finita in follow-up.'
      using errcode = '22023';
  end if;

  -- one follow-up call per call: the one there is moves with "Sposta"
  select c.* into v_esistente
  from public.calls c
  where c.follow_up_di = p_call_id;

  if found then
    -- handed to another closer (the setter hands his calls over): this closer
    -- no longer reads it, so neither its day nor "use Sposta on it"
    if v_ruolo = 'closer' and v_esistente.closer_id is distinct from v_utente then
      raise exception 'Questa call ha già la sua call di follow-up, assegnata a un altro closer.'
        using errcode = '22023';
    end if;
    raise exception '%',
      case
        when v_esistente.stato in ('svolta', 'no_show')
          then format(
            'Questa call ha già la sua call di follow-up, del %s, e ha già il suo esito: ogni call ha una sola call di follow-up.',
            to_char(v_esistente.programmata_il at time zone 'Europe/Rome', 'DD/MM/YYYY "alle" HH24:MI')
          )
        else format(
            'Questa call ha già la sua call di follow-up, il %s: per cambiarla usa Sposta su quella.',
            to_char(v_esistente.programmata_il at time zone 'Europe/Rome', 'DD/MM/YYYY "alle" HH24:MI')
          )
      end
      using errcode = '22023';
  end if;

  -- whoever runs the call must be able to close it, as in fissa_call: an
  -- active closer or admin (a closer deactivated or deleted since: change him
  -- first with the pencil)
  if not exists (
    select 1 from public.profiles p
    where p.id = v_call.closer_id and p.attivo and p.ruolo in ('admin', 'closer')
  ) then
    raise exception 'Il closer di questa call non è attivo o non può chiudere: cambialo prima con la matita'
      using errcode = '22023';
  end if;

  if p_data is null or p_ora is null then
    raise exception 'Scegli il giorno e l''ora della call di follow-up' using errcode = '22023';
  end if;

  -- the windows of the booking and of a move (lib/validation/call.ts): six
  -- months ahead at most; from today on (an earlier hour of today too), the
  -- admin also a follow-up already held, up to a year back
  if p_data > v_oggi + 180 then
    raise exception 'Al massimo 6 mesi da oggi' using errcode = '22023';
  end if;
  if v_ruolo = 'admin' and p_data < v_oggi - 366 then
    raise exception 'Al massimo un anno indietro' using errcode = '22023';
  end if;
  if v_ruolo <> 'admin' and p_data < v_oggi then
    raise exception 'Una call di follow-up si fissa da oggi in avanti' using errcode = '22023';
  end if;

  -- Italian wall-clock time; Postgres handles DST
  v_nuovo := (p_data + p_ora) at time zone 'Europe/Rome';

  if v_nuovo <= v_call.programmata_il then
    raise exception 'La call di follow-up viene dopo la call di partenza, del %: scegli un giorno e un''ora dopo',
      to_char(v_call.programmata_il at time zone 'Europe/Rome', 'DD/MM/YYYY "alle" HH24:MI')
      using errcode = '22023';
  end if;

  -- the same lead, setter, closer and type; still to be held. A follow-up
  -- already held was booked on its day at the latest, as in fissa_call
  insert into public.calls (
    lead_id, setter_id, closer_id, tipo, programmata_il, follow_up_di, di_follow_up, created_by, created_at
  )
  values (
    v_call.lead_id,
    v_call.setter_id,
    v_call.closer_id,
    v_call.tipo,
    v_nuovo,
    v_call.id,
    true,
    v_utente,
    least(now(), v_nuovo)
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function public.fissa_follow_up(uuid, date, time) is
  'Books the follow-up call of a held call that ended in follow-up: a new call (stato programmata) on the chosen day and time (Europe/Rome), with the same lead, setter, closer and type, linked by follow_up_di and marked di_follow_up. The call''s closer or the admin; one per call; the call''s closer active and able to close; from today on and at most 6 months ahead, the admin also up to a year back; always after the first call. No new lead, the lead''s status unchanged. Returns the new call''s id.';

revoke all on function public.fissa_follow_up(uuid, date, time) from public, anon;
grant execute on function public.fissa_follow_up(uuid, date, time) to authenticated;

-- ---------------------------------------------------------------------------
-- 3b. call_ha_follow_up: whether a call has its follow-up call
-- ---------------------------------------------------------------------------
-- A computed field (select=ha_follow_up:call_ha_follow_up). security definer:
-- the follow-up call handed to another closer is hidden from the first call's
-- closer by RLS, and the card would say "Follow-up in chat" and offer a
-- booking that always fails. Only a boolean, and only on a call the caller
-- reads (the policies of calls, checked on the stored row, never on the row
-- passed in): null otherwise.
create function public.call_ha_follow_up(c public.calls)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.calls f where f.follow_up_di = c.id)
  where exists (
    select 1 from public.calls x
    where x.id = c.id
      and (
        public.is_admin()
        or (public.current_role() = 'closer' and x.closer_id = (select auth.uid()))
        or (public.current_role() = 'setter' and x.setter_id = (select auth.uid()))
      )
  )
$$;

comment on function public.call_ha_follow_up(public.calls) is
  'Computed field: whether the call has its follow-up call (calls.follow_up_di), also when RLS hides it from the caller (handed to another closer). Only on a call the caller reads (admin, its closer, its setter); null otherwise. Never its day.';

revoke all on function public.call_ha_follow_up(public.calls) from public, anon;
grant execute on function public.call_ha_follow_up(public.calls) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. The setter's bookings leave the follow-up calls out (not di_follow_up)
-- ---------------------------------------------------------------------------

-- 4a. metriche_setting: 20260929090000_dm_totali.sql plus the filter.
-- Same signature and columns: create or replace, grants unchanged.
create or replace function public.metriche_setting(p_da date, p_a date)
returns table (
  setter_id uuid,
  nome text,
  giorni_compilati bigint,
  dm_totali bigint,
  dm_outbound bigint,
  dm_inbound bigint,
  follow_up bigint,
  conversazioni bigint,
  call_proposte bigint,
  call_prenotate bigint,
  prenotate_inbound bigint,
  prenotate_outbound bigint,
  tasso_conversazione numeric,
  tasso_prenotazione numeric,
  dm_per_call numeric,
  call_svolte bigint,
  no_show bigint,
  chiuse bigint,
  show_rate numeric,
  close_rate numeric
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Le metriche del team le vede solo l''admin' using errcode = '42501';
  end if;

  return query
  with report as (
    select r.setter_id as sid,
           count(*) as giorni,
           sum(r.dm_outbound + r.dm_inbound + r.follow_up) as dm,
           sum(r.dm_outbound) as dm_out,
           sum(r.dm_inbound) as dm_in,
           sum(r.follow_up) as fup,
           sum(r.conversazioni) as conv,
           sum(r.call_proposte) as proposte,
           sum(r.discovery_prenotate + r.strategy_prenotate) as prenotate
    from public.setter_daily_reports r
    where r.data between p_da and p_a
    group by rollup (r.setter_id)
  ),
  chiamate as (
    select c.setter_id as sid,
           count(*) filter (where c.stato = 'svolta') as svolte,
           count(*) filter (where c.stato = 'no_show') as noshow,
           count(*) filter (where c.esito = 'chiusa') as chiuse
    from public.calls c
    where (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
      -- a call whose setter was deleted has none: its null group would collide with the total
      and c.setter_id is not null
    group by rollup (c.setter_id)
  ),
  -- calls booked in the period (the day they were created), by the lead's source
  prenotazioni as (
    select c.setter_id as sid,
           count(*) filter (where l.fonte = 'dm_inbound') as da_inbound,
           count(*) filter (where l.fonte = 'dm_outbound') as da_outbound
    from public.calls c
    join public.leads l on l.id = c.lead_id
    where (c.created_at at time zone 'Europe/Rome')::date between p_da and p_a
      and c.setter_id is not null
      -- a follow-up call is booked by the closer, not by the setter (07/10/2026),
      -- also once its first call is gone (di_follow_up stays)
      and not c.di_follow_up
    group by rollup (c.setter_id)
  )
  select
    r.sid,
    coalesce(pr.nome, 'Totale'),
    coalesce(r.giorni, 0)::bigint,
    coalesce(r.dm, 0)::bigint,
    coalesce(r.dm_out, 0)::bigint,
    coalesce(r.dm_in, 0)::bigint,
    coalesce(r.fup, 0)::bigint,
    coalesce(r.conv, 0)::bigint,
    coalesce(r.proposte, 0)::bigint,
    coalesce(r.prenotate, 0)::bigint,
    coalesce(pz.da_inbound, 0)::bigint,
    coalesce(pz.da_outbound, 0)::bigint,
    public.rapporto(r.conv, r.dm),
    public.rapporto(r.prenotate, r.proposte),
    public.rapporto(r.dm, r.prenotate),
    coalesce(ch.svolte, 0)::bigint,
    coalesce(ch.noshow, 0)::bigint,
    coalesce(ch.chiuse, 0)::bigint,
    public.rapporto(ch.svolte, ch.svolte + ch.noshow),
    public.rapporto(ch.chiuse, ch.svolte)
  from report r
  left join chiamate ch on ch.sid is not distinct from r.sid
  left join prenotazioni pz on pz.sid is not distinct from r.sid
  left join public.profiles pr on pr.id = r.sid
  order by (r.sid is null), pr.nome;
end;
$$;

-- 4b. miei_numeri_periodo: 20260929090000_dm_totali.sql plus the filter.
-- Same signature and columns: create or replace, grants unchanged; miei_numeri
-- reads it and needs no change.
create or replace function public.miei_numeri_periodo(p_da date, p_a date)
returns table (
  dm_totali bigint,
  dm_outbound bigint,
  dm_inbound bigint,
  follow_up bigint,
  conversazioni bigint,
  call_proposte bigint,
  call_prenotate bigint,
  prenotate_inbound bigint,
  prenotate_outbound bigint,
  tasso_conversazione numeric,
  tasso_prenotazione numeric,
  dm_per_call numeric,
  giorni_compilati bigint,
  call_fissate bigint,
  call_svolte bigint,
  no_show bigint,
  chiuse bigint,
  show_rate numeric,
  close_rate numeric,
  provvigioni_maturate numeric,
  provvigioni_pagate numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
begin
  if public.current_role() is distinct from 'setter' then
    raise exception 'Questi sono i numeri del setter' using errcode = '42501';
  end if;
  perform public.verifica_periodo(p_da, p_a);

  return query
  with report as (
    select
      coalesce(sum(r.dm_outbound + r.dm_inbound + r.follow_up), 0)::bigint as dm,
      coalesce(sum(r.dm_outbound), 0)::bigint as dm_out,
      coalesce(sum(r.dm_inbound), 0)::bigint as dm_in,
      coalesce(sum(r.follow_up), 0)::bigint as fup,
      coalesce(sum(r.conversazioni), 0)::bigint as conv,
      coalesce(sum(r.call_proposte), 0)::bigint as proposte,
      coalesce(sum(r.discovery_prenotate + r.strategy_prenotate), 0)::bigint as prenotate,
      count(*) as giorni
    from public.setter_daily_reports r
    where r.setter_id = v_utente and r.data between p_da and p_a
  ),
  chiamate as (
    select
      count(*) as fissate,
      count(*) filter (where c.stato = 'svolta') as svolte,
      count(*) filter (where c.stato = 'no_show') as noshow,
      count(*) filter (where c.esito = 'chiusa') as chiuse_
    from public.calls c
    where c.setter_id = v_utente
      and (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
  ),
  prenotazioni as (
    select
      count(*) filter (where l.fonte = 'dm_inbound') as da_inbound,
      count(*) filter (where l.fonte = 'dm_outbound') as da_outbound
    from public.calls c
    join public.leads l on l.id = c.lead_id
    where c.setter_id = v_utente
      and (c.created_at at time zone 'Europe/Rome')::date between p_da and p_a
      -- a follow-up call is booked by the closer, not by the setter (07/10/2026),
      -- also once its first call is gone (di_follow_up stays)
      and not c.di_follow_up
  ),
  provvigioni as (
    select coalesce(sum(v.provvigione), 0)::numeric(12, 2) as tot
    from public.v_provvigioni_maturate v
    where v.profile_id = v_utente and v.incassato_il between p_da and p_a
  ),
  pagate as (
    select coalesce(sum(cp.importo), 0)::numeric(12, 2) as tot
    from public.commission_payouts cp
    where cp.profile_id = v_utente
      and cp.periodo between date_trunc('month', p_da)::date and p_a
  )
  select
    report.dm, report.dm_out, report.dm_in, report.fup, report.conv, report.proposte, report.prenotate,
    prenotazioni.da_inbound, prenotazioni.da_outbound,
    public.rapporto(report.conv, report.dm),
    public.rapporto(report.prenotate, report.proposte),
    public.rapporto(report.dm, report.prenotate),
    report.giorni,
    chiamate.fissate, chiamate.svolte, chiamate.noshow, chiamate.chiuse_,
    public.rapporto(chiamate.svolte, chiamate.svolte + chiamate.noshow),
    public.rapporto(chiamate.chiuse_, chiamate.svolte),
    provvigioni.tot, pagate.tot
  from report, chiamate, prenotazioni, provvigioni, pagate;
end;
$$;

-- 4c. giornate_setter: 20260929130000_giornate_solo_nuovi.sql plus the filter.
-- Same signature and columns: create or replace, grants unchanged.
create or replace function public.giornate_setter(p_da date, p_a date, p_setter uuid default null)
returns table (
  data date,
  dm_outbound integer,
  dm_inbound integer,
  conversazioni integer,
  call_proposte integer,
  discovery_prenotate integer,
  discovery_svolte integer,
  call_qualificate integer,
  strategy_prenotate integer,
  follow_up integer,
  dm_totali integer,
  prenotate_inbound integer,
  prenotate_outbound integer,
  closer_call integer,
  closer_qualificate integer,
  closer_no_show integer,
  closer_follow_up integer,
  closer_cancellate integer,
  closer_chiuse integer,
  cash numeric,
  revenue numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ruolo public.app_role := public.current_role();
  v_setter uuid;
begin
  if v_ruolo = 'admin' then
    v_setter := p_setter;
  elsif v_ruolo = 'setter' then
    v_setter := (select auth.uid());
  else
    raise exception 'La giornata del setter la vedono l''admin e il setter' using errcode = '42501';
  end if;
  perform public.verifica_periodo(p_da, p_a);

  return query
  with report as (
    select
      r.data as giorno,
      sum(r.dm_outbound) as dm_out,
      sum(r.dm_inbound) as dm_in,
      sum(r.conversazioni) as conv,
      sum(r.call_proposte) as proposte,
      sum(r.discovery_prenotate) as disc_pren,
      sum(r.discovery_svolte) as disc_svolte,
      sum(r.call_qualificate) as qualif,
      sum(r.strategy_prenotate) as strat_pren,
      sum(r.follow_up) as fup
    from public.setter_daily_reports r
    where r.data between p_da and p_a
      and (v_setter is null or r.setter_id = v_setter)
    group by 1
  ),
  chiamate as (
    select
      (c.programmata_il at time zone 'Europe/Rome')::date as giorno,
      count(*) filter (where c.stato = 'svolta') as svolte,
      count(*) filter (where c.stato = 'svolta' and c.qualificata) as qualificate_,
      count(*) filter (where c.stato = 'no_show') as noshow,
      count(*) filter (where c.stato = 'svolta' and c.esito = 'follow_up') as followup,
      count(*) filter (where c.stato = 'cancellata') as cancellate_,
      count(*) filter (where c.esito = 'chiusa') as chiuse_
    from public.calls c
    where (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
      and (case when v_setter is null then c.setter_id is not null else c.setter_id = v_setter end)
    group by 1
  ),
  -- calls booked that day (created), by the lead's source: not typed in the report
  prenotazioni as (
    select
      (c.created_at at time zone 'Europe/Rome')::date as giorno,
      count(*) filter (where l.fonte = 'dm_inbound') as da_inbound,
      count(*) filter (where l.fonte = 'dm_outbound') as da_outbound
    from public.calls c
    join public.leads l on l.id = c.lead_id
    where (c.created_at at time zone 'Europe/Rome')::date between p_da and p_a
      and (case when v_setter is null then c.setter_id is not null else c.setter_id = v_setter end)
      -- a follow-up call is booked by the closer, not by the setter (07/10/2026),
      -- also once its first call is gone (di_follow_up stays)
      and not c.di_follow_up
    group by 1
  ),
  -- the first instalment of the new clients he brought, on the day of the sale
  incassi as (
    select s.data_vendita as giorno, sum(p.importo_incassato) as cash_
    from public.payments p
    join public.sales s on s.id = p.sale_id
    where s.tipo = 'nuovo'
      and p.numero_rata = 1
      and p.stato = 'incassata'
      and s.data_vendita between p_da and p_a
      and (case when v_setter is null then s.setter_id is not null else s.setter_id = v_setter end)
    group by 1
  ),
  firmate as (
    select s.data_vendita as giorno, sum(s.valore_contratto) as revenue_
    from public.sales s
    where s.tipo = 'nuovo'
      and s.data_vendita between p_da and p_a
      and (case when v_setter is null then s.setter_id is not null else s.setter_id = v_setter end)
    group by 1
  ),
  giorni as (
    select rp.giorno from report rp
    union select pz.giorno from prenotazioni pz
    union select ch.giorno from chiamate ch
    union select i.giorno from incassi i
    union select f.giorno from firmate f
  ),
  righe as (
    select
      g.giorno,
      coalesce(rp.dm_out, 0) as dm_out, coalesce(rp.dm_in, 0) as dm_in, coalesce(rp.conv, 0) as conv,
      coalesce(rp.proposte, 0) as proposte, coalesce(rp.disc_pren, 0) as disc_pren,
      coalesce(rp.disc_svolte, 0) as disc_svolte, coalesce(rp.qualif, 0) as qualif,
      coalesce(rp.strat_pren, 0) as strat_pren, coalesce(rp.fup, 0) as fup,
      coalesce(pz.da_inbound, 0) as da_inbound, coalesce(pz.da_outbound, 0) as da_outbound,
      coalesce(ch.svolte, 0) as svolte, coalesce(ch.qualificate_, 0) as qualificate_,
      coalesce(ch.noshow, 0) as noshow, coalesce(ch.followup, 0) as followup,
      coalesce(ch.cancellate_, 0) as cancellate_, coalesce(ch.chiuse_, 0) as chiuse_,
      coalesce(i.cash_, 0) as cash_, coalesce(f.revenue_, 0) as revenue_
    from giorni g
    left join report rp on rp.giorno = g.giorno
    left join prenotazioni pz on pz.giorno = g.giorno
    left join chiamate ch on ch.giorno = g.giorno
    left join incassi i on i.giorno = g.giorno
    left join firmate f on f.giorno = g.giorno
  )
  select
    r.giorno,
    sum(r.dm_out)::integer, sum(r.dm_in)::integer, sum(r.conv)::integer, sum(r.proposte)::integer,
    sum(r.disc_pren)::integer, sum(r.disc_svolte)::integer, sum(r.qualif)::integer,
    sum(r.strat_pren)::integer, sum(r.fup)::integer,
    -- DM totali: outbound + inbound + follow up (conversations do not count)
    (sum(r.dm_out) + sum(r.dm_in) + sum(r.fup))::integer,
    sum(r.da_inbound)::integer, sum(r.da_outbound)::integer,
    sum(r.svolte)::integer, sum(r.qualificate_)::integer, sum(r.noshow)::integer,
    sum(r.followup)::integer, sum(r.cancellate_)::integer, sum(r.chiuse_)::integer,
    sum(r.cash_)::numeric(12, 2), sum(r.revenue_)::numeric(12, 2)
  from righe r
  -- a day counts when the setter wrote it or something happened on it
  where r.giorno in (select rp.giorno from report rp)
     or r.svolte + r.noshow + r.cancellate_ > 0 or r.cash_ <> 0 or r.revenue_ <> 0
     or r.da_inbound + r.da_outbound > 0
  group by grouping sets ((r.giorno), ())
  order by r.giorno desc nulls first;
end;
$$;
