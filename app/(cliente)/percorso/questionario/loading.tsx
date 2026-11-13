import { Skeleton } from '@/components/ui/skeleton'

/** The shape of the questionnaire: the way back, the progress bar, a big question with its field. */
export default function Loading() {
  return (
    <div className="space-y-6 pt-2" aria-busy="true">
      <Skeleton className="h-4 w-36" />
      <Skeleton className="h-1.5 w-full rounded-full" />
      <div className="max-w-xl space-y-6 py-8 sm:py-14">
        <Skeleton className="h-3 w-40" />
        <div className="space-y-2.5">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
        <Skeleton className="h-14 w-full rounded-xl" />
      </div>
    </div>
  )
}
