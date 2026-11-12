import { CaricamentoSr } from '@/components/stati/caricamento-sr'
import { Skeleton } from '@/components/ui/skeleton'

/** The shape of the form: the way back and the title, three selects, two fields, the client area, «Salva». */
export default function Loading() {
  return (
    <div className="max-w-xl space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="space-y-1.5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-11 rounded-lg" />
        </div>
      ))}
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-11 rounded-lg" />
      <CaricamentoSr />
    </div>
  )
}
