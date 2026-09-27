'use client'

import { LoaderCircle, Square, Timer } from 'lucide-react'
import Link from 'next/link'
import { useId, useState, useTransition, type FormEvent } from 'react'
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

function BottoneFerma({ timer, className }: { timer: TimerAcceso; className?: string }) {
  const [aperto, setAperto] = useState(false)
  return (
    <Popover open={aperto} onOpenChange={setAperto}>
      <PopoverTrigger
        render={
          <Button type="button" variant="outline" className={cn('h-11 shrink-0 gap-1.5 px-3', className)} />
        }
      >
        <Square className="size-3.5 fill-current" aria-hidden="true" />
        Ferma
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] p-4">
        <p className="text-sm font-medium">{descrizioneTimer(timer)}</p>
        <p className="text-xs text-muted-foreground">Acceso alle {formatOra(timer.inizio)}</p>
        {/* keyed on the timer: a new timer starts with its own note */}
        <FermaTimerForm key={timer.id} notaIniziale={timer.nota} onFermato={() => setAperto(false)} compatto />
      </PopoverContent>
    </Popover>
  )
}

/**
 * The running timer, always in sight: a card in the desktop sidebar, a strip
 * under the mobile top bar. Nothing when no timer is running. Sober on
 * purpose: no animation next to the numbers (CLAUDE.md section 11).
 */
export function TimerAttivo({ variante }: { variante: 'sidebar' | 'barra' }) {
  const { timer } = useTimer()
  if (!timer) return null

  if (variante === 'barra') {
    return (
      <div
        role="status"
        aria-label="Timer in corso"
        data-testid="timer-attivo-barra"
        className="flex items-center gap-3 border-t border-border px-4 py-1.5"
      >
        <Timer className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <Link href="/tempo" className="flex min-h-11 min-w-0 flex-1 flex-col justify-center">
          <span className="truncate text-xs text-muted-foreground">{descrizioneTimer(timer)}</span>
          <Cronometro inizio={timer.inizio} className="text-sm font-semibold" />
        </Link>
        <BottoneFerma timer={timer} />
      </div>
    )
  }

  return (
    <div
      role="status"
      aria-label="Timer in corso"
      data-testid="timer-attivo-sidebar"
      className="mx-2 mb-3 rounded-xl border border-border bg-background p-3"
    >
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Timer className="size-3.5" aria-hidden="true" />
        Timer in corso
      </p>
      <Link href="/tempo" className="mt-1 block min-w-0 rounded-sm hover:text-foreground">
        <span className="block truncate text-sm font-medium">{timer.progetto ?? 'Progetto'}</span>
        {timer.task ? <span className="block truncate text-xs text-muted-foreground">{timer.task}</span> : null}
      </Link>
      <div className="mt-2 flex items-center justify-between gap-2">
        <Cronometro inizio={timer.inizio} className="text-lg font-semibold" />
        <BottoneFerma timer={timer} />
      </div>
    </div>
  )
}
