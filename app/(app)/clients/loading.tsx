import { Skeleton } from '@/components/ui/skeleton'
import { Scheletro, ScheletroChip, ScheletroIntestazione, ScheletroTabella } from '@/components/stati/scheletri'

/** Clienti: the state chips, the search, then cards on the phone and the table above. */
export default function Loading() {
  return (
    <Scheletro etichetta="Caricamento dei clienti">
      <ScheletroIntestazione />
      <ScheletroChip quanti={7} />
      <Skeleton className="h-11 w-full max-w-md rounded-lg" />
      <ScheletroTabella righe={8} colonne={6} />
    </Scheletro>
  )
}
