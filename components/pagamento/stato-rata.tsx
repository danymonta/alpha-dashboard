import { CircleCheck, CircleX, Clock, TriangleAlert, Undo2, type LucideIcon } from 'lucide-react'

import type { Database } from '@/lib/supabase/database.types'
import { cn } from '@/lib/utils'

type StatoPagamento = Database['public']['Enums']['payment_status']

/**
 * "In ritardo" is not stored: a planned instalment whose due date has passed.
 * Always icon + words; colour only reinforces.
 */
export function StatoRata({
  stato,
  scadenza,
  oggi,
  className,
}: {
  stato: StatoPagamento
  scadenza: string
  oggi: string
  className?: string
}) {
  const inRitardo = stato === 'prevista' && scadenza < oggi

  const { etichetta, Icona, tono }: { etichetta: string; Icona: LucideIcon; tono: string } =
    inRitardo
      ? { etichetta: 'In ritardo', Icona: TriangleAlert, tono: 'text-status-warning' }
      : stato === 'incassata'
        ? { etichetta: 'Incassata', Icona: CircleCheck, tono: 'text-status-ok' }
        : stato === 'fallita'
          ? { etichetta: 'Fallita', Icona: CircleX, tono: 'text-status-critical' }
          : stato === 'rimborsata'
            ? { etichetta: 'Rimborsata', Icona: Undo2, tono: 'text-muted-foreground' }
            : { etichetta: 'Prevista', Icona: Clock, tono: 'text-muted-foreground' }

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', tono, className)}>
      <Icona className="size-4 shrink-0" aria-hidden="true" />
      {etichetta}
    </span>
  )
}
