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
import { useLingua, useTesti } from '@/components/i18n/lingua-provider'
import { formatImportoInput } from '@/lib/format'
import { COSTI_FOGLI } from '@/lib/i18n/testi/costi'
import { traduciErrore } from '@/lib/i18n/testi/errori-economics'
import { ETICHETTE } from '@/lib/i18n/testi/etichette'
import {
  CATEGORIE_COSTO,
  costoSchema,
  modificaCostoSchema,
  type CostoInput,
  type ModificaCostoInput,
} from '@/lib/validation/anagrafiche'

function useOpzioni() {
  const etichette = useTesti(ETICHETTE).categoriaCosto
  return CATEGORIE_COSTO.map((c) => ({ valore: c, etichetta: etichette[c] }))
}

export function NuovoCosto({ dataPredefinita, massima }: { dataPredefinita: string; massima: string }) {
  const lingua = useLingua()
  const t = COSTI_FOGLI[lingua]
  const OPZIONI = useOpzioni()
  const tr = (testo: string | undefined) => traduciErrore(testo, lingua)
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
    toast.success(t.aggiunto)
    reset({ data: valori.data, categoria: valori.categoria, descrizione: '', importo: '', ricorrente: false })
  })

  return (
    <form onSubmit={invia} noValidate className="space-y-4 rounded-xl bg-card p-4" aria-label={t.nuovo}>
      <SceltaRapida legenda={t.categoria} opzioni={OPZIONI} registrazione={register('categoria')} errore={tr(errors.categoria?.message)} />
      <div className="space-y-1.5">
        <Label htmlFor="costo-descrizione">{t.descrizione}</Label>
        <Input id="costo-descrizione" className="h-11" placeholder={t.placeholder} {...register('descrizione')} />
        <ErroreCampo id="costo-descrizione-errore" messaggio={tr(errors.descrizione?.message)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="costo-data">{t.data}</Label>
          <Input id="costo-data" type="date" max={massima} className="num h-11" {...register('data')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="costo-importo">{t.importo}</Label>
          <Input id="costo-importo" inputMode="decimal" placeholder="0,00" className="num h-11 text-right" {...register('importo')} />
        </div>
      </div>
      <ErroreCampo id="costo-errore" messaggio={tr(errors.data?.message ?? errors.importo?.message)} />
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm">
        <span>
          {t.ricorrente}
          <span className="block text-xs text-muted-foreground">{t.ricorrenteAiuto}</span>
        </span>
        <Switch checked={!!ricorrente} onCheckedChange={(v) => setValue('ricorrente', v)} />
      </label>
      {errore ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {tr(errore ?? undefined)}
        </p>
      ) : null}
      <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
        {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
        {t.aggiungi}
      </Button>
    </form>
  )
}

export function CopiaRicorrenti({ mese, meseSorgente }: { mese: string; meseSorgente: string }) {
  const [inCorso, avvia] = useTransition()
  const lingua = useLingua()
  const t = COSTI_FOGLI[lingua]
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11"
      disabled={inCorso}
      onClick={() =>
        avvia(async () => {
          const esito = await copiaRicorrenti({ mese })
          if (!esito.ok) toast.error(traduciErrore(esito.errore, lingua))
          else if (!esito.copiati) toast.info(t.nienteDaCopiare)
          else toast.success(t.copiati(esito.copiati))
        })
      }
    >
      {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
      {t.copia(meseSorgente)}
    </Button>
  )
}

/** Two taps on purpose: the first arms, the second deletes. */
export function EliminaCosto({ id, descrizione }: { id: string; descrizione: string }) {
  const [pronto, setPronto] = useState(false)
  const [inCorso, avvia] = useTransition()
  const lingua = useLingua()
  const t = COSTI_FOGLI[lingua]

  if (!pronto) {
    return (
      <Button type="button" variant="ghost" size="icon" className="size-11 text-muted-foreground" aria-label={t.eliminaNome(descrizione)} onClick={() => setPronto(true)}>
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
          if (esito.ok) toast.success(t.eliminato)
          else toast.error(traduciErrore(esito.errore, lingua))
          setPronto(false)
        })
      }
    >
      {t.conferma}
    </Button>
  )
}

export function ModificaCosto({ costo, massima }: { costo: ModificaCostoInput; massima: string }) {
  const [aperto, setAperto] = useState(false)
  const lingua = useLingua()
  const t = COSTI_FOGLI[lingua]
  const OPZIONI = useOpzioni()
  const tr = (testo: string | undefined) => traduciErrore(testo, lingua)
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
    if (await salva(() => modificaCosto(valori), t.aggiornato)) setAperto(false)
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
          aria-label={t.modificaNome(costo.descrizione)}
          className="size-11 shrink-0 text-muted-foreground"
        />
      }
      contenutoTrigger={<Pencil className="size-4" aria-hidden="true" />}
      titolo={t.modificaTitolo}
      descrizione={t.modificaDescrizione}
    >
      <form onSubmit={invia} noValidate className="space-y-4">
        <SceltaRapida legenda={t.categoria} opzioni={OPZIONI} registrazione={register('categoria')} errore={tr(errors.categoria?.message)} />
        <div className="space-y-1.5">
          <Label htmlFor={`mc-descrizione-${costo.id}`}>{t.descrizione}</Label>
          <Input id={`mc-descrizione-${costo.id}`} className="h-11" {...register('descrizione')} />
          <ErroreCampo id={`mc-descrizione-errore-${costo.id}`} messaggio={tr(errors.descrizione?.message)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={`mc-data-${costo.id}`}>{t.data}</Label>
            <Input id={`mc-data-${costo.id}`} type="date" max={massima} className="num h-11" {...register('data')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`mc-importo-${costo.id}`}>{t.importo}</Label>
            <Input id={`mc-importo-${costo.id}`} inputMode="decimal" className="num h-11 text-right" {...register('importo')} />
          </div>
        </div>
        <ErroreCampo id={`mc-errore-${costo.id}`} messaggio={tr(errors.data?.message ?? errors.importo?.message)} />
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm">
          {t.ricorrente}
          <Switch checked={!!ricorrente} onCheckedChange={(v) => setValue('ricorrente', v)} />
        </label>
        <ErroreModulo testo={tr(errore ?? undefined) ?? null} />
        <BottoneSalva inCorso={isSubmitting}>{t.salva}</BottoneSalva>
      </form>
    </FoglioModifica>
  )
}
