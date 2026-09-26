import { parseDataISO } from '@/lib/format'

/**
 * Business dates. "Today" is always Europe/Rome: the server runs in UTC and a
 * report filled at 00:30 in Italy belongs to the new day, not the old one.
 * Mirrors public.oggi() in the database.
 */
const FUSO = 'Europe/Rome'

const partiData = new Intl.DateTimeFormat('en-GB', {
  timeZone: FUSO,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const ora = new Intl.DateTimeFormat('it-IT', {
  timeZone: FUSO,
  hour: '2-digit',
  minute: '2-digit',
})

const giornoSettimana = new Intl.DateTimeFormat('it-IT', { weekday: 'long' })

/** 'YYYY-MM-DD' of the given instant in Europe/Rome. */
export function oggiRoma(adesso: Date = new Date()): string {
  const parti = Object.fromEntries(
    partiData.formatToParts(adesso).map((p) => [p.type, p.value]),
  )
  return `${parti.year}-${parti.month}-${parti.day}`
}

function toISO(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const gg = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${mm}-${gg}`
}

export function aggiungiGiorni(iso: string, giorni: number): string {
  const d = parseDataISO(iso)
  d.setDate(d.getDate() + giorni)
  return toISO(d)
}

export function isDataISO(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  return toISO(parseDataISO(value)) === value
}

/** The setter may write the last 7 days (same window as the RLS policy). */
export const GIORNI_MODIFICABILI = 7

export function finestraReport(oggi: string = oggiRoma()) {
  return { minima: aggiungiGiorni(oggi, -GIORNI_MODIFICABILI), massima: oggi }
}

/** Clamp a requested date into the editable window, defaulting to today. */
export function dataReportValida(richiesta: unknown, oggi: string = oggiRoma()): string {
  const { minima, massima } = finestraReport(oggi)
  if (!isDataISO(richiesta)) return oggi
  if (richiesta < minima || richiesta > massima) return oggi
  return richiesta
}

/** "18:42" in Europe/Rome, from a timestamptz. */
export function formatOra(istante: string | Date): string {
  return ora.format(typeof istante === 'string' ? new Date(istante) : istante)
}

/** "Oggi", "Ieri", or "lunedì 22/09". */
export function etichettaGiorno(iso: string, oggi: string = oggiRoma()): string {
  if (iso === oggi) return 'Oggi'
  if (iso === aggiungiGiorni(oggi, -1)) return 'Ieri'
  const d = parseDataISO(iso)
  const gg = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${giornoSettimana.format(d)} ${gg}/${mm}`
}
