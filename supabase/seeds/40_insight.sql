-- Insight ultime 24h demo data (1.35.0). Invented chats, people and handles
-- only: never a real DM (CLAUDE.md section 13). After 27_post_instagram.sql
-- (the posts it names). Dates and times relative to now() and public.oggi();
-- fixed ids and "on conflict do nothing": running it again changes nothing
-- already there. It never touches instagram_collegamento nor the 1.33.0 rows.
--
-- Recaps (insight_recap), in the format of lib/insight/recap.ts:
--   today, Instagram   partial: a lead per priority, a placeholder card, a card
--                      to recheck, origins (SeedDemo01 shared in DM, a caption
--                      keyword of SeedPost02, a story), an under-14 card without
--                      messages, one reactivation per step, two objections,
--                      three agenda calls (two today), a no-show, a non-lead,
--                      2 excluded chats, posts SeedPost02 to SeedPost04 and
--                      SeedDemo01, story replies
--   yesterday, Instagram   complete, smaller
--   today and yesterday, Messenger   complete, without posts
-- Runs: today's manual run and yesterday's planned run, both ready.
-- Fatto: one lead of today ticked.
-- Counts per post and day (instagram_contenuti_dm) on SeedDemo01 and SeedPost02,
-- the same numbers as today's posts table.

-- One message of a recap: {from, time 'GG/MM HH:MM' Rome, text, at ISO UTC}
create or replace function pg_temp.insight_msg(p_da text, p_istante timestamptz, p_testo text)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'from', p_da,
    'time', to_char(p_istante at time zone 'Europe/Rome', 'DD/MM HH24:MI'),
    'text', p_testo,
    'at', to_char(p_istante at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'));
$$;

-- One row of the posts table, from the seed's post
create or replace function pg_temp.insight_post(
  p_shortcode text, p_dm integer, p_target integer, p_call integer,
  p_verdict text, p_why text, p_views integer, p_saved integer, p_shares integer)
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'permalink', i.permalink,
    'date', to_char(i.pubblicato_il at time zone 'Europe/Rome', 'DD/MM'),
    'type', case when i.reel then 'Reel' when i.media_type = 'CAROUSEL_ALBUM' then 'Carosello' else 'Post' end,
    'hook', left(split_part(coalesce(i.didascalia, ''), E'\n', 1), 90),
    'views', p_views,
    'saved', p_saved,
    'shares', p_shares,
    'dm', p_dm,
    'target', p_target,
    'verdict', p_verdict,
    'why', p_why,
    'shortcode', i.shortcode,
    'call', p_call)
  from public.instagram_contenuti i
  where i.shortcode = p_shortcode;
$$;

do $$
declare
  v_adesso timestamptz := now();
  v_oggi date := public.oggi();
  v_ieri_alle timestamptz := ((public.oggi() - 1)::timestamp + time '18:45') at time zone 'Europe/Rome';
  v_esecuzione_oggi uuid := '40400000-0000-4000-8000-000000000001';
  v_esecuzione_ieri uuid := '40400000-0000-4000-8000-000000000002';
  v_avviso text := '1 chat non analizzata: Claude non ha risposto in tempo. Riprova con Aggiorna dati.';
  v_demo01 jsonb;
  v_post02 jsonb;
  v_generato_con jsonb := jsonb_build_object(
    'modello', 'claude-sonnet-5-5', 'effort', 'medium', 'versione_prompt', '2026-10-14', 'servito_da_fallback', false);
  -- the warnings and how a recap was made are the admin's: they live on the run, not in the recap the setter reads
  v_dettagli_oggi jsonb := jsonb_build_object(
    'instagram', jsonb_build_object('avvisi', jsonb_build_array(v_avviso), 'generato_con', v_generato_con),
    'messenger', jsonb_build_object('avvisi', '[]'::jsonb, 'generato_con', v_generato_con));
  v_dettagli_ieri jsonb := jsonb_build_object(
    'instagram', jsonb_build_object('avvisi', '[]'::jsonb, 'generato_con', v_generato_con),
    'messenger', jsonb_build_object('avvisi', '[]'::jsonb, 'generato_con', v_generato_con));
  v_ig_oggi jsonb;
  v_ig_ieri jsonb;
  v_fb_oggi jsonb;
  v_fb_ieri jsonb;
begin
  -- the seed's posts are there (27_post_instagram.sql): otherwise nothing to show
  if not exists (select 1 from public.instagram_contenuti i where i.shortcode = 'SeedDemo01') then
    raise notice '40_insight.sql: mancano i post del seed 27_post_instagram.sql, niente Insight demo';
    return;
  end if;

  select jsonb_build_object(
           'tipo', 'condivisione', 'shortcode', i.shortcode, 'permalink', i.permalink,
           'data', to_char(i.pubblicato_il at time zone 'Europe/Rome', 'DD/MM'), 'tipo_post', 'reel',
           'hook', split_part(i.didascalia, E'\n', 1))
  into v_demo01
  from public.instagram_contenuti i where i.shortcode = 'SeedDemo01';
  select jsonb_build_object(
           'tipo', 'parola_chiave', 'shortcode', i.shortcode, 'permalink', i.permalink,
           'data', to_char(i.pubblicato_il at time zone 'Europe/Rome', 'DD/MM'), 'tipo_post', 'reel',
           'hook', split_part(i.didascalia, E'\n', 1), 'parola', 'ADDOMINALI')
  into v_post02
  from public.instagram_contenuti i where i.shortcode = 'SeedPost02';

  -- -------------------------------------------------------------------------
  -- The runs
  -- -------------------------------------------------------------------------
  insert into public.insight_esecuzioni (
    id, giorno, motivo, richiesta_da, stato, passo, progresso, inviata_il, tentativi, invocazioni,
    avvisi, dettagli_recap, chat_instagram, chat_messenger, chat_escluse, contenuti, blocchi_totali, blocchi_fatti,
    chat_attribuite, token_input, token_cache_scritti, token_cache_letti, token_output, costo_usd,
    modello, creata_il, iniziata_il, finita_il)
  values
    (v_esecuzione_oggi, v_oggi, 'manuale', '11111111-1111-4111-8111-111111111111', 'pronta', 'unione',
     '{}'::jsonb, v_adesso - interval '25 minutes', 0, 3,
     array[v_avviso], v_dettagli_oggi, 9, 3, 2, 4, 6, 6, 3, 180000, 21000, 600000, 52000,
     public.insight_costo_usd(180000, 21000, 600000, 52000),
     'claude-sonnet-5-5', v_adesso - interval '25 minutes', v_adesso - interval '25 minutes',
     v_adesso - interval '20 minutes'),
    (v_esecuzione_ieri, v_oggi - 1, 'pianificata', null, 'pronta', 'unione',
     '{}'::jsonb, v_ieri_alle - interval '15 minutes', 0, 2,
     '{}', v_dettagli_ieri, 4, 1, 1, 3, 3, 3, 1, 90000, 21000, 300000, 26000,
     public.insight_costo_usd(90000, 21000, 300000, 26000),
     'claude-sonnet-5-5', v_ieri_alle - interval '15 minutes', v_ieri_alle - interval '15 minutes',
     v_ieri_alle - interval '10 minutes')
  on conflict (id) do nothing;

  -- -------------------------------------------------------------------------
  -- Today, Instagram (partial)
  -- -------------------------------------------------------------------------
  v_ig_oggi := jsonb_build_object(
    'date', to_char(v_oggi, 'YYYY-MM-DD'),
    'generated_at', to_char((v_adesso - interval '25 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'window_hours', 24,
    'headline', 'Giornata buona: 2 lead in target, uno con la call già fissata per domani. Tre persone aspettano una risposta: parti da Marco, che ha chiesto quando fare la call.',
    'summary', jsonb_build_object('conversations', 8, 'leads_in_target', 2, 'awaiting_reply', 3, 'calls_booked', 1, 'lost', 3),
    'leads', jsonb_build_array(
      -- alta, in target, waiting for us: arrived from SeedDemo01 shared in DM
      jsonb_build_object(
        'username', 'marco.esempio', 'conversation_id', 'seed_ig_marco', 'name', 'Marco Esempio', 'age', '34',
        'priority', 'alta', 'target', 'si', 'stage', 'call proposta',
        'status', 'attende risposta · ha chiesto quando fare la call',
        'situation', 'Si allena a casa da due mesi con quello che ha, sempre gli stessi esercizi. Lavora in ufficio tutto il giorno.',
        'pain', 'Non vede cambiamenti nonostante l''impegno.',
        'next_action', 'Rispondi subito e proponi due momenti per la call.',
        'suggested_message', 'Perfetto Marco! Domani sera o giovedì in pausa pranzo: quale ti torna meglio? Così la fissiamo subito.',
        'suggested_message_alt', 'Se questa settimana è piena dimmi tu un giorno, ci organizziamo.',
        'alt_condition', 'Se risponde che è sempre di corsa',
        'needs_dany', '', 'flow', 'inbound',
        'source', 'reel del ' || (v_demo01->>'data') || ' condiviso in DM',
        'topics', jsonb_build_array('poco tempo', 'allenamento a casa', 'risultati fermi'),
        'last_from', 'lead',
        'last_message_at', to_char((v_adesso - interval '5 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'messages', jsonb_build_array(
          pg_temp.insight_msg('lead', v_adesso - interval '7 hours', '[reel condiviso] Ho visto questo: io a casa ho solo un tavolo e due zaini'),
          pg_temp.insight_msg('alpha', v_adesso - interval '6 hours 50 minutes', 'Ciao Marco! Il tavolo va benissimo per iniziare. Da quanto ti alleni a casa?'),
          pg_temp.insight_msg('lead', v_adesso - interval '6 hours', 'Da un paio di mesi, ma faccio sempre le stesse cose e non vedo cambiamenti. Ho 34 anni e sto in ufficio tutto il giorno.'),
          pg_temp.insight_msg('alpha', v_adesso - interval '5 hours 30 minutes', 'Capito, la vediamo spesso. Ti va se ne parliamo 20 minuti in call e ti faccio vedere come impostare le prossime settimane?'),
          pg_temp.insight_msg('lead', v_adesso - interval '5 hours', 'Sì dai, quando si potrebbe?')),
        'origine', v_demo01),
      -- alta, in target, call booked: a reply to a story
      jsonb_build_object(
        'username', 'luca_prova', 'conversation_id', 'seed_ig_luca', 'name', 'Luca Prova', 'age', '38',
        'priority', 'alta', 'target', 'si', 'stage', 'call prenotata',
        'status', 'call fissata per domani alle 18:30',
        'situation', 'Due figli piccoli, niente palestra: vuole tornare in forma allenandosi a casa.',
        'pain', 'Il tempo.',
        'next_action', 'Domani mattina mandagli il promemoria della call.',
        'suggested_message', 'Ciao Luca, ci sentiamo oggi alle 18:30 come d''accordo. Se ti si incastra qualcosa scrivimi pure.',
        'suggested_message_alt', '', 'alt_condition', '', 'needs_dany', '', 'flow', 'inbound',
        'source', 'risposta a una storia',
        'topics', jsonb_build_array('poco tempo', 'famiglia'),
        'last_from', 'alpha',
        'last_message_at', to_char((v_adesso - interval '3 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'messages', jsonb_build_array(
          pg_temp.insight_msg('lead', v_adesso - interval '20 hours', '[risposta a una storia] Anche io voglio tornare in forma come te'),
          pg_temp.insight_msg('alpha', v_adesso - interval '19 hours', 'Grande Luca! Raccontami un po'', cosa ti blocca adesso?'),
          pg_temp.insight_msg('lead', v_adesso - interval '18 hours', 'Il tempo, ho due figli piccoli e la palestra non ci sta.'),
          pg_temp.insight_msg('alpha', v_adesso - interval '17 hours', 'Ti capisco benissimo. Ti va una call veloce domani alle 18:30?'),
          pg_temp.insight_msg('lead', v_adesso - interval '4 hours', 'Perfetto, ci sono'),
          pg_temp.insight_msg('alpha', v_adesso - interval '3 hours', 'Fissata! A domani.')),
        'origine', jsonb_build_object('tipo', 'storia')),
      -- media, to verify, waiting for 15 hours: the caption keyword of SeedPost02; to recheck
      jsonb_build_object(
        'username', 'andrea.demo', 'conversation_id', 'seed_ig_andrea', 'name', 'Andrea Demo', 'age', '',
        'priority', 'media', 'target', 'da verificare', 'stage', 'qualificazione',
        'status', 'attende risposta · ha appena iniziato',
        'situation', 'Ha scritto la parola chiave del reel sugli addominali e ha appena iniziato ad allenarsi.',
        'pain', 'Non sa da dove partire.',
        'next_action', 'Chiedi età e routine per capire se è in target.',
        'suggested_message', 'Ottimo che tu abbia iniziato! Quanti anni hai e quanto tempo riesci a dedicare in settimana?',
        'suggested_message_alt', '', 'alt_condition', '', 'needs_dany', '', 'flow', 'inbound',
        'source', 'parola chiave «ADDOMINALI»',
        'topics', jsonb_build_array('addominali', 'principiante'),
        'last_from', 'lead',
        'last_message_at', to_char((v_adesso - interval '15 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'messages', jsonb_build_array(
          pg_temp.insight_msg('lead', v_adesso - interval '16 hours', 'ADDOMINALI'),
          pg_temp.insight_msg('alpha', v_adesso - interval '15 hours 40 minutes', 'Ciao Andrea! Ecco la guida. Tu da quanto ti alleni?'),
          pg_temp.insight_msg('lead', v_adesso - interval '15 hours', 'In realtà ho appena iniziato, non so bene da dove partire')),
        'da_ricontrollare', 'Il messaggio suggerito citava un prezzo: è stato tolto, rileggilo prima di mandarlo.',
        'origine', v_post02),
      -- bassa, not in target, lost
      jsonb_build_object(
        'username', 'paolo.inventato', 'conversation_id', 'seed_ig_paolo', 'name', 'Paolo Inventato', 'age', '',
        'priority', 'bassa', 'target', 'no', 'stage', 'perso',
        'status', 'preferisce la palestra sotto casa',
        'situation', 'Ha chiesto il prezzo e ha chiuso subito.',
        'pain', '', 'next_action', 'Nessuna: la chat è chiusa con un saluto.',
        'suggested_message', '', 'suggested_message_alt', '', 'alt_condition', '', 'needs_dany', '', 'flow', 'inbound',
        'source', '', 'topics', jsonb_build_array('prezzo'),
        'last_from', 'alpha',
        'last_message_at', to_char((v_adesso - interval '10 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'messages', jsonb_build_array(
          pg_temp.insight_msg('lead', v_adesso - interval '12 hours', 'Quanto costa?'),
          pg_temp.insight_msg('alpha', v_adesso - interval '11 hours', 'Dipende da cosa ti serve: raccontami un po'' di te, così capisco se fa per te.'),
          pg_temp.insight_msg('lead', v_adesso - interval '10 hours 30 minutes', 'Lascia stare, preferisco la palestra sotto casa'),
          pg_temp.insight_msg('alpha', v_adesso - interval '10 hours', 'Nessun problema Paolo, se cambi idea sono qui. Buon allenamento!'))),
      -- media, out of the funnel: the lead wrote last, but it is not a wait
      jsonb_build_object(
        'username', 'giorgio_fittizio', 'conversation_id', 'seed_ig_giorgio', 'name', 'Giorgio Fittizio', 'age', '',
        'priority', 'media', 'target', 'no', 'stage', 'uscita',
        'status', 'propone una collaborazione',
        'situation', 'È un personal trainer e propone una collaborazione.',
        'pain', '', 'next_action', 'Rispondi con un grazie e chiudi: non è un lead.',
        'suggested_message', 'Grazie Giorgio, per ora non cerco collaborazioni. Buon lavoro!',
        'suggested_message_alt', '', 'alt_condition', '', 'needs_dany', '', 'flow', 'outbound',
        'source', '', 'topics', jsonb_build_array('collaborazione'),
        'last_from', 'lead',
        'last_message_at', to_char((v_adesso - interval '2 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'messages', jsonb_build_array(
          pg_temp.insight_msg('alpha', v_adesso - interval '8 hours', 'Ciao Giorgio, grazie per il follow! Ti alleni già?'),
          pg_temp.insight_msg('lead', v_adesso - interval '2 hours', 'Faccio il personal trainer anche io, ti va una collaborazione?'))),
      -- a placeholder card: the analysis of this chat failed
      jsonb_build_object(
        'username', 'stefano.segnaposto', 'conversation_id', 'seed_ig_stefano', 'name', 'Stefano Segnaposto', 'age', '',
        'priority', 'media', 'target', 'da verificare', 'stage', '',
        'status', 'attende risposta · analisi non disponibile', 'situation', '', 'pain', '',
        'next_action', 'Apri la chat: questa conversazione non è stata analizzata.',
        'suggested_message', '', 'suggested_message_alt', '', 'alt_condition', '', 'needs_dany', '', 'flow', '',
        'source', '', 'topics', '[]'::jsonb,
        'last_from', 'lead',
        'last_message_at', to_char((v_adesso - interval '1 hour') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'messages', jsonb_build_array(
          pg_temp.insight_msg('lead', v_adesso - interval '1 hour 20 minutes', 'Ciao, ho visto il video sulla cena'),
          pg_temp.insight_msg('lead', v_adesso - interval '1 hour', 'Come funziona il percorso?')),
        'analisi_mancante', true),
      -- under 14: no messages, the fields blanked (D25)
      jsonb_build_object(
        'username', 'ragazzo.esempio13', 'conversation_id', 'seed_ig_minore', 'name', 'Ragazzo Esempio', 'age', '13',
        'priority', 'alta', 'target', 'no', 'stage', 'uscita',
        'status', 'minore sotto i 14 anni',
        'situation', 'Minore sotto i 14 anni.', 'pain', '',
        'next_action', 'Chiudi con calore verso i contenuti gratuiti.',
        'suggested_message', 'Grazie per avermi scritto! Per ora segui i contenuti gratuiti del profilo: trovi tanti esercizi da fare a casa.',
        'suggested_message_alt', '', 'alt_condition', '',
        'needs_dany', 'Minore sotto i 14 anni: chiusura calorosa e flag a Dany, come da istruzioni setter.',
        'flow', 'inbound', 'source', '', 'topics', '[]'::jsonb,
        'last_from', 'lead',
        'last_message_at', to_char((v_adesso - interval '30 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'messages', '[]'::jsonb,
        'minore_14', true)),
    'reactivate', jsonb_build_array(
      jsonb_build_object(
        'username', 'simone.attesa', 'conversation_id', 'seed_ig_simone', 'name', 'Simone Attesa', 'age', '29',
        'priority', 'media', 'target', 'si', 'stage', 'call proposta', 'status', 'non ha più risposto alla proposta di call',
        'situation', 'Interessato, poi sparito dopo la proposta di call.', 'pain', 'Pancia e poca energia.',
        'next_action', 'Primo messaggio di riattivazione.',
        'suggested_message', 'Ciao Simone, tutto bene? Ti avevo proposto due minuti di call: se ti va, ci sono questa settimana.',
        'suggested_message_alt', '', 'alt_condition', '', 'needs_dany', '', 'flow', 'inbound', 'source', '',
        'topics', jsonb_build_array('pancia', 'energia'), 'last_from', 'alpha',
        'last_message_at', to_char((v_adesso - interval '3 days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'messages', jsonb_build_array(
          pg_temp.insight_msg('lead', v_adesso - interval '3 days 2 hours', 'Mi piacerebbe togliere un po'' di pancia, mi sento sempre stanco'),
          pg_temp.insight_msg('alpha', v_adesso - interval '3 days', 'Ti capisco. Ti va se ne parliamo in una call veloce?')),
        'days_silent', 3, 'step', 1),
      jsonb_build_object(
        'username', 'fabio.silenzio', 'conversation_id', 'seed_ig_fabio', 'name', 'Fabio Silenzio', 'age', '',
        'priority', 'bassa', 'target', 'da verificare', 'stage', 'qualificazione', 'status', 'in silenzio da 6 giorni',
        'situation', 'Ha chiesto informazioni sul percorso e non ha più risposto.', 'pain', '',
        'next_action', 'Secondo messaggio di riattivazione.',
        'suggested_message', 'Ciao Fabio, ti scrivo l''ultima volta questa settimana: se vuoi riprendere il discorso, sono qui.',
        'suggested_message_alt', '', 'alt_condition', '', 'needs_dany', '', 'flow', 'inbound', 'source', '',
        'topics', jsonb_build_array('informazioni'), 'last_from', 'alpha',
        'last_message_at', to_char((v_adesso - interval '6 days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'messages', jsonb_build_array(
          pg_temp.insight_msg('lead', v_adesso - interval '6 days 1 hour', 'Come funziona il percorso?'),
          pg_temp.insight_msg('alpha', v_adesso - interval '6 days', 'Ciao Fabio! Prima dimmi un po'' di te: quanti anni hai e come ti alleni oggi?')),
        'days_silent', 6, 'step', 2),
      jsonb_build_object(
        'username', 'davide.lontano', 'conversation_id', 'seed_ig_davide', 'name', 'Davide Lontano', 'age', '41',
        'priority', 'bassa', 'target', 'si', 'stage', 'call proposta', 'status', 'in silenzio da 12 giorni',
        'situation', 'Lavora su turni, aveva detto di riscrivere dopo le ferie.', 'pain', 'Mal di schiena.',
        'next_action', 'Ultimo messaggio di riattivazione.',
        'suggested_message', 'Ciao Davide, com''è andata con i turni? Se la schiena ti dà ancora fastidio, ne parliamo quando vuoi.',
        'suggested_message_alt', '', 'alt_condition', '', 'needs_dany', '', 'flow', 'outbound', 'source', '',
        'topics', jsonb_build_array('mal di schiena', 'turni'), 'last_from', 'alpha',
        'last_message_at', to_char((v_adesso - interval '12 days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'messages', jsonb_build_array(
          pg_temp.insight_msg('alpha', v_adesso - interval '13 days', 'Ciao Davide, grazie per il follow! Ti alleni già?'),
          pg_temp.insight_msg('lead', v_adesso - interval '12 days 3 hours', 'Ho il mal di schiena e lavoro su turni, ti riscrivo dopo le ferie'),
          pg_temp.insight_msg('alpha', v_adesso - interval '12 days', 'Certo, a presto!')),
        'days_silent', 12, 'step', 3)),
    'objections', jsonb_build_array(
      jsonb_build_object('username', 'paolo.inventato', 'name', 'Paolo Inventato',
        'text', 'Preferisco la palestra sotto casa.',
        'suggested_reply', 'Ha senso se ci vai davvero: il punto è avere un piano che regga anche le settimane piene.'),
      jsonb_build_object('username', 'marco.esempio', 'name', 'Marco Esempio',
        'text', 'La sera sono sempre stanco.',
        'suggested_reply', 'Bastano 30 minuti, anche al mattino: in call vediamo insieme quando ti torna.')),
    'content', jsonb_build_object(
      'period', 'ultimi 14 giorni', 'based_on', 23, 'note', '',
      'themes', jsonb_build_array(
        jsonb_build_object('theme', 'Poco tempo per allenarsi', 'count', 6, 'target_count', 4, 'calls', 2,
          'trend', 'in crescita', 'insight', 'Il tema più frequente tra i lead in target: lavoro e famiglia.'),
        jsonb_build_object('theme', 'Allenarsi senza attrezzi', 'count', 4, 'target_count', 3, 'calls', 1,
          'trend', 'stabile', 'insight', 'Chi arriva dai reel sugli attrezzi di casa è già convinto del corpo libero.'),
        jsonb_build_object('theme', 'Addominali e pancia', 'count', 3, 'target_count', 1, 'calls', 0,
          'trend', 'in calo', 'insight', 'Porta molti DM ma pochi lead in target.')),
      'posts', jsonb_build_array(
        pg_temp.insight_post('SeedPost04', 0, 0, 0, 'mantenere', 'Buone interazioni, ancora nessun DM: lascialo girare.', null, null, null),
        pg_temp.insight_post('SeedPost03', 0, 0, 0, 'cambiare', 'Nessun DM: la call to action non chiede di scrivere.', null, null, null),
        pg_temp.insight_post('SeedPost02', 3, 1, 1, 'mantenere', 'La parola chiave porta DM, ma pochi in target.', null, null, null),
        pg_temp.insight_post('SeedDemo01', 4, 3, 1, 'spingere', 'Il contenuto con più lead in target: rilancialo nelle storie.', 4120, 85, 31)),
      'keep', jsonb_build_array('I reel con attrezzi di casa: portano lead in target.'),
      'change', jsonb_build_array('Nei reel sugli addominali chiedi l''età nella call to action.'),
      'boost', jsonb_build_array('Rilancia il reel della schiena senza sbarra nelle storie.'),
      'setting_tips', jsonb_build_array('Chi condivide un reel risponde meglio a una domanda sul reel stesso.'),
      'ideas', jsonb_build_array(
        jsonb_build_object('hook', 'Ho solo un tavolo e due zaini: ecco cosa ci faccio', 'format', 'Reel', 'why', 'Le parole di un lead in target.'),
        jsonb_build_object('hook', '30 minuti con due figli piccoli', 'format', 'Reel', 'why', 'Il tema più frequente.'),
        jsonb_build_object('hook', 'Perché fai sempre gli stessi esercizi', 'format', 'Carosello', 'why', 'Il dolore di chi è fermo.'),
        jsonb_build_object('hook', 'La schiena a 40 anni', 'format', 'Reel', 'why', 'Chiesto da due lead.'),
        jsonb_build_object('hook', 'Allenarsi in pausa pranzo', 'format', 'Storie', 'why', 'Chi lavora in ufficio.')),
      'storie', jsonb_build_object('dm', 1, 'target', 1)),
    'non_leads', jsonb_build_array(
      jsonb_build_object('username', 'amico.inventato', 'name', 'Amico Inventato',
        'reason', 'Amico di Dany: nessun interesse per il percorso.')),
    'agenda', jsonb_build_array(
      jsonb_build_object('call_id', '40400000-0000-4000-8000-0000000000a1', 'day', 'oggi', 'time', '12:00',
        'name', 'Matteo Esempio', 'username', 'matteo.esempio', 'meet_link', '', 'status', 'confermata', 'note', '',
        'suggested_message', 'Ciao Matteo, ci vediamo alle 12:00: qualche minuto prima ti mando il link.'),
      jsonb_build_object('call_id', '40400000-0000-4000-8000-0000000000a2', 'day', 'oggi', 'time', '21:00',
        'name', 'Riccardo Prova', 'username', 'riccardo.prova', 'meet_link', '', 'status', 'a rischio', 'note', '',
        -- the final check removed the reminder: the reason is shown where it would be
        'suggested_message', '',
        'da_ricontrollare', 'Messaggio non mostrato: link diverso dal Calendly. Scrivilo a mano.'),
      jsonb_build_object('call_id', '40400000-0000-4000-8000-0000000000a3', 'day', 'domani', 'time', '18:30',
        'name', 'Luca Prova', 'username', 'luca_prova', 'meet_link', '', 'status', 'promemoria da inviare', 'note', '',
        'suggested_message', 'Ciao Luca, ci sentiamo domani alle 18:30 come d''accordo.')),
    'show_up', jsonb_build_array(
      jsonb_build_object('call_id', '40400000-0000-4000-8000-0000000000b1', 'day', 'ieri', 'time', '19:00',
        'name', 'Nicola Assente', 'username', 'nicola.assente', 'outcome', 'no-show', 'note', '',
        'suggested_message', 'Ciao Nicola, ieri non ci siamo visti: tutto bene? Se vuoi la rifissiamo questa settimana.'),
      jsonb_build_object('call_id', '40400000-0000-4000-8000-0000000000b2', 'day', 'ieri', 'time', '17:30',
        'name', 'Enrico Presente', 'username', 'enrico.presente', 'outcome', 'presentato', 'note', '',
        'suggested_message', '')),
    'escluse', 2,
    'stato', 'parziale');

  -- -------------------------------------------------------------------------
  -- Yesterday, Instagram (complete)
  -- -------------------------------------------------------------------------
  v_ig_ieri := jsonb_build_object(
    'date', to_char(v_oggi - 1, 'YYYY-MM-DD'),
    'generated_at', to_char((v_ieri_alle - interval '15 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'window_hours', 24,
    'headline', 'Giornata tranquilla: un lead in target da seguire, Tommaso aspetta la proposta della call.',
    'summary', jsonb_build_object('conversations', 3, 'leads_in_target', 1, 'awaiting_reply', 1, 'calls_booked', 0, 'lost', 1),
    'leads', jsonb_build_array(
      jsonb_build_object(
        'username', 'tommaso.ieri', 'conversation_id', 'seed_ig_tommaso', 'name', 'Tommaso Ieri', 'age', '31',
        'priority', 'alta', 'target', 'si', 'stage', 'qualificazione',
        'status', 'attende risposta · racconta la sua routine',
        'situation', 'Si allena a casa la sera, vuole più forza.', 'pain', 'Si sente debole.',
        'next_action', 'Proponi la call.',
        'suggested_message', 'Ti va se ne parliamo in una call di 20 minuti? Ti faccio vedere come lo imposterei.',
        'suggested_message_alt', '', 'alt_condition', '', 'needs_dany', '', 'flow', 'inbound', 'source', '',
        'topics', jsonb_build_array('forza'), 'last_from', 'lead',
        'last_message_at', to_char((v_ieri_alle - interval '2 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'messages', jsonb_build_array(
          pg_temp.insight_msg('lead', v_ieri_alle - interval '3 hours', 'Ciao, come si diventa più forti a corpo libero?'),
          pg_temp.insight_msg('alpha', v_ieri_alle - interval '2 hours 30 minutes', 'Ciao Tommaso! Come ti alleni adesso?'),
          pg_temp.insight_msg('lead', v_ieri_alle - interval '2 hours', 'La sera, piegamenti e squat, ma sono fermo da mesi'))),
      jsonb_build_object(
        'username', 'filippo.ieri', 'conversation_id', 'seed_ig_filippo', 'name', 'Filippo Ieri', 'age', '',
        'priority', 'media', 'target', 'da verificare', 'stage', 'apertura',
        'status', 'gli abbiamo scritto noi', 'situation', 'Ha messo like a tre reel.', 'pain', '',
        'next_action', 'Aspetta la risposta.', 'suggested_message', '',
        'suggested_message_alt', '', 'alt_condition', '', 'needs_dany', '', 'flow', 'outbound', 'source', '',
        'topics', '[]'::jsonb, 'last_from', 'alpha',
        'last_message_at', to_char((v_ieri_alle - interval '5 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'messages', jsonb_build_array(
          pg_temp.insight_msg('alpha', v_ieri_alle - interval '5 hours', 'Ciao Filippo, grazie per il follow! Ti alleni già?'))),
      jsonb_build_object(
        'username', 'ivan.ieri', 'conversation_id', 'seed_ig_ivan', 'name', 'Ivan Ieri', 'age', '',
        'priority', 'bassa', 'target', 'no', 'stage', 'perso',
        'status', 'non interessato', 'situation', 'Cercava solo una scheda gratis.', 'pain', '',
        'next_action', 'Nessuna.', 'suggested_message', '',
        'suggested_message_alt', '', 'alt_condition', '', 'needs_dany', '', 'flow', 'inbound', 'source', '',
        'topics', jsonb_build_array('scheda gratis'), 'last_from', 'alpha',
        'last_message_at', to_char((v_ieri_alle - interval '8 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'messages', jsonb_build_array(
          pg_temp.insight_msg('lead', v_ieri_alle - interval '9 hours', 'Mi mandi una scheda gratis?'),
          pg_temp.insight_msg('alpha', v_ieri_alle - interval '8 hours', 'Sul profilo trovi tanti esercizi gratuiti, parti da lì!')))),
    'reactivate', jsonb_build_array(
      jsonb_build_object(
        'username', 'simone.attesa', 'conversation_id', 'seed_ig_simone', 'name', 'Simone Attesa', 'age', '29',
        'priority', 'media', 'target', 'si', 'stage', 'call proposta', 'status', 'non ha più risposto alla proposta di call',
        'situation', 'Interessato, poi sparito dopo la proposta di call.', 'pain', 'Pancia e poca energia.',
        'next_action', 'Primo messaggio di riattivazione.',
        'suggested_message', 'Ciao Simone, tutto bene? Se ti va, la call la facciamo quando vuoi.',
        'suggested_message_alt', '', 'alt_condition', '', 'needs_dany', '', 'flow', 'inbound', 'source', '',
        'topics', jsonb_build_array('pancia'), 'last_from', 'alpha',
        'last_message_at', to_char((v_adesso - interval '3 days') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'messages', jsonb_build_array(
          pg_temp.insight_msg('alpha', v_adesso - interval '3 days', 'Ti capisco. Ti va se ne parliamo in una call veloce?')),
        'days_silent', 2, 'step', 1)),
    'objections', '[]'::jsonb,
    'content', jsonb_build_object(
      'period', 'ultimi 14 giorni', 'based_on', 19, 'note', '',
      'themes', jsonb_build_array(
        jsonb_build_object('theme', 'Forza a corpo libero', 'count', 3, 'target_count', 2, 'calls', 1,
          'trend', 'stabile', 'insight', 'Chi chiede di forza è spesso in target.')),
      'posts', jsonb_build_array(
        pg_temp.insight_post('SeedPost02', 2, 1, 1, 'mantenere', 'Porta DM costanti.', null, null, null),
        pg_temp.insight_post('SeedDemo01', 3, 2, 1, 'spingere', 'Il più forte delle ultime due settimane.', 4010, 80, 29)),
      'keep', jsonb_build_array('Le parole chiave in caption.'),
      'change', '[]'::jsonb,
      'boost', jsonb_build_array('Più reel sulla forza.'),
      'setting_tips', '[]'::jsonb,
      'ideas', jsonb_build_array(
        jsonb_build_object('hook', 'Fermo da mesi con piegamenti e squat?', 'format', 'Reel', 'why', 'Le parole di Tommaso.'))),
    'non_leads', '[]'::jsonb,
    'agenda', jsonb_build_array(
      jsonb_build_object('call_id', '40400000-0000-4000-8000-0000000000b1', 'day', 'oggi', 'time', '19:00',
        'name', 'Nicola Assente', 'username', 'nicola.assente', 'meet_link', '', 'status', 'promemoria da inviare', 'note', '',
        'suggested_message', 'Ciao Nicola, ci vediamo stasera alle 19:00!')),
    'show_up', '[]'::jsonb,
    'escluse', 1,
    'stato', 'completo');

  -- -------------------------------------------------------------------------
  -- Today and yesterday, Messenger (complete, without posts)
  -- -------------------------------------------------------------------------
  v_fb_oggi := jsonb_build_object(
    'date', to_char(v_oggi, 'YYYY-MM-DD'),
    'generated_at', to_char((v_adesso - interval '25 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'window_hours', 24,
    'headline', 'Su Messenger un lead in target aspetta una risposta da stamattina.',
    'summary', jsonb_build_object('conversations', 3, 'leads_in_target', 1, 'awaiting_reply', 1, 'calls_booked', 0, 'lost', 0),
    'leads', jsonb_build_array(
      jsonb_build_object(
        'user_id', '7100000000000001', 'conversation_id', 'seed_fb_alessandro', 'name', 'Alessandro Messenger', 'age', '45',
        'priority', 'alta', 'target', 'si', 'stage', 'qualificazione',
        'status', 'attende risposta · chiede come funziona',
        'situation', 'Ha 45 anni, vuole rimettersi in forma dopo un periodo fermo.', 'pain', 'Il fiato corto sulle scale.',
        'next_action', 'Rispondi e chiedi della sua giornata tipo.',
        'suggested_message', 'Ciao Alessandro! Raccontami com''è una tua giornata tipo, così capisco quanto tempo hai.',
        'suggested_message_alt', '', 'alt_condition', '', 'needs_dany', '', 'flow', 'inbound', 'source', '',
        'topics', jsonb_build_array('ripartire', 'fiato'), 'last_from', 'lead',
        'last_message_at', to_char((v_adesso - interval '6 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'messages', jsonb_build_array(
          pg_temp.insight_msg('lead', v_adesso - interval '6 hours 10 minutes', 'Buongiorno, ho 45 anni e sono fermo da un po'''),
          pg_temp.insight_msg('lead', v_adesso - interval '6 hours', 'Come funziona il vostro percorso?'))),
      jsonb_build_object(
        'user_id', '7100000000000002', 'conversation_id', 'seed_fb_bruno', 'name', 'Bruno Messenger', 'age', '',
        'priority', 'media', 'target', 'da verificare', 'stage', 'apertura',
        'status', 'gli abbiamo risposto', 'situation', 'Ha chiesto un consiglio sugli esercizi.', 'pain', '',
        'next_action', 'Aspetta la risposta.', 'suggested_message', '',
        'suggested_message_alt', '', 'alt_condition', '', 'needs_dany', '', 'flow', 'inbound', 'source', '',
        'topics', jsonb_build_array('esercizi'), 'last_from', 'alpha',
        'last_message_at', to_char((v_adesso - interval '9 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'messages', jsonb_build_array(
          pg_temp.insight_msg('lead', v_adesso - interval '10 hours', 'Che esercizi consigli per iniziare?'),
          pg_temp.insight_msg('alpha', v_adesso - interval '9 hours', 'Ciao Bruno! Dipende da dove parti: ti alleni già un po''?')))),
    'reactivate', '[]'::jsonb,
    'objections', '[]'::jsonb,
    'content', jsonb_build_object(
      'period', 'ultimi 14 giorni', 'based_on', 4, 'note', '',
      'themes', jsonb_build_array(
        jsonb_build_object('theme', 'Ripartire dopo i 40', 'count', 2, 'target_count', 1, 'calls', 0,
          'trend', 'stabile', 'insight', 'Su Messenger scrivono persone più grandi.')),
      'posts', '[]'::jsonb,
      'keep', '[]'::jsonb, 'change', '[]'::jsonb, 'boost', '[]'::jsonb,
      'setting_tips', jsonb_build_array('Su Messenger rispondi entro la mattina: chi scrive lì aspetta di più.'),
      'ideas', '[]'::jsonb),
    'non_leads', jsonb_build_array(
      jsonb_build_object('user_id', '7100000000000003', 'name', 'Servizio Inventato',
        'reason', 'Messaggio automatico di un servizio.')),
    'escluse', 0,
    'stato', 'completo');

  v_fb_ieri := jsonb_build_object(
    'date', to_char(v_oggi - 1, 'YYYY-MM-DD'),
    'generated_at', to_char((v_ieri_alle - interval '15 minutes') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
    'window_hours', 24,
    'headline', 'Su Messenger una sola chat, già chiusa.',
    'summary', jsonb_build_object('conversations', 1, 'leads_in_target', 0, 'awaiting_reply', 0, 'calls_booked', 0, 'lost', 1),
    'leads', jsonb_build_array(
      jsonb_build_object(
        'user_id', '7100000000000004', 'conversation_id', 'seed_fb_carlo', 'name', 'Carlo Messenger', 'age', '',
        'priority', 'bassa', 'target', 'no', 'stage', 'perso',
        'status', 'cercava una palestra', 'situation', 'Cercava una palestra in città.', 'pain', '',
        'next_action', 'Nessuna.', 'suggested_message', '',
        'suggested_message_alt', '', 'alt_condition', '', 'needs_dany', '', 'flow', 'inbound', 'source', '',
        'topics', jsonb_build_array('palestra'), 'last_from', 'alpha',
        'last_message_at', to_char((v_ieri_alle - interval '4 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
        'messages', jsonb_build_array(
          pg_temp.insight_msg('lead', v_ieri_alle - interval '5 hours', 'Avete una palestra a Milano?'),
          pg_temp.insight_msg('alpha', v_ieri_alle - interval '4 hours', 'Ciao Carlo, il percorso è online, ti alleni a casa.')))),
    'reactivate', '[]'::jsonb,
    'objections', '[]'::jsonb,
    'content', jsonb_build_object(
      'period', 'ultimi 14 giorni', 'based_on', 2, 'note', '', 'themes', '[]'::jsonb, 'posts', '[]'::jsonb,
      'keep', '[]'::jsonb, 'change', '[]'::jsonb, 'boost', '[]'::jsonb, 'setting_tips', '[]'::jsonb, 'ideas', '[]'::jsonb),
    'non_leads', '[]'::jsonb,
    'escluse', 0,
    'stato', 'completo');

  insert into public.insight_recap (giorno, canale, esecuzione_id, generato_il, stato, dati) values
    (v_oggi, 'instagram', v_esecuzione_oggi, v_adesso - interval '25 minutes', 'parziale', v_ig_oggi),
    (v_oggi - 1, 'instagram', v_esecuzione_ieri, v_ieri_alle - interval '15 minutes', 'completo', v_ig_ieri),
    (v_oggi, 'messenger', v_esecuzione_oggi, v_adesso - interval '25 minutes', 'completo', v_fb_oggi),
    (v_oggi - 1, 'messenger', v_esecuzione_ieri, v_ieri_alle - interval '15 minutes', 'completo', v_fb_ieri)
  on conflict (giorno, canale) do nothing;

  -- one lead of today already done
  insert into public.insight_fatto (giorno, canale, chiave, fatto)
  values (v_oggi, 'instagram', 'luca_prova', true)
  on conflict (giorno, canale, chiave) do nothing;

  -- -------------------------------------------------------------------------
  -- The counts per post and arrival day (the same numbers as today's posts)
  -- -------------------------------------------------------------------------
  insert into public.instagram_contenuti_dm (shortcode, giorno, dm, lead_in_target, call_prenotate, dm_certi)
  select x.shortcode, v_oggi + x.giorni, x.dm, x.target, x.call, x.certi
  from (values
    ('SeedDemo01', -11, 3, 2, 1, 2),
    ('SeedDemo01', 0, 1, 1, 0, 1),
    ('SeedPost02', -8, 2, 1, 1, 1),
    ('SeedPost02', 0, 1, 0, 0, 1)
  ) as x(shortcode, giorni, dm, target, call, certi)
  join public.instagram_contenuti i on i.shortcode = x.shortcode
  on conflict (shortcode, giorno) do nothing;
end;
$$;

drop function pg_temp.insight_msg(text, timestamptz, text);
drop function pg_temp.insight_post(text, integer, integer, integer, text, text, integer, integer, integer);
