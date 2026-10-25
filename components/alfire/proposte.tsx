'use client'

import { Check } from 'lucide-react'

import { useTesti } from '@/components/i18n/lingua-provider'
import type { Proposte } from '@/lib/alfire/risposte'
import { ALFIRE } from '@/lib/i18n/testi/alfire'
import { cn } from '@/lib/utils'

/**
 * The options Alfire proposes under its message (proponi_risposte). A tap
 * sends the option as the user's message; typing or dictating another answer
 * works just the same. Once the chat moves on, the buttons stay as a record
 * of the answer and never send again.
 */
export function RisposteProposte({
  proposte,
  domanda,
  attive,
  correnti,
  scelta,
  rispondi,
}: {
  proposte: Proposte
  /** The question, when the message's text does not already say it. */
  domanda: string | null
  /** A tap answers now. */
  attive: boolean
  /** The last message's buttons: while they wait they stay, off. */
  correnti: boolean
  scelta: string | null
  rispondi: (opzione: string) => void
}) {
  const t = useTesti(ALFIRE)
  const seguito = proposte.tipo === 'seguito'
  // follow-up questions nobody took are gone once the chat moved on
  if (seguito && !correnti && !scelta) return null
  const etichetta = proposte.domanda?.trim() || (seguito ? t.successive : t.possibili)

  return (
    <div className="space-y-2" data-testid="alfire-proposte" data-tipo={proposte.tipo}>
      {domanda ? (
        <p className="text-sm" lang="it">
          {domanda}
        </p>
      ) : null}
      <div role="group" aria-label={etichetta} className={seguito ? 'flex flex-col gap-2' : 'flex flex-wrap gap-2'}>
        {proposte.opzioni.map((opzione, i) => {
          const questa = scelta === opzione
          return (
            <button
              key={`${i}-${opzione}`}
              type="button"
              disabled={!attive}
              onClick={() => rispondi(opzione)}
              data-scelta={questa ? 'true' : undefined}
              className={cn(
                'inline-flex min-h-11 max-w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm break-words transition-colors motion-reduce:transition-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
                seguito && 'w-full',
                questa
                  ? 'border-primary bg-primary/20 text-foreground'
                  : seguito
                    ? 'border-border text-muted-foreground'
                    : 'border-border bg-input/30 text-foreground',
                attive ? 'hover:bg-accent hover:text-foreground' : 'cursor-default',
                !attive && !questa && 'opacity-60',
              )}
            >
              {questa ? <Check className="size-4 shrink-0" aria-hidden="true" /> : null}
              <span className="min-w-0" lang="it">
                {opzione}
              </span>
              {questa ? <span className="sr-only">{t.tuaRisposta}</span> : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}
