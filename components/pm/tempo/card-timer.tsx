'use client'

import { AlarmClock, FolderKanban, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useId, useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'

import { avviaTimer } from '@/app/(app)/tempo/actions'
import { CLASSE_SELECT } from '@/components/form/foglio-modifica'
import { LinkBottone } from '@/components/link-bottone'
import { Cronometro } from '@/components/pm/tempo/cronometro'
import { FermaTimerForm, descrizioneTimer } from '@/components/pm/tempo/timer-attivo'
import { useTimer } from '@/components/pm/tempo/timer-provider'
import type { OpzioneProgetto, OpzioneTask } from '@/components/pm/tempo/form-tempo'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { formatOra } from '@/lib/date'
import { avviaTimerSchema } from '@/lib/validation/tempo'

/**
 * The timer of "Il mio tempo": running (clock, stop with a note) or ready to
 * start on a project and, optionally, a task of that project.
 */
export function CardTimer({
  progetti,
  task,
}: {
  progetti: readonly OpzioneProgetto[]
  task: readonly OpzioneTask[]
}) {
  const { stato, timer, ricarica } = useTimer()

  if (stato === 'caricamento') {
    return (
      <div className="space-y-3 rounded-xl bg-card p-4" aria-busy="true">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-11 w-full" />
        <Skeleton className="h-11 w-full" />
        <span className="sr-only">Caricamento del timer</span>
      </div>
    )
  }

  if (stato === 'errore') {
    return (
      <div role="alert" className="flex flex-col items-start gap-3 rounded-xl bg-card p-4">
        <p className="flex items-center gap-2 text-sm">
          <TriangleAlert className="size-4 text-status-critical" aria-hidden="true" />
          Non riesco a leggere il timer.
        </p>
        <Button type="button" variant="outline" className="h-11" onClick={() => void ricarica()}>
          Riprova
        </Button>
      </div>
    )
  }

  if (timer) {
    return (
      <section aria-label="Timer in corso" className="space-y-4 rounded-xl bg-card p-4" data-testid="card-timer">
        <div>
          <p className="text-xs text-muted-foreground">Timer in corso · acceso alle {formatOra(timer.inizio)}</p>
          <p className="mt-1 truncate text-sm font-medium">{descrizioneTimer(timer)}</p>
          <Cronometro inizio={timer.inizio} className="mt-1 block text-4xl font-semibold tracking-tight" />
        </div>
        <FermaTimerForm key={timer.id} notaIniziale={timer.nota} />
      </section>
    )
  }

  if (progetti.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border px-6 py-10 text-center">
        <FolderKanban className="size-6 text-muted-foreground" aria-hidden="true" />
        <div className="space-y-1">
          <p className="text-sm font-medium">Non fai ancora parte di un progetto</p>
          <p className="mx-auto max-w-sm text-sm text-muted-foreground">
            Il tempo si registra sui progetti di cui sei membro. Chi gestisce il progetto ti aggiunge al team.
          </p>
        </div>
        <LinkBottone href="/progetti" variant="outline">
          Vai ai progetti
        </LinkBottone>
      </div>
    )
  }

  return <AvviaTimerForm progetti={progetti} task={task} />
}

function AvviaTimerForm({ progetti, task }: { progetti: readonly OpzioneProgetto[]; task: readonly OpzioneTask[] }) {
  const { ricarica } = useTimer()
  const id = useId()
  const [progettoId, setProgettoId] = useState(progetti.length === 1 ? progetti[0].id : '')
  const [taskId, setTaskId] = useState('')
  const [nota, setNota] = useState('')
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()
  const taskDelProgetto = task.filter((t) => t.progetto_id === progettoId && !t.completato)

  function invia(evento: FormEvent) {
    evento.preventDefault()
    setErrore(null)
    const parsed = avviaTimerSchema.safeParse({ progetto_id: progettoId, task_id: taskId, nota })
    if (!parsed.success) {
      setErrore(parsed.error.issues[0]?.message ?? 'Dati non validi.')
      return
    }
    avvia(async () => {
      try {
        const esito = await avviaTimer(parsed.data)
        if (!esito.ok) {
          setErrore(esito.errore)
          return
        }
        toast.success('Timer avviato')
        setNota('')
      } catch {
        setErrore('Connessione assente. Riprova.')
      }
      await ricarica()
    })
  }

  return (
    <form onSubmit={invia} noValidate className="space-y-4 rounded-xl bg-card p-4" aria-label="Avvia un timer" data-testid="card-timer">
      <p className="text-xs text-muted-foreground">Nessun timer acceso</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-progetto`}>Progetto</Label>
          <select
            id={`${id}-progetto`}
            className={CLASSE_SELECT}
            value={progettoId}
            onChange={(e) => {
              setProgettoId(e.target.value)
              setTaskId('')
            }}
          >
            <option value="">Scegli il progetto</option>
            {progetti.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-task`}>Attività (facoltativa)</Label>
          <select
            id={`${id}-task`}
            className={CLASSE_SELECT}
            value={taskId}
            disabled={!progettoId}
            onChange={(e) => setTaskId(e.target.value)}
          >
            <option value="">{progettoId ? 'Nessuna attività in particolare' : 'Prima scegli il progetto'}</option>
            {taskDelProgetto.map((t) => (
              <option key={t.id} value={t.id}>
                {t.titolo}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-nota`}>Nota (facoltativa)</Label>
        <Input
          id={`${id}-nota`}
          className="h-11"
          value={nota}
          maxLength={2000}
          placeholder="Su cosa stai lavorando"
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
        Avvia il timer
      </Button>
    </form>
  )
}
