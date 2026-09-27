'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Target } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { salvaObiettivi } from '@/app/actions/obiettivi'
import { ErroreCampo } from '@/components/form/errore-campo'
import { BottoneSalva, ErroreModulo, FoglioModifica, useSalvataggio } from '@/components/form/foglio-modifica'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatEuro, formatImportoInput, formatNumero } from '@/lib/format'
import { obiettiviSchema, type ObiettiviInput } from '@/lib/validation/obiettivi'

export type Avanzamento = {
  mese: string
  etichettaMese: string
  obiettivo_cash: number | null
  cash: number
  quota_cash: number | null
  obiettivo_nuovi: number | null
  nuovi: number
  quota_nuovi: number | null
}

/** One bar: where the month is against its target. Numbers are computed by SQL. */
function Barra({ etichetta, valore, obiettivo, quota }: { etichetta: string; valore: string; obiettivo: string; quota: number }) {
  const percento = Math.round(quota * 100)
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="text-muted-foreground">{etichetta}</span>
        <span className="num">
          <span className="font-semibold">{valore}</span>
          <span className="text-muted-foreground"> di {obiettivo} · {percento}%</span>
        </span>
      </div>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={etichetta}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(percento, 100)}
      >
        <div className="h-full rounded-full bg-primary-light" style={{ width: `${Math.min(percento, 100)}%` }} />
      </div>
    </div>
  )
}

/** "Obiettivi del mese" in the admin overview: progress, and the sheet to set them. */
export function ObiettiviMese({ a }: { a: Avanzamento }) {
  const nessuno = a.obiettivo_cash === null && a.obiettivo_nuovi === null
  return (
    <section className="rounded-xl bg-card p-4" aria-labelledby="titolo-obiettivi" data-testid="obiettivi">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 id="titolo-obiettivi" className="flex items-center gap-2 text-sm font-medium">
          <Target className="size-4 text-muted-foreground" aria-hidden="true" />
          Obiettivi di {a.etichettaMese}
        </h2>
        <ImpostaObiettivi a={a} />
      </div>
      {nessuno ? (
        <p className="text-sm text-muted-foreground">
          Nessun obiettivo per questo mese. Imposta quanto vuoi incassare e quanti clienti nuovi vuoi chiudere: qui vedi a
          che punto sei.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {a.obiettivo_cash !== null && a.quota_cash !== null ? (
            <Barra
              etichetta="Cash incassato"
              valore={formatEuro(a.cash, { compatto: true })}
              obiettivo={formatEuro(a.obiettivo_cash, { compatto: true })}
              quota={a.quota_cash}
            />
          ) : null}
          {a.obiettivo_nuovi !== null && a.quota_nuovi !== null ? (
            <Barra
              etichetta="Nuovi clienti"
              valore={formatNumero(a.nuovi)}
              obiettivo={formatNumero(a.obiettivo_nuovi)}
              quota={a.quota_nuovi}
            />
          ) : null}
        </div>
      )}
    </section>
  )
}

function ImpostaObiettivi({ a }: { a: Avanzamento }) {
  const [aperto, setAperto] = useState(false)
  const { errore, setErrore, salva } = useSalvataggio()
  const iniziali: ObiettiviInput = {
    mese: a.mese,
    cash: a.obiettivo_cash === null ? '' : formatImportoInput(a.obiettivo_cash),
    nuovi_clienti: a.obiettivo_nuovi === null ? '' : String(a.obiettivo_nuovi),
  }
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ObiettiviInput>({ resolver: zodResolver(obiettiviSchema), defaultValues: iniziali })

  const invia = handleSubmit(async (valori) => {
    if (await salva(() => salvaObiettivi(valori), 'Obiettivi salvati')) setAperto(false)
  })

  return (
    <FoglioModifica
      aperto={aperto}
      onApertoChange={(v) => {
        setAperto(v)
        if (v) reset(iniziali)
        else setErrore(null)
      }}
      trigger={<Button type="button" variant="outline" className="h-11" />}
      contenutoTrigger={a.obiettivo_cash === null && a.obiettivo_nuovi === null ? 'Imposta' : 'Modifica'}
      titolo={`Obiettivi di ${a.etichettaMese}`}
      descrizione="Lascia vuoto un campo se non vuoi un obiettivo su quel numero. Il cash conta gli incassi del mese, i nuovi clienti le vendite di tipo nuovo."
    >
      <form onSubmit={invia} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="obiettivo-cash">Cash da incassare</Label>
          <Input id="obiettivo-cash" inputMode="decimal" placeholder="10.000" className="num h-11 text-right" {...register('cash')} />
          <ErroreCampo id="obiettivo-cash-errore" messaggio={errors.cash?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="obiettivo-nuovi">Nuovi clienti</Label>
          <Input id="obiettivo-nuovi" inputMode="numeric" placeholder="5" className="num h-11 text-right" {...register('nuovi_clienti')} />
          <ErroreCampo id="obiettivo-nuovi-errore" messaggio={errors.nuovi_clienti?.message} />
        </div>
        <ErroreModulo testo={errore} />
        <BottoneSalva inCorso={isSubmitting}>Salva gli obiettivi</BottoneSalva>
      </form>
    </FoglioModifica>
  )
}
