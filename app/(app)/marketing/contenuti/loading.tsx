import { getLingua } from '@/lib/i18n/server'
import { MARKETING } from '@/lib/i18n/testi/marketing'
import { Skeleton } from '@/components/ui/skeleton'

/** The shape of the Piano editoriale: header, the row of filters, then the rows. */
export default async function Loading() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-11 w-28 rounded-lg" />
      </div>
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <Skeleton className="col-span-2 h-11 rounded-lg sm:w-64" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-11 rounded-lg sm:w-40" />
        ))}
      </div>
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl md:h-12" />
        ))}
      </div>
      <span className="sr-only">{MARKETING[await getLingua()].piano.caricamento}</span>
    </div>
  )
}
