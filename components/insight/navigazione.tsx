'use client'

import { useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useMemo, useTransition, type ReactNode } from 'react'

import { cn } from '@/lib/utils'

type Navigazione = { inAttesa: boolean; vai: (href: string) => void }

const ContestoNavigazione = createContext<Navigazione>({ inAttesa: false, vai: () => {} })

export function useNavigazioneInsight() {
  return useContext(ContestoNavigazione)
}

/**
 * The day of the Insight changes in the address (?giorno), in a transition:
 * while the other recap is on its way the page keeps the one on screen, dimmed
 * and busy (no skeleton flash, lettura-pagina §6), and the select shows its
 * spinner. replace, never push: the back button leaves the page, as the
 * artifact's day select never made history.
 */
export function NavigazioneInsight({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [inAttesa, avvia] = useTransition()
  const vai = useCallback(
    (href: string) => {
      avvia(() => {
        router.replace(href, { scroll: false })
      })
    },
    [router],
  )
  const valore = useMemo(() => ({ inAttesa, vai }), [inAttesa, vai])
  return <ContestoNavigazione.Provider value={valore}>{children}</ContestoNavigazione.Provider>
}

/** The recap under the tabs: busy and dimmed while another day arrives. */
export function ContenutoInsight({ children, className }: { children: ReactNode; className?: string }) {
  const { inAttesa } = useNavigazioneInsight()
  return (
    <div
      aria-busy={inAttesa || undefined}
      data-testid="contenuto-insight"
      className={cn('grid gap-7 motion-safe:transition-opacity', inAttesa && 'opacity-60', className)}
    >
      {children}
    </div>
  )
}
