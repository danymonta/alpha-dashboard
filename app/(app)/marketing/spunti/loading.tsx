import { Skeleton } from '@/components/ui/skeleton'
import { getLingua } from '@/lib/i18n/server'
import { MARKETING } from '@/lib/i18n/testi/marketing'
import { Scheletro, ScheletroIntestazione } from '@/components/stati/scheletri'

/** Spunti: the header with its button, the summary, then the cards of the sections. */
export default async function Loading() {
  return (
    <Scheletro etichetta={MARKETING[await getLingua()].spunti.caricamento}>
      <ScheletroIntestazione azioni={1} />
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 w-full rounded-xl" />
        ))}
      </div>
    </Scheletro>
  )
}
