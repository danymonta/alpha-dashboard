import { Skeleton } from '@/components/ui/skeleton'
import { getLingua } from '@/lib/i18n/server'
import { MIE_VENDITE } from '@/lib/i18n/testi/mie-vendite'

export default async function Loading() {
  const t = MIE_VENDITE[await getLingua()]
  return (
    <div className="space-y-5" aria-busy="true">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-11 w-full max-w-md rounded-lg" />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-xl" />
      ))}
      <span className="sr-only">{t.caricamento}</span>
    </div>
  )
}
