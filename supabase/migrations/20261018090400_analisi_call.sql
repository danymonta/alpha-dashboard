-- Claude's analysis of the held calls (1.37.0, CLAUDE.md section 31). Dany,
-- 16/10/2026: Claude analyses ALL the recorded calls, with no consent question
-- in the sheet; it proposes the call's performance and the reason for not
-- closing, with the why, and the closer confirms or changes them (never
-- written by itself). How a call was led is seen only by who led it; the
-- suggestions on the DMs only by the setter of the call.
--
-- No transcript is ever stored here: Claude reads it from Fathom when the
-- step runs. No health detail: the output passes a closed lexicon first
-- (lib/call/analisi/salute.ts).
--
-- Also here: the planner of the work (call_tick, every 5 minutes at 4, 9, 14...,
-- the Insight's tick is at 0 and the reels' at 2): the analyses of the calls
-- and the weekly brief of the Marketing area (marketing_spunti); one step at a
-- time, never during an Insight run, never above the month's limit (10 $).

-- ---------------------------------------------------------------------------
-- 1. The analysis of a call: the closer and the admin
-- ---------------------------------------------------------------------------
create table public.call_analisi (
  call_id uuid primary key references public.calls on delete cascade,
  recording_id bigint,
  stato text not null default 'in_coda' check (stato in ('in_coda', 'in_corso', 'pronta', 'fallita', 'rifiutata')),
  motivo text not null default 'automatica' check (motivo in ('automatica', 'richiesta')),
  tentativi smallint not null default 0 check (tentativi between 0 and 3),
  prossimo_tentativo_il timestamptz,
  -- the wait for the recording / the transcript (6 hours) counts from here
  in_attesa_dal timestamptz not null default now(),
  riassunto text,
  esito_letto text check (esito_letto in ('chiusa', 'follow_up', 'persa', 'non_chiaro')),
  in_target text check (in_target in ('si', 'no', 'da_verificare')),
  lead jsonb,
  obiezioni jsonb,
  categorie_obiezioni text[] not null default '{}',
  pain text[] not null default '{}',
  desideri text[] not null default '{}',
  domande jsonb,
  convinto_da jsonb,
  motivo_proposto text,
  prossimi_passi jsonb,
  momenti jsonb,
  spunti_contenuto jsonb,
  versione_prompt text check (char_length(versione_prompt) <= 40),
  iniziata_il timestamptz,
  analizzata_il timestamptz,
  -- a fixed Italian sentence, never model output
  errore text check (char_length(errore) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index call_analisi_coda_idx on public.call_analisi (created_at) where stato = 'in_coda';
create trigger call_analisi_set_updated_at before update on public.call_analisi
  for each row execute function public.set_updated_at();

-- what the setter reads in «Dalla call» (admin, the call's closer, the call's setter): the lead, never the setter
create table public.call_analisi_setter (
  call_id uuid primary key references public.calls on delete cascade,
  in_target text check (in_target in ('si', 'no', 'da_verificare')),
  segnali jsonb not null default '[]',
  sapeva text[] not null default '{}',
  sorprese jsonb not null default '[]',
  -- [{categoria, sintesi}] without figures; condizioni_personali without sintesi
  obiezioni jsonb not null default '[]',
  analizzata_il timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger call_analisi_setter_set_updated_at before update on public.call_analisi_setter
  for each row execute function public.set_updated_at();

-- suggestions on the DMs for this lead: only the call's setter reads them (not even the admin, unless he is the setter)
create table public.call_spunti_setter (
  call_id uuid primary key references public.calls on delete cascade,
  setter_id uuid not null references public.profiles on delete cascade,
  spunti jsonb not null default '[]',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger call_spunti_setter_set_updated_at before update on public.call_spunti_setter
  for each row execute function public.set_updated_at();

-- how the call was led, proposed by Claude: only the closer who led it. No start delay: timing a person is tracking (section 17)
create table public.call_valutazioni (
  call_id uuid primary key references public.calls on delete cascade,
  closer_id uuid not null references public.profiles on delete cascade,
  criteri jsonb not null,
  livello_proposto public.call_performance,
  perche jsonb not null default '[]',
  funzionato jsonb not null default '[]',
  da_provare jsonb not null default '[]',
  quota_parlato numeric(4,3) check (quota_parlato between 0 and 1),
  decisa_livello public.call_performance,
  decisa_il timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger call_valutazioni_set_updated_at before update on public.call_valutazioni
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. The state of the work: one row (the admin reads)
-- ---------------------------------------------------------------------------
create table public.call_lavori_stato (
  id boolean primary key default true check (id),
  -- Dany: all the recorded calls; off stops the new ones
  analisi_attive boolean not null default true,
  -- the weekly brief on Mondays from 07:00; off: only the requests
  spunti_automatici boolean not null default true,
  costo_max_mese numeric(6,2) not null default 10 check (costo_max_mese between 0 and 200),
  mese date not null default date_trunc('month', public.oggi())::date,
  token_input bigint not null default 0,
  token_cache_scritti bigint not null default 0,
  token_cache_letti bigint not null default 0,
  token_output bigint not null default 0,
  costo_mese_usd numeric(8,4) not null default 0,
  analisi_mese integer not null default 0,
  spunti_mese integer not null default 0,
  richieste_oggi smallint not null default 0,
  giorno_richieste date,
  passo_id uuid,
  passo_cosa text check (passo_cosa in ('analisi', 'spunti')),
  passo_rif text,
  lease_fino_al timestamptz,
  inviata_il timestamptz,
  url_passo text
    constraint call_lavori_stato_url_passo
    check (url_passo ~ '^https://[a-z0-9.-]+/api/cron/call$'
           or url_passo ~ '^http://(127\.0\.0\.1|localhost|host\.docker\.internal)(:[0-9]{2,5})?/api/cron/call$'),
  ultimo_tick_il timestamptz,
  ultimo_passo_il timestamptz,
  ultimo_esito text check (ultimo_esito in ('ok', 'parziale', 'fallito', 'senza_chiave', 'limite_spesa', 'limite_fornitore')),
  ultimo_errore text check (char_length(ultimo_errore) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint call_lavori_stato_passo
    check ((passo_id is null) = (passo_cosa is null) and (passo_id is null) = (passo_rif is null))
);
insert into public.call_lavori_stato default values;
create trigger call_lavori_stato_set_updated_at before update on public.call_lavori_stato
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS: read only; every write goes through the functions below
-- ---------------------------------------------------------------------------
alter table public.call_analisi enable row level security;
alter table public.call_analisi_setter enable row level security;
alter table public.call_spunti_setter enable row level security;
alter table public.call_valutazioni enable row level security;
alter table public.call_lavori_stato enable row level security;
revoke all on public.call_analisi, public.call_analisi_setter, public.call_spunti_setter,
  public.call_valutazioni, public.call_lavori_stato from anon;
revoke insert, update, delete, truncate on public.call_analisi, public.call_analisi_setter,
  public.call_spunti_setter, public.call_valutazioni, public.call_lavori_stato from authenticated;

create policy call_analisi_lettura on public.call_analisi
  for select to authenticated
  using (
    public.is_admin()
    or (public.current_role() = 'closer'
        and exists (select 1 from public.calls c where c.id = call_analisi.call_id and c.closer_id = (select auth.uid())))
  );

create policy call_analisi_setter_lettura on public.call_analisi_setter
  for select to authenticated
  using (
    public.is_admin()
    or (public.current_role() = 'closer'
        and exists (select 1 from public.calls c where c.id = call_analisi_setter.call_id and c.closer_id = (select auth.uid())))
    or (public.current_role() = 'setter'
        and exists (select 1 from public.calls c where c.id = call_analisi_setter.call_id and c.setter_id = (select auth.uid())))
  );

-- the call's setter only (the admin when he is the setter of the call): the closer and the admin as such read nothing
create policy call_spunti_setter_propri on public.call_spunti_setter
  for select to authenticated
  using (setter_id = (select auth.uid()) and public.current_role() in ('admin', 'setter'));

-- the closer who led the call only (the admin on his own): he also confirms the level
create policy call_valutazioni_proprie on public.call_valutazioni
  for select to authenticated
  using (closer_id = (select auth.uid()) and public.current_role() in ('admin', 'closer'));

create policy call_lavori_stato_admin on public.call_lavori_stato
  for select to authenticated using (public.is_admin());

create policy call_analisi_mai_da_oauth on public.call_analisi
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));
create policy call_analisi_setter_mai_da_oauth on public.call_analisi_setter
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));
create policy call_spunti_setter_mai_da_oauth on public.call_spunti_setter
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));
create policy call_valutazioni_mai_da_oauth on public.call_valutazioni
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));
create policy call_lavori_stato_mai_da_oauth on public.call_lavori_stato
  as restrictive for all to authenticated
  using (not (select public.da_client_oauth())) with check (not (select public.da_client_oauth()));

comment on table public.call_analisi is
  'Claude''s analysis of a held call, from the transcript read on Fathom (never stored): the lead against the ICP, the objections by category, the questions, the proposed reason for not closing. Never a health detail nor a figure of money. Admin and the call''s closer read it. Kept at most 24 months from the call. In the backup.';
comment on table public.call_analisi_setter is
  'What the call''s setter reads in «Dalla call»: the lead (in target, what he knew, what surprised him, the objections by category without figures). Never the setter''s own work, never the closer''s. In the backup.';
comment on table public.call_spunti_setter is
  'Claude''s suggestions on the DMs for this lead: read only by the call''s setter, not by the admin nor the closer. Not in the backup.';
comment on table public.call_valutazioni is
  'How the call was led, proposed by Claude (five criteria, the level worked out by the code, the share of speech): read only by the closer who led it, who also confirms or changes the level (calls.performance is never written by itself). Not in the backup. No start delay: timing a person''s work is tracking.';
comment on table public.call_lavori_stato is
  'One row: the planner of the call work (the step lease, the step URL), the switches (analyses on, weekly brief automatic) and the month''s cost with its limit (10 USD). Admin reads; written only by the call_* functions.';

-- ---------------------------------------------------------------------------
-- 4. When a call enters the queue
-- ---------------------------------------------------------------------------
create function public.call_costo_mese()
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case when s.mese = date_trunc('month', public.oggi())::date then s.costo_mese_usd else 0 end
     from public.call_lavori_stato s where s.id), 0);
$$;
revoke all on function public.call_costo_mese() from public, anon, authenticated, service_role;

-- A held call with an outcome and a Fathom link goes in the queue, once.
create function public.call_analisi_valuta(p_call uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.calls;
  r public.call_registrazioni;
begin
  if not (select s.analisi_attive from public.call_lavori_stato s where s.id) then
    return;
  end if;
  select * into c from public.calls x where x.id = p_call;
  if not found or c.stato <> 'svolta' or c.esito is null or c.link_registrazione is null
     or c.link_registrazione !~* '^https://([a-z0-9-]+\.)?fathom\.(video|ai)/' then
    return;
  end if;
  select * into r from public.call_registrazioni x where x.call_id = p_call;
  if not found or r.stato <> 'collegata' then
    return;
  end if;
  insert into public.call_analisi (call_id, recording_id, motivo)
  values (p_call, r.recording_id, 'automatica')
  on conflict (call_id) do nothing;
end;
$$;
revoke all on function public.call_analisi_valuta(uuid) from public, anon, authenticated, service_role;

create function public.call_registrazioni_analisi()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.call_analisi_valuta(new.call_id);
  return new;
end;
$$;
revoke all on function public.call_registrazioni_analisi() from public, anon, authenticated;
create trigger call_registrazioni_analisi
  after insert or update on public.call_registrazioni
  for each row execute function public.call_registrazioni_analisi();

create function public.calls_analisi()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  perform public.call_analisi_valuta(new.id);
  return new;
end;
$$;
revoke all on function public.calls_analisi() from public, anon, authenticated;
create trigger calls_analisi
  after update of stato, esito on public.calls
  for each row execute function public.calls_analisi();

-- Another recording, or none: what Claude wrote about the old one goes away
create function public.call_registrazioni_pulisci()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_call uuid := case when tg_op = 'DELETE' then old.call_id else new.call_id end;
begin
  if tg_op = 'UPDATE' and not (
       (old.recording_id is not null and old.recording_id is distinct from new.recording_id)
       or (old.stato = 'collegata' and new.stato = 'non_registrata')) then
    return new;
  end if;
  delete from public.call_analisi a where a.call_id = v_call;
  delete from public.call_analisi_setter a where a.call_id = v_call;
  delete from public.call_spunti_setter a where a.call_id = v_call;
  delete from public.call_valutazioni a where a.call_id = v_call;
  return null;
end;
$$;
revoke all on function public.call_registrazioni_pulisci() from public, anon, authenticated;
create trigger call_registrazioni_pulisci
  after update or delete on public.call_registrazioni
  for each row execute function public.call_registrazioni_pulisci();

-- ---------------------------------------------------------------------------
-- 5. The planner
-- ---------------------------------------------------------------------------
-- The weekly brief: on Mondays from 07:00 (Rome), once, with the automatic switch on.
-- Also prunes the briefs older than 26 weeks, except those with an idea in the calendar.
create function public.call_pianifica()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.call_lavori_stato;
  v_ora timestamp := now() at time zone 'Europe/Rome';
begin
  select * into s from public.call_lavori_stato x where x.id;
  delete from public.marketing_spunti m
  where m.periodo_a < public.oggi() - 182 and m.stato in ('pronta', 'fallita')
    and not exists (select 1 from public.marketing_contenuti c where c.da_spunti = m.id);
  if s.spunti_automatici and extract(isodow from v_ora) = 1 and extract(hour from v_ora) >= 7
     and not exists (select 1 from public.marketing_spunti m
                     where m.motivo = 'automatica' and m.created_at >= public.oggi()::timestamp at time zone 'Europe/Rome')
     and not exists (select 1 from public.marketing_spunti m where m.stato in ('in_coda', 'in_corso')) then
    insert into public.marketing_spunti (motivo, periodo_da, periodo_a)
    values ('automatica', public.oggi() - 28, public.oggi() - 1);
  end if;
end;
$$;
revoke all on function public.call_pianifica() from public, anon, authenticated, service_role;

-- The next job that is due: the asked ones first (analysis, brief), then the automatic ones.
-- Nothing while the lease is taken, an Insight run is active or the month's cost is at the limit.
create function public.call_scegli_lavoro()
returns table (cosa text, rif text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s public.call_lavori_stato;
begin
  select * into s from public.call_lavori_stato x where x.id;
  if s.lease_fino_al is not null and s.lease_fino_al > now() then
    return;
  end if;
  if exists (select 1 from public.insight_esecuzioni e where e.stato in ('in_coda', 'in_corso')) then
    return;
  end if;
  if public.call_costo_mese() >= s.costo_max_mese then
    return;
  end if;
  return query
  select u.cosa, u.rif
  from (
    select 1 as o, 'analisi'::text as cosa, a.call_id::text as rif, extract(epoch from a.created_at) as k
    from public.call_analisi a
    where a.stato = 'in_coda' and a.motivo = 'richiesta' and (a.prossimo_tentativo_il is null or a.prossimo_tentativo_il <= now())
    union all
    select 2, 'spunti', m.id::text, extract(epoch from m.created_at)
    from public.marketing_spunti m
    where m.stato = 'in_coda' and m.motivo = 'richiesta' and m.tentativi < 3 and (m.prossimo_il is null or m.prossimo_il <= now())
    union all
    -- the newest call first
    select 3, 'analisi', a.call_id::text, -extract(epoch from a.created_at)
    from public.call_analisi a
    where a.stato = 'in_coda' and a.motivo = 'automatica' and (a.prossimo_tentativo_il is null or a.prossimo_tentativo_il <= now())
    union all
    select 4, 'spunti', m.id::text, extract(epoch from m.created_at)
    from public.marketing_spunti m
    where m.stato = 'in_coda' and m.motivo = 'automatica' and m.tentativi < 3 and (m.prossimo_il is null or m.prossimo_il <= now())
  ) u
  order by u.o, u.k
  limit 1;
end;
$$;
revoke all on function public.call_scegli_lavoro() from public, anon, authenticated, service_role;

create function public.call_c_e_lavoro()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.call_scegli_lavoro());
$$;
revoke all on function public.call_c_e_lavoro() from public, anon, authenticated, service_role;

-- pg_net posts to the step URL with the Vault key of the steps (the Insight's)
create function public.call_dispatch()
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_chiave text;
begin
  select s.url_passo into v_url from public.call_lavori_stato s where s.id;
  if v_url is null then
    return false;
  end if;
  select d.decrypted_secret into v_chiave from vault.decrypted_secrets d where d.name = 'insight_chiave';
  if v_chiave is null or v_chiave = '' then
    raise warning 'call_dispatch: manca la chiave dei passi';
    return false;
  end if;
  perform net.http_post(
    url := v_url,
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_chiave),
    timeout_milliseconds := 20000);
  update public.call_lavori_stato s set inviata_il = now() where s.id;
  return true;
end;
$$;
revoke all on function public.call_dispatch() from public, anon, authenticated, service_role;

-- Wakes the chain from a route (a request of a person)
create function public.call_sveglia()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if public.call_c_e_lavoro() then
    perform public.call_dispatch();
  end if;
end;
$$;
revoke all on function public.call_sveglia() from public, anon, authenticated;
grant execute on function public.call_sveglia() to service_role;

-- The analyses of an old call and the briefs: 24 months from the call
create function public.call_analisi_pulizia()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  delete from public.call_analisi_setter a using public.calls c
  where c.id = a.call_id and c.programmata_il < now() - interval '24 months';
  delete from public.call_spunti_setter a using public.calls c
  where c.id = a.call_id and c.programmata_il < now() - interval '24 months';
  delete from public.call_valutazioni a using public.calls c
  where c.id = a.call_id and c.programmata_il < now() - interval '24 months';
  delete from public.call_analisi a using public.calls c
  where c.id = a.call_id and c.programmata_il < now() - interval '24 months';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke all on function public.call_analisi_pulizia() from public, anon, authenticated;
grant execute on function public.call_analisi_pulizia() to service_role;

-- pg_cron, every 5 minutes at 4, 9, 14... as postgres. Never raises: each step in its own block.
create function public.call_tick()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.call_lavori_stato;
begin
  begin
    update public.call_lavori_stato x set ultimo_tick_il = now() where x.id;
  exception when others then
    raise warning 'call_tick: ultimo tick non salvato (%)', sqlstate;
  end;

  -- the turn of the month (Rome): counters and cost to zero; a stop for the limit lifts
  begin
    update public.call_lavori_stato x
    set mese = date_trunc('month', public.oggi())::date,
        token_input = 0, token_cache_scritti = 0, token_cache_letti = 0, token_output = 0,
        costo_mese_usd = 0, analisi_mese = 0, spunti_mese = 0,
        ultimo_esito = case when x.ultimo_esito = 'limite_spesa' then null else x.ultimo_esito end
    where x.id and x.mese <> date_trunc('month', public.oggi())::date;
  exception when others then
    raise warning 'call_tick: cambio di mese non riuscito (%)', sqlstate;
  end;

  -- the watchdog: an expired lease is a dead invocation; a job left in_corso without a lease for 10 minutes was lost
  begin
    select * into s from public.call_lavori_stato x where x.id;
    if s.lease_fino_al is not null and s.lease_fino_al < now() then
      update public.call_lavori_stato x
      set lease_fino_al = null, passo_id = null, passo_cosa = null, passo_rif = null where x.id;
      s.lease_fino_al := null;
    end if;
    if s.lease_fino_al is null then
      update public.call_analisi a
      set tentativi = a.tentativi + 1,
          stato = case when a.tentativi + 1 >= 3 then 'fallita' else 'in_coda' end,
          errore = case when a.tentativi + 1 >= 3 then 'Interrotta: il server non ha finito il lavoro. Tocca Analizza di nuovo.' end
      where a.stato = 'in_corso' and a.iniziata_il < now() - interval '10 minutes';
      update public.marketing_spunti m
      set tentativi = m.tentativi + 1,
          stato = case when m.tentativi + 1 >= 3 then 'fallita'::public.analisi_stato else 'in_coda'::public.analisi_stato end,
          errore = case when m.tentativi + 1 >= 3 then 'Interrotto: il server non ha finito il lavoro. Riprova.' end,
          finita_il = case when m.tentativi + 1 >= 3 then now() end
      where m.stato = 'in_corso' and m.iniziata_il < now() - interval '10 minutes';
    end if;
  exception when others then
    raise warning 'call_tick: controllo dei lavori non riuscito (%)', sqlstate;
  end;

  begin
    perform public.call_pianifica();
  exception when others then
    raise warning 'call_tick: pianificazione non riuscita (%)', sqlstate;
  end;

  -- the old analyses, once a day around 03:00 (Rome)
  begin
    if extract(hour from (now() at time zone 'Europe/Rome')) = 3 and extract(minute from (now() at time zone 'Europe/Rome')) < 5 then
      perform public.call_analisi_pulizia();
    end if;
  exception when others then
    raise warning 'call_tick: pulizia non riuscita (%)', sqlstate;
  end;

  -- dispatch: the lease is free, nothing was sent in the last 2 minutes, there is work due;
  -- without a key of Claude (ultimo_esito senza_chiave) at most once an hour
  begin
    select * into s from public.call_lavori_stato x where x.id;
    if (s.lease_fino_al is null or s.lease_fino_al < now())
       and (s.inviata_il is null or s.inviata_il < now() - interval '2 minutes')
       and (s.ultimo_esito is distinct from 'senza_chiave' or s.ultimo_passo_il is null
            or s.ultimo_passo_il < now() - interval '60 minutes')
       and public.call_c_e_lavoro() then
      perform public.call_dispatch();
    end if;
  exception when others then
    raise warning 'call_tick: invio non riuscito (%)', sqlstate;
  end;
end;
$$;
revoke all on function public.call_tick() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. The steps (the route, service role)
-- ---------------------------------------------------------------------------
create function public.call_prendi_passo(p_secondi integer default 330)
returns table (passo uuid, cosa text, rif text)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_secondi integer := coalesce(p_secondi, 330);
  s public.call_lavori_stato;
  v record;
  v_passo uuid;
begin
  if v_secondi < 1 or v_secondi > 3600 then
    raise exception 'Durata del passo non valida' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('alpha.call_lavori', 0));
  select * into s from public.call_lavori_stato x where x.id for update;
  if s.lease_fino_al is not null and s.lease_fino_al > now() then
    return;
  end if;
  if public.call_costo_mese() >= s.costo_max_mese then
    update public.call_lavori_stato x set ultimo_esito = 'limite_spesa' where x.id;
    return;
  end if;
  select w.cosa, w.rif into v from public.call_scegli_lavoro() w limit 1;
  if not found then
    return;
  end if;

  v_passo := gen_random_uuid();
  if v.cosa = 'analisi' then
    update public.call_analisi a set stato = 'in_corso', iniziata_il = now() where a.call_id = v.rif::uuid;
  else
    update public.marketing_spunti m set stato = 'in_corso', iniziata_il = now() where m.id = v.rif::uuid;
  end if;
  update public.call_lavori_stato x
  set lease_fino_al = now() + make_interval(secs => v_secondi), passo_id = v_passo,
      passo_cosa = v.cosa, passo_rif = v.rif
  where x.id;

  passo := v_passo;
  cosa := v.cosa;
  rif := v.rif;
  return next;
end;
$$;
revoke all on function public.call_prendi_passo(integer) from public, anon, authenticated;
grant execute on function public.call_prendi_passo(integer) to service_role;

create function public.call_passo_finito(p_passo uuid, p_esito text, p_contatori jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.call_lavori_stato;
  c jsonb := coalesce(p_contatori, '{}'::jsonb);
  v_mese date := date_trunc('month', public.oggi())::date;
  chiave text;
begin
  if p_esito is null or p_esito not in ('ok', 'parziale', 'fallito', 'senza_chiave', 'limite_spesa', 'limite_fornitore') then
    raise exception 'Esito non valido.' using errcode = '22023';
  end if;
  if jsonb_typeof(c) <> 'object' then
    raise exception 'Contatori non validi.' using errcode = '22023';
  end if;
  for chiave in select k from jsonb_object_keys(c) as k loop
    if chiave in ('input', 'cache_scritti', 'cache_letti', 'output')
       and (jsonb_typeof(c -> chiave) <> 'number' or (c ->> chiave) !~ '^[0-9]{1,12}$') then
      raise exception 'Contatore non valido: %', chiave using errcode = '22023';
    end if;
  end loop;

  select * into s from public.call_lavori_stato x where x.id for update;
  if s.passo_id is distinct from p_passo then
    return false;
  end if;
  if s.mese <> v_mese then
    update public.call_lavori_stato x
    set mese = v_mese, token_input = 0, token_cache_scritti = 0, token_cache_letti = 0, token_output = 0,
        costo_mese_usd = 0, analisi_mese = 0, spunti_mese = 0
    where x.id;
  end if;
  update public.call_lavori_stato x
  set token_input = x.token_input + coalesce((c ->> 'input')::bigint, 0),
      token_cache_scritti = x.token_cache_scritti + coalesce((c ->> 'cache_scritti')::bigint, 0),
      token_cache_letti = x.token_cache_letti + coalesce((c ->> 'cache_letti')::bigint, 0),
      token_output = x.token_output + coalesce((c ->> 'output')::bigint, 0)
  where x.id;
  update public.call_lavori_stato x
  set costo_mese_usd = round(
        public.insight_costo_usd(x.token_input, x.token_cache_scritti, x.token_cache_letti, x.token_output), 4),
      ultimo_passo_il = now(),
      ultimo_esito = p_esito,
      ultimo_errore = case when p_esito in ('ok', 'parziale') then null else x.ultimo_errore end,
      lease_fino_al = null, passo_id = null, passo_cosa = null, passo_rif = null
  where x.id;

  -- a rate limit of the provider stops the chain: the tick starts it again in 5 minutes
  if p_esito <> 'limite_fornitore' and public.call_c_e_lavoro() then
    perform public.call_dispatch();
  end if;
  return true;
end;
$$;
revoke all on function public.call_passo_finito(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.call_passo_finito(uuid, text, jsonb) to service_role;

create function public.call_imposta_url(p_url text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  update public.call_lavori_stato s set url_passo = p_url where s.id;
end;
$$;
revoke all on function public.call_imposta_url(text) from public, anon, authenticated;
grant execute on function public.call_imposta_url(text) to service_role;

-- Without ANTHROPIC_API_KEY the route takes no step: the outcome is written so the page can say so
create function public.call_segna_esito(p_esito text, p_errore text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if p_esito is null or p_esito not in ('ok', 'parziale', 'fallito', 'senza_chiave', 'limite_spesa', 'limite_fornitore') then
    raise exception 'Esito non valido.' using errcode = '22023';
  end if;
  update public.call_lavori_stato s
  set ultimo_esito = p_esito, ultimo_errore = nullif(left(btrim(coalesce(p_errore, '')), 300), ''), ultimo_passo_il = now()
  where s.id;
end;
$$;
revoke all on function public.call_segna_esito(text, text) from public, anon, authenticated;
grant execute on function public.call_segna_esito(text, text) to service_role;

-- ---------------------------------------------------------------------------
-- 7. What reaches Claude for one call (service role only)
-- ---------------------------------------------------------------------------
-- No names (da_oscurare stays on the server), no importo_proposto, no «Altre note», no
-- email, no contact: the call, the lead's source and the post he comes from, the setter's
-- note of the call, the product pitched (name and length), the first call's summary for a follow-up.
create function public.call_fonti_analisi(p_call uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.calls;
  r public.call_registrazioni;
  l public.leads;
  v_giorni text[] := array['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'];
  v_locale timestamp;
  v_prodotto jsonb;
  v_contenuto jsonb;
  v_prima text;
  v_cliente boolean;
  v_call_totali integer;
begin
  select * into c from public.calls x where x.id = p_call;
  if not found then
    return null;
  end if;
  select * into r from public.call_registrazioni x where x.call_id = p_call;
  select * into l from public.leads x where x.id = c.lead_id;
  v_locale := c.programmata_il at time zone 'Europe/Rome';

  select jsonb_build_object('nome', p.nome, 'durata_mesi', p.durata_mesi) into v_prodotto
  from public.products p where p.id = c.prodotto_proposto_id;

  select jsonb_build_object(
           'come', lc.come,
           'giorno', to_char(lc.giorno, 'DD/MM'),
           'tipo', i.media_type,
           'didascalia', left(split_part(coalesce(i.didascalia, ''), E'\n', 1), 200),
           'name', m.nome)
    into v_contenuto
  from public.lead_contenuto lc
  left join public.instagram_contenuti i on i.shortcode = lc.shortcode
  left join public.marketing_contenuti m on m.instagram_shortcode = lc.shortcode
  where lc.lead_id = c.lead_id;

  if c.follow_up_di is not null then
    select a.riassunto into v_prima from public.call_analisi a where a.call_id = c.follow_up_di and a.stato = 'pronta';
  end if;
  select exists (select 1 from public.clients cl where cl.lead_id = c.lead_id) into v_cliente;
  select count(*) into v_call_totali from public.calls x where x.lead_id = c.lead_id and x.stato = 'svolta';

  return jsonb_build_object(
    'call', jsonb_build_object(
      'tipo', c.tipo,
      'giorno_settimana', v_giorni[extract(isodow from v_locale)::integer],
      'ora', to_char(v_locale, 'HH24:MI'),
      'esito', c.esito,
      'qualificata', c.qualificata,
      'motivo_non_chiusura', left(nullif(btrim(coalesce(c.obiezione_principale, '')), ''), 500),
      'note_closer', left(nullif(btrim(coalesce(c.note_closer, '')), ''), 500),
      'follow_up', c.di_follow_up),
    'lead', jsonb_build_object(
      'fonte', l.fonte,
      'contenuto', v_contenuto,
      'call_svolte', v_call_totali,
      'cliente', v_cliente),
    'setting', jsonb_build_object('note_setter', left(nullif(btrim(coalesce(c.note, '')), ''), 500)),
    'prodotto', v_prodotto,
    'prima_call', jsonb_build_object('riassunto', v_prima),
    'registrazione', jsonb_build_object(
      'link', c.link_registrazione,
      'recording_id', r.recording_id,
      'link_verificato', r.link_verificato,
      'durata_secondi', r.durata_secondi,
      'programmata_il', c.programmata_il,
      'stato_call', c.stato),
    'da_oscurare', public.marketing_da_oscurare());
end;
$$;
revoke all on function public.call_fonti_analisi(uuid) from public, anon, authenticated;
grant execute on function public.call_fonti_analisi(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 8. Saving what Claude wrote (service role, only with the step's lease)
-- ---------------------------------------------------------------------------
create function public.call_analisi_salva(p_call uuid, p_passo uuid, p jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c public.calls;
  a public.call_analisi;
  s jsonb := coalesce(p -> 'setter', '{}'::jsonb);
  v jsonb := p -> 'valutazione';
begin
  if not exists (select 1 from public.call_lavori_stato x where x.id and x.passo_id = p_passo and x.passo_cosa = 'analisi') then
    return false;
  end if;
  select * into a from public.call_analisi x where x.call_id = p_call for update;
  if not found or a.stato <> 'in_corso' then
    return false;
  end if;
  select * into c from public.calls x where x.id = p_call;
  if not found then
    return false;
  end if;

  update public.call_analisi x
  set stato = 'pronta', errore = null, prossimo_tentativo_il = null,
      recording_id = (p ->> 'recording_id')::bigint,
      riassunto = p ->> 'riassunto',
      esito_letto = p ->> 'esito_letto',
      in_target = p ->> 'in_target',
      lead = p -> 'lead',
      obiezioni = p -> 'obiezioni',
      categorie_obiezioni = coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'categorie_obiezioni', '[]'::jsonb))), '{}'),
      pain = coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'pain', '[]'::jsonb))), '{}'),
      desideri = coalesce(array(select jsonb_array_elements_text(coalesce(p -> 'desideri', '[]'::jsonb))), '{}'),
      domande = p -> 'domande',
      convinto_da = p -> 'convinto_da',
      motivo_proposto = nullif(p ->> 'motivo_proposto', ''),
      prossimi_passi = p -> 'prossimi_passi',
      momenti = p -> 'momenti',
      spunti_contenuto = p -> 'spunti_contenuto',
      versione_prompt = p ->> 'versione_prompt',
      analizzata_il = now()
  where x.call_id = p_call;

  insert into public.call_analisi_setter as x (call_id, in_target, segnali, sapeva, sorprese, obiezioni, analizzata_il)
  values (p_call, p ->> 'in_target', coalesce(s -> 'segnali', '[]'::jsonb),
          coalesce(array(select jsonb_array_elements_text(coalesce(s -> 'sapeva', '[]'::jsonb))), '{}'),
          coalesce(s -> 'sorprese', '[]'::jsonb), coalesce(s -> 'obiezioni', '[]'::jsonb), now())
  on conflict (call_id) do update
    set in_target = excluded.in_target, segnali = excluded.segnali, sapeva = excluded.sapeva,
        sorprese = excluded.sorprese, obiezioni = excluded.obiezioni, analizzata_il = excluded.analizzata_il;

  if c.setter_id is not null and jsonb_typeof(p -> 'spunti_setter') = 'array' and jsonb_array_length(p -> 'spunti_setter') > 0 then
    insert into public.call_spunti_setter as x (call_id, setter_id, spunti)
    values (p_call, c.setter_id, p -> 'spunti_setter')
    on conflict (call_id) do update set setter_id = excluded.setter_id, spunti = excluded.spunti;
  else
    delete from public.call_spunti_setter x where x.call_id = p_call;
  end if;

  if v is not null and jsonb_typeof(v) = 'object' and c.closer_id is not null then
    insert into public.call_valutazioni as x (call_id, closer_id, criteri, livello_proposto, perche, funzionato, da_provare, quota_parlato)
    values (p_call, c.closer_id, v -> 'criteri', (v ->> 'livello_proposto')::public.call_performance,
            coalesce(v -> 'perche', '[]'::jsonb), coalesce(v -> 'funzionato', '[]'::jsonb),
            coalesce(v -> 'da_provare', '[]'::jsonb), (v ->> 'quota_parlato')::numeric)
    on conflict (call_id) do update
      set closer_id = excluded.closer_id, criteri = excluded.criteri, livello_proposto = excluded.livello_proposto,
          perche = excluded.perche, funzionato = excluded.funzionato, da_provare = excluded.da_provare,
          quota_parlato = excluded.quota_parlato, decisa_livello = null, decisa_il = null;
  else
    delete from public.call_valutazioni x where x.call_id = p_call;
  end if;

  update public.call_lavori_stato x set analisi_mese = x.analisi_mese + 1 where x.id;
  return true;
end;
$$;
revoke all on function public.call_analisi_salva(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.call_analisi_salva(uuid, uuid, jsonb) to service_role;

-- A step that did not finish: failed for good, declined by Claude, or back in the queue
-- (waiting for the recording or the transcript: 6 hours from in_attesa_dal; p_conta: an error that counts as an attempt)
create function public.call_analisi_fallita(
  p_call uuid, p_passo uuid, p_stato text, p_errore text, p_riprova_tra interval default null, p_conta boolean default false)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  a public.call_analisi;
  v_stato text := p_stato;
  v_errore text := nullif(left(btrim(coalesce(p_errore, '')), 300), '');
  v_tentativi smallint;
begin
  if p_stato not in ('fallita', 'rifiutata', 'in_coda') then
    raise exception 'Stato non valido.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.call_lavori_stato x where x.id and x.passo_id = p_passo and x.passo_cosa = 'analisi') then
    return;
  end if;
  select * into a from public.call_analisi x where x.call_id = p_call for update;
  if not found or a.stato <> 'in_corso' then
    return;
  end if;
  v_tentativi := a.tentativi + case when p_conta then 1 else 0 end;
  if v_stato = 'in_coda' and (v_tentativi >= 3 or a.in_attesa_dal < now() - interval '6 hours') then
    v_stato := 'fallita';
    v_errore := coalesce(v_errore, 'Claude non ha risposto: tocca Analizza di nuovo.');
  end if;
  update public.call_analisi x
  set stato = v_stato, tentativi = v_tentativi,
      prossimo_tentativo_il = case when v_stato = 'in_coda' then now() + coalesce(p_riprova_tra, interval '10 minutes') end,
      errore = case when v_stato = 'in_coda' then null else coalesce(v_errore, 'Analisi non riuscita: tocca Analizza di nuovo.') end
  where x.call_id = p_call;
end;
$$;
revoke all on function public.call_analisi_fallita(uuid, uuid, text, text, interval, boolean) from public, anon, authenticated;
grant execute on function public.call_analisi_fallita(uuid, uuid, text, text, interval, boolean) to service_role;

-- ---------------------------------------------------------------------------
-- 9. The requests of the people
-- ---------------------------------------------------------------------------
-- «Analizza di nuovo»: the admin and the call's closer; 10 a day for the team
create function public.call_analisi_richiedi(p_call uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ruolo public.app_role := public.current_role();
  c public.calls;
  r public.call_registrazioni;
  s public.call_lavori_stato;
  a public.call_analisi;
begin
  if v_ruolo is null or v_ruolo not in ('admin', 'closer') then
    raise exception 'L’analisi la chiedono il closer della call e l’admin.' using errcode = '42501';
  end if;
  select * into c from public.calls x where x.id = p_call;
  if not found then
    raise exception 'Call non trovata.' using errcode = 'P0002';
  end if;
  if v_ruolo = 'closer' and c.closer_id is distinct from (select auth.uid()) then
    raise exception 'Questa call non è assegnata a te.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('alpha.call_lavori', 0));
  select * into s from public.call_lavori_stato x where x.id;
  if not s.analisi_attive then
    raise exception 'L’analisi delle call è spenta: l’admin la accende in Impostazioni › Fathom.' using errcode = '22023';
  end if;
  select * into r from public.call_registrazioni x where x.call_id = p_call;
  if not found or r.stato <> 'collegata' or c.link_registrazione is null
     or c.link_registrazione !~* '^https://([a-z0-9-]+\.)?fathom\.(video|ai)/' then
    raise exception 'Serve il link della registrazione di Fathom.' using errcode = '22023';
  end if;
  if c.stato <> 'svolta' or c.esito is null then
    raise exception 'Si analizzano solo le call svolte con un esito.' using errcode = '22023';
  end if;
  if public.call_costo_mese() >= s.costo_max_mese then
    raise exception 'Limite di spesa del mese raggiunto: l’analisi riparte il 1° del mese.' using errcode = '22023';
  end if;
  if s.giorno_richieste is distinct from public.oggi() then
    update public.call_lavori_stato x set giorno_richieste = public.oggi(), richieste_oggi = 0 where x.id;
    s.richieste_oggi := 0;
  end if;
  if s.richieste_oggi >= 10 then
    raise exception 'Oggi sono già state chieste 10 analisi: riprova domani.' using errcode = '22023';
  end if;
  select * into a from public.call_analisi x where x.call_id = p_call for update;
  if found and a.stato in ('in_coda', 'in_corso') then
    raise exception 'Claude sta già analizzando questa call.' using errcode = '22023';
  end if;

  insert into public.call_analisi as x (call_id, recording_id, motivo)
  values (p_call, r.recording_id, 'richiesta')
  on conflict (call_id) do update
    set stato = 'in_coda', motivo = 'richiesta', tentativi = 0, prossimo_tentativo_il = null,
        in_attesa_dal = now(), errore = null, recording_id = excluded.recording_id;
  update public.call_lavori_stato x set richieste_oggi = x.richieste_oggi + 1 where x.id;
end;
$$;
revoke all on function public.call_analisi_richiedi(uuid) from public, anon;
grant execute on function public.call_analisi_richiedi(uuid) to authenticated;

-- «Chiedi nuovi spunti»: admin and marketing; 2 a day, one open at a time
create function public.marketing_spunti_richiedi()
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  s public.call_lavori_stato;
  v_id uuid;
  v_inizio_oggi timestamptz := public.oggi()::timestamp at time zone 'Europe/Rome';
begin
  if public.current_role() is null or public.current_role() not in ('admin', 'marketing') then
    raise exception 'Gli spunti li chiedono l’admin e il marketing.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('alpha.call_lavori', 0));
  select * into s from public.call_lavori_stato x where x.id;
  if public.call_costo_mese() >= s.costo_max_mese then
    raise exception 'Le analisi di questo mese hanno raggiunto il limite di spesa: lo cambia l’admin in Impostazioni.'
      using errcode = '22023';
  end if;
  if exists (select 1 from public.marketing_spunti m where m.stato in ('in_coda', 'in_corso')) then
    raise exception 'Claude sta già scrivendo gli spunti.' using errcode = '22023';
  end if;
  if (select count(*) from public.marketing_spunti m where m.motivo = 'richiesta' and m.created_at >= v_inizio_oggi) >= 2 then
    raise exception 'Gli spunti di oggi sono già stati chiesti: riprova domani.' using errcode = '22023';
  end if;
  insert into public.marketing_spunti (motivo, periodo_da, periodo_a)
  values ('richiesta', public.oggi() - 28, public.oggi() - 1)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.marketing_spunti_richiedi() from public, anon;
grant execute on function public.marketing_spunti_richiedi() to authenticated;

-- The end of a brief (service role, with the lease): ready, failed, or back in the queue
create function public.marketing_spunti_fine(
  p_id uuid, p_passo uuid, p_stato text, p_contenuto jsonb, p_fonti jsonb,
  p_modello text, p_versione text, p_errore text, p_riprova_il timestamptz, p_conta boolean default false)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  m public.marketing_spunti;
  v_tentativi smallint;
  v_stato text := p_stato;
begin
  if p_stato not in ('pronta', 'fallita', 'in_coda') then
    raise exception 'Stato non valido.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.call_lavori_stato x where x.id and x.passo_id = p_passo and x.passo_cosa = 'spunti') then
    return false;
  end if;
  select * into m from public.marketing_spunti x where x.id = p_id for update;
  if not found or m.stato <> 'in_corso' then
    return false;
  end if;
  v_tentativi := m.tentativi + case when p_conta then 1 else 0 end;
  if v_stato = 'in_coda' and v_tentativi >= 3 then
    v_stato := 'fallita';
  end if;
  if v_stato = 'pronta' then
    update public.marketing_spunti x
    set stato = 'pronta', contenuto = p_contenuto, fonti = p_fonti, modello = left(p_modello, 80),
        versione_prompt = left(p_versione, 40), errore = null, prossimo_il = null, finita_il = now(), tentativi = v_tentativi
    where x.id = p_id;
    update public.call_lavori_stato x set spunti_mese = x.spunti_mese + 1 where x.id;
  elsif v_stato = 'fallita' then
    update public.marketing_spunti x
    set stato = 'fallita', errore = coalesce(nullif(left(btrim(coalesce(p_errore, '')), 300), ''), 'Spunti non riusciti: riprova.'),
        finita_il = now(), tentativi = v_tentativi
    where x.id = p_id;
  else
    update public.marketing_spunti x
    set stato = 'in_coda', prossimo_il = coalesce(p_riprova_il, now() + interval '10 minutes'), tentativi = v_tentativi
    where x.id = p_id;
  end if;
  return true;
end;
$$;
revoke all on function public.marketing_spunti_fine(uuid, uuid, text, jsonb, jsonb, text, text, text, timestamptz, boolean)
  from public, anon, authenticated;
grant execute on function public.marketing_spunti_fine(uuid, uuid, text, jsonb, jsonb, text, text, text, timestamptz, boolean)
  to service_role;

-- ---------------------------------------------------------------------------
-- 10. Performance: Claude proposes, the closer (or the admin) decides
-- ---------------------------------------------------------------------------
-- calls.performance is written by the call's closer and the admin only: the policy of the setter's
-- own calls would let him through, so the role is checked here, not left to the policy.
create function public.decidi_performance(p_call_id uuid, p_livello public.call_performance)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_ruolo public.app_role := public.current_role();
  v_closer uuid;
begin
  if v_ruolo is null or v_ruolo not in ('admin', 'closer') then
    raise exception 'La performance la scrive chi ha fatto la call.' using errcode = '42501';
  end if;
  select c.closer_id into v_closer from public.calls c where c.id = p_call_id;
  if not found then
    raise exception 'Call non trovata.' using errcode = 'P0002';
  end if;
  if v_ruolo = 'closer' and v_closer is distinct from (select auth.uid()) then
    raise exception 'La performance la scrive chi ha fatto la call.' using errcode = '42501';
  end if;
  update public.calls c set performance = p_livello where c.id = p_call_id;
  update public.call_valutazioni v
  set decisa_livello = p_livello, decisa_il = now()
  where v.call_id = p_call_id and v.closer_id = (select auth.uid());
end;
$$;
revoke all on function public.decidi_performance(uuid, public.call_performance) from public, anon;
grant execute on function public.decidi_performance(uuid, public.call_performance) to authenticated;

-- ---------------------------------------------------------------------------
-- 11. Settings (admin) and the situation the pages read
-- ---------------------------------------------------------------------------
create function public.call_imposta_costo_max(p_usd numeric)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo l’admin cambia il limite di spesa.' using errcode = '42501';
  end if;
  if p_usd is null or p_usd < 0 or p_usd > 200 then
    raise exception 'Scegli un limite tra 0 e 200 $.' using errcode = '22023';
  end if;
  update public.call_lavori_stato s set costo_max_mese = round(p_usd, 2) where s.id;
end;
$$;
revoke all on function public.call_imposta_costo_max(numeric) from public, anon;
grant execute on function public.call_imposta_costo_max(numeric) to authenticated;

create function public.call_imposta_interruttori(p_analisi boolean default null, p_spunti boolean default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo l’admin accende e spegne le analisi.' using errcode = '42501';
  end if;
  update public.call_lavori_stato s
  set analisi_attive = coalesce(p_analisi, s.analisi_attive), spunti_automatici = coalesce(p_spunti, s.spunti_automatici)
  where s.id;
end;
$$;
revoke all on function public.call_imposta_interruttori(boolean, boolean) from public, anon;
grant execute on function public.call_imposta_interruttori(boolean, boolean) to authenticated;

-- admin: everything; editor and marketing: only whether a brief is being written
create function public.call_lavori_situazione()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
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
    'spunti_automatici', s.spunti_automatici,
    'in_pausa_spesa', v_costo >= s.costo_max_mese);
  if v_ruolo = 'admin' then
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
$$;
revoke all on function public.call_lavori_situazione() from public, anon;
grant execute on function public.call_lavori_situazione() to authenticated;

-- ---------------------------------------------------------------------------
-- 12. The backup: not the two tables only the valued person reads
-- ---------------------------------------------------------------------------
create or replace function public.backup_completo()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_risultato jsonb := '{}'::jsonb;
  v_tabella text;
  v_righe jsonb;
begin
  for v_tabella in
    select c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r'
      and c.relname not like 'insight\_%'
      and c.relname not in ('call_valutazioni', 'call_spunti_setter')
    order by c.relname
  loop
    execute format('select coalesce(jsonb_agg(to_jsonb(t)), ''[]''::jsonb) from public.%I t', v_tabella)
      into v_righe;
    v_risultato := v_risultato || jsonb_build_object(v_tabella, v_righe);
  end loop;
  return v_risultato;
end;
$$;
comment on function public.backup_completo() is
  'service_role only: every table of public read at the time of the call (a table added later is never forgotten), the Instagram proposals included, never the insight_* tables (third-party DM text kept at most 30 days) nor call_valutazioni and call_spunti_setter (read only by the person they are about). Never the tokens and keys: they are in Vault.';
revoke all on function public.backup_completo() from public, anon, authenticated;
grant execute on function public.backup_completo() to service_role;

select cron.unschedule(j.jobid) from cron.job j where j.jobname = 'call-tick';
select cron.schedule('call-tick', '4-59/5 * * * *', 'select public.call_tick()');

comment on function public.call_tick() is
  'pg_cron every 5 minutes (4, 9, 14...): turn of the month, watchdog, the weekly brief on Mondays, the old analyses, dispatch of the next step. Never raises.';
comment on function public.call_fonti_analisi(uuid) is
  'service_role only: what may reach Claude for one call (the call, the lead''s source and post, the setter''s note, the product pitched name and length) and da_oscurare, the names to blank, which never leaves the server. Never the amount pitched, the other notes, a contact or a transcript.';
comment on function public.decidi_performance(uuid, public.call_performance) is
  'The call''s closer and the admin write calls.performance (the setter never, even with the policy of his own calls); the level Claude proposed is compared with it for the taring.';
