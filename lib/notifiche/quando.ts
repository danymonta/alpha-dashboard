import { formatOra, oggiRoma } from '@/lib/date'
import { formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'

/** "19/10/2026 18:42", Europe/Rome, from a timestamptz. */
export function quandoNotifica(istante: string, lingua: Lingua = 'it'): string {
  const d = new Date(istante)
  return `${formato(lingua).formatData(oggiRoma(d))} ${formatOra(d)}`
}
