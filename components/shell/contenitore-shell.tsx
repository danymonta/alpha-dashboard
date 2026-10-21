'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import { cookieSidebar, type StatoSidebar } from '@/lib/shell/sidebar-stato'

type Contesto = {
  ridotta: boolean
  inverti: () => void
}

const ContestoSidebar = createContext<Contesto>({ ridotta: false, inverti: () => {} })

/** Whether the desktop sidebar is shrunk to icons, and the way to flip it. */
export function useSidebar(): Contesto {
  return useContext(ContestoSidebar)
}

/**
 * The page frame: it owns the sidebar's state (read from the cookie by the
 * server, so the first paint already has the right width) and publishes it as
 * data-sidebar, so the sidebar and the content react through CSS alone. Below
 * 768px the sidebar does not exist (bottom bar) and nothing changes.
 */
export function ContenitoreShell({ iniziale, children }: { iniziale: StatoSidebar; children: ReactNode }) {
  const [ridotta, setRidotta] = useState(iniziale === 'ridotta')

  const inverti = useCallback(() => {
    const prossima = !ridotta
    setRidotta(prossima)
    try {
      document.cookie = cookieSidebar(prossima ? 'ridotta' : 'estesa')
    } catch {
      // cookies blocked: the choice holds until the page is closed
    }
  }, [ridotta])

  const valore = useMemo(() => ({ ridotta, inverti }), [ridotta, inverti])

  return (
    <ContestoSidebar.Provider value={valore}>
      <div
        data-sidebar={ridotta ? 'ridotta' : 'estesa'}
        className="group/shell min-h-dvh transition-[padding] duration-150 ease-out md:pl-60 md:data-[sidebar=ridotta]:pl-16"
      >
        {children}
      </div>
    </ContestoSidebar.Provider>
  )
}
