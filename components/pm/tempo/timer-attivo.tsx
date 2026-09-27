'use client'

import { AlarmClock, LoaderCircle, Square } from 'lucide-react'
import Link from 'next/link'
import { useId, useState, useSyncExternalStore, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'

import { fermaTimer } from '@/app/(app)/tempo/actions'
import { Cronometro } from '@/components/pm/tempo/cronometro'
import { useTimer, type TimerAcceso } from '@/components/pm/tempo/timer-provider'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { formatOra } from '@/lib/date'
import { formatDurata } from '@/lib/tempo'
import { cn } from '@/lib/utils'

/** "Progetto · Task", or just the project. */
export function descrizioneTimer(timer: Pick<TimerAcceso, 'progetto' | 'task'>): string {
  const progetto = timer.progetto ?? 'Progetto'
  return timer.task ? `${progetto} · ${timer.task}` : progetto
}

// a mouse, not a finger: only there may the note take focus by itself
const PUNTATORE_FINE = '(pointer: fine)'

function iscriviti(avvisa: () => void) {
  const mq = window.matchMedia(PUNTATORE_FINE)
  mq.addEventListener('change', avvisa)
  return () => mq.removeEventListener('change', avvisa)
}

function usePuntatoreFine() {
  return useSyncExternalStore(
    iscriviti,
    () => window.matchMedia(PUNTATORE_FINE).matches,
    () => false,
  )
}

/**
 * Stop with an optional note: the note field is prefilled with the one given
 * at start. Enter with Cmd/Ctrl, or the button, stops the clock.
 */
export function FermaTimerForm({
  notaIniziale,
  onFermato,
  compatto = false,
}: {
  notaIniziale: string | null
  onFermato?: () => void
  compatto?: boolean
}) {
  const { ricarica } = useTimer()
  const id = useId()
  const [nota, setNota] = useState(notaIniziale ?? '')
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()
  // `compatto` is the popover size, on every viewport: the phone is told by the pointer
  const fuocoAutomatico = usePuntatoreFine()

  function ferma(evento?: FormEvent) {
    evento?.preventDefault()
    setErrore(null)
    avvia(async () => {
      try {
        const esito = await fermaTimer({ nota })
        if (!esito.ok) {
          setErrore(esito.errore)
          return
        }
        toast.success(esito.minuti ? `Timer fermato · ${formatDurata(esito.minuti)}` : 'Timer fermato')
        onFermato?.()
      } catch {
        setErrore('Connessione assente. Riprova.')
      }
      await ricarica()
    })
  }

  return (
    <form onSubmit={ferma} className="space-y-3" aria-label="Ferma il timer">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-nota`}>Nota (facoltativa)</Label>
        <Textarea
          id={`${id}-nota`}
          // stopping is the moment to say what was done; on a phone no keyboard
          // popping up by itself over the form
          autoFocus={fuocoAutomatico && compatto}
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ferma()
          }}
          maxLength={2000}
          rows={compatto ? 2 : 3}
          placeholder="Cosa hai fatto"
        />
      </div>
      {errore ? (
        <p role="alert" className="text-sm text-status-critical">
          {errore}
        </p>
      ) : null}
      <Button type="submit" className="h-11 w-full" disabled={inCorso}>
        {inCorso ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Square className="size-3.5 fill-current" aria-hidden="true" />
        )}
        Ferma il timer
      </Button>
    </form>
  )
}

/**
 * The running timer, always in sight at the top right, next to Alfire, on
 * every page: an alarm clock, the time running and (desktop) what it is on.
 * A tap opens the stop, which asks for a note. Nothing when no timer runs.
 * Sober on purpose: no animation next to the numbers (CLAUDE.md section 11).
 */
export function TimerInCima({ compatto = false }: { compatto?: boolean }) {
  const { timer } = useTimer()
  const [aperto, setAperto] = useState(false)
  if (!timer) return null

  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            aria-label={`Timer in corso su ${descrizioneTimer(timer)}: tocca per fermarlo`}
            data-testid={compatto ? 'timer-attivo-mobile' : 'timer-attivo-desktop'}
            className={cn('h-11 shrink-0 gap-2 border-primary/60', compatto ? 'px-2.5' : 'max-w-72 px-3')}
          />
        }
      >
        <AlarmClock className="size-4 shrink-0 text-primary-light" aria-hidden="true" />
        <Cronometro inizio={timer.inizio} className="text-sm font-semibold" />
        {compatto ? null : <span className="min-w-0 truncate text-sm text-muted-foreground">{timer.task ?? timer.progetto}</span>}
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-3 p-4">
        <div>
          <p className="text-sm font-medium">{descrizioneTimer(timer)}</p>
          <p className="text-xs text-muted-foreground">
            Acceso alle {formatOra(timer.inizio)} ·{' '}
            <Link href="/tempo" onClick={() => setAperto(false)} className="underline underline-offset-4">
              Il mio tempo
            </Link>
          </p>
        </div>
        {/* keyed on the timer: a new timer starts with its own note */}
        <FermaTimerForm key={timer.id} notaIniziale={timer.nota} onFermato={() => setAperto(false)} compatto />
      </PopoverContent>
    </Popover>
  )
}
