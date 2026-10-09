-- Claude connected to Alpha Management (Dany, 09/10/2026: «creare un mcp nella mia dashboard che
-- collego con claude normale e gli dico come riempire tutta la parte di content»).
-- Supabase Auth's OAuth 2.1 server issues the tokens: an ordinary Supabase JWT plus client_id and
-- session_id. Without this file such a token would open everything its owner sees in the app, and
-- for the admin that is every table and every RPC. With it, an OAuth token reaches only the content
-- calendar (marketing_contenuti and salva_sezione_contenuto), only for an active admin, video editor
-- or marketing person, only while its OAuth session lives, and only through a client registered by
-- hand. Three layers: the Data API filter (pre-request), a restrictive policy on every other table,
-- and current_role() / pm_livello_corrente() null for OAuth tokens, with explicit guards on the
-- definer RPCs that act on auth.uid() regardless of the role. Web sessions, the service role, the
-- cron, the seed and the import (no client_id) behave exactly as before.

-- 1. Does the request carry an OAuth token? Invoker: it only reads the JWT.
create or replace function public.da_client_oauth()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'client_id', '') <> '';
$$;
comment on function public.da_client_oauth() is
  'True when the request carries an OAuth 2.1 token (Claude): the JWT has a client_id. Used in the *_mai_da_oauth policies.';
revoke all on function public.da_client_oauth() from public, anon;
grant execute on function public.da_client_oauth() to authenticated;

-- 2. The role helper says nothing to an OAuth token: every allow-list policy, is_admin() and every
--    RPC that checks the role close for it. Same signature and return type: grants are kept.
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
    and not public.da_client_oauth();
$$;
comment on function public.current_role() is
  'Active role of the caller, or null when unknown, deactivated or when the request carries an OAuth token (Claude, 20261010090000). Use in policies.';

-- 3. The OAuth session behind the token is alive and belongs to a client registered by hand.
--    It reads Supabase Auth internals (a beta): any change there closes access, never opens it.
create or replace function public.mcp_token_valido()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_client uuid;
  v_sessione uuid;
begin
  begin
    v_client := nullif((select auth.jwt()) ->> 'client_id', '')::uuid;
    v_sessione := nullif((select auth.jwt()) ->> 'session_id', '')::uuid;
  exception when invalid_text_representation then
    return false;
  end;
  if v_client is null or v_sessione is null or (select auth.uid()) is null then
    return false;
  end if;
  return exists (
    select 1
    from auth.sessions s
    join auth.oauth_clients c on c.id = s.oauth_client_id
    where s.id = v_sessione
      and s.user_id = (select auth.uid())
      and s.oauth_client_id = v_client
      and (s.not_after is null or s.not_after > now())
      and c.deleted_at is null
      and c.registration_type::text = 'manual'
  );
exception when others then
  return false;
end;
$$;
comment on function public.mcp_token_valido() is
  'Internal: the OAuth session of the token is alive and its client was registered by hand (not dynamic, not deleted). Fails closed.';
revoke all on function public.mcp_token_valido() from public, anon, authenticated;

-- 4. Whom Claude acts for: the active admin, video editor or marketing person behind a live OAuth
--    token; null otherwise (web sessions included).
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
      and p.ruolo in ('admin', 'editor', 'marketing')
  ) end;
$$;
comment on function public.mcp_ruolo() is
  'The role Claude acts with (admin, editor, marketing) for a live OAuth token of an active person; null otherwise.';
revoke all on function public.mcp_ruolo() from public, anon;
grant execute on function public.mcp_ruolo() to authenticated;

-- 5. The Data API filter: an OAuth token reaches only the calendar. Registered on the authenticator
--    role below; PostgREST runs it before every request (Supabase, "Securing your API"). Anything
--    without a client_id returns at once: the web app, anon, the service role.
--    The schema: PostgREST reads accept-profile on GET and HEAD and content-profile on the other
--    methods; both, when present, must say public (a request naming another schema in either header
--    is refused, whatever the method).
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
begin
  if not public.da_client_oauth() then
    return;
  end if;
  -- proof for mcp_chi_sono() that the filter really ran on this request (transaction-local;
  -- set_config is allowed in the read-only transactions of GET and HEAD)
  perform set_config('alpha.mcp_filtro', 'on', true);
  v_percorso := ltrim(coalesce(current_setting('request.path', true), ''), '/');
  v_metodo := upper(coalesce(current_setting('request.method', true), ''));
  v_intestazioni := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  if coalesce(v_intestazioni ->> 'accept-profile', 'public') = 'public'
     and coalesce(v_intestazioni ->> 'content-profile', 'public') = 'public'
     and (
          (v_percorso = 'marketing_contenuti' and v_metodo in ('GET', 'HEAD', 'POST', 'PATCH', 'DELETE'))
       or (v_percorso = 'rpc/salva_sezione_contenuto' and v_metodo = 'POST')   -- volatile: POST only
       or (v_percorso = 'rpc/mcp_chi_sono' and v_metodo in ('GET', 'POST'))
     ) then
    return;
  end if;
  raise exception 'Da Claude si usa solo il calendario dei contenuti.' using errcode = '42501';
end;
$$;
comment on function public.mcp_filtro_richiesta() is
  'PostgREST pre-request: an OAuth token (Claude) reaches only marketing_contenuti, salva_sezione_contenuto (POST) and mcp_chi_sono, and raises the transaction-local flag alpha.mcp_filtro that mcp_chi_sono reports. The MCP allow-list: a later MCP tool adds its path here and in 00_schema.sql.';
revoke all on function public.mcp_filtro_richiesta() from public;
grant execute on function public.mcp_filtro_richiesta() to anon, authenticated, service_role;

alter role authenticator set pgrst.db_pre_request = 'public.mcp_filtro_richiesta';
notify pgrst, 'reload config';

-- 6. The route's question at every request: who is this token, and may it come in?
create or replace function public.mcp_chi_sono()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_ruolo public.app_role;
begin
  if not public.da_client_oauth() then
    return jsonb_build_object('esito', 'non_oauth');
  end if;
  if not public.mcp_token_valido() then
    return jsonb_build_object('esito', 'sessione');
  end if;
  select p.ruolo into v_ruolo
  from public.profiles p
  where p.id = (select auth.uid()) and p.attivo;
  if v_ruolo is null or v_ruolo not in ('admin', 'editor', 'marketing') then
    return jsonb_build_object('esito', 'ruolo');
  end if;
  return jsonb_build_object(
    'esito', 'ok',
    'ruolo', v_ruolo,
    -- true only when mcp_filtro_richiesta() ran before this very request (PostgREST loaded the
    -- setting, not just stored it): the route refuses with 503 otherwise, fail closed
    'filtro', coalesce(current_setting('alpha.mcp_filtro', true), '') = 'on'
  );
end;
$$;
comment on function public.mcp_chi_sono() is
  'The MCP route''s check: {esito: non_oauth | sessione | ruolo | ok, ruolo, filtro}; filtro = the Data API filter ran on this request. Never a name, never an id.';
revoke all on function public.mcp_chi_sono() from public, anon;
grant execute on function public.mcp_chi_sono() to authenticated;

-- 7. The consent page (web session): may this person connect Claude at all?
create or replace function public.puo_usare_mcp()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_role() in ('admin', 'editor', 'marketing'), false);
$$;
comment on function public.puo_usare_mcp() is
  'Web session only: the active admin, video editor or marketing person may connect Claude (consent page, Collega Claude).';
revoke all on function public.puo_usare_mcp() from public, anon;
grant execute on function public.puo_usare_mcp() to authenticated;

-- 8. The client ids to paste in Claude («Collega Claude»), for whoever may connect it. Public identifiers,
--    not secrets. Found by their redirect URI, not by name (a typo in the dashboard must not empty the card).
--    GoTrue stores redirect_uris as one comma-separated text.
create or replace function public.mcp_client()
returns table (tipo text, nome text, client_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select x.tipo, x.client_name, x.id
  from (
    select case
             when 'https://claude.ai/api/mcp/auth_callback' = any (string_to_array(c.redirect_uris, ',')) then 'claude'
             when 'http://localhost:48721/callback' = any (string_to_array(c.redirect_uris, ','))
               or 'http://127.0.0.1:48721/callback' = any (string_to_array(c.redirect_uris, ',')) then 'claude_code'
           end as tipo,
           c.client_name, c.id, c.created_at
    from auth.oauth_clients c
    where public.puo_usare_mcp()
      and c.deleted_at is null
      and c.registration_type::text = 'manual'
      and c.client_type::text = 'public'
  ) x
  where x.tipo is not null
  order by x.tipo, x.created_at;
$$;
comment on function public.mcp_client() is
  'The public OAuth clients registered by hand for Claude (redirect https://claude.ai/api/mcp/auth_callback) and Claude Code (loopback port 48721), for the Collega Claude card. Empty for everyone else and for OAuth tokens.';
revoke all on function public.mcp_client() from public, anon;
grant execute on function public.mcp_client() to authenticated;

-- 9. The Marketing area: the web session as in 1.32.0, or Claude for the same roles.
create or replace function public.vede_marketing()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.da_client_oauth() then public.mcp_ruolo() is not null
    else coalesce(public.current_role() in ('admin', 'editor', 'marketing'), false)
  end;
$$;
comment on function public.vede_marketing() is
  'The Marketing area: the active admin, video editor and marketing, from the app or from Claude with a live OAuth token (20261010090000).';

-- 10. The calendar's policies, evaluated once per statement (initplan). From Claude only the admin deletes.
drop policy marketing_contenuti_lettura on public.marketing_contenuti;
create policy marketing_contenuti_lettura on public.marketing_contenuti
  for select to authenticated using ((select public.vede_marketing()));
drop policy marketing_contenuti_inserimento on public.marketing_contenuti;
create policy marketing_contenuti_inserimento on public.marketing_contenuti
  for insert to authenticated with check ((select public.vede_marketing()));
drop policy marketing_contenuti_modifica on public.marketing_contenuti;
create policy marketing_contenuti_modifica on public.marketing_contenuti
  for update to authenticated using ((select public.vede_marketing())) with check ((select public.vede_marketing()));
drop policy marketing_contenuti_eliminazione on public.marketing_contenuti;
-- app: admin and marketing (the editor sets "Canceled"); Claude: only the admin (Dany, 09/10/2026)
create policy marketing_contenuti_eliminazione on public.marketing_contenuti
  for delete to authenticated
  using (coalesce((select public.current_role()) in ('admin', 'marketing'), false)
         or (select public.mcp_ruolo()) = 'admin');

-- 11. Every other table refuses OAuth tokens, whatever its permissive policies say. Realtime and
--     Storage, which skip the pre-request, are covered here. A table added later needs its own
--     <table>_mai_da_oauth policy (00_schema.sql fails without it), unless it joins the MCP allow-list.
do $$
declare
  t text;
begin
  for t in
    select tablename from pg_tables
    where schemaname = 'public' and tablename <> 'marketing_contenuti'
  loop
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated '
      'using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()))',
      t || '_mai_da_oauth', t);
  end loop;
end $$;

create policy oggetti_mai_da_oauth on storage.objects as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

-- 12. Definer RPCs that would still act for an OAuth token once current_role() is null: they act
--     on auth.uid() without a role check. pm_ferma_timer and segna_tutorial_visto (own rows),
--     inserisci_piano (created_by = auth.uid() or is_admin(), then inserts payments as the owner)
--     refuse OAuth tokens; mia_foto_google answers null. Bodies copied verbatim from their last
--     definition, with the OAuth guard as the first statement; signature, defaults, volatility and
--     grants unchanged (create or replace keeps grants). segna_tutorial_visto was language sql:
--     the same update in plpgsql.
create or replace function public.inserisci_piano(p_sale_id uuid, p_rate jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.da_client_oauth() then
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
  if public.da_client_oauth() then
    raise exception 'Da Claude si usa solo il calendario dei contenuti.' using errcode = '42501';
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

create or replace function public.segna_tutorial_visto()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.da_client_oauth() then
    raise exception 'Da Claude si usa solo il calendario dei contenuti.' using errcode = '42501';
  end if;
  update public.profiles set tutorial_visto = true
  where id = (select auth.uid()) and not tutorial_visto;
end;
$$;

--     pm_livello_corrente() falls back to profiles.livello_pm when current_role() is null: for an
--     OAuth token it would hand back the stored level and open pm_crea_progetto (definer, writes as
--     postgres) and the pm_puo_* predicates. It returns null for OAuth tokens; web sessions unchanged.
create or replace function public.pm_livello_corrente()
returns public.pm_livello
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.da_client_oauth() then null
    when public.current_role() = 'admin' then 'admin'::public.pm_livello
    else (
      select p.livello_pm from public.profiles p
      where p.id = (select auth.uid()) and p.attivo
    )
  end;
$$;

create or replace function public.mia_foto_google()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select public.foto_google(u.raw_user_meta_data)
  from auth.users u
  where u.id = (select auth.uid()) and not public.da_client_oauth();
$$;

-- 13. Hardening: a token can write its own user_metadata through Supabase Auth (PUT /auth/v1/user).
--     "Usa la foto di Google" accepts only Google's photo hosts.
create or replace function public.foto_google(p_meta jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when u ~ '^https://[a-z0-9-]+\.googleusercontent\.com/' then u end
  from (select coalesce(nullif(p_meta ->> 'avatar_url', ''), nullif(p_meta ->> 'picture', '')) as u) x;
$$;
