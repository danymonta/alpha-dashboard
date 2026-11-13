import { Skeleton } from '@/components/ui/skeleton'

/** The shape of the tab: the timeline, the team's work, the Aula, the calls. */
export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-28 w-full rounded-2xl" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-48 rounded-2xl" />
        <Skeleton className="h-48 rounded-2xl" />
      </div>
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  )
}
