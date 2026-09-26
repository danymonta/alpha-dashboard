'use client'

import { StatoErrore } from '@/components/stati/stato-errore'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <StatoErrore riprova={reset} />
}
