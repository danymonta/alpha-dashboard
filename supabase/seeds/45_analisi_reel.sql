-- Analisi dei reel, demo data (1.36.0). Invented transcripts, cards, analyses
-- and ideas about the invented posts of 27 and 28: never a real reel, a real
-- caption or a real person. After 40_insight.sql (it uses the counts per post
-- of the Insight and its dates). Dates relative to public.oggi(); fixed ids and
-- "on conflict do nothing": running it again changes nothing already there.
--
-- The automatic transcriptions are OFF here (marketing_lavori_stato.automatiche =
-- false): pg_cron runs for real in the local database, and without this the
-- planner would queue the speech of the seed's reels during the e2e tests.
-- The e2e tests drive the steps by hand. (Claude never works by itself since 1.39.0.)
--
--   SeedDemo01  read; analysis ready: «spingere», 2 ideas, the first already in the calendar; score 82
--   SeedPost02  read; analysis ready: «mantenere», made without a score (before 1.39.0)
--   SeedPost03, SeedPost04  read from the video, only a few hours old (no analysis yet)
--   SeedPost08  read from the cover (Instagram gives no video); not linked
--   SeedReel13  read; analysis ready: «cambiare», not linked, with Claude's proposal for a content; score 41
--   SeedReel01 to SeedReel03  only the speech (the recovery)

-- ---------------------------------------------------------------------------
-- 1. The switches, and the days the Insight counted (the last 20 days up to yesterday)
-- ---------------------------------------------------------------------------
update public.marketing_lavori_stato set automatiche = false where id;

update public.insight_impostazioni set storico_dal = public.oggi() - 20 where id and storico_dal is null;

insert into public.instagram_contenuti_dm_giorni (giorno)
select public.oggi() - g from generate_series(1, 20) g
on conflict (giorno) do nothing;

-- ---------------------------------------------------------------------------
-- 2. The readings
-- ---------------------------------------------------------------------------
-- The visual card (lib/marketing/analisi/schema.ts), in the values of the database
create or replace function pg_temp.scheda(
  p_sintesi text, p_gancio_livello text, p_gancio text, p_reel_type text, p_format text, p_aderenza text)
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'sintesi_visiva', p_sintesi,
    'gancio', jsonb_build_object(
      'livello', p_gancio_livello,
      'cosa_si_vede', 'Dany in casa, a mezzo busto, guarda in camera e indica il tavolo.',
      'parole', p_gancio,
      'testo_a_schermo', 'ZERO ATTREZZI',
      'perche', 'Una promessa concreta nei primi due secondi: un uomo con poco tempo capisce subito che non serve niente.',
      'alternativa', 'Ti basta un tavolo per allenare la schiena.'),
    'sequenza', jsonb_build_array(
      jsonb_build_object('da', 0, 'a', 3, 'cosa_si_vede', 'Dany al tavolo, promessa a voce.', 'testo_a_schermo', 'ZERO ATTREZZI'),
      jsonb_build_object('da', 3, 'a', 18, 'cosa_si_vede', 'Il primo esercizio: rematore inverso sotto il tavolo.', 'testo_a_schermo', '1. Il tavolo'),
      jsonb_build_object('da', 18, 'a', 32, 'cosa_si_vede', 'Il secondo esercizio con l''asciugamano nella porta.', 'testo_a_schermo', '2. L''asciugamano'),
      jsonb_build_object('da', 32, 'a', 42, 'cosa_si_vede', 'Chiusura a camera, invito a salvare il video.', 'testo_a_schermo', null)),
    'ritmo', jsonb_build_object('livello', 'medio', 'osservazione', 'Scorre bene fino al secondo esercizio, poi si allunga.',
      'calo', jsonb_build_object('secondo', 24, 'cosa', 'La spiegazione dell''asciugamano è lenta e senza stacchi.')),
    'testo_a_schermo', jsonb_build_object('leggibile', 'si', 'sopra_il_volto', false,
      'osservazione', 'Grande e in basso, si legge sul telefono senza coprire il volto.'),
    'cta', jsonb_build_object('presente', true, 'testo', 'Salva il video e provalo stasera.', 'secondo', 38,
      'osservazione', 'Arriva tardi e senza un motivo per salvare.', 'proposta', 'Salvalo: stasera lo provi in dieci minuti.'),
    'produzione', jsonb_build_object('luce', 'buona', 'audio', 'chiaro', 'inquadratura', 'Fissa, mezzo busto, camera all''altezza degli occhi.',
      'osservazione', 'Pulita e senza distrazioni.'),
    'ambiente', jsonb_build_array('casa', 'cucina'),
    'icp', jsonb_build_object('aderenza', p_aderenza,
      'leve_usate', jsonb_build_array('poco tempo', 'niente attrezzi'),
      'leve_mancanti', jsonb_build_array('il dolore alla schiena da scrivania', 'la paura di fare male'),
      'frase_del_cliente', 'Non ho tempo e non voglio comprare niente.',
      'rischio', null),
    'script', null,
    'classificazione', jsonb_build_object('reel_type', p_reel_type, 'format', p_format));
$$;

insert into public.instagram_letture (
  media_id, richiesta, stato, motivo, priorita, video, ha_audio, trascrizione_esito, trascrizione, segmenti,
  gancio_parlato, modello_trascrizione, visione_esito, fonte_visione, scheda, fotogrammi, lato_px,
  modello_visione, versione_prompt_visione, iniziata_il, letta_il
)
select i.media_id, x.richiesta, 'fatta', x.motivo, 1, x.video, x.ha_audio, x.t_esito, x.trascrizione, x.segmenti,
       x.gancio, case when x.t_esito = 'pronta' then 'whisper-large-v3' end,
       x.v_esito, x.fonte, x.scheda, x.fotogrammi, case when x.fotogrammi is not null then 896 end,
       case when x.v_esito is not null then 'claude-sonnet-5-5' end,
       case when x.v_esito is not null then '2026-10-16.1' end,
       now() - interval '6 hours', now() - interval '6 hours'
from (values
  ('SeedDemo01', 'completa', 'automatica', 'letto', true, 'pronta',
   E'Niente sbarra? Nessun problema. Ti faccio vedere tre modi per allenare la schiena con quello che hai in casa. Il primo è il tavolo: ti metti sotto, afferri il bordo e tiri il petto verso l''alto, con il corpo dritto. Il secondo è un asciugamano chiuso in una porta: tiri per dieci secondi, riposi, ripeti. Il terzo è lo zaino con dei libri dentro. Salva il video e provalo stasera.',
   '[{"da":0.0,"a":2.4,"testo":"Niente sbarra? Nessun problema."},{"da":2.4,"a":7.8,"testo":"Ti faccio vedere tre modi per allenare la schiena con quello che hai in casa."},{"da":7.8,"a":16.0,"testo":"Il primo è il tavolo: ti metti sotto, afferri il bordo e tiri il petto verso l''alto, con il corpo dritto."},{"da":16.0,"a":27.5,"testo":"Il secondo è un asciugamano chiuso in una porta: tiri per dieci secondi, riposi, ripeti."},{"da":27.5,"a":34.0,"testo":"Il terzo è lo zaino con dei libri dentro."},{"da":38.0,"a":42.0,"testo":"Salva il video e provalo stasera."}]'::jsonb,
   'Niente sbarra? Nessun problema.',
   'pronta', 'video', pg_temp.scheda('Dany mostra tre alternative alla sbarra con oggetti di casa, a mezzo busto in cucina.', 'forte', 'Niente sbarra? Nessun problema.', 'education', 'raw_talking_head', 'alta'), 31),
  ('SeedPost02', 'completa', 'automatica', 'letto', true, 'pronta',
   E'Fai mille crunch e non vedi niente? Ecco i tre errori che rallentano gli addominali. Il primo: fai solo crunch. Il secondo: non aumenti mai la difficoltà. Il terzo lo fanno quasi tutti: pensi che gli addominali si vedano con più ripetizioni, e invece si vedono quando scendi di grasso.',
   '[{"da":0.0,"a":3.1,"testo":"Fai mille crunch e non vedi niente?"},{"da":3.1,"a":10.0,"testo":"Ecco i tre errori che rallentano gli addominali."},{"da":10.0,"a":16.0,"testo":"Il primo: fai solo crunch."},{"da":16.0,"a":22.0,"testo":"Il secondo: non aumenti mai la difficoltà."},{"da":22.0,"a":36.0,"testo":"Il terzo lo fanno quasi tutti: pensi che gli addominali si vedano con più ripetizioni, e invece si vedono quando scendi di grasso."}]'::jsonb,
   'Fai mille crunch e non vedi niente?',
   'pronta', 'video', pg_temp.scheda('Dany elenca tre errori negli addominali, con grafica semplice a schermo.', 'medio', 'Fai mille crunch e non vedi niente?', 'attraction', 'split', 'media'), 28),
  ('SeedPost03', 'completa', 'automatica', 'letto', true, 'pronta',
   E'Il primo piegamento vero arriva in quattro settimane, se parti dal gradino giusto. Prima sulle ginocchia, poi con le mani su una panca, poi a terra.',
   '[{"da":0.0,"a":5.5,"testo":"Il primo piegamento vero arriva in quattro settimane, se parti dal gradino giusto."},{"da":5.5,"a":16.0,"testo":"Prima sulle ginocchia, poi con le mani su una panca, poi a terra."}]'::jsonb,
   'Il primo piegamento vero arriva in quattro settimane, se parti dal gradino giusto.',
   'pronta', 'video', pg_temp.scheda('Tre varianti del piegamento in sequenza, dalla più facile alla più difficile.', 'medio', 'Il primo piegamento vero arriva in quattro settimane.', 'converting', 'transformation', 'alta'), 22),
  ('SeedPost04', 'completa', 'automatica', 'letto', true, 'senza_parlato', null, null, null,
   'pronta', 'video', pg_temp.scheda('Una cena in tavola con testi a schermo e musica, senza voce.', 'debole', null, 'education', 'text_opinion', 'media'), 19),
  ('SeedPost08', 'completa', 'richiesta', 'senza_media_url', false, 'senza_video', null, null, null,
   'pronta', 'copertina', pg_temp.scheda('La copertina mostra Dany a petto nudo accanto a una scritta sul percorso fatto.', 'medio', null, 'attraction', 'transformation', 'media'), 1),
  ('SeedReel13', 'completa', 'automatica', 'letto', true, 'pronta',
   E'Oggi ti spiego una cosa sui carboidrati. Ci sono tanti modi di vederla, dipende da cosa vuoi ottenere e da come ti alleni. Ne parlo qui sotto nella didascalia.',
   '[{"da":0.0,"a":6.0,"testo":"Oggi ti spiego una cosa sui carboidrati."},{"da":6.0,"a":18.0,"testo":"Ci sono tanti modi di vederla, dipende da cosa vuoi ottenere e da come ti alleni."},{"da":18.0,"a":25.0,"testo":"Ne parlo qui sotto nella didascalia."}]'::jsonb,
   'Oggi ti spiego una cosa sui carboidrati.',
   'pronta', 'video', pg_temp.scheda('Dany parla di carboidrati senza un esempio, inquadratura fissa e luce piatta.', 'debole', 'Oggi ti spiego una cosa sui carboidrati.', 'education', 'raw_talking_head', 'bassa'), 31)
) as x(shortcode, richiesta, motivo, video, ha_audio, t_esito, trascrizione, segmenti, gancio, v_esito, fonte, scheda, fotogrammi)
join public.instagram_contenuti i on i.shortcode = x.shortcode
on conflict (media_id) do nothing;

-- the recovery: only the speech of three old reels
insert into public.instagram_letture (
  media_id, richiesta, stato, motivo, priorita, video, ha_audio, trascrizione_esito, trascrizione, segmenti,
  gancio_parlato, modello_trascrizione, iniziata_il, letta_il
)
select i.media_id, 'trascrizione', 'fatta', 'recupero', 0, 'letto', true, 'pronta', x.testo,
       jsonb_build_array(jsonb_build_object('da', 0.0, 'a', 6.0, 'testo', x.testo)),
       left(x.testo, 120), 'whisper-large-v3', now() - interval '2 days', now() - interval '2 days'
from (values
  ('SeedReel01', 'Tre errori nei piegamenti che ti fanno male alle spalle. Il primo è aprire troppo i gomiti.'),
  ('SeedReel02', 'Cosa mangio in una giornata normale, senza pesare niente. Colazione semplice, pranzo con proteine, cena leggera.'),
  ('SeedReel03', 'Allenarsi a casa con poco tempo: tre sedute da quaranta minuti bastano, se sono fatte bene.')
) as x(shortcode, testo)
join public.instagram_contenuti i on i.shortcode = x.shortcode
on conflict (media_id) do nothing;

drop function pg_temp.scheda(text, text, text, text, text, text);

-- ---------------------------------------------------------------------------
-- 3. The analyses
-- ---------------------------------------------------------------------------
insert into public.marketing_analisi (
  id, media_id, motivo, stato, eta_ore, eta_confronto, periodo_da, periodo_a, verdetto, numeri, contenuto, fonti,
  modello, versione_prompt, iniziata_il, finita_il, created_at
)
select x.id::uuid, i.media_id, 'automatica', 'pronta',
       (public.analisi_numeri_reel(i.media_id) ->> 'eta_ore')::integer,
       (public.analisi_numeri_reel(i.media_id) ->> 'eta_confronto')::smallint,
       public.oggi() - 28, public.oggi() - 1, public.analisi_numeri_reel(i.media_id) ->> 'verdetto',
       public.analisi_numeri_reel(i.media_id), x.contenuto, x.fonti,
       'claude-sonnet-5-5', '2026-10-16.1', now() - interval '5 hours', now() - interval '5 hours', now() - interval '5 hours'
from (values
  ('a1000000-0000-4000-8000-000000000001', 'SeedDemo01',
   '{"perche_verdetto":"Le views a 7 giorni sono quasi tre volte la mediana dell''account, e i primi lead in target arrivano da questo reel.",
     "sintesi":"Un reel che mostra una promessa concreta nei primi secondi e la mantiene: tre alternative alla sbarra con quello che ha in casa chi lo guarda. Vale la pena farne un seguito.",
     "cosa_ha_funzionato":["Il gancio dice subito cosa si ottiene, senza attrezzi.","Il testo a schermo è grande e non copre il volto.","Gli esempi sono oggetti che tutti hanno in casa."],
     "da_migliorare":[{"cosa":"La CTA arriva al secondo 38.","come":"Portare l''invito a salvare il video intorno al secondo 30, con un motivo per farlo.","priorita":"media"},{"cosa":"La parte sull''asciugamano si allunga.","come":"Accorciare la spiegazione e aggiungere uno stacco di inquadratura.","priorita":"bassa"}],
     "dai_lead":"I primi messaggi chiedono quali esercizi vanno bene per chi lavora seduto: il tema della schiena da scrivania è quello che porta più lead in target.",
     "collegamento":null,
     "idee":[
       {"tipo":"seguito","name":"Schiena da scrivania: tre esercizi in pausa pranzo","reel_type":"education","format":"raw_talking_head","gancio":"Lavori seduto? Questi tre minuti ti salvano la schiena.","messaggio":"Chi lavora seduto ha bisogno di pochi minuti mirati, non di un''ora in palestra.","script":{"hook":"Lavori seduto? Questi tre minuti ti salvano la schiena.","righe":["Esercizio 1: la tirata con l''asciugamano nella porta.","Esercizio 2: il rematore sotto il tavolo.","Esercizio 3: la posizione del bambino con le braccia lunghe."],"cta":"Salva il video e fallo domani a pranzo."},"perche":"Il tema della schiena da scrivania porta lead in target e questo reel ha dimostrato che la formula funziona."},
       {"tipo":"seguito","name":"Parte 2: la sbarra in casa, quale comprare","reel_type":"education","format":"show_and_tell","gancio":"Ho provato tre sbarre da porta: ne tengo una sola.","messaggio":"Per chi vuole comprare qualcosa, una guida onesta evita l''acquisto sbagliato.","script":{"hook":"Ho provato tre sbarre da porta: ne tengo una sola.","righe":["La prima si piega: fuori.","La seconda si monta in dieci secondi ma non regge.","La terza è quella giusta, ecco perché."],"cta":"Scrivimi SBARRA e ti dico quale."},"perche":"Chi ha visto il primo reel sa che non serve la sbarra: dare una risposta onesta a chi la vuole comprare costruisce fiducia."}
     ]}'::jsonb,
   '{"fotogrammi":31,"video":"si","trascrizione":"si","lead":"si","note_team":true}'::jsonb),
  ('a1000000-0000-4000-8000-000000000002', 'SeedPost02',
   '{"perche_verdetto":"Le views a 7 giorni sono in linea con la mediana e non ci sono ancora lead in target abbastanza chiari per dire di più.",
     "sintesi":"Un reel chiaro, con tre errori in elenco. Nella media dell''account: da mantenere nel calendario senza forzarlo.",
     "cosa_ha_funzionato":["Il gancio parte da una frustrazione che l''uomo del pubblico conosce.","L''elenco in tre punti è facile da seguire."],
     "da_migliorare":[{"cosa":"Il terzo errore arriva senza una prova.","come":"Mostrare un prima e dopo di chi ha smesso di fare solo crunch.","priorita":"alta"}],
     "dai_lead":null,
     "collegamento":null,
     "idee":[
       {"tipo":"rifacimento","name":"Addominali: quello che cambia quando scendi di grasso","reel_type":"education","format":"split","gancio":"Non sono i crunch: guarda cosa cambia in 8 settimane.","messaggio":"Gli addominali si vedono con il grasso che scende, non con le ripetizioni.","script":{"hook":"Non sono i crunch: guarda cosa cambia in 8 settimane.","righe":["Stesso esercizio, due corpi diversi.","Cosa è cambiato: l''alimentazione e il sonno.","Cosa non è cambiato: i crunch."],"cta":"Scrivimi ADDOMINALI."},"perche":"Lo stesso messaggio con una prova visiva risponde alla critica principale."},
       {"tipo":"nuovo","name":"Dopo i 30 la pancia: cosa sbagli la sera","reel_type":"attraction","format":"text_opinion","gancio":"Dopo i 30 la pancia non scende per colpa di questa abitudine.","messaggio":"La somma della giornata conta più di un singolo pasto.","script":{"hook":"Dopo i 30 la pancia non scende per colpa di questa abitudine.","righe":["Non è la cena.","È quello che mangi senza accorgertene dalle 17 in poi."],"cta":"Salvalo e controllati per una settimana."},"perche":"Il tema della pancia dopo i 30 torna spesso nelle richieste di chi scrive."}
     ]}'::jsonb,
   '{"fotogrammi":28,"video":"si","trascrizione":"si","lead":"no","note_team":true}'::jsonb),
  ('a1000000-0000-4000-8000-000000000003', 'SeedReel13',
   '{"perche_verdetto":"Le views sono un settimo della mediana dei reel di quell''età, i salvataggi un quarto, e nessuno scrive in DM.",
     "sintesi":"Un reel che promette di spiegare una cosa sui carboidrati senza dire quale. Il gancio è generico, il testo a schermo manca e la CTA rimanda alla didascalia. Da rifare con un messaggio preciso.",
     "cosa_ha_funzionato":["La luce è accettabile e l''audio è chiaro."],
     "da_migliorare":[{"cosa":"Il gancio non dice cosa si ottiene.","come":"Aprire con il risultato: «Quanti carboidrati servono a chi si allena a casa tre volte a settimana».","priorita":"alta"},{"cosa":"Nessun testo a schermo.","come":"Aggiungere tre parole chiave leggibili sul telefono.","priorita":"alta"},{"cosa":"La CTA rimanda alla didascalia.","come":"Chiudere con un invito dentro il video.","priorita":"media"}],
     "dai_lead":null,
     "collegamento":{"contenuto_id":"ccccccc1-0000-4000-8000-000000000005","sicurezza":"media","perche":"Il tema dell''alimentazione e del giorno sono compatibili con questo contenuto del calendario."},
     "idee":[
       {"tipo":"rifacimento","name":"Carboidrati per chi si allena a casa: quanti e quando","reel_type":"education","format":"text_opinion","gancio":"Quanti carboidrati servono a chi si allena a casa? Meno di quanto pensi.","messaggio":"Una regola semplice per la giornata di chi si allena tre volte a settimana.","script":{"hook":"Quanti carboidrati servono a chi si allena a casa? Meno di quanto pensi.","righe":["Nei giorni di allenamento: una porzione in più a pranzo.","Nei giorni di riposo: le porzioni di sempre."],"cta":"Salva e prova questa settimana."},"perche":"Lo stesso tema con un risultato chiaro nel gancio."},
       {"tipo":"rifacimento","name":"Carboidrati: i tre errori di chi vuole dimagrire","reel_type":"attraction","format":"split","gancio":"Tolgo i carboidrati e non dimagrisco: ecco perché.","messaggio":"Togliere i carboidrati non è la soluzione per tutti.","script":{"hook":"Tolgo i carboidrati e non dimagrisco: ecco perché.","righe":["Errore 1: li tolgo tutti.","Errore 2: li recupero la sera.","Errore 3: non mi muovo di più."],"cta":"Scrivimi CARBO."},"perche":"Il formato con tre errori ha già funzionato su questo account."},
       {"tipo":"rifacimento","name":"Cosa mangiare prima dell''allenamento a casa","reel_type":"education","format":"show_and_tell","gancio":"Cosa mangio mezz''ora prima di allenarmi in salotto.","messaggio":"Un esempio pratico batte una spiegazione generica.","script":{"hook":"Cosa mangio mezz''ora prima di allenarmi in salotto.","righe":["Una banana e un caffè.","Niente di pesante.","Poi l''allenamento: venti minuti."],"cta":"Salvalo per domani mattina."},"perche":"Uno stesso argomento mostrato invece che spiegato."}
     ]}'::jsonb,
   '{"fotogrammi":31,"video":"si","trascrizione":"si","lead":"si","note_team":true}'::jsonb)
) as x(id, shortcode, contenuto, fonti)
join public.instagram_contenuti i on i.shortcode = x.shortcode
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3b. The scores (1.39.0): the reel of the demo (82, «Pubblicare dopo ritocchi») and the weak one (41,
-- «Scartare o ripartire»); SeedPost02 keeps an analysis made without a score (the ones made before 1.39.0),
-- SeedPost03, SeedPost04 and SeedPost08 have none. The numbers are what the app's tables give for these votes.
-- ---------------------------------------------------------------------------
-- SeedDemo01
update public.marketing_analisi
set punteggio = '{"versione": 1, "tipo": "mof", "tipo_origine": "dichiarato", "motivo_classificazione": "Insegna tre alternative pratiche alla sbarra: struttura Hook, Teach, Apply.", "durata_stimata_secondi": 42, "hook": {"testo": "Niente sbarra? Nessun problema.", "parole": 5, "cita_icp": true}, "totale_grezzo": 81.8, "penalita_totali": 0, "totale": 82, "fascia": "pubblicare_dopo_ritocchi", "limiti_applicati": [], "violazioni_formali": 0, "altre_violazioni_formali": [], "criteri": [{"id": "H", "nome": "Hook", "peso": 20, "voto_modello": 8, "voto": 8, "punteggio": 16, "tetto": null, "citazione": "Niente sbarra? Nessun problema.", "citazione_trovata": true, "motivazione": "Cinque parole, risponde a un dubbio dell’ICP (non ho gli attrezzi), ma non dice cosa si ottiene.", "correzione": "Aprire con il risultato: «Schiena forte, senza sbarra»."}, {"id": "EV", "nome": "Valore educativo (Hook, Teach, Apply)", "peso": 25, "voto_modello": 8, "voto": 8, "punteggio": 20, "tetto": null, "citazione": "Ti faccio vedere tre modi per allenare la schiena con quello che hai in casa.", "citazione_trovata": true, "motivazione": "Promessa mantenuta con tre punti e il consiglio migliore per primo.", "correzione": "Dire per primo quale dei tre rende di più."}, {"id": "CH", "nome": "Chiarezza e semplicità", "peso": 10, "voto_modello": 9, "voto": 9, "punteggio": 9, "tetto": null, "citazione": "Il primo è il tavolo", "citazione_trovata": true, "motivazione": "Linguaggio semplice, nessun gergo.", "correzione": "Nessuna correzione."}, {"id": "ID", "nome": "Identificazione ICP", "peso": 10, "voto_modello": 8, "voto": 8, "punteggio": 8, "tetto": null, "citazione": "quello che hai in casa", "citazione_trovata": true, "motivazione": "Parla a chi non ha attrezzi e poco tempo.", "correzione": "Aggiungere il dolore alla schiena da scrivania."}, {"id": "TV", "nome": "Tono di voce e autorevolezza", "peso": 10, "voto_modello": 8, "voto": 8, "punteggio": 8, "tetto": null, "citazione": "Salva il video e provalo stasera.", "citazione_trovata": true, "motivazione": "Diretto, prima persona, concreto.", "correzione": "Nessuna correzione."}, {"id": "AP", "nome": "Applicabilità concreta", "peso": 10, "voto_modello": 9, "voto": 9, "punteggio": 9, "tetto": null, "citazione": "tiri per dieci secondi, riposi, ripeti", "citazione_trovata": true, "motivazione": "Ogni punto dice cosa fare e con quale oggetto.", "correzione": "Aggiungere quante serie fare."}, {"id": "RL", "nome": "Ritmo e lunghezza", "peso": 5, "voto_modello": 8, "voto": 8, "punteggio": 4, "tetto": null, "citazione": "Il secondo è un asciugamano chiuso in una porta", "citazione_trovata": true, "motivazione": "Durata giusta; la parte sull’asciugamano si allunga.", "correzione": "Tagliare la spiegazione dell’asciugamano di 3 secondi."}, {"id": "CT", "nome": "CTA coerente con MOF", "peso": 5, "voto_modello": 8, "voto": 8, "punteggio": 4, "tetto": null, "citazione": "Salva il video e provalo stasera.", "citazione_trovata": true, "motivazione": "CTA soft, coerente con un contenuto educativo.", "correzione": "Portarla verso il secondo 30."}, {"id": "CA", "nome": "Caption", "peso": 3, "voto_modello": 6, "voto": 6, "punteggio": 1.8, "tetto": null, "citazione": "", "citazione_trovata": true, "motivazione": "Corta e con una sola azione.", "correzione": "Nessuna correzione."}, {"id": "CF", "nome": "Conformità formale", "peso": 2, "voto_modello": 10, "voto": 10, "punteggio": 2, "tetto": null, "citazione": "", "citazione_trovata": true, "motivazione": "Calcolata dal gestionale: nessuna violazione.", "correzione": "Nessuna correzione."}], "penalita": [], "punti_di_forza": ["Gli esempi sono oggetti che tutti hanno in casa: «con quello che hai in casa».", "La CTA è una sola e chiara: «Salva il video e provalo stasera.»"], "problemi_prioritari": [{"ordine": 1, "criterio": "H", "nome": "Hook", "problema": "L’hook non dice il risultato.", "impatto_punti": 4}, {"ordine": 2, "criterio": "CA", "nome": "Caption", "problema": "La caption non porta un invito preciso.", "impatto_punti": 1.2}, {"ordine": 3, "criterio": "RL", "nome": "Ritmo e lunghezza", "problema": "La parte sull’asciugamano è lenta.", "impatto_punti": 1}], "confronto_benchmark": null, "segnalazioni": [], "rifacimento": {"istruzioni": ["Aprire con il risultato nei primi due secondi.", "Portare l’invito a salvare intorno al secondo 30.", "Accorciare la parte sull’asciugamano."], "hook_alternativi": [{"testo": "Schiena forte senza sbarra, con tre oggetti.", "categoria": "Educational", "perche_funziona": "Dice il risultato e il vincolo."}, {"testo": "Se lavori seduto, la schiena si allena così.", "categoria": "Domanda", "perche_funziona": "Chiama in causa l’uomo che lavora in ufficio."}, {"testo": "Il tavolo di casa batte la sbarra, ecco perché.", "categoria": "Mito", "perche_funziona": "Smonta il mito dell’attrezzo."}], "script_riscritto": "Hook: Schiena forte senza sbarra, con tre oggetti di casa. (Dany al tavolo, a mezzo busto.)\nBody: Il primo è il tavolo: ti metti sotto, afferri il bordo e tiri il petto verso l’alto. Il secondo è un asciugamano chiuso in una porta: tiri per dieci secondi. Il terzo è lo zaino con dei libri dentro. (Mostra gli oggetti uno alla volta.)\nCTA: Salva il video e provalo stasera, tre serie.", "caption_riscritta": "Salvalo e provalo stasera.", "punteggio_atteso": 90}}'::jsonb,
    punteggio_totale = 82, punteggio_fascia = 'pubblicare_dopo_ritocchi', punteggio_tipo = 'mof',
    versione_guida = '2026-10-16.1',
    fonti = coalesce(fonti, '{}'::jsonb) || '{"punteggio":"si"}'::jsonb
where id = 'a1000000-0000-4000-8000-000000000001' and punteggio is null;
-- SeedReel13
update public.marketing_analisi
set punteggio = '{"versione": 1, "tipo": "mof", "tipo_origine": "dichiarato", "motivo_classificazione": "Prova a spiegare un concetto di alimentazione, ma senza passi: struttura Hook, Teach, Apply assente.", "durata_stimata_secondi": 25, "hook": {"testo": "Oggi ti spiego una cosa sui carboidrati.", "parole": 7, "cita_icp": false}, "totale_grezzo": 40.5, "penalita_totali": 0, "totale": 41, "fascia": "scartare", "limiti_applicati": [], "violazioni_formali": 0, "altre_violazioni_formali": [], "criteri": [{"id": "H", "nome": "Hook", "peso": 20, "voto_modello": 3, "voto": 3, "punteggio": 6, "tetto": null, "citazione": "Oggi ti spiego una cosa sui carboidrati.", "citazione_trovata": true, "motivazione": "È una presentazione, senza posta in gioco né problema dell’ICP.", "correzione": "Aprire con il problema: «Togli i carboidrati e la pancia resta»."}, {"id": "EV", "nome": "Valore educativo (Hook, Teach, Apply)", "peso": 25, "voto_modello": 3, "voto": 3, "punteggio": 7.5, "tetto": null, "citazione": "Ci sono tanti modi di vederla", "citazione_trovata": true, "motivazione": "Non c’è un consiglio: la promessa non è mantenuta.", "correzione": "Dare una regola sola, con un esempio di giornata."}, {"id": "CH", "nome": "Chiarezza e semplicità", "peso": 10, "voto_modello": 6, "voto": 6, "punteggio": 6, "tetto": null, "citazione": "dipende da cosa vuoi ottenere e da come ti alleni", "citazione_trovata": true, "motivazione": "Frasi corte ma astratte.", "correzione": "Sostituire con un numero di porzioni."}, {"id": "ID", "nome": "Identificazione ICP", "peso": 10, "voto_modello": 4, "voto": 4, "punteggio": 4, "tetto": null, "citazione": "Oggi ti spiego una cosa sui carboidrati.", "citazione_trovata": true, "motivazione": "Nessun pain riconoscibile: parla a tutti.", "correzione": "Parlare a chi si allena a casa tre volte a settimana."}, {"id": "TV", "nome": "Tono di voce e autorevolezza", "peso": 10, "voto_modello": 6, "voto": 6, "punteggio": 6, "tetto": null, "citazione": "Ci sono tanti modi di vederla", "citazione_trovata": true, "motivazione": "Formula generica, poco da Dany.", "correzione": "Dire cosa fa lui, con un numero."}, {"id": "AP", "nome": "Applicabilità concreta", "peso": 10, "voto_modello": 2, "voto": 2, "punteggio": 2, "tetto": null, "citazione": "Ne parlo qui sotto nella didascalia.", "citazione_trovata": true, "motivazione": "Nessuna azione: rimanda alla didascalia.", "correzione": "Chiudere con una cosa da fare stasera."}, {"id": "RL", "nome": "Ritmo e lunghezza", "peso": 5, "voto_modello": 7, "voto": 7, "punteggio": 3.5, "tetto": null, "citazione": "Ne parlo qui sotto nella didascalia.", "citazione_trovata": true, "motivazione": "Breve ma senza valore da guadagnare il posto.", "correzione": "Togliere la frase finale."}, {"id": "CT", "nome": "CTA coerente con MOF", "peso": 5, "voto_modello": 4, "voto": 4, "punteggio": 2, "tetto": null, "citazione": "Ne parlo qui sotto nella didascalia.", "citazione_trovata": true, "motivazione": "Rimanda alla didascalia senza un motivo.", "correzione": "Una sola azione dentro il video."}, {"id": "CA", "nome": "Caption", "peso": 3, "voto_modello": 5, "voto": 5, "punteggio": 1.5, "tetto": null, "citazione": "", "citazione_trovata": true, "motivazione": "Presente ma senza un invito chiaro.", "correzione": "Solo CTA con parola chiave."}, {"id": "CF", "nome": "Conformità formale", "peso": 2, "voto_modello": 10, "voto": 10, "punteggio": 2, "tetto": null, "citazione": "", "citazione_trovata": true, "motivazione": "Calcolata dal gestionale: nessuna violazione.", "correzione": "Nessuna correzione."}], "penalita": [], "punti_di_forza": ["Audio chiaro e luce accettabile."], "problemi_prioritari": [{"ordine": 1, "criterio": "EV", "nome": "Valore educativo (Hook, Teach, Apply)", "problema": "Non dà nessun consiglio.", "impatto_punti": 17.5}, {"ordine": 2, "criterio": "H", "nome": "Hook", "problema": "L’hook è una presentazione.", "impatto_punti": 14}, {"ordine": 3, "criterio": "AP", "nome": "Applicabilità concreta", "problema": "Non dice cosa fare.", "impatto_punti": 8}], "confronto_benchmark": null, "segnalazioni": [], "rifacimento": {"istruzioni": ["Aprire con il problema dell’ICP.", "Dare una regola sola con un esempio di giornata.", "Chiudere con un’azione per stasera."], "hook_alternativi": [{"testo": "Togli i carboidrati e la pancia resta: ecco perché.", "categoria": "Errore", "perche_funziona": "Nomina l’errore tipico del target."}, {"testo": "Quanti carboidrati servono a chi si allena a casa?", "categoria": "Domanda", "perche_funziona": "Posta in gioco concreta."}, {"testo": "Il mito dei carboidrati la sera, smontato in 30 secondi.", "categoria": "Mito", "perche_funziona": "Dissonanza con una credenza diffusa."}], "script_riscritto": "Hook: Togli i carboidrati e la pancia resta: ecco perché. (Dany a mezzo busto.)\nBody: Nei giorni di allenamento mangi una porzione in più a pranzo, nei giorni di riposo le porzioni di sempre. (Mostra il piatto.)\nCTA: Provalo questa settimana e scrivimi CARBO.", "caption_riscritta": "Scrivimi CARBO.", "punteggio_atteso": 78}}'::jsonb,
    punteggio_totale = 41, punteggio_fascia = 'scartare', punteggio_tipo = 'mof',
    versione_guida = '2026-10-16.1',
    fonti = coalesce(fonti, '{}'::jsonb) || '{"punteggio":"si"}'::jsonb
where id = 'a1000000-0000-4000-8000-000000000003' and punteggio is null;

-- the first idea of SeedDemo01 is already in the calendar
insert into public.marketing_contenuti (id, tipo, nome, reel_type, formato, stato, messaggio, bozza, commenti, da_analisi, da_idea)
select 'ccccccc2-0000-4000-8000-000000000001'::uuid, 'reel', 'Schiena da scrivania: tre esercizi in pausa pranzo', 'education',
       'raw_talking_head', 'not_started',
       E'Chi lavora seduto ha bisogno di pochi minuti mirati, non di un''ora in palestra.\n\nPerché: il tema della schiena da scrivania porta lead in target.',
       E'Hook: Lavori seduto? Questi tre minuti ti salvano la schiena.\nLine: Esercizio 1: la tirata con l''asciugamano nella porta.\nLine: Esercizio 2: il rematore sotto il tavolo.\nLine: Esercizio 3: la posizione del bambino con le braccia lunghe.\nCTA: Salva il video e fallo domani a pranzo.',
       E'Idea di Claude dall''analisi del reel di ' || to_char(i.pubblicato_il at time zone 'Europe/Rome', 'DD/MM/YYYY') || E': ' || i.permalink,
       'a1000000-0000-4000-8000-000000000001'::uuid, 0
from public.instagram_contenuti i
where i.shortcode = 'SeedDemo01'
  and exists (select 1 from public.marketing_analisi a where a.id = 'a1000000-0000-4000-8000-000000000001')
on conflict (id) do nothing;
