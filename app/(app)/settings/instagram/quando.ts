import { aggiungiGiorni, formatOra, oggiRoma } from '@/lib/date'
import { formatData } from '@/lib/format'

/** "oggi alle 00:41", "ieri alle 00:41", "il 05/10/2026 alle 00:41" (Europe/Rome). */
export function quando(istante: string, oggi: string): string {
  const giorno = oggiRoma(new Date(istante))
  const ora = formatOra(istante)
  if (giorno === oggi) return `oggi alle ${ora}`
  if (giorno === aggiungiGiorni(oggi, -1)) return `ieri alle ${ora}`
  return `il ${formatData(giorno)} alle ${ora}`
}
