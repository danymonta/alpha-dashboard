import { VUOTO, formatData, formatEuro } from '@/lib/format'
import { formatStima } from '@/lib/progetti'

/**
 * "Campo: prima → dopo" lines for the confirmation card, from the row read
 * with the user's session and the values the tool is about to write. Only
 * presentation: the numbers come from the database or from the user.
 */
export type Formato = 'testo' | 'lungo' | 'euro' | 'data' | 'si_no' | 'minuti' | 'percento'

function vuoto(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0)
}

/** A value as the card shows it: dates the Italian way, euro, sì/no, "–" for nothing. */
export function mostra(v: unknown, formato: Formato = 'testo'): string {
  if (vuoto(v)) return VUOTO
  switch (formato) {
    case 'euro':
      return formatEuro(v as number | string)
    case 'data':
      return formatData(String(v))
    case 'si_no':
      return v ? 'sì' : 'no'
    case 'minuti':
      return formatStima(Number(v)) || VUOTO
    case 'percento':
      return `${String(v).replace('.', ',')}%`
    default:
      if (Array.isArray(v)) return v.join(', ')
      return String(v).trim()
  }
}

function uguali(a: unknown, b: unknown, formato: Formato): boolean {
  if (vuoto(a) && vuoto(b)) return true
  if (formato === 'euro' || formato === 'minuti' || formato === 'percento') return Number(a) === Number(b)
  if (formato === 'si_no') return Boolean(a) === Boolean(b)
  if (Array.isArray(a) || Array.isArray(b)) return JSON.stringify(a ?? []) === JSON.stringify(b ?? [])
  return String(a ?? '').trim() === String(b ?? '').trim()
}

/**
 * "Telefono: +39 111 → +39 333", or null when the value does not change. A
 * long text (lungo: notes, descriptions) is compared whole and written whole
 * after the arrow: the card never hides a part of what will be saved; only the
 * old text is shortened.
 */
export function cambio(etichetta: string, prima: unknown, dopo: unknown, formato: Formato = 'testo'): string | null {
  if (uguali(prima, dopo, formato)) return null
  const vecchio = formato === 'lungo' && !vuoto(prima) ? breve(String(prima)) : mostra(prima, formato)
  return `${etichetta}: ${vecchio} → ${mostra(dopo, formato)}`
}

export type Voce = readonly [etichetta: string, prima: unknown, dopo: unknown, formato?: Formato]

/** Every line that really changes; nothing changes, one line says so. */
export function cambi(voci: readonly Voce[]): string[] {
  const righe = voci.flatMap(([etichetta, prima, dopo, formato]) => {
    const riga = cambio(etichetta, prima, dopo, formato)
    return riga ? [riga] : []
  })
  return righe.length > 0 ? righe : ['Nessun dato cambia.']
}

/** The first characters of a long text, on one line. */
export function breve(testo: string | null | undefined, lunghezza = 120): string {
  const t = (testo ?? '').replace(/\s+/g, ' ').trim()
  return t.length > lunghezza ? `${t.slice(0, lunghezza - 1)}…` : t
}
