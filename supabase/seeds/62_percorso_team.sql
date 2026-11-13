-- Demo data for the work of the team on the onboarding (1.81.0, docs/onboarding/rilascio-b.md, B2): a third
-- invented client, registered like the ones of 61_percorso.sql, who has done the welcome, the rules and the
-- questionnaire (invented answers, no real health data) and has booked his onboarding call by hand for the day
-- after tomorrow: the call waits for the coach's confirmation. Marco Coach is his coach in the onboarding (the
-- seed's coach), Dany his responsible, no reviewer. A sign-in account for the development login (password
-- alpha1234: an insert, the trigger of the passwords looks at updates only):
--   giorgio.neri@example.test  active client, his call to confirm
-- Written without a session (nobody's name in the log). Invented people only, dates relative to today,
-- idempotent on the fixed user id.
do $$
declare
  v_admin constant uuid := '11111111-1111-4111-8111-111111111111';
  v_coach constant uuid := '44444444-4444-4444-8444-444444444444';
  v_prodotto constant uuid := 'aaaaaaa1-0000-4000-8000-000000000002';
  v_cliente constant uuid := '0b0b0000-0000-4000-8000-000000000003';
  v_vendita constant uuid := '0b0b0000-0000-4000-8000-000000000013';
  v_invito constant uuid := '0b0b0000-0000-4000-8000-000000000023';
  v_utente constant uuid := '0b0b0000-0000-4000-8000-000000000033';
  v_email constant text := 'giorgio.neri@example.test';
  v_video uuid;
begin
  if exists (select 1 from auth.users where id = v_utente)
     or not exists (select 1 from public.profiles where id in (v_admin, v_coach) having count(*) = 2)
     or not exists (select 1 from public.products where id = v_prodotto) then
    return;
  end if;

  insert into public.clients (id, nome, cognome, email, telefono, instagram_handle, fonte, closer_id, created_by, created_at)
  values (v_cliente, 'Giorgio', 'Neri', v_email, null, '@giorgio_neri', 'dm_outbound', v_admin, v_admin, now() - interval '6 days')
  on conflict (id) do nothing;

  insert into public.sales (id, client_id, product_id, tipo, closer_id, data_vendita, data_inizio, valore_contratto,
    numero_rate, created_by, created_at)
  values (v_vendita, v_cliente, v_prodotto, 'nuovo', v_admin, public.oggi() - 6, public.oggi() + 1, 2400.00, 3, v_admin,
          now() - interval '6 days')
  on conflict (id) do nothing;

  insert into public.onboarding_incarichi (client_id, coach_id, revisore_id, responsabile_id)
  values (v_cliente, v_coach, null, v_admin)
  on conflict (client_id) do nothing;

  insert into public.clienti_telegram (client_id, username)
  values (v_cliente, 'giorgio_neri')
  on conflict (client_id) do nothing;

  -- the start: path, steps and project come from the invite's trigger
  insert into public.onboarding_inviti (id, client_id, sale_id, slug, token_hash, email, created_by, created_at)
  values (v_invito, v_cliente, v_vendita, public.onboarding_slug('Giorgio', 'Neri'),
          encode(sha256(convert_to(md5('seed percorso Giorgio') || md5('seed percorso bis Giorgio'), 'UTF8')), 'hex'),
          v_email, v_admin, now() - interval '6 days');

  -- a test invite, the payment confirmed by hand: active; the coach joins the project
  update public.onboarding_inviti set prova = true where id = v_invito;
  update public.onboarding_inviti set stato = 'attivo', attivato_da = 'manuale' where id = v_invito;

  -- the registration verified, then the user with the reserved id (the client's branch of handle_new_user)
  insert into public.onboarding_registrazioni (invito_id, utente_id, chiave_hash, chiave_scade_il, email, email_provate,
    verificato_il)
  values (v_invito, v_utente, encode(sha256(convert_to('seed chiave Giorgio', 'UTF8')), 'hex'),
          now() + interval '30 minutes', v_email, array[v_email], now());

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, email_change, email_change_token_new, recovery_token
  )
  values (
    '00000000-0000-0000-0000-000000000000', v_utente, 'authenticated', 'authenticated', v_email,
    extensions.crypt('alpha1234', extensions.gen_salt('bf')), now(),
    '{"provider":"email","providers":["email"],"tipo":"cliente"}'::jsonb, '{}'::jsonb,
    now(), now(), '', '', '', ''
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), v_utente, v_utente::text,
          jsonb_build_object('sub', v_utente::text, 'email', v_email, 'email_verified', true),
          'email', now(), now(), now())
  on conflict do nothing;

  -- the welcome (the video seen in full), the rules with the consent
  select b.id into v_video
  from public.contenuti_blocchi b
  where b.versione_flusso = 1 and b.pagina = 'passo' and b.passo = 'benvenuto' and b.tipo = 'video'
  order by b.ordine limit 1;
  if v_video is not null then
    insert into public.onboarding_video_visti (client_id, blocco_id, durata, visti, visto_il)
    values (v_cliente, v_video, 180, repeat('1', 180)::varbit, now() - interval '3 days')
    on conflict do nothing;
  end if;

  insert into public.clienti_consensi (client_id, tipo, versione, dato_il)
  select v_cliente, 'salute', t.versione, now() - interval '3 days'
  from public.clienti_consensi_testi t where t.tipo = 'salute' and t.in_vigore;

  -- the questionnaire sent: invented answers, nothing true about anybody's health
  insert into public.onboarding_questionari (client_id, risposte, versione, schermata, inviato_il, created_at)
  values (v_cliente, jsonb_build_object(
            'nome_cognome', 'Giorgio Neri',
            'email', v_email,
            'telefono', '+39 333 000 0033',
            'altezza_peso', jsonb_build_object('altezza', 181, 'peso', 82),
            'data_nascita', '1990-03-21',
            'occupazione', 'Commerciale, spesso in macchina',
            'storia_allenamento', 'Calcetto il giovedì da dieci anni, palestra a periodi.',
            'giorni_settimana', 4,
            'minuti_giorno', '40_60',
            'infortuni', 'Nessuno',
            'attrezzatura', 'Una sbarra alla porta e due elastici.',
            'massimali', jsonb_build_object('piegamenti', 20, 'trazioni', 4, 'dip', 'non_lo_so'),
            'esercizi_difficolta', 'Le trazioni mi riescono poco, i piegamenti abbastanza bene.',
            'importanza_tecnica', 'Molto: voglio imparare a fare bene gli esercizi.',
            'ore_sonno', 'Sette ore',
            'livello_attivita', 'attivo',
            'organizzazione_giornata', 'Lavoro dalle 9 alle 18, mi alleno la sera.',
            'seguito_alimentazione', 'no',
            'conoscenza_alimentazione', 'Le basi, ma mangio spesso fuori.',
            'cattive_abitudini', jsonb_build_object('scelte', jsonb_build_array('stimolanti'), 'altro', ''),
            'obiettivo_principale', 'Fare 10 trazioni pulite.',
            'perche_noi', 'Mi alleno a casa e voglio una guida.',
            'obiettivi_3_6_mesi', 'Più forza e qualche chilo in meno sulla pancia.',
            'successo', 'Allenarmi con costanza senza saltare settimane.',
            'pronto', 'si'
          ), 5, 4, now() - interval '2 days', now() - interval '3 days')
  on conflict (client_id) do nothing;

  update public.onboarding_passi
  set stato = 'fatto', iniziato_il = now() - interval '3 days', completato_il = now() - interval '3 days'
  where client_id = v_cliente and passo in ('benvenuto', 'regole');
  update public.onboarding_passi
  set stato = 'fatto', iniziato_il = now() - interval '3 days', inviato_il = now() - interval '2 days',
      completato_il = now() - interval '2 days'
  where client_id = v_cliente and passo = 'questionario';
  perform public.onboarding_sblocca(v_cliente);

  -- the call booked by hand for the day after tomorrow at 18:00 (Rome): it waits for the coach
  insert into public.clienti_call (client_id, tipo, inizio, stato, coach_id, created_at)
  values (v_cliente, 'onboarding', (public.oggi() + 2 + time '18:00') at time zone 'Europe/Rome', 'da_confermare',
          v_coach, now() - interval '1 day');
  update public.onboarding_passi
  set stato = 'inviato', iniziato_il = now() - interval '1 day', inviato_il = now() - interval '1 day'
  where client_id = v_cliente and passo = 'prenotazione';

  -- the notifications would change the demo of the notification center (55_notifiche.sql)
  delete from public.notifiche where chiave like 'onboarding/' || v_cliente::text || '/%';
  delete from public.notifiche_avvisi_emessi where chiave like 'onboarding/' || v_cliente::text || '/%';
end;
$$;
