import { cookies } from 'next/headers'

import { Skeleton } from '@/components/ui/skeleton'
import { Scheletro, ScheletroIntestazione } from '@/components/stati/scheletri'
import { getLingua } from '@/lib/i18n/server'
import { MIEI_TASK } from '@/lib/i18n/testi/task'
import { COOKIE_VISTA_TASK, vistaTaskIniziale } from '@/lib/miei-task'

/**
 * I miei task: the board's five columns of cards (1.75.0) or, with the list
 * remembered, groups by due date, each row a 44 px tick, the title and its project.
 */
export default async function Loading() {
  const etichetta = MIEI_TASK[await getLingua()].caricamento
  const vista = vistaTaskIniziale(undefined, (await cookies()).get(COOKIE_VISTA_TASK)?.value)

  if (vista === 'bacheca') {
    return (
      <Scheletro etichetta={etichetta}>
        <ScheletroIntestazione />
        <div className="flex gap-3 overflow-hidden">
          {[2, 3, 2, 1, 3].map((carte, c) => (
            <div key={c} className="w-[17.5rem] shrink-0 space-y-2 rounded-xl border border-border bg-muted/30 p-3">
              <Skeleton className="h-4 w-24" />
              {Array.from({ length: carte }).map((_, i) => (
                <div key={i} className="space-y-2 rounded-lg border border-border bg-card p-3">
                  <Skeleton className={i % 2 ? 'h-4 w-32' : 'h-4 w-44'} />
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-36" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </Scheletro>
    )
  }

  return (
    <Scheletro etichetta={etichetta} className="max-w-3xl">
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
