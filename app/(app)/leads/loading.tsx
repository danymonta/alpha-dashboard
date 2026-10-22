import { Skeleton } from '@/components/ui/skeleton'
import { getLingua } from '@/lib/i18n/server'
import { PIPELINE } from '@/lib/i18n/testi/pipeline'

export default async function Loading() {
  const t = PIPELINE[await getLingua()]
  return (
    <div className="max-w-3xl space-y-5" aria-busy="true">
      <Skeleton className="h-7 w-32" />
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-24 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-11 rounded-lg" />
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-36 rounded-xl" />
      ))}
      <span className="sr-only">{t.caricamento}</span>
    </div>
  )
}
