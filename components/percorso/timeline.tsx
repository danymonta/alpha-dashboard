'use client'

import { Check, Lock, Rocket } from 'lucide-react'
import { useEffect, useRef, useState, type KeyboardEvent } from 'react'

import type { NodoPercorso } from '@/lib/percorso/letture'
import { etichettaNodo, nomeAccessibileNodo } from '@/lib/percorso/nodi'
import { TESTI_PERCORSO as T } from '@/lib/percorso/testi'
import { cn } from '@/lib/utils'

/** How long the line «Si sblocca dopo: …» stays after a tap on a future node. */
const SUGGERIMENTO_MS = 4000

/**
 * The 7 stages of the path (release B1a, docs/onboarding/rilascio-b.md, «Timeline»):
 * every stage a button with its state in words in the accessible name and an icon (a
 * check, a ring, a lock; the rocket at the end), never colour alone. The line is full and
 * lit up to the current stage, dashed after it. Still light only (the glow tokens), no
 * animation: motion arrives with B2. On the phone the line scrolls sideways inside its own
 * frame, centred on the current stage; the page never scrolls sideways. Arrows move
 * between the stages; a future stage is aria-disabled (never disabled) and its tap says
 * what it waits for, in a live region.
 */
export function Timeline({
  nodi,
  selezionato,
  onSeleziona,
}: {
  nodi: readonly NodoPercorso[]
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
    const bottone = bottoni.current[attuale >= 0 ? attuale : 0]
    const voce = bottone?.closest('li')
    if (!el || !voce || el.scrollWidth <= el.clientWidth) return
    el.scrollLeft = voce.offsetLeft - (el.clientWidth - voce.clientWidth) / 2
    el.dispatchEvent(new Event('scroll'))
  }, [attuale])

  useEffect(() => {
    if (!suggerimento) return
    const t = window.setTimeout(() => setSuggerimento(null), SUGGERIMENTO_MS)
    return () => window.clearTimeout(t)
  }, [suggerimento])

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

  return (
    <nav aria-label={T.timeline} className="space-y-2" data-testid="timeline">
      <div
        ref={cornice}
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
            const aperto = selezionato === nodo.chiave
            const Icona = ultimo ? Rocket : nodo.stato === 'completato' ? Check : futuro ? Lock : null
            return (
              <li
                key={nodo.chiave}
                className="relative flex w-[5.75rem] shrink-0 snap-center flex-col items-center gap-2 text-center sm:w-auto"
                data-nodo={nodo.chiave}
                data-stato={nodo.stato}
              >
                {/* the line to the next stage, through the centres of the two circles */}
                {!ultimo ? (
                  <span
                    aria-hidden="true"
                    className={cn(
                      'absolute top-[1.375rem] left-[calc(50%+1.625rem)] h-0.5 w-[calc(100%-3.25rem)] -translate-y-1/2 rounded-full',
                      nodo.stato === 'completato'
                        ? 'bg-primary shadow-[0_0_10px_1px_var(--glow-primario)]'
                        : 'border-t-2 border-dashed border-border bg-transparent',
                    )}
                  />
                ) : null}
                <button
                  ref={(el) => {
                    bottoni.current[i] = el
                  }}
                  type="button"
                  aria-label={nomeAccessibileNodo(nodo.chiave, nodo.stato, precedente)}
                  aria-disabled={futuro || undefined}
                  aria-current={nodo.stato === 'attuale' ? 'step' : undefined}
                  aria-pressed={!futuro ? aperto : undefined}
                  onKeyDown={(e) => frecce(e, i)}
                  onClick={() => {
                    if (futuro) {
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
                    nodo.stato === 'completato' && 'bg-primary text-primary-foreground',
                    nodo.stato === 'attuale' &&
                      'border-2 border-primary bg-card text-foreground shadow-[0_0_0_5px_color-mix(in_srgb,var(--primary)_18%,transparent),0_0_28px_2px_var(--glow-primario)]',
                    futuro && 'border border-border bg-card text-muted-foreground',
                    aperto && nodo.stato === 'completato' && 'ring-2 ring-foreground/70 ring-offset-2 ring-offset-background',
                  )}
                >
                  {Icona ? (
                    <Icona className={cn('size-5', futuro && !ultimo && 'size-4')} aria-hidden="true" />
                  ) : (
                    <span className="size-3 rounded-full bg-primary" aria-hidden="true" />
                  )}
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
