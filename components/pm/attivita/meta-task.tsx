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
import { InRitardo } from '@/components/pm/stato-progetto'
import { formatData } from '@/lib/format'
import {
  ETICHETTA_PRIORITA,
  ETICHETTA_STATO_TASK,
  formatStima,
  iniziali,
  type Priorita,
  type StatoTask,
} from '@/lib/progetti'
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

export function StatoTaskBadge({ stato }: { stato: StatoTask }) {
  const Icona = ICONA_STATO[stato]
  return (
    <span className="inline-flex items-center gap-1">
      <Icona className={cn('size-3.5', stato === 'completato' && 'text-status-ok')} aria-hidden="true" />
      {ETICHETTA_STATO_TASK[stato]}
    </span>
  )
}

export function PrioritaBadge({ priorita }: { priorita: Priorita }) {
  const Icona = ICONA_PRIORITA[priorita]
  return (
    <span className={cn('inline-flex items-center gap-1', priorita === 'alta' && 'font-medium text-foreground')}>
      <Icona className="size-3.5" aria-hidden="true" />
      <span className="sr-only">Priorità </span>
      {ETICHETTA_PRIORITA[priorita]}
    </span>
  )
}

/** Status, priority, assignee, due date, sub-tasks and estimate of one task. */
export function MetaTask({ task, membri }: { task: TaskVista; membri: readonly Persona[] }) {
  const assegnatario = membri.find((m) => m.id === task.assegnatario_id)
  const completato = task.stato === 'completato'
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
      <StatoTaskBadge stato={task.stato} />
      <PrioritaBadge priorita={task.priorita} />
      {assegnatario ? (
        <span className="inline-flex items-center gap-1">
          <span
            aria-hidden="true"
            className="inline-flex size-5 items-center justify-center rounded-full bg-secondary text-[10px] font-medium text-secondary-foreground"
          >
            {iniziali(assegnatario.nome)}
          </span>
          {assegnatario.nome}
        </span>
      ) : (
        <span>Non assegnato</span>
      )}
      {task.scadenza ? (
        task.in_ritardo ? (
          <InRitardo testo={`In ritardo, scadenza ${formatData(task.scadenza)}`} className="num" />
        ) : (
          <span className={cn('num inline-flex items-center gap-1', completato && 'line-through')}>
            <CalendarDays className="size-3.5" aria-hidden="true" />
            <span className="sr-only">Scadenza </span>
            {formatData(task.scadenza)}
          </span>
        )
      ) : null}
      {task.sotto_task_totali > 0 ? (
        <span className="num inline-flex items-center gap-1">
          <ListTree className="size-3.5" aria-hidden="true" />
          {task.sotto_task_completati}/{task.sotto_task_totali} sotto-task
        </span>
      ) : null}
      {task.stima_minuti ? <span className="num">Stima {formatStima(task.stima_minuti)}</span> : null}
    </p>
  )
}
