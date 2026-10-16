-- The weekly brief, demo data (1.37.0): one ready brief of last week with every section, written in
-- the shape of lib/marketing/spunti/schema.ts, with the facts it quotes. Invented; no names, no
-- figures of people. After 51_analisi_call.sql. Fixed id, idempotent.

insert into public.marketing_spunti (id, motivo, stato, periodo_da, periodo_a, contenuto, fonti, modello, versione_prompt, finita_il, created_at)
values (
  '5ee70000-0000-4000-8000-000000000001', 'automatica', 'pronta', public.oggi() - 35, public.oggi() - 8,
  jsonb_build_object(
    'versione', 'spunti',
    'in_breve', 'I reel che mostrano una sera qualunque dopo il lavoro portano più uomini in target. Il tempo resta il dubbio che torna di più, nei DM e in call.',
    'cosa_funziona', jsonb_build_array(jsonb_build_object('testo', 'Il reel sulla sera dopo il lavoro porta lead in target', 'perche', 'Mostra l''allenamento breve in una giornata piena.', 'rif', jsonb_build_array('F1'))),
    'temi', jsonb_build_array(jsonb_build_object('tema', 'Poco tempo la sera', 'cosa_dicono', 'Chiedono se bastano 40 minuti dopo il lavoro.', 'fonti', jsonb_build_array('dm', 'call'), 'tendenza', 'in_aumento', 'rif', jsonb_build_array('D1', 'C1'))),
    'obiezioni', jsonb_build_array(jsonb_build_object('obiezione', 'Non ho tempo la sera', 'dove_pesa', 'in_call', 'contenuto_che_la_scioglie', 'Una sera tipo, minuto per minuto.', 'perche', 'Torna in più call.', 'rif', jsonb_build_array('C1', 'K1'))),
    'domande', jsonb_build_array(jsonb_build_object('domanda', 'Si può fare senza attrezzi?', 'risposta_in_breve', 'Sì, serve solo una sbarra.', 'rif', jsonb_build_array('D1'))),
    'mantieni', jsonb_build_array(jsonb_build_object('testo', 'Gancio concreto nei primi due secondi', 'perche', 'Funziona sui reel migliori.', 'rif', jsonb_build_array('R1'))),
    'cambia', jsonb_build_array(jsonb_build_object('testo', 'Chiusure senza un motivo per salvare', 'perche', 'La CTA arriva tardi.', 'rif', jsonb_build_array('R1'))),
    'potenzia', jsonb_build_array(jsonb_build_object('testo', 'Serie sulla giornata piena', 'perche', 'Porta lead in target.', 'rif', jsonb_build_array('F1'))),
    'idee', jsonb_build_array(
      jsonb_build_object('modello', 'reel', 'nasce_da', 'obiezione', 'fase', 'consapevolezza', 'name', 'Una sera dopo il lavoro in 40 minuti',
        'reel_type', 'education', 'format', 'show_and_tell', 'gancio', 'Ho 40 minuti, non due ore',
        'messaggio', 'Si può allenarsi bene anche con la giornata piena.',
        'script', jsonb_build_object('hook', 'Ho 40 minuti, non due ore', 'righe', jsonb_build_array('Riscaldamento di cinque minuti', 'Due esercizi, tre serie'), 'cta', 'Salvalo per stasera'),
        'perche', 'Scioglie l''obiezione del tempo prima della call.', 'rif', jsonb_build_array('C1')),
      jsonb_build_object('modello', 'carousel', 'nasce_da', 'domanda', 'fase', 'attrazione', 'name', 'Cosa serve davvero per allenarsi a casa',
        'reel_type', 'attraction', 'format', null, 'gancio', 'Una sbarra e basta',
        'messaggio', 'Per iniziare serve pochissimo.',
        'script', jsonb_build_object('hook', 'Una sbarra e basta', 'righe', jsonb_build_array('La sbarra', 'Un tappetino', 'Un asciugamano'), 'cta', 'Salva il post'),
        'perche', 'Risponde alla domanda che torna nei DM.', 'rif', jsonb_build_array('D1'))),
    'fatti', jsonb_build_object(
      'F1', 'Reel del giorno: 3 lead dai DM, 2 in target',
      'D1', 'Nei DM: ricorre spesso, in aumento',
      'C1', 'Dalle call registrate: ricorre',
      'K1', 'Dai motivi di chi fa le call: ricorre',
      'R1', 'Reel analizzato della settimana')),
  jsonb_build_object('reel_analizzati', 3, 'dm', true, 'setting', true, 'call', true, 'note_team', true),
  'claude-sonnet-5-5', 'seed', now() - interval '6 days', now() - interval '7 days')
on conflict (id) do nothing;
