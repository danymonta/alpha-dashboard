import { ArrowUpRight, CircleHelp, Equal, RefreshCcw, type LucideIcon } from 'lucide-react'

import { ETICHETTA_VERDETTO, eVerdetto, type Verdetto } from '@/lib/marketing/analisi/parole'
import { cn } from '@/lib/utils'

const ICONA: Record<Verdetto, LucideIcon> = { spingere: ArrowUpRight, mantenere: Equal, cambiare: RefreshCcw }
/** Icon and words, never colour alone; the colours are the status tokens, never gold (section 11). */
const COLORE: Record<Verdetto, string> = {
  spingere: 'text-status-ok',
  mantenere: 'text-foreground',
  cambiare: 'text-status-warning',
}

/**
 * The verdict of the numbers: «Spingere», «Mantenere», «Cambiare» (decided in
 * SQL, analisi_verdetto). Without one (the reel is too young, or Instagram has
 * no numbers) «Troppo presto» or `vuoto`.
 */
export function BadgeVerdetto({
  verdetto,
  vuoto = 'Troppo presto',
  className,
}: {
  verdetto: string | null | undefined
  vuoto?: string
  className?: string
}) {
  if (!eVerdetto(verdetto)) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-sm whitespace-nowrap text-muted-foreground', className)}>
        <CircleHelp className="size-4 shrink-0" aria-hidden="true" />
        {vuoto}
      </span>
    )
  }
  const Icona = ICONA[verdetto]
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-sm font-medium whitespace-nowrap', COLORE[verdetto], className)}
      data-verdetto={verdetto}
    >
      <Icona className="size-4 shrink-0" aria-hidden="true" />
      {ETICHETTA_VERDETTO[verdetto]}
    </span>
  )
}
