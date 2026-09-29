import { Skeleton } from '@/components/ui/skeleton'

// Same shape as the form: Messaggi (4 counters), Call (4 counters), then the
// content switch. A counter row is the stepper plus its one-line hint.
const GRUPPI = [
  { righe: 4, altezza: 'h-20' },
  { righe: 4, altezza: 'h-20' },
  { righe: 1, altezza: 'h-14' },
]

export default function Loading() {
  return (
    <div className="max-w-xl space-y-5" aria-busy="true">
      <div className="flex flex-col items-center gap-2 py-1">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="h-5 w-56" />
      {GRUPPI.map(({ righe, altezza }, i) => (
        <div key={i} className="space-y-1">
          <Skeleton className="h-3 w-20" />
          <div className="space-y-px overflow-hidden rounded-xl">
            {Array.from({ length: righe }).map((_, j) => (
              <Skeleton key={j} className={`${altezza} rounded-none`} />
            ))}
          </div>
        </div>
      ))}
      <span className="sr-only">Caricamento del report</span>
    </div>
  )
}
