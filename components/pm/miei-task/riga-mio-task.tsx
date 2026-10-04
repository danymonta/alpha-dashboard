'use client'

import { CircleCheck } from 'lucide-react'
import Link from 'next/link'

import { InRitardo } from '@/components/pm/stato-progetto'
import { AvviaTimer } from '@/components/pm/tempo/avvia-timer'
import { Checkbox } from '@/components/ui/checkbox'
import { formatData } from '@/lib/format'
import type { MioTask } from '@/lib/miei-task'
import { ETICHETTA_STATO_TASK, elencoNomi } from '@/lib/progetti'
import { cn } from '@/lib/utils'

type Props = {
  task: MioTask
  /** Ticked in this visit: it stays here, checked and struck through, until I leave the page. */
  completatoAdesso: boolean
  onCompleta: () => void
  onRiapri: () => void
}

/**
 * One of my open tasks: close it, jump to its project, start the timer on it.
 * Ticked, it does not vanish: it stays in its place with "Completato adesso"
 * (the toast offers Annulla) and moves to "Completati" on the next visit.
 * The checkbox is never disabled while the server answers, so the focus stays
 * on it.
 */
export function RigaMioTask({ task, completatoAdesso, onCompleta, onRiapri }: Props) {
  return (
    <li
      aria-label={task.titolo}
      data-testid="mio-task"
      data-tour="mio-task"
      data-mio-task={task.id}
      data-completato={completatoAdesso ? 'adesso' : undefined}
      className="flex items-start gap-1 py-1 pr-2"
    >
      <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
        <Checkbox
          checked={completatoAdesso}
          className="size-5"
          onCheckedChange={(v) => (v ? onCompleta() : onRiapri())}
          aria-label={completatoAdesso ? `Riapri ${task.titolo}` : `Completa ${task.titolo}`}
        />
      </label>
      <div className="min-w-0 flex-1 py-2">
        <p className={cn('text-sm font-medium break-words', completatoAdesso && 'text-muted-foreground line-through')}>
          {task.titolo}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <Link
            href={`/progetti/${task.progetto_id}/attivita`}
            // an inline link: its touch area grows to 44px without moving the text
            className="relative rounded-sm underline-offset-4 after:absolute after:-inset-x-1 after:-inset-y-3.5 after:content-[''] hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {task.progetto}
          </Link>
          {completatoAdesso ? (
            <span className="inline-flex items-center gap-1 font-medium text-status-ok">
              <CircleCheck className="size-3.5" aria-hidden="true" />
              Completato adesso
            </span>
          ) : (
            <span>{ETICHETTA_STATO_TASK[task.stato]}</span>
          )}
          {task.con.length > 0 ? <span>con {elencoNomi(task.con)}</span> : null}
          {completatoAdesso ? null : task.in_ritardo ? (
            <InRitardo testo={`In ritardo, scadenza ${formatData(task.scadenza)}`} />
          ) : task.scadenza ? (
            <span className="num">Scadenza {formatData(task.scadenza)}</span>
          ) : null}
        </p>
      </div>
      {/* time is counted on open tasks, as in the project's Attività */}
      {completatoAdesso ? null : <AvviaTimer progettoId={task.progetto_id} taskId={task.id} titolo={task.titolo} />}
    </li>
  )
}
