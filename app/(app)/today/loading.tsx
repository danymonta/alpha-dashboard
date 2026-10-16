import { SchedeInsight } from '@/components/insight/schede-insight'
import { Skeleton } from '@/components/ui/skeleton'

// Same shape as the form: Messaggi (3 counters), Conversazioni (1 counter and,
// under it, "Com'è andata la giornata": the two scales and the texts), Call
// (2 counters), then the content switch. A counter row is the stepper plus its hint.
const GRUPPI = [
  { righe: 3, altezza: 'h-20' },
  { righe: 1, altezza: 'h-20', commento: true },
  { righe: 2, altezza: 'h-20' },
  { righe: 1, altezza: 'h-14' },
]

export default function Loading() {
  return (
    <div className="max-w-xl space-y-5" aria-busy="true">
      <SchedeInsight ruolo="setter" attiva="principale" />
      <div className="flex flex-col items-center gap-2 py-1">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="h-5 w-56" />
      {GRUPPI.map(({ righe, altezza, commento }, i) => (
        <div key={i} className="space-y-1">
          <Skeleton className="h-3 w-20" />
          <div className="space-y-px overflow-hidden rounded-xl">
            {Array.from({ length: righe }).map((_, j) => (
              <Skeleton key={j} className={`${altezza} rounded-none`} />
            ))}
          </div>
          {/* heights measured on the real section (390 px, then md), so changing day does not jump */}
          {commento ? (
            <div className="space-y-2 pt-5">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-12 md:h-8" />
              <Skeleton className="h-[510px] rounded-xl md:h-[410px]" />
              <Skeleton className="h-[390px] rounded-xl md:h-[318px]" />
            </div>
          ) : null}
        </div>
      ))}
      <span className="sr-only">Caricamento del report</span>
    </div>
  )
}
