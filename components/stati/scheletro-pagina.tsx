import { Skeleton } from '@/components/ui/skeleton'
import { CaricamentoSr } from '@/components/stati/caricamento-sr'

/** Loading state: the shape of the page, never a full-screen spinner. */
export function ScheletroPagina({ righe = 4 }: { righe?: number }) {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: righe }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
      <CaricamentoSr />
    </div>
  )
}
