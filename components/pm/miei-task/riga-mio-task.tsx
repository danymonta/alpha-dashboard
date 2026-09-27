'use client'

import Link from 'next/link'
import { useOptimistic, useTransition } from 'react'
import { toast } from 'sonner'

import { completaTask } from '@/app/(app)/progetti/[id]/actions'
import { InRitardo } from '@/components/pm/stato-progetto'
import { AvviaTimer } from '@/components/pm/tempo/avvia-timer'
import { Checkbox } from '@/components/ui/checkbox'
import { formatData } from '@/lib/format'
import { ETICHETTA_STATO_TASK, type StatoTask } from '@/lib/progetti'
import { cn } from '@/lib/utils'

export type MioTask = {
  id: string
  titolo: string
  stato: StatoTask
  scadenza: string | null
  in_ritardo: boolean
  progetto_id: string
  progetto: string
}

/** One of my tasks: close it, jump to its project, start the timer on it. */
export function RigaMioTask({ task }: { task: MioTask }) {
  const [completato, setCompletato] = useOptimistic(false)
  const [inCorso, avvia] = useTransition()

  function completa(valore: boolean) {
    avvia(async () => {
      setCompletato(valore)
      try {
        const esito = await completaTask({ id: task.id, completato: valore })
        if (!esito.ok) toast.error(esito.errore)
        else toast.success('Task completato')
      } catch {
        toast.error('Connessione assente. Riprova.')
      }
    })
  }

  return (
    <li aria-label={task.titolo} data-testid="mio-task" data-tour="mio-task" className="flex items-start gap-1 py-1 pr-2">
      <label className="flex size-11 shrink-0 cursor-pointer items-center justify-center">
        <Checkbox
          checked={completato}
          className="size-5"
          disabled={inCorso}
          onCheckedChange={(v) => completa(v)}
          aria-label={`Completa ${task.titolo}`}
        />
      </label>
      <div className="min-w-0 flex-1 py-2">
        <p className={cn('text-sm font-medium break-words', completato && 'text-muted-foreground line-through')}>{task.titolo}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          <Link href={`/progetti/${task.progetto_id}/attivita`} className="underline-offset-4 hover:text-foreground hover:underline">
            {task.progetto}
          </Link>
          <span>{ETICHETTA_STATO_TASK[task.stato]}</span>
          {task.in_ritardo ? (
            <InRitardo testo={`In ritardo, scadenza ${formatData(task.scadenza)}`} />
          ) : task.scadenza ? (
            <span className="num">Scadenza {formatData(task.scadenza)}</span>
          ) : null}
        </p>
      </div>
      <AvviaTimer progettoId={task.progetto_id} taskId={task.id} titolo={task.titolo} />
    </li>
  )
}
