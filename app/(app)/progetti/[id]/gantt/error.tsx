'use client'

import { useLingua } from '@/components/i18n/lingua-provider'
import { StatoErrore } from '@/components/stati/stato-errore'
import { PROGETTI } from '@/lib/i18n/testi/progetti'

/** The tab fails on its own: the project header and the other tabs stay usable. */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <StatoErrore descrizione={PROGETTI[useLingua()].errori.gantt} riprova={reset} />
}
