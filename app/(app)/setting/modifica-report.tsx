'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { correggiReport } from '@/app/(app)/setting/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { BottoneSalva, ErroreModulo, FoglioModifica, useSalvataggio } from '@/components/form/foglio-modifica'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { formatData } from '@/lib/format'
import {
  GRUPPI_REPORT,
  MASSIMO_GIORNALIERO,
  correzioneReportSchema,
  type CorrezioneReportInput,
} from '@/lib/validation/report'

/** The admin's correction of a setter's day: plain numeric fields, saved on demand. */
export function ModificaReport({
  report,
  data,
  setter,
}: {
  report: CorrezioneReportInput
  data: string
  setter: string
}) {
  const [aperto, setAperto] = useState(false)
  const { errore, setErrore, salva } = useSalvataggio()
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<CorrezioneReportInput>({
    resolver: zodResolver(correzioneReportSchema),
    defaultValues: { ...report, note: report.note ?? '' },
  })

  const invia = handleSubmit(async (valori) => {
    if (await salva(() => correggiReport(valori), 'Report corretto')) setAperto(false)
  })

  const errorePrimo = GRUPPI_REPORT.flatMap((g) => g.campi).find(([campo]) => errors[campo])

  return (
    <FoglioModifica
      aperto={aperto}
      onApertoChange={(v) => {
        setAperto(v)
        if (!v) {
          setErrore(null)
          reset()
        }
      }}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={`Correggi il report di ${setter} del ${formatData(data)}`}
          className="size-11 shrink-0 text-muted-foreground"
        />
      }
      contenutoTrigger={<Pencil className="size-4" aria-hidden="true" />}
      titolo={`Report del ${formatData(data)}`}
      descrizione={`${setter}. La correzione aggiorna subito i numeri del mese.`}
    >
      <form onSubmit={invia} noValidate className="space-y-5">
        {GRUPPI_REPORT.map((gruppo) => (
          <fieldset key={gruppo.titolo} className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{gruppo.titolo}</legend>
            <div className="grid grid-cols-2 gap-2">
              {gruppo.campi.map(([campo, etichetta]) => (
                <div key={campo} className="space-y-1.5">
                  <Label htmlFor={`r-${campo}`} className="text-xs text-muted-foreground">
                    {etichetta}
                  </Label>
                  <Input
                    id={`r-${campo}`}
                    type="number"
                    inputMode="numeric"
                    min={0}
                    max={MASSIMO_GIORNALIERO}
                    className="num h-11 text-right"
                    aria-invalid={errors[campo] ? true : undefined}
                    {...register(campo, { valueAsNumber: true })}
                  />
                </div>
              ))}
            </div>
          </fieldset>
        ))}
        <ErroreCampo
          id="r-numeri-errore"
          messaggio={errorePrimo ? `${errorePrimo[1]}: ${errors[errorePrimo[0]]?.message}` : undefined}
        />

        <Controller
          control={control}
          name="contenuto_pubblicato"
          render={({ field }) => (
            <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
              Contenuto pubblicato
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </label>
          )}
        />

        <div className="space-y-1.5">
          <Label htmlFor="r-note">Note</Label>
          <Textarea id="r-note" rows={2} {...register('note')} />
        </div>

        <ErroreModulo testo={errore} />
        <BottoneSalva inCorso={isSubmitting}>Salva la correzione</BottoneSalva>
      </form>
    </FoglioModifica>
  )
}
