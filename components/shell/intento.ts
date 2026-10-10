'use client'

import { useCallback, useEffect, useRef, type FocusEvent, type PointerEvent } from 'react'

/** How long the mouse (or keyboard focus) rests on a link before it counts as intent. */
export const RITARDO_INTENTO_MS = 80

export type GestoriIntento = {
  onPointerEnter: (e: PointerEvent<HTMLElement>) => void
  onPointerDown: (e: PointerEvent<HTMLElement>) => void
  onPointerLeave: (e: PointerEvent<HTMLElement>) => void
  onFocus: (e: FocusEvent<HTMLElement>) => void
  onBlur: () => void
  onTouchStart: () => void
}

/**
 * Whether the person is about to open a link (1.33.0, Dany: "il quanto più smooth
 * possibile"): the mouse resting on it for 80 ms (a pass over the sidebar costs
 * nothing), keyboard focus for 80 ms, the mouse button going down (the click
 * comes at its release), a finger touching it. `quando` runs then: the links
 * prefetch only at that moment (LinkNav, LinkRiga).
 *
 * The links ask Next with router.prefetch instead of switching their `prefetch`
 * prop: a new prop remounts the Link's instance (next/dist/client/app-dir/link.js),
 * which would detach a navigation in progress from its status (spec R7), and
 * waits for the IntersectionObserver before asking (measured: about 70 ms later).
 * Asking twice costs nothing: the page is in the browser cache for 30 s.
 */
export function useIntento(quando: () => void): GestoriIntento {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // the latest callback, for a timer set during an earlier render
  const ultimo = useRef(quando)
  useEffect(() => {
    ultimo.current = quando
  })

  const annulla = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }, [])

  useEffect(() => annulla, [annulla])

  function adesso() {
    annulla()
    ultimo.current()
  }

  function tra(ms: number) {
    annulla()
    timer.current = setTimeout(adesso, ms)
  }

  return {
    onPointerEnter(e) {
      // a finger has its own path (touchstart), with no delay
      if (e.pointerType !== 'touch') tra(RITARDO_INTENTO_MS)
    },
    onPointerDown(e) {
      // the press: the click lands at the release, often 100 ms later
      if (e.pointerType !== 'touch') adesso()
    },
    onPointerLeave() {
      annulla()
    },
    onFocus(e) {
      // keyboard only: a mouse click focuses the link too, and the pointer already counts
      if (e.currentTarget.matches(':focus-visible')) tra(RITARDO_INTENTO_MS)
    },
    onBlur() {
      annulla()
    },
    onTouchStart() {
      adesso()
    },
  }
}

/** Calls the link's own handler, then ours. */
export function unisci<E>(suo: ((e: E) => void) | undefined, nostro: (e: E) => void) {
  return (e: E) => {
    suo?.(e)
    nostro(e)
  }
}
