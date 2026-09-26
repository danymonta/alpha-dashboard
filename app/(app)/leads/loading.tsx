import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl space-y-5" aria-busy="true">
      <Skeleton className="h-7 w-32" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-11 rounded-lg" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-36 rounded-xl" />
      ))}
      <span className="sr-only">Caricamento della pipeline</span>
    </div>
  )
}
