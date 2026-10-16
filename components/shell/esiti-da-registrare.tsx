'use client'

import { usePathname } from 'next/navigation'
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'

import type { AppRole } from '@/lib/auth/roles'
import { oggiRoma } from '@/lib/date'
import { STATI_DA_COLLEGARE } from '@/lib/marketing/parole-post'
import { NESSUN_PROMEMORIA, type Promemoria } from '@/lib/nav'
import { contaCommentiMancanti } from '@/lib/setting/commenti-mancanti'
import { createClient } from '@/lib/supabase/client'

/**
 * The numbers on the navigation items, each shown only to the person who has
 * something to do (CLAUDE.md section 17):
 * - the person's own past calls still without an outcome (07/10/2026), on
 *   "Le mie call" and on the closer's page: admin and closer, always and only
 *   their own calls (closer_id);
 * - the setters' days proposed from the Instagram DMs and still to decide
 *   (08/10/2026), on the setter's "Oggi" (his own) and on the admin's
 *   "Setter" (every setter's: Dany decides them too);
 * - the setter's own days from 08/10/2026 still without the required comment
 *   of the day (08/10/2026), on his "Oggi": the setter only, never the admin;
 * - the Instagram posts still to link to the content calendar (1.38.0, as on
 *   the Marketing tab), on "Post di Instagram": admin, video editor and
 *   marketing. Posts, never persons.
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
 * visibilitychange and focus: one count, never two within two seconds. A
 * screen that changed what is counted without a server render ("Oggi" saving
 * the comment of the day) asks for a count at once (ricontaPromemoria). On an
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

/** A screen changed what the badges count (ricontaPromemoria): the provider counts again. */
const EVENTO_PROMEMORIA = 'alpha:promemoria'

/**
 * The badges count again now: a screen saved what they count without a
 * server render of the layout ("Oggi" saving the comment of the day).
 */
export function ricontaPromemoria() {
  window.dispatchEvent(new Event(EVENTO_PROMEMORIA))
}

/**
 * Who counts what: the outcomes are the admin's and the closer's, the days to
 * decide the admin's and the setter's, the days without the comment the
 * setter's only.
 */
function cosaConta(ruolo: AppRole) {
  return {
    esiti: ruolo === 'admin' || ruolo === 'closer',
    daApprovare: ruolo === 'admin' || ruolo === 'setter',
    commenti: ruolo === 'setter',
    daCollegare: ruolo === 'admin' || ruolo === 'editor' || ruolo === 'marketing',
  }
}

export function EsitiDaRegistrareProvider({ iniziale, versione, profiloId, ruolo, children }: Props) {
  const pathname = usePathname()
  const conta = cosaConta(ruolo)
  const contaQualcosa = conta.esiti || conta.daApprovare || conta.commenti || conta.daCollegare
  const [stato, setStato] = useState({ versione, promemoria: iniziale })
  // a new server render: its counts win over whatever the browser read before
  if (stato.versione !== versione) setStato({ versione, promemoria: iniziale })
  // the page the server counted on: the first render needs no count from the browser
  const contataSu = useRef<string | null>(pathname)

  useEffect(() => {
    if (!contaQualcosa) return
    const {
      esiti: contaEsiti,
      daApprovare: contaDaApprovare,
      commenti: contaCommenti,
      daCollegare: contaDaCollegare,
    } = cosaConta(ruolo)
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

    async function contaICommenti(): Promise<number | null> {
      if (!contaCommenti) return 0
      return contaCommentiMancanti(supabase, profiloId, oggiRoma())
    }

    async function contaDaLegare(): Promise<number | null> {
      if (!contaDaCollegare) return 0
      // as the Marketing layout counts them (v_instagram_post, under RLS)
      const { count, error } = await supabase
        .from('v_instagram_post')
        .select('shortcode', { count: 'exact', head: true })
        .in('stato_collegamento', STATI_DA_COLLEGARE)
      return error ? null : count
    }

    async function aggiorna() {
      avviataAlle = Date.now()
      const questa = ++ultima
      const [esiti, daApprovare, commenti, daCollegare] = await Promise.all([
        contaGliEsiti(),
        contaDaDecidere(),
        contaICommenti(),
        contaDaLegare(),
      ])
      // only the latest answer of this page counts; a failed one keeps the last number
      if (!attivo || questa !== ultima) return
      setStato((attuale) => {
        const promemoria = {
          esiti: esiti ?? attuale.promemoria.esiti,
          daApprovare: daApprovare ?? attuale.promemoria.daApprovare,
          commenti: commenti ?? attuale.promemoria.commenti,
          daCollegare: daCollegare ?? attuale.promemoria.daCollegare,
        }
        return promemoria.esiti === attuale.promemoria.esiti &&
          promemoria.daApprovare === attuale.promemoria.daApprovare &&
          promemoria.commenti === attuale.promemoria.commenti &&
          promemoria.daCollegare === attuale.promemoria.daCollegare
          ? attuale
          : { ...attuale, promemoria }
      })
    }

    // asked by a screen: at once, whatever the last count
    function suRichiesta() {
      void aggiorna()
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
    window.addEventListener(EVENTO_PROMEMORIA, suRichiesta)
    return () => {
      attivo = false
      document.removeEventListener('visibilitychange', inPrimoPiano)
      window.removeEventListener('focus', inPrimoPiano)
      window.removeEventListener(EVENTO_PROMEMORIA, suRichiesta)
    }
    // never on `versione`: a new server render brings its own counts
  }, [contaQualcosa, ruolo, profiloId, pathname])

  const { promemoria } = stato
  return (
    <Contesto.Provider
      value={{
        esiti: conta.esiti ? promemoria.esiti : 0,
        daApprovare: conta.daApprovare ? promemoria.daApprovare : 0,
        commenti: conta.commenti ? promemoria.commenti : 0,
        daCollegare: conta.daCollegare ? promemoria.daCollegare : 0,
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
