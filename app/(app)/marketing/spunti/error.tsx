'use client'

import { useLingua } from '@/components/i18n/lingua-provider'
import { StatoErrore } from '@/components/stati/stato-errore'
import { MARKETING } from '@/lib/i18n/testi/marketing'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <StatoErrore descrizione={MARKETING[useLingua()].spunti.errore} riprova={reset} />
}
