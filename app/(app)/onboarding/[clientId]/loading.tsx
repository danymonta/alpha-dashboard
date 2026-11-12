import { CaricamentoSr } from '@/components/stati/caricamento-sr'
import { Skeleton } from '@/components/ui/skeleton'

/** The shape of the card: the way back, the title, the state, then the two columns of boxes. */
export default function Loading() {
  return (
    <div className="max-w-5xl space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-7 w-64 max-w-full" />
        <Skeleton className="h-4 w-40" />
      </div>
      <Skeleton className="h-20 rounded-xl" />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-4">
          <Skeleton className="h-56 rounded-xl" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
        <div className="space-y-4">
          <Skeleton className="h-44 rounded-xl" />
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-44 rounded-xl" />
        </div>
      </div>
      <CaricamentoSr />
    </div>
  )
}
