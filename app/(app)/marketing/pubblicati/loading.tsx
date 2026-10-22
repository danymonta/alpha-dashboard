import { Skeleton } from '@/components/ui/skeleton'

/** The shape of «Post di Instagram»: header, the state line, then the cards of «Da collegare». */
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-96 max-w-full" />
        </div>
        <Skeleton className="h-11 w-52 rounded-lg" />
      </div>
      <Skeleton className="h-4 w-64 max-w-full" />
      <div className="space-y-3">
        <Skeleton className="h-6 w-40" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex gap-3 rounded-xl bg-card p-3">
            <Skeleton className="h-16 w-12 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-11 w-full max-w-md rounded-lg" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Caricamento dei post di Instagram</span>
    </div>
  )
}
