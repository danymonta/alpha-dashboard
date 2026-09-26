import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="mx-auto max-w-xl space-y-5" aria-busy="true">
      <div className="flex flex-col items-center gap-2 py-1">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
      <Skeleton className="h-5 w-56" />
      {[3, 5, 1].map((righe, i) => (
        <div key={i} className="space-y-1">
          <Skeleton className="h-3 w-20" />
          <div className="space-y-px overflow-hidden rounded-xl">
            {Array.from({ length: righe }).map((_, j) => (
              <Skeleton key={j} className="h-14 rounded-none" />
            ))}
          </div>
        </div>
      ))}
      <span className="sr-only">Caricamento del report</span>
    </div>
  )
}
