'use client'

import { Hourglass } from 'lucide-react'
import type { RefObject } from 'react'

import { CHIAVI_FILTRO, FILTRI, type ChiaveFiltro } from '@/lib/insight/filtri'
import { NUMERI } from '@/lib/insight/parole'
import { cn } from '@/lib/utils'

/**
 * The five numbers that filter the chats, as the artifact: a tap filters, the
 * same tile again (or «Mostra tutto») clears. Real buttons with aria-pressed,
 * the hint tied to the group. «Attendono risposta» is the alert: its number
 * red, with the hourglass, only above 0 (CLAUDE.md section 11: a status colour
 * always with an icon; the artifact painted it red at 0 too).
 */
export function NumeriFiltro({
  conteggi,
  attivo,
  onScegli,
  riferimenti,
}: {
  conteggi: Record<ChiaveFiltro, number>
  attivo: ChiaveFiltro | null
  onScegli: (chiave: ChiaveFiltro) => void
  riferimenti: RefObject<Partial<Record<ChiaveFiltro, HTMLButtonElement | null>>>
}) {
  return (
    <div className="grid gap-2">
      <div
        role="group"
        aria-label={NUMERI.gruppo}
        aria-describedby="suggerimento-filtri"
        className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-5 [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1"
      >
        {CHIAVI_FILTRO.map((chiave) => {
          const filtro = FILTRI[chiave]
          const n = conteggi[chiave]
          const allarme = filtro.allarme && n > 0
          const premuto = attivo === chiave
          return (
            <button
              key={chiave}
              ref={(el) => {
                riferimenti.current[chiave] = el
              }}
              type="button"
              aria-pressed={premuto}
              data-filtro={chiave}
              onClick={() => onScegli(chiave)}
              className={cn(
                'grid min-h-11 min-w-0 content-start gap-1 bg-card p-3 text-left transition-colors hover:bg-accent focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none md:p-4',
                premuto && 'bg-accent shadow-[inset_0_-3px_0_var(--primary)]',
              )}
            >
              <span className={cn('num inline-flex items-center gap-1.5 text-3xl leading-none font-semibold', allarme && 'text-rosso-testo')}>
                {allarme ? <Hourglass className="size-5 shrink-0" aria-hidden="true" /> : null}
                {n}
              </span>
              <span
                className={cn(
                  'text-xs tracking-wide uppercase [overflow-wrap:anywhere]',
                  premuto ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {filtro.etichetta}
              </span>
            </button>
          )
        })}
      </div>
      <p id="suggerimento-filtri" className="text-xs text-muted-foreground">
        {attivo ? NUMERI.suggerimentoAttivo : NUMERI.suggerimento}
      </p>
    </div>
  )
}
