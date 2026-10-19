'use client'

import { Bell, ChevronRight } from 'lucide-react'

import { LinkNav } from '@/components/shell/link-nav'
import { useNotificheNonLette } from '@/components/shell/notifiche-provider'

/**
 * Profile › Account (1.41.0): the way to the notification center from the
 * account too, with how many are still to read (the same count as the bell).
 */
export function LinkNotifiche() {
  const numero = useNotificheNonLette()
  return (
    <LinkNav
      href="/notifiche"
      data-testid="link-notifiche-account"
      className="flex min-h-11 items-center gap-3 rounded-xl bg-card px-4 py-3 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <Bell className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium">Notifiche</span>
        <span className="block text-sm text-muted-foreground">
          {numero > 0 ? `${numero} da leggere` : 'Le email dell’app salvate qui: nessuna da leggere.'}
        </span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
    </LinkNav>
  )
}
