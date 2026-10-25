import { Skeleton } from '@/components/ui/skeleton'
import { Scheletro, ScheletroIntestazione } from '@/components/stati/scheletri'
import { getLingua } from '@/lib/i18n/server'
import { CHIAVI } from '@/lib/i18n/testi/chiavi'

/** Chiavi e collegamenti: the header and one card per key. */
export default async function Loading() {
  const t = CHIAVI[await getLingua()]
  return (
    <Scheletro etichetta={t.caricamento} className="max-w-3xl">
      <ScheletroIntestazione />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-44 rounded-xl" />
      ))}
    </Scheletro>
  )
}
