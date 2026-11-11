import { bilingue } from '@/lib/i18n/lingua'

/**
 * Setter › Contatti (1.76.0, Dany, 11/11/2026: «ho bisogno dell'evidenza di questo dalla dashboard in modo
 * chiaro… una panoramica lato setting e contatti»): DMs, conversations, booked calls from the calendar «Dany
 * Discovery Call», in target, held and closed, and the address of the calendar in Impostazioni.
 */
export const CONTATTI = bilingue(
  {
    scheda: 'Contatti',
    caricamento: 'Carico setting e contatti',
    titolo: 'Setting e contatti',
    descrizione:
      'Dai DM alla call chiusa: quanti contatti, quante call prenotate sul calendario «Dany Discovery Call», quante in target, quante svolte e chiuse.',
    errore: 'Setting e contatti non si sono caricati',
    erroreDescrizione: 'Non siamo riusciti a leggere i numeri del periodo. Riprova tra un momento.',
    // the calendar
    calendarioLetto: (quando: string, eventi: number) =>
      `Calendario letto ${quando} · ${eventi === 1 ? '1 evento' : `${eventi} eventi`}`,
    calendarioMai: 'Calendario collegato, non ancora letto: tocca «Aggiorna dal calendario».',
    calendarioNonCollegato: 'Il calendario non è collegato: le call prenotate vengono ancora dai report del setter.',
    collegaQui: 'Collegalo in Chiavi e collegamenti',
    calendarioErrore: 'Ultima lettura non riuscita',
    dalCalendario: (giorno: string) => `Le call prenotate vengono dal calendario dal ${giorno}; i giorni prima, dai report del setter.`,
    aggiorna: 'Aggiorna dal calendario',
    aggiornando: 'Leggo il calendario…',
    aggiornato: (eventi: number) => `Calendario letto: ${eventi === 1 ? '1 evento' : `${eventi} eventi`}.`,
    // the numbers
    sezioneFunnel: 'Dal DM alla call',
    dmTotali: 'DM totali',
    dettaglioDm: (out: string, inb: string, fup: string) => `${out} outbound · ${inb} inbound · ${fup} follow-up`,
    conversazioni: 'Conversazioni',
    callProposte: 'Call proposte',
    prenotate: 'Call prenotate',
    inTarget: 'In target',
    inTargetNota: '25+ anni e «Sì» al budget del modulo Calendly',
    senzaDati: (n: number) => (n === 1 ? '1 senza dati del modulo' : `${n} senza dati del modulo`),
    svolte: 'Call svolte',
    chiuse: 'Chiuse',
    cancellate: (n: number) => (n === 1 ? '1 cancellata' : `${n} cancellate`),
    inAgenda: (n: number) => (n === 1 ? '1 in agenda nel periodo' : `${n} in agenda nel periodo`),
    dalleCallApp: 'esiti registrati nell’app',
    sezioneRapporti: 'I rapporti',
    tassoConversazione: 'DM che diventano conversazione',
    dmPerPrenotata: 'DM per call prenotata',
    convPerPrenotata: 'Conversazioni per call prenotata',
    prenotateSuProposte: 'Call prenotate su call proposte',
    quotaInTarget: 'Prenotate in target',
    dmPerInTarget: 'DM per call in target',
    showRate: 'Show rate',
    closeRate: 'Close rate',
    chiuseSuPrenotate: 'Chiuse su prenotate',
    // the funnel bars
    funnel: 'Il funnel del periodo',
    funnelTabella: 'Il funnel in tabella',
    fase: 'Fase',
    valore: 'Valore',
    passaggio: 'Dal passo prima',
    // the days
    sezioneGiorni: 'Giorno per giorno',
    giorno: 'Giorno',
    dmOut: 'DM out',
    dmIn: 'DM in',
    followUp: 'Follow-up',
    conv: 'Conv.',
    proposte: 'Proposte',
    pren: 'Prenotate',
    target: 'In target',
    svolteBreve: 'Svolte',
    chiuseBreve: 'Chiuse',
    totale: 'Totale',
    nessunGiorno: 'Nessuna attività nel periodo',
    nessunGiornoDescrizione: 'Nessun DM nei report, nessuna call prenotata e nessuna call svolta in questo periodo.',
    nonDalCalendario: 'dai report',
    // the summary to send
    copia: 'Copia il riepilogo',
    copiato: 'Riepilogo copiato: incollalo dove vuoi.',
    nonCopiato: 'Non sono riuscito a copiare: seleziona il testo a mano.',
    riepilogo: (r: {
      periodo: string
      dm: string
      out: string
      inb: string
      fup: string
      conv: string
      proposte: string
      prenotate: string
      target: string
      quota: string
      svolte: string
      chiuse: string
      dmPerCall: string
    }) =>
      [
        `Setting e contatti, ${r.periodo}`,
        `DM totali: ${r.dm} (${r.out} outbound, ${r.inb} inbound, ${r.fup} follow-up)`,
        `Conversazioni: ${r.conv}`,
        `Call proposte: ${r.proposte}`,
        `Call prenotate: ${r.prenotate}, in target ${r.target} (${r.quota})`,
        `Call svolte: ${r.svolte}, chiuse ${r.chiuse}`,
        `DM per call prenotata: ${r.dmPerCall}`,
      ].join('\n'),
  },
  {
    scheda: 'Contacts',
    caricamento: 'Loading setting and contacts',
    titolo: 'Setting and contacts',
    descrizione:
      'From the DM to the closed call: how many contacts, how many calls booked on the calendar «Dany Discovery Call», how many in target, held and closed.',
    errore: 'Setting and contacts did not load',
    erroreDescrizione: 'We could not read the numbers of the period. Try again in a moment.',
    calendarioLetto: (quando: string, eventi: number) =>
      `Calendar read ${quando} · ${eventi === 1 ? '1 event' : `${eventi} events`}`,
    calendarioMai: 'Calendar connected, not read yet: tap «Refresh from the calendar».',
    calendarioNonCollegato: 'The calendar is not connected: the booked calls still come from the setter’s reports.',
    collegaQui: 'Connect it in Keys and connections',
    calendarioErrore: 'Last reading failed',
    dalCalendario: (giorno: string) => `The booked calls come from the calendar from ${giorno}; the days before, from the setter’s reports.`,
    aggiorna: 'Refresh from the calendar',
    aggiornando: 'Reading the calendar…',
    aggiornato: (eventi: number) => `Calendar read: ${eventi === 1 ? '1 event' : `${eventi} events`}.`,
    sezioneFunnel: 'From the DM to the call',
    dmTotali: 'Total DMs',
    dettaglioDm: (out: string, inb: string, fup: string) => `${out} outbound · ${inb} inbound · ${fup} follow-up`,
    conversazioni: 'Conversations',
    callProposte: 'Calls proposed',
    prenotate: 'Calls booked',
    inTarget: 'In target',
    inTargetNota: '25+ and «Yes» to the budget of the Calendly form',
    senzaDati: (n: number) => (n === 1 ? '1 without the form’s data' : `${n} without the form’s data`),
    svolte: 'Calls held',
    chiuse: 'Closed',
    cancellate: (n: number) => (n === 1 ? '1 cancelled' : `${n} cancelled`),
    inAgenda: (n: number) => (n === 1 ? '1 scheduled in the period' : `${n} scheduled in the period`),
    dalleCallApp: 'outcomes recorded in the app',
    sezioneRapporti: 'The ratios',
    tassoConversazione: 'DMs that become a conversation',
    dmPerPrenotata: 'DMs per booked call',
    convPerPrenotata: 'Conversations per booked call',
    prenotateSuProposte: 'Booked calls over proposed calls',
    quotaInTarget: 'Booked in target',
    dmPerInTarget: 'DMs per call in target',
    showRate: 'Show rate',
    closeRate: 'Close rate',
    chiuseSuPrenotate: 'Closed over booked',
    funnel: 'The funnel of the period',
    funnelTabella: 'The funnel as a table',
    fase: 'Step',
    valore: 'Value',
    passaggio: 'From the step before',
    sezioneGiorni: 'Day by day',
    giorno: 'Day',
    dmOut: 'DM out',
    dmIn: 'DM in',
    followUp: 'Follow-up',
    conv: 'Conv.',
    proposte: 'Proposed',
    pren: 'Booked',
    target: 'In target',
    svolteBreve: 'Held',
    chiuseBreve: 'Closed',
    totale: 'Total',
    nessunGiorno: 'No activity in the period',
    nessunGiornoDescrizione: 'No DMs in the reports, no booked call and no held call in this period.',
    nonDalCalendario: 'from the reports',
    copia: 'Copy the summary',
    copiato: 'Summary copied: paste it wherever you like.',
    nonCopiato: 'Could not copy: select the text by hand.',
    riepilogo: (r: {
      periodo: string
      dm: string
      out: string
      inb: string
      fup: string
      conv: string
      proposte: string
      prenotate: string
      target: string
      quota: string
      svolte: string
      chiuse: string
      dmPerCall: string
    }) =>
      [
        `Setting and contacts, ${r.periodo}`,
        `Total DMs: ${r.dm} (${r.out} outbound, ${r.inb} inbound, ${r.fup} follow-up)`,
        `Conversations: ${r.conv}`,
        `Calls proposed: ${r.proposte}`,
        `Calls booked: ${r.prenotate}, in target ${r.target} (${r.quota})`,
        `Calls held: ${r.svolte}, closed ${r.chiuse}`,
        `DMs per booked call: ${r.dmPerCall}`,
      ].join('\n'),
  },
)

/** The address of the calendar in Impostazioni › Chiavi e collegamenti. */
export const INDIRIZZO_CALENDARIO = bilingue(
  {
    titolo: 'Google Calendar (call di vendita)',
    collegato: (data: string | null) => `Collegato${data ? `: indirizzo salvato il ${data}` : ''}.`,
    nonCollegato: 'Non collegato: le call prenotate vengono dai report del setter.',
    letto: (quando: string, eventi: number) => `Ultima lettura ${quando} · ${eventi === 1 ? '1 evento' : `${eventi} eventi`}.`,
    nonRisponde: 'Ultima lettura non riuscita',
    campo: 'Indirizzo segreto iCal',
    nuovo: 'Nuovo indirizzo segreto iCal',
    segnaposto: 'https://calendar.google.com/calendar/ical/…/private-…/basic.ics',
    sostituisci: 'Incolla qui l’indirizzo nuovo per sostituirlo',
    aiuto: 'L’«Indirizzo segreto in formato iCal» del calendario «Dany Discovery Call». Si salva nel Vault e non si mostra più.',
    incolla: 'Incolla l’indirizzo segreto copiato da Google Calendar.',
    salva: 'Salva l’indirizzo',
    togli: 'Scollega il calendario',
    conferma: 'Tocca di nuovo per scollegare',
    salvatoLetto: (eventi: number) => `Indirizzo salvato e calendario letto: ${eventi === 1 ? '1 evento' : `${eventi} eventi`}.`,
    salvatoNonLetto: 'Indirizzo salvato, ma il calendario non si è letto: guarda l’errore qui sopra.',
    tolto: 'Calendario scollegato: le call prenotate tornano a venire dai report.',
    nota: 'L’app legge solo quando è stata prenotata ogni call, quando si tiene, se è cancellata, l’età e la risposta sul budget. Nomi, Instagram, entrate e risposte scritte non si salvano. I numeri sono in',
    contatti: 'Setter › Contatti',
  },
  {
    titolo: 'Google Calendar (sales calls)',
    collegato: (data: string | null) => `Connected${data ? `: address saved on ${data}` : ''}.`,
    nonCollegato: 'Not connected: the booked calls come from the setter’s reports.',
    letto: (quando: string, eventi: number) => `Last reading ${quando} · ${eventi === 1 ? '1 event' : `${eventi} events`}.`,
    nonRisponde: 'Last reading failed',
    campo: 'Secret iCal address',
    nuovo: 'New secret iCal address',
    segnaposto: 'https://calendar.google.com/calendar/ical/…/private-…/basic.ics',
    sostituisci: 'Paste the new address here to replace it',
    aiuto: 'The «Secret address in iCal format» of the calendar «Dany Discovery Call». It is saved in the Vault and never shown again.',
    incolla: 'Paste the secret address copied from Google Calendar.',
    salva: 'Save the address',
    togli: 'Disconnect the calendar',
    conferma: 'Tap again to disconnect',
    salvatoLetto: (eventi: number) => `Address saved and calendar read: ${eventi === 1 ? '1 event' : `${eventi} events`}.`,
    salvatoNonLetto: 'Address saved, but the calendar was not read: see the error above.',
    tolto: 'Calendar disconnected: the booked calls come from the reports again.',
    nota: 'The app reads only when each call was booked, when it is held, whether it is cancelled, the age and the budget answer. Names, Instagram, incomes and written answers are not saved. The numbers are in',
    contatti: 'Setter › Contacts',
  },
)

/** The fixed sentences of the database and of the reading, in English. */
const ERRORI_EN: Record<string, string> = {
  'Il calendario lo collega l’admin.': 'The admin connects the calendar.',
  'Il calendario lo scollega l’admin.': 'The admin disconnects the calendar.',
  'Questo è l’indirizzo pubblico: tieni il calendario privato e incolla l’«Indirizzo segreto in formato iCal».':
    'This is the public address: keep the calendar private and paste the «Secret address in iCal format».',
  'Questo non è l’indirizzo segreto del calendario: copialo da Impostazioni › «Dany Discovery Call» › «Indirizzo segreto in formato iCal».':
    'This is not the calendar’s secret address: copy it from Settings › «Dany Discovery Call» › «Secret address in iCal format».',
  'Il calendario non è collegato: l’admin incolla l’indirizzo segreto in Impostazioni › Chiavi e collegamenti.':
    'The calendar is not connected: the admin pastes the secret address in Settings › Keys and connections.',
  'Google non dà più il calendario con questo indirizzo: copia di nuovo l’«Indirizzo segreto in formato iCal» e incollalo in Impostazioni › Chiavi e collegamenti.':
    'Google no longer gives the calendar at this address: copy the «Secret address in iCal format» again and paste it in Settings › Keys and connections.',
  'Google Calendar non risponde: riprova più tardi.': 'Google Calendar is not answering: try again later.',
  'Google Calendar ha risposto con un file che non è un calendario: riprova più tardi.':
    'Google Calendar answered with a file that is not a calendar: try again later.',
  'Il calendario è troppo grande da leggere in una volta.': 'The calendar is too big to read in one go.',
  'Il calendario non si è salvato: riprova più tardi.': 'The calendar was not saved: try again later.',
  'Il calendario lo aggiorna l’admin.': 'The admin refreshes the calendar.',
}

export function traduciErroreCalendario(testo: string, lingua: 'it' | 'en'): string {
  return lingua === 'en' ? (ERRORI_EN[testo] ?? testo) : testo
}
