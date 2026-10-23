-- Claude a 360 gradi, fase 3 di 4 (Dany, 22-23/10/2026: «l'MCP deve agire a 360 gradi, in lettura e
-- in modifica, in base all'utente collegato»): clients, sales, instalments and cash-ins. Same shape as
-- phases 1 and 2 (20261027110000_mcp_progetti_tempo.sql, 20261029090000_mcp_call_lead.sql): dedicated
-- tools only, the app's rules through a shared core that receives the token's client, every role with
-- its own permissions, nothing deleted.
--
-- Who does what from Claude, exactly as in the app (CLAUDE.md section 6):
--   admin   reads clients (clienti_elenco too, with LTV, month of the path and instalments), sales with
--           their instalments, cash-ins, what is still to collect and the renewals; the Drive folder of
--           the client and the contract of a sale as links, read only. Writes: client (create, edit,
--           «Non rinnova», reopen, archive and back, suspend and reactivate), registra_vendita (the
--           hand-written plan and the call too), the sale (edit, interrompi_percorso), the instalment
--           (cash-in, correct or undo it, failed, due date and amount, refund, add one).
--   closer  reads his sales and their instalments and what he still has to collect
--           (da_incassare_closer); registra_vendita; cashes, corrects and undoes the cash-in and marks
--           failed the instalments of his sales. Never the plan.
--   setter  only his clients and his commission per cash-in, through the functions that already exist
--           (mie_vendite_setter, incassi_clienti_setter): never sales, payments or clients directly.
--   business coach  reads what the admin reads, never writes (the filter, as in 1.52.0).
--   the other roles  nothing of this phase.
-- Out of this phase, closed to Claude: costs, commissions (rules and payouts), the month's goals, the
-- margin, the Panoramica (phase 4), products in writing, export and backup, linking a sale to a call
-- already held, every deletion (elimina_cliente, elimina_rata, a DELETE on sales), the Drive folder and
-- the contract in writing, the audit log.
--
-- The three layers stay, each one narrowed:
--   1. mcp_filtro_richiesta gains the paths and methods the new tools use, by role (mcp_ruolo()), never
--      DELETE. The setter's paths are his two functions only.
--   2. clients, sales, payments, clienti_chiusure, clienti_sospensioni, clienti_cartelle and
--      vendite_contratti lose <table>_mai_da_oauth for four restrictive policies <table>_claude_*: an
--      OAuth token reads them only inside an approved request and only as admin, business coach or
--      closer (the folder and the contract as admin or business coach), writes only as the role the app
--      lets write, deletes nothing. Three deletions are how the app works, each bound to the one
--      function that does it: interrompi_percorso drops the unpaid instalments after the last day
--      (payments), riapri_cliente drops the closure (clienti_chiusure), riattiva_cliente drops the hold
--      (clienti_sospensioni). The filter has no DELETE path on them, so only those functions do it.
--   3. current_role() is unchanged: the role only inside an approved request. inserisci_piano, which
--      refused every OAuth token, now refuses it only outside one: registra_vendita with a
--      hand-written plan runs it for the person, with its own check (the sale's author or the admin).
-- The triggers (the plan, the client's project, the closure and the hold ended by a new path, the
-- audit) are security definer and act as with a web session; the audit writes the token's person.
-- The computed fields of calls (call_ha_vendita, call_ha_follow_up) stay null for every OAuth token:
-- whether a call has its sale the tools read from the sales.

-- ---------------------------------------------------------------------------
-- 1. inserisci_piano: an OAuth token only inside an approved request (body of 20261010090000, the
--    guard narrowed)
-- ---------------------------------------------------------------------------
create or replace function public.inserisci_piano(p_sale_id uuid, p_rate jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- an OAuth token (Claude) only inside a request the Data API filter approved, where current_role()
  -- names its person (20261030090000): outside it, refused as before
  if public.da_client_oauth() and public.current_role() is null then
    raise exception 'Da Claude si usa solo il calendario dei contenuti.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.sales s
    where s.id = p_sale_id
      and (s.created_by = (select auth.uid()) or public.is_admin())
  ) then
    raise exception 'Vendita non trovata' using errcode = '42501';
  end if;
  if exists (select 1 from public.payments p where p.sale_id = p_sale_id) then
    raise exception 'La vendita ha già un piano rate' using errcode = '22023';
  end if;

  insert into public.payments (sale_id, numero_rata, scadenza, importo_previsto, stato, created_by)
  select p_sale_id, row_number() over (order by r.scadenza, r.ordine), r.scadenza, round(r.importo, 2), 'prevista', (select auth.uid())
  from rows from (jsonb_to_recordset(p_rate) as (scadenza date, importo numeric)) with ordinality as r(scadenza, importo, ordine);
end;
$$;

-- ---------------------------------------------------------------------------
-- 2. «Riapri» and «Riattiva»: the closure and the hold go, through one function each, so the deletion
--    a token may do is bound to its path. security invoker: RLS decides (the admin only). The app's
--    actions and Claude's tools call the same function (lib/clienti/operazioni.ts).
-- ---------------------------------------------------------------------------
create or replace function public.riapri_cliente(p_client_id uuid)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata all’admin.' using errcode = '42501';
  end if;
  delete from public.clienti_chiusure where client_id = p_client_id;
  return found;
end;
$$;
comment on function public.riapri_cliente(uuid) is
  '«Riapri» (20261030090000): the closure of the client goes, the status comes back from the sale dates. security invoker, admin only; true when a closure was there. The only way an OAuth token deletes a closure.';
revoke all on function public.riapri_cliente(uuid) from public, anon;
grant execute on function public.riapri_cliente(uuid) to authenticated, service_role;

create or replace function public.riattiva_cliente(p_client_id uuid)
returns boolean
language plpgsql
volatile
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Operazione riservata all’admin.' using errcode = '42501';
  end if;
  delete from public.clienti_sospensioni where client_id = p_client_id;
  return found;
end;
$$;
comment on function public.riattiva_cliente(uuid) is
  '«Riattiva» (20261030090000): the hold of the client goes. security invoker, admin only; true when a hold was there. The only way an OAuth token deletes a hold.';
revoke all on function public.riattiva_cliente(uuid) from public, anon;
grant execute on function public.riattiva_cliente(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The tables of this phase: <table>_mai_da_oauth gives way to four restrictive policies
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  -- who an OAuth token may be, inside an approved request (current_role() is null outside one)
  v_ruolo constant text := '(select public.current_role())';
  v_mai constant text := '(not (select public.da_client_oauth()))';
  -- the deletion the app does through one function: only that function's request, only the admin
  v_percorso constant text := '(select ltrim(coalesce(current_setting(''request.path'', true), ''''), ''/''))';
  v_lettura text;
  v_inserimento text;
  v_modifica text;
  v_eliminazione text;
begin
  foreach t in array array['clients', 'sales', 'payments', 'clienti_chiusure', 'clienti_sospensioni',
                           'clienti_cartelle', 'vendite_contratti'] loop
    execute format('drop policy %I on public.%I', t || '_mai_da_oauth', t);

    -- read: the roles that read money in the app (the setter never: he has his two functions); the
    -- client's Drive folder and the sale's contract only the admin and the business coach
    v_lettura := format('(%s or %s in (%s))', v_mai, v_ruolo,
      case when t in ('clienti_cartelle', 'vendite_contratti') then '''admin'', ''business_coach'''
           else '''admin'', ''business_coach'', ''closer''' end);
    -- insert: the admin; the closer also a client and a sale (registra_vendita, his own)
    v_inserimento := case
      when t in ('clients', 'sales') then format('(%s or %s in (''admin'', ''closer''))', v_mai, v_ruolo)
      when t in ('payments', 'clienti_chiusure', 'clienti_sospensioni') then format('(%s or %s = ''admin'')', v_mai, v_ruolo)
      else v_mai end;
    -- update: the admin; the closer the cash-ins of his instalments (guard_payments_closer keeps the plan)
    v_modifica := case
      when t = 'payments' then format('(%s or %s in (''admin'', ''closer''))', v_mai, v_ruolo)
      when t in ('clients', 'sales', 'clienti_chiusure', 'clienti_sospensioni') then format('(%s or %s = ''admin'')', v_mai, v_ruolo)
      else v_mai end;
    -- delete: never, but the three functions that delete to work, each in its own request
    v_eliminazione := case t
      when 'payments' then format('(%s or (%s = ''admin'' and %s = ''rpc/interrompi_percorso''))', v_mai, v_ruolo, v_percorso)
      when 'clienti_chiusure' then format('(%s or (%s = ''admin'' and %s = ''rpc/riapri_cliente''))', v_mai, v_ruolo, v_percorso)
      when 'clienti_sospensioni' then format('(%s or (%s = ''admin'' and %s = ''rpc/riattiva_cliente''))', v_mai, v_ruolo, v_percorso)
      else v_mai end;

    execute format('create policy %I on public.%I as restrictive for select to authenticated using %s',
      t || '_claude_lettura', t, v_lettura);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check %s',
      t || '_claude_inserimento', t, v_inserimento);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using %s with check %s',
      t || '_claude_modifica', t, v_modifica, v_modifica);
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using %s',
      t || '_claude_eliminazione', t, v_eliminazione);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. The Data API filter: the body of 20261029090000 with the paths of the money tools, by role
-- ---------------------------------------------------------------------------
create or replace function public.mcp_filtro_richiesta()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_percorso text;
  v_metodo text;
  v_intestazioni jsonb;
  v_lettura boolean;
  v_ruolo public.app_role;
begin
  if not public.da_client_oauth() then
    return;
  end if;
  perform set_config('alpha.mcp_filtro', 'on', true);
  v_percorso := ltrim(coalesce(current_setting('request.path', true), ''), '/');
  v_metodo := upper(coalesce(current_setting('request.method', true), ''));
  v_intestazioni := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_lettura := v_metodo in ('GET', 'HEAD');
  -- the person behind a live token (null for a closed session or a deactivated account)
  v_ruolo := public.mcp_ruolo();
  -- the business coach reads only (22/10/2026): his token writes nothing, anywhere
  if v_ruolo = 'business_coach'
     and not v_lettura
     and v_percorso not in ('rpc/spunti_per_claude', 'rpc/mcp_chi_sono', 'rpc/pm_riepilogo_tempo',
                            'rpc/pm_tempo_per_persona', 'rpc/pm_timer_attivo', 'rpc/pm_mio_tempo_per_task',
                            'rpc/call_per_claude', 'rpc/clienti_elenco', 'rpc/da_incassare') then
    raise exception 'Il business coach legge e basta: da Claude non si scrive niente.' using errcode = '42501';
  end if;
  if coalesce(v_intestazioni ->> 'accept-profile', 'public') = 'public'
     and coalesce(v_intestazioni ->> 'content-profile', 'public') = 'public'
     and (
          -- the content calendar (1.34.0)
          (v_percorso = 'marketing_contenuti' and v_metodo in ('GET', 'HEAD', 'POST', 'PATCH', 'DELETE'))
       or (v_percorso = 'marketing_opzioni' and v_lettura)   -- the labels: read only
       or (v_percorso = 'rpc/salva_sezione_contenuto' and v_metodo = 'POST')   -- volatile: POST only
       or (v_percorso = 'rpc/spunti_per_claude' and v_metodo in ('GET', 'POST'))
       or (v_percorso = 'rpc/mcp_chi_sono' and v_metodo in ('GET', 'POST'))
          -- projects, lists, tasks, notes and time (phase 1 of 4, 22/10/2026): never DELETE
       or (v_percorso in ('profiles', 'pm_reparti', 'pm_modelli', 'pm_task_assegnatari', 'pm_tempo',
                          'v_pm_progetti', 'v_pm_task', 'v_pm_tasklist') and v_lettura)
       or (v_percorso = 'pm_progetti' and v_metodo in ('GET', 'HEAD', 'PATCH'))
       or (v_percorso = 'pm_membri' and v_metodo in ('GET', 'HEAD', 'POST'))
       or (v_percorso in ('pm_tasklist', 'pm_task') and v_metodo in ('GET', 'HEAD', 'POST', 'PATCH'))
       or (v_percorso = 'pm_note' and v_metodo in ('GET', 'HEAD', 'POST'))
       or (v_percorso in ('rpc/pm_crea_progetto', 'rpc/pm_scegli_coach', 'rpc/pm_imposta_assegnatari',
                          'rpc/pm_registra_tempo', 'rpc/pm_modifica_tempo', 'rpc/pm_avvia_timer',
                          'rpc/pm_ferma_timer') and v_metodo = 'POST')
       or (v_percorso in ('rpc/pm_mio_tempo_per_task', 'rpc/pm_riepilogo_tempo', 'rpc/pm_tempo_per_persona',
                          'rpc/pm_timer_attivo') and v_metodo in ('GET', 'POST'))
          -- calls, leads and outcomes (phase 2 of 4, 23/10/2026): by role, never DELETE, never a direct
          -- insert; the setter reads the calls only through call_per_claude (never the link)
       or (v_ruolo in ('admin', 'setter', 'closer', 'business_coach')
           and ((v_percorso = 'leads' and v_lettura)
                or (v_percorso = 'rpc/call_per_claude' and v_metodo in ('GET', 'POST'))))
       or (v_ruolo in ('admin', 'closer', 'business_coach') and v_percorso = 'products' and v_lettura)
       or (v_ruolo in ('admin', 'closer')
           and ((v_percorso in ('calls', 'call_registrazioni') and v_lettura)
                -- the outcome (registraEsito) writes the call's own columns
                or (v_percorso = 'calls' and v_metodo = 'PATCH')
                or (v_percorso in ('rpc/dettagli_call', 'rpc/fissa_follow_up', 'rpc/collega_registrazione')
                    and v_metodo = 'POST')))
       or (v_ruolo in ('admin', 'setter', 'closer')
           and v_percorso in ('rpc/sposta_call', 'rpc/modifica_call', 'rpc/aggiorna_stato_lead')
           and v_metodo = 'POST')
       or (v_ruolo in ('admin', 'setter') and v_percorso = 'rpc/fissa_call' and v_metodo = 'POST')
          -- clients, sales, instalments and cash-ins (phase 3 of 4, 23/10/2026): by role, never DELETE
          -- (riapri_cliente, riattiva_cliente and interrompi_percorso delete what the app deletes)
       or (v_ruolo in ('admin', 'business_coach')
           and ((v_percorso in ('clients', 'sales', 'payments', 'v_clienti', 'v_vendite', 'v_rate',
                                'v_clienti_chiusi', 'clienti_chiusure', 'clienti_sospensioni',
                                'clienti_cartelle', 'vendite_contratti') and v_lettura)
                or (v_percorso in ('rpc/clienti_elenco', 'rpc/da_incassare') and v_metodo in ('GET', 'POST'))))
          -- the closer: his sales and their instalments (the clients only embedded: name and surname)
       or (v_ruolo = 'closer'
           and ((v_percorso in ('sales', 'payments', 'v_vendite') and v_lettura)
                or (v_percorso = 'rpc/da_incassare_closer' and v_metodo in ('GET', 'POST'))))
       or (v_ruolo in ('admin', 'closer')
           and ((v_percorso = 'payments' and v_metodo = 'PATCH')
                or (v_percorso in ('rpc/registra_vendita', 'rpc/segna_rata_incassata') and v_metodo = 'POST')))
       or (v_ruolo = 'admin'
           and ((v_percorso = 'clients' and v_metodo in ('POST', 'PATCH'))
                or (v_percorso = 'sales' and v_metodo = 'PATCH')
                -- «Non rinnova» and «Sospendi» are an upsert (POST), the archive an update
                or (v_percorso in ('clienti_chiusure', 'clienti_sospensioni') and v_metodo = 'POST')
                or (v_percorso = 'clienti_chiusure' and v_metodo = 'PATCH')
                or (v_percorso in ('rpc/interrompi_percorso', 'rpc/registra_rimborso', 'rpc/aggiungi_rata',
                                   'rpc/riapri_cliente', 'rpc/riattiva_cliente') and v_metodo = 'POST')))
          -- the setter: his clients and his commission, only through his two functions
       or (v_ruolo = 'setter'
           and v_percorso in ('rpc/mie_vendite_setter', 'rpc/incassi_clienti_setter')
           and v_metodo in ('GET', 'POST'))
     ) then
    return;
  end if;
  raise exception 'Questa parte del gestionale non è raggiungibile da Claude.' using errcode = '42501';
end;
$$;
comment on function public.mcp_filtro_richiesta() is
  'PostgREST pre-request: an OAuth token (Claude) reaches only the MCP allow-list: the content calendar (marketing_contenuti, marketing_opzioni GET and HEAD, salva_sezione_contenuto, spunti_per_claude), projects, lists, tasks, notes and time (20261027110000, never DELETE), calls, leads and outcomes by role (20261029090000, never DELETE), clients, sales, instalments and cash-ins by role (20261030090000, never DELETE), and mcp_chi_sono. The business coach only reads (20261028090100). It raises the transaction-local flag alpha.mcp_filtro that current_role() and mcp_chi_sono read. A later MCP tool adds its path here, in 00_schema.sql and in its pgTAP test.';
