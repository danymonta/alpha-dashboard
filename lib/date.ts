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
const giornoSettimanaBreve = new Intl.DateTimeFormat('it-IT', { weekday: 'short' })

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

/**
 * The setter may fill in or correct any past day, never a future one
 * (same rule as the RLS policy, Dany 27/09/2026).
 */
export function dataReportValida(richiesta: unknown, oggi: string = oggiRoma()): string {
  if (!isDataISO(richiesta) || richiesta > oggi) return oggi
  return richiesta
}

const partiIstante = new Intl.DateTimeFormat('en-GB', {
  timeZone: FUSO,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** How far Rome is from UTC at an instant, in milliseconds (one or two hours). */
function scartoRoma(ms: number): number {
  const p = Object.fromEntries(partiIstante.formatToParts(new Date(ms)).map((x) => [x.type, x.value]))
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - ms
}

/**
 * The instant of a day and an hour of Rome ('YYYY-MM-DD', 'HH:MM'), as ISO in UTC: what a
 * timestamptz argument of a function wants. The change of the hour is taken into account.
 */
export function istanteRoma(giorno: string, oraRoma: string): string {
  const [a, m, g] = giorno.split('-').map(Number)
  const [h, mi] = oraRoma.split(':').map(Number)
  const comeUtc = Date.UTC(a, m - 1, g, h, mi)
  const primo = scartoRoma(comeUtc)
  let istante = comeUtc - primo
  const secondo = scartoRoma(istante)
  if (secondo !== primo) istante = comeUtc - secondo
  return new Date(istante).toISOString()
}

/** "18:42" in Europe/Rome, from a timestamptz. */
export function formatOra(istante: string | Date): string {
  return ora.format(typeof istante === 'string' ? new Date(istante) : istante)
}

/** "Oggi", "Ieri", "Domani", or "lunedì 22/09". */
export function etichettaGiorno(iso: string, oggi: string = oggiRoma()): string {
  if (iso === oggi) return 'Oggi'
  if (iso === aggiungiGiorni(oggi, -1)) return 'Ieri'
  if (iso === aggiungiGiorni(oggi, 1)) return 'Domani'
  const d = parseDataISO(iso)
  const gg = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${giornoSettimana.format(d)} ${gg}/${mm}`
}

/** "sabato", from a 'YYYY-MM-DD'. */
export function nomeGiorno(iso: string): string {
  return giornoSettimana.format(parseDataISO(iso))
}

/**
 * The day in full, for Alfire's prompt and cards, where a weekday the model
 * worked out wrong must show: "oggi, sabato 03/10/2026",
 * "ieri, venerdì 02/10/2026", "lunedì 28/09/2026".
 */
export function giornoEsteso(iso: string, oggi: string = oggiRoma()): string {
  const d = parseDataISO(iso)
  const data = `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
  const relativo = iso === oggi ? 'oggi, ' : iso === aggiungiGiorni(oggi, -1) ? 'ieri, ' : ''
  return `${relativo}${giornoSettimana.format(d)} ${data}`
}

/** Monday of the week of a 'YYYY-MM-DD' (Italian weeks start on Monday). */
export function lunediDellaSettimana(iso: string): string {
  const giorno = parseDataISO(iso).getDay()
  return aggiungiGiorni(iso, giorno === 0 ? -6 : 1 - giorno)
}

/** Compact version for narrow columns: "oggi", "ieri", "domani", "lun 22/09". */
export function etichettaGiornoBreve(iso: string, oggi: string = oggiRoma()): string {
  if (iso === oggi) return 'oggi'
  if (iso === aggiungiGiorni(oggi, -1)) return 'ieri'
  if (iso === aggiungiGiorni(oggi, 1)) return 'domani'
  const d = parseDataISO(iso)
  const gg = String(d.getDate()).padStart(2, '0')
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${giornoSettimanaBreve.format(d)} ${gg}/${mm}`
}

/** 'YYYY-MM-01' of the month containing the date. */
export function primoDelMeseISO(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

/** Reads "?mese=2026-09" (or 2026-09-01); null when absent or malformed. */
export function parseMese(valore: unknown): string | null {
  if (typeof valore !== 'string') return null
  const m = /^(\d{4})-(\d{2})(?:-01)?$/.exec(valore)
  if (!m) return null
  const mese = Number(m[2])
  if (mese < 1 || mese > 12) return null
  return `${m[1]}-${m[2]}-01`
}

/** Month arithmetic on first-of-month dates: aggiungiMesi('2026-01-01', -1) = '2025-12-01'. */
export function aggiungiMesi(primo: string, mesi: number): string {
  const anno = Number(primo.slice(0, 4))
  const mese = Number(primo.slice(5, 7)) - 1 + mesi
  const a = anno + Math.floor(mese / 12)
  const m = ((mese % 12) + 12) % 12
  return `${a}-${String(m + 1).padStart(2, '0')}-01`
}

/**
 * Same day n months later, clamped to the month's end like Postgres
 * (31/01 + 1 month = 28/02): the instalment dates the database would write.
 */
export function stessoGiornoTraMesi(iso: string, mesi: number): string {
  const giorno = Number(iso.slice(8, 10))
  const primo = aggiungiMesi(`${iso.slice(0, 7)}-01`, mesi)
  const ultimo = Number(fineMese(primo).slice(8, 10))
  return `${primo.slice(0, 8)}${String(Math.min(giorno, ultimo)).padStart(2, '0')}`
}

/** End of a path lasting n months from its start: the day before the same day n months later. */
export function fineDopoMesi(inizio: string, mesi: number): string {
  return aggiungiGiorni(stessoGiornoTraMesi(inizio, mesi), -1)
}

/** Last day of the month of a first-of-month date. */
export function fineMese(primo: string): string {
  return aggiungiGiorni(aggiungiMesi(primo, 1), -1)
}
