import { Scheletro } from '@/components/stati/scheletri'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * The Insight while it loads, with the page's shape (1.33.0, spec A8): the
 * header with the day and «Aggiorna dati», the three tabs, the verdict, the
 * five numbers (two columns on a phone, the fifth across) and three cards.
 */
export function ScheletroInsight() {
  return (
    <Scheletro etichetta="Caricamento in corso" className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div className="space-y-2">
          <Skeleton className="h-3 w-52" />
          <Skeleton className="h-7 w-60 max-w-full" />
          <Skeleton className="h-4 w-56 max-w-full" />
        </div>
        <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
          <Skeleton className="h-11 w-full rounded-lg sm:w-60" />
          <Skeleton className="h-11 w-full rounded-lg sm:w-36" />
        </div>
      </div>
      <div className="flex gap-2">
        <Skeleton className="h-11 w-28 rounded-lg" />
        <Skeleton className="h-11 w-28 rounded-lg" />
        <Skeleton className="h-11 w-24 rounded-lg" />
      </div>
      <Skeleton className="h-24 rounded-xl" />
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className={i === 4 ? 'col-span-2 h-20 rounded-none sm:col-span-1' : 'h-20 rounded-none'} />
        ))}
      </div>
      <div className="space-y-3">
        <Skeleton className="h-5 w-40" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-48 rounded-xl" />
        ))}
      </div>
    </Scheletro>
  )
}
