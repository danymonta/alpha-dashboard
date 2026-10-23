import { Skeleton } from '@/components/ui/skeleton'
import { getLingua } from '@/lib/i18n/server'
import { SHELL } from '@/lib/i18n/testi/shell'

/** Loading: the shape of the list, never a full-screen spinner. */
export default async function Loading() {
  const t = SHELL[await getLingua()]
  return (
    <div className="max-w-3xl space-y-5" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <Skeleton className="h-7 w-40" />
        <Skeleton className="h-4 w-80 max-w-full" />
      </div>
      <div className="space-y-px overflow-hidden rounded-xl">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-none" />
        ))}
      </div>
      <span className="sr-only">{t.caricamentoInCorso}</span>
    </div>
  )
}
