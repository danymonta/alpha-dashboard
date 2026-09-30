/**
 * The Dashboard's changelog (Dany, 30/09/2026): every version, newest first,
 * shown to the admin at /changelog.
 *
 * Versioning is semver, MAJOR.MINOR.PATCH:
 * - 1.0.0 is 27/09/2026, the first day in production on Vercel with real data
 *   (the Excel history and Dany's call sheet imported on the cloud). That
 *   day's deploys, up to the new name and domain, are one entry; the 0.x
 *   entries are the milestones built before it.
 * - MINOR (1.4.0 -> 1.5.0): a deploy that adds or changes a feature.
 * - PATCH (1.1.1 -> 1.1.2): a deploy that only fixes; its entry has
 *   `correzioni` and no `novita`.
 * - MAJOR stays 1 until Dany decides otherwise.
 * - A deploy that changes only docs or tests gets no entry.
 * - From 29/09/2026: one entry per deploy (a push to main), or per feature
 *   batch when pushes minutes apart finish the same feature. Before that, a
 *   few condensed milestones with the most impactful items only.
 *
 * Working rule (CLAUDE.md section 23): every deploy adds its entry on top and
 * sets the same version in package.json. tests/changelog.test.ts checks the
 * order, the semver, the dates and package.json.
 *
 * Words: Italian, plain and concrete, written for the owner: what changed for
 * him and the team, never file or function names.
 */

export type Destinatario = 'admin' | 'setter' | 'closer' | 'team'

export type Versione = {
  /** Semver, without the "v": "1.9.0". */
  versione: string
  /** Day of the deploy, YYYY-MM-DD (Europe/Rome). */
  data: string
  titolo: string
  /** One sentence. */
  riassunto: string
  novita: string[]
  correzioni?: string[]
  /** Who the change is for; "team" is everyone, Projects roles included, so it stands alone. */
  perChi?: Destinatario[]
}

export const ETICHETTA_DESTINATARIO: Record<Destinatario, string> = {
  admin: 'Admin',
  setter: 'Setter',
  closer: 'Closer',
  team: 'Tutto il team',
}

/** Newest first. A new deploy goes on top. */
export const VERSIONI: readonly Versione[] = [
  {
    versione: '1.11.0',
    data: '2026-09-30',
    titolo: 'Changelog e numero di versione',
    riassunto: 'La Dashboard ha un numero di versione e questa pagina, che racconta cosa cambia a ogni aggiornamento.',
    novita: [
      'Changelog, da Impostazioni: ogni versione con data, novità, correzioni e per chi è, dalla più recente.',
      'Il numero della versione in uso compare in Impostazioni, sulla voce Changelog.',
      'Regola delle versioni: 1.0.0 è il primo giorno in produzione con i dati veri; un aggiornamento che aggiunge funzioni alza il numero di mezzo, uno che corregge soltanto alza l’ultimo.',
      'Da qui in avanti ogni aggiornamento pubblicato aggiunge la sua voce.',
    ],
    perChi: ['admin'],
  },
  {
    versione: '1.10.0',
    data: '2026-09-30',
    titolo: 'L’esito della call lo registra il closer',
    riassunto: 'Stato ed esito di una call li scrivono solo il closer e tu; setter e closer hanno ognuno le proprie note.',
    novita: [
      'Stato, esito, qualificata e motivo di non chiusura li registrano solo il closer della call e tu. Il setter li legge, e il database rifiuta ogni sua modifica.',
      'Due note separate su ogni call: «Note del setter» e «Note aggiuntive» del closer. Ognuno scrive le sue e legge quelle dell’altro, tu le scrivi entrambe; il closer scrive le sue dalla scheda dell’esito, dalla matita o da Alfire.',
      'Le 51 «Note aggiuntive» importate dal tuo foglio delle call passano nelle note del closer.',
      'In Setting, «Dalle call» mostra accanto al motivo le «Note aggiuntive» del closer, mai le note del setter.',
    ],
    correzioni: ['La scheda della call del closer (la matita) si apre sempre sui valori salvati.'],
    perChi: ['admin', 'setter', 'closer'],
  },
  {
    versione: '1.9.0',
    data: '2026-09-30',
    titolo: 'Il setter vede perché le sue call non hanno chiuso',
    riassunto: 'Sulle call che ha fissato, il setter legge il motivo di non chiusura scritto dal closer, così impara cosa frena i suoi lead.',
    novita: [
      'Il motivo di non chiusura compare nella scheda della call del setter e nelle risposte di Alfire sulle sue call.',
      'Lo scrivono solo il closer e tu: il database rifiuta un setter che prova a scriverlo o a cambiarlo.',
    ],
    perChi: ['setter', 'closer'],
  },
  {
    versione: '1.8.0',
    data: '2026-09-30',
    titolo: 'Feedback guidato nel report del setter',
    riassunto: 'Il setter dice com’erano i lead della giornata e il closer perché una call non ha chiuso: lo leggi in Setting, per il marketing.',
    novita: [
      'Nel report del setter, sotto le conversazioni, nel blocco «Com’è andata la giornata», due scale: lead in target (quasi tutti, circa metà, pochi) e qualità delle conversazioni (buone, medie, scarse), ogni opzione con il suo significato sullo schermo.',
      'Due campi liberi, «Cosa frenava i lead» e «Domande e contenuti», oltre ad «Altre note».',
      'Nei giorni con attività le due scale sono obbligatorie: il report si salva comunque da solo e solo il setter vede «Da completare» (dai report del 30/09/2026). Per te nessun elenco e nessun avviso su chi non compila.',
      'Una call svolta che finisce in follow up o persa chiede il motivo di non chiusura, nella scheda dell’esito e in Alfire. Le call già registrate restano valide.',
      'Setting: nuovo blocco «Per il marketing: cosa dicono i lead», dai report del setter e dalle call. Alfire lo legge per te.',
    ],
    perChi: ['admin', 'setter', 'closer'],
  },
  {
    versione: '1.7.0',
    data: '2026-09-30',
    titolo: 'Tempo del team e fascia «Dalle–Alle»',
    riassunto: 'Vedi il tempo dichiarato dal team persona per persona, e il tempo caricato dopo può essere una fascia oraria invece della durata.',
    novita: [
      'Tempo › Team, solo per te: periodo (di base il mese in corso), filtri per persona e per progetto, il totale del team e una scheda per persona con progetti, task e voci del periodo.',
      'Solo il tempo già dichiarato, persone in ordine alfabetico: nessun timer acceso di altri, nessuna classifica, nessun elenco di chi non ha registrato.',
      'Il tempo caricato dopo può essere una fascia «Dalle–Alle»: i minuti li calcola il database, cambio dell’ora compreso. Vale in Tempo, nella scheda Tempo del progetto, correggendo una voce e da Alfire.',
      'Una fascia si aggiunge, si cambia o si toglie; i timer fermati mostrano la loro fascia vera.',
    ],
    correzioni: ['Il timer lo decide l’orologio: parte adesso, il suo inizio non si sposta e si ferma quando lo fermi.'],
    perChi: ['team'],
  },
  {
    versione: '1.6.0',
    data: '2026-09-29',
    titolo: 'Alfire: risposte a un tocco e testo in diretta',
    riassunto: 'Alfire propone le risposte come bottoni e, mentre detti, scrive il testo nella casella in diretta.',
    novita: [
      'Quando Alfire fa una domanda chiusa (quale cliente, quale rata, sì o no) le opzioni diventano bottoni; dopo una risposta propone al massimo 3 domande successive, solo se utili.',
      'Un tocco manda l’opzione come tuo messaggio, e puoi sempre scrivere o dettare altro. Un tocco non scrive mai dati: ogni scrittura passa dalla sua scheda e da «Conferma».',
      'Mentre detti, circa ogni 2 secondi il testo compare nella casella in grigio; allo stop la trascrizione completa lo sostituisce, e la mandi con Invio.',
      'Un solo vocale alla volta. Se il testo in diretta si ferma per i limiti di Groq la chat lo dice, e il testo arriva tutto allo stop.',
      'Sul piano gratuito di Groq il testo in diretta si spegne da solo, per non consumare i minuti di audio del team.',
    ],
    perChi: ['team'],
  },
  {
    versione: '1.5.0',
    data: '2026-09-29',
    titolo: 'Alfire modifica tutto quello che modifichi nell’app',
    riassunto: 'Dalla chat crei, correggi ed elimini ogni dato, sempre con la scheda di conferma; setter e closer fanno solo quello che l’app permette loro.',
    novita: [
      'Uno strumento per ogni cosa: clienti, vendite, rate, costi, pagamenti e regole delle provvigioni, obiettivi del mese, prodotti, call, lead, report del setter, progetti, liste, task, note e tempo.',
      'Registra una vendita anche dalla call chiusa da cui nasce.',
      'Ogni scrittura passa dalle stesse regole dei moduli dell’app, con la sessione di chi chatta, e aspetta il tocco su «Conferma».',
      'Dici nomi, non codici («la rata di marzo di Rossi»): se un nome vale per più righe Alfire chiede quale, non sceglie mai a caso.',
      'La scheda di conferma legge prima la riga vera: prima → dopo per le correzioni e, per le eliminazioni, cosa si porta dietro. «Elimina» resta spento finché le conseguenze non sono contate.',
      'Team, esportazioni e backup restano fuori dalla chat.',
    ],
    perChi: ['team'],
  },
  {
    versione: '1.4.0',
    data: '2026-09-29',
    titolo: 'Alfire si adatta al piano di Groq',
    riassunto: 'Con il piano Developer di Groq Alfire lavora da agente pieno, e se ne accorge da solo.',
    novita: [
      'Alfire capisce da solo quando passi al piano Developer di Groq e lavora da agente pieno: tutti gli strumenti del tuo ruolo, più messaggi ricordati, più passi, risposte più lunghe. Niente da cambiare su Vercel.',
      'Se serve, il piano si può forzare da Vercel.',
      'Per ogni risposta resta traccia di quanto ha consumato, mai del contenuto della chat.',
    ],
    correzioni: [
      'Un seguito come «ci sei?» non toglie più ad Alfire gli strumenti per scrivere: restano per tutta la conversazione che ha chiesto di scrivere.',
      'Una chiamata a uno strumento che Groq rifiuta si riprova da sola due volte.',
      'Se Alfire legge e si ferma senza rispondere, la chat lo dice e offre «Riprova».',
    ],
    perChi: ['team'],
  },
  {
    versione: '1.3.0',
    data: '2026-09-29',
    titolo: 'Cash in 4 parti, rinnovi e giornata del closer',
    riassunto: 'Il cash si divide in nuovi clienti, rate di clienti già entrati, rinnovi e upsell; il rinnovo si registra dalla scheda del cliente e la giornata del closer si compila dalle call.',
    novita: [
      'Panoramica: sotto il cash, «Di cui» in 4 parti che sommano sempre al totale: nuovi clienti del periodo, rate di clienti già entrati, rinnovi, upsell. Il grafico dei 12 mesi ha le stesse 4 serie.',
      'Cash e revenue per DM, cash per call svolta, valore medio nuovo cliente e «Da dove arrivano i nuovi clienti» contano solo i nuovi clienti del periodo.',
      'Scheda cliente: «Storico percorsi», una scheda per vendita (primo percorso, rinnovo 1, 2…, upsell) con date, stato, incassato, da incassare e le rate da segnare incassate.',
      '«Ha rinnovato» apre il rinnovo che parte dal giorno dopo la fine del percorso precedente (o da oggi, se è finito da più di un mese), con lo stesso prodotto se è ancora in vendita; prodotto e prezzo si cambiano, e il percorso vecchio resta nello storico. «Registra rinnovo», in Panoramica e in Rinnovi, apre lo stesso rinnovo.',
      'Anche tu fissi le call, per te o per un setter, comprese quelle già fatte che nell’app mancano, fino a un anno indietro.',
      '«Compila la giornata» in Setting › Closer: le call del giorno con i bottoni dell’esito, e la riga del giorno si riempie da sola; tu, con «Aggiungi una call», registri una call fatta che nell’app manca.',
      'Giornata del closer e del setter: cash e revenue solo dei clienti nuovi; il cash è la prima rata incassata, sul giorno della vendita.',
      'Rinnovi e upsell nascono senza setter, se non vengono da una call fissata: su di loro niente provvigione. Le vendite già registrate non cambiano.',
      'Il report del setter non chiede più discovery svolte e call qualificate: le registra il closer su ogni call.',
      'Incassi e riepilogo serale dicono il percorso e la rata («Rinnovo · Rata 2 di 2»).',
    ],
    correzioni: [
      'Una call registrata dopo che si è tenuta conta come prenotata nel giorno in cui si è tenuta.',
      'Una vendita nata da una call chiusa prende la data della call.',
      'Nelle metriche per fonte, i clienti senza fonte contano in «altro».',
    ],
    perChi: ['admin', 'setter', 'closer'],
  },
  {
    versione: '1.2.0',
    data: '2026-09-29',
    titolo: 'Setter e closer giorno per giorno',
    riassunto: 'Setting si divide in Setter e Closer, come le due metà del tuo Excel, e ogni numero spiega cosa conta.',
    novita: [
      'Setting con due schede, Setter e Closer, giorno per giorno. La metà del closer si calcola dalle call e dalle vendite, mai inserita due volte.',
      'Sei «Admin · Closer»: la scheda Closer mostra i tuoi numeri.',
      'Il closer ha «I miei numeri» nel menu: la sua giornata, giorno per giorno.',
      'I miei numeri del setter: «Giorno per giorno», il suo setting accanto agli esiti delle call che ha fissato.',
      'I DM totali ora contano anche i follow up: outbound + inbound + follow up (prima solo outbound + inbound); le conversazioni non ci entrano. Cambiano di conseguenza tasso di conversazione e DM per call prenotata.',
      'Le call prenotate si dividono per fonte del lead (inbound, outbound), nel giorno in cui sono fissate.',
      'Ogni numero ha la sua spiegazione, in una legenda per sezione.',
      'Il setter fissa solo discovery call; le strategy restano nello storico.',
      '«Oggi» tra i periodi rapidi, al posto di «Ultimi 30 giorni».',
      'Il setter vede se una sua vendita gli fa maturare provvigione.',
      'Progetti: un task può avere più assegnatari, tutti membri del progetto.',
    ],
    perChi: ['team'],
  },
  {
    versione: '1.1.2',
    data: '2026-09-29',
    titolo: 'Alfire dice perché non risponde',
    riassunto: 'Alfire spiega ogni errore e sta nei limiti del piano gratuito di Groq.',
    novita: [],
    correzioni: [
      'Al posto del generico «Alfire non ha risposto», il motivo vero: limite del minuto (con l’attesa), limite del giorno, richiesta troppo lunga, chiave sbagliata, modello non disponibile, Groq fermo.',
      'Richieste più leggere: una domanda che legge soltanto parte senza gli strumenti di scrittura, circa metà dei token, così le letture stanno nel limite al minuto del piano gratuito.',
      'Il vocale finisce nella casella: lo rileggi, lo correggi e lo mandi con Invio.',
    ],
    perChi: ['team'],
  },
  {
    versione: '1.1.1',
    data: '2026-09-28',
    titolo: 'Accesso con Google sul nuovo dominio',
    riassunto: 'Il login con Google funziona su dashboard.percorsoalpha.com, anche con una sessione vecchia nel browser.',
    novita: [],
    correzioni: [
      'Nessuno riusciva a entrare su dashboard.percorsoalpha.com: il ritorno da Google finiva sul vecchio indirizzo vercel.app e il codice di accesso si perdeva. Ora l’accesso si completa comunque.',
      'Una sessione scaduta rimasta nel browser non blocca più il login con Google.',
      'Un ritorno da Google fallito o vecchio non fa mai uscire chi è già dentro.',
    ],
    perChi: ['team'],
  },
  {
    versione: '1.1.0',
    data: '2026-09-27',
    titolo: 'Rinnovi, previsione di cassa e i clienti del setter',
    riassunto: 'Una pagina per i rinnovi, la cassa dei prossimi mesi, gli obiettivi del mese, i promemoria su WhatsApp, e il setter vede quanto hanno pagato i clienti che ha portato.',
    novita: [
      'Rinnovi: chi finisce il percorso entro 30 o 60 giorni e chi l’ha finito da meno di 90 senza rinnovare, con WhatsApp e «Registra rinnovo»; in cima il tasso di rinnovo del mese.',
      'Incassi: previsione di cassa del mese e dei due successivi; «Scrivi su WhatsApp» apre la chat del cliente con il promemoria già scritto.',
      'Panoramica: obiettivi del mese (cash e nuovi clienti) con l’avanzamento, e da quale fonte arrivano i soldi, con la quota di ciascuna.',
      'Riepilogo serale via email agli admin: cash del giorno, incassi, vendite, rate in ritardo e totali del team, mai i nomi di chi ha compilato; il lunedì con il backup.',
      'I miei numeri del setter: «I tuoi clienti», quanto hanno pagato, in quante rate e la provvigione di ogni incasso.',
      'Provvigioni: la parte del setter cliente per cliente, anche nella scheda della vendita.',
      'Setting: «Aggiungi giornata» per un setter o per te; un giorno che c’è già si corregge dalla sua riga.',
      'Scheda cliente: «Interrompi il percorso» per chi smette prima, con l’anteprima di cosa cambia; gli incassi non si toccano.',
      'Tutorial interattivo: si tocca il link vero e il tour continua dentro la pagina.',
    ],
    correzioni: [
      'Puoi essere tu il setter di una vendita o di un cliente, quando il cliente l’hai portato tu: su quella vendita non matura provvigione.',
      'Revisione grafica: Incassi più leggibile sul telefono, top bar con logo, timer, Alfire e profilo.',
    ],
    perChi: ['admin', 'setter'],
  },
  {
    versione: '1.0.0',
    data: '2026-09-27',
    titolo: 'In produzione con i dati veri',
    riassunto: 'Alpha Management va online con lo storico dell’Excel e il tuo foglio delle call: da qui si lavora sui dati veri.',
    novita: [
      'Online su Vercel, con i server a Francoforte, vicino al database; in giornata il nome Alpha Management e il dominio dashboard.percorsoalpha.com.',
      'Storico importato: dall’Excel i report del setter di luglio e agosto, le vendite di luglio, i pagamenti e la regola del 5% di Loris; dal tuo foglio delle call lead e call con esito, performance e importo proposto.',
      'Vendite: prodotti personalizzati e piani rate scritti a mano; le rate si aggiungono e si tolgono.',
      'Ogni numero di Panoramica, Vendite, Incassi, Costi e Setting anche su un periodo a scelta, non solo sul mese.',
      'Team: inviti via email con il logo; eliminare una persona o unirla a un altro profilo.',
      'Pieno controllo: ogni dato si corregge e si elimina, dopo una domanda che dice cosa si porta dietro.',
      'Progetti e tempo: reparti, progetti da modelli, task, Gantt, note, timer con la sveglia e I miei task. Il timer acceso lo vede solo chi l’ha avviato.',
      'Alfire, l’assistente AI in chat e a voce, e il profilo con la foto.',
      'Tutorial al primo accesso, backup settimanale via email e app installabile su iPhone e Android.',
    ],
    correzioni: ['Un login fallito non dice più «non sei invitato»: lo dice solo a chi non ha l’invito.'],
    perChi: ['team'],
  },
  {
    versione: '0.3.0',
    data: '2026-09-27',
    titolo: 'Dashboard, team e impostazioni',
    riassunto: 'I numeri del mese calcolati nel database, la Panoramica in tempo reale e la gestione del team.',
    novita: [
      'Tutte le metriche calcolate nel database, verificate su un mese costruito a mano.',
      'Panoramica in tempo reale: cinque numeri con il confronto sul mese prima, cash dei 12 mesi, funnel, da incassare e clienti in scadenza.',
      'Incassi, Setting, Provvigioni (maturato, pagato, saldo) e I miei numeri del setter.',
      'Team (inviti, ruoli, disattivazione), regole provvigionali, CSV per la commercialista e registro delle modifiche.',
      'Ogni dato inserito resta modificabile: lead, call, report, clienti, vendite, rate, costi, pagamenti e regole.',
      'Dettagli della call: link alla registrazione, performance, prodotto e importo proposto; l’importo il setter non lo vede mai.',
    ],
    perChi: ['admin', 'setter', 'closer'],
  },
  {
    versione: '0.2.0',
    data: '2026-09-26',
    titolo: 'Inserimento dei dati',
    riassunto: 'Il setter compila la giornata dal telefono, il closer registra gli esiti, le vendite nascono con il loro piano rate.',
    novita: [
      'Oggi del setter: il report del giorno con contatori grandi, salvataggio automatico e «Salvato alle 18:42», senza bottone da ricordarsi.',
      'Nuova call: lead e call insieme, con te come closer predefinito.',
      'Le mie call: esito in massimo 3 tocchi; una call chiusa apre la nuova vendita già compilata.',
      'Vendita con il piano rate generato da solo, rata incassata con un tocco, rimborsi.',
      'Pipeline dei lead, con lo stato cambiato a mano in un tocco.',
      'Clienti con stato e valore nel tempo, prodotti, costi con i ricorrenti copiati dal mese prima.',
      'Logo con il fuoco al login e breve intro all’ingresso.',
    ],
    perChi: ['admin', 'setter', 'closer'],
  },
  {
    versione: '0.1.0',
    data: '2026-09-26',
    titolo: 'Fondamenta',
    riassunto: 'Database, accessi e navigazione per ruolo: la base su cui è costruito tutto il resto.',
    novita: [
      'Database con vendite, incassi, setting, provvigioni e costi, e i permessi per ruolo su ogni riga.',
      'Accesso solo su invito, con Google.',
      'Navigazione diversa per admin, setter e closer: barra laterale sul computer, barra in basso sul telefono.',
      'Tema scuro con i colori di Percorso Alpha.',
    ],
    perChi: ['team'],
  },
]

/** The version in production: the first entry. */
export const VERSIONE_CORRENTE: Versione | undefined = VERSIONI[0]

/** Semver order: negative when a comes before b. Numbers compare as numbers (1.10.0 > 1.9.0). */
export function confrontaVersioni(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}
