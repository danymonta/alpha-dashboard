import { Skeleton } from '@/components/ui/skeleton'
import {
  Scheletro,
  ScheletroIntestazione,
  ScheletroNumeri,
  ScheletroPeriodo,
  ScheletroRighe,
} from '@/components/stati/scheletri'

/** Setter: the header with its actions, the period, one card per setter, the daily reports. */
export default function Loading() {
  return (
    <Scheletro etichetta="Caricamento del setting">
      <ScheletroIntestazione azioni={2} />
      <ScheletroPeriodo className="-ml-3" />
      <div className="grid gap-3 md:grid-cols-2">
        <ScheletroNumeri quanti={6} grande />
        <ScheletroNumeri quanti={6} grande />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-3 w-36" />
        <ScheletroRighe quante={5} />
      </div>
    </Scheletro>
  )
}
