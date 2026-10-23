-- The business coach sees only the sales recap (Dany, 23/10/2026, 1.58.0: «una versione per Max dove
-- lui ha semplicemente una pagina… unicamente una dashboard sales per il mio business coach»). Until
-- 1.57.x he read what the admin reads (20261028090100_business_coach_lettura.sql); from here the
-- database gives him nothing but his own profile row and one function, recap_sales(), which answers
-- with the period's totals of the sales funnel, aggregates only (CLAUDE.md sections 6 and 9).
--
-- 1. legge_come_admin(): the admin. The business coach only while recap_sales() is computing his
--    numbers (the transaction-local flag alpha.recap_sales, raised and lowered by recap_sales itself,
--    which no client can set: PostgREST never writes a setting a client chooses, as alpha.mcp_filtro).
--    So metriche_periodo, metriche_setting and funnel_periodo, called inside recap_sales, answer him
--    exactly what they answer the admin, and every other function guarded by legge_come_admin() is
--    closed to him again (42501).
-- 2. The SELECT policies <tabella>_lettura_come_admin are dropped: the admin reads through his own
--    policies, as before 1.52.0. The profiles of the team: his own row only (profiles_select_own). The
--    notifications: none (the app sends them to the admins; their three policies leave his role out).
-- 3. The read functions that named him next to the admin are copied as they are, without his name
--    (call_lavori_situazione, marketing_lavori_situazione, call_numeri_periodo, giornate_closer,
--    giornate_setter, call_per_claude).
-- 4. Claude: he no longer connects it. current_role() and mcp_ruolo() are null for his OAuth token,
--    puo_usare_mcp() false, mcp_chi_sono() answers «ruolo» (the MCP route says 403), and the Data API
--    filter refuses every other request of his token first of all. The restrictive
--    <tabella>_claude_lettura policies of phases 3 and 4 lose his name.
-- 5. recap_sales(p_da, p_a): security definer, the active admin or business coach, never an OAuth
--    token. The totals of the period and of the previous one (periodo_precedente) from metriche_periodo
--    and metriche_setting, the relative delta as kpi_periodo computes it, the funnel from funnel_periodo,
--    and the series by day (up to 31 days), by week (up to 186 days) or by month. Never a name, a
--    lead, a client, a message, an amount of one client, costs, margin or commissions.

-- ---------------------------------------------------------------------------
-- 1. legge_come_admin()
-- ---------------------------------------------------------------------------
create or replace function public.legge_come_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_role() = 'admin', false)
    or (coalesce(current_setting('alpha.recap_sales', true), '') = 'on'
        and coalesce(public.current_role() = 'business_coach', false));
$$;

comment on function public.legge_come_admin() is
  'The admin''s reads: true for the active admin; for the active business coach only while recap_sales() computes his numbers (alpha.recap_sales, 20261101090000). Only in read functions, never in a write policy or a function that writes (pgTAP 101).';

-- ---------------------------------------------------------------------------
-- 2. No SELECT policy for him: the _lettura_come_admin policies go, profiles is his own row
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select tablename, policyname from pg_catalog.pg_policies
    where schemaname = 'public' and policyname like '%\_lettura\_come\_admin'
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- the directory of the team: every active role but him (he reads his own row, profiles_select_own)
drop policy profiles_select_authenticated on public.profiles;
create policy profiles_select_authenticated
  on public.profiles for select
  to authenticated
  using (coalesce((select public.current_role()) <> 'business_coach', false));

-- the notifications: the app sends them to the admins only, and he has no bell nor page; closed in the
-- database too (same policies as 20261021090000, with his role out)
drop policy notifiche_lettura on public.notifiche;
create policy notifiche_lettura on public.notifiche
  for select to authenticated
  using (destinatario_id = (select auth.uid()) and coalesce((select public.current_role()) <> 'business_coach', false));
drop policy notifiche_segna_lette on public.notifiche;
create policy notifiche_segna_lette on public.notifiche
  for update to authenticated
  using (destinatario_id = (select auth.uid()) and coalesce((select public.current_role()) <> 'business_coach', false))
  with check (destinatario_id = (select auth.uid()) and coalesce((select public.current_role()) <> 'business_coach', false));
drop policy notifiche_eliminazione on public.notifiche;
create policy notifiche_eliminazione on public.notifiche
  for delete to authenticated
  using (destinatario_id = (select auth.uid()) and coalesce((select public.current_role()) <> 'business_coach', false));

-- ---------------------------------------------------------------------------
-- 4. Claude: never for the business coach
-- ---------------------------------------------------------------------------
create or replace function public.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.ruolo
  from public.profiles p
  where p.id = (select auth.uid())
    and p.attivo
    -- an OAuth token (Claude) acts as its person only inside an approved request, and never as the
    -- business coach (20261101090000)
    and case when public.da_client_oauth() then p.ruolo <> 'business_coach' and public.mcp_richiesta_valida()
             else true end;
$$;
comment on function public.current_role() is
  'Active role of the caller, or null when unknown or deactivated. For an OAuth token (Claude) the person''s role only inside a request the Data API filter approved, with a live OAuth session (20261027110000), never for the business coach (20261101090000); null anywhere else. Use in policies.';

create or replace function public.mcp_ruolo()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select case when public.da_client_oauth() and public.mcp_token_valido() then (
    select p.ruolo
    from public.profiles p
    where p.id = (select auth.uid())
      and p.attivo
      and p.ruolo <> 'business_coach'
  ) end;
$$;
comment on function public.mcp_ruolo() is
  'The role Claude acts with, for a live OAuth token of an active person (every role but the business coach, 20261101090000); null otherwise.';

create or replace function public.puo_usare_mcp()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(not public.da_client_oauth() and public.current_role() <> 'business_coach', false);
$$;
comment on function public.puo_usare_mcp() is
  'Web session only: every active person may connect Claude (consent page, Collega Claude; 20261027110000), except the business coach, who sees only the sales recap (20261101090000). Never an OAuth token.';

create or replace function public.mcp_chi_sono()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ruolo public.app_role;
  v_livello public.pm_livello;
begin
  if not public.da_client_oauth() then
    return jsonb_build_object('esito', 'non_oauth');
  end if;
  if not public.mcp_token_valido() then
    return jsonb_build_object('esito', 'sessione');
  end if;
  -- the business coach does not connect Claude (20261101090000): like no active account
  select p.ruolo, p.livello_pm into v_ruolo, v_livello
  from public.profiles p
  where p.id = (select auth.uid()) and p.attivo and p.ruolo <> 'business_coach';
  if v_ruolo is null then
    return jsonb_build_object('esito', 'ruolo');
  end if;
  return jsonb_build_object(
    'esito', 'ok',
    'ruolo', v_ruolo,
    -- the project level the app uses: the app admin is always admin of the projects
    'livello', case when v_ruolo = 'admin' then 'admin'::public.pm_livello else v_livello end,
    'filtro', coalesce(current_setting('alpha.mcp_filtro', true), '') = 'on'
  );
end;
$$;

-- The restrictive policies of phases 3 and 4: the same, without his name
do $$
declare
  t text;
  v_ruolo constant text := '(select public.current_role())';
  v_mai constant text := '(not (select public.da_client_oauth()))';
  v_percorso constant text := '(select ltrim(coalesce(current_setting(''request.path'', true), ''''), ''/''))';
  v_lettura text;
begin
  foreach t in array array['clients', 'sales', 'payments', 'clienti_chiusure', 'clienti_sospensioni',
                           'clienti_cartelle', 'vendite_contratti', 'expenses', 'commission_rules',
                           'commission_payouts', 'obiettivi_mese', 'invites', 'setter_daily_reports'] loop
    v_lettura := case
      when t in ('clients', 'sales', 'payments', 'clienti_chiusure', 'clienti_sospensioni')
        then format('(%s or %s in (''admin'', ''closer''))', v_mai, v_ruolo)
      when t = 'setter_daily_reports' then format(
        '(%s or (%s = ''admin'' and %s in (''rpc/metriche_periodo'', ''rpc/kpi_periodo'', ''rpc/funnel_periodo'')))',
        v_mai, v_ruolo, v_percorso)
      else format('(%s or %s = ''admin'')', v_mai, v_ruolo) end;
    execute format('drop policy %I on public.%I', t || '_claude_lettura', t);
    execute format('create policy %I on public.%I as restrictive for select to authenticated using %s',
      t || '_claude_lettura', t, v_lettura);
  end loop;
end $$;

-- The Data API filter: the body of 20261031090000 without the business coach, whose token stops here
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
  -- the business coach sees only the sales recap, in the app (23/10/2026): no Claude for him. The
  -- route's question passes, so mcp_chi_sono() answers «ruolo» and the route says 403, not 503
  if exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.ruolo = 'business_coach')
     and ltrim(coalesce(current_setting('request.path', true), ''), '/') <> 'rpc/mcp_chi_sono' then
    raise exception 'Il business coach non collega Claude: legge il recap vendite nell''app.' using errcode = '42501';
  end if;
  perform set_config('alpha.mcp_filtro', 'on', true);
  v_percorso := ltrim(coalesce(current_setting('request.path', true), ''), '/');
  v_metodo := upper(coalesce(current_setting('request.method', true), ''));
  v_intestazioni := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_lettura := v_metodo in ('GET', 'HEAD');
  -- the person behind a live token (null for a closed session or a deactivated account)
  v_ruolo := public.mcp_ruolo();
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
       or (v_ruolo in ('admin', 'setter', 'closer')
           and ((v_percorso = 'leads' and v_lettura)
                or (v_percorso = 'rpc/call_per_claude' and v_metodo in ('GET', 'POST'))))
       or (v_ruolo in ('admin', 'closer') and v_percorso = 'products' and v_lettura)
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
       or (v_ruolo = 'admin'
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
       or (v_ruolo = 'admin'
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
  'PostgREST pre-request: an OAuth token (Claude) reaches only the MCP allow-list: the content calendar (marketing_contenuti, marketing_opzioni GET and HEAD, salva_sezione_contenuto, spunti_per_claude), projects, lists, tasks, notes and time (20261027110000, never DELETE), calls, leads and outcomes by role (20261029090000, never DELETE), clients, sales, instalments and cash-ins by role (20261030090000, never DELETE), costs, commissions, goals, the economics of the Panoramica and the team by role (20261031090000, never DELETE), and mcp_chi_sono. The business coach''s token is refused first of all (20261101090000). It raises the transaction-local flag alpha.mcp_filtro that current_role() and mcp_chi_sono read. A later MCP tool adds its path here, in 00_schema.sql and in its pgTAP test.';

-- ---------------------------------------------------------------------------
-- 3. The read functions that named him: their bodies as they were, without the business coach
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.call_lavori_situazione()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s public.call_lavori_stato;
  v_ruolo public.app_role := public.current_role();
  v_costo numeric := public.call_costo_mese();
  v_risposta jsonb;
begin
  if v_ruolo is null or v_ruolo not in ('admin', 'editor', 'marketing') then
    raise exception 'La situazione dei lavori è dell’area Marketing.' using errcode = '42501';
  end if;
  select * into s from public.call_lavori_stato x where x.id;
  v_risposta := jsonb_build_object(
    'spunti_in_coda', exists (select 1 from public.marketing_spunti m where m.stato in ('in_coda', 'in_corso')),
    'in_pausa_spesa', v_costo >= s.costo_max_mese);
  if public.legge_come_admin() then
    v_risposta := v_risposta || jsonb_build_object(
      'analisi_attive', s.analisi_attive,
      'costo_mese', v_costo, 'costo_max', s.costo_max_mese,
      'analisi_mese', s.analisi_mese, 'spunti_mese', s.spunti_mese,
      'analisi_in_coda', (select count(*) from public.call_analisi a where a.stato in ('in_coda', 'in_corso')),
      'ultimo_errore', s.ultimo_errore, 'ultimo_esito', s.ultimo_esito,
      'ultimo_passo_il', s.ultimo_passo_il, 'ultimo_tick_il', s.ultimo_tick_il);
  end if;
  return v_risposta;
end;
$function$;

CREATE OR REPLACE FUNCTION public.marketing_lavori_situazione()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  s public.marketing_lavori_stato;
  v_ruolo public.app_role := public.current_role();
  v_costo numeric := public.marketing_costo_mese();
  v_automatiche text;
  v_risposta jsonb;
begin
  if v_ruolo is null or v_ruolo not in ('admin', 'editor', 'marketing') then
    raise exception 'La situazione delle analisi è dell’area Marketing.' using errcode = '42501';
  end if;
  select * into s from public.marketing_lavori_stato x where x.id;
  v_automatiche := case
    when s.ultimo_esito = 'senza_chiave' then 'ferme_chiave'
    when v_costo >= s.costo_max_mese then 'in_pausa_spesa'
    when not s.automatiche then 'spente'
    else 'attive'
  end;
  v_risposta := jsonb_build_object(
    'automatiche', v_automatiche,
    'ultimo_passo_il', s.ultimo_passo_il,
    'in_coda', (select count(*) from public.instagram_letture l where l.stato = 'in_coda')
             + (select count(*) from public.marketing_analisi a where a.stato = 'in_coda'));
  if public.legge_come_admin() then
    v_risposta := v_risposta || jsonb_build_object(
      'costo_mese', v_costo, 'costo_max', s.costo_max_mese, 'note_team', s.note_team,
      'automatiche_accese', s.automatiche, 'ultimo_errore', s.ultimo_errore, 'ultimo_tick_il', s.ultimo_tick_il,
      'ultimo_esito', s.ultimo_esito);
  end if;
  return v_risposta;
end;
$function$;

CREATE OR REPLACE FUNCTION public.call_numeri_periodo(p_da date, p_a date, p_per text, p_closer uuid DEFAULT NULL::uuid)
 RETURNS TABLE(gruppo text, etichetta text, media_id text, call integer, svolte integer, no_show integer, show_rate numeric, qualificate integer, chiuse integer, close_rate numeric, close_rate_qualificate numeric, registrate integer, copertura numeric, durata_media_min numeric, analizzate integer, in_target_si integer, in_target_no integer, in_target_da_verificare integer, quota_in_target numeric, obiezioni jsonb, performance jsonb, vendite_nuove integer, revenue_nuovi numeric, cash_nuovi numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_ruolo public.app_role := public.current_role();
  v_uid uuid := (select auth.uid());
  v_closer uuid;
  v_proprie boolean;
begin
  if v_ruolo is null or v_ruolo not in ('admin', 'closer') then
    raise exception 'I numeri delle call li legge l’admin, e il closer per le sue.' using errcode = '42501';
  end if;
  if p_per is null or p_per not in ('totale', 'fonte', 'contenuto') then
    raise exception 'Scegli totale, fonte o contenuto.' using errcode = '22023';
  end if;
  if p_da is null or p_a is null or p_a < p_da or p_a - p_da > 365 then
    raise exception 'Periodo non valido.' using errcode = '22023';
  end if;
  v_closer := case when v_ruolo = 'closer' then v_uid else p_closer end;
  v_proprie := v_closer is not null and v_closer = v_uid;

  return query
  with base as (
    select c.id, c.stato, c.esito, c.qualificata, c.performance,
           case p_per
             when 'totale' then null::text
             when 'fonte' then coalesce(l.fonte::text, 'altro')
             else coalesce(lc.shortcode, 'non_riconosciuto')
           end as gruppo,
           r.recording_id, r.durata_secondi,
           a.stato as analisi_stato, a.in_target, a.categorie_obiezioni
    from public.calls c
    join public.leads l on l.id = c.lead_id
    left join public.lead_contenuto lc on lc.lead_id = c.lead_id
    left join public.call_registrazioni r on r.call_id = c.id and r.stato = 'collegata'
    left join public.call_analisi a on a.call_id = c.id and a.stato = 'pronta'
    where (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
      and c.stato in ('svolta', 'no_show')
      and (v_closer is null or c.closer_id = v_closer)
  ),
  vendite as (
    select b.gruppo,
           count(s.id)::integer as n,
           coalesce(sum(s.valore_contratto), 0) as revenue,
           coalesce(sum((select p.importo_incassato from public.payments p
                         where p.sale_id = s.id and p.numero_rata = 1 and p.stato = 'incassata')), 0) as cash
    from base b
    join public.sales s on s.call_id = b.id and s.tipo = 'nuovo' and s.data_vendita between p_da and p_a
    group by b.gruppo
  ),
  obiezioni as (
    select x.gruppo, jsonb_agg(jsonb_build_object('categoria', x.cat, 'quante', x.n) order by x.n desc, x.cat) as elenco
    from (
      select b.gruppo, cat, count(*)::integer as n
      from base b, unnest(b.categorie_obiezioni) as cat
      where b.stato = 'svolta' and b.esito is distinct from 'chiusa' and b.analisi_stato = 'pronta'
      group by b.gruppo, cat
    ) x
    group by x.gruppo
  ),
  perf as (
    select b.gruppo,
           jsonb_build_object(
             'ottima', count(*) filter (where b.performance = 'ottima'),
             'buona', count(*) filter (where b.performance = 'buona'),
             'discreta', count(*) filter (where b.performance = 'discreta'),
             'media', count(*) filter (where b.performance = 'media'),
             'scarsa', count(*) filter (where b.performance = 'scarsa'),
             'senza', count(*) filter (where b.performance is null)) as conteggi
    from base b where b.stato = 'svolta'
    group by b.gruppo
  ),
  gruppi as (
    select b.gruppo,
           count(*)::integer as n_call,
           count(*) filter (where b.stato = 'svolta')::integer as n_svolte,
           count(*) filter (where b.stato = 'no_show')::integer as n_no_show,
           count(*) filter (where b.stato = 'svolta' and (b.qualificata or b.esito = 'chiusa'))::integer as n_qualificate,
           count(*) filter (where b.stato = 'svolta' and b.esito = 'chiusa')::integer as n_chiuse,
           count(*) filter (where b.stato = 'svolta' and b.recording_id is not null)::integer as n_registrate,
           avg(b.durata_secondi) filter (where b.stato = 'svolta' and b.recording_id is not null) as durata,
           count(*) filter (where b.analisi_stato = 'pronta')::integer as n_analizzate,
           count(*) filter (where b.in_target = 'si')::integer as t_si,
           count(*) filter (where b.in_target = 'no')::integer as t_no,
           count(*) filter (where b.in_target = 'da_verificare')::integer as t_dv
    from base b
    group by b.gruppo
  )
  select g.gruppo,
         case p_per
           when 'totale' then 'Tutte le call'
           when 'fonte' then case g.gruppo
                               when 'dm_inbound' then 'Instagram DM inbound'
                               when 'dm_outbound' then 'Instagram DM outbound'
                               when 'referral' then 'Passaparola'
                               when 'organico' then 'Organico'
                               when 'ads' then 'Ads'
                               else 'Altro' end
           else case when g.gruppo = 'non_riconosciuto' then 'Contenuto non riconosciuto'
                     else coalesce((select case when i.reel then 'Reel' else 'Post' end || ' del ' || to_char(i.pubblicato_il at time zone 'Europe/Rome', 'DD/MM')
                                           || coalesce(' · ' || m.nome, '')
                                    from public.instagram_contenuti i
                                    left join public.marketing_contenuti m on m.instagram_shortcode = i.shortcode
                                    where i.shortcode = g.gruppo limit 1), 'Contenuto non riconosciuto') end
         end,
         case when p_per = 'contenuto' and g.gruppo <> 'non_riconosciuto'
              then (select i.media_id from public.instagram_contenuti i where i.shortcode = g.gruppo limit 1) end,
         g.n_call, g.n_svolte, g.n_no_show,
         case when g.n_svolte + g.n_no_show > 0 then round(g.n_svolte::numeric / (g.n_svolte + g.n_no_show), 4) end,
         g.n_qualificate, g.n_chiuse,
         case when g.n_svolte > 0 then round(g.n_chiuse::numeric / g.n_svolte, 4) end,
         case when g.n_qualificate > 0 then round(g.n_chiuse::numeric / g.n_qualificate, 4) end,
         case when v_proprie then g.n_registrate end,
         case when v_proprie and g.n_svolte > 0 then round(g.n_registrate::numeric / g.n_svolte, 4) end,
         case when v_proprie and g.durata is not null then round(g.durata / 60.0, 1) end,
         g.n_analizzate, g.t_si, g.t_no, g.t_dv,
         case when g.t_si + g.t_no > 0 then round(g.t_si::numeric / (g.t_si + g.t_no), 4) end,
         coalesce(o.elenco, '[]'::jsonb),
         case when v_proprie then pf.conteggi end,
         case when v_ruolo = 'admin' then coalesce(v.n, 0) end,
         case when v_ruolo = 'admin' then coalesce(v.revenue, 0) end,
         case when v_ruolo = 'admin' then coalesce(v.cash, 0) end
  from gruppi g
  left join vendite v on v.gruppo is not distinct from g.gruppo
  left join obiezioni o on o.gruppo is not distinct from g.gruppo
  left join perf pf on pf.gruppo is not distinct from g.gruppo
  order by g.n_call desc, g.gruppo nulls first;
end;
$function$;

CREATE OR REPLACE FUNCTION public.giornate_closer(p_da date, p_a date, p_closer uuid DEFAULT NULL::uuid)
 RETURNS TABLE(data date, call integer, qualificate integer, no_show integer, follow_up integer, cancellate integer, chiuse integer, cash numeric, revenue numeric, show_rate numeric, close_rate numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  -- null for a deactivated user or no session
  v_ruolo public.app_role := public.current_role();
  v_closer uuid;
begin
  if v_ruolo in ('admin', 'setter') then
    v_closer := p_closer;
  elsif v_ruolo = 'closer' then
    v_closer := (select auth.uid());
  else
    raise exception 'La giornata del closer la vedono l''admin, i closer e i setter.' using errcode = '42501';
  end if;
  perform public.verifica_periodo(p_da, p_a);

  return query
  with chiamate as (
    select
      (c.programmata_il at time zone 'Europe/Rome')::date as giorno,
      count(*) filter (where c.stato = 'svolta') as svolte,
      count(*) filter (where c.stato = 'svolta' and c.qualificata) as qualificate_,
      count(*) filter (where c.stato = 'no_show') as noshow,
      count(*) filter (where c.stato = 'svolta' and c.esito = 'follow_up') as followup,
      count(*) filter (where c.stato = 'cancellata') as cancellate_,
      count(*) filter (where c.esito = 'chiusa') as chiuse_
    from public.calls c
    where (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
      and (v_closer is null or c.closer_id = v_closer)
    group by 1
  ),
  -- the first instalment of the new clients, on the day of the sale
  incassi as (
    select s.data_vendita as giorno, sum(p.importo_incassato) as cash_
    from public.payments p
    join public.sales s on s.id = p.sale_id
    where s.tipo = 'nuovo'
      and p.numero_rata = 1
      and p.stato = 'incassata'
      and s.data_vendita between p_da and p_a
      and (v_closer is null or s.closer_id = v_closer)
    group by 1
  ),
  firmate as (
    select s.data_vendita as giorno, sum(s.valore_contratto) as revenue_
    from public.sales s
    where s.tipo = 'nuovo'
      and s.data_vendita between p_da and p_a
      and (v_closer is null or s.closer_id = v_closer)
    group by 1
  ),
  giorni as (
    select ch.giorno from chiamate ch
    union select i.giorno from incassi i
    union select f.giorno from firmate f
  ),
  righe as (
    select
      g.giorno,
      coalesce(ch.svolte, 0) as svolte,
      coalesce(ch.qualificate_, 0) as qualificate_,
      coalesce(ch.noshow, 0) as noshow,
      coalesce(ch.followup, 0) as followup,
      coalesce(ch.cancellate_, 0) as cancellate_,
      coalesce(ch.chiuse_, 0) as chiuse_,
      coalesce(i.cash_, 0) as cash_,
      coalesce(f.revenue_, 0) as revenue_
    from giorni g
    left join chiamate ch on ch.giorno = g.giorno
    left join incassi i on i.giorno = g.giorno
    left join firmate f on f.giorno = g.giorno
  )
  select
    r.giorno,
    sum(r.svolte)::integer,
    sum(r.qualificate_)::integer,
    sum(r.noshow)::integer,
    sum(r.followup)::integer,
    sum(r.cancellate_)::integer,
    sum(r.chiuse_)::integer,
    sum(r.cash_)::numeric(12, 2),
    sum(r.revenue_)::numeric(12, 2),
    public.rapporto(sum(r.svolte), sum(r.svolte) + sum(r.noshow)),
    public.rapporto(sum(r.chiuse_), sum(r.svolte))
  from righe r
  where r.svolte + r.noshow + r.cancellate_ > 0 or r.cash_ <> 0 or r.revenue_ <> 0
  group by grouping sets ((r.giorno), ())
  order by r.giorno desc nulls first;
end;
$function$;

CREATE OR REPLACE FUNCTION public.giornate_setter(p_da date, p_a date, p_setter uuid DEFAULT NULL::uuid)
 RETURNS TABLE(data date, dm_outbound integer, dm_inbound integer, conversazioni integer, call_proposte integer, discovery_prenotate integer, discovery_svolte integer, call_qualificate integer, strategy_prenotate integer, follow_up integer, dm_totali integer, prenotate_inbound integer, prenotate_outbound integer, closer_call integer, closer_qualificate integer, closer_no_show integer, closer_follow_up integer, closer_cancellate integer, closer_chiuse integer, cash numeric, revenue numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_ruolo public.app_role := public.current_role();
  v_setter uuid;
begin
  if v_ruolo = 'admin' then
    v_setter := p_setter;
  elsif v_ruolo = 'setter' then
    v_setter := (select auth.uid());
  else
    raise exception 'La giornata del setter la vedono l''admin e il setter' using errcode = '42501';
  end if;
  perform public.verifica_periodo(p_da, p_a);

  return query
  with report as (
    select
      r.data as giorno,
      sum(r.dm_outbound) as dm_out,
      sum(r.dm_inbound) as dm_in,
      sum(r.conversazioni) as conv,
      sum(r.call_proposte) as proposte,
      sum(r.discovery_prenotate) as disc_pren,
      sum(r.discovery_svolte) as disc_svolte,
      sum(r.call_qualificate) as qualif,
      sum(r.strategy_prenotate) as strat_pren,
      sum(r.follow_up) as fup
    from public.setter_daily_reports r
    where r.data between p_da and p_a
      and (v_setter is null or r.setter_id = v_setter)
    group by 1
  ),
  chiamate as (
    select
      (c.programmata_il at time zone 'Europe/Rome')::date as giorno,
      count(*) filter (where c.stato = 'svolta') as svolte,
      count(*) filter (where c.stato = 'svolta' and c.qualificata) as qualificate_,
      count(*) filter (where c.stato = 'no_show') as noshow,
      count(*) filter (where c.stato = 'svolta' and c.esito = 'follow_up') as followup,
      count(*) filter (where c.stato = 'cancellata') as cancellate_,
      count(*) filter (where c.esito = 'chiusa') as chiuse_
    from public.calls c
    where (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
      and (case when v_setter is null then c.setter_id is not null else c.setter_id = v_setter end)
    group by 1
  ),
  -- calls booked that day (created), by the lead's source: not typed in the report
  prenotazioni as (
    select
      (c.created_at at time zone 'Europe/Rome')::date as giorno,
      count(*) filter (where l.fonte = 'dm_inbound') as da_inbound,
      count(*) filter (where l.fonte = 'dm_outbound') as da_outbound
    from public.calls c
    join public.leads l on l.id = c.lead_id
    where (c.created_at at time zone 'Europe/Rome')::date between p_da and p_a
      and (case when v_setter is null then c.setter_id is not null else c.setter_id = v_setter end)
      -- a follow-up call is booked by the closer, not by the setter (07/10/2026),
      -- also once its first call is gone (di_follow_up stays)
      and not c.di_follow_up
    group by 1
  ),
  -- the first instalment of the new clients he brought, on the day of the sale
  incassi as (
    select s.data_vendita as giorno, sum(p.importo_incassato) as cash_
    from public.payments p
    join public.sales s on s.id = p.sale_id
    where s.tipo = 'nuovo'
      and p.numero_rata = 1
      and p.stato = 'incassata'
      and s.data_vendita between p_da and p_a
      and (case when v_setter is null then s.setter_id is not null else s.setter_id = v_setter end)
    group by 1
  ),
  firmate as (
    select s.data_vendita as giorno, sum(s.valore_contratto) as revenue_
    from public.sales s
    where s.tipo = 'nuovo'
      and s.data_vendita between p_da and p_a
      and (case when v_setter is null then s.setter_id is not null else s.setter_id = v_setter end)
    group by 1
  ),
  giorni as (
    select rp.giorno from report rp
    union select pz.giorno from prenotazioni pz
    union select ch.giorno from chiamate ch
    union select i.giorno from incassi i
    union select f.giorno from firmate f
  ),
  righe as (
    select
      g.giorno,
      coalesce(rp.dm_out, 0) as dm_out, coalesce(rp.dm_in, 0) as dm_in, coalesce(rp.conv, 0) as conv,
      coalesce(rp.proposte, 0) as proposte, coalesce(rp.disc_pren, 0) as disc_pren,
      coalesce(rp.disc_svolte, 0) as disc_svolte, coalesce(rp.qualif, 0) as qualif,
      coalesce(rp.strat_pren, 0) as strat_pren, coalesce(rp.fup, 0) as fup,
      coalesce(pz.da_inbound, 0) as da_inbound, coalesce(pz.da_outbound, 0) as da_outbound,
      coalesce(ch.svolte, 0) as svolte, coalesce(ch.qualificate_, 0) as qualificate_,
      coalesce(ch.noshow, 0) as noshow, coalesce(ch.followup, 0) as followup,
      coalesce(ch.cancellate_, 0) as cancellate_, coalesce(ch.chiuse_, 0) as chiuse_,
      coalesce(i.cash_, 0) as cash_, coalesce(f.revenue_, 0) as revenue_
    from giorni g
    left join report rp on rp.giorno = g.giorno
    left join prenotazioni pz on pz.giorno = g.giorno
    left join chiamate ch on ch.giorno = g.giorno
    left join incassi i on i.giorno = g.giorno
    left join firmate f on f.giorno = g.giorno
  )
  select
    r.giorno,
    sum(r.dm_out)::integer, sum(r.dm_in)::integer, sum(r.conv)::integer, sum(r.proposte)::integer,
    sum(r.disc_pren)::integer, sum(r.disc_svolte)::integer, sum(r.qualif)::integer,
    sum(r.strat_pren)::integer, sum(r.fup)::integer,
    -- DM totali: outbound + inbound + follow up (conversations do not count)
    (sum(r.dm_out) + sum(r.dm_in) + sum(r.fup))::integer,
    sum(r.da_inbound)::integer, sum(r.da_outbound)::integer,
    sum(r.svolte)::integer, sum(r.qualificate_)::integer, sum(r.noshow)::integer,
    sum(r.followup)::integer, sum(r.cancellate_)::integer, sum(r.chiuse_)::integer,
    sum(r.cash_)::numeric(12, 2), sum(r.revenue_)::numeric(12, 2)
  from righe r
  -- a day counts when the setter wrote it or something happened on it
  where r.giorno in (select rp.giorno from report rp)
     or r.svolte + r.noshow + r.cancellate_ > 0 or r.cash_ <> 0 or r.revenue_ <> 0
     or r.da_inbound + r.da_outbound > 0
  group by grouping sets ((r.giorno), ())
  order by r.giorno desc nulls first;
end;
$function$;


-- call_per_claude: the body of 20261029090000, without the business coach
create or replace function public.call_per_claude(
  p_id uuid default null,
  p_da date default null,
  p_a date default null,
  p_stati public.call_status[] default null,
  p_closer uuid default null,
  p_setter uuid default null,
  p_lead uuid default null,
  p_cerca text default null,
  p_da_registrare boolean default false,
  p_recenti boolean default false,
  p_limite integer default 50
)
returns table (
  id uuid,
  lead_id uuid,
  lead_nome text,
  lead_handle text,
  lead_stato public.lead_status,
  lead_fonte public.lead_source,
  setter_id uuid,
  setter_nome text,
  closer_id uuid,
  closer_nome text,
  tipo public.call_type,
  programmata_il timestamptz,
  stato public.call_status,
  esito public.call_outcome,
  qualificata boolean,
  motivo text,
  note_setter text,
  note_closer text,
  spostata_dal timestamptz,
  volte_spostata integer,
  follow_up_di uuid,
  di_follow_up boolean,
  partenza_il timestamptz,
  follow_up_id uuid,
  follow_up_il timestamptz,
  follow_up_stato public.call_status,
  importata boolean,
  prenotata_il timestamptz,
  prodotto_proposto_id uuid,
  prodotto text,
  link_registrazione text,
  performance public.call_performance,
  importo_proposto numeric,
  registrazione text,
  totale bigint
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_ruolo public.app_role := public.current_role();
  v_setter boolean;
  v_cerca text := nullif(lower(btrim(coalesce(p_cerca, ''))), '');
begin
  if v_ruolo is null or v_ruolo not in ('admin', 'setter', 'closer') then
    raise exception 'Le call le leggono il setter, il closer e l''admin.' using errcode = '42501';
  end if;
  v_setter := v_ruolo = 'setter';

  return query
  select
    c.id,
    c.lead_id,
    l.nome,
    l.instagram_handle,
    l.stato,
    l.fonte,
    c.setter_id,
    ps.nome,
    c.closer_id,
    pc.nome,
    c.tipo,
    c.programmata_il,
    c.stato,
    c.esito,
    c.qualificata,
    c.obiezione_principale,
    c.note,
    c.note_closer,
    c.spostata_dal,
    c.volte_spostata,
    c.follow_up_di,
    c.di_follow_up,
    pa.programmata_il,
    fu.id,
    fu.programmata_il,
    fu.stato,
    c.importata,
    c.created_at,
    c.prodotto_proposto_id,
    pr.nome,
    case when v_setter then null else c.link_registrazione end,
    case when v_setter then null else c.performance end,
    case when v_setter then null else cp.importo_proposto end,
    case when v_setter then null else r.stato end,
    count(*) over ()
  from public.calls c
  left join public.leads l on l.id = c.lead_id
  left join public.profiles ps on ps.id = c.setter_id
  left join public.profiles pc on pc.id = c.closer_id
  left join public.calls pa on pa.id = c.follow_up_di
  left join public.calls fu on fu.follow_up_di = c.id
  left join public.products pr on pr.id = c.prodotto_proposto_id
  left join public.call_pitch cp on cp.call_id = c.id
  left join public.call_registrazioni r on r.call_id = c.id
  where (p_id is null or c.id = p_id)
    and (p_da is null or c.programmata_il >= (p_da::timestamp at time zone 'Europe/Rome'))
    and (p_a is null or c.programmata_il < ((p_a + 1)::timestamp at time zone 'Europe/Rome'))
    and (p_stati is null or c.stato = any (p_stati))
    and (p_closer is null or c.closer_id = p_closer)
    and (p_setter is null or c.setter_id = p_setter)
    and (p_lead is null or c.lead_id = p_lead)
    and (not coalesce(p_da_registrare, false) or (c.stato = 'programmata' and c.programmata_il < now()))
    and (
      v_cerca is null
      or position(v_cerca in lower(coalesce(l.nome, ''))) > 0
      or position(ltrim(v_cerca, '@') in lower(coalesce(l.instagram_handle, ''))) > 0
    )
  order by
    case when coalesce(p_recenti, false) then c.programmata_il end desc nulls last,
    c.programmata_il,
    c.id
  limit least(greatest(coalesce(p_limite, 50), 1), 200);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. recap_sales(): the business coach's one page (and the admin's, to see what he sees)
-- ---------------------------------------------------------------------------
create or replace function public.recap_sales(p_da date, p_a date)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ruolo public.app_role := public.current_role();
  v_prec record;
  v_giorni integer;
  v_granularita text;
  v_passo interval;
  v_inizio date;
  v_corrente jsonb;
  v_precedente jsonb;
  v_funnel jsonb;
  v_serie jsonb;
begin
  -- the active admin and business coach, from the app; never a Claude token, never another role
  if public.da_client_oauth() or v_ruolo is null or v_ruolo not in ('admin', 'business_coach') then
    raise exception 'Il recap vendite lo leggono l''admin e il business coach.' using errcode = '42501';
  end if;
  perform public.verifica_periodo(p_da, p_a);
  select pp.da, pp.a into v_prec from public.periodo_precedente(p_da, p_a) pp;

  -- the functions of the Panoramica answer him what they answer the admin, only here (legge_come_admin)
  perform set_config('alpha.recap_sales', 'on', true);

  -- the totals: metriche_periodo (section 9) and the DM parts from metriche_setting's total row
  select jsonb_build_object(
      'dm_totali', m.dm_totali,
      'dm_outbound', coalesce(s.dm_outbound, 0),
      'dm_inbound', coalesce(s.dm_inbound, 0),
      'follow_up', coalesce(s.follow_up, 0),
      'conversazioni', m.conversazioni,
      'call_prenotate', m.call_prenotate,
      'call_svolte', m.call_svolte,
      'no_show', m.no_show,
      'show_rate', m.show_rate,
      'chiuse', m.chiuse,
      'close_rate', m.close_rate,
      'cash_nuovi_clienti', m.cash_nuovi_clienti,
      'revenue_nuovi', m.revenue_nuovi)
    into v_corrente
  from public.metriche_periodo(p_da, p_a) m
  left join public.metriche_setting(p_da, p_a) s on s.setter_id is null;

  select jsonb_build_object(
      'dm_totali', m.dm_totali,
      'dm_outbound', coalesce(s.dm_outbound, 0),
      'dm_inbound', coalesce(s.dm_inbound, 0),
      'follow_up', coalesce(s.follow_up, 0),
      'conversazioni', m.conversazioni,
      'call_prenotate', m.call_prenotate,
      'call_svolte', m.call_svolte,
      'no_show', m.no_show,
      'show_rate', m.show_rate,
      'chiuse', m.chiuse,
      'close_rate', m.close_rate,
      'cash_nuovi_clienti', m.cash_nuovi_clienti,
      'revenue_nuovi', m.revenue_nuovi)
    into v_precedente
  from public.metriche_periodo(v_prec.da, v_prec.a) m
  left join public.metriche_setting(v_prec.da, v_prec.a) s on s.setter_id is null;

  select coalesce(jsonb_agg(jsonb_build_object(
      'ordine', f.ordine, 'fase', f.fase, 'valore', f.valore, 'passaggio', f.passaggio) order by f.ordine), '[]'::jsonb)
    into v_funnel
  from public.funnel_periodo(p_da, p_a) f;

  perform set_config('alpha.recap_sales', '', true);

  -- the series: by day up to 31 days, by week (from Monday) up to 186, by month beyond; every bucket
  -- clipped to the period. Same definitions as metriche_periodo: the DM from the setters' reports, the
  -- calls by programmata_il in Europe/Rome, the cash of the new clients of the period (vendite «nuovo»
  -- signed from the start of the period, as the tile), so the buckets add up to the totals.
  v_giorni := p_a - p_da + 1;
  if v_giorni <= 31 then
    v_granularita := 'giorno';
    v_passo := interval '1 day';
    v_inizio := p_da;
  elsif v_giorni <= 186 then
    v_granularita := 'settimana';
    v_passo := interval '7 days';
    v_inizio := date_trunc('week', p_da)::date;
  else
    v_granularita := 'mese';
    v_passo := interval '1 month';
    v_inizio := date_trunc('month', p_da)::date;
  end if;

  with secchi as (
    select greatest(g::date, p_da) as inizio, least((g + v_passo)::date - 1, p_a) as fine
    from generate_series(v_inizio::timestamp, p_a::timestamp, v_passo) as g
  ),
  report as (
    select r.data, sum(r.dm_outbound) as dm_out, sum(r.dm_inbound) as dm_in, sum(r.follow_up) as fup
    from public.setter_daily_reports r
    where r.data between p_da and p_a
    group by r.data
  ),
  chiamate as (
    select (c.programmata_il at time zone 'Europe/Rome')::date as giorno,
           count(*) filter (where c.stato = 'svolta') as svolte,
           count(*) filter (where c.esito = 'chiusa') as chiuse
    from public.calls c
    where (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
    group by 1
  ),
  cassa as (
    select p.incassato_il as giorno, sum(p.importo_incassato) as cash
    from public.payments p
    join public.sales s on s.id = p.sale_id
    where p.stato in ('incassata', 'rimborsata')
      and p.incassato_il between p_da and p_a
      and s.tipo = 'nuovo' and s.data_vendita >= p_da
    group by 1
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'inizio', b.inizio,
      'fine', b.fine,
      'dm_outbound', coalesce((select sum(r.dm_out) from report r where r.data between b.inizio and b.fine), 0),
      'dm_inbound', coalesce((select sum(r.dm_in) from report r where r.data between b.inizio and b.fine), 0),
      'follow_up', coalesce((select sum(r.fup) from report r where r.data between b.inizio and b.fine), 0),
      'call_svolte', coalesce((select sum(c.svolte) from chiamate c where c.giorno between b.inizio and b.fine), 0),
      'chiuse', coalesce((select sum(c.chiuse) from chiamate c where c.giorno between b.inizio and b.fine), 0),
      'cash_nuovi_clienti', coalesce((select sum(k.cash) from cassa k where k.giorno between b.inizio and b.fine), 0)::numeric(12, 2)
    ) order by b.inizio), '[]'::jsonb)
    into v_serie
  from secchi b;

  return jsonb_build_object(
    'da', p_da,
    'a', p_a,
    'precedente_da', v_prec.da,
    'precedente_a', v_prec.a,
    'granularita', v_granularita,
    'valori', v_corrente,
    'precedenti', v_precedente,
    -- the relative change, as kpi_periodo computes it: null without a previous value
    'delta', (
      select jsonb_object_agg(k, round(public.rapporto((v_corrente ->> k)::numeric - (v_precedente ->> k)::numeric,
                                                       abs((v_precedente ->> k)::numeric)), 4))
      from unnest(array['dm_totali', 'conversazioni', 'call_prenotate', 'call_svolte', 'chiuse',
                        'cash_nuovi_clienti', 'revenue_nuovi']) as k
    ),
    'funnel', v_funnel,
    'serie', v_serie
  );
end;
$$;

comment on function public.recap_sales(date, date) is
  'The sales recap of a period (1.58.0): totals and previous period from metriche_periodo and metriche_setting, the relative delta, funnel_periodo, and the series by day, week or month. Aggregates only. The active admin and business coach; never an OAuth token (42501).';

revoke all on function public.recap_sales(date, date) from public, anon;
grant execute on function public.recap_sales(date, date) to authenticated, service_role;
