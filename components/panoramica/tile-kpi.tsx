import { Minus, TrendingDown, TrendingUp } from 'lucide-react'
import type { ReactNode } from 'react'

import { formatDelta } from '@/lib/format'
import { cn } from '@/lib/utils'

type Props = {
  etichetta: string
  valore: string
  /** relative change from SQL (kpi_panoramica.delta); null = no comparison */
  delta: number | null
  confronto: string
  hero?: boolean
  children?: ReactNode
}

/**
 * KPI tile. The delta is always icon + sign + words, never colour alone.
 * For every tile of the overview "up" is good.
 */
export function TileKpi({ etichetta, valore, delta, confronto, hero = false, children }: Props) {
  const su = delta !== null && delta > 0
  const giu = delta !== null && delta < 0
  const Icona = su ? TrendingUp : giu ? TrendingDown : Minus

  return (
    <div className={cn('rounded-xl bg-card p-4', hero && 'md:p-5')}>
      <p className="text-sm text-muted-foreground">{etichetta}</p>
      <p
        className={cn(
          'mt-1 font-semibold tracking-tight',
          // the one gold number of the screen
          hero ? 'text-5xl text-gold md:text-6xl' : 'text-2xl md:text-3xl',
        )}
      >
        {valore}
      </p>
      <p
        className={cn(
          'mt-2 inline-flex items-center gap-1.5 text-sm',
          su ? 'text-status-ok' : giu ? 'text-status-critical' : 'text-muted-foreground',
        )}
      >
        <Icona className="size-4 shrink-0" aria-hidden="true" />
        <span className="num font-medium">{delta === null ? 'n.d.' : formatDelta(delta)}</span>
        <span className="text-muted-foreground">{confronto}</span>
      </p>
      {children}
    </div>
  )
}
