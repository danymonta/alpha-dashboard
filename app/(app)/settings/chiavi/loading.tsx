import { Skeleton } from '@/components/ui/skeleton'
import { Scheletro, ScheletroIntestazione } from '@/components/stati/scheletri'

/** Chiavi e collegamenti: the header and one card per key. */
export default function Loading() {
  return (
    <Scheletro etichetta="Caricamento delle chiavi" className="max-w-3xl">
      <ScheletroIntestazione />
      {Array.from({ length: 5 }).map((_, i) => (
        <Skeleton key={i} className="h-44 rounded-xl" />
      ))}
    </Scheletro>
  )
}
