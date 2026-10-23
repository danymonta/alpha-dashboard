import { Skeleton } from '@/components/ui/skeleton'
import { Scheletro, ScheletroIntestazione } from '@/components/stati/scheletri'
import { getLingua } from '@/lib/i18n/server'
import { MIEI_TASK } from '@/lib/i18n/testi/task'

/** I miei task: groups by due date, each row a 44 px tick, the title and its project. */
export default async function Loading() {
  return (
    <Scheletro etichetta={MIEI_TASK[await getLingua()].caricamento} className="max-w-3xl">
      <ScheletroIntestazione />
      {[2, 3].map((righe, g) => (
        <div key={g} className="space-y-2">
          <Skeleton className="h-3 w-28" />
          <div className="divide-y divide-border rounded-xl bg-card">
            {Array.from({ length: righe }).map((_, i) => (
              <div key={i} className="flex items-start gap-1 py-1 pr-2">
                <span className="flex size-11 shrink-0 items-center justify-center">
                  <Skeleton className="size-5 rounded-sm" />
                </span>
                <div className="min-w-0 flex-1 space-y-2 py-3">
                  <Skeleton className={i % 2 ? 'h-4 w-48' : 'h-4 w-64 max-w-full'} />
                  <Skeleton className="h-3 w-40" />
                </div>
                <Skeleton className="mt-1.5 size-11 rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </Scheletro>
  )
}
