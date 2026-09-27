'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle, Plus } from 'lucide-react'
import { useId } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { aggiungiTask } from '@/app/(app)/progetti/[id]/actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { nuovoTaskSchema, type NuovoTaskInput } from '@/lib/validation/progetti'

/**
 * One line, Enter to add: the title is enough, everything else goes in the
 * task sheet later. Focus stays in the field to add the next one right away.
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
  const valori: NuovoTaskInput = { progetto_id: progettoId, tasklist_id: tasklistId, parent_id: parentId, titolo: '' }
  const {
    register,
    handleSubmit,
    reset,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<NuovoTaskInput>({ resolver: zodResolver(nuovoTaskSchema), defaultValues: valori })

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
    setFocus('titolo')
  })

  return (
    <form onSubmit={invia} noValidate className="space-y-1">
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
    </form>
  )
}
