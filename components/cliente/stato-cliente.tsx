import { Archive, CalendarClock, CalendarX, CircleCheck, CircleDashed, Hourglass, UserMinus, type LucideIcon } from 'lucide-react'

import type { Database } from '@/lib/supabase/database.types'
import { cn } from '@/lib/utils'

export type StatoCliente = Database['public']['Enums']['client_status']

export const ETICHETTA_STATO_CLIENTE: Record<StatoCliente, string> = {
  attivo: 'Attivo',
  in_scadenza: 'In scadenza',
  da_iniziare: 'Da iniziare',
  scaduto: 'Scaduto',
  chiuso: 'Chiuso',
  ex_cliente: 'Ex cliente',
  mai_attivato: 'Mai attivato',
}

const ASPETTO: Record<StatoCliente, { Icona: LucideIcon; tono: string }> = {
  attivo: { Icona: CircleCheck, tono: 'text-status-ok' },
  in_scadenza: { Icona: Hourglass, tono: 'text-status-warning' },
  // the same look as "Da iniziare" in the client's path history
  da_iniziare: { Icona: CalendarClock, tono: 'text-muted-foreground' },
  scaduto: { Icona: CalendarX, tono: 'text-status-critical' },
  // closed by the admin ("Non rinnova", 04/10/2026): handled, nothing to chase
  chiuso: { Icona: Archive, tono: 'text-muted-foreground' },
  ex_cliente: { Icona: UserMinus, tono: 'text-muted-foreground' },
  mai_attivato: { Icona: CircleDashed, tono: 'text-muted-foreground' },
}

/** Derived status (v_client_status): icon + words, colour only reinforces. */
export function StatoClienteBadge({ stato, className }: { stato: StatoCliente; className?: string }) {
  const { Icona, tono } = ASPETTO[stato]
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-sm', tono, className)}>
      <Icona className="size-4 shrink-0" aria-hidden="true" />
      {ETICHETTA_STATO_CLIENTE[stato]}
    </span>
  )
}
