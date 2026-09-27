'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'

import { aggiungiReport } from '@/app/(app)/setting/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { BottoneSalva, CLASSE_SELECT, ErroreModulo, FoglioModifica, useSalvataggio } from '@/components/form/foglio-modifica'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { GRUPPI_REPORT, MASSIMO_GIORNALIERO, REPORT_VUOTO, nuovoReportSchema, type NuovoReportInput } from '@/lib/validation/report'

export type PersonaSetting = { id: string; nome: string }

/**
 * "Aggiungi giornata": the admin records a whole day of setting for a setter,
 * or for himself. The setter has the same on his "Oggi" page, day by day.
 */
export function AggiungiReport({ persone, oggi }: { persone: PersonaSetting[]; oggi: string }) {
  const [aperto, setAperto] = useState(false)
  const { errore, setErrore, salva } = useSalvataggio()
  const iniziali: NuovoReportInput = { ...REPORT_VUOTO, setter_id: persone[0]?.id ?? '', data: oggi }
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NuovoReportInput>({ resolver: zodResolver(nuovoReportSchema), defaultValues: iniziali })

  const invia = handleSubmit(async (valori) => {
    if (await salva(() => aggiungiReport(valori), 'Giornata aggiunta')) setAperto(false)
  })

  const errorePrimo = GRUPPI_REPORT.flatMap((g) => g.campi).find(([campo]) => errors[campo])

  return (
    <FoglioModifica
      aperto={aperto}
      onApertoChange={(v) => {
        setAperto(v)
        if (v) reset(iniziali)
        else setErrore(null)
      }}
      trigger={<Button type="button" className="h-11" data-testid="aggiungi-giornata" />}
      contenutoTrigger={
        <>
          <Plus className="size-4" aria-hidden="true" />
          Aggiungi giornata
        </>
      }
      titolo="Aggiungi una giornata di setting"
      descrizione="I numeri di un giorno: DM, conversazioni, call. Se quel giorno c’è già, si corregge dalla tabella."
    >
      <form onSubmit={invia} noValidate className="space-y-5">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="ag-persona">Chi</Label>
            <select id="ag-persona" className={CLASSE_SELECT} {...register('setter_id')}>
              {persone.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            <ErroreCampo id="ag-persona-errore" messaggio={errors.setter_id?.message} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ag-data">Giorno</Label>
            <Input id="ag-data" type="date" max={oggi} className="num h-11 [color-scheme:dark]" {...register('data')} />
            <ErroreCampo id="ag-data-errore" messaggio={errors.data?.message} />
          </div>
        </div>

        {GRUPPI_REPORT.map((gruppo) => (
          <fieldset key={gruppo.titolo} className="space-y-2">
            <legend className="mb-2 text-sm font-medium">{gruppo.titolo}</legend>
            <div className="grid grid-cols-2 gap-2">
              {gruppo.campi.map(([campo, etichetta]) => (
                <div key={campo} className="space-y-1.5">
                  <Label htmlFor={`ag-${campo}`} className="text-xs text-muted-foreground">
                    {etichetta}
                  </Label>
                  <Input
                    id={`ag-${campo}`}
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
          id="ag-numeri-errore"
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
          <Label htmlFor="ag-note">Note</Label>
          <Textarea id="ag-note" rows={2} {...register('note')} />
        </div>

        <ErroreModulo testo={errore} />
        <BottoneSalva inCorso={isSubmitting}>Salva la giornata</BottoneSalva>
      </form>
    </FoglioModifica>
  )
}
