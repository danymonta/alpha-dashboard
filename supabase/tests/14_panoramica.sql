-- Overview extras: funnel conversions and today's numbers.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(5);

-- April 2031: 100 DM, 20 convos, 5 booked; 4 held, 1 closed
insert into public.setter_daily_reports (setter_id, data, dm_outbound, dm_inbound, conversazioni,
  discovery_prenotate, strategy_prenotate)
values ('22222222-2222-4222-8222-222222222222', '2031-04-02', 80, 20, 20, 4, 1);

insert into public.leads (id, nome, setter_id, fonte)
values ('aeae0000-0000-4000-8000-000000000001', 'Funnel', '22222222-2222-4222-8222-222222222222', 'dm_inbound');

insert into public.calls (lead_id, setter_id, closer_id, tipo, programmata_il, stato, qualificata, esito)
select 'aeae0000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222',
       '33333333-3333-4333-8333-333333333333', 'discovery', '2031-04-10 15:00+02', 'svolta', true,
       v.esito::public.call_outcome
from (values ('chiusa'), ('follow_up'), ('follow_up'), ('persa')) as v(esito);

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}';

select is(
  (select array_agg(valore order by ordine) from public.funnel_mese('2031-04-01')),
  array[100, 20, 5, 4, 1]::bigint[],
  'funnel: DM, conversazioni, prenotate, svolte, chiuse'
);

select is(
  (select array_agg(coalesce(passaggio, -1) order by ordine) from public.funnel_mese('2031-04-01')),
  array[-1, 0.2, 0.25, 0.8, 0.25]::numeric[],
  'passaggi: 20/100, 5/20, 4/5, 1/4; la prima fase non ha passaggio'
);

select is(
  (select dm_totali from public.oggi_team()),
  (select coalesce(sum(dm_outbound + dm_inbound + follow_up), 0)::bigint
   from public.setter_daily_reports where data = public.oggi()),
  'oggi_team somma i DM dei report di oggi, follow up compresi'
);

select ok(
  (select cash_incassato is not null and cash_nuovi_clienti is not null and call_in_programma is not null from public.oggi_team()),
  'oggi_team restituisce sempre una riga completa, anche a zero'
);

set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select throws_ok($$ select * from public.oggi_team() $$, '42501');

select * from finish();
rollback;
