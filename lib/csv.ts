/**
 * CSV for an Italian spreadsheet: ";" separator, decimal comma, dd/mm/yyyy,
 * UTF-8 with BOM so Excel reads the accents. Formatting only: every amount
 * arrives already computed from the database.
 */
const BOM = '﻿'

export type Cella = string | number | boolean | null | undefined

function cella(valore: Cella): string {
  if (valore === null || valore === undefined) return ''
  const testo = typeof valore === 'boolean' ? (valore ? 'sì' : 'no') : String(valore)
  return /[;"\n\r]/.test(testo) ? `"${testo.replace(/"/g, '""')}"` : testo
}

export function righeCsv(intestazione: string[], righe: Cella[][]): string {
  const linee = [intestazione, ...righe].map((r) => r.map(cella).join(';'))
  return BOM + linee.join('\r\n') + '\r\n'
}

/** 1500.5 -> "1500,50": no thousands separator, spreadsheets parse it as a number. */
export function importoCsv(valore: number | string | null | undefined): string {
  if (valore === null || valore === undefined || valore === '') return ''
  const n = typeof valore === 'string' ? Number(valore) : valore
  if (!Number.isFinite(n)) return ''
  return n.toFixed(2).replace('.', ',')
}

/** 'YYYY-MM-DD' -> 'dd/mm/yyyy' */
export function dataCsv(iso: string | null | undefined): string {
  if (!iso) return ''
  const [a, m, g] = iso.slice(0, 10).split('-')
  return `${g}/${m}/${a}`
}
