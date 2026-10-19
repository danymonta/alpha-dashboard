import { CalendarClock, ChartNoAxesCombined, DatabaseBackup, RefreshCw, type LucideIcon } from 'lucide-react'

import type { TipoNotifica } from '@/lib/notifiche/tipi'
import { cn } from '@/lib/utils'

const ICONE: Record<TipoNotifica, LucideIcon> = {
  riepilogo_settimana: ChartNoAxesCombined,
  backup: DatabaseBackup,
  promemoria_feedback: CalendarClock,
  promemoria_rinnovo: RefreshCw,
}

/** The icon of a kind of notification, in a square: the kind is also written next to it, never the icon alone. */
export function IconaTipo({ tipo, className }: { tipo: string; className?: string }) {
  const Icona = ICONE[tipo as TipoNotifica] ?? CalendarClock
  return (
    <span
      aria-hidden="true"
      className={cn('flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground', className)}
    >
      <Icona className="size-5" />
    </span>
  )
}
