'use client'

import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

/*
 * The three.js embers behind the login (1.72.0). Three is loaded here only, after
 * the first paint and when the browser is idle: the login form never waits for it.
 * Nothing at all with «Riduci movimento» or without WebGL: the page keeps its still
 * glow (the gradient below) and the fire of the logo.
 */

function webglDisponibile(): boolean {
  try {
    const c = document.createElement('canvas')
    return Boolean(c.getContext('webgl2') ?? c.getContext('webgl'))
  } catch {
    return false
  }
}

export function SfondoBraci() {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [pronta, setPronta] = useState(false)

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || !webglDisponibile()) return
    let ferma: (() => void) | undefined
    let annullato = false
    const avvia = () => {
      import('@/components/brand/scena-braci')
        .then(({ avviaScena }) => {
          if (annullato) return
          ferma = avviaScena(el, {
            chiaro: document.documentElement.classList.contains('light'),
            onPronta: () => setPronta(true),
          })
        })
        .catch(() => {
          // no embers: the still glow stays, the login works the same
        })
    }
    const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }
    const attesa = w.requestIdleCallback ? w.requestIdleCallback(avvia, { timeout: 1200 }) : window.setTimeout(avvia, 300)
    return () => {
      annullato = true
      if (!w.requestIdleCallback) window.clearTimeout(attesa)
      ferma?.()
    }
  }, [])

  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-[-1] overflow-hidden">
      {/* the still glow: also the whole background when the embers do not start */}
      <div className="absolute inset-0 chiaro:opacity-40 bg-[radial-gradient(70rem_36rem_at_50%_115%,color-mix(in_srgb,var(--brand-fire-deep)_45%,transparent),transparent_70%),radial-gradient(40rem_30rem_at_50%_35%,color-mix(in_srgb,var(--alpha-bordeaux)_22%,transparent),transparent_70%)]" />
      <canvas
        ref={canvas}
        className={cn('absolute inset-0 size-full transition-opacity duration-1000', pronta ? 'opacity-100' : 'opacity-0')}
      />
    </div>
  )
}
