'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import { SchermataFine, type DatiFine } from '@/app/(app)/onboarding/nuovo/schermata-fine'

/*
 * The stage of the wizard «Nuovo cliente» (1.77.0). It lives in the layout of
 * /onboarding/nuovo, above the page, for one reason: the action that starts an onboarding
 * revalidates the app, and the answer brings this same page drawn again on its address.
 * Opened from a call or from a sale, that page now says «Onboarding già avviato», because
 * it is. The last screen («Onboarding avviato per …») must not depend on what the server
 * draws underneath: once the wizard is done the stage shows it instead of the page, until
 * the admin leaves or starts another client. The address says it too (`?avviato=<client>`,
 * written without a navigation): a reload, or Back and Forward, opens the client's card,
 * never an empty wizard that would start him twice.
 */

type Palco = {
  /** A confirmation is on its way, or just arrived: the page under the stage stays quiet. */
  inCorso: boolean
  inizia: () => void
  /** The confirmation failed: the wizard is still there, with its error. */
  fallita: () => void
  /** The onboarding is started: the last screen takes the stage. */
  mostra: (dati: DatiFine) => void
}

const Contesto = createContext<Palco | null>(null)

export function usePalco(): Palco {
  const palco = useContext(Contesto)
  if (!palco) throw new Error('usePalco fuori dal layout del wizard')
  return palco
}

export function PalcoWizard({ children }: { children: ReactNode }) {
  const [fine, setFine] = useState<DatiFine | null>(null)
  const [inCorso, setInCorso] = useState(false)

  const inizia = useCallback(() => setInCorso(true), [])
  const fallita = useCallback(() => setInCorso(false), [])
  const mostra = useCallback((dati: DatiFine) => {
    setFine(dati)
    setInCorso(false)
    try {
      window.history.replaceState(window.history.state, '', `/onboarding/nuovo?avviato=${dati.idCliente}`)
    } catch {
      // a browser that refuses: the stage still shows the last screen
    }
  }, [])
  const azzera = useCallback(() => setFine(null), [])

  const valore = useMemo(() => ({ inCorso, inizia, fallita, mostra }), [inCorso, inizia, fallita, mostra])

  return (
    <Contesto.Provider value={valore}>
      {fine ? <SchermataFine dati={fine} onAltroCliente={azzera} /> : children}
    </Contesto.Provider>
  )
}

/**
 * What the page says when the client already has his onboarding. While a confirmation of
 * this same wizard is arriving it says nothing: the last screen is about to take the stage.
 */
export function SoloSeFermo({ children }: { children: ReactNode }) {
  const { inCorso } = usePalco()
  return inCorso ? null : <>{children}</>
}
