'use client'

import { AlarmClock, FolderKanban, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useId, useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'

import { avviaTimer } from '@/app/(app)/tempo/actions'
import { CLASSE_SELECT } from '@/components/form/foglio-modifica'
import { useLingua } from '@/components/i18n/lingua-provider'
import { LinkBottone } from '@/components/link-bottone'
import { Cronometro } from '@/components/pm/tempo/cronometro'
import { FermaTimerForm, PausaTimer, descrizioneTimer } from '@/components/pm/tempo/timer-attivo'
import { useTimer } from '@/components/pm/tempo/timer-provider'
import type { OpzioneProgetto, OpzioneTask } from '@/components/pm/tempo/form-tempo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { formatOra } from '@/lib/date'
import type { Lingua } from '@/lib/i18n/lingua'
import { MIO_TEMPO, traduciErroreTempo } from '@/lib/i18n/testi/tempo'
import { avviaTimerSchema } from '@/lib/validation/tempo'

/**
 * The timer of "Il mio tempo": running (clock, stop with a note) or ready to
 * start on a project and, optionally, a task of that project. Only on "Il
 * mio tempo": in the page's language (1.53.0).
 */
export function CardTimer({
  progetti,
  task,
}: {
  progetti: readonly OpzioneProgetto[]
  task: readonly OpzioneTask[]
}) {
  const { stato, timer, ricarica } = useTimer()
  const lingua = useLingua()
  const t = MIO_TEMPO[lingua].cronometro

  if (stato === 'caricamento') {
    return (
      <div className="space-y-3 rounded-xl bg-card p-4" aria-busy="true">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <span className="sr-only">{t.caricamento}</span>
      </div>
    )
  }

  if (stato === 'errore') {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-xl bg-card p-4">
        <p className="flex items-center gap-2 text-sm">
          <TriangleAlert className="size-4 text-status-critical" aria-hidden="true" />
          {t.nonLeggo}
        </p>
        <Button type="button" variant="outline" className="h-11" onClick={() => void ricarica()}>
          {t.riprova}
        </Button>
      </div>
    )
  }

  if (timer) {
    return (
      <section aria-label={t.inCorso} className="space-y-4 rounded-xl bg-card p-4" data-testid="card-timer">
        <div>
          <p className="text-xs text-muted-foreground">{t.accesoAlle(formatOra(timer.inizio))}</p>
          <p className="mt-1 truncate text-sm font-medium">{descrizioneTimer(timer, lingua)}</p>
          <Cronometro
            inizio={timer.inizio}
            pausaDal={timer.pausa_dal}
            pausaSecondi={timer.pausa_secondi}
            className="mt-1 block text-4xl font-semibold tracking-tight"
          />
          <p className="mt-1 text-xs text-muted-foreground">
            {timer.pausa_dal ? t.inPausaDalle(formatOra(timer.pausa_dal)) : t.pausaNonContano}
          </p>
        </div>
        <PausaTimer timer={timer} lingua={lingua} />
        <FermaTimerForm key={timer.id} notaIniziale={timer.nota} lingua={lingua} />
      </section>
    )
  }

  if (progetti.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center">
        <FolderKanban className="size-6 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm font-medium">{t.senzaProgetti}</p>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">{t.senzaProgettiDescrizione}</p>
        </div>
        <LinkBottone href="/progetti" variant="outline">
          {t.vaiProgetti}
        </LinkBottone>
      </div>
    )
  }

  return <AvviaTimerForm progetti={progetti} task={task} lingua={lingua} />
}

function AvviaTimerForm({
  progetti,
  task,
  lingua,
}: {
  progetti: readonly OpzioneProgetto[]
  task: readonly OpzioneTask[]
  lingua: Lingua
}) {
  const testi = MIO_TEMPO[lingua]
  const t = testi.cronometro
  const campi = testi.campi
  const { ricarica } = useTimer()
  const id = useId()
  const [progettoId, setProgettoId] = useState(progetti.length === 1 ? progetti[0].id : '')
  const [taskId, setTaskId] = useState('')
  const [nota, setNota] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()
  const taskDelProgetto = task.filter((x) => x.progetto_id === progettoId && !x.completato)

  function invia(evento: FormEvent) {
    evento.preventDefault()
    setErrore(null)
    const parsed = avviaTimerSchema.safeParse({ progetto_id: progettoId, task_id: taskId, nota })
    if (!parsed.success) {
      setErrore(traduciErroreTempo(parsed.error.issues[0]?.message, lingua) ?? testi.form.datiNonValidi)
      return
    }
    avvia(async () => {
      try {
        const esito = await avviaTimer(parsed.data)
        if (!esito.ok) {
          setErrore(traduciErroreTempo(esito.errore, lingua) ?? null)
          return
        }
        toast.success(t.avviato)
        setNota('')
      } catch {
        setErrore(testi.form.connessione)
      }
      await ricarica()
    })
  }

  return (
    <form onSubmit={invia} noValidate className="space-y-4 rounded-xl bg-card p-4" aria-label={t.avviaAria} data-testid="card-timer">
      <p className="text-xs text-muted-foreground">{t.nessunoAcceso}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-progetto`}>{campi.progetto}</Label>
          <select
            id={`${id}-progetto`}
            className={CLASSE_SELECT}
            value={progettoId}
            onChange={(e) => {
              setProgettoId(e.target.value)
              setTaskId('')
            }}
          >
            <option value="">{campi.scegliProgetto}</option>
            {progetti.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-task`}>{campi.attivita}</Label>
          <select
            id={`${id}-task`}
            className={CLASSE_SELECT}
            value={taskId}
            disabled={!progettoId}
            onChange={(e) => setTaskId(e.target.value)}
          >
            <option value="">{progettoId ? campi.nessunaAttivita : campi.primaProgetto}</option>
            {taskDelProgetto.map((opzione) => (
              <option key={opzione.id} value={opzione.id}>
                {opzione.titolo}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-nota`}>{campi.nota}</Label>
        <Input
          id={`${id}-nota`}
          className="h-11"
          value={nota}
          maxLength={2000}
          placeholder={t.suCosa}
          onChange={(e) => setNota(e.target.value)}
        />
      </div>
      {errore ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {errore}
        </p>
      ) : null}
      <Button type="submit" className="h-11 w-full" disabled={inCorso}>
        {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <AlarmClock className="size-4" aria-hidden="true" />}
        {t.avvia}
      </Button>
    </form>
  )
}
