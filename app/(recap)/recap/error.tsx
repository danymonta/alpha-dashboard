'use client'

import { useLingua } from '@/components/i18n/lingua-provider'
import { StatoErrore } from '@/components/stati/stato-errore'
import { RECAP } from '@/lib/i18n/testi/recap'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <StatoErrore titolo={RECAP[useLingua()].errore} riprova={reset} />
}
