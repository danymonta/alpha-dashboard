'use client'

import { useEffect, useState } from 'react'

import { LogoFuoco } from '@/components/brand/logo-fuoco'
import { cn } from '@/lib/utils'

/*
 * Intro after login (CLAUDE.md section 11, "Momento di brand"): about 1.5 s,
 * once per browser session, skippable with a tap, a click or Esc, then removed
 * from the DOM. Never under reduced motion, never under automation (Playwright
 * sets navigator.webdriver): an overlay there would swallow the tests' clicks.
 *
 * aria-hidden and nothing focusable: screen readers and keyboard focus go on
 * to the page underneath as if the overlay were not there.
 */

const CHIAVE_SESSIONE = 'alpha:intro-vista'
const DURATA_ENTRATA_MS = 1100
const DURATA_USCITA_MS = 400
const DURATA_SALTO_MS = 180
const RITARDO_ESPLOSIONE_MS = 320

type Fase = 'attesa' | 'entrata' | 'uscita' | 'saltata' | 'finita'

function deveMostrare(): boolean {
  if (navigator.webdriver) return false
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
  try {
    return window.sessionStorage.getItem(CHIAVE_SESSIONE) === null
  } catch {
    // Storage blocked: better no intro than an intro on every page load.
    return false
  }
}

function segnaVista() {
  try {
    window.sessionStorage.setItem(CHIAVE_SESSIONE, '1')
  } catch {
    // Nothing to do: deveMostrare() already treats blocked storage as "seen".
  }
}

export function IntroIngresso() {
  const [fase, setFase] = useState<Fase>('attesa')

  // Decide on the client only: the server cannot see sessionStorage, and
  // rendering the overlay in the HTML would flash it at every page load.
  useEffect(() => {
    if (!deveMostrare()) return
    const raf = requestAnimationFrame(() => {
      // Marked here, not before: StrictMode's double effect would otherwise
      // mark the intro as seen before it has ever been shown.
      segnaVista()
      setFase('entrata')
    })
    return () => cancelAnimationFrame(raf)
  }, [])

  useEffect(() => {
    if (fase === 'attesa' || fase === 'finita') return

    const durata =
      fase === 'entrata' ? DURATA_ENTRATA_MS : fase === 'uscita' ? DURATA_USCITA_MS : DURATA_SALTO_MS
    const timer = setTimeout(() => setFase(fase === 'entrata' ? 'uscita' : 'finita'), durata)

    const alTasto = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFase((f) => (f === 'entrata' ? 'saltata' : f))
    }
    window.addEventListener('keydown', alTasto)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('keydown', alTasto)
    }
  }, [fase])

  if (fase === 'attesa' || fase === 'finita') return null

  return (
    <div
      aria-hidden="true"
      data-testid="intro-ingresso"
      onClick={() => setFase((f) => (f === 'entrata' ? 'saltata' : f))}
      className={cn(
        'fixed inset-0 z-[100] flex cursor-pointer items-center justify-center overflow-hidden bg-background',
        fase === 'entrata' && 'animate-[brand-fade-in_160ms_ease-out_both]',
        fase === 'uscita' &&
          'pointer-events-none animate-[brand-fade-out_400ms_cubic-bezier(0.4,0,1,1)_forwards]',
        fase === 'saltata' && 'pointer-events-none animate-[brand-fade-out_180ms_ease-out_forwards]',
      )}
    >
      <LogoFuoco
        dimensione="hero"
        decorativo
        accensione
        ritardoEsplosione={RITARDO_ESPLOSIONE_MS}
      />
    </div>
  )
}
