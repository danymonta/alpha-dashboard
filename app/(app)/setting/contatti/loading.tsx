import { SchedeInsight } from '@/components/insight/schede-insight'
import { Skeleton } from '@/components/ui/skeleton'
import { getLingua } from '@/lib/i18n/server'
import { CONTATTI } from '@/lib/i18n/testi/contatti'
import { Scheletro, ScheletroIntestazione, ScheletroNumeri, ScheletroPeriodo, ScheletroTabella } from '@/components/stati/scheletri'

/** Setter › Contatti: the tabs, the header, the period, the tiles, the ratios and the days. */
export default async function Loading() {
  return (
    <Scheletro etichetta={CONTATTI[await getLingua()].caricamento}>
      <SchedeInsight ruolo="admin" attiva="contatti" />
      <ScheletroIntestazione azioni={1} />
      <Skeleton className="h-4 w-64" />
      <ScheletroPeriodo className="-ml-3" />
      <ScheletroNumeri quanti={7} grande />
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
      <ScheletroTabella righe={6} colonne={10} />
    </Scheletro>
  )
}
