'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle, Plus, TriangleAlert } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { chiudiRegola, nuovaRegola } from '@/app/(app)/settings/commissions/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { SceltaMultipla } from '@/components/form/scelta-multipla'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { regolaSchema, type RegolaInput } from '@/lib/validation/team'
import { ETICHETTA_TIPO_VENDITA, TIPI_VENDITA } from '@/lib/validation/vendita'

const OPZIONI_TIPI = TIPI_VENDITA.map((t) => ({ valore: t, etichetta: ETICHETTA_TIPO_VENDITA[t] }))

export function NuovaRegola({
  persone,
  dataPredefinita,
}: {
  persone: { id: string; nome: string }[]
  dataPredefinita: string
}) {
  const [aperto, setAperto] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RegolaInput>({
    resolver: zodResolver(regolaSchema),
    defaultValues: { profile_id: persone[0]?.id, percentuale: '5', applica_a: ['nuovo'], valida_dal: dataPredefinita },
  })

  const invia = handleSubmit(async (valori) => {
    setErrore(null)
    let esito
    try {
      esito = await nuovaRegola(valori)
    } catch {
      setErrore('Connessione assente. Riprova.')
      return
    }
    if (!esito.ok) {
      setErrore(esito.errore)
      return
    }
    toast.success('Regola salvata: la precedente si chiude il giorno prima')
    setAperto(false)
    reset()
  })

  return (
    <Sheet open={aperto} onOpenChange={(v) => { setAperto(v); if (!v) setErrore(null) }}>
      <SheetTrigger render={<Button type="button" className="h-11" disabled={persone.length === 0} />}>
        <Plus className="size-4" aria-hidden="true" />
        Nuova regola
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Nuova regola provvigionale</SheetTitle>
          <SheetDescription>
            Vale dalla data scelta in avanti. Le provvigioni già maturate non cambiano.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={invia} noValidate className="space-y-4 px-4 pb-6">
          <div className="space-y-1.5">
            <Label htmlFor="r-persona">Collaboratore</Label>
            <select
              id="r-persona"
              className="h-11 w-full rounded-lg border border-input bg-input/30 px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
              {...register('profile_id')}
            >
              {persone.map((p) => (
                <option key={p.id} value={p.id}>{p.nome}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="r-perc">Percentuale</Label>
              <div className="relative">
                <Input id="r-perc" inputMode="decimal" className="num h-11 pr-8 text-right" {...register('percentuale')} />
                <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">%</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-dal">Vale dal</Label>
              <Input id="r-dal" type="date" className="num h-11" {...register('valida_dal')} />
            </div>
          </div>
          <ErroreCampo id="r-errore" messaggio={errors.percentuale?.message ?? errors.valida_dal?.message} />
          <SceltaMultipla
            legenda="Si applica all’incassato di"
            opzioni={OPZIONI_TIPI}
            registrazione={register('applica_a')}
            errore={errors.applica_a?.message}
          />
          {errore ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {errore}
            </p>
          ) : null}
          <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            Salva la regola
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}

export function ChiudiRegola({ ruleId, oggi }: { ruleId: string; oggi: string }) {
  const [data, setData] = useState(oggi)
  const [inCorso, avvia] = useTransition()
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="sr-only" htmlFor={`fine-${ruleId}`}>Fine della regola</label>
      <Input
        id={`fine-${ruleId}`}
        type="date"
        value={data}
        onChange={(e) => setData(e.currentTarget.value)}
        className="num h-11 w-40"
      />
      <Button
        type="button"
        variant="outline"
        className="h-11"
        disabled={inCorso}
        onClick={() =>
          avvia(async () => {
            const esito = await chiudiRegola({ rule_id: ruleId, valida_al: data })
            if (esito.ok) toast.success('Regola chiusa')
            else toast.error(esito.errore)
          })
        }
      >
        Chiudi la regola
      </Button>
    </div>
  )
}
