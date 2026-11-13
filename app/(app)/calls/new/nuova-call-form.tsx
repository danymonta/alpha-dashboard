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
import { useLingua } from '@/components/i18n/lingua-provider'
import { aggiungiGiorni } from '@/lib/date'
import { etichettaGiornoIn } from '@/lib/i18n/date'
import { traduciErrore } from '@/lib/i18n/testi/errori-economics'
import { ESITO, NUOVA_CALL } from '@/lib/i18n/testi/esito'
import { ETICHETTE } from '@/lib/i18n/testi/etichette'
import { cn } from '@/lib/utils'
import {
  FONTI,
  GIORNI_AVANTI_CALL,
  GIORNI_INDIETRO_CALL,
  GIORNI_INDIETRO_CALL_ADMIN,
  nuovaCallAdminSchema,
  nuovaCallSchema,
  type NuovaCall,
  type NuovaCallInput,
} from '@/lib/validation/call'

type Persona = { id: string; nome: string }

type Props = {
  oggi: string
  /** The day the form opens on (?data=, e.g. from the closer's day). */
  dataIniziale?: string
  /**
   * Starting values from a calendar booking (?ora=, ?nome=, ?handle=, «Aggiungi alla pipeline»):
   * already checked by the page, and checked again by the schema on save.
   */
  oraIniziale?: string
  nomeIniziale?: string
  handleIniziale?: string
  closers: Persona[]
  closerPredefinito: string
  /**
   * Admin only: who set the call, "Io" first (the default). null for the
   * setter, who always books for himself.
   */
  setters?: Persona[] | null
  /** Where to go after saving (?da=, an internal path); default "Le mie call", or the chosen closer's day. */
  tornaA?: string | null
}


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

export function NuovaCallForm({
  oggi,
  dataIniziale = oggi,
  oraIniziale = '',
  nomeIniziale = '',
  handleIniziale = '',
  closers,
  closerPredefinito,
  setters = null,
  tornaA = null,
}: Props) {
  const router = useRouter()
  const lingua = useLingua()
  const t = NUOVA_CALL[lingua]
  const giorni = ESITO[lingua]
  const OPZIONI_FONTE = FONTI.map((f) => ({ valore: f, etichetta: ETICHETTE[lingua].fonte[f] }))
  const tr = (testo: string | undefined) => traduciErrore(testo, lingua)
  // the admin also adds calls already done, up to a year back
  const admin = setters !== null
  const [erroreServer, setErroreServer] = useState<string | null>(null)

  const {
    control,
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<NuovaCallInput, unknown, NuovaCall>({
    resolver: zodResolver(admin ? nuovaCallAdminSchema : nuovaCallSchema),
    defaultValues: {
      nome: nomeIniziale,
      instagram_handle: handleIniziale,
      // fonte has no default: the bookings by source (prenotate da inbound e da
      // outbound) are counted from it, so the setter always picks it.

      // The setter books discovery calls only: strategy calls are not done with
      // leads (Dany, 29/09/2026). Not a choice on screen, the server still checks it.
      tipo: 'discovery',
      data: dataIniziale,
      ora: oraIniziale,
      closer_id: closerPredefinito,
      setter_id: setters?.[0]?.id ?? null,
    },
  })

  const dataScelta = useWatch({ control, name: 'data' })
  // the admin records calls already done too: yesterday is one tap away
  const scorciatoie = [
    ...(admin ? [{ etichetta: giorni.ieri, valore: aggiungiGiorni(oggi, -1) }] : []),
    { etichetta: giorni.oggi, valore: oggi },
    { etichetta: giorni.domani, valore: aggiungiGiorni(oggi, 1) },
  ]

  const invia = handleSubmit(async (valori) => {
    setErroreServer(null)

    let esito
    try {
      esito = await fissaCall(valori)
    } catch {
      setErroreServer(t.connessione)
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
      t.fatta(ETICHETTE[lingua].tipoCall[valori.tipo], valori.nome, etichettaGiornoIn(valori.data, oggi, lingua).toLowerCase(), valori.ora),
      { description: esito.leadEsistente ? t.leadEsistente : t.leadNuovo },
    )
    router.push(tornaA ?? esito.vaiA ?? '/calls')
  })

  return (
    <form onSubmit={invia} noValidate className="space-y-6" data-tour="nuova-call">
      <div className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="nome">{t.nome}</Label>
          <Input
            id="nome"
            autoComplete="off"
            autoCapitalize="words"
            className="h-11"
            aria-invalid={errors.nome ? true : undefined}
            aria-describedby={errors.nome ? 'nome-errore' : undefined}
            {...register('nome')}
          />
          <ErroreCampo id="nome-errore" messaggio={tr(errors.nome?.message)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="instagram_handle">
            {t.handle}{' '}
            <span className="font-normal text-muted-foreground">{t.facoltativo}</span>
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
            {t.handleAiuto}
          </p>
          <ErroreCampo id="handle-errore" messaggio={tr(errors.instagram_handle?.message)} />
        </div>
      </div>

      <div className={SCELTE}>
        <SceltaRapida
          legenda={t.fonte}
          opzioni={OPZIONI_FONTE}
          registrazione={register('fonte')}
          errore={tr(errors.fonte?.message)}
          aiuto={t.fonteAiuto}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">{t.quando}</legend>
        <div className={cn('grid gap-2', admin ? 'grid-cols-3' : 'grid-cols-2')}>
          {scorciatoie.map(({ etichetta, valore }) => (
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
              {t.data}
            </Label>
            <Input
              id="data"
              type="date"
              min={aggiungiGiorni(oggi, -(admin ? GIORNI_INDIETRO_CALL_ADMIN : GIORNI_INDIETRO_CALL))}
              max={aggiungiGiorni(oggi, GIORNI_AVANTI_CALL)}
              className="num h-11"
              aria-invalid={errors.data ? true : undefined}
              {...register('data')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ora" className="sr-only">
              {t.ora}
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
        <ErroreCampo id="data-errore" messaggio={tr(errors.data?.message ?? errors.ora?.message)} />
      </fieldset>

      {setters ? (
        <div className={SCELTE}>
          <SceltaRapida
            legenda={t.setter}
            opzioni={setters.map((s) => ({ valore: s.id, etichetta: s.nome }))}
            registrazione={register('setter_id')}
            errore={tr(errors.setter_id?.message)}
            aiuto={t.setterAiuto}
            colonne={2}
          />
        </div>
      ) : null}

      <div className={SCELTE}>
        <SceltaRapida
          legenda={t.closer}
          opzioni={closers.map((c) => ({ valore: c.id, etichetta: c.nome }))}
          registrazione={register('closer_id')}
          errore={tr(errors.closer_id?.message)}
          colonne={2}
        />
      </div>

      {erroreServer ? (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-status-critical/10 px-3 py-2.5 text-sm text-status-critical"
        >
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {tr(erroreServer ?? undefined)}
        </p>
      ) : null}

      <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
        {isSubmitting ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : null}
        {t.fissa}
      </Button>
    </form>
  )
}
