import { formatOra, oggiRoma } from '@/lib/date'
import { formatData } from '@/lib/format'

/** "19/10/2026 18:42", Europe/Rome, from a timestamptz. */
export function quandoNotifica(istante: string): string {
  const d = new Date(istante)
  return `${formatData(oggiRoma(d))} ${formatOra(d)}`
}
