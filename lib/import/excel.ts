/**
 * Reading the coach's Excel (CLAUDE.md section 14). Pure functions: the script in
 * scripts/import-excel.ts does the IO, these turn cells into rows and are tested.
 * No amount is computed here beyond reading what the sheet already holds.
 */
import type { CellValue, Worksheet } from 'exceljs'

import { righeCsv, importoCsv, dataCsv } from '@/lib/csv'
import { isDataISO } from '@/lib/date'
import { parseImporto } from '@/lib/importi'

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------
type Semplice = string | number | boolean | Date | null

/** Formula results, rich text and errors reduced to a plain value. */
export function valore(v: CellValue): Semplice {
  if (v === null || v === undefined) return null
  if (v instanceof Date || typeof v !== 'object') return v as Semplice
  if ('result' in v) return valore((v as { result?: CellValue }).result ?? null)
  if ('richText' in v) return (v as { richText: { text: string }[] }).richText.map((t) => t.text).join('')
  if ('text' in v) return String((v as { text: unknown }).text)
  return null // errors (#REF!), shared formulas without a cached result
}

/** A count: blanks, dashes and errors are "nothing written", not zero-with-meaning. */
export function conteggio(v: CellValue): number | null {
  const x = valore(v)
  if (typeof x === 'number' && Number.isFinite(x)) return Math.max(0, Math.round(x))
  if (typeof x === 'string' && /^\s*\d+\s*$/.test(x)) return Number(x)
  return null
}

export function importo(v: CellValue): number | null {
  const x = valore(v)
  if (typeof x === 'number' && Number.isFinite(x)) return x
  if (typeof x === 'string') return parseImporto(x)
  return null
}

/** Excel dates arrive as UTC midnight; strings as dd/mm/yyyy. */
export function data(v: CellValue): string | null {
  const x = valore(v)
  if (x instanceof Date && !Number.isNaN(x.getTime())) {
    return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`
  }
  if (typeof x === 'string') {
    const m = x.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (m) {
      const iso = `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
      return isDataISO(iso) ? iso : null
    }
    if (isDataISO(x.trim())) return x.trim()
  }
  return null
}

function testo(v: CellValue): string {
  const x = valore(v)
  return x === null ? '' : String(x).trim()
}

// ---------------------------------------------------------------------------
// Monthly sheets
// ---------------------------------------------------------------------------

/** SETTER section, columns I-Q, in the order of setter_daily_reports. */
export const COLONNE_SETTER = [
  ['I', 'dm_outbound'],
  ['J', 'dm_inbound'],
  ['K', 'conversazioni'],
  ['L', 'call_proposte'],
  ['M', 'discovery_prenotate'],
  ['N', 'discovery_svolte'],
  ['O', 'call_qualificate'],
  ['P', 'strategy_prenotate'],
  ['Q', 'follow_up'],
] as const

type CampoReport = (typeof COLONNE_SETTER)[number][1]

export type RigaReport = { data: string; contenuto_pubblicato: boolean } & Record<CampoReport, number>

/** One day of the CLOSER section with at least one close: totals, no client. */
export type GiornoChiusure = { data: string; chiusure: number; cash: number; revenue: number }

export type FoglioMensile = {
  nome: string
  report: RigaReport[]
  vuote: number
  chiusure: GiornoChiusure[]
  avvisi: string[]
}

/** The header row of a monthly sheet: DATE in B, OUT BOUND in I. Null for other sheets. */
export function rigaIntestazione(ws: Worksheet): number | null {
  for (let r = 1; r <= 30; r++) {
    const riga = ws.getRow(r)
    if (/^date$/i.test(testo(riga.getCell('B').value)) && /out\s*bound/i.test(testo(riga.getCell('I').value))) {
      return r
    }
  }
  return null
}

export function leggiFoglioMensile(ws: Worksheet): FoglioMensile | null {
  const intestazione = rigaIntestazione(ws)
  if (intestazione === null) return null

  const esito: FoglioMensile = { nome: ws.name, report: [], vuote: 0, chiusure: [], avvisi: [] }

  // a month has at most 31 rows; the totals row below has no date and ends the scan
  for (let r = intestazione + 1; r <= intestazione + 40; r++) {
    const riga = ws.getRow(r)
    const giorno = data(riga.getCell('B').value)
    const numeri = COLONNE_SETTER.map(([colonna]) => conteggio(riga.getCell(colonna).value))

    if (!giorno) {
      if (testo(riga.getCell('B').value) === '') break
      if (numeri.some((n) => n !== null && n > 0)) {
        esito.avvisi.push(`${ws.name}, riga ${r}: numeri senza data, non importati`)
      }
      continue
    }

    if (numeri.every((n) => n === null || n === 0)) {
      esito.vuote++
    } else {
      const report = { data: giorno } as RigaReport
      COLONNE_SETTER.forEach(([, campo], i) => {
        report[campo] = numeri[i] ?? 0
      })
      report.contenuto_pubblicato = /^(yes|s[iì])$/i.test(testo(riga.getCell('E').value))
      esito.report.push(report)
    }

    const chiusure = conteggio(riga.getCell('X').value) ?? 0
    const cash = importo(riga.getCell('Y').value) ?? 0
    const revenue = importo(riga.getCell('Z').value) ?? 0
    if (chiusure > 0) esito.chiusure.push({ data: giorno, chiusure, cash, revenue })
    else if (cash > 0 || revenue > 0) {
      esito.avvisi.push(`${ws.name}, ${giorno}: cash o revenue senza chiusure, non importati`)
    }
    if ((conteggio(riga.getCell('AG').value) ?? 0) > 0) {
      esito.avvisi.push(`${ws.name}, ${giorno}: chiusure del secondo closer (colonne AB-AI), non importate`)
    }
  }

  return esito
}

// ---------------------------------------------------------------------------
// Setter Payments
// ---------------------------------------------------------------------------
export type PagamentoSetter = { pagato_il: string; base: number; percentuale: number; importo: number }

export function leggiPagamentiSetter(ws: Worksheet): { pagamenti: PagamentoSetter[]; avvisi: string[] } {
  const pagamenti: PagamentoSetter[] = []
  const avvisi: string[] = []
  for (let r = 2; r <= ws.rowCount; r++) {
    const riga = ws.getRow(r)
    const cella = riga.getCell('A').value
    if (testo(cella) === '') break
    const pagato_il = data(cella)
    const base = importo(riga.getCell('B').value)
    const percentuale = importo(riga.getCell('C').value)
    const totale = importo(riga.getCell('D').value)
    if (!pagato_il || base === null || percentuale === null) {
      avvisi.push(`Setter Payments, riga ${r}: data, base o percentuale illeggibili, non importata`)
      continue
    }
    // the sheet's own total when it has one; otherwise its formula, base times percent
    pagamenti.push({ pagato_il, base, percentuale, importo: totale ?? Math.round(base * percentuale * 100) / 100 })
  }
  return { pagamenti, avvisi }
}

/**
 * Which month each payout settles. The sheet does not say, so payouts settle the
 * oldest month first: each payout's base is taken from the cash of the earliest
 * month not yet covered (Dany 27/09/2026: "decidi tu il mese").
 * cashPerMese: 'YYYY-MM-01' -> cash of that month, from the same sheet.
 */
export function attribuisciPeriodi(pagamenti: PagamentoSetter[], cashPerMese: Map<string, number>): string[] {
  const mesi = [...cashPerMese.keys()].sort()
  let pagato = 0
  return [...pagamenti]
    .map((p, i) => ({ p, i }))
    .sort((a, b) => a.p.pagato_il.localeCompare(b.p.pagato_il))
    .map(({ p, i }) => {
      pagato += p.base
      let cumulato = 0
      const mese =
        mesi.find((m) => {
          cumulato += cashPerMese.get(m) ?? 0
          return m <= p.pagato_il && cumulato >= pagato - 0.005
        }) ?? `${p.pagato_il.slice(0, 7)}-01`
      return { i, mese }
    })
    .sort((a, b) => a.i - b.i)
    .map(({ mese }) => mese)
}

// ---------------------------------------------------------------------------
// The CSV Dany completes: one row per sale
// ---------------------------------------------------------------------------
export const COLONNE_CSV = [
  'data',
  'cash',
  'revenue',
  'cliente_nome',
  'cliente_cognome',
  'prodotto',
  'numero_rate',
  'tipo',
  'da_setter',
  'metodo',
] as const

export type Segnaposto = { prodotto: (revenue: number) => string }

/**
 * One row per close. A day with two closes gets two rows with the day's totals
 * split in half: Dany corrects the split when he knows it. With `segnaposto` the
 * client and plan columns are filled with placeholders to edit later in the app.
 */
export function csvDaCompletare(giorni: GiornoChiusure[], segnaposto?: Segnaposto): string {
  const righe = giorni.flatMap((g) =>
    Array.from({ length: g.chiusure }, (_, i) => {
      const cash = Math.round((g.cash / g.chiusure) * 100) / 100
      const revenue = Math.round((g.revenue / g.chiusure) * 100) / 100
      const rate = cash > 0 && Number.isInteger(revenue / cash) && revenue / cash <= 24 ? revenue / cash : 1
      return [
        dataCsv(g.data),
        importoCsv(cash),
        importoCsv(revenue),
        segnaposto ? 'Cliente' : '',
        segnaposto ? `Excel ${dataCsv(g.data)}${g.chiusure > 1 ? ` ${i + 1}` : ''}` : '',
        segnaposto ? segnaposto.prodotto(revenue) : '',
        segnaposto ? rate : '',
        'nuovo',
        segnaposto ? 'sì' : '',
        '',
      ]
    }),
  )
  return righeCsv([...COLONNE_CSV], righe)
}

export type RigaVendita = {
  riga: number
  data: string
  cash: number
  revenue: number
  cliente_nome: string
  cliente_cognome: string | null
  prodotto: string
  numero_rate: number
  tipo: 'nuovo' | 'rinnovo' | 'upsell'
  da_setter: boolean
  metodo: string | null
}

const METODI = ['bonifico', 'stripe', 'paypal', 'carta', 'contanti', 'altro']

/** A CSV line with ";" or ",", quotes doubled inside quoted fields. */
function campi(linea: string, separatore: string): string[] {
  const out: string[] = []
  let corrente = ''
  let virgolette = false
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i]
    if (virgolette) {
      if (c === '"' && linea[i + 1] === '"') {
        corrente += '"'
        i++
      } else if (c === '"') virgolette = false
      else corrente += c
    } else if (c === '"') virgolette = true
    else if (c === separatore) {
      out.push(corrente)
      corrente = ''
    } else corrente += c
  }
  out.push(corrente)
  return out.map((s) => s.trim())
}

/** Reads the completed CSV. Every problem is reported with its line; nothing is guessed. */
export function leggiCsvVendite(contenuto: string): { vendite: RigaVendita[]; errori: string[] } {
  const linee = contenuto.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '')
  const errori: string[] = []
  if (linee.length === 0) return { vendite: [], errori: ['Il file è vuoto'] }

  const separatore = linee[0].includes(';') ? ';' : ','
  const intestazione = campi(linee[0], separatore).map((c) => c.toLowerCase())
  const indice = Object.fromEntries(COLONNE_CSV.map((c) => [c, intestazione.indexOf(c)]))
  const mancanti = COLONNE_CSV.filter((c) => indice[c] < 0 && c !== 'metodo')
  if (mancanti.length > 0) return { vendite: [], errori: [`Colonne mancanti: ${mancanti.join(', ')}`] }

  const vendite: RigaVendita[] = []
  linee.slice(1).forEach((linea, i) => {
    const n = i + 2
    const v = campi(linea, separatore)
    const col = (c: (typeof COLONNE_CSV)[number]) => (indice[c] >= 0 ? (v[indice[c]] ?? '') : '')
    const problemi: string[] = []

    const giorno = data(col('data'))
    if (!giorno) problemi.push('data non valida (gg/mm/aaaa)')
    const cash = parseImporto(col('cash'))
    if (cash === null || cash < 0) problemi.push('cash non valido')
    const revenue = parseImporto(col('revenue'))
    if (revenue === null || revenue <= 0) problemi.push('revenue non valida')
    const nome = col('cliente_nome')
    if (!nome) problemi.push('manca cliente_nome')
    const prodotto = col('prodotto')
    if (!prodotto) problemi.push('manca prodotto')
    const rate = Number(col('numero_rate'))
    if (!Number.isInteger(rate) || rate < 1 || rate > 24) problemi.push('numero_rate tra 1 e 24')
    const tipo = (col('tipo') || 'nuovo').toLowerCase()
    if (!['nuovo', 'rinnovo', 'upsell'].includes(tipo)) problemi.push('tipo: nuovo, rinnovo o upsell')
    const setter = col('da_setter').toLowerCase()
    if (!['si', 'sì', 'no'].includes(setter)) problemi.push('da_setter: sì o no')
    const metodo = col('metodo').toLowerCase() || null
    if (metodo && !METODI.includes(metodo)) problemi.push(`metodo: ${METODI.join(', ')} o vuoto`)
    if (cash !== null && revenue !== null && cash > revenue) problemi.push('cash maggiore della revenue')

    if (problemi.length > 0) {
      errori.push(`Riga ${n}: ${problemi.join('; ')}`)
      return
    }
    vendite.push({
      riga: n,
      data: giorno!,
      cash: cash!,
      revenue: revenue!,
      cliente_nome: nome,
      cliente_cognome: col('cliente_cognome') || null,
      prodotto,
      numero_rate: rate,
      tipo: tipo as RigaVendita['tipo'],
      da_setter: setter !== 'no',
      metodo,
    })
  })

  return { vendite, errori }
}

/** The completed CSV must add up, day by day, to the Excel it came from. */
export function confrontaConExcel(vendite: RigaVendita[], giorni: GiornoChiusure[]): string[] {
  const somme = new Map<string, { cash: number; revenue: number }>()
  for (const v of vendite) {
    const s = somme.get(v.data) ?? { cash: 0, revenue: 0 }
    s.cash += v.cash
    s.revenue += v.revenue
    somme.set(v.data, s)
  }
  const errori: string[] = []
  const vicini = (a: number, b: number) => Math.abs(a - b) < 0.005
  for (const g of giorni) {
    const s = somme.get(g.data) ?? { cash: 0, revenue: 0 }
    if (!vicini(s.cash, g.cash) || !vicini(s.revenue, g.revenue)) {
      errori.push(
        `${dataCsv(g.data)}: nel CSV cash ${importoCsv(s.cash)} e revenue ${importoCsv(s.revenue)}, nell’Excel ${importoCsv(g.cash)} e ${importoCsv(g.revenue)}`,
      )
    }
    somme.delete(g.data)
  }
  for (const giorno of somme.keys()) errori.push(`${dataCsv(giorno)}: nell’Excel non ci sono chiusure in questo giorno`)
  return errori
}

/**
 * How many leading instalments the cash of the signing day covers. The plan comes
 * from the database (piano_rate); null when the cash matches no prefix of it.
 */
export function rateCoperte(cash: number, piano: number[]): number | null {
  if (cash === 0) return 0
  let somma = 0
  for (let i = 0; i < piano.length; i++) {
    somma += piano[i]
    if (Math.abs(somma - cash) < 0.005) return i + 1
    if (somma > cash) return null
  }
  return null
}
