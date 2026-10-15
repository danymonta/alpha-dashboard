-- The Insight's functions and its two pg_cron jobs (1.35.0, CLAUDE.md
-- section 29). Tables in 20261014090000_insight_dati.sql, with the read helper
-- insight_puo_leggere() that their policies use.
--
-- The run is a chain of short, resumable invocations of one Vercel route
-- (POST /api/cron/insight): pg_cron ticks every 5 minutes (insight_tick),
-- starts the planned run at «Pronto alle» minus anticipo_minuti and watches the
-- active one; pg_net posts each step with the Vault key insight_chiave; the
-- route takes the step with a lease (insight_prendi_passo, 330 s, longer than
-- the route's 300 s) and ends it with insight_passo_finito, which dispatches
-- the next one, or with insight_fallita.
--
-- Every function is security definer with search_path '' unless marked, and
-- schema-qualifies everything. Each first loses every privilege, then gets
-- exactly the grant it needs:
--   authenticated (each checks the role first): insight_stato,
--     insight_imposta_automazione, insight_richiedi, insight_ruota_chiave,
--     insight_chat_messenger, insight_dimentica, messenger_imposta_token,
--     messenger_togli_token, messenger_token_presente
--   service_role: insight_prendi_passo, insight_passo_finito, insight_fallita,
--     insight_chiave, insight_agenda, insight_stato_lead, messenger_token,
--     messenger_errore
--   none (internal, or pg_cron as postgres): insight_istante,
--     insight_costo_usd, insight_da_avviare, insight_dispatch,
--     insight_scarta_letture, insight_tick, insight_pulizia
-- Advisory locks: pg_advisory_xact_lock(hashtextextended('alpha.<name>', 0)).
--
-- Never a message text, a model's output or an exception's message in a
-- column the admin reads: errors are fixed Italian sentences.

-- ---------------------------------------------------------------------------
-- Small helpers
-- ---------------------------------------------------------------------------

-- An ISO instant from a stored JSON string; null when it is not one (a message
-- without a readable time is dropped by the cleanup, never kept forever).
create function public.insight_istante(p_valore text)
returns timestamptz
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if p_valore is null or p_valore !~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}' then
    return null;
  end if;
  return p_valore::timestamptz;
exception when others then
  return null;
end;
$$;

comment on function public.insight_istante(text) is
  'Internal: an ISO instant from a JSON string of the Insight, null when it is not one. security invoker.';

revoke all on function public.insight_istante(text) from public, anon, authenticated, service_role;

-- The cost of a run from its token counters (D19): Claude Sonnet 5.5 per
-- million tokens (input $2, 5-minute cache writes $2.50, cache reads $0.20,
-- output $10); the server-side fallback (Claude Sonnet 5) has the same prices.
-- A price change is a migration.
create function public.insight_costo_usd(
  p_input bigint, p_cache_scritti bigint, p_cache_letti bigint, p_output bigint)
returns numeric
language sql
immutable
security invoker
set search_path = ''
as $$
  select round(
    (coalesce(p_input, 0) * 2.00
     + coalesce(p_cache_scritti, 0) * 2.50
     + coalesce(p_cache_letti, 0) * 0.20
     + coalesce(p_output, 0) * 10.00) / 1000000.0,
    4)::numeric(8,4);
$$;

comment on function public.insight_costo_usd(bigint, bigint, bigint, bigint) is
  'The USD cost of an Insight run from its token counters (Claude Sonnet 5.5 prices per million tokens; nulls count as 0). security invoker, internal.';

revoke all on function public.insight_costo_usd(bigint, bigint, bigint, bigint)
  from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The state the page reads
-- ---------------------------------------------------------------------------

-- {attivo, ora, esecuzione} for every reader; the admin also gets the last
-- tick, the manual runs of today and the details of the latest run (errors,
-- warnings, cost, tokens, counters). Never whether ANTHROPIC_API_KEY is set
-- (D23): only server code knows it. lib/insight/stato.ts reads it.
create function public.insight_stato()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_admin boolean := public.is_admin();
  v_imp public.insight_impostazioni;
  v_es public.insight_esecuzioni;
  v_esecuzione jsonb;
  v_risultato jsonb;
begin
  if not public.insight_puo_leggere() then
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
$$;

comment on function public.insight_stato() is
  'The Insight''s automation and its latest run, for the admin and every active setter (42501 for the others); the admin also gets the last tick, the manual runs of today, errors, warnings, cost and counters. Never whether the Anthropic key is set.';

revoke all on function public.insight_stato() from public, anon, authenticated;
grant execute on function public.insight_stato() to authenticated;

-- ---------------------------------------------------------------------------
-- The admin's actions
-- ---------------------------------------------------------------------------

-- «Automazione»: on or off, and when the recap is ready (Rome). The step URL
-- comes from the server (urlPasso), required to turn it on.
create function public.insight_imposta_automazione(p_attivo boolean, p_ora time, p_url text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo l’admin imposta l’automazione.' using errcode = '42501';
  end if;
  if p_attivo is null or p_ora is null then
    raise exception 'Scegli l’orario del recap.' using errcode = '22023';
  end if;
  if extract(second from p_ora) <> 0 or extract(minute from p_ora)::integer % 5 <> 0 then
    raise exception 'Scegli un orario a passi di 5 minuti, per esempio 19:00 o 19:05.' using errcode = '22023';
  end if;
  if (p_url is null and p_attivo)
     or (p_url is not null
         and p_url !~ '^https://[a-z0-9.-]+/api/cron/insight$'
         and p_url !~ '^http://(host\.docker\.internal|localhost|127\.0\.0\.1)(:[0-9]{2,5})?/api/cron/insight$') then
    raise exception 'Indirizzo dell’app non valido.' using errcode = '22023';
  end if;

  update public.insight_impostazioni i
  set attivo = p_attivo,
      ora = p_ora,
      url_passo = coalesce(p_url, i.url_passo),
      updated_by = (select auth.uid())
  where i.id;
end;
$$;

comment on function public.insight_imposta_automazione(boolean, time, text) is
  'Admin only: turns the automatic recap on or off and sets when it is ready (Rome, 5-minute steps). p_url (the step URL, from the server) is required to turn it on.';

revoke all on function public.insight_imposta_automazione(boolean, time, text) from public, anon, authenticated;
grant execute on function public.insight_imposta_automazione(boolean, time, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Dispatching a step
-- ---------------------------------------------------------------------------

-- pg_net posts the run's id to the step URL with the Vault key. pg_net sends
-- after the transaction commits. False (nothing sent) without a URL (a local
-- run driven by hand) or without the key.
create function public.insight_dispatch(p_esecuzione uuid)
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
  select i.url_passo into v_url from public.insight_impostazioni i where i.id;
  if v_url is null then
    return false;
  end if;
  select s.decrypted_secret into v_chiave from vault.decrypted_secrets s where s.name = 'insight_chiave';
  if v_chiave is null or v_chiave = '' then
    raise warning 'insight_dispatch: manca la chiave dei passi';
    return false;
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('esecuzione', p_esecuzione),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_chiave),
    timeout_milliseconds := 20000);

  update public.insight_esecuzioni e set inviata_il = now() where e.id = p_esecuzione;
  return true;
end;
$$;

comment on function public.insight_dispatch(uuid) is
  'Internal: posts an Insight run''s id to the step URL with the Vault key (pg_net, after commit) and dates the dispatch. False without a URL or a key.';

revoke all on function public.insight_dispatch(uuid) from public, anon, authenticated, service_role;

-- «Aggiorna dati»: a manual run for today (Rome), dispatched at once when the
-- step URL is known. At most 8 a day, one run at a time.
create function public.insight_richiedi(p_url text)
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
  if not public.is_admin() then
    raise exception 'Solo l’admin aggiorna i dati dell’Insight.' using errcode = '42501';
  end if;
  if p_url is not null
     and p_url !~ '^https://[a-z0-9.-]+/api/cron/insight$'
     and p_url !~ '^http://(host\.docker\.internal|localhost|127\.0\.0\.1)(:[0-9]{2,5})?/api/cron/insight$' then
    raise exception 'Indirizzo dell’app non valido.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('alpha.insight', 0));

  if exists (select 1 from public.insight_esecuzioni e where e.stato in ('in_coda', 'in_corso')) then
    raise exception 'Un aggiornamento è già in corso.' using errcode = '22023';
  end if;
  if (select count(*) from public.insight_esecuzioni e
      where e.motivo = 'manuale' and e.giorno = public.oggi()) >= 8 then
    raise exception 'Hai già aggiornato 8 volte oggi: riprova domani.' using errcode = '22023';
  end if;

  if p_url is not null then
    update public.insight_impostazioni i
    set url_passo = p_url,
        updated_by = (select auth.uid())
    where i.id and i.url_passo is distinct from p_url;
  end if;

  insert into public.insight_esecuzioni (giorno, motivo, richiesta_da)
  values (public.oggi(), 'manuale', (select auth.uid()))
  returning id into v_id;

  select i.url_passo into v_url from public.insight_impostazioni i where i.id;
  if v_url is not null then
    perform public.insight_dispatch(v_id);
  end if;
  return v_id;
end;
$$;

comment on function public.insight_richiedi(text) is
  'Admin only («Aggiorna dati»): a manual Insight run for today (Rome), dispatched when the step URL is known (p_url updates it). 22023 when a run is active or after 8 manual runs today.';

revoke all on function public.insight_richiedi(text) from public, anon, authenticated;
grant execute on function public.insight_richiedi(text) to authenticated;

-- ---------------------------------------------------------------------------
-- The scheduler
-- ---------------------------------------------------------------------------

-- The day whose planned run is due at p_adesso, or null: the automation is on
-- with a URL, p_adesso is within 2 hours from the start (the recap's time in
-- Rome minus anticipo_minuti, DST-safe), that day has no planned run, and no
-- run is active. The next day too (a recap at 00:10 starts the day before).
create function public.insight_da_avviare(p_adesso timestamptz)
returns date
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_imp public.insight_impostazioni;
  v_oggi date := (p_adesso at time zone 'Europe/Rome')::date;
  v_giorno date;
  v_avvio timestamptz;
begin
  select * into v_imp from public.insight_impostazioni i where i.id;
  if v_imp.id is null or not v_imp.attivo or v_imp.url_passo is null then
    return null;
  end if;
  if exists (select 1 from public.insight_esecuzioni e where e.stato in ('in_coda', 'in_corso')) then
    return null;
  end if;

  foreach v_giorno in array array[v_oggi, v_oggi + 1] loop
    v_avvio := ((v_giorno + v_imp.ora) at time zone 'Europe/Rome')
               - make_interval(mins => v_imp.anticipo_minuti);
    if p_adesso >= v_avvio and p_adesso < v_avvio + interval '2 hours'
       and not exists (select 1 from public.insight_esecuzioni e
                       where e.giorno = v_giorno and e.motivo = 'pianificata') then
      return v_giorno;
    end if;
  end loop;
  return null;
end;
$$;

comment on function public.insight_da_avviare(timestamptz) is
  'Internal: the Rome day whose planned Insight run is due at p_adesso (the recap''s time minus anticipo_minuti, up to 2 hours after), or null.';

revoke all on function public.insight_da_avviare(timestamptz) from public, anon, authenticated, service_role;

-- A failed run leaves no message it read (D25 step 5): every chat it wrote
-- loses its messages and its shared codes, and is read again from Meta at the
-- next run. Origins stay (a post and a day, no text).
create function public.insight_scarta_letture(p_esecuzione uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  update public.insight_chat c
  set messaggi = '[]'::jsonb,
      codici_condivisi = '{}',
      aggiornata_il = null
  where c.letta_da = p_esecuzione;
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function public.insight_scarta_letture(uuid) is
  'Internal: empties the messages of every chat an Insight run wrote (letta_da) and forces a new reading. Called when the run fails. Returns how many chats.';

revoke all on function public.insight_scarta_letture(uuid) from public, anon, authenticated, service_role;

-- pg_cron, every 5 minutes, as postgres. Never raises: each step in its own
-- block.
create function public.insight_tick()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  v_giorno date;
  v_id uuid;
begin
  -- 1. the page says when the scheduler stopped
  begin
    update public.insight_impostazioni i set ultimo_tick_il = now() where i.id;
  exception when others then
    raise warning 'insight_tick: ultimo tick non salvato (%)', sqlstate;
  end;

  -- 2. watchdog: a dispatch nobody took within 2 minutes, a lease expired
  --    (the route lives at most 300 s, the lease 330 s: an expired lease is a
  --    dead invocation), or a run never dispatched (no URL) left there
  begin
    for r in
      select e.id, e.tentativi, e.invocazioni, e.creata_il, e.inviata_il, e.lease_fino_al
      from public.insight_esecuzioni e
      where e.stato in ('in_coda', 'in_corso')
        and (e.lease_fino_al < now()
             or (e.lease_fino_al is null and (e.inviata_il is null or e.inviata_il < now() - interval '2 minutes')))
      order by e.creata_il
      for update skip locked
    loop
      if r.tentativi >= 3 or r.invocazioni >= 40 or r.creata_il < now() - interval '45 minutes' then
        update public.insight_esecuzioni e
        set stato = 'fallita',
            errore = 'Aggiornamento interrotto: il server non ha completato i passi. Riprova con Aggiorna dati.',
            finita_il = now(),
            lease_fino_al = null
        where e.id = r.id;
        perform public.insight_scarta_letture(r.id);
      elsif r.lease_fino_al is null and r.inviata_il is null then
        -- never dispatched: a run without a step URL waits for its driver
        -- (local, «manuale») until it is 45 minutes old
        null;
      else
        update public.insight_esecuzioni e set tentativi = e.tentativi + 1 where e.id = r.id;
        perform public.insight_dispatch(r.id);
      end if;
    end loop;
  exception when others then
    raise warning 'insight_tick: controllo delle esecuzioni non riuscito (%)', sqlstate;
  end;

  -- 3. the planned run of the day
  begin
    perform pg_advisory_xact_lock(hashtextextended('alpha.insight', 0));
    v_giorno := public.insight_da_avviare(now());
    if v_giorno is not null then
      v_id := null;
      insert into public.insight_esecuzioni (giorno, motivo)
      values (v_giorno, 'pianificata')
      on conflict do nothing
      returning id into v_id;
      if v_id is not null then
        perform public.insight_dispatch(v_id);
      end if;
    end if;
  exception when others then
    raise warning 'insight_tick: avvio pianificato non riuscito (%)', sqlstate;
  end;
end;
$$;

comment on function public.insight_tick() is
  'pg_cron every 5 minutes: dates the tick, re-dispatches or fails stuck Insight runs (3 attempts, 40 invocations or 45 minutes; a failed run leaves no message it read), starts the planned run of the day. Never raises.';

revoke all on function public.insight_tick() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The steps (the route, service role)
-- ---------------------------------------------------------------------------

-- Takes the run's next step with a lease, atomically: no row when another
-- invocation holds it, the run is over, or it has used its 40 invocations.
-- The blocks a dead invocation left in_corso go back to da_fare (or fail at 3
-- attempts, error 'interrotto').
create function public.insight_prendi_passo(p_esecuzione uuid, p_secondi integer default 330)
returns table (passo public.insight_passo, giorno date, motivo text, progresso jsonb)
language plpgsql
volatile
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_secondi integer := coalesce(p_secondi, 330);
  v_passo public.insight_passo;
  v_giorno date;
  v_motivo text;
  v_progresso jsonb;
begin
  if v_secondi < 1 or v_secondi > 3600 then
    raise exception 'Durata del passo non valida' using errcode = '22023';
  end if;

  update public.insight_esecuzioni e
  set stato = 'in_corso',
      lease_fino_al = now() + make_interval(secs => v_secondi),
      invocazioni = e.invocazioni + 1,
      iniziata_il = coalesce(e.iniziata_il, now())
  where e.id = p_esecuzione
    and e.stato in ('in_coda', 'in_corso')
    and e.invocazioni < 40
    and (e.lease_fino_al is null or e.lease_fino_al < now())
  returning e.passo, e.giorno, e.motivo, e.progresso
  into v_passo, v_giorno, v_motivo, v_progresso;
  if not found then
    return;
  end if;

  update public.insight_blocchi b
  set tentativi = b.tentativi + 1,
      stato = case when b.tentativi + 1 >= 3 then 'fallito' else 'da_fare' end,
      errore = case when b.tentativi + 1 >= 3 then 'interrotto' else b.errore end
  where b.esecuzione_id = p_esecuzione and b.stato = 'in_corso';

  passo := v_passo;
  giorno := v_giorno;
  motivo := v_motivo;
  progresso := v_progresso;
  return next;
end;
$$;

comment on function public.insight_prendi_passo(uuid, integer) is
  'service_role only: takes an Insight run''s step with a lease (default 330 s), atomically; no row when taken, over or out of invocations. Resets the blocks a dead invocation left in_corso.';

revoke all on function public.insight_prendi_passo(uuid, integer) from public, anon, authenticated;
grant execute on function public.insight_prendi_passo(uuid, integer) to service_role;

-- The end of a step: merges the progress, appends the warnings (distinct),
-- applies the whitelisted counters (token counters and servito_da_fallback
-- added up, the others replace; storico_dal written once, only while null),
-- recomputes the cost in SQL, clears the lease. p_prossimo null: the run is
-- ready; otherwise the next step (or the same, out of time) is dispatched in
-- the same transaction (pg_net sends after commit). False when the run is not
-- active any more.
create function public.insight_passo_finito(
  p_esecuzione uuid,
  p_prossimo public.insight_passo,
  p_progresso jsonb,
  p_avvisi text[],
  p_contatori jsonb)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c jsonb := coalesce(p_contatori, '{}'::jsonb);
  v_stato public.insight_stato_esecuzione;
  v_storico date;
begin
  if p_progresso is not null and jsonb_typeof(p_progresso) <> 'object' then
    raise exception 'Progresso non valido' using errcode = '22023';
  end if;
  if jsonb_typeof(c) <> 'object' then
    raise exception 'Contatori non validi' using errcode = '22023';
  end if;

  select e.stato into v_stato from public.insight_esecuzioni e where e.id = p_esecuzione for update;
  if v_stato is null or v_stato not in ('in_coda', 'in_corso') then
    return false;
  end if;

  update public.insight_esecuzioni x
  set progresso = x.progresso || coalesce(p_progresso, '{}'::jsonb),
      avvisi = x.avvisi || coalesce((
        select array_agg(u.avviso order by u.primo)
        from (select a.avviso, min(a.n) as primo
              from unnest(coalesce(p_avvisi, '{}'::text[])) with ordinality as a(avviso, n)
              where a.avviso is not null and btrim(a.avviso) <> '' and not (a.avviso = any (x.avvisi))
              group by a.avviso) u), '{}'::text[]),
      chat_instagram = coalesce((c->>'chat_instagram')::integer, x.chat_instagram),
      chat_messenger = coalesce((c->>'chat_messenger')::integer, x.chat_messenger),
      chat_escluse = coalesce((c->>'chat_escluse')::integer, x.chat_escluse),
      contenuti = coalesce((c->>'contenuti')::integer, x.contenuti),
      blocchi_totali = coalesce((c->>'blocchi_totali')::integer, x.blocchi_totali),
      blocchi_fatti = coalesce((c->>'blocchi_fatti')::integer, x.blocchi_fatti),
      chat_attribuite = coalesce((c->>'chat_attribuite')::integer, x.chat_attribuite),
      token_input = case when c->>'token_input' is null then x.token_input
                         else coalesce(x.token_input, 0) + (c->>'token_input')::bigint end,
      token_cache_scritti = case when c->>'token_cache_scritti' is null then x.token_cache_scritti
                                 else coalesce(x.token_cache_scritti, 0) + (c->>'token_cache_scritti')::bigint end,
      token_cache_letti = case when c->>'token_cache_letti' is null then x.token_cache_letti
                               else coalesce(x.token_cache_letti, 0) + (c->>'token_cache_letti')::bigint end,
      token_output = case when c->>'token_output' is null then x.token_output
                          else coalesce(x.token_output, 0) + (c->>'token_output')::bigint end,
      servito_da_fallback = x.servito_da_fallback + coalesce((c->>'servito_da_fallback')::integer, 0),
      modello = coalesce(nullif(left(btrim(c->>'modello'), 100), ''), x.modello),
      lease_fino_al = null,
      tentativi = 0,
      stato = case when p_prossimo is null then 'pronta'::public.insight_stato_esecuzione else 'in_corso' end,
      passo = coalesce(p_prossimo, x.passo),
      finita_il = case when p_prossimo is null then now() else x.finita_il end
  where x.id = p_esecuzione;

  -- the cost of the totals, in SQL (D19)
  update public.insight_esecuzioni x
  set costo_usd = case
        when x.token_input is null and x.token_cache_scritti is null
             and x.token_cache_letti is null and x.token_output is null then null
        else public.insight_costo_usd(x.token_input, x.token_cache_scritti, x.token_cache_letti, x.token_output)
      end
  where x.id = p_esecuzione;

  -- the first day the chats cover, once (D27)
  if c->>'storico_dal' is not null then
    v_storico := (c->>'storico_dal')::date;
    update public.insight_impostazioni i set storico_dal = v_storico where i.id and i.storico_dal is null;
  end if;

  if p_prossimo is not null then
    perform public.insight_dispatch(p_esecuzione);
  end if;
  return true;
end;
$$;

comment on function public.insight_passo_finito(uuid, public.insight_passo, jsonb, text[], jsonb) is
  'service_role only: ends an Insight step (progress merged, warnings appended, counters applied, cost recomputed in SQL, lease cleared) and dispatches the next one, or marks the run ready when p_prossimo is null. storico_dal in p_contatori is written once.';

revoke all on function public.insight_passo_finito(uuid, public.insight_passo, jsonb, text[], jsonb) from public, anon, authenticated;
grant execute on function public.insight_passo_finito(uuid, public.insight_passo, jsonb, text[], jsonb) to service_role;

-- The run failed: a fixed sentence for the admin (FRASI_INSIGHT, never an
-- exception's message; anything token-shaped is blanked anyway), and no
-- message it read survives (insight_scarta_letture). False when the run was
-- not active.
create function public.insight_fallita(p_esecuzione uuid, p_errore text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_errore text := btrim(coalesce(p_errore, ''));
begin
  v_errore := regexp_replace(v_errore, '[A-Za-z0-9_-]{40,}', '[token]', 'g');
  v_errore := left(v_errore, 500);
  if v_errore = '' then
    v_errore := 'Aggiornamento non riuscito: riprova con Aggiorna dati.';
  end if;

  update public.insight_esecuzioni e
  set stato = 'fallita',
      errore = v_errore,
      finita_il = now(),
      lease_fino_al = null
  where e.id = p_esecuzione and e.stato in ('in_coda', 'in_corso');
  if not found then
    return false;
  end if;

  perform public.insight_scarta_letture(p_esecuzione);
  return true;
end;
$$;

comment on function public.insight_fallita(uuid, text) is
  'service_role only: marks an active Insight run failed with a fixed sentence (at most 500 characters, token-shaped strings blanked) and empties the messages of the chats it read.';

revoke all on function public.insight_fallita(uuid, text) from public, anon, authenticated;
grant execute on function public.insight_fallita(uuid, text) to service_role;

-- ---------------------------------------------------------------------------
-- The key of the steps
-- ---------------------------------------------------------------------------
create function public.insight_chiave()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret
  from vault.decrypted_secrets s
  where s.name = 'insight_chiave';
$$;

comment on function public.insight_chiave() is
  'service_role only: the key pg_net sends with each Insight step, from Vault. It never reaches a browser.';

revoke all on function public.insight_chiave() from public, anon, authenticated;
grant execute on function public.insight_chiave() to service_role;

create function public.insight_ruota_chiave()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_chiave text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  if not public.is_admin() then
    raise exception 'Solo l’admin cambia la chiave dell’Insight.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('alpha.insight_chiave', 0));
  select s.id into v_id from vault.secrets s where s.name = 'insight_chiave';
  if v_id is null then
    perform vault.create_secret(v_chiave, 'insight_chiave', 'Chiave dei passi dell''Insight 24h');
  else
    perform vault.update_secret(v_id, v_chiave);
  end if;
end;
$$;

comment on function public.insight_ruota_chiave() is
  'Admin only: replaces the key of the Insight''s steps in Vault with 32 new random bytes. Never returns it.';

revoke all on function public.insight_ruota_chiave() from public, anon, authenticated;
grant execute on function public.insight_ruota_chiave() to authenticated;

-- ---------------------------------------------------------------------------
-- The app's state (contesto_app of the run): never notes, amounts, contacts or
-- the closer (D3, D15)
-- ---------------------------------------------------------------------------

-- The calls of yesterday, today and tomorrow (Rome), cancelled ones left out.
create function public.insight_agenda(p_adesso timestamptz default now())
returns table (
  giorno text,
  call_id uuid,
  programmata_il timestamptz,
  lead_id uuid,
  nome text,
  username text,
  fonte public.lead_source,
  stato public.call_status,
  esito public.call_outcome,
  di_follow_up boolean,
  volte_spostata integer,
  no_show_precedenti integer
)
language sql
stable
security definer
set search_path = ''
as $$
  with oggi as (
    select (coalesce(p_adesso, now()) at time zone 'Europe/Rome')::date as d
  )
  select
    case (c.programmata_il at time zone 'Europe/Rome')::date - o.d
      when -1 then 'ieri' when 0 then 'oggi' else 'domani' end,
    c.id,
    c.programmata_il,
    c.lead_id,
    l.nome,
    case when lower(ltrim(btrim(l.instagram_handle), '@')) ~ '^[a-z0-9._]{1,30}$'
         then lower(ltrim(btrim(l.instagram_handle), '@')) end,
    l.fonte,
    c.stato,
    c.esito,
    c.di_follow_up,
    c.volte_spostata,
    (select count(*)::integer from public.calls x
     where x.lead_id = c.lead_id and x.id <> c.id and x.stato = 'no_show')
  from public.calls c
  join public.leads l on l.id = c.lead_id
  cross join oggi o
  where (c.programmata_il at time zone 'Europe/Rome')::date between o.d - 1 and o.d + 1
    and c.stato <> 'cancellata'
  order by c.programmata_il, c.id;
$$;

comment on function public.insight_agenda(timestamptz) is
  'service_role only: the calls of yesterday, today and tomorrow in Rome (not cancelled) for the Insight''s agenda and show-up: time, lead name and handle, source, state, outcome, follow-up, moves, previous no-shows. Never notes, amounts, contacts or the closer.';

revoke all on function public.insight_agenda(timestamptz) from public, anon, authenticated;
grant execute on function public.insight_agenda(timestamptz) to service_role;

-- The app's state of the people who write: one row per normalized handle with
-- a lead or a client, and per normalized name (Messenger) that matches exactly
-- one lead. `cliente` and `ha_call` are for code only (D15).
create function public.insight_stato_lead(p_username text[], p_nomi text[] default '{}')
returns table (
  chiave text,
  per text,
  stato_lead public.lead_status,
  fonte public.lead_source,
  prossima_call_il timestamptz,
  prossima_call_stato public.call_status,
  ultimo_esito public.call_outcome,
  no_show_precedenti integer,
  cliente boolean,
  ha_call boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  with chiavi as (
    select distinct lower(ltrim(btrim(u), '@')) as chiave, 'username'::text as per
    from unnest(coalesce(p_username, '{}'::text[])) as u
    where lower(ltrim(btrim(u), '@')) ~ '^[a-z0-9._]{1,30}$'
    union
    select distinct lower(btrim(n)), 'nome'
    from unnest(coalesce(p_nomi, '{}'::text[])) as n
    where btrim(n) <> '' and char_length(btrim(n)) <= 120
  ),
  trovati as (
    select k.chiave, k.per, l.id, l.stato, l.fonte, l.created_at
    from chiavi k
    join public.leads l
      on (k.per = 'username' and lower(ltrim(btrim(l.instagram_handle), '@')) = k.chiave)
      or (k.per = 'nome' and lower(btrim(l.nome)) = k.chiave)
  ),
  -- a name counts only when it is one lead's
  validi as (
    select t.* from trovati t
    where t.per = 'username'
       or (select count(*) from trovati x where x.per = 'nome' and x.chiave = t.chiave) = 1
  )
  select
    k.chiave,
    k.per,
    ultimo.stato,
    ultimo.fonte,
    prossima.programmata_il,
    prossima.stato,
    esito.esito,
    (select count(*)::integer from public.calls c
     where c.lead_id in (select v.id from validi v where v.chiave = k.chiave and v.per = k.per)
       and c.stato = 'no_show'),
    exists (
      select 1
      from public.clients cl
      join public.sales s on s.client_id = cl.id and s.tipo in ('nuovo', 'rinnovo')
      where (k.per = 'username' and lower(ltrim(btrim(cl.instagram_handle), '@')) = k.chiave)
         or cl.lead_id in (select v.id from validi v where v.chiave = k.chiave and v.per = k.per)
    ),
    exists (
      select 1 from public.calls c
      where c.lead_id in (select v.id from validi v where v.chiave = k.chiave and v.per = k.per)
        and not c.di_follow_up
    )
  from chiavi k
  left join lateral (
    select v.stato, v.fonte from validi v
    where v.chiave = k.chiave and v.per = k.per
    order by v.created_at desc, v.id desc
    limit 1
  ) ultimo on true
  -- the next call still to be held: the first one ahead, otherwise the latest
  -- one left without an outcome
  left join lateral (
    select c.programmata_il, c.stato from public.calls c
    where c.lead_id in (select v.id from validi v where v.chiave = k.chiave and v.per = k.per)
      and c.stato in ('programmata', 'riprogrammata')
    order by (c.programmata_il >= now()) desc,
             case when c.programmata_il >= now() then c.programmata_il end asc,
             c.programmata_il desc
    limit 1
  ) prossima on true
  left join lateral (
    select c.esito from public.calls c
    where c.lead_id in (select v.id from validi v where v.chiave = k.chiave and v.per = k.per)
      and c.esito is not null
    order by c.programmata_il desc
    limit 1
  ) esito on true
  where exists (select 1 from validi v where v.chiave = k.chiave and v.per = k.per)
     or (k.per = 'username' and exists (
           select 1 from public.clients cl
           where lower(ltrim(btrim(cl.instagram_handle), '@')) = k.chiave))
  order by k.per, k.chiave;
$$;

comment on function public.insight_stato_lead(text[], text[]) is
  'service_role only: the app''s state of the people who write to the Insight''s account (lead state and source, next call, last outcome, no-shows; cliente and ha_call for code only), per Instagram handle and per Messenger name matching exactly one lead. Never notes, amounts or contacts.';

revoke all on function public.insight_stato_lead(text[], text[]) from public, anon, authenticated;
grant execute on function public.insight_stato_lead(text[], text[]) to service_role;

-- ---------------------------------------------------------------------------
-- Exclusions and the right to erasure (admin)
-- ---------------------------------------------------------------------------

-- The latest 50 Messenger chats with a name, not excluded: the admin picks
-- one to exclude (never types a PSID). No session reads insight_chat (D20).
create function public.insight_chat_messenger()
returns table (utente_id text, nome text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Le chat di Messenger le vede l’admin.' using errcode = '42501';
  end if;

  return query
  select x.utente_id, x.nome
  from (
    select distinct on (c.utente_id) c.utente_id, c.nome, c.ultimo_il, c.letta_il
    from public.insight_chat c
    where c.canale = 'messenger'
      and c.utente_id is not null
      and c.nome is not null and btrim(c.nome) <> ''
      and not exists (select 1 from public.messenger_esclusi e where e.utente_id = c.utente_id)
    order by c.utente_id, c.ultimo_il desc nulls last, c.letta_il desc
  ) x
  order by x.ultimo_il desc nulls last, x.letta_il desc, x.utente_id
  limit 50;
end;
$$;

comment on function public.insight_chat_messenger() is
  'Admin only: the latest 50 Messenger chats with a name (PSID and name only), not excluded, newest first, for the exclusion picker.';

revoke all on function public.insight_chat_messenger() from public, anon, authenticated;
grant execute on function public.insight_chat_messenger() to authenticated;

-- The right to erasure (D16): every trace of one chat in the Insight goes.
-- p_chiave is a username (Instagram) or a PSID (Messenger). The counts of
-- instagram_contenuti_dm and the recaps' summary counters carry no identity:
-- the next run recomputes them.
create function public.insight_dimentica(p_canale public.insight_canale, p_chiave text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_chiave text := btrim(coalesce(p_chiave, ''));
  v_user text;
  v_psid text;
  v_conv text[];
  v_nomi text[];
  v_call text[];
  v_array text;
  n integer;
  v_chat integer := 0;
  v_profili integer := 0;
  v_schede integer := 0;
  v_fatto integer := 0;
  v_voci integer := 0;
  v_esecuzioni integer := 0;
  v_blocchi integer := 0;
begin
  if not public.is_admin() then
    raise exception 'Solo l’admin cancella i messaggi di una chat.' using errcode = '42501';
  end if;
  if p_canale = 'instagram' then
    v_chiave := lower(ltrim(v_chiave, '@'));
    if v_chiave !~ '^[a-z0-9._]{1,30}$' then
      raise exception 'Chat non valida.' using errcode = '22023';
    end if;
    v_user := v_chiave;
  elsif p_canale = 'messenger' then
    if v_chiave !~ '^[0-9]{1,30}$' then
      raise exception 'Chat non valida.' using errcode = '22023';
    end if;
    v_psid := v_chiave;
  else
    raise exception 'Canale non valido.' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('alpha.insight_dimentica', 0));

  -- the chat's conversations and names, from the chats and from the recaps
  select coalesce(array_agg(distinct c.conversazione_id), '{}'),
         coalesce(array_agg(distinct lower(btrim(c.nome))) filter (where c.nome is not null and btrim(c.nome) <> ''), '{}')
  into v_conv, v_nomi
  from public.insight_chat c
  where c.canale = p_canale
    and (c.username = v_user or c.utente_id = v_psid);

  select v_conv || coalesce(array_agg(distinct x.voce->>'conversation_id'), '{}')
  into v_conv
  from public.insight_recap r
  cross join unnest(array['leads', 'reactivate']) as a(nome)
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(r.dati->a.nome) = 'array' then r.dati->a.nome else '[]'::jsonb end) as x(voce)
  where r.canale = p_canale
    and x.voce->>'conversation_id' is not null
    and (x.voce->>'username' = v_user or x.voce->>'user_id' = v_psid);

  -- the calls of the person in the agendas
  select coalesce(array_agg(distinct x.voce->>'call_id'), '{}')
  into v_call
  from public.insight_recap r
  cross join unnest(array['agenda', 'show_up']) as a(nome)
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(r.dati->a.nome) = 'array' then r.dati->a.nome else '[]'::jsonb end) as x(voce)
  where x.voce->>'call_id' is not null
    and (x.voce->>'username' = v_user or x.voce->>'user_id' = v_psid);

  select v_call || coalesce(array_agg(distinct x.voce->>'call_id'), '{}')
  into v_call
  from public.insight_esecuzioni e
  cross join lateral jsonb_array_elements(
    case when jsonb_typeof(e.contesto_app->'agenda') = 'array' then e.contesto_app->'agenda' else '[]'::jsonb end) as x(voce)
  where x.voce->>'call_id' is not null
    and x.voce->>'username' = v_user;

  -- rows
  delete from public.insight_chat c
  where c.canale = p_canale
    and (c.username = v_user or c.utente_id = v_psid or c.conversazione_id = any (v_conv));
  get diagnostics v_chat = row_count;

  if v_user is not null then
    delete from public.insight_profili p where p.username = v_user;
    get diagnostics v_profili = row_count;
  end if;

  delete from public.insight_schede s
  where (s.canale = p_canale and s.chiave = any (v_conv))
     or (s.tipo in ('agenda', 'show_up') and s.chiave = any (v_call));
  get diagnostics v_schede = row_count;

  delete from public.insight_fatto f
  where (f.canale = p_canale and (f.chiave = v_chiave or f.chiave = any (v_conv)))
     or f.chiave = any (v_call);
  get diagnostics v_fatto = row_count;

  -- the items of the recaps
  foreach v_array in array array['leads', 'reactivate', 'objections', 'non_leads', 'agenda', 'show_up'] loop
    with voci as (
      select r.giorno, r.canale,
             coalesce(jsonb_agg(x.voce order by x.n) filter (where not x.tolta), '[]'::jsonb) as rimaste,
             count(*) filter (where x.tolta) as tolte
      from public.insight_recap r
      cross join lateral (
        select e.voce, e.n,
               coalesce(e.voce->>'username' = v_user
                        or e.voce->>'user_id' = v_psid
                        or e.voce->>'conversation_id' = any (v_conv)
                        or e.voce->>'call_id' = any (v_call), false) as tolta
        from jsonb_array_elements(
          case when jsonb_typeof(r.dati->v_array) = 'array' then r.dati->v_array else '[]'::jsonb end)
          with ordinality as e(voce, n)
      ) x
      where jsonb_typeof(r.dati->v_array) = 'array'
      group by r.giorno, r.canale
    ),
    cambiati as (
      update public.insight_recap r
      set dati = jsonb_set(r.dati, array[v_array], v.rimaste)
      from voci v
      where v.giorno = r.giorno and v.canale = r.canale and v.tolte > 0
      returning v.tolte
    )
    select coalesce(sum(cambiati.tolte), 0)::integer into n from cambiati;
    v_voci := v_voci + n;
  end loop;

  -- the app's state kept on the runs
  with nuovi as (
    select e.id,
      jsonb_set(
        jsonb_set(e.contesto_app, '{agenda}', coalesce((
          select jsonb_agg(x.voce order by x.n)
          from jsonb_array_elements(
            case when jsonb_typeof(e.contesto_app->'agenda') = 'array' then e.contesto_app->'agenda' else '[]'::jsonb end)
            with ordinality as x(voce, n)
          where not coalesce(x.voce->>'username' = v_user or x.voce->>'call_id' = any (v_call), false)), '[]'::jsonb)),
        '{stato_lead}', coalesce((
          select jsonb_agg(x.voce order by x.n)
          from jsonb_array_elements(
            case when jsonb_typeof(e.contesto_app->'stato_lead') = 'array' then e.contesto_app->'stato_lead' else '[]'::jsonb end)
            with ordinality as x(voce, n)
          where not coalesce((x.voce->>'per' = 'username' and x.voce->>'chiave' = v_user)
                             or (x.voce->>'per' = 'nome' and x.voce->>'chiave' = any (v_nomi)), false)), '[]'::jsonb)
      ) as nuovo
    from public.insight_esecuzioni e
    where jsonb_typeof(e.contesto_app) = 'object'
  )
  update public.insight_esecuzioni e
  set contesto_app = nuovi.nuovo
  from nuovi
  where nuovi.id = e.id and e.contesto_app is distinct from nuovi.nuovo;
  get diagnostics v_esecuzioni = row_count;

  -- the summaries of finished runs that name the chat
  update public.insight_blocchi b
  set risultato = null
  where b.risultato is not null
    and b.esecuzione_id in (select e.id from public.insight_esecuzioni e where e.stato in ('pronta', 'fallita'))
    and (strpos(b.risultato::text, to_jsonb(v_chiave)::text) > 0
         or exists (select 1 from unnest(v_conv) as k(conv) where strpos(b.risultato::text, to_jsonb(k.conv)::text) > 0));
  get diagnostics v_blocchi = row_count;

  return jsonb_build_object(
    'chat', v_chat,
    'profili', v_profili,
    'schede', v_schede,
    'fatto', v_fatto,
    'voci_recap', v_voci,
    'esecuzioni', v_esecuzioni,
    'blocchi', v_blocchi);
end;
$$;

comment on function public.insight_dimentica(public.insight_canale, text) is
  'Admin only: deletes every trace of one chat (an Instagram username or a Messenger PSID) from the Insight: the chat, the profile, the cards, the Fatto rows, the items of every recap and of the runs'' app state, the summaries of finished runs naming it. Returns the counts. The counts per post carry no identity and stay.';

revoke all on function public.insight_dimentica(public.insight_canale, text) from public, anon, authenticated;
grant execute on function public.insight_dimentica(public.insight_canale, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Retention (D13): no stored message is older than 30 days, wherever it is
-- ---------------------------------------------------------------------------
create function public.insight_pulizia()
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_limite timestamptz := now() - interval '30 days';
  v_array text;
  n integer;
  v_conti jsonb := '{}'::jsonb;
begin
  -- chats whose last message is older than 30 days
  begin
    delete from public.insight_chat c where coalesce(c.ultimo_il, c.letta_il) < v_limite;
    get diagnostics n = row_count;
    v_conti := v_conti || jsonb_build_object('chat', n);
  exception when others then
    raise warning 'insight_pulizia: chat (%)', sqlstate;
  end;

  -- inside the other chats, every message older than 30 days (or without a time)
  begin
    update public.insight_chat c
    set messaggi = coalesce((
      select jsonb_agg(m.voce order by m.n)
      from jsonb_array_elements(c.messaggi) with ordinality as m(voce, n)
      where public.insight_istante(m.voce->>'il') >= v_limite), '[]'::jsonb)
    where jsonb_typeof(c.messaggi) = 'array'
      and exists (select 1
                  from jsonb_array_elements(
                    case when jsonb_typeof(c.messaggi) = 'array' then c.messaggi else '[]'::jsonb end) as m(voce)
                  where coalesce(public.insight_istante(m.voce->>'il') < v_limite, true));
    get diagnostics n = row_count;
    v_conti := v_conti || jsonb_build_object('chat_ripulite', n);
  exception when others then
    raise warning 'insight_pulizia: messaggi delle chat (%)', sqlstate;
  end;

  -- inside every recap, the messages of leads and reactivations older than
  -- 30 days or without their instant
  begin
    n := 0;
    foreach v_array in array array['leads', 'reactivate'] loop
      with ripuliti as (
        update public.insight_recap r
        set dati = jsonb_set(r.dati, array[v_array], coalesce((
          select jsonb_agg(
                   case when jsonb_typeof(l.voce->'messages') = 'array'
                        then jsonb_set(l.voce, '{messages}', coalesce((
                               select jsonb_agg(m.voce order by m.n)
                               from jsonb_array_elements(l.voce->'messages') with ordinality as m(voce, n)
                               where public.insight_istante(m.voce->>'at') >= v_limite), '[]'::jsonb))
                        else l.voce end
                   order by l.n)
          from jsonb_array_elements(r.dati->v_array) with ordinality as l(voce, n)), '[]'::jsonb))
        where jsonb_typeof(r.dati->v_array) = 'array'
          and exists (
            select 1
            from jsonb_array_elements(
              case when jsonb_typeof(r.dati->v_array) = 'array' then r.dati->v_array else '[]'::jsonb end) as l(voce)
            cross join lateral jsonb_array_elements(
              case when jsonb_typeof(l.voce->'messages') = 'array' then l.voce->'messages' else '[]'::jsonb end) as m(voce)
            where coalesce(public.insight_istante(m.voce->>'at') < v_limite, true))
        returning 1
      )
      select n + count(*)::integer into n from ripuliti;
    end loop;
    v_conti := v_conti || jsonb_build_object('recap_ripuliti', n);
  exception when others then
    raise warning 'insight_pulizia: messaggi dei recap (%)', sqlstate;
  end;

  -- profiles read more than 30 days ago
  begin
    delete from public.insight_profili p where p.letto_il < v_limite;
    get diagnostics n = row_count;
    v_conti := v_conti || jsonb_build_object('profili', n);
  exception when others then
    raise warning 'insight_pulizia: profili (%)', sqlstate;
  end;

  -- recaps 30 days after their day (their Fatto rows by cascade: the DELETE
  -- events carry no username, D12)
  begin
    delete from public.insight_recap r where r.giorno < public.oggi() - 30;
    get diagnostics n = row_count;
    v_conti := v_conti || jsonb_build_object('recap', n);
  exception when others then
    raise warning 'insight_pulizia: recap (%)', sqlstate;
  end;

  -- runs created more than 30 days ago (blocks and cards by cascade; the app
  -- state goes with them)
  begin
    delete from public.insight_esecuzioni e where e.creata_il < v_limite;
    get diagnostics n = row_count;
    v_conti := v_conti || jsonb_build_object('esecuzioni', n);
  exception when others then
    raise warning 'insight_pulizia: esecuzioni (%)', sqlstate;
  end;

  -- pg_cron's own log: 288 rows a day, keep 3 days
  begin
    delete from cron.job_run_details d where d.start_time < now() - interval '3 days';
    get diagnostics n = row_count;
    v_conti := v_conti || jsonb_build_object('log_cron', n);
  exception when others then
    raise warning 'insight_pulizia: log di pg_cron (%)', sqlstate;
  end;

  -- never instagram_contenuti nor instagram_contenuti_dm
  return v_conti;
end;
$$;

comment on function public.insight_pulizia() is
  'pg_cron every night: deletes chats, profiles, recaps and runs of the Insight older than 30 days and every stored message older than 30 days, inside the chats and inside the recaps; trims pg_cron''s log to 3 days. Never touches instagram_contenuti or instagram_contenuti_dm. Returns the counts.';

revoke all on function public.insight_pulizia() from public, anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Messenger: the Page token, in Vault (a port of instagram_*_token)
-- ---------------------------------------------------------------------------
create function public.messenger_imposta_token(p_token text, p_pagina_id text, p_pagina_nome text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_token text := btrim(coalesce(p_token, ''));
  v_pagina_id text := btrim(coalesce(p_pagina_id, ''));
  v_pagina_nome text := nullif(btrim(coalesce(p_pagina_nome, '')), '');
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'Messenger lo collega l’admin.' using errcode = '42501';
  end if;
  -- the format of instagram_imposta_token (a regex repeat stops at 255)
  if char_length(v_token) not between 20 and 2048 or v_token !~ '^[A-Za-z0-9_.|-]+$' then
    raise exception 'Token della Pagina non valido.' using errcode = '22023';
  end if;
  if v_pagina_id !~ '^[0-9]{1,30}$' then
    raise exception 'Pagina Facebook non valida.' using errcode = '22023';
  end if;
  v_pagina_nome := left(v_pagina_nome, 120);

  -- its own lock: the Instagram token is another secret
  perform pg_advisory_xact_lock(hashtextextended('alpha.messenger_token', 0));
  select s.id into v_id from vault.secrets s where s.name = 'messenger_token';
  if v_id is null then
    perform vault.create_secret(v_token, 'messenger_token',
      'Facebook Page token of Percorso Alpha (Messenger): read only by the service role (messenger_token)');
  else
    perform vault.update_secret(v_id, v_token);
  end if;

  update public.messenger_collegamento m
  set pagina_id = v_pagina_id,
      pagina_nome = v_pagina_nome,
      token_aggiornato_il = now(),
      ultimo_errore = null,
      ultimo_errore_il = null,
      updated_by = (select auth.uid())
  where m.id;
end;
$$;

comment on function public.messenger_imposta_token(text, text, text) is
  'Admin only: stores the Facebook Page token in Vault (one secret, fixed name), with the Page''s id and name, and clears the last error. Never returns it.';

revoke all on function public.messenger_imposta_token(text, text, text) from public, anon, authenticated;
grant execute on function public.messenger_imposta_token(text, text, text) to authenticated;

create function public.messenger_togli_token()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Messenger lo scollega l’admin.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('alpha.messenger_token', 0));
  delete from vault.secrets s where s.name = 'messenger_token';

  update public.messenger_collegamento m
  set token_aggiornato_il = null,
      updated_by = (select auth.uid())
  where m.id;
end;
$$;

comment on function public.messenger_togli_token() is
  'Admin only: removes the Facebook Page token from Vault. The Page''s name and the exclusions stay.';

revoke all on function public.messenger_togli_token() from public, anon, authenticated;
grant execute on function public.messenger_togli_token() to authenticated;

create function public.messenger_token_presente()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'Il collegamento di Messenger lo vede l’admin.' using errcode = '42501';
  end if;
  return exists (select 1 from vault.secrets s where s.name = 'messenger_token');
end;
$$;

comment on function public.messenger_token_presente() is
  'Admin only: whether the Facebook Page token is in Vault, never its value.';

revoke all on function public.messenger_token_presente() from public, anon, authenticated;
grant execute on function public.messenger_token_presente() to authenticated;

create function public.messenger_token()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.decrypted_secret
  from vault.decrypted_secrets s
  where s.name = 'messenger_token';
$$;

comment on function public.messenger_token() is
  'The Facebook Page token from Vault, null when not connected. service_role only: it never reaches a browser.';

revoke all on function public.messenger_token() from public, anon, authenticated;
grant execute on function public.messenger_token() to service_role;

-- The Messenger reading failed: the admin reads why. The token never lands in
-- the column, whatever the caller passed.
create function public.messenger_errore(p_messaggio text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_messaggio text := btrim(coalesce(p_messaggio, ''));
  v_token text;
begin
  select s.decrypted_secret into v_token
  from vault.decrypted_secrets s
  where s.name = 'messenger_token';
  if v_token is not null and v_token <> '' then
    v_messaggio := replace(v_messaggio, v_token, '[token]');
  end if;
  v_messaggio := regexp_replace(v_messaggio, 'access_token=[^&[:space:]"'']*', 'access_token=[token]', 'gi');
  v_messaggio := regexp_replace(v_messaggio, '[A-Za-z0-9_-]{40,}', '[token]', 'g');
  v_messaggio := left(v_messaggio, 500);
  if v_messaggio = '' then
    v_messaggio := 'Errore sconosciuto';
  end if;

  update public.messenger_collegamento m
  set ultimo_errore = v_messaggio,
      ultimo_errore_il = now()
  where m.id;
end;
$$;

comment on function public.messenger_errore(text) is
  'service_role only: records the last error of the Messenger reading (at most 500 characters, the token blanked out).';

revoke all on function public.messenger_errore(text) from public, anon, authenticated;
grant execute on function public.messenger_errore(text) to service_role;

-- ---------------------------------------------------------------------------
-- The pg_cron jobs (idempotent)
-- ---------------------------------------------------------------------------
select cron.unschedule(j.jobid) from cron.job j where j.jobname in ('insight-tick', 'insight-pulizia');
select cron.schedule('insight-tick', '*/5 * * * *', 'select public.insight_tick()');
select cron.schedule('insight-pulizia', '20 2 * * *', 'select public.insight_pulizia()');
