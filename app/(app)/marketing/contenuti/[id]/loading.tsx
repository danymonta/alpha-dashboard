import { Skeleton } from '@/components/ui/skeleton'

/** The shape of a content's page: header, Status, properties, the template's sections. */
export default function Loading() {
  return (
    <div className="max-w-3xl space-y-5" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <Skeleton className="h-5 w-24" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Skeleton className="h-7 w-72 max-w-full" />
          <Skeleton className="h-11 w-28 rounded-lg" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Skeleton className="h-11 w-40 rounded-lg" />
        <Skeleton className="h-4 w-24" />
      </div>
      <div className="grid gap-3 rounded-xl bg-card p-4 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-5" />
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-12 rounded-xl" />
        <Skeleton className="h-12 rounded-xl" />
      </div>
      <span className="sr-only">Caricamento del contenuto</span>
    </div>
  )
}
