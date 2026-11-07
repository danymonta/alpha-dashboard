/**
 * The Dashboard's changelog (Dany, 30/09/2026): every version, newest first,
 * at /changelog ("Novità"). Since 1.12.0 every role opens it and reads only
 * the items of their own work; the admin reads everything (CLAUDE.md
 * section 23). The filter is lib/changelog/visibili.ts.
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
 * order, the semver, the dates, package.json and who reads what.
 *
 * Audience, per item (`per`) and per heading (`intestazionePer`):
 * - 'admin' alone: only the admin. It is the default answer when in doubt.
 * - 'setter', 'closer': that role (the admin reads everything anyway).
 * - 'progetti': the Projects area, which every role has.
 * - 'marketing': the Marketing area, the content calendar (1.32.0): the
 *   admin, the video editor and marketing.
 * - 'tutti': everyone (Alfire in general, the installable app, the login).
 * A collaborator never reads about clients' payments, costs, margin, other
 * people's commissions or the admin's economics (CLAUDE.md section 6); the
 * setter may read about his own numbers, clients and commissions and, since
 * 07/10/2026, about the Closer page: the closer's totals by day on every
 * setter's calls, new clients' cash and revenue included (the second
 * exception of section 6), never another setter's sale, client or payment;
 * the closer about his calls, sales and day.
 *
 * Words: Italian, plain and concrete, never file or function names. `testo`,
 * `titolo` and `riassunto` are written for the owner ("tu" is Dany); when an
 * item or heading the team reads speaks to him, `testoTeam` or
 * `intestazioneTeam` hold the words the team reads instead.
 */

export type Pubblico = 'admin' | 'setter' | 'closer' | 'marketing' | 'progetti' | 'tutti'

export type Voce = {
  /** Who reads it besides the admin; ['admin'] = only the admin. 'admin' and 'tutti' stand alone. */
  per: readonly Pubblico[]
  testo: string
  /** What the team reads when `testo` speaks to Dany. */
  testoTeam?: string
}

export type Intestazione = { titolo: string; riassunto: string }

export type Versione = {
  /** Semver, without the "v": "1.9.0". */
  versione: string
  /** Day of the deploy, YYYY-MM-DD (Europe/Rome). */
  data: string
  titolo: string
  /** One sentence. */
  riassunto: string
  /**
   * Who reads titolo and riassunto besides the admin. The others see a neutral
   * heading: version, date and how many items are theirs.
   */
  intestazionePer: readonly Pubblico[]
  /** What the team reads when titolo or riassunto speak to Dany. */
  intestazioneTeam?: Intestazione
  novita: Voce[]
  correzioni?: Voce[]
}

export const ETICHETTA_PUBBLICO: Record<Pubblico, string> = {
  admin: 'Solo admin',
  setter: 'Setter',
  closer: 'Closer',
  marketing: 'Area Marketing',
  progetti: 'Area Progetti',
  tutti: 'Tutto il team',
}

/** Newest first. A new deploy goes on top. */
export const VERSIONI: readonly Versione[] = [
  {
    versione: '1.71.0',
    data: '2026-11-07',
    titolo: 'Cerca una persona nell’Insight',
    riassunto: 'Nell’Insight delle ultime 24h scrivi il nome o l’@username di chi ti ha scritto e trovi subito la sua chat.',
    intestazionePer: ['setter'],
    novita: [
      {
        per: ['setter'],
        testo:
          'In Insight 24h, sopra i numeri, c’è «Cerca una persona»: scrivi un pezzo del nome o dell’@username e sotto restano solo le sue chat, con la scheda completa (messaggio suggerito, «Copia», «Fatto»). Non contano maiuscole, accenti, la @ e i punti o i trattini bassi dell’username. Cerca nel recap che hai aperto: per un altro giorno o per Messenger cambi giorno o scheda. La X, Esc o «Togli la ricerca» tornano a tutte le chat.',
      },
    ],
  },
  {
    versione: '1.70.0',
    data: '2026-11-01',
    titolo: 'Evidenziatore e link cliccabili negli script',
    riassunto:
      'Nelle sezioni di un contenuto selezioni un testo e gli dai un colore o uno sfondo, come in Notion; i link si aprono da un piccolo menu sotto, come in Google Drive.',
    intestazionePer: ['marketing'],
    novita: [
      {
        per: ['marketing'],
        testo:
          'Selezioni un testo in una sezione (messaggio, script, commenti, caption) e sopra compare un piccolo menu: grassetto, corsivo, barrato, link e «Colore». «Colore» apre due gruppi, «Colore del testo» e «Sfondo», con i colori di Notion (grigio, marrone, arancione, giallo, verde, blu, viola, rosa, rosso); «Predefinito» toglie il colore. Si salva da solo come ogni modifica, e la pagina del contenuto mostra i colori anche in lettura.',
      },
      {
        per: ['marketing'],
        testo:
          'I link dentro le sezioni sono cliccabili: un clic mette il cursore nel link, così lo modifichi ancora, e sotto compare un piccolo riquadro con l’indirizzo, «Apri» (in una nuova scheda), «Copia», «Modifica» e «Togli il link». Ctrl/⌘ + clic apre subito il link; Ctrl/⌘ + K su un testo selezionato aggiunge o cambia il link. Un indirizzo scritto così com’è (https://… o www.…) diventa un link da solo e resta scritto così.',
      },
      {
        per: ['marketing'],
        testo:
          'Dalla tastiera: Alt+F10 porta al menu che si vede, le frecce passano da un bottone all’altro, Esc torna al testo. Sul telefono i bottoni sono grandi abbastanza per il dito.',
      },
      {
        per: ['marketing'],
        testo:
          'Claude collegato conserva i colori quando riscrive una sezione e non ne aggiunge di suoi; le analisi dei reel non li leggono.',
      },
    ],
    correzioni: [
      {
        per: ['marketing'],
        testo:
          'Un indirizzo scritto senza parentesi in una sezione, toccando il testo, tornava salvato come [indirizzo](indirizzo) e con delle barre in mezzo (a\\_b): ora resta com’era.',
      },
    ],
  },
  {
    versione: '1.69.0',
    data: '2026-10-31',
    titolo: 'Il Piano editoriale anche a calendario',
    riassunto:
      'Sotto Reels e YouTube scegli «Tabella» o «Calendario»: il mese come in Notion, ogni contenuto nel suo giorno con lo Status colorato, da spostare trascinandolo.',
    intestazionePer: ['marketing'],
    novita: [
      {
        per: ['marketing'],
        testo:
          'Nel Piano editoriale torna il calendario: sotto le schede Reels e YouTube scegli «Tabella» o «Calendario», e il telefono o il computer si ricordano la scelta. Il mese va da lunedì a domenica, con oggi in evidenza, le frecce per il mese prima e dopo (anche i mesi avanti) e «Oggi». I filtri restano cambiando vista.',
      },
      {
        per: ['marketing'],
        testo:
          'Ogni contenuto è una piccola scheda nel giorno della sua Post Date: il Name, lo Status come etichetta col colore di Notion, l’icona e il nome, e il Reel Type. Sopra il calendario la legenda degli Status con quanti contenuti ha il mese per ognuno: un tocco mostra solo quelli, un altro tocco toglie il filtro.',
      },
      {
        per: ['marketing'],
        testo:
          'Trascini una scheda su un altro giorno e la Post Date cambia subito (se qualcuno l’ha cambiata nel frattempo, torna dov’era e te lo dice); il «+» su un giorno crea un contenuto con quella data e lo apre nel pannello. Un tocco sulla scheda apre il pannello, come dalla tabella. In fondo i contenuti senza data.',
      },
      {
        per: ['marketing'],
        testo:
          'Sul telefono il mini mese ha un pallino colorato per ogni contenuto del giorno, col colore del suo Status (fino a tre, poi «+»), e sotto l’elenco dei giorni con i loro contenuti.',
      },
    ],
  },
  {
    versione: '1.68.0',
    data: '2026-10-31',
    titolo: 'Spese personali',
    riassunto:
      'In Amministrazione, accanto a Costi, una sezione per le tue spese personali: separate dall’azienda, non entrano mai nel margine operativo.',
    intestazionePer: ['admin'],
    novita: [
      {
        per: ['admin'],
        testo:
          'Nuova voce «Spese personali» in Amministrazione, subito dopo «Costi»: registri casa e bollette, spesa, mangiare fuori, trasporti, salute, cura della persona, abbonamenti e altro, con data, importo e se si ripete ogni mese. Vedi il totale del periodo e quanto per categoria, correggi ed elimini ogni spesa, e «Copia le ricorrenti» porta nel mese quelle del mese prima.',
      },
      {
        per: ['admin'],
        testo:
          'Le spese personali restano fuori dai conti dell’azienda: Costi, margine operativo, Panoramica, riepilogo del venerdì, recap del business coach e i numeri che legge Claude non le vedono mai. Le vedi solo tu: nessun altro ruolo, né Claude collegato, né Alfire.',
      },
    ],
  },
  {
    versione: '1.67.0',
    data: '2026-10-30',
    titolo: 'I follow-up in chat su Google Calendar',
    riassunto:
      'Sulle call finite in follow-up in chat «Promemoria su Calendar» mette «Risentire …» nel tuo calendario Follow up, con il motivo e il link della call.',
    intestazionePer: ['closer'],
    novita: [
      {
        per: ['closer'],
        testo:
          'Sulla scheda di una call finita in «Follow-up in chat», accanto a «Fissa la call di follow-up», c’è «Promemoria su Calendar»: scegli il giorno (domani, tra 3 giorni, tra una settimana, tra un mese, o un altro) e l’ora, e su Google Calendar compare un evento di 15 minuti «Risentire …», con una nota già scritta che puoi cambiare: il giorno della call, il motivo di non chiusura, la registrazione di Fathom e il link alle tue call. Lo trovi anche nel messaggio che compare dopo aver registrato un follow-up in chat.',
      },
      {
        per: ['closer'],
        testo:
          'Quando il calendario Follow up è collegato, l’evento si scrive lì con un tocco (Google chiede una volta il permesso sul calendario); altrimenti si apre Google Calendar con l’evento già scritto, da controllare e salvare. Il gestionale non salva niente: il promemoria sta solo nel tuo calendario.',
      },
      {
        per: ['admin'],
        testo:
          'Per scrivere direttamente nel calendario Follow up: in Google Cloud attiva la Google Calendar API nel progetto del login, aggiungi il permesso sugli eventi del calendario alla schermata di consenso e su Vercel imposta GOOGLE_CALENDAR_FOLLOW_UP con l’ID del calendario, poi rifai il deploy. Senza, il bottone apre Google Calendar con l’evento già scritto.',
      },
    ],
  },
  {
    versione: '1.66.0',
    data: '2026-10-29',
    titolo: 'Pausa del timer',
    riassunto: 'Il timer si mette in pausa e riprende: fermandolo salva solo il tempo in cui è andato.',
    intestazionePer: ['progetti'],
    novita: [
      {
        per: ['progetti'],
        testo:
          'Il timer ha «Pausa» e «Riprendi», in alto a destra e in Il mio tempo. In pausa il cronometro sta fermo e lo dice, anche sugli altri dispositivi; fermandolo si salvano solo i minuti in cui è andato, senza le pause. Una voce con delle pause ha la sola durata, senza la fascia oraria.',
      },
    ],
  },
  {
    versione: '1.65.0',
    data: '2026-10-27',
    titolo: 'Le call si analizzano da Fathom',
    riassunto:
      'Le call svolte senza link della registrazione l’app le cerca da sola su Fathom, le collega e le manda a Claude: «Dalle call» si riempie senza incollare niente.',
    intestazionePer: ['admin'],
    novita: [
      {
        per: ['admin'],
        testo:
          'Marketing › Dalle call: «Cerca su Fathom e analizza» trova su Fathom le registrazioni delle call svolte del periodo che non hanno un link, dal nome del lead e dall’orario della call, le collega e le mette in coda per l’analisi di Claude. La pagina dice quante call sono senza registrazione e quante Claude sta analizzando, e si aggiorna da sola.',
      },
      {
        per: ['admin'],
        testo:
          'Ogni sera l’app fa la stessa ricerca sulle call degli ultimi 7 giorni, così le analisi arrivano senza toccare niente. Le call segnate «non registrata» restano fuori, e un link scritto da una persona non si cambia mai. Le analisi restano dentro il limite di spesa del mese di Impostazioni › Fathom.',
      },
    ],
  },
  {
    versione: '1.64.0',
    data: '2026-10-27',
    titolo: 'Di cosa parlare oggi, topic dalle call e soldi nascosti',
    riassunto:
      'In Panoramica un riquadro con gli spunti per le stories e un occhietto che nasconde i soldi; nel Marketing la scheda «Dalle call» trasforma le obiezioni in topic.',
    intestazionePer: ['admin'],
    novita: [
      {
        per: ['admin'],
        testo:
          'Panoramica: «Di cosa parlare oggi» mette insieme i temi dei DM dell’ultimo recap, le obiezioni più frequenti delle call degli ultimi 14 giorni con il loro topic per le stories e le prime idee degli ultimi Spunti. Nessuna richiesta nuova a Claude: usa quello che l’app ha già.',
      },
      {
        per: ['admin'],
        testo:
          'Panoramica: «Nascondi i soldi» toglie cash, revenue, margine, obiettivi, grafico, incassi e fonti; restano setting, call, funnel, rapporti, scadenze e gli spunti. La scelta resta su questo dispositivo finché non tocchi «Mostra i soldi».',
      },
      {
        per: ['admin'],
        testo:
          'Marketing › «Dalle call»: le obiezioni delle call analizzate da Claude, dalla più frequente, ognuna con un topic per le stories, cosa dicono i lead, come è stata gestita bene e le idee di contenuto delle stesse call. Ultimi 14, 30 o 90 giorni. Solo per te.',
      },
    ],
  },
  {
    versione: '1.63.0',
    data: '2026-10-27',
    titolo: 'Insight: da rispondere, follow-up, in attesa',
    riassunto:
      'Nell’Insight delle ultime 24h le chat si dividono in Da rispondere, Follow-up e In attesa, e in ogni divisione prima i lead più vicini alla call.',
    intestazionePer: ['setter'],
    novita: [
      {
        per: ['setter'],
        testo:
          'Nell’Insight, sopra le chat, quattro bottoni: Tutte, Da rispondere (il lead ha scritto per ultimo), Follow-up (abbiamo scritto noi e c’è un messaggio da mandare adesso, comprese le chat da riattivare) e In attesa (tocca al lead), ognuno col suo numero. In ogni divisione le chat stanno in gruppi per vicinanza alla call: A un passo dalla call, Call prenotata, In qualifica, Primi messaggi, Nurture o fuori target; dentro ogni gruppo prima la fase più avanti, poi i lead in target, la priorità e chi aspetta da più tempo.',
      },
    ],
  },
  {
    versione: '1.62.0',
    data: '2026-10-25',
    titolo: 'Tutta l’app in inglese',
    riassunto:
      'Con la bandierina su EN ora è in inglese tutta l’interfaccia, anche i fogli che scrivono, Oggi, i pannelli dei contenuti e dei reel, i progetti e le impostazioni.',
    intestazionePer: ['tutti'],
    novita: [
      {
        per: ['tutti'],
        testo:
          'Con la bandierina su EN sono in inglese anche i fogli che prima restavano in italiano: l’esito di una call con la registrazione, Sposta, la matita, la nuova call, la nuova vendita con il piano rate, gli incassi, le schede del cliente, le provvigioni e i costi, la domanda prima di eliminare, i messaggi d’errore più comuni.',
        testoTeam:
          'Con la bandierina su EN sono in inglese anche le pagine e i fogli che prima restavano in italiano, comprese le conferme prima di eliminare e i messaggi d’errore più comuni.',
      },
      {
        per: ['setter'],
        testo:
          'In inglese anche Oggi (il report, il commento della giornata, le schede da Instagram), I miei numeri e la cornice dell’Insight; per l’admin anche «Tracciamento da approvare» e «Compila la giornata».',
        testoTeam: 'In inglese anche Oggi, con il report, il commento della giornata e le schede da Instagram, I miei numeri e la cornice dell’Insight.',
      },
      {
        per: ['marketing'],
        testo:
          'In inglese anche il pannello e la pagina di un contenuto, con l’editor delle sezioni, il pannello di un reel con punteggio e analisi, «Collega» e «Aggiorna da Instagram». I testi scritti da Claude restano in italiano.',
      },
      {
        per: ['progetti'],
        testo: 'In inglese anche la timeline dei progetti, Attività, Gantt, la scheda Tempo, Note e Membri del progetto.',
      },
      {
        per: ['admin'],
        testo:
          'In inglese anche tutte le Impostazioni: Chiavi e collegamenti con le guide, Instagram e Messenger, Fathom, Team, Prodotti, Regole provvigioni, Esporta, Progetti. Restano in italiano i dati scritti dalle persone, i testi di Claude, le email, le risposte di Alfire e la pagina privacy.',
      },
    ],
  },
  {
    versione: '1.61.0',
    data: '2026-10-25',
    titolo: 'Gli script si scrivono subito, come in Notion',
    riassunto:
      'Le sezioni di un contenuto (messaggio, script, commenti, caption) sono sempre modificabili: niente più «Modifica» e «Salva», il testo si salva da solo e Ctrl+B mette il grassetto.',
    intestazionePer: ['marketing'],
    novita: [
      {
        per: ['marketing'],
        testo:
          'Nel pannello e nella pagina di un contenuto ogni sezione è già un campo: tocchi il testo e scrivi. Si salva da solo poco dopo l’ultimo tasto e quando esci dal campo; nel titolo della sezione vedi «Salvo…» e poi «Salvato».',
      },
      {
        per: ['marketing'],
        testo:
          'Si scrive come in Notion: Ctrl+B (⌘+B sul Mac) grassetto, Ctrl+I corsivo, «- » all’inizio della riga fa un elenco, «1. » un elenco numerato, «## » un titolo, Shift+Invio va a capo nello stesso paragrafo, Ctrl+Z annulla. Quello che vedi è già formattato: niente asterischi da scrivere a mano.',
      },
      {
        per: ['marketing'],
        testo:
          'Esc esce dal campo e salva, il pannello resta aperto; chiudendo il pannello quello che hai scritto si salva comunque. Se intanto qualcun altro ha cambiato la stessa sezione, vedi il suo testo e il tuo resta sotto, da copiare, come prima.',
      },
    ],
  },
  {
    versione: '1.60.0',
    data: '2026-10-24',
    titolo: 'I video YouTube nel Piano editoriale, e le reference cliccabili',
    riassunto:
      'Il Piano editoriale ha due schede, «Reels» e «YouTube»: i video di YouTube stanno a parte, senza mischiarsi con i reel. E la reference di ogni contenuto si apre dalla tabella con un tocco.',
    intestazionePer: ['marketing'],
    novita: [
      {
        per: ['marketing'],
        testo:
          'In tabella c’è di nuovo la colonna «Inspiration»: se un contenuto ha la reference, «Apri» la apre in una nuova scheda con un tocco, senza mostrare il link; la matita accanto la cambia, e il «+» la aggiunge. Sul telefono «Apri» sta nella scheda del contenuto.',
      },
      {
        per: ['marketing'],
        testo:
          'Sotto il titolo del Piano editoriale due schede: «Reels», con i reel e i caroselli di sempre, e «YouTube», per i video di YouTube. Un video YouTube ha Name, Type, Inspiration, Status, Post Date, URL e Views, senza Format, e nel pannello le sezioni Idea / Message, Script (che parte da Hook, Intro, le parti e la CTA), Comments e Title & Description. «Nuovo» dalla scheda YouTube crea un video YouTube.',
      },
      {
        per: ['marketing'],
        testo:
          'Un video YouTube non si collega mai a un post di Instagram e non entra nelle analisi dei reel. Cambiando il Modello di un contenuto nel pannello, passa da una scheda all’altra.',
      },
    ],
  },
  {
    versione: '1.59.0',
    data: '2026-10-23',
    titolo: 'Il recap vendite a calendario, giorno per giorno',
    riassunto:
      'Il recap del business coach mostra un mese alla volta come un calendario, o come il foglio Excel, con il dettaglio di ogni giorno e i rapporti del foglio calcolati con le definizioni dell’app.',
    intestazionePer: ['admin'],
    novita: [
      {
        per: ['admin'],
        testo:
          'Il «Recap vendite» si legge per mese: in alto si sceglie il mese (quello in corso o uno passato) e le tessere si confrontano con il mese prima. Sotto, il mese come un calendario da lunedì a domenica: in ogni giorno i DM, le conversazioni, le call prenotate, le call svolte, le chiuse e il cash, con le parole e un’icona; un giorno senza niente lo dice, oggi è segnato e i giorni che devono ancora venire sono grigi. Dal telefono il calendario diventa l’elenco dei giorni con attività.',
      },
      {
        per: ['admin'],
        testo:
          'Un tocco su un giorno apre il suo dettaglio come una riga del foglio: il setting (outbound, inbound, follow up, DM totali, conversazioni, call proposte e prenotate) e il closing (call svolte, qualificate, no show, follow up, cancellate, in attesa di conferma, chiuse, cash della prima rata e revenue dei nuovi clienti), con show rate e close rate del giorno e le frecce per passare al giorno prima o dopo.',
      },
      {
        per: ['admin'],
        testo:
          'Con «Tabella» lo stesso mese è il foglio: un giorno per riga, setting a sinistra e closing a destra, il totale del mese in fondo. La vista scelta resta per la volta dopo.',
      },
      {
        per: ['admin'],
        testo:
          'In fondo, «Riepilogo del mese» con i rapporti del foglio (DM su conversazioni, call proposte su prenotate, DM su call qualificate, DM per call prenotata, show rate, tasso di qualificazione, close rate, cash e revenue per DM, cash per call svolta, valore medio di un cliente nuovo, cash medio per chiusura), ognuno con il mese prima. Sono calcolati dal database con le definizioni dell’app, non con le formule rotte del foglio. I tre grafici di prima non ci sono più: li sostituisce il calendario.',
      },
    ],
  },
  {
    versione: '1.58.0',
    data: '2026-10-23',
    titolo: 'Il business coach ha solo il recap vendite',
    riassunto:
      'Il business coach non vede più l’app: entra su una pagina sola, «Recap vendite», con DM, conversazioni, call, chiuse e cash dai nuovi clienti del periodo, il funnel e tre grafici. Tu la apri da Amministrazione.',
    intestazionePer: ['admin'],
    novita: [
      {
        per: ['admin'],
        testo:
          'Il business coach entra sul «Recap vendite» e non vede altro: niente menu, campanella, Alfire, timer, tutorial o Novità, e ogni altra pagina lo riporta lì. In alto restano il logo, la lingua, il tema ed Esci. La pagina ha il periodo con il confronto col periodo prima, le tessere (cash incassato dai nuovi clienti, revenue nuovi clienti, call chiuse con il close rate, call svolte con lo show rate, call prenotate, DM totali con outbound, inbound e follow up, conversazioni), il funnel e tre grafici con la loro tabella (DM, call svolte e chiuse, cash dai nuovi clienti), giorno per giorno, settimana per settimana o mese per mese secondo il periodo. Solo totali: mai un cliente, una persona, i costi, il margine o le provvigioni. Tutti i numeri li calcola il database, con le stesse funzioni della Panoramica.',
      },
      {
        per: ['admin'],
        testo:
          'Tu apri la stessa pagina da Amministrazione › «Recap del business coach», per vedere quello che vede lui, e torni all’app con «Torna all’app».',
      },
      {
        per: ['admin'],
        testo:
          'Nel database il business coach non legge più niente oltre al suo profilo e al recap: niente clienti, vendite, call, progetti o contenuti, nessuna notifica, Claude collegato non si collega più con il suo account (la pagina di consenso glielo dice) e Alfire non è attiva per lui. Il suo ruolo in Team resta come prima.',
      },
    ],
  },
  {
    versione: '1.57.1',
    data: '2026-10-23',
    titolo: 'Il codice di accesso via email ha 8 cifre',
    riassunto: 'La pagina di accesso accetta il codice di 8 cifre che arriva via email: prima chiedeva 6 cifre e lo rifiutava.',
    intestazionePer: ['tutti'],
    novita: [],
    correzioni: [
      {
        per: ['tutti'],
        testo: 'Entrando con l’email, il codice che arriva ha 8 cifre e ora la pagina lo accetta: prima diceva «Il codice ha 6 cifre» e non faceva entrare.',
      },
    ],
  },
  {
    versione: '1.57.0',
    data: '2026-10-23',
    titolo: 'I miei task e Il mio tempo anche in inglese',
    riassunto:
      'Con la bandierina su EN anche I miei task e Il mio tempo sono in inglese: gruppi, completati, totali, voci, il modulo per registrare il tempo e il timer in alto.',
    intestazionePer: ['progetti'],
    novita: [
      {
        per: ['progetti'],
        testo:
          'Con la bandierina su EN, I miei task (gruppi per scadenza, Completati, Riapri, messaggi) e Il mio tempo (periodo, totali per progetto e task, voci, il modulo con durata o fascia oraria, il timer in alto) sono in inglese. Titoli dei task, nomi dei progetti e note restano come li avete scritti.',
      },
    ],
  },
  {
    versione: '1.56.0',
    data: '2026-10-23',
    titolo: 'Claude lavora anche su costi, provvigioni, obiettivi e numeri dell’azienda',
    riassunto:
      'Ultima fase di Claude a 360 gradi: Claude collegato legge i numeri della Panoramica, i costi, le provvigioni e il team, e tu da lì registri costi e pagamenti, gestisci le regole provvigionali e imposti gli obiettivi; il setter legge le sue provvigioni.',
    intestazionePer: ['setter'],
    intestazioneTeam: {
      titolo: 'Claude legge anche le tue provvigioni',
      riassunto:
        'Con Claude collegato ad Alpha Management leggi a parole anche le tue provvigioni maturate e pagate, mese per mese, come in I miei numeri.',
    },
    novita: [
      {
        per: ['admin'],
        testo:
          'Tu da Claude leggi i numeri dell’azienda come la Panoramica (cash incassato nelle sue quattro parti, revenue, margine operativo, indicatori sui nuovi clienti, funnel e confronto col periodo prima), il cash mese per mese, la previsione di cassa, gli obiettivi del mese con l’avanzamento, i numeri per fonte, i costi, le provvigioni per persona e mese con il saldo e per vendita, le regole provvigionali e il team (persone e inviti in attesa). Scrivi un costo (registra, correggi, copia i ricorrenti), un pagamento di provvigioni (registra, correggi), una regola provvigionale (nuova, chiudi, correggi) e gli obiettivi del mese. Tutti i numeri li calcola il gestionale, con le stesse funzioni delle pagine: Claude non somma niente, e il margine operativo lo chiama sempre così, mai utile. Da Claude non si elimina niente (né costi, né pagamenti, né regole, né obiettivi) e il team si legge e basta: inviti, ruoli, disattivazioni ed eliminazioni restano nell’app. Il business coach legge tutto questo come te e non scrive niente. Il closer non riceve niente di nuovo.',
      },
      {
        per: ['setter'],
        testo:
          'Il setter, da Claude, legge le sue provvigioni maturate e pagate mese per mese, come in I miei numeri: mai quelle di altri, mai la sua regola o la percentuale, e non scrive niente.',
        testoTeam:
          'Da Claude leggi le tue provvigioni maturate e pagate, mese per mese, come in I miei numeri. Per i dettagli cliente per cliente resta la domanda sui tuoi clienti.',
      },
    ],
  },
  {
    versione: '1.55.1',
    data: '2026-10-23',
    titolo: 'La matita delle call e «Riapri» funzionano anche prima dell’aggiornamento del database',
    riassunto:
      'Finché il database non ha l’ultimo aggiornamento, la matita delle call del setter, «Riapri» e «Riattiva» sui clienti usano la strada di prima e funzionano lo stesso.',
    intestazionePer: ['admin'],
    novita: [],
    correzioni: [
      {
        per: ['setter'],
        testo:
          'Il setter che correggeva data, ora o closer di una sua call con la matita poteva ricevere «Call non trovata.»: ora si salva sempre.',
        testoTeam:
          'Correggere data, ora o closer di una tua call con la matita poteva dire «Call non trovata.»: ora si salva sempre.',
      },
      {
        per: ['admin'],
        testo:
          '«Riapri» su un cliente chiuso e «Riattiva» su un cliente sospeso non riuscivano finché il database non aveva l’ultimo aggiornamento: ora funzionano in tutti e due i casi, con lo stesso effetto.',
      },
    ],
  },
  {
    versione: '1.55.0',
    data: '2026-10-23',
    titolo: 'Claude lavora anche su clienti, vendite e incassi',
    riassunto:
      'Claude collegato arriva a clienti, vendite, rate e incassi: tu leggi e scrivi tutto tranne le eliminazioni, il closer lavora sulle sue vendite, il setter legge i suoi clienti; ognuno con i permessi che ha nell’app.',
    intestazionePer: ['setter', 'closer'],
    intestazioneTeam: {
      titolo: 'Claude lavora anche sulle tue vendite e sui tuoi clienti',
      riassunto:
        'Con Claude collegato ad Alpha Management lavori a parole anche sulle vendite e sui clienti che vedi nell’app, con gli stessi permessi.',
    },
    novita: [
      {
        per: ['admin'],
        testo:
          'Tu da Claude leggi i clienti (anche l’elenco con LTV, mese del percorso e rate), le vendite con le rate, gli incassi, quanto resta da incassare e i rinnovi, con la cartella Drive e il contratto come link. Scrivi un cliente (crea, modifica, «Non rinnova», riapri, archivia e togli dall’archivio, sospendi e riattiva), registri una vendita (anche dalla call chiusa o col piano scritto a mano), correggi una vendita e lavori sulle rate (incassa, correggi o annulla l’incasso, fallita, scadenza e importo, rata in più). Un rimborso e «Interrompi il percorso» passano prima dalla loro anteprima: Claude ti mostra cosa cambia e scrive solo se dici sì. I totali li calcola il gestionale, mai Claude. Da Claude non si elimina niente: né clienti, né vendite, né rate; cartella Drive e contratto non si scrivono. Costi, provvigioni, obiettivi, margine e Panoramica arrivano nell’ultima fase. Il business coach legge clienti e vendite come te e non scrive niente.',
      },
      {
        per: ['closer'],
        testo:
          'Il closer, da Claude, legge le vendite che ha chiuso con le loro rate e quanto gli resta da incassare, registra la vendita della sua call chiusa (o di un cliente nuovo), e sulle rate delle sue vendite incassa, corregge e annulla l’incasso e segna fallite. Il piano rate, le correzioni della vendita e i rimborsi restano tuoi; i contatti dei clienti, il metodo di pagamento e le note non gli arrivano da Claude.',
        testoTeam:
          'Da Claude leggi le vendite che hai chiuso con le loro rate e quanto ti resta da incassare, registri la vendita della tua call chiusa (o di un cliente nuovo), e sulle rate delle tue vendite incassi, correggi e annulli l’incasso e segni le rate non pagate. Il piano rate e le correzioni della vendita li fa l’admin, come nell’app.',
      },
      {
        per: ['setter'],
        testo:
          'Il setter, da Claude, legge i clienti che ha portato, quanto hanno pagato e la sua provvigione su ogni incasso, come in I miei numeri: mai i clienti di altri, i contatti, il metodo di pagamento, le note o la percentuale, e su clienti e vendite non scrive niente.',
        testoTeam:
          'Da Claude leggi i clienti che hai portato, quanto hanno pagato e la tua provvigione su ogni incasso, come in I miei numeri. I clienti degli altri e i contatti non arrivano a Claude.',
      },
    ],
  },
  {
    versione: '1.54.0',
    data: '2026-10-23',
    titolo: 'Claude lavora anche su call, lead ed esiti',
    riassunto:
      'Claude collegato arriva a call, lead ed esiti: il setter fissa e sposta le sue call, il closer ne registra l’esito con le regole del foglio, tu fai tutto; ognuno con i permessi che ha nell’app.',
    intestazionePer: ['setter', 'closer'],
    intestazioneTeam: {
      titolo: 'Claude lavora anche sulle tue call',
      riassunto:
        'Con Claude collegato ad Alpha Management lavori a parole anche sulle tue call e sui tuoi lead, con i permessi che hai nell’app.',
    },
    novita: [
      {
        per: ['setter'],
        testo:
          'Il setter, da Claude, legge le call col suo nome e i suoi lead, fissa una call (lead e call insieme, sempre discovery, da 7 giorni fa in avanti), sposta una sua call ancora da fare, la passa a un altro closer, scrive le sue note e sposta i suoi lead nella pipeline. L’esito, il motivo di non chiusura e le note del closer restano del closer, e il link di Fathom, la performance e gli importi non gli arrivano mai, nemmeno usando il collegamento di Claude fuori da Claude.',
        testoTeam:
          'Da Claude leggi le call col tuo nome e i tuoi lead, fissi una call (lead e call insieme, sempre discovery), sposti una tua call ancora da fare, la passi a un altro closer, scrivi le tue note e sposti i tuoi lead nella pipeline. L’esito e le note del closer restano del closer, come nell’app.',
      },
      {
        per: ['closer'],
        testo:
          'Il closer, da Claude, legge le call assegnate a lui e i loro lead e registra l’esito con le regole del foglio: con Follow-up o Persa il motivo di non chiusura è obbligatorio, e per le call dal 16/10/2026 serve il link di Fathom o «non registrata»; fissa la call di follow-up, sposta, corregge con la matita, scrive link, performance, prodotto e importo proposti e le note aggiuntive, e cambia lo stato del lead. Le call nuove le fissano il setter e tu.',
        testoTeam:
          'Da Claude leggi le call assegnate a te e i loro lead e registri l’esito con le regole del foglio: con Follow-up o Persa serve il motivo di non chiusura, e per le call dal 16/10/2026 il link di Fathom o «non registrata». Fissi la call di follow-up, sposti, correggi con la matita, scrivi i dettagli (link, performance, prodotto e importo proposti, note aggiuntive) e cambi lo stato del lead.',
      },
      {
        per: ['admin'],
        testo:
          'Tu da Claude fai quello che fanno setter e closer su ogni call, e fissi call per te o per un setter, anche già fatte, fino a un anno indietro. Il business coach le legge e basta. Da Claude non si elimina né una call né un lead, non si scollega una registrazione, e dopo «Chiusa» la vendita si registra dall’app; le analisi di Claude sulle call, come è stata condotta una call, le trascrizioni di Fathom, clienti, vendite e incassi restano chiusi a Claude: i soldi arrivano nella prossima fase.',
      },
    ],
  },
  {
    versione: '1.53.0',
    data: '2026-10-22',
    titolo: 'L’app anche in inglese, con la bandierina',
    riassunto:
      'In alto, accanto al sole e alla luna, la bandierina passa l’app dall’italiano all’inglese e ritorno; il business coach la trova già in inglese.',
    intestazionePer: ['tutti'],
    intestazioneTeam: {
      titolo: 'L’app anche in inglese, con la bandierina',
      riassunto: 'In alto, accanto al sole e alla luna, la bandierina passa l’app dall’italiano all’inglese e ritorno.',
    },
    novita: [
      {
        per: ['tutti'],
        testo:
          'La bandierina in alto (IT o EN, sul telefono e sul computer) cambia la lingua dell’app con un tocco; la stessa scelta sta in Profilo, sotto il tema. Vale per questo dispositivo, finché non la cambi.',
      },
      {
        per: ['tutti'],
        testo:
          'In inglese cambiano menu, titoli, bottoni, tabelle, filtri e messaggi; gli importi si leggono «€1,250.00» e le date «22 Oct 2026». Restano in italiano quello che scrivete voi, i testi di Claude, le email e Alfire.',
      },
      {
        per: ['admin'],
        testo:
          'Il business coach entra già in inglese: Panoramica, Clienti, Vendite, Incassi, Rinnovi, Setter (con la cornice dell’Insight), Closer e le call, Provvigioni, Costi, Pipeline, Progetti (con Note e Membri) e Tempo del team, Piano editoriale, Pubblicati e Spunti, e in Impostazioni Team, Prodotti, Regole provvigioni e Registro modifiche. I fogli che scrivono, i pannelli di un contenuto e di un reel, la timeline dei progetti e le pagine che lui non apre restano in italiano per ora; se preferisce l’italiano, tocca la bandierina.',
      },
    ],
  },
  {
    versione: '1.52.0',
    data: '2026-10-22',
    titolo: 'Il business coach: vede tutto, in sola lettura',
    riassunto:
      'Un ruolo nuovo, «Business coach»: vede quello che vedi tu, dalla Panoramica ai costi, ai progetti e al tempo del team, e non cambia niente.',
    intestazionePer: ['admin'],
    novita: [
      {
        per: ['admin'],
        testo:
          'In Impostazioni › Team inviti una persona «come Business coach». Entra sulla Panoramica e legge le stesse pagine che leggi tu: tutte le call, Pipeline, Clienti, Vendite, Incassi, Rinnovi, Setter con l’Insight delle ultime 24h, Closer, Provvigioni, Costi, Piano editoriale, Pubblicati, Spunti, Progetti, Tempo › Team, Novità e, in Impostazioni, Team, Prodotti, Regole provvigioni e Registro modifiche.',
      },
      {
        per: ['admin'],
        testo:
          'Non scrive mai niente: nessun bottone che registra, modifica o elimina gli compare, e se ci provasse lo rifiuterebbero il database e il server. Niente esiti delle call, vendite, incassi, proposte da Instagram, spunte «Fatto», «Aggiorna dati», timer o tempo suo.',
      },
      {
        per: ['admin'],
        testo:
          'Restano tuoi: le chiavi e i collegamenti (Instagram, Messenger, Fathom), Esporta e backup, reparti e modelli dei progetti, le tue notifiche e i numeri da fare sul menu. Non vede come è stata condotta una call né i suggerimenti per i DM di Loris, che restano di chi l’ha fatta, e nemmeno le giornate di Loris da approvare, la trascrizione e il riassunto di Fathom e il link «Scrivi su WhatsApp».',
      },
      {
        per: ['admin'],
        testo:
          'Alfire gli dà solo le tue letture, mai una scrittura. Può collegare Claude da Profilo › Account: Claude legge progetti, tempo del team e calendario dei contenuti e non scrive niente.',
      },
    ],
  },
  {
    versione: '1.51.0',
    data: '2026-10-22',
    titolo: 'Claude lavora sui progetti e sul tempo, per tutto il team',
    riassunto:
      'Claude collegato non è più solo il calendario dei contenuti: ognuno del team lo collega e, con i suoi permessi dell’app, lavora a parole su progetti, task, note e sul proprio tempo.',
    intestazionePer: ['progetti'],
    intestazioneTeam: {
      titolo: 'Claude lavora sui tuoi progetti e sul tuo tempo',
      riassunto:
        'Da Profilo › Account colleghi Claude ad Alpha Management: a parole legge i tuoi progetti e i tuoi task, li aggiorna e registra il tuo tempo, con i tuoi permessi.',
    },
    novita: [
      {
        per: ['progetti'],
        testo:
          'Ogni persona del team con l’account attivo può collegare Claude da Profilo › Account › Collega Claude, non più solo tu, il video editor e il marketing. Claude legge i progetti di cui fa parte con liste, task, membri e note, e i suoi task; crea task, cambia quelli che ha creato o che le sono assegnati, li completa e scrive note; registra, corregge, avvia e ferma il suo tempo e lo rilegge con i totali già sommati. Chi gestisce progetti crea anche progetti e liste, aggiunge persone e sceglie il coach. Tutto con le stesse regole dell’app.',
        testoTeam:
          'Puoi collegare Claude ad Alpha Management da Profilo › Account › Collega Claude. A parole legge i progetti di cui fai parte, con liste, task, membri e note, e i tuoi task; crea task, cambia quelli che hai creato o che ti sono assegnati, li completa e scrive note; registra, corregge, avvia e ferma il tuo tempo e ti dice quanto hai lavorato. Se gestisci progetti, crea anche progetti e liste, aggiunge persone e sceglie il coach. Fa solo quello che puoi fare tu nell’app.',
      },
      {
        per: ['progetti'],
        testo:
          'Da Claude non si elimina niente dei progetti: né task, né progetti, né liste, né note, né tempo. Il tempo che Claude scrive e corregge è sempre e solo di chi l’ha collegato, e quello degli altri non lo vede.',
        testoTeam:
          'Da Claude non si elimina niente: task, progetti, note e tempo si eliminano dall’app. Il tempo che Claude registra è sempre solo il tuo, e quello degli altri non lo vede.',
      },
      {
        per: ['admin'],
        testo:
          'Tu da Claude leggi anche il tempo già dichiarato dal team, come in Tempo › Team, senza timer accesi né classifiche. Call, lead, clienti, vendite, incassi e il resto dell’area Economics restano chiusi a Claude: arrivano nelle prossime fasi. Il cliente di un progetto si collega solo dall’app, e il calendario dei contenuti resta tuo, del video editor e del marketing, come prima.',
      },
    ],
  },
  {
    versione: '1.50.0',
    data: '2026-10-22',
    titolo: 'Anche Loris aggiorna i dati dell’Insight',
    riassunto:
      'Nell’Insight delle ultime 24h «Aggiorna dati» lo preme anche il setter, con lo stesso limite di 8 aggiornamenti al giorno condiviso con te.',
    intestazionePer: ['setter'],
    intestazioneTeam: {
      titolo: 'Aggiorni tu i dati dell’Insight',
      riassunto: 'Nell’Insight delle ultime 24h puoi premere tu «Aggiorna dati», fino a 8 volte al giorno insieme a Dany.',
    },
    novita: [
      {
        per: ['setter'],
        testo:
          'Loris trova «Aggiorna dati» nell’Insight delle ultime 24h, anche quando non c’è ancora nessun recap: una riga gli dice quando l’aggiornamento è partito e quando i dati sono aggiornati. Il limite resta di 8 aggiornamenti al giorno, condivisi tra voi.',
        testoTeam:
          'Nell’Insight delle ultime 24h ora puoi aggiornare tu i dati con «Aggiorna dati», anche quando non c’è ancora nessun recap. Una riga ti dice quando l’aggiornamento è partito e quando i dati sono aggiornati, e intanto puoi chiudere la pagina. Gli aggiornamenti sono al massimo 8 al giorno, insieme a Dany: se qualcosa non va, la riga ti dice di avvisarlo.',
      },
      {
        per: ['admin'],
        testo:
          'Automazione, Messenger, costo del recap, avvisi ed errori restano solo tuoi: a Loris arrivano frasi semplici, come «Aggiornamento non riuscito: riprova più tardi o avvisa Dany.». L’app non scrive da nessuna parte chi ha premuto «Aggiorna dati», nemmeno quando sei tu.',
      },
    ],
  },
  {
    versione: '1.49.0',
    data: '2026-10-22',
    titolo: 'L’andamento dei contenuti ogni domenica per email',
    riassunto:
      'Ogni domenica sera ti arriva una mail con i lead della settimana in target e fuori target, i nuovi clienti, le call fissate, cosa ha attirato di più, cosa cambiare e cosa dicono le call registrate su Fathom.',
    intestazionePer: ['admin'],
    novita: [
      {
        per: ['admin'],
        testo:
          'Ogni domenica sera ti arriva la mail «Andamento dei contenuti», da lunedì a domenica: quanti lead hai attratto, quanti in target e quanti fuori target, i nuovi clienti, le call fissate e svolte e quante aspettano ancora l’esito. La stessa mail resta nelle Notifiche.',
      },
      {
        per: ['admin'],
        testo:
          'Sotto i numeri vedi i contenuti che hanno portato più lead in target e i reel della settimana da cambiare, col punteggio, l’azione consigliata e la prima cosa da sistemare. Per i reel non ancora valutati la mail ti dice di aprire Pubblicati e toccare Analizza.',
      },
      {
        per: ['admin'],
        testo:
          'Dalle call: quante ne hai svolte, quante sono registrate su Fathom e analizzate da Claude, quante erano in target e le obiezioni più frequenti. La mail non chiede nessuna analisi nuova a Claude: usa solo quello che l’app ha già.',
      },
    ],
  },
  {
    versione: '1.48.0',
    data: '2026-10-21',
    titolo: 'Pubblicati e View Count automatico',
    riassunto: 'Una pagina sola per i post e i reel già usciti, con i loro numeri, e il View Count che si aggiorna da solo da Instagram.',
    intestazionePer: ['marketing'],
    novita: [
      {
        per: ['marketing'],
        testo: 'Al posto di «Post di Instagram» e «Analisi» c’è una pagina sola, Pubblicati: tutti i post e i reel usciti con views, copertura, salvataggi, condivisioni, commenti, i lead dai DM, il punteggio e il contenuto del Piano editoriale collegato. Il tocco su una riga apre l’analisi del reel.',
      },
      {
        per: ['marketing'],
        testo: 'Il View Count dei contenuti del Piano editoriale si compila e si aggiorna da solo ogni mattina dalle views di Instagram, se nel contenuto c’è il link del reel pubblicato. Se il link non c’è, lo scrivi tu. Se le views non arrivano, serve il permesso Insights dell’app Meta.',
      },
      {
        per: ['marketing'],
        testo: 'Non c’è più niente da collegare per forza: incollando il link del reel nel Piano editoriale il contenuto si lega al post, e un post senza contenuto è una riga normale con un «Collega» se vuoi. Sono spariti «Da collegare», «Crea il contenuto» e «Non va nel calendario».',
      },
    ],
  },
  {
    versione: '1.47.0',
    data: '2026-10-21',
    titolo: 'Piano editoriale con etichette colorate',
    riassunto: 'I Contenuti diventano il Piano editoriale: una tabella pulita, e Reel Type e Format hanno etichette che crei tu, colorate come in Notion.',
    intestazionePer: ['marketing'],
    novita: [
      {
        per: ['marketing'],
        testo: 'Reel Type e Format hanno etichette colorate come in Notion: apri la cella, scegli un’etichetta o scrivi un nome nuovo per crearla, e dal menu di ogni etichetta la rinomini, cambi il colore tra i dieci disponibili o la elimini (ti dice quanti contenuti la usano). Anche lo Status ha i suoi colori.',
      },
      {
        per: ['marketing'],
        testo: 'La pagina Contenuti si chiama Piano editoriale ed è una sola tabella con Name, Reel Type, Format, Status, Post Date, URL e Views. Ogni cella si cambia sul posto e «Nuovo» apre una riga vuota con il cursore già nel nome. Il calendario non c’è più: i filtri sono su una riga.',
      },
      {
        per: ['marketing'],
        testo: 'Claude, collegato all’app, usa le etichette per nome e non ne crea mai di nuove: se ne scrive una che non c’è, ti dice quali esistono.',
      },
    ],
  },
  {
    versione: '1.46.0',
    data: '2026-10-21',
    titolo: 'Barra laterale ridotta e tema chiaro',
    riassunto: 'Puoi ridurre la barra laterale a sole icone e scegliere tra tema chiaro, scuro e quello del dispositivo.',
    intestazionePer: ['tutti'],
    novita: [
      {
        per: ['tutti'],
        testo: 'Sul computer puoi ridurre la barra laterale a sole icone con la freccia in basso: il contenuto si allarga e l’app si ricorda la scelta su ogni dispositivo.',
      },
      {
        per: ['tutti'],
        testo: 'Dal Profilo, o con il tocco rapido sole e luna in alto, scegli il tema Chiaro, Scuro o Sistema. Di base resta scuro, come prima.',
      },
    ],
  },
  {
    versione: '1.45.0',
    data: '2026-10-21',
    titolo: 'Accesso con codice via email',
    riassunto: 'Oltre a Google, entri scrivendo la tua email: ti arriva un link e un codice di 6 cifre.',
    intestazionePer: ['tutti'],
    novita: [
      {
        per: ['tutti'],
        testo: 'Nella pagina di accesso, sotto il bottone di Google, scrivi la tua email e ti arriva un messaggio con un link e un codice di 6 cifre: usa quello che preferisci. Funziona solo per chi è già stato invitato, e il link si può aprire anche da un altro telefono o dall’app di posta.',
      },
    ],
  },
  {
    versione: '1.44.0',
    data: '2026-10-21',
    titolo: 'Clienti attivi, sospesi e chiusi con contratto',
    riassunto: 'In Clienti vedi gli attivi in una tabella con mese e settimana del percorso, contratto, cartella Drive, pagato e rate da saldare, e puoi mettere un cliente in pausa.',
    intestazionePer: ['admin'],
    novita: [
      {
        per: ['admin'],
        testo: 'Clienti ha quattro schede: Attivi, Sospesi, Chiusi e Tutti. Per ogni cliente vedi a che mese e settimana del percorso è, il link al contratto e alla cartella Drive, quanto ha pagato e il suo LTV, come paga e quali rate deve ancora saldare, con il piano completo che si apre sotto la riga.',
      },
      {
        per: ['admin'],
        testo: 'Nella scheda del cliente c’è «Sospendi», con il giorno e un motivo se vuoi: il cliente passa tra i Sospesi, esce dai rinnovi da chiamare e non riceve i promemoria. Con «Riattiva» torna com’era. Percorso e rate non cambiano. Se lo chiudi con «Non rinnova» o ricompra, la sospensione finisce da sola.',
      },
      {
        per: ['admin'],
        testo: 'Ogni percorso e ogni rinnovo ha il suo contratto: un link a Drive, anche con «Scegli da Drive», che trovi nella vendita, nello storico del cliente e nell’elenco. Lo vedi solo tu. Anche Alfire può sospendere e riattivare un cliente.',
      },
    ],
  },
  {
    versione: '1.43.0',
    data: '2026-10-21',
    titolo: 'Il tempo del team ogni lunedì per email',
    riassunto: 'Ogni lunedì sera ti arriva una mail con le ore registrate dal team nella settimana appena finita, persona per persona.',
    intestazionePer: ['admin'],
    novita: [
      {
        per: ['admin'],
        testo:
          'Ogni lunedì sera ti arriva la mail «Tempo del team»: il totale della settimana da lunedì a domenica, poi ogni persona con le sue ore, i progetti e i task su cui le ha messe. Un tocco apre Tempo › Team sulla stessa settimana. La stessa mail la trovi anche nelle notifiche.',
      },
      {
        per: ['admin'],
        testo:
          'Gli stessi limiti di Tempo › Team: solo il tempo già registrato, mai il timer acceso di qualcuno, compare solo chi ha registrato qualcosa nella settimana, in ordine alfabetico, nessuna classifica.',
      },
    ],
  },
  {
    versione: '1.42.0',
    data: '2026-10-19',
    titolo: 'Gli avvisi nelle notifiche',
    riassunto:
      'Nel centro notifiche arrivano anche gli avvisi che esistono solo nell’app: rate in ritardo, chiavi in scadenza, giornate da approvare e spesa di Claude vicina al limite.',
    intestazionePer: ['admin'],
    novita: [
      {
        per: ['admin'],
        testo:
          'Ogni sera, se qualche rata è andata in ritardo, trovi un avviso con l’elenco: cliente, «Rata 2 di 4», importo e scadenza. Una rata si annuncia una volta sola, e senza rate nuove in ritardo non arriva niente. Il bottone apre Incassi sulle rate in ritardo.',
      },
      {
        per: ['admin'],
        testo:
          'Il token di Instagram ti avvisa quando mancano 7 giorni alla scadenza, e di nuovo se è scaduto o se Meta lo rifiuta. Lo stesso per il token della Pagina di Messenger e per la chiave di Fathom quando vengono rifiutati. Il bottone apre Impostazioni › Chiavi e collegamenti, dove c’è la guida per rifarli.',
      },
      {
        per: ['admin'],
        testo:
          'Quando arriva un nuovo tracciamento di Loris da confermare, c’è un avviso «Da approvare: il tracciamento di Loris di ieri…» che porta alla scheda in Setter. Un ricalcolo della stessa giornata non ne manda un secondo.',
      },
      {
        per: ['admin'],
        testo:
          'La spesa di Claude, per le analisi dei reel e per le call e gli Spunti, ti avvisa una volta quando arriva all’80% del limite del mese e una volta quando lo raggiunge e le analisi si fermano fino al mese dopo. Il bottone apre le impostazioni dove puoi alzare il limite.',
      },
      {
        per: ['admin'],
        testo:
          'Questi avvisi non partono per email: nell’elenco c’è scritto «Solo nell’app» al posto di «Email inviata». Un avviso che elimini non torna, e lo stesso avviso non si ripete due volte.',
      },
    ],
  },
  {
    versione: '1.41.0',
    data: '2026-10-19',
    titolo: 'Le notifiche dentro l’app',
    riassunto:
      'Ogni email che l’app ti manda è salvata anche in un centro notifiche, con la campanella e il pallino rosso in alto a destra, anche quando l’email non parte.',
    intestazionePer: ['admin'],
    novita: [
      {
        per: ['admin'],
        testo:
          'In alto a destra, accanto ad Alfire, c’è la campanella: con notifiche da leggere ha un pallino rosso col numero. Un tocco apre le Notifiche, la stessa pagina si apre anche dal tuo profilo.',
      },
      {
        per: ['admin'],
        testo:
          'Ci finiscono il riepilogo del venerdì, il backup del lunedì e i promemoria «Call dei 3 mesi» e «Call di rinnovo». Ognuna dice se l’email è partita o no, si apre com’era nell’email, ha il bottone che porta a quello di cui parla e si segna letta da sola.',
      },
      {
        per: ['admin'],
        testo:
          'Le notifiche si salvano anche senza il servizio di invio delle email: la copia nell’app c’è comunque. Un secondo giro la stessa sera non le raddoppia. Il backup nell’app non porta il file né dati: dice che è partito per email e rimanda a Impostazioni › Esporta.',
      },
      {
        per: ['admin'],
        testo:
          'Puoi segnarle tutte come lette o eliminarne una (si toglie solo da qui, l’email resta nella posta); dopo 12 mesi si cancellano da sole. Le leggi solo tu: nessun altro vede le tue notifiche, e il backup settimanale non le contiene.',
      },
      {
        per: ['tutti'],
        testo:
          'In alto a destra c’è la campanella delle notifiche. Per ora le notifiche dell’app arrivano solo all’admin: se qualcosa ti riguarda lo troverai lì.',
      },
    ],
  },
  {
    versione: '1.40.0',
    data: '2026-10-16',
    titolo: 'L’analisi di un reel dice cosa fare',
    riassunto:
      'Il pannello di un reel apre con una risposta sola e un’azione, il resto sta in tre schede; la pagina Analisi ha una barra dei filtri con le etichette e una colonna «Cosa fare».',
    intestazionePer: ['marketing'],
    novita: [
      {
        per: ['marketing'],
        testo:
          'Aprendo un reel, in cima trovi «Cosa fare con questo reel»: il punteggio, una frase che unisce il giudizio sul contenuto e come è andato col pubblico, le tre cose da sistemare per prime e un bottone solo, di solito «Aggiungi il rifacimento al calendario».',
      },
      {
        per: ['marketing'],
        testo:
          'Il resto del pannello è in tre schede: «Come rifarlo» (hook, script e caption da copiare, poi altre idee sullo stesso tema), «Perché» (i criteri dal più basso, cosa ha funzionato, cosa migliorare) e «Numeri» (statistiche, lead dai DM, calendario, parlato).',
      },
      {
        per: ['marketing'],
        testo:
          'In Analisi i filtri stanno in una barra sola con le etichette Periodo, Verdetto, Punteggio e Ordina per (sul telefono dietro «Filtri»), e la tabella ha una colonna «Cosa fare» al posto di verdetto, punteggio e analisi, con il titolo del reel più largo.',
      },
      {
        per: ['marketing'],
        testo: 'Il punteggio in Post di Instagram e nel pannello di un contenuto dice anche cosa fare, per esempio «82 · Rifallo con qualche ritocco».',
      },
    ],
  },
  {
    versione: '1.39.0',
    data: '2026-10-16',
    titolo: 'Il punteggio dei contenuti, e Claude solo dopo un click',
    riassunto:
      'Ogni reel ha un punteggio di qualità con la guida di Dany e un rifacimento pronto per il calendario; Claude lavora su un contenuto solo quando una persona lo chiede, e gli Spunti non partono più il lunedì.',
    intestazionePer: ['marketing'],
    intestazioneTeam: {
      titolo: 'Il punteggio dei reel',
      riassunto:
        'Ogni reel ha un punteggio di qualità con la guida di Dany e un rifacimento pronto per il calendario; Claude lavora su un reel solo quando una persona lo chiede.',
    },
    novita: [
      {
        per: ['marketing'],
        testo:
          'Ogni reel ha un punteggio da 0 a 100 con la guida di Dany ai contenuti: l’hook, la struttura, il tono, la CTA e gli altri criteri della sua fase (attrazione, consapevolezza o conversione), le penalità e la fascia, da «Pubblicare» a «Scartare o ripartire». In Analisi c’è la colonna «Punteggio» (un reel mai valutato dice «Non valutato»), puoi filtrare per fascia o per «Non valutati» e ordinare per punteggio.',
      },
      {
        per: ['marketing'],
        testo:
          'Il pannello di un reel parte dal punteggio: cosa ha preso, perché, con la frase del reel che lo motiva e la correzione da fare per ogni criterio, le penalità con la riga che le ha causate, i punti di forza e cosa sistemare per primo. Il tipo (attrazione, consapevolezza, conversione) è quello del Reel Type del contenuto collegato; senza, lo deduce Claude e lo dice.',
      },
      {
        per: ['marketing'],
        testo:
          '«Come rifarlo»: le azioni in ordine di impatto, tre hook alternativi sotto le 10 parole, lo script riscritto nel formato della guida e la caption, ognuno con «Copia», e il punteggio che ti aspetti dopo. «Aggiungi al calendario» crea un Reel Topic Not started con lo script riscritto (una volta sola per analisi).',
      },
      {
        per: ['marketing'],
        testo:
          'In Post di Instagram e nel pannello di un contenuto collegato vedi il punteggio del reel con il link alla sua analisi; per i caroselli e le foto il punteggio non c’è («Il punteggio vale per i reel»). Il punteggio si legge e basta: da quelle pagine Claude non viene chiamato.',
      },
      {
        per: ['marketing'],
        testo:
          '«Analizza» fa tutto in un click: guarda il reel, lo analizza e gli dà il punteggio. Per un reel analizzato prima del punteggio il tasto dice «Dai il punteggio». «Valuta i reel non valutati (N)» li fa a gruppi, i più recenti per primi, con la spesa stimata mostrata prima di confermare e nei limiti delle richieste del giorno.',
      },
      {
        per: ['marketing'],
        testo:
          'Claude lavora su un reel solo dopo un click di una persona che può chiederlo (admin e marketing): di notte non guarda e non analizza più niente da solo. Resta solo la trascrizione del parlato dei reel nuovi, che non usa Claude.',
      },
      {
        per: ['marketing'],
        testo:
          'Gli Spunti arrivano solo quando li chiedi («Chiedi nuovi spunti», admin e marketing): non c’è più quello automatico del lunedì. Per le idee, Claude ora usa le linee guida di Dany: hook sotto le 10 parole, script in prosa con le indicazioni visive tra parentesi, la CTA giusta per la fase del funnel.',
      },
      {
        per: ['marketing'],
        testo:
          'Claude collegato (connettore): c’è un nuovo strumento, «Guida di Dany ai contenuti», che gli dà la guida (senza prezzi) quando scrive o propone un contenuto; il cliente ideale resta quello di sempre.',
      },
      {
        per: ['admin'],
        testo:
          'In Impostazioni › Instagram e Messenger › Analisi dei reel l’interruttore «Analisi automatiche» diventa «Trascrizioni automatiche (senza Claude)»: acceso, di notte si trascrive solo il parlato dei reel nuovi con Whisper. Analisi, sguardo di Claude e punteggio partono solo da «Analizza». Il tetto di 10 richieste al giorno per il team e il limite di spesa del mese valgono come prima; «Valuta i reel non valutati» mostra una stima di circa 0,30 $ a reel prima di confermare, e il costo vero lo conta il gestionale.',
      },
      {
        per: ['admin'],
        testo:
          'In Impostazioni › Fathom l’interruttore «Spunti automatici» non c’è più: gli Spunti si chiedono solo a mano (2 al giorno). Le analisi delle call restano automatiche, come prima.',
      },
      {
        per: ['admin'],
        testo:
          'Il punteggio, la guida e il rifacimento non passano da Alfire; la guida nel gestionale non ha prezzi né condizioni di pagamento, perché il video editor e il marketing la leggono tramite Claude e non vedono mai il listino.',
      },
    ],
  },
  {
    versione: '1.38.0',
    data: '2026-10-16',
    titolo: 'Menu a categorie, Insight 24h in una scheda e Chiavi e collegamenti',
    riassunto:
      'Le voci del menu sono divise per categoria con gli stessi titoli sul computer e sul telefono; Insight 24h diventa una scheda di Setter e di Oggi; le Impostazioni hanno una pagina con le chiavi dei servizi esterni e la guida per rigenerarle.',
    intestazionePer: ['tutti'],
    intestazioneTeam: {
      titolo: 'Il menu a categorie',
      riassunto:
        'Le voci del menu sono divise per categoria, con gli stessi titoli sul computer e nel foglio «Altro» del telefono.',
    },
    novita: [
      {
        per: ['tutti'],
        testo:
          'Il menu è diviso per categoria, con un titolo per ogni gruppo: lo stesso elenco nella barra laterale del computer e nel foglio «Altro» del telefono. Le voci che ti servono ogni giorno restano nella barra in basso; tutte le altre le trovi in «Altro», sotto il loro titolo. Gli indirizzi delle pagine non cambiano.',
      },
      {
        per: ['admin'],
        testo:
          'Il menu per te: in cima Panoramica; poi Vendite (Le mie call, Pipeline, Clienti, Vendite, Incassi, Rinnovi), Team (Setter, Closer, Provvigioni), Marketing (Contenuti, Post di Instagram, Analisi, Spunti, ognuna una voce sua), Progetti (Progetti, I miei task, Tempo) e Amministrazione (Costi, Impostazioni, Novità). La barra in basso del telefono: Panoramica, Le mie call, Setter e Contenuti; il resto in «Altro», con gli stessi titoli.',
      },
      {
        per: ['admin'],
        testo:
          'Insight 24h non è più una voce del menu: è la seconda scheda di Setter, «Numeri | Insight 24h», in cima a tutte e due le pagine. Il link «Insight delle ultime 24h» accanto ad «Aggiungi giornata» non serve più e non c’è.',
      },
      {
        per: ['setter'],
        testo:
          'Insight 24h non è più nel menu: è la seconda scheda di «Oggi», «Il mio giorno | Insight 24h», in cima a tutte e due le pagine. Il menu è diviso in «Il mio lavoro», «Team», «Progetti» e «Generale»; la barra in basso non cambia (Oggi, Nuova call, Pipeline, I miei numeri).',
      },
      {
        per: ['marketing'],
        testo:
          'Contenuti, Post di Instagram, Analisi e Spunti sono quattro voci del gruppo «Marketing», ognuna accesa sulla sua pagina; le schede in cima alle pagine restano. Il numero dei post ancora da collegare, che era sulla scheda «Post di Instagram», sta anche sulla voce del menu.',
      },
      {
        per: ['admin'],
        testo:
          'Le Impostazioni sono divise per categoria: Team e accessi, Prodotti e provvigioni, Chiavi e collegamenti, Esporta e backup, Progetti.',
      },
      {
        per: ['admin'],
        testo:
          'Nuova pagina Impostazioni › Chiavi e collegamenti: in un posto solo Instagram, Messenger, Fathom, Claude e Groq, ognuno con il suo stato in vista (per Instagram anche «Scade tra N giorni» da una settimana prima) e, in un pannello da aprire, la guida passo passo per generare o rigenerare la chiave: dove andare, cosa incollare e dove, come capire che funziona e cosa succede quando scade. I campi dove incollare il token di Instagram, quello della Pagina di Messenger e la chiave di Fathom stanno lì (non più nelle loro pagine); per Claude e Groq si vede solo se la chiave c’è su Vercel, mai il valore. Le chiavi si salvano come prima e non vanno mai incollate in chat.',
      },
    ],
  },
  {
    versione: '1.37.1',
    data: '2026-10-16',
    titolo: 'La pagina Analisi torna a caricarsi',
    riassunto: 'L’Analisi dei reel si apre in meno di un secondo anche con tutti i reel dell’account; una richiesta fallita non consuma più il limite del giorno; se Claude rifiuta una richiesta, l’app ora ne registra il motivo.',
    intestazionePer: ['marketing'],
    intestazioneTeam: {
      titolo: 'La pagina Analisi torna a caricarsi',
      riassunto: 'L’Analisi dei reel si apre in meno di un secondo anche con tutti i reel dell’account.',
    },
    novita: [],
    correzioni: [
      {
        per: ['marketing'],
        testo:
          'La pagina Analisi dei reel diceva «Non siamo riusciti a caricare l’analisi dei reel»: con tutti i reel dell’account i calcoli di verdetto e confronto ci mettevano più del tempo concesso. Ora i numeri si calcolano una volta sola per tutti i reel e la pagina si apre in una frazione di secondo, con gli stessi verdetti di prima.',
      },
      {
        per: ['marketing'],
        testo:
          'Se i verdetti e i confronti non si riescono a leggere, la pagina mostra comunque i reel con i loro numeri e dice cosa manca, invece dell’errore a tutta pagina. Le tessere in alto non caricate dicono «non caricato» e non fermano il resto.',
      },
      {
        per: ['marketing'],
        testo:
          'Una richiesta che non va a buon fine (gli spunti, l’analisi di un reel o di una call chiesti a mano) non consuma più il limite del giorno: conta solo quella riuscita o ancora in corso. Prima due errori di fila ti lasciavano senza «Chiedi nuovi spunti» fino al giorno dopo.',
      },
      {
        per: ['marketing'],
        testo:
          'Gli spunti della settimana e l’analisi delle call sono più robusti: un testo tagliato a metà di un’emoji non rompe più la richiesta a Claude.',
      },
      {
        per: ['admin'],
        testo:
          'Quando Claude rifiuta una richiesta (Spunti, analisi delle call, analisi dei reel, Insight), l’app scrive nei registri di Vercel il tipo e il messaggio dell’errore, senza il contenuto: se «Chiedi nuovi spunti» dice ancora «errore dell’app», il motivo preciso si legge lì, alla riga che comincia con «[claude]».',
      },
    ],
  },
  {
    versione: '1.37.0',
    data: '2026-10-16',
    titolo: 'Call da Fathom nel closing e Spunti nel Marketing',
    riassunto:
      'Il foglio dell’esito chiede il link della registrazione di Fathom per le call svolte; Claude analizza ogni call registrata e propone motivo e performance; il Marketing ha la scheda «Spunti», il brief settimanale che incrocia reel, DM, setting e call.',
    intestazionePer: ['closer', 'setter', 'marketing'],
    intestazioneTeam: {
      titolo: 'Call registrate e Spunti',
      riassunto:
        'Per le call svolte si incolla il link della registrazione di Fathom; Claude analizza le call registrate; il Marketing ha la scheda «Spunti» con il brief settimanale.',
    },
    novita: [
      {
        per: ['closer'],
        testo:
          'Per una call svolta (chiusa, follow-up o persa) il foglio dell’esito chiede il link della registrazione di Fathom: lo incolli, l’app controlla che la registrazione esista e si va avanti. Se la call non è stata registrata tocchi «Call non registrata»: un tocco, senza motivo. No show, cancellata e in attesa di conferma non lo chiedono. Vale per le call da oggi in poi.',
      },
      {
        per: ['closer'],
        testo:
          'Sulla scheda della call vedi la registrazione («Apri su Fathom»), la trascrizione con i minuti che aprono il video e il riassunto di Fathom. Si leggono da Fathom quando li apri: l’app non li conserva. Il link si cambia o si toglie dalla scheda.',
      },
      {
        per: ['closer'],
        testo:
          'Claude, un’intelligenza artificiale, analizza ogni call registrata pochi minuti dopo l’esito: com’è andata, il lead rispetto al cliente ideale, le obiezioni (con il minuto), le domande e i momenti da riascoltare. Propone il motivo di non chiusura, che usi con un tocco, e la performance con il perché: li confermi o li cambi tu, niente si scrive da solo. Come hai condotto la call lo vedi solo tu.',
      },
      {
        per: ['closer'],
        testo:
          'In I miei numeri c’è «Dalle call registrate»: quante call hai registrato, la durata media, la performance che hai confermato, le obiezioni più frequenti e come vanno le call per fonte e per contenuto da cui arriva il lead.',
      },
      {
        per: ['closer'],
        testo:
          'Alfire registra l’esito di una call svolta con il link di Fathom, o con «non registrata», e te lo chiede se manca.',
      },
      {
        per: ['setter'],
        testo:
          'Sulle call che hai fissato c’è «Dalla call»: se il lead era in target, cosa sapeva arrivando, cosa l’ha sorpreso e su cosa si è fermato, con uno o tre spunti per i tuoi DM che vedi solo tu. Non vedi la registrazione, la trascrizione né come il closer ha condotto la call.',
      },
      {
        per: ['marketing'],
        testo:
          'Nuova scheda «Spunti» nel Marketing: ogni lunedì Claude incrocia i reel, i DM, le note del setting e le call e scrive cosa funziona, cosa chiedono i lead, le obiezioni da anticipare, le domande da trasformare in contenuti e da cinque a otto idee pronte. «Aggiungi al calendario» crea il contenuto con lo script già scritto. Solo temi, mai nomi, frasi di persone o cifre.',
      },
      {
        per: ['marketing'],
        testo:
          'L’admin e il marketing possono chiedere nuovi spunti quando vogliono (due volte al giorno al massimo). Il Claude collegato al calendario li legge in sola lettura.',
      },
      {
        per: ['admin'],
        testo:
          'Impostazioni › Fathom: incolli la chiave API (resta nel Vault, non torna mai nella pagina), vedi la spesa del mese contro il limite di 10 $ (si cambia), e accendi o spegni le analisi delle call e gli spunti automatici del lunedì.',
      },
      {
        per: ['admin'],
        testo:
          'In Closer, «Dalle call registrate» per fonte e per contenuto di provenienza: call, show rate, chiuse, close rate e, solo per te, cash e revenue dei clienti nuovi. In Spunti, «Per te» mette sotto ogni contenuto i numeri delle call che ne sono nate. Copertura, durata e performance le vedi solo sulle tue call.',
      },
      {
        per: ['admin'],
        testo:
          'Claude analizza tutte le call registrate, senza una domanda nel foglio: l’informativa privacy lo dice. La trascrizione non viene mai salvata e a Claude arriva senza nomi, cifre e link; la salute di una persona non resta in nessun testo salvato. Le analisi si cancellano dopo 24 mesi.',
      },
    ],
  },
  {
    versione: '1.36.0',
    data: '2026-10-16',
    titolo: 'Analisi dei reel: numeri, verdetto e idee per il calendario',
    riassunto:
      'Nel Marketing c’è la scheda «Analisi»: ogni reel con i suoi numeri contro la mediana dei tuoi, il verdetto Spingere, Mantenere o Cambiare, cosa ha visto e sentito Claude e le idee da aggiungere al calendario con un tocco.',
    intestazionePer: ['marketing'],
    intestazioneTeam: {
      titolo: 'Analisi dei reel nel Marketing',
      riassunto:
        'La scheda «Analisi» mostra ogni reel con i numeri contro la mediana dell’account, il verdetto Spingere, Mantenere o Cambiare, cosa ha visto e sentito Claude e le idee da aggiungere al calendario con un tocco.',
    },
    novita: [
      {
        per: ['marketing'],
        testo:
          'Nuova scheda «Analisi» nel Marketing, accanto a Contenuti e Post di Instagram: i reel del periodo (30, 90 o 180 giorni) con views, salvataggi, tempo di visione e lead dai DM, ognuno contro la mediana dei reel che l’account aveva pubblicato nei 90 giorni prima, alla stessa età. Ogni reel ha il suo verdetto: Spingere, Mantenere o Cambiare. I numeri e il verdetto li calcola il gestionale, Claude spiega il perché.',
      },
      {
        per: ['marketing'],
        testo:
          'Toccando un reel si apre il pannello: i numeri, il verdetto, l’analisi di Claude (cosa ha funzionato, cosa migliorare, cosa dicono i lead), la scheda di quello che ha visto nei fotogrammi (gancio, ritmo, testo a schermo, CTA, aderenza al cliente ideale) e il parlato trascritto con i tempi. Si apre anche dal link «Apri l’analisi» di un contenuto o di un post.',
      },
      {
        per: ['marketing'],
        testo:
          'Ogni analisi propone due o tre idee per il prossimo reel, con Name, Reel Type, Format, gancio, messaggio e script. «Aggiungi al calendario» le crea come Reel Topic da girare, con lo script già scritto, e il contenuto dice da quale analisi nasce. Se il reel non è ancora collegato al calendario, Claude suggerisce anche quale contenuto potrebbe essere e lo colleghi con un tocco.',
      },
      {
        per: ['marketing'],
        testo:
          'Il parlato dei reel si legge anche in Post di Instagram, aperto solo al tocco: la trascrizione con i tempi, o il motivo per cui non c’è (musica protetta, nessun parlato). Il parlato aiuta anche a collegare un reel al contenuto giusto, ma non collega mai da solo.',
      },
      {
        per: ['marketing'],
        testo:
          '«Analizza» (e «Analizza di nuovo») la chiedono l’admin e il marketing; il video editor legge tutto. Ogni notte il server legge i reel nuovi e ne analizza da solo uno alla volta quando compiono 3 giorni (o 14, se a 3 non c’è ancora il confronto con gli altri reel).',
      },
      {
        per: ['admin'],
        testo:
          'In Impostazioni › Instagram e Messenger c’è il blocco «Analisi dei reel»: spesa del mese e limite (di base 25 $), interruttore delle analisi automatiche e interruttore «Note di setter e closer nelle analisi». Il costo lo calcola il database da token e minuti di audio; superato il limite le analisi si fermano da sole, comprese quelle chieste a mano.',
      },
      {
        per: ['admin'],
        testo:
          'Con «Note di setter e closer nelle analisi» acceso (lo è di base) Claude legge cosa frenava i lead nelle risposte del setter e i motivi di non chiusura del closer, senza nomi, per dire cosa dicono i lead; al video editor e al marketing mostra solo i temi, mai nomi, cifre o frasi copiate. Spento, non le vede mai. Le statistiche dei post le legge il giro della mattina: serve il permesso «instagram_business_manage_insights» nel token.',
      },
      {
        per: ['admin'],
        testo:
          'Il video di un reel lo scarica il server per il tempo della lettura e lo cancella subito; l’audio va a Groq per la trascrizione, i fotogrammi, la didascalia e il parlato ad Anthropic. L’informativa privacy lo dice. Restano fuori, per ora, le call chiuse e le vendite per reel: i dati non collegano ancora un lead a un contenuto.',
      },
    ],
  },
  {
    versione: '1.35.0',
    data: '2026-10-15',
    titolo: 'L’Insight delle ultime 24h è dentro l’app',
    riassunto:
      'Il recap dei DM che prima era l’artefatto di Claude ora è una pagina del gestionale: Instagram, Messenger e agenda, preparato ogni sera dal server con Claude Sonnet 5.5 e il tuo ICP, con le chat salvate al massimo 30 giorni e, per ogni lead, il post da cui arriva.',
    intestazionePer: ['setter'],
    intestazioneTeam: {
      titolo: 'Insight ultime 24h è una pagina dell’app',
      riassunto:
        'Il recap dei DM delle ultime 24 ore lo trovi nel menu, «Insight ultime 24h» (sul telefono in «Altro»): chi aspetta una risposta, il messaggio da copiare, la chat da aprire e da quale post arriva il lead, con le spunte Fatto.',
    },
    novita: [
      {
        per: ['admin'],
        testo:
          'Insight ultime 24h è una voce del menu, sotto Setter: la stessa pagina dell’artefatto «Recap DM Alpha», con Instagram, Messenger e Agenda, verdetto, numeri che filtrano, lead per priorità con «aspetta da», messaggi da copiare, chat, lead da riattivare, obiezioni, content e chat escluse. Il giorno si sceglie in alto, fino a 30 giorni indietro. La vedono anche i setter, con l’agenda completa delle call di ieri, oggi e domani (orario, nome, handle ed esito di ieri, mai note, importi o il closer), senza Aggiorna dati né Automazione. «Novità» nel menu ora ha il megafono: le stelline sono dell’Insight.',
      },
      {
        per: ['admin'],
        testo:
          'I tre conteggi sbagliati dell’artefatto sono corretti: «aspetta da» e «Attendono risposta» solo quando l’ultimo messaggio è del lead, e «Chiusi / persi» conta anche chi è in uscita.',
      },
      {
        per: ['admin'],
        testo:
          'Ogni lead dice da quale post o reel arriva, quando si capisce dai DM: reel condiviso, parola chiave della didascalia, risposta a una storia o il video che cita. Se il post è collegato al calendario, vedi anche il contenuto. Il gestionale conta, senza nomi, quanti lead arrivano da ogni post ogni giorno, quanti in target e quanti con una call: serviranno all’analisi dei reel.',
      },
      {
        per: ['admin'],
        testo:
          'Il recap lo prepara il server, non più il Mac: in «Automazione» scegli l’ora in cui deve essere pronto (a passi di 5 minuti) e lo accendi; «Aggiorna dati» lo rifà quando vuoi, fino a 8 volte al giorno. Spegni la routine sul Mac dopo il primo recap automatico riuscito.',
      },
      {
        per: ['admin'],
        testo:
          'Le chat le analizza Claude Sonnet 5.5 con le tue istruzioni setter, l’ICP, il Setting Training e M14; numeri, orari, «aspetta da» e il post di partenza li calcola il gestionale. Un messaggio suggerito con un link che non è il tuo Calendly o con un prezzo non si mostra. Costa circa 1 $ a recap: lo leggi in Impostazioni › Instagram e Messenger.',
      },
      {
        per: ['admin'],
        testo:
          'Le chat restano nel gestionale al massimo 30 giorni e poi si cancellano da sole; il backup non le prende. Sotto i 14 anni nessun messaggio resta salvato. Il testo dei DM ora va ad Anthropic: l’informativa privacy lo dice. Escludendo una chat in Impostazioni puoi cancellarne subito i messaggi salvati.',
      },
      {
        per: ['admin'],
        testo:
          'Messenger: incolla il token della Pagina in Impostazioni › Instagram e Messenger; l’app lo prova prima di salvarlo. Per views, salvataggi e condivisioni dei post aggiungi all’app Meta il permesso delle statistiche e incolla di nuovo il token di Instagram.',
      },
      {
        per: ['admin'],
        testo:
          'Claude collegato al calendario dei contenuti non raggiunge mai l’Insight: né recap, né chat, né lead per post, nemmeno col tuo account. Il profilo del cliente ideale è uno solo, quello senza prezzi che legge Claude, e lo usa anche l’Insight.',
      },
      {
        per: ['setter'],
        testo:
          'L’Insight delle ultime 24h ora è una pagina dell’app per i setter: nel menu, «Insight ultime 24h», e dal link in Oggi e in I miei numeri.',
        testoTeam:
          'L’Insight delle ultime 24h ora è una pagina dell’app: lo apri dal menu, «Insight ultime 24h» (sul telefono in «Altro»), o dal link in Oggi e in I miei numeri, senza più aprire l’artefatto. Ogni sera trovi i lead per priorità, chi aspetta una risposta e da quanto, il messaggio suggerito da copiare, la chat da leggere e il tasto per aprirla su Instagram, da quale post arriva il lead, i lead da riattivare, le obiezioni, l’agenda delle call di ieri, oggi e domani e le indicazioni sui contenuti.',
      },
      {
        per: ['setter'],
        testo: 'Le spunte Fatto sono condivise con l’admin, in tempo reale; non dicono chi le ha messe né quando.',
        testoTeam:
          'Le spunte Fatto sono condivise con Dany, in tempo reale: non dicono chi le ha messe né quando. Il giorno dopo si riparte da zero, come nell’artefatto.',
      },
      {
        per: ['admin'],
        testo:
          'Se una chat risulta di un minore sotto i 14 anni solo dopo che ha scritto per giorni, il gestionale toglie i suoi messaggi anche dai recap dei giorni prima (situazione, pain, risposte suggerite, origine) e dalle schede; della chat resta solo il segno che è un minore, anche oltre i 30 giorni, così non torna a Claude se riscrive. L’informativa privacy lo dice.',
      },
      {
        per: ['admin'],
        testo:
          'Gli avvisi di un recap e come è stato fatto (il modello e la versione delle istruzioni) li leggi solo tu: non sono più nel documento che leggono i setter. L’indirizzo a cui l’app manda i passi del recap lo scrive solo il server, da APP_URL: nemmeno la tua sessione può puntare la chiave dei passi altrove.',
      },
      {
        per: ['setter'],
        testo: 'Nell’Agenda, se il promemoria di una call non si può mostrare, ora dice il perché e che va scritto a mano.',
        testoTeam: 'Nell’Agenda, se il promemoria di una call non si può mostrare, ora c’è la riga che dice il perché e che va scritto a mano. L’ora della call, sul telefono, non tocca più il nome.',
      },
    ],
    correzioni: [
      {
        per: ['admin'],
        testo:
          'I giorni senza lead di un post non si segnano più come contati quando la lettura delle chat è stata parziale (chat non lette, limiti di Meta, storico tagliato): «nessun lead» ora vuol dire davvero zero. Un post uscito dopo l’arrivo di un lead non può più essere il suo punto di partenza.',
      },
      {
        per: ['admin'],
        testo:
          'Il costo di un recap conta anche i token che prima si perdevano (una richiesta interrotta, un blocco rimesso in coda, i blocchi già finiti quando un errore ferma tutto), e un blocco interrotto dopo aver pagato alcune schede le tiene invece di rifarle.',
      },
    ],
  },
  {
    versione: '1.34.0',
    data: '2026-10-15',
    titolo: 'Claude collegato al calendario dei contenuti',
    riassunto:
      'Dal tuo account Claude, anche dal telefono, leggi e riempi il calendario dei contenuti a parole; il collegamento apre solo i contenuti, mai il resto del gestionale.',
    intestazionePer: ['marketing'],
    intestazioneTeam: {
      titolo: 'Claude collegato ai contenuti',
      riassunto:
        'Colleghi il tuo account Claude al calendario dei contenuti e gli chiedi di leggerlo, crearne di nuovi e scrivere script e didascalie.',
    },
    novita: [
      {
        per: ['admin'],
        testo:
          'Claude collegato ad Alpha Management: dal tuo account Claude (sito, app per computer e poi anche telefono, o Claude Code) gli chiedi di leggere il calendario dei contenuti, crearne di nuovi con le proprietà di Notion, cambiare lo Status e scrivere script e didascalie. Lo attivi una volta in Supabase e lo colleghi da Profilo › Account › Collega Claude.',
      },
      {
        per: ['admin'],
        testo:
          'Il collegamento apre solo il calendario dei contenuti, mai vendite, incassi, clienti, lead, call, report o DM, nemmeno con il tuo account. Lo collegano solo tu, il video editor e il marketing; da Claude elimini un contenuto solo tu, dicendo il suo Name.',
      },
      {
        per: ['admin'],
        testo:
          'Nessuno vede chi ha collegato Claude, nemmeno tu: ognuno vede e scollega i suoi collegamenti in App collegate. Disattivare una persona in Team, o darle un ruolo che non può collegare Claude (non admin, video editor o marketing), blocca subito il suo Claude finché non ha di nuovo il ruolo o non viene riattivata: allora il collegamento di prima torna, senza un nuovo consenso. Per chiuderlo davvero lo scollega lei in App collegate, prima del cambio: tu non puoi scollegare quello di un altro.',
      },
      {
        per: ['marketing'],
        testo:
          'Collega Claude: dal tuo account Claude gli chiedi di leggere il calendario dei contenuti, crearne di nuovi (anche una settimana intera, con script e didascalie già scritti), cambiare lo Status e riscrivere una sezione. Lo colleghi da Profilo › Account › Collega Claude e confermi con «Consenti»; ogni modifica di Claude è a tuo nome e la vede tutto il team.',
      },
      {
        per: ['marketing'],
        testo:
          'Claude collegato conosce il cliente ideale di Percorso Alpha: prima di proporre o scrivere contenuti legge chi è, cosa lo blocca, cosa vuole e come ne parla, così idee, hook e script parlano a lui, con le sue parole. Fit, non grosso, e sempre con tempi onesti.',
      },
      {
        per: ['marketing'],
        testo:
          'Claude non sovrascrive mai un testo cambiato da un altro nel frattempo: se una sezione è cambiata, rilegge quella salvata e ti propone l’unione.',
      },
      {
        per: ['marketing'],
        testo: 'App collegate, in Profilo › Account: vedi se hai collegato Claude e lo scolleghi con un tocco.',
      },
    ],
  },
  {
    versione: '1.33.0',
    data: '2026-10-10',
    titolo: 'Più fluida, i contenuti in un pannello e i post di Instagram collegati',
    riassunto:
      'Le pagine si aprono prima e i salvataggi fanno meno lavoro; un contenuto si apre e si modifica in un pannello a lato, ogni proprietà si cambia dalla tabella, e i post di Instagram si collegano da soli al calendario.',
    intestazionePer: ['marketing'],
    intestazioneTeam: {
      titolo: 'Più fluida, e i contenuti in un pannello',
      riassunto:
        'Un contenuto si apre e si modifica in un pannello a lato, ogni proprietà si cambia dalla tabella, e i post di Instagram si collegano da soli al calendario.',
    },
    novita: [
      {
        per: ['tutti'],
        testo:
          'L’app è più veloce a ogni tocco: una pagina si prepara mentre ti fermi col mouse su una voce del menu o la tocchi, una pagina vista nell’ultimo mezzo minuto si riapre all’istante, e diversi salvataggi non ricaricano più la pagina due volte. Quello che scrivi tu, anche con Alfire, lo vedi subito su ogni pagina; quello che cambia un collega arriva al massimo dopo mezzo minuto.',
      },
      {
        per: ['tutti'],
        testo:
          'Cambiando periodo, mese o vista, una piccola rotella al posto della freccia dice che i dati stanno arrivando, e le pagine si caricano già con la loro forma, senza salti.',
      },
      {
        per: ['tutti'],
        testo:
          'Il passaggio tra le pagine è una dissolvenza breve. Se sul telefono o sul computer hai attivo «Riduci movimento», niente animazioni in tutta l’app.',
      },
      {
        per: ['tutti'],
        testo:
          'Il primo caricamento è più leggero: Alfire si scarica quando lo apri, o quando il telefono è libero, e la conversazione resta come prima.',
      },
      {
        per: ['marketing'],
        testo:
          'Un contenuto si apre in un pannello a lato, senza lasciare la tabella o il calendario: proprietà, Status e testi si modificano lì e si salvano da soli, con il contenuto precedente e il successivo a un tocco. Indietro lo chiude e il link si può condividere; Cmd o Ctrl e clic apre la pagina intera.',
      },
      {
        per: ['marketing'],
        testo:
          'In tabella ogni proprietà si cambia direttamente dalla sua cella; sul telefono Status, Post Date, Reel Type e Format dalla card. Name, date, link e le altre proprietà non scrivono mai sopra un valore che un altro ha cambiato nel frattempo: se è cambiato, vedi quello salvato. Lo Status resta un tocco, come in Notion.',
      },
      {
        per: ['marketing'],
        testo:
          'Nuova scheda «Post di Instagram»: i post e i reel dell’account si collegano da soli ai contenuti del calendario quando data e didascalia corrispondono, e l’URL si scrive da solo. Quelli incerti li trovi in «Da collegare», da collegare con un tocco, da trasformare in un contenuto o da lasciare fuori dal calendario; un post scollegato non viene più riproposto per quel contenuto. «Aggiorna da Instagram» li rilegge subito (admin e marketing).',
      },
      {
        per: ['marketing'],
        testo:
          'Nel pannello di un contenuto il riquadro «Post su Instagram» mostra il post collegato, con «Usa la data di Instagram» quando la Post Date è diversa, o «Forse è questo post» con «Collega».',
      },
      {
        per: ['admin'],
        testo:
          'I post si leggono ogni mattina presto e con «Aggiorna da Instagram», col token di Impostazioni › Instagram, che qui si legge e basta. Se il token scade si fermano anche loro, e Impostazioni › Instagram lo dice nella nuova riga «Post e reel». Tornando sulla Panoramica da un’altra pagina i numeri si rinfrescano da soli, anche quelli arrivati mentre eri altrove.',
      },
    ],
    correzioni: [
      {
        per: ['tutti'],
        testo:
          'La X dei fogli che si aprono dal basso o di lato è grande abbastanza per il dito e non copre più il titolo; lo sfondo dietro non si sfoca più, così i fogli si aprono più leggeri sul telefono.',
      },
    ],
  },
  {
    versione: '1.32.0',
    data: '2026-10-09',
    titolo: 'Il calendario dei contenuti nell’app, e il ruolo Marketing',
    riassunto:
      'I reel e i caroselli di Notion con le stesse proprietà, in tabella e in calendario, per te, il video editor e il nuovo ruolo Marketing; settembre e ottobre arrivano da Notion.',
    intestazionePer: ['marketing'],
    intestazioneTeam: {
      titolo: 'Il calendario dei contenuti',
      riassunto:
        'Reel e caroselli con le stesse proprietà di Notion, in tabella e in calendario: Status con un tocco e script da scrivere anche dal telefono.',
    },
    novita: [
      {
        per: ['admin'],
        testo:
          'Nuovo ruolo Marketing: lo inviti da Impostazioni › Team. Chi lo ha entra in «Contenuti» e ha anche Progetti, I miei task e Il mio tempo, come il video editor; non vede mai vendite, incassi, provvigioni, lead, call, clienti né i DM.',
      },
      {
        per: ['admin'],
        testo:
          'Il listino dei prodotti (prezzi e piano abituale) ora lo leggono solo admin, setter e closer: il video editor, il marketing e gli altri ruoli dei progetti non lo vedono più, nemmeno dal database.',
      },
      {
        per: ['marketing'],
        testo:
          'Contenuti, nella nuova area Marketing: i reel e i caroselli con le proprietà di Notion (Name, Reel Type, Format, Inspiration, Status, Post Date, Audio, URL, View Count). In tabella, dalla Post Date più recente, o in calendario mese per mese; sul telefono l’agenda dei giorni con contenuti. Lo Status si cambia con un tocco.',
      },
      {
        per: ['marketing'],
        testo:
          'Ogni contenuto ha la sua pagina con le sezioni del modello di Notion: Reel Topic (Topic / Main Message, Script (Rough Draft), Comments, Script (Final)) o Carousel Topic (Idea/Message, Carousel, Caption). Ogni sezione si scrive e si corregge sul posto, anche dal telefono, e non sovrascrive mai il testo che un altro ha salvato nel frattempo: se è cambiato, ricarica quello salvato e il tuo resta da copiare.',
      },
      {
        per: ['marketing'],
        testo:
          '«Nuovo contenuto»: un Reel Topic nasce già con Hook, Line, Line e CTA nella bozza; dal calendario il «+» di un giorno lo crea con quella Post Date. Un contenuto lo eliminano l’admin e il marketing; il video editor lo segna «Canceled».',
      },
      // Ships only if the Notion import runs on the deploy day (spec 1.32.0, section 8).
      {
        per: ['marketing'],
        testo:
          'I contenuti di settembre e ottobre arrivano da Notion, con proprietà e testi; le immagini restano nella pagina di Notion, che si apre da «Apri in Notion».',
      },
    ],
  },
  {
    versione: '1.31.0',
    data: '2026-10-09',
    titolo: 'Il commento della giornata è obbligatorio per il setter',
    riassunto:
      'Dall’08/10, nei giorni con DM o conversazioni, il setter risponde sempre a lead in target, qualità delle conversazioni e cosa frenava i lead, anche quando i numeri li carica Instagram. Le risposte le leggi in Setter › Per il marketing.',
    intestazionePer: ['setter'],
    intestazioneTeam: {
      titolo: 'Il commento della giornata è obbligatorio',
      riassunto:
        'Dall’08/10, nei giorni con DM o conversazioni, rispondi sempre a lead in target, qualità delle conversazioni e cosa frenava i lead, anche quando i numeri li carica Instagram. I numeri si salvano sempre, come prima.',
    },
    novita: [
      {
        per: ['admin'],
        testo: 'Il commento della giornata ora è obbligatorio per il setter, dall’08/10: nei giorni con DM o conversazioni deve rispondere a lead in target, qualità delle conversazioni e cosa frenava i lead dal fissare la call; domande e contenuti e altre note restano facoltative, e i giorni prima dell’08/10 restano come erano. I numeri si salvano sempre: finché manca una risposta, la giornata gli resta da completare. Anche quando i numeri li carica Instagram il commento lo scrive lui: prima di confermare la proposta o di tenere i suoi numeri, la scheda gli chiede le tre risposte. Le leggi nella pagina Setter, in «Per il marketing: cosa dicono i lead», ora più in vista: il titolo è rosso e più grande, e le risposte scritte vengono prima dei conteggi.',
      },
      {
        per: ['admin'],
        testo: 'Il promemoria è solo del setter: tu non vedi chi non ha scritto il commento, né un elenco né un numero. Quando confermi tu una giornata da «Tracciamento da approvare» il commento non ti viene chiesto e la scheda non dice se c’è: resta da scrivere al setter, e il suo numero su «Oggi» glielo ricorda. Nei tuoi fogli in Setter (Aggiungi giornata, la correzione di un giorno) le domande restano facoltative.',
      },
      {
        per: ['setter'],
        testo: 'In Oggi, nei giorni dall’08/10 con DM o conversazioni, lead in target, qualità delle conversazioni e cosa frenava i lead dicono «(obbligatoria)». Finché ne manca una, sotto ogni domanda vuota c’è cosa manca e la barra del salvataggio dice «Manca il commento della giornata», con un tocco che porta alle domande. I numeri si salvano sempre, a ogni tocco.',
        testoTeam:
          'In Oggi, nei giorni dall’08/10 con DM o conversazioni, lead in target, qualità delle conversazioni e cosa frenava i lead dal fissare la call dicono «(obbligatoria)». Finché ne manca una, sotto ogni domanda vuota trovi cosa manca e la barra del salvataggio dice «Manca il commento della giornata»: un tocco ti porta alle domande. I numeri si salvano sempre, a ogni tocco, come prima. Domande e contenuti e altre note restano facoltative, e i giorni prima dell’08/10 restano come erano.',
      },
      {
        per: ['setter'],
        testo: 'In cima a Oggi il setter trova «Ti manca il commento di:» con i suoi altri giorni dall’08/10 ancora senza commento, ognuno un link alle sue domande (fino a 7, poi «e altri N giorni»). Il numero su «Oggi», nel menu, conta anche questi giorni, oggi compreso, accanto alle giornate da approvare («Oggi, 1 giornata da approvare, 2 commenti da scrivere»), e cala appena li scrive.',
        testoTeam:
          'In cima a Oggi «Ti manca il commento di:» elenca i tuoi altri giorni dall’08/10 ancora senza commento: tocchi un giorno e sei sulle sue domande (fino a 7, poi «e altri N giorni»). Anche il numero su «Oggi», nel menu, li conta, oggi compreso, insieme alle giornate da approvare, e cala appena li scrivi. Questo promemoria lo vedi solo tu.',
      },
      {
        per: ['setter'],
        testo: 'Anche quando i numeri li carica Instagram, il commento lo scrive il setter: se a quel giorno manca, «Conferma», «Usa quelli di Instagram», «Correggi» e «Tieni i miei» gli chiedono prima «Com’è andata la giornata», con le tre domande già compilate con quello che ha scritto. Le risposte si salvano nel suo report insieme alla scelta; senza, la scelta non passa. Se intanto la giornata la decidi tu, le risposte che ha scritto si salvano lo stesso; se intanto Instagram ricalcola i numeri, la scelta non passa finché non ha visto quelli nuovi, e le sue risposte restano lì.',
        testoTeam:
          'Anche quando i numeri li carica Instagram, il commento della giornata lo scrivi tu: se a quel giorno manca, «Conferma», «Usa quelli di Instagram», «Correggi» e «Tieni i miei» ti chiedono prima le tre risposte di «Com’è andata la giornata», già compilate con quello che hai scritto. Le risposte si salvano nel tuo report insieme alla tua scelta; senza, la scelta non passa. Se una giornata la conferma Dany, il commento resta da scrivere a te: il numero su «Oggi» te lo ricorda; se la decide mentre stai scrivendo il commento, le tue risposte si salvano lo stesso, anche se intanto passi a Instagram e torni. Se intanto Instagram ricalcola i numeri, la scelta non passa finché non hai visto quelli nuovi, e le risposte che hai scritto restano lì.',
      },
      {
        per: ['setter'],
        testo: 'Se il setter detta ad Alfire i numeri di un giorno dall’08/10 senza commento, la scheda di conferma ricorda «Manca il commento della giornata» e, salvati i numeri, Alfire gli chiede solo le risposte che mancano ancora, senza ripetere quelle già scritte. Il report si salva lo stesso.',
        testoTeam:
          'Se detti ad Alfire i numeri di un giorno dall’08/10 senza commento, la scheda di conferma ricorda «Manca il commento della giornata» e, salvati i numeri, Alfire ti chiede solo le risposte che mancano ancora (lead in target, qualità delle conversazioni o cosa frenava i lead), mai quelle che hai già scritto. Il report si salva lo stesso.',
      },
    ],
  },
  {
    versione: '1.30.1',
    data: '2026-10-08',
    titolo: 'Oggi non salva più a vuoto cambiando scheda',
    riassunto: 'Cambiando scheda o app, Oggi salva solo quello che il setter ha appena toccato.',
    intestazionePer: ['setter'],
    novita: [],
    correzioni: [
      {
        per: ['setter'],
        testo: 'Quando il setter passava a un’altra scheda o a Instagram, Oggi salvava sempre: su un giorno mai toccato creava un report tutto a zero, su uno già salvato lo riscriveva uguale. Ora salva solo quello che aspetta (un tocco appena fatto, un salvataggio non riuscito): un giorno che non ha compilato resta vuoto.',
        testoTeam:
          'Quando passavi a un’altra scheda o a Instagram, Oggi salvava sempre: su un giorno mai toccato creava un report tutto a zero, su uno già salvato lo riscriveva uguale. Ora salva solo quello che hai appena toccato o che non era riuscito a salvare: un giorno che non hai compilato resta vuoto.',
      },
    ],
  },
  {
    versione: '1.30.0',
    data: '2026-10-08',
    titolo: 'Approvi anche tu il tracciamento dei setter',
    riassunto:
      'In cima alla pagina Setter trovi le giornate contate dai DM e non ancora decise, col numero accanto a «Setter»: le confermi, le correggi o tieni i numeri del setter. Vale la prima scelta, tua o sua.',
    intestazionePer: ['setter'],
    intestazioneTeam: {
      titolo: 'Le giornate da approvare, col numero su Oggi',
      riassunto:
        'Su «Oggi» un numero ti dice quante giornate contate dai DM aspettano la tua scelta. Anche Dany può confermarle, e quando lo fa lo trovi scritto nel giorno.',
    },
    novita: [
      {
        per: ['admin'],
        testo: 'In cima alla pagina Setter c’è «Tracciamento da approvare»: una scheda per ogni giornata contata dai DM di Instagram e non ancora decisa, di ogni setter, dalla più recente, con il nome del setter, il giorno, le chat lette e quelle lunghe e i 6 numeri. Se il setter quel giorno ha già scritto i suoi numeri, ogni riga dice «Loris 52 · Instagram 53» e scegli tra «Usa quelli di Instagram», «Tieni quelli di Loris» e «Correggi»; altrimenti «Conferma» o «Correggi», che apre gli stessi contatori di Oggi partendo dai numeri di Instagram. I numeri vanno nel report del setter di quel giorno, mai nel tuo, e le sue risposte di «Com’è andata la giornata» restano come sono. Senza giornate da decidere la sezione non c’è.',
      },
      {
        per: ['admin'],
        testo: 'Accanto a «Setter», nel menu, un numero dice quante giornate aspettano una scelta; sul telefono sta su «Altro», sommato agli esiti da registrare. Si aggiorna quando cambi pagina e a zero sparisce. Nessuna email, nessun avviso.',
      },
      {
        per: ['admin'],
        testo: 'Vale la prima scelta, tua o del setter: se ha già deciso lui, al tocco la scheda te lo dice e sparisce. Se mentre la guardi il setter cambia i suoi numeri di quel giorno, anche un istante prima del tocco, la conferma si ferma e la scheda torna con i numeri nuovi: non sovrascrivi mai numeri che non hai visto. Se il setter ha Oggi aperto su quel giorno, il suo primo tocco non riscrive i numeri vecchi sopra quelli che hai deciso: Oggi gli dice che il report è cambiato e li ricarica. Chi decide resta scritto, e il setter vede nel suo giorno che l’hai deciso tu, o che hai corretto i numeri di Instagram. Cambia una regola: adesso vedi i numeri contati dai DM accanto a quelli dichiarati dal setter, e il setter lo sa.',
      },
      {
        per: ['admin'],
        testo: 'Il backup del lunedì comprende di nuovo le proposte di Instagram, con chi le ha decise: dopo un ripristino tornano come erano. In Impostazioni › Instagram, «Ricalcola ieri» ti porta alle giornate da approvare.',
      },
      {
        per: ['setter'],
        testo: 'Il setter ha un numero su «Oggi», nel menu: quante delle sue giornate contate dai DM aspettano ancora la sua scelta. A zero sparisce.',
        testoTeam:
          'Su «Oggi», nel menu, un numero ti dice quante delle tue giornate contate dai DM aspettano ancora la tua scelta. A zero sparisce.',
      },
      {
        per: ['setter'],
        testo: 'Il setter sa che anche tu puoi decidere le sue giornate e che vedi i numeri di Instagram accanto ai suoi. Quando decidi tu, nel suo giorno trova scritto, col tuo nome, che hai confermato i numeri di Instagram, che li hai corretti o che hai tenuto i suoi, senza i numeri della proposta.',
        testoTeam:
          'Anche Dany può confermare i numeri di Instagram delle tue giornate, correggerli o tenere i tuoi, e li vede accanto ai tuoi. Vale la prima scelta, tua o sua: una giornata già decisa da lui sparisce da Oggi. Quando decide lui, nel giorno trovi scritto che Dany ha confermato i numeri di Instagram per quel giorno, che li ha corretti o che ha tenuto i tuoi. Le domande di «Com’è andata la giornata» restano sempre tue.',
      },
      {
        per: ['setter'],
        testo: 'Se il setter ha Oggi aperto su un giorno che intanto hai deciso tu (o corretto da Setter), il suo primo tocco non riscrive i numeri vecchi: Oggi gli dice che il report è cambiato, ricarica i numeri salvati e gli chiede di rifare l’ultima modifica. Tornando nell’app, il giorno aperto si aggiorna da solo se è cambiato; senza rete resta com’è. Un salvataggio arrivato col telefono che non ha ricevuto la risposta (la rete che salta, il passaggio a Instagram subito dopo un tocco) non conta come un cambiamento: il tocco dopo salva come sempre.',
        testoTeam:
          'Se hai Oggi aperto su un giorno che intanto Dany ha deciso, il tuo primo tocco non riscrive i numeri vecchi: Oggi ti dice che il report di quel giorno è cambiato e ricarica i numeri salvati, poi rifai l’ultima modifica se serve. Tornando nell’app, il giorno aperto si aggiorna da solo se è cambiato; senza rete resta com’è. Se la rete salta proprio mentre salvi, o passi a Instagram subito dopo un tocco, il tocco dopo salva come sempre.',
      },
    ],
  },
  {
    versione: '1.29.0',
    data: '2026-10-08',
    titolo: 'Il report del setter precompilato dai DM di Instagram',
    riassunto:
      'Ogni notte l’app conta i DM dell’account del giorno prima e propone al setter i numeri del suo report: lui li conferma, li corregge o tiene i suoi. Instagram lo colleghi da Impostazioni.',
    intestazionePer: ['setter'],
    intestazioneTeam: {
      titolo: 'Il report di ieri, già compilato dai DM',
      riassunto:
        'Ogni notte l’app conta i DM dell’account del giorno prima e in Oggi ti propone i numeri del report: li confermi, li correggi o tieni i tuoi.',
    },
    novita: [
      {
        per: ['setter'],
        testo: 'In Oggi il setter trova la scheda «Da Instagram · ieri», con i numeri del giorno prima contati dai DM dell’account: DM outbound, DM inbound, follow up, conversazioni, call proposte (le chat in cui è partito il link di Calendly) e discovery prenotate (le call che ha fissato nell’app quel giorno). «Conferma» li scrive nel suo report; «Correggi» apre gli stessi contatori di Oggi già compilati, da sistemare prima di confermare. Se quel giorno aveva già scritto i suoi numeri, ogni riga dice «tu 52 · Instagram 53» e lui sceglie «Usa quelli di Instagram» o «Tieni i miei». Le domande di «Com’è andata la giornata» restano sue. La proposta la vede solo lui: tu vedi il report come lo conferma, come prima, e niente si conferma da solo.',
        testoTeam:
          'In Oggi trovi la scheda «Da Instagram · ieri», con i numeri del giorno prima contati dai DM dell’account: DM outbound, DM inbound, follow up, conversazioni, call proposte (le chat in cui è partito il link di Calendly) e discovery prenotate (le call che hai fissato nell’app quel giorno). «Conferma» li scrive nel tuo report; «Correggi» apre gli stessi contatori di Oggi già compilati, da sistemare prima di confermare. Se quel giorno avevi già scritto i tuoi numeri, ogni riga dice «tu 52 · Instagram 53» e scegli tu: «Usa quelli di Instagram» o «Tieni i miei». Le domande di «Com’è andata la giornata» restano tue. La proposta la vedi solo tu, niente si conferma da solo e la tua scelta vince sempre.',
      },
      {
        per: ['setter'],
        testo: 'La scheda dice quante chat ha letto e quante sono lunghe: Instagram dà solo gli ultimi 20 messaggi di ogni chat, e nelle chat lunghe qualcosa può sfuggire. Conta tutto quello che parte dall’account, anche i messaggi che scrivi tu, e mai le chat che escludi: quando un numero non torna, il setter lo corregge.',
        testoTeam:
          'La scheda dice quante chat ha letto e quante sono lunghe: Instagram dà solo gli ultimi 20 messaggi di ogni chat, e nelle chat lunghe qualcosa può sfuggire. Conta tutto quello che parte dall’account, anche i messaggi che scrive Dany, e mai le chat escluse (account del team, clienti, amici): quando un numero non torna, correggilo.',
      },
      {
        per: ['admin'],
        testo: 'In Impostazioni › Instagram colleghi i DM: incolli il token generato dal pannello Meta (si salva cifrato, non si mostra più e si rinnova da solo ogni settimana), scegli chi lavora i DM e tieni aggiornate le chat escluse, come clienti e amici, che non contano mai. In cima l’account, la scadenza del token, l’ultimo calcolo con le chat lette e l’ultimo errore; se il token scade, un avviso rosso ti dice di generarne uno nuovo. «Ricalcola ieri» rilegge i DM di ieri e rifà la proposta, per esempio dopo un token nuovo. I numeri della proposta non li vedi mai, nemmeno nel backup: tu vedi il report come il setter lo conferma.',
      },
      {
        per: ['admin'],
        testo: 'L’informativa privacy dice che ogni notte l’app conta i messaggi dell’account per il report del setter, senza salvarne il testo e senza passarli a un’intelligenza artificiale.',
      },
    ],
  },
  {
    versione: '1.28.0',
    data: '2026-10-08',
    titolo: 'Insight delle ultime 24h',
    riassunto: 'Nella pagina Setter, e per il setter in Oggi e I miei numeri, un pulsante apre il recap dei DM Instagram delle ultime 24 ore.',
    intestazionePer: ['setter'],
    intestazioneTeam: {
      titolo: 'Insight delle ultime 24h',
      riassunto: 'In Oggi e in I miei numeri un pulsante apre il recap dei DM Instagram delle ultime 24 ore.',
    },
    novita: [
      {
        per: ['admin'],
        testo: 'In cima alla pagina Setter, accanto ad «Aggiungi giornata», c’è «Insight delle ultime 24h», con le stelline: apre in una nuova scheda il tuo recap dei DM Instagram su Claude. L’app non legge né salva i DM: è solo il collegamento.',
      },
      {
        per: ['setter'],
        testo: 'Anche il setter ha «Insight delle ultime 24h», in Oggi e in I miei numeri: apre lo stesso recap su Claude, che lui vede quando glielo condividi da claude.ai.',
        testoTeam:
          'In Oggi e in I miei numeri c’è «Insight delle ultime 24h», con le stelline: apre in una nuova scheda il recap dei DM Instagram delle ultime 24 ore su Claude.',
      },
    ],
  },
  {
    versione: '1.27.0',
    data: '2026-10-08',
    titolo: 'Setter e Closer nel menu, la call di follow-up e il riepilogo del venerdì',
    riassunto:
      'Al posto di Setting due voci, Setter e Closer, che si apre sulle tue call da registrare; con «Follow-up» dici se hai fissato una call di follow-up e quando; il setter legge i numeri del closer; l’email con incassi e recap arriva solo il venerdì sera.',
    intestazionePer: ['setter', 'closer'],
    intestazioneTeam: {
      titolo: 'La call di follow-up e i numeri del closer',
      riassunto:
        'Con «Follow-up» il closer dice se ha fissato una call di follow-up e quando: una call nuova, con lo stesso lead e lo stesso setter. Il closer trova in cima le call da registrare, il setter legge i numeri del closer di tutte le call.',
    },
    novita: [
      {
        per: ['admin'],
        testo: 'Nel menu, al posto di «Setting» con le sue due schede, ci sono due voci: «Setter», con i numeri e i report giornalieri di ogni setter, e «Closer», con i numeri del closer giorno per giorno. Gli indirizzi sono gli stessi: i link salvati e quelli di Alfire funzionano come prima.',
      },
      {
        per: ['closer'],
        testo: 'La pagina Closer si apre sulle tue call da registrare: in cima «Da registrare», le tue call passate ancora senza esito, dalla più vecchia, e «Oggi», le altre call di oggi, con gli stessi bottoni di Le mie call (Registra esito, Sposta). Con un altro closer scelto la sezione non c’è: le call da registrare sono sempre e solo le tue. Sotto, i numeri come prima.',
        testoTeam:
          '«I miei numeri» si apre sulle tue call da registrare: in cima «Da registrare», le tue call passate ancora senza esito, dalla più vecchia, e «Oggi», le altre call di oggi, con gli stessi bottoni di Le mie call (Registra esito, Sposta). Sotto, i tuoi numeri come prima.',
      },
      {
        per: ['closer'],
        testo: 'Accanto a «Le mie call» e a «Closer» un numero dice quante delle tue call passate sono ancora senza esito, così ti ricordi di registrarle ogni giorno: sulla barra laterale, sulla barra in basso e su «Altro» quando la voce sta lì. Cala da solo a ogni esito registrato, si aggiorna a ogni cambio di pagina e quando torni sull’app (una call appena passata, un esito registrato dal telefono) e a zero sparisce. È solo tuo: il setter non lo vede, e nessuno vede quello di un altro.',
        testoTeam:
          'Accanto a «Le mie call» e a «I miei numeri» un numero dice quante delle tue call passate sono ancora senza esito, così ti ricordi di registrarle ogni giorno. Cala da solo a ogni esito registrato, si aggiorna a ogni cambio di pagina e quando torni sull’app, e a zero sparisce. Lo vedi solo tu.',
      },
      {
        per: ['closer'],
        testo: 'Toccando «Follow-up» il foglio dell’esito chiede «Hai fissato una call di follow-up?». Con «Sì, call fissata» scegli giorno e ora: salvando, l’app crea una call nuova in quel giorno, da fare, con lo stesso lead, lo stesso setter e lo stesso closer, collegata alla prima («Follow-up della call del …»). Con «No, follow-up in chat» vai avanti senza data. Poi il motivo di non chiusura, come sempre; la scelta resta in cima con «cambia». Una call finita in follow-up senza la sua call di follow-up ha «Fissa la call di follow-up», per fissarla dopo (tu anche nel passato, fino a un anno indietro; il closer della call deve essere attivo). Se la call di follow-up è passata a un altro closer, la scheda della prima call lo dice senza giorno né bottone. La call di follow-up conta nei numeri del closer come ogni call, ma non tra le call prenotate del setter, nemmeno se elimini la call di partenza; se chiude, la vendita va al setter della prima call, con la sua provvigione.',
        testoTeam:
          'Toccando «Follow-up» il foglio dell’esito chiede «Hai fissato una call di follow-up?». Con «Sì, call fissata» scegli giorno e ora: salvando, l’app crea una call nuova in quel giorno, da fare, con lo stesso lead, lo stesso setter e lo stesso closer, collegata alla prima («Follow-up della call del …»). Con «No, follow-up in chat» vai avanti senza data. Poi il motivo di non chiusura, come sempre; la scelta resta in cima con «cambia». Una call finita in follow-up senza la sua call di follow-up ha «Fissa la call di follow-up», per fissarla dopo. Se la call di follow-up è passata a un altro closer, la scheda lo dice, senza giorno né bottone. La call di follow-up conta nei tuoi numeri come ogni call; se chiude, la vendita resta del setter della prima call.',
      },
      {
        per: ['closer'],
        testo: 'Una call chiusa senza la sua vendita dice «Vendita da registrare», con «Registra la vendita» che apre la vendita già compilata col setter della call. In Le mie call queste call stanno sopra «Oggi», in «Vendita da registrare», qualunque sia il giorno, finché la vendita non c’è: così il valore di ogni call chiusa entra nei numeri e la provvigione va al suo setter. Le call importate dal foglio delle call non lo chiedono: le loro vendite vengono dall’Excel; quelle di una persona che elimini lo chiedono ancora. Una vendita già registrata da Vendite senza la call la colleghi con «La vendita c’è già: collegala», che propone le vendite senza call del cliente con lo stesso nome o handle e quelle firmate vicino alla call: niente seconda vendita. Anche la nuova vendita della call, prima del modulo, avvisa te e il closer quando trova una vendita senza call di quel cliente firmata entro un mese («Questa vendita sembra già registrata»), e da lì la colleghi; al closer la scheda dice di chiederti di collegarla. Una vendita della call con un altro closer conta come registrata anche per il closer della call.',
        testoTeam:
          'Una call chiusa senza la sua vendita dice «Vendita da registrare», con «Registra la vendita» che apre la vendita già compilata col setter della call. In Le mie call queste call stanno sopra «Oggi», in «Vendita da registrare», qualunque sia il giorno, finché la vendita non c’è: così cash e revenue di ogni call chiusa entrano nei tuoi numeri. Se la vendita è già stata registrata senza la call, chiedi all’admin di collegarla: «Registra la vendita» ne farebbe una seconda. La scheda te lo ricorda, e la nuova vendita della call ti avvisa prima del modulo quando trova una tua vendita senza call di quel cliente firmata entro un mese.',
      },
      {
        per: ['setter'],
        testo: 'Il setter apre «Closer» (sul telefono in «Altro»): i numeri del closer sulle call di tutti i setter, giorno per giorno, di tutti i closer o di uno: call svolte, qualificate, no show, follow up, cancellate, chiuse, show rate e close rate, e cash e revenue dei clienti nuovi. Solo i totali di ogni giorno, in sola lettura: mai i nomi dei lead, le call, le note o le vendite degli altri setter, e niente «Compila la giornata».',
        testoTeam:
          'Nel menu (sul telefono in «Altro») c’è «Closer»: come vanno le call di tutti i setter, giorno per giorno, di tutti i closer o di uno: call svolte, qualificate, no show, follow up, cancellate, chiuse, show rate e close rate, e cash e revenue dei clienti nuovi. Sono i totali di ogni giorno, in sola lettura: i lead e le note degli altri setter restano loro. I tuoi numeri restano in I miei numeri.',
      },
      {
        per: ['setter'],
        testo: 'Sulle call del setter finite in follow-up c’è «Follow-up in chat» o «Call di follow-up: giovedì 08/10 alle 18:00». La call di follow-up porta il suo nome e sta tra le sue call con «Follow-up»: se chiude, la vendita e la provvigione sono sue. Non conta tra le sue call prenotate, perché la fissa il closer; in I miei numeri sta in «In agenda nel periodo», come ogni call col suo nome, e la spiegazione ora lo dice.',
        testoTeam:
          'Sulle tue call finite in follow-up vedi se il closer ha fissato una call di follow-up e quando («Call di follow-up: giovedì 08/10 alle 18:00»), o «Follow-up in chat». La call di follow-up porta il tuo nome e sta tra le tue call con «Follow-up»: se chiude, la vendita è tua, con la tua provvigione. Non la conti tra le tue call prenotate: la fissa il closer. In I miei numeri sta in «In agenda nel periodo», come ogni call col tuo nome.',
      },
      {
        per: ['admin'],
        testo: 'L’email con incassi e numeri del team non arriva più ogni sera: arriva solo il venerdì sera, con la settimana da sabato a venerdì, così nessun giorno resta fuori. Dentro: il cash della settimana e di cui nuovi clienti, rate di clienti già entrati, rinnovi e upsell; le vendite firmate, le rate in ritardo e quelle in scadenza nei 7 giorni; DM, conversazioni, call prenotate, svolte, no show e chiuse; poi incassi e vendite giorno per giorno (oltre 40 incassi o 20 vendite, il link a Incassi o Vendite) e i clienti con rate in ritardo, da quelli in ritardo da più tempo (oltre 8, quanti altri e il link a Incassi). Il backup del lunedì e i promemoria dei percorsi arrivano come prima.',
      },
      {
        per: ['closer'],
        testo: 'Ad Alfire puoi dire «segna follow-up per Rossi con una call domani alle 18»: la scheda mostra l’esito e la call di follow-up, e dopo «Conferma» la crea come il foglio. Per una call già finita in follow-up, «fissa la call di follow-up con Rossi giovedì alle 18». Se il giorno non va (prima della call, o fuori dalla finestra: per il closer da oggi in avanti, per te fino a un anno indietro) o la call ne ha già una, la scheda si ferma e dice perché.',
        testoTeam:
          'Ad Alfire puoi dire «segna follow-up per Rossi con una call domani alle 18»: la scheda mostra l’esito e la call di follow-up, e dopo «Conferma» la crea come il foglio. Per una call già finita in follow-up, «fissa la call di follow-up con Rossi giovedì alle 18». Se il giorno non va (nel passato, prima della call) o la call ne ha già una, la scheda si ferma e dice perché.',
      },
      {
        per: ['setter'],
        testo: 'Il setter chiede ad Alfire i numeri del closer, come la pagina Closer: «come sono andati i numeri del closer questa settimana?», anche di un closer solo. Alfire gli dice sempre che sono i numeri del closer sulle call di tutti i setter, non i suoi.',
        testoTeam:
          'Chiedi ad Alfire i numeri del closer, come la pagina Closer: «come sono andati i numeri del closer questa settimana?», anche di un closer solo. Alfire ti dice sempre che sono i numeri del closer sulle call di tutti i setter, non i tuoi: i tuoi te li dà come prima, quando chiedi della tua giornata.',
      },
      {
        per: ['admin'],
        testo: 'L’informativa privacy di Percorso Alpha è una pagina pubblica, su dashboard.percorsoalpha.com/privacy: si apre senza accesso, anche dal telefono, e spiega quali dati arrivano da Instagram e Facebook, a cosa servono, con chi si condividono, quanto si tengono e quali diritti ha chi ti scrive. La sezione «Come chiedere la cancellazione dei dati» ha il suo indirizzo, dashboard.percorsoalpha.com/privacy#cancellazione-dati. Nell’app di Meta usa il primo come Privacy Policy URL e il secondo come Data deletion instructions URL.',
      },
    ],
    correzioni: [
      {
        per: ['admin'],
        testo: 'Il ripristino di un backup funziona di nuovo: si fermava sui report giornalieri (i DM totali sono calcolati e non si scrivono) e sui backup fatti prima di una colonna nuova delle call, compreso quello di lunedì 05/10. Ora ogni tabella torna con le colonne che il backup ha, e le colonne nuove prendono il loro valore di partenza.',
      },
      {
        per: ['tutti'],
        testo: 'Il bottone in alto a destra che chiude i fogli e le finestre si annuncia «Chiudi» a chi usa un lettore di schermo, e un titolo lungo va a capo prima del bottone invece di finirci sotto.',
      },
    ],
  },
  {
    versione: '1.26.0',
    data: '2026-10-05',
    titolo: 'La cartella Drive del cliente anche nel suo progetto, per te e per il coach',
    riassunto:
      'Nel progetto di ogni cliente, sotto il coach, c’è la scheda «Cartella Drive»: la vedi tu e il coach del cliente, che la apre, la collega e la cambia; il resto del team no.',
    intestazionePer: ['progetti'],
    intestazioneTeam: {
      titolo: 'La cartella Drive del cliente nel suo progetto',
      riassunto: 'Se sei il coach di un cliente, nel suo progetto trovi la sua cartella Drive: la apri, la colleghi e la cambi da lì.',
    },
    novita: [
      {
        per: ['progetti'],
        testo: 'Il coach di un cliente trova «Cartella Drive» nel progetto del cliente, sotto il suo nome, su ogni scheda del progetto: un tocco apre la cartella su Google Drive, in una nuova scheda. Se non c’è ancora la collega lui, incollando il link o con «Scegli da Drive» e il suo account Google; con la matita la cambia o la toglie (la cartella su Drive resta com’è). Gli altri membri del progetto non la vedono. Se non trova la cartella su Drive, il messaggio gli dice di chiederti di condividerla con lui. Anche Alfire, quando gli chiede del progetto di un suo cliente, gli dà il link.',
        testoTeam:
          'Se sei il coach di un cliente, nel suo progetto, sotto il tuo nome, trovi «Cartella Drive»: un tocco apre la cartella del cliente su Google Drive, in una nuova scheda, da ogni scheda del progetto. Se non c’è ancora la colleghi tu: incolli il link o, con «Scegli da Drive», ti colleghi con il tuo account Google e tocchi la cartella. Con la matita cambi il link o lo togli (la cartella su Drive resta com’è). La vedete solo tu e l’admin: gli altri del progetto no. Se una cartella non la trovi su Drive, chiedi all’admin di condividerla con te. Anche Alfire, quando gli chiedi del progetto di un tuo cliente, ti dà il link.',
      },
      {
        per: ['admin'],
        testo: 'La scheda «Cartella Drive» del cliente adesso c’è anche nel suo progetto, sotto il coach, la stessa della scheda del cliente: la vedi tu e il coach del progetto, che la apre, la collega (incollando il link o con «Scegli da Drive»), la cambia e la toglie. Il link è uno solo: se lo cambia il coach, cambia anche nella scheda del cliente. Gli altri membri del progetto, closer, setter e gli altri coach non la vedono. Chi sceglie il coach (tu, o un manager del progetto) sceglie anche chi la vede: cambiato il coach, la vede solo quello nuovo. Con il coach condividi su Drive solo una cartella senza fatture né contratti, perché lui vede tutto quello che c’è dentro; perché usi «Scegli da Drive», l’app Google deve essere pubblicata o lui tra gli utenti di test. Alfire, chiedendo di un progetto di un cliente, dà il link a te e al suo coach, e non la scrive.',
      },
    ],
  },
  {
    versione: '1.25.0',
    data: '2026-10-05',
    titolo: 'Il task si apre da I miei task, gli ex clienti in archivio e la vista dei progetti che resta',
    riassunto:
      'Da I miei task tocchi il titolo e sei dentro il task, nel suo progetto; un cliente chiuso che non ricompra lo archivi come ex cliente; Progetti si riapre sulla vista che hai scelto l’ultima volta.',
    intestazionePer: ['progetti'],
    intestazioneTeam: {
      titolo: 'Il task si apre da I miei task, e Progetti ricorda la vista',
      riassunto:
        'Da I miei task tocchi il titolo e sei dentro il task, nel suo progetto; Progetti si riapre sulla vista che hai scelto l’ultima volta.',
    },
    novita: [
      {
        per: ['progetti'],
        testo: 'In I miei task il titolo di ogni task, anche tra i Completati, apre il task nel suo progetto: la scheda Attività con il task già aperto, la sua riga evidenziata e la lista o i completati aperti se serve. Il nome del progetto sotto continua ad aprire il progetto, spunta e sveglia restano dove sono.',
      },
      {
        per: ['progetti'],
        testo: 'Lo stesso dalla timeline dei progetti (il nome di un’attività apre il task) e dai link di Alfire sui task. Il link funziona anche ricaricando la pagina o mandandolo a qualcuno del progetto; se il task è stato eliminato, o non è tra quelli che puoi vedere, si aprono le attività del progetto con un avviso.',
      },
      {
        per: ['progetti'],
        testo: 'Progetti si ricorda la vista che hai scelto, Elenco o Timeline: aprendolo dal menu ritrovi quella dell’ultima volta, su quel computer o telefono.',
      },
      {
        per: ['admin'],
        testo: 'Un cliente chiuso che non ricompra lo archivi con «Archivia come ex cliente», dalla sua scheda o da «Non rinnovano» in Rinnovi: diventa «Ex cliente», esce da «Non rinnovano» e lo trovi in Clienti col filtro «Ex cliente»; la scheda dice da quando è archiviato. «Togli dall’archivio» lo rimette tra i chiusi, «Riapri» toglie chiusura e archivio, e se compra di nuovo torna da solo tra i clienti. Niente promemoria del percorso; cash, revenue e tasso di rinnovo non cambiano. Anche Alfire lo fa, con la solita scheda da confermare.',
      },
    ],
  },
  {
    versione: '1.24.0',
    data: '2026-10-05',
    titolo: 'Chi non rinnova, la cartella da Drive, la timeline dei progetti e i task completati',
    riassunto:
      'Un cliente che non rinnova lo chiudi con un tocco e va in una categoria a parte; la sua cartella Drive la scegli direttamente da Drive; in Progetti la timeline di tutti i progetti, e in I miei task i task chiusi restano in vista.',
    intestazionePer: ['admin'],
    novita: [
      {
        per: ['admin'],
        testo: 'Nella scheda del cliente, accanto a «Ha rinnovato», c’è «Non rinnova»: scegli da quando (di base oggi) e, se vuoi, scrivi il motivo. Il cliente diventa «Chiuso», anche se il percorso è ancora in corso (il coach continua fino alla fine), e la scheda mostra «Non rinnova · chiuso il …» col motivo, la matita per correggerli e «Riapri».',
      },
      {
        per: ['admin'],
        testo: 'Un cliente chiuso sta in una categoria a parte: in Clienti ha il suo filtro «Chiuso», in Rinnovi la sezione «Non rinnovano» in fondo, con giorno, motivo, WhatsApp, «Riapri» e «Registra rinnovo». Non compare più tra chi è in scadenza o da recuperare e non ti arrivano più i promemoria del suo percorso. Se compra di nuovo torna da solo tra i clienti, anche se registri il rinnovo lo stesso giorno della chiusura o in ritardo, con i promemoria del nuovo percorso; riaperto a mano, riprendono quelli ancora dovuti. Cash, revenue e tasso di rinnovo non cambiano.',
      },
      {
        per: ['admin'],
        testo: 'Anche Alfire lo fa: «Rossi non rinnova, chiudilo» o «riapri Rossi», con la solita scheda da confermare, e cerca i clienti chiusi con giorno e motivo.',
      },
      {
        per: ['admin'],
        testo: 'Nel foglio «Cartella Drive» c’è «Scegli da Drive»: ti colleghi con Google, si apre Drive con le tue cartelle e quelle condivise con te, tocchi quella del cliente e il link si salva da solo. L’app vede solo le cartelle che scegli. Il bottone compare quando Google è configurato (i passi sono nella documentazione del progetto); fino ad allora resta il link da incollare.',
      },
      {
        per: ['progetti'],
        testo: 'In I miei task, quando spunti un task non sparisce più: resta al suo posto, spuntato e barrato, con «Completato adesso», e in alto compare «Fatto» con «Annulla» per riaprirlo con un tocco. Quando torni sulla pagina lo ritrovi in Completati.',
      },
      {
        per: ['progetti'],
        testo: 'In fondo a I miei task c’è «Completati»: tutti i task assegnati a te già chiusi, dal più recente, ognuno col suo progetto e il giorno in cui è stato chiuso («Completato oggi alle 18:42», «ieri» o la data), e «Riapri» per rimetterlo tra quelli da fare, nel suo gruppo. Si vedono gli ultimi 30; «Mostra tutti» apre gli altri. Sono sempre e solo i tuoi task.',
      },
      {
        per: ['progetti'],
        testo: 'Progetti ha due viste, Elenco e Timeline. La timeline mette ogni progetto su una linea del tempo, dall’inizio alla fine, reparto per reparto, con quello che finisce prima in cima e la linea di oggi. Sotto ogni nome c’è quanto manca alla fine («tra 17 giorni»); chi finisce entro 30 giorni ha l’orologio. Stato, reparto e «Solo i miei» valgono anche qui.',
      },
      {
        per: ['progetti'],
        testo: 'Nella timeline la freccia accanto al nome apre le liste e le attività con le date del progetto, e il grafico scorre fino a loro. Ogni barra, al passaggio del mouse o con un tocco, dice inizio, fine, giorni alla fine, coach (o «Senza coach») e attività completate, con «Apri il progetto».',
      },
      {
        per: ['progetti'],
        testo: 'Trimestri mostra tutto il periodo nella pagina (sul telefono scorre), Mesi guarda da vicino; il grafico si apre su oggi. «Tabella» mostra gli stessi progetti con reparto, inizio, fine, giorni alla fine, coach e avanzamento. I progetti senza data di fine sono elencati a parte.',
      },
      {
        per: ['admin'],
        testo: 'Nella timeline del Fitness Coaching vedi a colpo d’occhio quali percorsi dei clienti stanno finendo e, con l’icona accanto alla data, quali sono ancora senza coach.',
      },
    ],
    correzioni: [
      {
        per: ['admin'],
        testo: 'Il box «In scadenza» della Panoramica usa la stessa regola di Rinnovi: chi finisce il percorso entro 30 giorni, iniziato o no, senza i clienti chiusi.',
      },
      {
        per: ['admin'],
        testo: '«Interrompi il percorso» su un percorso non ancora cominciato propone il suo primo giorno, non oggi che viene prima.',
      },
      {
        per: ['admin'],
        testo: 'In Rinnovi, tra chi ha finito da poco, chi ha finito ieri risultava «1 giorni fa»: ora «1 giorno fa».',
      },
    ],
  },
  {
    versione: '1.23.1',
    data: '2026-10-04',
    titolo: 'Clienti da iniziare',
    riassunto: 'Un cliente il cui percorso non è ancora cominciato risulta «Da iniziare», non più «Scaduto».',
    intestazionePer: ['admin'],
    novita: [],
    correzioni: [
      {
        per: ['admin'],
        testo: 'Un cliente nuovo, nella settimana tra la vendita e l’inizio del percorso, risultava «Scaduto» in Clienti e nella sua scheda, e in Rinnovi finiva tra chi ha finito, con «finito il …, -92 giorni fa» e il messaggio di rinnovo. Ora è «Da iniziare»: ha il suo filtro in Clienti e non compare tra chi ha finito. Lo stesso per chi rinnova dopo una pausa, finché il nuovo percorso non comincia. Il giorno dell’inizio diventa «Attivo».',
      },
    ],
  },
  {
    versione: '1.23.0',
    data: '2026-10-04',
    titolo: 'Promemoria del percorso e cartella Drive',
    riassunto:
      'Ti arriva un’email quando mancano 3 mesi alla fine del percorso di un cliente, per la call del feedback, e quando manca un mese, per la call di rinnovo. Nella scheda del cliente puoi collegare la sua cartella Drive.',
    intestazionePer: ['admin'],
    novita: [
      {
        per: ['admin'],
        testo: 'Quando mancano 3 mesi alla fine del percorso di un cliente ti arriva un’email «Call dei 3 mesi con Mario Rossi: raccogli il feedback», e quando manca un mese «Call di rinnovo con Mario Rossi: il percorso finisce il …». Dentro: prodotto, inizio, fine, giorni alla fine, il link alla scheda del cliente, «Scrivi su WhatsApp» col messaggio già scritto se hai il suo numero e, in quella del rinnovo, «Registra rinnovo», che apre il rinnovo di quel cliente anche se prima devi rientrare con Google. Arrivano con il riepilogo della sera, solo a te.',
      },
      {
        per: ['admin'],
        testo: 'Ognuna arriva una volta sola, e di nuovo solo se cambia la data di fine del percorso. Un percorso di 3 mesi ha solo quella del rinnovo; chi ha già rinnovato riceve i promemoria del percorso nuovo, mai di quello vecchio; un percorso finito o interrotto non ne riceve. Ne partono al massimo 20 a sera: le altre arrivano le sere dopo. Se una sera l’email non parte, riprova la sera dopo; la prima sera, a chi è già a meno di un mese dalla fine arriva solo quella del rinnovo.',
      },
      {
        per: ['admin'],
        testo: 'Nella scheda del cliente c’è «Cartella Drive»: incolli il link della sua cartella su Google Drive e la apri con un tocco. Con la matita lo cambi o lo togli (la cartella su Drive resta com’è). La vedi solo tu: closer, setter e coach no.',
      },
    ],
  },
  {
    versione: '1.22.0',
    data: '2026-10-04',
    titolo: 'Call in attesa di conferma',
    riassunto:
      'Quando un lead deve spostare la call ma non ha ancora una data, la call si segna «In attesa di conferma»: niente data inventata, e resta in vista finché il lead non conferma.',
    intestazionePer: ['closer', 'setter'],
    novita: [
      {
        per: ['closer'],
        testo: 'Nel foglio dell’esito, sotto «Va riprogrammata», ci sono due scelte. «Ha già una nuova data» chiede giorno e ora e sposta la call, come prima. «In attesa di conferma» non chiede nessuna data: la call resta sul suo giorno, senza esito, e puoi lasciare le tue note aggiuntive. Su una call ancora da fare la trovi in «Annulla o rimanda», accanto a «Sposta».',
      },
      {
        per: ['closer'],
        testo: 'In Le mie call le call in attesa di conferma stanno in cima, nella loro sezione «In attesa di conferma». Quando il lead ti dà la data, «Sposta» porta la call al nuovo giorno e torna da fare.',
      },
      {
        per: ['setter'],
        testo: 'Nelle tue call, una call che il lead deve ancora riconfermare si legge «In attesa di conferma» (prima «Riprogrammata»). La nuova data la mette il closer quando il lead la conferma.',
      },
      {
        per: ['admin'],
        testo: 'Le call «Riprogrammata» si chiamano ora «In attesa di conferma» in tutta l’app e in Alfire: badge, Le mie call, Compila la giornata, la guida. Le registri come il closer, anche dicendo ad Alfire «mettila in attesa di conferma»; mai su una call svolta o un no show. Restano fuori dallo show rate, come prima.',
      },
    ],
  },
  {
    versione: '1.21.0',
    data: '2026-10-04',
    titolo: 'Alfire ti dà i totali',
    riassunto: 'Quanto ti resta da incassare e quanto hanno pagato i tuoi clienti in un periodo: Alfire risponde con un totale contato dall’app, solo sui tuoi numeri.',
    intestazionePer: ['setter', 'closer'],
    novita: [
      {
        per: ['closer'],
        testo: 'Chiedi ad Alfire «quanto mi resta da incassare?»: ti dà il totale delle rate ancora da incassare di tutte le vendite che hai chiuso, contato dall’app e non sommato a mano, e quanto ne è in ritardo, quanto scade nei prossimi 30 giorni e quanto più avanti. Un pagamento non andato a buon fine non conta. Sotto, come prima, le vendite con le loro rate. Solo le tue vendite, mai quelle di un altro closer.',
      },
      {
        per: ['setter'],
        testo: 'Chiedi ad Alfire «quanto hanno pagato i miei clienti questo mese?» (o in qualsiasi periodo): ti dà il totale pagato dai clienti che hai portato, già al netto dei rimborsi, quanti pagamenti, quanti clienti e quanto ti è maturato, contato dall’app come in I miei numeri. Sotto, come prima, ogni pagamento con la sua provvigione. Solo i tuoi clienti, mai quelli di un altro setter.',
      },
      {
        per: ['admin'],
        testo: 'I due totali li conta il database, sempre e solo sui soldi di chi chiede: il da incassare del closer sulle vendite chiuse da lui (diviso come il tuo Da incassare: in ritardo, prossimi 30 giorni, oltre), quanto hanno pagato i clienti del setter nel periodo con la sua provvigione, la stessa di I miei numeri. Alfire risponde con quel totale e non somma più le righe da sé.',
      },
    ],
  },
  {
    versione: '1.20.0',
    data: '2026-10-03',
    titolo: 'Il tempo per task, e Alfire coi tuoi numeri',
    riassunto:
      'Quanto hai dedicato a ogni task lo vedi in Il mio tempo e lo chiedi ad Alfire; chi lavora alle vendite chiede ad Alfire anche i suoi clienti, le sue vendite e la sua giornata, solo i suoi.',
    // the heading speaks of time and of the sales roles' numbers: the other roles read a neutral one
    intestazionePer: ['setter', 'closer'],
    novita: [
      {
        per: ['progetti'],
        testo: 'In Il mio tempo il totale del periodo si divide per progetto e, sotto ogni progetto, per task: quanto hai dedicato alla revisione video, alle call di check, all’assistenza in chat, dal task con più tempo, con il tempo senza task a parte. Conta l’app, ed è sempre e solo il tuo tempo.',
      },
      {
        per: ['progetti'],
        testo: 'Chiedi ad Alfire «quanto ho dedicato alla revisione video di Rossi questo mese?»: trova il progetto del cliente e il task detti a parole tue, come quando registri il tempo, e ti dà il totale contato dall’app, con le voci di quel task. Senza dire un task, «quanto ho fatto questo mese?» ti dà il totale anche task per task. Senza dire il cliente, «quanto ho dedicato alla revisione video questo mese?» ti dà il totale di quel task su tutti i progetti dove c’è con lo stesso nome, contato dall’app, e quanto su ognuno. Se i task hanno nomi diversi, o in un progetto ce ne sono due con lo stesso nome, te li elenca e ti chiede di quale: non ne sceglie mai uno a caso. È sempre il tuo tempo: quello degli altri Alfire non lo legge.',
      },
      {
        per: ['setter'],
        testo: 'Chiedi ad Alfire dei tuoi clienti, come in I miei numeri: «a che punto sono i miei clienti con le rate?», «a che punto è Rossi?», «cosa mi hanno pagato questo mese?». Per ogni cliente che hai portato ti dice la revenue, quanto ha pagato dall’inizio, le rate pagate e in ritardo e quanto ti è maturato; con il nome di un cliente anche ogni rata con la provvigione che ti dà; con un periodo ogni pagamento di quei giorni, con la sua provvigione. E la tua giornata, giorno per giorno: il tuo report accanto a com’è andata con il closer sulle call che hai fissato, e cash e revenue dei tuoi clienti nuovi. Solo i tuoi, mai quelli di un altro setter, e mai i contatti dei clienti.',
      },
      {
        per: ['closer'],
        testo: 'Chiedi ad Alfire delle tue vendite, come in Le mie vendite: «cosa mi resta da incassare?», «quanto deve ancora pagare Rossi?», «che vendite ho chiuso a settembre?». Per ogni vendita che hai chiuso ti dice contratto, incassato, da incassare, se ci sono rate in ritardo e la prossima rata, e le rate ancora da incassare (un pagamento non andato a buon fine a parte); con il nome di un cliente tutte le sue rate. E la tua giornata, giorno per giorno, come in I miei numeri: call svolte, qualificate, no show, follow up, chiuse, cash e revenue dei clienti nuovi. Solo le tue, mai le vendite di un altro closer.',
      },
      {
        per: ['admin'],
        testo: 'Alfire dà a setter e closer i loro soldi esattamente come li vedono nell’app, con gli stessi permessi del database e nessuno nuovo: il setter i clienti che ha portato, quanto hanno pagato e la sua provvigione su ogni incasso (mai la percentuale della sua regola, contatti, metodo o note), il closer le vendite che ha chiuso con incassato, da incassare e le rate; tutti e due la loro giornata. Nella chat vuota il setter trova «A che punto sono i miei clienti con le rate?», il closer «Cosa mi resta da incassare?» e «Com’è andata la mia settimana?».',
      },
      {
        per: ['admin'],
        testo: 'Tu chiudi le call: chiedi ad Alfire anche la tua giornata da closer, come in Setting › Closer con te scelto: call svolte, qualificate, no show, follow up, chiuse, cash e revenue dei clienti nuovi delle vendite chiuse da te, giorno per giorno e in totale con show rate e close rate. Solo la tua: gli altri closer li leggi come prima, call per call e vendita per vendita.',
      },
    ],
    correzioni: [
      {
        per: ['progetti'],
        testo: 'Nella chat vuota di Alfire la domanda sul tuo tempo è ora «Quanto ho lavorato questa settimana?»: chiede la stessa cosa, e Alfire la tratta come una domanda da leggere, quindi risponde più in fretta.',
      },
    ],
  },
  {
    versione: '1.19.0',
    data: '2026-10-03',
    titolo: 'Ognuno registra il suo tempo con Alfire',
    riassunto: 'A voce o per iscritto, anche sui progetti dei clienti: Alfire capisce progetti e task detti a parole tue, dice il giorno col suo nome e fa solo quello che l’app ti permette.',
    intestazionePer: ['tutti'],
    novita: [
      {
        per: ['progetti'],
        testo: 'Chiedi ad Alfire di tenere il tuo tempo come lo diresti a voce: «ho lavorato un’ora e mezza su Sergio Bellini, revisione video», «ieri dalle 9 alle 10:30 call di check con Moretti», «fai partire il timer», «inizia a contare il tempo», «stoppalo», «basta, ho finito». Il progetto di un cliente è il suo nome; il task basta anche detto a parole tue («le call di check», «altre attivita»), e se quel task ce l’hanno tutti i tuoi clienti Alfire te li elenca e ti chiede di quale. Se non dici su cosa, prima te lo chiede, con i tuoi task. Le durate le capisce anche in lettere, come escono dettando: «due ore», «venti minuti», «un’ora e venti», «un paio d’ore», «una ventina di minuti», «tre quarti d’ora», «dalle nove alle dieci e mezza». La scheda di conferma dice «del tuo tempo» e il giorno col suo nome («ieri, venerdì 02/10/2026»), anche quando correggi il giorno di una voce o la scadenza di un task; fermando il timer dice da quanto va (e da quale giorno, se l’hai acceso ieri) e quale nota resta.',
      },
      {
        per: ['progetti'],
        testo: 'Per correggere o eliminare una voce basta dire il task e il giorno, o «quella che ho appena registrato»: Alfire sa quale voce ha appena registrato o fermato. Se le voci sono più di una te le elenca, dall’ultima registrata, con task e orario, e ti chiede quale. Puoi spostarla su un altro task o su un altro progetto, come nel modulo del tempo, anche dicendo solo «era per Tiziano Mele»: la scheda mostra il progetto e il task prima → dopo, e se il task dove finisce è già completato lo dice. Se per una voce dici un progetto o un task che non sono i suoi, Alfire non li ignora: la scheda si ferma prima del tocco e, se vuoi spostarla, la sposta. E se dici dove deve andare («quella di martedì va su Tiziano Mele») e quel giorno non hai voci lì, Alfire ti dice quali voci hai quel giorno e ti propone di spostarla dove hai detto. Il timer acceso non si corregge: prima lo fermi.',
      },
      {
        per: ['progetti'],
        testo: '«Quanto ho fatto questa settimana?»: Alfire sa che giorno è e da quale lunedì parte la settimana, e ti dà il totale giorno per giorno e per progetto, contato dall’app.',
      },
      {
        per: ['progetti'],
        testo: 'Le durate dette a voce valgono anche nel modulo del tempo, con o senza apostrofo e con i numeri in lettere: «un’ora e mezza», «un ora e mezza», «mezz’ora», «mezzora», «2 ore e 30», «due ore», «venti minuti», «un’ora e venti», «un paio d’ore», «una ventina di minuti». «1.30» resta da scrivere come 1:30.',
      },
      {
        per: ['progetti'],
        testo: 'Se lavori solo nei progetti (coach, video editor, nutrizione, sviluppo), la chat vuota di Alfire ti propone le domande sul tuo tempo, come «Quanto tempo ho registrato questa settimana?» e «Avvia il timer su un progetto», e Alfire ti parla dei tuoi progetti, dei tuoi task e del tuo tempo.',
      },
      {
        per: ['progetti'],
        testo: 'Chi gestisce il progetto di un cliente sceglie il coach anche chiedendolo ad Alfire, come con «Scegli il coach»: la scheda dice che il coach entra nel progetto e prende i task ancora liberi, a chi va la programmazione alimentare e che fine fanno i task del coach di prima.',
      },
      {
        per: ['tutti'],
        testo: 'Quando chiedi ad Alfire come funziona l’app, ti risponde sulle parti che usi tu, dal tuo lato.',
      },
      {
        per: ['admin'],
        testo: 'Alfire spiega a ognuno solo la sua parte: coach, video editor, nutrizione e sviluppo leggono la guida dei progetti, di Alfire e dei loro permessi, senza una parola sui soldi; il setter le sue provvigioni dal suo lato, il closer le sue vendite e i suoi incassi; le istruzioni di Alfire su come registrare vendite e incassi vanno solo a te e al closer, che hanno gli strumenti per farlo, e quelle sul margine solo a te. A te dicono anche che il tempo si registra solo per sé e che quello del team lo leggi tu, come in Tempo › Team: «quanto ha fatto Loris questa settimana?» ha la sua risposta.',
      },
    ],
    correzioni: [
      {
        per: ['progetti'],
        testo: 'Correggere o eliminare una voce di tempo con Alfire: con più voci nello stesso giorno ti chiedeva quale, ma le elencava solo con giorno, minuti e progetto, e due voci sembravano uguali; il timer ancora acceso compariva come una voce di 0 minuti, e nel tuo tempo le voci di uno stesso giorno non avevano un ordine. Ora ogni voce dice task e orario, dall’ultima registrata, e il timer acceso si ferma prima di correggerlo.',
      },
      {
        per: ['tutti'],
        testo: 'Una data detta in un altro formato («02/10/2026», «venerdì») non fa più leggere il mese intero al posto del giorno che chiedi, né fa fermare una scrittura con un semplice «Data non valida»: Alfire la riscrive e riprova.',
      },
      {
        per: ['progetti'],
        testo: 'Un progetto detto con un errore («Stefano Moreti», «Belini»): Alfire ti propone i progetti più vicini tra i tuoi, invece di dire solo che non lo trova.',
      },
      {
        per: ['progetti'],
        testo: 'Due clienti con lo stesso nome hanno due progetti con lo stesso nome: Alfire li elencava uguali e non c’era modo di sceglierne uno. Ora li distingue con l’inizio del percorso, «Marco Bianchi (dal 01/09/2026)», e capisce quale scegli.',
      },
      {
        per: ['progetti'],
        testo: 'Se gestisci un progetto e chiedi ad Alfire il tempo di un’altra persona, ti dice che lo trovi nella scheda Tempo del progetto, invece di dirti solo che non lo legge.',
      },
      {
        per: ['progetti'],
        testo: 'Un task che non puoi toccare (né tuo né assegnato a te, o da eliminare senza averlo creato) e la nota di un altro: la scheda di Alfire te lo dice prima del tocco, non più dopo. La scheda di un task dice anche di quale progetto è; un task già completato non si segna di nuovo come fatto (né se ne riapre uno aperto), e se nel progetto due task hanno lo stesso titolo dice se è quello aperto o quello completato.',
      },
      {
        per: ['progetti'],
        testo: '«Ho fatto la revisione video» senza dire quanto tempo: Alfire ti chiede quanto, invece di chiudere il task del cliente, che raccoglie il tempo di tutto il percorso.',
      },
      {
        per: ['progetti'],
        testo: 'Con tanti clienti, l’elenco dei tuoi task e dei progetti che legge Alfire dice quando non li mostra tutti, invece di sembrare completo.',
      },
      {
        per: ['progetti'],
        testo: 'Una fascia che passa la mezzanotte («dalle 23 all’1») ti dice quali due voci registrare senza perdere un minuto: fino a mezzanotte come durata, senza fascia, e il giorno dopo la fascia dalle 00:00. «24:00» non è un orario: fino a mezzanotte si scrive la durata, e una fascia che parte a mezzanotte si scrive dalle 00:00.',
      },
      {
        per: ['tutti'],
        testo: 'Quando la scheda di Alfire si ferma prima del tocco («Non l’ho fatto: …»), il perché è in parole semplici, senza nomi tecnici; poi Alfire ti chiede quello che manca.',
      },
      {
        per: ['progetti'],
        testo: 'Un progetto che non è tra i tuoi e non somiglia a nessuno, come quello di un cliente che non segui: Alfire ti dice che non ne fai parte e che chi lo gestisce può aggiungerti, invece di elencarti i tuoi progetti e chiederti quale.',
      },
      {
        per: ['progetti'],
        testo: 'Chiedere ad Alfire di togliere il progetto a una voce di tempo: ti dice che una voce sta sempre su un progetto e che può solo spostarla, invece di rispondere che non cambia niente.',
      },
      {
        per: ['tutti'],
        testo: 'Quando Alfire non riesce a usare uno strumento, l’esempio che ti propone è del tuo lavoro: al setter, il suo report del giorno; a chi lavora nei progetti, un tempo da registrare.',
      },
    ],
  },
  {
    versione: '1.18.0',
    data: '2026-10-03',
    titolo: 'Al rinnovo i task si riaprono da soli; la matita corregge di nuovo la data di un no show',
    riassunto: 'Quando un cliente rinnova, le attività completate del suo progetto tornano da fare da sole; con la matita il closer e l’admin correggono di nuovo data e ora sbagliate di un no show, che resta un no show.',
    intestazionePer: ['closer', 'progetti'],
    novita: [
      {
        per: ['admin'],
        testo: 'Quando un cliente rinnova (o torna con una vendita nuova), alla prima rata incassata anche i task del suo progetto si riaprono da soli: quelli del modello che il coach aveva completato prima del rinnovo tornano da fare, che il progetto fosse completato, ancora attivo o in pausa (resta in pausa). Restano come sono i task aggiunti dalle persone, i sotto-task, quelli con la scadenza già passata, il tempo registrato e le note. Nel primo percorso non si riaprono mai, nemmeno se annulli e rifai l’incasso della prima rata o allunghi la fine del percorso; nel rinnovo la seconda rata, o la prima incassata di nuovo, non riapre quelli completati durante il rinnovo, e un upsell mai. Lo stesso se dopo l’incasso correggi in rinnovo una vendita salvata come upsell.',
      },
      {
        per: ['progetti'],
        testo: 'Quando un cliente rinnova il percorso, le attività completate del suo progetto (quelle nate col progetto) tornano da fare da sole, con le stesse persone assegnate: si ritrovano in I miei task senza riaprirle a mano, anche se il progetto era ancora attivo o in pausa (resta in pausa). Si riaprono una volta sola, al rinnovo: quelle completate dopo restano completate. I task aggiunti dalle persone, i sotto-task e quelli con la scadenza già passata restano come sono, e il tempo già registrato resta dov’era.',
      },
      {
        per: ['closer'],
        testo: 'La matita corregge di nuovo data e ora di un no show, come per una call svolta: se l’hai segnato al giorno o all’ora sbagliati, li sistemi lì, senza «Spostata dal…», e la call resta un no show nel giorno giusto, dove conta nello show rate. «Sposta» e «Riprogrammata» restano bloccati: un no show non torna da fare in un altro giorno, e per rivedere il lead la nuova call la fissa il setter (o l’admin). Lo stesso da Alfire: la scheda di conferma dice che resta un no show, e se gli chiedi di spostarlo ti ricorda la matita. Il foglio dell’esito ora dice anche questo: data sbagliata con la matita, esito sbagliato da annullare prima.',
      },
      {
        per: ['admin'],
        testo: 'Anche la tua matita corregge di nuovo data e ora di un no show, come per una call svolta: la call resta un no show, senza traccia, e conta nello show rate del giorno corretto. «Sposta» e «Riprogrammata» restano bloccati per tutti, e il setter continua a vedere data e ora in sola lettura, con la sua frase. Lo stesso da Alfire, sempre con la scheda di conferma (prima → dopo, e che resta un no show senza «Spostata dal…»).',
      },
    ],
  },
  {
    versione: '1.17.0',
    data: '2026-10-02',
    titolo: 'Il progetto riapre al rinnovo, il no show resta fermo',
    riassunto: 'Quando un cliente rinnova, il suo progetto completato o archiviato torna tra gli attivi col suo coach e i suoi task; un no show non si sposta più, per nessuno, e resta nello show rate del suo giorno.',
    intestazionePer: ['progetti'],
    intestazioneTeam: {
      titolo: 'Il progetto del cliente riapre al rinnovo',
      riassunto: 'Quando un cliente rinnova, il suo progetto completato o archiviato torna tra gli attivi, col suo coach e i suoi task.',
    },
    novita: [
      {
        per: ['admin'],
        testo: 'Quando un cliente rinnova (o torna con una vendita nuova), alla prima rata incassata il suo progetto torna tra gli attivi, se era completato o archiviato: stesso coach, stessi membri, stessi task (quelli completati restano completati). Un progetto in pausa resta in pausa, la seconda rata non riapre un progetto chiuso di nuovo e un upsell non lo riapre mai. Lo stesso se, dopo l’incasso, correggi in rinnovo una vendita salvata come upsell.',
      },
      {
        per: ['progetti'],
        testo: 'Quando un cliente rinnova il percorso, il suo progetto torna tra gli attivi se era completato o archiviato, con lo stesso coach, gli stessi membri e i suoi task; un progetto in pausa resta in pausa. I task completati restano completati: si riaprono con un tocco, per tornare a registrarci il tempo.',
      },
      {
        per: ['closer'],
        testo: 'Un no show non si sposta più: «Cambia esito» non offre più «Riprogrammata» e nella matita data e ora sono in sola lettura. Il lead non si è presentato e la call resta un no show in quel giorno, così conta nello show rate. Se l’hai segnato per sbaglio, tocca «Annulla l’esito, torna da fare» e poi spostala; per rivedere il lead la nuova call la fissa il setter (o l’admin). Il foglio dell’esito te lo ricorda.',
      },
      {
        per: ['admin'],
        testo: 'Nemmeno tu sposti un no show: niente «Riprogrammata», e la matita (anche la tua) tiene data e ora in sola lettura, così la call resta nel suo giorno e nello show rate. Se l’esito è sbagliato lo annulli prima. La data di una call svolta la matita la corregge ancora.',
      },
      {
        per: ['closer'],
        testo: 'Alfire non sposta un no show, nemmeno correggendo la data: te lo dice prima della scheda di conferma, con come correggere un esito sbagliato e chi fissa la nuova call.',
      },
    ],
    correzioni: [
      {
        per: ['setter'],
        testo: 'Su una call svolta o no show la matita (e Alfire) ora dicono la cosa giusta: la call non si sposta, l’esito sbagliato lo corregge il closer (o l’admin) e per rivedere il lead fissi una nuova call. Prima dicevano che la spostava il closer.',
      },
      {
        per: ['closer'],
        testo: 'Su una call svolta la matita non ti rimanda più a «Sposta», che lì non c’è.',
      },
    ],
  },
  {
    versione: '1.16.0',
    data: '2026-10-02',
    titolo: 'Sposta la call',
    riassunto: 'Le call si spostano con «Sposta»: la stessa call passa a un nuovo giorno e ora, torna da fare e sulla scheda resta «Spostata dal…».',
    intestazionePer: ['setter', 'closer'],
    novita: [
      {
        per: ['closer'],
        testo: 'Sulle call da fare, e su quelle segnate «Riprogrammata», c’è «Sposta», accanto a «Registra esito»: scegli Oggi, Domani, Dopodomani o un giorno e un’ora qualsiasi, da oggi in avanti. La stessa call passa lì e torna da fare, e sulla scheda resta «Spostata dal 30/09 alle 19:00», con quante volte se sono più di una. Una call già fatta non si sposta: se l’esito è sbagliato, annullalo prima.',
      },
      {
        per: ['closer'],
        testo: 'Quando segni «Riprogrammata» ti chiede a quando è stata riprogrammata: la call passa a quel giorno, da fare, e l’esito lo registri lì. Le call segnate «Riprogrammata» prima di oggi sono in cima a Le mie call, in «Da spostare»: con un tocco su «Sposta» prendono la loro nuova data.',
      },
      {
        per: ['closer'],
        testo: 'Una call spostata lascia il giorno vecchio e conta nel nuovo: in Compila la giornata la trovi lì, e i tuoi numeri seguono.',
      },
      {
        per: ['setter'],
        testo: 'Anche tu sposti le tue call ancora da fare con «Sposta», da oggi in avanti: la scheda dice «Spostata dal…». Il giorno in cui l’hai fissata non cambia, quindi le tue call prenotate restano dove sono. Una call che ha già un esito, o segnata «Riprogrammata», la sposta il closer: la matita ne corregge solo le tue note.',
      },
      {
        per: ['admin'],
        testo: 'Sposti ogni call che non è stata fatta, anche in un giorno passato per registrare uno spostamento già avvenuto; una call svolta non si sposta, se l’esito è sbagliato lo annulli prima. La matita corregge ancora data e ora sbagliate senza lasciare traccia.',
      },
      {
        per: ['setter', 'closer'],
        testo: 'Alfire sposta una call quando glielo chiedi («sposta la call di Andrea a venerdì alle 18», «è stata riprogrammata a domani»): la scheda di conferma dice da quando a quando.',
      },
    ],
  },
  {
    versione: '1.15.0',
    data: '2026-10-02',
    titolo: 'Un progetto per ogni cliente',
    riassunto: 'Alla prima rata incassata ogni cliente ha il suo progetto in Fitness Coaching, con gli 8 task del coach e le date del suo percorso; il coach lo scegli con un tocco.',
    intestazionePer: ['progetti'],
    intestazioneTeam: {
      titolo: 'Un progetto per ogni cliente',
      riassunto: 'Ogni cliente che inizia il percorso ha il suo progetto, con i task del coach su cui registrare il tempo.',
    },
    novita: [
      {
        per: ['progetti'],
        testo: 'Ogni cliente che inizia il percorso ha il suo progetto con i task del coach: call di onboarding, analisi e strategia iniziale, programmazione allenamento, programmazione alimentare, revisione video, call di check, assistenza chat e altre attività. Sono aperti per tutto il percorso, senza scadenze: ci registri il tempo.',
      },
      {
        per: ['progetti'],
        testo: 'Chi gestisce il progetto di un cliente sceglie il coach con un tocco: il coach entra nel progetto e prende i task ancora senza nessuno (cambiando coach, anche quelli del coach di prima), mentre la programmazione alimentare va a chi si occupa di nutrizione, se c’è; i task a cui lavorano altre persone restano a loro. Nell’elenco dei progetti si vede quali sono ancora «Senza coach».',
      },
      {
        per: ['admin'],
        testo: 'Quando incassi la prima rata di una vendita nuova o di un rinnovo, il progetto del cliente nasce da solo in Fitness Coaching, col suo nome e senza membri: tu scegli il coach. Un upsell non apre mai un progetto. Se correggi dopo l’incasso una vendita registrata male (un upsell che era una vendita nuova, date sbagliate), il progetto nasce in quel momento. I clienti con un percorso pagato in corso lo hanno già.',
      },
      {
        per: ['admin'],
        testo: 'Le date del progetto sono quelle del percorso del cliente: un rinnovo lo allunga, «Interrompi il percorso» lo accorcia, una vendita eliminata lo riporta indietro. Il progetto prende anche il nuovo nome del cliente, se lo cambi. Dalla scheda del cliente apri il suo progetto, e dal progetto torni alla scheda.',
      },
      {
        per: ['admin'],
        testo: 'In Impostazioni › Progetti il modello «Percorso cliente» è quello dei nuovi clienti: lì cambi le sue attività senza toccare il codice. Il modello resta attivo finché è quello dei nuovi clienti, e se non ce n’è nessuno la pagina lo dice. Un’attività ora può stare fuori dalle liste, non avere date e andare a chi si occupa di nutrizione.',
      },
      {
        per: ['closer'],
        testo: 'Nella nuova vendita l’inizio del percorso è proposto una settimana dopo la data di vendita, come succede di solito: controllalo e cambialo se serve.',
      },
    ],
  },
  {
    versione: '1.14.0',
    data: '2026-09-30',
    titolo: 'Alfire legge il tempo del team',
    riassunto: 'Chiedi ad Alfire quanto tempo ha registrato una persona e su cosa, come in Tempo › Team; e non scambia più i tuoi dati per quelli di un altro.',
    intestazionePer: ['admin'],
    novita: [
      {
        per: ['admin'],
        testo: 'Chiedi ad Alfire «quanto tempo ha tracciato Loris negli ultimi 7 giorni, e su cosa?»: legge il tempo già dichiarato, come Tempo › Team, con il totale, i progetti, i task e le ultime voci. Per una persona o per tutti, per un progetto, per un periodo o per gli ultimi giorni.',
      },
      {
        per: ['admin'],
        testo: 'Gli stessi limiti della pagina: mai il timer acceso di qualcuno, compare solo chi ha registrato qualcosa nel periodo, in ordine alfabetico, nessuna classifica. Se un nome vale per più persone, Alfire ti chiede quale.',
      },
    ],
    correzioni: [
      {
        per: ['tutti'],
        testo: 'Alfire non dà più i tuoi dati per quelli di un altro: chiedendo il tempo di Loris aveva risposto con le tue 2 ore. Ora ogni lettura dei tuoi numeri, task e tempo dice di chi sono, e se nessuno strumento legge un’altra persona Alfire te lo dice e ti indica la pagina.',
        testoTeam: 'Alfire non scambia più le persone: i tuoi numeri, i tuoi task e il tuo tempo restano tuoi e non li dà mai per quelli di un collega. Se chiedi di qualcuno che non può leggere, te lo dice.',
      },
      {
        per: ['setter', 'closer'],
        testo: 'Le call che Alfire legge per il setter sono quelle fissate da lui, e per il closer quelle assegnate a lui: ora lo sa, e chiedendo le call di un collega non le dà più per tutte le sue.',
        testoTeam: 'Le call che Alfire legge per te sono solo le tue (fissate da te, o assegnate a te): chiedendo le call di un collega non le dà più per tutte le sue, e ti dice che vede solo quelle in comune.',
      },
      {
        per: ['progetti'],
        testo: 'Chiedendo ad Alfire il tuo tempo hai il totale e le ore per progetto come in Il mio tempo, anche con tante voci: prima le sommava da solo, e oltre 40 voci ne contava solo una parte. Nei tuoi task ora dice anche il nome del progetto.',
      },
      {
        per: ['admin'],
        testo: 'Nelle call, nelle vendite e nei clienti che legge Alfire c’è chi ha fissato la call o portato il cliente e chi ha chiuso: «quanti clienti ha portato Loris?» non conta più anche quelli che hai portato tu. Un elenco troppo lungo ora lo dice, invece di contarne solo una parte.',
      },
    ],
  },
  {
    versione: '1.13.0',
    data: '2026-09-30',
    titolo: 'Allegati in Alfire',
    riassunto: 'Con la graffetta alleghi PDF, foto, Word, Excel e CSV, e Alfire li legge per risponderti.',
    intestazionePer: ['tutti'],
    novita: [
      {
        per: ['tutti'],
        testo: 'In Alfire, accanto al microfono, c’è la graffetta: alleghi fino a 3 file per messaggio (PDF, foto e screenshot, Word, Excel, CSV, fino a 4 MB l’uno) e chiedi cosa c’è dentro. Se chiedi di registrare qualcosa, passa sempre dalla scheda di conferma.',
      },
      {
        per: ['tutti'],
        testo: 'Foto e documenti scansionati li legge un secondo modello open source, che ne trascrive il testo e descrive l’immagine. Dal telefono puoi anche scattare la foto al momento.',
      },
      {
        per: ['tutti'],
        testo: 'I file non si salvano da nessuna parte: vanno a Groq solo per essere letti e restano nella chat aperta finché non la chiudi. Lo trovi scritto in Profilo › Alfire.',
      },
      {
        per: ['tutti'],
        testo: 'Quello che c’è scritto in un file, per Alfire, è un dato da leggere e mai un ordine: fa solo quello che chiedi tu.',
      },
      {
        per: ['admin'],
        testo: 'Una ricevuta in foto o un piano di rate in PDF si registrano in chat: Alfire li legge e prepara la scheda con i dati, tu confermi.',
      },
      {
        per: ['admin'],
        testo: 'Il modello che legge foto e scansioni si sceglie su Vercel con ALFIRE_MODEL_VISIONE (di serie Qwen 3.8 su Groq, ancora in anteprima), e con «off» si spegne: PDF con testo, Word, Excel e CSV si leggono lo stesso.',
      },
    ],
  },
  {
    versione: '1.12.0',
    data: '2026-09-30',
    titolo: 'Il changelog per tutto il team',
    riassunto: 'Le novità si aprono da «Altro» e dal profilo, e ognuno legge solo quelle del suo lavoro.',
    intestazionePer: ['tutti'],
    novita: [
      {
        per: ['tutti'],
        testo: 'Le novità sono per tutto il team: si aprono da «Altro» (sul computer, dalla barra laterale) e dal profilo, e ognuno legge solo quelle che riguardano il suo lavoro. In cima, per tutti, la versione in uso.',
      },
      {
        per: ['admin'],
        testo: 'Tu le vedi tutte, e accanto a ogni voce per chi è: setter, closer, area Progetti o tutto il team. Restano anche in Impostazioni.',
      },
      {
        per: ['admin'],
        testo: 'Al team non arriva niente su soldi dei clienti, costi, margine e provvigioni degli altri: il setter legge le novità dei suoi numeri, dei suoi clienti e delle sue provvigioni, il closer quelle delle sue call e delle sue vendite.',
      },
      {
        per: ['admin'],
        testo: 'Quando il titolo di una versione parla dei tuoi numeri, il team ne legge uno scritto per lui, oppure soltanto numero, data e quante novità ci sono per lui.',
      },
    ],
  },
  {
    versione: '1.11.0',
    data: '2026-09-30',
    titolo: 'Changelog e numero di versione',
    riassunto: 'La Dashboard ha un numero di versione e questa pagina, che racconta cosa cambia a ogni aggiornamento.',
    intestazionePer: ['tutti'],
    novita: [
      { per: ['admin'], testo: 'Changelog, da Impostazioni: ogni versione con data, novità, correzioni e per chi è, dalla più recente.' },
      { per: ['admin'], testo: 'Il numero della versione in uso compare in Impostazioni, sulla voce Changelog.' },
      {
        per: ['tutti'],
        testo: 'Regola delle versioni: 1.0.0 è il primo giorno in produzione con i dati veri; un aggiornamento che aggiunge funzioni alza il numero di mezzo, uno che corregge soltanto alza l’ultimo.',
      },
      { per: ['tutti'], testo: 'Da qui in avanti ogni aggiornamento pubblicato aggiunge la sua voce.' },
    ],
  },
  {
    versione: '1.10.0',
    data: '2026-09-30',
    titolo: 'L’esito della call lo registra il closer',
    riassunto: 'Stato ed esito di una call li scrivono solo il closer e tu; setter e closer hanno ognuno le proprie note.',
    intestazionePer: ['setter', 'closer'],
    intestazioneTeam: {
      titolo: 'L’esito della call lo registra il closer',
      riassunto: 'Stato ed esito di una call li scrivono solo il closer e l’admin; setter e closer hanno ognuno le proprie note.',
    },
    novita: [
      {
        per: ['setter', 'closer'],
        testo: 'Stato, esito, qualificata e motivo di non chiusura li registrano solo il closer della call e tu. Il setter li legge, e il database rifiuta ogni sua modifica.',
        testoTeam: 'Stato, esito, qualificata e motivo di non chiusura li registrano solo il closer della call e l’admin. Il setter li legge.',
      },
      {
        per: ['setter', 'closer'],
        testo: 'Due note separate su ogni call: «Note del setter» e «Note aggiuntive» del closer. Ognuno scrive le sue e legge quelle dell’altro, tu le scrivi entrambe; il closer scrive le sue dalla scheda dell’esito, dalla matita o da Alfire.',
        testoTeam: 'Due note separate su ogni call: «Note del setter» e «Note aggiuntive» del closer. Ognuno scrive le sue e legge quelle dell’altro; il closer scrive le sue dalla scheda dell’esito, dalla matita o da Alfire.',
      },
      { per: ['admin'], testo: 'Le 51 «Note aggiuntive» importate dal tuo foglio delle call passano nelle note del closer.' },
      { per: ['admin'], testo: 'In Setting, «Dalle call» mostra accanto al motivo le «Note aggiuntive» del closer, mai le note del setter.' },
    ],
    correzioni: [{ per: ['closer'], testo: 'La scheda della call del closer (la matita) si apre sempre sui valori salvati.' }],
  },
  {
    versione: '1.9.0',
    data: '2026-09-30',
    titolo: 'Il setter vede perché le sue call non hanno chiuso',
    riassunto: 'Sulle call che ha fissato, il setter legge il motivo di non chiusura scritto dal closer, così impara cosa frena i suoi lead.',
    intestazionePer: ['setter', 'closer'],
    novita: [
      {
        per: ['setter', 'closer'],
        testo: 'Il motivo di non chiusura compare nella scheda della call del setter e nelle risposte di Alfire sulle sue call.',
      },
      {
        per: ['setter', 'closer'],
        testo: 'Lo scrivono solo il closer e tu: il database rifiuta un setter che prova a scriverlo o a cambiarlo.',
        testoTeam: 'Lo scrivono solo il closer della call e l’admin; il setter lo legge.',
      },
    ],
  },
  {
    versione: '1.8.0',
    data: '2026-09-30',
    titolo: 'Feedback guidato nel report del setter',
    riassunto: 'Il setter dice com’erano i lead della giornata e il closer perché una call non ha chiuso: lo leggi in Setting, per il marketing.',
    intestazionePer: ['setter', 'closer'],
    intestazioneTeam: {
      titolo: 'Feedback guidato nel report del setter',
      riassunto: 'Il setter dice com’erano i lead della giornata e il closer perché una call non ha chiuso, per capire cosa migliorare nel marketing.',
    },
    novita: [
      {
        per: ['setter'],
        testo: 'Nel report del setter, sotto le conversazioni, nel blocco «Com’è andata la giornata», due scale: lead in target (quasi tutti, circa metà, pochi) e qualità delle conversazioni (buone, medie, scarse), ogni opzione con il suo significato sullo schermo.',
      },
      { per: ['setter'], testo: 'Due campi liberi, «Cosa frenava i lead» e «Domande e contenuti», oltre ad «Altre note».' },
      {
        per: ['setter'],
        testo: 'Nei giorni con attività le due scale sono obbligatorie: il report si salva comunque da solo e solo il setter vede «Da completare» (dai report del 30/09/2026). Per te nessun elenco e nessun avviso su chi non compila.',
        testoTeam: 'Nei giorni con attività le due scale sono obbligatorie: il report si salva comunque da solo, e «Da completare» lo vede solo il setter (dai report del 30/09/2026). All’admin nessun elenco e nessun avviso su chi non compila.',
      },
      {
        per: ['closer'],
        testo: 'Una call svolta che finisce in follow up o persa chiede il motivo di non chiusura, nella scheda dell’esito e in Alfire. Le call già registrate restano valide.',
      },
      {
        per: ['setter', 'closer'],
        testo: 'Setting: nuovo blocco «Per il marketing: cosa dicono i lead», dai report del setter e dalle call. Alfire lo legge per te.',
        testoTeam: 'Le scale e i campi del report del setter e i motivi di non chiusura del closer l’admin li legge insieme, per il marketing.',
      },
    ],
  },
  {
    versione: '1.7.0',
    data: '2026-09-30',
    titolo: 'Tempo del team e fascia «Dalle–Alle»',
    riassunto: 'Vedi il tempo dichiarato dal team persona per persona, e il tempo caricato dopo può essere una fascia oraria invece della durata.',
    intestazionePer: ['progetti'],
    intestazioneTeam: {
      titolo: 'La fascia «Dalle–Alle» nel tempo',
      riassunto: 'Il tempo caricato dopo può essere una fascia oraria invece della durata.',
    },
    novita: [
      {
        per: ['admin'],
        testo: 'Tempo › Team, solo per te: periodo (di base il mese in corso), filtri per persona e per progetto, il totale del team e una scheda per persona con progetti, task e voci del periodo.',
      },
      {
        per: ['progetti'],
        testo: 'Solo il tempo già dichiarato, persone in ordine alfabetico: nessun timer acceso di altri, nessuna classifica, nessun elenco di chi non ha registrato.',
        testoTeam: 'L’admin vede il tempo che ognuno ha già dichiarato, per progetto e task: mai un timer acceso, nessuna classifica, nessun elenco di chi non ha registrato.',
      },
      {
        per: ['progetti'],
        testo: 'Il tempo caricato dopo può essere una fascia «Dalle–Alle»: i minuti li calcola il database, cambio dell’ora compreso. Vale in Tempo, nella scheda Tempo del progetto, correggendo una voce e da Alfire.',
      },
      { per: ['progetti'], testo: 'Una fascia si aggiunge, si cambia o si toglie; i timer fermati mostrano la loro fascia vera.' },
    ],
    correzioni: [
      { per: ['progetti'], testo: 'Il timer lo decide l’orologio: parte adesso, il suo inizio non si sposta e si ferma quando lo fermi.' },
    ],
  },
  {
    versione: '1.6.0',
    data: '2026-09-29',
    titolo: 'Alfire: risposte a un tocco e testo in diretta',
    riassunto: 'Alfire propone le risposte come bottoni e, mentre detti, scrive il testo nella casella in diretta.',
    intestazionePer: ['tutti'],
    novita: [
      {
        per: ['tutti'],
        testo: 'Quando Alfire fa una domanda chiusa (quale cliente, quale rata, sì o no) le opzioni diventano bottoni; dopo una risposta propone al massimo 3 domande successive, solo se utili.',
        testoTeam: 'Quando Alfire fa una domanda chiusa (quale task, quale giorno, sì o no) le opzioni diventano bottoni; dopo una risposta propone al massimo 3 domande successive, solo se utili.',
      },
      {
        per: ['tutti'],
        testo: 'Un tocco manda l’opzione come tuo messaggio, e puoi sempre scrivere o dettare altro. Un tocco non scrive mai dati: ogni scrittura passa dalla sua scheda e da «Conferma».',
      },
      {
        per: ['tutti'],
        testo: 'Mentre detti, circa ogni 2 secondi il testo compare nella casella in grigio; allo stop la trascrizione completa lo sostituisce, e la mandi con Invio.',
      },
      {
        per: ['tutti'],
        testo: 'Un solo vocale alla volta. Se il testo in diretta si ferma per i limiti di Groq la chat lo dice, e il testo arriva tutto allo stop.',
      },
      {
        per: ['tutti'],
        testo: 'Sul piano gratuito di Groq il testo in diretta si spegne da solo, per non consumare i minuti di audio del team.',
      },
    ],
  },
  {
    versione: '1.5.0',
    data: '2026-09-29',
    titolo: 'Alfire modifica tutto quello che modifichi nell’app',
    riassunto: 'Dalla chat crei, correggi ed elimini ogni dato, sempre con la scheda di conferma; setter e closer fanno solo quello che l’app permette loro.',
    intestazionePer: ['tutti'],
    intestazioneTeam: {
      titolo: 'Alfire modifica tutto quello che modifichi nell’app',
      riassunto: 'Dalla chat fai quello che l’app ti permette di fare, sempre con la scheda di conferma.',
    },
    novita: [
      {
        per: ['tutti'],
        testo: 'Uno strumento per ogni cosa: clienti, vendite, rate, costi, pagamenti e regole delle provvigioni, obiettivi del mese, prodotti, call, lead, report del setter, progetti, liste, task, note e tempo.',
        testoTeam: 'Uno strumento per ogni cosa che fai nell’app, dalle call ai task e al tempo: Alfire riceve solo quelli del tuo ruolo.',
      },
      { per: ['closer'], testo: 'Registra una vendita anche dalla call chiusa da cui nasce.' },
      {
        per: ['tutti'],
        testo: 'Ogni scrittura passa dalle stesse regole dei moduli dell’app, con la sessione di chi chatta, e aspetta il tocco su «Conferma».',
      },
      {
        per: ['tutti'],
        testo: 'Dici nomi, non codici («la rata di marzo di Rossi»): se un nome vale per più righe Alfire chiede quale, non sceglie mai a caso.',
        testoTeam: 'Dici nomi, non codici («il task del montaggio di lunedì»): se un nome vale per più righe Alfire chiede quale, non sceglie mai a caso.',
      },
      {
        per: ['tutti'],
        testo: 'La scheda di conferma legge prima la riga vera: prima → dopo per le correzioni e, per le eliminazioni, cosa si porta dietro. «Elimina» resta spento finché le conseguenze non sono contate.',
      },
      { per: ['admin'], testo: 'Team, esportazioni e backup restano fuori dalla chat.' },
    ],
  },
  {
    versione: '1.4.0',
    data: '2026-09-29',
    titolo: 'Alfire si adatta al piano di Groq',
    riassunto: 'Con il piano Developer di Groq Alfire lavora da agente pieno, e se ne accorge da solo.',
    intestazionePer: ['tutti'],
    novita: [
      {
        per: ['tutti'],
        testo: 'Alfire capisce da solo quando passi al piano Developer di Groq e lavora da agente pieno: tutti gli strumenti del tuo ruolo, più messaggi ricordati, più passi, risposte più lunghe. Niente da cambiare su Vercel.',
        testoTeam: 'Con il piano Developer di Groq Alfire lavora da agente pieno: tutti gli strumenti del tuo ruolo, più messaggi ricordati, più passi, risposte più lunghe.',
      },
      { per: ['admin'], testo: 'Se serve, il piano si può forzare da Vercel.' },
      { per: ['tutti'], testo: 'Per ogni risposta resta traccia di quanto ha consumato, mai del contenuto della chat.' },
    ],
    correzioni: [
      {
        per: ['tutti'],
        testo: 'Un seguito come «ci sei?» non toglie più ad Alfire gli strumenti per scrivere: restano per tutta la conversazione che ha chiesto di scrivere.',
      },
      { per: ['tutti'], testo: 'Una chiamata a uno strumento che Groq rifiuta si riprova da sola due volte.' },
      { per: ['tutti'], testo: 'Se Alfire legge e si ferma senza rispondere, la chat lo dice e offre «Riprova».' },
    ],
  },
  {
    versione: '1.3.0',
    data: '2026-09-29',
    titolo: 'Cash in 4 parti, rinnovi e giornata del closer',
    riassunto: 'Il cash si divide in nuovi clienti, rate di clienti già entrati, rinnovi e upsell; il rinnovo si registra dalla scheda del cliente e la giornata del closer si compila dalle call.',
    intestazionePer: ['setter', 'closer'],
    intestazioneTeam: {
      titolo: 'Le giornate di setter e closer',
      riassunto: 'La giornata del closer si compila dagli esiti delle call, e cash e revenue delle giornate contano solo i clienti nuovi.',
    },
    novita: [
      {
        per: ['admin'],
        testo: 'Panoramica: sotto il cash, «Di cui» in 4 parti che sommano sempre al totale: nuovi clienti del periodo, rate di clienti già entrati, rinnovi, upsell. Il grafico dei 12 mesi ha le stesse 4 serie.',
      },
      {
        per: ['admin'],
        testo: 'Cash e revenue per DM, cash per call svolta, valore medio nuovo cliente e «Da dove arrivano i nuovi clienti» contano solo i nuovi clienti del periodo.',
      },
      {
        per: ['admin'],
        testo: 'Scheda cliente: «Storico percorsi», una scheda per vendita (primo percorso, rinnovo 1, 2…, upsell) con date, stato, incassato, da incassare e le rate da segnare incassate.',
      },
      {
        per: ['admin'],
        testo: '«Ha rinnovato» apre il rinnovo che parte dal giorno dopo la fine del percorso precedente (o da oggi, se è finito da più di un mese), con lo stesso prodotto se è ancora in vendita; prodotto e prezzo si cambiano, e il percorso vecchio resta nello storico. «Registra rinnovo», in Panoramica e in Rinnovi, apre lo stesso rinnovo.',
      },
      {
        per: ['setter'],
        testo: 'Anche tu fissi le call, per te o per un setter, comprese quelle già fatte che nell’app mancano, fino a un anno indietro.',
        testoTeam: 'L’admin può fissare una call a nome di un setter, anche una già fatta che mancava nell’app: compare tra le sue call e conta nei suoi numeri del giorno in cui si è tenuta.',
      },
      {
        per: ['closer'],
        testo: '«Compila la giornata» in Setting › Closer: le call del giorno con i bottoni dell’esito, e la riga del giorno si riempie da sola; tu, con «Aggiungi una call», registri una call fatta che nell’app manca.',
        testoTeam: '«Compila la giornata», da «I miei numeri»: le call del giorno con i bottoni dell’esito, e la riga del giorno si riempie da sola.',
      },
      {
        per: ['setter', 'closer'],
        testo: 'Giornata del closer e del setter: cash e revenue solo dei clienti nuovi; il cash è la prima rata incassata, sul giorno della vendita.',
      },
      {
        per: ['setter'],
        testo: 'Rinnovi e upsell nascono senza setter, se non vengono da una call fissata: su di loro niente provvigione. Le vendite già registrate non cambiano.',
      },
      {
        per: ['setter', 'closer'],
        testo: 'Il report del setter non chiede più discovery svolte e call qualificate: le registra il closer su ogni call.',
      },
      { per: ['admin'], testo: 'Incassi e riepilogo serale dicono il percorso e la rata («Rinnovo · Rata 2 di 2»).' },
    ],
    correzioni: [
      { per: ['setter'], testo: 'Una call registrata dopo che si è tenuta conta come prenotata nel giorno in cui si è tenuta.' },
      { per: ['closer'], testo: 'Una vendita nata da una call chiusa prende la data della call.' },
      { per: ['admin'], testo: 'Nelle metriche per fonte, i clienti senza fonte contano in «altro».' },
    ],
  },
  {
    versione: '1.2.0',
    data: '2026-09-29',
    titolo: 'Setter e closer giorno per giorno',
    riassunto: 'Setting si divide in Setter e Closer, come le due metà del tuo Excel, e ogni numero spiega cosa conta.',
    intestazionePer: ['setter', 'closer'],
    intestazioneTeam: {
      titolo: 'Setter e closer giorno per giorno',
      riassunto: 'I numeri di setter e closer giorno per giorno, come le due metà del foglio Excel, e ogni numero spiega cosa conta.',
    },
    novita: [
      {
        per: ['admin'],
        testo: 'Setting con due schede, Setter e Closer, giorno per giorno. La metà del closer si calcola dalle call e dalle vendite, mai inserita due volte.',
      },
      { per: ['admin'], testo: 'Sei «Admin · Closer»: la scheda Closer mostra i tuoi numeri.' },
      { per: ['closer'], testo: 'Il closer ha «I miei numeri» nel menu: la sua giornata, giorno per giorno.' },
      {
        per: ['setter'],
        testo: 'I miei numeri del setter: «Giorno per giorno», il suo setting accanto agli esiti delle call che ha fissato.',
      },
      {
        per: ['setter'],
        testo: 'I DM totali ora contano anche i follow up: outbound + inbound + follow up (prima solo outbound + inbound); le conversazioni non ci entrano. Cambiano di conseguenza tasso di conversazione e DM per call prenotata.',
      },
      { per: ['setter'], testo: 'Le call prenotate si dividono per fonte del lead (inbound, outbound), nel giorno in cui sono fissate.' },
      { per: ['setter', 'closer'], testo: 'Ogni numero ha la sua spiegazione, in una legenda per sezione.' },
      { per: ['setter'], testo: 'Il setter fissa solo discovery call; le strategy restano nello storico.' },
      { per: ['setter', 'closer'], testo: '«Oggi» tra i periodi rapidi, al posto di «Ultimi 30 giorni».' },
      { per: ['setter'], testo: 'Il setter vede se una sua vendita gli fa maturare provvigione.' },
      { per: ['progetti'], testo: 'Progetti: un task può avere più assegnatari, tutti membri del progetto.' },
    ],
  },
  {
    versione: '1.1.2',
    data: '2026-09-29',
    titolo: 'Alfire dice perché non risponde',
    riassunto: 'Alfire spiega ogni errore e sta nei limiti del piano gratuito di Groq.',
    intestazionePer: ['tutti'],
    novita: [],
    correzioni: [
      {
        per: ['tutti'],
        testo: 'Al posto del generico «Alfire non ha risposto», il motivo vero: limite del minuto (con l’attesa), limite del giorno, richiesta troppo lunga, chiave sbagliata, modello non disponibile, Groq fermo.',
      },
      {
        per: ['admin'],
        testo: 'Richieste più leggere: una domanda che legge soltanto parte senza gli strumenti di scrittura, circa metà dei token, così le letture stanno nel limite al minuto del piano gratuito.',
      },
      { per: ['tutti'], testo: 'Il vocale finisce nella casella: lo rileggi, lo correggi e lo mandi con Invio.' },
    ],
  },
  {
    versione: '1.1.1',
    data: '2026-09-28',
    titolo: 'Accesso con Google sul nuovo dominio',
    riassunto: 'Il login con Google funziona su dashboard.percorsoalpha.com, anche con una sessione vecchia nel browser.',
    intestazionePer: ['tutti'],
    novita: [],
    correzioni: [
      {
        per: ['tutti'],
        testo: 'Nessuno riusciva a entrare su dashboard.percorsoalpha.com: il ritorno da Google finiva sul vecchio indirizzo vercel.app e il codice di accesso si perdeva. Ora l’accesso si completa comunque.',
      },
      { per: ['tutti'], testo: 'Una sessione scaduta rimasta nel browser non blocca più il login con Google.' },
      { per: ['tutti'], testo: 'Un ritorno da Google fallito o vecchio non fa mai uscire chi è già dentro.' },
    ],
  },
  {
    versione: '1.1.0',
    data: '2026-09-27',
    titolo: 'Rinnovi, previsione di cassa e i clienti del setter',
    riassunto: 'Una pagina per i rinnovi, la cassa dei prossimi mesi, gli obiettivi del mese, i promemoria su WhatsApp, e il setter vede quanto hanno pagato i clienti che ha portato.',
    intestazionePer: ['setter'],
    intestazioneTeam: {
      titolo: 'I clienti del setter',
      riassunto: 'Il setter vede quanto hanno pagato i clienti che ha portato e la provvigione di ogni incasso.',
    },
    novita: [
      {
        per: ['admin'],
        testo: 'Rinnovi: chi finisce il percorso entro 30 o 60 giorni e chi l’ha finito da meno di 90 senza rinnovare, con WhatsApp e «Registra rinnovo»; in cima il tasso di rinnovo del mese.',
      },
      {
        per: ['admin'],
        testo: 'Incassi: previsione di cassa del mese e dei due successivi; «Scrivi su WhatsApp» apre la chat del cliente con il promemoria già scritto.',
      },
      {
        per: ['admin'],
        testo: 'Panoramica: obiettivi del mese (cash e nuovi clienti) con l’avanzamento, e da quale fonte arrivano i soldi, con la quota di ciascuna.',
      },
      {
        per: ['admin'],
        testo: 'Riepilogo serale via email agli admin: cash del giorno, incassi, vendite, rate in ritardo e totali del team, mai i nomi di chi ha compilato; il lunedì con il backup.',
      },
      {
        per: ['setter'],
        testo: 'I miei numeri del setter: «I tuoi clienti», quanto hanno pagato, in quante rate e la provvigione di ogni incasso.',
      },
      { per: ['admin'], testo: 'Provvigioni: la parte del setter cliente per cliente, anche nella scheda della vendita.' },
      {
        per: ['setter'],
        testo: 'Setting: «Aggiungi giornata» per un setter o per te; un giorno che c’è già si corregge dalla sua riga.',
        testoTeam: 'L’admin può aggiungere o correggere un giorno del report del setter; un giorno che c’è già si corregge dalla sua riga.',
      },
      {
        per: ['admin'],
        testo: 'Scheda cliente: «Interrompi il percorso» per chi smette prima, con l’anteprima di cosa cambia; gli incassi non si toccano.',
      },
      { per: ['tutti'], testo: 'Tutorial interattivo: si tocca il link vero e il tour continua dentro la pagina.' },
    ],
    correzioni: [
      {
        per: ['admin'],
        testo: 'Puoi essere tu il setter di una vendita o di un cliente, quando il cliente l’hai portato tu: su quella vendita non matura provvigione.',
      },
      {
        per: ['tutti'],
        testo: 'Revisione grafica: Incassi più leggibile sul telefono, top bar con logo, timer, Alfire e profilo.',
        testoTeam: 'Revisione grafica: top bar con logo, timer, Alfire e profilo.',
      },
    ],
  },
  {
    versione: '1.0.0',
    data: '2026-09-27',
    titolo: 'In produzione con i dati veri',
    riassunto: 'Alpha Management va online con lo storico dell’Excel e il tuo foglio delle call: da qui si lavora sui dati veri.',
    intestazionePer: ['tutti'],
    intestazioneTeam: {
      titolo: 'In produzione con i dati veri',
      riassunto: 'Alpha Management va online: da qui si lavora sui dati veri.',
    },
    novita: [
      {
        per: ['tutti'],
        testo: 'Online su Vercel, con i server a Francoforte, vicino al database; in giornata il nome Alpha Management e il dominio dashboard.percorsoalpha.com.',
      },
      {
        per: ['setter'],
        testo: 'Storico importato: dall’Excel i report del setter di luglio e agosto, le vendite di luglio, i pagamenti e la regola del 5% di Loris; dal tuo foglio delle call lead e call con esito, performance e importo proposto.',
        testoTeam: 'Storico importato dall’Excel: i report di setting di luglio e agosto.',
      },
      {
        per: ['closer'],
        testo: 'Vendite: prodotti personalizzati e piani rate scritti a mano; le rate si aggiungono e si tolgono.',
        testoTeam: 'Nuova vendita: un percorso fuori catalogo e un piano rate scritto a mano, rata per rata.',
      },
      {
        per: ['setter', 'closer'],
        testo: 'Ogni numero di Panoramica, Vendite, Incassi, Costi e Setting anche su un periodo a scelta, non solo sul mese.',
        testoTeam: 'I tuoi numeri anche su un periodo a scelta, non solo sul mese.',
      },
      { per: ['admin'], testo: 'Team: inviti via email con il logo; eliminare una persona o unirla a un altro profilo.' },
      {
        per: ['admin'],
        testo: 'Pieno controllo: ogni dato si corregge e si elimina, dopo una domanda che dice cosa si porta dietro.',
      },
      {
        per: ['progetti'],
        testo: 'Progetti e tempo: reparti, progetti da modelli, task, Gantt, note, timer con la sveglia e I miei task. Il timer acceso lo vede solo chi l’ha avviato.',
      },
      { per: ['tutti'], testo: 'Alfire, l’assistente AI in chat e a voce, e il profilo con la foto.' },
      {
        per: ['tutti'],
        testo: 'Tutorial al primo accesso, backup settimanale via email e app installabile su iPhone e Android.',
        testoTeam: 'Tutorial al primo accesso e app installabile su iPhone e Android.',
      },
    ],
    correzioni: [
      { per: ['tutti'], testo: 'Un login fallito non dice più «non sei invitato»: lo dice solo a chi non ha l’invito.' },
    ],
  },
  {
    versione: '0.3.0',
    data: '2026-09-27',
    titolo: 'Dashboard, team e impostazioni',
    riassunto: 'I numeri del mese calcolati nel database, la Panoramica in tempo reale e la gestione del team.',
    intestazionePer: ['admin'],
    novita: [
      { per: ['admin'], testo: 'Tutte le metriche calcolate nel database, verificate su un mese costruito a mano.' },
      {
        per: ['admin'],
        testo: 'Panoramica in tempo reale: cinque numeri con il confronto sul mese prima, cash dei 12 mesi, funnel, da incassare e clienti in scadenza.',
      },
      {
        per: ['setter'],
        testo: 'Incassi, Setting, Provvigioni (maturato, pagato, saldo) e I miei numeri del setter.',
        testoTeam: '«I miei numeri» del setter: le metriche del periodo e le provvigioni maturate e pagate.',
      },
      {
        per: ['admin'],
        testo: 'Team (inviti, ruoli, disattivazione), regole provvigionali, CSV per la commercialista e registro delle modifiche.',
      },
      {
        per: ['setter', 'closer'],
        testo: 'Ogni dato inserito resta modificabile: lead, call, report, clienti, vendite, rate, costi, pagamenti e regole.',
        testoTeam: 'Ogni dato inserito resta modificabile, nei limiti del proprio ruolo: il setter i suoi lead, call e report, il closer esiti e dettagli delle sue call.',
      },
      {
        per: ['closer'],
        testo: 'Dettagli della call: link alla registrazione, performance, prodotto e importo proposto; l’importo il setter non lo vede mai.',
      },
    ],
  },
  {
    versione: '0.2.0',
    data: '2026-09-26',
    titolo: 'Inserimento dei dati',
    riassunto: 'Il setter compila la giornata dal telefono, il closer registra gli esiti, le vendite nascono con il loro piano rate.',
    intestazionePer: ['setter', 'closer'],
    novita: [
      {
        per: ['setter'],
        testo: 'Oggi del setter: il report del giorno con contatori grandi, salvataggio automatico e «Salvato alle 18:42», senza bottone da ricordarsi.',
      },
      {
        per: ['setter'],
        testo: 'Nuova call: lead e call insieme, con te come closer predefinito.',
        testoTeam: 'Nuova call: lead e call insieme, con Dany come closer predefinito.',
      },
      { per: ['closer'], testo: 'Le mie call: esito in massimo 3 tocchi; una call chiusa apre la nuova vendita già compilata.' },
      {
        per: ['closer'],
        testo: 'Vendita con il piano rate generato da solo, rata incassata con un tocco, rimborsi.',
        testoTeam: 'Vendita con il piano rate generato da solo e rata incassata con un tocco.',
      },
      { per: ['setter', 'closer'], testo: 'Pipeline dei lead, con lo stato cambiato a mano in un tocco.' },
      { per: ['admin'], testo: 'Clienti con stato e valore nel tempo, prodotti, costi con i ricorrenti copiati dal mese prima.' },
      { per: ['tutti'], testo: 'Logo con il fuoco al login e breve intro all’ingresso.' },
    ],
  },
  {
    versione: '0.1.0',
    data: '2026-09-26',
    titolo: 'Fondamenta',
    riassunto: 'Database, accessi e navigazione per ruolo: la base su cui è costruito tutto il resto.',
    intestazionePer: ['tutti'],
    novita: [
      {
        per: ['tutti'],
        testo: 'Database con vendite, incassi, setting, provvigioni e costi, e i permessi per ruolo su ogni riga.',
        testoTeam: 'Database con i permessi per ruolo su ogni riga: ognuno vede solo i dati del suo lavoro.',
      },
      { per: ['tutti'], testo: 'Accesso solo su invito, con Google.' },
      {
        per: ['tutti'],
        testo: 'Navigazione diversa per admin, setter e closer: barra laterale sul computer, barra in basso sul telefono.',
        testoTeam: 'Navigazione diversa per ruolo: barra laterale sul computer, barra in basso sul telefono.',
      },
      { per: ['tutti'], testo: 'Tema scuro con i colori di Percorso Alpha.' },
    ],
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
