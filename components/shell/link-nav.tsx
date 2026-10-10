'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { ComponentProps } from 'react'

import { unisci, useIntento } from '@/components/shell/intento'

type Props = Omit<ComponentProps<typeof Link>, 'prefetch'>
type OpzioniPrefetch = NonNullable<Parameters<ReturnType<typeof useRouter>['prefetch']>[1]>

/** The navigation fade (components/shell/transizione-pagina.tsx) runs only for these. */
export const TIPI_NAVIGAZIONE = ['nav']

// The whole page, not just its skeleton. Next types `kind` with an enum it does
// not export (PrefetchKind, router-reducer-types.d.ts): FULL is the string 'full'.
const PAGINA_INTERA = { kind: 'full' } as unknown as OpzioniPrefetch

/**
 * Prefetch is a production feature (Next skips it in dev for links in view): the
 * same here, so the dev server and the e2e tests keep today's behaviour.
 */
export const PREFETCH_ATTIVO = process.env.NODE_ENV === 'production'

/**
 * A link of the navigation (sidebar, bottom bar, "Altro", the tabs of an area).
 * Without intent it prefetches as Next does by default (the skeleton of a link in
 * view); with intent (useIntento) the whole page, so the click finds it ready and
 * no skeleton shows (spec 1.33.0 A2: about 370 ms before, under 100 ms after).
 * Never a fixed `prefetch={true}`: Next repeats it for every link in view after
 * each save.
 */
export function LinkNav({
  transitionTypes = TIPI_NAVIGAZIONE,
  onPointerEnter,
  onPointerDown,
  onPointerLeave,
  onFocus,
  onBlur,
  onTouchStart,
  ...props
}: Props) {
  const router = useRouter()
  const gestori = useIntento(() => {
    if (PREFETCH_ATTIVO && typeof props.href === 'string') router.prefetch(props.href, PAGINA_INTERA)
  })
  return (
    <Link
      {...props}
      transitionTypes={transitionTypes}
      onPointerEnter={unisci(onPointerEnter, gestori.onPointerEnter)}
      onPointerDown={unisci(onPointerDown, gestori.onPointerDown)}
      onPointerLeave={unisci(onPointerLeave, gestori.onPointerLeave)}
      onFocus={unisci(onFocus, gestori.onFocus)}
      onBlur={unisci(onBlur, gestori.onBlur)}
      onTouchStart={unisci(onTouchStart, gestori.onTouchStart)}
    />
  )
}
