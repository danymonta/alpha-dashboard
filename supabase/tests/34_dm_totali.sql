-- DM totali = outbound + inbound + follow up (conversations do not count);
-- calls booked by source come from the calls, on the day they were booked.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(10);

-- a day in 2035: 30 outbound, 10 inbound, 5 follow up, 12 conversations, 3 discovery booked
insert into public.setter_daily_reports (setter_id, data, dm_outbound, dm_inbound, follow_up, conversazioni,
  call_proposte, discovery_prenotate)
values ('22222222-2222-4222-8222-222222222222', '2035-03-10', 30, 10, 5, 12, 4, 3);

-- the three calls he booked that day: two from inbound DMs, one from outbound
insert into public.leads (id, nome, setter_id, fonte) values
  ('eeee0000-0000-4000-8000-000000000001', 'DM In 1', '22222222-2222-4222-8222-222222222222', 'dm_inbound'),
  ('eeee0000-0000-4000-8000-000000000002', 'DM In 2', '22222222-2222-4222-8222-222222222222', 'dm_inbound'),
  ('eeee0000-0000-4000-8000-000000000003', 'DM Out', '22222222-2222-4222-8222-222222222222', 'dm_outbound');
insert into public.calls (lead_id, setter_id, closer_id, tipo, programmata_il, stato, created_at)
select id, '22222222-2222-4222-8222-222222222222', '11111111-1111-4111-8111-111111111111', 'discovery',
  '2035-03-12 10:00+01', 'programmata', '2035-03-10 18:00+01'
from public.leads where id::text like 'eeee0000-%';

-- a call whose setter was deleted (elimina_persona leaves setter_id null)
insert into public.leads (id, nome, fonte) values ('eeee0000-0000-4000-8000-000000000009', 'Senza setter', 'altro');
insert into public.calls (lead_id, setter_id, closer_id, tipo, programmata_il, stato, created_at)
values ('eeee0000-0000-4000-8000-000000000009', null, '11111111-1111-4111-8111-111111111111', 'discovery',
  '2035-03-10 11:00+01', 'svolta', '2035-03-09 18:00+01');

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select is(
  (select dm_totali from public.metriche_periodo('2035-03-10', '2035-03-10')),
  45::bigint,
  'DM totali = 30 outbound + 10 inbound + 5 follow up; le 12 conversazioni non contano'
);
select is(
  (select tasso_conversazione from public.metriche_periodo('2035-03-10', '2035-03-10')),
  round(12::numeric / 45, 20),
  'tasso di conversazione = conversazioni ÷ DM totali'
);
select is(
  (select dm_per_call from public.metriche_periodo('2035-03-10', '2035-03-10')),
  15::numeric,
  'DM per call prenotata = DM totali ÷ call prenotate (45 ÷ 3)'
);
select is(
  (select array[dm_totali, dm_outbound, dm_inbound, follow_up, prenotate_inbound, prenotate_outbound]
   from public.metriche_setting('2035-03-10', '2035-03-10') where setter_id = '22222222-2222-4222-8222-222222222222'),
  array[45, 30, 10, 5, 2, 1]::bigint[],
  'metriche del setter: i DM divisi e le prenotate per fonte'
);
select is(
  (select array[dm_totali, prenotate_inbound, prenotate_outbound]
   from public.giornate_setter('2035-03-10', '2035-03-10', '22222222-2222-4222-8222-222222222222') where data = '2035-03-10')::bigint[],
  array[45, 2, 1]::bigint[],
  'la giornata del setter porta DM totali e prenotate per fonte'
);

select is(
  (select count(*)::integer from public.metriche_setting('2035-03-10', '2035-03-10') where setter_id is null),
  1,
  'una sola riga Totale anche con una call rimasta senza setter'
);

set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';
select is(
  (select array[dm_totali, dm_outbound, dm_inbound, follow_up, conversazioni, prenotate_inbound, prenotate_outbound]
   from public.miei_numeri_periodo('2035-03-10', '2035-03-10')),
  array[45, 30, 10, 5, 12, 2, 1]::bigint[],
  'i miei numeri: DM inbound, outbound, follow up, totale e prenotate per fonte'
);
select is(
  (select dm_totali from public.miei_numeri('2035-03-01')),
  45::bigint,
  'il mese intero è lo stesso numero'
);
select is(
  (select prenotate_inbound + prenotate_outbound from public.miei_numeri_periodo('2035-03-12', '2035-03-12')),
  0::bigint,
  'le prenotate si contano nel giorno in cui sono state fissate, non in quello della call'
);
select throws_ok($$ select * from public.metriche_setting('2035-03-10', '2035-03-10') $$, '42501', null, 'il setter non vede le metriche di tutti');

select * from finish();
rollback;
