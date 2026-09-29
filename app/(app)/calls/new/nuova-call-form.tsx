'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle, TriangleAlert } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'

import { fissaCall } from '@/app/(app)/calls/new/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { SceltaRapida } from '@/components/form/scelta-rapida'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { aggiungiGiorni, etichettaGiorno } from '@/lib/date'
import { cn } from '@/lib/utils'
import {
  ETICHETTA_FONTE,
  ETICHETTA_TIPO_CALL,
  FONTI,
  GIORNI_AVANTI_CALL,
  GIORNI_INDIETRO_CALL,
  nuovaCallSchema,
  type NuovaCall,
  type NuovaCallInput,
} from '@/lib/validation/call'

type Closer = { id: string; nome: string }

type Props = {
  oggi: string
  closers: Closer[]
  closerPredefinito: string
}

const OPZIONI_FONTE = FONTI.map((f) => ({ valore: f, etichetta: ETICHETTA_FONTE[f] }))

// One look for every option on this form: unselected ones are outlined, the
// selected one is tinted with a bordeaux ring. The solid fill is only for
// "Fissa la call", so the choice never reads as the button to press.
const OPZIONE = 'h-11 font-normal border-border bg-transparent text-foreground hover:bg-accent'
const OPZIONE_SCELTA = 'border-primary bg-primary/15 ring-1 ring-primary hover:bg-primary/15'

// Same look on the radio groups (SceltaRapida): its labels are restyled from
// here. Descendant selectors outrank the label's own classes, and the keyboard
// focus ring stays on top of the selected option.
const SCELTE = cn(
  '[&_label]:border-border [&_label]:bg-transparent',
  '[&_label:has(:checked)]:border-primary [&_label:has(:checked)]:bg-primary/15 [&_label:has(:checked)]:text-foreground',
  '[&_label:has(:checked)]:ring-1 [&_label:has(:checked)]:ring-primary',
  '[&_label:has(:checked:focus-visible)]:ring-3 [&_label:has(:checked:focus-visible)]:ring-ring/50',
)

export function NuovaCallForm({ oggi, closers, closerPredefinito }: Props) {
  const router = useRouter()
  const [erroreServer, setErroreServer] = useState<string | null>(null)

  const {
    control,
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<NuovaCallInput, unknown, NuovaCall>({
    resolver: zodResolver(nuovaCallSchema),
    defaultValues: {
      nome: '',
      instagram_handle: '',
      // fonte has no default: the bookings by source (prenotate da inbound e da
      // outbound) are counted from it, so the setter always picks it.

      // The setter books discovery calls only: strategy calls are not done with
      // leads (Dany, 29/09/2026). Not a choice on screen, the server still checks it.
      tipo: 'discovery',
      data: oggi,
      ora: '',
      closer_id: closerPredefinito,
    },
  })

  const dataScelta = useWatch({ control, name: 'data' })
  const domani = aggiungiGiorni(oggi, 1)

  const invia = handleSubmit(async (valori) => {
    setErroreServer(null)

    let esito
    try {
      esito = await fissaCall(valori)
    } catch {
      setErroreServer('Connessione assente. Controlla la rete e riprova.')
      return
    }

    if (!esito.ok) {
      for (const [campo, messaggio] of Object.entries(esito.campi ?? {})) {
        setError(campo as keyof NuovaCallInput, { message: messaggio })
      }
      setErroreServer(esito.errore)
      return
    }

    toast.success(
      `${ETICHETTA_TIPO_CALL[valori.tipo]} call con ${valori.nome}: ${etichettaGiorno(valori.data, oggi).toLowerCase()} alle ${valori.ora}`,
      {
        description: esito.leadEsistente
          ? 'Lead già presente: la call si aggiunge al suo storico.'
          : 'Lead e call creati.',
      },
    )
    router.push('/calls')
  })

  return (
    <form onSubmit={invia} noValidate className="space-y-6" data-tour="nuova-call">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="nome">Nome del lead</Label>
          <Input
            id="nome"
            autoComplete="off"
            autoCapitalize="words"
            className="h-11"
            aria-invalid={errors.nome ? true : undefined}
            aria-describedby={errors.nome ? 'nome-errore' : undefined}
            {...register('nome')}
          />
          <ErroreCampo id="nome-errore" messaggio={errors.nome?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="instagram_handle">
            Handle Instagram{' '}
            <span className="font-normal text-muted-foreground">(facoltativo)</span>
          </Label>
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground"
            >
              @
            </span>
            <Input
              id="instagram_handle"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="nome.utente"
              className="h-11 pl-7"
              aria-invalid={errors.instagram_handle ? true : undefined}
              aria-describedby={errors.instagram_handle ? 'handle-aiuto handle-errore' : 'handle-aiuto'}
              {...register('instagram_handle')}
            />
          </div>
          <p id="handle-aiuto" className="text-xs text-muted-foreground">
            Se il lead ha già una call, la nuova si aggiunge al suo storico.
          </p>
          <ErroreCampo id="handle-errore" messaggio={errors.instagram_handle?.message} />
        </div>
      </div>

      <div className={SCELTE}>
        <SceltaRapida
          legenda="Fonte"
          opzioni={OPZIONI_FONTE}
          registrazione={register('fonte')}
          errore={errors.fonte?.message}
          aiuto="Scegli da dove arriva il lead: serve a contare le call prenotate da inbound e da outbound."
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Quando</legend>
        <div className="grid grid-cols-2 gap-2">
          {[
            { etichetta: 'Oggi', valore: oggi },
            { etichetta: 'Domani', valore: domani },
          ].map(({ etichetta, valore }) => (
            <Button
              key={etichetta}
              type="button"
              variant="outline"
              aria-pressed={dataScelta === valore}
              className={cn(OPZIONE, dataScelta === valore && OPZIONE_SCELTA)}
              onClick={() => setValue('data', valore, { shouldValidate: true })}
            >
              {etichetta}
            </Button>
          ))}
        </div>
        <div className="grid grid-cols-[3fr_2fr] gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="data" className="sr-only">
              Data
            </Label>
            <Input
              id="data"
              type="date"
              min={aggiungiGiorni(oggi, -GIORNI_INDIETRO_CALL)}
              max={aggiungiGiorni(oggi, GIORNI_AVANTI_CALL)}
              className="num h-11"
              aria-invalid={errors.data ? true : undefined}
              {...register('data')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ora" className="sr-only">
              Ora
            </Label>
            <Input
              id="ora"
              type="time"
              className="num h-11"
              aria-invalid={errors.ora ? true : undefined}
              {...register('ora')}
            />
          </div>
        </div>
        <ErroreCampo id="data-errore" messaggio={errors.data?.message ?? errors.ora?.message} />
      </fieldset>

      <div className={SCELTE}>
        <SceltaRapida
          legenda="Closer"
          opzioni={closers.map((c) => ({ valore: c.id, etichetta: c.nome }))}
          registrazione={register('closer_id')}
          errore={errors.closer_id?.message}
          colonne={2}
        />
      </div>

      {erroreServer ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-status-critical/10 px-3 py-2.5 text-sm text-status-critical"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {erroreServer}
        </p>
      ) : null}

      <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : null}
        Fissa la call
      </Button>
    </form>
  )
}
