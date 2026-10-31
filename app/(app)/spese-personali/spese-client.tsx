'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Copy, LoaderCircle, Pencil, Plus, TriangleAlert } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { toast } from 'sonner'

import {
  aggiungiSpesaPersonale,
  copiaSpesePersonaliRicorrenti,
  eliminaSpesaPersonale,
  modificaSpesaPersonale,
} from '@/app/(app)/spese-personali/actions'
import { Elimina } from '@/components/form/elimina'
import { ErroreCampo } from '@/components/form/errore-campo'
import { BottoneSalva, ErroreModulo, FoglioModifica, useSalvataggio } from '@/components/form/foglio-modifica'
import { SceltaRapida } from '@/components/form/scelta-rapida'
import { useLingua } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { formatImportoInput } from '@/lib/format'
import { SPESE_PERSONALI, traduciErroreSpese } from '@/lib/i18n/testi/spese-personali'
import {
  CATEGORIE_SPESA_PERSONALE,
  modificaSpesaPersonaleSchema,
  spesaPersonaleSchema,
  type ModificaSpesaPersonaleInput,
  type SpesaPersonaleInput,
} from '@/lib/validation/spese-personali'

/** The id of the add form: the empty state points here. */
export const ID_MODULO_SPESA = 'nuova-spesa-personale'

function useTesti() {
  const lingua = useLingua()
  const t = SPESE_PERSONALI[lingua]
  const opzioni = CATEGORIE_SPESA_PERSONALE.map((c) => ({ valore: c, etichetta: t.categorie[c] }))
  const tr = (testo: string | null | undefined) => traduciErroreSpese(testo, lingua)
  return { lingua, t, opzioni, tr }
}

export function NuovaSpesaPersonale({ dataPredefinita, massima }: { dataPredefinita: string; massima: string }) {
  const { t, opzioni, tr } = useTesti()
  const [errore, setErrore] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<SpesaPersonaleInput>({
    resolver: zodResolver(spesaPersonaleSchema),
    defaultValues: { data: dataPredefinita, categoria: 'spesa', descrizione: '', importo: '', ricorrente: false },
  })
  const ricorrente = useWatch({ control, name: 'ricorrente' })

  const invia = handleSubmit(async (valori) => {
    setErrore(null)
    let esito
    try {
      esito = await aggiungiSpesaPersonale(valori)
    } catch {
      setErrore(t.connessione)
      return
    }
    if (!esito.ok) {
      setErrore(esito.errore)
      return
    }
    toast.success(t.aggiunta)
    reset({ data: valori.data, categoria: valori.categoria, descrizione: '', importo: '', ricorrente: false })
  })

  return (
    <form id={ID_MODULO_SPESA} onSubmit={invia} noValidate className="scroll-mt-20 space-y-4 rounded-xl bg-card p-4" aria-label={t.nuova}>
      <SceltaRapida legenda={t.categoria} colonne={2} opzioni={opzioni} registrazione={register('categoria')} errore={tr(errors.categoria?.message)} />
      <div className="space-y-1.5">
        <Label htmlFor="spesa-descrizione">{t.descrizioneCampo}</Label>
        <Input id="spesa-descrizione" className="h-11" placeholder={t.placeholder} {...register('descrizione')} />
        <ErroreCampo id="spesa-descrizione-errore" messaggio={tr(errors.descrizione?.message)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="spesa-data">{t.data}</Label>
          <Input id="spesa-data" type="date" max={massima} className="num h-11" {...register('data')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="spesa-importo">{t.importo}</Label>
          <Input id="spesa-importo" inputMode="decimal" placeholder="0,00" className="num h-11 text-right" {...register('importo')} />
        </div>
      </div>
      <ErroreCampo id="spesa-errore" messaggio={tr(errors.data?.message ?? errors.importo?.message)} />
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
          {tr(errore)}
        </p>
      ) : null}
      <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
        {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Plus className="size-4" aria-hidden="true" />}
        {t.aggiungi}
      </Button>
    </form>
  )
}

export function CopiaSpeseRicorrenti({ mese, meseSorgente }: { mese: string; meseSorgente: string }) {
  const [inCorso, avvia] = useTransition()
  const { t, tr } = useTesti()
  return (
    <Button
      type="button"
      variant="outline"
      className="h-11"
      disabled={inCorso}
      onClick={() =>
        avvia(async () => {
          let esito
          try {
            esito = await copiaSpesePersonaliRicorrenti({ mese })
          } catch {
            toast.error(t.connessione)
            return
          }
          if (!esito.ok) toast.error(tr(esito.errore))
          else if (!esito.copiati) toast.info(t.nienteDaCopiare)
          else toast.success(t.copiate(esito.copiati))
        })
      }
    >
      {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
      {t.copia(meseSorgente)}
    </Button>
  )
}

/** The app's one way to delete: a question first, nothing goes on the first tap. */
export function EliminaSpesaPersonale({ id, descrizione }: { id: string; descrizione: string }) {
  const { t, tr } = useTesti()
  return (
    <Elimina
      variante="icona"
      cosa={t.eliminaCosa(descrizione)}
      fatto={t.eliminata}
      conseguenze={[t.eliminaConseguenza]}
      azione={async () => {
        const esito = await eliminaSpesaPersonale({ id })
        return esito.ok ? esito : { ok: false, errore: tr(esito.errore) ?? esito.errore }
      }}
    />
  )
}

export function ModificaSpesaPersonale({ spesa, massima }: { spesa: ModificaSpesaPersonaleInput; massima: string }) {
  const [aperto, setAperto] = useState(false)
  const { t, opzioni, tr } = useTesti()
  const { errore, setErrore, salva } = useSalvataggio()
  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors, isSubmitting },
  } = useForm<ModificaSpesaPersonaleInput>({
    resolver: zodResolver(modificaSpesaPersonaleSchema),
    defaultValues: { ...spesa, importo: formatImportoInput(spesa.importo as number) },
  })
  const ricorrente = useWatch({ control, name: 'ricorrente' })

  const invia = handleSubmit(async (valori) => {
    if (await salva(() => modificaSpesaPersonale(valori), t.aggiornata)) setAperto(false)
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
          aria-label={t.modificaNome(spesa.descrizione)}
          className="size-11 shrink-0 text-muted-foreground"
        />
      }
      contenutoTrigger={<Pencil className="size-4" aria-hidden="true" />}
      titolo={t.modificaTitolo}
      descrizione={t.modificaDescrizione}
    >
      <form onSubmit={invia} noValidate className="space-y-4">
        <SceltaRapida legenda={t.categoria} colonne={2} opzioni={opzioni} registrazione={register('categoria')} errore={tr(errors.categoria?.message)} />
        <div className="space-y-1.5">
          <Label htmlFor={`ms-descrizione-${spesa.id}`}>{t.descrizioneCampo}</Label>
          <Input id={`ms-descrizione-${spesa.id}`} className="h-11" {...register('descrizione')} />
          <ErroreCampo id={`ms-descrizione-errore-${spesa.id}`} messaggio={tr(errors.descrizione?.message)} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={`ms-data-${spesa.id}`}>{t.data}</Label>
            <Input id={`ms-data-${spesa.id}`} type="date" max={massima} className="num h-11" {...register('data')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`ms-importo-${spesa.id}`}>{t.importo}</Label>
            <Input id={`ms-importo-${spesa.id}`} inputMode="decimal" className="num h-11 text-right" {...register('importo')} />
          </div>
        </div>
        <ErroreCampo id={`ms-errore-${spesa.id}`} messaggio={tr(errors.data?.message ?? errors.importo?.message)} />
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 text-sm">
          {t.ricorrente}
          <Switch checked={!!ricorrente} onCheckedChange={(v) => setValue('ricorrente', v)} />
        </label>
        <ErroreModulo testo={tr(errore) ?? null} />
        <BottoneSalva inCorso={isSubmitting}>{t.salva}</BottoneSalva>
      </form>
    </FoglioModifica>
  )
}
