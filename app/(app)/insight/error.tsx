'use client'

import { StatoErrore } from '@/components/stati/stato-errore'
import { ERRORE_PAGINA } from '@/lib/insight/parole'

/** The recaps could not be read: human words and «Riprova», never a stack trace. */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <StatoErrore titolo={ERRORE_PAGINA.titolo} descrizione={ERRORE_PAGINA.descrizione} riprova={reset} />
}
