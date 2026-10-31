import { Circle, CircleCheck, CircleX, Scissors, Send, Video, type LucideIcon } from 'lucide-react'

import './etichette.css'

import { COLORE_STATUS, ETICHETTA_STATUS, type StatusContenuto } from '@/lib/marketing/etichette'
import { cn } from '@/lib/utils'

/** One icon for each Status, next to its colour and its name: the Status reads without the colour (WCAG 1.4.1). */
export const ICONA_STATUS: Record<StatusContenuto, LucideIcon> = {
  not_started: Circle,
  to_be_recorded: Video,
  to_be_edited: Scissors,
  to_be_posted: Send,
  posted: CircleCheck,
  canceled: CircleX,
}

/**
 * The Status as a tag of the calendar (1.69.0, Dany: «devo avere tutta la
 * panoramica chiara»): Notion's colour, the icon and always the whole name.
 * In a narrow card the name wraps, it is never cut to the colour alone.
 */
export function TagStatus({ stato, className }: { stato: StatusContenuto; className?: string }) {
  const Icona = ICONA_STATUS[stato]
  return (
    <span
      data-colore={COLORE_STATUS[stato]}
      className={cn(
        'pillola inline-flex max-w-full items-start gap-1 rounded-md px-1.5 py-0.5 text-[11px] leading-4 font-medium',
        className,
      )}
    >
      <Icona className="mt-px size-3 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words">{ETICHETTA_STATUS[stato]}</span>
    </span>
  )
}

/** The dot of a Status (the phone's mini month): the colour only, so its day says the Status in words. */
export function PuntoStatus({ stato, className }: { stato: StatusContenuto; className?: string }) {
  return (
    <span
      data-colore={COLORE_STATUS[stato]}
      aria-hidden="true"
      className={cn('pillola pillola-punto inline-block size-1.5 shrink-0 rounded-full', className)}
    />
  )
}
