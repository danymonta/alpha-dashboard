import { Skeleton } from '@/components/ui/skeleton'

/** The shape of the content calendar: header, view switch, filters, then the rows. */
export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-11 w-44 rounded-lg" />
      </div>
      <Skeleton className="h-11 w-60 rounded-lg" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-24 rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-11 rounded-lg sm:w-44" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl md:h-12" />
        ))}
      </div>
      <span className="sr-only">Caricamento dei contenuti</span>
    </div>
  )
}
