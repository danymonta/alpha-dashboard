import 'server-only'

/**
 * Percorso Alpha's guide to the content and its scoring system, as Dany wrote it
 * (1.0, 16/10/2026), in the app's code (1.39.0, CLAUDE.md sections 26 and 30).
 * Three blocks, in Italian, in Markdown: the context (brand and offer), the
 * guidelines (Part B: tone, format, funnel, hooks, CTA, caption, stories,
 * templates, proof, do and don't) and the scoring (Part C: procedure, weights,
 * criteria with their anchors, penalties and caps, bands, the redo protocol and
 * the hook examples). The ideal client is NOT here: it is the one file
 * lib/marketing/icp.ts. The JSON output of the original (section 25) is replaced
 * by the schema of the request: the totals, the weighted scores, the penalties,
 * the caps and the band are computed by the code (lib/marketing/punteggio/tabelle.ts).
 *
 * NO PRICES, no payment terms, no income figure, no name of a client: the video
 * editor and marketing read this through Claude (the `guida_contenuti` tool) and
 * they never read the price list (CLAUDE.md sections 6 and 26). A test asserts it
 * (tests/punteggio-guida.test.ts). To change the guide, change the text here and
 * GUIDA_AGGIORNATA_IL together: the next score is made with the new version.
 */

/** The day of the guide's text, YYYY-MM-DD (it is part of the version of every score). */
export const GUIDA_AGGIORNATA_IL = '2026-10-16'

export const GUIDA_CONTESTO = `## 1. Brand

Percorso Alpha è un percorso di trasformazione fisica per uomini sopra i 25 anni che vogliono costruire massa muscolare e definizione allenandosi a casa a corpo libero, senza palestra e senza integratori. Il fondatore è Dany Monta, fitness coach.

Valori: Disciplina, Avventura, Miglioramento costante. Nei workbook compaiono anche Semplicità (se il piano non è sostenibile, non funziona) e Trasformazione mente e corpo.

Missione dichiarata: aiutare uomini impegnati che si sentono insicuri nel loro corpo a costruire un fisico forte ed estetico allenandosi 2 o 3 volte a settimana da casa, senza palestra né integratori.

Posizionamento: l'allenamento è lo strumento per ottenere sicurezza personale, energia e autostima. Il miglioramento fisico non è il fine ma il mezzo.

Storia di Dany (fonti per i contenuti personali): partenza a 63 kg, magro, demotivato, poca sicurezza nel proprio fisico, nessuna palestra e nessuna strategia adatta. Oggi 85 kg nei reel recenti e 88 kg nel workbook; circa 20-25 kg di massa pulita in circa due anni di allenamento a casa a corpo libero, lavorando fino a 12 ore al giorno. Primo vero progresso dopo 1 mese di allenamento serio e tracciato: la prima trazione. Dopo 3 mesi tutti notavano il cambiamento. Pectus excavatum come storia personale di forte identificazione. Regola: i numeri personali devono restare coerenti tra contenuti; se un contenuto cita un valore diverso da quelli sopra, segnalalo come "numero da verificare".

## 2. Il cliente ideale

Il cliente ideale è descritto in <icp>: vale quello. Dove la guida e l'ICP dicono cose diverse sul cliente (età, situazione, pain), vale l'ICP.

## 3. Offerta (per coerenza di proof e CTA)

Il contenuto non deve mai promettere più di quanto l'offerta eroga.

- Percorso di 6 mesi.
- Programma settimanale personalizzato, settimana di test iniziale, revisione video dell'esecuzione, supporto su Telegram con risposta entro 24 ore, call di check-up periodiche (la frequenza varia: verificare prima di citarla), app di allenamento dove si registra tutto, un head coach e preparatore.
- Promessa verificabile: in 3 mesi almeno 3 kg di massa muscolare in più, maggiore definizione, maggiore forza e consapevolezza del movimento, quindi più sicurezza di sé.
- Il meccanismo: sistema misurabile (progressione, tracciamento di peso, calorie e macro, esecuzione corretta, feedback) adattato allo stile di vita, non stravolgendolo. Allenamenti da 2 o 3 sedute a settimana, 30-45 minuti.
- Linguaggio formale con il cliente: "investimento" e mai "prezzo" o "costo"; "versamento" e mai "pagamento".
- Nelle CTA si può dire "90 giorni" e vendere 6 mesi: l'obiettivo si raggiunge nei primi 90 giorni, il resto serve a consolidarlo.
- In nessun contenuto, e in nessuna tua risposta, compaiono cifre di denaro o condizioni di pagamento.`.trim()

export const GUIDA_LINEE = `## 4. Tono di voce di Dany

**Come parla (dalle trascrizioni di riferimento).** Prima persona, numeri concreti e verificabili (63 kg, 85 kg, 20 kg di massa pulita, 2 anni, 3 sessioni da 45 minuti, 3 mesi), struttura chiara, frasi brevi, spiegazione pratica dell'esatto allenamento o metodo, riferimento a un allievo reale con risultato concreto (esempio: un allievo, 3 mesi, addome visibile). Chiusura con CTA operativa e semplice: "Se commenti GUIDA te la mando direttamente in chat".

**Registro.** Deciso, autorevole, chiaro. Da guida e mentore, non da influencer. Realismo, competenza, forza. Nessun eccesso motivazionale, nessuna promessa irrealistica. Diretto e concreto: preferisce "zaino pesante, tempo sotto tensione, app Yazio per tracciare il cibo" a formule astratte come "dare al corpo un motivo per costruire".

**Regole di stile obbligatorie.**
- Frasi concise e incisive, dirette al punto.
- Italiano parlato e naturale. Nessun calco dall'inglese (esempio da evitare: "il buco si legge meno" da "reads deeper"). Ogni frase deve suonare come Dany la direbbe davvero in camera.
- Niente emoji. Niente toni amichevoli o colloquiali eccessivi.
- Niente metalinguaggio ("ti mostro", "ecco cosa farò").
- Mai trattini lunghi o medi.
- Accenti sempre presenti.
- Valori da far emergere: disciplina, costanza, crescita personale, miglioramento attraverso il corpo.
- Con un prospect: empatico ma deciso, orientato a fiducia e conversione. Con un cliente: assertivo e sicuro, tono da guida.
- Quando Dany fornisce una bozza o frammenti, si amplifica la sua voce, non la si riscrive in un registro più levigato. Le ripetizioni retoriche dei suoi discorsi personali non si correggono.

**Frasi e formule vietate.**
- "Non è solo fisico. È sicurezza personale." Non è sua e non la vuole in nessun contenuto.
- Frasi a effetto o chiusure retoriche a fine script: si chiude con la CTA.
- Formule astratte e generiche tipo "dare al corpo un motivo per costruire".
- Motivazionale vuoto ("credi in te stesso", "niente è impossibile").
- Promesse tipo "risultati garantiti in X giorni", "fisico da copertina in 30 giorni".
- Gergo tecnico non spiegato.

## 5. Regole di formato e lingua

- Ogni contenuto è intitolato con numero, fase del funnel e hook. Esempio: #1TOF "In 2017 the doctors told me...". Prima tutto il blocco in italiano, poi tutto il blocco in inglese dello stesso contenuto.
- Nelle versioni inglesi usare sempre "pectus excavatum", mai "sunken chest".
- Nelle versioni italiane niente traduzioni letterali: adattamento autentico. Le CTA si localizzano (CHEST diventa PETTO, BACK diventa SCHIENA).
- Se viene dato lo script di Max, si adatta solo ciò che c'è: non aggiungere sezioni, caption o elementi strutturali assenti nell'originale.
- Gli script dei reel sono prosa continua e scorrevole. Le indicazioni visive (cosa inquadrare, cosa mostrare) stanno dentro il testo, tra parentesi o in corsivo, mai in un elenco separato. Nessun elenco puntato negli script.
- Le etichette di sezione consentite sono: Hook, Social proof (opzionale), Body, Caption, CTA. Il Body sviluppa fino a 3 punti, in prosa.
- Le note per l'editor stanno IN CIMA, prima dell'Hook, e contengono solo link di riferimento e istruzioni di formato forniti da Max. Niente indicazioni di montaggio elaborate aggiunte dal sistema.
- Gli esercizi si indicano per categoria di movimento (spinta, tirata, gambe, addome), non con elenchi di nomi di esercizi specifici, salvo che il contenuto sia un tutorial su quell'esercizio.
- Ogni punto del Body chiude con un'azione operativa concreta e nomina lo strumento reale.
- Le obiezioni si disinnescano dentro il punto, non si negano secche (esempio: "non è sbagliato mangiare sano, ma vuol dire tutto e nulla").
- La CTA è integrata alla fine del Body con indicazione visiva (esempio: popup trasformazione sinistra e destra), non come sezione staccata.
- Nei contenuti sul pectus excavatum non banalizzare la soluzione al solo "costruire muscolo": deve passare sempre anche l'importanza della postura.
- Nei prompt per generare immagini di caroselli il protagonista si chiama sempre "Dany", mai "man" o descrizioni generiche.

## 6. Funnel: classificazione dei contenuti

Mappa tra le etichette: Attrazione = TOF, Consapevolezza o Educazione = MOF, Conversione o Vendita = BOF. Nel dataset dei reel: Attraction, Education, Converting.

### TOF: Attrazione (storytelling)
- Obiettivo: far notare Dany alle persone giuste per ciò che ha vissuto, non per come appare. Creare proiezione emotiva e fiducia prima di qualsiasi ragionamento logico. Non educa e non converte: apre una porta.
- Segnali di riconoscimento: racconto in prima persona di un momento, un conflitto, un punto basso, un cambio di identità; voiceover su B-roll autentico; nessun insegnamento strutturato.
- CTA: nessuna CTA dura. Al massimo seguimi o apertura al confronto.
- Lunghezza ideale: 45-60 secondi, fino a 60-90 per la storia completa di trasformazione.
- Formati ricorrenti: storytelling con voiceover, trasformazione before/after raccontata, day in the life, mindset shift.
- Workbook TOF: 3 difficoltà del target, 3 obiettivi, formato, hook.

### MOF: Consapevolezza (educazione)
- Obiettivo: insegnare a risolvere un problema specifico dell'ICP. Costruire fiducia e autorevolezza. Le quattro tipologie del workbook: errori commessi, esperienze personali, miti e credenze, personali (chi è Dany, storia, valori, missione).
- Segnali: struttura Hook, Teach, Apply; un'idea sola; passi o principi chiari.
- CTA: regola standard di Dany: nessuna CTA dura, al massimo follow o risorsa gratuita soft; le CTA con keyword sono riservate ai contenuti di conversione. Eccezione in modalità post virale (vedi sezione 12): ogni MOF fa CTA a una risorsa gratuita.
- Lunghezza ideale: 30-60 secondi (educational 45-60 secondo il CCC, mini script 20-30).

### BOF: Conversione (proof e vendita)
- Obiettivo: far desiderare di lavorare con Dany. Analisi di casi di clienti, trasformazioni, gestione delle obiezioni, meccanismo del percorso.
- Segnali: cliente reale con situazione e risultato, obiezione affrontata, ponte tra problema e percorso, CTA con keyword.
- CTA: keyword con risorsa o invito diretto a lavorare insieme.
- Lunghezza ideale: 30-60 secondi.

### Stories
- Indirette: raccontano aspetti della storia di Dany in comune con il target, senza vendita, restando aperti al confronto con la community. Danno fiducia e fedeltà.
- Dirette: vendita (Simple CTA, Hard CTA).
- Per le stories si indicano sempre testo e immagine da posizionare sotto.

### Distribuzione indicativa
Piano di gioco MMM, luglio: 40% MOF, 35% TOF, 25% BOF. Usare come riferimento di bilanciamento, non come regola per il singolo contenuto.

## 7. Framework CCC (Max Hagan): struttura dei reel

Tre principi: **Clarity** (linguaggio semplice, struttura chiara, esempi specifici), **Conversion** (CTA strategiche, valore, trigger di engagement), **Curiosity** (pattern interrupt, open loop, trigger psicologici).

**Regola della lunghezza (non negoziabile).** Ogni video deve essere il più breve possibile consegnando tutto il valore. Se 60 secondi possono diventare 30, devono essere 30. Un reference video si accorcia del 10-20% se possibile. Dimostrazioni 20-40 s. Tutorial 30-60 s. Educativi 45-60 s. Storie 45-60 s.

**Le 5 parti.**
1. **Hook (0-5 secondi).** Meno di 10 parole. Ferma lo scroll, crea posta in gioco, impatto personale, curiosità immediata. Tipi: basato sul problema ("Stai perdendo X per colpa di Y"), pattern interrupt ("Smetti di fare X finché non vedi questo"), controintuitivo ("Questo X sta distruggendo il tuo Y"), basato sui numeri ("Queste 3 cose uccidono il tuo X").
2. **Selling the Solution (5-15 secondi).** Ponte che costruisce attesa senza rivelare la soluzione. Crea curiosità, credibilità, promette la trasformazione. Breve. La presenza varia per tipo: demo la salta o la riduce a 1-2 s; tutorial 3-5 s; educativo la sezione intera (circa 10 s); storia può espanderla; trasformazione la espande leggermente usando molto il prima e dopo.
3. **Giving the Principle (15-45 secondi).** Consegna il valore promesso: passi chiari, linguaggio semplice (livello terza elementare), esempi specifici, soluzioni dimostrabili, punti concisi.
4. **Making It Applicable (45-55 secondi).** Come implementare subito: "Ecco cosa fare", "Prova questo adesso", "Parti da questo passo". Immediatamente attuabile, risultato chiaro, prossimo passo specifico.
5. **CTA (55-60 secondi).** Risorsa specifica, trigger con keyword nei commenti, beneficio, urgenza. Formato: "Ho creato [risorsa] con [beneficio]. Commenta [KEYWORD] e te la mando".

**I 7 Interest Peak (per la sezione 2).**
1. Risk Reversal: rassicura che ne vale la pena, niente da perdere. Esempio: "Ti richiederà meno di un minuto".
2. Authority Endorsement: prende credibilità da un'autorità del settore.
3. Controversial: valida o sfida l'opinione dello spettatore, crea risposta emotiva. Esempio: "Il 99% di chi guarda non arriverà alla fine".
4. Personal Story: usa la propria social proof. Esempio: "Impara dal mio errore così non succede a te".
5. Negative Assumption: affronta l'obiezione prima che emerga, si distingue dai metodi comuni. Esempio: "E no, non servono pesi né integratori".
6. Hype Up: costruisce attesa per la parte di valore. Esempio: "Volevo tenerlo per me, ma te lo do gratis".
7. Call Out: dice ciò che lo spettatore pensa o fa, crea riconoscimento immediato.

**Adattare un reference video.** Analizzare: struttura e tempi di ogni sezione, tipo e numero di parole dell'hook, quale Interest Peak, struttura del valore, CTA. Mantenere la struttura a 5 parti, adottare gli elementi che funzionano, personalizzare con esperienza e voce propria, migliorare dove il riferimento è debole, ridurre la durata. Verificare semplicità del linguaggio, transizioni chiare, proporzioni dei tempi, valore della risorsa, tagliare ogni parola superflua.

## 8. Storytelling reel (TOF): regole M4.2

- I reel di storytelling sono il motore dell'attrazione. Quando non si ha credibilità, la storia è l'unica cosa che nessuno può replicare.
- Funzionano per proiezione emotiva: lo spettatore vede il proprio dolore nel tuo dolore e i propri dubbi nei tuoi dubbi. Non educano e non convertono: fanno sentire visti.
- La forza sta nella verità, non nel dramma. Le storie migliori sono oneste e dicono ciò che le persone pensano e non dicono (vergogna del corpo, nascondersi dagli eventi sociali, abitudini autodistruttive).
- Elementi dell'arco narrativo: **1. conflitto interno** (una stagione di lotta), **2. punto basso** specifico, **3. realizzazione privata** che ha cambiato il modo di pensare, **4. fase emotiva** (isolamento, burnout, delusione, dubbio su di sé).
- Specificità e "show, don't tell": un anno preciso, una scena concreta (esempio: felpe a 30 gradi perché non sopportava il proprio aspetto in maglietta), non l'aggettivo "insicuro". Non drammatizzare, non esagerare, non condividere il trauma più profondo se non serve.
- Si può raccontare la stessa storia più volte: una sul dolore, una sulla lezione, una sul cambio di identità. Ogni versione attrae persone in momenti diversi.
- Supporto visivo: B-roll semplice, grezzo, autentico (allenamento, camminate, vita quotidiana). Voiceover. Il visivo rafforza, non sostituisce, la voce.
- Bonus: aprire con un anno, un luogo, un momento preciso porta nella scena.

**Hook di storytelling di riferimento** (struttura da riconoscere): "Questo è ____", "Uno dei miei [X] preferiti è [Y]", "Ultimamente ho pensato molto a [X]", "Oggi ho fatto una pazzia...", "Questo è il vero motivo per cui [X] si è trasformato in [Y]", "Ecco come ho iniziato a [X]", "Tutto è iniziato quando [X] ha portato a [Y]", "Quando ero giovane facevo [X], finché non ho imparato [Y]", "Pensavo di non riuscire a superare [X]. Ma grazie a [Y] è stato facile", "Odiavo fare [X], ma è l'unico motivo per cui [Y] ha funzionato", "Ho fatto [X] nel modo sbagliato per anni, finché non è successo [Y]", "Il momento in cui ho smesso di fare [X], [Y] ha iniziato a funzionare", "[X] stava andando benissimo... poi [Y] l'ha rovinato", "Tutto quello che pensavo di sapere su [X] si è ribaltato quando è successo [Y]".

## 9. Reel educativi (MOF): regole M6.5

**Struttura Hook, Teach, Apply.** Hook 0-3 secondi (curiosità sul problema o sul concetto). Teach 3-25 secondi (spiega concetto, principio o soluzione in modo chiaro e conciso). Apply 25-60 secondi (come implementare o cosa fare dopo).

**Tipi di hook educativo.** Basato sul problema (identifica una difficoltà e promette la soluzione), smonta-mito (crea dissonanza cognitiva), gap di curiosità (concetto intrigante senza spiegazione immediata), risultato.

**Principi.**
- Il pubblico è in modalità scroll, non studio. Il contenuto deve sembrare un amico competente che spiega una cosa importante in modo che finalmente abbia senso.
- Regola del tre: al massimo tre punti.
- Il consiglio migliore per primo. Prima il consiglio, poi la spiegazione. Definire ogni termine. Usare analogie.
- Linguaggio conversazionale, domande retoriche per coinvolgere, ritmo ed enfasi variati, rilevanza immediata ripetuta ("perché a te interessa").
- Offrire alternative e modifiche perché non tutti possono applicare il consiglio esattamente come presentato.
- Bilanciare autorevolezza e accessibilità.
- Strutture per tipo: istruzione tecnica (problema che la tecnica risolve, passi, come esercitarsi e progredire), troubleshooting (sintomi, perché accade, soluzioni per scenari diversi), basato su principi (situazione in cui il principio conta, principio e perché funziona, come usarlo in contesti diversi), smonta-mito (credenza sfidata, perché è sbagliata e cosa è vero, come applicare l'approccio corretto).

**Errori da penalizzare.** Info dump (dire tutto quello che si sa), gergo senza spiegazione, teoria senza applicazione, eccesso di complessità, voler avere ragione invece di essere utili.

**Tipologie MOF per l'ICP (workbook consapevolezza).**
- Errori commessi: cosa sbaglia il target, cosa dovrebbe fare (progressione settimanale sui fondamentali, tracciare allenamento e calorie, allenare tutto il corpo, meno volume e più qualità, routine sostenibile "come lavarsi i denti"), cosa gli manca (guida esperta, struttura, controllo, costanza, supporto e feedback).
- Esperienze personali: quando non riuscivo a mettere massa (4-5 allenamenti con video YouTube diversi, 63 kg, poi 2 allenamenti programmati e tracciati e salita di peso); il primo progresso vero (la prima trazione dopo 1 mese tracciato, il cambiamento è nel modo di ragionare); la svolta mentale (commenti sinceri dopo 3 mesi, il fisico cambia fuori quando smetti di cercare scorciatoie dentro).
- Miti e credenze: casa e pesi, allenarsi ogni giorno, cardio per definire, sudare, risultati in 2 settimane.
- Personali: chi c'è dietro, missione, valori.

**Hook educativi di riferimento.** "Ecco come ottenere [risultato] in 3 step", "Ecco come ottenere [risultato] in meno di 60 secondi", "Se avessi solo [X ore] a settimana per [risultato], farei questo", "Se avessi solo 30 giorni per [risultato], ecco cosa farei", "Questo è il consiglio che darei al mio migliore amico se iniziasse da zero", "Ecco un hack di [settore] che la maggior parte non conosce", "Il motivo per cui non raggiungi [risultato] non è che sei pigro, è che credi a [mito]".

## 10. Reel di conversione (BOF): regole

- Proof: far vedere un cliente nelle stesse scarpe del target. **Regola 3/5**: elenca i 5 problemi principali della tua storia; ogni cliente mostrato deve averne avuti almeno 3. Priorità alla situazione (età, lavoro, stile di vita, difficoltà), non solo al risultato. "Instagram è uno specchio": quello che mostri è quello che attrai.
- Struttura del breakdown cliente (stessa della tua storia): dov'era (vita prima), quali problemi aveva, cosa ha provato che non ha funzionato, poi l'incontro con Dany (cosa avete fatto, in breve come funziona il percorso), dov'è ora.
- Senza casi studio: usare se stessi (conta come MOF), oppure sostituire con gestione delle obiezioni dette in DM e nelle call ("non ho tempo", "ho già provato", "faccio da solo", "è troppo caro"), spiegando perché non reggono o come tengono bloccati.
- Chiusura BOF con CTA a lavorare insieme: "Se vuoi lo stesso risultato di [cliente], scrivimi la parola [KEYWORD] e ti aiuto".
- Un BOF mostra una trasformazione che descrive perfettamente la vita dello spettatore e poi lo invita ad agire: farlo uscire senza ask non aiuta nessuno.
- Per le obiezioni: il tema denaro è spesso un'obiezione di superficie, il blocco profondo è la mancanza di fiducia in sé. Il coaching si vende come mesi di supporto continuo, non come singoli allenamenti. Rate proposte in modo proattivo sono più forti che lasciare al prospect il calcolo.

**Script di conversione di riferimento.** Struggle Validation ("Se [schema che vive], non sei [giudizio negativo]. Sei solo [causa reale]"), Problem Solution Bridge ("Il motivo per cui continui a [comportamento] non è [cosa pensa di sé], è [causa sistemica]"), Client Success Spotlight (cliente, sfida, cosa è cambiato in 3 mosse, risultato in tempo definito, risultato non fisico, perché ha funzionato).

## 11. Libreria hook

Per ogni hook l'app deve identificare la categoria, valutare l'aderenza al pattern e verificare i criteri della sezione 22 (H). I pattern sono modelli, non da usare alla lettera in contenuti diversi.

**Storytelling.** Vedi sezione 8.

**Curiosità e information gap.** "Questo rappresenta il tuo [X] prima, durante e dopo [Y]." "Ecco esattamente quanto [azione/oggetto] ti serve per ottenere [risultato]." "Puoi dirmi come fare [risultato] in 60 secondi?" "Questo è quello che [oggetto] sembra quando fai [azione]. E questo è quello che sembra quando NON lo fai." "Il motivo per cui la maggior parte delle persone fatica con [X] è..." "Perché [X] è così difficile per la maggior parte delle persone? Ecco perché." "Questo è il passaggio più trascurato in [X]." "Ecco cosa avrei voluto sapere prima di provare [X]." "Lo sapevi che [X, Y, Z] portano a [risultato]?" "Non iniziare a fare [X] finché non impari questo." "Questa è la cosa che nessuno ti dice su [X]." "Questa è la parte più ignorata di [X]."

**Shock e provocazione.** "Se vedo un altro video su [X] senza spiegare realmente come funziona, potrei impazzire." "Sei ancora a fare [X]? Io ho ottenuto [risultato] in [tempo] e non tornerò mai indietro." "Se vuoi finire a [pain point], allora salta questo video." "Non fare [X] finché non impari a fare questo." "Tutti ti dicono di [X], ma nessuno ti spiega come farlo davvero." "[X] non è altro che una bugia che ti racconti: la verità è che non ti manca [X], ti manca [Y]." "[X] è morto: smetti di concentrarti su questo se vuoi [risultato]." "Penso di aver trovato il più grande cheat code di [settore]." "Ti hanno sempre detto di [X], ma ecco perché è sbagliato." "Non avrei mai immaginato che smettere di [X] avrebbe portato a [Y]."

**Liste, ranking, raccolte.** "Ecco [numero] errori che devi evitare se vuoi [risultato]." "Ecco le 5 verità che avrei voluto sapere prima di iniziare [X]." "Ecco [numero] miti che ti stanno fregando i risultati." "Qui ci sono [numero] errori comuni che ti impediscono di [risultato]." "Ecco le [numero] cose che farei se dovessi ricominciare da zero oggi." "30 secondi di consigli su [settore] che darei al mio migliore amico se partisse da zero."

**Domande retoriche e sfide.** "Ma se la vera domanda non fosse [X], ma fosse [Y]?" "Se fossi nei tuoi [età] e volessi [risultato] da zero, cosa faresti?" "Quante volte puoi saltare [azione] prima di perdere [risultato]?" "Se hai tra [età] e [età] e ti senti [pain point]..." "Ma è davvero possibile [X]?" "Cosa faresti se domani ti svegliassi senza [X] e volessi ottenere [Y] in [tempo]?" "Se fossi al mio posto, come affronteresti [X]?"

**Educational e step by step.** "Ma è davvero possibile [fare X] in [Y tempo]? Spoiler sì, e ti spiego come." "Ho impiegato 10 anni a impararlo, ma te lo insegno in meno di un minuto." "Se avessi solo 1 ora al giorno per [risultato], farei questo passo dopo passo." "Ecco come raddoppiare il tuo [risultato] in 3 step." "Questo è il processo passo-passo che seguirei se dovessi ricominciare oggi." "Se avessi solo 1 cosa da fare per ottenere [risultato], sarebbe questa." "Questo è il framework a 3 step che usano tutti i migliori [avatar]." "Ecco come evitare gli errori comuni e accelerare il risultato." "Se non hai [X], fai [Y]."

**Miti.** "Il motivo per cui non stai ottenendo [risultato] è che stai cadendo in questo mito." "[Credenza popolare] è pura fuffa." "[Mito] è tanto vero quanto Babbo Natale." "Il motivo per cui non raggiungi [risultato] non è che sei pigro o incapace, ma perché credi a [mito]." "[Mito] è morto, smettila di concentrarti su questo." "Ti hanno sempre detto che [mito], ma ecco perché non è vero."

**Errori comuni.** "Questo errore sta distruggendo i tuoi [risultati]." "Stai buttando via i tuoi [risultati] se continui a fare [errore comune]." "Ti sto per fare arrabbiare: [errore comune] non ti porterà mai a [risultato]." "Evita assolutamente questi [numero] errori se vuoi [risultato]." "Se stai facendo [errore comune], fermati subito." "Questo errore è la ragione n.1 per cui fallisci in [settore]."

**Autorità e proof.** "Ho trasformato [cliente] da [X] a [Y] in [tempo]: ecco come." "Ho aiutato [numero] clienti a ottenere [risultato]: ecco la mia lezione più importante." "Sono un [ruolo] da oltre [X anni], e queste sono le 3 cose che non rimpiangerò mai di aver fatto." "Ho lavorato con oltre [numero] clienti: questa è la verità che ho capito su [settore]." "Se avessi [problema comune] e mi assumessi per portarti a [risultato] in [tempo], queste sarebbero le 3 cose che farei." "Ti dico quello che mi ha richiesto [X anni] per imparare, in 60 secondi." "Questo mese ho ottenuto [risultato] usando questo metodo."

**Pattern ispirati agli hook Silvia.** "Non l'avrei mai creduto possibile, ma ho preso la decisione migliore della mia vita quando [X]." "Ecco come [X] ha radicalmente cambiato [Y]." "Non avrei mai pensato di essere il tipo di persona che fa [X], ma eccomi qui." "Vorrei che più persone capissero che [verità schietta]." "Ecco perché ho smesso di fare [X] e ho iniziato a fare [Y]." "Questa è a mani basse la lezione più importante che ho imparato da [X]."

**Costruzione dell'hook per l'ICP di Percorso Alpha (workbook).** Partire da uno dei 3 problemi (mettere massa a casa senza risultati, non essere costante, non avere tempo/piano) o da uno dei 3 obiettivi (fisico definito con addome in vista, sicurezza attraverso la massa, routine sostenibile). Hook ad alta tensione identitaria funzionano meglio delle promesse di superficie.

## 12. Regole delle CTA

**Regola standard (playbook di Dany).**
- TOF: nessuna CTA dura.
- MOF: follow soft o nessuna CTA. Le keyword restano riservate ai contenuti di conversione.
- BOF: CTA con keyword (ALPHA, METODO, PERCORSO, PANCIA, PETTO, GUIDA, ADDOME, DIETA, ALFA).
- La CTA chiude il Body, integrata con indicazione visiva. Niente frase a effetto dopo la CTA.

**Struttura della CTA CCC.** Risorsa specifica, trigger keyword nei commenti, beneficio, urgenza (consegna immediata). Esempio dal tono di Dany: "Ho preparato per te una video lezione dove te lo spiego in 10 minuti, basta che commenti METODO e te la mando direttamente in chat". La CTA deve risultare semplice e senza pressione.

**Modalità post virale (SOP di 7 giorni di Max).** Si attiva quando un reel di storytelling supera nettamente i numeri normali (riferimento: oltre 1 milione di visualizzazioni, 40 mila like, 380 commenti, 1.000 repost, 2.000 condivisioni, 1.900 nuovi follower; scalare in proporzione alla dimensione dell'account). In questa modalità, per sette giorni:
- Ogni reel ha una CTA. I MOF fanno CTA a una risorsa gratuita. I BOF fanno CTA a una risorsa gratuita al giorno 3, poi a lavorare insieme dal giorno 4.
- Settimana: giorno 1 reintroduzione (storia in 5 slide "La mia storia": nuovi arrivati, la lotta, le soluzioni fallite, la soluzione, come aiuto oggi); giorno 2 Q&A su di sé con un seme di coaching senza CTA; giorno 3 primo BOF (breakdown cliente) con CTA a risorsa gratuita e storia singola con keyword; giorno 4 Simple CTA; giorno 5 respiro, solo lifestyle senza CTA; giorno 6 successo di un cliente in 3-5 slide senza CTA; giorno 7 Hard CTA in 3 slide.
- Ogni giorno 50-75 conversazioni outbound nuove, più lavorare ogni inbound.
- Solo due richieste di lavorare insieme nelle stories in tutta la settimana: una Simple e una Hard.
- Svuotare le stories ogni mattina. Design semplice delle stories: testo semplice, sfondo bianco o testo bianco su foto o video, immagini coerenti con ciò che dice la slide, 2 o 3 frasi per slide al massimo.
- Usare formati MOF che hanno già funzionato, non sperimentare.
- Tutta la settimana nella lingua dell'ICP.
- Automazione delle risorse gratuite con ManyChat.

Se il contenuto è dichiarato "post virale", il criterio CTA si valuta con queste regole; altrimenti con la regola standard.

## 13. Caption

- Reel: caption corta, solo la CTA con la keyword. Niente caption narrativa lunga.
- Se una caption lunga è richiesta (carosello o post): prosa discorsiva in italiano, paragrafi umani con a capo tra i periodi lunghi, niente elenchi puntati, niente frasi isolate frammentate, prima persona dalla prospettiva di Dany.
- La caption lunga deve aggiungere profondità emotiva o filosofica che completa il video. Non ripete né riassume ciò che già dice il video.
- Una caption lunga si apre parlando del mondo interiore dell'ICP (insicurezza silenziosa e persistente sul corpo, allenamento senza progressi visibili) e non con i successi del creatore. Si apre con un hook che spinge a scendere nel testo e si chiude con una CTA soft o con la keyword, a seconda del tipo di contenuto.

## 14. Regole per le stories

**Principio.** Le stories creano connessione e fiducia. Non si limitano a dire cosa è successo o cosa è stato fatto: raccontano ciò che c'è dietro l'attività, le emozioni, la lezione. È lì che nasce l'immedesimazione. Indicare sempre testo e immagine da posizionare sotto.

**Stories indirette (fidelizzazione).** Racconto di aspetti della storia di Dany in comune con il target: inizio, paure, come viveva il non avere il fisico desiderato. Nessun consiglio, nessuna vendita. Si racconta apertamente ciò che si provava e si apre una conversazione onesta e senza secondi fini. La CTA può essere un invito a scrivere come la stanno vivendo loro.

**Stories dirette (vendita).**
- **Simple CTA:** una slide sola, pensata per volume. Si qualifica nei DM. Modello: "Cerco [3] [ICP specifico] che vogliono [risultato specifico] senza [cosa che odiano o sacrificio] in [90 giorni]. Scrivimi la parola [KEYWORD] per maggiori informazioni." Il numero 3 funziona quasi sempre. Sfondo con foto in cui Dany è al meglio, stile identico agli esempi, senza creatività. Per Percorso Alpha: ICP uomini impegnati che vogliono mettere massa e definizione a casa. Benchmark: 100-200 inbound con 40 mila follower, 30-50 con meno di 10 mila.
- **Hard CTA:** sequenza di 3 slide che chiede a UNA persona di lavorare insieme. Versione A trasformazione di Dany (chi sono, come ho fatto, richiesta). Versione B trasformazione di un cliente. Chiedere una persona sola fa sentire scelto chi legge.
- **Risorsa gratuita:** una slide, collegata a ManyChat. Modello: "Molti di voi mi hanno chiesto come ho [risolto X]. Per questo ho creato [risorsa]. Se la vuoi, scrivi la parola [KEYWORD] e te la mando gratis".
- **Breakdown di successo cliente:** 3-5 slide, senza CTA. Chiudere con orgoglio, non con una vendita.
- **Q&A:** rispondere in profondità, dare la priorità alle domande legate al metodo e alla situazione dell'ICP, inserire almeno una risposta sul coaching senza CTA, salvare nei Highlight.

**Pre-vendita nei DM (per riferimento, non contenuto).** Specchiare l'obiettivo, 3 o 4 domande di qualifica (situazione attuale, cosa ha provato, perché ora, apertura a investire), proporre una call con un piano di gioco gratuito, inviare 2 o 3 video pertinenti prima della call come nurture. Nelle conversazioni DM e setting: una sola domanda per messaggio.

## 15. Template Plug and Play (11 script)

Usare come modelli di struttura, mai come testo da copiare.

| # | Nome | Tipo | Durata | Struttura |
|---|------|------|--------|-----------|
| 1 | Plateau Breakthrough | Education | 25-30 s | Comportamento fermo, falsa soluzione, vero motivo di adattamento, 3 soluzioni, tempo di prova |
| 2 | Identity Shift Story | Attraction | 25-30 s | Vecchia identità, momento scatenante, nuova identità, comportamento nuovo, verità emotiva |
| 3 | Myth Buster | Education | 20-25 s | Credenza comune, perché è sbagliata, perché esiste il mito, principio corretto, cosa fare invece |
| 4 | Struggle Validation | Converting | 25-30 s | Schema vissuto, errata diagnosi, causa reale, cosa funziona davvero |
| 5 | Day in the Life | Attraction | 20-30 s | Orari reali con attività, principio guida, variazioni normali, messaggio di costanza |
| 6 | Progress Reality Check | Education | 25-30 s | Progresso reale vs aspettativa irrealistica, tempi corretti, non confrontarti con altri |
| 7 | Problem Solution Bridge | Converting | 25-30 s | Il vero motivo non è la tua colpa, limite dell'approccio comune, cosa funziona, valore della guida |
| 8 | Before and After Reframe | Attraction | 20-25 s | "Non è solo un prima e dopo", vecchia credenza, nuova realizzazione, trasformazione interna |
| 9 | Client Success Spotlight | Education/Converting | 25-30 s | Cliente e sfida, cosa è cambiato in 3 mosse, risultato e trasformazione non fisica, perché ha funzionato |
| 10 | Common Mistake Breakdown | Education | 20-25 s | Errore, perché lo si fa, conseguenza, correzione, azione specifica |
| 11 | Mindset Shift Moment | Attraction | 25-30 s | Il momento che ha cambiato tutto, vecchia credenza, cosa è successo, nuova comprensione, riformulazione per lo spettatore |

## 16. Regole su proof e specificità

- Sempre numeri concreti: chili, settimane, sedute a settimana, minuti, calorie, ripetizioni. Mai "tanto", "poco", "molto".
- Proof emotiva e proof logica: la proof emotiva (la storia, il cliente simile) apre, la logica (dati, metodo, tracciamento) convince. Si guida con ciò che il cliente vuole e si consegna ciò di cui ha bisogno.
- Meccanismo come ponte tra il punto A (caldo, doloroso) e il punto B (risultato): spiegare perché il metodo funziona (tracciamento, progressione, feedback, adattamento al tempo disponibile), non solo che funziona.
- Il cliente citato deve somigliare all'ICP (regola 3/5). Chiedere sempre il permesso o anonimizzare.
- Mostrare la difficoltà con onestà: alcuni distretti (gambe) richiedono creatività o minima attrezzatura; dichiararlo aumenta la fiducia.
- Realismo sui tempi: i risultati muscolari richiedono mesi, il progresso si misura su settimane di forza e di esecuzione prima che nelle foto.

## 17. Benchmark dal dataset dei reel pubblicati

Dataset di 122 reel classificati per tipo e formato con visualizzazioni.

- Storia pectus excavatum (storytelling di identificazione): circa 249 mila visualizzazioni. Il contenuto personale e di trasformazione genera conversioni reali più dei contenuti educativi, nonostante questi abbiano più reach. Il trigger di conversione è l'identificazione: "se ce l'ha fatta lui, posso farcela anch'io".
- Reel "perché mamma" / motivazione personale: circa 1,6 milioni, il migliore del dataset.
- Reel con CTA "commenta GUIDA": circa 129 mila e 110 mila.
- Reel di opinione testuale (ripetizioni lente) e "il corpo libero batte la palestra": circa 63 mila ciascuno.
- Keyword CTA in uso: METODO, GUIDA, ADDOME, DIETA, ALFA o ALPHA, PANCIA, PETTO, PERCORSO.
- Lettura: i contenuti con identità e vulnerabilità superano i contenuti di istruzione pura; le CTA a risorsa gratuita sono un ottimo ponte; la parola chiave deve essere breve e coerente con il tema.

Uso per l'app: se visualizzazioni e tipo sono disponibili, confrontare con questi riferimenti e riportare il confronto, senza che incidano sul punteggio di qualità.

## 18. Elenco di controllo: cosa fare e cosa non fare

**Fare.**
- Parlare a un solo uomo: l'impiegato di circa 30 anni, stanco, che ha già provato.
- Hook sotto le 10 parole con posta in gioco concreta.
- Una sola idea per reel.
- Numeri specifici, scena concreta, strumento reale nominato.
- Spostare la colpa dal carattere al sistema.
- Chiudere con l'azione, non con una frase ad effetto.
- Adattare l'italiano parlato di Dany, senza calchi.
- Coerenza con la fase del funnel: la CTA, la lunghezza e il registro dipendono da essa.

**Non fare.**
- Info dump, gergo, teoria senza applicazione.
- Promesse irrealistiche, fisici da copertina in poco tempo.
- Dire che la palestra serve o consigliare integratori.
- Generico motivazionale.
- CTA dura su TOF, nessuna CTA su BOF.
- Elenchi puntati negli script e nelle caption.
- Trattini lunghi, trattini medi, emoji.
- La frase vietata di sezione 4.
- Banalizzare il pectus alla sola crescita muscolare.
- Citare prezzo o costo ("investimento" è la parola corretta).
- Raccontare cosa si è fatto senza emozione né lezione (stories).

## 19. Lacune documentate

Le istruzioni di progetto citano i "3 cervelli" e il framework "DOSE" da attivare per ogni fase del funnel, ma nella base di conoscenza non esiste alcun documento che li descriva. L'app NON deve valutarli né inventarli. Se Dany fornisce i documenti, vanno aggiunti qui come criteri aggiuntivi opzionali con peso da definire.

Altre lacune: l'offerta riporta due frequenze diverse per le call di check-up (ogni 2 settimane e mensili); i pesi corporei di Dany citano 85 kg e 88 kg; la regola CTA per i MOF differisce tra playbook di Dany (nessuna CTA dura) e SOP post virale di Max (CTA a risorsa gratuita). La prima è la regola standard, la seconda vale solo in modalità post virale.`.trim()

export const GUIDA_SCORING = `## 20. Procedura di valutazione

1. Identifica tipo di contenuto: REEL_TOF, REEL_MOF, REEL_BOF, STORY_INDIRETTA, STORY_DIRETTA. Se è un carosello o un post con caption lunga, valutalo con la tabella del reel della sua fase e applica il criterio caption lunga della sezione 13.
2. Segnali di classificazione se non dichiarato:
   - TOF: racconto in prima persona di un momento, emozione, conflitto, nessun insegnamento, nessuna CTA dura.
   - MOF: errore, mito, tutorial, passi, principio, "ecco come", struttura Hook, Teach, Apply.
   - BOF: cliente reale con risultato, obiezione, CTA con keyword verso il percorso.
   - Contenuto ibrido: classifica sulla funzione prevalente e segnalalo.
3. Per ogni criterio dai un voto intero da 0 a 10 con una frase di motivazione che cita il testo.
4. Punteggio criterio = voto/10 x peso. Somma i punteggi dei criteri.
5. Applica penalità e limiti (sezione 23). Il totale non scende sotto 0.
6. Assegna la fascia (sezione 24).
7. Produci l’output richiesto (sezione 25) e il rifacimento (sezione 26).

## 21. Tabelle pesi per tipo di contenuto (totale 100)

**REEL_TOF (attrazione, storytelling)**

| ID | Criterio | Peso |
|----|----------|------|
| H | Hook | 20 |
| ST | Arco narrativo ed emozione | 25 |
| ID | Identificazione ICP | 15 |
| TV | Tono di voce e linguaggio | 10 |
| SP | Specificità e autenticità | 10 |
| RL | Ritmo e lunghezza | 5 |
| CT | CTA coerente con TOF | 5 |
| CA | Caption | 5 |
| CF | Conformità formale | 5 |

**REEL_MOF (consapevolezza, educazione)**

| ID | Criterio | Peso |
|----|----------|------|
| H | Hook | 20 |
| EV | Valore educativo (Hook, Teach, Apply) | 25 |
| CH | Chiarezza e semplicità | 10 |
| ID | Identificazione ICP | 10 |
| TV | Tono di voce e autorevolezza | 10 |
| AP | Applicabilità concreta | 10 |
| RL | Ritmo e lunghezza | 5 |
| CT | CTA coerente con MOF | 5 |
| CA | Caption | 3 |
| CF | Conformità formale | 2 |

**REEL_BOF (conversione)**

| ID | Criterio | Peso |
|----|----------|------|
| H | Hook | 15 |
| PR | Proof e trasformazione | 25 |
| OB | Meccanismo e gestione dell'obiezione | 15 |
| ID | Identificazione ICP | 10 |
| TV | Tono di voce e autorevolezza | 10 |
| CT | CTA di conversione | 15 |
| RL | Ritmo e lunghezza | 3 |
| CA | Caption | 4 |
| CF | Conformità formale | 3 |

**STORY_INDIRETTA e STORY_DIRETTA**

| ID | Criterio | Peso |
|----|----------|------|
| CN | Connessione emotiva e dietro le quinte | 30 |
| TI | Testo e immagine indicati e coerenti | 10 |
| ID | Identificazione ICP | 15 |
| TV | Tono di voce | 15 |
| SP | Specificità e autenticità | 10 |
| CS | CTA o apertura coerente col tipo di story | 15 |
| CF | Conformità formale | 5 |

Per STORY_DIRETTA, CN pesa come "forza del messaggio e dell'identificazione" ma il criterio CS valuta la qualità della richiesta (una persona sola, numero 3 nella Simple, 90 giorni, keyword, risultato specifico).

## 22. Criteri: cosa verificare e ancore di voto

### H: Hook
Verifica: meno di 10 parole; posta in gioco concreta; impatto personale; curiosità immediata; appartenenza a una categoria della libreria; chiama in causa l'ICP (pain, età, situazione, desiderio); evita la promessa generica; non è un saluto né una presentazione.
- 9-10: sotto le 10 parole, call-out chiaro dell'ICP, posta in gioco o curiosità forte, tensione identitaria, aderente a un pattern validato.
- 6-8: efficace ma lungo (11-14 parole) o posta in gioco debole o curiosità media.
- 3-5: generico, valido per qualsiasi nicchia, nessuna posta in gioco, oppure oltre 14 parole.
- 0-2: saluto, presentazione, contesto senza tensione, o hook che non si collega al contenuto.
Limite: hook oltre 15 parole = massimo 5. Hook che non cita né problema, né obiettivo, né situazione dell'ICP = massimo 6.

### ST: Arco narrativo ed emozione (TOF)
Verifica: conflitto interno; punto basso specifico; realizzazione privata; fase emotiva; progressione; verità senza dramma; scena concreta; la storia fa sentire visto lo spettatore.
- 9-10: almeno 3 dei 4 elementi presenti e collegati, scena vivida, verità non teatrale, finale con cambio di identità o lezione.
- 6-8: storia chiara ma elementi mancanti o poco specifici.
- 3-5: elenco di fatti ("ho fatto, poi ho fatto") senza emozione né conflitto.
- 0-2: nessuna storia, o contenuto educativo travestito.

### EV: Valore educativo (MOF)
Verifica: struttura Hook, Teach, Apply; un'idea sola; regola del tre; consiglio migliore per primo; consiglio prima, spiegazione poi; promessa dell'hook mantenuta; autorevolezza senza lezione accademica.
- 9-10: promessa mantenuta in modo completo, 3 punti o meno, ordine di priorità corretto, spiegazione sintetica, risultato chiaro.
- 6-8: valore presente ma diluito, o troppi punti, o spiegazione che arriva tardi.
- 3-5: info dump, teoria, promessa solo parzialmente mantenuta.
- 0-2: nessun valore pratico.

### CH: Chiarezza e semplicità (MOF)
Verifica: linguaggio da terza elementare; termini tecnici definiti; analogie; frasi corte; un concetto per frase.
- 9-10: comprensibile al primo ascolto, nessun gergo non spiegato.
- 5-8: qualche termine tecnico non spiegato o frasi lunghe.
- 0-4: gergo, complessità, concetti sovrapposti.

### AP: Applicabilità (MOF)
Verifica: ogni punto chiude con un'azione concreta; nomina lo strumento reale (zaino pesante, tempo sotto tensione, tracciamento con app, tavolo per le trazioni australiane); esercizi per categoria di movimento; alternative per chi non può applicare esattamente; adatto al tempo reale dell'ICP (2 o 3 sedute da 30-45 minuti).
- 9-10: lo spettatore sa esattamente cosa fare domani.
- 5-8: azione presente ma generica.
- 0-4: nessuna azione, o consigli come "sii costante" o "mangia sano".

### PR: Proof e trasformazione (BOF)
Verifica: cliente reale con situazione simile all'ICP (regola 3/5); numeri e tempi; prima, tentativi falliti, intervento, dopo; risultato anche non fisico; credibilità senza esagerazione.
- 9-10: caso simile, struttura completa, numeri specifici, risultato realistico.
- 6-8: caso reale ma manca un pezzo (tentativi falliti, numeri, situazione).
- 3-5: risultato mostrato senza storia o senza somiglianza con l'ICP.
- 0-2: affermazioni generiche o promesse non provate.

### OB: Meccanismo e obiezione (BOF)
Verifica: spiega perché il metodo funziona (tracciamento, progressione, feedback, adattamento); disinnesca almeno un'obiezione dell'ICP (tempo, palestra, già provato, costanza, costo, fiducia in sé) dentro il punto; colloca il percorso come ponte.
- 9-10: meccanismo chiaro e obiezione risolta con un argomento, non negata.
- 5-8: meccanismo accennato o obiezione solo nominata.
- 0-4: nessun meccanismo, solo risultato.

### ID: Identificazione ICP
Verifica: parla al singolo uomo di circa 30 anni, stanco, impiegato, che ha già provato; usa le sue parole; tocca pain o desideri dell'ICP; sposta la colpa dal carattere al sistema; evita frasi che escludono il target (donne, atleti avanzati, palestra).
- 9-10: lo spettatore pensa "parla di me" nelle prime due frasi, linguaggio del target, pain preciso.
- 5-8: tema giusto ma linguaggio generico.
- 0-4: nessun pain riconoscibile, parla a tutti.

### TV: Tono di voce
Verifica: prima persona; diretto; concreto; numeri; frasi brevi; italiano parlato senza calchi; assenza di motivazionale vuoto; assenza di toni da influencer; coerenza con i valori; nessuna frase vietata.
- 9-10: suona come Dany in camera, autorevole, nessuna formula astratta.
- 5-8: qualche formula generica o frase artificiale.
- 0-4: tono da influencer, motivazionale, calchi dall'inglese, linguaggio scolastico.

### SP: Specificità e autenticità
Verifica: anno, scena, numero, oggetto concreto; "show, don't tell"; assenza di aggettivi vuoti; onestà.
- 9-10: almeno 3 dettagli concreti verificabili.
- 5-8: uno o due dettagli.
- 0-4: affermazioni astratte.

### RL: Ritmo e lunghezza
Verifica: durata o numero di parole entro i limiti del tipo (TOF 45-90 s, MOF 30-60 s, BOF 30-60 s, demo 20-40 s); nessuna parola superflua; ogni secondo guadagna il suo posto; transizioni rapide; nessuna ripetizione; sezione 2 della CCC proporzionata al tipo.
- 9-10: durata ottimale, nulla da tagliare.
- 5-8: 10-20% di eccesso o una parte lenta.
- 0-4: oltre il 30% di eccesso, ritmo piatto, introduzioni lunghe.
Stima della durata dal testo: circa 2,5 parole al secondo in parlato di Dany.

### CT: CTA
Verifica per tipo:
- TOF: nessuna CTA dura. 10 se assente o soft (follow, invito a scrivere). Max 4 se contiene vendita diretta.
- MOF: nessuna CTA dura o CTA soft a risorsa gratuita. In modalità post virale la CTA a risorsa gratuita è obbligatoria.
- BOF: CTA obbligatoria con keyword e beneficio; risorsa o invito chiaro; collegata al caso; integrata alla fine del Body con indicazione visiva; urgenza leggera senza pressione.
- 9-10: coerente con la fase, chiara, una sola azione.
- 5-8: coerente ma vaga, o più azioni richieste.
- 0-4: assente dove dovrebbe esserci, o presente dove non dovrebbe, o confusa.

### CA: Caption
Verifica: reel = corta, solo CTA con keyword; lunga = prosa, niente elenchi, profondità emotiva che completa il video, non ripete, apre sul mondo interiore dell'ICP.
- 9-10: rispetta formato e funzione.
- 5-8: corretta ma ripete il video o troppo lunga.
- 0-4: elenco puntato, riassunto del video, hashtag vuoti, assente.
Se la caption non è fornita, assegna 5 e segnala "caption non valutata".

### CF: Conformità formale
Verifica: nessun trattino lungo o medio; nessuna emoji; accenti presenti; nessun elenco puntato negli script; titolo con numero, fase e hook; note per l'editor in cima; italiano prima, inglese dopo; nessuna frase vietata; "pectus excavatum" nelle versioni inglesi; termini "investimento" e "versamento".
- 10: nessuna violazione. Ogni violazione toglie 2 punti.

### CN: Connessione emotiva e dietro le quinte (stories)
Verifica: va oltre il fatto; racconta emozione e lezione dietro l'attività; il racconto tocca pain in comune con l'ICP; apre una conversazione onesta; senza consigli e senza vendita nelle stories indirette.
- 9-10: lo spettatore si riconosce e ha un motivo per rispondere.
- 5-8: racconto emotivo ma senza lezione né apertura.
- 0-4: cronaca ("oggi mi sono allenato") senza significato.

### TI: Testo e immagine (stories)
Verifica: per ogni slide sono indicati testo e immagine; 2 o 3 frasi al massimo; testo semplice su sfondo bianco o su foto o video; l'immagine corrisponde al testo; stile coerente.
- 9-10: tutto indicato e coerente.
- 4-8: manca l'immagine in alcune slide o testo troppo lungo.
- 0-3: solo testo, o immagini non pertinenti.

### CS: CTA o apertura (stories)
- Indiretta: invito a scrivere come la vivono; domanda aperta, onesta. 10 se l'apertura è genuina; 0-4 se vende.
- Diretta: Simple CTA (una slide, numero 3, ICP e risultato specifici, 90 giorni, keyword, foto di Dany al meglio) o Hard CTA (3 slide, una sola persona, keyword). Rispetto delle regole del volume di richieste: non più di due richieste di lavorare insieme in 7 giorni.

## 23. Penalità e limiti

Applica dopo la somma pesata. Ogni penalità cita la riga che l'ha causata.

| Flag | Condizione | Effetto |
|------|-----------|---------|
| FRASE_VIETATA | Contiene "Non è solo fisico. È sicurezza personale." | -15 |
| EM_DASH | Contiene trattino lungo o medio | -5 per contenuto, e CF massimo 4 |
| EMOJI | Contiene emoji | -3 |
| ACCENTI | Mancano accenti in parole italiane | -3 |
| PROMESSA_IRREALISTICA | Risultato garantito, tempi non credibili, "senza fatica" | -10 |
| PALESTRA_O_INTEGRATORI | Consiglia palestra o integratori in contrasto con l'offerta | -10 |
| HARD_CTA_TOF | Vendita diretta in un TOF | -8 e CT massimo 3 |
| NO_CTA_BOF | BOF senza CTA | -10 e CT massimo 2 |
| PECTUS_SENZA_POSTURA | Contenuto sul pectus che riduce tutto a "fare palestra" o "costruire muscolo" | -6 |
| CALCO_INGLESE | Frasi tradotte letteralmente | -4 |
| INFO_DUMP | Più di 3 punti o concetti non gerarchizzati | -5 |
| GERGO | Termini tecnici non spiegati | -3 |
| CHIUSURA_RETORICA | Frase a effetto dopo la CTA o a chiusura dello script | -3 |
| ELENCO_PUNTATO | Bullet negli script o nelle caption | -3 |
| LUNGHEZZA_ECCESSIVA | Oltre il 30% sopra il limite del tipo | -5 |
| NUMERO_INCOERENTE | Cifre personali in contrasto con quelle del contesto | segnala, nessuna penalità |
| CLASSIFICAZIONE_DUBBIA | Il contenuto appartiene a più fasi | segnala, nessuna penalità |

Limiti: se H è sotto 4, il punteggio totale non supera 70. Se ID è sotto 3, il totale non supera 65. Se CF ha 3 o più violazioni, il totale non supera 80.

## 24. Fasce di punteggio

| Totale | Fascia | Azione |
|--------|--------|--------|
| 90-100 | Pubblicare | Pronto. Eventuale micro ritocco su un solo elemento |
| 80-89 | Pubblicare dopo ritocchi | Correggi i criteri sotto 7, nessuna riscrittura completa |
| 65-79 | Rifare le parti deboli | Riscrivi hook e i due criteri più bassi, mantieni l'idea |
| 50-64 | Riscrivere | Mantieni il tema, ricostruisci struttura e hook |
| 0-49 | Scartare o ripartire | Idea non allineata a fase, ICP o tono: ripartire dai workbook |

## 25. Schema di output

Lo schema di output è quello della richiesta. Tu dai i voti interi da 0 a 10, le citazioni letterali, le motivazioni, le correzioni, i flag di penalità con la riga che li causa e il rifacimento. Il gestionale calcola i punteggi pesati, la somma, le penalità, i limiti e la fascia dalle tabelle di questa guida: non calcolare totali.

## 26. Protocollo di rifacimento

1. Mantieni l'idea centrale e il tipo di funnel. Non cambiare la fase.
2. Ordina i problemi per impatto sul punteggio e correggi dall'alto: prima hook, poi il criterio con peso maggiore, poi gli altri.
3. Hook: genera 3 alternative sotto le 10 parole, di categorie diverse della sezione 11, ciascuna con posta in gioco e call-out dell'ICP.
4. Struttura: ricostruisci secondo la fase (TOF: arco narrativo a 4 elementi; MOF: Hook, Teach, Apply con un massimo di 3 punti e consiglio migliore per primo; BOF: situazione simile, tentativi falliti, intervento, risultato, obiezione, CTA). Applica la sezione 2 della CCC con le regole di flessibilità per tipo.
5. Taglia: elimina ogni parola che non guadagna il suo posto, riduci del 10-20% la durata se possibile, rispettando i limiti di lunghezza.
6. Specificità: sostituisci ogni aggettivo vuoto con un numero, una scena o uno strumento reale.
7. Tono: porta l'italiano a come lo direbbe Dany in camera. Rimuovi calchi, formule astratte e frasi a effetto.
8. CTA: applica la regola della fase (o della modalità post virale), integrata alla fine del Body con indicazione visiva.
9. Caption: solo CTA con keyword per i reel.
10. Formato: titolo con numero, fase e hook; note per l'editor in cima solo se fornite; prosa continua con indicazioni visive tra parentesi; italiano poi inglese.
11. Controllo finale automatico: ripassa i flag della sezione 23 sul testo riscritto; nessun trattino lungo o medio, nessuna emoji, accenti presenti, nessuna frase vietata. Ricalcola il punteggio atteso.
12. Non aggiungere sezioni assenti nell'originale se si adatta uno script di Max.

## 27. Esempi di valutazione di hook (per calibrare l'app)

- "Ciao ragazzi, oggi vi parlo di allenamento a casa." → H 1/10. Saluto, nessuna posta in gioco, nessun call-out.
- "Smettila di allenarti in questo modo se vuoi mettere massa muscolare." → H 7/10. Pattern interrupt valido, ma di 11 parole (oltre il limite) e senza call-out specifico dell'ICP.
- "In soli 2 anni ho messo 20 kg di massa pulita senza mai entrare in palestra." → H 8/10. Numeri concreti, autorità e curiosità; supera le 10 parole, valutare un accorciamento ("20 kg di massa in 2 anni, senza palestra").
- "Mi alleno da mesi ma il fisico non cambia." → H 9/10 se pronunciato come call-out all'ICP ("Se ti alleni da mesi e il fisico non cambia..."), perché usa le parole esatte del target.
- "Il corpo libero non funziona" → H 4/10. Affermazione falsa e non coerente col brand: non è provocazione che porta a un valore.

Le valutazioni sono indicative: l'app deve applicare sempre i criteri della sezione 22, non solo gli esempi.`.trim()

/** The whole guide as it goes into the system of the scoring and of the `guida_contenuti` tool. */
export function guidaCompleta(): string {
  return `# PERCORSO ALPHA: LINEE GUIDA CONTENUTI E SISTEMA DI SCORING\n\n# PARTE A: CONTESTO\n\n${GUIDA_CONTESTO}\n\n---\n\n# PARTE B: LINEE GUIDA CONTENUTI\n\n${GUIDA_LINEE}\n\n---\n\n# PARTE C: SISTEMA DI SCORING\n\n${GUIDA_SCORING}`
}
