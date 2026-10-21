'use client'

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

import {
  CONTEGGI_VUOTI,
  OPZIONI_VUOTE,
  type CampoOpzione,
  type ConteggiOpzioni,
  type Opzione,
  type Opzioni,
} from '@/lib/marketing/opzioni'

type Valore = {
  /** The labels of Reel Type and Format, in the order of the menu. */
  opzioni: Opzioni
  /** How many contents use each label (only the ones used). */
  conteggi: ConteggiOpzioni
  /** The admin and marketing delete a label; the video editor creates, renames and recolours. */
  puoEliminare: boolean
  /** A label just created, renamed, recoloured or deleted: shown at once, before the page's redraw brings the same. */
  aggiungi: (opzione: Opzione) => void
  sostituisci: (opzione: Opzione) => void
  togli: (opzione: Opzione) => void
}

const VUOTO: Valore = {
  opzioni: OPZIONI_VUOTE,
  conteggi: CONTEGGI_VUOTI,
  puoEliminare: false,
  aggiungi: () => {},
  sostituisci: () => {},
  togli: () => {},
}

const Contesto = createContext<Valore>(VUOTO)

function ordina(elenco: Opzione[]): Opzione[] {
  return [...elenco].sort((a, b) => a.ordine - b.ordine || a.nome.localeCompare(b.nome))
}

/**
 * The labels of Reel Type and Format for the cells, the cards, the filters
 * and the panel (21/10/2026). The page reads them (they are a few dozen rows
 * at most) and hands them here; every change a person makes is shown at once
 * from here, and the redraw each action brings back replaces it with the
 * database's own list (adjusted while rendering, as the Status does).
 */
export function OpzioniProvider({
  opzioni,
  conteggi,
  puoEliminare,
  children,
}: {
  opzioni: Opzioni
  conteggi: ConteggiOpzioni
  puoEliminare: boolean
  children: ReactNode
}) {
  const [daServer, setDaServer] = useState(opzioni)
  const [locali, setLocali] = useState(opzioni)
  if (daServer !== opzioni) {
    setDaServer(opzioni)
    setLocali(opzioni)
  }

  const cambia = useCallback((campo: CampoOpzione, f: (elenco: Opzione[]) => Opzione[]) => {
    setLocali((prima) => ({ ...prima, [campo]: ordina(f(prima[campo])) }))
  }, [])
  const aggiungi = useCallback(
    (o: Opzione) => cambia(o.campo, (e) => (e.some((x) => x.id === o.id) ? e : [...e, o])),
    [cambia],
  )
  const sostituisci = useCallback((o: Opzione) => cambia(o.campo, (e) => e.map((x) => (x.id === o.id ? o : x))), [cambia])
  const togli = useCallback((o: Opzione) => cambia(o.campo, (e) => e.filter((x) => x.id !== o.id)), [cambia])

  const valore = useMemo<Valore>(
    () => ({ opzioni: locali, conteggi, puoEliminare, aggiungi, sostituisci, togli }),
    [locali, conteggi, puoEliminare, aggiungi, sostituisci, togli],
  )
  return <Contesto.Provider value={valore}>{children}</Contesto.Provider>
}

/** The labels where the page has no provider (never expected): none, and nobody deletes. */
export function useOpzioni(): Valore {
  return useContext(Contesto)
}
