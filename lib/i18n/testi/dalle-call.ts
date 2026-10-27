import { bilingue } from '@/lib/i18n/lingua'

/**
 * «Dalle call» (Marketing, admin only) and the Panoramica's «Di cosa parlare
 * oggi» and money eye (Dany, 27/10/2026). What Claude wrote in the call
 * analyses, the DM recap and the Spunti stays Italian (lang="it").
 */
export const DALLE_CALL = bilingue(
  {
    titolo: 'Dalle call',
    descrizione:
      'Le obiezioni delle call di vendita diventano topic per stories e contenuti. Ogni sera l’app cerca su Fathom le call svolte senza registrazione e Claude le analizza da solo.',
    periodo: 'Periodo',
    giorni: (n: number) => `Ultimi ${n} giorni`,
    riepilogo: (analizzate: number, svolte: number) =>
      `${analizzate} ${analizzate === 1 ? 'call analizzata' : 'call analizzate'} su ${svolte} ${svolte === 1 ? 'svolta' : 'svolte'}.`,
    callCon: (n: number | null) => (n === null ? 'Dalle analisi' : `${n} ${n === 1 ? 'call non chiusa' : 'call non chiuse'}`),
    topic: 'Topic per le stories',
    cosaDicono: 'Cosa dicono i lead',
    comeRispondere: 'Come è stata gestita bene',
    ideeClaude: 'Idee di Claude dalle stesse call',
    perche: 'Perché',
    vuoto: 'Nessuna obiezione nel periodo',
    vuotoDescrizione:
      'Le obiezioni arrivano dalle call registrate con Fathom e analizzate da Claude. Tocca «Cerca su Fathom e analizza» per le call svolte senza registrazione.',
    vaiCall: 'Vai a Le mie call',
    errore: 'Le analisi delle call non si sono caricate.',
    inItaliano: 'I testi delle analisi sono di Claude, in italiano.',
    caricamento: 'Carico i topic dalle call…',
    cerca: 'Cerca su Fathom e analizza',
    cercaInCorso: 'Cerco su Fathom…',
    senzaRegistrazione: (n: number) =>
      `${n} ${n === 1 ? 'call svolta' : 'call svolte'} senza registrazione nel periodo.`,
    risultato: (collegate: number, cercate: number) =>
      collegate === 0
        ? `Nessuna registrazione trovata su Fathom per ${cercate} call.`
        : `Trovate su Fathom ${collegate} call su ${cercate}: Claude le analizza una alla volta, arrivano qui tra qualche minuto.`,
    nienteDaCercare: 'Ogni call svolta del periodo ha già la sua registrazione.',
    parziale: 'Fathom ha molte riunioni nel periodo: le più vecchie le cerco con un altro tocco.',
    erroreCerca: 'Fathom non ha risposto: riprova tra poco.',
    nonCollegato: 'Fathom non è collegato: incolla la chiave in Impostazioni › Chiavi e collegamenti.',
    connessione: 'Connessione assente. Riprova.',
    nonPronto: 'Manca l’aggiornamento del database di questa versione: applica la migration 20261104090000_fathom_abbina.sql.',
    inAnalisi: (n: number) =>
      `Claude sta analizzando ${n} call: la pagina si aggiorna da sola.`,
    analisiSpente: 'L’analisi delle call è spenta: accendila in Impostazioni › Fathom.',
    limiteSpesa: 'Limite di spesa del mese raggiunto: le analisi ripartono il 1° del mese.',
    impostazioni: 'Apri Impostazioni › Fathom',
    soloLeTue:
      'Si cercano le riunioni dell’account Fathom collegato, con il nome del lead e l’orario della call. Le call segnate «non registrata» restano fuori.',
  },
  {
    titolo: 'From calls',
    descrizione:
      'The objections of the sales calls become topics for stories and content. Every evening the app looks on Fathom for the held calls without a recording and Claude analyses them by itself.',
    periodo: 'Period',
    giorni: (n: number) => `Last ${n} days`,
    riepilogo: (analizzate: number, svolte: number) =>
      `${analizzate} ${analizzate === 1 ? 'call analysed' : 'calls analysed'} out of ${svolte} held.`,
    callCon: (n: number | null) => (n === null ? 'From the analyses' : `${n} ${n === 1 ? 'call not closed' : 'calls not closed'}`),
    topic: 'Topic for the stories',
    cosaDicono: 'What the leads say',
    comeRispondere: 'How it was handled well',
    ideeClaude: 'Claude’s ideas from the same calls',
    perche: 'Why',
    vuoto: 'No objections in the period',
    vuotoDescrizione:
      'Objections come from the calls recorded with Fathom and analysed by Claude. Tap «Find on Fathom and analyse» for the held calls without a recording.',
    vaiCall: 'Go to My calls',
    errore: 'The call analyses did not load.',
    inItaliano: 'The analyses are written by Claude, in Italian.',
    caricamento: 'Loading the topics from calls…',
    cerca: 'Find on Fathom and analyse',
    cercaInCorso: 'Searching Fathom…',
    senzaRegistrazione: (n: number) =>
      `${n} held ${n === 1 ? 'call' : 'calls'} without a recording in the period.`,
    risultato: (collegate: number, cercate: number) =>
      collegate === 0
        ? `No recording found on Fathom for ${cercate} ${cercate === 1 ? 'call' : 'calls'}.`
        : `Found ${collegate} of ${cercate} ${cercate === 1 ? 'call' : 'calls'} on Fathom: Claude analyses them one at a time, they arrive here in a few minutes.`,
    nienteDaCercare: 'Every held call of the period already has its recording.',
    parziale: 'Fathom has many meetings in the period: tap again for the older ones.',
    erroreCerca: 'Fathom did not answer: try again shortly.',
    nonCollegato: 'Fathom is not connected: paste the key in Settings › Keys and connections.',
    connessione: 'No connection. Try again.',
    nonPronto: 'The database update of this version is missing: apply the migration 20261104090000_fathom_abbina.sql.',
    inAnalisi: (n: number) =>
      `Claude is analysing ${n} ${n === 1 ? 'call' : 'calls'}: the page updates by itself.`,
    analisiSpente: 'Call analysis is off: turn it on in Settings › Fathom.',
    limiteSpesa: 'This month’s spending limit is reached: the analyses restart on the 1st.',
    impostazioni: 'Open Settings › Fathom',
    soloLeTue:
      'It looks at the meetings of the connected Fathom account, by the lead’s name and the call’s time. Calls marked «not recorded» stay out.',
  },
)

export const STORIES_OGGI = bilingue(
  {
    titolo: 'Di cosa parlare oggi',
    descrizione: 'Gli spunti macro per stories e contenuti, da DM, call e Spunti.',
    dalleChat: 'Dai DM delle ultime 24 ore',
    dalleCall: 'Dalle obiezioni in call (ultimi 14 giorni)',
    dagliSpunti: 'Dagli ultimi Spunti',
    temaDm: (n: number) => `${n} chat`,
    obiezioneCall: (n: number) => `${n} call`,
    tuttiTopic: 'Tutti i topic dalle call',
    apriSpunti: 'Apri gli Spunti',
    apriInsight: 'Apri l’Insight',
    vuoto: 'Ancora niente: arriva col prossimo recap dei DM, con le call analizzate o chiedendo gli Spunti.',
    nonCaricati: 'Gli spunti di oggi non si sono caricati: riprova più tardi.',
  },
  {
    titolo: 'What to talk about today',
    descrizione: 'The macro ideas for stories and content, from DMs, calls and Ideas.',
    dalleChat: 'From the DMs of the last 24 hours',
    dalleCall: 'From the objections in calls (last 14 days)',
    dagliSpunti: 'From the latest Ideas',
    temaDm: (n: number) => `${n} ${n === 1 ? 'chat' : 'chats'}`,
    obiezioneCall: (n: number) => `${n} ${n === 1 ? 'call' : 'calls'}`,
    tuttiTopic: 'All the topics from calls',
    apriSpunti: 'Open Ideas',
    apriInsight: 'Open the Insight',
    vuoto: 'Nothing yet: it arrives with the next DM recap, with analysed calls or by asking for Ideas.',
    nonCaricati: 'Today’s ideas did not load: try again later.',
  },
)

export const OCCHIO_SOLDI = bilingue(
  {
    nascondi: 'Nascondi i soldi',
    mostra: 'Mostra i soldi',
    nascosti: 'I numeri dei soldi sono nascosti su questo dispositivo.',
  },
  {
    nascondi: 'Hide the money',
    mostra: 'Show the money',
    nascosti: 'The money numbers are hidden on this device.',
  },
)
