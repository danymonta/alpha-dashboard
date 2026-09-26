-- Leads and calls: the setter owns what they booked, the closer what is assigned.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(7);

set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

select ok(
  (select count(*) from public.calls) > 0,
  'il setter vede le proprie call'
);

select is(
  (select count(*)::int from public.calls
   where setter_id <> '22222222-2222-4222-8222-222222222222'),
  0,
  'il setter vede solo le call che ha fissato lui'
);

-- The setter may book a call on their own lead
insert into public.leads (nome, setter_id, fonte)
values ('Lead Di Prova', '22222222-2222-4222-8222-222222222222', 'dm_inbound');

select lives_ok(
  $$ insert into public.calls (lead_id, setter_id, closer_id, tipo, programmata_il)
     select l.id, '22222222-2222-4222-8222-222222222222',
            '33333333-3333-4333-8333-333333333333', 'discovery', now() + interval '1 day'
     from public.leads l where l.nome = 'Lead Di Prova' $$,
  'il setter crea lead e call insieme'
);

-- The closer only sees what is assigned to them, and can close it
set local request.jwt.claims to '{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}';

select is(
  (select count(*)::int from public.calls
   where closer_id <> '33333333-3333-4333-8333-333333333333'),
  0,
  'il closer vede solo le call assegnate a lui'
);

with aggiornate as (
  update public.calls
  set stato = 'svolta', qualificata = true, esito = 'chiusa'
  where closer_id = '33333333-3333-4333-8333-333333333333'
    and stato = 'programmata'
  returning 1
)
select ok(
  (select count(*) from aggiornate) > 0,
  'il closer aggiorna l''esito delle proprie call'
);

with aggiornate as (
  update public.calls set stato = 'svolta', esito = 'persa'
  where closer_id = '11111111-1111-4111-8111-111111111111'
  returning 1
)
select is(
  (select count(*)::int from aggiornate),
  0,
  'il closer non può toccare le call di un altro closer'
);

-- The closer reads the lead behind an assigned call, and nothing else
select ok(
  (select count(*) from public.leads) > 0
  and (select count(*) from public.leads l
       where not exists (
         select 1 from public.calls c
         where c.lead_id = l.id
           and c.closer_id = '33333333-3333-4333-8333-333333333333'
       )) = 0,
  'il closer vede solo i lead delle proprie call'
);

select * from finish();
rollback;
