import { Skeleton } from '@/components/ui/skeleton'

/** The shape of the questionnaire: the title, the four parts, a screen with its questions. */
export default function Loading() {
  return (
    <div className="space-y-5 pt-4 sm:space-y-6 sm:pt-8" aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-56" />
        <Skeleton className="h-4 w-full max-w-md" />
      </div>
      <div className="grid grid-cols-4 gap-2">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2 py-1.5">
            <Skeleton className="h-1.5 w-full rounded-full" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
      <div className="space-y-8 rounded-[20px] border border-border p-5 sm:p-8">
        <div className="space-y-2">
          <Skeleton className="h-3 w-12" />
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-64" />
        </div>
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        ))}
        <Skeleton className="ml-auto h-12 w-full rounded-xl sm:w-48" />
      </div>
    </div>
  )
}
