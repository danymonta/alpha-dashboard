import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="max-w-xl space-y-6" aria-busy="true">
      <Skeleton className="h-7 w-44" />
      <Skeleton className="h-32 rounded-xl" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-11 rounded-lg" />
        <Skeleton className="h-11 rounded-lg" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-11 rounded-lg" />
      <Skeleton className="h-11 rounded-lg" />
      <span className="sr-only">Caricamento del modulo di vendita</span>
    </div>
  )
}
