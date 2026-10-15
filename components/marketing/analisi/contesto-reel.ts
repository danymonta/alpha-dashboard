'use client'

import { createContext, useContext } from 'react'

import type { RigaReel } from '@/lib/marketing/analisi/elenco'

/** What the reel panel offers to the rows of the list. A stable context: opening the panel never redraws the rows. */
export type AzioniPannelloReel = {
  /** Opens a reel: ?reel=<id> in the address (pushState), at once with the row's numbers. */
  apri: (id: string, opzioni?: { da?: HTMLElement | null; riga?: RigaReel }) => void
  /** Starts reading the detail when the person shows the intent to open. */
  precarica: (id: string) => void
  /** The focus landing on this element is the panel giving it back: not an intent. */
  fuocoDiRitorno: (elemento: HTMLElement) => boolean
}

export const ContestoPannelloReel = createContext<AzioniPannelloReel | null>(null)

export function usePannelloReel(): AzioniPannelloReel | null {
  return useContext(ContestoPannelloReel)
}
