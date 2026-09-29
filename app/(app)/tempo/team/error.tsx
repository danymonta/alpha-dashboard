'use client'

import { StatoErrore } from '@/components/stati/stato-errore'

/** The team tab fails on its own: the tabs stay, "Il mio tempo" is one tap away. */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <StatoErrore descrizione="Non siamo riusciti a caricare il tempo del team. Riprova fra un momento." riprova={reset} />
}
