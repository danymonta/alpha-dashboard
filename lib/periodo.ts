import { z } from 'zod'

import { aggiungiGiorni, aggiungiMesi, fineMese, isDataISO, oggiRoma, parseMese, primoDelMeseISO } from '@/lib/date'
import { formato, MESI_BREVI_EN } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'

/**
 * The period a page looks at: one month (?mese=2026-09) or any range of
 * business dates (?da=2026-07-01&a=2026-08-15). Pure date logic, no amounts:
 * the numbers of a period always come from SQL. The comparison window follows
 * the same rule as public.periodo_precedente() in the database.
 */

/** Inclusive range of business dates, 'YYYY-MM-DD'. */
export type Intervallo = { da: string; a: string }

export type Periodo = Intervallo & {
  /** 'YYYY-MM-01' when the period is exactly one calendar month, else null. */
  mese: string | null
  /** Number of whole calendar months, null when the bounds are not month edges. */
  mesiInteri: number | null
  giorni: number
  /** "settembre 2026", "luglio – settembre 2026", "01/07/2026 – 15/08/2026" */
  etichetta: string
  /** For sentences: "a settembre 2026", "dal 01/07/2026 al 15/08/2026" */
  frase: string
  /** Under a KPI delta: "vs agosto", "vs 2025", "vs periodo precedente" */
  confronto: string
  precedente: Intervallo & { etichetta: string }
  successivo: Intervallo
  /** Query params that reproduce this period: { mese } or { da, a }. */
  parametri: Record<string, string>
}

export const DURATA_MASSIMA_MESI = 36
/** How far into the future the end of a period may go. */
export const ORIZZONTE_MESI = 12

/** Calendar-month arithmetic on any day, clamped to the month's end: 31/01 + 1 = 28/02. */
export function aggiungiMesiData(iso: string, mesi: number): string {
  const primo = aggiungiMesi(primoDelMeseISO(iso), mesi)
  const ultimo = Number(fineMese(primo).slice(8, 10))
  const giorno = Math.min(Number(iso.slice(8, 10)), ultimo)
  return `${primo.slice(0, 8)}${String(giorno).padStart(2, '0')}`
}

function giornoUTC(iso: string): number {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)))
}

/** Days in the range, both ends included. */
export function giorniIntervallo({ da, a }: Intervallo): number {
  return Math.round((giornoUTC(a) - giornoUTC(da)) / 86_400_000) + 1
}

/** Whole calendar months covered, or null when the range does not start on a 1st and end on a month's last day. */
export function mesiInteri({ da, a }: Intervallo): number | null {
  const dopo = aggiungiGiorni(a, 1)
  if (!da.endsWith('-01') || !dopo.endsWith('-01')) return null
  const indice = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7))
  return indice(dopo) - indice(da)
}

/** Same number of whole months right before, or else the same number of days right before. */
export function periodoPrecedente(i: Intervallo): Intervallo {
  const mesi = mesiInteri(i)
  if (mesi !== null) return { da: aggiungiMesi(i.da, -mesi), a: aggiungiGiorni(i.da, -1) }
  return { da: aggiungiGiorni(i.da, -giorniIntervallo(i)), a: aggiungiGiorni(i.da, -1) }
}

/** The mirror of periodoPrecedente: what the "next" arrow opens. */
export function periodoSuccessivo(i: Intervallo): Intervallo {
  const mesi = mesiInteri(i)
  if (mesi !== null) {
    const da = aggiungiMesi(i.da, mesi)
    return { da, a: aggiungiGiorni(aggiungiMesi(da, mesi), -1) }
  }
  const giorni = giorniIntervallo(i)
  return { da: aggiungiGiorni(i.a, 1), a: aggiungiGiorni(i.a, giorni) }
}

const meseBreve = new Intl.DateTimeFormat('it-IT', { month: 'short' })

/** "nov 2025", "Nov 2025" */
function meseBreveAnno(iso: string, lingua: Lingua): string {
  const d = new Date(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, 1)
  const m = lingua === 'en' ? MESI_BREVI_EN[d.getMonth()] : meseBreve.format(d).replace('.', '')
  return `${m} ${iso.slice(0, 4)}`
}

function annoIntero(i: Intervallo): boolean {
  return i.da.endsWith('-01-01') && i.a === `${i.da.slice(0, 4)}-12-31`
}

export function etichettaPeriodo(i: Intervallo, lingua: Lingua = 'it'): string {
  const { formatData, formatMese, formatNomeMese } = formato(lingua)
  const mesi = mesiInteri(i)
  if (mesi === 1) return formatMese(i.da)
  if (annoIntero(i)) return `${lingua === 'en' ? 'year' : 'anno'} ${i.da.slice(0, 4)}`
  if (mesi !== null) {
    return i.da.slice(0, 4) === i.a.slice(0, 4)
      ? `${formatNomeMese(i.da)} – ${formatMese(i.a)}`
      : `${meseBreveAnno(i.da, lingua)} – ${meseBreveAnno(i.a, lingua)}`
  }
  if (i.da === i.a) return formatData(i.da)
  return `${formatData(i.da)} – ${formatData(i.a)}`
}

export function frasePeriodo(i: Intervallo, lingua: Lingua = 'it'): string {
  const { formatData, formatMese, formatNomeMese } = formato(lingua)
  const mesi = mesiInteri(i)
  if (lingua === 'en') {
    if (mesi === 1) return `in ${formatMese(i.da)}`
    if (annoIntero(i)) return `in ${i.da.slice(0, 4)}`
    if (mesi !== null) {
      return i.da.slice(0, 4) === i.a.slice(0, 4)
        ? `from ${formatNomeMese(i.da)} to ${formatMese(i.a)}`
        : `from ${formatMese(i.da)} to ${formatMese(i.a)}`
    }
    if (i.da === i.a) return `on ${formatData(i.da)}`
    return `from ${formatData(i.da)} to ${formatData(i.a)}`
  }
  if (mesi === 1) return `a ${formatMese(i.da)}`
  if (annoIntero(i)) return `nel ${i.da.slice(0, 4)}`
  if (mesi !== null) {
    return i.da.slice(0, 4) === i.a.slice(0, 4)
      ? `da ${formatNomeMese(i.da)} a ${formatMese(i.a)}`
      : `da ${formatMese(i.da)} a ${formatMese(i.a)}`
  }
  if (i.da === i.a) return `il ${formatData(i.da)}`
  return `dal ${formatData(i.da)} al ${formatData(i.a)}`
}

export function creaPeriodo(i: Intervallo, lingua: Lingua = 'it'): Periodo {
  const { formatNomeMese } = formato(lingua)
  const mesi = mesiInteri(i)
  const precedente = periodoPrecedente(i)
  return {
    da: i.da,
    a: i.a,
    mese: mesi === 1 ? i.da : null,
    mesiInteri: mesi,
    giorni: giorniIntervallo(i),
    etichetta: etichettaPeriodo(i, lingua),
    frase: frasePeriodo(i, lingua),
    confronto:
      mesi === 1
        ? `vs ${formatNomeMese(precedente.da)}`
        : annoIntero(i)
          ? `vs ${precedente.da.slice(0, 4)}`
          : lingua === 'en'
            ? 'vs previous period'
            : 'vs periodo precedente',
    precedente: { ...precedente, etichetta: etichettaPeriodo(precedente, lingua) },
    successivo: periodoSuccessivo(i),
    parametri: parametriPeriodo(i),
  }
}

/** Canonical URL form: a single whole month stays "?mese=", anything else is "?da=&a=". */
export function parametriPeriodo(i: Intervallo): Record<string, string> {
  return mesiInteri(i) === 1 ? { mese: i.da.slice(0, 7) } : { da: i.da, a: i.a }
}

/** Null when the range is acceptable, otherwise the message to show. */
export function erroreIntervallo(da: unknown, a: unknown, oggi: string = oggiRoma()): string | null {
  if (!isDataISO(da) || !isDataISO(a)) return 'Inserisci due date valide.'
  if (da > a) return 'La data di inizio non può venire dopo la fine.'
  if (a > aggiungiMesiData(oggi, ORIZZONTE_MESI)) return 'La fine può essere al massimo tra un anno.'
  if (a >= aggiungiMesiData(da, DURATA_MASSIMA_MESI)) return 'Il periodo può durare al massimo 3 anni.'
  return null
}

/**
 * The "Personalizzato" form and the URL reader share this schema. The output
 * is the input, untouched: parsing it again gives the same value.
 */
export function schemaIntervallo(oggi: string = oggiRoma()) {
  return z
    .object({ da: z.string(), a: z.string() })
    .superRefine((v, ctx) => {
      if (!isDataISO(v.da)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['da'], message: 'Inserisci una data valida.' })
        return
      }
      const errore = erroreIntervallo(v.da, v.a, oggi)
      if (errore) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['a'], message: errore })
    })
}

export type IntervalloInput = z.infer<ReturnType<typeof schemaIntervallo>>

type Parametri = Record<string, string | string[] | undefined> | URLSearchParams

function valore(parametri: Parametri, chiave: string): string | undefined {
  const v = parametri instanceof URLSearchParams ? parametri.get(chiave) ?? undefined : parametri[chiave]
  return Array.isArray(v) ? v[0] : v
}

/** The month of a date as a period. */
export function periodoDelMese(iso: string, lingua: Lingua = 'it'): Periodo {
  const primo = primoDelMeseISO(iso)
  return creaPeriodo({ da: primo, a: fineMese(primo) }, lingua)
}

/**
 * Reads ?da=&a= (a valid range wins), then ?mese=, otherwise the current month.
 * Anything invalid falls back quietly: a hand-edited URL never breaks a page.
 */
export function leggiPeriodo(parametri: Parametri, oggi: string = oggiRoma(), lingua: Lingua = 'it'): Periodo {
  const da = valore(parametri, 'da')
  const a = valore(parametri, 'a')
  if (da !== undefined && a !== undefined && schemaIntervallo(oggi).safeParse({ da, a }).success) {
    return creaPeriodo({ da, a }, lingua)
  }
  const mese = parseMese(valore(parametri, 'mese'))
  if (mese) return periodoDelMese(mese, lingua)
  return periodoDelMese(oggi, lingua)
}

const CHIAVI_PERIODO = new Set(['mese', 'da', 'a'])

/** Link to a page on a period, keeping the page's other filters. */
export function hrefPeriodo(
  percorso: string,
  intervallo: Intervallo,
  altri: Record<string, string | undefined> = {},
): string {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(altri)) if (v && !CHIAVI_PERIODO.has(k)) qs.set(k, v)
  for (const [k, v] of Object.entries(parametriPeriodo(intervallo))) qs.set(k, v)
  return `${percorso}?${qs.toString()}`
}

export function contieneData(i: Intervallo, iso: string): boolean {
  return i.da <= iso && iso <= i.a
}

/** The "next" arrow is off when the next period would start in the future. */
export function puoAndareAvanti(periodo: Periodo, oggi: string): boolean {
  return periodo.successivo.da <= oggi
}

export type PresetPeriodo = Intervallo & { chiave: string; etichetta: string }

/** Quick choices of the period sheet, relative to today in Europe/Rome. */
const ETICHETTE_PRESET: Record<Lingua, Record<string, string>> = {
  it: {
    oggi: 'Oggi',
    'questo-mese': 'Questo mese',
    'mese-scorso': 'Mese scorso',
    'ultimi-90': 'Ultimi 90 giorni',
    trimestre: 'Trimestre in corso',
    anno: 'Anno in corso',
  },
  en: {
    oggi: 'Today',
    'questo-mese': 'This month',
    'mese-scorso': 'Last month',
    'ultimi-90': 'Last 90 days',
    trimestre: 'This quarter',
    anno: 'This year',
  },
}

export function presetPeriodi(oggi: string = oggiRoma(), lingua: Lingua = 'it'): PresetPeriodo[] {
  const e = ETICHETTE_PRESET[lingua]
  const questoMese = primoDelMeseISO(oggi)
  const meseScorso = aggiungiMesi(questoMese, -1)
  const anno = oggi.slice(0, 4)
  const primoTrimestre = Math.floor((Number(oggi.slice(5, 7)) - 1) / 3) * 3 + 1
  const trimestre = `${anno}-${String(primoTrimestre).padStart(2, '0')}-01`

  return [
    // "Oggi" first: the daily tracking is looked at day by day (Dany, 28/09/2026)
    { chiave: 'oggi', etichetta: e.oggi, da: oggi, a: oggi },
    { chiave: 'questo-mese', etichetta: e['questo-mese'], da: questoMese, a: fineMese(questoMese) },
    { chiave: 'mese-scorso', etichetta: e['mese-scorso'], da: meseScorso, a: fineMese(meseScorso) },
    { chiave: 'ultimi-90', etichetta: e['ultimi-90'], da: aggiungiGiorni(oggi, -89), a: oggi },
    { chiave: 'trimestre', etichetta: e.trimestre, da: trimestre, a: fineMese(aggiungiMesi(trimestre, 2)) },
    { chiave: 'anno', etichetta: e.anno, da: `${anno}-01-01`, a: `${anno}-12-31` },
  ]
}
