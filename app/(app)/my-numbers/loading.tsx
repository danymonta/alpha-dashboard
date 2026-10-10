import { Skeleton } from '@/components/ui/skeleton'
import { Scheletro, ScheletroIntestazione, ScheletroNumeri, ScheletroPeriodo } from '@/components/stati/scheletri'

/** I miei numeri: the period, the commissions in large, then the setting and call blocks. */
export default function Loading() {
  return (
    <Scheletro etichetta="Caricamento dei tuoi numeri" className="max-w-2xl">
      <ScheletroIntestazione />
      <ScheletroPeriodo className="-ml-3" />
      <div className="space-y-3 rounded-xl bg-card p-4">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-12 w-40" />
        <Skeleton className="h-4 w-56" />
      </div>
      <ScheletroNumeri quanti={6} />
      <ScheletroNumeri quanti={6} />
    </Scheletro>
  )
}
