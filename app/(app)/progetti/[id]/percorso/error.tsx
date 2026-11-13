'use client'

import { useLingua } from '@/components/i18n/lingua-provider'
import { StatoErrore } from '@/components/stati/stato-errore'
import { CAMPO_TEAM } from '@/lib/i18n/testi/campo-base'

/** The tab fails on its own: the project header and the other tabs stay usable. */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <StatoErrore descrizione={CAMPO_TEAM[useLingua()].errore} riprova={reset} />
}
