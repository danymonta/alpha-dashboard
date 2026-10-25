'use client'

import { useTesti } from '@/components/i18n/lingua-provider'
import { StatoErrore } from '@/components/stati/stato-errore'
import { FATHOM } from '@/lib/i18n/testi/fathom'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const t = useTesti(FATHOM).pagina
  return <StatoErrore descrizione={t.erroreDescrizione} riprova={reset} />
}
