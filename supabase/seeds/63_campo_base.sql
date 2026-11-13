-- Demo data for the client's home base (1.83.0, CLAUDE.md section 34, «Campo base del cliente»): four invented
-- modules of the Aula (one open during the onboarding with three lessons, one after the launch, one «Prossimamente»,
-- one locked) and one check-up of Davide Ferri (61_percorso.sql) with his coach, with invented recap, tasks and
-- notes. Invented data only, never a real client; fixed ids, idempotent.
do $$
declare
  v_admin constant uuid := '11111111-1111-4111-8111-111111111111';
  v_davide constant uuid := '0b0b0000-0000-4000-8000-000000000001';
  v_start constant uuid := 'ca000000-0000-4000-8000-000000000001';
  v_test constant uuid := 'ca000000-0000-4000-8000-000000000002';
  v_mindset constant uuid := 'ca000000-0000-4000-8000-000000000003';
  v_privato constant uuid := 'ca000000-0000-4000-8000-000000000004';
  v_checkup constant uuid := 'cb000000-0000-4000-8000-000000000001';
begin
  if not exists (select 1 from public.profiles where id = v_admin) then
    return;
  end if;

  insert into public.aula_moduli (id, titolo, descrizione, icona, ordine, stato, durante_onboarding, created_by)
  values
    (v_start, 'Start: parti da qui', 'Come funziona il percorso, dove trovi tutto e come lavoriamo insieme ogni settimana.', 'mappa', 0, 'pubblicato', true, v_admin),
    (v_test, 'I tuoi compiti settimanali', 'Cosa fare ogni settimana per non perdere il ritmo: allenamenti, tracciamenti e foto.', 'manubrio', 10, 'pubblicato', false, v_admin),
    (v_mindset, 'Modulo Mindset', 'Costanza e disciplina quando la motivazione cala.', 'cervello', 20, 'prossimamente', false, v_admin),
    (v_privato, 'Corso avanzato', 'Le progressioni per chi ha già le basi.', 'fiamma', 30, 'bloccato', false, v_admin)
  on conflict (id) do nothing;

  insert into public.aula_lezioni (id, modulo_id, titolo, ordine, tipo, corpo, youtube_id, url, obbligatoria)
  values
    ('cc000000-0000-4000-8000-000000000001', v_start, 'Benvenuto nel percorso', 1, 'video',
     'Dieci minuti per capire come ci muoviamo nei prossimi mesi.', 'SeedAula001', null, true),
    ('cc000000-0000-4000-8000-000000000002', v_start, 'Dove trovi tutto', 2, 'testo',
     E'Il tuo **campo base** ha tutto quello che ti serve:\n\n- la **Home** con i compiti ricorrenti;\n- l''**Aula** con le guide;\n- **Le mie call** con lo storico dei checkup.', null, null, false),
    ('cc000000-0000-4000-8000-000000000003', v_start, 'La guida di Coach Plus', 3, 'link',
     'La guida ufficiale dell''app, da tenere a portata di mano.', null, 'https://example.com/guida-coach-plus', false),
    ('cc000000-0000-4000-8000-000000000004', v_test, 'Il ritmo della settimana', 1, 'testo',
     E'Ogni lunedì guarda il programma, ogni domenica carica il peso.', null, null, false)
  on conflict (id) do nothing;

  if exists (select 1 from public.clients where id = v_davide) then
    insert into public.clienti_checkup (id, client_id, giorno, coach_id, fathom_url, argomento, resoconto, compiti, created_by)
    values (
      v_checkup, v_davide, public.oggi() - 3, v_admin, 'https://fathom.video/share/SeedDemoCheckup01',
      'Tecnica delle trazioni e ritmo dei pasti',
      E'Davide, grazie della call, oggi abbiamo parlato di questo topic principale: tecnica delle trazioni e ritmo dei pasti.',
      '["Carica il peso su Coach Plus entro domenica", "Rallenta la discesa nelle trazioni", "Prossima call tra due settimane"]'::jsonb,
      v_admin
    )
    on conflict (id) do nothing;
    insert into public.clienti_checkup_appunti (checkup_id, testo, updated_by)
    values (v_checkup, E'Appunti di prova: scapole da tenere basse nella tirata, rivedere il video la prossima volta.', v_admin)
    on conflict (checkup_id) do nothing;
  end if;
end $$;
