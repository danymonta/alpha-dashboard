import { Skeleton } from '@/components/ui/skeleton'

/** Lists with their rows: the header and the tabs stay from the layout. */
export default function Loading() {
  return (
    <div className="max-w-4xl space-y-4" aria-busy="true" aria-live="polite">
      <div className="flex flex-wrap gap-2">
        <Skeleton className="h-11 w-32 rounded-lg" />
        <Skeleton className="h-11 w-48 rounded-lg" />
      </div>
      {Array.from({ length: 2 }).map((_, s) => (
        <div key={s} className="space-y-3 rounded-xl bg-card p-3">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-1.5 w-full max-w-xs" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-lg" />
          ))}
        </div>
      ))}
      <span className="sr-only">Caricamento in corso</span>
    </div>
  )
}
