import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="mx-auto max-w-2xl space-y-6" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      {[2, 3].map((n, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-3 w-24" />
          {Array.from({ length: n }).map((_, j) => (
            <Skeleton key={j} className="h-28 rounded-xl" />
          ))}
        </div>
      ))}
      <span className="sr-only">Caricamento delle call</span>
    </div>
  )
}
