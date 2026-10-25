'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronLeft, CircleCheck, LoaderCircle, MoreHorizontal, TriangleAlert } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import {
  annullaIncasso,
  eliminaRata,
  modificaIncasso,
  modificaRata,
  registraRimborso,
  segnaFallita,
  segnaIncassata,
  type EsitoRata,
} from '@/app/(app)/sales/[id]/actions'
import { Elimina } from '@/components/form/elimina'
import { ErroreCampo } from '@/components/form/errore-campo'
import { SceltaRapida } from '@/components/form/scelta-rapida'
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
import { useLingua, useTesti } from '@/components/i18n/lingua-provider'
import type { Database } from '@/lib/supabase/database.types'
import { formato, formatImportoInput } from '@/lib/format'
import { traduciErrore, tradotto } from '@/lib/i18n/testi/errori-economics'
import { ETICHETTE } from '@/lib/i18n/testi/etichette'
import { RATA } from '@/lib/i18n/testi/nuova-vendita'
import { cn } from '@/lib/utils'
import {
  METODI,
  modificaIncassoSchema,
  modificaRataSchema,
  rimborsoSchema,
  segnaIncassataSchema,
  type ModificaIncassoInput,
  type ModificaRataInput,
  type RimborsoInput,
  type SegnaIncassataInput,
} from '@/lib/validation/incasso'

type Rata = {
  id: string
  numero_rata: number
  scadenza: string
  importo_previsto: number
  stato: Database['public']['Enums']['payment_status']
  importo_incassato: number | null
  incassato_il?: string | null
  metodo?: Database['public']['Enums']['payment_method'] | null
}

type Props = {
  rata: Rata
  admin: boolean
  oggi: string
  /** The one instalment to act on first: filled button. The others are outline. */
  principale?: boolean
  className?: string
}

type Vista = 'menu' | 'incasso' | 'modifica' | 'correggi' | 'rimborso'

function useOpzioniMetodo() {
  const etichette = useTesti(ETICHETTE).metodo
  return METODI.map((m) => ({ valore: m, etichetta: etichette[m] }))
}

function Errore({ testo }: { testo: string | null }) {
  const lingua = useLingua()
  if (!testo) return null
  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {traduciErrore(testo, lingua)}
    </p>
  )
}

export function RataAzioni({ rata, admin, oggi, principale = false, className }: Props) {
  const [inCorso, avvia] = useTransition()
  const [aperto, setAperto] = useState(false)
  const [vista, setVista] = useState<Vista>('menu')
  const [errore, setErrore] = useState<string | null>(null)

  const lingua = useLingua()
  const t = RATA[lingua]
  const { formatData, formatEuro } = formato(lingua)
  const daIncassare = rata.stato === 'prevista' || rata.stato === 'fallita'
  const etichetta = t.rata(rata.numero_rata)

  function esegui(azione: () => Promise<EsitoRata>, successo: (e: EsitoRata & { ok: true }) => void) {
    setErrore(null)
    avvia(async () => {
      let esito: EsitoRata
      try {
        esito = await azione()
      } catch {
        setErrore('Connessione assente. Riprova.')
        toast.error(traduciErrore('Connessione assente. Riprova.', lingua))
        return
      }
      if (!esito.ok) {
        setErrore(esito.errore)
        toast.error(traduciErrore(esito.errore, lingua))
        return
      }
      successo(esito)
      setAperto(false)
      setVista('menu')
    })
  }

  // The one tap: today, planned amount. Undo lives in the toast.
  function incassaSubito() {
    esegui(
      () => segnaIncassata({ payment_id: rata.id }),
      (e) =>
        toast.success(t.incassata(etichetta, formatEuro(e.importo ?? rata.importo_previsto)), {
          action: {
            label: t.annulla,
            onClick: () => void annullaIncasso({ payment_id: rata.id }),
          },
        }),
    )
  }

  function apriChiudi(valore: boolean) {
    setAperto(valore)
    if (!valore) {
      setVista('menu')
      setErrore(null)
    }
  }

  return (
    <div className={cn('flex items-center justify-end gap-2', className)}>
      <Sheet open={aperto} onOpenChange={apriChiudi}>
        <SheetTrigger
          render={
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="size-11"
              aria-label={t.altreAzioni(etichetta)}
            />
          }
        >
          <MoreHorizontal className="size-4" aria-hidden="true" />
        </SheetTrigger>
        <SheetContent
          side="bottom"
          className="mx-auto w-full max-w-lg rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]"
        >
          <SheetHeader>
            <SheetTitle>{etichetta}</SheetTitle>
            <SheetDescription>
              {t.scadenzaRiga(formatData(rata.scadenza), formatEuro(rata.importo_incassato ?? rata.importo_previsto))}
            </SheetDescription>
          </SheetHeader>

          <div className="space-y-4 px-4">
            {vista !== 'menu' ? (
              <button
                type="button"
                className="flex min-h-11 items-center gap-1 text-sm text-muted-foreground"
                onClick={() => {
                  setVista('menu')
                  setErrore(null)
                }}
              >
                <ChevronLeft className="size-4" aria-hidden="true" />
                {t.indietro}
              </button>
            ) : null}

            {vista === 'menu' ? (
              <div className="grid gap-2">
                {daIncassare ? (
                  <>
                    <Button type="button" variant="outline" className="h-12 justify-start" onClick={() => setVista('incasso')}>
                      {t.incassataDiversa}
                    </Button>
                    {rata.stato === 'prevista' ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-12 justify-start"
                        disabled={inCorso}
                        onClick={() =>
                          esegui(
                            () => segnaFallita({ payment_id: rata.id }),
                            () => toast.success(t.fallita(etichetta)),
                          )
                        }
                      >
                        {t.fallito}
                      </Button>
                    ) : null}
                    {admin && rata.stato === 'prevista' ? (
                      <Button type="button" variant="outline" className="h-12 justify-start" onClick={() => setVista('modifica')}>
                        {t.modifica}
                      </Button>
                    ) : null}
                    {rata.stato === 'fallita' ? (
                      <Button
                        type="button"
                        variant="outline"
                        className="h-12 justify-start"
                        disabled={inCorso}
                        onClick={() =>
                          esegui(
                            () => annullaIncasso({ payment_id: rata.id }),
                            () => toast.success(t.daIncassare(etichetta)),
                          )
                        }
                      >
                        {t.rimetti}
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <>
                    {rata.stato === 'incassata' ? (
                      <Button type="button" variant="outline" className="h-12 justify-start" onClick={() => setVista('correggi')}>
                        {t.correggi}
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 justify-start"
                      disabled={inCorso}
                      onClick={() =>
                        esegui(
                          () => annullaIncasso({ payment_id: rata.id }),
                          () => toast.success(t.incassoAnnullato(etichetta)),
                        )
                      }
                    >
                      {t.annullaIncasso}
                    </Button>
                    {admin ? (
                      <Button type="button" variant="outline" className="h-12 justify-start" onClick={() => setVista('rimborso')}>
                        {t.rimborso}
                      </Button>
                    ) : null}
                  </>
                )}
                {admin ? (
                  <Elimina
                    etichetta={t.elimina}
                    cosa={t.cosa(etichetta)}
                    fatto={t.eliminata(etichetta)}
                    conseguenze={
                      rata.stato === 'incassata' ? [t.escePrevisto(formatEuro(rata.importo_incassato))] : [t.rinumera]
                    }
                    azione={async () => tradotto(await eliminaRata({ payment_id: rata.id }), lingua)}
                  />
                ) : null}
              </div>
            ) : null}

            {vista === 'incasso' ? (
              <FormIncasso rata={rata} oggi={oggi} inCorso={inCorso} onInvia={(v) =>
                esegui(() => segnaIncassata(v), (e) =>
                  toast.success(t.incassata(etichetta, formatEuro(e.importo ?? 0))),
                )}
              />
            ) : null}

            {vista === 'modifica' ? (
              <FormModifica rata={rata} inCorso={inCorso} onInvia={(v) =>
                esegui(() => modificaRata(v), () => toast.success(t.aggiornata(etichetta)))}
              />
            ) : null}

            {vista === 'correggi' ? (
              <FormCorreggi rata={rata} oggi={oggi} inCorso={inCorso} onInvia={(v) =>
                esegui(() => modificaIncasso(v), (e) =>
                  toast.success(t.corretto(formatEuro(e.importo ?? 0))),
                )}
              />
            ) : null}

            {vista === 'rimborso' ? (
              <FormRimborso rata={rata} oggi={oggi} inCorso={inCorso} onInvia={(v) =>
                esegui(() => registraRimborso(v), (e) =>
                  toast.success(t.rimborsato(formatEuro(e.importo ?? 0))),
                )}
              />
            ) : null}

            {inCorso ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                {t.salvataggio}
              </p>
            ) : null}
            <Errore testo={errore} />
          </div>
        </SheetContent>
      </Sheet>

      {daIncassare ? (
        <Button
          type="button"
          variant={principale ? 'default' : 'outline'}
          // phone: the main action takes the rest of the row
          className="h-11 flex-1 md:flex-none"
          disabled={inCorso}
          onClick={incassaSubito}
        >
          {inCorso ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <CircleCheck className="size-4" aria-hidden="true" />
          )}
          {t.segnaIncassata}
        </Button>
      ) : null}
    </div>
  )
}

function FormIncasso({
  rata,
  oggi,
  inCorso,
  onInvia,
}: {
  rata: Rata
  oggi: string
  inCorso: boolean
  onInvia: (v: SegnaIncassataInput) => void
}) {
  const lingua = useLingua()
  const t = RATA[lingua]
  const OPZIONI_METODO = useOpzioniMetodo()
  const { register, handleSubmit, formState: { errors } } = useForm<SegnaIncassataInput>({
    resolver: zodResolver(segnaIncassataSchema),
    defaultValues: {
      payment_id: rata.id,
      incassato_il: oggi,
      importo: formatImportoInput(rata.importo_previsto),
      metodo: null,
    },
  })

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((valori) => onInvia(valori))}
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`incassato-${rata.id}`}>{t.incassataIl}</Label>
          <Input id={`incassato-${rata.id}`} type="date" max={oggi} className="num h-11" {...register('incassato_il')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`importo-${rata.id}`}>{t.importo}</Label>
          <Input id={`importo-${rata.id}`} inputMode="decimal" className="num h-11 text-right" {...register('importo')} />
        </div>
      </div>
      <ErroreCampo id={`incasso-errore-${rata.id}`} messaggio={traduciErrore(errors.incassato_il?.message ?? errors.importo?.message, lingua)} />
      <SceltaRapida legenda={t.metodo} opzioni={OPZIONI_METODO} registrazione={register('metodo')} />
      <Button type="submit" className="h-11 w-full" disabled={inCorso}>
        {t.registraIncasso}
      </Button>
    </form>
  )
}

function FormCorreggi({
  rata,
  oggi,
  inCorso,
  onInvia,
}: {
  rata: Rata
  oggi: string
  inCorso: boolean
  onInvia: (v: ModificaIncassoInput) => void
}) {
  const lingua = useLingua()
  const t = RATA[lingua]
  const OPZIONI_METODO = useOpzioniMetodo()
  const { register, handleSubmit, formState: { errors } } = useForm<ModificaIncassoInput>({
    resolver: zodResolver(modificaIncassoSchema),
    defaultValues: {
      payment_id: rata.id,
      incassato_il: rata.incassato_il ?? oggi,
      importo: formatImportoInput(rata.importo_incassato),
      metodo: rata.metodo ?? null,
    },
  })

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((valori) => onInvia(valori))}
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`correggi-data-${rata.id}`}>{t.incassataIl}</Label>
          <Input id={`correggi-data-${rata.id}`} type="date" max={oggi} className="num h-11" {...register('incassato_il')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`correggi-importo-${rata.id}`}>{t.importoIncassato}</Label>
          <Input id={`correggi-importo-${rata.id}`} inputMode="decimal" className="num h-11 text-right" {...register('importo')} />
        </div>
      </div>
      <ErroreCampo id={`correggi-errore-${rata.id}`} messaggio={traduciErrore(errors.incassato_il?.message ?? errors.importo?.message, lingua)} />
      <SceltaRapida legenda={t.metodo} opzioni={OPZIONI_METODO} registrazione={register('metodo')} />
      <Button type="submit" className="h-11 w-full" disabled={inCorso}>
        {t.salvaCorrezione}
      </Button>
    </form>
  )
}

function FormModifica({
  rata,
  inCorso,
  onInvia,
}: {
  rata: Rata
  inCorso: boolean
  onInvia: (v: ModificaRataInput) => void
}) {
  const lingua = useLingua()
  const t = RATA[lingua]
  const { register, handleSubmit, formState: { errors } } = useForm<ModificaRataInput>({
    resolver: zodResolver(modificaRataSchema),
    defaultValues: {
      payment_id: rata.id,
      scadenza: rata.scadenza,
      importo_previsto: formatImportoInput(rata.importo_previsto),
    },
  })

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((valori) => onInvia(valori))}
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`scadenza-${rata.id}`}>{t.scadenza}</Label>
          <Input id={`scadenza-${rata.id}`} type="date" className="num h-11" {...register('scadenza')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`previsto-${rata.id}`}>{t.importoPrevisto}</Label>
          <Input id={`previsto-${rata.id}`} inputMode="decimal" className="num h-11 text-right" {...register('importo_previsto')} />
        </div>
      </div>
      <ErroreCampo id={`modifica-errore-${rata.id}`} messaggio={traduciErrore(errors.scadenza?.message ?? errors.importo_previsto?.message, lingua)} />
      <p className="text-xs text-muted-foreground">{t.scarto}</p>
      <Button type="submit" className="h-11 w-full" disabled={inCorso}>
        {t.salvaRata}
      </Button>
    </form>
  )
}

function FormRimborso({
  rata,
  oggi,
  inCorso,
  onInvia,
}: {
  rata: Rata
  oggi: string
  inCorso: boolean
  onInvia: (v: RimborsoInput) => void
}) {
  const lingua = useLingua()
  const t = RATA[lingua]
  const { register, handleSubmit, formState: { errors } } = useForm<RimborsoInput>({
    resolver: zodResolver(rimborsoSchema),
    defaultValues: {
      payment_id: rata.id,
      data: oggi,
      importo: formatImportoInput(rata.importo_incassato),
      note: '',
    },
  })

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={handleSubmit((valori) => onInvia(valori))}
    >
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor={`rimborso-data-${rata.id}`}>{t.rimborsatoIl}</Label>
          <Input id={`rimborso-data-${rata.id}`} type="date" max={oggi} className="num h-11" {...register('data')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`rimborso-importo-${rata.id}`}>{t.importo}</Label>
          <Input id={`rimborso-importo-${rata.id}`} inputMode="decimal" className="num h-11 text-right" {...register('importo')} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`rimborso-note-${rata.id}`}>{t.motivo}</Label>
        <Input id={`rimborso-note-${rata.id}`} className="h-11" {...register('note')} />
      </div>
      <ErroreCampo id={`rimborso-errore-${rata.id}`} messaggio={traduciErrore(errors.data?.message ?? errors.importo?.message, lingua)} />
      <p className="text-xs text-muted-foreground">{t.rimborsoMese}</p>
      <Button type="submit" variant="destructive" className="h-11 w-full" disabled={inCorso}>
        {t.registraRimborso}
      </Button>
    </form>
  )
}
