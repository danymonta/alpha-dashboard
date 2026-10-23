'use client'

import { AlarmClock, LoaderCircle, Square } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { avviaTimer } from '@/app/(app)/tempo/actions'
import { FermaTimerForm, descrizioneTimer } from '@/components/pm/tempo/timer-attivo'
import { useTimer } from '@/components/pm/tempo/timer-provider'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { Lingua } from '@/lib/i18n/lingua'
import { MIO_TEMPO, traduciErroreTempo } from '@/lib/i18n/testi/tempo'
import { cn } from '@/lib/utils'

type Props = {
  progettoId: string
  taskId?: string | null
  /** What the timer is about, for the accessible name: the task title or the project name. */
  titolo: string
  className?: string
  /** The page's language (1.53.0); a project's Attività tab passes none and stays Italian. */
  lingua?: Lingua
}

/**
 * The alarm clock next to a task: a tap starts the timer on it (and stops the
 * one already running). While it runs it turns into a stop, which asks what
 * was done before stopping the clock.
 */
export function AvviaTimer({ progettoId, taskId = null, titolo, className, lingua = 'it' }: Props) {
  const t = MIO_TEMPO[lingua].cronometro
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
              aria-label={t.fermaSu(titolo)}
              aria-pressed
              data-stato="in-corso"
              title={t.tocca}
            />
          }
        >
          <Square className="size-3.5 fill-current" aria-hidden="true" />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-3 p-4">
          <p className="text-sm font-medium">{descrizioneTimer(timer, lingua)}</p>
          <FermaTimerForm
            key={timer.id}
            notaIniziale={timer.nota}
            onFermato={() => setAperto(false)}
            compatto
            lingua={lingua}
          />
        </PopoverContent>
      </Popover>
    )
  }

  function tocca() {
    avvia(async () => {
      try {
        const cera = timer !== null
        const esito = await avviaTimer({ progetto_id: progettoId, task_id: taskId })
        if (!esito.ok) toast.error(traduciErroreTempo(esito.errore, lingua))
        else toast.success(cera ? t.avviatoFermato : t.avviatoInAlto)
      } catch {
        toast.error(MIO_TEMPO[lingua].form.connessione)
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
      aria-label={t.avviaSu(titolo)}
      aria-pressed={false}
      data-stato="fermo"
      title={t.avvia}
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
