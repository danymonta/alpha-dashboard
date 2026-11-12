import { CaricamentoSr } from '@/components/stati/caricamento-sr'
import { Skeleton } from '@/components/ui/skeleton'

/** The shape of the wizard: the way back, the title, the three steps, the first screen and its action. */
export default function Loading() {
  return (
    <div className="max-w-xl space-y-6" aria-busy="true" aria-live="polite">
      <Skeleton className="h-5 w-28" />
      <div className="space-y-2">
        <Skeleton className="h-7 w-44" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-[5.5rem] rounded-2xl" />
      <div className="space-y-4">
        <Skeleton className="h-6 w-28" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-11 rounded-lg" />
          <Skeleton className="h-11 rounded-lg" />
        </div>
        <Skeleton className="h-11 rounded-lg" />
        <div className="grid grid-cols-2 gap-2">
          <Skeleton className="h-11 rounded-lg" />
          <Skeleton className="h-11 rounded-lg" />
        </div>
        <Skeleton className="h-11 rounded-lg" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-11 w-32 rounded-lg" />
      </div>
      <CaricamentoSr />
    </div>
  )
}
