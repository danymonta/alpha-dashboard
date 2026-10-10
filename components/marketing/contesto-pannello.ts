'use client'

import { createContext, useContext } from 'react'
import type { ExternalToast } from 'sonner'

import { TOASTER_PANNELLO } from '@/components/marketing/toaster-pannello'
import type { ContenutoElenco } from '@/lib/marketing/elenco'
import type { SezioneContenuto } from '@/lib/marketing/etichette'

/**
 * What the content panel (PannelloContenuti) offers to the rows, the cells
 * and its own fields. A context of its own, stable: opening the panel never
 * redraws the 300 rows of the table (the open id is another context).
 */
export type AzioniPannello = {
  /** Opens a content in the panel: ?contenuto=<id> in the address (pushState), at once with the row's properties. */
  apri: (id: string, opzioni?: { da?: HTMLElement | null; riga?: ContenutoElenco }) => void
  /** Starts reading the sections when the person shows the intent to open (spec R8). */
  precarica: (id: string) => void
  /**
   * The focus landing on this element is the panel giving it back as it
   * closes (once): never an intent to open, so no preload.
   */
  fuocoDiRitorno: (elemento: HTMLElement) => boolean
  /** Closes the panel (Back when the panel pushed the address). */
  chiudi: () => void
  /**
   * A field inside the panel used Esc to cancel itself: the panel must stay
   * open. React and Base UI both listen on the document, so stopPropagation
   * would not stop it (spec R1): the panel recognises this very event.
   */
  escGestito: (evento: Event) => void
  /** A field saved (or found changed): the panel's copy follows, and the list is redrawn on close. */
  aggiornaCampo: (id: string, campo: keyof ContenutoElenco, valore: unknown, versione: string) => void
  /** A section saved (or found changed): the panel's copy follows. */
  aggiornaSezione: (id: string, campo: SezioneContenuto, testo: string | null, impronta: string, versione: string) => void
  /** The content is gone (deleted elsewhere). */
  segnaSparito: (id: string) => void
  /** A section in the panel holds text not saved yet: closing asks first. */
  segnaBozza: (titolo: string, sporca: boolean) => void
  /**
   * A save starts (until its transition commits): returns the function that
   * ends it. The panel's own close waits for the saves in flight before it
   * goes Back: a save committed after Back would push its address again
   * (Next's history keeps a pending push from the action).
   */
  inizioSalvataggio: () => () => void
}

export const ContestoAzioniPannello = createContext<AzioniPannello | null>(null)
export const ContestoContenutoAperto = createContext<string | null>(null)

/** Inside a page with the panel: its actions; elsewhere (a content's own page) null. */
export function usePannello(): AzioniPannello | null {
  return useContext(ContestoAzioniPannello)
}

/** The id of the content open in the panel, null when closed. */
export function useContenutoAperto(): string | null {
  return useContext(ContestoContenutoAperto)
}

const ContestoNelPannello = createContext(false)

/** Around what the panel shows: its toasts go to the bottom (useOpzioniToast). */
export const NelPannello = ContestoNelPannello.Provider

/**
 * A toast that goes with the panel: in the panel's own toaster
 * (TOASTER_PANNELLO, app/layout.tsx), at the bottom right. The app's toasts
 * sit at the top, where in the panel they would cover its sticky header for 4
 * seconds (the X, the pencil «Rinomina», «Altre azioni», the Status) and
 * swallow the tap on the X; sonner's own bottom would, on a phone, cover the
 * whole bottom bar once the panel is closed. The panel's toaster sits on the
 * panel's side on a computer and above the bottom bar on a phone. Also for
 * the toast of a tap that opens the panel («Contenuto creato»).
 */
export const TOAST_NEL_PANNELLO: ExternalToast = { toasterId: TOASTER_PANNELLO }
const TOAST_ALTROVE: ExternalToast = {}

/** The options of a toast shown from here: the panel's toaster inside the panel, the app's elsewhere. */
export function useOpzioniToast(): ExternalToast {
  return useContext(ContestoNelPannello) ? TOAST_NEL_PANNELLO : TOAST_ALTROVE
}
