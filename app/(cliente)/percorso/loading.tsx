import { Skeleton } from '@/components/ui/skeleton'

/** The shape of the page: the greeting and the estimate, the 7 stages, the panel. */
export default function Loading() {
  return (
    <div className="space-y-6 pt-4 sm:space-y-8 sm:pt-8" aria-busy="true">
      <div className="space-y-3">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-7 w-full max-w-md" />
        <Skeleton className="h-4 w-56" />
      </div>
      <div className="flex justify-between gap-2 overflow-hidden">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="flex w-[5.75rem] shrink-0 flex-col items-center gap-2 sm:w-auto sm:flex-1">
            <Skeleton className="size-11 rounded-full" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      <div className="space-y-5 rounded-[20px] border border-border p-5 sm:p-8">
        <Skeleton className="h-3 w-32" />
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="aspect-video w-full rounded-xl" />
        <Skeleton className="h-12 w-full rounded-lg sm:w-64" />
      </div>
    </div>
  )
}
