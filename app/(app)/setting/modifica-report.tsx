'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'

import { correggiReport, eliminaReport } from '@/app/(app)/setting/actions'
import { Elimina } from '@/components/form/elimina'
import { ErroreCampo } from '@/components/form/errore-campo'
import { BottoneSalva, ErroreModulo, FoglioModifica, useSalvataggio } from '@/components/form/foglio-modifica'
import { CommentoReport } from '@/components/setter/commento-report'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<CorrezioneReportInput>({
    resolver: zodResolver(correzioneReportSchema),
    defaultValues: { ...report, note: report.note ?? '' },
  })

  // what the sheet shows right now: the scales and texts are drawn from it
  const [leadInTarget, qualita, cosaFrenava, domande, note] = useWatch({
    control,
    name: ['lead_in_target', 'qualita_conversazioni', 'cosa_frenava', 'domande_contenuti', 'note'],
  })
  const attuali = { lead_in_target: leadInTarget, qualita_conversazioni: qualita, cosa_frenava: cosaFrenava, domande_contenuti: domande, note }

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
          <Fragment key={gruppo.titolo}>
            <fieldset className="space-y-2">
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
            {/* the setter's answers on the day, right under the conversations as on his "Oggi" */}
            {gruppo.commento ? (
              <CommentoReport
                variante="foglio"
                valori={attuali}
                onScala={(campo, valore) => setValue(campo, valore as never, { shouldDirty: true })}
                onTesto={(campo, testo) => setValue(campo, testo, { shouldDirty: true })}
              />
            ) : null}
          </Fragment>
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

        <ErroreModulo testo={errore} />
        <BottoneSalva inCorso={isSubmitting}>Salva la correzione</BottoneSalva>
        <div className="border-t border-border pt-4">
          <Elimina
            etichetta="Elimina il report"
            cosa={`il report di ${setter} del ${formatData(data)}`}
            fatto="Report eliminato"
            conseguenze={['Le metriche di setting del periodo si ricalcolano senza questo giorno.']}
            azione={() => eliminaReport({ id: report.id })}
          />
        </div>
      </form>
    </FoglioModifica>
  )
}
