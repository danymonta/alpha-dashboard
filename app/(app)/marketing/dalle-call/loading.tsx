import { Skeleton } from '@/components/ui/skeleton'
import { Scheletro, ScheletroIntestazione } from '@/components/stati/scheletri'
import { getLingua } from '@/lib/i18n/server'
import { DALLE_CALL } from '@/lib/i18n/testi/dalle-call'

/** «Dalle call»: the header, the period, then one card per objection. */
export default async function Loading() {
  return (
    <Scheletro etichetta={DALLE_CALL[await getLingua()].caricamento}>
      <ScheletroIntestazione />
      <Skeleton className="h-11 w-64 rounded-full" />
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-40 w-full rounded-xl" />
        ))}
      </div>
    </Scheletro>
  )
}
