import { Archive, CircleCheck, CircleDot, CirclePause, TriangleAlert, type LucideIcon } from 'lucide-react'

import { iniziali, ETICHETTA_STATO_PROGETTO, type StatoProgetto } from '@/lib/progetti'
import { cn } from '@/lib/utils'

const ICONA: Record<StatoProgetto, LucideIcon> = {
  attivo: CircleDot,
  in_pausa: CirclePause,
  completato: CircleCheck,
  archiviato: Archive,
}

/** Project state: icon plus words, never colour alone. */
export function StatoProgettoBadge({ stato, className }: { stato: StatoProgetto; className?: string }) {
  const Icona = ICONA[stato]
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground', className)}>
      <Icona className={cn('size-3.5', stato === 'completato' && 'text-status-ok')} aria-hidden="true" />
      {ETICHETTA_STATO_PROGETTO[stato]}
    </span>
  )
}

/**
 * Progress of a project or a list: the ratio comes from SQL, this only draws
 * it. With `inRitardo` the late tasks follow on the same line ("3 in ritardo").
 */
export function BarraAvanzamento({
  completati,
  totali,
  avanzamento,
  inRitardo = 0,
  className,
}: {
  completati: number
  totali: number
  avanzamento: number | null
  inRitardo?: number
  className?: string
}) {
  const percento = avanzamento === null ? 0 : Math.round(avanzamento * 100)
  return (
    <div className={cn('space-y-1', className)}>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
        <div className="h-full rounded-full bg-primary-light" style={{ width: `${percento}%` }} />
      </div>
      <p className="num flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
        <span>{totali === 0 ? 'Nessun task' : `${completati} di ${totali} task · ${percento}%`}</span>
        {inRitardo > 0 ? <InRitardo testo={`${inRitardo} in ritardo`} /> : null}
      </p>
    </div>
  )
}

/** Past due, open: icon and words (status colours never stand alone). */
export function InRitardo({ testo = 'In ritardo', className }: { testo?: string; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 text-status-warning', className)}>
      <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
      {testo}
    </span>
  )
}

/**
 * People as initials (the members of a project, the assignees of a task); the
 * full names are there for screen readers and on hover. "piccole" fits a line
 * of small text, like the details under a task.
 */
export function InizialiMembri({
  nomi,
  massimo = 4,
  etichetta = 'Membri',
  piccole = false,
}: {
  nomi: string[]
  massimo?: number
  etichetta?: string
  piccole?: boolean
}) {
  if (nomi.length === 0) return null
  const visibili = nomi.slice(0, massimo)
  const altri = nomi.length - visibili.length
  return (
    // small circles sit side by side: overlapping, the next ring would cut the
    // last letter of two initials ("MC" read "M(")
    <span className={cn('flex items-center', !piccole && '-space-x-1.5')}>
      <span className="sr-only">
        {etichetta}: {nomi.join(', ')}
      </span>
      {visibili.map((nome, i) => (
        <span
          key={`${nome}-${i}`}
          title={nome}
          aria-hidden="true"
          // the ring cuts each circle out of the card, also when the card lights up on hover
          className={cn(
            'inline-flex items-center justify-center rounded-full bg-secondary font-medium text-secondary-foreground ring-2 ring-card group-hover/card:ring-accent',
            piccole ? 'size-5 text-[10px]' : 'size-7 text-[11px]',
          )}
        >
          {iniziali(nome)}
        </span>
      ))}
      {altri > 0 ? (
        <span
          aria-hidden="true"
          className={cn('num text-xs text-muted-foreground', piccole ? 'pl-1' : 'pl-2.5')}
        >
          +{altri}
        </span>
      ) : null}
    </span>
  )
}
