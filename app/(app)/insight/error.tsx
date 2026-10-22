'use client'

import { StatoErrore } from '@/components/stati/stato-errore'
import { useLingua } from '@/components/i18n/lingua-provider'
import { INSIGHT } from '@/lib/i18n/testi/insight'

/** The recaps could not be read: human words and «Riprova», never a stack trace. */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  const t = INSIGHT[useLingua()]
  return <StatoErrore titolo={t.erroreTitolo} descrizione={t.erroreDescrizione} riprova={reset} />
}
