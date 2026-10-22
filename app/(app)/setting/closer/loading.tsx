import { Skeleton } from '@/components/ui/skeleton'
import { getLingua } from '@/lib/i18n/server'
import { CLOSER } from '@/lib/i18n/testi/closer'
import {
  Scheletro,
  ScheletroIntestazione,
  ScheletroNumeri,
  ScheletroPeriodo,
  ScheletroTabella,
} from '@/components/stati/scheletri'

/** Closer: the header, the period with the closer filter, the numbers, the day by day table. */
export default async function Loading() {
  return (
    <Scheletro etichetta={CLOSER[await getLingua()].caricamento}>
      <ScheletroIntestazione azioni={1} />
      <div className="flex flex-wrap items-center gap-3">
        <ScheletroPeriodo className="-ml-3" />
        <Skeleton className="h-11 w-48 rounded-lg" />
      </div>
      <ScheletroNumeri colonne={4} quanti={8} />
      <ScheletroTabella righe={7} colonne={9} />
    </Scheletro>
  )
}
