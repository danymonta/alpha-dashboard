'use client'

import { useLingua } from '@/components/i18n/lingua-provider'
import { StatoErrore } from '@/components/stati/stato-errore'
import { CONTATTI } from '@/lib/i18n/testi/contatti'

/** Setting e contatti could not be read: human words and «Riprova». */
export default function Error({ reset }: { error: Error; reset: () => void }) {
  const t = CONTATTI[useLingua()]
  return <StatoErrore titolo={t.errore} descrizione={t.erroreDescrizione} riprova={reset} />
}
