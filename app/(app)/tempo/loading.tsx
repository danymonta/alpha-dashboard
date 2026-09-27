import { Skeleton } from '@/components/ui/skeleton'

/** The shape of "Il mio tempo": timer and form on the left, the week on the right. */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="space-y-6">
          <Skeleton className="h-52 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-11 w-64" />
          <Skeleton className="h-28 rounded-xl" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      </div>
      <span className="sr-only">Caricamento in corso</span>
    </div>
  )
}
