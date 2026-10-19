'use client'

import { usePathname } from 'next/navigation'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

import { createClient } from '@/lib/supabase/client'

/**
 * How many notifications the person has not read yet (1.41.0, the bell top
 * right, CLAUDE.md section 10). Always and only their own: RLS on
 * public.notifiche says it, whoever asks. The same pattern as the numbers on
 * the menu (EsitiDaRegistrareProvider): the layout counts on the server, and
 * the browser counts again, with the same head query under RLS, on every page
 * change and whenever the app comes back to the front, because a shared layout
 * does not render again on a client navigation. A fresh server render brings
 * its own count and starts over. On an error the last number stays: the bell
 * is a reminder, never a reason for anything to fail.
 */
const Contesto = createContext(0)

/** Coming back to the front fires visibilitychange and focus together: one count. */
const INTERVALLO_MINIMO_MS = 2000

/** A screen changed what the bell counts (opened, read all, deleted): count again at once. */
const EVENTO_NOTIFICHE = 'alpha:notifiche'

export function ricontaNotifiche() {
  window.dispatchEvent(new Event(EVENTO_NOTIFICHE))
}

export function NotificheProvider({
  iniziale,
  versione,
  children,
}: {
  /** The layout's count. */
  iniziale: number
  /** Changes on every server render of the layout: its count is fresh again. */
  versione: number
  children: ReactNode
}) {
  const pathname = usePathname()
  const [stato, setStato] = useState({ versione, numero: iniziale })
  // a new server render: its count wins over whatever the browser read before
  if (stato.versione !== versione) setStato({ versione, numero: iniziale })
  // the page the server counted on: the first render needs no count from the browser
  const contataSu = useRef<string | null>(pathname)

  useEffect(() => {
    const supabase = createClient()
    let attivo = true
    let ultima = 0
    let avviataAlle = 0

    async function aggiorna() {
      avviataAlle = Date.now()
      const questa = ++ultima
      const { count, error } = await supabase
        .from('notifiche')
        .select('id', { count: 'exact', head: true })
        .is('letta_il', null)
      // only the latest answer counts; a failed one keeps the last number
      if (!attivo || questa !== ultima || error || count === null) return
      setStato((attuale) => (attuale.numero === count ? attuale : { ...attuale, numero: count }))
    }

    function suRichiesta() {
      void aggiorna()
    }

    function inPrimoPiano() {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - avviataAlle < INTERVALLO_MINIMO_MS) return
      void aggiorna()
    }

    if (contataSu.current === pathname) contataSu.current = null
    else void aggiorna()
    document.addEventListener('visibilitychange', inPrimoPiano)
    window.addEventListener('focus', inPrimoPiano)
    window.addEventListener(EVENTO_NOTIFICHE, suRichiesta)
    return () => {
      attivo = false
      document.removeEventListener('visibilitychange', inPrimoPiano)
      window.removeEventListener('focus', inPrimoPiano)
      window.removeEventListener(EVENTO_NOTIFICHE, suRichiesta)
    }
    // never on `versione`: a new server render brings its own count
  }, [pathname])

  return <Contesto.Provider value={stato.numero}>{children}</Contesto.Provider>
}

/** The unread notifications of the person: zero outside the provider. */
export function useNotificheNonLette(): number {
  return useContext(Contesto)
}

/** "Notifiche, 3 da leggere": the bell's accessible name; plain "Notifiche" with nothing to read. */
export function nomeNotifiche(numero: number): string {
  return numero > 0 ? `Notifiche, ${numero} da leggere` : 'Notifiche'
}
