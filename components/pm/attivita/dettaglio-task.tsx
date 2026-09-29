'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Lock, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, useTransition, type ReactElement, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'

import { eliminaTask, modificaTask } from '@/app/(app)/progetti/[id]/actions'
import { AggiuntaRapida } from '@/components/pm/attivita/aggiunta-rapida'
import { puoEliminare, puoModificare, useAttivita, type TaskVista } from '@/components/pm/attivita/contesto'
import { StatoTaskBadge } from '@/components/pm/attivita/meta-task'
import { ErroreCampo } from '@/components/form/errore-campo'
import { BottoneSalva, CLASSE_SELECT, ErroreModulo, FoglioModifica, useSalvataggio } from '@/components/form/foglio-modifica'
import { SceltaMultipla } from '@/components/form/scelta-multipla'
import { SceltaRapida } from '@/components/form/scelta-rapida'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ETICHETTA_PRIORITA, ETICHETTA_STATO_TASK, formatStima } from '@/lib/progetti'
import {
  PRIORITA,
  STATI_TASK,
  modificaTaskSchema,
  nuovoTaskSchema,
  type ModificaTaskInput,
} from '@/lib/validation/progetti'

// the read-only sheet disables everything through its fieldset: selects must look it too
const SELECT = `${CLASSE_SELECT} disabled:cursor-not-allowed disabled:opacity-50`

const OPZIONI_STATO = STATI_TASK.map((s) => ({ valore: s, etichetta: ETICHETTA_STATO_TASK[s] }))
const OPZIONI_PRIORITA = PRIORITA.map((p) => ({ valore: p, etichetta: ETICHETTA_PRIORITA[p] }))

/**
 * Every field of a task in a side sheet, opened from its title. Who may not
 * change it sees the same sheet read-only (RLS would refuse the save anyway).
 */
export function DettaglioTask({
  task,
  trigger,
  contenutoTrigger,
}: {
  task: TaskVista
  trigger: ReactElement
  contenutoTrigger: ReactNode
}) {
  const [aperto, setAperto] = useState(false)
  return (
    <FoglioModifica
      aperto={aperto}
      onApertoChange={setAperto}
      trigger={trigger}
      contenutoTrigger={contenutoTrigger}
      titolo={task.parent_id ? 'Sotto-task' : 'Task'}
    >
      <ModuloTask task={task} chiudi={() => setAperto(false)} />
    </FoglioModifica>
  )
}

function ModuloTask({ task, chiudi }: { task: TaskVista; chiudi: () => void }) {
  const a = useAttivita()
  const modificabile = puoModificare(a, task)
  const eliminabile = puoEliminare(a, task)
  const figli = a.tasks.filter((t) => t.parent_id === task.id)
  const principali = a.tasks.filter((t) => t.parent_id === null && t.id !== task.id)
  const { errore, setErrore, salva } = useSalvataggio()
  // only people still in the project: one taken out has no chip to untick
  const nelProgetto = useMemo(() => new Set(a.membri.map((m) => m.id)), [a.membri])
  const {
    register,
    handleSubmit,
    control,
    getValues,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ModificaTaskInput>({
    resolver: zodResolver(modificaTaskSchema),
    defaultValues: {
      id: task.id,
      titolo: task.titolo,
      descrizione: task.descrizione ?? '',
      stato: task.stato,
      priorita: task.priorita,
      assegnatari: task.assegnatari.filter((p) => nelProgetto.has(p)),
      data_inizio: task.data_inizio ?? '',
      scadenza: task.scadenza ?? '',
      stima_minuti: formatStima(task.stima_minuti),
      tasklist_id: task.tasklist_id ?? '',
      parent_id: task.parent_id ?? '',
    },
  })
  const principale = useWatch({ control, name: 'parent_id' })

  // someone leaves the project while the sheet is open (Realtime refresh): off the choice too
  useEffect(() => {
    const scelti = nuovoTaskSchema.shape.assegnatari.safeParse(getValues('assegnatari')).data ?? []
    const rimasti = scelti.filter((p) => nelProgetto.has(p))
    if (rimasti.length < scelti.length) setValue('assegnatari', rimasti)
  }, [nelProgetto, getValues, setValue])

  const invia = handleSubmit(async (valori) => {
    let avviso: string | undefined
    const salvato = await salva(async () => {
      const esito = await modificaTask(valori)
      if (esito.ok) avviso = esito.avviso
      return esito
    }, 'Task salvato')
    if (!salvato) return
    // saved without whoever left the project meanwhile: say who
    if (avviso) toast.warning(avviso)
    chiudi()
  })

  return (
    <div className="space-y-6">
      <form onSubmit={invia} noValidate>
        {/* one switch for the read-only view: every control inside follows the fieldset */}
        <fieldset disabled={!modificabile} className="space-y-4">
          {!modificabile ? (
            <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
              <Lock className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Lo modifica chi gestisce il progetto, chi l’ha creato o una delle persone a cui è assegnato.
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor={`t-titolo-${task.id}`}>Titolo</Label>
            <Input id={`t-titolo-${task.id}`} className="h-11" {...register('titolo')} />
            <ErroreCampo id={`t-titolo-errore-${task.id}`} messaggio={errors.titolo?.message} />
          </div>

          <SceltaRapida legenda="Stato" opzioni={OPZIONI_STATO} registrazione={register('stato')} colonne={2} />
          <SceltaRapida legenda="Priorità" opzioni={OPZIONI_PRIORITA} registrazione={register('priorita')} />

          {/* several people can share a task; read-only, the chips look disabled like the selects */}
          <div className="[&_label:has(:disabled)]:cursor-not-allowed [&_label:has(:disabled)]:opacity-50">
            <SceltaMultipla
              legenda="Assegnato a"
              opzioni={a.membri.map((m) => ({ valore: m.id, etichetta: m.nome }))}
              registrazione={register('assegnatari')}
              errore={errors.assegnatari?.message}
              colonne={2}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">
              Anche più di una persona, tra i membri del progetto. Nessuna scelta: senza assegnatario.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor={`t-inizio-${task.id}`}>Inizio</Label>
              <Input id={`t-inizio-${task.id}`} type="date" className="num h-11" {...register('data_inizio')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`t-scadenza-${task.id}`}>Scadenza</Label>
              <Input id={`t-scadenza-${task.id}`} type="date" className="num h-11" {...register('scadenza')} />
            </div>
          </div>
          <ErroreCampo id={`t-date-errore-${task.id}`} messaggio={errors.data_inizio?.message ?? errors.scadenza?.message} />

          <div className="space-y-1.5">
            <Label htmlFor={`t-stima-${task.id}`}>Stima</Label>
            <Input
              id={`t-stima-${task.id}`}
              className="num h-11"
              placeholder="45 min, 2 h, 1 h 30 min"
              autoComplete="off"
              {...register('stima_minuti')}
            />
            <ErroreCampo id={`t-stima-errore-${task.id}`} messaggio={errors.stima_minuti?.message} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`t-principale-${task.id}`}>Task principale</Label>
            <select
              id={`t-principale-${task.id}`}
              className={SELECT}
              disabled={figli.length > 0}
              {...register('parent_id')}
            >
              <option value="">Nessuno: è un task principale</option>
              {principali.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.titolo}
                </option>
              ))}
            </select>
            {figli.length > 0 ? (
              <p className="text-xs text-muted-foreground">Ha dei sotto-task: resta un task principale.</p>
            ) : null}
            <ErroreCampo id={`t-principale-errore-${task.id}`} messaggio={errors.parent_id?.message} />
          </div>

          {principale ? (
            <p className="text-xs text-muted-foreground">Un sotto-task sta nella lista del suo task principale.</p>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor={`t-lista-${task.id}`}>Lista</Label>
              <select id={`t-lista-${task.id}`} className={SELECT} {...register('tasklist_id')}>
                <option value="">Senza lista</option>
                {a.liste.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor={`t-descrizione-${task.id}`}>Descrizione</Label>
            <Textarea id={`t-descrizione-${task.id}`} rows={4} {...register('descrizione')} />
            <ErroreCampo id={`t-descrizione-errore-${task.id}`} messaggio={errors.descrizione?.message} />
          </div>

          {modificabile ? (
            <>
              <ErroreModulo testo={errore} />
              <BottoneSalva inCorso={isSubmitting}>Salva il task</BottoneSalva>
            </>
          ) : null}
        </fieldset>
      </form>

      {task.parent_id === null ? (
        <section aria-labelledby={`sotto-${task.id}`} className="space-y-2 border-t border-border pt-4">
          <h3 id={`sotto-${task.id}`} className="text-sm font-medium">
            Sotto-task <span className="num font-normal text-muted-foreground">{figli.length}</span>
          </h3>
          {figli.length > 0 ? (
            <ul className="divide-y divide-border rounded-lg bg-muted/40">
              {figli.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className={f.stato === 'completato' ? 'text-muted-foreground line-through' : undefined}>{f.titolo}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    <StatoTaskBadge stato={f.stato} />
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <AggiuntaRapida
            progettoId={task.progetto_id}
            parentId={task.id}
            etichetta={`Nuovo sotto-task di ${task.titolo}`}
            segnaposto="Aggiungi un sotto-task"
          />
        </section>
      ) : null}

      {eliminabile ? (
        <EliminaTask id={task.id} figli={figli.length} onEliminato={chiudi} onErrore={setErrore} />
      ) : null}
    </div>
  )
}

/** Two taps on purpose: the first arms, the second deletes. */
function EliminaTask({
  id,
  figli,
  onEliminato,
  onErrore,
}: {
  id: string
  figli: number
  onEliminato: () => void
  onErrore: (testo: string | null) => void
}) {
  const [pronto, setPronto] = useState(false)
  const [inCorso, avvia] = useTransition()

  return (
    <div className="space-y-2 border-t border-border pt-4">
      {pronto ? (
        <p className="text-sm text-muted-foreground">
          {figli > 0
            ? `Se ne vanno anche i suoi ${figli === 1 ? 'sotto-task' : `${figli} sotto-task`}. Non si può annullare.`
            : 'Non si può annullare.'}
        </p>
      ) : null}
      <Button
        type="button"
        variant={pronto ? 'destructive' : 'outline'}
        className="h-11 w-full"
        disabled={inCorso}
        onBlur={() => setPronto(false)}
        onClick={() => {
          if (!pronto) {
            setPronto(true)
            return
          }
          avvia(async () => {
            let esito
            try {
              esito = await eliminaTask({ id })
            } catch {
              onErrore('Connessione assente. Riprova.')
              return
            }
            if (!esito.ok) {
              onErrore(esito.errore)
              setPronto(false)
              return
            }
            toast.success('Task eliminato')
            onEliminato()
          })
        }}
      >
        <Trash2 className="size-4" aria-hidden="true" />
        {pronto ? 'Conferma: elimina il task' : 'Elimina il task'}
      </Button>
    </div>
  )
}
