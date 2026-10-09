'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type Versione = { versione: string; aggiorna: (nuova: string) => void }

const Contesto = createContext<Versione | null>(null)

/** The later of two updated_at values (Postgres timestamptz as ISO text); a tie keeps the second. */
function piuRecente(a: string, b: string): string {
  const ta = Date.parse(a)
  const tb = Date.parse(b)
  return Number.isFinite(ta) && Number.isFinite(tb) && ta > tb ? a : b
}

/**
 * The version (updated_at) of the content open on its page, shared by the
 * Status menu, the sections and the properties sheet. Every action returns the
 * row's new updated_at: the person's own Status tap or section save moves the
 * version on, so the properties sheet never conflicts with his own work. A
 * render from the server (router.refresh) brings the version it read; a newer
 * one already known here wins.
 */
export function VersioneContenuto({ iniziale, children }: { iniziale: string; children: ReactNode }) {
  const [dalServer, setDalServer] = useState(iniziale)
  const [versione, setVersione] = useState(iniziale)
  // a new render from the server: adjust while rendering, never in an effect
  if (dalServer !== iniziale) {
    setDalServer(iniziale)
    setVersione((attuale) => piuRecente(attuale, iniziale))
  }
  const aggiorna = useCallback((nuova: string) => setVersione((attuale) => piuRecente(attuale, nuova)), [])
  const valore = useMemo(() => ({ versione, aggiorna }), [versione, aggiorna])
  return <Contesto.Provider value={valore}>{children}</Contesto.Provider>
}

/** Inside a content's page: its version; elsewhere (the lists) null. */
export function useVersioneContenuto(): Versione | null {
  return useContext(Contesto)
}
