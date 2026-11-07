'use client'

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'

import { calcolaMappe } from '@/lib/vetro/mappe'
import { cn } from '@/lib/utils'

/*
 * Liquid glass (1.72.0, Dany: «usa un po' di glow e liquid glass, senza appesantire»).
 *
 * Everywhere: the frosted glass of the `.vetro` class (globals.css), pure CSS.
 * On Chromium only (the one engine that applies an SVG filter in
 * backdrop-filter), the edge also bends what is behind it and catches the light:
 * two small maps computed once per size (lib/vetro/mappe.ts), fed to an SVG
 * filter. Safari and Firefox keep the frosted glass, nothing breaks.
 *
 * Kept light on purpose: maps at 1x, recomputed only when the size settles,
 * skipped for very large panels, with «Riduci trasparenza», or when the glass
 * is behind nothing worth bending. Used on a handful of surfaces, never on
 * every card.
 */

type Tag = 'div' | 'section' | 'header' | 'nav' | 'aside'

type Props = {
  as?: Tag
  /** Corner radius in pixels: the same as the rounded class of the element. */
  raggio?: number
  /** How frosted the glass is (SVG blur, px): low = clear glass, high = readable panel. */
  sfocatura?: number
  /** How strongly the edge bends the backdrop, 0 to 1. */
  piega?: number
  className?: string
  style?: CSSProperties
  children?: ReactNode
} & Omit<React.HTMLAttributes<HTMLElement>, 'className' | 'style' | 'children'>

type Filtro = { spostamento: string; riflesso: string; w: number; h: number; scala: number }

/** The largest glass worth a filter (CSS pixels): a full-screen panel would cost memory for little. */
const AREA_MASSIMA = 1_400_000

function supportaVetroLiquido(): boolean {
  if (typeof window === 'undefined') return false
  const nav = navigator as Navigator & { userAgentData?: { brands?: { brand: string }[] } }
  const chromium = nav.userAgentData?.brands?.some((b) => b.brand === 'Chromium') ?? false
  if (!chromium) return false
  return !window.matchMedia('(prefers-reduced-transparency: reduce)').matches
}

function aImmagine(dati: Uint8ClampedArray, w: number, h: number): string {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.putImageData(new ImageData(new Uint8ClampedArray(dati), w, h), 0, 0)
  return canvas.toDataURL('image/png')
}

export function VetroLiquido({
  as: Elemento = 'div',
  raggio = 16,
  sfocatura = 8,
  piega = 0.5,
  className,
  style,
  children,
  ...resto
}: Props) {
  const rif = useRef<HTMLElement | null>(null)
  const id = `vetro-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const [filtro, setFiltro] = useState<Filtro | null>(null)

  useEffect(() => {
    const el = rif.current
    if (!el || !supportaVetroLiquido()) return
    let timer: ReturnType<typeof setTimeout> | undefined
    let ultima = ''
    const calcola = () => {
      const { width, height } = el.getBoundingClientRect()
      const w = Math.round(width)
      const h = Math.round(height)
      const chiave = `${w}x${h}`
      if (chiave === ultima || w < 8 || h < 8) return
      ultima = chiave
      if (w * h > AREA_MASSIMA) {
        setFiltro(null)
        return
      }
      const mappe = calcolaMappe({ larghezza: w, altezza: h, raggio, bordo: Math.min(28, h / 3) })
      setFiltro({
        spostamento: aImmagine(mappe.spostamento, mappe.larghezza, mappe.altezza),
        riflesso: aImmagine(mappe.riflesso, mappe.larghezza, mappe.altezza),
        w: mappe.larghezza,
        h: mappe.altezza,
        scala: mappe.massimo * piega,
      })
    }
    const osservatore = new ResizeObserver(() => {
      clearTimeout(timer)
      timer = setTimeout(calcola, 150)
    })
    osservatore.observe(el)
    calcola()
    return () => {
      clearTimeout(timer)
      osservatore.disconnect()
    }
  }, [raggio, piega])

  const stileVetro: CSSProperties | undefined = filtro
    ? { ...style, backdropFilter: `url(#${id})`, WebkitBackdropFilter: `url(#${id})` }
    : style

  return (
    <Elemento
      ref={(n: HTMLElement | null) => {
        rif.current = n
      }}
      className={cn('vetro', className)}
      style={stileVetro}
      data-vetro-liquido={filtro ? 'attivo' : undefined}
      {...resto}
    >
      {filtro ? (
        <svg aria-hidden="true" width="0" height="0" className="pointer-events-none absolute" colorInterpolationFilters="sRGB">
          <defs>
            <filter id={id} x="0" y="0" width={filtro.w} height={filtro.h} filterUnits="userSpaceOnUse">
              <feGaussianBlur in="SourceGraphic" stdDeviation={sfocatura} result="sfocato" />
              <feImage href={filtro.spostamento} x="0" y="0" width={filtro.w} height={filtro.h} result="mappa" />
              <feDisplacementMap
                in="sfocato"
                in2="mappa"
                scale={filtro.scala}
                xChannelSelector="R"
                yChannelSelector="G"
                result="piegato"
              />
              <feColorMatrix in="piegato" type="saturate" values="1.6" result="saturo" />
              <feImage href={filtro.riflesso} x="0" y="0" width={filtro.w} height={filtro.h} result="orlo" />
              <feComponentTransfer in="orlo" result="orloTenue">
                <feFuncA type="linear" slope="0.55" />
              </feComponentTransfer>
              <feBlend in="orloTenue" in2="saturo" mode="normal" />
            </filter>
          </defs>
        </svg>
      ) : null}
      {children}
    </Elemento>
  )
}
