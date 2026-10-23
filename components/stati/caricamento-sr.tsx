'use client'

import { useTesti } from '@/components/i18n/lingua-provider'
import { SHELL } from '@/lib/i18n/testi/shell'

/** «Caricamento in corso», for screen readers, in the page's language. */
export function CaricamentoSr() {
  return <span className="sr-only">{useTesti(SHELL).caricamentoInCorso}</span>
}
