import {
  CalendarClock,
  ChartNoAxesCombined,
  ClipboardCheck,
  DatabaseBackup,
  Gauge,
  KeyRound,
  ReceiptText,
  RefreshCw,
  Timer,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react'

import type { TipoNotifica } from '@/lib/notifiche/tipi'
import { cn } from '@/lib/utils'

const ICONE: Record<TipoNotifica, LucideIcon> = {
  riepilogo_settimana: ChartNoAxesCombined,
  tempo_team: Timer,
  backup: DatabaseBackup,
  promemoria_feedback: CalendarClock,
  promemoria_rinnovo: RefreshCw,
  rate_in_ritardo: ReceiptText,
  chiave_in_scadenza: KeyRound,
  chiave_rifiutata: ShieldAlert,
  proposta_da_approvare: ClipboardCheck,
  spesa_claude: Gauge,
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
