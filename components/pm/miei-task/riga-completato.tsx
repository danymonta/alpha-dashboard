'use client'

import { CircleCheck, LoaderCircle, RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { etichettaCompletato, type MioTaskCompletato } from '@/lib/miei-task'

type Props = {
  task: MioTaskCompletato
  oggi: string
  /** Reopens the task: it goes back to its group. */
  onRiapri: () => Promise<void>
}

/**
 * A task I closed: its project, the day it was closed and "Riapri". No timer:
 * time is counted on open tasks.
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
      <div className="min-w-0 flex-1 py-2">
        <p className="text-sm font-medium break-words text-muted-foreground">{task.titolo}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <Link
            href={`/progetti/${task.progetto_id}/attivita`}
            // an inline link: its touch area grows to 44px without moving the text
            className="relative rounded-sm underline-offset-4 after:absolute after:-inset-x-1 after:-inset-y-3.5 after:content-[''] hover:text-foreground hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          >
            {task.progetto}
          </Link>
          <span className="num">{etichettaCompletato(task.completato_il, oggi)}</span>
        </p>
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
