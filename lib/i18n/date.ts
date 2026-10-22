import { quandoFollowUp } from '@/lib/call/follow-up'
import { quandoBreve } from '@/lib/call/spostamento'
import { aggiungiGiorni, etichettaGiorno, etichettaGiornoBreve, formatOra, oggiRoma } from '@/lib/date'
import { GIORNI_BREVI_EN, GIORNI_EN, parseDataISO } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'

/**
 * The day words of lib/date.ts and lib/call in the page's language (1.53.0). Italian is the
 * function of always; English the same shape: «Today», «Monday 22/09», «Mon 22/09», «30/09 at 19:00».
 */

function ggmm(iso: string): string {
  const d = parseDataISO(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`
}

/** "Today", "Yesterday", "Tomorrow", or "Monday 22/09". */
export function etichettaGiornoIn(iso: string, oggi: string, lingua: Lingua): string {
  if (lingua === 'it') return etichettaGiorno(iso, oggi)
  if (iso === oggi) return 'Today'
  if (iso === aggiungiGiorni(oggi, -1)) return 'Yesterday'
  if (iso === aggiungiGiorni(oggi, 1)) return 'Tomorrow'
  return `${GIORNI_EN[parseDataISO(iso).getDay()]} ${ggmm(iso)}`
}

/** "today", "yesterday", "tomorrow", or "Mon 22/09". */
export function etichettaGiornoBreveIn(iso: string, oggi: string, lingua: Lingua): string {
  if (lingua === 'it') return etichettaGiornoBreve(iso, oggi)
  if (iso === oggi) return 'today'
  if (iso === aggiungiGiorni(oggi, -1)) return 'yesterday'
  if (iso === aggiungiGiorni(oggi, 1)) return 'tomorrow'
  return `${GIORNI_BREVI_EN[parseDataISO(iso).getDay()]} ${ggmm(iso)}`
}

function data(giorno: string, oggi: string): string {
  const [anno, mese, gg] = giorno.split('-')
  return anno === oggi.slice(0, 4) ? `${gg}/${mese}` : `${gg}/${mese}/${anno}`
}

/** "30/09 at 19:00" in Europe/Rome, from a timestamptz (quandoBreve). */
export function quandoBreveIn(istante: string, oggi: string, lingua: Lingua): string {
  if (lingua === 'it') return quandoBreve(istante, oggi)
  return `${data(oggiRoma(new Date(istante)), oggi)} at ${formatOra(istante)}`
}

/** "Thursday 08/10 at 18:00" (quandoFollowUp). */
export function quandoFollowUpIn(istante: string, oggi: string, lingua: Lingua): string {
  if (lingua === 'it') return quandoFollowUp(istante, oggi)
  const giorno = oggiRoma(new Date(istante))
  return `${GIORNI_EN[parseDataISO(giorno).getDay()]} ${data(giorno, oggi)} at ${formatOra(istante)}`
}
