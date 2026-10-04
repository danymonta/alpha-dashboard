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
 * - 'tutti': everyone (Alfire in general, the installable app, the login).
 * A collaborator never reads about clients' payments, costs, margin, other
 * people's commissions or the admin's economics (CLAUDE.md section 6); the
 * setter may read about his own numbers, clients and commissions, the closer
 * about his calls, sales and day.
 *
 * Words: Italian, plain and concrete, never file or function names. `testo`,
 * `titolo` and `riassunto` are written for the owner ("tu" is Dany); when an
 * item or heading the team reads speaks to him, `testoTeam` or
 * `intestazioneTeam` hold the words the team reads instead.
 */

export type Pubblico = 'admin' | 'setter' | 'closer' | 'progetti' | 'tutti'

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
  progetti: 'Area Progetti',
  tutti: 'Tutto il team',
}

/** Newest first. A new deploy goes on top. */
export const VERSIONI: readonly Versione[] = [
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
