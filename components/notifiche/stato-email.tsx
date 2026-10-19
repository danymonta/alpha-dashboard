import { Mail, MailX } from 'lucide-react'

import { cn } from '@/lib/utils'

/** "Email inviata" / "Email non partita": icon and words, never colour alone. */
export function StatoEmail({ inviata, className }: { inviata: boolean; className?: string }) {
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
