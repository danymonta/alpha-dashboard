'use client'

import { CircleCheck } from 'lucide-react'
import Link from 'next/link'

import { InRitardo } from '@/components/pm/stato-progetto'
import { AvviaTimer } from '@/components/pm/tempo/avvia-timer'
import { Checkbox } from '@/components/ui/checkbox'
import { formatData } from '@/lib/format'
import type { MioTask } from '@/lib/miei-task'
import { ETICHETTA_STATO_TASK, elencoNomi, linkTask } from '@/lib/progetti'
import { cn } from '@/lib/utils'

/** The title opens the task: a 44px row of its own, the checkbox and the timer beside it. */
export const CLASSE_TITOLO =
  'flex min-h-11 min-w-0 items-center rounded-sm py-2 text-sm font-medium wrap-anywhere underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none'

/**
 * The line under the title: the project in a column of its own, the details
 * beside it wrapping in theirs, so nothing ever sits under the project link.
 * It starts right where the title's box ends (no negative margin): the band
 * the project's touch area reaches up into is the title's own bottom padding.
 */
export const CLASSE_RIGA_PROGETTO = 'flex items-start gap-x-3 text-xs text-muted-foreground'

/**
 * The project, a link under the title: its touch area grows to 44px without
 * moving the text (8 + 16 + 20). Up 8px, exactly the title's bottom padding
 * (py-2 of CLASSE_TITOLO; one line is centred in 44px and leaves 12), so it
 * ends where the title's last line ends and never covers its words, however
 * many lines the title takes. Down 20px, into the row's padding (pb-3 and
 * py-1) and the next row's border and top padding, never into its title. The
 * details never wrap under it (CLASSE_RIGA_PROGETTO).
 */
export const CLASSE_PROGETTO =
  "relative max-w-[55%] shrink-0 rounded-sm break-words underline-offset-4 after:absolute after:-inset-x-1 after:-top-2 after:-bottom-5 after:content-[''] hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"

/** The details beside the project: state, who else, the due date. */
export const CLASSE_DETTAGLI = 'flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5'

type Props = {
  task: MioTask
  /** Ticked in this visit: it stays here, checked and struck through, until I leave the page. */
  completatoAdesso: boolean
  onCompleta: () => void
  onRiapri: () => void
}

/**
 * One of my open tasks: close it, open it in its project (the title, 05/10/2026:
 * the Attività tab with its sheet open), jump to the project, start the timer
 * on it. Ticked, it does not vanish: it stays in its place with "Completato
 * adesso" (the toast offers Annulla) and moves to "Completati" on the next
 * visit. The checkbox is never disabled while the server answers, so the
 * focus stays on it.
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
      <div className="min-w-0 flex-1 pb-3">
        <Link
          href={linkTask(task.progetto_id, task.id)}
          className={cn(CLASSE_TITOLO, completatoAdesso && 'text-muted-foreground line-through')}
        >
          {task.titolo}
        </Link>
        <div className={CLASSE_RIGA_PROGETTO}>
          <Link href={`/progetti/${task.progetto_id}/attivita`} className={CLASSE_PROGETTO}>
            {task.progetto}
          </Link>
          <p className={CLASSE_DETTAGLI} data-testid="dettagli-mio-task">
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
      </div>
      {/* time is counted on open tasks, as in the project's Attività */}
      {completatoAdesso ? null : <AvviaTimer progettoId={task.progetto_id} taskId={task.id} titolo={task.titolo} />}
    </li>
  )
}
