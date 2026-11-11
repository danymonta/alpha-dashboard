-- The real booked calls from the calendar «Dany Discovery Call» (1.76.0, 20261107090000_calendario_call.sql):
-- the reading replaces the rows, in target is 25+ and «Sì» to the budget, the booked calls of each day come
-- from the calendar from the first day it covers and from the reports before, and every count that says
-- «call prenotate» (metriche_periodo, metriche_setting, recap_mese, riepilogo_settimana, setting_contatti)
-- says the same. Only the admin reads the calendar and «Setting e contatti»; the address lives in Vault.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(35);

create or replace function pg_temp.web(p_utente uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_utente, 'role', 'authenticated')::text, true);
  set local role authenticated;
end $$;

create or replace function pg_temp.codice(p_sql text)
returns text language plpgsql as $$
begin
  execute p_sql;
  return 'ok';
exception when others then
  return sqlstate;
end $$;

-- ---------------------------------------------------------------------------
-- Fixtures (as postgres): March 2024, far from the seed. The setter's reports say 3 booked on the 2nd and
-- 5 on the 20th.
-- ---------------------------------------------------------------------------
delete from public.call_calendario;
update public.calendario_collegamento set dal = null;
insert into public.setter_daily_reports (setter_id, data, dm_outbound, dm_inbound, follow_up, conversazioni,
  call_proposte, discovery_prenotate)
values ('22222222-2222-4222-8222-222222222222', '2024-03-02', 40, 10, 5, 20, 4, 3),
       ('22222222-2222-4222-8222-222222222222', '2024-03-20', 60, 20, 10, 30, 6, 5)
on conflict (setter_id, data) do update
set dm_outbound = excluded.dm_outbound, dm_inbound = excluded.dm_inbound, follow_up = excluded.follow_up,
    conversazioni = excluded.conversazioni, call_proposte = excluded.call_proposte,
    discovery_prenotate = excluded.discovery_prenotate, strategy_prenotate = 0;
delete from public.setter_daily_reports
where data between '2024-03-01' and '2024-03-31' and data not in ('2024-03-02', '2024-03-20');

-- Without the calendar: the reports
select is(
  (select sum(prenotate)::int from public.prenotate_giorni_interne('2024-03-01', '2024-03-31')),
  8, 'senza calendario le prenotate sono quelle dei report'
);

-- ---------------------------------------------------------------------------
-- The reading (service role)
-- ---------------------------------------------------------------------------
set local role service_role;
select is(
  public.calendario_salva($j$[
    {"uid":"a@calendly","creata_il":"2024-03-10T09:00:00Z","inizio":"2024-03-15T19:30:00","tz":"Europe/Rome","eta":"30","budget_si":true},
    {"uid":"b@calendly","creata_il":"2024-03-10T10:00:00Z","inizio":"2024-03-16T18:00:00Z","eta":"22","budget_si":true},
    {"uid":"c@calendly","creata_il":"2024-03-11T10:00:00Z","inizio":"2024-03-15T18:00:00Z","cancellata":true,"eta":"40"},
    {"uid":"d@calendly","creata_il":"2024-03-11T11:00:00Z","inizio":"2024-03-18T18:00:00Z"},
    {"uid":"e@calendly","creata_il":"2024-03-09T11:00:00Z","inizio":"2024-03-19T18:00:00Z","di_vendita":false,"eta":"35"},
    {"uid":"a@calendly","creata_il":"2024-03-10T09:00:00Z","inizio":"2024-03-15T19:30:00","tz":"Europe/Rome","eta":"30","budget_si":true}
  ]$j$::jsonb),
  5, 'la lettura salva gli eventi, un uid una volta sola'
);
reset role;

select is((select dal from public.calendario_collegamento), '2024-03-10'::date,
  'il calendario conta dal primo giorno di una call di vendita');
select is((select programmata_il from public.call_calendario where uid = 'a@calendly'),
  '2024-03-15 18:30:00+00'::timestamptz, 'l''ora col fuso del calendario');
select is((select programmata_il from public.call_calendario where uid = 'b@calendly'),
  '2024-03-16 18:00:00+00'::timestamptz, 'l''ora in UTC');
select is(
  (select array_agg(uid || ':' || coalesce(in_target::text, 'null') order by uid) from public.call_calendario),
  array['a@calendly:true', 'b@calendly:false', 'c@calendly:true', 'd@calendly:null', 'e@calendly:true'],
  'in target: 25+ e budget sì; senza la domanda sul budget conta l''età; senza età non si sa'
);
select is((select ultimo_esito from public.calendario_collegamento), 'ok', 'la lettura è riuscita');

-- The days: the reports before the 10th, the calendar from the 10th (the report of the 20th no longer counts)
select is(
  (select sum(prenotate)::int from public.prenotate_giorni_interne('2024-03-01', '2024-03-31')),
  7, 'prima del calendario i report (3), dal calendario le call di vendita (4)'
);
select is(
  (select row(sum(in_target), sum(senza_dati))::text from public.prenotate_giorni_interne('2024-03-01', '2024-03-31')),
  row(2::numeric, 1::numeric)::text, 'in target e senza dati, solo dai giorni del calendario'
);
select is(
  (select array_agg(giorno::text || ':' || prenotate order by giorno)
   from public.prenotate_giorni_interne('2024-03-09', '2024-03-11')),
  array['2024-03-09:0', '2024-03-10:2', '2024-03-11:2'],
  'per giorno di prenotazione; un onboarding non conta'
);

-- ---------------------------------------------------------------------------
-- Every count says the same
-- ---------------------------------------------------------------------------
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select is((select call_prenotate::int from public.metriche_periodo('2024-03-01', '2024-03-31')), 7,
  'metriche_periodo: le prenotate del calendario');
select is((select valore::int from public.funnel_periodo('2024-03-01', '2024-03-31') where ordine = 3), 7,
  'il funnel');
select is((select call_prenotate::int from public.metriche_setting('2024-03-01', '2024-03-31') where setter_id is null), 7,
  'metriche_setting: la riga del team');
select is((select call_prenotate::int from public.metriche_setting('2024-03-01', '2024-03-31')
           where setter_id = '22222222-2222-4222-8222-222222222222'), 8,
  'metriche_setting: la riga del setter resta i suoi report');
select is((public.recap_mese('2024-03-01') -> 'totali' ->> 'call_prenotate')::int, 7, 'recap_mese: i totali del mese');
select is((public.recap_mese('2024-03-01') -> 'riepilogo' ->> 'call_prenotate')::int, 7, 'recap_mese: il riepilogo');
select is((select sum(prenotate)::int from public.prenotate_per_giorno('2024-03-01', '2024-03-31')), 7,
  'prenotate_per_giorno: l''admin');

select is((public.setting_contatti('2024-03-01', '2024-03-31') -> 'valori' ->> 'prenotate')::int, 7,
  'setting_contatti: le prenotate');
select is(
  (select row(v ->> 'in_target', v ->> 'senza_dati', v ->> 'cancellate', v ->> 'in_agenda', v ->> 'dm_totali',
              v ->> 'dm_outbound', v ->> 'dm_inbound')::text
   from (select public.setting_contatti('2024-03-01', '2024-03-31') -> 'valori' as v) x),
  row('2', '1', '1', '3', '145', '100', '30')::text,
  'setting_contatti: in target, senza dati, cancellate e in agenda per giorno della call, i DM dei report'
);
select is(
  round((public.setting_contatti('2024-03-01', '2024-03-31') -> 'valori' ->> 'quota_in_target')::numeric, 4),
  round(2::numeric / 3, 4), 'la quota in target è sulle prenotate del calendario con i dati'
);
select is(
  (public.setting_contatti('2024-03-01', '2024-03-31') -> 'precedente' ->> 'da')::date, '2024-02-01'::date,
  'un mese intero si confronta col mese prima'
);
select is(jsonb_array_length(public.setting_contatti('2024-03-01', '2024-03-31') -> 'giorni'), 31, 'un giorno per riga');
reset role;
set local request.jwt.claims to '{}';

-- The Friday email (service role)
set local role service_role;
select is((public.riepilogo_settimana('2024-03-08', '2024-03-14') ->> 'call_prenotate')::int, 4,
  'il riepilogo del venerdì conta il calendario');
reset role;

-- The business coach reads it only inside his recap
select pg_temp.web('bc000000-0000-4000-8000-000000000001');
select is((public.recap_mese('2024-03-01') -> 'totali' ->> 'call_prenotate')::int, 7, 'il business coach nel suo recap');
select is(pg_temp.codice($$ select * from public.prenotate_per_giorno('2024-03-01', '2024-03-31') $$), '42501',
  'il business coach fuori dal recap: 42501');
select is((select count(*)::int from public.call_calendario), 0, 'il business coach non legge il calendario');
reset role;
set local request.jwt.claims to '{}';

-- The setter and marketing: nothing
select pg_temp.web('22222222-2222-4222-8222-222222222222');
select is((select count(*)::int from public.call_calendario), 0, 'il setter non legge il calendario');
select is(pg_temp.codice($$ select public.setting_contatti('2024-03-01', '2024-03-31') $$), '42501',
  'il setter non legge Setting e contatti');
select is(pg_temp.codice($$ select * from public.prenotate_per_giorno('2024-03-01', '2024-03-31') $$), '42501',
  'il setter non legge le prenotate del team');
reset role;
set local request.jwt.claims to '{}';
select pg_temp.web('61616161-6161-4161-8161-616161616161');
select is((select count(*)::int from public.call_calendario), 0, 'il marketing non legge il calendario');
reset role;
set local request.jwt.claims to '{}';

-- ---------------------------------------------------------------------------
-- The address: only the secret one, only the admin
-- ---------------------------------------------------------------------------
select pg_temp.web('11111111-1111-4111-8111-111111111111');
select is(pg_temp.codice($$ select public.calendario_imposta_url('https://calendar.google.com/calendar/ical/abc%40group.calendar.google.com/public/basic.ics') $$),
  '22023', 'l''indirizzo pubblico si rifiuta');
select is(pg_temp.codice($$ select public.calendario_imposta_url('https://esempio.com/calendario.ics') $$),
  '22023', 'un altro indirizzo si rifiuta');
select is(public.calendario_imposta_url(' https://calendar.google.com/calendar/ical/abc%40group.calendar.google.com/private-0123456789abcdef0123456789abcdef/basic.ics '),
  (now() at time zone 'Europe/Rome')::date, 'l''indirizzo segreto si salva');
select ok(public.calendario_url_presente(), 'e l''admin sa solo che c''è');
reset role;
set local request.jwt.claims to '{}';
select pg_temp.web('22222222-2222-4222-8222-222222222222');
select is(pg_temp.codice($$ select public.calendario_togli_url() $$), '42501', 'il setter non lo toglie');
reset role;
set local request.jwt.claims to '{}';

select * from finish();
rollback;
