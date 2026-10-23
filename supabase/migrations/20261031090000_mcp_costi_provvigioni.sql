-- Claude a 360 gradi, fase 4 di 4 (Dany, 22-23/10/2026: «l'MCP deve agire a 360 gradi, in lettura e
-- in modifica, in base all'utente collegato»): costs, commissions, the month's goals, the Panoramica's
-- economics and the team. Same shape as phases 1-3 (20261027110000_mcp_progetti_tempo.sql,
-- 20261029090000_mcp_call_lead.sql, 20261030090000_mcp_clienti_vendite.sql): dedicated tools only, the
-- app's rules through a shared core that receives the token's client, every role with its own
-- permissions, nothing deleted. No new function: the tools call the SQL the pages already call.
--
-- Who does what from Claude, exactly as in the app (CLAUDE.md section 6):
--   admin   reads the economics like the Panoramica, only through the SQL that computes them
--           (metriche_periodo with the cash in four parts and the operating margin, kpi_periodo with
--           the comparison, funnel_periodo, cash_mensile, da_incassare, previsione_cassa,
--           avanzamento_obiettivi, metriche_per_fonte), the costs, the commissions (provvigioni_riepilogo
--           per setter and month, provvigioni_per_vendita, the payouts and the rules) and the team
--           (people from profiles, pending invites). Writes: a cost (register, edit, copy the recurring
--           ones: copia_costi_ricorrenti), a commission payout (register, edit), a commission rule (new:
--           nuova_regola_provvigione, close: chiudi_regola_provvigione, edit), the month's goals (set).
--   business coach  reads what the admin reads, never writes (the filter, as in 1.52.0).
--   setter  his own commissions, matured and paid per month, only through miei_numeri_periodo (security
--           definer, filtered on auth.uid()): never the rules, the percentages or anybody else's.
--   the other roles  nothing of this phase.
-- Still closed to Claude: deleting a cost, a payout, a rule or the goals; inviting, changing a role,
-- deactivating, deleting or merging people (the team is read only); the products in writing; export
-- and backup; the audit log; the setter's report as such and the Instagram proposals.
--
-- The three layers stay, each one narrowed:
--   1. mcp_filtro_richiesta gains the paths and methods the new tools use, by role (mcp_ruolo()), never
--      DELETE. The setter's path is his one function.
--   2. expenses, commission_rules, commission_payouts, obiettivi_mese, invites and setter_daily_reports
--      lose <table>_mai_da_oauth for four restrictive policies <table>_claude_*: an OAuth token reads
--      them only inside an approved request and only as admin or business coach, writes only as admin
--      (invites and the setter's reports never), deletes nothing. setter_daily_reports is read only
--      inside the three functions that sum the DM of the period (metriche_periodo, kpi_periodo,
--      funnel_periodo, security invoker): without it they would answer zero DM to Claude, and a direct
--      GET of the reports stays refused (the filter has no path for it).
--   3. current_role() is unchanged: the role only inside an approved request.
-- The triggers (audit_row, the overlap guard of the rules, updated_at) act as with a web session; the
-- audit writes the token's person.

-- ---------------------------------------------------------------------------
-- 1. The tables of this phase: <table>_mai_da_oauth gives way to four restrictive policies
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  -- who an OAuth token may be, inside an approved request (current_role() is null outside one)
  v_ruolo constant text := '(select public.current_role())';
  v_mai constant text := '(not (select public.da_client_oauth()))';
  v_percorso constant text := '(select ltrim(coalesce(current_setting(''request.path'', true), ''''), ''/''))';
  v_lettura text;
  v_scrittura text;
begin
  foreach t in array array['expenses', 'commission_rules', 'commission_payouts', 'obiettivi_mese', 'invites',
                           'setter_daily_reports'] loop
    execute format('drop policy %I on public.%I', t || '_mai_da_oauth', t);

    -- read: the admin and the business coach; the setter's reports only inside the period's sums
    v_lettura := case t
      when 'setter_daily_reports' then format(
        '(%s or (%s in (''admin'', ''business_coach'') and %s in (''rpc/metriche_periodo'', ''rpc/kpi_periodo'', ''rpc/funnel_periodo'')))',
        v_mai, v_ruolo, v_percorso)
      else format('(%s or %s in (''admin'', ''business_coach''))', v_mai, v_ruolo) end;
    -- insert and update: the admin, as in the app; the invites and the reports never from Claude
    v_scrittura := case
      when t in ('invites', 'setter_daily_reports') then v_mai
      else format('(%s or %s = ''admin'')', v_mai, v_ruolo) end;

    execute format('create policy %I on public.%I as restrictive for select to authenticated using %s',
      t || '_claude_lettura', t, v_lettura);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check %s',
      t || '_claude_inserimento', t, v_scrittura);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using %s with check %s',
      t || '_claude_modifica', t, v_scrittura, v_scrittura);
    -- delete: never from Claude (a cost, a payout, a rule or the goals are deleted from the app)
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using %s',
      t || '_claude_eliminazione', t, v_mai);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. The Data API filter: the body of 20261030090000 with the paths of the economics tools, by role
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
                            'rpc/call_per_claude', 'rpc/clienti_elenco', 'rpc/da_incassare',
                            'rpc/metriche_periodo', 'rpc/kpi_periodo', 'rpc/funnel_periodo', 'rpc/cash_mensile',
                            'rpc/previsione_cassa', 'rpc/avanzamento_obiettivi', 'rpc/metriche_per_fonte',
                            'rpc/provvigioni_riepilogo', 'rpc/provvigioni_per_vendita') then
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
          -- costs, commissions, goals, the Panoramica's economics and the team (phase 4 of 4,
          -- 23/10/2026): by role, never DELETE, the sums always from the SQL functions of the pages
       or (v_ruolo in ('admin', 'business_coach')
           and ((v_percorso in ('expenses', 'commission_rules', 'commission_payouts', 'obiettivi_mese', 'invites')
                 and v_lettura)
                or (v_percorso in ('rpc/metriche_periodo', 'rpc/kpi_periodo', 'rpc/funnel_periodo',
                                   'rpc/cash_mensile', 'rpc/previsione_cassa', 'rpc/avanzamento_obiettivi',
                                   'rpc/metriche_per_fonte', 'rpc/provvigioni_riepilogo',
                                   'rpc/provvigioni_per_vendita')
                    and v_metodo in ('GET', 'POST'))))
       or (v_ruolo = 'admin'
           and ((v_percorso in ('expenses', 'commission_payouts') and v_metodo in ('POST', 'PATCH'))
                or (v_percorso = 'commission_rules' and v_metodo = 'PATCH')
                -- the goals are an upsert (POST), as the Panoramica saves them
                or (v_percorso = 'obiettivi_mese' and v_metodo in ('POST', 'PATCH'))
                or (v_percorso in ('rpc/nuova_regola_provvigione', 'rpc/chiudi_regola_provvigione',
                                   'rpc/copia_costi_ricorrenti') and v_metodo = 'POST')))
          -- the setter: his own commissions, only through his numbers (security definer, his uid)
       or (v_ruolo = 'setter' and v_percorso = 'rpc/miei_numeri_periodo' and v_metodo in ('GET', 'POST'))
     ) then
    return;
  end if;
  raise exception 'Questa parte del gestionale non è raggiungibile da Claude.' using errcode = '42501';
end;
$$;
comment on function public.mcp_filtro_richiesta() is
  'PostgREST pre-request: an OAuth token (Claude) reaches only the MCP allow-list: the content calendar (marketing_contenuti, marketing_opzioni GET and HEAD, salva_sezione_contenuto, spunti_per_claude), projects, lists, tasks, notes and time (20261027110000, never DELETE), calls, leads and outcomes by role (20261029090000, never DELETE), clients, sales, instalments and cash-ins by role (20261030090000, never DELETE), costs, commissions, goals, the economics of the Panoramica and the team by role (20261031090000, never DELETE), and mcp_chi_sono. The business coach only reads (20261028090100). It raises the transaction-local flag alpha.mcp_filtro that current_role() and mcp_chi_sono read. A later MCP tool adds its path here, in 00_schema.sql and in its pgTAP test.';
