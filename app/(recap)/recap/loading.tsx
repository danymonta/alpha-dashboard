import { Scheletro } from '@/components/stati/scheletri'
import { Skeleton } from '@/components/ui/skeleton'
import { getLingua } from '@/lib/i18n/server'
import { RECAP } from '@/lib/i18n/testi/recap'

/** The recap's shape: title and month, the gold tile with four tiles, two tiles, the calendar, the summary. */
export default async function Loading() {
  const t = RECAP[await getLingua()]
  return (
    <Scheletro etichetta={t.caricamento}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <Skeleton className="h-11 w-56" />
      </div>
      <div className="grid gap-3 lg:grid-cols-[1.4fr_2fr]">
        <Skeleton className="h-40 rounded-xl lg:h-auto" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-28 rounded-xl" />
      </div>
      <div className="flex justify-end">
        <Skeleton className="h-11 w-56 rounded-lg" />
      </div>
      <div className="@container rounded-xl bg-card p-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-2 h-3 w-80 max-w-full" />
        {/* the month: a 7-column grid from about 672 px, a list of days below */}
        <div className="mt-4 hidden grid-cols-7 gap-1.5 @2xl:grid">
          {Array.from({ length: 35 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-lg" />
          ))}
        </div>
        <div className="mt-4 space-y-2 @2xl:hidden">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-11 rounded-lg" />
          ))}
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-64 rounded-xl" />
        ))}
      </div>
    </Scheletro>
  )
}
