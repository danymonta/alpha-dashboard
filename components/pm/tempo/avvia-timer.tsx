'use client'

import { LoaderCircle, Play, Square } from 'lucide-react'
import { useTransition } from 'react'
import { toast } from 'sonner'

import { avviaTimer, fermaTimer } from '@/app/(app)/tempo/actions'
import { useTimer } from '@/components/pm/tempo/timer-provider'
import { Button } from '@/components/ui/button'
import { formatDurata } from '@/lib/tempo'
import { cn } from '@/lib/utils'

type Props = {
  progettoId: string
  taskId?: string | null
  /** What the timer is about, for the accessible name: the task title or the project name. */
  titolo: string
  className?: string
}

/**
 * Compact 44px play button. When this is the running timer it turns into a
 * stop button ("in corso"). Starting a timer stops the one already running.
 */
export function AvviaTimer({ progettoId, taskId = null, titolo, className }: Props) {
  const { timer, ricarica } = useTimer()
  const [inCorso, avvia] = useTransition()
  const acceso = timer !== null && timer.progetto_id === progettoId && (timer.task_id ?? null) === (taskId ?? null)

  function tocca() {
    avvia(async () => {
      try {
        if (acceso) {
          const esito = await fermaTimer({})
          if (!esito.ok) toast.error(esito.errore)
          else toast.success(esito.minuti ? `Timer fermato · ${formatDurata(esito.minuti)}` : 'Timer fermato')
        } else {
          const cera = timer !== null
          const esito = await avviaTimer({ progetto_id: progettoId, task_id: taskId })
          if (!esito.ok) toast.error(esito.errore)
          else toast.success(cera ? 'Timer avviato. Quello di prima è stato fermato.' : 'Timer avviato')
        }
      } catch {
        toast.error('Connessione assente. Riprova.')
      }
      await ricarica()
    })
  }

  return (
    <Button
      type="button"
      variant={acceso ? 'default' : 'outline'}
      size="icon"
      className={cn('size-11 shrink-0', className)}
      aria-label={acceso ? `Ferma il timer su ${titolo}` : `Avvia il timer su ${titolo}`}
      aria-pressed={acceso}
      data-stato={acceso ? 'in-corso' : 'fermo'}
      title={acceso ? 'Timer in corso: tocca per fermarlo' : 'Avvia il timer'}
      disabled={inCorso}
      onClick={tocca}
    >
      {inCorso ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : acceso ? (
        <Square className="size-3.5 fill-current" aria-hidden="true" />
      ) : (
        <Play className="size-4" aria-hidden="true" />
      )}
    </Button>
  )
}
