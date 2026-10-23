import { Skeleton } from '@/components/ui/skeleton'
import { CaricamentoSr } from '@/components/stati/caricamento-sr'

/**
 * Loading state of a project tab (Gantt, Tempo, Note): the project header and
 * the tabs stay on screen, only the tab's content is a skeleton.
 */
export function ScheletroScheda({ variante }: { variante: 'gantt' | 'elenco' }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Skeleton className="h-11 w-56" />
        <Skeleton className="h-11 w-40" />
      </div>
      {variante === 'gantt' ? (
        <Skeleton className="h-80 rounded-xl" />
      ) : (
        <>
          <Skeleton className="h-28 rounded-xl" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </>
      )}
      <CaricamentoSr />
    </div>
  )
}
