'use client'

import { StatoErrore } from '@/components/stati/stato-errore'

/** The tab fails on its own: the project header and the other tabs stay usable. */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <StatoErrore descrizione="Non siamo riusciti a caricare le note del progetto. Riprova fra un momento." riprova={reset} />
}
