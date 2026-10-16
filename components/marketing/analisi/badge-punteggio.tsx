import { Ban, CircleCheck, CircleHelp, PenLine, RotateCcw, Wrench, type LucideIcon } from 'lucide-react'

import { BREVE_FASCIA } from '@/lib/marketing/analisi/cosa-fare'
import { fasciaDaCodice, type CodiceFascia } from '@/lib/marketing/punteggio/tabelle'
import { cn } from '@/lib/utils'

export const ICONA_FASCIA: Record<CodiceFascia, LucideIcon> = {
  pubblicare: CircleCheck,
  pubblicare_dopo_ritocchi: PenLine,
  rifare_le_parti_deboli: Wrench,
  riscrivere: RotateCcw,
  scartare: Ban,
}
/** Icon and words, never colour alone; the status tokens, never gold (CLAUDE.md section 11). */
export const COLORE_FASCIA: Record<CodiceFascia, string> = {
  pubblicare: 'text-status-ok',
  pubblicare_dopo_ritocchi: 'text-status-ok',
  rifare_le_parti_deboli: 'text-status-warning',
  riscrivere: 'text-status-warning',
  scartare: 'text-status-critical',
}

/**
 * The score of a reel where it is shown small (Post di Instagram, the content panel): «82 · Ritoccalo e ripubblicalo»,
 * the number and what to do with the reel, with an icon (1.39.1: the same words as the list and the panel, so the
 * band of the guide never seems to contradict the verdict of the numbers). Without a score «Non valutato».
 * The numbers were computed by the app from Claude's votes (the page only says them).
 */
export function BadgePunteggio({
  totale,
  fascia,
  vuoto = 'Non valutato',
  senzaNumero = false,
  className,
}: {
  totale: number | null | undefined
  fascia: string | null | undefined
  vuoto?: string
  /** only the words: where the number is already said large next to it */
  senzaNumero?: boolean
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
  const Icona = ICONA_FASCIA[f.codice]
  return (
    <span
      className={cn('inline-flex items-start gap-1.5 text-sm font-medium', COLORE_FASCIA[f.codice], className)}
      data-punteggio={f.codice}
    >
      <Icona className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {/* the words may wrap in a narrow cell (390 px): a score that pushes the page sideways is worse than two lines */}
      <span className="min-w-0 wrap-break-word">
        {senzaNumero ? null : <span className="num">{totale} · </span>}
        {BREVE_FASCIA[f.codice]}
      </span>
    </span>
  )
}
