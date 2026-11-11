-- The real booked calls (1.76.0, Dany, 11/11/2026: «devono essere contate in automatico quante call di
-- vendita faccio ogni giorno basta andare sul mio calendario… una call taggata nel mio calendario dany
-- discovery call… in questo modo abbiamo il numero esatto e il dettaglio quante call fatte su quanti dm»;
-- in target = 25+ years and «Sì» to the budget question; the calendar is the source of the booked calls
-- everywhere). CLAUDE.md section 33.
--
-- * call_calendario: one row per event of the Google calendar «Dany Discovery Call», read from its secret
--   iCal address (in Vault, calendario_ical) by the server (lib/calendario). Never a name, an Instagram
--   handle, an income or the answers in words: only when it was booked, when it is, cancelled or not, a
--   sales call or not (onboarding, checkpoint, follow-up are not), the age and the budget answer.
-- * calendario_collegamento: one row, the state of the reading (admin reads).
-- * prenotate_per_giorno(p_da, p_a): the booked calls of each day, from the calendar from the first day it
--   covers (calendario_collegamento.dal), from the setters' reports before (and without a calendar).
--   metriche_periodo, metriche_setting (the team row), recap_mese and riepilogo_settimana count with it, so
--   the Panoramica, the funnel, the Setter page, Max's recap, the Friday email and Claude say the same.
-- * setting_contatti(p_da, p_a): the «Setting e contatti» tab of the Setter page (admin).

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------
create table public.calendario_collegamento (
  id boolean primary key default true check (id),
  url_aggiornato_il timestamptz,
  ultimo_sync_il timestamptz,
  ultimo_esito text check (ultimo_esito in ('ok', 'fallito')),
  -- a fixed sentence (lib/calendario/frasi.ts), never the address
  ultimo_errore text check (char_length(ultimo_errore) <= 500),
  ultimo_errore_il timestamptz,
  eventi_letti integer check (eventi_letti >= 0),
  -- the first day the calendar covers: the booked calls come from it from this day on
  dal date,
  updated_by uuid references public.profiles on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
insert into public.calendario_collegamento default values;

create trigger calendario_collegamento_set_updated_at before update on public.calendario_collegamento
  for each row execute function public.set_updated_at();

alter table public.calendario_collegamento enable row level security;
revoke all on public.calendario_collegamento from anon;
revoke insert, update, delete, truncate on public.calendario_collegamento from authenticated;
create policy calendario_collegamento_admin on public.calendario_collegamento
  for select to authenticated using ((select public.is_admin()));
create policy calendario_collegamento_mai_da_oauth on public.calendario_collegamento
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

comment on table public.calendario_collegamento is
  'One row: when the secret iCal address of the calendar «Dany Discovery Call» was saved (the address lives in Vault), the last reading and its error in words, and the first day the calendar covers. Admin reads; written only by the calendario_* functions.';

create table public.call_calendario (
  -- the UID of the iCal event (Calendly writes one per booking)
  uid text primary key check (char_length(uid) between 1 and 300),
  -- when it was booked (CREATED) and when the call is (DTSTART)
  creata_il timestamptz not null,
  programmata_il timestamptz not null,
  cancellata boolean not null default false,
  -- a sales call: not an onboarding, a checkpoint or a follow-up
  di_vendita boolean not null default true,
  -- from the Calendly form; null when the event has no form (added by hand)
  eta smallint check (eta between 5 and 120),
  budget_si boolean,
  -- in target (Dany, 11/11/2026): 25+ and «Sì» to the budget; an event without the budget question
  -- counts the age only, one without the age is not known (null)
  in_target boolean generated always as (
    case when eta is null then null else eta >= 25 and budget_si is distinct from false end
  ) stored,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index call_calendario_creata on public.call_calendario (creata_il);
create index call_calendario_programmata on public.call_calendario (programmata_il);

create trigger call_calendario_set_updated_at before update on public.call_calendario
  for each row execute function public.set_updated_at();

alter table public.call_calendario enable row level security;
revoke all on public.call_calendario from anon;
revoke insert, update, delete, truncate on public.call_calendario from authenticated;
create policy call_calendario_admin on public.call_calendario
  for select to authenticated using ((select public.is_admin()));
create policy call_calendario_mai_da_oauth on public.call_calendario
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

comment on table public.call_calendario is
  'The sales calls of the Google calendar «Dany Discovery Call»: when booked, when held, cancelled, sales or not, age and budget answer from the Calendly form. Never a name, a handle, an income or a text. Admin reads; written only by calendario_salva (service_role).';

-- ---------------------------------------------------------------------------
-- 2. The secret iCal address, in Vault
-- ---------------------------------------------------------------------------
create function public.calendario_imposta_url(p_url text)
returns date
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_url text := btrim(coalesce(p_url, ''), E' \t\r\n"''<>');
  v_id uuid;
begin
  if not public.is_admin() or public.da_client_oauth() then
    raise exception 'Il calendario lo collega l’admin.' using errcode = '42501';
  end if;
  if v_url ~* '^https://calendar\.google\.com/calendar/ical/[^/\s]+/public/basic\.ics$' then
    raise exception 'Questo è l’indirizzo pubblico: tieni il calendario privato e incolla l’«Indirizzo segreto in formato iCal».'
      using errcode = '22023';
  end if;
  if v_url !~* '^https://calendar\.google\.com/calendar/ical/[^/\s?#]+/private-[0-9a-z]{16,}/basic\.ics$'
     or char_length(v_url) > 400 then
    raise exception 'Questo non è l’indirizzo segreto del calendario: copialo da Impostazioni › «Dany Discovery Call» › «Indirizzo segreto in formato iCal».'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('alpha.calendario_ical', 0));
  select s.id into v_id from vault.secrets s where s.name = 'calendario_ical';
  if v_id is null then
    perform vault.create_secret(v_url, 'calendario_ical',
      'Secret iCal address of the calendar «Dany Discovery Call»: read only by the service role (calendario_url)');
  else
    perform vault.update_secret(v_id, v_url);
  end if;

  update public.calendario_collegamento c
  set url_aggiornato_il = now(), ultimo_errore = null, ultimo_errore_il = null, updated_by = (select auth.uid())
  where c.id;
  return (now() at time zone 'Europe/Rome')::date;
end;
$$;

create function public.calendario_togli_url()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() or public.da_client_oauth() then
    raise exception 'Il calendario lo scollega l’admin.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('alpha.calendario_ical', 0));
  delete from vault.secrets s where s.name = 'calendario_ical';
  update public.calendario_collegamento c
  set url_aggiornato_il = null, updated_by = (select auth.uid()) where c.id;
end;
$$;

create function public.calendario_url_presente()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() or public.da_client_oauth() then
    raise exception 'Il collegamento del calendario lo vede l’admin.' using errcode = '42501';
  end if;
  return exists (select 1 from vault.secrets s where s.name = 'calendario_ical');
end;
$$;

create function public.calendario_url()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select d.decrypted_secret from vault.decrypted_secrets d where d.name = 'calendario_ical';
$$;

-- ---------------------------------------------------------------------------
-- 3. The reading: the whole calendar replaces the rows, in one transaction
-- ---------------------------------------------------------------------------
create function public.calendario_salva(p_eventi jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_n integer;
  v_dal date;
begin
  if jsonb_typeof(p_eventi) is distinct from 'array' then
    raise exception 'Eventi non validi' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('alpha.calendario_salva', 0));

  with nuovi as (
    select distinct on (e ->> 'uid')
      left(e ->> 'uid', 300) as uid,
      (e ->> 'creata_il')::timestamptz as creata_il,
      case
        when coalesce(e ->> 'tz', '') <> ''
             and exists (select 1 from pg_catalog.pg_timezone_names z where z.name = e ->> 'tz')
          then (e ->> 'inizio')::timestamp at time zone (e ->> 'tz')
        else (e ->> 'inizio')::timestamp at time zone 'UTC'
      end as programmata_il,
      coalesce((e ->> 'cancellata')::boolean, false) as cancellata,
      coalesce((e ->> 'di_vendita')::boolean, true) as di_vendita,
      case when (e ->> 'eta') ~ '^\d{1,3}$' and (e ->> 'eta')::int between 5 and 120
        then (e ->> 'eta')::smallint end as eta,
      (e ->> 'budget_si')::boolean as budget_si
    from jsonb_array_elements(p_eventi) as e
    where coalesce(e ->> 'uid', '') <> '' and e ? 'creata_il' and e ? 'inizio'
    order by e ->> 'uid'
  ),
  via as (
    delete from public.call_calendario c
    where not exists (select 1 from nuovi n where n.uid = c.uid)
  ),
  scritti as (
    insert into public.call_calendario as c (uid, creata_il, programmata_il, cancellata, di_vendita, eta, budget_si)
    select n.uid, n.creata_il, n.programmata_il, n.cancellata, n.di_vendita, n.eta, n.budget_si
    from nuovi n
    on conflict (uid) do update
    set creata_il = excluded.creata_il, programmata_il = excluded.programmata_il,
        cancellata = excluded.cancellata, di_vendita = excluded.di_vendita,
        eta = excluded.eta, budget_si = excluded.budget_si
    where (c.creata_il, c.programmata_il, c.cancellata, c.di_vendita, c.eta, c.budget_si)
          is distinct from (excluded.creata_il, excluded.programmata_il, excluded.cancellata,
                            excluded.di_vendita, excluded.eta, excluded.budget_si)
  )
  select count(*) into v_n from nuovi;

  select min((c.creata_il at time zone 'Europe/Rome')::date) into v_dal
  from public.call_calendario c where c.di_vendita;

  update public.calendario_collegamento c
  set ultimo_sync_il = now(), ultimo_esito = 'ok', ultimo_errore = null, ultimo_errore_il = null,
      eventi_letti = v_n, dal = v_dal
  where c.id;
  return v_n;
end;
$$;

create function public.calendario_segna_errore(p_errore text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.calendario_collegamento c
  set ultimo_sync_il = now(), ultimo_esito = 'fallito',
      -- never the address: a long token-like word is cut
      ultimo_errore = nullif(left(regexp_replace(coalesce(p_errore, ''), '[^\s]{40,}', '…', 'g'), 500), ''),
      ultimo_errore_il = now()
  where c.id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. The booked calls of each day
-- ---------------------------------------------------------------------------
-- Internal: no grant to a session. The calendar from the first day it covers, the reports before.
create function public.prenotate_giorni_interne(p_da date, p_a date)
returns table (giorno date, prenotate bigint, in_target bigint, senza_dati bigint, da_calendario boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with dal as (
    select c.dal from public.calendario_collegamento c where c.id
  ),
  giorni as (
    select g::date as giorno
    from generate_series(p_da::timestamp, p_a::timestamp, interval '1 day') as g
  ),
  cal as (
    select (c.creata_il at time zone 'Europe/Rome')::date as giorno,
           count(*) as n,
           count(*) filter (where c.in_target) as target,
           count(*) filter (where c.in_target is null) as ignoti
    from public.call_calendario c
    where c.di_vendita
      and (c.creata_il at time zone 'Europe/Rome')::date between p_da and p_a
    group by 1
  ),
  rep as (
    select r.data as giorno, sum(r.discovery_prenotate + r.strategy_prenotate) as n
    from public.setter_daily_reports r
    where r.data between p_da and p_a
    group by 1
  )
  select g.giorno,
         case when d.dal is not null and g.giorno >= d.dal then coalesce(cal.n, 0) else coalesce(rep.n, 0) end::bigint,
         case when d.dal is not null and g.giorno >= d.dal then coalesce(cal.target, 0) end::bigint,
         case when d.dal is not null and g.giorno >= d.dal then coalesce(cal.ignoti, 0) end::bigint,
         (d.dal is not null and g.giorno >= d.dal)
  from giorni g
  left join dal d on true
  left join cal on cal.giorno = g.giorno
  left join rep on rep.giorno = g.giorno
  order by g.giorno;
$$;

-- The same, for the metric functions that run as the person (security invoker): the admin, the business
-- coach inside recap_sales (legge_come_admin), the service role and the cron (no person). Every other
-- session, a deactivated account and every Claude token outside an approved request: 42501.
create function public.prenotate_per_giorno(p_da date, p_a date)
returns table (giorno date, prenotate bigint, in_target bigint, senza_dati bigint, da_calendario boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null and not public.legge_come_admin() then
    raise exception 'Le call prenotate del team le vede solo l''admin' using errcode = '42501';
  end if;
  perform public.verifica_periodo(p_da, p_a);
  return query select * from public.prenotate_giorni_interne(p_da, p_a);
end;
$$;

revoke all on function public.calendario_imposta_url(text) from public, anon;
grant execute on function public.calendario_imposta_url(text) to authenticated;
revoke all on function public.calendario_togli_url() from public, anon;
grant execute on function public.calendario_togli_url() to authenticated;
revoke all on function public.calendario_url_presente() from public, anon;
grant execute on function public.calendario_url_presente() to authenticated;
revoke all on function public.calendario_url() from public, anon, authenticated;
grant execute on function public.calendario_url() to service_role;
revoke all on function public.calendario_salva(jsonb) from public, anon, authenticated;
grant execute on function public.calendario_salva(jsonb) to service_role;
revoke all on function public.calendario_segna_errore(text) from public, anon, authenticated;
grant execute on function public.calendario_segna_errore(text) to service_role;
revoke all on function public.prenotate_giorni_interne(date, date) from public, anon, authenticated;
grant execute on function public.prenotate_giorni_interne(date, date) to service_role;
revoke all on function public.prenotate_per_giorno(date, date) from public, anon;
grant execute on function public.prenotate_per_giorno(date, date) to authenticated, service_role;

comment on function public.calendario_imposta_url(text) is
  'Admin only: stores the secret iCal address of «Dany Discovery Call» in Vault. Refuses the public address.';
comment on function public.calendario_url() is 'service_role only: the secret iCal address, for the server reading.';
comment on function public.calendario_salva(jsonb) is
  'service_role only: replaces call_calendario with the events of the whole calendar, in one transaction.';
comment on function public.prenotate_per_giorno(date, date) is
  'The booked calls of each day: the calendar from calendario_collegamento.dal, the setters'' reports before. Admin, business coach inside recap_sales, service role.';

-- ---------------------------------------------------------------------------
-- 5. The metric functions count the booked calls with prenotate_per_giorno (the bodies as they were,
--    only the booked calls change)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.metriche_periodo(p_da date, p_a date)
 RETURNS TABLE(inizio date, fine date, dm_totali bigint, conversazioni bigint, call_proposte bigint, call_prenotate bigint, strategy_prenotate bigint, tasso_conversazione numeric, tasso_prenotazione numeric, dm_per_call numeric, dm_per_strategy numeric, call_svolte bigint, no_show bigint, qualificate bigint, chiuse bigint, show_rate numeric, tasso_qualificazione numeric, close_rate numeric, close_rate_qualificate numeric, cash_incassato numeric, cash_nuovi_clienti numeric, cash_rate_precedenti numeric, cash_rinnovo numeric, cash_upsell numeric, revenue_firmata numeric, revenue_nuovi numeric, numero_vendite bigint, nuovi_clienti bigint, rinnovi bigint, valore_medio_nuovo numeric, cash_per_call_svolta numeric, cash_per_dm numeric, revenue_per_dm numeric, provvigioni_maturate numeric, costi numeric, margine_operativo numeric, in_scadenza bigint, rinnovati bigint, tasso_rinnovo numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not public.legge_come_admin() then
    raise exception 'Le metriche economiche le vede solo l''admin' using errcode = '42501';
  end if;
  perform public.verifica_periodo(p_da, p_a);

  return query
  with setting as (
    select
      coalesce(sum(r.dm_outbound + r.dm_inbound + r.follow_up), 0)::bigint as dm,
      coalesce(sum(r.conversazioni), 0)::bigint as conv,
      coalesce(sum(r.call_proposte), 0)::bigint as proposte,
      -- the calendar «Dany Discovery Call» from the day it covers, the reports before (1.76.0)
      (select coalesce(sum(pg.prenotate), 0) from public.prenotate_per_giorno(p_da, p_a) pg)::bigint as prenotate,
      coalesce(sum(r.strategy_prenotate), 0)::bigint as strategy
    from public.setter_daily_reports r
    where r.data between p_da and p_a
  ),
  chiamate as (
    select
      count(*) filter (where c.stato = 'svolta') as svolte,
      count(*) filter (where c.stato = 'no_show') as noshow,
      count(*) filter (where c.stato = 'svolta' and c.qualificata) as qualif,
      count(*) filter (where c.esito = 'chiusa') as chiuse_
    from public.calls c
    where (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
  ),
  -- the four parts: every payment of the period falls in exactly one
  cassa as (
    select
      coalesce(sum(p.importo_incassato), 0)::numeric(12, 2) as tot,
      coalesce(sum(p.importo_incassato) filter (where s.tipo = 'nuovo' and s.data_vendita >= p_da), 0)::numeric(12, 2) as entrati,
      coalesce(sum(p.importo_incassato) filter (where s.tipo = 'nuovo' and s.data_vendita < p_da), 0)::numeric(12, 2) as precedenti,
      coalesce(sum(p.importo_incassato) filter (where s.tipo = 'rinnovo'), 0)::numeric(12, 2) as rinn,
      coalesce(sum(p.importo_incassato) filter (where s.tipo = 'upsell'), 0)::numeric(12, 2) as ups
    from public.payments p
    join public.sales s on s.id = p.sale_id
    where p.stato in ('incassata', 'rimborsata')
      and p.incassato_il between p_da and p_a
  ),
  vendite as (
    select
      coalesce(sum(s.valore_contratto), 0)::numeric(12, 2) as revenue,
      coalesce(sum(s.valore_contratto) filter (where s.tipo = 'nuovo'), 0)::numeric(12, 2) as revenue_nuove,
      count(*) as n,
      count(*) filter (where s.tipo = 'nuovo') as nuovi,
      count(*) filter (where s.tipo = 'rinnovo') as rinn
    from public.sales s
    where s.data_vendita between p_da and p_a
  ),
  provvigioni as (
    select coalesce(sum(v.provvigione), 0)::numeric(12, 2) as tot
    from public.v_provvigioni_maturate v
    where v.incassato_il between p_da and p_a
  ),
  spese as (
    select coalesce(sum(e.importo), 0)::numeric(12, 2) as tot
    from public.expenses e
    where e.data between p_da and p_a
  ),
  scadenze as (
    -- clients whose contract ends in the period, and those who renewed within 30 days
    select
      count(distinct s.client_id) as scad,
      count(distinct s.client_id) filter (where exists (
        select 1 from public.sales r
        where r.client_id = s.client_id
          and r.tipo = 'rinnovo'
          and r.data_vendita > s.data_vendita
          and r.data_vendita <= s.data_fine + 30
      )) as rinnovati_
    from public.sales s
    where s.data_fine between p_da and p_a
  )
  select
    p_da, p_a,
    setting.dm, setting.conv, setting.proposte, setting.prenotate, setting.strategy,
    public.rapporto(setting.conv, setting.dm),
    public.rapporto(setting.prenotate, setting.proposte),
    public.rapporto(setting.dm, setting.prenotate),
    public.rapporto(setting.dm, setting.strategy),
    chiamate.svolte, chiamate.noshow, chiamate.qualif, chiamate.chiuse_,
    public.rapporto(chiamate.svolte, chiamate.svolte + chiamate.noshow),
    public.rapporto(chiamate.qualif, chiamate.svolte),
    public.rapporto(chiamate.chiuse_, chiamate.svolte),
    public.rapporto(chiamate.chiuse_, chiamate.qualif),
    cassa.tot, cassa.entrati, cassa.precedenti, cassa.rinn, cassa.ups,
    vendite.revenue, vendite.revenue_nuove, vendite.n, vendite.nuovi, vendite.rinn,
    -- acquisition: only the new clients of the period
    public.rapporto(vendite.revenue_nuove, vendite.nuovi),
    public.rapporto(cassa.entrati, chiamate.svolte),
    public.rapporto(cassa.entrati, setting.dm),
    public.rapporto(vendite.revenue_nuove, setting.dm),
    provvigioni.tot,
    spese.tot,
    (cassa.tot - provvigioni.tot - spese.tot)::numeric(12, 2),
    scadenze.scad, scadenze.rinnovati_,
    public.rapporto(scadenze.rinnovati_, scadenze.scad)
  from setting, chiamate, cassa, vendite, provvigioni, spese, scadenze;
end;
$function$;

CREATE OR REPLACE FUNCTION public.metriche_setting(p_da date, p_a date)
 RETURNS TABLE(setter_id uuid, nome text, giorni_compilati bigint, dm_totali bigint, dm_outbound bigint, dm_inbound bigint, follow_up bigint, conversazioni bigint, call_proposte bigint, call_prenotate bigint, prenotate_inbound bigint, prenotate_outbound bigint, tasso_conversazione numeric, tasso_prenotazione numeric, dm_per_call numeric, call_svolte bigint, no_show bigint, chiuse bigint, show_rate numeric, close_rate numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not public.legge_come_admin() then
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
  ),
  -- the team row counts the calendar (1.76.0); a setter's row keeps his own reports
  cal as (
    select coalesce(sum(pg.prenotate), 0)::bigint as n from public.prenotate_per_giorno(p_da, p_a) pg
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
    coalesce((case when r.sid is null then cal.n else r.prenotate end), 0)::bigint,
    coalesce(pz.da_inbound, 0)::bigint,
    coalesce(pz.da_outbound, 0)::bigint,
    public.rapporto(r.conv, r.dm),
    public.rapporto((case when r.sid is null then cal.n else r.prenotate end), r.proposte),
    public.rapporto(r.dm, (case when r.sid is null then cal.n else r.prenotate end)),
    coalesce(ch.svolte, 0)::bigint,
    coalesce(ch.noshow, 0)::bigint,
    coalesce(ch.chiuse, 0)::bigint,
    public.rapporto(ch.svolte, ch.svolte + ch.noshow),
    public.rapporto(ch.chiuse, ch.svolte)
  from report r
  left join chiamate ch on ch.sid is not distinct from r.sid
  left join prenotazioni pz on pz.sid is not distinct from r.sid
  left join public.profiles pr on pr.id = r.sid
  cross join cal
  order by (r.sid is null), pr.nome;
end;
$function$;

CREATE OR REPLACE FUNCTION public.recap_mese(p_mese date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ruolo public.app_role := public.current_role();
  v_da date;
  v_a date;
  v_prec_da date;
  v_prec_a date;
  v_base jsonb;
  v_riepilogo jsonb;
  v_riepilogo_prec jsonb;
  v_giorni jsonb;
  v_totali jsonb;
begin
  -- the active admin and business coach, from the app; never a Claude token, never another role
  if public.da_client_oauth() or v_ruolo is null or v_ruolo not in ('admin', 'business_coach') then
    raise exception 'Il recap vendite lo leggono l''admin e il business coach.' using errcode = '42501';
  end if;
  if p_mese is null then
    raise exception 'Mese non valido' using errcode = '22023';
  end if;

  v_da := date_trunc('month', p_mese)::date;
  v_a := ((v_da + interval '1 month')::date - 1);
  v_prec_da := (v_da - interval '1 month')::date;
  v_prec_a := v_da - 1;

  -- the tiles: the recap of 1.58.0 on the whole month (it raises and lowers the flag itself)
  v_base := public.recap_sales(v_da, v_a);

  -- the ratio boxes of the Excel, with the official definitions (section 9)
  perform set_config('alpha.recap_sales', 'on', true);

  select jsonb_build_object(
      'dm_totali', m.dm_totali,
      'conversazioni', m.conversazioni,
      'call_proposte', m.call_proposte,
      'call_prenotate', m.call_prenotate,
      'call_svolte', m.call_svolte,
      'no_show', m.no_show,
      'qualificate', m.qualificate,
      'chiuse', m.chiuse,
      'vendite_nuove', m.nuovi_clienti,
      'tasso_conversazione', m.tasso_conversazione,
      'tasso_prenotazione', m.tasso_prenotazione,
      'tasso_dm_qualificate', public.rapporto(m.qualificate, m.dm_totali),
      'dm_per_call', m.dm_per_call,
      'show_rate', m.show_rate,
      'tasso_qualificazione', m.tasso_qualificazione,
      'close_rate', m.close_rate,
      'close_rate_qualificate', m.close_rate_qualificate,
      'cash_nuovi_clienti', m.cash_nuovi_clienti,
      'revenue_nuovi', m.revenue_nuovi,
      'cash_per_dm', m.cash_per_dm,
      'revenue_per_dm', m.revenue_per_dm,
      'cash_per_call_svolta', m.cash_per_call_svolta,
      'valore_medio_nuovo', m.valore_medio_nuovo,
      'cash_medio_chiusura', public.rapporto(m.cash_nuovi_clienti, m.chiuse))
    into v_riepilogo
  from public.metriche_periodo(v_da, v_a) m;

  select jsonb_build_object(
      'dm_totali', m.dm_totali,
      'conversazioni', m.conversazioni,
      'call_proposte', m.call_proposte,
      'call_prenotate', m.call_prenotate,
      'call_svolte', m.call_svolte,
      'no_show', m.no_show,
      'qualificate', m.qualificate,
      'chiuse', m.chiuse,
      'vendite_nuove', m.nuovi_clienti,
      'tasso_conversazione', m.tasso_conversazione,
      'tasso_prenotazione', m.tasso_prenotazione,
      'tasso_dm_qualificate', public.rapporto(m.qualificate, m.dm_totali),
      'dm_per_call', m.dm_per_call,
      'show_rate', m.show_rate,
      'tasso_qualificazione', m.tasso_qualificazione,
      'close_rate', m.close_rate,
      'close_rate_qualificate', m.close_rate_qualificate,
      'cash_nuovi_clienti', m.cash_nuovi_clienti,
      'revenue_nuovi', m.revenue_nuovi,
      'cash_per_dm', m.cash_per_dm,
      'revenue_per_dm', m.revenue_per_dm,
      'cash_per_call_svolta', m.cash_per_call_svolta,
      'valore_medio_nuovo', m.valore_medio_nuovo,
      'cash_medio_chiusura', public.rapporto(m.cash_nuovi_clienti, m.chiuse))
    into v_riepilogo_prec
  from public.metriche_periodo(v_prec_da, v_prec_a) m;

  perform set_config('alpha.recap_sales', '', true);

  -- every day of the month: the setter half and the closer half of the Excel row
  with giorni as (
    select g::date as giorno
    from generate_series(v_da::timestamp, v_a::timestamp, interval '1 day') as g
  ),
  report as (
    select r.data as giorno,
           sum(r.dm_outbound) as dm_out,
           sum(r.dm_inbound) as dm_in,
           sum(r.follow_up) as fup,
           sum(r.conversazioni) as conv,
           sum(r.call_proposte) as proposte,
           sum(r.discovery_prenotate + r.strategy_prenotate) as prenotate
    from public.setter_daily_reports r
    where r.data between v_da and v_a
    group by r.data
  ),
  -- the calls booked that day, by the lead's source, as metriche_setting (never a follow-up call)
  prenotazioni as (
    select (c.created_at at time zone 'Europe/Rome')::date as giorno,
           count(*) filter (where l.fonte = 'dm_inbound') as da_in,
           count(*) filter (where l.fonte = 'dm_outbound') as da_out
    from public.calls c
    join public.leads l on l.id = c.lead_id
    where (c.created_at at time zone 'Europe/Rome')::date between v_da and v_a
      and c.setter_id is not null
      and not c.di_follow_up
    group by 1
  ),
  -- the closer's day, as giornate_closer for every closer
  chiamate as (
    select (c.programmata_il at time zone 'Europe/Rome')::date as giorno,
           count(*) filter (where c.stato = 'svolta') as svolte,
           count(*) filter (where c.stato = 'svolta' and c.qualificata) as qualif,
           count(*) filter (where c.stato = 'no_show') as noshow,
           count(*) filter (where c.stato = 'svolta' and c.esito = 'follow_up') as followup,
           count(*) filter (where c.stato = 'cancellata') as cancellate,
           count(*) filter (where c.stato = 'riprogrammata') as attesa,
           count(*) filter (where c.esito = 'chiusa') as chiuse
    from public.calls c
    where (c.programmata_il at time zone 'Europe/Rome')::date between v_da and v_a
    group by 1
  ),
  incassi as (
    select s.data_vendita as giorno, sum(p.importo_incassato) as cash
    from public.payments p
    join public.sales s on s.id = p.sale_id
    where s.tipo = 'nuovo'
      and p.numero_rata = 1
      and p.stato = 'incassata'
      and s.data_vendita between v_da and v_a
    group by 1
  ),
  firmate as (
    select s.data_vendita as giorno, sum(s.valore_contratto) as revenue
    from public.sales s
    where s.tipo = 'nuovo'
      and s.data_vendita between v_da and v_a
    group by 1
  ),
  righe as (
    select
      g.giorno,
      coalesce(r.dm_out, 0)::bigint as dm_outbound,
      coalesce(r.dm_in, 0)::bigint as dm_inbound,
      coalesce(r.fup, 0)::bigint as follow_up,
      (coalesce(r.dm_out, 0) + coalesce(r.dm_in, 0) + coalesce(r.fup, 0))::bigint as dm_totali,
      coalesce(r.conv, 0)::bigint as conversazioni,
      coalesce(r.proposte, 0)::bigint as call_proposte,
      coalesce(pg.prenotate, 0)::bigint as call_prenotate,
      coalesce(p.da_in, 0)::bigint as prenotate_inbound,
      coalesce(p.da_out, 0)::bigint as prenotate_outbound,
      coalesce(ch.svolte, 0)::bigint as call_svolte,
      coalesce(ch.qualif, 0)::bigint as qualificate,
      coalesce(ch.noshow, 0)::bigint as no_show,
      coalesce(ch.followup, 0)::bigint as call_follow_up,
      coalesce(ch.cancellate, 0)::bigint as cancellate,
      coalesce(ch.attesa, 0)::bigint as in_attesa,
      coalesce(ch.chiuse, 0)::bigint as chiuse,
      coalesce(i.cash, 0)::numeric(12, 2) as cash,
      coalesce(f.revenue, 0)::numeric(12, 2) as revenue
    from giorni g
    left join report r on r.giorno = g.giorno
    -- the booked calls: the calendar from the day it covers, the reports before (1.76.0)
    left join public.prenotate_giorni_interne(v_da, v_a) pg on pg.giorno = g.giorno
    left join prenotazioni p on p.giorno = g.giorno
    left join chiamate ch on ch.giorno = g.giorno
    left join incassi i on i.giorno = g.giorno
    left join firmate f on f.giorno = g.giorno
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
        'giorno', x.giorno,
        'dm_outbound', x.dm_outbound,
        'dm_inbound', x.dm_inbound,
        'follow_up', x.follow_up,
        'dm_totali', x.dm_totali,
        'conversazioni', x.conversazioni,
        'call_proposte', x.call_proposte,
        'call_prenotate', x.call_prenotate,
        'prenotate_inbound', x.prenotate_inbound,
        'prenotate_outbound', x.prenotate_outbound,
        'call_svolte', x.call_svolte,
        'qualificate', x.qualificate,
        'no_show', x.no_show,
        'call_follow_up', x.call_follow_up,
        'cancellate', x.cancellate,
        'in_attesa', x.in_attesa,
        'chiuse', x.chiuse,
        'cash', x.cash,
        'revenue', x.revenue,
        'show_rate', public.rapporto(x.call_svolte, x.call_svolte + x.no_show),
        'close_rate', public.rapporto(x.chiuse, x.call_svolte)
      ) order by x.giorno), '[]'::jsonb),
    jsonb_build_object(
      'dm_outbound', coalesce(sum(x.dm_outbound), 0),
      'dm_inbound', coalesce(sum(x.dm_inbound), 0),
      'follow_up', coalesce(sum(x.follow_up), 0),
      'dm_totali', coalesce(sum(x.dm_totali), 0),
      'conversazioni', coalesce(sum(x.conversazioni), 0),
      'call_proposte', coalesce(sum(x.call_proposte), 0),
      'call_prenotate', coalesce(sum(x.call_prenotate), 0),
      'prenotate_inbound', coalesce(sum(x.prenotate_inbound), 0),
      'prenotate_outbound', coalesce(sum(x.prenotate_outbound), 0),
      'call_svolte', coalesce(sum(x.call_svolte), 0),
      'qualificate', coalesce(sum(x.qualificate), 0),
      'no_show', coalesce(sum(x.no_show), 0),
      'call_follow_up', coalesce(sum(x.call_follow_up), 0),
      'cancellate', coalesce(sum(x.cancellate), 0),
      'in_attesa', coalesce(sum(x.in_attesa), 0),
      'chiuse', coalesce(sum(x.chiuse), 0),
      'cash', coalesce(sum(x.cash), 0)::numeric(12, 2),
      'revenue', coalesce(sum(x.revenue), 0)::numeric(12, 2),
      'show_rate', public.rapporto(sum(x.call_svolte), sum(x.call_svolte) + sum(x.no_show)),
      'close_rate', public.rapporto(sum(x.chiuse), sum(x.call_svolte)))
    into v_giorni, v_totali
  from righe x;

  return jsonb_build_object(
    'mese', v_da,
    'da', v_da,
    'a', v_a,
    'oggi', public.oggi(),
    'precedente_da', v_prec_da,
    'precedente_a', v_prec_a,
    'valori', v_base -> 'valori',
    'precedenti', v_base -> 'precedenti',
    'delta', v_base -> 'delta',
    'riepilogo', v_riepilogo,
    'riepilogo_precedente', v_riepilogo_prec,
    'giorni', v_giorni,
    'totali', v_totali
  );
end;
$function$;

CREATE OR REPLACE FUNCTION public.riepilogo_settimana(p_da date, p_a date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if p_da is null or p_a is null or p_da > p_a then
    raise exception 'Periodo non valido: la data di inizio deve venire prima della fine'
      using errcode = '22023';
  end if;
  if p_a - p_da > 30 then
    raise exception 'Periodo non valido: al massimo 31 giorni' using errcode = '22023';
  end if;

  return jsonb_build_object(
    'da', p_da,
    'a', p_a,
    'cash', (select coalesce(sum(p.importo_incassato), 0)::numeric(12, 2) from public.payments p
             where p.stato in ('incassata', 'rimborsata') and p.incassato_il between p_da and p_a),
    -- the four parts add up to cash: a new sale signed from p_da on is a new
    -- client of the period (an advance cashed before the signature included)
    'cash_per_parte', (select jsonb_build_object(
                  'nuovi_clienti', coalesce(sum(p.importo_incassato) filter (where s.tipo = 'nuovo' and s.data_vendita >= p_da), 0)::numeric(12, 2),
                  'rate_precedenti', coalesce(sum(p.importo_incassato) filter (where s.tipo = 'nuovo' and s.data_vendita < p_da), 0)::numeric(12, 2),
                  'rinnovo', coalesce(sum(p.importo_incassato) filter (where s.tipo = 'rinnovo'), 0)::numeric(12, 2),
                  'upsell', coalesce(sum(p.importo_incassato) filter (where s.tipo = 'upsell'), 0)::numeric(12, 2))
               from public.payments p join public.sales s on s.id = p.sale_id
               where p.stato in ('incassata', 'rimborsata') and p.incassato_il between p_da and p_a),
    'incassi', coalesce((select jsonb_agg(jsonb_build_object(
                  'giorno', p.incassato_il,
                  'cliente', concat_ws(' ', cl.nome, cl.cognome),
                  'importo', p.importo_incassato,
                  'metodo', p.metodo,
                  'rimborso', p.stato = 'rimborsata',
                  'tipo', s.tipo,
                  'numero_rata', p.numero_rata,
                  'numero_rate', s.numero_rate,
                  'parte', case
                             when s.tipo = 'nuovo' and s.data_vendita >= p_da then 'nuovi_clienti'
                             when s.tipo = 'nuovo' then 'rate_precedenti'
                             else s.tipo::text
                           end)
                  order by p.incassato_il, p.importo_incassato desc, p.id)
               from public.payments p join public.sales s on s.id = p.sale_id join public.clients cl on cl.id = s.client_id
               where p.stato in ('incassata', 'rimborsata') and p.incassato_il between p_da and p_a), '[]'::jsonb),
    'vendite', coalesce((select jsonb_agg(jsonb_build_object(
                  'giorno', s.data_vendita,
                  'cliente', concat_ws(' ', cl.nome, cl.cognome), 'tipo', s.tipo, 'valore', s.valore_contratto)
                  order by s.data_vendita, s.valore_contratto desc, s.id)
               from public.sales s join public.clients cl on cl.id = s.client_id
               where s.data_vendita between p_da and p_a), '[]'::jsonb),
    'vendite_per_tipo', (select jsonb_build_object(
                  'nuovo', count(*) filter (where s.tipo = 'nuovo'),
                  'rinnovo', count(*) filter (where s.tipo = 'rinnovo'),
                  'upsell', count(*) filter (where s.tipo = 'upsell'))
               from public.sales s where s.data_vendita between p_da and p_a),
    'in_ritardo', (select jsonb_build_object('numero', count(*), 'totale', coalesce(sum(p.importo_previsto), 0)::numeric(12, 2))
                   from public.payments p where p.stato = 'prevista' and p.scadenza < p_a),
    -- the 8 clients late the longest (each by his oldest late instalment): the
    -- limit comes after the order by due date, never by the client's uuid
    'clienti_in_ritardo', coalesce((select jsonb_agg(x.nome order by x.scadenza, x.nome) from (
                   select d.nome, d.scadenza from (
                     select distinct on (s.client_id) concat_ws(' ', cl.nome, cl.cognome) as nome, p.scadenza
                     from public.payments p join public.sales s on s.id = p.sale_id join public.clients cl on cl.id = s.client_id
                     where p.stato = 'prevista' and p.scadenza < p_a
                     order by s.client_id, p.scadenza) d
                   order by d.scadenza, d.nome limit 8) x), '[]'::jsonb),
    -- all of them: the email says "e altri N" when the names are cut
    'clienti_in_ritardo_totale', (select count(distinct s.client_id)
                   from public.payments p join public.sales s on s.id = p.sale_id
                   where p.stato = 'prevista' and p.scadenza < p_a),
    'in_scadenza_7_giorni', (select jsonb_build_object('numero', count(*), 'totale', coalesce(sum(p.importo_previsto), 0)::numeric(12, 2))
                   from public.payments p
                   where p.stato = 'prevista' and p.scadenza between p_a + 1 and p_a + 7),
    'dm_totali', (select coalesce(sum(r.dm_outbound + r.dm_inbound + r.follow_up), 0) from public.setter_daily_reports r
                  where r.data between p_da and p_a),
    'conversazioni', (select coalesce(sum(r.conversazioni), 0) from public.setter_daily_reports r
                      where r.data between p_da and p_a),
    'call_prenotate', (select coalesce(sum(pg.prenotate), 0) from public.prenotate_giorni_interne(p_da, p_a) pg),
    'call_svolte', (select count(*) from public.calls c
                    where c.stato = 'svolta' and (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a),
    'no_show', (select count(*) from public.calls c
                where c.stato = 'no_show' and (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a),
    'chiuse', (select count(*) from public.calls c
               where c.esito = 'chiusa' and (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a)
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. «Setting e contatti» (the Setter page, admin): DMs, conversations, proposed and booked calls, how
--    many booked are in target, cancelled, held and closed, the ratios, day by day and against the
--    period before. Only team totals: never a person, a lead or a name.
-- ---------------------------------------------------------------------------
create function public.setting_contatti_valori(p_da date, p_a date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with rep as (
    select coalesce(sum(r.dm_outbound), 0)::bigint as dm_out,
           coalesce(sum(r.dm_inbound), 0)::bigint as dm_in,
           coalesce(sum(r.follow_up), 0)::bigint as fup,
           coalesce(sum(r.dm_outbound + r.dm_inbound + r.follow_up), 0)::bigint as dm,
           coalesce(sum(r.conversazioni), 0)::bigint as conv,
           coalesce(sum(r.call_proposte), 0)::bigint as proposte
    from public.setter_daily_reports r
    where r.data between p_da and p_a
  ),
  pren as (
    select coalesce(sum(pg.prenotate), 0)::bigint as n,
           coalesce(sum(pg.prenotate) filter (where pg.da_calendario), 0)::bigint as dal_calendario,
           coalesce(sum(pg.in_target), 0)::bigint as target,
           coalesce(sum(pg.senza_dati), 0)::bigint as ignoti,
           count(*) filter (where pg.da_calendario)::bigint as giorni_calendario,
           count(*)::bigint as giorni
    from public.prenotate_giorni_interne(p_da, p_a) pg
  ),
  agenda as (
    select count(*) filter (where not c.cancellata)::bigint as in_agenda,
           count(*) filter (where c.cancellata)::bigint as cancellate
    from public.call_calendario c
    where c.di_vendita
      and (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
  ),
  chiamate as (
    select count(*) filter (where c.stato = 'svolta')::bigint as svolte,
           count(*) filter (where c.stato = 'no_show')::bigint as noshow,
           count(*) filter (where c.stato = 'svolta' and c.qualificata)::bigint as qualif,
           count(*) filter (where c.esito = 'chiusa')::bigint as chiuse
    from public.calls c
    where (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
  )
  select jsonb_build_object(
    'dm_outbound', rep.dm_out,
    'dm_inbound', rep.dm_in,
    'follow_up', rep.fup,
    'dm_totali', rep.dm,
    'conversazioni', rep.conv,
    'call_proposte', rep.proposte,
    'prenotate', pren.n,
    'prenotate_dal_calendario', pren.dal_calendario,
    'in_target', pren.target,
    'senza_dati', pren.ignoti,
    'giorni_calendario', pren.giorni_calendario,
    'giorni', pren.giorni,
    'in_agenda', agenda.in_agenda,
    'cancellate', agenda.cancellate,
    'svolte', chiamate.svolte,
    'no_show', chiamate.noshow,
    'qualificate', chiamate.qualif,
    'chiuse', chiamate.chiuse,
    'tasso_conversazione', public.rapporto(rep.conv, rep.dm),
    'dm_per_prenotata', public.rapporto(rep.dm, pren.n),
    'conversazioni_per_prenotata', public.rapporto(rep.conv, pren.n),
    'prenotate_su_proposte', public.rapporto(pren.n, rep.proposte),
    'quota_in_target', public.rapporto(pren.target, pren.dal_calendario - pren.ignoti),
    'dm_per_in_target', public.rapporto(rep.dm, pren.target),
    'show_rate', public.rapporto(chiamate.svolte, chiamate.svolte + chiamate.noshow),
    'close_rate', public.rapporto(chiamate.chiuse, chiamate.svolte),
    'chiuse_su_prenotate', public.rapporto(chiamate.chiuse, pren.n)
  )
  from rep, pren, agenda, chiamate;
$$;

create function public.setting_contatti(p_da date, p_a date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_mesi integer;
  v_prec_da date;
  v_prec_a date;
  v_giorni jsonb;
  v_cal jsonb;
  v_valori jsonb;
  v_prec jsonb;
begin
  if not public.is_admin() or public.da_client_oauth() then
    raise exception 'Setting e contatti li vede l''admin' using errcode = '42501';
  end if;
  perform public.verifica_periodo(p_da, p_a);

  -- the period before: the same months when the period is whole months, else the same number of days
  if p_da = date_trunc('month', p_da)::date
     and p_a = (date_trunc('month', p_a) + interval '1 month')::date - 1 then
    v_mesi := (extract(year from p_a) * 12 + extract(month from p_a))::int
            - (extract(year from p_da) * 12 + extract(month from p_da))::int + 1;
    v_prec_da := (p_da - make_interval(months => v_mesi))::date;
  else
    v_prec_da := p_da - (p_a - p_da + 1);
  end if;
  v_prec_a := p_da - 1;

  with giorni as (
    select g::date as giorno
    from generate_series(p_da::timestamp, p_a::timestamp, interval '1 day') as g
  ),
  rep as (
    select r.data as giorno,
           sum(r.dm_outbound) as dm_out, sum(r.dm_inbound) as dm_in, sum(r.follow_up) as fup,
           sum(r.conversazioni) as conv, sum(r.call_proposte) as proposte
    from public.setter_daily_reports r
    where r.data between p_da and p_a
    group by 1
  ),
  chiamate as (
    select (c.programmata_il at time zone 'Europe/Rome')::date as giorno,
           count(*) filter (where c.stato = 'svolta') as svolte,
           count(*) filter (where c.esito = 'chiusa') as chiuse
    from public.calls c
    where (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'giorno', g.giorno,
      'dm_outbound', coalesce(rep.dm_out, 0),
      'dm_inbound', coalesce(rep.dm_in, 0),
      'follow_up', coalesce(rep.fup, 0),
      'conversazioni', coalesce(rep.conv, 0),
      'call_proposte', coalesce(rep.proposte, 0),
      'prenotate', coalesce(pg.prenotate, 0),
      'in_target', pg.in_target,
      'da_calendario', coalesce(pg.da_calendario, false),
      'svolte', coalesce(ch.svolte, 0),
      'chiuse', coalesce(ch.chiuse, 0)
    ) order by g.giorno), '[]'::jsonb)
    into v_giorni
  from giorni g
  left join rep on rep.giorno = g.giorno
  left join public.prenotate_giorni_interne(p_da, p_a) pg on pg.giorno = g.giorno
  left join chiamate ch on ch.giorno = g.giorno;

  select jsonb_build_object(
      'collegato', exists (select 1 from vault.secrets s where s.name = 'calendario_ical'),
      'dal', c.dal,
      'ultimo_sync_il', c.ultimo_sync_il,
      'ultimo_esito', c.ultimo_esito,
      'ultimo_errore', c.ultimo_errore,
      'eventi_letti', c.eventi_letti)
    into v_cal
  from public.calendario_collegamento c where c.id;

  v_valori := public.setting_contatti_valori(p_da, p_a);
  v_prec := public.setting_contatti_valori(v_prec_da, v_prec_a);

  return jsonb_build_object(
    'periodo', jsonb_build_object('da', p_da, 'a', p_a),
    'precedente', jsonb_build_object('da', v_prec_da, 'a', v_prec_a),
    'valori', v_valori,
    'valori_precedenti', v_prec,
    -- the relative change of the counts against the period before; null when the period before is zero
    'delta', (
      select jsonb_object_agg(k, round(public.rapporto((v_valori ->> k)::numeric - (v_prec ->> k)::numeric,
                                                       abs((v_prec ->> k)::numeric)), 4))
      from unnest(array['dm_totali', 'dm_outbound', 'dm_inbound', 'follow_up', 'conversazioni', 'call_proposte',
                        'prenotate', 'in_target', 'svolte', 'chiuse']) as k
    ),
    'giorni', v_giorni,
    'calendario', v_cal
  );
end;
$$;

revoke all on function public.setting_contatti_valori(date, date) from public, anon, authenticated;
grant execute on function public.setting_contatti_valori(date, date) to service_role;
revoke all on function public.setting_contatti(date, date) from public, anon;
grant execute on function public.setting_contatti(date, date) to authenticated;

comment on function public.setting_contatti(date, date) is
  'Admin only: the «Setting e contatti» tab. DMs, conversations, proposed and booked calls (the calendar), in target, cancelled, held, closed, ratios, day by day and the period before. Team totals only.';
