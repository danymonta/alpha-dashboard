import { Skeleton } from '@/components/ui/skeleton'

/** The shape of the projects page: filters, then departments of cards. */
export default function Loading() {
  return (
    <div className="max-w-6xl space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-11 w-48 rounded-lg" />
        <Skeleton className="h-11 w-48 rounded-lg" />
      </div>
      {Array.from({ length: 2 }).map((_, s) => (
        <div key={s} className="space-y-3">
          <Skeleton className="h-6 w-44" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-xl" />
            ))}
          </div>
        </div>
      ))}
      <span className="sr-only">Caricamento in corso</span>
    </div>
  )
}
