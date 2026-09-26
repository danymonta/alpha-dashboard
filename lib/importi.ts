/**
 * Reads an amount typed the Italian way. Parsing only: every sum, split or
 * rate is computed in SQL.
 *
 *   "1.500"     -> 1500     (dot followed by groups of 3 digits = thousands)
 *   "1.500,50"  -> 1500.5   (comma = decimals, dots = thousands)
 *   "1500,5"    -> 1500.5
 *   "1500.50"   -> 1500.5   (a single dot not followed by 3 digits = decimals)
 *   "€ 2 400"   -> 2400
 */
export function parseImporto(testo: string | null | undefined): number | null {
  if (testo === null || testo === undefined) return null
  const pulito = testo.replace(/[€\s ]/g, '')
  if (pulito === '') return null

  let normalizzato: string
  if (pulito.includes(',')) {
    if (!/^\d{1,3}(\.\d{3})*,\d{1,2}$|^\d+,\d{1,2}$/.test(pulito)) return null
    normalizzato = pulito.replace(/\./g, '').replace(',', '.')
  } else if (/^\d{1,3}(\.\d{3})+$/.test(pulito)) {
    normalizzato = pulito.replace(/\./g, '')
  } else if (/^\d+(\.\d{1,2})?$/.test(pulito)) {
    normalizzato = pulito
  } else {
    return null
  }

  const valore = Number(normalizzato)
  return Number.isFinite(valore) ? valore : null
}
