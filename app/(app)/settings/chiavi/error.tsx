'use client'

import { useTesti } from '@/components/i18n/lingua-provider'
import { StatoErrore } from '@/components/stati/stato-errore'
import { CHIAVI } from '@/lib/i18n/testi/chiavi'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const t = useTesti(CHIAVI)
  return <StatoErrore descrizione={t.erroreDescrizione} riprova={reset} />
}
