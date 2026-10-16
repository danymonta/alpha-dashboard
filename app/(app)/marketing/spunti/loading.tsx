import { Skeleton } from '@/components/ui/skeleton'
import { Scheletro, ScheletroIntestazione } from '@/components/stati/scheletri'

/** Spunti: the header with its button, the summary, then the cards of the sections. */
export default function Loading() {
  return (
    <Scheletro etichetta="Caricamento degli spunti">
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
