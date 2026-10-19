import { Mail, MailX, Smartphone } from 'lucide-react'

import type { CanaleNotifica } from '@/lib/notifiche/tipi'
import { cn } from '@/lib/utils'

/**
 * "Email inviata" / "Email non partita" for the copy of an email, "Solo
 * nell’app" for an alert that never was one (1.42.0): icon and words, never
 * colour alone.
 */
export function StatoEmail({
  inviata,
  canale = 'email',
  className,
}: {
  inviata: boolean
  canale?: CanaleNotifica
  className?: string
}) {
  if (canale === 'app') {
    return (
      <span data-testid="solo-app" className={cn('inline-flex items-center gap-1 whitespace-nowrap', className)}>
        <Smartphone className="size-3.5 shrink-0" aria-hidden="true" />
        Solo nell’app
      </span>
    )
  }
  const Icona = inviata ? Mail : MailX
  return (
    <span
      data-testid={inviata ? 'email-inviata' : 'email-non-partita'}
      className={cn('inline-flex items-center gap-1 whitespace-nowrap', !inviata && 'text-status-warning', className)}
    >
      <Icona className="size-3.5 shrink-0" aria-hidden="true" />
      {inviata ? 'Email inviata' : 'Email non partita'}
    </span>
  )
}
