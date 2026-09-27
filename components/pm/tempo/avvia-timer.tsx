'use client'

import { AlarmClock, LoaderCircle, Square } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { avviaTimer } from '@/app/(app)/tempo/actions'
import { FermaTimerForm, descrizioneTimer } from '@/components/pm/tempo/timer-attivo'
import { useTimer } from '@/components/pm/tempo/timer-provider'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

type Props = {
  progettoId: string
  taskId?: string | null
  /** What the timer is about, for the accessible name: the task title or the project name. */
  titolo: string
  className?: string
}

/**
 * The alarm clock next to a task: a tap starts the timer on it (and stops the
 * one already running). While it runs it turns into a stop, which asks what
 * was done before stopping the clock.
 */
export function AvviaTimer({ progettoId, taskId = null, titolo, className }: Props) {
  const { timer, ricarica } = useTimer()
  const [inCorso, avvia] = useTransition()
  const [aperto, setAperto] = useState(false)
  const acceso = timer !== null && timer.progetto_id === progettoId && (timer.task_id ?? null) === (taskId ?? null)

  if (acceso && timer) {
    return (
      <Popover open={aperto} onOpenChange={setAperto}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              size="icon"
              className={cn('size-11 shrink-0', className)}
              aria-label={`Ferma il timer su ${titolo}`}
              aria-pressed
              data-stato="in-corso"
              title="Timer in corso: tocca per fermarlo"
            />
          }
        >
          <Square className="size-3.5 fill-current" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-3 p-4">
          <p className="text-sm font-medium">{descrizioneTimer(timer)}</p>
          <FermaTimerForm key={timer.id} notaIniziale={timer.nota} onFermato={() => setAperto(false)} compatto />
        </PopoverContent>
      </Popover>
    )
  }

  function tocca() {
    avvia(async () => {
      try {
        const cera = timer !== null
        const esito = await avviaTimer({ progetto_id: progettoId, task_id: taskId })
        if (!esito.ok) toast.error(esito.errore)
        else toast.success(cera ? 'Timer avviato. Quello di prima è stato fermato.' : 'Timer avviato: lo trovi in alto a destra')
      } catch {
        toast.error('Connessione assente. Riprova.')
      }
      await ricarica()
    })
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className={cn('size-11 shrink-0', className)}
      aria-label={`Avvia il timer su ${titolo}`}
      aria-pressed={false}
      data-stato="fermo"
      title="Avvia il timer"
      disabled={inCorso}
      onClick={tocca}
    >
      {inCorso ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <AlarmClock className="size-4" aria-hidden="true" />
      )}
    </Button>
  )
}
