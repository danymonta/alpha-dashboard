import { cookies } from 'next/headers'

import { Skeleton } from '@/components/ui/skeleton'
import { getLingua } from '@/lib/i18n/server'
import { CALENDARIO_CONTENUTI } from '@/lib/i18n/testi/calendario-contenuti'
import { MARKETING } from '@/lib/i18n/testi/marketing'
import { COOKIE_VISTA_CONTENUTI, vistaIniziale } from '@/lib/marketing/vista'

/** Header, tabs, «Tabella | Calendario» and the row of filters: the same in both views. */
function Testata() {
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-2">
          <Skeleton className="h-7 w-44" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="h-11 w-28 rounded-lg" />
      </div>
      <Skeleton className="h-11 w-48 rounded-lg" />
      <Skeleton className="h-11 w-56 rounded-lg" />
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <Skeleton className="col-span-2 h-11 rounded-lg sm:w-64" />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-11 rounded-lg sm:w-40" />
        ))}
      </div>
    </>
  )
}

/**
 * The shape of the Piano editoriale while it loads: the view this device chose
 * last (the cookie the tap on «Tabella | Calendario» writes before it leaves),
 * so the table does not jump to a calendar or back.
 */
export default async function Loading() {
  const lingua = await getLingua()
  const vista = vistaIniziale(null, (await cookies()).get(COOKIE_VISTA_CONTENUTI)?.value)

  if (vista === 'calendario') {
    return (
      <div className="space-y-4" aria-busy="true" aria-live="polite">
        <Testata />
        <div className="@container space-y-4">
          <div className="flex items-center justify-between">
            <Skeleton className="h-7 w-40" />
            <Skeleton className="h-11 w-40 rounded-lg" />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-28 rounded-lg" />
            ))}
          </div>
          {/* the month grid from 672px of section, the mini month below */}
          <div className="hidden grid-cols-7 gap-px overflow-hidden rounded-xl border border-border @2xl:grid">
            {Array.from({ length: 35 }).map((_, i) => (
              <Skeleton key={i} className="h-36 rounded-none" />
            ))}
          </div>
          <div className="space-y-4 @2xl:hidden">
            <div className="mx-auto grid w-fit grid-cols-7 gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <Skeleton key={i} className="size-10 rounded-lg" />
              ))}
            </div>
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 rounded-xl" />
            ))}
          </div>
        </div>
        <span className="sr-only">{CALENDARIO_CONTENUTI[lingua].caricamento}</span>
      </div>
    )
  }

  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <Testata />
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl md:h-12" />
        ))}
      </div>
      <span className="sr-only">{MARKETING[lingua].piano.caricamento}</span>
    </div>
  )
}
