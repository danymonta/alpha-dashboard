-- The business coach reads what the admin reads, and never writes (Dany,
-- 22/10/2026: «Voglio che il business coach abbia accessi in lettura e veda
-- tutto»). CLAUDE.md section 6, «Business coach».
--
-- 1. legge_come_admin(): true for an active admin or business coach, like
--    current_role() (null for a Claude token outside a request the Data API
--    filter admitted, so false there). It only ever opens SELECT policies and
--    read functions: is_admin() stays as it was and keeps guarding every write.
-- 2. One SELECT policy, <tabella>_lettura_come_admin, on each table the admin
--    reads. Never on what not even the admin reads, or what is one person's
--    (call_valutazioni, call_spunti_setter, notifiche), on the keys and the
--    connections (instagram_collegamento, instagram_esclusi, messenger_*,
--    fathom_collegamento, *_lavori_stato: the pages read them through their
--    functions), on the tables no session reads, nor on the Instagram
--    proposals of the setter's report (report_proposte_instagram: Dany decided
--    the setter and the admin see what the system counts next to what the
--    setter declares, section 17; the closed version until he says otherwise).
-- 3. No project level: pm_livello_corrente() is null for him, so pm_puo_vedere()
--    and pm_puo_gestire() are false and no write policy of the Projects area
--    passes, whatever livello_pm says or whichever project he is a member of.
--    He reads every project through the policies of point 2.
-- 4. The read functions the admin uses accept him (the bodies are copied as
--    they are, only the guard changes).
-- 5. Claude connected: in the Data API filter his token reaches only GET and
--    HEAD and the read functions, never a write; he reads the time of the team
--    like the admin (pm_tempo_claude_lettura).

create or replace function public.legge_come_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_role() in ('admin', 'business_coach'), false);
$$;

revoke all on function public.legge_come_admin() from public, anon;
grant execute on function public.legge_come_admin() to authenticated, service_role;

comment on function public.legge_come_admin() is
  'True for an active admin or business coach (current_role()). Only for SELECT policies and read functions: never in a write policy or a function that writes (pgTAP 101).';

-- 3. No project level for the business coach: the body of 20261027110000 with one line more
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
    -- he reads every project through his own SELECT policies and never writes there
    when x.ruolo = 'business_coach' then null
    else (
      select p.livello_pm from public.profiles p
      where p.id = (select auth.uid()) and p.attivo
    )
  end
  from (select public.current_role() as ruolo) x;
$$;

-- 2. The SELECT policies. (select …) so the function runs once per statement.
create policy audit_log_lettura_come_admin on public.audit_log
  for select to authenticated using ((select public.legge_come_admin()));
create policy call_analisi_lettura_come_admin on public.call_analisi
  for select to authenticated using ((select public.legge_come_admin()));
create policy call_analisi_setter_lettura_come_admin on public.call_analisi_setter
  for select to authenticated using ((select public.legge_come_admin()));
create policy call_pitch_lettura_come_admin on public.call_pitch
  for select to authenticated using ((select public.legge_come_admin()));
create policy call_registrazioni_lettura_come_admin on public.call_registrazioni
  for select to authenticated using ((select public.legge_come_admin()));
create policy calls_lettura_come_admin on public.calls
  for select to authenticated using ((select public.legge_come_admin()));
create policy clienti_cartelle_lettura_come_admin on public.clienti_cartelle
  for select to authenticated using ((select public.legge_come_admin()));
create policy clienti_chiusure_lettura_come_admin on public.clienti_chiusure
  for select to authenticated using ((select public.legge_come_admin()));
create policy clienti_sospensioni_lettura_come_admin on public.clienti_sospensioni
  for select to authenticated using ((select public.legge_come_admin()));
create policy clients_lettura_come_admin on public.clients
  for select to authenticated using ((select public.legge_come_admin()));
create policy commission_payouts_lettura_come_admin on public.commission_payouts
  for select to authenticated using ((select public.legge_come_admin()));
create policy commission_rules_lettura_come_admin on public.commission_rules
  for select to authenticated using ((select public.legge_come_admin()));
create policy expenses_lettura_come_admin on public.expenses
  for select to authenticated using ((select public.legge_come_admin()));
create policy insight_esecuzioni_lettura_come_admin on public.insight_esecuzioni
  for select to authenticated using ((select public.legge_come_admin()));
create policy insight_fatto_lettura_come_admin on public.insight_fatto
  for select to authenticated using ((select public.legge_come_admin()));
create policy insight_impostazioni_lettura_come_admin on public.insight_impostazioni
  for select to authenticated using ((select public.legge_come_admin()));
create policy insight_recap_lettura_come_admin on public.insight_recap
  for select to authenticated using ((select public.legge_come_admin()));
create policy instagram_account_misure_lettura_come_admin on public.instagram_account_misure
  for select to authenticated using ((select public.legge_come_admin()));
create policy instagram_contenuti_lettura_come_admin on public.instagram_contenuti
  for select to authenticated using ((select public.legge_come_admin()));
create policy instagram_contenuti_dm_lettura_come_admin on public.instagram_contenuti_dm
  for select to authenticated using ((select public.legge_come_admin()));
create policy instagram_contenuti_dm_giorni_lettura_come_admin on public.instagram_contenuti_dm_giorni
  for select to authenticated using ((select public.legge_come_admin()));
create policy instagram_contenuti_misure_lettura_come_admin on public.instagram_contenuti_misure
  for select to authenticated using ((select public.legge_come_admin()));
create policy instagram_contenuti_stato_lettura_come_admin on public.instagram_contenuti_stato
  for select to authenticated using ((select public.legge_come_admin()));
create policy instagram_letture_lettura_come_admin on public.instagram_letture
  for select to authenticated using ((select public.legge_come_admin()));
create policy invites_lettura_come_admin on public.invites
  for select to authenticated using ((select public.legge_come_admin()));
create policy lead_contenuto_lettura_come_admin on public.lead_contenuto
  for select to authenticated using ((select public.legge_come_admin()));
create policy leads_lettura_come_admin on public.leads
  for select to authenticated using ((select public.legge_come_admin()));
create policy marketing_abbinamenti_lettura_come_admin on public.marketing_abbinamenti
  for select to authenticated using ((select public.legge_come_admin()));
create policy marketing_abbinamenti_rifiutati_lettura_come_admin on public.marketing_abbinamenti_rifiutati
  for select to authenticated using ((select public.legge_come_admin()));
create policy marketing_analisi_lettura_come_admin on public.marketing_analisi
  for select to authenticated using ((select public.legge_come_admin()));
create policy marketing_contenuti_lettura_come_admin on public.marketing_contenuti
  for select to authenticated using ((select public.legge_come_admin()));
create policy marketing_opzioni_lettura_come_admin on public.marketing_opzioni
  for select to authenticated using ((select public.legge_come_admin()));
create policy marketing_post_esclusi_lettura_come_admin on public.marketing_post_esclusi
  for select to authenticated using ((select public.legge_come_admin()));
create policy marketing_spunti_lettura_come_admin on public.marketing_spunti
  for select to authenticated using ((select public.legge_come_admin()));
create policy obiettivi_mese_lettura_come_admin on public.obiettivi_mese
  for select to authenticated using ((select public.legge_come_admin()));
create policy payments_lettura_come_admin on public.payments
  for select to authenticated using ((select public.legge_come_admin()));
create policy pm_membri_lettura_come_admin on public.pm_membri
  for select to authenticated using ((select public.legge_come_admin()));
create policy pm_modelli_lettura_come_admin on public.pm_modelli
  for select to authenticated using ((select public.legge_come_admin()));
create policy pm_modelli_voci_lettura_come_admin on public.pm_modelli_voci
  for select to authenticated using ((select public.legge_come_admin()));
create policy pm_note_lettura_come_admin on public.pm_note
  for select to authenticated using ((select public.legge_come_admin()));
create policy pm_progetti_lettura_come_admin on public.pm_progetti
  for select to authenticated using ((select public.legge_come_admin()));
create policy pm_reparti_lettura_come_admin on public.pm_reparti
  for select to authenticated using ((select public.legge_come_admin()));
create policy pm_task_lettura_come_admin on public.pm_task
  for select to authenticated using ((select public.legge_come_admin()));
create policy pm_tasklist_lettura_come_admin on public.pm_tasklist
  for select to authenticated using ((select public.legge_come_admin()));
-- the time already declared, never someone's running timer (section 17), like Tempo › Team
create policy pm_tempo_lettura_come_admin on public.pm_tempo
  for select to authenticated using ((select public.legge_come_admin()) and minuti is not null);
create policy products_lettura_come_admin on public.products
  for select to authenticated using ((select public.legge_come_admin()));
create policy promemoria_percorso_lettura_come_admin on public.promemoria_percorso
  for select to authenticated using ((select public.legge_come_admin()));
create policy sales_lettura_come_admin on public.sales
  for select to authenticated using ((select public.legge_come_admin()));
create policy setter_daily_reports_lettura_come_admin on public.setter_daily_reports
  for select to authenticated using ((select public.legge_come_admin()));
create policy vendite_contratti_lettura_come_admin on public.vendite_contratti
  for select to authenticated using ((select public.legge_come_admin()));
-- pm_task_assegnatari reads through pm_task (its policy is an EXISTS on pm_task); profiles is read by every role

-- 5a. Claude connected: the business coach reads the team's declared time like the admin (tempo_team)
drop policy pm_tempo_claude_lettura on public.pm_tempo;
create policy pm_tempo_claude_lettura on public.pm_tempo
  as restrictive for select to authenticated
  using (
    not (select public.da_client_oauth())
    or (
      (select public.current_role()) is not null
      and (profile_id = (select auth.uid()) or (select public.legge_come_admin()))
    )
  );

-- 5b. The Data API filter: the body of 20261027110000 with the business coach's
-- token limited to reads (GET, HEAD and the read functions), never a write.
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
  -- the business coach reads only (22/10/2026): his token writes nothing, anywhere
  if public.mcp_ruolo() = 'business_coach'
     and not v_lettura
     and v_percorso not in ('rpc/spunti_per_claude', 'rpc/mcp_chi_sono', 'rpc/pm_riepilogo_tempo',
                            'rpc/pm_tempo_per_persona', 'rpc/pm_timer_attivo', 'rpc/pm_mio_tempo_per_task') then
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
     ) then
    return;
  end if;
  raise exception 'Questa parte del gestionale non è raggiungibile da Claude.' using errcode = '42501';
end;
$$;

-- 4. The read functions: their bodies as they were, the guard opened to the
-- business coach (legge_come_admin(), or his role next to the admin's).
CREATE OR REPLACE FUNCTION public.avanzamento_obiettivi(p_mese date)
 RETURNS TABLE(mese date, obiettivo_cash numeric, cash numeric, quota_cash numeric, obiettivo_nuovi integer, nuovi integer, quota_nuovi numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_mese date := date_trunc('month', p_mese)::date;
  v_fine date := (date_trunc('month', p_mese) + interval '1 month - 1 day')::date;
begin
  if not public.legge_come_admin() then
    raise exception 'Gli obiettivi li vede solo l''admin' using errcode = '42501';
  end if;
  return query
  with o as (select * from public.obiettivi_mese where obiettivi_mese.mese = v_mese),
  c as (
    select coalesce(sum(p.importo_incassato), 0)::numeric(12, 2) as tot
    from public.payments p
    where p.stato in ('incassata', 'rimborsata') and p.incassato_il between v_mese and v_fine
  ),
  n as (
    select count(*)::integer as tot from public.sales s
    where s.tipo = 'nuovo' and s.data_vendita between v_mese and v_fine
  )
  select
    v_mese,
    o.cash,
    c.tot,
    case when o.cash is null then null else round(c.tot / o.cash, 4) end,
    o.nuovi_clienti,
    n.tot,
    case when o.nuovi_clienti is null then null else round(n.tot::numeric / o.nuovi_clienti, 4) end
  from c cross join n left join o on true;
end;
$function$;

CREATE OR REPLACE FUNCTION public.call_ha_follow_up(c calls)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.calls f where f.follow_up_di = c.id)
  where exists (
    select 1 from public.calls x
    where x.id = c.id
      and (
        public.legge_come_admin()
        or (public.current_role() = 'closer' and x.closer_id = (select auth.uid()))
        or (public.current_role() = 'setter' and x.setter_id = (select auth.uid()))
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.call_ha_vendita(c calls)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select exists (select 1 from public.sales s where s.call_id = c.id)
  -- only on a call the caller reads as the admin or as its closer, checked on
  -- the stored row (never on the row passed in): null otherwise
  where exists (
    select 1 from public.calls x
    where x.id = c.id
      and (
        public.legge_come_admin()
        or (public.current_role() = 'closer' and x.closer_id = (select auth.uid()))
      )
  )
$function$;

CREATE OR REPLACE FUNCTION public.cash_mensile(p_mesi integer DEFAULT 12, p_fino date DEFAULT NULL::date)
 RETURNS TABLE(mese date, nuovi_clienti numeric, rate_precedenti numeric, rinnovo numeric, upsell numeric, totale numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_ultimo date := date_trunc('month', coalesce(p_fino, public.oggi()))::date;
begin
  if not public.legge_come_admin() then
    raise exception 'Le metriche economiche le vede solo l''admin' using errcode = '42501';
  end if;

  return query
  with mesi as (
    select (v_ultimo - (interval '1 month' * g))::date as m
    from generate_series(0, greatest(p_mesi, 1) - 1) as g
  ),
  cassa as (
    select
      date_trunc('month', p.incassato_il)::date as m,
      sum(p.importo_incassato) filter (
        where s.tipo = 'nuovo' and s.data_vendita >= date_trunc('month', p.incassato_il)::date
      ) as entrati,
      sum(p.importo_incassato) filter (
        where s.tipo = 'nuovo' and s.data_vendita < date_trunc('month', p.incassato_il)::date
      ) as precedenti,
      sum(p.importo_incassato) filter (where s.tipo = 'rinnovo') as rinn,
      sum(p.importo_incassato) filter (where s.tipo = 'upsell') as ups,
      sum(p.importo_incassato) as tot
    from public.payments p
    join public.sales s on s.id = p.sale_id
    where p.stato in ('incassata', 'rimborsata')
      and p.incassato_il >= (v_ultimo - (interval '1 month' * (greatest(p_mesi, 1) - 1)))::date
    group by 1
  )
  select
    mesi.m,
    coalesce(cassa.entrati, 0)::numeric(12, 2),
    coalesce(cassa.precedenti, 0)::numeric(12, 2),
    coalesce(cassa.rinn, 0)::numeric(12, 2),
    coalesce(cassa.ups, 0)::numeric(12, 2),
    coalesce(cassa.tot, 0)::numeric(12, 2)
  from mesi
  left join cassa on cassa.m = mesi.m
  order by mesi.m;
end;
$function$;

CREATE OR REPLACE FUNCTION public.clienti_elenco(p_stati client_status[] DEFAULT NULL::client_status[])
 RETURNS TABLE(client_id uuid, nome text, cognome text, stato client_status, sale_id uuid, prodotto text, tipo sale_type, numero_percorso integer, data_inizio date, data_fine date, mese integer, mesi_totali integer, settimana integer, settimane_totali integer, valore_contratto numeric, incassato numeric, da_incassare numeric, in_ritardo numeric, rate_totali integer, rate_incassate integer, prossima_scadenza date, prossimo_importo numeric, metodi text[], contratto_url text, cartella_url text, ltv numeric, sospeso_il date, chiuso_il date, rate jsonb)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
#variable_conflict use_column
begin
  if not public.legge_come_admin() then
    raise exception 'L''elenco dei clienti col contratto lo vede solo l''admin' using errcode = '42501';
  end if;

  return query
  with corrente as (
    -- the path that ends last (a renewal after a pause counts), one per client
    select distinct on (s.client_id)
      s.client_id, s.id as sale_id, s.tipo, s.data_inizio, s.data_fine, s.valore_contratto,
      coalesce(pr.nome, s.prodotto_personalizzato) as prodotto,
      s.product_id
    from public.sales s
    left join public.products pr on pr.id = s.product_id
    order by s.client_id, s.data_fine desc, s.data_inizio desc, s.created_at desc
  ),
  numerati as (
    -- "Primo percorso" is 1, the n-th paths after it count up (an upsell is not a path)
    select s.id as sale_id,
           count(*) filter (where s.tipo in ('nuovo', 'rinnovo'))
             over (partition by s.client_id order by s.data_inizio, s.created_at)::integer as n
    from public.sales s
  ),
  pagamenti as (
    select p.sale_id,
           coalesce(jsonb_agg(jsonb_build_object(
             'numero', p.numero_rata,
             'scadenza', p.scadenza,
             'importo_previsto', p.importo_previsto,
             'stato', p.stato,
             'incassato_il', p.incassato_il,
             'importo_incassato', p.importo_incassato,
             'metodo', p.metodo,
             'in_ritardo', p.stato = 'prevista' and p.scadenza < public.oggi()
           ) order by p.numero_rata), '[]'::jsonb) as rate,
           array_remove(array_agg(distinct p.metodo::text) filter (where p.stato = 'incassata'), null) as metodi,
           (array_agg(p.importo_previsto order by p.scadenza, p.numero_rata)
              filter (where p.stato = 'prevista'))[1] as prossimo_importo
    from public.payments p
    group by p.sale_id
  )
  select
    st.client_id,
    st.nome,
    st.cognome,
    st.stato,
    co.sale_id,
    co.prodotto,
    co.tipo,
    nu.n,
    co.data_inizio,
    co.data_fine,
    case when public.oggi() < co.data_inizio then null
         else least(
           greatest(1, round((co.data_fine - co.data_inizio + 1) / 30.4375)::integer),
           floor((public.oggi() - co.data_inizio) / 30.4375)::integer + 1)
    end,
    greatest(1, round((co.data_fine - co.data_inizio + 1) / 30.4375)::integer),
    case when public.oggi() < co.data_inizio then null
         else least(
           ceil((co.data_fine - co.data_inizio + 1) / 7.0)::integer,
           floor((public.oggi() - co.data_inizio) / 7.0)::integer + 1)
    end,
    ceil((co.data_fine - co.data_inizio + 1) / 7.0)::integer,
    co.valore_contratto,
    v.incassato,
    v.da_incassare,
    v.in_ritardo,
    v.rate_totali,
    v.rate_incassate,
    v.prossima_scadenza,
    pa.prossimo_importo,
    coalesce(pa.metodi, '{}'::text[]),
    ct.url,
    cd.url,
    cl.incassato,
    sp.sospeso_il,
    ch.chiuso_il,
    coalesce(pa.rate, '[]'::jsonb)
  from public.v_client_status st
  join corrente co on co.client_id = st.client_id
  join numerati nu on nu.sale_id = co.sale_id
  join public.v_vendite v on v.sale_id = co.sale_id
  join public.v_clienti cl on cl.client_id = st.client_id
  left join pagamenti pa on pa.sale_id = co.sale_id
  left join public.vendite_contratti ct on ct.sale_id = co.sale_id
  left join public.clienti_cartelle cd on cd.client_id = st.client_id
  left join public.clienti_sospensioni sp on sp.client_id = st.client_id
  left join public.v_clienti_chiusi ch on ch.client_id = st.client_id
  where p_stati is null or st.stato = any (p_stati)
  order by st.cognome nulls last, st.nome, st.client_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.commenti_setter_periodo(p_da date, p_a date, p_setter uuid DEFAULT NULL::uuid, p_limite integer DEFAULT 200)
 RETURNS TABLE(tipo text, scala text, livello text, giorni integer, su_giorni integer, quota numeric, report_id uuid, data date, setter_id uuid, setter text, lead_in_target quota_in_target, qualita_conversazioni qualita_conversazioni, cosa_frenava text, domande_contenuti text, note text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  -- enough days to read; never the whole history in one answer
  v_limite integer := least(greatest(coalesce(p_limite, 200), 1), 1000);
begin
  if not public.legge_come_admin() then
    raise exception 'I commenti per il marketing li legge solo l''admin' using errcode = '42501';
  end if;
  perform public.verifica_periodo(p_da, p_a);

  return query
  with base as (
    select r.id, r.data, r.setter_id, r.lead_in_target, r.qualita_conversazioni,
      nullif(btrim(r.cosa_frenava), '') as cosa_frenava,
      nullif(btrim(r.domande_contenuti), '') as domande_contenuti,
      nullif(btrim(r.note), '') as note
    from public.setter_daily_reports r
    where r.data between p_da and p_a
      and (p_setter is null or r.setter_id = p_setter)
  ),
  livelli as (
    select 'lead_in_target'::text as scala, l::text as livello, 1 as ordine_scala, o::integer as ordine
    from unnest(enum_range(null::public.quota_in_target)) with ordinality as t(l, o)
    union all
    select 'qualita_conversazioni'::text, l::text, 2, o::integer
    from unnest(enum_range(null::public.qualita_conversazioni)) with ordinality as t(l, o)
  ),
  risposte as (
    select 'lead_in_target'::text as scala, b.lead_in_target::text as livello
    from base b where b.lead_in_target is not null
    union all
    select 'qualita_conversazioni'::text, b.qualita_conversazioni::text
    from base b where b.qualita_conversazioni is not null
  ),
  conteggi as (
    select l.scala, l.livello, l.ordine_scala, l.ordine, count(x.livello)::integer as giorni
    from livelli l
    left join risposte x on x.scala = l.scala and x.livello = l.livello
    group by l.scala, l.livello, l.ordine_scala, l.ordine
  ),
  scale as (
    select c.*, (sum(c.giorni) over (partition by c.scala))::integer as su_giorni
    from conteggi c
  ),
  scritti as (
    select b.*, pr.nome as setter_nome
    from base b
    left join public.profiles pr on pr.id = b.setter_id
    where b.cosa_frenava is not null or b.domande_contenuti is not null or b.note is not null
    order by b.data desc, pr.nome nulls last, b.id
    limit v_limite
  ),
  righe as (
    select
      'scala'::text as tipo, s.scala, s.livello, s.giorni, s.su_giorni,
      round(s.giorni::numeric / nullif(s.su_giorni, 0), 4) as quota,
      null::uuid as report_id, null::date as data, null::uuid as setter_id, null::text as setter,
      null::public.quota_in_target as lead_in_target,
      null::public.qualita_conversazioni as qualita_conversazioni,
      null::text as cosa_frenava, null::text as domande_contenuti, null::text as note,
      s.ordine_scala, s.ordine, null::text as ordine_nome
    from scale s
    union all
    select
      'giorno', null, null, null, null, null,
      w.id, w.data, w.setter_id, w.setter_nome, w.lead_in_target, w.qualita_conversazioni,
      w.cosa_frenava, w.domande_contenuti, w.note,
      3, null, w.setter_nome
    from scritti w
  )
  select
    r.tipo, r.scala, r.livello, r.giorni, r.su_giorni, r.quota,
    r.report_id, r.data, r.setter_id, r.setter, r.lead_in_target, r.qualita_conversazioni,
    r.cosa_frenava, r.domande_contenuti, r.note
  from righe r
  order by r.ordine_scala, r.ordine nulls last, r.data desc nulls last, r.ordine_nome nulls last, r.report_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.da_incassare()
 RETURNS TABLE(fascia text, totale numeric, numero bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not public.legge_come_admin() then
    raise exception 'Le metriche economiche le vede solo l''admin' using errcode = '42501';
  end if;

  return query
  select f.fascia,
         coalesce(sum(p.importo_previsto), 0)::numeric(12, 2),
         count(p.id)
  from (values (1, 'in_ritardo'), (2, 'prossimi_30'), (3, 'oltre')) as f(ordine, fascia)
  left join public.payments p
    on p.stato = 'prevista'
   and case
         when p.scadenza < public.oggi() then 'in_ritardo'
         when p.scadenza <= public.oggi() + 30 then 'prossimi_30'
         else 'oltre'
       end = f.fascia
  group by f.ordine, f.fascia
  order by f.ordine;
end;
$function$;

CREATE OR REPLACE FUNCTION public.metriche_per_fonte(p_da date, p_a date)
 RETURNS TABLE(fonte lead_source, cash numeric, quota_cash numeric, nuovi_clienti integer, lead integer, call_svolte integer, chiuse integer, close_rate numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not public.legge_come_admin() then
    raise exception 'Le metriche economiche le vede solo l''admin' using errcode = '42501';
  end if;
  perform public.verifica_periodo(p_da, p_a);

  return query
  with per_fonte as (
  select
    f.fonte,
    -- a client with no source is 'altro': the sources add up to cash_nuovi_clienti
    (select coalesce(sum(p.importo_incassato), 0)::numeric(12, 2)
       from public.payments p
       join public.sales s on s.id = p.sale_id
       join public.clients cl on cl.id = s.client_id
      where coalesce(cl.fonte, 'altro') = f.fonte
        and s.tipo = 'nuovo' and s.data_vendita >= p_da
        and p.stato in ('incassata', 'rimborsata') and p.incassato_il between p_da and p_a) as cash,
    (select count(*)::integer
       from public.sales s
       join public.clients cl on cl.id = s.client_id
      where coalesce(cl.fonte, 'altro') = f.fonte and s.tipo = 'nuovo' and s.data_vendita between p_da and p_a) as nuovi,
    (select count(*)::integer from public.leads l
      where l.fonte = f.fonte and (l.created_at at time zone 'Europe/Rome')::date between p_da and p_a) as lead,
    c.svolte,
    c.chiuse,
    case when c.svolte = 0 then null else round(c.chiuse::numeric / c.svolte, 4) end as close_rate
  from unnest(enum_range(null::public.lead_source)) as f(fonte)
  cross join lateral (
    select
      count(*) filter (where ca.stato = 'svolta')::integer as svolte,
      count(*) filter (where ca.stato = 'svolta' and ca.esito = 'chiusa')::integer as chiuse
    from public.calls ca
    join public.leads l on l.id = ca.lead_id
    where l.fonte = f.fonte and (ca.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
  ) c
  )
  select
    pf.fonte,
    pf.cash,
    -- share of the new clients' cash (refunds included), null when none came in
    case when sum(pf.cash) over () = 0 then null else round(pf.cash / sum(pf.cash) over (), 4) end,
    pf.nuovi,
    pf.lead,
    pf.svolte,
    pf.chiuse,
    pf.close_rate
  from per_fonte pf
  order by pf.cash desc, pf.fonte;
end;
$function$;

CREATE OR REPLACE FUNCTION public.metriche_periodo(p_da date, p_a date)
 RETURNS TABLE(inizio date, fine date, dm_totali bigint, conversazioni bigint, call_proposte bigint, call_prenotate bigint, strategy_prenotate bigint, tasso_conversazione numeric, tasso_prenotazione numeric, dm_per_call numeric, dm_per_strategy numeric, call_svolte bigint, no_show bigint, qualificate bigint, chiuse bigint, show_rate numeric, tasso_qualificazione numeric, close_rate numeric, close_rate_qualificate numeric, cash_incassato numeric, cash_nuovi_clienti numeric, cash_rate_precedenti numeric, cash_rinnovo numeric, cash_upsell numeric, revenue_firmata numeric, revenue_nuovi numeric, numero_vendite bigint, nuovi_clienti bigint, rinnovi bigint, valore_medio_nuovo numeric, cash_per_call_svolta numeric, cash_per_dm numeric, revenue_per_dm numeric, provvigioni_maturate numeric, costi numeric, margine_operativo numeric, in_scadenza bigint, rinnovati bigint, tasso_rinnovo numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not public.legge_come_admin() then
    raise exception 'Le metriche economiche le vede solo l''admin' using errcode = '42501';
  end if;
  perform public.verifica_periodo(p_da, p_a);

  return query
  with setting as (
    select
      coalesce(sum(r.dm_outbound + r.dm_inbound + r.follow_up), 0)::bigint as dm,
      coalesce(sum(r.conversazioni), 0)::bigint as conv,
      coalesce(sum(r.call_proposte), 0)::bigint as proposte,
      coalesce(sum(r.discovery_prenotate + r.strategy_prenotate), 0)::bigint as prenotate,
      coalesce(sum(r.strategy_prenotate), 0)::bigint as strategy
    from public.setter_daily_reports r
    where r.data between p_da and p_a
  ),
  chiamate as (
    select
      count(*) filter (where c.stato = 'svolta') as svolte,
      count(*) filter (where c.stato = 'no_show') as noshow,
      count(*) filter (where c.stato = 'svolta' and c.qualificata) as qualif,
      count(*) filter (where c.esito = 'chiusa') as chiuse_
    from public.calls c
    where (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
  ),
  -- the four parts: every payment of the period falls in exactly one
  cassa as (
    select
      coalesce(sum(p.importo_incassato), 0)::numeric(12, 2) as tot,
      coalesce(sum(p.importo_incassato) filter (where s.tipo = 'nuovo' and s.data_vendita >= p_da), 0)::numeric(12, 2) as entrati,
      coalesce(sum(p.importo_incassato) filter (where s.tipo = 'nuovo' and s.data_vendita < p_da), 0)::numeric(12, 2) as precedenti,
      coalesce(sum(p.importo_incassato) filter (where s.tipo = 'rinnovo'), 0)::numeric(12, 2) as rinn,
      coalesce(sum(p.importo_incassato) filter (where s.tipo = 'upsell'), 0)::numeric(12, 2) as ups
    from public.payments p
    join public.sales s on s.id = p.sale_id
    where p.stato in ('incassata', 'rimborsata')
      and p.incassato_il between p_da and p_a
  ),
  vendite as (
    select
      coalesce(sum(s.valore_contratto), 0)::numeric(12, 2) as revenue,
      coalesce(sum(s.valore_contratto) filter (where s.tipo = 'nuovo'), 0)::numeric(12, 2) as revenue_nuove,
      count(*) as n,
      count(*) filter (where s.tipo = 'nuovo') as nuovi,
      count(*) filter (where s.tipo = 'rinnovo') as rinn
    from public.sales s
    where s.data_vendita between p_da and p_a
  ),
  provvigioni as (
    select coalesce(sum(v.provvigione), 0)::numeric(12, 2) as tot
    from public.v_provvigioni_maturate v
    where v.incassato_il between p_da and p_a
  ),
  spese as (
    select coalesce(sum(e.importo), 0)::numeric(12, 2) as tot
    from public.expenses e
    where e.data between p_da and p_a
  ),
  scadenze as (
    -- clients whose contract ends in the period, and those who renewed within 30 days
    select
      count(distinct s.client_id) as scad,
      count(distinct s.client_id) filter (where exists (
        select 1 from public.sales r
        where r.client_id = s.client_id
          and r.tipo = 'rinnovo'
          and r.data_vendita > s.data_vendita
          and r.data_vendita <= s.data_fine + 30
      )) as rinnovati_
    from public.sales s
    where s.data_fine between p_da and p_a
  )
  select
    p_da, p_a,
    setting.dm, setting.conv, setting.proposte, setting.prenotate, setting.strategy,
    public.rapporto(setting.conv, setting.dm),
    public.rapporto(setting.prenotate, setting.proposte),
    public.rapporto(setting.dm, setting.prenotate),
    public.rapporto(setting.dm, setting.strategy),
    chiamate.svolte, chiamate.noshow, chiamate.qualif, chiamate.chiuse_,
    public.rapporto(chiamate.svolte, chiamate.svolte + chiamate.noshow),
    public.rapporto(chiamate.qualif, chiamate.svolte),
    public.rapporto(chiamate.chiuse_, chiamate.svolte),
    public.rapporto(chiamate.chiuse_, chiamate.qualif),
    cassa.tot, cassa.entrati, cassa.precedenti, cassa.rinn, cassa.ups,
    vendite.revenue, vendite.revenue_nuove, vendite.n, vendite.nuovi, vendite.rinn,
    -- acquisition: only the new clients of the period
    public.rapporto(vendite.revenue_nuove, vendite.nuovi),
    public.rapporto(cassa.entrati, chiamate.svolte),
    public.rapporto(cassa.entrati, setting.dm),
    public.rapporto(vendite.revenue_nuove, setting.dm),
    provvigioni.tot,
    spese.tot,
    (cassa.tot - provvigioni.tot - spese.tot)::numeric(12, 2),
    scadenze.scad, scadenze.rinnovati_,
    public.rapporto(scadenze.rinnovati_, scadenze.scad)
  from setting, chiamate, cassa, vendite, provvigioni, spese, scadenze;
end;
$function$;

CREATE OR REPLACE FUNCTION public.metriche_setting(p_da date, p_a date)
 RETURNS TABLE(setter_id uuid, nome text, giorni_compilati bigint, dm_totali bigint, dm_outbound bigint, dm_inbound bigint, follow_up bigint, conversazioni bigint, call_proposte bigint, call_prenotate bigint, prenotate_inbound bigint, prenotate_outbound bigint, tasso_conversazione numeric, tasso_prenotazione numeric, dm_per_call numeric, call_svolte bigint, no_show bigint, chiuse bigint, show_rate numeric, close_rate numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not public.legge_come_admin() then
    raise exception 'Le metriche del team le vede solo l''admin' using errcode = '42501';
  end if;

  return query
  with report as (
    select r.setter_id as sid,
           count(*) as giorni,
           sum(r.dm_outbound + r.dm_inbound + r.follow_up) as dm,
           sum(r.dm_outbound) as dm_out,
           sum(r.dm_inbound) as dm_in,
           sum(r.follow_up) as fup,
           sum(r.conversazioni) as conv,
           sum(r.call_proposte) as proposte,
           sum(r.discovery_prenotate + r.strategy_prenotate) as prenotate
    from public.setter_daily_reports r
    where r.data between p_da and p_a
    group by rollup (r.setter_id)
  ),
  chiamate as (
    select c.setter_id as sid,
           count(*) filter (where c.stato = 'svolta') as svolte,
           count(*) filter (where c.stato = 'no_show') as noshow,
           count(*) filter (where c.esito = 'chiusa') as chiuse
    from public.calls c
    where (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
      -- a call whose setter was deleted has none: its null group would collide with the total
      and c.setter_id is not null
    group by rollup (c.setter_id)
  ),
  -- calls booked in the period (the day they were created), by the lead's source
  prenotazioni as (
    select c.setter_id as sid,
           count(*) filter (where l.fonte = 'dm_inbound') as da_inbound,
           count(*) filter (where l.fonte = 'dm_outbound') as da_outbound
    from public.calls c
    join public.leads l on l.id = c.lead_id
    where (c.created_at at time zone 'Europe/Rome')::date between p_da and p_a
      and c.setter_id is not null
      -- a follow-up call is booked by the closer, not by the setter (07/10/2026),
      -- also once its first call is gone (di_follow_up stays)
      and not c.di_follow_up
    group by rollup (c.setter_id)
  )
  select
    r.sid,
    coalesce(pr.nome, 'Totale'),
    coalesce(r.giorni, 0)::bigint,
    coalesce(r.dm, 0)::bigint,
    coalesce(r.dm_out, 0)::bigint,
    coalesce(r.dm_in, 0)::bigint,
    coalesce(r.fup, 0)::bigint,
    coalesce(r.conv, 0)::bigint,
    coalesce(r.proposte, 0)::bigint,
    coalesce(r.prenotate, 0)::bigint,
    coalesce(pz.da_inbound, 0)::bigint,
    coalesce(pz.da_outbound, 0)::bigint,
    public.rapporto(r.conv, r.dm),
    public.rapporto(r.prenotate, r.proposte),
    public.rapporto(r.dm, r.prenotate),
    coalesce(ch.svolte, 0)::bigint,
    coalesce(ch.noshow, 0)::bigint,
    coalesce(ch.chiuse, 0)::bigint,
    public.rapporto(ch.svolte, ch.svolte + ch.noshow),
    public.rapporto(ch.chiuse, ch.svolte)
  from report r
  left join chiamate ch on ch.sid is not distinct from r.sid
  left join prenotazioni pz on pz.sid is not distinct from r.sid
  left join public.profiles pr on pr.id = r.sid
  order by (r.sid is null), pr.nome;
end;
$function$;

CREATE OR REPLACE FUNCTION public.motivi_non_chiusura_periodo(p_da date, p_a date, p_setter uuid DEFAULT NULL::uuid, p_limite integer DEFAULT 200)
 RETURNS TABLE(call_id uuid, data date, programmata_il timestamp with time zone, lead text, closer text, esito call_outcome, qualificata boolean, motivo text, note_closer text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_limite integer := least(greatest(coalesce(p_limite, 200), 1), 1000);
begin
  if not public.legge_come_admin() then
    raise exception 'I motivi di non chiusura per il marketing li legge solo l''admin' using errcode = '42501';
  end if;
  perform public.verifica_periodo(p_da, p_a);

  return query
  select
    c.id,
    (c.programmata_il at time zone 'Europe/Rome')::date,
    c.programmata_il,
    l.nome,
    pc.nome,
    c.esito,
    c.qualificata,
    nullif(btrim(c.obiezione_principale), ''),
    nullif(btrim(c.note_closer), '')
  from public.calls c
  left join public.leads l on l.id = c.lead_id
  left join public.profiles pc on pc.id = c.closer_id
  where c.stato = 'svolta'
    and c.esito in ('follow_up', 'persa')
    and (c.programmata_il at time zone 'Europe/Rome')::date between p_da and p_a
    and (p_setter is null or c.setter_id = p_setter)
    and (nullif(btrim(c.obiezione_principale), '') is not null or nullif(btrim(c.note_closer), '') is not null)
  order by c.programmata_il desc, c.id
  limit v_limite;
end;
$function$;

CREATE OR REPLACE FUNCTION public.oggi_team()
 RETURNS TABLE(dm_totali bigint, conversazioni bigint, call_prenotate bigint, report_compilati bigint, call_in_programma bigint, call_svolte bigint, chiuse bigint, cash_incassato numeric, cash_nuovi_clienti numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not public.legge_come_admin() then
    raise exception 'Le metriche del team le vede solo l''admin' using errcode = '42501';
  end if;

  return query
  with report as (
    select
      coalesce(sum(r.dm_outbound + r.dm_inbound + r.follow_up), 0)::bigint as dm,
      coalesce(sum(r.conversazioni), 0)::bigint as conv,
      coalesce(sum(r.discovery_prenotate + r.strategy_prenotate), 0)::bigint as prenotate,
      count(*) as compilati
    from public.setter_daily_reports r
    where r.data = public.oggi()
  ),
  chiamate as (
    select
      count(*) filter (where c.stato = 'programmata') as programmate,
      count(*) filter (where c.stato = 'svolta') as svolte,
      count(*) filter (where c.esito = 'chiusa') as chiuse
    from public.calls c
    where (c.programmata_il at time zone 'Europe/Rome')::date = public.oggi()
  ),
  -- every cash-in of today; "di cui" the new clients signed today (the same
  -- rule as metriche_periodo over [oggi, oggi])
  cassa as (
    select
      coalesce(sum(p.importo_incassato), 0)::numeric(12, 2) as tot,
      coalesce(sum(p.importo_incassato) filter (where s.tipo = 'nuovo' and s.data_vendita >= public.oggi()), 0)::numeric(12, 2) as entrati
    from public.payments p
    join public.sales s on s.id = p.sale_id
    where p.stato in ('incassata', 'rimborsata') and p.incassato_il = public.oggi()
  )
  select report.dm, report.conv, report.prenotate, report.compilati,
         chiamate.programmate, chiamate.svolte, chiamate.chiuse, cassa.tot, cassa.entrati
  from report, chiamate, cassa;
end;
$function$;

CREATE OR REPLACE FUNCTION public.pm_tempo_per_persona(p_da date, p_a date, p_profilo uuid DEFAULT NULL::uuid, p_progetto uuid DEFAULT NULL::uuid, p_limite integer DEFAULT 100)
 RETURNS TABLE(livello text, profile_id uuid, persona text, progetto_id uuid, progetto text, task_id uuid, task text, minuti integer, voci integer, id uuid, data date, inizio timestamp with time zone, fine timestamp with time zone, nota text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  -- the entries of each person, newest first: enough to read, never the whole history
  v_limite integer := least(greatest(coalesce(p_limite, 100), 1), 500);
begin
  if not public.legge_come_admin() then
    raise exception 'Il tempo del team lo vede solo l''admin' using errcode = '42501';
  end if;

  if p_da is null or p_a is null or p_da > p_a then
    raise exception 'Periodo non valido' using errcode = '22023';
  end if;

  return query
  with base as (
    select t.id, t.profile_id, t.progetto_id, t.task_id, t.data, t.inizio, t.fine, t.minuti, t.nota, t.created_at
    from public.pm_tempo t
    where t.minuti is not null
      -- a running timer (start, no end) is nobody's business but its owner's
      and not (t.inizio is not null and t.fine is null)
      and t.data between p_da and p_a
      and (p_profilo is null or t.profile_id = p_profilo)
      and (p_progetto is null or t.progetto_id = p_progetto)
  ),
  somme as (
    -- overall, per person, per person and project, per person, project and task
    select
      case
        when grouping(b.profile_id) = 1 then 'totale'
        when grouping(b.progetto_id) = 1 then 'persona'
        when grouping(b.task_id) = 1 then 'progetto'
        else 'task'
      end as livello,
      b.profile_id,
      b.progetto_id,
      b.task_id,
      coalesce(sum(b.minuti), 0)::integer as minuti,
      count(b.id)::integer as voci
    from base b
    group by rollup (b.profile_id, b.progetto_id, b.task_id)
  ),
  ultime as (
    select
      b.*,
      row_number() over (
        partition by b.profile_id
        order by b.data desc, b.inizio desc nulls last, b.created_at desc, b.id
      ) as n
    from base b
  ),
  righe as (
    select
      s.livello, s.profile_id, s.progetto_id, s.task_id, s.minuti, s.voci,
      null::uuid as id, null::date as data, null::timestamptz as inizio, null::timestamptz as fine,
      null::text as nota, null::timestamptz as creata
    from somme s
    union all
    select
      'voce', u.profile_id, u.progetto_id, u.task_id, u.minuti, null,
      u.id, u.data, u.inizio, u.fine, u.nota, u.created_at
    from ultime u
    where u.n <= v_limite
  )
  select
    r.livello, r.profile_id, pr.nome, r.progetto_id, p.nome, r.task_id, k.titolo,
    r.minuti, r.voci, r.id, r.data, r.inizio, r.fine, r.nota
  from righe r
  left join public.profiles pr on pr.id = r.profile_id
  left join public.pm_progetti p on p.id = r.progetto_id
  left join public.pm_task k on k.id = r.task_id
  order by
    array_position(array['totale', 'persona', 'progetto', 'task', 'voce'], r.livello),
    -- people alphabetical, never by hours
    pr.nome nulls first,
    r.profile_id nulls first,
    -- entries newest first
    r.data desc nulls last,
    r.inizio desc nulls last,
    r.creata desc nulls last,
    -- inside one person: where the time went
    r.minuti desc,
    p.nome,
    k.titolo nulls last,
    r.id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.previsione_cassa(p_mesi integer DEFAULT 3)
 RETURNS TABLE(mese date, incassato numeric, previsto numeric, rate_previste integer, in_ritardo numeric, rate_in_ritardo integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_oggi date := public.oggi();
  v_primo date := date_trunc('month', public.oggi())::date;
begin
  if not public.legge_come_admin() then
    raise exception 'La previsione di cassa la vede solo l''admin' using errcode = '42501';
  end if;
  return query
  with mesi as (
    select (v_primo + make_interval(months => i))::date as m
    from generate_series(0, greatest(1, least(p_mesi, 12)) - 1) as i
  ),
  ritardo as (
    select coalesce(sum(p.importo_previsto), 0)::numeric(12, 2) as tot, count(*)::integer as n
    from public.payments p
    where p.stato = 'prevista' and p.scadenza < v_oggi
  )
  select
    mesi.m,
    (select coalesce(sum(p.importo_incassato), 0)::numeric(12, 2) from public.payments p
      where p.stato in ('incassata', 'rimborsata')
        and p.incassato_il between mesi.m and (mesi.m + interval '1 month - 1 day')::date),
    (select coalesce(sum(p.importo_previsto), 0)::numeric(12, 2) from public.payments p
      where p.stato = 'prevista' and p.scadenza >= v_oggi
        and p.scadenza between mesi.m and (mesi.m + interval '1 month - 1 day')::date),
    (select count(*)::integer from public.payments p
      where p.stato = 'prevista' and p.scadenza >= v_oggi
        and p.scadenza between mesi.m and (mesi.m + interval '1 month - 1 day')::date),
    case when mesi.m = v_primo then ritardo.tot else 0::numeric end,
    case when mesi.m = v_primo then ritardo.n else 0 end
  from mesi cross join ritardo
  order by mesi.m;
end;
$function$;

CREATE OR REPLACE FUNCTION public.provvigioni_per_vendita(p_sale_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(profile_id uuid, setter text, sale_id uuid, cliente text, tipo sale_type, incassato numeric, percentuale numeric, provvigione numeric, ultimo_incasso date)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not public.legge_come_admin() then
    raise exception 'Le provvigioni per vendita le vede solo l''admin' using errcode = '42501';
  end if;

  return query
  select
    v.profile_id,
    pr.nome,
    v.sale_id,
    trim(concat_ws(' ', c.nome, c.cognome)),
    v.tipo,
    sum(v.importo_incassato)::numeric(12, 2),
    -- one rate for the whole sale; null when the rule changed along the way
    case when count(distinct v.percentuale) = 1 then max(v.percentuale) end,
    sum(v.provvigione)::numeric(12, 2),
    max(v.incassato_il)
  from public.v_provvigioni_maturate v
  join public.sales s on s.id = v.sale_id
  join public.clients c on c.id = s.client_id
  join public.profiles pr on pr.id = v.profile_id
  where p_sale_id is null or v.sale_id = p_sale_id
  group by v.profile_id, pr.nome, v.sale_id, c.nome, c.cognome, v.tipo
  order by max(v.incassato_il) desc, 4;
end;
$function$;

CREATE OR REPLACE FUNCTION public.provvigioni_riepilogo(p_mesi integer DEFAULT 6)
 RETURNS TABLE(profile_id uuid, nome text, mese date, maturato numeric, pagato numeric, saldo_mese numeric, saldo_progressivo numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_ultimo date := date_trunc('month', public.oggi())::date;
  v_primo date := (date_trunc('month', public.oggi()) - (interval '1 month' * (greatest(p_mesi, 1) - 1)))::date;
begin
  if not public.legge_come_admin() then
    raise exception 'Le provvigioni di tutti le vede solo l''admin' using errcode = '42501';
  end if;

  return query
  with persone as (
    select distinct cr.profile_id as pid from public.commission_rules cr
    union
    select distinct cp.profile_id from public.commission_payouts cp
  ),
  mesi as (
    select (v_primo + (interval '1 month' * g))::date as m
    from generate_series(0, greatest(p_mesi, 1) - 1) as g
  ),
  maturato as (
    select v.profile_id as pid, v.mese as m, sum(v.provvigione) as tot
    from public.v_provvigioni_maturate v
    group by 1, 2
  ),
  pagato as (
    select cp.profile_id as pid, cp.periodo as m, sum(cp.importo) as tot
    from public.commission_payouts cp
    group by 1, 2
  ),
  -- the balance carries what was accrued (and paid) before the window too
  pregresso as (
    select x.pid, sum(x.tot) as tot
    from (
      select pid, tot from maturato where m < v_primo
      union all
      select pid, -tot from pagato where m < v_primo
    ) x
    group by x.pid
  ),
  righe as (
    select
      persone.pid,
      mesi.m,
      coalesce(maturato.tot, 0)::numeric(12, 2) as mat,
      coalesce(pagato.tot, 0)::numeric(12, 2) as pag
    from persone
    cross join mesi
    left join maturato on maturato.pid = persone.pid and maturato.m = mesi.m
    left join pagato on pagato.pid = persone.pid and pagato.m = mesi.m
  )
  select
    righe.pid,
    pr.nome,
    righe.m,
    righe.mat,
    righe.pag,
    (righe.mat - righe.pag)::numeric(12, 2),
    (coalesce(pregresso.tot, 0)
      + sum(righe.mat - righe.pag) over (partition by righe.pid order by righe.m))::numeric(12, 2)
  from righe
  join public.profiles pr on pr.id = righe.pid
  left join pregresso on pregresso.pid = righe.pid
  where righe.m <= v_ultimo
  order by pr.nome, righe.m;
end;
$function$;

CREATE OR REPLACE FUNCTION public.riepilogo_costi_periodo(p_da date, p_a date)
 RETURNS TABLE(categoria expense_category, totale numeric, numero integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
begin
  if not public.legge_come_admin() then
    raise exception 'I costi li vede solo l''admin' using errcode = '42501';
  end if;
  perform public.verifica_periodo(p_da, p_a);

  return query
  select e.categoria, sum(e.importo)::numeric(12, 2), count(*)::integer
  from public.expenses e
  where e.data between p_da and p_a
  group by rollup (e.categoria)
  order by (e.categoria is null), sum(e.importo) desc;
end;
$function$;

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
  if v_ruolo is null or v_ruolo not in ('admin', 'editor', 'marketing', 'business_coach') then
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
  if v_ruolo is null or v_ruolo not in ('admin', 'editor', 'marketing', 'business_coach') then
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
  if v_ruolo is null or v_ruolo not in ('admin', 'closer', 'business_coach') then
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
         case when v_ruolo in ('admin', 'business_coach') then coalesce(v.n, 0) end,
         case when v_ruolo in ('admin', 'business_coach') then coalesce(v.revenue, 0) end,
         case when v_ruolo in ('admin', 'business_coach') then coalesce(v.cash, 0) end
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
  if v_ruolo in ('admin', 'setter', 'business_coach') then
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
  if v_ruolo in ('admin', 'business_coach') then
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

CREATE OR REPLACE FUNCTION public.insight_stato()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_admin boolean := public.legge_come_admin();
  v_imp public.insight_impostazioni;
  v_es public.insight_esecuzioni;
  v_esecuzione jsonb;
  v_risultato jsonb;
begin
  if not (public.insight_puo_leggere() or public.legge_come_admin()) then
    raise exception 'L’Insight lo vedono l’admin e i setter.' using errcode = '42501';
  end if;

  select * into v_imp from public.insight_impostazioni i where i.id;
  select * into v_es from public.insight_esecuzioni e order by e.creata_il desc, e.id desc limit 1;

  if v_es.id is not null then
    v_esecuzione := jsonb_build_object(
      'stato', v_es.stato,
      'passo', v_es.passo,
      'creata_il', v_es.creata_il,
      'finita_il', v_es.finita_il,
      'blocchi_fatti', v_es.blocchi_fatti,
      'blocchi_totali', v_es.blocchi_totali);
    if v_admin then
      v_esecuzione := v_esecuzione || jsonb_build_object(
        'giorno', v_es.giorno,
        'motivo', v_es.motivo,
        'errore', v_es.errore,
        'avvisi', to_jsonb(v_es.avvisi),
        'costo_usd', v_es.costo_usd,
        'token_input', v_es.token_input,
        'token_cache_scritti', v_es.token_cache_scritti,
        'token_cache_letti', v_es.token_cache_letti,
        'token_output', v_es.token_output,
        'chat_instagram', v_es.chat_instagram,
        'chat_messenger', v_es.chat_messenger,
        'chat_attribuite', v_es.chat_attribuite);
    end if;
  end if;

  v_risultato := jsonb_build_object(
    'attivo', coalesce(v_imp.attivo, false),
    'ora', to_char(coalesce(v_imp.ora, time '19:00'), 'HH24:MI:SS'),
    'esecuzione', v_esecuzione);
  if v_admin then
    v_risultato := v_risultato || jsonb_build_object(
      'ultimo_tick_il', v_imp.ultimo_tick_il,
      'manuali_oggi', (select count(*) from public.insight_esecuzioni e
                       where e.motivo = 'manuale' and e.giorno = public.oggi()));
  end if;
  return v_risultato;
end;
$function$;

CREATE OR REPLACE FUNCTION public.analisi_riepilogo(p_da date, p_a date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare
  v_reel integer;
  v_mediana numeric;
  v_dm bigint;
  v_tg bigint;
  v_contati integer;
  v_non_contati integer;
  v_cambiare integer;
begin
  -- vede_marketing() is true for a live Claude token (MCP): the page's tiles are not for it
  if public.da_client_oauth() or not (public.vede_marketing() or public.legge_come_admin()) then
    raise exception 'Le analisi dei reel sono dell’area Marketing.' using errcode = '42501';
  end if;
  if p_da is null or p_a is null or p_a < p_da or p_a - p_da > 366 then
    raise exception 'Periodo non valido.' using errcode = '22023';
  end if;

  select count(*), percentile_cont(0.5) within group (order by n.views_3g),
         coalesce(sum(n.dm_14g) filter (where n.lead_contati and n.lead_giorni = 14), 0),
         coalesce(sum(n.in_target_14g) filter (where n.lead_contati and n.lead_giorni = 14), 0),
         count(*) filter (where n.lead_contati and n.lead_giorni = 14),
         count(*) filter (where n.giorno + 13 <= public.oggi() - 1 and not n.lead_contati)
  into v_reel, v_mediana, v_dm, v_tg, v_contati, v_non_contati
  from public.v_instagram_numeri n
  where not n.eliminato and (n.reel or n.media_type = 'VIDEO') and n.giorno between p_da and p_a;

  select count(*) into v_cambiare
  from public.v_instagram_numeri n
  join public.analisi_numeri_set() a on a.media_id = n.media_id
  where not n.eliminato and (n.reel or n.media_type = 'VIDEO') and n.giorno between p_da and p_a
    and a.num ->> 'verdetto' = 'cambiare';

  return jsonb_build_object(
    'reel', v_reel, 'views_3g_mediana', v_mediana,
    'dm_14g', v_dm, 'in_target_14g', v_tg, 'reel_contati', v_contati, 'reel_non_contati', v_non_contati,
    'da_cambiare', v_cambiare);
end;
$function$;

CREATE OR REPLACE FUNCTION public.spunti_per_claude(p_giorno date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  m public.marketing_spunti;
begin
  if not (public.vede_marketing() or public.legge_come_admin()) then
    raise exception 'Gli spunti sono dell’area Marketing.' using errcode = '42501';
  end if;
  select * into m from public.marketing_spunti x
  where x.stato = 'pronta' and (p_giorno is null or p_giorno between x.periodo_da and x.periodo_a)
  order by x.finita_il desc limit 1;
  if not found then
    return jsonb_build_object('spunti', null);
  end if;
  return jsonb_build_object(
    'periodo_da', m.periodo_da, 'periodo_a', m.periodo_a, 'finita_il', m.finita_il,
    'contenuto', m.contenuto,
    'idee_nel_calendario', (
      select coalesce(jsonb_agg(jsonb_build_object('idea', c.da_spunti_idea, 'name', c.nome) order by c.da_spunti_idea), '[]'::jsonb)
      from public.marketing_contenuti c where c.da_spunti = m.id));
end;
$function$;

CREATE OR REPLACE FUNCTION public.pm_tempo_progetto(p_progetto uuid, p_da date, p_a date)
 RETURNS TABLE(livello text, data date, profile_id uuid, persona text, task_id uuid, task text, minuti integer, voci integer)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
#variable_conflict use_column
begin
  if not (public.pm_puo_vedere(p_progetto) or public.legge_come_admin()) then
    return;
  end if;

  return query
  select
    case
      when grouping(t.data) = 0 then 'giorno'
      when grouping(t.profile_id) = 0 then 'persona'
      when grouping(t.task_id) = 0 then 'task'
      else 'totale'
    end,
    t.data,
    t.profile_id,
    pr.nome,
    t.task_id,
    k.titolo,
    coalesce(sum(t.minuti), 0)::integer,
    count(t.id)::integer
  from public.pm_tempo t
  left join public.profiles pr on pr.id = t.profile_id
  left join public.pm_task k on k.id = t.task_id
  where t.progetto_id = p_progetto
    and t.minuti is not null
    and t.data between p_da and p_a
  group by grouping sets ((t.data), (t.profile_id, pr.nome), (t.task_id, k.titolo), ())
  order by 1, 2, 7 desc, 4, 6;
end;
$function$;

