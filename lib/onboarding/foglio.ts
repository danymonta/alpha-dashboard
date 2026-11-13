import { domanda, ETICHETTE_ESERCIZI } from '@/lib/percorso/questionario'
import { ESERCIZI_MASSIMALI, NON_LO_SO, type Risposte } from '@/lib/validation/questionario'

/**
 * The row of a sent questionnaire on Dany's sheet «questionario-e-mappatura-allievi», tab
 * «Risposte del modulo» (1.82.0, docs/onboarding/specifica-v7.md section 6): the columns of the
 * Google form, A to AC, the four columns of the team (AD-AG: payment, renewal, sum, notes) left
 * alone, and AH with the opaque reference that finds the row again. Pure: tests/onboarding-foglio.test.ts.
 */

/** The columns written by the app, in order. AD-AG are the team's and are never touched. */
export const COLONNE_RISPOSTE = 'A:AC'
export const COLONNA_RIF = 'AH'
export const INTESTAZIONE_RIF = 'ID Alpha (non modificare)'

/** A text never starts a formula in the sheet (USER_ENTERED): «=», «+», «-», «@» get an apostrophe. */
export function testoSicuro(v: string | null | undefined): string {
  const s = (v ?? '').replace(/\r\n?/g, '\n').trim()
  return /^[=+\-@]/.test(s) ? `'${s}` : s
}

const fuso = 'Europe/Rome'

function parti(d: Date): Record<string, string> {
  const fmt = new Intl.DateTimeFormat('it-IT', {
    timeZone: fuso,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  })
  return Object.fromEntries(fmt.formatToParts(d).map((p) => [p.type, p.value]))
}

/** «13/11/2026 15.04.12», as the form writes «Informazioni cronologiche». */
export function momentoFoglio(iso: string): string {
  const p = parti(new Date(iso))
  return `${p.day}/${p.month}/${p.year} ${p.hour}.${p.minute}.${p.second}`
}

/** «1996-03-21» → «21/03/1996». */
export function giornoFoglio(giorno: string | null | undefined): string {
  if (!giorno) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(giorno)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

function etichetta(chiave: keyof Risposte, valore: string | null | undefined): string {
  if (valore == null || valore === '') return ''
  const d = domanda(chiave)
  if (d && (d.tipo === 'scelta' || d.tipo === 'abitudini')) {
    const o = d.opzioni.find((x) => x.valore === valore)
    if (o) return o.dettaglio ? `${o.etichetta} ${o.dettaglio}` : o.etichetta
  }
  return valore
}

function numeroIt(n: number): string {
  return String(n).replace('.', ',')
}

function altezzaPeso(r: Risposte): string {
  const a = r.altezza_peso?.altezza
  const p = r.altezza_peso?.peso
  if (a == null && p == null) return ''
  return `${a != null ? `${a} cm` : '-'} / ${p != null ? `${numeroIt(p)} kg` : '-'}`
}

function massimali(r: Risposte): string {
  const m = r.massimali
  if (!m) return ''
  return ESERCIZI_MASSIMALI.map((e) => {
    const v = m[e]
    const testo = v === NON_LO_SO ? 'non lo so' : v == null ? '-' : String(v)
    return `${ETICHETTE_ESERCIZI[e]}: ${testo}`
  }).join(', ')
}

function abitudini(r: Risposte): string {
  const scelte = (r.cattive_abitudini?.scelte ?? []).map((s) => etichetta('cattive_abitudini', s))
  const altro = r.cattive_abitudini?.altro?.trim()
  return [...scelte, ...(altro ? [`Altro: ${altro}`] : [])].join(', ')
}

/**
 * The 29 cells A to AC of a questionnaire, in the order of the sheet's columns. `dataInizio` is
 * the start of the path of the sale (AB); AC is «Attivo».
 */
export function rigaFoglio(r: Risposte, inviatoIl: string, dataInizio: string | null): (string | number)[] {
  const t = (v: string | null | undefined) => testoSicuro(v)
  return [
    momentoFoglio(inviatoIl), // A Informazioni cronologiche
    t(r.email), // B Indirizzo email
    t(r.telefono), // C Numero di telefono (Telegram)
    t(r.nome_cognome), // D Nome e Cognome
    altezzaPeso(r), // E Altezza / Peso
    giornoFoglio(r.data_nascita), // F Data di nascita
    t(r.obiettivo_principale), // G Il tuo obiettivo N°1
    t(r.occupazione), // H Occupazione
    t(r.storia_allenamento), // I Da quanto tempo ti alleni
    r.giorni_settimana ?? '', // J Quanti giorni a settimana
    t(r.infortuni), // K Infortuni
    t(r.perche_noi), // L Cosa ti ha spinto
    t(r.obiettivi_3_6_mesi), // M Prossimi 3-6 mesi
    t(r.attrezzatura), // N Attrezzatura
    massimali(r), // O Massimo numero di ripetizioni
    t(r.esercizi_difficolta), // P Esercizi più e meno difficili
    etichetta('pronto', r.pronto), // Q Pronto e motivato
    t(r.ore_sonno), // R Ore di sonno
    t(r.importanza_tecnica), // S Importanza della tecnica
    etichetta('seguito_alimentazione', r.seguito_alimentazione), // T Piano alimentare
    t(r.organizzazione_giornata), // U Organizzazione della giornata
    etichetta('livello_attivita', r.livello_attivita), // V Livello di attività
    t(r.conoscenza_alimentazione), // W Come si mangia bene
    t(abitudini(r)), // X Cattive abitudini
    t(r.successo), // Y Successo
    etichetta('minuti_giorno', r.minuti_giorno), // Z Tempo per ogni giorno
    t(r.note), // AA Note
    giornoFoglio(dataInizio), // AB Data Inizio Percorso
    'Attivo', // AC Cliente Attivo/Non attivo
  ]
}
