import { CalendarDays } from 'lucide-react'
import Link from 'next/link'

import { BarraAvanzamento, InRitardo, InizialiMembri, StatoProgettoBadge } from '@/components/pm/stato-progetto'
import { formatData } from '@/lib/format'
import type { StatoProgetto } from '@/lib/progetti'

export type ProgettoCard = {
  id: string
  nome: string
  stato: StatoProgetto
  data_fine: string | null
  task_totali: number
  task_completati: number
  task_in_ritardo: number
  avanzamento: number | null
  scaduto: boolean
}

/** One project in the list: the whole card opens it. */
export function CardProgetto({
  progetto,
  membri,
  cliente,
}: {
  progetto: ProgettoCard
  membri: string[]
  /** Only when the reader may see that client (RLS on clients decides). */
  cliente: string | null
}) {
  const p = progetto
  return (
    <Link
      href={`/progetti/${p.id}`}
      className="flex h-full flex-col gap-3 rounded-xl bg-card p-4 transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-medium break-words">{p.nome}</h3>
          {cliente ? <p className="truncate text-xs text-muted-foreground">Cliente: {cliente}</p> : null}
        </div>
        <StatoProgettoBadge stato={p.stato} />
      </div>

      <BarraAvanzamento completati={p.task_completati} totali={p.task_totali} avanzamento={p.avanzamento} />

      {/* dates and delays stacked on the left, the team on the right: never a lonely wrapped row */}
      <div className="mt-auto grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 text-xs">
        <span className="flex flex-col items-start gap-1">
          {p.data_fine ? (
            p.scaduto ? (
              <InRitardo testo={`Doveva finire il ${formatData(p.data_fine)}`} />
            ) : (
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <CalendarDays className="size-3.5" aria-hidden="true" />
                <span className="num">Fine {formatData(p.data_fine)}</span>
              </span>
            )
          ) : (
            <span className="text-muted-foreground">Senza data di fine</span>
          )}
          {p.task_in_ritardo > 0 ? (
            <InRitardo testo={p.task_in_ritardo === 1 ? '1 task in ritardo' : `${p.task_in_ritardo} task in ritardo`} />
          ) : null}
        </span>
        <InizialiMembri nomi={membri} />
      </div>
    </Link>
  )
}
