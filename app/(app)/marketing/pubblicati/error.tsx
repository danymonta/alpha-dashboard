'use client'

import { useLingua } from '@/components/i18n/lingua-provider'
import { StatoErrore } from '@/components/stati/stato-errore'
import { PUBBLICATI } from '@/lib/i18n/testi/pubblicati'

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <StatoErrore
      descrizione={PUBBLICATI[useLingua()].erroreDescrizione}
      riprova={reset}
    />
  )
}
