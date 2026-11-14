'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Info, Sparkles } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { INFO_ATTREZZI, INFO_ESERCIZI, type Attrezzo, type Esercizio } from '@/lib/percorso/info-esercizi'
import { cn } from '@/lib/utils'

/**
 * The «i» next to an exercise or a piece of equipment of the questionnaire (Dany, 14/11/2026: «se uno non conosce
 * l'esercizio, metti una sorta di animazione… come se fosse un'AI vicino»): a small bubble with a drawing that moves
 * and two lines that say what it is. The drawing is our own SVG (SMIL, no library, no image from outside); with
 * «Riduci movimento» it stays still on its first pose.
 */

function useMovimento(): boolean {
  const [muove, setMuove] = useState(false)
  useEffect(() => {
    const m = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!m) return
    const aggiorna = () => setMuove(!m.matches)
    aggiorna()
    m.addEventListener?.('change', aggiorna)
    return () => m.removeEventListener?.('change', aggiorna)
  }, [])
  return muove
}

const TRATTO = { stroke: 'currentColor', strokeWidth: 5, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const
const ATTREZZO = { stroke: 'var(--muted-foreground)', strokeWidth: 4, strokeLinecap: 'round', fill: 'none' } as const
const DURATA = '2.2s'
const SPLINE = '0.45 0 0.55 1;0.45 0 0.55 1'

/** A path that moves between two shapes and back (only when there is movement). */
function Tratto({ da, a, muove, stile = TRATTO }: { da: string; a: string; muove: boolean; stile?: typeof TRATTO | typeof ATTREZZO }) {
  return (
    <path d={da} {...stile}>
      {muove ? (
        <animate attributeName="d" values={`${da};${a};${da}`} dur={DURATA} repeatCount="indefinite" calcMode="spline" keySplines={SPLINE} />
      ) : null}
    </path>
  )
}

function Testa({ cx, cy, a, muove }: { cx: number; cy: number; a: [number, number]; muove: boolean }) {
  return (
    <circle cx={cx} cy={cy} r={8} fill="currentColor">
      {muove ? (
        <>
          <animate attributeName="cx" values={`${cx};${a[0]};${cx}`} dur={DURATA} repeatCount="indefinite" calcMode="spline" keySplines={SPLINE} />
          <animate attributeName="cy" values={`${cy};${a[1]};${cy}`} dur={DURATA} repeatCount="indefinite" calcMode="spline" keySplines={SPLINE} />
        </>
      ) : null}
    </circle>
  )
}

/** Moves a group up or down by dy and back. */
function Su({ dy, muove, children }: { dy: number; muove: boolean; children: ReactNode }) {
  return (
    <g>
      {muove ? (
        <animateTransform
          attributeName="transform"
          type="translate"
          values={`0 0;0 ${dy};0 0`}
          dur={DURATA}
          repeatCount="indefinite"
          calcMode="spline"
          keySplines={SPLINE}
        />
      ) : null}
      {children}
    </g>
  )
}

function DisegnoEsercizio({ esercizio, muove }: { esercizio: Esercizio; muove: boolean }) {
  if (esercizio === 'piegamenti') {
    // side view: the hands and the feet stay, the straight body goes down and up
    return (
      <svg viewBox="0 0 200 100" className="h-full w-full">
        <line x1="20" y1="92" x2="190" y2="92" {...ATTREZZO} strokeWidth={2} />
        <Tratto da="M172 86 L66 50" a="M172 86 L66 76" muove={muove} />
        <Tratto da="M66 50 L68 68 L64 86" a="M66 76 L88 74 L64 86" muove={muove} />
        <Testa cx={52} cy={44} a={[52, 72]} muove={muove} />
      </svg>
    )
  }
  if (esercizio === 'trazioni') {
    // front view: hanging with straight arms, then the chin over the bar
    return (
      <svg viewBox="0 0 200 120" className="h-full w-full">
        <line x1="40" y1="12" x2="160" y2="12" {...ATTREZZO} />
        <Tratto da="M72 14 L78 28 L86 42" a="M72 14 L60 28 L86 20" muove={muove} />
        <Tratto da="M128 14 L122 28 L114 42" a="M128 14 L140 28 L114 20" muove={muove} />
        <Su dy={-22} muove={muove}>
          <path d="M86 42 L114 42 M100 42 L100 82 M100 82 L92 112 M100 82 L108 112" {...TRATTO} />
          <circle cx={100} cy={30} r={8} fill="currentColor" />
        </Su>
      </svg>
    )
  }
  // dip, side view: the hands on the bars, the body goes down with the elbows back
  return (
    <svg viewBox="0 0 200 120" className="h-full w-full">
      <path d="M70 62 L130 62 M80 62 L80 116 M120 62 L120 116" {...ATTREZZO} />
      <Tratto da="M100 30 L100 46 L100 60" a="M98 50 L80 54 L100 60" muove={muove} />
      <Su dy={20} muove={muove}>
        <path d="M100 30 L102 68 M102 68 L96 88 L110 98" {...TRATTO} />
        <circle cx={100} cy={19} r={8} fill="currentColor" />
      </Su>
    </svg>
  )
}

function DisegnoAttrezzo({ attrezzo, muove }: { attrezzo: Attrezzo; muove: boolean }) {
  switch (attrezzo) {
    case 'sbarra':
      return (
        <svg viewBox="0 0 200 120" className="h-full w-full">
          <path d="M50 116 L50 10 L150 10 L150 116" {...ATTREZZO} />
          <line x1="44" y1="34" x2="156" y2="34" {...TRATTO} />
          <circle cx="50" cy="34" r="5" fill="currentColor" />
          <circle cx="150" cy="34" r="5" fill="currentColor" />
        </svg>
      )
    case 'elastici':
      return (
        <svg viewBox="0 0 200 120" className="h-full w-full">
          <ellipse cx="100" cy="60" rx="60" ry="16" {...TRATTO}>
            {muove ? (
              <animate attributeName="rx" values="60;80;60" dur={DURATA} repeatCount="indefinite" calcMode="spline" keySplines={SPLINE} />
            ) : null}
          </ellipse>
          <ellipse cx="100" cy="60" rx="44" ry="8" {...ATTREZZO} strokeWidth={2}>
            {muove ? (
              <animate attributeName="rx" values="44;64;44" dur={DURATA} repeatCount="indefinite" calcMode="spline" keySplines={SPLINE} />
            ) : null}
          </ellipse>
        </svg>
      )
    case 'manubri':
      return (
        <svg viewBox="0 0 200 120" className="h-full w-full">
          <Su dy={-10} muove={muove}>
            <line x1="70" y1="60" x2="130" y2="60" {...TRATTO} />
            <rect x="52" y="38" width="16" height="44" rx="4" fill="currentColor" />
            <rect x="132" y="38" width="16" height="44" rx="4" fill="currentColor" />
            <rect x="40" y="46" width="10" height="28" rx="3" fill="currentColor" />
            <rect x="150" y="46" width="10" height="28" rx="3" fill="currentColor" />
          </Su>
        </svg>
      )
    case 'anelli':
      return (
        <svg viewBox="0 0 200 120" className="h-full w-full">
          <line x1="30" y1="8" x2="170" y2="8" {...ATTREZZO} />
          <g>
            {muove ? (
              <animateTransform attributeName="transform" type="rotate" values="-4 100 8;4 100 8;-4 100 8" dur="3s" repeatCount="indefinite" />
            ) : null}
            <path d="M75 8 L75 70 M125 8 L125 70" {...ATTREZZO} strokeWidth={3} />
            <circle cx="75" cy="86" r="16" {...TRATTO} />
            <circle cx="125" cy="86" r="16" {...TRATTO} />
          </g>
        </svg>
      )
    case 'parallele':
      return (
        <svg viewBox="0 0 200 120" className="h-full w-full">
          <path d="M30 58 L100 58 M42 58 L36 100 M88 58 L94 100 M30 100 L100 100" {...TRATTO} />
          <path d="M108 74 L178 74 M120 74 L114 110 M166 74 L172 110 M108 110 L178 110" {...ATTREZZO} />
        </svg>
      )
  }
}

/** The bubble: the drawing, the name, what it is. */
function Bolla({ titolo, testo, disegno }: { titolo: string; testo: string; disegno: ReactNode }) {
  return (
    <div className="space-y-2.5">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Sparkles className="size-3.5 text-[var(--brand-fire-flame)]" aria-hidden="true" />
        Cos’è
      </p>
      <div className="h-32 rounded-lg bg-background/60 p-2 text-foreground" aria-hidden="true">
        {disegno}
      </div>
      <p className="font-semibold text-foreground">{titolo}</p>
      <p className="text-sm leading-relaxed text-muted-foreground">{testo}</p>
    </div>
  )
}

function BottoneInfo({ nome, className }: { nome: string; className?: string }) {
  return (
    <PopoverTrigger
      render={
        <button
          type="button"
          aria-label={`Cos’è: ${nome}`}
          className={cn(
            'inline-flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors motion-reduce:transition-none',
            'hover:bg-accent/60 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
            className,
          )}
        />
      }
    >
      <Info className="size-5" aria-hidden="true" />
    </PopoverTrigger>
  )
}

export function InfoEsercizio({ esercizio, className }: { esercizio: Esercizio; className?: string }) {
  const muove = useMovimento()
  const info = INFO_ESERCIZI[esercizio]
  return (
    <Popover>
      <BottoneInfo nome={info.nome} className={className} />
      <PopoverContent side="top" className="w-80" data-testid={`info-${esercizio}`}>
        <Bolla titolo={info.nome} testo={info.testo} disegno={<DisegnoEsercizio esercizio={esercizio} muove={muove} />} />
      </PopoverContent>
    </Popover>
  )
}

export function InfoAttrezzo({ attrezzo, className }: { attrezzo: Attrezzo; className?: string }) {
  const muove = useMovimento()
  const info = INFO_ATTREZZI[attrezzo]
  return (
    <Popover>
      <BottoneInfo nome={info.nome} className={className} />
      <PopoverContent side="top" className="w-80" data-testid={`info-${attrezzo}`}>
        <Bolla titolo={info.nome} testo={info.testo} disegno={<DisegnoAttrezzo attrezzo={attrezzo} muove={muove} />} />
      </PopoverContent>
    </Popover>
  )
}
