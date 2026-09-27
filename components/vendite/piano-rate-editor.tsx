'use client'

import { CircleCheck, ListPlus, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useFieldArray, useWatch, type Control, type FieldErrors, type UseFormRegister } from 'react-hook-form'

import { totalePianoPersonalizzato, type TotalePiano } from '@/app/(app)/sales/new/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { CLASSE_SELECT } from '@/components/form/foglio-modifica'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { stessoGiornoTraMesi } from '@/lib/date'
import { formatEuro, formatImportoInput } from '@/lib/format'
import { parseImporto } from '@/lib/importi'
import type { NuovaVenditaInput } from '@/lib/validation/vendita'

type Props = {
  control: Control<NuovaVenditaInput>
  register: UseFormRegister<NuovaVenditaInput>
  errors: FieldErrors<NuovaVenditaInput>
  /** Contract value as typed, for the check against the plan. */
  valore: number | null
  /** First due date proposed for new rows. */
  dataVendita: string
}

/**
 * A plan written by hand: one row per instalment (due date, amount), plus a
 * shortcut to add several monthly instalments at once (e.g. 3 × 500 from a
 * date, then 3 × 333,33 three months later). The total against the contract
 * comes from the database; saving is refused until they match.
 */
export function PianoRateEditor({ control, register, errors, valore, dataVendita }: Props) {
  const { fields, append, remove } = useFieldArray({ control, name: 'rate' })
  const rate = useWatch({ control, name: 'rate' }) ?? []
  const [totale, setTotale] = useState<TotalePiano | null>(null)
  const richiesta = useRef(0)

  // bulk add: n instalments of the same amount, one a month from a date
  const [quante, setQuante] = useState('3')
  const [importoBlocco, setImportoBlocco] = useState('')
  const [dal, setDal] = useState(dataVendita)
  const [erroreBlocco, setErroreBlocco] = useState<string | null>(null)

  const firma = JSON.stringify(rate.map((r) => [r?.scadenza, r?.importo])) + String(valore)
  useEffect(() => {
    const id = ++richiesta.current
    const timer = setTimeout(async () => {
      const righe = rate
        .map((r) => ({ scadenza: r?.scadenza ?? '', importo: typeof r?.importo === 'number' ? r.importo : parseImporto(r?.importo ?? '') }))
        .filter((r): r is { scadenza: string; importo: number } => Boolean(r.scadenza) && r.importo !== null && r.importo > 0)
      const esito = righe.length > 0 ? await totalePianoPersonalizzato({ rate: righe, valore: valore ?? 0 }) : null
      if (id === richiesta.current) setTotale(esito)
    }, 300)
    return () => clearTimeout(timer)
    // the signature captures every value that matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firma])

  function prossimaScadenza() {
    const ultima = [...rate].reverse().find((r) => r?.scadenza)?.scadenza
    return ultima ? stessoGiornoTraMesi(ultima, 1) : dataVendita
  }

  function aggiungiBlocco() {
    const n = Number(quante)
    const importo = parseImporto(importoBlocco)
    if (!Number.isInteger(n) || n < 1 || n > 24) return setErroreBlocco('Da 1 a 24 rate')
    if (importo === null || importo <= 0) return setErroreBlocco('Scrivi l’importo di ogni rata, ad esempio 500')
    if (!dal) return setErroreBlocco('Scegli la data della prima')
    setErroreBlocco(null)
    append(Array.from({ length: n }, (_, i) => ({ scadenza: stessoGiornoTraMesi(dal, i), importo: formatImportoInput(importo) })))
    setDal(stessoGiornoTraMesi(dal, n))
    setImportoBlocco('')
  }

  const erroreLista = (errors.rate as { message?: string } | undefined)?.message ?? errors.rate?.root?.message

  return (
    <div className="space-y-4" data-testid="piano-personalizzato">
      {fields.length > 0 ? (
        <ol className="space-y-2" aria-label="Rate del piano">
          {fields.map((f, i) => {
            const e = errors.rate?.[i]
            return (
              <li key={f.id} className="rounded-lg bg-card p-2">
                <div className="flex items-end gap-2">
                  <span className="num w-8 shrink-0 pb-3 text-center text-sm text-muted-foreground">{i + 1}ª</span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <Label htmlFor={`rata-${i}-scadenza`} className="text-xs text-muted-foreground">
                      Scadenza
                    </Label>
                    <Input id={`rata-${i}-scadenza`} type="date" className="num h-11" {...register(`rate.${i}.scadenza`)} />
                  </div>
                  <div className="w-32 shrink-0 space-y-1">
                    <Label htmlFor={`rata-${i}-importo`} className="text-xs text-muted-foreground">
                      Importo
                    </Label>
                    <Input
                      id={`rata-${i}-importo`}
                      inputMode="decimal"
                      placeholder="0,00"
                      className="num h-11 text-right"
                      {...register(`rate.${i}.importo`)}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-11 shrink-0 text-muted-foreground"
                    aria-label={`Togli la rata ${i + 1}`}
                    onClick={() => remove(i)}
                  >
                    <Trash2 className="size-4" aria-hidden="true" />
                  </Button>
                </div>
                <ErroreCampo id={`rata-${i}-errore`} messaggio={e?.scadenza?.message ?? e?.importo?.message} />
              </li>
            )
          })}
        </ol>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-3 py-4 text-sm text-muted-foreground">
          Nessuna rata ancora: aggiungile una alla volta o a gruppi qui sotto.
        </p>
      )}
      <ErroreCampo id="rate-errore" messaggio={erroreLista} />

      <Button
        type="button"
        variant="outline"
        className="h-11 w-full"
        onClick={() => append({ scadenza: prossimaScadenza(), importo: '' })}
      >
        <Plus className="size-4" aria-hidden="true" />
        Aggiungi una rata
      </Button>

      <fieldset className="space-y-3 rounded-xl border border-border p-3">
        <legend className="px-1 text-sm font-medium">Aggiungi più rate uguali</legend>
        <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2 sm:grid-cols-[5rem_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-1">
            <Label htmlFor="blocco-quante" className="text-xs text-muted-foreground">
              Quante
            </Label>
            <select id="blocco-quante" className={CLASSE_SELECT} value={quante} onChange={(e) => setQuante(e.currentTarget.value)}>
              {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="blocco-importo" className="text-xs text-muted-foreground">
              Importo di ogni rata (€)
            </Label>
            <Input
              id="blocco-importo"
              inputMode="decimal"
              placeholder="500"
              className="num h-11 text-right"
              value={importoBlocco}
              onChange={(e) => setImportoBlocco(e.currentTarget.value)}
            />
          </div>
          <div className="col-span-2 space-y-1 sm:col-span-1">
            <Label htmlFor="blocco-dal" className="text-xs text-muted-foreground">
              Una al mese dal
            </Label>
            <Input id="blocco-dal" type="date" className="num h-11" value={dal} onChange={(e) => setDal(e.currentTarget.value)} />
          </div>
        </div>
        <ErroreCampo id="blocco-errore" messaggio={erroreBlocco ?? undefined} />
        <Button type="button" variant="secondary" className="h-11 w-full" onClick={aggiungiBlocco}>
          <ListPlus className="size-4" aria-hidden="true" />
          Aggiungi al piano
        </Button>
      </fieldset>

      {totale ? (
        <p
          role="status"
          className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${
            Number(totale.scarto) === 0 ? 'bg-status-ok/10 text-status-ok' : 'bg-status-warning/10 text-status-warning'
          }`}
        >
          {Number(totale.scarto) === 0 ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          ) : (
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          )}
          <span className="num">
            {totale.numero_rate} {totale.numero_rate === 1 ? 'rata' : 'rate'} · totale {formatEuro(totale.totale)}
            {Number(totale.scarto) === 0
              ? ' · torna col contratto'
              : Number(totale.scarto) > 0
                ? ` · mancano ${formatEuro(totale.scarto)} al valore del contratto`
                : ` · ${formatEuro(-Number(totale.scarto))} oltre il valore del contratto`}
          </span>
        </p>
      ) : null}
    </div>
  )
}
