-- Fathom, demo data (1.37.0). Invented recordings of the seed's held calls: never a
-- real Fathom meeting, a real link or a real person. After 45_analisi_reel.sql. Dates
-- relative to the calls already there; idempotent (on conflict do nothing).
--
-- The planner is quiet here: the automatic Monday brief is off (pg_cron runs for real
-- in the local database, and a brief appearing during an e2e test would disturb it).
-- No Fathom key in Vault, no step URL: nothing leaves this machine, the tests drive the steps.
--
-- The closer's held calls with an outcome, newest first:
--   1-3  recording found (the link, the recording id, the length): analysed in 51_analisi_call.sql
--   4    link pasted, not checked on Fathom yet
--   5    «Call non registrata»
--   6    a link of another site (Zoom): saved, no recording

update public.call_lavori_stato set spunti_automatici = false where id;

do $$
declare
  r record;
  n integer := 0;
begin
  for r in
    select c.id from public.calls c
    where c.closer_id = '33333333-3333-4333-8333-333333333333'
      and c.stato = 'svolta' and c.esito in ('chiusa', 'follow_up', 'persa')
      and c.programmata_il < now() - interval '1 day'
    order by c.programmata_il desc
    limit 6
  loop
    n := n + 1;
    -- the analysis rows of the first three are written by 51_analisi_call.sql: first the analysis, so the
    -- trigger of the queue finds it there
    if n <= 3 then
      insert into public.call_analisi (call_id, recording_id, stato, motivo)
      values (r.id, 9000000 + n, 'pronta', 'automatica') on conflict (call_id) do nothing;
    end if;
    if n <= 3 then
      update public.calls set link_registrazione = 'https://fathom.video/share/SeedFathom' || lpad(n::text, 2, '0')
      where id = r.id;
      insert into public.call_registrazioni (call_id, stato, link_verificato, recording_id, durata_secondi, inizio_registrazione, verificata_il)
      values (r.id, 'collegata', 'https://fathom.video/share/SeedFathom' || lpad(n::text, 2, '0'), 9000000 + n,
              1800 + n * 420, now() - make_interval(days => n), now())
      on conflict (call_id) do nothing;
    elsif n = 4 then
      update public.calls set link_registrazione = 'https://fathom.video/share/SeedFathom99' where id = r.id;
      insert into public.call_registrazioni (call_id, stato) values (r.id, 'collegata') on conflict (call_id) do nothing;
    elsif n = 5 then
      insert into public.call_registrazioni (call_id, stato) values (r.id, 'non_registrata') on conflict (call_id) do nothing;
    else
      update public.calls set link_registrazione = 'https://zoom.example.test/rec/SeedZoom01' where id = r.id;
      insert into public.call_registrazioni (call_id, stato) values (r.id, 'collegata') on conflict (call_id) do nothing;
    end if;
  end loop;
end;
$$;
