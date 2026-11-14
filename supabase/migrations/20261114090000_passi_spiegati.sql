-- 1.85.0: every step of the onboarding says exactly what to do, with the links (Dany, 14/11/2026:
-- «ogni step deve essere spiegato esattamente cosa fare… esattamente come spiegato qui con i vari link»,
-- the Notion page «Settimana di test di valutazione» and the guides it links: Coach Plus, the photos,
-- Yazio, the measurements, the videos of the exercises, the equipment, the SMART goal).
--
-- Only contents: no table, no function, no permission changes.
-- * The CMS blocks of the steps test, obiettivo, regole and of the page after the launch are rewritten
--   only while they are still the seed's words (a block Dany has already edited stays as he wrote it);
--   the new blocks are added once (by step and title).
-- * The five resource modules of the Aula, still drafts without lessons as 1.83.0 created them, get
--   their lessons from the Notion guides and are published (the client sees them, also before the
--   launch: they were already «Aperto durante l'onboarding»). A module Dany has touched stays as it is.
-- The ids of the blocks do not change: the ticks of the test week stay on their items.

create function pg_temp.riscrivi(
  p_pagina text,
  p_passo text,
  p_ordine int,
  p_titolo_prima text,
  p_corpo_prima text,
  p_titolo text,
  p_corpo text,
  p_url text default null
) returns void
language sql
as $$
  update public.contenuti_blocchi b
  set titolo = p_titolo,
      corpo = p_corpo,
      url = coalesce(p_url, b.url)
  where b.versione_flusso = 1
    and b.pagina = p_pagina
    and b.passo is not distinct from p_passo
    and b.ordine = p_ordine
    and b.titolo is not distinct from p_titolo_prima
    and b.corpo is not distinct from p_corpo_prima;
$$;

create function pg_temp.aggiungi(
  p_pagina text,
  p_passo text,
  p_ordine int,
  p_tipo text,
  p_titolo text,
  p_corpo text,
  p_youtube text default null,
  p_url text default null,
  p_obbligatorio boolean default false
) returns void
language sql
as $$
  insert into public.contenuti_blocchi (versione_flusso, pagina, passo, ordine, tipo, titolo, corpo, youtube_id, url, obbligatorio)
  select 1, p_pagina, p_passo, p_ordine, p_tipo, p_titolo, p_corpo, p_youtube, p_url, p_obbligatorio
  where not exists (
    select 1 from public.contenuti_blocchi b
    where b.versione_flusso = 1 and b.pagina = p_pagina and b.passo is not distinct from p_passo
      and b.titolo is not distinct from p_titolo and b.tipo = p_tipo
  );
$$;

-- ---------------------------------------------------------------------------
-- 1. The test week, as the Notion page
-- ---------------------------------------------------------------------------
select pg_temp.riscrivi('passo', 'test', 1,
  'La settimana test',
  'Questa settimana raccogliamo i tuoi dati di partenza. Spunta ogni voce quando l''hai fatta.',
  'La settimana test',
  E'Questa è la fase che serve al tuo coach per costruire la programmazione sulla tua situazione. Il percorso parte quando hai completato tutti i compiti qui sotto.\n\n'
  || E'**Leggi con attenzione ogni punto e fai i compiti nell''ordine in cui sono scritti**: saltarne anche solo uno rallenta la creazione della tua programmazione.\n\n'
  || 'Quando hai finito un compito, spuntalo.');

select pg_temp.riscrivi('passo', 'test', 2,
  'Registrati su Coach Plus e avvisa il tuo coach',
  'Usa il link che ti ha mandato il tuo coach, poi scrivigli nel gruppo privato.',
  '1. Registrati su Coach Plus e avvisa il tuo coach',
  E'Coach Plus è l''app dove il tuo coach ti carica i test, gli allenamenti e le indicazioni alimentari.\n\n'
  || E'1. Registrati con i tuoi dati da [questo link](https://coachplus.app/register-client?coachId=1af66566-5c89-4a69-bb70-ec262643370a&coachName=Ivan%20Montagnolo).\n'
  || E'2. Scarica l''app: [iPhone](https://apps.apple.com/it/app/coachplus/id1576158679) oppure [Android](https://play.google.com/store/apps/details?id=com.coachplus.app).\n'
  || E'3. Entra con l''account che hai appena creato e attiva le notifiche, così non perdi i commenti del tuo coach.\n'
  || E'4. Scrivi al tuo coach nel gruppo Telegram che ti sei registrato: ti carica i test in app.\n\n'
  || 'Come si usa l''app: [guarda il video](https://youtube.com/shorts/WPmJr02_jLQ). Per qualsiasi dubbio sull''app scrivi nel tuo gruppo Telegram.');

select pg_temp.riscrivi('passo', 'test', 3,
  'Carica 3 foto del fisico su Coach Plus',
  'Nella sezione Progressi: di fronte, di lato e di schiena.',
  '2. Carica le 3 foto del fisico su Coach Plus',
  E'Nella sezione **Progressi** di Coach Plus carica 3 foto in intimo:\n\n'
  || E'- una di fronte;\n- una di lato, destro o sinistro;\n- una di schiena.\n\n'
  || E'**Come scattarle:**\n\n'
  || E'- al mattino, prima di fare colazione;\n'
  || E'- con luce naturale e il corpo non in ombra;\n'
  || E'- con tutto il corpo nell''inquadratura, rilassato;\n'
  || E'- sempre nella stessa stanza, con la stessa luce e lo stesso intimo, così le foto dei prossimi mesi si possono confrontare.\n\n'
  || 'Le rifarai ogni 4 settimane. La guida con tutti i dettagli è nell''Aula, «Come fare le foto al tuo fisico».');

select pg_temp.riscrivi('passo', 'test', 4,
  'Traccia quello che mangi per almeno 5 giorni',
  'Con Yazio, e ogni sera scrivi kcal e macro nel questionario giornaliero di Coach Plus.',
  '3. Traccia quello che mangi per almeno 5 giorni',
  E'1. Scarica l''app gratuita Yazio: [iPhone](https://apps.apple.com/it/app/yazio-ai-calorie-tracker/id946099227) oppure [Android](https://play.google.com/store/apps/details?id=com.yazio.android).\n'
  || E'2. Traccia ogni alimento e ogni bevanda per almeno 5 giorni di fila: [guarda come si fa](https://youtu.be/MQyQ3gvHdqo).\n'
  || E'3. Ogni sera fai lo screenshot del riepilogo di Yazio (kcal, carboidrati, proteine e grassi), caricalo nel questionario giornaliero in cima a Coach Plus e mandalo anche nel tuo gruppo Telegram.\n\n'
  || E'**Da sapere:**\n\n'
  || E'- La versione gratuita di Yazio basta: non serve l''abbonamento.\n'
  || E'- Le calorie che ti consiglia Yazio sono una stima: non sono quelle che seguirai. Ne parli con il tuo coach.\n'
  || '- Se non riesci a pesare i cibi, con Yazio Premium fotografi il pasto nella sezione AI: [guarda come](https://www.youtube.com/watch?v=ilbE1FzZXLw).');

select pg_temp.riscrivi('passo', 'test', 5,
  'Prendi le circonferenze',
  'Con il metro da sarto, e caricale su Coach Plus.',
  '4. Misura le circonferenze e caricale su Coach Plus',
  E'Misura vita, torace e braccia con un metro da sarto seguendo [questo video](https://youtu.be/jLBuG39emNQ), poi carica le misure su Coach Plus.\n\n'
  || 'Non hai il metro da sarto? [Lo trovi qui](https://amzn.eu/d/07JdsgDa).');

select pg_temp.riscrivi('passo', 'test', 6,
  'Fai i test fisici e carica i video',
  '[Da scrivere: quante sessioni di test (2 sessioni o 3 giorni) e cosa contengono.]',
  '5. Fai i test e carica i video su Coach Plus',
  E'Gli esercizi dei test te li carica il tuo coach su Coach Plus. Falli il prima possibile: prima li finisci, prima ricevi la programmazione.\n\n'
  || E'**Prima di iniziare:**\n\n'
  || E'- **Attrezzatura:** per ora non devi comprare niente. Se il tuo coach ti chiede una sbarra o gli anelli: [sbarra da porta](https://www.decathlon.it/tutti-gli-sport/bodybuilding/barre-di-trazione), solo se lo stipite è solido e stabile ([come montarla](https://www.youtube.com/watch?v=jx9_2sqDP50)), e [anelli](https://amzn.eu/d/03x9RIt0).\n'
  || E'- **Come riprenderti:** di lato per push up, plank e superman; da dietro per australian pull up e trazioni; di fronte, a 45 gradi, per tutti gli altri esercizi e quando sei in dubbio.\n\n'
  || E'**Come caricare i video:** filma l''ultima serie di ogni esercizio. Su Coach Plus apri l''allenamento e, per ogni esercizio, tocca «Carica allegato»: [guarda come in 60 secondi](https://www.youtube.com/shorts/cbA7Hu0pJbw).\n\n'
  || 'Consiglio: con un [cavalletto](https://amzn.eu/d/igatkIJ) risparmi metà del tempo. Carica il video e scrivi il feedback nella pausa tra una serie e l''altra: mentre riposi ti porti avanti.');

-- ---------------------------------------------------------------------------
-- 2. The goal: Coach Plus first (the goal is there), then what SMART means and Dany's video
-- ---------------------------------------------------------------------------
select pg_temp.riscrivi('passo', 'obiettivo', 1,
  'Il tuo obiettivo su Coach Plus',
  'Il tuo obiettivo SMART e le tue milestone sono su Coach Plus, impostati dal coach dopo la call. Aprili, leggili con calma e poi torna qui.',
  'Il tuo obiettivo su Coach Plus',
  E'Dopo la call il tuo coach scrive su Coach Plus il tuo obiettivo SMART e le tue milestone. Per vederli:\n\n'
  || E'1. Se non l''hai già fatto in call, registrati su Coach Plus da [questo link](https://coachplus.app/register-client?coachId=1af66566-5c89-4a69-bb70-ec262643370a&coachName=Ivan%20Montagnolo).\n'
  || E'2. Scarica l''app, [iPhone](https://apps.apple.com/it/app/coachplus/id1576158679) oppure [Android](https://play.google.com/store/apps/details?id=com.coachplus.app), ed entra con il tuo account.\n'
  || E'3. Apri il tuo obiettivo, leggilo con calma e poi torna qui.\n\n'
  || E'**Perché un obiettivo SMART.** Un obiettivo chiaro è quasi il doppio più probabile da raggiungere: il cervello smette di trattarlo come un''idea e inizia a trattarlo come una priorità. SMART vuol dire:\n\n'
  || E'- **Specifico:** cosa vuoi ottenere, esattamente. Non «mettermi in forma», ma «aumentare la massa della parte superiore del corpo».\n'
  || E'- **Misurabile:** devi poter dire senza dubbi se stai migliorando. «Passare da 70 a 75 kg», «arrivare a 10 trazioni pulite».\n'
  || E'- **Raggiungibile:** sfidante ma possibile, dal tuo punto di partenza. Non «fisico da copertina in 2 mesi», ma «3-4 kg di massa nei prossimi 6 mesi».\n'
  || E'- **Rilevante:** deve contare per te, non per gli altri.\n'
  || '- **Temporale:** con una scadenza. «Entro 6 mesi voglio…».');

select pg_temp.riscrivi('passo', 'obiettivo', 2,
  'Apri Coach Plus',
  '[Da scrivere: il link di Coach Plus.]',
  'Registrati su Coach Plus',
  null,
  'https://coachplus.app/register-client?coachId=1af66566-5c89-4a69-bb70-ec262643370a&coachName=Ivan%20Montagnolo');

select pg_temp.aggiungi('passo', 'obiettivo', 3, 'video',
  'Come si definisce un obiettivo SMART',
  'In questo video Dany ti mostra passo dopo passo come definire il tuo obiettivo in modo chiaro, realistico e potente.',
  '18stnA_iVhU');

-- ---------------------------------------------------------------------------
-- 3. Two rules of Dany's «Come eseguire gli allenamenti»
-- ---------------------------------------------------------------------------
select pg_temp.aggiungi('passo', 'regole', 10, 'regola',
  'Sempre testo, mai vocali',
  'Scrivi al tuo coach con un messaggio di testo: ti risponde più in fretta e senza perdere dettagli. Se non ti risponde entro 24 ore, riscrivigli: non perde messaggi.',
  null, null, true);

select pg_temp.aggiungi('passo', 'regole', 11, 'regola',
  'Se salti un allenamento, avvisa',
  'Appena sai che salti un allenamento scrivilo nel tuo gruppo Telegram: basta un messaggio, e il coach adatta il programma. Un giorno saltato non è un problema, una settimana in silenzio sì.',
  null, null, true);

-- ---------------------------------------------------------------------------
-- 4. After the launch: the real Coach Plus links and how to train
-- ---------------------------------------------------------------------------
update public.contenuti_blocchi b
set ordine = 4
where b.versione_flusso = 1 and b.pagina = 'dopo_lancio' and b.ordine = 3 and b.titolo = 'Apri Yazio'
  and b.url = 'https://www.yazio.com/it'
  and exists (select 1 from public.contenuti_blocchi x
              where x.versione_flusso = 1 and x.pagina = 'dopo_lancio' and x.ordine = 2 and x.url = 'https://da-scrivere.invalid/coach-plus');

select pg_temp.riscrivi('dopo_lancio', null, 2,
  'Apri Coach Plus',
  '[Da scrivere: il link di Coach Plus.]',
  'Coach Plus per iPhone',
  null,
  'https://apps.apple.com/it/app/coachplus/id1576158679');

select pg_temp.aggiungi('dopo_lancio', null, 3, 'pulsante',
  'Coach Plus per Android', null, null,
  'https://play.google.com/store/apps/details?id=com.coachplus.app');

select pg_temp.aggiungi('dopo_lancio', null, 10, 'testo',
  'Come eseguire gli allenamenti',
  E'**Una sola regola da ricordare:** scendi lento, abbastanza da sentire il muscolo lavorare. Sali con intenzione. Nessun rimbalzo tra una ripetizione e l''altra. Tutto il resto è scritto nella scheda; se un esercizio non è chiaro, scrivi al tuo coach su Telegram prima di iniziare, non durante.\n\n'
  || E'**I video:** filma l''ultima serie di ogni esercizio e caricala su Coach Plus dopo ogni allenamento ([come in 60 secondi](https://www.youtube.com/shorts/cbA7Hu0pJbw)). Sull''ultima serie si vedono gli errori di quando sei stanco: corretti quelli, diventi più forte. Il coach li guarda tutti e ti risponde sotto il video.\n\n'
  || E'**Come scrivere al coach:** sempre testo, mai vocali. Se non ti risponde entro 24 ore, riscrivigli.\n\n'
  || E'**Se salti un allenamento:** avvisa su Telegram appena lo sai, così il coach adatta il programma.\n\n'
  || '**Alimentazione:** su Coach Plus, in Nutrizione › Piani alimentari, trovi un piano di esempio, le alternative per ogni alimento e le linee guida.');

-- ---------------------------------------------------------------------------
-- 5. The Aula: the five guides of the Notion dashboard, published
-- ---------------------------------------------------------------------------
create temporary table aula_guide (titolo text, lezione int, tipo text, l_titolo text, corpo text, youtube text) on commit drop;

insert into aula_guide values
('Come utilizzare Coach Plus', 1, 'testo', 'Registrati e scarica l''app',
 E'Coach Plus è la tua app per tutto quello che riguarda allenamento e alimentazione: lì il coach ti assegna gli allenamenti e monitora i tuoi progressi.\n\n'
 || E'1. Registrati con i tuoi dati da [questo link](https://coachplus.app/register-client?coachId=1af66566-5c89-4a69-bb70-ec262643370a&coachName=Ivan%20Montagnolo).\n'
 || E'2. Scarica l''app: [iPhone](https://apps.apple.com/it/app/coachplus/id1576158679) oppure [Android](https://play.google.com/store/apps/details?id=com.coachplus.app).\n'
 || E'3. Attiva le notifiche di Coach Plus, così non perdi i commenti del tuo coach.\n\n'
 || 'Per qualsiasi dubbio o difficoltà con l''app scrivi nel tuo gruppo Telegram.', null),
('Come utilizzare Coach Plus', 2, 'video', 'Come usare Coach Plus al meglio', null, 'WPmJr02_jLQ'),

('Come fare le foto al tuo fisico', 1, 'testo', 'Come scattare le foto di monitoraggio',
 E'**Ogni 4 settimane**, alla fine di ogni programmazione, scatta e carica su Coach Plus, nella sezione Progressi, 3 foto in intimo:\n\n'
 || E'- una foto di fronte;\n- una foto di lato, destro o sinistro;\n- una foto di schiena.\n\n'
 || E'Servono per valutare la tua composizione corporea e vedere i cambiamenti nel corso dei mesi. Dimenticarle rallenta il raggiungimento dell''obiettivo.\n\n'
 || E'**Indicazioni di scatto:**\n\n'
 || E'- scatta al mattino, preferibilmente prima di fare colazione;\n'
 || E'- solo intimo;\n'
 || E'- luce possibilmente naturale, e il corpo non in ombra;\n'
 || E'- tutto il corpo visibile, rilassato;\n'
 || '- condizioni ripetibili: stessa stanza, stessa luce, stesso intimo, così le foto si possono confrontare.', null),

('Come tracciare quello che mangi', 1, 'testo', 'Traccia quello che mangi con Yazio',
 E'Vogliamo osservare in modo preciso quello che mangi e analizzare le tue abitudini alimentari.\n\n'
 || E'1. Scarica l''app gratuita Yazio: [iPhone](https://apps.apple.com/it/app/yazio-ai-calorie-tracker/id946099227) oppure [Android](https://play.google.com/store/apps/details?id=com.yazio.android).\n'
 || E'2. Traccia ogni alimento e ogni bevanda per almeno 5 giorni di fila.\n'
 || E'3. Ogni sera, a fine giornata, carica lo screenshot del riepilogo (kcal, carboidrati, proteine e grassi) nel questionario giornaliero, in cima a Coach Plus.\n\n'
 || E'Ripeti il tracciamento una settimana al mese, per vedere i progressi e decidere le modifiche con il tuo coach.\n\n'
 || E'**Indicazioni importanti:**\n\n'
 || E'- Non serve l''abbonamento a pagamento: la versione gratuita è tutto quello che ci serve.\n'
 || E'- Le calorie che ti consiglia Yazio sono una stima: non sono quelle che dovrai seguire. Ne parli con il tuo coach.\n\n'
 || E'**Due modi per tracciare, scegli il più comodo:**\n\n'
 || E'- **Se riesci a pesare i cibi:** traccia tutto su Yazio, così abbiamo i numeri precisi.\n'
 || '- **Se non riesci a pesarli:** con Yazio Premium mandi una foto del pasto nella sezione AI, e riusciamo comunque a monitorare tutto.', null),
('Come tracciare quello che mangi', 2, 'video', 'Come tracciare l''alimentazione su Yazio', null, 'MQyQ3gvHdqo'),
('Come tracciare quello che mangi', 3, 'video', 'Tracciare con la foto del pasto (Yazio Premium)', null, 'ilbE1FzZXLw'),

('Come registrare gli allenamenti', 1, 'testo', 'Come fare le riprese',
 E'I video della settimana di test, e poi di ogni allenamento, vanno caricati su Coach Plus.\n\n'
 || E'**Da quale lato riprenderti:**\n\n'
 || E'- di lato per push up, plank e superman;\n'
 || E'- da dietro per australian pull up e trazioni;\n'
 || E'- di fronte, a 45 gradi, per tutti gli altri esercizi e quando sei in dubbio.\n\n'
 || E'**Come caricarli:** su Coach Plus manda l''ultima serie di ogni esercizio della programmazione. Apri l''app, apri l''allenamento e, per ogni esercizio, tocca «Carica allegato».\n\n'
 || E'**Consigli che ti fanno risparmiare metà del tempo:**\n\n'
 || E'- usa un cavalletto, [per esempio questo](https://amzn.eu/d/igatkIJ);\n'
 || '- carica il video e scrivi il feedback dell''allenamento nella pausa tra una serie e l''altra: mentre riposi ti porti avanti.', null),
('Come registrare gli allenamenti', 2, 'video', 'Caricare i video su Coach Plus in 60 secondi', null, 'cbA7Hu0pJbw'),
('Come registrare gli allenamenti', 3, 'testo', 'Come eseguire gli allenamenti',
 E'**Una sola regola da ricordare:** scendi lento, abbastanza da sentire il muscolo lavorare. Sali con intenzione. Nessun rimbalzo tra una ripetizione e l''altra.\n\n'
 || E'Tutto il resto è scritto nella scheda. Se un esercizio non è chiaro, scrivi al tuo coach su Telegram prima di iniziare, non durante.\n\n'
 || E'**Perché l''ultima serie:** sull''ultima serie si vedono gli errori che compaiono quando sei stanco. Sono esattamente quelli che, corretti, ti fanno diventare più forte. Il coach li guarda tutti e ti risponde sotto il video.\n\n'
 || E'**Come comunicare con il coach:** niente vocali, sempre testo. Sul testo ti risponde più in fretta e senza perdere dettagli. Se non ti risponde entro 24 ore, scrivigli «Buongiorno, ti scrivo di nuovo: hai ricevuto il mio messaggio?».\n\n'
 || E'**Se salti un allenamento:** avvisa su Telegram appena lo sai. Non serve spiegare tutto: con un messaggio il coach adatta il programma. Un giorno saltato non è un problema, una settimana in silenzio sì.\n\n'
 || '**Alimentazione:** su Coach Plus, in Nutrizione › Piani alimentari, trovi un piano di esempio, le alternative per ogni alimento e le linee guida.', null),

('Attrezzatura da comprare', 1, 'testo', 'Cosa ti serve',
 E'Per il momento, nel tuo percorso non devi comprare nessuna attrezzatura. Quando il tuo coach te lo chiede:\n\n'
 || E'- [sbarra da porta](https://www.decathlon.it/tutti-gli-sport/bodybuilding/barre-di-trazione), solo se lo stipite della porta è solido e stabile;\n'
 || E'- [anelli](https://amzn.eu/d/03x9RIt0);\n'
 || '- [metro da sarto](https://amzn.eu/d/07JdsgDa), per le circonferenze.', null),
('Attrezzatura da comprare', 2, 'video', 'Come montare la sbarra da porta senza rischi', null, 'jx9_2sqDP50');

with moduli as (
  select m.id, m.titolo
  from public.aula_moduli m
  where m.stato = 'bozza'
    and m.titolo in (select distinct titolo from aula_guide)
    and not exists (select 1 from public.aula_lezioni l where l.modulo_id = m.id)
), nuove as (
  insert into public.aula_lezioni (modulo_id, titolo, ordine, tipo, corpo, youtube_id, obbligatoria, pubblicata)
  select mo.id, g.l_titolo, g.lezione, g.tipo, g.corpo, g.youtube, false, true
  from moduli mo
  join aula_guide g on g.titolo = mo.titolo
  returning modulo_id
)
update public.aula_moduli m
set stato = 'pubblicato'
where m.id in (select distinct modulo_id from nuove);

drop function pg_temp.riscrivi(text, text, int, text, text, text, text, text);
drop function pg_temp.aggiungi(text, text, int, text, text, text, text, text, boolean);
