import { aggiungiGiorni, formatOra, oggiRoma } from '@/lib/date'
import { formatData, formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'

/**
 * "oggi alle 00:41", "ieri alle 00:41", "il 05/10/2026 alle 00:41" (Europe/Rome);
 * in English "today at 00:41", "yesterday at 00:41", "on 05 Oct 2026 at 00:41".
 */
export function quando(istante: string, oggi: string, lingua: Lingua = 'it'): string {
  const giorno = oggiRoma(new Date(istante))
  const ora = formatOra(istante)
  if (lingua === 'en') {
    if (giorno === oggi) return `today at ${ora}`
    if (giorno === aggiungiGiorni(oggi, -1)) return `yesterday at ${ora}`
    return `on ${formato('en').formatData(giorno)} at ${ora}`
  }
  if (giorno === oggi) return `oggi alle ${ora}`
  if (giorno === aggiungiGiorni(oggi, -1)) return `ieri alle ${ora}`
  return `il ${formatData(giorno)} alle ${ora}`
}
