import { Skeleton } from '@/components/ui/skeleton'

/** The shape of the timeline while its lists and tasks arrive: controls, legend, rows of bars. */
export function ScheletroTimeline() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-12 w-44 rounded-lg" />
        <Skeleton className="h-12 w-48 rounded-lg" />
      </div>
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="flex overflow-hidden rounded-xl border border-border bg-card">
        <div className="w-36 shrink-0 space-y-3 border-r border-border p-3 sm:w-64">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </div>
        <div className="min-w-0 flex-1 space-y-3 p-3">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-3.5 rounded-[4px]" style={{ marginLeft: `${(i * 37) % 60}%`, width: `${30 + ((i * 23) % 40)}%`, marginTop: 18 }} />
          ))}
        </div>
      </div>
      <span className="sr-only">Caricamento della timeline</span>
    </div>
  )
}
