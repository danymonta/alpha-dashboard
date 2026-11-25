import { DOMANDE, domanda, domandaDaRiga, ETICHETTE_ESERCIZI, rispostaInParole, type Domanda, type RigaDomanda } from '@/lib/percorso/questionario'
import { ESERCIZI_MASSIMALI, NON_LO_SO, type Risposte } from '@/lib/validation/questionario'

/**
 * The row of a sent questionnaire on Dany's sheet «questionario-e-mappatura-allievi», tab
 * «Risposte del modulo» (1.82.0, docs/onboarding/specifica-v7.md section 6): the columns of the
 * Google form, A to AC, the four columns of the team (AD-AG: payment, renewal, sum, notes) left
 * alone, and AH with the opaque reference that finds the row again. From 1.88.0 a question the admin adds
 * has its own column after AH (AI, AJ, …, onboarding_domande.colonna), with its words in row 1.
 * Pure: tests/onboarding-foglio.test.ts.
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

function etichetta(domande: readonly Domanda[], chiave: string, valore: unknown): string {
  if (valore == null || valore === '') return ''
  if (typeof valore !== 'string' && typeof valore !== 'number') return ''
  const d = domanda(domande, chiave)
  if (d && (d.tipo === 'scelta' || d.tipo === 'scelte' || d.tipo === 'abitudini')) {
    const o = d.opzioni.find((x) => x.valore === String(valore))
    if (o) return o.dettaglio ? `${o.etichetta} ${o.dettaglio}` : o.etichetta
  }
  return String(valore)
}

function testo(v: unknown): string {
  return typeof v === 'string' ? v : ''
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

function abitudini(domande: readonly Domanda[], r: Risposte): string {
  const scelte = (r.cattive_abitudini?.scelte ?? []).map((s) => etichetta(domande, 'cattive_abitudini', s))
  const altro = r.cattive_abitudini?.altro?.trim()
  return [...scelte, ...(altro ? [`Altro: ${altro}`] : [])].join(', ')
}

/**
 * The 29 cells A to AC of a questionnaire, in the order of the sheet's columns. `dataInizio` is
 * the start of the path of the sale (AB); AC is «Attivo». The labels of the options are the ones
 * of the questions as they are now (the admin can rename them).
 */
export function rigaFoglio(
  r: Risposte,
  inviatoIl: string,
  dataInizio: string | null,
  domande: readonly Domanda[] = DOMANDE,
): (string | number)[] {
  const t = (v: unknown) => testoSicuro(testo(v))
  const etichetta_ = (chiave: string, v: unknown) => etichetta(domande, chiave, v)
  return [
    momentoFoglio(inviatoIl), // A Informazioni cronologiche
    t(r.email), // B Indirizzo email
    t(r.telefono), // C Numero di telefono (Telegram)
    t(r.nome_cognome), // D Nome e Cognome
    altezzaPeso(r), // E Altezza / Peso
    giornoFoglio(testo(r.data_nascita)), // F Data di nascita
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
    etichetta_('pronto', r.pronto), // Q Pronto e motivato
    t(r.ore_sonno), // R Ore di sonno
    t(r.importanza_tecnica), // S Importanza della tecnica
    etichetta_('seguito_alimentazione', r.seguito_alimentazione), // T Piano alimentare
    t(r.organizzazione_giornata), // U Organizzazione della giornata
    etichetta_('livello_attivita', r.livello_attivita), // V Livello di attività
    t(r.conoscenza_alimentazione), // W Come si mangia bene
    t(abitudini(domande, r)), // X Cattive abitudini
    t(r.successo), // Y Successo
    etichetta_('minuti_giorno', r.minuti_giorno), // Z Tempo per ogni giorno
    t(r.note), // AA Note
    giornoFoglio(dataInizio), // AB Data Inizio Percorso
    'Attivo', // AC Cliente Attivo/Non attivo
  ]
}


/** A column of the sheet from its 0-based index: 0 = A, 25 = Z, 26 = AA, 34 = AI. */
export function lettera(indice: number): string {
  let n = indice + 1
  let fuori = ''
  while (n > 0) {
    const resto = (n - 1) % 26
    fuori = String.fromCharCode(65 + resto) + fuori
    n = Math.floor((n - 1) / 26)
  }
  return fuori
}

/** A question added by the admin, with its column of the sheet. */
export type ColonnaExtra = { colonna: number; lettera: string; intestazione: string; domanda: Domanda | null; chiave: string }

/** The columns after AH of the questions added by the admin (hidden ones too: a column is never reused), in order. */
export function colonneExtra(righe: readonly RigaDomanda[]): ColonnaExtra[] {
  return righe
    .filter((r): r is RigaDomanda & { colonna: number } => typeof r.colonna === 'number' && !r.sistema)
    .sort((a, b) => a.colonna - b.colonna)
    .map((r) => ({
      colonna: r.colonna,
      lettera: lettera(r.colonna),
      intestazione: testoSicuro(r.testo),
      domanda: domandaDaRiga(r),
      chiave: r.chiave,
    }))
}

/** The answer of a question added by the admin, as a cell: its words (a choice by its label, a day as 21/03/1996). */
export function cellaExtra(c: ColonnaExtra, r: Risposte): string | number {
  const v = r[c.chiave]
  if (v === null || v === undefined || !c.domanda) return ''
  if (c.domanda.tipo === 'numero') return typeof v === 'number' ? v : ''
  if (c.domanda.tipo === 'data') return giornoFoglio(testo(v))
  if (c.domanda.tipo === 'scelte' && Array.isArray(v)) {
    return testoSicuro(v.map((x) => etichetta([c.domanda!], c.chiave, x)).join(', '))
  }
  return testoSicuro(rispostaInParole(c.domanda, v) ?? '')
}
