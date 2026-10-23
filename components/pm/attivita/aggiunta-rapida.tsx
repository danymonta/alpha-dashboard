'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle, Plus, UserPlus } from 'lucide-react'
import { useId, useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'

import { aggiungiTask } from '@/app/(app)/progetti/[id]/actions'
import { useAttivita } from '@/components/pm/attivita/contesto'
import { SceltaMultipla } from '@/components/form/scelta-multipla'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { nuovoTaskSchema, type NuovoTaskInput } from '@/lib/validation/progetti'

/**
 * One line, Enter to add: the title is enough, everything else goes in the
 * task sheet later. The person button opens the members, to give the task to
 * one or more of them right away. Focus stays in the field to add the next one.
 */
export function AggiuntaRapida({
  progettoId,
  tasklistId = null,
  parentId = null,
  etichetta,
  segnaposto = 'Aggiungi un task',
}: {
  progettoId: string
  tasklistId?: string | null
  parentId?: string | null
  /** Accessible name of the field, e.g. "Nuovo task in Onboarding". */
  etichetta: string
  segnaposto?: string
}) {
  const id = useId()
  const { membri } = useAttivita()
  const [conPersone, setConPersone] = useState(false)
  const valori: NuovoTaskInput = {
    progetto_id: progettoId,
    tasklist_id: tasklistId,
    parent_id: parentId,
    titolo: '',
    assegnatari: [],
  }
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setFocus,
    control,
    formState: { errors, isSubmitting },
  } = useForm<NuovoTaskInput>({ resolver: zodResolver(nuovoTaskSchema), defaultValues: valori })
  // one checkbox gives a string (or false), several an array: read it as the schema does
  const scelti = useWatch({ control, name: 'assegnatari' })
  const quanti = nuovoTaskSchema.shape.assegnatari.safeParse(scelti).data?.length ?? 0

  const invia = handleSubmit(async (v) => {
    let esito
    try {
      esito = await aggiungiTask(v)
    } catch {
      setError('titolo', { message: 'Connessione assente. Riprova.' })
      return
    }
    if (!esito.ok) {
      setError('titolo', { message: esito.errore })
      return
    }
    toast.success('Task aggiunto')
    reset(valori)
    setConPersone(false)
    setFocus('titolo')
  })

  return (
    <form onSubmit={invia} noValidate className="space-y-2">
      <div className="flex gap-2">
        <label htmlFor={id} className="sr-only">
          {etichetta}
        </label>
        <Input
          id={id}
          className="h-11 min-w-0 flex-1"
          placeholder={segnaposto}
          autoComplete="off"
          aria-invalid={errors.titolo ? true : undefined}
          aria-describedby={errors.titolo ? `${id}-errore` : undefined}
          {...register('titolo')}
        />
        <Button
          type="button"
          variant="outline"
          className={cn('h-11 shrink-0 gap-1 px-3', quanti > 0 && 'border-primary')}
          aria-expanded={conPersone}
          aria-controls={`${id}-persone`}
          aria-label={quanti > 0 ? `A chi assegnarlo: ${quanti === 1 ? '1 persona scelta' : `${quanti} persone scelte`}` : 'A chi assegnarlo'}
          onClick={() => setConPersone((v) => !v)}
        >
          <UserPlus className="size-4" aria-hidden="true" />
          {quanti > 0 ? (
            <span className="num" aria-hidden="true">
              {quanti}
            </span>
          ) : null}
        </Button>
        <Button type="submit" variant="outline" className="h-11 shrink-0" disabled={isSubmitting}>
          {isSubmitting ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Plus className="size-4" aria-hidden="true" />
          )}
          Aggiungi
        </Button>
      </div>
      {errors.titolo?.message ? (
        <p id={`${id}-errore`} role="alert" className="text-sm text-status-critical">
          {errors.titolo.message}
        </p>
      ) : null}
      {/* the checkboxes stay mounted while closed: the choice survives closing it */}
      <div id={`${id}-persone`} hidden={!conPersone}>
        <SceltaMultipla
          legenda="Assegnato a"
          opzioni={membri.map((m) => ({ valore: m.id, etichetta: m.nome }))}
          registrazione={register('assegnatari')}
          errore={errors.assegnatari?.message}
          colonne={2}
        />
        <p className="mt-1.5 text-xs text-muted-foreground">Anche più di una persona, tra i membri del progetto.</p>
      </div>
    </form>
  )
}
