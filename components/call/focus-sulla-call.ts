'use client'

import { useCallback, useEffect, useRef } from 'react'

/**
 * A sheet opened from a call card that, once it succeeds, makes its own button
 * go: «La vendita c’è già: collegala» (the call no longer asks for its sale,
 * and the card moves out of «Vendita da registrare») and «Fissa la call di
 * follow-up» (the row becomes «Call di follow-up: …»). The sheet gives the
 * focus back to a button that is no longer there, and it falls on <body>:
 * keyboard and screen reader users would start again from the top of the page.
 *
 * After a success the focus goes to the card's title (an h3 with tabIndex -1,
 * found by id: the card may be a new element after the server render), when
 * the button goes, whichever comes first, the answer or the new render. Only
 * when the focus was lost: one already moved elsewhere stays where it is.
 */
export function useFocusSullaCall(idTitolo: string): () => void {
  const montato = useRef(true)
  const riuscito = useRef(false)

  useEffect(() => {
    montato.current = true
    return () => {
      montato.current = false
      // the button went (the card does not ask any more): after the commit, on the title
      if (riuscito.current) focusSeSmarrito(idTitolo)
    }
  }, [idTitolo])

  return useCallback(() => {
    riuscito.current = true
    // the new render came first: the button is already gone
    if (!montato.current) focusSeSmarrito(idTitolo)
  }, [idTitolo])
}

function focusSeSmarrito(id: string) {
  requestAnimationFrame(() => {
    const attivo = document.activeElement
    if (attivo && attivo !== document.body) return
    document.getElementById(id)?.focus()
  })
}
