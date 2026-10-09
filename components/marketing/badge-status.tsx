import {
  CalendarClock,
  Circle,
  CircleCheck,
  CircleX,
  Scissors,
  Video,
  type LucideIcon,
} from 'lucide-react'

import { ETICHETTA_STATUS, type StatusContenuto } from '@/lib/marketing/etichette'
import { cn } from '@/lib/utils'

/** One icon per Status, so the Status never reads by colour alone (section 11). */
export const ICONA_STATUS: Record<StatusContenuto, LucideIcon> = {
  not_started: Circle,
  to_be_recorded: Video,
  to_be_edited: Scissors,
  to_be_posted: CalendarClock,
  posted: CircleCheck,
  canceled: CircleX,
}

/** Posted is the only coloured one; Canceled is muted (and its content's Name struck through, classeNome). */
export function classeStatus(stato: StatusContenuto): string {
  if (stato === 'posted') return 'text-status-ok'
  if (stato === 'canceled') return 'text-muted-foreground'
  return 'text-foreground'
}

/** The Name of a content in a list: a Canceled one reads struck through and muted. */
export function classeNome(stato: StatusContenuto): string {
  return stato === 'canceled' ? 'text-muted-foreground line-through' : ''
}

/** The Status of a content as Notion names it, with its icon. */
export function BadgeStatus({
  stato,
  className,
  soloIcona = false,
}: {
  stato: StatusContenuto
  className?: string
  /** The calendar cell: the icon only, the name says the rest (aria-label on the link). */
  soloIcona?: boolean
}) {
  const Icona = ICONA_STATUS[stato]
  if (soloIcona) {
    return <Icona className={cn('size-3.5 shrink-0', classeStatus(stato), className)} aria-hidden="true" />
  }
  return (
    // the labels are short (at most "To be recorded"): never cut
    <span className={cn('inline-flex items-center gap-1.5 text-sm whitespace-nowrap', classeStatus(stato), className)}>
      <Icona className="size-4 shrink-0" aria-hidden="true" />
      <span>{ETICHETTA_STATUS[stato]}</span>
    </span>
  )
}
