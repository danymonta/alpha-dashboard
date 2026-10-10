'use client'

import { CircleCheck, LoaderCircle, RotateCcw } from 'lucide-react'
import { useState } from 'react'

import {
  CLASSE_DETTAGLI,
  CLASSE_PROGETTO,
  CLASSE_RIGA_PROGETTO,
  CLASSE_TITOLO,
} from '@/components/pm/miei-task/riga-mio-task'
import { LinkRiga } from '@/components/shell/link-riga'
import { Button } from '@/components/ui/button'
import { etichettaCompletato, type MioTaskCompletato } from '@/lib/miei-task'
import { linkTask } from '@/lib/progetti'
import { cn } from '@/lib/utils'

type Props = {
  task: MioTaskCompletato
  oggi: string
  /** Reopens the task: it goes back to its group. */
  onRiapri: () => Promise<void>
}

/**
 * A task I closed: the title opens it in its project (05/10/2026), then its
 * project, the day it was closed and "Riapri". No timer: time is counted on
 * open tasks.
 */
export function RigaCompletato({ task, oggi, onRiapri }: Props) {
  const [inCorso, setInCorso] = useState(false)

  async function riapri() {
    if (inCorso) return
    setInCorso(true)
    try {
      await onRiapri()
    } finally {
      setInCorso(false)
    }
  }

  return (
    <li
      aria-label={task.titolo}
      data-testid="mio-task-completato"
      data-mio-task-completato={task.id}
      className="flex items-start gap-1 py-1 pr-2"
    >
      <span className="flex size-11 shrink-0 items-center justify-center">
        <CircleCheck className="size-5 text-status-ok" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1 pb-3">
        <LinkRiga
          href={linkTask(task.progetto_id, task.id)}
          className={cn(CLASSE_TITOLO, 'text-muted-foreground hover:text-foreground')}
        >
          {task.titolo}
        </LinkRiga>
        <div className={CLASSE_RIGA_PROGETTO}>
          <LinkRiga href={`/progetti/${task.progetto_id}/attivita`} className={CLASSE_PROGETTO}>
            {task.progetto}
          </LinkRiga>
          <p className={CLASSE_DETTAGLI}>
            <span className="num">{etichettaCompletato(task.completato_il, oggi)}</span>
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        className="h-11 shrink-0 gap-1.5 px-3"
        // never disabled while the server answers: the focus stays on it
        aria-disabled={inCorso || undefined}
        aria-label={`Riapri ${task.titolo}`}
        onClick={riapri}
      >
        {inCorso ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <RotateCcw className="size-4" aria-hidden="true" />
        )}
        Riapri
      </Button>
    </li>
  )
}
