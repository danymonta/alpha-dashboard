'use client'

import { useLingua } from '@/components/i18n/lingua-provider'
import { StatoErrore } from '@/components/stati/stato-errore'
import { DALLE_CALL } from '@/lib/i18n/testi/dalle-call'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <StatoErrore descrizione={DALLE_CALL[useLingua()].errore} riprova={reset} />
}
