'use client'

import { usePathname } from 'next/navigation'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

import type { AppRole } from '@/lib/auth/roles'
import { NESSUN_PROMEMORIA, type Promemoria } from '@/lib/nav'
import { createClient } from '@/lib/supabase/client'

/**
 * The numbers on the navigation items, each shown only to the person who has
 * something to do (CLAUDE.md section 17):
 * - the person's own past calls still without an outcome (07/10/2026), on
 *   "Le mie call" and on the closer's page: admin and closer, always and only
 *   their own calls (closer_id);
 * - the setters' days proposed from the Instagram DMs and still to decide
 *   (08/10/2026), on the setter's "Oggi" (his own) and on the admin's
 *   "Setter" (every setter's: Dany decides them too).
 *
 * The layout counts them on the server, but a shared layout does not render
 * again on a client navigation: a call that passes while the app is open, or
 * an outcome recorded (a day decided) on another device, would leave the
 * badge on the morning's number. So the server's counts are the start, and
 * the browser counts again, with the same queries under RLS, on every page
 * change and whenever the app comes back to the front. A fresh server render
 * (a server action that revalidates, a refresh, the Panoramica's Realtime)
 * brings its own counts and starts over, without a second one from the
 * browser; so does the first render. Coming back to the front fires both
 * visibilitychange and focus: one count, never two within two seconds. On an
 * error the last number stays: the badge is a reminder, never a reason for
 * anything to fail. Never an alert, never an email.
 */
const Contesto = createContext<Promemoria>(NESSUN_PROMEMORIA)

type Props = {
  /** The layout's counts. */
  iniziale: Promemoria
  /** Changes on every server render of the layout: its counts are fresh again. */
  versione: number
  profiloId: string
  ruolo: AppRole
  children: ReactNode
}

/** Coming back to the front fires visibilitychange and focus together: one count. */
const INTERVALLO_MINIMO_MS = 2000

/** Who counts what: the outcomes are the admin's and the closer's, the days to decide the admin's and the setter's. */
function cosaConta(ruolo: AppRole) {
  return {
    esiti: ruolo === 'admin' || ruolo === 'closer',
    daApprovare: ruolo === 'admin' || ruolo === 'setter',
  }
}

export function EsitiDaRegistrareProvider({ iniziale, versione, profiloId, ruolo, children }: Props) {
  const pathname = usePathname()
  const conta = cosaConta(ruolo)
  const contaQualcosa = conta.esiti || conta.daApprovare
  const [stato, setStato] = useState({ versione, promemoria: iniziale })
  // a new server render: its counts win over whatever the browser read before
  if (stato.versione !== versione) setStato({ versione, promemoria: iniziale })
  // the page the server counted on: the first render needs no count from the browser
  const contataSu = useRef<string | null>(pathname)

  useEffect(() => {
    if (!contaQualcosa) return
    const { esiti: contaEsiti, daApprovare: contaDaApprovare } = cosaConta(ruolo)
    const supabase = createClient()
    let attivo = true
    let ultima = 0
    let avviataAlle = 0

    async function contaGliEsiti(): Promise<number | null> {
      if (!contaEsiti) return 0
      const { count, error } = await supabase
        .from('calls')
        .select('id', { count: 'exact', head: true })
        .eq('closer_id', profiloId)
        .eq('stato', 'programmata')
        .lt('programmata_il', new Date().toISOString())
      return error ? null : count
    }

    async function contaDaDecidere(): Promise<number | null> {
      if (!contaDaApprovare) return 0
      let query = supabase
        .from('report_proposte_instagram')
        .select('id', { count: 'exact', head: true })
        .eq('stato', 'da_confermare')
      // the setter's own (RLS says the same); the admin's: every setter's
      if (ruolo === 'setter') query = query.eq('setter_id', profiloId)
      const { count, error } = await query
      return error ? null : count
    }

    async function aggiorna() {
      avviataAlle = Date.now()
      const questa = ++ultima
      const [esiti, daApprovare] = await Promise.all([contaGliEsiti(), contaDaDecidere()])
      // only the latest answer of this page counts; a failed one keeps the last number
      if (!attivo || questa !== ultima) return
      setStato((attuale) => {
        const promemoria = {
          esiti: esiti ?? attuale.promemoria.esiti,
          daApprovare: daApprovare ?? attuale.promemoria.daApprovare,
        }
        return promemoria.esiti === attuale.promemoria.esiti && promemoria.daApprovare === attuale.promemoria.daApprovare
          ? attuale
          : { ...attuale, promemoria }
      })
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
    // never on `versione`: a new server render brings its own counts
  }, [contaQualcosa, ruolo, profiloId, pathname])

  const { promemoria } = stato
  return (
    <Contesto.Provider
      value={{
        esiti: conta.esiti ? promemoria.esiti : 0,
        daApprovare: conta.daApprovare ? promemoria.daApprovare : 0,
      }}
    >
      {children}
    </Contesto.Provider>
  )
}

/** The numbers for the navigation items: zero outside the provider and where the role counts nothing. */
export function usePromemoria(): Promemoria {
  return useContext(Contesto)
}
