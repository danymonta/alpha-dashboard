'use client'

import { AlarmClock, LoaderCircle, Square } from 'lucide-react'
import Link from 'next/link'
import { useId, useState, useSyncExternalStore, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'

import { fermaTimer } from '@/app/(app)/tempo/actions'
import { useLingua } from '@/components/i18n/lingua-provider'
import { Cronometro } from '@/components/pm/tempo/cronometro'
import { useTimer, type TimerAcceso } from '@/components/pm/tempo/timer-provider'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { formatOra } from '@/lib/date'
import type { Lingua } from '@/lib/i18n/lingua'
import { MIO_TEMPO, traduciErroreTempo } from '@/lib/i18n/testi/tempo'
import { formatDurata } from '@/lib/tempo'
import { cn } from '@/lib/utils'

/** "Progetto · Task", or just the project. */
export function descrizioneTimer(timer: Pick<TimerAcceso, 'progetto' | 'task'>, lingua: Lingua = 'it'): string {
  const progetto = timer.progetto ?? MIO_TEMPO[lingua].cronometro.progetto
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
 * at start. Enter with Cmd/Ctrl, or the button, stops the clock. In the
 * page's language (1.53.0), Italian when none is passed.
 */
export function FermaTimerForm({
  notaIniziale,
  onFermato,
  compatto = false,
  lingua = 'it',
}: {
  notaIniziale: string | null
  onFermato?: () => void
  compatto?: boolean
  lingua?: Lingua
}) {
  const testi = MIO_TEMPO[lingua]
  const t = testi.cronometro
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
          setErrore(traduciErroreTempo(esito.errore, lingua) ?? null)
          return
        }
        toast.success(esito.minuti ? t.fermatoDopo(formatDurata(esito.minuti)) : t.fermato)
        onFermato?.()
      } catch {
        setErrore(testi.form.connessione)
      }
      await ricarica()
    })
  }

  return (
    <form onSubmit={ferma} className="space-y-3" aria-label={t.ferma}>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-nota`}>{testi.campi.nota}</Label>
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
          placeholder={testi.campi.cosaHaiFatto}
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
        {t.ferma}
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
  // the shell is in the page's language (1.53.0)
  const lingua = useLingua()
  const t = MIO_TEMPO[lingua].cronometro
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
            aria-label={t.inCorsoSu(descrizioneTimer(timer, lingua))}
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
          <p className="text-sm font-medium">{descrizioneTimer(timer, lingua)}</p>
          <p className="text-xs text-muted-foreground">
            {t.acceso(formatOra(timer.inizio))}{' '}
            <Link href="/tempo" onClick={() => setAperto(false)} className="underline underline-offset-4">
              {t.ilMioTempo}
            </Link>
          </p>
        </div>
        {/* keyed on the timer: a new timer starts with its own note */}
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
