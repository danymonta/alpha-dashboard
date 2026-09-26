-- The Oggi screen saves with INSERT ... ON CONFLICT (setter_id, data) DO UPDATE.
-- RLS must allow both halves on any past day and refuse the future.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path to extensions, public;

select plan(5);

delete from public.setter_daily_reports
where setter_id = '22222222-2222-4222-8222-222222222222'
  and data = public.oggi();

set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}';

-- First touch: the row does not exist yet, the upsert creates it
insert into public.setter_daily_reports (setter_id, data, dm_outbound, created_by)
values ('22222222-2222-4222-8222-222222222222', public.oggi(), 12,
        '22222222-2222-4222-8222-222222222222')
on conflict (setter_id, data) do update set dm_outbound = excluded.dm_outbound;

select is(
  (select dm_outbound from public.setter_daily_reports
   where setter_id = '22222222-2222-4222-8222-222222222222' and data = public.oggi()),
  12,
  'il primo tocco crea il report di oggi'
);

-- Next touches update the same row
insert into public.setter_daily_reports (setter_id, data, dm_outbound, conversazioni)
values ('22222222-2222-4222-8222-222222222222', public.oggi(), 40, 9)
on conflict (setter_id, data) do update
  set dm_outbound = excluded.dm_outbound, conversazioni = excluded.conversazioni;

select is(
  (select array[dm_outbound, conversazioni] from public.setter_daily_reports
   where setter_id = '22222222-2222-4222-8222-222222222222' and data = public.oggi()),
  array[40, 9],
  'i tocchi successivi aggiornano la stessa riga'
);

select is(
  (select count(*)::int from public.setter_daily_reports
   where setter_id = '22222222-2222-4222-8222-222222222222' and data = public.oggi()),
  1,
  'un solo report per setter e giorno'
);

-- Ten days ago the row exists (seed): the update half is allowed too
select lives_ok(
  $$ insert into public.setter_daily_reports (setter_id, data, dm_outbound)
     values ('22222222-2222-4222-8222-222222222222', public.oggi() - 10, 99)
     on conflict (setter_id, data) do update set dm_outbound = excluded.dm_outbound $$,
  'il setter corregge un report di dieci giorni fa'
);

-- Tomorrow does not exist yet
select throws_ok(
  $$ insert into public.setter_daily_reports (setter_id, data, dm_outbound)
     values ('22222222-2222-4222-8222-222222222222', public.oggi() + 1, 99)
     on conflict (setter_id, data) do update set dm_outbound = excluded.dm_outbound $$,
  '42501'
);

select * from finish();
rollback;
