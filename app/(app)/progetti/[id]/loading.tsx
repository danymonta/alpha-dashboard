import { Skeleton } from '@/components/ui/skeleton'
import { CaricamentoSr } from '@/components/stati/caricamento-sr'

/** The overview: four tiles and four panels; header and tabs stay from the layout. */
export default function Loading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-5 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
      <CaricamentoSr />
    </div>
  )
}
