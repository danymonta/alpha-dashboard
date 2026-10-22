import { Mail, MailX, Smartphone } from 'lucide-react'

import type { Lingua } from '@/lib/i18n/lingua'
import { NOTIFICHE } from '@/lib/i18n/testi/notifiche'
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
  lingua = 'it',
}: {
  inviata: boolean
  canale?: CanaleNotifica
  className?: string
  lingua?: Lingua
}) {
  const t = NOTIFICHE[lingua]
  if (canale === 'app') {
    return (
      <span data-testid="solo-app" className={cn('inline-flex items-center gap-1 whitespace-nowrap', className)}>
        <Smartphone className="size-3.5 shrink-0" aria-hidden="true" />
        {t.soloApp}
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
      {inviata ? t.inviata : t.nonInviata}
    </span>
  )
}
