import { Skeleton } from '@/components/ui/skeleton'
import { getLingua } from '@/lib/i18n/server'
import { GIORNATA_CLOSER } from '@/lib/i18n/testi/closer'

/** The shape of "Compila la giornata": title, day switcher, the day's row, the calls. */
export default async function Loading() {
  const t = GIORNATA_CLOSER[await getLingua()]
  return (
    <div className="max-w-3xl space-y-5" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-56" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Skeleton className="size-11 rounded-lg" />
        <div className="flex flex-col items-center gap-2">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-11 w-44 rounded-lg" />
        </div>
        <Skeleton className="size-11 rounded-lg" />
      </div>
      <Skeleton className="h-40 rounded-xl md:h-24" />
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <span className="sr-only">{t.caricamento}</span>
    </div>
  )
}
