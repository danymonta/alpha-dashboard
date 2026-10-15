/**
 * The words of the reel analysis on the page (1.36.0), pure: the verdicts,
 * the numbers, the state of an analysis, the phrases of a post without
 * statistics. Client and server components read them, and the tests.
 */
import { formatNumero } from '@/lib/format'

export type Verdetto = 'spingere' | 'mantenere' | 'cambiare'

export const ETICHETTA_VERDETTO: Record<Verdetto, string> = {
  spingere: 'Spingere',
  mantenere: 'Mantenere',
  cambiare: 'Cambiare',
}

export const SENZA_STATISTICHE = 'Senza statistiche'

export function eVerdetto(v: unknown): v is Verdetto {
  return v === 'spingere' || v === 'mantenere' || v === 'cambiare'
}

/** «×1,4», «×0,7», «×12»: a ratio to the median, null when there is none. */
export function formatRapporto(r: number | null | undefined): string | null {
  if (r === null || r === undefined || !Number.isFinite(r)) return null
  return `×${r.toLocaleString('it-IT', { maximumFractionDigits: 1, minimumFractionDigits: 0 })}`
}

/** «23%» from 0.2345 */
export function formatQuota(q: number | null | undefined): string | null {
  if (q === null || q === undefined || !Number.isFinite(q)) return null
  return `${Math.round(q * 100)}%`
}

/** «1,2%» from 0.0123: a rate with its decimal, for the small shares of saves and shares */
export function formatTasso(q: number | null | undefined): string | null {
  if (q === null || q === undefined || !Number.isFinite(q)) return null
  return `${(q * 100).toLocaleString('it-IT', { maximumFractionDigits: 1, minimumFractionDigits: 1 })}%`
}

/** «9,8 s» from milliseconds */
export function formatSecondi(ms: number | null | undefined): string | null {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return null
  return `${(ms / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1, minimumFractionDigits: 1 })} s`
}

/** «0:42» from seconds */
export function formatDurata(secondi: number | null | undefined): string | null {
  if (secondi === null || secondi === undefined || !Number.isFinite(secondi)) return null
  const s = Math.round(secondi)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

/** «9,8 s · 23%» for the watch time and its share of the length */
export function formatVisione(ms: number | null | undefined, quota: number | null | undefined): string {
  const tempo = formatSecondi(ms)
  const q = formatQuota(quota)
  if (!tempo) return 'n/d'
  return q ? `${tempo} · ${q}` : tempo
}

/** What the views column says: the number and, under it, «×1,4 della mediana». */
export function viewsConConfronto(views: number | null | undefined, rapporto: number | null | undefined, confronto: string | null | undefined, etaConfronto: number | null | undefined) {
  const numero = views === null || views === undefined ? null : formatNumero(views)
  const r = formatRapporto(rapporto)
  const quando = confronto === 'vita_intera' ? ' (sulla vita intera)' : etaConfronto ? ` a ${etaConfronto} giorni` : ''
  return { numero, confronto: r ? `${r} della mediana${quando}` : null }
}

export type StatoAnalisiRiga = 'pronta' | 'in_coda' | 'in_corso' | 'fallita' | null

/** The Analisi column: «Pronta», «In coda», «Claude la sta facendo…», «Non riuscita», «Dal 06/10» for a young reel, «Da chiedere». */
export function parolaAnalisi(stato: StatoAnalisiRiga, etaOre: number | null, giornoDisponibile: string | null): string {
  if (stato === 'pronta') return 'Pronta'
  if (stato === 'in_coda') return 'In coda'
  if (stato === 'in_corso') return 'Claude la sta facendo…'
  if (stato === 'fallita') return 'Non riuscita'
  if (etaOre !== null && etaOre < 72 && giornoDisponibile) return `Dal ${giornoDisponibile}`
  return 'Da chiedere'
}

/** The lead column: «6 DM · 3 in target · 1 call», «alcuni giorni non contati» after the 14th, or «non contati». */
export function parolaLead(r: {
  lead_contati: boolean | null
  lead_completi: boolean | null
  dm_14g: number | null
  in_target_14g: number | null
  call_14g: number | null
}): string {
  if (!r.lead_contati || r.dm_14g === null) return 'non contati'
  const base = `${r.dm_14g} DM · ${r.in_target_14g ?? 0} in target · ${r.call_14g ?? 0} call`
  return r.lead_completi === false ? `${base} · alcuni giorni non contati` : base
}

/** Why a post has no statistics, in words (studio dati §8). */
export function fraseStatoPost(stato: string | null | undefined, giornoLettura: string | null, parziali: boolean | null): string | null {
  switch (stato) {
    case 'prima_della_conversione':
      return 'Instagram non dà le statistiche dei post pubblicati prima che l’account diventasse professionale.'
    case 'non_disponibili':
    case 'da_leggere':
      return 'Instagram non ha ancora i numeri di questo post: riprovo domani.'
    case 'senza_permesso':
      return 'Le statistiche di Instagram non sono ancora attive.'
    case 'lette':
      return parziali ? 'Numeri delle prime ore: Instagram li completa entro 48 ore.' : giornoLettura ? null : null
    default:
      return null
  }
}
