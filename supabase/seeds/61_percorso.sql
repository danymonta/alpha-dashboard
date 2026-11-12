-- Demo data for the client's area of the guided onboarding (1.78.0, docs/onboarding/rilascio-b.md, B1a):
-- two invented clients with a test invite, each registered through the client's branch of
-- handle_new_user exactly as /join does it (a verified registration with the reserved id). Davide Ferri
-- has done the welcome and the rules and waits for the team; Luca Marini did the same, then his link was
-- revoked, so his account is suspended. Two sign-in accounts for the development login (password
-- alpha1234: an insert, the trigger of the passwords looks at updates only):
--   davide.ferri@example.test  active client
--   luca.marini@example.test   suspended client
-- Written without a session (nobody's name in the log). Invented people only, dates relative to today,
-- idempotent on the fixed user ids.
do $$
declare
  v_admin constant uuid := '11111111-1111-4111-8111-111111111111';
  v_prodotto constant uuid := 'aaaaaaa1-0000-4000-8000-000000000002';
  r record;
  v_video uuid;
begin
  if exists (select 1 from auth.users where id in ('0b0b0000-0000-4000-8000-000000000031', '0b0b0000-0000-4000-8000-000000000032'))
     or not exists (select 1 from public.profiles where id = v_admin)
     or not exists (select 1 from public.products where id = v_prodotto) then
    return;
  end if;

  for r in
    select * from (values
      ('0b0b0000-0000-4000-8000-000000000001'::uuid, '0b0b0000-0000-4000-8000-000000000011'::uuid,
       '0b0b0000-0000-4000-8000-000000000021'::uuid, '0b0b0000-0000-4000-8000-000000000031'::uuid,
       'Davide', 'Ferri', 'davide.ferri@example.test', '@davide_ferri', 5, false),
      ('0b0b0000-0000-4000-8000-000000000002'::uuid, '0b0b0000-0000-4000-8000-000000000012'::uuid,
       '0b0b0000-0000-4000-8000-000000000022'::uuid, '0b0b0000-0000-4000-8000-000000000032'::uuid,
       'Luca', 'Marini', 'luca.marini@example.test', '@luca_marini', 8, true)
    ) as t(cliente, vendita, invito, utente, nome, cognome, email, handle, giorni, revocato)
  loop
    insert into public.clients (id, nome, cognome, email, telefono, instagram_handle, fonte, closer_id, created_by, created_at)
    values (r.cliente, r.nome, r.cognome, r.email, null, r.handle, 'dm_inbound', v_admin, v_admin,
            now() - make_interval(days => r.giorni))
    on conflict (id) do nothing;

    insert into public.sales (id, client_id, product_id, tipo, closer_id, data_vendita, data_inizio, valore_contratto,
      numero_rate, created_by, created_at)
    values (r.vendita, r.cliente, v_prodotto, 'nuovo', v_admin, public.oggi() - r.giorni, public.oggi() - r.giorni + 7,
            2400.00, 3, v_admin, now() - make_interval(days => r.giorni))
    on conflict (id) do nothing;

    -- Dany as coach and responsible, like Emanuele Costa (60_onboarding.sql): the seed's coach keeps the
    -- projects and the reads the other tests count
    insert into public.onboarding_incarichi (client_id, coach_id, revisore_id, responsabile_id)
    values (r.cliente, v_admin, null, v_admin)
    on conflict (client_id) do nothing;

    insert into public.clienti_telegram (client_id, username)
    values (r.cliente, lower(ltrim(r.handle, '@')))
    on conflict (client_id) do nothing;

    -- the start: path, steps and project come from the invite's trigger
    insert into public.onboarding_inviti (id, client_id, sale_id, slug, token_hash, email, created_by, created_at)
    values (r.invito, r.cliente, r.vendita, public.onboarding_slug(r.nome, r.cognome),
            encode(sha256(convert_to(md5('seed percorso ' || r.nome) || md5('seed percorso bis ' || r.nome), 'UTF8')), 'hex'),
            r.email, v_admin, now() - make_interval(days => r.giorni));

    -- a test invite, the payment confirmed by hand: active, with its days
    update public.onboarding_inviti set prova = true where id = r.invito;
    update public.onboarding_inviti set stato = 'attivo', attivato_da = 'manuale' where id = r.invito;

    -- the registration verified, as /join leaves it before creating the user
    insert into public.onboarding_registrazioni (invito_id, utente_id, chiave_hash, chiave_scade_il, email, email_provate,
      verificato_il)
    values (r.invito, r.utente, encode(sha256(convert_to('seed chiave ' || r.nome, 'UTF8')), 'hex'),
            now() + interval '30 minutes', r.email, array[r.email], now());

    -- the user with the reserved id: the client's branch of handle_new_user writes the account
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    )
    values (
      '00000000-0000-0000-0000-000000000000', r.utente, 'authenticated', 'authenticated', r.email,
      extensions.crypt('alpha1234', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"],"tipo":"cliente"}'::jsonb, '{}'::jsonb,
      now(), now(), '', '', '', ''
    );

    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (gen_random_uuid(), r.utente, r.utente::text,
            jsonb_build_object('sub', r.utente::text, 'email', r.email, 'email_verified', true),
            'email', now(), now(), now())
    on conflict do nothing;

    -- the welcome (the video seen in full) and the rules with the consent, written directly
    select b.id into v_video
    from public.contenuti_blocchi b
    where b.versione_flusso = 1 and b.pagina = 'passo' and b.passo = 'benvenuto' and b.tipo = 'video'
    order by b.ordine limit 1;
    if v_video is not null then
      insert into public.onboarding_video_visti (client_id, blocco_id, durata, visti, visto_il)
      values (r.cliente, v_video, 180, repeat('1', 180)::varbit, now() - interval '1 day')
      on conflict do nothing;
    end if;

    insert into public.clienti_consensi (client_id, tipo, versione, dato_il)
    select r.cliente, 'salute', t.versione, now() - interval '1 day'
    from public.clienti_consensi_testi t where t.tipo = 'salute' and t.in_vigore;

    update public.onboarding_passi
    set stato = 'fatto', iniziato_il = now() - interval '1 day', completato_il = now() - interval '1 day'
    where client_id = r.cliente and passo in ('benvenuto', 'regole');
    perform public.onboarding_sblocca(r.cliente);

    if r.revocato then
      update public.onboarding_inviti set stato = 'revocato', revocato_motivo = 'Prova del seed' where id = r.invito;
    end if;

    -- the notifications would change the demo of the notification center (55_notifiche.sql)
    delete from public.notifiche where chiave like 'onboarding/' || r.cliente::text || '/%';
    delete from public.notifiche_avvisi_emessi where chiave like 'onboarding/' || r.cliente::text || '/%';
  end loop;
end;
$$;
