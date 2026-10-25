import {
  CalendarDays,
  ChevronsDown,
  ChevronsUp,
  Circle,
  CircleCheck,
  CircleDashed,
  Equal,
  Eye,
  ListTree,
  type LucideIcon,
} from 'lucide-react'

import type { Persona, TaskVista } from '@/components/pm/attivita/contesto'
import { InRitardo, InizialiMembri } from '@/components/pm/stato-progetto'
import { formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { ATTIVITA } from '@/lib/i18n/testi/attivita'
import { elencoNomiIn } from '@/lib/i18n/testi/task'
import { formatStima, nomiAssegnatari, type Priorita, type StatoTask } from '@/lib/progetti'
import { cn } from '@/lib/utils'

const ICONA_STATO: Record<StatoTask, LucideIcon> = {
  da_fare: Circle,
  in_corso: CircleDashed,
  in_revisione: Eye,
  completato: CircleCheck,
}

const ICONA_PRIORITA: Record<Priorita, LucideIcon> = {
  alta: ChevronsUp,
  media: Equal,
  bassa: ChevronsDown,
}

export function StatoTaskBadge({ stato, lingua = 'it' }: { stato: StatoTask; lingua?: Lingua }) {
  const Icona = ICONA_STATO[stato]
  return (
    <span className="inline-flex items-center gap-1">
      <Icona className={cn('size-3.5', stato === 'completato' && 'text-status-ok')} aria-hidden="true" />
      {ATTIVITA[lingua].statiTask[stato]}
    </span>
  )
}

export function PrioritaBadge({ priorita, lingua = 'it' }: { priorita: Priorita; lingua?: Lingua }) {
  const t = ATTIVITA[lingua]
  const Icona = ICONA_PRIORITA[priorita]
  return (
    <span className={cn('inline-flex items-center gap-1', priorita === 'alta' && 'font-medium text-foreground')}>
      <Icona className="size-3.5" aria-hidden="true" />
      <span className="sr-only">{t.prioritaSr}</span>
      {t.priorita[priorita]}
    </span>
  )
}

/**
 * Status, priority, assignees, due date, sub-tasks and estimate of one task.
 * Only what tells something: no state once completed (the checkbox says it),
 * no priority when it is the usual "Media", the assignees' names from 640px
 * (initials below, the names stay for screen readers).
 */
export function MetaTask({ task, membri, lingua = 'it' }: { task: TaskVista; membri: readonly Persona[]; lingua?: Lingua }) {
  const t = ATTIVITA[lingua]
  const { formatData } = formato(lingua)
  const assegnati = nomiAssegnatari(task.assegnatari, new Map(membri.map((m) => [m.id, m.nome])))
  const completato = task.stato === 'completato'
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      {completato ? null : <StatoTaskBadge stato={task.stato} lingua={lingua} />}
      {task.priorita === 'media' ? null : <PrioritaBadge priorita={task.priorita} lingua={lingua} />}
      {assegnati.length > 0 ? (
        <span className="inline-flex min-w-0 items-center gap-1.5" data-testid="assegnatari-task">
          <InizialiMembri nomi={assegnati} etichetta={t.assegnatoA} massimo={3} piccole />
          <span aria-hidden="true" className="hidden sm:inline">
            {elencoNomiIn(assegnati, lingua)}
          </span>
        </span>
      ) : (
        <span>{t.senzaAssegnatario}</span>
      )}
      {task.scadenza ? (
        task.in_ritardo ? (
          <InRitardo testo={t.inRitardoScadenza(formatData(task.scadenza))} className="num" />
        ) : (
          <span className={cn('num inline-flex items-center gap-1', completato && 'line-through')}>
            <CalendarDays className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{t.scadenzaSr}</span>
            {formatData(task.scadenza)}
          </span>
        )
      ) : null}
      {task.sotto_task_totali > 0 ? (
        <span className="num inline-flex items-center gap-1">
          <ListTree className="size-3.5" aria-hidden="true" />
          {t.sottoTaskConto(task.sotto_task_completati, task.sotto_task_totali)}
        </span>
      ) : null}
      {task.stima_minuti ? <span className="num">{t.stima(formatStima(task.stima_minuti))}</span> : null}
    </p>
  )
}
