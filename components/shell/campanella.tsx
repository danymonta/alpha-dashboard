'use client'

import { Bell } from 'lucide-react'
import { usePathname } from 'next/navigation'

import { useLingua } from '@/components/i18n/lingua-provider'
import { LinkNav } from '@/components/shell/link-nav'
import { nomeNotifiche, useNotificheNonLette } from '@/components/shell/notifiche-provider'
import { cn } from '@/lib/utils'

/**
 * The bell top right, next to the timer and Alfire (1.41.0, Dany: "notifiche
 * con pallino rosso dentro all'app… da lì in alto a destra"): the way to the
 * notification center, every role. With notifications to read, a red dot with
 * the count (99+); the dot is not the only sign, the accessible name says it
 * ("Notifiche, 3 da leggere") and the digits are aria-hidden. Nothing at zero.
 */
export function Campanella() {
  const numero = useNotificheNonLette()
  const lingua = useLingua()
  const pathname = usePathname()
  const attiva = pathname === '/notifiche' || pathname.startsWith('/notifiche/')
  return (
    <LinkNav
      href="/notifiche"
      data-testid="campanella"
      aria-label={nomeNotifiche(numero, lingua)}
      aria-current={attiva ? 'page' : undefined}
      className={cn(
        'relative flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
        attiva && 'bg-accent text-foreground',
      )}
    >
      <Bell className="size-5" aria-hidden="true" />
      {numero > 0 ? (
        <span
          aria-hidden="true"
          data-testid="campanella-conteggio"
          className="num absolute top-1 right-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-status-critical px-1 text-[11px] leading-none font-semibold text-background"
        >
          {numero > 99 ? '99+' : numero}
        </span>
      ) : null}
    </LinkNav>
  )
}
