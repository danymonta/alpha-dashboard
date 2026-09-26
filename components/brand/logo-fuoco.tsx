'use client'

import Image from 'next/image'
import { useEffect, useRef, type CSSProperties } from 'react'

import { avviaBraci, type Margini } from '@/components/brand/braci'
import { cn } from '@/lib/utils'

/*
 * Percorso Alpha logo with its fire. Brand moment only (CLAUDE.md section 11):
 * login, intro after login, shell header. Never next to numbers.
 *
 * The artwork sits on black with the fire glow baked in. `lighten` keeps every
 * pixel brighter than what is underneath and drops the black, so the logo
 * melts into --alpha-bg (or the sidebar surface) with no rectangle; a thin
 * edge mask hides the faint haze that touches the borders of the file.
 * The fire layers are ring-shaped (hole in the middle) so they glow around the
 * silhouette without lighting it from behind.
 *
 * Blending needs the backdrop in the same stacking context: never wrap this
 * component in an element with transform, opacity < 1, filter or isolation.
 */

const SRC = '/brand/percorso-alpha.webp'
const LARGHEZZA = 1424
const ALTEZZA = 1592
const RAPPORTO = ALTEZZA / LARGHEZZA

export type DimensioneLogo = 'hero' | 'compatto' | 'mini'

const MISURE: Record<DimensioneLogo, { box: string; sizes: string }> = {
  // Width is fixed by viewport units, height by aspect ratio: no layout shift.
  hero: { box: 'w-[min(76vw,23rem,40svh)]', sizes: '(min-width: 768px) 368px, 76vw' },
  compatto: { box: 'w-14', sizes: '56px' },
  mini: { box: 'w-9', sizes: '36px' },
}

// Alpha-only masks: the colour keyword is irrelevant, only opacity counts.
const MASCHERA_BORDI =
  'linear-gradient(to right, transparent, black 2.5%, black 97.5%, transparent), ' +
  'linear-gradient(to bottom, transparent, black 1.2%, black 97%, transparent)'

const STILE_LOGO: CSSProperties = {
  mixBlendMode: 'lighten',
  maskImage: MASCHERA_BORDI,
  maskComposite: 'intersect',
  WebkitMaskImage: MASCHERA_BORDI,
  WebkitMaskComposite: 'source-in',
}

const STILE_BLOOM: CSSProperties = {
  ...STILE_LOGO,
  mixBlendMode: 'screen',
  filter: 'blur(6px)',
}

/** Transparent core, glowing rim: fire around the silhouette, not through it. */
function anello(interno: number, esterno: number): CSSProperties {
  const m = `radial-gradient(closest-side, transparent ${interno}%, black ${esterno}%)`
  return { maskImage: m, WebkitMaskImage: m }
}

/** A --brand-fire-* token at the given opacity. */
const fuoco = (token: 'core' | 'flame' | 'ember' | 'deep', percentuale: number) =>
  `color-mix(in oklab, var(--brand-fire-${token}) ${percentuale}%, transparent)`

const ALONE_HERO: CSSProperties = {
  inset: '-22% -35% -18% -35%',
  background: `radial-gradient(closest-side, ${fuoco('ember', 62)}, ${fuoco('deep', 40)} 55%, transparent)`,
  ...anello(44, 74),
}

// Every flame is a closest-side ellipse: it fades to transparent inside its
// own box, so no edge shows when the box is cut or scaled by the flicker.
const BASE: CSSProperties = {
  inset: '66% -10% -16% -10%',
  background: `radial-gradient(closest-side, ${fuoco('flame', 58)}, ${fuoco('ember', 36)} 40%, ${fuoco('deep', 14)} 72%, transparent)`,
}

const NUCLEO: CSSProperties = {
  inset: '80% 26% -10% 26%',
  background: `radial-gradient(closest-side, ${fuoco('core', 44)}, ${fuoco('flame', 22)} 50%, transparent)`,
}

const LINGUA_SX: CSSProperties = {
  inset: '50% auto -8% -14%',
  width: '30%',
  background: `radial-gradient(closest-side, ${fuoco('ember', 44)}, ${fuoco('deep', 20)} 50%, transparent)`,
}

const LINGUA_DX: CSSProperties = {
  ...LINGUA_SX,
  inset: '50% -14% -8% auto',
}

/**
 * Shell logos: a thin glow just outside the logo edge. `margine` is how far
 * the glow box overflows the logo, in percent of its size; `bordo` is where
 * the logo edge falls along the glow radius, so the ring starts right there.
 */
function aloneCompatto(margine: number): CSSProperties {
  const bordo = Math.round((50 / (50 + margine)) * 100)
  return {
    inset: `-${margine}%`,
    background: `radial-gradient(closest-side, ${fuoco('ember', 48)} ${bordo - 6}%, ${fuoco('ember', 36)} ${bordo}%, ${fuoco('deep', 16)} ${bordo + 16}%, transparent)`,
    ...anello(bordo - 6, bordo + 14),
  }
}

const ALONE_COMPATTO: Record<Exclude<DimensioneLogo, 'hero'>, CSSProperties> = {
  compatto: aloneCompatto(30),
  // The top bar has 10px of padding: a tighter glow stays inside it.
  mini: aloneCompatto(24),
}

const MARGINI_BRACI: Margini = { sinistra: 0.14, destra: 0.14, sopra: 0.3, sotto: 0.04 }

const percento = (frazione: number) => `-${Math.round(frazione * 100)}%`

const STILE_CANVAS: CSSProperties = {
  inset: [MARGINI_BRACI.sopra, MARGINI_BRACI.destra, MARGINI_BRACI.sotto, MARGINI_BRACI.sinistra]
    .map(percento)
    .join(' '),
}

type Props = {
  dimensione: DimensioneLogo
  /** Hide from assistive tech when the brand name is already in nearby text. */
  decorativo?: boolean
  /** Hero above the fold: load the image from the <head>. */
  preload?: boolean
  /** Intro: the logo lights up (scale, glow) instead of just being there. */
  accensione?: boolean
  /** Intro: burst of embers after this many milliseconds. */
  ritardoEsplosione?: number
  className?: string
}

export function LogoFuoco({
  dimensione,
  decorativo = false,
  preload = false,
  accensione = false,
  ritardoEsplosione,
  className,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const hero = dimensione === 'hero'
  const { box, sizes } = MISURE[dimensione]

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    return avviaBraci(canvas, {
      rapporto: RAPPORTO,
      margini: MARGINI_BRACI,
      ...(ritardoEsplosione === undefined
        ? { massimo: 56, perSecondo: 16 }
        : {
            massimo: 60,
            perSecondo: 10,
            esplosione: { ritardo: ritardoEsplosione, quante: 38 },
          }),
    })
  }, [ritardoEsplosione])

  return (
    <div
      className={cn('relative shrink-0 aspect-[1424/1592]', box, className)}
      aria-hidden={decorativo || undefined}
    >
      <div
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-0',
          accensione &&
            'motion-safe:animate-[brand-flare_900ms_cubic-bezier(0.2,0.7,0.2,1)_both]',
        )}
      >
        {hero ? (
          <>
            <div
              className="absolute opacity-80 motion-safe:animate-[brand-glow-pulse_3.6s_ease-in-out_infinite]"
              style={ALONE_HERO}
            />
            <div
              className="absolute origin-bottom motion-safe:animate-[brand-flicker-b_2.9s_ease-in-out_-1.1s_infinite]"
              style={LINGUA_SX}
            />
            <div
              className="absolute origin-bottom motion-safe:animate-[brand-flicker-a_2.6s_ease-in-out_-1.7s_infinite]"
              style={LINGUA_DX}
            />
            <div
              className="absolute origin-bottom motion-safe:animate-[brand-flicker-a_2.3s_ease-in-out_infinite]"
              style={BASE}
            />
            <div
              className="absolute origin-bottom motion-safe:animate-[brand-flicker-b_1.6s_ease-in-out_-0.4s_infinite]"
              style={NUCLEO}
            />
          </>
        ) : (
          <div
            className="absolute opacity-70 motion-safe:animate-[brand-breathe_6s_ease-in-out_infinite]"
            style={ALONE_COMPATTO[dimensione]}
          />
        )}
      </div>

      <Image
        src={SRC}
        alt={decorativo ? '' : 'Percorso Alpha'}
        fill
        sizes={sizes}
        // Hero is always above the fold; the shell logos stay lazy so the one
        // hidden by the breakpoint (sidebar or top bar) is never downloaded.
        {...(preload ? { preload: true } : hero ? { loading: 'eager' as const } : {})}
        draggable={false}
        className={cn(
          'select-none',
          accensione &&
            'motion-safe:animate-[brand-ignite_900ms_cubic-bezier(0.2,0.7,0.2,1)_60ms_both]',
        )}
        style={STILE_LOGO}
      />

      {hero ? (
        <>
          {/* Bloom: a blurred copy added on top, its opacity is the pulse. */}
          <Image
            src={SRC}
            alt=""
            aria-hidden="true"
            fill
            sizes={sizes}
            // Same URL as the main image: eager, or Next's dev LCP check
            // (keyed by URL) reads this copy as a lazy hero.
            loading="eager"
            draggable={false}
            className={cn(
              'pointer-events-none select-none opacity-30',
              accensione
                ? 'motion-safe:animate-[brand-bloom-flare_1100ms_ease-out_60ms_both]'
                : 'motion-safe:animate-[brand-bloom-pulse_3.6s_ease-in-out_infinite]',
            )}
            style={STILE_BLOOM}
          />
          {/* A canvas is a replaced element: insets do not stretch it, so the
              box is sized by a wrapper and the canvas fills it. */}
          <div aria-hidden="true" className="pointer-events-none absolute" style={STILE_CANVAS}>
            <canvas ref={canvasRef} className="block size-full" />
          </div>
        </>
      ) : null}
    </div>
  )
}
