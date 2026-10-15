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
