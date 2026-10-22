'use client'

import { useTesti } from '@/components/i18n/lingua-provider'
import { StatoErrore } from '@/components/stati/stato-errore'
import { NOTIFICHE } from '@/lib/i18n/testi/notifiche'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const t = useTesti(NOTIFICHE)
  return <StatoErrore titolo={t.errore} riprova={reset} />
}
