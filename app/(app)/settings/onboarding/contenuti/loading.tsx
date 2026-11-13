import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="max-w-4xl space-y-6" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-11 w-32" />
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-full max-w-lg" />
      </div>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-border p-4">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ))}
    </div>
  )
}
