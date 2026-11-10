'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useEffect, useId } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { aggiungiMioTask } from '@/app/(app)/task/actions'
import { CLASSE_SELECT } from '@/components/form/foglio-modifica'
import { SceltaRapida } from '@/components/form/scelta-rapida'
import { useLingua } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { BACHECA_TASK, traduciErroreTask } from '@/lib/i18n/testi/task'
import { PRIORITA, nuovoMioTaskSchema, type NuovoMioTaskInput } from '@/lib/validation/progetti'

export type ProgettoMio = { id: string; nome: string }

type Props = {
  aperto: boolean
  onAperto: (aperto: boolean) => void
  /** The projects I am a member of: a task lives in one. */
  progetti: ProgettoMio[]
  /** The due date the column gives (today, tomorrow…), '' for none. */
  scadenza: string
  /** The column the sheet was opened from, for the toast. */
  colonna: string
  onAggiunto: (titolo: string) => void
}

/**
 * «Aggiungi un task» from a column of the board (1.75.0): title, project,
 * due date (the column's) and priority. Assigned to me; the rest is in the
 * task's sheet, in its project.
 */
export function NuovoMioTask({ aperto, onAperto, progetti, scadenza, colonna, onAggiunto }: Props) {
  const lingua = useLingua()
  const t = BACHECA_TASK[lingua]
  const id = useId()
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<NuovoMioTaskInput>({
    resolver: zodResolver(nuovoMioTaskSchema),
    defaultValues: { progetto_id: progetti.length === 1 ? progetti[0].id : '', titolo: '', scadenza, priorita: 'media' },
  })

  // every opening starts from the column it came from; the project chosen last stays
  useEffect(() => {
    if (aperto) reset((v) => ({ ...v, titolo: '', scadenza, priorita: 'media' }))
  }, [aperto, scadenza, reset])

  async function invia(valori: NuovoMioTaskInput) {
    let esito: Awaited<ReturnType<typeof aggiungiMioTask>>
    try {
      esito = await aggiungiMioTask(valori)
    } catch {
      setError('root', { message: traduciErroreTask('Connessione assente. Riprova.', lingua) })
      return
    }
    if (!esito.ok) {
      setError('root', { message: traduciErroreTask(esito.errore, lingua) })
      return
    }
    toast.success(t.aggiunto, { description: `${valori.titolo} · ${colonna}` })
    onAggiunto(valori.titolo.trim())
    onAperto(false)
  }

  const errore = (messaggio: string | undefined) => (messaggio ? traduciErroreTask(messaggio, lingua) : undefined)

  return (
    <Sheet open={aperto} onOpenChange={onAperto}>
      <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t.foglio.titolo}</SheetTitle>
          <SheetDescription>{t.foglio.descrizione}</SheetDescription>
        </SheetHeader>
        {progetti.length === 0 ? (
          <p className="px-4 text-sm text-muted-foreground">{t.foglio.nessunProgetto}</p>
        ) : (
          <form onSubmit={handleSubmit(invia)} className="space-y-4 px-4 pb-6" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-titolo`}>{t.foglio.campoTitolo}</Label>
              <Input
                id={`${id}-titolo`}
                className="h-11"
                placeholder={t.foglio.segnaposto}
                autoComplete="off"
                aria-invalid={errors.titolo ? true : undefined}
                aria-describedby={errors.titolo ? `${id}-titolo-errore` : undefined}
                {...register('titolo')}
              />
              {errors.titolo ? (
                <p id={`${id}-titolo-errore`} className="text-sm text-destructive">
                  {errore(errors.titolo.message)}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${id}-progetto`}>{t.foglio.campoProgetto}</Label>
              <select
                id={`${id}-progetto`}
                className={CLASSE_SELECT}
                aria-invalid={errors.progetto_id ? true : undefined}
                aria-describedby={errors.progetto_id ? `${id}-progetto-errore` : undefined}
                {...register('progetto_id')}
              >
                <option value="">{t.foglio.scegliProgetto}</option>
                {progetti.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
              {errors.progetto_id ? (
                <p id={`${id}-progetto-errore`} className="text-sm text-destructive">
                  {errore(errors.progetto_id.message)}
                </p>
              ) : null}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`${id}-scadenza`}>{t.foglio.campoScadenza}</Label>
              <Input id={`${id}-scadenza`} type="date" className="num h-11" {...register('scadenza')} />
              <p className="text-xs text-muted-foreground">{t.foglio.senzaScadenza}</p>
            </div>

            <SceltaRapida
              legenda={t.foglio.campoPriorita}
              opzioni={PRIORITA.map((p) => ({ valore: p, etichetta: t.priorita[p] }))}
              registrazione={register('priorita')}
            />

            {errors.root ? (
              <p role="alert" className="text-sm text-destructive">
                {errors.root.message}
              </p>
            ) : null}

            <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
              {isSubmitting ? t.foglio.salvo : t.foglio.salva}
            </Button>
          </form>
        )}
      </SheetContent>
    </Sheet>
  )
}
