import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import type { ReactNode } from 'react'

import { EtichettaConNota } from '@/components/metriche/nota'
import { formatDelta } from '@/lib/format'
import type { VoceLegenda } from '@/lib/metriche/legenda'
import { cn } from '@/lib/utils'

type Props = {
  /** A legend entry (lib/metriche/legenda): the label gets its "i". */
  etichetta: string | VoceLegenda
  valore: string
  /** relative change from SQL (kpi_periodo.delta); null = no comparison */
  delta: number | null
  confronto: string
  hero?: boolean
  className?: string
  children?: ReactNode
}

/**
 * Delta against the previous period: always icon + sign + words, never colour
 * alone. For every number of the overview "up" is good.
 */
export function DeltaKpi({
  delta,
  confronto,
  className,
}: {
  delta: number | null
  confronto: string
  className?: string
}) {
  const su = delta !== null && delta > 0
  const giu = delta !== null && delta < 0
  const Icona = su ? TrendingUp : giu ? TrendingDown : Minus

  return (
    <p
      className={cn(
        // a long comparison ("vs periodo precedente") wraps as a whole under the value
        'inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm',
        su ? 'text-status-ok' : giu ? 'text-status-critical' : 'text-muted-foreground',
        className,
      )}
    >
      <Icona className="size-4 shrink-0" aria-hidden="true" />
      <span className="num font-medium">{delta === null ? 'n.d.' : formatDelta(delta)}</span>
      <span className="text-muted-foreground">{confronto}</span>
    </p>
  )
}

/** KPI tile: label (with what it counts), value, delta. */
export function TileKpi({ etichetta, valore, delta, confronto, hero = false, className, children }: Props) {
  return (
    <div className={cn('rounded-xl bg-card p-4', hero && 'md:p-5', className)} data-tour={hero ? 'kpi-cash' : undefined}>
      <p className="text-sm text-muted-foreground">
        {typeof etichetta === 'string' ? etichetta : <EtichettaConNota voce={etichetta} />}
      </p>
      <p
        className={cn(
          'mt-1 font-semibold tracking-tight',
          // the one gold number of the screen
          hero ? 'text-5xl text-gold md:text-6xl' : 'text-2xl md:text-3xl',
        )}
      >
        {valore}
      </p>
      <DeltaKpi delta={delta} confronto={confronto} className="mt-2" />
      {children}
    </div>
  )
}
