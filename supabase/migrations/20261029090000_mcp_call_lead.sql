-- Claude a 360 gradi, fase 2 di 4 (Dany, 22-23/10/2026: «l'MCP deve agire a 360 gradi, in lettura e
-- in modifica, in base all'utente collegato»): calls, leads and outcomes. Same shape as phase 1
-- (20261027110000_mcp_progetti_tempo.sql): dedicated tools only, the app's rules through a shared core
-- that receives the token's client, every role with its own permissions, nothing deleted.
--
-- Who does what from Claude, exactly as in the app (CLAUDE.md section 6):
--   setter  reads the calls with his name and his leads, books a call (fissa_call), moves a call of his
--           still to be held (sposta_call), reassigns the closer and writes his notes (modifica_call),
--           changes the state of his leads (aggiorna_stato_lead). Never an amount, the Fathom link or
--           the performance, never an outcome, a reason or the closer's notes.
--   closer  reads the calls assigned to him (amount pitched and recording included), records the
--           outcome (a PATCH on calls, as registraEsito does, plus collega_registrazione, sposta_call
--           and fissa_follow_up), moves, edits with the pencil (modifica_call, dettagli_call), changes
--           the state of the lead.
--   admin   all of the above on every call.
--   business coach  reads (call_per_claude, leads, products), never writes (the filter, as in 1.52.0).
--   the other roles  nothing of this phase.
-- Out of this phase, closed to Claude: Claude's analyses, valuations and proposed performance, Fathom's
-- transcripts and summaries, «Dalla call» and the setter's suggestions (call_analisi*, call_valutazioni,
-- call_spunti_setter, they keep <table>_mai_da_oauth), the origin of the leads (lead_contenuto), sales,
-- clients and payments (phase 3), the setter's reports and Instagram proposals, linking a sale to a call,
-- deleting calls or leads, unlinking a recording (scollega_registrazione deletes its row).
--
-- The three layers stay, each one narrowed:
--   1. mcp_filtro_richiesta gains the paths and methods the new tools use, by role, never DELETE.
--   2. calls, leads, call_pitch, call_registrazioni and products lose <table>_mai_da_oauth for four
--      restrictive policies <table>_claude_*: an OAuth token reads and writes them only inside a request
--      the filter approved (current_role() not null), deletes nothing (the amount pitched aside:
--      dettagli_call clears it by deleting its row, as in the app); call_registrazioni and products are
--      read only. A setter's token reads the rows of calls only inside the functions that need them
--      (call_per_claude, fissa_call, sposta_call, modifica_call): the table holds the Fathom link and the
--      performance, which he never reads (1.37.0), and a direct GET, or an embedding from leads, would
--      return those columns. Inside those functions they never reach him.
--   3. current_role() is unchanged: the role only inside an approved request.
-- The computed fields on calls (call_ha_follow_up, call_ha_vendita) answer null to every OAuth token:
-- the sale is phase 3, and whether a call has its follow-up call is said by fissa_follow_up in words.

-- ---------------------------------------------------------------------------
-- 1. The computed fields of calls: never for an OAuth token (bodies of 20261028090100, one line more)
-- ---------------------------------------------------------------------------
create or replace function public.call_ha_follow_up(c public.calls)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.calls f where f.follow_up_di = c.id)
  -- Claude's tokens never run it as a computed column (20261029090000): null for them
  where not public.da_client_oauth()
    and exists (
    select 1 from public.calls x
    where x.id = c.id
      and (
        public.legge_come_admin()
        or (public.current_role() = 'closer' and x.closer_id = (select auth.uid()))
        or (public.current_role() = 'setter' and x.setter_id = (select auth.uid()))
      )
  )
$$;

create or replace function public.call_ha_vendita(c public.calls)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.sales s where s.call_id = c.id)
  -- only on a call the caller reads as the admin or as its closer, checked on
  -- the stored row (never on the row passed in): null otherwise. Never for an
  -- OAuth token: the sales are phase 3 (20261029090000)
  where not public.da_client_oauth()
    and exists (
    select 1 from public.calls x
    where x.id = c.id
      and (
        public.legge_come_admin()
        or (public.current_role() = 'closer' and x.closer_id = (select auth.uid()))
      )
  )
$$;

-- ---------------------------------------------------------------------------
-- 2. call_per_claude: the calls as Claude reads them, security invoker (RLS decides which calls),
--    with the lead, the people and the follow-up in one row. The setter never receives the Fathom
--    link, the performance, the amount pitched or the recording, as in his page (1.37.0).
-- ---------------------------------------------------------------------------
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
  if v_ruolo is null or v_ruolo not in ('admin', 'setter', 'closer', 'business_coach') then
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
comment on function public.call_per_claude(uuid, date, date, public.call_status[], uuid, uuid, uuid, text, boolean, boolean, integer) is
  'The calls as Claude reads them (20261029090000), security invoker: RLS decides which calls. The setter never receives the Fathom link, the performance, the amount pitched or the recording. Admin, setter, closer and business coach; 42501 for the others.';
revoke all on function public.call_per_claude(uuid, date, date, public.call_status[], uuid, uuid, uuid, text, boolean, boolean, integer)
  from public, anon;
grant execute on function public.call_per_claude(uuid, date, date, public.call_status[], uuid, uuid, uuid, text, boolean, boolean, integer)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. The tables of this phase: <table>_mai_da_oauth gives way to four restrictive policies
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  v_valida constant text := '(not (select public.da_client_oauth()) or (select public.current_role()) is not null)';
  v_mai constant text := '(not (select public.da_client_oauth()))';
  v_scrive boolean;
begin
  foreach t in array array['calls', 'leads', 'call_pitch', 'call_registrazioni', 'products'] loop
    execute format('drop policy %I on public.%I', t || '_mai_da_oauth', t);
    -- what the tools write, always through the app's functions: calls and leads (fissa_call,
    -- modifica_call, sposta_call, the outcome), the amount pitched (dettagli_call). The recording and the
    -- products are read only (collega_registrazione is security definer).
    v_scrive := t in ('calls', 'leads', 'call_pitch');
    if t <> 'calls' then
      execute format('create policy %I on public.%I as restrictive for select to authenticated using %s',
        t || '_claude_lettura', t, v_valida);
    end if;
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check %s',
      t || '_claude_inserimento', t, case when v_scrive then v_valida else v_mai end);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using %s with check %s',
      t || '_claude_modifica', t,
      case when v_scrive then v_valida else v_mai end, case when v_scrive then v_valida else v_mai end);
    -- the amount pitched is cleared by deleting its row (dettagli_call with no amount), as in the app:
    -- the filter has no path to call_pitch, so only that function does it
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using %s',
      t || '_claude_eliminazione', t, case when t = 'call_pitch' then v_valida else v_mai end);
  end loop;
end $$;

-- A setter's token reads the rows of calls only inside the functions that need them: the table holds
-- the Fathom link and the performance (1.37.0), never his, and a direct GET or an embedding from leads
-- would return those columns. call_per_claude gives him the call without them.
create policy calls_claude_lettura on public.calls as restrictive for select to authenticated
  using (
    not (select public.da_client_oauth())
    or (
      (select public.current_role()) is not null
      and (
        (select public.current_role()) <> 'setter'
        or (select ltrim(coalesce(current_setting('request.path', true), ''), '/'))
           in ('rpc/call_per_claude', 'rpc/fissa_call', 'rpc/sposta_call', 'rpc/modifica_call')
      )
    )
  );

-- ---------------------------------------------------------------------------
-- 4. The Data API filter: the body of 20261028090100 with the paths of the call tools, by role
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
                            'rpc/call_per_claude') then
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
     ) then
    return;
  end if;
  raise exception 'Questa parte del gestionale non è raggiungibile da Claude.' using errcode = '42501';
end;
$$;
comment on function public.mcp_filtro_richiesta() is
  'PostgREST pre-request: an OAuth token (Claude) reaches only the MCP allow-list: the content calendar (marketing_contenuti, marketing_opzioni GET and HEAD, salva_sezione_contenuto, spunti_per_claude), projects, lists, tasks, notes and time (20261027110000, never DELETE), calls, leads and outcomes by role (20261029090000, never DELETE), and mcp_chi_sono. The business coach only reads (20261028090100). It raises the transaction-local flag alpha.mcp_filtro that current_role() and mcp_chi_sono read. A later MCP tool adds its path here, in 00_schema.sql and in its pgTAP test.';
