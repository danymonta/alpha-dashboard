'use client'

import { StatoErrore } from '@/components/stati/stato-errore'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <StatoErrore descrizione="Non siamo riusciti a caricare i tuoi task. Riprova fra un momento." riprova={reset} />
}
