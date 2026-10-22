'use client'

import { createContext, useContext, useEffect, type ReactNode } from 'react'

import { formato, type Formato } from '@/lib/format'
import type { Bilingue, Lingua } from '@/lib/i18n/lingua'

const ContestoLingua = createContext<Lingua>('it')

/**
 * The language of the page for the client components (1.53.0). The server decides it
 * (cookie, or the role) and passes it from the root layout: a change of language is a
 * server render, which brings the new value here. No state of its own.
 */
export function LinguaProvider({ lingua, children }: { lingua: Lingua; children: ReactNode }) {
  // the server writes lang on <html> in the first byte; this keeps it after a change of language
  useEffect(() => {
    document.documentElement.lang = lingua
  }, [lingua])
  return <ContestoLingua.Provider value={lingua}>{children}</ContestoLingua.Provider>
}

export function useLingua(): Lingua {
  return useContext(ContestoLingua)
}

/** The numbers and dates of the page's language. */
export function useFormato(): Formato {
  return formato(useLingua())
}

/** The words of a dictionary in the page's language. */
export function useTesti<T>(dizionario: Bilingue<T>): T {
  return dizionario[useLingua()]
}
