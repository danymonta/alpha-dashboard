'use client'

import { Lock, LockOpen, Rocket } from 'lucide-react'
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'

import { ritardoNodo, tempiLinea } from '@/lib/percorso/animazioni'
import type { NodoPercorso } from '@/lib/percorso/letture'
import { etichettaNodo, nomeAccessibileNodo } from '@/lib/percorso/nodi'
import { TESTI_PERCORSO as T } from '@/lib/percorso/testi'
import { cn } from '@/lib/utils'

/** How long the line «Si sblocca dopo: …» stays after a tap on a future node. */
const SUGGERIMENTO_MS = 4000

/** The check of a completed stage, drawn by its own path so the motion can draw it (pathLength 1). */
function Spunta() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="none" aria-hidden="true">
      <path
        data-anim="spunta"
        d="M20 6 9 17l-5-5"
        pathLength={1}
        stroke="currentColor"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/**
 * The 7 stages of the path (release B1a, docs/onboarding/rilascio-b.md, «Timeline»; the
 * motion of B2): every stage a button with its state in words in the accessible name and an
 * icon (a check, a ring, a lock; the rocket at the end), never colour alone. The line is
 * full and lit up after the completed stages, filled by the actions done after the current
 * one, dashed after it. The still drawing is complete: the opening (the line drawing from
 * the left, the stages one after the other) is CSS that runs at the first paint, and every
 * other motion (the breathing glow, the pop with its flash of light, the lock opening, the
 * line running on, the floating rocket) is played on the hooks `data-anim` by
 * components/percorso/animazioni/, loaded after the first paint. On the phone the line
 * scrolls sideways inside its own frame, centred on the current stage; the page never
 * scrolls sideways. Arrows move between the stages; a future stage is aria-disabled (never
 * disabled), its tap shakes it lightly and says what it waits for, in a live region.
 */
export function Timeline({
  nodi,
  frazioni,
  selezionato,
  onSeleziona,
}: {
  nodi: readonly NodoPercorso[]
  /** How full the line out of each stage is (0-1, lib/percorso/animazioni.ts). */
  frazioni: readonly number[]
  /** The stage whose panel is open: the current one, or a completed one read again. */
  selezionato: string | null
  onSeleziona: (chiave: string) => void
}) {
  const cornice = useRef<HTMLDivElement | null>(null)
  const bottoni = useRef<(HTMLButtonElement | null)[]>([])
  const [suggerimento, setSuggerimento] = useState<{ chiave: string; testo: string } | null>(null)
  // on the phone the frame scrolls: a fade on the side where stages are hidden says the line goes on
  const [nascosti, setNascosti] = useState({ prima: false, dopo: false })
  useEffect(() => {
    const el = cornice.current
    if (!el) return
    const misura = () => {
      const fine = el.scrollWidth - el.clientWidth
      setNascosti({ prima: el.scrollLeft > 4, dopo: fine - el.scrollLeft > 4 })
    }
    misura()
    el.addEventListener('scroll', misura, { passive: true })
    window.addEventListener('resize', misura)
    return () => {
      el.removeEventListener('scroll', misura)
      window.removeEventListener('resize', misura)
    }
  }, [])

  // the current stage in the middle of its frame (only the frame scrolls, never the page)
  const attuale = nodi.findIndex((n) => n.stato === 'attuale')
  useEffect(() => {
    const el = cornice.current
    // every stage done (the path started): the rocket in view
    const tutti = nodi.length > 0 && nodi.every((n) => n.stato === 'completato')
    const bottone = bottoni.current[attuale >= 0 ? attuale : tutti ? nodi.length - 1 : 0]
    const voce = bottone?.closest('li')
    if (!el) return
    if (voce && el.scrollWidth > el.clientWidth) {
      el.scrollLeft = voce.offsetLeft - (el.clientWidth - voce.clientWidth) / 2
      el.dispatchEvent(new Event('scroll'))
    }
    // the opening (stages in sequence, the line that draws itself) plays only now, on the stages in view:
    // never on the first stages of the server's HTML and then a jump sideways (globals.css, data-pronta)
    el.dataset.pronta = '1'
  }, [attuale, nodi])

  useEffect(() => {
    if (!suggerimento) return
    const t = window.setTimeout(() => setSuggerimento(null), SUGGERIMENTO_MS)
    return () => window.clearTimeout(t)
  }, [suggerimento])

  const tempi = tempiLinea(nodi)

  function frecce(evento: KeyboardEvent<HTMLButtonElement>, indice: number) {
    let prossimo = -1
    if (evento.key === 'ArrowRight') prossimo = Math.min(nodi.length - 1, indice + 1)
    else if (evento.key === 'ArrowLeft') prossimo = Math.max(0, indice - 1)
    else if (evento.key === 'Home') prossimo = 0
    else if (evento.key === 'End') prossimo = nodi.length - 1
    if (prossimo < 0) return
    evento.preventDefault()
    bottoni.current[prossimo]?.focus()
  }

  /** A light shake of a future stage (WAAPI, transform only), never with «Riduci movimento». */
  function scuoti(bottone: HTMLButtonElement | null) {
    if (!bottone || typeof bottone.animate !== 'function') return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    bottone.animate(
      [
        { transform: 'translateX(0)' },
        { transform: 'translateX(-3px)' },
        { transform: 'translateX(3px)' },
        { transform: 'translateX(-2px)' },
        { transform: 'translateX(0)' },
      ],
      { duration: 320, easing: 'ease-out' },
    )
  }

  return (
    <nav aria-label={T.timeline} className="space-y-2" data-testid="timeline">
      <div
        ref={cornice}
        data-timeline=""
        data-nascosti={[nascosti.prima ? 'prima' : '', nascosti.dopo ? 'dopo' : ''].join(' ').trim() || undefined}
        className={cn(
          '-mx-4 -mt-4 snap-x snap-mandatory overflow-x-auto px-4 pt-6 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
          nascosti.prima && nascosti.dopo
            ? '[mask-image:linear-gradient(to_right,transparent,black_12%,black_88%,transparent)]'
            : nascosti.dopo
              ? '[mask-image:linear-gradient(to_right,black_85%,transparent)]'
              : nascosti.prima
                ? '[mask-image:linear-gradient(to_right,transparent,black_15%)]'
                : null,
        )}
      >
        <ol className="flex w-max sm:grid sm:w-full sm:grid-cols-7">
          {nodi.map((nodo, i) => {
            const precedente = i > 0 ? nodi[i - 1]!.chiave : null
            const ultimo = i === nodi.length - 1
            const futuro = nodo.stato === 'futuro'
            const completato = nodo.stato === 'completato'
            const aperto = selezionato === nodo.chiave
            const riempito = frazioni[i] ?? (completato ? 1 : 0)
            const tempo = tempi[i] ?? { ritardo: 0, durata: 0, curva: 'linear' }
            return (
              <li
                key={nodo.chiave}
                className="percorso-nodo-entra relative flex w-[5.75rem] shrink-0 snap-center flex-col items-center gap-2 text-center sm:w-auto"
                style={{ '--ritardo-nodo': `${ritardoNodo(i)}ms` } as CSSProperties}
                data-nodo={nodo.chiave}
                data-stato={nodo.stato}
              >
                {/* the line to the next stage, through the centres of the two circles: a dashed track, the light over it */}
                {!ultimo ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-[1.375rem] left-[calc(50%+1.625rem)] h-0.5 w-[calc(100%-3.25rem)] -translate-y-1/2"
                  >
                    {!completato ? (
                      <span className="absolute inset-0 border-t-2 border-dashed border-border" />
                    ) : null}
                    <span
                      data-anim="riempimento"
                      data-frazione={riempito}
                      className={cn(
                        'percorso-linea absolute inset-0 origin-left rounded-full',
                        riempito > 0 && tempo.durata > 0 && 'percorso-linea-entra',
                      )}
                      style={
                        {
                          transform: `scaleX(${riempito})`,
                          '--ritardo-linea': `${tempo.ritardo}ms`,
                          '--durata-linea': `${tempo.durata}ms`,
                          '--curva-linea': tempo.curva,
                        } as CSSProperties
                      }
                    />
                  </span>
                ) : null}
                <button
                  ref={(el) => {
                    bottoni.current[i] = el
                  }}
                  type="button"
                  data-anim="nodo"
                  aria-label={nomeAccessibileNodo(nodo.chiave, nodo.stato, precedente)}
                  aria-disabled={futuro || undefined}
                  aria-current={nodo.stato === 'attuale' ? 'step' : undefined}
                  aria-pressed={!futuro ? aperto : undefined}
                  onKeyDown={(e) => frecce(e, i)}
                  onClick={() => {
                    if (futuro) {
                      scuoti(bottoni.current[i] ?? null)
                      setSuggerimento({
                        chiave: nodo.chiave,
                        testo: precedente ? T.siSbloccaDopo(etichettaNodo(precedente)) : T.statoNodo.futuro,
                      })
                      return
                    }
                    setSuggerimento(null)
                    onSeleziona(nodo.chiave)
                  }}
                  className={cn(
                    'relative z-10 flex size-11 items-center justify-center rounded-full transition-colors focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none motion-reduce:transition-none',
                    completato && 'percorso-nodo-fatto bg-primary text-primary-foreground',
                    nodo.stato === 'attuale' && 'percorso-nodo-attuale border-2 border-primary bg-card text-foreground',
                    futuro && 'border border-border bg-card text-muted-foreground',
                    aperto && completato && 'ring-2 ring-foreground/70 ring-offset-2 ring-offset-background',
                  )}
                >
                  {/* the light of the current stage: still here, breathing once the motion has arrived */}
                  {nodo.stato === 'attuale' ? (
                    <span data-anim="respiro" aria-hidden="true" className="percorso-respiro pointer-events-none absolute -inset-1 rounded-full" />
                  ) : null}
                  {/* a flash of light when the stage is completed; invisible until then */}
                  {!futuro ? (
                    <span data-anim="lampo" aria-hidden="true" className="percorso-lampo pointer-events-none absolute -inset-4 rounded-full opacity-0" />
                  ) : null}
                  {ultimo ? (
                    <span data-anim="razzo" className="relative inline-flex">
                      <Rocket className={cn('size-5', futuro && 'size-4')} aria-hidden="true" />
                    </span>
                  ) : completato ? (
                    <Spunta />
                  ) : futuro ? (
                    <Lock className="size-4" aria-hidden="true" />
                  ) : (
                    <span data-anim="anello" className="relative size-3 rounded-full bg-primary" aria-hidden="true" />
                  )}
                  {/* the lock that opens when the stage is unlocked: hidden, played over the ring */}
                  {nodo.stato === 'attuale' ? (
                    <span
                      data-anim="lucchetto"
                      aria-hidden="true"
                      className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-card text-muted-foreground opacity-0"
                    >
                      <Lock data-anim="lucchetto-chiuso" className="absolute size-4" />
                      <LockOpen data-anim="lucchetto-aperto" className="absolute size-4 opacity-0" />
                    </span>
                  ) : null}
                  {ultimo && futuro ? (
                    <span className="absolute -right-0.5 -bottom-0.5 flex size-4 items-center justify-center rounded-full border border-border bg-card">
                      <Lock className="size-2.5" aria-hidden="true" />
                    </span>
                  ) : null}
                </button>
                <span
                  aria-hidden="true"
                  className={cn(
                    // two lines at most, always the height of two: the state chips of the 7 stages stay on one line
                    'line-clamp-2 min-h-[2.5em] px-1 text-xs leading-tight',
                    nodo.stato === 'attuale' ? 'font-semibold text-foreground' : futuro ? 'text-muted-foreground' : 'text-foreground/85',
                  )}
                >
                  {etichettaNodo(nodo.chiave)}
                </span>
                <span
                  aria-hidden="true"
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[0.6875rem] leading-none',
                    nodo.stato === 'attuale'
                      ? 'bg-primary text-primary-foreground'
                      : nodo.stato === 'completato'
                        ? 'text-status-ok'
                        : 'text-muted-foreground',
                  )}
                >
                  {nodo.stato === 'attuale' ? T.tappaAttuale : T.statoNodo[nodo.stato]}
                </span>
              </li>
            )
          })}
        </ol>
      </div>
      <p aria-live="polite" className="text-center text-sm text-muted-foreground" data-testid="timeline-suggerimento">
        {suggerimento ? (
          <span className="inline-flex items-center gap-1.5">
            <Lock className="size-3.5" aria-hidden="true" />
            {suggerimento.testo}
          </span>
        ) : null}
      </p>
    </nav>
  )
}
