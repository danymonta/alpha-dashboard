'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Copy, LoaderCircle, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'

import { aggiungiCosto, copiaRicorrenti, eliminaCosto, modificaCosto } from '@/app/(app)/expenses/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { BottoneSalva, ErroreModulo, FoglioModifica, useSalvataggio } from '@/components/form/foglio-modifica'
import { SceltaRapida } from '@/components/form/scelta-rapida'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { formatImportoInput } from '@/lib/format'
import {
  CATEGORIE_COSTO,
  ETICHETTA_CATEGORIA,
  costoSchema,
  modificaCostoSchema,
  type CostoInput,
  type ModificaCostoInput,
} from '@/lib/validation/anagrafiche'

const OPZIONI = CATEGORIE_COSTO.map((c) => ({ valore: c, etichetta: ETICHETTA_CATEGORIA[c] }))

export function NuovoCosto({ dataPredefinita, massima }: { dataPredefinita: string; massima: string }) {
  const [errore, setErrore] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<CostoInput>({
    resolver: zodResolver(costoSchema),
    defaultValues: { data: dataPredefinita, categoria: 'software', descrizione: '', importo: '', ricorrente: false },
  })
  const ricorrente = useWatch({ control, name: 'ricorrente' })

  const invia = handleSubmit(async (valori) => {
    setErrore(null)
    let esito
    try {
      esito = await aggiungiCosto(valori)
    } catch {
      setErrore('Connessione assente. Riprova.')
      return
    }
    if (!esito.ok) {
      setErrore(esito.errore)
      return
    }
    toast.success('Costo aggiunto')
    reset({ data: valori.data, categoria: valori.categoria, descrizione: '', importo: '', ricorrente: false })
  })

  return (
    <form onSubmit={invia} noValidate className="space-y-4 rounded-xl bg-card p-4" aria-label="Nuovo costo">
      <SceltaRapida legenda="Categoria" opzioni={OPZIONI} registrazione={register('categoria')} errore={errors.categoria?.message} />
      <div className="space-y-1.5">
        <Label htmlFor="costo-descrizione">Descrizione</Label>
        <Input id="costo-descrizione" className="h-11" placeholder="Compenso coach, hosting, campagna…" {...register('descrizione')} />
        <ErroreCampo id="costo-descrizione-errore" messaggio={errors.descrizione?.message} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="costo-data">Data</Label>
          <Input id="costo-data" type="date" max={massima} className="num h-11" {...register('data')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="costo-importo">Importo</Label>
          <Input id="costo-importo" inputMode="decimal" placeholder="0,00" className="num h-11 text-right" {...register('importo')} />
        </div>
      </div>
      <ErroreCampo id="costo-errore" messaggio={errors.data?.message ?? errors.importo?.message} />
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm">
        <span>
          Ricorrente
          <span className="block text-xs text-muted-foreground">Si potrà copiare nel mese successivo con un tocco.</span>
        </span>
        <Switch checked={!!ricorrente} onCheckedChange={(v) => setValue('ricorrente', v)} />
      </label>
      {errore ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {errore}
        </p>
      ) : null}
      <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
        {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
        Aggiungi costo
      </Button>
    </form>
  )
}

export function CopiaRicorrenti({ mese, meseSorgente }: { mese: string; meseSorgente: string }) {
  const [inCorso, avvia] = useTransition()
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11"
      disabled={inCorso}
      onClick={() =>
        avvia(async () => {
          const esito = await copiaRicorrenti({ mese })
          if (!esito.ok) toast.error(esito.errore)
          else if (!esito.copiati) toast.info('Nessun costo da copiare: i ricorrenti ci sono già.')
          else toast.success(esito.copiati === 1 ? '1 costo ricorrente copiato' : `${esito.copiati} costi ricorrenti copiati`)
        })
      }
    >
      {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
      Copia i ricorrenti di {meseSorgente}
    </Button>
  )
}

/** Two taps on purpose: the first arms, the second deletes. */
export function EliminaCosto({ id, descrizione }: { id: string; descrizione: string }) {
  const [pronto, setPronto] = useState(false)
  const [inCorso, avvia] = useTransition()

  if (!pronto) {
    return (
      <Button type="button" variant="ghost" size="icon" className="size-11 text-muted-foreground" aria-label={`Elimina ${descrizione}`} onClick={() => setPronto(true)}>
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    )
  }

  return (
    <Button
      type="button"
      variant="destructive"
      className="h-11"
      disabled={inCorso}
      onBlur={() => setPronto(false)}
      autoFocus
      onClick={() =>
        avvia(async () => {
          const esito = await eliminaCosto({ id })
          if (esito.ok) toast.success('Costo eliminato')
          else toast.error(esito.errore)
          setPronto(false)
        })
      }
    >
      Conferma
    </Button>
  )
}

export function ModificaCosto({ costo, massima }: { costo: ModificaCostoInput; massima: string }) {
  const [aperto, setAperto] = useState(false)
  const { errore, setErrore, salva } = useSalvataggio()
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ModificaCostoInput>({
    resolver: zodResolver(modificaCostoSchema),
    defaultValues: { ...costo, importo: formatImportoInput(costo.importo as number) },
  })
  const ricorrente = useWatch({ control, name: 'ricorrente' })

  const invia = handleSubmit(async (valori) => {
    if (await salva(() => modificaCosto(valori), 'Costo aggiornato')) setAperto(false)
  })

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
          aria-label={`Modifica il costo ${costo.descrizione}`}
          className="size-11 shrink-0 text-muted-foreground"
        />
      }
      contenutoTrigger={<Pencil className="size-4" aria-hidden="true" />}
      titolo="Modifica il costo"
      descrizione="Il margine del mese si ricalcola subito."
    >
      <form onSubmit={invia} noValidate className="space-y-4">
        <SceltaRapida legenda="Categoria" opzioni={OPZIONI} registrazione={register('categoria')} errore={errors.categoria?.message} />
        <div className="space-y-1.5">
          <Label htmlFor={`mc-descrizione-${costo.id}`}>Descrizione</Label>
          <Input id={`mc-descrizione-${costo.id}`} className="h-11" {...register('descrizione')} />
          <ErroreCampo id={`mc-descrizione-errore-${costo.id}`} messaggio={errors.descrizione?.message} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={`mc-data-${costo.id}`}>Data</Label>
            <Input id={`mc-data-${costo.id}`} type="date" max={massima} className="num h-11" {...register('data')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`mc-importo-${costo.id}`}>Importo</Label>
            <Input id={`mc-importo-${costo.id}`} inputMode="decimal" className="num h-11 text-right" {...register('importo')} />
          </div>
        </div>
        <ErroreCampo id={`mc-errore-${costo.id}`} messaggio={errors.data?.message ?? errors.importo?.message} />
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm">
          Ricorrente
          <Switch checked={!!ricorrente} onCheckedChange={(v) => setValue('ricorrente', v)} />
        </label>
        <ErroreModulo testo={errore} />
        <BottoneSalva inCorso={isSubmitting}>Salva il costo</BottoneSalva>
      </form>
    </FoglioModifica>
  )
}
