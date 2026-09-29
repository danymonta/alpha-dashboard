import { Skeleton } from '@/components/ui/skeleton'

/** The shape of "Tempo del team": period and filters, the total, one card per person. */
export default function Loading() {
  return (
    <div className="max-w-4xl space-y-5" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-2 sm:flex sm:items-end sm:justify-between">
        <Skeleton className="h-11 w-64" />
        <div className="grid gap-2 sm:flex sm:gap-3">
          <Skeleton className="h-11 sm:w-48" />
          <Skeleton className="h-11 sm:w-48" />
        </div>
      </div>
      <Skeleton className="h-28 rounded-xl" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-xl" />
        ))}
      </div>
      <span className="sr-only">Caricamento in corso</span>
    </div>
  )
}
