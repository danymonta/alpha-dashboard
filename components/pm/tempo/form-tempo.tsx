'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { History, LoaderCircle, Pencil, Plus, Trash2 } from 'lucide-react'
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
import type { Lingua } from '@/lib/i18n/lingua'
import { MIO_TEMPO, traduciErroreTempo } from '@/lib/i18n/testi/tempo'
import { formatDurataInput } from '@/lib/tempo'
import {
  MAX_MINUTI,
  fasciaDellaVoce,
  minutiFascia,
  modificaTempoSchema,
  parseOra,
  tempoManualeSchema,
  timerSenzaFascia,
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

/**
 * The fields shared by "add" and "edit": project, task, day, duration, the
 * optional range ("Dalle"–"Alle") and the note. With a range the duration is
 * computed from it and not typed. The words in the page's language (1.53.0):
 * the messages of the schema too, read through traduciErroreTempo.
 */
function CampiTempo({
  form,
  prefisso,
  progetti,
  task,
  oggi,
  progettoFisso,
  lingua,
}: {
  form: UseFormReturn<TempoManualeInput> | UseFormReturn<ModificaTempoInput>
  prefisso: string
  progetti: readonly OpzioneProgetto[]
  task: readonly OpzioneTask[]
  oggi: string
  progettoFisso: boolean
  lingua: Lingua
}) {
  const t = MIO_TEMPO[lingua].campi
  const errore = (messaggio: string | undefined) => traduciErroreTempo(messaggio, lingua)
  // both forms share these fields: narrowing the union is only for the types
  const f = form as UseFormReturn<TempoManualeInput>
  const {
    register,
    setValue,
    getValues,
    clearErrors,
    control,
    formState: { errors },
  } = f
  const progettoId = useWatch({ control, name: 'progetto_id' })
  const taskId = useWatch({ control, name: 'task_id' })
  const dalle = useWatch({ control, name: 'dalle' })
  const alle = useWatch({ control, name: 'alle' })
  const taskDelProgetto = task.filter((x) => x.progetto_id === progettoId && (!x.completato || x.id === taskId))
  // both hours written: the duration is the range's, not typed
  const conFascia = Boolean(parseOra(dalle) && parseOra(alle))
  const unaFascia = Boolean(dalle || alle)

  /** Shows the range's duration in the field (the database computes it again when it saves). */
  function durataDallaFascia() {
    const [data, inizio, fine] = getValues(['data', 'dalle', 'alle'])
    const minuti = minutiFascia(data, inizio, fine)
    if (minuti !== null && minuti >= 1 && minuti <= MAX_MINUTI) {
      setValue('durata', formatDurataInput(minuti), { shouldDirty: true })
      clearErrors('durata')
    }
  }

  function togliFascia() {
    // the duration stays as it is: from now on it is typed
    setValue('dalle', '', { shouldDirty: true })
    setValue('alle', '', { shouldDirty: true })
    clearErrors(['dalle', 'alle'])
  }

  return (
    <>
      {progettoFisso ? null : (
        <div className="space-y-1.5">
          <Label htmlFor={`${prefisso}-progetto`}>{t.progetto}</Label>
          <select
            id={`${prefisso}-progetto`}
            className={CLASSE_SELECT}
            aria-describedby={errors.progetto_id ? `${prefisso}-progetto-errore` : undefined}
            {...register('progetto_id', { onChange: () => setValue('task_id', '') })}
          >
            <option value="">{t.scegliProgetto}</option>
            {progetti.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
          <ErroreCampo id={`${prefisso}-progetto-errore`} messaggio={errore(errors.progetto_id?.message)} />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor={`${prefisso}-task`}>{t.attivita}</Label>
        <select
          id={`${prefisso}-task`}
          className={CLASSE_SELECT}
          disabled={!progettoId}
          {...register('task_id')}
        >
          <option value="">{progettoId ? t.nessunaAttivita : t.primaProgetto}</option>
          {taskDelProgetto.map((opzione) => (
            <option key={opzione.id} value={opzione.id}>
              {opzione.titolo}
              {opzione.completato ? t.completata : ''}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`${prefisso}-data`}>{t.giorno}</Label>
          <Input
            id={`${prefisso}-data`}
            type="date"
            max={oggi}
            className="num h-11"
            {...register('data', { onChange: durataDallaFascia })}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${prefisso}-durata`}>{t.durata}</Label>
          <Input
            id={`${prefisso}-durata`}
            inputMode="text"
            autoComplete="off"
            placeholder="1:30"
            readOnly={conFascia}
            className="num h-11 text-right read-only:border-dashed"
            aria-describedby={`${prefisso}-durata-aiuto`}
            {...register('durata')}
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-2" role="group" aria-label={t.durateRapide}>
        {DURATE_RAPIDE.map((d) => (
          <Button
            key={d.valore}
            type="button"
            variant="outline"
            className="h-11 flex-1 px-3"
            disabled={conFascia}
            onClick={() => setValue('durata', d.valore, { shouldValidate: true, shouldDirty: true })}
          >
            {d.etichetta}
          </Button>
        ))}
      </div>
      <p id={`${prefisso}-durata-aiuto`} className="-mt-2 text-xs text-muted-foreground">
        {conFascia ? t.calcolata : t.aiutoDurata}
      </p>
      <ErroreCampo id={`${prefisso}-data-errore`} messaggio={errore(errors.data?.message ?? errors.durata?.message)} />

      <fieldset className="space-y-1.5">
        <legend className="mb-2 text-sm leading-none font-medium">{t.fascia}</legend>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${prefisso}-dalle`} className="font-normal text-muted-foreground">
              {t.dalle}
            </Label>
            <Input
              id={`${prefisso}-dalle`}
              type="time"
              step={60}
              className="num h-11"
              aria-invalid={errors.dalle ? true : undefined}
              aria-describedby={errors.dalle || errors.alle ? `${prefisso}-fascia-errore` : undefined}
              {...register('dalle', { onChange: durataDallaFascia })}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${prefisso}-alle`} className="font-normal text-muted-foreground">
              {t.alle}
            </Label>
            <Input
              id={`${prefisso}-alle`}
              type="time"
              step={60}
              className="num h-11"
              aria-invalid={errors.alle ? true : undefined}
              aria-describedby={errors.dalle || errors.alle ? `${prefisso}-fascia-errore` : undefined}
              {...register('alle', { onChange: durataDallaFascia })}
            />
          </div>
        </div>
        {unaFascia ? (
          <Button type="button" variant="ghost" className="-ml-3 h-11 px-3 text-muted-foreground" onClick={togliFascia}>
            {t.togliFascia}
          </Button>
        ) : null}
        <ErroreCampo id={`${prefisso}-fascia-errore`} messaggio={errore(errors.dalle?.message ?? errors.alle?.message)} />
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor={`${prefisso}-nota`}>{t.nota}</Label>
        <Textarea id={`${prefisso}-nota`} rows={2} maxLength={2000} placeholder={t.cosaHaiFatto} {...register('nota')} />
        <ErroreCampo id={`${prefisso}-nota-errore`} messaggio={errore(errors.nota?.message)} />
      </div>
    </>
  )
}

type PropsNuovoTempo = {
  progetti: readonly OpzioneProgetto[]
  task: readonly OpzioneTask[]
  oggi: string
  /** Fixed project (the project's Time tab). */
  progettoId?: string
  /** Outlined submit: on a page where another action is the primary one. */
  secondario?: boolean
  /** Inside a sheet: no card of its own. */
  nelFoglio?: boolean
  /** After a successful save (the sheet closes). */
  onRegistrato?: () => void
  /** The page's language (1.53.0); a project's Tempo tab passes none and stays Italian. */
  lingua?: Lingua
}

/** Time logged afterwards. On a project page the project is fixed. */
export function NuovoTempo({
  progetti,
  task,
  oggi,
  progettoId,
  secondario = false,
  nelFoglio = false,
  onRegistrato,
  lingua = 'it',
}: PropsNuovoTempo) {
  const testi = MIO_TEMPO[lingua]
  const prefisso = useId()
  const [errore, setErrore] = useState<string | null>(null)
  const form = useForm<TempoManualeInput>({
    resolver: zodResolver(tempoManualeSchema),
    defaultValues: {
      progetto_id: progettoId ?? (progetti.length === 1 ? progetti[0].id : ''),
      task_id: '',
      data: oggi,
      durata: '',
      dalle: '',
      alle: '',
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
      setErrore(testi.form.connessione)
      return
    }
    if (!esito.ok) {
      setErrore(traduciErroreTempo(esito.errore, lingua) ?? null)
      return
    }
    toast.success(testi.form.registrato)
    // same project and day: the next entry is usually the same context
    reset({ progetto_id: valori.progetto_id, task_id: '', data: valori.data, durata: '', dalle: '', alle: '', nota: '' })
    onRegistrato?.()
  })

  return (
    <form
      onSubmit={invia}
      noValidate
      className={nelFoglio ? 'space-y-4' : 'space-y-4 rounded-xl bg-card p-4'}
      aria-label={testi.registraPassato}
    >
      <CampiTempo
        form={form}
        prefisso={prefisso}
        progetti={progetti}
        task={task}
        oggi={oggi}
        progettoFisso={Boolean(progettoId)}
        lingua={lingua}
      />
      <ErroreModulo testo={errore} />
      <Button type="submit" variant={secondario ? 'outline' : 'default'} className="h-11 w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Plus className="size-4" aria-hidden="true" />
        )}
        {testi.form.registra}
      </Button>
    </form>
  )
}

/**
 * "Registra tempo passato" as an outlined button that opens the same form in
 * a sheet: on a phone the timer stays the one primary action of the page.
 */
export function FoglioNuovoTempo(props: Omit<PropsNuovoTempo, 'secondario' | 'nelFoglio' | 'onRegistrato'>) {
  const [aperto, setAperto] = useState(false)
  const testi = MIO_TEMPO[props.lingua ?? 'it']
  return (
    <FoglioModifica
      aperto={aperto}
      onApertoChange={setAperto}
      trigger={<Button type="button" variant="outline" className="h-11 w-full" />}
      contenutoTrigger={
        <>
          <History className="size-4" aria-hidden="true" />
          {testi.registraPassato}
        </>
      }
      titolo={testi.registraPassato}
      descrizione={testi.form.foglioDescrizione}
    >
      <NuovoTempo {...props} nelFoglio onRegistrato={() => setAperto(false)} />
    </FoglioModifica>
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
  /** The range, when there is one: a stopped timer or "Dalle"–"Alle" typed by hand. */
  inizio: string | null
  fine: string | null
  /** A stopped timer. */
  daTimer: boolean
}

export function ModificaTempo({
  voce,
  progetti,
  task,
  oggi,
  descrizione,
  progettoFisso = false,
  lingua = 'it',
}: {
  voce: VoceModificabile
  progetti: readonly OpzioneProgetto[]
  task: readonly OpzioneTask[]
  oggi: string
  descrizione: string
  progettoFisso?: boolean
  /** The page's language (1.53.0); a project's Tempo tab passes none and stays Italian. */
  lingua?: Lingua
}) {
  const testi = MIO_TEMPO[lingua].form
  const prefisso = useId()
  const [aperto, setAperto] = useState(false)
  const { errore, setErrore, salva } = useSalvataggio()
  const fascia = fasciaDellaVoce(voce)
  // a timer with no range of one day: its start and end stay while its day and minutes do
  const senzaFascia = timerSenzaFascia(voce)
  const valoriIniziali: ModificaTempoInput = {
    id: voce.id,
    progetto_id: voce.progetto_id,
    task_id: voce.task_id ?? '',
    data: voce.data,
    durata: formatDurataInput(voce.minuti),
    dalle: fascia?.dalle ?? '',
    alle: fascia?.alle ?? '',
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
    if (await salva(() => modificaTempo(valori), testi.aggiornato)) setAperto(false)
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
          aria-label={testi.modifica(descrizione)}
          className="size-11 shrink-0 text-muted-foreground"
        />
      }
      contenutoTrigger={<Pencil className="size-4" aria-hidden="true" />}
      titolo={testi.correggi}
      descrizione={
        senzaFascia
          ? testi.daTimerSenzaFascia(testi.orariTimer(senzaFascia))
          : voce.daTimer
            ? testi.daTimer
            : testi.ricalcolo
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
          lingua={lingua}
        />
        <ErroreModulo testo={traduciErroreTempo(errore, lingua) ?? null} />
        <BottoneSalva inCorso={isSubmitting}>{testi.salva}</BottoneSalva>
      </form>
    </FoglioModifica>
  )
}

/** Two taps on purpose: the first arms, the second deletes. */
export function EliminaTempo({
  id,
  descrizione,
  lingua = 'it',
}: {
  id: string
  descrizione: string
  /** The page's language (1.53.0); a project's Tempo tab passes none and stays Italian. */
  lingua?: Lingua
}) {
  const testi = MIO_TEMPO[lingua].form
  const [pronto, setPronto] = useState(false)
  const [inCorso, avvia] = useTransition()

  if (!pronto) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 text-muted-foreground"
        aria-label={testi.elimina(descrizione)}
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
            if (esito.ok) toast.success(testi.eliminata)
            else toast.error(traduciErroreTempo(esito.errore, lingua))
          } catch {
            toast.error(testi.connessione)
          }
          setPronto(false)
        })
      }
    >
      {testi.conferma}
    </Button>
  )
}
