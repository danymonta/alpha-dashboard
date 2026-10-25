'use client'

import { useTesti } from '@/components/i18n/lingua-provider'
import { StatoErrore } from '@/components/stati/stato-errore'
import { INSTAGRAM_IMPOSTAZIONI } from '@/lib/i18n/testi/instagram-impostazioni'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  const t = useTesti(INSTAGRAM_IMPOSTAZIONI).pagina
  return <StatoErrore descrizione={t.erroreDescrizione} riprova={reset} />
}
