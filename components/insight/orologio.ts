'use client'

import { useSyncExternalStore } from 'react'

/**
 * The browser's clock for the Insight page (D11): «aspetta da N ore» and
 * «Aggiornamento avviato N min fa» follow it. 0 on the server and during
 * hydration, so the first render agrees with the server's HTML (the caller
 * falls back to the server's `adesso`); right after, and then at every tick
 * and whenever the page comes back to the screen, the time of now. One timer
 * per period for the whole page, however many components read it.
 */
function creaOrologio(periodoMs: number) {
  let adesso = 0
  const ascoltatori = new Set<() => void>()
  let intervallo: ReturnType<typeof setInterval> | null = null

  function avvisa() {
    adesso = Date.now()
    for (const ascolta of ascoltatori) ascolta()
  }

  function alRitorno() {
    if (document.visibilityState === 'visible') avvisa()
  }

  function iscriviti(ascolta: () => void) {
    ascoltatori.add(ascolta)
    if (!intervallo) {
      intervallo = setInterval(avvisa, periodoMs)
      document.addEventListener('visibilitychange', alRitorno)
      queueMicrotask(avvisa)
    }
    return () => {
      ascoltatori.delete(ascolta)
      if (ascoltatori.size === 0 && intervallo) {
        clearInterval(intervallo)
        intervallo = null
        document.removeEventListener('visibilitychange', alRitorno)
      }
    }
  }

  return function useOrologio(ripiegoMs: number): number {
    const istante = useSyncExternalStore(
      iscriviti,
      () => adesso,
      () => 0,
    )
    return istante || ripiegoMs
  }
}

/** Every minute: the waits of the lead cards (the artifact recomputed them at every render). */
export const useAdessoMinuto = creaOrologio(60_000)

/** Every 30 seconds: «Aggiornamento avviato N min fa» while a run works, as the artifact ticked it. */
export const useAdessoMezzoMinuto = creaOrologio(30_000)
