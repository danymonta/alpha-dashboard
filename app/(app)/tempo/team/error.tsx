'use client'

import { useLingua } from '@/components/i18n/lingua-provider'
import { StatoErrore } from '@/components/stati/stato-errore'
import { PROGETTI } from '@/lib/i18n/testi/progetti'

/** The team tab fails on its own: the tabs stay, "Il mio tempo" is one tap away. */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <StatoErrore descrizione={PROGETTI[useLingua()].errori.tempoTeam} riprova={reset} />
}
