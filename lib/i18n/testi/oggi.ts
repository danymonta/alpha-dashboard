import { bilingue, type Lingua } from '@/lib/i18n/lingua'
import { LEGENDA_SETTING_EN } from '@/lib/metriche/legenda-en'
import { COMMENTO_OBBLIGATORIO, MASSIMO_TESTO_COMMENTO } from '@/lib/setting/commento'
import { GRUPPI_REPORT, MASSIMO_GIORNALIERO } from '@/lib/validation/report'

/**
 * The setter's «Oggi» (1.53.0): the day's header, the save bar, the counters, the
 * content switch, the reminder of the days without comment. The words of «Com’è
 * andata la giornata» are in commento-giornata.ts, those of the Instagram cards in
 * proposte.ts.
 */
export const OGGI = bilingue(
  {
    giornoPrecedente: 'Giorno precedente',
    giornoSuccessivo: 'Giorno successivo',
    unAltroGiorno: 'Un altro giorno',
    scegliGiorno: 'Scegli il giorno del report',
    caricamento: 'Caricamento del report',
    errore: 'Impossibile caricare il report',
    contenuto: 'Contenuto',
    contenutoPubblicato: 'Contenuto pubblicato',
    contenutoAiuto: 'Se è uscito un contenuto sul profilo',
    sommaDm: '= outbound + inbound + follow up',
    nonCompilato: 'Non ancora compilato. Si salva da solo al primo tocco.',
    salvataggio: 'Salvataggio…',
    salvatoAlle: 'Salvato alle',
    nonSalvato: (messaggio: string) => `Non salvato. ${messaggio}`,
    riprova: 'Riprova',
    reportNonSalvato: (messaggio: string) => `Report non salvato. ${messaggio}`,
    avviato: (giorno: string) => `Report di ${giorno} avviato`,
    connessioneAssente: 'Connessione assente. Riprova.',
    rilettura: {
      toast:
        'Il report di questo giorno è cambiato da un’altra parte: ricarico i numeri salvati. Rifai l’ultima modifica, se serve.',
      barra: 'Ricarico i numeri salvati…',
    },
  },
  {
    giornoPrecedente: 'Previous day',
    giornoSuccessivo: 'Next day',
    unAltroGiorno: 'Another day',
    scegliGiorno: 'Choose the day of the report',
    caricamento: 'Loading the report',
    errore: 'The report could not be loaded',
    contenuto: 'Content',
    contenutoPubblicato: 'Content published',
    contenutoAiuto: 'Whether a piece of content went out on the profile',
    sommaDm: '= outbound + inbound + follow-ups',
    nonCompilato: 'Not filled in yet. It saves by itself at the first tap.',
    salvataggio: 'Saving…',
    salvatoAlle: 'Saved at',
    nonSalvato: (messaggio: string) => `Not saved. ${messaggio}`,
    riprova: 'Try again',
    reportNonSalvato: (messaggio: string) => `Report not saved. ${messaggio}`,
    avviato: (giorno: string) => `Report for ${giorno} started`,
    connessioneAssente: 'No connection. Try again.',
    rilettura: {
      toast: 'This day’s report changed somewhere else: reloading the saved numbers. Redo your last change, if needed.',
      barra: 'Reloading the saved numbers…',
    },
  },
)

type GruppoReport = (typeof GRUPPI_REPORT)[number]

const AIUTI_EN: Record<string, string> = {
  dm_outbound: 'New people you write to first',
  dm_inbound: 'New people who ask you about the programme and get your answer',
  follow_up: 'Nudges to people who have not answered you yet',
  conversazioni: 'People who answer you and you answer again, the next day too',
  call_proposte: 'People you offer a call to',
  discovery_prenotate: 'Discovery calls you book on this day',
}

const TITOLI_EN: Record<string, string> = { Messaggi: 'Messages', Conversazioni: 'Conversations', Call: 'Calls' }

const GRUPPI_REPORT_EN: GruppoReport[] = GRUPPI_REPORT.map((gruppo) => ({
  ...gruppo,
  titolo: TITOLI_EN[gruppo.titolo] ?? gruppo.titolo,
  ...(gruppo.nota ? { nota: 'Not part of the total DMs.' } : {}),
  campi: gruppo.campi.map(([campo, etichetta, aiuto]): GruppoReport['campi'][number] => [
    campo,
    (LEGENDA_SETTING_EN as Record<string, { etichetta: string } | undefined>)[campo]?.etichetta ?? etichetta,
    AIUTI_EN[campo] ?? aiuto,
  ]),
}))

/** The report's counters (lib/validation/report.ts) with their words in the page's language. */
export function gruppiReport(lingua: Lingua): readonly GruppoReport[] {
  return lingua === 'it' ? GRUPPI_REPORT : GRUPPI_REPORT_EN
}

/** «oggi», «ieri», «lunedì 05/10» / «today», «yesterday», «Monday 05/10»: a day inside a sentence. */
export function giornoInFrase(etichetta: string, lingua: Lingua): string {
  if (lingua === 'it') return etichetta.toLowerCase()
  return ['Today', 'Yesterday', 'Tomorrow'].includes(etichetta) ? etichetta.toLowerCase() : etichetta
}

/**
 * The fixed sentences of the setter's area as the server actions and the schemas write
 * them (Italian: Alfire and Claude read them too), in the page's language. An unknown
 * sentence (a database message, written for people in Italian) stays as it came.
 */
const ERRORI_EN: Record<string, string> = {
  'Connessione assente. Riprova.': 'No connection. Try again.',
  'Dati non validi.': 'Invalid data.',
  'Report non valido': 'Invalid report',
  'Report non valido.': 'Invalid report.',
  'Sessione scaduta. Rientra e riprova.': 'Session expired. Sign in again and retry.',
  'Il report giornaliero lo compila il setter.': 'The daily report is filled in by the setter.',
  'Un giorno che non è ancora arrivato non si compila.': 'A day that has not come yet cannot be filled in.',
  'Salvataggio non riuscito. Riprova.': 'Saving failed. Try again.',
  'Il report di quel giorno è cambiato nel frattempo: rileggilo e riprova.':
    'That day’s report changed meanwhile: read it again and retry.',
  'La proposta la decide il setter che lavora i DM.': 'The proposal is decided by the setter who works the DMs.',
  'Le giornate dei setter le decide l’admin da qui.': 'The admin decides the setters’ days from here.',
  'Conferma non riuscita. Riprova.': 'Confirmation failed. Try again.',
  'Non riuscito. Riprova.': 'It did not work. Try again.',
  'Questa proposta non c’è più.': 'This proposal is not there any more.',
  'Proposta non valida': 'Invalid proposal',
  'Report non aggiornato. Riprova.': 'Report not updated. Try again.',
  'Report non trovato.': 'Report not found.',
  'Il futuro non si compila: scegli oggi o un giorno passato.': 'The future cannot be filled in: choose today or a past day.',
  'Giornata non salvata. Riprova.': 'Day not saved. Try again.',
  'Report non eliminato. Riprova.': 'Report not deleted. Try again.',
  'Data non valida': 'Invalid date',
  'Deve essere un numero': 'Must be a number',
  'Solo numeri interi': 'Whole numbers only',
  'Non può essere negativo': 'Cannot be negative',
  [`Al massimo ${MASSIMO_GIORNALIERO}`]: `At most ${MASSIMO_GIORNALIERO}`,
  [`Al massimo ${MASSIMO_TESTO_COMMENTO} caratteri`]: `At most ${MASSIMO_TESTO_COMMENTO} characters`,
  [COMMENTO_OBBLIGATORIO.errore.lead_in_target]: 'Choose how many leads were on target',
  [COMMENTO_OBBLIGATORIO.errore.qualita_conversazioni]: 'Choose how the conversations were',
  [COMMENTO_OBBLIGATORIO.errore.cosa_frenava]: 'Write what held the leads back',
}

/** «Il 05/10/2026 c’è già: correggilo dalla tabella qui sotto, con la matita.» (aggiungiReport). */
const GIA_C_E = /^Il (\d{2}\/\d{2}\/\d{4}) c’è già: correggilo dalla tabella qui sotto, con la matita\.$/

export function traduciErroreSetting(testo: string, lingua: Lingua): string
export function traduciErroreSetting(testo: string | null | undefined, lingua: Lingua): string | null | undefined
export function traduciErroreSetting(testo: string | null | undefined, lingua: Lingua): string | null | undefined {
  if (!testo || lingua === 'it') return testo
  const noto = ERRORI_EN[testo]
  if (noto) return noto
  const m = GIA_C_E.exec(testo)
  if (m) return `${m[1]} is already there: correct it from the table below, with the pencil.`
  return testo
}
