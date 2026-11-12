import { CaricamentoSr } from '@/components/stati/caricamento-sr'
import { ScheletroIntestazione } from '@/components/stati/scheletri'
import { Skeleton } from '@/components/ui/skeleton'

/** The shape of the list: title and «Nuovo cliente», a group with its rows, the sales without onboarding. */
export default function Loading() {
  return (
    <div className="max-w-3xl space-y-6" aria-busy="true" aria-live="polite">
      <ScheletroIntestazione azioni={1} />
      {[3, 2].map((righe, i) => (
        <div key={i} className="space-y-2">
          <Skeleton className="h-4 w-56 max-w-full" />
          {Array.from({ length: righe }).map((_, j) => (
            <Skeleton key={j} className="h-14 rounded-xl" />
          ))}
        </div>
      ))}
      <CaricamentoSr />
    </div>
  )
}
