'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle, Pencil, Plus, TriangleAlert } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { chiudiRegola, eliminaRegola, modificaRegola, nuovaRegola } from '@/app/(app)/settings/commissions/actions'
import { Elimina } from '@/components/form/elimina'
import { ErroreCampo } from '@/components/form/errore-campo'
import { BottoneSalva, ErroreModulo, FoglioModifica, useSalvataggio } from '@/components/form/foglio-modifica'
import { SceltaMultipla } from '@/components/form/scelta-multipla'
import { useLingua } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
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
import { formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { ETICHETTE } from '@/lib/i18n/testi/etichette'
import { IMPOSTAZIONI, traduciImpostazioni } from '@/lib/i18n/testi/impostazioni'
import { SHELL } from '@/lib/i18n/testi/shell'
import {
  modificaRegolaSchema,
  regolaSchema,
  type ModificaRegolaInput,
  type RegolaInput,
} from '@/lib/validation/team'
import { ETICHETTA_TIPO_VENDITA, TIPI_VENDITA } from '@/lib/validation/vendita'

/** The sale types in the page's language (Italian: the labels of always). */
function opzioniTipi(lingua: Lingua) {
  const etichette = lingua === 'it' ? ETICHETTA_TIPO_VENDITA : ETICHETTE[lingua].tipoVendita
  return TIPI_VENDITA.map((t) => ({ valore: t, etichetta: etichette[t] }))
}

export function NuovaRegola({
  persone,
  dataPredefinita,
}: {
  persone: { id: string; nome: string }[]
  dataPredefinita: string
}) {
  const [aperto, setAperto] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const lingua = useLingua()
  const t = IMPOSTAZIONI[lingua].regoleForm
  const tr = (testo: string | undefined) => traduciImpostazioni(testo, lingua)
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
      setErrore(SHELL[lingua].connessione)
      return
    }
    if (!esito.ok) {
      setErrore(traduciImpostazioni(esito.errore, lingua))
      return
    }
    toast.success(t.salvata)
    setAperto(false)
    reset()
  })

  return (
    <Sheet open={aperto} onOpenChange={(v) => { setAperto(v); if (!v) setErrore(null) }}>
      <SheetTrigger render={<Button type="button" className="h-11" disabled={persone.length === 0} />}>
        <Plus className="size-4" aria-hidden="true" />
        {t.nuova}
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t.titoloNuova}</SheetTitle>
          <SheetDescription>{t.descrizioneNuova}</SheetDescription>
        </SheetHeader>
        <form onSubmit={invia} noValidate className="space-y-4 px-4 pb-6">
          <div className="space-y-1.5">
            <Label htmlFor="r-persona">{t.collaboratore}</Label>
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
              <Label htmlFor="r-perc">{t.percentuale}</Label>
              <div className="relative">
                <Input id="r-perc" inputMode="decimal" className="num h-11 pr-8 text-right" {...register('percentuale')} />
                <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">%</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="r-dal">{t.valeDal}</Label>
              <Input id="r-dal" type="date" className="num h-11" {...register('valida_dal')} />
            </div>
          </div>
          <ErroreCampo id="r-errore" messaggio={tr(errors.percentuale?.message ?? errors.valida_dal?.message)} />
          <SceltaMultipla
            legenda={t.siApplica}
            opzioni={opzioniTipi(lingua)}
            registrazione={register('applica_a')}
            errore={tr(errors.applica_a?.message)}
          />
          {errore ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {errore}
            </p>
          ) : null}
          <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {t.salvaRegola}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}

/** Closing a rule asks for its last valid day first: nothing changes on one tap. */
export function ChiudiRegola({ ruleId, oggi, etichetta }: { ruleId: string; oggi: string; etichetta: string }) {
  const [aperto, setAperto] = useState(false)
  const [data, setData] = useState(oggi)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()
  const idCampo = `fine-${ruleId}`
  const lingua = useLingua()
  const t = IMPOSTAZIONI[lingua].regoleForm
  const { formatData } = formato(lingua)

  function chiudi() {
    setErrore(null)
    avvia(async () => {
      let esito
      try {
        esito = await chiudiRegola({ rule_id: ruleId, valida_al: data })
      } catch {
        setErrore(SHELL[lingua].connessione)
        return
      }
      if (!esito.ok) {
        setErrore(traduciImpostazioni(esito.errore, lingua))
        return
      }
      toast.success(t.chiusaDal(formatData(data)))
      setAperto(false)
    })
  }

  return (
    <Dialog
      open={aperto}
      onOpenChange={(v) => {
        setAperto(v)
        if (!v) {
          setErrore(null)
          setData(oggi)
        }
      }}
    >
      <DialogTrigger render={<Button type="button" variant="outline" className="h-11" />}>
        {t.chiudi}
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{t.titoloChiudi}</DialogTitle>
          <DialogDescription>{t.descrizioneChiudi(etichetta)}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={idCampo}>{t.ultimoGiorno}</Label>
          <Input
            id={idCampo}
            type="date"
            value={data}
            onChange={(e) => setData(e.currentTarget.value)}
            className="num h-11"
          />
        </div>
        {errore ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {errore}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" className="h-11" />}>{t.annulla}</DialogClose>
          <Button type="button" className="h-11" disabled={inCorso || !data} onClick={chiudi}>
            {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {data ? t.chiudiDal(formatData(data)) : t.scegliData}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function ModificaRegola({ regola, etichetta }: { regola: ModificaRegolaInput; etichetta: string }) {
  const [aperto, setAperto] = useState(false)
  const { errore, setErrore, salva } = useSalvataggio()
  const lingua = useLingua()
  const t = IMPOSTAZIONI[lingua].regoleForm
  const tr = (testo: string | undefined) => traduciImpostazioni(testo, lingua)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ModificaRegolaInput>({
    resolver: zodResolver(modificaRegolaSchema),
    defaultValues: { ...regola, valida_al: regola.valida_al ?? '' },
  })

  const invia = handleSubmit(async (valori) => {
    if (await salva(() => modificaRegola(valori), t.aggiornata)) setAperto(false)
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
      trigger={<Button type="button" variant="outline" className="h-11" />}
      contenutoTrigger={
        <>
          <Pencil className="size-4" aria-hidden="true" />
          {t.modifica}
        </>
      }
      titolo={t.titoloModifica(etichetta)}
      descrizione={t.descrizioneModifica}
    >
      <form onSubmit={invia} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`mr-perc-${regola.id}`}>{t.percentuale}</Label>
          <div className="relative">
            <Input id={`mr-perc-${regola.id}`} inputMode="decimal" className="num h-11 pr-8 text-right" {...register('percentuale')} />
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground">%</span>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={`mr-dal-${regola.id}`}>{t.valeDal}</Label>
            <Input id={`mr-dal-${regola.id}`} type="date" className="num h-11" {...register('valida_dal')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`mr-al-${regola.id}`}>{t.finoAl}</Label>
            <Input id={`mr-al-${regola.id}`} type="date" className="num h-11" {...register('valida_al')} />
          </div>
        </div>
        <ErroreCampo
          id={`mr-errore-${regola.id}`}
          messaggio={tr(errors.percentuale?.message ?? errors.valida_dal?.message ?? errors.valida_al?.message)}
        />
        <SceltaMultipla
          legenda={t.siApplica}
          opzioni={opzioniTipi(lingua)}
          registrazione={register('applica_a')}
          errore={tr(errors.applica_a?.message)}
        />
        <ErroreModulo testo={traduciImpostazioni(errore, lingua) ?? null} />
        <BottoneSalva inCorso={isSubmitting}>{t.salvaRegola}</BottoneSalva>
        <div className="border-t border-border pt-4">
          <Elimina
            etichetta={t.elimina}
            cosa={t.laRegola(etichetta)}
            fatto={t.eliminata}
            // the Italian sentences are written here too: tests/alfire-scritture.test.ts reads them from this file
            conseguenze={
              lingua === 'it'
                ? [
                    'Le provvigioni maturate con questa regola spariscono da tutti i mesi, anche passati.',
                    'Per smettere da una data in poi, usa “Chiudi” invece di eliminare.',
                  ]
                : [...t.conseguenze]
            }
            azione={() => eliminaRegola({ id: regola.id })}
          />
        </div>
      </form>
    </FoglioModifica>
  )
}
