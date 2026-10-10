'use client'

import { useCallback, useEffect, useOptimistic, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

const CONNESSIONE = 'Connessione assente. Riprova.'
const TITOLO = '\u0000titolo'

type Esito = { ok: true } | { ok: false; errore: string }

/**
 * A list of posts whose cards leave it with a tap (A0.3 of the 1.33.0 spec):
 * the card goes at once, the focus moves to the card after it (or the one
 * before, or the section's title), an announcement says what happened. On a
 * failure the card comes back where it was, with the focus on it, and a
 * toast. The server's next render (every action revalidates) is the truth.
 */
export function useElencoPost<T extends { shortcode: string }>(elenco: readonly T[]) {
  const [visibili, togli] = useOptimistic(elenco, (stato: readonly T[], shortcode: string) =>
    stato.filter((p) => p.shortcode !== shortcode),
  )
  const [inCorso, avvia] = useTransition()
  const [annuncio, setAnnuncio] = useState('')
  const titolo = useRef<HTMLHeadingElement>(null)
  const schede = useRef(new Map<string, HTMLElement>())
  const focusDopo = useRef<string | null>(null)

  useEffect(() => {
    const dove = focusDopo.current
    if (!dove) return
    focusDopo.current = null
    const elemento = dove === TITOLO ? null : schede.current.get(dove)
    ;(elemento ?? titolo.current)?.focus()
  }, [visibili])

  /** The ref of a card's title: where the focus lands (tabIndex -1). */
  const registra = useCallback(
    (shortcode: string) => (el: HTMLElement | null) => {
      if (el) schede.current.set(shortcode, el)
      else schede.current.delete(shortcode)
    },
    [],
  )

  /**
   * The card leaves, the action runs; `riuscito` says it (toast, announcement)
   * and may return where the focus goes instead (the panel opening).
   */
  function esegui<E extends Esito>(
    post: T,
    azione: () => Promise<E>,
    parole: { fatto: (esito: Extract<E, { ok: true }>) => string; nonFatto: string },
    riuscito?: (esito: Extract<E, { ok: true }>) => void,
  ) {
    const indice = visibili.findIndex((p) => p.shortcode === post.shortcode)
    const vicino = visibili[indice + 1] ?? visibili[indice - 1]
    avvia(async () => {
      togli(post.shortcode)
      focusDopo.current = vicino ? vicino.shortcode : TITOLO
      let esito: E | { ok: false; errore: string }
      try {
        esito = await azione()
      } catch {
        esito = { ok: false, errore: CONNESSIONE }
      }
      if (!esito.ok) {
        // the card comes back where it was, and the focus with it
        focusDopo.current = post.shortcode
        setAnnuncio(parole.nonFatto)
        toast.error(esito.errore)
        return
      }
      const fatto = esito as Extract<E, { ok: true }>
      setAnnuncio(parole.fatto(fatto))
      riuscito?.(fatto)
    })
  }

  return { visibili, inCorso, annuncio, titolo, registra, esegui }
}
