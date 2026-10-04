import { Skeleton } from '@/components/ui/skeleton'

/** The shape of the client sheet: header and actions, value, Drive folder, contacts, history of the paths. */
export default function Loading() {
  return (
    <div className="max-w-3xl space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <Skeleton className="h-5 w-20" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Skeleton className="h-7 w-48" />
          <div className="flex flex-wrap gap-2">
            <Skeleton className="h-11 w-36 rounded-lg" />
            <Skeleton className="h-11 w-32 rounded-lg" />
            <Skeleton className="h-11 w-24 rounded-lg" />
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-xl bg-card p-4">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-9 w-36" />
        <div className="grid grid-cols-3 gap-3 border-t border-border pt-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10" />
          ))}
        </div>
      </div>

      {/* the Drive folder row */}
      <Skeleton className="h-14 rounded-xl" />

      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-44 rounded-xl" />
      </div>

      <div className="space-y-2">
        <Skeleton className="h-3 w-36" />
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl bg-card p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-28" />
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 w-44" />
              </div>
              <Skeleton className="h-5 w-20" />
            </div>
            <div className="grid grid-cols-3 gap-3 border-t border-border pt-3">
              {Array.from({ length: 3 }).map((_, j) => (
                <Skeleton key={j} className="h-9" />
              ))}
            </div>
            <Skeleton className="h-11 rounded-lg" />
          </div>
        ))}
      </div>
      <span className="sr-only">Caricamento della scheda cliente</span>
    </div>
  )
}
