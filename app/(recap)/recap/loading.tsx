import { Scheletro, ScheletroPeriodo } from '@/components/stati/scheletri'
import { Skeleton } from '@/components/ui/skeleton'
import { getLingua } from '@/lib/i18n/server'
import { RECAP } from '@/lib/i18n/testi/recap'

/** The recap's shape: title and period, the gold tile with four tiles, two tiles, four cards. */
export default async function Loading() {
  const t = RECAP[await getLingua()]
  return (
    <Scheletro etichetta={t.caricamento}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-72 max-w-full" />
        </div>
        <ScheletroPeriodo />
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
      <div className="grid gap-3 lg:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-80 rounded-xl" />
        ))}
      </div>
    </Scheletro>
  )
}
