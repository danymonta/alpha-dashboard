-- Demo data for the guided onboarding (1.77.0, docs/onboarding/rilascio-a.md): two invented clients, each
-- with a «nuovo» sale and an onboarding started. Tommaso Galli waits for the payment: Marco Coach is his
-- coach and reviewer, and is not on the project yet. Emanuele Costa has his first instalment cashed, so
-- his link is active: Dany is his coach and responsible (no reviewer chosen yet), so the seed's coach
-- keeps the projects and the tasks the other tests count. Written as the migrations' triggers write it
-- (no session: nobody's name in the log). Invented people and contacts only, dates relative to today,
-- idempotent. The tokens are fake and open nothing.
do $$
declare
  v_admin constant uuid := '11111111-1111-4111-8111-111111111111';
  v_coach constant uuid := '44444444-4444-4444-8444-444444444444';
  v_prodotto constant uuid := 'aaaaaaa1-0000-4000-8000-000000000002';
  v_cliente_1 constant uuid := '0b0a0000-0000-4000-8000-000000000001';
  v_cliente_2 constant uuid := '0b0a0000-0000-4000-8000-000000000002';
  v_vendita_1 constant uuid := '0b0a0000-0000-4000-8000-000000000011';
  v_vendita_2 constant uuid := '0b0a0000-0000-4000-8000-000000000012';
  v_invito_1 constant uuid := '0b0a0000-0000-4000-8000-000000000021';
  v_invito_2 constant uuid := '0b0a0000-0000-4000-8000-000000000022';
  v_token_1 constant text := md5('seed onboarding 1') || md5('seed onboarding 1 bis');
  v_token_2 constant text := md5('seed onboarding 2') || md5('seed onboarding 2 bis');
begin
  if exists (select 1 from public.onboarding_inviti where id in (v_invito_1, v_invito_2)) then
    return;
  end if;
  if not exists (select 1 from public.profiles where id = v_admin)
     or not exists (select 1 from public.products where id = v_prodotto) then
    return;
  end if;

  insert into public.clients (id, nome, cognome, email, telefono, instagram_handle, fonte, closer_id, created_by, created_at)
  values
    (v_cliente_1, 'Tommaso', 'Galli', 'tommaso.galli@example.test', '+39 3330000101', '@tommaso_galli', 'dm_inbound',
     v_admin, v_admin, now() - interval '1 day'),
    (v_cliente_2, 'Emanuele', 'Costa', 'emanuele.costa@example.test', '+39 3330000102', '@emanuele_costa', 'dm_outbound',
     v_admin, v_admin, now() - interval '3 days')
  on conflict (id) do nothing;

  -- the instalment plan is made by the sale's own trigger; the end of the path by the product's length
  insert into public.sales (id, client_id, product_id, tipo, closer_id, data_vendita, data_inizio, valore_contratto,
    numero_rate, created_by, created_at)
  values
    (v_vendita_1, v_cliente_1, v_prodotto, 'nuovo', v_admin, public.oggi() - 1, public.oggi() + 6, 2400.00, 3, v_admin,
     now() - interval '1 day'),
    (v_vendita_2, v_cliente_2, v_prodotto, 'nuovo', v_admin, public.oggi() - 3, public.oggi() + 4, 2400.00, 3, v_admin,
     now() - interval '3 days')
  on conflict (id) do nothing;

  insert into public.onboarding_incarichi (client_id, coach_id, revisore_id, responsabile_id)
  values
    (v_cliente_1, v_coach, v_coach, v_admin),
    (v_cliente_2, v_admin, null, v_admin)
  on conflict (client_id) do nothing;

  insert into public.clienti_telegram (client_id, username)
  values (v_cliente_1, 'tommaso_galli'), (v_cliente_2, 'emanuele_costa')
  on conflict (client_id) do nothing;

  -- the start: path, steps, project and the list «Onboarding» come from the invite's trigger
  insert into public.onboarding_inviti (id, client_id, sale_id, slug, token_hash, email, created_by, created_at)
  values
    (v_invito_1, v_cliente_1, v_vendita_1, public.onboarding_slug('Tommaso', 'Galli'),
     encode(sha256(convert_to(v_token_1, 'UTF8')), 'hex'), 'tommaso.galli@example.test', v_admin, now() - interval '1 day'),
    (v_invito_2, v_cliente_2, v_vendita_2, public.onboarding_slug('Emanuele', 'Costa'),
     encode(sha256(convert_to(v_token_2, 'UTF8')), 'hex'), 'emanuele.costa@example.test', v_admin, now() - interval '3 days');

  insert into public.onboarding_inviti_token (invito_id, token)
  values (v_invito_1, v_token_1), (v_invito_2, v_token_2);

  -- Emanuele has paid his first instalment: the gate turns his link active
  update public.payments
  set stato = 'incassata', incassato_il = public.oggi() - 3, importo_incassato = importo_previsto, metodo = 'bonifico'
  where sale_id = v_vendita_2 and numero_rata = 1 and stato = 'prevista';

  -- the notification of that payment would change the demo of the notification center (55_notifiche.sql)
  delete from public.notifiche where chiave like 'onboarding/' || v_cliente_2::text || '/%';
  delete from public.notifiche_avvisi_emessi where chiave like 'onboarding/' || v_cliente_2::text || '/%';
end;
$$;
