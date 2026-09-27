import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="max-w-3xl space-y-4" aria-busy="true" aria-live="polite">
      <Skeleton className="h-24 rounded-xl" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-28" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
      <span className="sr-only">Caricamento in corso</span>
    </div>
  )
}
