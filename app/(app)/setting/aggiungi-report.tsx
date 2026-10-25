'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Plus } from 'lucide-react'
import { Fragment, useState } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'

import { aggiungiReport } from '@/app/(app)/setting/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { BottoneSalva, CLASSE_SELECT, ErroreModulo, FoglioModifica, useSalvataggio } from '@/components/form/foglio-modifica'
import { useLingua } from '@/components/i18n/lingua-provider'
import { CommentoReport } from '@/components/setter/commento-report'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { gruppiReport, traduciErroreSetting } from '@/lib/i18n/testi/oggi'
import { SETTER } from '@/lib/i18n/testi/setter'
import { MASSIMO_GIORNALIERO, REPORT_VUOTO, nuovoReportSchema, type NuovoReportInput } from '@/lib/validation/report'

export type PersonaSetting = { id: string; nome: string }

/**
 * "Aggiungi giornata": the admin records a whole day of setting for a setter,
 * or for himself. The setter has the same on his "Oggi" page, day by day.
 */
export function AggiungiReport({ persone, oggi }: { persone: PersonaSetting[]; oggi: string }) {
  const lingua = useLingua()
  const t = SETTER[lingua].foglio
  const GRUPPI_REPORT = gruppiReport(lingua)
  const [aperto, setAperto] = useState(false)
  const { errore, setErrore, salva } = useSalvataggio()
  const iniziali: NuovoReportInput = { ...REPORT_VUOTO, setter_id: persone[0]?.id ?? '', data: oggi }
  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<NuovoReportInput>({ resolver: zodResolver(nuovoReportSchema), defaultValues: iniziali })

  // what the sheet shows right now: the scales and texts are drawn from it
  const [leadInTarget, qualita, cosaFrenava, domande, note] = useWatch({
    control,
    name: ['lead_in_target', 'qualita_conversazioni', 'cosa_frenava', 'domande_contenuti', 'note'],
  })
  const attuali = { lead_in_target: leadInTarget, qualita_conversazioni: qualita, cosa_frenava: cosaFrenava, domande_contenuti: domande, note }

  const invia = handleSubmit(async (valori) => {
    const azione = async () => {
      const esito = await aggiungiReport(valori)
      return esito.ok ? esito : { ...esito, errore: traduciErroreSetting(esito.errore, lingua) }
    }
    if (await salva(azione, t.giornataAggiunta)) setAperto(false)
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
          {t.aggiungi}
        </>
      }
      titolo={t.aggiungiTitolo}
      descrizione={t.aggiungiDescrizione}
    >
      <form onSubmit={invia} noValidate className="space-y-5">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="ag-persona">{t.chi}</Label>
            <select id="ag-persona" className={CLASSE_SELECT} {...register('setter_id')}>
              {persone.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
            <ErroreCampo id="ag-persona-errore" messaggio={traduciErroreSetting(errors.setter_id?.message, lingua) ?? undefined} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ag-data">{t.giorno}</Label>
            <Input id="ag-data" type="date" max={oggi} className="num h-11" {...register('data')} />
            <ErroreCampo id="ag-data-errore" messaggio={traduciErroreSetting(errors.data?.message, lingua) ?? undefined} />
          </div>
        </div>

        {GRUPPI_REPORT.map((gruppo) => (
          <Fragment key={gruppo.titolo}>
            <fieldset className="space-y-2">
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
          id="ag-numeri-errore"
          messaggio={errorePrimo ? `${errorePrimo[1]}: ${traduciErroreSetting(errors[errorePrimo[0]]?.message, lingua)}` : undefined}
        />

        <Controller
          control={control}
          name="contenuto_pubblicato"
          render={({ field }) => (
            <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
              {t.contenutoPubblicato}
              <Switch checked={field.value} onCheckedChange={field.onChange} />
            </label>
          )}
        />

        <ErroreModulo testo={traduciErroreSetting(errore, lingua) ?? null} />
        <BottoneSalva inCorso={isSubmitting}>{t.salvaGiornata}</BottoneSalva>
      </form>
    </FoglioModifica>
  )
}
