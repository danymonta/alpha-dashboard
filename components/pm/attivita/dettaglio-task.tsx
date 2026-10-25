'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Lock, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useState, useTransition, type ReactElement, type ReactNode } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'

import { eliminaTask, modificaTask } from '@/app/(app)/progetti/[id]/actions'
import { useLingua, useTesti } from '@/components/i18n/lingua-provider'
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
import { ATTIVITA } from '@/lib/i18n/testi/attivita'
import { traduciErroreProgetti } from '@/lib/i18n/testi/progetti'
import { formatStima } from '@/lib/progetti'
import {
  PRIORITA,
  STATI_TASK,
  modificaTaskSchema,
  nuovoTaskSchema,
  type ModificaTaskInput,
} from '@/lib/validation/progetti'

// the read-only sheet disables everything through its fieldset: selects must look it too
const SELECT = `${CLASSE_SELECT} disabled:cursor-not-allowed disabled:opacity-50`


/**
 * Every field of a task in a side sheet, opened from its title. Who may not
 * change it sees the same sheet read-only (RLS would refuse the save anyway).
 */
export function DettaglioTask({
  task,
  trigger,
  contenutoTrigger,
  apriSubito = false,
  onChiuso,
}: {
  task: TaskVista
  trigger: ReactElement
  contenutoTrigger: ReactNode
  /** Opened by a link (?task, 05/10/2026): the sheet opens by itself. */
  apriSubito?: boolean
  onChiuso?: () => void
}) {
  const t = useTesti(ATTIVITA)
  const [aperto, setAperto] = useState(false)
  // one frame later: the row scrolls into sight first, while the page can still scroll
  useEffect(() => {
    if (!apriSubito) return
    const fotogramma = requestAnimationFrame(() => setAperto(true))
    return () => cancelAnimationFrame(fotogramma)
  }, [apriSubito])
  return (
    <FoglioModifica
      aperto={aperto}
      onApertoChange={(v) => {
        setAperto(v)
        if (!v) onChiuso?.()
      }}
      trigger={trigger}
      contenutoTrigger={contenutoTrigger}
      titolo={task.parent_id ? t.sottoTask : 'Task'}
    >
      {/* saved or deleted from the sheet: closed like the X, ?task leaves the address */}
      <ModuloTask
        task={task}
        chiudi={() => {
          setAperto(false)
          onChiuso?.()
        }}
      />
    </FoglioModifica>
  )
}

function ModuloTask({ task, chiudi }: { task: TaskVista; chiudi: () => void }) {
  const t = useTesti(ATTIVITA)
  const lingua = useLingua()
  const opzioniStato = STATI_TASK.map((s) => ({ valore: s, etichetta: t.statiTask[s] }))
  const opzioniPriorita = PRIORITA.map((p) => ({ valore: p, etichetta: t.priorita[p] }))
  const tradotto = (messaggio: string | undefined) => traduciErroreProgetti(messaggio, lingua)
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
    }, t.taskSalvato)
    if (!salvato) return
    // saved without whoever left the project meanwhile: say who
    if (avviso) toast.warning(tradotto(avviso))
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
              {t.bloccato}
            </p>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor={`t-titolo-${task.id}`}>{t.titolo}</Label>
            <Input id={`t-titolo-${task.id}`} className="h-11" {...register('titolo')} />
            <ErroreCampo id={`t-titolo-errore-${task.id}`} messaggio={tradotto(errors.titolo?.message)} />
          </div>

          <SceltaRapida legenda={t.stato} opzioni={opzioniStato} registrazione={register('stato')} colonne={2} />
          <SceltaRapida legenda={t.prioritaLegenda} opzioni={opzioniPriorita} registrazione={register('priorita')} />

          {/* several people can share a task; read-only, the chips look disabled like the selects */}
          <div className="[&_label:has(:disabled)]:cursor-not-allowed [&_label:has(:disabled)]:opacity-50">
            <SceltaMultipla
              legenda={t.assegnatoA}
              opzioni={a.membri.map((m) => ({ valore: m.id, etichetta: m.nome }))}
              registrazione={register('assegnatari')}
              errore={tradotto(errors.assegnatari?.message)}
              colonne={2}
            />
            <p className="mt-1.5 text-xs text-muted-foreground">{t.anchePiuNessuna}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor={`t-inizio-${task.id}`}>{t.inizio}</Label>
              <Input id={`t-inizio-${task.id}`} type="date" className="num h-11" {...register('data_inizio')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`t-scadenza-${task.id}`}>{t.scadenza}</Label>
              <Input id={`t-scadenza-${task.id}`} type="date" className="num h-11" {...register('scadenza')} />
            </div>
          </div>
          <ErroreCampo id={`t-date-errore-${task.id}`} messaggio={tradotto(errors.data_inizio?.message ?? errors.scadenza?.message)} />

          <div className="space-y-1.5">
            <Label htmlFor={`t-stima-${task.id}`}>{t.stimaCampo}</Label>
            <Input
              id={`t-stima-${task.id}`}
              className="num h-11"
              placeholder={t.stimaSegnaposto}
              autoComplete="off"
              {...register('stima_minuti')}
            />
            <ErroreCampo id={`t-stima-errore-${task.id}`} messaggio={tradotto(errors.stima_minuti?.message)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`t-principale-${task.id}`}>{t.principale}</Label>
            <select
              id={`t-principale-${task.id}`}
              className={SELECT}
              disabled={figli.length > 0}
              {...register('parent_id')}
            >
              <option value="">{t.nessunoPrincipale}</option>
              {principali.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.titolo}
                </option>
              ))}
            </select>
            {figli.length > 0 ? (
              <p className="text-xs text-muted-foreground">{t.haSottoTask}</p>
            ) : null}
            <ErroreCampo id={`t-principale-errore-${task.id}`} messaggio={tradotto(errors.parent_id?.message)} />
          </div>

          {principale ? (
            <p className="text-xs text-muted-foreground">{t.nellaLista}</p>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor={`t-lista-${task.id}`}>{t.lista}</Label>
              <select id={`t-lista-${task.id}`} className={SELECT} {...register('tasklist_id')}>
                <option value="">{t.senzaLista}</option>
                {a.liste.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.nome}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor={`t-descrizione-${task.id}`}>{t.descrizione}</Label>
            <Textarea id={`t-descrizione-${task.id}`} rows={4} {...register('descrizione')} />
            <ErroreCampo id={`t-descrizione-errore-${task.id}`} messaggio={tradotto(errors.descrizione?.message)} />
          </div>

          {modificabile ? (
            <>
              <ErroreModulo testo={tradotto(errore ?? undefined) ?? null} />
              <BottoneSalva inCorso={isSubmitting}>{t.salvaTask}</BottoneSalva>
            </>
          ) : null}
        </fieldset>
      </form>

      {task.parent_id === null ? (
        <section aria-labelledby={`sotto-${task.id}`} className="space-y-2 border-t border-border pt-4">
          <h3 id={`sotto-${task.id}`} className="text-sm font-medium">
            {t.sottoTask} <span className="num font-normal text-muted-foreground">{figli.length}</span>
          </h3>
          {figli.length > 0 ? (
            <ul className="divide-y divide-border rounded-lg bg-muted/40">
              {figli.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className={f.stato === 'completato' ? 'text-muted-foreground line-through' : undefined}>{f.titolo}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    <StatoTaskBadge stato={f.stato} lingua={lingua} />
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <AggiuntaRapida
            progettoId={task.progetto_id}
            parentId={task.id}
            etichetta={t.nuovoSottoTaskDi(task.titolo)}
            segnaposto={t.aggiungiSottoTask}
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
  const t = useTesti(ATTIVITA)
  const lingua = useLingua()
  const [pronto, setPronto] = useState(false)
  const [inCorso, avvia] = useTransition()

  return (
    <div className="space-y-2 border-t border-border pt-4">
      {pronto ? (
        <p className="text-sm text-muted-foreground">
          {figli > 0 ? t.eliminaConFigli(figli) : t.nonAnnullabile}
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
              onErrore(traduciErroreProgetti('Connessione assente. Riprova.', lingua) ?? null)
              return
            }
            if (!esito.ok) {
              onErrore(traduciErroreProgetti(esito.errore, lingua) ?? null)
              setPronto(false)
              return
            }
            toast.success(t.taskEliminato)
            onEliminato()
          })
        }}
      >
        <Trash2 className="size-4" aria-hidden="true" />
        {pronto ? t.confermaElimina : t.eliminaTask}
      </Button>
    </div>
  )
}
