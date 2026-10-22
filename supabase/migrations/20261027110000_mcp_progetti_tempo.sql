-- Claude a 360 gradi, fase 1 di 4 (Dany, 22/10/2026): the MCP server works for whoever connects it,
-- with that person's permissions in the app, area by area. This phase opens projects, lists, tasks,
-- notes and time (CLAUDE.md section 18); calls and leads, clients and money, costs and the team stay
-- closed until their phase. Every role may connect Claude now (an active account only), and nothing is
-- deleted from Claude but a content of the calendar (the admin, repeating its Name, as before).
--
-- The three layers of 20261010090000_mcp_oauth.sql stay, each one narrowed instead of removed:
--   1. the Data API filter (mcp_filtro_richiesta) is still the allow-list: it gains exactly the paths
--      and methods the new MCP tools use, never DELETE on these tables;
--   2. the restrictive policies: the tables of this phase lose <table>_mai_da_oauth and get four
--      restrictive policies instead (<table>_claude_lettura, _inserimento, _modifica, _eliminazione):
--      an OAuth token reads and writes them only as a person the request may act for, deletes nothing
--      (task people aside: pm_imposta_assegnatari and pm_scegli_coach replace them), and on pm_tempo
--      writes only its own rows and reads only its own (the app admin the team's declared time);
--      every other table keeps its own _mai_da_oauth; Storage stays closed;
--   3. current_role() and pm_livello_corrente() give an OAuth token its person's role and project level
--      only inside a request the filter approved (the transaction-local flag alpha.mcp_filtro, which
--      only mcp_filtro_richiesta raises), with a live OAuth session of a client registered by hand
--      (mcp_token_valido) and an active account. Anywhere else (Realtime, Storage, a direct SQL call, a
--      PostgREST without the filter) they are null for it, as before: every definer RPC the filter does
--      not list stays closed even though it checks only the role.
-- Web sessions, the service role, the cron, the seed and the import (no client_id) are unchanged.

-- ---------------------------------------------------------------------------
-- 1. May this request act as its person? Internal: a live OAuth session of a client registered by
--    hand, inside a request the Data API filter approved. Never granted to a session.
-- ---------------------------------------------------------------------------
create or replace function public.mcp_richiesta_valida()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when coalesce(current_setting('alpha.mcp_filtro', true), '') = 'on' then public.mcp_token_valido()
    else false
  end;
$$;
comment on function public.mcp_richiesta_valida() is
  'Internal (20261027110000): an OAuth token acts as its person only inside a request the Data API filter approved (alpha.mcp_filtro) and with a live session of a client registered by hand. Fails closed.';
revoke all on function public.mcp_richiesta_valida() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The role helpers. Same signatures, volatility and grants (create or replace keeps them).
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
    and case when public.da_client_oauth() then public.mcp_richiesta_valida() else true end;
$$;
comment on function public.current_role() is
  'Active role of the caller, or null when unknown or deactivated. For an OAuth token (Claude) the person''s role only inside a request the Data API filter approved, with a live OAuth session (20261027110000); null anywhere else. Use in policies.';

create or replace function public.pm_livello_corrente()
returns public.pm_livello
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when x.ruolo is null then null
    when x.ruolo = 'admin' then 'admin'::public.pm_livello
    else (
      select p.livello_pm from public.profiles p
      where p.id = (select auth.uid()) and p.attivo
    )
  end
  from (select public.current_role() as ruolo) x;
$$;

-- Whom Claude acts for: the active person behind a live OAuth token, any role (null for web sessions)
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
  ) end;
$$;
comment on function public.mcp_ruolo() is
  'The role Claude acts with, for a live OAuth token of an active person (every role, 20261027110000); null otherwise.';

-- The calendar stays the Marketing area's, from Claude too: admin, video editor and marketing
create or replace function public.vede_marketing()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.da_client_oauth() then coalesce(public.mcp_ruolo() in ('admin', 'editor', 'marketing'), false)
    else coalesce(public.current_role() in ('admin', 'editor', 'marketing'), false)
  end;
$$;
comment on function public.vede_marketing() is
  'The Marketing area: the active admin, video editor and marketing, from the app or from Claude with a live OAuth token (20261010090000; any role connects Claude since 20261027110000, the calendar stays these three).';

-- The route's question: every active role is in; the project level travels with it
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
  select p.ruolo, p.livello_pm into v_ruolo, v_livello
  from public.profiles p
  where p.id = (select auth.uid()) and p.attivo;
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
comment on function public.mcp_chi_sono() is
  'The MCP route''s check: {esito: non_oauth | sessione | ruolo | ok, ruolo, livello, filtro}; ruolo = no active account; filtro = the Data API filter ran on this request. Never a name, never an id.';

-- The consent page (web session only): every active person may connect Claude
create or replace function public.puo_usare_mcp()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(not public.da_client_oauth() and public.current_role() is not null, false);
$$;
comment on function public.puo_usare_mcp() is
  'Web session only: every active person may connect Claude (consent page, Collega Claude; 20261027110000). Never an OAuth token.';

-- ---------------------------------------------------------------------------
-- 3. The calendar: from Claude only the admin deletes. current_role() now names an OAuth token's
--    person inside an approved request, so the app's rule says "from the app" explicitly.
-- ---------------------------------------------------------------------------
drop policy marketing_contenuti_eliminazione on public.marketing_contenuti;
create policy marketing_contenuti_eliminazione on public.marketing_contenuti
  for delete to authenticated
  using ((not (select public.da_client_oauth()) and coalesce((select public.current_role()) in ('admin', 'marketing'), false))
         or (select public.mcp_ruolo()) = 'admin');

-- The author of a content: Claude is treated as who is not admin, as in 1.34.0 (copied from
-- 20261009120100_contenuti_marketing.sql, with the OAuth condition)
create or replace function public.marketing_contenuti_autore()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or (public.is_admin() and not public.da_client_oauth()) then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
    new.created_at := now();
    new.notion_page_id := null;
  else
    new.id := old.id;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.notion_page_id := old.notion_page_id;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Projects: a client is linked to a project only from the app (the clients stay closed to Claude
--    in this phase). Bodies copied verbatim from their last definition, with the OAuth condition.
-- ---------------------------------------------------------------------------
create or replace function public.pm_progetti_guardia()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inizio date;
  v_fine date;
begin
  if new.client_id is distinct from old.client_id
     and (select auth.uid()) is not null
     and (public.current_role() is distinct from 'admin' or public.da_client_oauth()) then
    raise exception 'Solo l''admin collega un cliente al progetto' using errcode = '42501';
  end if;

  if new.responsabile_id is not null
     and new.responsabile_id is distinct from old.responsabile_id
     and not exists (
       select 1 from public.pm_membri m
       where m.progetto_id = new.id and m.profile_id = new.responsabile_id
     ) then
    raise exception 'Il responsabile deve far parte del progetto' using errcode = '22023';
  end if;

  if new.coach_id is not null
     and new.coach_id is distinct from old.coach_id
     and not exists (
       select 1 from public.pm_membri m
       where m.progetto_id = new.id and m.profile_id = new.coach_id
     ) then
    raise exception 'Il coach deve far parte del progetto' using errcode = '22023';
  end if;

  if new.client_id is not null and new.client_id is distinct from old.client_id then
    select x.inizio, x.fine into v_inizio, v_fine from public.pm_periodo_percorso(new.client_id) x;
    if v_inizio is not null then
      new.data_inizio := v_inizio;
      new.data_fine := v_fine;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.pm_crea_progetto(
  p_reparto_id uuid,
  p_nome text,
  p_descrizione text default null,
  p_client_id uuid default null,
  p_modello_id uuid default null,
  p_data_inizio date default null,
  p_data_fine date default null,
  p_membri uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
  v_livello public.pm_livello := public.pm_livello_corrente();
  v_inizio date := coalesce(p_data_inizio, public.oggi());
  v_fine date := p_data_fine;
  v_percorso_inizio date;
  v_percorso_fine date;
  v_progetto uuid;
begin
  if v_livello is null or v_livello = 'employee' then
    raise exception 'I progetti li crea un admin o un manager' using errcode = '42501';
  end if;
  if nullif(trim(p_nome), '') is null then
    raise exception 'Scrivi il nome del progetto' using errcode = '22023';
  end if;
  if not exists (select 1 from public.pm_reparti r where r.id = p_reparto_id and r.attivo) then
    raise exception 'Reparto non trovato' using errcode = '22023';
  end if;
  if p_client_id is not null and (public.current_role() is distinct from 'admin' or public.da_client_oauth()) then
    raise exception 'Solo l''admin collega un cliente al progetto' using errcode = '42501';
  end if;
  if p_client_id is not null and exists (select 1 from public.pm_progetti p where p.client_id = p_client_id) then
    raise exception 'Questo cliente ha già il suo progetto: lo apri dalla scheda del cliente' using errcode = '22023';
  end if;
  if p_modello_id is not null and not exists (
    select 1 from public.pm_modelli m where m.id = p_modello_id and m.attivo
  ) then
    raise exception 'Modello non trovato' using errcode = '22023';
  end if;

  -- a client's project lasts as long as its path
  if p_client_id is not null then
    select x.inizio, x.fine into v_percorso_inizio, v_percorso_fine from public.pm_periodo_percorso(p_client_id) x;
    if v_percorso_inizio is not null then
      v_inizio := v_percorso_inizio;
      v_fine := v_percorso_fine;
    end if;
  end if;

  if v_fine is null and p_modello_id is not null then
    select v_inizio + max(v.inizio_giorni + v.durata_giorni) - 1 into v_fine
    from public.pm_modelli_voci v
    where v.modello_id = p_modello_id;
  end if;

  insert into public.pm_progetti (
    reparto_id, nome, descrizione, client_id, data_inizio, data_fine, responsabile_id, created_by
  )
  values (
    p_reparto_id, trim(p_nome), nullif(trim(p_descrizione), ''), p_client_id,
    v_inizio, v_fine, v_utente, v_utente
  )
  returning id into v_progetto;

  insert into public.pm_membri (progetto_id, profile_id, aggiunto_da)
  select v_progetto, p.id, v_utente
  from public.profiles p
  where p.attivo and (p.id = v_utente or p.id = any (coalesce(p_membri, '{}')))
  on conflict (progetto_id, profile_id) do nothing;

  if p_modello_id is not null then
    perform public.pm_applica_modello(v_progetto, p_modello_id, v_inizio, v_utente);
  end if;

  return v_progetto;
end;
$$;

-- The timer stops from Claude too, but only for a token the request may act for
create or replace function public.pm_ferma_timer(p_nota text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_utente uuid := (select auth.uid());
  v_id uuid;
begin
  if public.da_client_oauth() and public.current_role() is null then
    raise exception 'Questa parte del gestionale non è raggiungibile da Claude.' using errcode = '42501';
  end if;
  if v_utente is null then
    raise exception 'Sessione scaduta' using errcode = '42501';
  end if;

  update public.pm_tempo
  set fine = greatest(clock_timestamp(), inizio + interval '1 second'),
      nota = coalesce(nullif(trim(p_nota), ''), nota)
  where profile_id = v_utente and inizio is not null and fine is null
  returning id into v_id;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. The tables of this phase: <table>_mai_da_oauth gives way to four restrictive policies.
--    Reading and writing need a request that may act as its person (current_role() not null, which
--    for an OAuth token means: approved by the filter, live session, active account). Nothing is
--    deleted from Claude. Read-only tables are never written from Claude.
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
  v_valida constant text := '(not (select public.da_client_oauth()) or (select public.current_role()) is not null)';
  v_mai constant text := '(not (select public.da_client_oauth()))';
  v_scrive boolean;
begin
  foreach t in array array[
    'pm_progetti', 'pm_membri', 'pm_tasklist', 'pm_task', 'pm_task_assegnatari', 'pm_note',
    'pm_reparti', 'pm_modelli', 'profiles'
  ] loop
    execute format('drop policy %I on public.%I', t || '_mai_da_oauth', t);
    -- what the MCP tools write: projects (update), members (insert), lists and tasks (insert, update),
    -- task people (through pm_imposta_assegnatari and pm_scegli_coach), notes (insert only)
    v_scrive := t in ('pm_progetti', 'pm_membri', 'pm_tasklist', 'pm_task', 'pm_task_assegnatari');
    execute format('create policy %I on public.%I as restrictive for select to authenticated using %s',
      t || '_claude_lettura', t, v_valida);
    execute format('create policy %I on public.%I as restrictive for insert to authenticated with check %s',
      t || '_claude_inserimento', t, case when v_scrive or t = 'pm_note' then v_valida else v_mai end);
    execute format('create policy %I on public.%I as restrictive for update to authenticated using %s with check %s',
      t || '_claude_modifica', t,
      case when v_scrive then v_valida else v_mai end, case when v_scrive then v_valida else v_mai end);
    -- the people of a task are replaced, not deleted as data: pm_imposta_assegnatari and pm_scegli_coach
    execute format('create policy %I on public.%I as restrictive for delete to authenticated using %s',
      t || '_claude_eliminazione', t, case when t = 'pm_task_assegnatari' then v_valida else v_mai end);
  end loop;
end $$;

-- Time: always one's own from Claude (written only through the time RPCs); the app admin reads the
-- team's declared time (pm_tempo_per_persona), never a running timer of another (pm_tempo_select)
drop policy pm_tempo_mai_da_oauth on public.pm_tempo;
create policy pm_tempo_claude_lettura on public.pm_tempo as restrictive for select to authenticated
  using (not (select public.da_client_oauth())
         or ((select public.current_role()) is not null
             and (profile_id = (select auth.uid()) or (select public.current_role()) = 'admin')));
create policy pm_tempo_claude_inserimento on public.pm_tempo as restrictive for insert to authenticated
  with check (not (select public.da_client_oauth())
              or ((select public.current_role()) is not null and profile_id = (select auth.uid())));
create policy pm_tempo_claude_modifica on public.pm_tempo as restrictive for update to authenticated
  using (not (select public.da_client_oauth())
         or ((select public.current_role()) is not null and profile_id = (select auth.uid())))
  with check (not (select public.da_client_oauth())
              or ((select public.current_role()) is not null and profile_id = (select auth.uid())));
create policy pm_tempo_claude_eliminazione on public.pm_tempo as restrictive for delete to authenticated
  using (not (select public.da_client_oauth()));

-- ---------------------------------------------------------------------------
-- 6. The Data API filter: the allow-list grows by the paths of the new tools, method by method
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
begin
  if not public.da_client_oauth() then
    return;
  end if;
  perform set_config('alpha.mcp_filtro', 'on', true);
  v_percorso := ltrim(coalesce(current_setting('request.path', true), ''), '/');
  v_metodo := upper(coalesce(current_setting('request.method', true), ''));
  v_intestazioni := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_lettura := v_metodo in ('GET', 'HEAD');
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
     ) then
    return;
  end if;
  raise exception 'Questa parte del gestionale non è raggiungibile da Claude.' using errcode = '42501';
end;
$$;
comment on function public.mcp_filtro_richiesta() is
  'PostgREST pre-request: an OAuth token (Claude) reaches only the MCP allow-list: the content calendar (marketing_contenuti, marketing_opzioni GET and HEAD, salva_sezione_contenuto, spunti_per_claude), projects, lists, tasks, notes and time (20261027110000, never DELETE), and mcp_chi_sono. It raises the transaction-local flag alpha.mcp_filtro that current_role() and mcp_chi_sono read. A later MCP tool adds its path here, in 00_schema.sql and in 100_mcp_progetti_tempo.sql.';
