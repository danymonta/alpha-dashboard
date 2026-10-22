-- «Aggiorna dati» of the Insight for every active setter too (1.50.0, Dany,
-- 22/10/2026: «No, anche Loris deve poter aggiornare i dati!!!!»; CLAUDE.md
-- sections 6, 10, 17 and 29).
--
-- 1. insight_richiedi() accepts the admin and every active setter
--    (insight_puo_leggere()), with an explicit guard on an OAuth token
--    (Claude connected with the MCP: current_role() is already null for it,
--    the guard is defence in depth). The body is copied word for word from
--    20261014090100_insight_funzioni.sql: the same lock, one run at a time,
--    the same 8 manual runs a day shared by the admin and the setters, the
--    same sentences. Only the role check and richiesta_da change.
-- 2. No trace of who pressed (section 17): richiesta_da is no longer written
--    (null for every run, the admin's too: a null only for the setter would
--    say who pressed), the values already there are cleared and a check keeps
--    the column empty. No new column, no log with the person.
--
-- The setter reads the run's state from insight_stato() as before: only the
-- neutral fields (stato, passo, creata_il, finita_il, blocchi_fatti,
-- blocchi_totali); errors, warnings, cost and the details stay the admin's.
-- No new function reachable by authenticated: 00_schema.sql and
-- 75_mcp_oauth.sql keep their lists.

-- ---------------------------------------------------------------------------
-- 1. No trace of who pressed
-- ---------------------------------------------------------------------------
update public.insight_esecuzioni e set richiesta_da = null where e.richiesta_da is not null;

alter table public.insight_esecuzioni
  add constraint insight_esecuzioni_senza_persona check (richiesta_da is null);

comment on column public.insight_esecuzioni.richiesta_da is
  'Always null since 1.50.0 (check insight_esecuzioni_senza_persona): «Aggiorna dati» is the admin''s and the setters'' and the app keeps no trace of who pressed (CLAUDE.md section 17).';

-- ---------------------------------------------------------------------------
-- 2. insight_richiedi(): the admin and every active setter
-- ---------------------------------------------------------------------------
create or replace function public.insight_richiedi()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_url text;
begin
  if public.da_client_oauth() or not public.insight_puo_leggere() then
    raise exception 'I dati dell’Insight li aggiornano l’admin e i setter.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('alpha.insight', 0));

  if exists (select 1 from public.insight_esecuzioni e where e.stato in ('in_coda', 'in_corso')) then
    raise exception 'Un aggiornamento è già in corso.' using errcode = '22023';
  end if;
  if (select count(*) from public.insight_esecuzioni e
      where e.motivo = 'manuale' and e.giorno = public.oggi()) >= 8 then
    raise exception 'Hai già aggiornato 8 volte oggi: riprova domani.' using errcode = '22023';
  end if;

  insert into public.insight_esecuzioni (giorno, motivo)
  values (public.oggi(), 'manuale')
  returning id into v_id;

  select i.url_passo into v_url from public.insight_impostazioni i where i.id;
  if v_url is not null then
    perform public.insight_dispatch(v_id);
  end if;
  return v_id;
end;
$$;

comment on function public.insight_richiedi() is
  '«Aggiorna dati», for the admin and every active setter (insight_puo_leggere(); 42501 for the others and for an OAuth token): a manual Insight run for today (Rome), dispatched when the step URL is known (written by the server, insight_imposta_url). 22023 when a run is active or after 8 manual runs today, shared by the admin and the setters. Never who asked (1.50.0).';

revoke all on function public.insight_richiedi() from public, anon, authenticated;
grant execute on function public.insight_richiedi() to authenticated;
