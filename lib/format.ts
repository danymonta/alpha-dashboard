/**
 * Presentation only. Every amount and every metric is computed in SQL:
 * TypeScript just formats what the database already decided.
 */

const euro = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  // it-IT would print "4500,00 €": in a column of amounts the dot must always be there
  useGrouping: 'always',
})

const euroCompatto = new Intl.NumberFormat('it-IT', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  useGrouping: 'always',
})

const numero = new Intl.NumberFormat('it-IT', { useGrouping: 'always' })

const percentuale = new Intl.NumberFormat('it-IT', {
  style: 'percent',
  minimumFractionDigits: 0,
  maximumFractionDigits: 1,
})

const mese = new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' })

/** Placeholder for "no value": never NaN, never Infinity, never 0 by accident. */
export const VUOTO = '–'

function toNumber(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const n = typeof value === 'string' ? Number(value) : value
  return Number.isFinite(n) ? n : null
}

export function formatEuro(
  value: number | string | null | undefined,
  { compatto = false }: { compatto?: boolean } = {},
): string {
  const n = toNumber(value)
  if (n === null) return VUOTO
  return compatto ? euroCompatto.format(n) : euro.format(n)
}

export function formatNumero(value: number | string | null | undefined): string {
  const n = toNumber(value)
  return n === null ? VUOTO : numero.format(n)
}

/** Takes a ratio (0.42), prints "42%". */
export function formatPercentuale(value: number | string | null | undefined): string {
  const n = toNumber(value)
  return n === null ? VUOTO : percentuale.format(n)
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

/** Signed delta against the previous period, e.g. "+12,5%". */
export function formatDelta(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return VUOTO
  const segno = value > 0 ? '+' : ''
  return `${segno}${percentuale.format(value)}`
}

/** 'YYYY-MM-DD' from Postgres, parsed as a local date (no timezone drift). */
export function parseDataISO(value: string | Date): Date {
  if (value instanceof Date) return value
  const [anno, mese_, giorno] = value.slice(0, 10).split('-').map(Number)
  return new Date(anno, mese_ - 1, giorno)
}

/** dd/MM/yyyy */
export function formatData(value: string | Date | null | undefined): string {
  if (!value) return VUOTO
  const d = parseDataISO(value)
  if (Number.isNaN(d.getTime())) return VUOTO
  const gg = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${gg}/${mm}/${d.getFullYear()}`
}

/** "settembre 2026" */
export function formatMese(value: string | Date | null | undefined): string {
  if (!value) return VUOTO
  const d = parseDataISO(value)
  if (Number.isNaN(d.getTime())) return VUOTO
  return mese.format(d)
}

/** First day of the month, as the 'YYYY-MM-DD' the database expects. */
export function primoDelMese(value: string | Date): string {
  const d = parseDataISO(value)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

const importoInput = new Intl.NumberFormat('it-IT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: 'always',
})

/** "1.500,00": the way an amount is shown inside an editable field. */
export function formatImportoInput(value: number | string | null | undefined): string {
  const n = toNumber(value)
  return n === null ? '' : importoInput.format(n)
}

const meseBreve = new Intl.DateTimeFormat('it-IT', { month: 'short' })

/** "set" for chart ticks; January also carries the year ("gen 27"). */
export function formatMeseBreve(value: string): string {
  const d = parseDataISO(value)
  const m = meseBreve.format(d).replace('.', '')
  return d.getMonth() === 0 ? `${m} ${String(d.getFullYear()).slice(2)}` : m
}

/** Axis ticks: "0 €", "800 €", "1,5k €". Display scaling only. */
export function formatEuroAsse(value: number): string {
  if (Math.abs(value) < 1000) return `${numero.format(Math.round(value))} €`
  return `${new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1 }).format(value / 1000)}k €`
}

const nomeMese = new Intl.DateTimeFormat('it-IT', { month: 'long' })

/** "agosto" (no year): for "vs agosto" under a KPI. */
export function formatNomeMese(value: string): string {
  return nomeMese.format(parseDataISO(value))
}

const unDecimale = new Intl.NumberFormat('it-IT', { maximumFractionDigits: 1, useGrouping: 'always' })

/** Ratios like "DM per call": 12,5. */
export function formatRapporto(value: number | string | null | undefined): string {
  const n = toNumber(value)
  return n === null ? VUOTO : unDecimale.format(n)
}
