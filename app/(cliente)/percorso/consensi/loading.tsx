import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="space-y-6 pt-4 sm:pt-8" aria-busy="true">
      <Skeleton className="h-11 w-44" />
      <Skeleton className="h-9 w-60" />
      <Skeleton className="h-4 w-full max-w-md" />
      <div className="space-y-4 rounded-2xl border border-border p-5">
        <Skeleton className="h-5 w-72" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-11 w-full" />
      </div>
    </div>
  )
}
