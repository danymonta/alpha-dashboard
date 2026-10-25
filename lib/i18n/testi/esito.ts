import { FOLLOW_UP, VENDITA_DA_REGISTRARE, quandoFollowUpDa } from '@/lib/call/follow-up'
import { REGISTRAZIONE } from '@/lib/call/registrazione'
import { SPOSTA } from '@/lib/call/spostamento'
import { aggiungiGiorni, oggiRoma } from '@/lib/date'
import { GIORNI_EN, parseDataISO } from '@/lib/format'
import { bilingue, type Lingua } from '@/lib/i18n/lingua'
import { ESITO_DEL_CLOSER, MASSIMO_MOTIVO, MASSIMO_NOTE_CLOSER, MASSIMO_NOTE_SETTER, MOTIVO_NON_CHIUSURA, NOTE_CLOSER, NOTE_SETTER } from '@/lib/setting/commento'

/**
 * The sheets that write on a call (1.53.0, the second pass): the outcome sheet with the
 * follow-up and the Fathom step, «Sposta», the pencil, «Fissa la call di follow-up», the sale to
 * tie, the new call form. The Italian side is the words of lib/call and lib/setting, so a word is
 * still changed there (and the tests that compare them with the database keep reading them).
 */

/** «Sposta» and «In attesa di conferma» (lib/call/spostamento.ts). */
export const SPOSTA_TESTI = bilingue(SPOSTA, {
  bottone: 'Move',
  nomeBottone: (lead: string) => `Move the call with ${lead}`,
  titolo: (lead: string) => `Move the call with ${lead}`,
  descrizione: 'The call moves to the new day and is to be held again. The card keeps «Moved from…».',
  quando: 'New day and time',
  salva: 'Move the call',
  fatto: (lead: string) => `${lead}: call moved`,
  riprogrammata: {
    scelta: 'It already has a new date',
    domanda: 'When was it rescheduled to?',
    spiegazione: 'The call moves to the new day and is to be held again: you record the outcome there.',
    salva: 'Save the new date',
  },
  setterRiprogrammata: 'This call is marked as rescheduled: the closer (or the admin) sets the new date',
  setterConEsito: 'This call already has the closer’s outcome: he moves it (or the admin)',
  svolta:
    'This call was held: it does not move. If the outcome is wrong undo it first; to see the lead again a new call is needed, booked by the setter (or the admin)',
  noShow:
    'The lead did not show up: the call stays a no show, so it counts in the show rate. If the outcome is wrong undo it first; to see the lead again a new call is needed, booked by the setter (or the admin)',
  setterSvolta:
    'This call was held: it does not move. If the outcome is wrong the closer (or the admin) corrects it; to see the lead again book a new call',
  setterNoShow:
    'The lead did not show up: the call stays a no show, so it counts in the show rate. If the outcome is wrong the closer (or the admin) corrects it; to see the lead again book a new call',
  foglioEsito: {
    svolta:
      'A held call does not move. If the date is wrong correct it with the pencil («Edit»); if the outcome is wrong undo it below, then move the call. To see the lead again a new call is needed, booked by the setter (or the admin).',
    noShow:
      'A no show does not move: it stays a no show and counts in the show rate. If the date is wrong correct it with the pencil («Edit»); if the outcome is wrong undo it below, then move the call. To see the lead again a new call is needed, booked by the setter (or the admin).',
  },
  soloLaData: 'If only the day or the time are wrong, I can correct them without a trace and the outcome stays',
  soloLaDataPerAlfire: 'To correct only day and time: call, action modifica with date and time.',
  correzione: {
    svolta: 'It stays held, with its outcome: a correction, without «Moved from…»',
    noShow: 'It stays a no show: a correction, without «Moved from…»',
  },
  stessoMomento: 'The call is already on that day and at that time: choose another one',
  attesa: {
    etichetta: 'Waiting for confirmation',
    gruppo: 'To reschedule',
    spiegazione:
      'The lead still has to confirm a new date: the call stays on this day, on top of «My calls» under «Waiting for confirmation». When they confirm it, «Move» takes it to the new day.',
    salva: 'Mark as waiting for confirmation',
    descrizione: 'The lead has to confirm a new date: when they do, «Move» takes the call to its new day.',
  },
})

/** The follow-up call (lib/call/follow-up.ts). */
export const FOLLOW_UP_TESTI = bilingue(FOLLOW_UP, {
  etichetta: 'Follow-up',
  domanda: 'Did you book a follow-up call?',
  si: 'Yes, call booked',
  no: 'No, follow-up by chat',
  quando: 'When is the follow-up call?',
  stessoSetter: (setter: string) => `Same lead and same setter: if it closes, the sale stays ${setter}’s`,
  senzaSetter: 'Same lead and same closer as this call: you find it on its day, to be held',
  avanti: 'Next',
  sceltaCall: (quando: string) => `Follow-up · call ${quando}`,
  inChat: 'Follow-up by chat',
  cambia: 'change',
  giaFissata: (quando: string) => `Follow-up call already booked: ${quando}`,
  assegnataAltroCloser: 'assigned to another closer',
  diCall: (quando: string) => `Follow-up call: ${quando}`,
  diAltroCloser: 'Follow-up call booked, assigned to another closer',
  della: (quando: string) => `Follow-up of the call of ${quando}`,
  dellaSenzaData: 'Follow-up of an earlier call',
  bottone: 'Book the follow-up call',
  nomeBottone: (lead: string) => `Book the follow-up call with ${lead}`,
  titolo: (lead: string) => `Follow-up call with ${lead}`,
  descrizione:
    'A new call on the chosen day, to be held: same lead, same setter and same closer. It counts in the closer’s numbers like every call.',
  salva: 'Book the follow-up call',
  fatto: (lead: string) => `${lead}: follow-up call booked`,
  nonFissata: (motivo: string) => `Outcome saved, but the follow-up call is not booked: ${motivo}`,
  riprova: 'Book it from the call’s card with «Book the follow-up call».',
  giaPresente: 'This call already has its follow-up call',
  conPersa: 'A lost call has no follow-up call: to book one choose Follow-up',
  manca: 'Choose the day and the time of the follow-up call',
  soloAvanti: 'A follow-up call is booked from today on',
  dopoLaCall: (quando: string) =>
    `The follow-up call comes after the first call, of ${quando}: choose a later day and time`,
  soloSuFollowUp: 'The follow-up call is booked on a held call that ended in follow-up.',
  chiPuo: 'The follow-up call is booked by the call’s closer and the admin.',
  altroCloser: 'This call already has its follow-up call, assigned to another closer.',
  closerNonAttivo: 'The closer of this call is not active or cannot close: change them first with the pencil',
})

/** A closed call without its sale (lib/call/follow-up.ts). */
export const VENDITA_TESTI = bilingue(VENDITA_DA_REGISTRARE, {
  etichetta: 'Sale to record',
  bottone: 'Record the sale',
  nomeBottone: (lead: string) => `Record the sale of ${lead}`,
  sezione: 'Sale to record',
  descrizioneSezione:
    'Closed calls without their sale: record it, so the call’s cash and revenue enter the numbers and the commission goes to the setter.',
  chiediAdmin: 'Is the sale already there? Ask the admin to tie it to the call: «Record the sale» would make a second one.',
  collega: 'The sale is already there: tie it',
  nomeCollega: (lead: string) => `The sale is already there: tie it to the call of ${lead}`,
  titoloCollega: (lead: string) => `Sale of ${lead}`,
  descrizioneCollega:
    'The sales recorded without the call: first those of a client with the lead’s name or handle, then those signed within a month of the call. Once tied, the call no longer asks for the sale; setter, closer and amounts stay those of the sale.',
  stessoCliente: 'Same name or handle as the lead',
  nessuna: 'No sale without a call of this lead, nor signed within a month of the call: if it is not there, record it.',
  bottoneCollega: 'Tie',
  nomeBottoneCollega: (cliente: string, dettaglio: string) => `Tie the sale of ${cliente}: ${dettaglio}`,
  collegata: (lead: string) => `${lead}: sale tied to the call`,
  soloAdmin: 'Only the admin ties the sale to the call.',
  giaRegistrataTitolo: 'This sale seems already recorded',
  giaRegistrataTesto:
    'There is already a sale without a call of a client with the lead’s name or handle, signed within a month of the call. If it is this one, do not record another: cash, revenue and commission would count twice.',
  giaRegistrataAdmin: 'Tie it to the call; if it is another sale, record it below.',
  giaRegistrataCloser: 'Ask the admin to tie it to the call; if it is another sale, record it below.',
  apriVendita: 'Open the sale',
  nomeApriVendita: (cliente: string, dettaglio: string) => `Open the sale of ${cliente}: ${dettaglio}`,
})

/** «New client of 07 Oct 2026, €1,500.00» (dettaglioVendita). */
export function dettaglioVenditaIn(tipo: string, data: string, importo: string, lingua: Lingua): string {
  return lingua === 'it' ? `${tipo} del ${data}, ${importo}` : `${tipo} of ${data}, ${importo}`
}

/** The recording (lib/call/registrazione.ts). */
export const REGISTRAZIONE_TESTI = bilingue(REGISTRAZIONE, {
  titolo: 'The call’s recording',
  domanda: 'Paste the link of the Fathom recording, or tap «Call not recorded».',
  aiuto: 'On Fathom open the call › Share › Copy link.',
  analisi: 'Claude, an artificial intelligence, analyses every recorded call.',
  campo: 'Link of the Fathom recording',
  verifica: 'Check the link',
  verificando: 'Looking for the recording on Fathom…',
  usa: 'Go on with this recording',
  salvaCosi: 'Save the link as it is',
  salvaLink: 'Save the link',
  correggi: 'Correct',
  nonRegistrata: 'Call not recorded',
  nonRegistrataAiuto: 'One tap, no reason: the call is saved without a recording.',
  manca: 'Paste the link of the recording, or tap «Call not recorded».',
  linkTroppoLungo: 'The link is too long.',
  nonFathom: 'It is not a Fathom link: I save it, but transcript and analysis do not arrive.',
  nonTrovata: 'I cannot find this recording on Fathom: maybe it belongs to another account or is not shared with you.',
  nonCollegato: 'Fathom is not connected: the admin pastes the key in Settings › Fathom. The link is saved anyway.',
  erroreFathom: 'Fathom is not answering: the link is saved anyway and I check it later.',
  soloChiHaFatto: 'The recording is tied by the call’s closer and the admin.',
  avvisoNonSalvata: 'Outcome saved, but the recording is not: add it from the call’s card.',
  toastCollegata: 'Recording tied.',
  toastNonRegistrata: 'Call not recorded.',
  trovata: (titolo: string | null, quando: string, minuti: number | null) =>
    `Found on Fathom${titolo ? `: «${titolo}»` : ''}, ${quando}${minuti ? `, ${minuti} min` : ''}.`,
  cambia: 'change',
  scheda: {
    titolo: 'Recording',
    suFathom: (minuti: number | null) => (minuti ? `On Fathom · ${minuti} min` : 'On Fathom'),
    nonVerificata: 'Recording link (not found on Fathom yet)',
    link: 'Recording link',
    nonRegistrata: 'Call not recorded',
    daAggiungere: 'Recording to add',
    apri: 'Open on Fathom',
    trascrizione: 'Transcript',
    riassunto: 'Fathom summary',
    aggiungi: 'Add the link',
    cambia: 'Change',
    scollega: 'Untie',
    verificaDiNuovo: 'Look on Fathom',
    verificaFatta: 'Recording found on Fathom.',
    trascrizioneNota: 'Read now from Fathom: the app does not keep it.',
    riassuntoNota: 'Written by Fathom, in English. Read now: the app does not keep it.',
  },
  daCollegare: 'Recording to tie',
})

/** The closer's reason and the two notes of a call (lib/setting/commento.ts). */
export const NOTE_CALL = bilingue(
  {
    motivo: MOTIVO_NON_CHIUSURA,
    noteCloser: NOTE_CLOSER,
    noteSetter: NOTE_SETTER,
    esitoDelCloser: ESITO_DEL_CLOSER,
  },
  {
    motivo: {
      titolo: 'Reason for not closing',
      domanda: 'Why did it not close?',
      placeholder: 'E.g. «over budget», «wants to try alone», «has to talk to his partner», «not the right time»',
      obbligatorio: 'required',
      senzaImporti: 'No amounts here: the amount pitched goes in its own field, with the call’s pencil.',
      manca: 'Write the reason for not closing',
      perSalvare: 'To save write the reason for not closing, then tap Yes or No.',
      salva: 'A tap on Yes or No saves the outcome.',
      tolto: 'removed',
      troppoLungo: `${MASSIMO_MOTIVO} characters at most`,
    },
    noteCloser: {
      titolo: 'Extra notes',
      diChi: 'Closer’s extra notes',
      facoltative: 'optional',
      placeholder: 'What you want to remember about the call',
      troppoLungo: `${MASSIMO_NOTE_CLOSER} characters at most`,
    },
    noteSetter: {
      titolo: 'Setter’s notes',
      placeholder: 'What the closer has to know before the call',
      soloLettura: 'The setter writes them with the call’s pencil.',
      troppoLungo: `${MASSIMO_NOTE_SETTER} characters at most`,
    },
    esitoDelCloser: 'The outcome, the reason for not closing and the extra notes are written by the closer.',
  },
)

/** The outcome sheet (registra-esito.tsx) and the move sheet's fields. */
export const ESITO = bilingue(
  {
    titolo: 'Esito della call',
    registra: 'Registra esito',
    cambiaEsito: 'Cambia esito',
    annullaORimanda: 'Annulla o rimanda',
    cambia: (esito: string) => `${esito}: cambia esito`,
    annullaEsito: 'Annulla l’esito, torna da fare',
    qualificata: 'Era qualificata?',
    si: 'Sì',
    no: 'No',
    salvataggio: 'Salvataggio…',
    oraLaVendita: 'Ora registra la vendita.',
    registrazioneLink: 'Registrazione: link di Fathom',
    alle: (giorno: string, ora: string) => `${giorno} alle ${ora}`,
    esitoNonValido: 'Esito non valido.',
    scegliGiorno: 'Scegli il nuovo giorno',
    giorno: 'Giorno',
    ora: 'Ora',
    ieri: 'Ieri',
    oggi: 'Oggi',
    domani: 'Domani',
    dopodomani: 'Dopodomani',
  },
  {
    titolo: 'Outcome of the call',
    registra: 'Record outcome',
    cambiaEsito: 'Change outcome',
    annullaORimanda: 'Cancel or postpone',
    cambia: (esito: string) => `${esito}: change outcome`,
    annullaEsito: 'Undo the outcome, back to to do',
    qualificata: 'Was it qualified?',
    si: 'Yes',
    no: 'No',
    salvataggio: 'Saving…',
    oraLaVendita: 'Now record the sale.',
    registrazioneLink: 'Recording: Fathom link',
    alle: (giorno: string, ora: string) => `${giorno} at ${ora}`,
    esitoNonValido: 'Invalid outcome.',
    scegliGiorno: 'Choose the new day',
    giorno: 'Day',
    ora: 'Time',
    ieri: 'Yesterday',
    oggi: 'Today',
    domani: 'Tomorrow',
    dopodomani: 'Day after',
  },
)

/** The quick picks of «Sposta» (scorciatoieSpostamento) in the page's language. */
export function scorciatoieIn(oggi: string, admin: boolean, lingua: Lingua): { etichetta: string; valore: string }[] {
  const t = ESITO[lingua]
  return [
    ...(admin ? [{ etichetta: t.ieri, valore: aggiungiGiorni(oggi, -1) }] : []),
    { etichetta: t.oggi, valore: oggi },
    { etichetta: t.domani, valore: aggiungiGiorni(oggi, 1) },
    { etichetta: t.dopodomani, valore: aggiungiGiorni(oggi, 2) },
  ]
}

/** «giovedì 08/10 alle 18:00», «Thursday 08/10 at 18:00» (quandoFollowUpDa). */
export function quandoFollowUpDaIn(giorno: string, ora: string, oggi: string = oggiRoma(), lingua: Lingua = 'it'): string {
  if (lingua === 'it') return quandoFollowUpDa(giorno, ora, oggi)
  const [anno, mese, gg] = giorno.split('-')
  const data = anno === oggi.slice(0, 4) ? `${gg}/${mese}` : `${gg}/${mese}/${anno}`
  return `${GIORNI_EN[parseDataISO(giorno).getDay()]} ${data} at ${ora}`
}

/** The call's pencil (modifica-call.tsx). */
export const MODIFICA_CALL = bilingue(
  {
    nome: (lead: string) => `Modifica la call con ${lead}`,
    titolo: (lead: string) => `Call con ${lead}`,
    tipoENote: 'Tipo e note',
    leNote: 'Le note',
    leTueNote: 'Le tue note',
    siCorreggono: ' si correggono quando vuoi',
    dataEOra: ', data e ora se sono sbagliate',
    perSpostare: ': per spostare la call usa «Sposta»',
    esitoDallaScheda: 'L’esito si registra dalla scheda.',
    data: 'Data',
    ora: 'Ora',
    tipoCall: 'Tipo di call',
    closer: 'Closer',
    comEAndataLegenda: 'Com’è andata la call',
    comEAndata: 'Com’è andata',
    performance: 'Performance',
    link: 'Link alla registrazione',
    prodotto: 'Prodotto proposto',
    nessuno: 'Nessuno',
    importo: 'Importo proposto',
    salva: 'Salva la call',
    aggiornata: 'Call aggiornata',
    elimina: 'Elimina la call',
    cosa: (lead: string) => `la call con ${lead}`,
    eliminata: 'Call eliminata',
    conseguenze: [
      'Il lead resta nella pipeline.',
      'Se da questa call è nata una vendita, la vendita resta, senza la call collegata.',
    ],
  },
  {
    nome: (lead: string) => `Edit the call with ${lead}`,
    titolo: (lead: string) => `Call with ${lead}`,
    tipoENote: 'Type and notes',
    leNote: 'The notes',
    leTueNote: 'Your notes',
    siCorreggono: ' can be corrected whenever you want',
    dataEOra: ', date and time if they are wrong',
    perSpostare: ': to move the call use «Move»',
    esitoDallaScheda: 'The outcome is recorded from the card.',
    data: 'Date',
    ora: 'Time',
    tipoCall: 'Type of call',
    closer: 'Closer',
    comEAndataLegenda: 'How the call went',
    comEAndata: 'How it went',
    performance: 'Performance',
    link: 'Link to the recording',
    prodotto: 'Product pitched',
    nessuno: 'None',
    importo: 'Amount pitched',
    salva: 'Save the call',
    aggiornata: 'Call updated',
    elimina: 'Delete the call',
    cosa: (lead: string) => `the call with ${lead}`,
    eliminata: 'Call deleted',
    conseguenze: [
      'The lead stays in the pipeline.',
      'If a sale came from this call, the sale stays, without the linked call.',
    ],
  },
)

/** «Nuova call» (calls/new). */
export const NUOVA_CALL = bilingue(
  {
    titolo: 'Nuova call',
    indietro: 'Indietro',
    descrizioneAdmin:
      'Fissa una discovery call, anche per un setter, o aggiungi una call già fatta: lead e call nascono insieme.',
    descrizione: 'Fissa una discovery call: lead e call nascono insieme.',
    nessunCloser: 'Nessun closer disponibile',
    nessunCloserAdmin:
      'Per fissare una call serve almeno un closer o un admin attivo. Sistemalo in Impostazioni › Team.',
    nessunCloserSetter:
      'Per fissare una call serve almeno un closer o un admin attivo. Chiedi a Dany di sistemare il team.',
    errore: 'Impossibile caricare il team',
    io: 'Io',
    caricamento: 'Caricamento del modulo',
    nome: 'Nome del lead',
    handle: 'Handle Instagram',
    facoltativo: '(facoltativo)',
    handleAiuto: 'Se il lead ha già una call, la nuova si aggiunge al suo storico.',
    fonte: 'Fonte',
    fonteAiuto: 'Scegli da dove arriva il lead: serve a contare le call prenotate da inbound e da outbound.',
    quando: 'Quando',
    data: 'Data',
    ora: 'Ora',
    setter: 'Setter',
    setterAiuto: 'Chi ha fissato la call: tu, o il setter che l’ha presa in DM. Il lead diventa suo.',
    closer: 'Closer',
    fissa: 'Fissa la call',
    connessione: 'Connessione assente. Controlla la rete e riprova.',
    fatta: (tipo: string, nome: string, giorno: string, ora: string) => `${tipo} call con ${nome}: ${giorno} alle ${ora}`,
    leadEsistente: 'Lead già presente: la call si aggiunge al suo storico.',
    leadNuovo: 'Lead e call creati.',
  },
  {
    titolo: 'New call',
    indietro: 'Back',
    descrizioneAdmin:
      'Book a discovery call, also for a setter, or add a call already held: the lead and the call are created together.',
    descrizione: 'Book a discovery call: the lead and the call are created together.',
    nessunCloser: 'No closer available',
    nessunCloserAdmin: 'Booking a call needs at least one active closer or admin. Set it up in Settings › Team.',
    nessunCloserSetter: 'Booking a call needs at least one active closer or admin. Ask Dany to set up the team.',
    errore: 'The team could not be loaded',
    io: 'Me',
    caricamento: 'Loading the form',
    nome: 'Lead’s name',
    handle: 'Instagram handle',
    facoltativo: '(optional)',
    handleAiuto: 'If the lead already has a call, the new one is added to their history.',
    fonte: 'Source',
    fonteAiuto: 'Choose where the lead comes from: it counts the calls booked from inbound and from outbound.',
    quando: 'When',
    data: 'Date',
    ora: 'Time',
    setter: 'Setter',
    setterAiuto: 'Who booked the call: you, or the setter who got it in the DMs. The lead becomes theirs.',
    closer: 'Closer',
    fissa: 'Book the call',
    connessione: 'No connection. Check the network and try again.',
    fatta: (tipo: string, nome: string, giorno: string, ora: string) => `${tipo} call with ${nome}: ${giorno} at ${ora}`,
    leadEsistente: 'Lead already there: the call is added to their history.',
    leadNuovo: 'Lead and call created.',
  },
)

/** «La vendita c’è già: collegala» (collega-vendita.tsx). */
export const COLLEGA_VENDITA = bilingue(
  {
    riprova: 'Riprova',
    setter: (nome: string) => `Setter: ${nome}`,
    senzaSetter: 'Senza setter',
  },
  {
    riprova: 'Try again',
    setter: (nome: string) => `Setter: ${nome}`,
    senzaSetter: 'No setter',
  },
)

/** The recording on the card and the Fathom texts (registrazione-call.tsx, testo-fathom.tsx, passo-registrazione.tsx). */
export const FATHOM_TESTI = bilingue(
  {
    scollegata: 'Registrazione scollegata.',
    toccaAncora: 'Tocca ancora per scollegare',
    leggo: 'Leggo da Fathom…',
    nonCaricata: 'Non si è caricata. Riprova.',
    riprova: 'Riprova',
    senzaTrascrizione: 'Fathom non ha ancora la trascrizione di questa call.',
    cerca: 'Cerca nel testo',
    cercaNome: 'Cerca nella trascrizione',
    alMinuto: (t: string) => `Apri la registrazione al minuto ${t}`,
    nessunPassaggio: 'Nessun passaggio con queste parole.',
    senzaRiassunto: 'Fathom non ha ancora il riassunto di questa call.',
    chi: { closer: 'Closer', lead: 'Lead', altro: 'Altro' },
    inItaliano: 'La trascrizione è la call com’è stata detta, in italiano.',
    senzaOrario: 'senza orario',
    oggiAlle: (ora: string) => `oggi alle ${ora}`,
    alle: (data: string, ora: string) => `${data} alle ${ora}`,
  },
  {
    scollegata: 'Recording untied.',
    toccaAncora: 'Tap again to untie',
    leggo: 'Reading from Fathom…',
    nonCaricata: 'It did not load. Try again.',
    riprova: 'Try again',
    senzaTrascrizione: 'Fathom does not have the transcript of this call yet.',
    cerca: 'Search the text',
    cercaNome: 'Search the transcript',
    alMinuto: (t: string) => `Open the recording at minute ${t}`,
    nessunPassaggio: 'No passage with these words.',
    senzaRiassunto: 'Fathom does not have the summary of this call yet.',
    chi: { closer: 'Closer', lead: 'Lead', altro: 'Other' },
    inItaliano: 'The transcript is the call as it was spoken, in Italian.',
    senzaOrario: 'no time',
    oggiAlle: (ora: string) => `today at ${ora}`,
    alle: (data: string, ora: string) => `${data} at ${ora}`,
  },
)
