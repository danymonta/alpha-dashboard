'use client'

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'

const ContestoAnnunci = createContext<(testo: string) => void>(() => {})

/**
 * One polite live region for the whole Insight page (never one per card: a
 * recap has a hundred of them): the filter set or cleared, a copy, a Fatto
 * that did not save. The same sentence twice is still said twice.
 */
export function AnnunciProvider({ children }: { children: ReactNode }) {
  const [testo, setTesto] = useState('')
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const annuncia = useCallback((nuovo: string) => {
    if (timer.current) clearTimeout(timer.current)
    // emptied first, so a repeated sentence changes the region and is read again
    setTesto('')
    timer.current = setTimeout(() => setTesto(nuovo), 60)
  }, [])

  return (
    <ContestoAnnunci.Provider value={annuncia}>
      {children}
      <p className="sr-only" role="status" aria-live="polite" data-testid="annunci-insight">
        {testo}
      </p>
    </ContestoAnnunci.Provider>
  )
}

export function useAnnuncia() {
  return useContext(ContestoAnnunci)
}
