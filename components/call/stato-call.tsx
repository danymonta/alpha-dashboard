import {
  Ban,
  Hourglass,
  CircleCheck,
  CircleX,
  Clock,
  RotateCw,
  TriangleAlert,
  UserX,
  type LucideIcon,
} from 'lucide-react'

import { SPOSTA } from '@/lib/call/spostamento'
import type { Database } from '@/lib/supabase/database.types'
import { cn } from '@/lib/utils'

type Stato = Database['public']['Enums']['call_status']
type Esito = Database['public']['Enums']['call_outcome']

type Aspetto = { etichetta: string; Icona: LucideIcon; tono: string }

function aspetto(stato: Stato, esito: Esito | null, passata: boolean): Aspetto {
  if (stato === 'programmata') {
    return passata
      ? { etichetta: 'Esito da registrare', Icona: TriangleAlert, tono: 'text-status-warning' }
      : { etichetta: 'Programmata', Icona: Clock, tono: 'text-muted-foreground' }
  }
  if (stato === 'svolta') {
    if (esito === 'chiusa') return { etichetta: 'Chiusa', Icona: CircleCheck, tono: 'text-status-ok' }
    if (esito === 'follow_up') return { etichetta: 'Follow-up', Icona: RotateCw, tono: 'text-foreground' }
    if (esito === 'persa') return { etichetta: 'Persa', Icona: CircleX, tono: 'text-muted-foreground' }
    return { etichetta: 'Svolta', Icona: CircleCheck, tono: 'text-foreground' }
  }
  if (stato === 'no_show') return { etichetta: 'No show', Icona: UserX, tono: 'text-status-warning' }
  if (stato === 'cancellata') return { etichetta: 'Cancellata', Icona: Ban, tono: 'text-muted-foreground' }
  // stato riprogrammata: the lead has to confirm a new date (04/10/2026)
  return { etichetta: SPOSTA.attesa.etichetta, Icona: Hourglass, tono: 'text-status-warning' }
}

/** Call state: always icon + words, colour only reinforces. */
export function StatoCall({
  stato,
  esito,
  qualificata,
  passata,
  className,
}: {
  stato: Stato
  esito: Esito | null
  qualificata: boolean | null
  passata: boolean
  className?: string
}) {
  const { etichetta, Icona, tono } = aspetto(stato, esito, passata)

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', tono, className)}>
      <Icona className="size-4 shrink-0" aria-hidden="true" />
      {etichetta}
      {stato === 'svolta' && qualificata !== null ? (
        <span className="text-muted-foreground">
          · {qualificata ? 'qualificata' : 'non qualificata'}
        </span>
      ) : null}
    </span>
  )
}
