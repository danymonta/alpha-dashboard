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

import type { Lingua } from '@/lib/i18n/lingua'
import { CALL } from '@/lib/i18n/testi/call'
import type { Database } from '@/lib/supabase/database.types'
import { cn } from '@/lib/utils'

type Stato = Database['public']['Enums']['call_status']
type Esito = Database['public']['Enums']['call_outcome']

type Aspetto = { etichetta: string; Icona: LucideIcon; tono: string }

function aspetto(stato: Stato, esito: Esito | null, passata: boolean, lingua: Lingua): Aspetto {
  const t = CALL[lingua].stato
  if (stato === 'programmata') {
    return passata
      ? { etichetta: t.daRegistrare, Icona: TriangleAlert, tono: 'text-status-warning' }
      : { etichetta: t.programmata, Icona: Clock, tono: 'text-muted-foreground' }
  }
  if (stato === 'svolta') {
    if (esito === 'chiusa') return { etichetta: t.chiusa, Icona: CircleCheck, tono: 'text-status-ok' }
    if (esito === 'follow_up') return { etichetta: t.follow_up, Icona: RotateCw, tono: 'text-foreground' }
    if (esito === 'persa') return { etichetta: t.persa, Icona: CircleX, tono: 'text-muted-foreground' }
    return { etichetta: t.svolta, Icona: CircleCheck, tono: 'text-foreground' }
  }
  if (stato === 'no_show') return { etichetta: t.no_show, Icona: UserX, tono: 'text-status-warning' }
  if (stato === 'cancellata') return { etichetta: t.cancellata, Icona: Ban, tono: 'text-muted-foreground' }
  // stato riprogrammata: the lead has to confirm a new date (04/10/2026)
  return { etichetta: t.attesa, Icona: Hourglass, tono: 'text-status-warning' }
}

/** Call state: always icon + words, colour only reinforces. */
export function StatoCall({
  stato,
  esito,
  qualificata,
  passata,
  className,
  lingua = 'it',
}: {
  stato: Stato
  esito: Esito | null
  qualificata: boolean | null
  passata: boolean
  className?: string
  lingua?: Lingua
}) {
  const { etichetta, Icona, tono } = aspetto(stato, esito, passata, lingua)
  const t = CALL[lingua].stato

  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', tono, className)}>
      <Icona className="size-4 shrink-0" aria-hidden="true" />
      {etichetta}
      {stato === 'svolta' && qualificata !== null ? (
        <span className="text-muted-foreground">
          · {qualificata ? t.qualificata : t.nonQualificata}
        </span>
      ) : null}
    </span>
  )
}
