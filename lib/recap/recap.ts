import type { Json } from '@/lib/supabase/database.types'

/**
 * The answer of recap_sales() (1.58.0), typed. Every number is computed by SQL: this
 * file only reads the JSON into numbers (Postgres numerics arrive as numbers or strings)
 * and keeps nulls where SQL says "no denominator" (CLAUDE.md section 9: shown as «-»).
 */

export type Granularita = 'giorno' | 'settimana' | 'mese'

export type ValoriRecap = {
  dm_totali: number
  dm_outbound: number
  dm_inbound: number
  follow_up: number
  conversazioni: number
  call_prenotate: number
  call_svolte: number
  no_show: number
  show_rate: number | null
  chiuse: number
  close_rate: number | null
  cash_nuovi_clienti: number
  revenue_nuovi: number
}

export const CHIAVI_DELTA = [
  'dm_totali',
  'conversazioni',
  'call_prenotate',
  'call_svolte',
  'chiuse',
  'cash_nuovi_clienti',
  'revenue_nuovi',
] as const
export type ChiaveDelta = (typeof CHIAVI_DELTA)[number]

export type FaseRecap = { ordine: number; fase: string; valore: number; passaggio: number | null }

export type PuntoRecap = {
  inizio: string
  fine: string
  dm_outbound: number
  dm_inbound: number
  follow_up: number
  call_svolte: number
  chiuse: number
  cash_nuovi_clienti: number
}

export type Recap = {
  da: string
  a: string
  granularita: Granularita
  valori: ValoriRecap
  delta: Record<ChiaveDelta, number | null>
  funnel: FaseRecap[]
  serie: PuntoRecap[]
}

type Oggetto = Record<string, unknown>

function oggetto(v: unknown): Oggetto {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Oggetto) : {}
}

function numero(v: unknown): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : 0
}

function numeroONull(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}

function testo(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function valori(v: unknown): ValoriRecap {
  const o = oggetto(v)
  return {
    dm_totali: numero(o.dm_totali),
    dm_outbound: numero(o.dm_outbound),
    dm_inbound: numero(o.dm_inbound),
    follow_up: numero(o.follow_up),
    conversazioni: numero(o.conversazioni),
    call_prenotate: numero(o.call_prenotate),
    call_svolte: numero(o.call_svolte),
    no_show: numero(o.no_show),
    show_rate: numeroONull(o.show_rate),
    chiuse: numero(o.chiuse),
    close_rate: numeroONull(o.close_rate),
    cash_nuovi_clienti: numero(o.cash_nuovi_clienti),
    revenue_nuovi: numero(o.revenue_nuovi),
  }
}

/** recap_sales() as the page uses it; the shape is fixed by the SQL function. */
export function leggiRecap(json: Json): Recap {
  const o = oggetto(json)
  const g = testo(o.granularita)
  const delta = oggetto(o.delta)
  return {
    da: testo(o.da),
    a: testo(o.a),
    granularita: g === 'settimana' || g === 'mese' ? g : 'giorno',
    valori: valori(o.valori),
    delta: Object.fromEntries(CHIAVI_DELTA.map((k) => [k, numeroONull(delta[k])])) as Record<ChiaveDelta, number | null>,
    funnel: (Array.isArray(o.funnel) ? o.funnel : []).map((f) => {
      const x = oggetto(f)
      return { ordine: numero(x.ordine), fase: testo(x.fase), valore: numero(x.valore), passaggio: numeroONull(x.passaggio) }
    }),
    serie: (Array.isArray(o.serie) ? o.serie : []).map((p) => {
      const x = oggetto(p)
      return {
        inizio: testo(x.inizio),
        fine: testo(x.fine),
        dm_outbound: numero(x.dm_outbound),
        dm_inbound: numero(x.dm_inbound),
        follow_up: numero(x.follow_up),
        call_svolte: numero(x.call_svolte),
        chiuse: numero(x.chiuse),
        cash_nuovi_clienti: numero(x.cash_nuovi_clienti),
      }
    }),
  }
}

/** Nothing happened in the period: no DM, no call, no booking, no cash, no contract. */
export function recapVuoto(r: Recap): boolean {
  const v = r.valori
  return (
    v.dm_totali === 0 &&
    v.conversazioni === 0 &&
    v.call_prenotate === 0 &&
    v.call_svolte === 0 &&
    v.no_show === 0 &&
    v.chiuse === 0 &&
    v.cash_nuovi_clienti === 0 &&
    v.revenue_nuovi === 0
  )
}

const MESI_BREVI_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

/** «22/10» or «22 Oct»: a day inside the period, for the chart axis. */
export function giornoBreve(iso: string, lingua: 'it' | 'en'): string {
  const [, mm, gg] = iso.split('-')
  if (!mm || !gg) return iso
  return lingua === 'en' ? `${Number(gg)} ${MESI_BREVI_EN[Number(mm) - 1]}` : `${gg}/${mm}`
}

/**
 * The label of one point of the series: the axis tick (short) and the table row or
 * tooltip (long). A week says its first and last day, a month its name (passed in by the
 * caller, which owns the month formatter), a day itself.
 */
export function etichettaPunto(
  p: Pick<PuntoRecap, 'inizio' | 'fine'>,
  granularita: Granularita,
  lingua: 'it' | 'en',
  mese: { breve: (iso: string) => string; lungo: (iso: string) => string },
  settimanaDal: (da: string, a: string) => string,
): { breve: string; lunga: string } {
  if (granularita === 'mese') return { breve: mese.breve(p.inizio), lunga: mese.lungo(p.inizio) }
  const inizio = giornoBreve(p.inizio, lingua)
  if (granularita === 'settimana') return { breve: inizio, lunga: settimanaDal(inizio, giornoBreve(p.fine, lingua)) }
  return { breve: inizio, lunga: inizio }
}
