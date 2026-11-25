'use client'

import { useTesti } from '@/components/i18n/lingua-provider'
import { StatoErrore } from '@/components/stati/stato-errore'
import { ONBOARDING } from '@/lib/i18n/testi/onboarding'
import { QUESTIONARIO_ADMIN } from '@/lib/i18n/testi/questionario-admin'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const t = useTesti(QUESTIONARIO_ADMIN)
  const o = useTesti(ONBOARDING)
  return (
    <div className="max-w-4xl">
      <StatoErrore titolo={t.errore} descrizione={o.erroreDescrizione} riprova={reset} />
    </div>
  )
}
