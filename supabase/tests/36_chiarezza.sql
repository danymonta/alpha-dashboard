-- DM totali on every report row, and whether a commission is due on a sale.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(4);

insert into public.setter_daily_reports (setter_id, data, dm_outbound, dm_inbound, follow_up, conversazioni)
values ('22222222-2222-4222-8222-222222222222', '2036-01-05', 30, 10, 5, 12);

select is(
  (select dm_totali from public.setter_daily_reports where setter_id = '22222222-2222-4222-8222-222222222222' and data = '2036-01-05'),
  45,
  'ogni report porta i suoi DM totali: 30 + 10 + 5, le conversazioni no'
);
select throws_ok(
  $$ update public.setter_daily_reports set dm_totali = 1 where data = '2036-01-05' $$,
  '428C9', null,
  'i DM totali non si scrivono a mano'
);

-- the seed setter has a rule on new sales: a renewal of his is not covered
insert into public.commission_rules (profile_id, percentuale, applica_a, valida_dal)
select '22222222-2222-4222-8222-222222222222', 0.05, '{nuovo}', '2000-01-01'
where not exists (select 1 from public.commission_rules where profile_id = '22222222-2222-4222-8222-222222222222');

set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select is(
  (select bool_and(provvigione_prevista) from public.mie_vendite_setter() where tipo = 'nuovo'),
  true,
  'sulle vendite nuove la provvigione è prevista, anche prima del primo incasso'
);
select is(
  (select bool_or(provvigione_prevista) from public.mie_vendite_setter() where tipo in ('rinnovo', 'upsell')),
  false,
  'su rinnovi e upsell no: la regola copre solo le vendite nuove'
);

select * from finish();
rollback;
