import { Skeleton } from '@/components/ui/skeleton'
import { getLingua } from '@/lib/i18n/server'
import { CLIENTI } from '@/lib/i18n/testi/clienti'
import { Scheletro, ScheletroChip, ScheletroIntestazione, ScheletroTabella } from '@/components/stati/scheletri'

/** Clienti: the state chips, the search, then cards on the phone and the table above. */
export default async function Loading() {
  const t = CLIENTI[await getLingua()]
  return (
    <Scheletro etichetta={t.caricamento}>
      <ScheletroIntestazione />
      <ScheletroChip quanti={4} />
      <Skeleton className="h-11 w-full max-w-md rounded-lg" />
      <ScheletroTabella righe={8} colonne={6} />
    </Scheletro>
  )
}
