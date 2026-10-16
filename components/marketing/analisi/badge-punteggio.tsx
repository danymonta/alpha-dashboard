import { Ban, CircleCheck, CircleHelp, PenLine, RotateCcw, Wrench, type LucideIcon } from 'lucide-react'

import { fasciaDaCodice, type CodiceFascia } from '@/lib/marketing/punteggio/tabelle'
import { cn } from '@/lib/utils'

const ICONA: Record<CodiceFascia, LucideIcon> = {
  pubblicare: CircleCheck,
  pubblicare_dopo_ritocchi: PenLine,
  rifare_le_parti_deboli: Wrench,
  riscrivere: RotateCcw,
  scartare: Ban,
}
/** Icon and words, never colour alone; the status tokens, never gold (CLAUDE.md section 11). */
const COLORE: Record<CodiceFascia, string> = {
  pubblicare: 'text-status-ok',
  pubblicare_dopo_ritocchi: 'text-status-ok',
  rifare_le_parti_deboli: 'text-status-warning',
  riscrivere: 'text-status-warning',
  scartare: 'text-status-critical',
}

/**
 * The score of a reel (1.39.0): «78 · Rifare le parti deboli», the number and the
 * guide's own name of the band, with an icon. Without a score «Non valutato».
 * The numbers were computed by the app from Claude's votes (the page only says
 * them).
 */
export function BadgePunteggio({
  totale,
  fascia,
  vuoto = 'Non valutato',
  className,
}: {
  totale: number | null | undefined
  fascia: string | null | undefined
  vuoto?: string
  className?: string
}) {
  const f = fasciaDaCodice(fascia)
  if (totale === null || totale === undefined || !f) {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-sm whitespace-nowrap text-muted-foreground', className)} data-punteggio="vuoto">
        <CircleHelp className="size-4 shrink-0" aria-hidden="true" />
        {vuoto}
      </span>
    )
  }
  const Icona = ICONA[f.codice]
  return (
    <span
      className={cn('inline-flex items-center gap-1.5 text-sm font-medium whitespace-nowrap', COLORE[f.codice], className)}
      data-punteggio={f.codice}
    >
      <Icona className="size-4 shrink-0" aria-hidden="true" />
      <span className="num">{totale}</span>
      <span>· {f.etichetta}</span>
    </span>
  )
}
