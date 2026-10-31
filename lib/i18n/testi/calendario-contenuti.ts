import { GIORNI_EN, parseDataISO } from '@/lib/format'
import { bilingue } from '@/lib/i18n/lingua'

/**
 * The calendar view of the Piano editoriale (1.69.0, Dany, 31/10/2026: «la
 * parte di visualizzazione a calendario per i reel… come su notion»). The Status
 * and the labels keep Notion's English names in both languages.
 */

const GIORNI_IT = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'] as const

/** "06/10" */
function ggmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}

function giornoIt(iso: string): string {
  return `${GIORNI_IT[parseDataISO(iso).getDay()]} ${ggmm(iso)}`
}

function giornoEn(iso: string): string {
  return `${GIORNI_EN[parseDataISO(iso).getDay()]} ${ggmm(iso)}`
}

function contenutiIt(n: number): string {
  return n === 1 ? '1 contenuto' : `${n} contenuti`
}

function contenutiEn(n: number): string {
  return n === 1 ? '1 content' : `${n} contents`
}

export const CALENDARIO_CONTENUTI = bilingue(
  {
    vista: 'Vista del Piano editoriale',
    tabella: 'Tabella',
    calendario: 'Calendario',
    scegliMese: 'Scegli il mese',
    mesePrecedente: 'Mese precedente',
    meseSuccessivo: 'Mese successivo',
    oggi: 'Oggi',
    oggiAria: 'Oggi: torna al mese corrente',
    giorniBrevi: ['lun', 'mar', 'mer', 'gio', 'ven', 'sab', 'dom'],
    giorniLunghi: ['lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato', 'domenica'],
    /** "lunedì 06/10" */
    giorno: (iso: string) => giornoIt(iso),
    /** The heading of a day of the agenda: "Oggi, lunedì 06/10", "Martedì 07/10". */
    titoloGiorno: (iso: string, oggi: string) =>
      iso === oggi ? `Oggi, ${giornoIt(iso)}` : giornoIt(iso).replace(/^./, (c) => c.toUpperCase()),
    caption: (mese: string) => `Contenuti di ${mese}, per giorno`,
    nuovoPer: (iso: string) => `Nuovo contenuto per ${giornoIt(iso)}`,
    /** What the screen reader adds after "+2": the name starts with the words on screen (WCAG 2.5.3). */
    altriDopo: (n: number, iso: string) => ` ${n === 1 ? 'altro contenuto' : 'altri contenuti'} di ${giornoIt(iso)}`,
    mostraMeno: 'Mostra meno',
    menoDopo: (iso: string) => ` contenuti di ${giornoIt(iso)}`,
    vuotoMese: (mese: string) => `Niente in calendario a ${mese}`,
    vuotoMeseDescrizione: 'Tocca «+» su un giorno del calendario, o aggiungi un contenuto da qui.',
    vuotoMeseFiltri: 'Con questi filtri non c’è niente in questo mese: toglili o cambia mese.',
    nuovoContenuto: 'Nuovo contenuto',
    creato: 'Contenuto creato: scrivi il nome',
    connessione: 'Connessione assente. Riprova.',
    senzaData: 'Senza data',
    altriSenzaData: (n: string) => `E altri ${n}:`,
    usaTabella: 'usa la Tabella',
    trascina:
      'Trascina un contenuto su un altro giorno per cambiarne la Post Date. Da tastiera o dal telefono: aprilo e cambia la Post Date nel pannello.',
    legenda: 'Status del mese',
    legendaAiuto: 'Il colore di ogni contenuto è il suo Status. Tocca uno Status per vedere solo quelli, di nuovo per toglierlo.',
    voceLegenda: (nome: string, n: number, attiva: boolean) =>
      `${nome}, ${contenutiIt(n)}${attiva ? ': filtro attivo, tocca per toglierlo' : ': tocca per vedere solo questi'}`,
    miniMese: (mese: string) => `${mese}: i pallini sono gli Status dei contenuti di ogni giorno`,
    giornoConContenuti: (iso: string, n: number, stati: string) => `${giornoIt(iso)}, ${contenutiIt(n)}: ${stati}`,
    card: (nome: string, stato: string, etichetta: string | null) => `${nome}, ${stato}${etichetta ? `, ${etichetta}` : ''}`,
    caricamento: 'Caricamento del calendario',
  },
  {
    vista: 'Content plan view',
    tabella: 'Table',
    calendario: 'Calendar',
    scegliMese: 'Choose the month',
    mesePrecedente: 'Previous month',
    meseSuccessivo: 'Next month',
    oggi: 'Today',
    oggiAria: 'Today: back to the current month',
    giorniBrevi: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    giorniLunghi: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    giorno: (iso: string) => giornoEn(iso),
    titoloGiorno: (iso: string, oggi: string) => (iso === oggi ? `Today, ${giornoEn(iso)}` : giornoEn(iso)),
    caption: (mese: string) => `Contents of ${mese}, by day`,
    nuovoPer: (iso: string) => `New content for ${giornoEn(iso)}`,
    altriDopo: (n: number, iso: string) => ` more ${n === 1 ? 'content' : 'contents'} on ${giornoEn(iso)}`,
    mostraMeno: 'Show less',
    menoDopo: (iso: string) => ` contents on ${giornoEn(iso)}`,
    vuotoMese: (mese: string) => `Nothing in the calendar in ${mese}`,
    vuotoMeseDescrizione: 'Tap «+» on a day of the calendar, or add a content from here.',
    vuotoMeseFiltri: 'With these filters there is nothing this month: remove them or change month.',
    nuovoContenuto: 'New content',
    creato: 'Content created: write the name',
    connessione: 'No connection. Try again.',
    senzaData: 'No date',
    altriSenzaData: (n: string) => `And ${n} more:`,
    usaTabella: 'use the Table',
    trascina:
      'Drag a content onto another day to change its Post Date. From the keyboard or the phone: open it and change the Post Date in the panel.',
    legenda: 'Status this month',
    legendaAiuto: 'Each content’s colour is its Status. Tap a Status to see only those, again to remove it.',
    voceLegenda: (nome: string, n: number, attiva: boolean) =>
      `${nome}, ${contenutiEn(n)}${attiva ? ': filter on, tap to remove it' : ': tap to see only these'}`,
    miniMese: (mese: string) => `${mese}: the dots are the Status of each day’s contents`,
    giornoConContenuti: (iso: string, n: number, stati: string) => `${giornoEn(iso)}, ${contenutiEn(n)}: ${stati}`,
    card: (nome: string, stato: string, etichetta: string | null) => `${nome}, ${stato}${etichetta ? `, ${etichetta}` : ''}`,
    caricamento: 'Loading the calendar',
  },
)
