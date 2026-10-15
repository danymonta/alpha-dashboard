import { Skeleton } from '@/components/ui/skeleton'

/** The shape of «Analisi»: header, the four tiles, the filters, then the rows. */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="space-y-1">
        <Skeleton className="h-11 w-full max-w-md rounded-lg" />
        <Skeleton className="h-11 w-full max-w-lg rounded-lg" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex gap-3 rounded-xl bg-card p-3">
            <Skeleton className="h-16 w-12 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Caricamento dell’analisi dei reel</span>
    </div>
  )
}
