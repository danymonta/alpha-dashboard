'use client'

import { useTesti } from '@/components/i18n/lingua-provider'
import { StatoErrore } from '@/components/stati/stato-errore'
import { ONBOARDING } from '@/lib/i18n/testi/onboarding'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const t = useTesti(ONBOARDING)
  return (
    <div className="max-w-3xl">
      <StatoErrore titolo={t.errore} descrizione={t.erroreDescrizione} riprova={reset} />
    </div>
  )
}
