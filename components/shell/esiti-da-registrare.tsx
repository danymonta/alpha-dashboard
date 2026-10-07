'use client'

import { usePathname } from 'next/navigation'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

import type { AppRole } from '@/lib/auth/roles'
import { createClient } from '@/lib/supabase/client'

/**
 * The person's own past calls still without an outcome (07/10/2026), for the
 * badge on "Le mie call" and on the closer's page. The layout counts them on
 * the server, but a shared layout does not render again on a client
 * navigation: a call that passes while the app is open, or an outcome recorded
 * on another device, would leave the badge on the morning's number. So the
 * server's count is the start, and the browser counts again, with the same
 * query under RLS, on every page change and whenever the app comes back to the
 * front. A fresh server render (a server action that revalidates, a refresh,
 * the Panoramica's Realtime) brings its own count and starts over, without a
 * second one from the browser; so does the first render. Coming back to the
 * front fires both visibilitychange and focus: one count, never two within
 * two seconds. On an error the last number stays: the
 * badge is a reminder, never a reason for anything to fail. Admin and closer
 * only, always and only their own calls (closer_id): never someone else's
 * number, never an alert (CLAUDE.md section 17).
 */
const Contesto = createContext(0)

type Props = {
  /** The layout's count. */
  iniziale: number
  /** Changes on every server render of the layout: its count is fresh again. */
  versione: number
  profiloId: string
  ruolo: AppRole
  children: ReactNode
}

/** Coming back to the front fires visibilitychange and focus together: one count. */
const INTERVALLO_MINIMO_MS = 2000

export function EsitiDaRegistrareProvider({ iniziale, versione, profiloId, ruolo, children }: Props) {
  const pathname = usePathname()
  const conta = ruolo === 'admin' || ruolo === 'closer'
  const [stato, setStato] = useState({ versione, numero: iniziale })
  // a new server render: its count wins over whatever the browser read before
  if (stato.versione !== versione) setStato({ versione, numero: iniziale })
  // the page the server counted on: the first render needs no count from the browser
  const contataSu = useRef<string | null>(pathname)

  useEffect(() => {
    if (!conta) return
    const supabase = createClient()
    let attivo = true
    let ultima = 0
    let avviataAlle = 0

    async function aggiorna() {
      avviataAlle = Date.now()
      const questa = ++ultima
      const { count, error } = await supabase
        .from('calls')
        .select('id', { count: 'exact', head: true })
        .eq('closer_id', profiloId)
        .eq('stato', 'programmata')
        .lt('programmata_il', new Date().toISOString())
      // only the latest answer of this page counts; a failed one keeps the last number
      if (!attivo || questa !== ultima || error || count === null) return
      setStato((attuale) => (attuale.numero === count ? attuale : { ...attuale, numero: count }))
    }

    function inPrimoPiano() {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - avviataAlle < INTERVALLO_MINIMO_MS) return
      void aggiorna()
    }

    // a client navigation: the layout does not render again, the browser counts.
    // The page the server just counted on does not need it
    if (contataSu.current === pathname) contataSu.current = null
    else void aggiorna()
    document.addEventListener('visibilitychange', inPrimoPiano)
    window.addEventListener('focus', inPrimoPiano)
    return () => {
      attivo = false
      document.removeEventListener('visibilitychange', inPrimoPiano)
      window.removeEventListener('focus', inPrimoPiano)
    }
    // never on `versione`: a new server render brings its own count
  }, [conta, profiloId, pathname])

  return <Contesto.Provider value={conta ? stato.numero : 0}>{children}</Contesto.Provider>
}

/** The number for the navigation items: 0 outside the provider and for every other role. */
export function useEsitiDaRegistrare(): number {
  return useContext(Contesto)
}
