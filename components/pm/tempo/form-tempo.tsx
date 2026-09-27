'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle, Pencil, Plus, Trash2 } from 'lucide-react'
import { useId, useState, useTransition } from 'react'
import { useForm, useWatch, type UseFormReturn } from 'react-hook-form'
import { toast } from 'sonner'

import { eliminaTempo, modificaTempo, registraTempo } from '@/app/(app)/tempo/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { BottoneSalva, CLASSE_SELECT, ErroreModulo, FoglioModifica, useSalvataggio } from '@/components/form/foglio-modifica'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { formatDurataInput } from '@/lib/tempo'
import {
  modificaTempoSchema,
  tempoManualeSchema,
  type ModificaTempoInput,
  type TempoManualeInput,
} from '@/lib/validation/tempo'

export type OpzioneProgetto = { id: string; nome: string }
export type OpzioneTask = { id: string; titolo: string; progetto_id: string; completato: boolean }

const DURATE_RAPIDE = [
  { valore: '0:15', etichetta: '15 min' },
  { valore: '0:30', etichetta: '30 min' },
  { valore: '1:00', etichetta: '1 h' },
  { valore: '2:00', etichetta: '2 h' },
] as const

/** The fields shared by "add" and "edit": project, task, day, duration, note. */
function CampiTempo({
  form,
  prefisso,
  progetti,
  task,
  oggi,
  progettoFisso,
}: {
  form: UseFormReturn<TempoManualeInput> | UseFormReturn<ModificaTempoInput>
  prefisso: string
  progetti: readonly OpzioneProgetto[]
  task: readonly OpzioneTask[]
  oggi: string
  progettoFisso: boolean
}) {
  // both forms share these fields: narrowing the union is only for the types
  const f = form as UseFormReturn<TempoManualeInput>
  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = f
  const progettoId = useWatch({ control, name: 'progetto_id' })
  const taskId = useWatch({ control, name: 'task_id' })
  const taskDelProgetto = task.filter((t) => t.progetto_id === progettoId && (!t.completato || t.id === taskId))

  return (
    <>
      {progettoFisso ? null : (
        <div className="space-y-1.5">
          <Label htmlFor={`${prefisso}-progetto`}>Progetto</Label>
          <select
            id={`${prefisso}-progetto`}
            className={CLASSE_SELECT}
            aria-describedby={errors.progetto_id ? `${prefisso}-progetto-errore` : undefined}
            {...register('progetto_id', { onChange: () => setValue('task_id', '') })}
          >
            <option value="">Scegli il progetto</option>
            {progetti.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
          <ErroreCampo id={`${prefisso}-progetto-errore`} messaggio={errors.progetto_id?.message} />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`${prefisso}-task`}>Attività (facoltativa)</Label>
        <select
          id={`${prefisso}-task`}
          className={CLASSE_SELECT}
          disabled={!progettoId}
          {...register('task_id')}
        >
          <option value="">{progettoId ? 'Nessuna attività in particolare' : 'Prima scegli il progetto'}</option>
          {taskDelProgetto.map((t) => (
            <option key={t.id} value={t.id}>
              {t.titolo}
              {t.completato ? ' (completata)' : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${prefisso}-data`}>Giorno</Label>
          <Input id={`${prefisso}-data`} type="date" max={oggi} className="num h-11" {...register('data')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${prefisso}-durata`}>Durata</Label>
          <Input
            id={`${prefisso}-durata`}
            inputMode="text"
            autoComplete="off"
            placeholder="1:30"
            className="num h-11 text-right"
            aria-describedby={`${prefisso}-durata-aiuto`}
            {...register('durata')}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Durate rapide">
        {DURATE_RAPIDE.map((d) => (
          <Button
            key={d.valore}
            type="button"
            variant="outline"
            className="h-11 flex-1 px-3"
            onClick={() => setValue('durata', d.valore, { shouldValidate: true, shouldDirty: true })}
          >
            {d.etichetta}
          </Button>
        ))}
      </div>
      <p id={`${prefisso}-durata-aiuto`} className="-mt-2 text-xs text-muted-foreground">
        Ore e minuti: 1:30, 1h30 o 90 (un numero da solo sono minuti).
      </p>
      <ErroreCampo id={`${prefisso}-data-errore`} messaggio={errors.data?.message ?? errors.durata?.message} />

      <div className="space-y-1.5">
        <Label htmlFor={`${prefisso}-nota`}>Nota (facoltativa)</Label>
        <Textarea id={`${prefisso}-nota`} rows={2} maxLength={2000} placeholder="Cosa hai fatto" {...register('nota')} />
        <ErroreCampo id={`${prefisso}-nota-errore`} messaggio={errors.nota?.message} />
      </div>
    </>
  )
}

/** Time logged afterwards. On a project page the project is fixed. */
export function NuovoTempo({
  progetti,
  task,
  oggi,
  progettoId,
}: {
  progetti: readonly OpzioneProgetto[]
  task: readonly OpzioneTask[]
  oggi: string
  /** Fixed project (the project's Time tab). */
  progettoId?: string
}) {
  const prefisso = useId()
  const [errore, setErrore] = useState<string | null>(null)
  const form = useForm<TempoManualeInput>({
    resolver: zodResolver(tempoManualeSchema),
    defaultValues: {
      progetto_id: progettoId ?? (progetti.length === 1 ? progetti[0].id : ''),
      task_id: '',
      data: oggi,
      durata: '',
      nota: '',
    },
  })
  const {
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = form

  const invia = handleSubmit(async (valori) => {
    setErrore(null)
    let esito
    try {
      esito = await registraTempo(valori)
    } catch {
      setErrore('Connessione assente. Riprova.')
      return
    }
    if (!esito.ok) {
      setErrore(esito.errore)
      return
    }
    toast.success('Tempo registrato')
    // same project and day: the next entry is usually the same context
    reset({ progetto_id: valori.progetto_id, task_id: '', data: valori.data, durata: '', nota: '' })
  })

  return (
    <form onSubmit={invia} noValidate className="space-y-4 rounded-xl bg-card p-4" aria-label="Registra tempo passato">
      <CampiTempo
        form={form}
        prefisso={prefisso}
        progetti={progetti}
        task={task}
        oggi={oggi}
        progettoFisso={Boolean(progettoId)}
      />
      <ErroreModulo testo={errore} />
      <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Plus className="size-4" aria-hidden="true" />
        )}
        Registra il tempo
      </Button>
    </form>
  )
}

export type VoceModificabile = {
  id: string
  progetto_id: string
  /** Shown when the project is no longer among the choices (archived). */
  nomeProgetto: string
  task_id: string | null
  data: string
  minuti: number
  nota: string | null
  /** A stopped timer: start and end are kept unless day or duration change. */
  daTimer: boolean
}

export function ModificaTempo({
  voce,
  progetti,
  task,
  oggi,
  descrizione,
  progettoFisso = false,
}: {
  voce: VoceModificabile
  progetti: readonly OpzioneProgetto[]
  task: readonly OpzioneTask[]
  oggi: string
  descrizione: string
  progettoFisso?: boolean
}) {
  const prefisso = useId()
  const [aperto, setAperto] = useState(false)
  const { errore, setErrore, salva } = useSalvataggio()
  const valoriIniziali: ModificaTempoInput = {
    id: voce.id,
    progetto_id: voce.progetto_id,
    task_id: voce.task_id ?? '',
    data: voce.data,
    durata: formatDurataInput(voce.minuti),
    nota: voce.nota ?? '',
  }
  // an archived project is no longer offered, but the entry keeps it
  const opzioni = progetti.some((p) => p.id === voce.progetto_id)
    ? progetti
    : [...progetti, { id: voce.progetto_id, nome: voce.nomeProgetto }]
  const form = useForm<ModificaTempoInput>({
    resolver: zodResolver(modificaTempoSchema),
    defaultValues: valoriIniziali,
  })
  const {
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = form

  const invia = handleSubmit(async (valori) => {
    if (await salva(() => modificaTempo(valori), 'Tempo aggiornato')) setAperto(false)
  })

  return (
    <FoglioModifica
      aperto={aperto}
      onApertoChange={(v) => {
        setAperto(v)
        if (!v) {
          setErrore(null)
          reset(valoriIniziali)
        }
      }}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Modifica ${descrizione}`}
          className="size-11 shrink-0 text-muted-foreground"
        />
      }
      contenutoTrigger={<Pencil className="size-4" aria-hidden="true" />}
      titolo="Correggi il tempo"
      descrizione={
        voce.daTimer
          ? 'Viene dal timer: se cambi giorno o durata diventa una voce inserita a mano.'
          : 'I totali si ricalcolano subito.'
      }
    >
      <form onSubmit={invia} noValidate className="space-y-4">
        <CampiTempo
          form={form}
          prefisso={prefisso}
          progetti={opzioni}
          task={task}
          oggi={oggi}
          progettoFisso={progettoFisso}
        />
        <ErroreModulo testo={errore} />
        <BottoneSalva inCorso={isSubmitting}>Salva</BottoneSalva>
      </form>
    </FoglioModifica>
  )
}

/** Two taps on purpose: the first arms, the second deletes. */
export function EliminaTempo({ id, descrizione }: { id: string; descrizione: string }) {
  const [pronto, setPronto] = useState(false)
  const [inCorso, avvia] = useTransition()

  if (!pronto) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 text-muted-foreground"
        aria-label={`Elimina ${descrizione}`}
        onClick={() => setPronto(true)}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    )
  }

  return (
    <Button
      type="button"
      variant="destructive"
      className="h-11"
      disabled={inCorso}
      onBlur={() => setPronto(false)}
      autoFocus
      onClick={() =>
        avvia(async () => {
          try {
            const esito = await eliminaTempo({ id })
            if (esito.ok) toast.success('Voce eliminata')
            else toast.error(esito.errore)
          } catch {
            toast.error('Connessione assente. Riprova.')
          }
          setPronto(false)
        })
      }
    >
      Conferma
    </Button>
  )
}
