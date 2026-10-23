import type { Json } from '@/lib/supabase/database.types'

/**
 * The answer of recap_mese() (1.59.0), typed. Every number is computed by SQL: this file
 * only reads the JSON into numbers (Postgres numerics arrive as numbers or strings), keeps
 * nulls where SQL says "no denominator" (CLAUDE.md section 9: shown as «-»), and lays the
 * days of the month out on a calendar (presentation only).
 */

/** The tiles: recap_sales on the month (metriche_periodo and metriche_setting). */
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

/** The ratio boxes of the Excel, with the definitions of section 9 (metriche_periodo). */
export const CHIAVI_RIEPILOGO = [
  'tasso_conversazione',
  'tasso_prenotazione',
  'tasso_dm_qualificate',
  'dm_per_call',
  'show_rate',
  'tasso_qualificazione',
  'close_rate',
  'close_rate_qualificate',
  'chiuse',
  'cash_nuovi_clienti',
  'revenue_nuovi',
  'cash_per_dm',
  'revenue_per_dm',
  'cash_per_call_svolta',
  'valore_medio_nuovo',
  'cash_medio_chiusura',
] as const
export type ChiaveRiepilogo = (typeof CHIAVI_RIEPILOGO)[number]
export type Riepilogo = Record<ChiaveRiepilogo, number | null>

/** How a number of the summary is printed: a share, a ratio, a count, euro. */
export type FormaNumero = 'percentuale' | 'rapporto' | 'numero' | 'euro'

/** The three boxes of the Excel (setter, closer, money), each number with its form. */
export const GRUPPI_RIEPILOGO: { gruppo: 'setting' | 'closing' | 'soldi'; voci: { chiave: ChiaveRiepilogo; forma: FormaNumero }[] }[] = [
  {
    gruppo: 'setting',
    voci: [
      { chiave: 'tasso_conversazione', forma: 'percentuale' },
      { chiave: 'tasso_prenotazione', forma: 'percentuale' },
      { chiave: 'tasso_dm_qualificate', forma: 'percentuale' },
      { chiave: 'dm_per_call', forma: 'rapporto' },
    ],
  },
  {
    gruppo: 'closing',
    voci: [
      { chiave: 'show_rate', forma: 'percentuale' },
      { chiave: 'tasso_qualificazione', forma: 'percentuale' },
      { chiave: 'close_rate', forma: 'percentuale' },
      { chiave: 'close_rate_qualificate', forma: 'percentuale' },
      { chiave: 'chiuse', forma: 'numero' },
    ],
  },
  {
    gruppo: 'soldi',
    voci: [
      { chiave: 'cash_nuovi_clienti', forma: 'euro' },
      { chiave: 'revenue_nuovi', forma: 'euro' },
      { chiave: 'cash_per_dm', forma: 'euro' },
      { chiave: 'revenue_per_dm', forma: 'euro' },
      { chiave: 'cash_per_call_svolta', forma: 'euro' },
      { chiave: 'valore_medio_nuovo', forma: 'euro' },
      { chiave: 'cash_medio_chiusura', forma: 'euro' },
    ],
  },
]

/** The two halves of the Excel row, in its order: the table's columns and the day sheet's lines. */
export const COLONNE_SETTING: ChiaveGiorno[] = [
  'dm_outbound',
  'dm_inbound',
  'follow_up',
  'dm_totali',
  'conversazioni',
  'call_proposte',
  'call_prenotate',
]
export const COLONNE_CLOSING: ChiaveGiorno[] = [
  'call_svolte',
  'qualificate',
  'no_show',
  'call_follow_up',
  'cancellate',
  'chiuse',
  'cash',
  'revenue',
]
/** The day sheet says a little more than the table: where the bookings came from, the calls waiting. */
export const DETTAGLIO_SETTING: ChiaveGiorno[] = [...COLONNE_SETTING, 'prenotate_inbound', 'prenotate_outbound']
export const DETTAGLIO_CLOSING: ChiaveGiorno[] = [
  'call_svolte',
  'qualificate',
  'no_show',
  'call_follow_up',
  'cancellate',
  'in_attesa',
  'chiuse',
  'cash',
  'revenue',
]
export const CHIAVI_EURO: ReadonlySet<ChiaveGiorno> = new Set(['cash', 'revenue'])

/** One day of the month: the setter half and the closer half of the Excel row. */
export const CHIAVI_GIORNO = [
  'dm_outbound',
  'dm_inbound',
  'follow_up',
  'dm_totali',
  'conversazioni',
  'call_proposte',
  'call_prenotate',
  'prenotate_inbound',
  'prenotate_outbound',
  'call_svolte',
  'qualificate',
  'no_show',
  'call_follow_up',
  'cancellate',
  'in_attesa',
  'chiuse',
  'cash',
  'revenue',
] as const
export type ChiaveGiorno = (typeof CHIAVI_GIORNO)[number]

export type NumeriGiorno = Record<ChiaveGiorno, number> & { show_rate: number | null; close_rate: number | null }
export type GiornoRecap = NumeriGiorno & { giorno: string }

export type RecapMese = {
  mese: string
  da: string
  a: string
  oggi: string
  precedenteDa: string
  valori: ValoriRecap
  delta: Record<ChiaveDelta, number | null>
  riepilogo: Riepilogo
  riepilogoPrecedente: Riepilogo
  giorni: GiornoRecap[]
  totali: NumeriGiorno
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

function riepilogo(v: unknown): Riepilogo {
  const o = oggetto(v)
  return Object.fromEntries(CHIAVI_RIEPILOGO.map((k) => [k, numeroONull(o[k])])) as Riepilogo
}

function numeriGiorno(v: unknown): NumeriGiorno {
  const o = oggetto(v)
  return {
    ...(Object.fromEntries(CHIAVI_GIORNO.map((k) => [k, numero(o[k])])) as Record<ChiaveGiorno, number>),
    show_rate: numeroONull(o.show_rate),
    close_rate: numeroONull(o.close_rate),
  }
}

/** recap_mese() as the page uses it; the shape is fixed by the SQL function. */
export function leggiRecapMese(json: Json): RecapMese {
  const o = oggetto(json)
  const delta = oggetto(o.delta)
  return {
    mese: testo(o.mese),
    da: testo(o.da),
    a: testo(o.a),
    oggi: testo(o.oggi),
    precedenteDa: testo(o.precedente_da),
    valori: valori(o.valori),
    delta: Object.fromEntries(CHIAVI_DELTA.map((k) => [k, numeroONull(delta[k])])) as Record<ChiaveDelta, number | null>,
    riepilogo: riepilogo(o.riepilogo),
    riepilogoPrecedente: riepilogo(o.riepilogo_precedente),
    giorni: (Array.isArray(o.giorni) ? o.giorni : []).map((g) => ({ giorno: testo(oggetto(g).giorno), ...numeriGiorno(g) })),
    totali: numeriGiorno(o.totali),
  }
}

/** Nothing happened that day: no DM, no conversation, no call of any kind, no cash, no contract. */
export function giornoVuoto(g: NumeriGiorno): boolean {
  return CHIAVI_GIORNO.every((k) => g[k] === 0)
}

/** Nothing happened in the whole month (the tiles and the days agree on it). */
export function meseVuoto(r: RecapMese): boolean {
  const v = r.valori
  return (
    giornoVuoto(r.totali) &&
    v.dm_totali === 0 &&
    v.conversazioni === 0 &&
    v.call_prenotate === 0 &&
    v.call_svolte === 0 &&
    v.chiuse === 0 &&
    v.cash_nuovi_clienti === 0 &&
    v.revenue_nuovi === 0
  )
}

/**
 * The month on a Monday-to-Sunday grid: one array per week, null where the week spills into
 * the month before or after. Works on 'YYYY-MM-DD' strings, no time zone involved.
 */
export function settimaneDelMese(giorni: string[]): (string | null)[][] {
  if (giorni.length === 0) return []
  const [anno, mese, gg] = giorni[0].split('-').map(Number)
  // 0 = Monday … 6 = Sunday
  const primo = (new Date(Date.UTC(anno, mese - 1, gg)).getUTCDay() + 6) % 7
  const celle: (string | null)[] = [...Array<null>(primo).fill(null), ...giorni]
  while (celle.length % 7 !== 0) celle.push(null)
  const settimane: (string | null)[][] = []
  for (let i = 0; i < celle.length; i += 7) settimane.push(celle.slice(i, i + 7))
  return settimane
}

/**
 * How busy a day was for the setting, from 0 to 3, against the busiest day of the month: a
 * light background on the calendar, never the only signal (the numbers are written in the
 * cell). Presentation only: no metric comes out of it.
 */
export function livelloAttivita(dm: number, massimo: number): 0 | 1 | 2 | 3 {
  if (dm <= 0 || massimo <= 0) return 0
  const quota = dm / massimo
  // the busiest days stand out; most working days are alike, so the steps sit high
  if (quota >= 0.9) return 3
  if (quota >= 0.7) return 2
  return 1
}

/** The day before and after inside the month, never in the future: the arrows of the day sheet. */
export function giorniVicini(giorno: string, giorni: string[], oggi: string): { prima: string | null; dopo: string | null } {
  const i = giorni.indexOf(giorno)
  if (i === -1) return { prima: null, dopo: null }
  const dopo = giorni[i + 1] ?? null
  return { prima: giorni[i - 1] ?? null, dopo: dopo !== null && dopo <= oggi ? dopo : null }
}
