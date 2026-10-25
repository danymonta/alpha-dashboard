import { Skeleton } from '@/components/ui/skeleton'
import { getLingua } from '@/lib/i18n/server'
import { NUOVA_VENDITA } from '@/lib/i18n/testi/nuova-vendita'

export default async function Loading() {
  const t = NUOVA_VENDITA[await getLingua()]
  return (
    <div className="max-w-xl space-y-6" aria-busy="true">
      <Skeleton className="h-7 w-44" />
      <Skeleton className="h-32 rounded-xl" />
      <div className="grid grid-cols-2 gap-2">
        <Skeleton className="h-11 rounded-lg" />
        <Skeleton className="h-11 rounded-lg" />
      </div>
      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 rounded-lg" />
        ))}
      </div>
      <Skeleton className="h-11 rounded-lg" />
      <Skeleton className="h-11 rounded-lg" />
      <span className="sr-only">{t.caricamento}</span>
    </div>
  )
}
