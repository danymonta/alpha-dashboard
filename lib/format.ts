/**
 * Presentation only. Every amount and every metric is computed in SQL:
 * TypeScript just formats what the database already decided.
 *
 * The one place where numbers and dates take a language (1.53.0): formato(lingua)
 * gives the same functions in Italian («1.250,00 €», «22/10/2026», «ottobre 2026»)
 * or in English («€1,250.00», «22 Oct 2026», «October 2026»). The plain exports
 * below are the Italian ones, unchanged: the base language of the app.
 */

import { LOCALE, type Lingua } from '@/lib/i18n/lingua'

/** Placeholder for "no value": never NaN, never Infinity, never 0 by accident. */
export const VUOTO = '–'

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(n) ? n : null
}

/** Ratio with a guarded denominator: returns null instead of NaN/Infinity. */
export function rapporto(
  numeratore: number | string | null | undefined,
  denominatore: number | string | null | undefined,
): number | null {
  const a = toNumber(numeratore)
  const b = toNumber(denominatore)
  if (a === null || b === null || b === 0) return null
  return a / b
}

/** 'YYYY-MM-DD' from Postgres, parsed as a local date (no timezone drift). */
export function parseDataISO(value: string | Date): Date {
  if (value instanceof Date) return value
  const [anno, mese_, giorno] = value.slice(0, 10).split('-').map(Number)
  return new Date(anno, mese_ - 1, giorno)
}

/** First day of the month, as the 'YYYY-MM-DD' the database expects. */
export function primoDelMese(value: string | Date): string {
  const d = parseDataISO(value)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

/**
 * The English names, written out: the ICU of the server and of the browser do not
 * always agree ("Sept" or "Sep"), and a page rendered on one and hydrated on the
 * other must print the same letters.
 */
export const MESI_EN = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const
export const MESI_BREVI_EN = MESI_EN.map((m) => m.slice(0, 3))
export const GIORNI_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
export const GIORNI_BREVI_EN = GIORNI_EN.map((g) => g.slice(0, 3))

export type Formato = {
  lingua: Lingua
  formatEuro: (value: number | string | null | undefined, opzioni?: { compatto?: boolean }) => string
  formatNumero: (value: number | string | null | undefined) => string
  /** Takes a ratio (0.42), prints "42%". */
  formatPercentuale: (value: number | string | null | undefined, opzioni?: { unDecimale?: boolean }) => string
  /** Signed delta against the previous period, e.g. "+12,5%". */
  formatDelta: (value: number | null | undefined) => string
  /** dd/MM/yyyy in Italian, "22 Oct 2026" in English. */
  formatData: (value: string | Date | null | undefined) => string
  /** "settembre 2026", "September 2026" */
  formatMese: (value: string | Date | null | undefined) => string
  /** "set" for chart ticks; January also carries the year ("gen 27", "Jan 27"). */
  formatMeseBreve: (value: string) => string
  /** Axis ticks: "0 €", "800 €", "1,5k €" ("€0", "€800", "€1.5k"). */
  formatEuroAsse: (value: number) => string
  /** "agosto", "August" (no year). */
  formatNomeMese: (value: string) => string
  /** Ratios like "DM per call": 12,5 (12.5). */
  formatRapporto: (value: number | string | null | undefined) => string
  /** "1.500,00": the way an amount is shown inside an editable field (always Italian: the forms read it so). */
  formatImportoInput: (value: number | string | null | undefined) => string
}

function crea(lingua: Lingua): Formato {
  const locale = LOCALE[lingua]
  const euro = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    // it-IT would print "4500,00 €": in a column of amounts the dot must always be there
    useGrouping: 'always',
  })
  const euroCompatto = new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
    useGrouping: 'always',
  })
  const numero = new Intl.NumberFormat(locale, { useGrouping: 'always' })
  const percentuale = new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  })
  const percentualeUnDecimale = new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
  const unDecimale = new Intl.NumberFormat(locale, { maximumFractionDigits: 1, useGrouping: 'always' })
  const migliaia = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const importoInput = new Intl.NumberFormat('it-IT', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    useGrouping: 'always',
  })
  const meseIt = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' })
  const meseBreveIt = new Intl.DateTimeFormat('it-IT', { month: 'short' })
  const nomeMeseIt = new Intl.DateTimeFormat('it-IT', { month: 'long' })
  const inglese = lingua === 'en'

  const data = (value: string | Date | null | undefined): Date | null => {
    if (!value) return null
    const d = parseDataISO(value)
    return Number.isNaN(d.getTime()) ? null : d
  }

  return {
    lingua,
    formatEuro(value, { compatto = false } = {}) {
      const n = toNumber(value)
      if (n === null) return VUOTO
      return compatto ? euroCompatto.format(n) : euro.format(n)
    },
    formatNumero(value) {
      const n = toNumber(value)
      return n === null ? VUOTO : numero.format(n)
    },
    formatPercentuale(value, { unDecimale: uno = false } = {}) {
      const n = toNumber(value)
      return n === null ? VUOTO : (uno ? percentualeUnDecimale : percentuale).format(n)
    },
    formatDelta(value) {
      if (value === null || value === undefined || !Number.isFinite(value)) return VUOTO
      const segno = value > 0 ? '+' : ''
      return `${segno}${percentuale.format(value)}`
    },
    formatData(value) {
      const d = data(value)
      if (!d) return VUOTO
      const gg = String(d.getDate()).padStart(2, '0')
      if (inglese) return `${gg} ${MESI_BREVI_EN[d.getMonth()]} ${d.getFullYear()}`
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      return `${gg}/${mm}/${d.getFullYear()}`
    },
    formatMese(value) {
      const d = data(value)
      if (!d) return VUOTO
      return inglese ? `${MESI_EN[d.getMonth()]} ${d.getFullYear()}` : meseIt.format(d)
    },
    formatMeseBreve(value) {
      const d = parseDataISO(value)
      const m = inglese ? MESI_BREVI_EN[d.getMonth()] : meseBreveIt.format(d).replace('.', '')
      return d.getMonth() === 0 ? `${m} ${String(d.getFullYear()).slice(2)}` : m
    },
    formatEuroAsse(value) {
      if (inglese) {
        if (Math.abs(value) < 1000) return `€${numero.format(Math.round(value))}`
        return `€${migliaia.format(value / 1000)}k`
      }
      if (Math.abs(value) < 1000) return `${numero.format(Math.round(value))} €`
      return `${migliaia.format(value / 1000)}k €`
    },
    formatNomeMese(value) {
      const d = parseDataISO(value)
      return inglese ? MESI_EN[d.getMonth()] : nomeMeseIt.format(d)
    },
    formatRapporto(value) {
      const n = toNumber(value)
      return n === null ? VUOTO : unDecimale.format(n)
    },
    formatImportoInput(value) {
      const n = toNumber(value)
      return n === null ? '' : importoInput.format(n)
    },
  }
}

const FORMATI: Record<Lingua, Formato> = { it: crea('it'), en: crea('en') }

/** The formatting of a language: destructure it where the page knows its language. */
export function formato(lingua: Lingua): Formato {
  return FORMATI[lingua]
}

// The Italian ones, as the app always had them.
const IT = FORMATI.it
export const formatEuro = IT.formatEuro
export const formatNumero = IT.formatNumero
export const formatPercentuale = IT.formatPercentuale
export const formatDelta = IT.formatDelta
export const formatData = IT.formatData
export const formatMese = IT.formatMese
export const formatMeseBreve = IT.formatMeseBreve
export const formatEuroAsse = IT.formatEuroAsse
export const formatNomeMese = IT.formatNomeMese
export const formatRapporto = IT.formatRapporto
export const formatImportoInput = IT.formatImportoInput
