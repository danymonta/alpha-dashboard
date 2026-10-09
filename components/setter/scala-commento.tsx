'use client'

import { Circle, CircleAlert, CircleCheck } from 'lucide-react'
import { useId, useRef, type KeyboardEvent } from 'react'

import { COMMENTO_OBBLIGATORIO, type Scala } from '@/lib/setting/commento'
import { cn } from '@/lib/utils'

type Props = {
  scala: Scala
  valore: string | null | undefined
  /** null: the selected option was tapped again, the answer is cleared */
  onCambia: (valore: string | null) => void
  /** The setter's day from 08/10/2026: the question says it is required */
  obbligatoria?: boolean
  /** Still to answer on a day to complete: the words under the options */
  errore?: string | null
  className?: string
}

/**
 * One scale of the setter's comment: three 44px options, one tap. Each option
 * carries its definition under the words, always visible: the setter never
 * has to guess what "Medie" means. A tap on the selected option clears it.
 * A radio group for screen readers and the keyboard (arrows move and select).
 */
export function ScalaCommento({ scala, valore, onCambia, obbligatoria = false, errore = null, className }: Props) {
  const id = useId()
  const bottoni = useRef<(HTMLButtonElement | null)[]>([])
  const scelto = scala.opzioni.findIndex((o) => o.valore === valore)
  // roving tab stop: the selected option, or the first one
  const fermata = scelto >= 0 ? scelto : 0

  function frecce(e: KeyboardEvent<HTMLButtonElement>, i: number) {
    const passo = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (passo === 0) return
    e.preventDefault()
    const n = scala.opzioni.length
    const prossimo = (i + passo + n) % n
    bottoni.current[prossimo]?.focus()
    onCambia(scala.opzioni[prossimo].valore)
  }

  return (
    <div className={cn('space-y-2', className)} data-testid={`scala-${scala.campo}`}>
      <div>
        <p id={`${id}-domanda`} className="text-sm font-medium">
          {scala.domanda}
          {obbligatoria ? (
            <span className="font-normal text-muted-foreground"> ({COMMENTO_OBBLIGATORIO.obbligatoria})</span>
          ) : null}
        </p>
        {scala.spiegazione ? (
          <p id={`${id}-spiegazione`} className="mt-0.5 text-xs leading-snug text-muted-foreground">
            {scala.spiegazione}
          </p>
        ) : null}
      </div>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-domanda`}
        aria-describedby={
          [scala.spiegazione ? `${id}-spiegazione` : null, errore ? `${id}-errore` : null].filter(Boolean).join(' ') ||
          undefined
        }
        aria-required={obbligatoria || undefined}
        aria-invalid={errore ? true : undefined}
        className={cn('grid gap-2', scala.affiancate ? 'grid-cols-3' : 'grid-cols-1')}
      >
        {scala.opzioni.map((o, i) => {
          const attiva = i === scelto
          // an empty circle, checked when chosen: a radio at a glance, never color alone,
          // and the same size in both states, so nothing moves under the finger
          const Segno = attiva ? CircleCheck : Circle
          return (
            <button
              key={o.valore}
              ref={(el) => {
                bottoni.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={attiva}
              aria-labelledby={`${id}-${o.valore}`}
              aria-describedby={`${id}-${o.valore}-definizione`}
              tabIndex={i === fermata ? 0 : -1}
              onClick={() => onCambia(attiva ? null : o.valore)}
              onKeyDown={(e) => frecce(e, i)}
              className={cn(
                'flex min-h-11 rounded-lg border px-3 py-2 transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                scala.affiancate ? 'flex-col items-center gap-1 text-center' : 'items-start gap-2.5 text-left',
                attiva ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-input/30 hover:bg-accent',
              )}
            >
              <Segno
                className={cn('size-4 shrink-0', !scala.affiancate && 'mt-0.5', !attiva && 'text-muted-foreground')}
                aria-hidden="true"
              />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span id={`${id}-${o.valore}`} className="text-sm font-medium">
                  {o.etichetta}
                </span>
                <span
                  id={`${id}-${o.valore}-definizione`}
                  className={cn('text-xs leading-snug', attiva ? 'text-primary-foreground/85' : 'text-muted-foreground')}
                >
                  {o.definizione}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      {errore ? (
        <p id={`${id}-errore`} className="flex items-start gap-1.5 text-xs text-status-critical" data-testid={`errore-${scala.campo}`}>
          <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
          {errore}
        </p>
      ) : null}
    </div>
  )
}
