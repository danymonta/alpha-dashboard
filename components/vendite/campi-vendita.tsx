'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useWatch, type UseFormReturn } from 'react-hook-form'

import { anteprimaPianoRate, type RataAnteprima } from '@/app/(app)/sales/new/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { SceltaRapida } from '@/components/form/scelta-rapida'
import { PianoRateEditor } from '@/components/vendite/piano-rate-editor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useLingua } from '@/components/i18n/lingua-provider'
import { fineDopoMesi, stessoGiornoTraMesi } from '@/lib/date'
import { formato, formatImportoInput } from '@/lib/format'
import { parseImporto } from '@/lib/importi'
import { traduciErrore } from '@/lib/i18n/testi/errori-economics'
import { NUOVA_VENDITA } from '@/lib/i18n/testi/nuova-vendita'
import {
  OPZIONI_RATE,
  PERSONALIZZATO,
  inizioPredefinito,
  type NuovaVendita,
  type NuovaVenditaInput,
} from '@/lib/validation/vendita'

/*
 * The fields of a sale, shared by «Nuova vendita» (app/(app)/sales/new) and by the screen
 * «Vendita» of the wizard «Nuovo cliente» (app/(app)/onboarding/nuovo, 1.77.0): one set of
 * inputs and one set of reactions on the same form of nuovaVenditaSchema, so the two can
 * never drift apart. Whoever uses them owns the form (useForm), the client fields, the
 * type of sale and the submit.
 */

export type ProdottoVendita = {
  id: string
  nome: string
  durata_mesi: number
  prezzo_listino: number
  /** Usual plan: months from the sale date and amount of each instalment. */
  piano_predefinito: { mese: number; importo: number }[] | null
}

export type FormVendita = UseFormReturn<NuovaVenditaInput, unknown, NuovaVendita>

const RITARDO_ANTEPRIMA_MS = 350

/**
 * The reactions of the form of a sale: the list price on a product change, the usual plan
 * of a product, the start following the sale date (a week later) while it is still the
 * proposed day, and the preview of the equal instalments asked to the database.
 */
export function useReazioniVendita(
  form: FormVendita,
  {
    prodotti,
    oggi,
    dataVenditaIniziale,
    anteprimaIniziale = null,
  }: {
    prodotti: readonly ProdottoVendita[]
    oggi: string
    dataVenditaIniziale: string
    anteprimaIniziale?: RataAnteprima[] | null
  },
): { anteprima: RataAnteprima[] | null; calcolo: boolean } {
  const { subscribe, setValue, getFieldState } = form
  const [anteprima, setAnteprima] = useState<RataAnteprima[] | null>(anteprimaIniziale)
  const [calcolo, setCalcolo] = useState(false)
  const richiesta = useRef(0)
  // the start follows the sale date (a week later) only while it is still the proposed day
  const venditaPrima = useRef(dataVenditaIniziale)

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null

    const annulla = subscribe({
      formState: { values: true },
      callback: ({ values: valori, name }) => {
        // Writes wait for the current notification to finish: a setValue made
        // inside it reaches useWatch before the outer, older snapshot, which
        // would then win (the plan switch would snap back to "Rate uguali").
        queueMicrotask(() => {
          if (name === 'product_id' && !getFieldState('valore_contratto').isDirty) {
            const prodotto = prodotti.find((p) => p.id === valori.product_id)
            if (prodotto) {
              setValue('valore_contratto', formatImportoInput(prodotto.prezzo_listino), {
                shouldValidate: true,
              })
            }
          }

          // a product with its usual plan starts the form from it, still editable
          if (name === 'product_id' && !getFieldState('rate').isDirty) {
            const prodotto = prodotti.find((p) => p.id === valori.product_id)
            const base = valori.data_vendita || oggi
            if (prodotto?.piano_predefinito?.length) {
              setValue('piano', 'personalizzato')
              setValue(
                'rate',
                prodotto.piano_predefinito.map((r) => ({
                  scadenza: stessoGiornoTraMesi(base, r.mese),
                  importo: formatImportoInput(r.importo),
                })),
              )
            }
          }

          // a start chosen by hand, or a renewal's, stays where it is
          if (name === 'data_vendita' && valori.data_vendita) {
            if (
              !getFieldState('data_inizio').isDirty &&
              valori.data_inizio === inizioPredefinito(venditaPrima.current)
            ) {
              setValue('data_inizio', inizioPredefinito(valori.data_vendita))
            }
            venditaPrima.current = valori.data_vendita
          }
        })

        if (!['valore_contratto', 'numero_rate', 'data_vendita', 'product_id'].includes(name ?? '')) {
          return
        }

        if (timer) clearTimeout(timer)
        timer = setTimeout(async () => {
          const valore =
            typeof valori.valore_contratto === 'number'
              ? valori.valore_contratto
              : parseImporto(valori.valore_contratto)
          const numero = Number(valori.numero_rate)
          const id = ++richiesta.current

          if (!valore || !numero || !valori.data_vendita) {
            setAnteprima(null)
            return
          }

          setCalcolo(true)
          const piano = await anteprimaPianoRate({
            valore,
            numero_rate: numero,
            data_vendita: valori.data_vendita,
          })
          // a slower, older answer must not overwrite a newer one
          if (id === richiesta.current) {
            setAnteprima(piano)
            setCalcolo(false)
          }
        }, RITARDO_ANTEPRIMA_MS)
      },
    })

    return () => {
      annulla()
      if (timer) clearTimeout(timer)
    }
  }, [subscribe, setValue, getFieldState, prodotti, oggi])

  return { anteprima, calcolo }
}

/**
 * What was sold: the product (or a custom path with its name and its end), the contract
 * value, the sale date and the start of the path, the notes. `prima` goes above the
 * product: «Nuova vendita» puts the type of sale there.
 */
export function CampiVendita({
  form,
  prodotti,
  oggi,
  prima = null,
  aiutoInizio = true,
}: {
  form: FormVendita
  prodotti: readonly ProdottoVendita[]
  oggi: string
  prima?: ReactNode
  /** The line under the dates that says to check the start; a renewal says where it starts elsewhere. */
  aiutoInizio?: boolean
}) {
  const lingua = useLingua()
  const t = NUOVA_VENDITA[lingua]
  const { formatData, formatEuro } = formato(lingua)
  const tr = (testo: string | undefined) => traduciErrore(testo, lingua)
  const {
    register,
    control,
    setValue,
    getValues,
    formState: { errors },
  } = form
  const [productId, dataInizio] = useWatch({ control, name: ['product_id', 'data_inizio'] })
  const personalizzato = productId === PERSONALIZZATO
  const prodottoScelto = prodotti.find((p) => p.id === productId)

  return (
    <>
      {prima}

      <SceltaRapida
        legenda={t.prodotto}
        opzioni={[
          ...prodotti.map((p) => ({
            valore: p.id,
            etichetta: (
              <>
                <span>{p.nome}</span>
                <span className="num text-xs opacity-80">
                  {formatEuro(p.prezzo_listino, { compatto: true })}
                </span>
              </>
            ),
          })),
          {
            valore: PERSONALIZZATO,
            etichetta: (
              <>
                <span>{t.personalizzato}</span>
                <span className="text-xs opacity-80">{t.nomeEDurata}</span>
              </>
            ),
          },
        ]}
        registrazione={register('product_id')}
        errore={tr(errors.product_id?.message)}
        colonne={prodotti.length + 1 <= 3 ? 3 : 2}
        aiuto={t.prodottiAiuto}
      />

      {personalizzato ? (
        <div className="space-y-4 rounded-xl bg-card p-3">
          <div className="space-y-1.5">
            <Label htmlFor="prodotto_personalizzato">{t.cosaHaiVenduto}</Label>
            <Input
              id="prodotto_personalizzato"
              placeholder={t.cosaHaiVendutoPlaceholder}
              className="h-11"
              aria-invalid={errors.prodotto_personalizzato ? true : undefined}
              {...register('prodotto_personalizzato')}
            />
            <ErroreCampo id="personalizzato-errore" messaggio={tr(errors.prodotto_personalizzato?.message)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="data_fine">{t.fine}</Label>
            <Input
              id="data_fine"
              type="date"
              className="num h-11"
              aria-invalid={errors.data_fine ? true : undefined}
              {...register('data_fine')}
            />
            <div className="flex flex-wrap gap-2" role="group" aria-label={t.durataRapida}>
              {[3, 6, 9, 12].map((mesi) => (
                <Button
                  key={mesi}
                  type="button"
                  variant="outline"
                  className="h-11"
                  onClick={() =>
                    setValue('data_fine', fineDopoMesi(getValues('data_inizio') || oggi, mesi), { shouldValidate: true })
                  }
                >
                  {t.mesi(mesi)}
                </Button>
              ))}
            </div>
            <ErroreCampo id="data-fine-errore" messaggio={tr(errors.data_fine?.message)} />
          </div>
        </div>
      ) : prodottoScelto && dataInizio ? (
        <p className="px-1 text-xs text-muted-foreground">
          {t.finisceIl(formatData(fineDopoMesi(dataInizio, prodottoScelto.durata_mesi)), prodottoScelto.durata_mesi)}
        </p>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="valore_contratto">{t.valore}</Label>
        <div className="relative">
          <Input
            id="valore_contratto"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0,00"
            className="num h-11 pr-8 text-right"
            aria-invalid={errors.valore_contratto ? true : undefined}
            aria-describedby="valore-errore"
            {...register('valore_contratto')}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground"
          >
            €
          </span>
        </div>
        <ErroreCampo id="valore-errore" messaggio={tr(errors.valore_contratto?.message)} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="data_vendita">{t.dataVendita}</Label>
          <Input
            id="data_vendita"
            type="date"
            max={oggi}
            className="num h-11"
            aria-invalid={errors.data_vendita ? true : undefined}
            {...register('data_vendita')}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="data_inizio">{t.inizio}</Label>
          <Input
            id="data_inizio"
            type="date"
            className="num h-11"
            aria-invalid={errors.data_inizio ? true : undefined}
            aria-describedby={aiutoInizio ? 'inizio-aiuto' : undefined}
            {...register('data_inizio')}
          />
        </div>
      </div>
      {aiutoInizio ? (
        <p id="inizio-aiuto" className="px-1 text-xs text-muted-foreground">
          {t.inizioAiuto}
        </p>
      ) : null}
      <ErroreCampo
        id="date-errore"
        messaggio={tr(errors.data_vendita?.message ?? errors.data_inizio?.message)}
      />

      <div className="space-y-1.5">
        <Label htmlFor="note">
          {t.note} <span className="font-normal text-muted-foreground">{t.facoltative}</span>
        </Label>
        <Textarea id="note" rows={2} maxLength={1000} {...register('note')} />
      </div>
    </>
  )
}

/**
 * How the client pays: equal monthly instalments, with their preview from the database,
 * or a plan written by hand (PianoRateEditor).
 */
export function CampiPianoRate({
  form,
  oggi,
  anteprima,
  calcolo,
}: {
  form: FormVendita
  oggi: string
  anteprima: RataAnteprima[] | null
  calcolo: boolean
}) {
  const lingua = useLingua()
  const t = NUOVA_VENDITA[lingua]
  const { formatData, formatEuro } = formato(lingua)
  const tr = (testo: string | undefined) => traduciErrore(testo, lingua)
  const {
    register,
    control,
    setValue,
    getValues,
    formState: { errors },
  } = form
  const [piano, valoreTesto, dataVendita] = useWatch({ control, name: ['piano', 'valore_contratto', 'data_vendita'] })
  const valoreNumero = typeof valoreTesto === 'number' ? valoreTesto : parseImporto(valoreTesto ?? '')

  return (
    <>
      <SceltaRapida
        legenda={t.comePaga}
        opzioni={[
          { valore: 'uguale', etichetta: t.rateUguali },
          { valore: 'personalizzato', etichetta: t.pianoPersonalizzato },
        ]}
        registrazione={register('piano', {
          onChange: (e: { target: { value: string } }) => {
            // starting a hand-written plan from the equal split already shown
            if (e.target.value === 'personalizzato' && (getValues('rate') ?? []).length === 0 && anteprima?.length) {
              setValue(
                'rate',
                anteprima.map((r) => ({ scadenza: r.scadenza, importo: formatImportoInput(r.importo) })),
              )
            }
          },
        })}
        colonne={2}
      />

      {piano === 'personalizzato' ? (
        <PianoRateEditor
          control={control}
          register={register}
          errors={errors}
          valore={valoreNumero}
          dataVendita={dataVendita || oggi}
        />
      ) : (
        <>
          <SceltaRapida
            legenda={t.numeroRate}
            opzioni={OPZIONI_RATE.map((n) => ({ valore: String(n), etichetta: String(n) }))}
            registrazione={register('numero_rate')}
            errore={tr(errors.numero_rate?.message)}
            colonne={6}
          />
          {anteprima && anteprima.length > 0 ? (
            <div aria-live="polite" className={calcolo ? 'opacity-60' : undefined}>
              <table className="w-full text-sm" data-testid="anteprima-rate">
                <caption className="sr-only">{t.anteprima}</caption>
                <thead className="text-xs text-muted-foreground">
                  <tr>
                    <th scope="col" className="px-3 py-2 text-left font-normal">{t.rata}</th>
                    <th scope="col" className="px-3 py-2 text-left font-normal">{t.scadenza}</th>
                    <th scope="col" className="px-3 py-2 text-right font-normal">{t.importo}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border rounded-xl bg-card">
                  {anteprima.map((r) => (
                    <tr key={r.numero_rata}>
                      <td className="px-3 py-2.5">{t.ordinale(r.numero_rata)}</td>
                      <td className="px-3 py-2.5">{formatData(r.scadenza)}</td>
                      <td className="px-3 py-2.5 text-right">{formatEuro(r.importo)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 px-1 text-xs text-muted-foreground">
                {t.rateMensili}
              </p>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
              {calcolo ? t.calcolo : t.scegliPerPiano}
            </p>
          )}
        </>
      )}
    </>
  )
}
