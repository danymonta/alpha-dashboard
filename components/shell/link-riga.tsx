'use client'

import { LoaderCircle } from 'lucide-react'
import Link, { useLinkStatus } from 'next/link'
import { useRouter } from 'next/navigation'
import type { ComponentProps, ReactNode } from 'react'

import { unisci, useIntento } from '@/components/shell/intento'
import { PREFETCH_ATTIVO, TIPI_NAVIGAZIONE } from '@/components/shell/link-nav'
import { cn } from '@/lib/utils'

type Props = Omit<ComponentProps<typeof Link>, 'prefetch'>

/**
 * A repeated row of a list towards a dynamic page (a client, a sale, a project).
 * No automatic prefetch: a long list in view made 27-49 requests on every load
 * and after every save, each one a call to Supabase Auth in the proxy. With
 * intent (useIntento) only the skeleton, which is light (spec 1.33.0 A3). Put an
 * IndicatoreLink inside, where the row has room, for a click without intent.
 */
export function LinkRiga({
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
    // the default prefetch of a dynamic page: down to its loading.tsx
    if (PREFETCH_ATTIVO && typeof props.href === 'string') router.prefetch(props.href)
  })
  return (
    <Link
      {...props}
      prefetch={false}
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

/**
 * Inside a Link: a 16 px spinner while the page it opens is on its way, shown
 * only after 120 ms (CSS animation-delay, which the reduced-motion rule leaves
 * alone) so a quick opening never flashes. Fixed size (16 px, or the size in
 * `className`, e.g. size-5 for a chevron): nothing moves. With `riposo` (the
 * link's own icon) the same box shows that icon at rest.
 */
export function IndicatoreLink({ riposo, className }: { riposo?: ReactNode; className?: string }) {
  const { pending } = useLinkStatus()
  return (
    <span aria-hidden="true" className={cn('relative inline-flex size-4 shrink-0 items-center justify-center', className)}>
      {riposo ? <span className={cn('inline-flex', pending && 'indicatore-link-riposo')}>{riposo}</span> : null}
      {pending ? (
        <span className="indicatore-link absolute inset-0 inline-flex items-center justify-center">
          <LoaderCircle className="size-4 animate-spin text-muted-foreground" />
        </span>
      ) : null}
    </span>
  )
}
