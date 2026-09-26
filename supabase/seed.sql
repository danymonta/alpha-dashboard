-- Local seed. Invented data, no real client ever lands here.
-- Three sign-in accounts for dev login, Playwright and screenshots:
--   admin@alpha.test / setter@alpha.test / closer@alpha.test  password: alpha1234
-- Everything is anchored to the current month, so the seed never goes stale.

-- ---------------------------------------------------------------------------
-- 1. Invites (the auth trigger rejects anybody who is not invited)
-- ---------------------------------------------------------------------------

insert into public.invites (email, ruolo) values
  ('admin@alpha.test', 'admin'),
  ('setter@alpha.test', 'setter'),
  ('closer@alpha.test', 'closer')
on conflict (email) do update set ruolo = excluded.ruolo, revocato = false;

-- ---------------------------------------------------------------------------
-- 2. Auth users (profiles are created by public.handle_new_user)
-- ---------------------------------------------------------------------------

do $$
declare
  v_utenti jsonb := jsonb_build_array(
    jsonb_build_object('id', '11111111-1111-4111-8111-111111111111', 'email', 'admin@alpha.test',  'nome', 'Dany Montagnolo'),
    jsonb_build_object('id', '22222222-2222-4222-8222-222222222222', 'email', 'setter@alpha.test', 'nome', 'Loris Setter'),
    jsonb_build_object('id', '33333333-3333-4333-8333-333333333333', 'email', 'closer@alpha.test', 'nome', 'Lorenzo Closer')
  );
  v_u jsonb;
begin
  for v_u in select * from jsonb_array_elements(v_utenti) loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      (v_u ->> 'id')::uuid,
      'authenticated',
      'authenticated',
      v_u ->> 'email',
      extensions.crypt('alpha1234', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_u ->> 'nome'),
      now(), now(), '', '', '', ''
    )
    on conflict (id) do nothing;

    insert into auth.identities (
      id, user_id, provider_id, identity_data, provider,
      last_sign_in_at, created_at, updated_at
    )
    values (
      gen_random_uuid(),
      (v_u ->> 'id')::uuid,
      (v_u ->> 'id'),
      jsonb_build_object('sub', v_u ->> 'id', 'email', v_u ->> 'email', 'email_verified', true),
      'email',
      now(), now(), now()
    )
    on conflict do nothing;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Products and commission rule
-- ---------------------------------------------------------------------------

insert into public.products (id, nome, durata_mesi, prezzo_listino, attivo) values
  ('aaaaaaa1-0000-4000-8000-000000000001', 'Percorso Alpha 3 mesi',  3, 1500.00, true),
  ('aaaaaaa1-0000-4000-8000-000000000002', 'Percorso Alpha 6 mesi',  6, 2400.00, true),
  ('aaaaaaa1-0000-4000-8000-000000000003', 'Percorso Alpha 12 mesi', 12, 3600.00, true)
on conflict (id) do nothing;

insert into public.commission_rules (profile_id, percentuale, applica_a, valida_dal)
values (
  '22222222-2222-4222-8222-222222222222',
  0.0500,
  '{nuovo}',
  (date_trunc('month', public.oggi()) - interval '6 months')::date
)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 4. Six months of setting, calls, clients, sales
-- ---------------------------------------------------------------------------

do $$
declare
  v_admin  uuid := '11111111-1111-4111-8111-111111111111';
  v_setter uuid := '22222222-2222-4222-8222-222222222222';
  v_closer uuid := '33333333-3333-4333-8333-333333333333';
  v_mese_corrente date := date_trunc('month', public.oggi())::date;
  v_nomi text[] := array[
    'Marco Bianchi','Luca Ferrari','Andrea Russo','Matteo Costa','Davide Greco',
    'Simone Rizzo','Alessio Conti','Federico Gallo','Stefano Moretti','Giulio Barbieri',
    'Paolo Fontana','Riccardo Serra','Nicola Villa','Emanuele Grassi','Tommaso Riva',
    'Cristian Sala','Fabio Marini','Gabriele Testa','Mirko Pellegrini','Samuele Orlando',
    'Dario Caruso','Ivan Benedetti','Manuel Piras','Alberto Rinaldi','Enrico Lombardi',
    'Filippo Mancini','Giacomo Palmieri','Lorenzo Vitali','Michele Sartori','Nicolò Ferrero',
    'Pietro Longhi','Raffaele Amato','Sergio Bellini','Thomas Negri','Umberto Rossetti',
    'Valerio Santoro','Walter Bruni','Adriano Coppola','Bruno Farina','Carlo Guidi',
    'Diego Leone','Elia Martini','Fausto Neri','Giorgio Parodi','Ignazio Ricci',
    'Jacopo Salvi','Karim Tosi','Leandro Vercelli','Massimo Zanetti','Omar Bassi',
    'Pasquale Cattaneo','Quirino Donati'
  ];
  v_fonti public.lead_source[] := array['dm_inbound','dm_outbound','referral','organico','ads']::public.lead_source[];
  v_obiezioni text[] := array['prezzo','tempo','ci devo pensare','deve parlarne con la compagna','ha già provato altri percorsi'];

  m integer;          -- 5 = sei mesi fa, 0 = mese corrente
  i integer;          -- indice della call nel mese
  d date;
  v_mese date;
  v_indice_nome integer := 1;
  v_lead_id uuid;
  v_call_id uuid;
  v_client_id uuid;
  v_product_id uuid;
  v_prezzo numeric(12,2);
  v_rate integer;
  v_stato public.call_status;
  v_esito public.call_outcome;
  v_qualificata boolean;
  v_chiusure integer;
  v_precedente uuid;
  v_nome text;
begin
  -- 4a. Daily setting report, every day except Sunday
  for d in
    select generate_series(
      (v_mese_corrente - interval '5 months')::date,
      public.oggi(),
      interval '1 day'
    )::date
  loop
    continue when extract(isodow from d) = 7;

    insert into public.setter_daily_reports (
      setter_id, data, dm_outbound, dm_inbound, conversazioni, call_proposte,
      discovery_prenotate, discovery_svolte, call_qualificate, strategy_prenotate,
      follow_up, contenuto_pubblicato, created_by
    )
    values (
      v_setter,
      d,
      28 + (extract(day from d)::int % 9) * 2,
      4 + (extract(day from d)::int % 5),
      9 + (extract(day from d)::int % 6),
      3 + (extract(day from d)::int % 3),
      (extract(day from d)::int % 3),
      (extract(day from d)::int % 2),
      (extract(day from d)::int % 3),
      case when extract(day from d)::int % 4 = 0 then 1 else 0 end,
      2 + (extract(day from d)::int % 4),
      extract(isodow from d) in (1, 3, 5),
      v_setter
    )
    on conflict (setter_id, data) do nothing;
  end loop;

  -- 4b. Leads, calls, clients, sales: eight calls a month, three of them closed
  for m in reverse 5..0 loop
    v_mese := (v_mese_corrente - (interval '1 month' * m))::date;
    v_chiusure := 0;

    for i in 1..8 loop
      exit when v_indice_nome > array_length(v_nomi, 1);
      v_nome := v_nomi[v_indice_nome];
      d := v_mese + (i * 3 - 2);
      continue when d > public.oggi();

      insert into public.leads (nome, instagram_handle, setter_id, fonte, stato, created_by, created_at)
      values (
        v_nome,
        '@' || lower(replace(split_part(v_nome, ' ', 1), ' ', '')) || '_' || v_indice_nome,
        v_setter,
        v_fonti[1 + (v_indice_nome % array_length(v_fonti, 1))],
        'call_fissata',
        v_setter,
        d
      )
      returning id into v_lead_id;

      -- outcome: 3 closed, 2 follow up, 1 lost, 1 no show, 1 still scheduled
      if i <= 3 then
        v_stato := 'svolta'; v_esito := 'chiusa'; v_qualificata := true;
      elsif i <= 5 then
        v_stato := 'svolta'; v_esito := 'follow_up'; v_qualificata := true;
      elsif i = 6 then
        v_stato := 'svolta'; v_esito := 'persa'; v_qualificata := false;
      elsif i = 7 then
        v_stato := 'no_show'; v_esito := null; v_qualificata := null;
      else
        v_stato := 'programmata'; v_esito := null; v_qualificata := null;
      end if;

      if d > public.oggi() - 3 then
        v_stato := 'programmata'; v_esito := null; v_qualificata := null;
      end if;

      insert into public.calls (
        lead_id, setter_id, closer_id, tipo, programmata_il, stato, qualificata,
        esito, obiezione_principale, created_by, created_at
      )
      values (
        v_lead_id,
        v_setter,
        case when i % 3 = 0 then v_admin else v_closer end,
        case when i % 4 = 0 then 'strategy' else 'discovery' end::public.call_type,
        (d + time '15:30') at time zone 'Europe/Rome',
        v_stato,
        v_qualificata,
        v_esito,
        case when v_esito in ('follow_up', 'persa')
             then v_obiezioni[1 + (v_indice_nome % array_length(v_obiezioni, 1))] end,
        v_setter,
        d
      )
      returning id into v_call_id;

      if v_esito = 'chiusa' then
        v_chiusure := v_chiusure + 1;

        update public.leads set stato = 'cliente' where id = v_lead_id;

        if v_chiusure = 1 then
          v_product_id := 'aaaaaaa1-0000-4000-8000-000000000002'; v_prezzo := 2400.00; v_rate := 3;
        elsif v_chiusure = 2 then
          v_product_id := 'aaaaaaa1-0000-4000-8000-000000000001'; v_prezzo := 1500.00; v_rate := 2;
        else
          v_product_id := 'aaaaaaa1-0000-4000-8000-000000000003'; v_prezzo := 3600.00; v_rate := 4;
        end if;

        insert into public.clients (
          lead_id, nome, cognome, email, telefono, instagram_handle, fonte,
          setter_id, closer_id, created_by, created_at
        )
        values (
          v_lead_id,
          split_part(v_nome, ' ', 1),
          split_part(v_nome, ' ', 2),
          lower(replace(v_nome, ' ', '.')) || '@example.test',
          '+39 3' || lpad((100000000 + v_indice_nome * 7919)::text, 9, '0'),
          '@' || lower(replace(split_part(v_nome, ' ', 1), ' ', '')) || '_' || v_indice_nome,
          v_fonti[1 + (v_indice_nome % array_length(v_fonti, 1))],
          v_setter,
          case when i % 3 = 0 then v_admin else v_closer end,
          v_admin,
          d
        )
        returning id into v_client_id;

        insert into public.sales (
          client_id, product_id, tipo, call_id, setter_id, closer_id,
          data_vendita, data_inizio, data_fine, valore_contratto, numero_rate, created_by
        )
        values (
          v_client_id,
          v_product_id,
          'nuovo',
          v_call_id,
          v_setter,
          case when i % 3 = 0 then v_admin else v_closer end,
          d,
          d,
          (d + (interval '1 month' * (select durata_mesi from public.products where id = v_product_id)))::date - 1,
          v_prezzo,
          v_rate,
          v_admin
        );
      end if;

      v_indice_nome := v_indice_nome + 1;
    end loop;
  end loop;

  -- 4b-bis. Calls still to come: today and the next three days
  for i in 0..3 loop
    exit when v_indice_nome > array_length(v_nomi, 1);
    v_nome := v_nomi[v_indice_nome];

    insert into public.leads (nome, instagram_handle, setter_id, fonte, stato, created_by)
    values (
      v_nome,
      '@' || lower(split_part(v_nome, ' ', 1)) || '_' || v_indice_nome,
      v_setter,
      v_fonti[1 + (v_indice_nome % array_length(v_fonti, 1))],
      'call_fissata',
      v_setter
    )
    returning id into v_lead_id;

    insert into public.calls (
      lead_id, setter_id, closer_id, tipo, programmata_il, stato, created_by
    )
    values (
      v_lead_id,
      v_setter,
      case when i = 1 then v_admin else v_closer end,
      case when i = 3 then 'strategy' else 'discovery' end::public.call_type,
      ((public.oggi() + i) + time '11:00') at time zone 'Europe/Rome',
      'programmata',
      v_setter
    );

    v_indice_nome := v_indice_nome + 1;
  end loop;

  -- 4c. Two renewals: clients whose first contract has already ended
  for v_precedente in
    select s.client_id
    from public.sales s
    where s.tipo = 'nuovo'
      and s.data_fine < public.oggi()
    order by s.data_fine
    limit 2
  loop
    insert into public.sales (
      client_id, product_id, tipo, setter_id, closer_id,
      data_vendita, data_inizio, data_fine, valore_contratto, numero_rate, created_by, note
    )
    select
      v_precedente,
      'aaaaaaa1-0000-4000-8000-000000000002',
      'rinnovo',
      v_setter,
      v_closer,
      (max(s.data_fine) + 1)::date,
      (max(s.data_fine) + 1)::date,
      (max(s.data_fine) + 1 + interval '6 months')::date - 1,
      2200.00,
      2,
      v_admin,
      'Rinnovo a prezzo cliente storico'
    from public.sales s
    where s.client_id = v_precedente;
  end loop;

  -- 4d. One upsell
  insert into public.sales (
    client_id, product_id, tipo, setter_id, closer_id,
    data_vendita, data_inizio, data_fine, valore_contratto, numero_rate, created_by, note
  )
  select
    s.client_id,
    'aaaaaaa1-0000-4000-8000-000000000001',
    'upsell',
    v_setter,
    v_closer,
    (v_mese_corrente - interval '1 month')::date + 8,
    (v_mese_corrente - interval '1 month')::date + 8,
    (v_mese_corrente + interval '2 months')::date + 7,
    600.00,
    1,
    v_admin,
    'Blocco nutrizione aggiuntivo'
  from public.sales s
  where s.tipo = 'nuovo'
  order by s.data_vendita
  limit 1;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Cash: everything due more than 10 days ago is in, the rest is open
-- ---------------------------------------------------------------------------

update public.payments p
set stato = 'incassata',
    incassato_il = least(p.scadenza + 2, public.oggi()),
    importo_incassato = p.importo_previsto,
    metodo = case when p.numero_rata = 1 then 'stripe' else 'bonifico' end::public.payment_method
where p.scadenza <= public.oggi() - 10;

-- Two recent sales stay unpaid, so the dashboard has real overdue instalments
update public.payments p
set stato = 'prevista',
    incassato_il = null,
    importo_incassato = null,
    metodo = null
where p.scadenza < public.oggi()
  and p.sale_id in (
    select s.id
    from public.sales s
    where s.tipo = 'nuovo'
    order by s.data_vendita desc
    limit 2
  );

-- One refund, booked as its own negative row so the original month keeps its cash
insert into public.payments (
  sale_id, numero_rata, scadenza, importo_previsto, incassato_il,
  importo_incassato, metodo, stato, note
)
select
  p.sale_id, p.numero_rata, p.scadenza, 0,
  least(p.incassato_il + 20, public.oggi()),
  -p.importo_incassato, p.metodo, 'rimborsata',
  'Recesso entro 14 giorni'
from public.payments p
where p.stato = 'incassata'
  and p.incassato_il < (date_trunc('month', public.oggi()) - interval '2 months')::date
order by p.incassato_il
limit 1;

-- ---------------------------------------------------------------------------
-- 6. Costs
-- ---------------------------------------------------------------------------

insert into public.expenses (data, categoria, descrizione, importo, ricorrente)
select
  (date_trunc('month', public.oggi()) - (interval '1 month' * m))::date + 4,
  cat.categoria,
  cat.descrizione,
  cat.importo,
  cat.ricorrente
from generate_series(0, 5) as m
cross join (values
  ('team'::public.expense_category,     'Compenso coach Lorenzo', 600.00, true),
  ('team'::public.expense_category,     'Video editor',           350.00, true),
  ('software'::public.expense_category, 'Software e hosting',      89.00, true),
  ('ads'::public.expense_category,      'Advertising Meta',       250.00, false)
) as cat(categoria, descrizione, importo, ricorrente);

-- ---------------------------------------------------------------------------
-- 7. Commissions already paid (the last two months are still open on purpose)
-- ---------------------------------------------------------------------------

insert into public.commission_payouts (profile_id, periodo, importo, pagato_il, metodo, note)
select
  s.setter_id,
  date_trunc('month', p.incassato_il)::date,
  round(sum(p.importo_incassato) * 0.05, 2),
  (date_trunc('month', p.incassato_il) + interval '1 month' + interval '5 days')::date,
  'bonifico'::public.payment_method,
  'Provvigione 5% sul cash delle vendite nuove'
from public.payments p
join public.sales s on s.id = p.sale_id
where p.stato = 'incassata'
  and s.tipo = 'nuovo'
  and s.setter_id is not null
  and p.incassato_il < (date_trunc('month', public.oggi()) - interval '1 month')::date
group by s.setter_id, date_trunc('month', p.incassato_il)
having sum(p.importo_incassato) > 0;
