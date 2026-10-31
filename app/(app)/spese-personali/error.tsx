'use client'

import { useLingua } from '@/components/i18n/lingua-provider'
import { StatoErrore } from '@/components/stati/stato-errore'
import { SPESE_PERSONALI } from '@/lib/i18n/testi/spese-personali'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <StatoErrore titolo={SPESE_PERSONALI[useLingua()].errore} riprova={reset} />
}
