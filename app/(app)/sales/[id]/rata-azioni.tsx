'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { ChevronLeft, CircleCheck, LoaderCircle, MoreHorizontal, TriangleAlert } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import {
  annullaIncasso,
  modificaRata,
  registraRimborso,
  segnaFallita,
  segnaIncassata,
  type EsitoRata,
} from '@/app/(app)/sales/[id]/actions'
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
import type { Database } from '@/lib/supabase/database.types'
import { formatData, formatEuro, formatImportoInput } from '@/lib/format'
import {
  ETICHETTA_METODO,
  METODI,
  modificaRataSchema,
  rimborsoSchema,
  segnaIncassataSchema,
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
}

type Props = {
  rata: Rata
  admin: boolean
  oggi: string
  /** The one instalment to act on first: filled button. The others are outline. */
  principale?: boolean
}

type Vista = 'menu' | 'incasso' | 'modifica' | 'rimborso'

const OPZIONI_METODO = METODI.map((m) => ({ valore: m, etichetta: ETICHETTA_METODO[m] }))

function Errore({ testo }: { testo: string | null }) {
  if (!testo) return null
  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {testo}
    </p>
  )
}

export function RataAzioni({ rata, admin, oggi, principale = false }: Props) {
  const [inCorso, avvia] = useTransition()
  const [aperto, setAperto] = useState(false)
  const [vista, setVista] = useState<Vista>('menu')
  const [errore, setErrore] = useState<string | null>(null)

  const daIncassare = rata.stato === 'prevista' || rata.stato === 'fallita'
  const etichetta = `Rata ${rata.numero_rata}`

  function esegui(azione: () => Promise<EsitoRata>, successo: (e: EsitoRata & { ok: true }) => void) {
    setErrore(null)
    avvia(async () => {
      let esito: EsitoRata
      try {
        esito = await azione()
      } catch {
        setErrore('Connessione assente. Riprova.')
        toast.error('Connessione assente. Riprova.')
        return
      }
      if (!esito.ok) {
        setErrore(esito.errore)
        toast.error(esito.errore)
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
        toast.success(`${etichetta} incassata · ${formatEuro(e.importo ?? rata.importo_previsto)}`, {
          action: {
            label: 'Annulla',
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
    <div className="flex items-center justify-end gap-2">
      <Sheet open={aperto} onOpenChange={apriChiudi}>
        <SheetTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-11"
              aria-label={`Altre azioni sulla ${etichetta.toLowerCase()}`}
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
              Scadenza {formatData(rata.scadenza)} · {formatEuro(rata.importo_incassato ?? rata.importo_previsto)}
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
                Indietro
              </button>
            ) : null}

            {vista === 'menu' ? (
              <div className="grid gap-2">
                {daIncassare ? (
                  <>
                    <Button type="button" variant="outline" className="h-12 justify-start" onClick={() => setVista('incasso')}>
                      Incassata con data, importo o metodo diversi
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
                            () => toast.success(`${etichetta} segnata come fallita`),
                          )
                        }
                      >
                        Pagamento fallito
                      </Button>
                    ) : null}
                    {admin && rata.stato === 'prevista' ? (
                      <Button type="button" variant="outline" className="h-12 justify-start" onClick={() => setVista('modifica')}>
                        Modifica scadenza o importo
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
                            () => toast.success(`${etichetta} di nuovo da incassare`),
                          )
                        }
                      >
                        Rimetti da incassare
                      </Button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-12 justify-start"
                      disabled={inCorso}
                      onClick={() =>
                        esegui(
                          () => annullaIncasso({ payment_id: rata.id }),
                          () => toast.success(`Incasso della ${etichetta.toLowerCase()} annullato`),
                        )
                      }
                    >
                      Annulla l’incasso
                    </Button>
                    {admin ? (
                      <Button type="button" variant="outline" className="h-12 justify-start" onClick={() => setVista('rimborso')}>
                        Registra un rimborso
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            ) : null}

            {vista === 'incasso' ? (
              <FormIncasso rata={rata} oggi={oggi} inCorso={inCorso} onInvia={(v) =>
                esegui(() => segnaIncassata(v), (e) =>
                  toast.success(`${etichetta} incassata · ${formatEuro(e.importo ?? 0)}`),
                )}
              />
            ) : null}

            {vista === 'modifica' ? (
              <FormModifica rata={rata} inCorso={inCorso} onInvia={(v) =>
                esegui(() => modificaRata(v), () => toast.success(`${etichetta} aggiornata`))}
              />
            ) : null}

            {vista === 'rimborso' ? (
              <FormRimborso rata={rata} oggi={oggi} inCorso={inCorso} onInvia={(v) =>
                esegui(() => registraRimborso(v), (e) =>
                  toast.success(`Rimborso registrato · ${formatEuro(e.importo ?? 0)}`),
                )}
              />
            ) : null}

            {inCorso ? (
              <p className="flex items-center gap-2 text-sm text-muted-foreground" aria-live="polite">
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                Salvataggio…
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
          className="h-11"
          disabled={inCorso}
          onClick={incassaSubito}
        >
          {inCorso ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <CircleCheck className="size-4" aria-hidden="true" />
          )}
          Segna incassata
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
          <Label htmlFor={`incassato-${rata.id}`}>Incassata il</Label>
          <Input id={`incassato-${rata.id}`} type="date" max={oggi} className="num h-11" {...register('incassato_il')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`importo-${rata.id}`}>Importo</Label>
          <Input id={`importo-${rata.id}`} inputMode="decimal" className="num h-11 text-right" {...register('importo')} />
        </div>
      </div>
      <ErroreCampo id={`incasso-errore-${rata.id}`} messaggio={errors.incassato_il?.message ?? errors.importo?.message} />
      <SceltaRapida legenda="Metodo (facoltativo)" opzioni={OPZIONI_METODO} registrazione={register('metodo')} />
      <Button type="submit" className="h-11 w-full" disabled={inCorso}>
        Registra l’incasso
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
          <Label htmlFor={`scadenza-${rata.id}`}>Scadenza</Label>
          <Input id={`scadenza-${rata.id}`} type="date" className="num h-11" {...register('scadenza')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`previsto-${rata.id}`}>Importo previsto</Label>
          <Input id={`previsto-${rata.id}`} inputMode="decimal" className="num h-11 text-right" {...register('importo_previsto')} />
        </div>
      </div>
      <ErroreCampo id={`modifica-errore-${rata.id}`} messaggio={errors.scadenza?.message ?? errors.importo_previsto?.message} />
      <p className="text-xs text-muted-foreground">
        Se cambi un importo, il dettaglio segnala lo scarto dal valore del contratto.
      </p>
      <Button type="submit" className="h-11 w-full" disabled={inCorso}>
        Salva la rata
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
          <Label htmlFor={`rimborso-data-${rata.id}`}>Rimborsato il</Label>
          <Input id={`rimborso-data-${rata.id}`} type="date" max={oggi} className="num h-11" {...register('data')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`rimborso-importo-${rata.id}`}>Importo</Label>
          <Input id={`rimborso-importo-${rata.id}`} inputMode="decimal" className="num h-11 text-right" {...register('importo')} />
        </div>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`rimborso-note-${rata.id}`}>Motivo (facoltativo)</Label>
        <Input id={`rimborso-note-${rata.id}`} className="h-11" {...register('note')} />
      </div>
      <ErroreCampo id={`rimborso-errore-${rata.id}`} messaggio={errors.data?.message ?? errors.importo?.message} />
      <p className="text-xs text-muted-foreground">
        Il rimborso resta nel mese in cui avviene: la rata originale conserva il suo incasso.
      </p>
      <Button type="submit" variant="destructive" className="h-11 w-full" disabled={inCorso}>
        Registra il rimborso
      </Button>
    </form>
  )
}
