'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { ListPlus, LoaderCircle, Pencil, Plus, Trash2, TriangleAlert } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useFieldArray, useForm, useWatch, type Control, type UseFormRegister } from 'react-hook-form'
import { toast } from 'sonner'

import { cambiaAttivoProdotto, eliminaProdotto, salvaProdotto } from '@/app/(app)/settings/products/actions'
import { Elimina } from '@/components/form/elimina'
import { ErroreCampo } from '@/components/form/errore-campo'
import { CLASSE_SELECT } from '@/components/form/foglio-modifica'
import { useLingua } from '@/components/i18n/lingua-provider'
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
import { Switch } from '@/components/ui/switch'
import { formatImportoInput } from '@/lib/format'
import { IMPOSTAZIONI, traduciImpostazioni } from '@/lib/i18n/testi/impostazioni'
import { SHELL } from '@/lib/i18n/testi/shell'
import { parseImporto } from '@/lib/importi'
import { prodottoSchema, type PianoPredefinito, type ProdottoInput } from '@/lib/validation/anagrafiche'

type Prodotto = {
  id: string
  nome: string
  durata_mesi: number
  prezzo_listino: number
  attivo: boolean
  piano_predefinito: PianoPredefinito | null
}

export function ProdottoForm({ prodotto }: { prodotto?: Prodotto }) {
  const [aperto, setAperto] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const lingua = useLingua()
  const t = IMPOSTAZIONI[lingua].prodottoForm
  const tr = (testo: string | undefined) => traduciImpostazioni(testo, lingua)
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ProdottoInput>({
    resolver: zodResolver(prodottoSchema),
    defaultValues: prodotto
      ? {
          ...prodotto,
          prezzo_listino: formatImportoInput(prodotto.prezzo_listino),
          piano_predefinito: (prodotto.piano_predefinito ?? []).map((r) => ({ mese: r.mese, importo: formatImportoInput(r.importo) })),
        }
      : { nome: '', durata_mesi: 3, prezzo_listino: '', attivo: true, piano_predefinito: [] },
  })

  const invia = handleSubmit(async (valori) => {
    setErrore(null)
    let esito
    try {
      esito = await salvaProdotto(valori)
    } catch {
      setErrore(SHELL[lingua].connessione)
      return
    }
    if (!esito.ok) {
      setErrore(traduciImpostazioni(esito.errore, lingua))
      return
    }
    toast.success(prodotto ? t.aggiornato : t.creato)
    setAperto(false)
    if (!prodotto) reset()
  })

  return (
    <Sheet open={aperto} onOpenChange={(v) => { setAperto(v); if (!v) setErrore(null) }}>
      <SheetTrigger
        render={
          prodotto ? (
            <Button type="button" variant="ghost" size="icon" className="size-11" aria-label={t.modifica(prodotto.nome)} />
          ) : (
            <Button type="button" className="h-11" />
          )
        }
      >
        {prodotto ? <Pencil className="size-4" aria-hidden="true" /> : (<><Plus className="size-4" aria-hidden="true" />{t.nuovo}</>)}
      </SheetTrigger>
      <SheetContent side="right" className="overflow-y-auto data-[side=right]:w-full data-[side=right]:sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{prodotto ? prodotto.nome : t.nuovo}</SheetTitle>
          <SheetDescription>{t.descrizione}</SheetDescription>
        </SheetHeader>
        <form onSubmit={invia} noValidate className="space-y-4 px-4 pb-6">
          <div className="space-y-1.5">
            <Label htmlFor="p-nome">{t.nome}</Label>
            <Input id="p-nome" className="h-11" placeholder="Percorso Alpha 3 mesi" {...register('nome')} />
            <ErroreCampo id="p-nome-errore" messaggio={tr(errors.nome?.message)} />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="p-durata">{t.durata}</Label>
              <Input id="p-durata" inputMode="numeric" className="num h-11" {...register('durata_mesi')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-prezzo">{t.prezzo}</Label>
              <Input id="p-prezzo" inputMode="decimal" className="num h-11 text-right" placeholder="0,00" {...register('prezzo_listino')} />
            </div>
          </div>
          <ErroreCampo id="p-errore" messaggio={tr(errors.durata_mesi?.message ?? errors.prezzo_listino?.message)} />
          <PianoPredefinitoEditor control={control} register={register} />
          <ErroreCampo
            id="p-piano-errore"
            messaggio={tr(
              (errors.piano_predefinito as { message?: string } | undefined)?.message ??
                errors.piano_predefinito?.find?.((e) => e)?.importo?.message,
            )}
          />
          {errore ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {errore}
            </p>
          ) : null}
          <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {t.salva}
          </Button>
          {prodotto ? (
            <div className="border-t border-border pt-4">
              <Elimina
                etichetta={t.elimina}
                cosa={prodotto.nome}
                fatto={t.eliminato(prodotto.nome)}
                anteprima={{ tipo: 'prodotto', id: prodotto.id }}
                // the Italian sentence is written here too: tests/alfire-scritture.test.ts reads it from this file
                conseguenze={[
                  lingua === 'it' ? 'Se vuoi solo non offrirlo più, mettilo fuori vendita: resta nello storico.' : t.fuoriVenditaInvece,
                ]}
                azione={() => eliminaProdotto({ id: prodotto.id })}
              />
            </div>
          ) : null}
        </form>
      </SheetContent>
    </Sheet>
  )
}

/**
 * The product's usual plan: which month after the sale and how much. The
 * new-sale form starts from it and it stays editable there, row by row.
 */
function PianoPredefinitoEditor({
  control,
  register,
}: {
  control: Control<ProdottoInput>
  register: UseFormRegister<ProdottoInput>
}) {
  const { fields, append, remove } = useFieldArray({ control, name: 'piano_predefinito' as never })
  const righe = (useWatch({ control, name: 'piano_predefinito' }) ?? []) as { mese?: number | string }[]
  const [quante, setQuante] = useState('3')
  const [importo, setImporto] = useState('')
  const [erroreBlocco, setErroreBlocco] = useState<string | null>(null)
  const t = IMPOSTAZIONI[useLingua()].prodottoForm
  const prossimoMese = righe.length > 0 ? Math.max(...righe.map((r) => Number(r.mese ?? 0))) + 1 : 0

  function aggiungiBlocco() {
    const n = Number(quante)
    const valore = parseImporto(importo)
    if (valore === null || valore <= 0) return setErroreBlocco(t.importoOgniRata)
    setErroreBlocco(null)
    append(Array.from({ length: n }, (_, i) => ({ mese: prossimoMese + i, importo: formatImportoInput(valore) })) as never)
    setImporto('')
  }

  return (
    <fieldset className="space-y-3 rounded-xl border border-border p-3">
      <legend className="px-1 text-sm font-medium">{t.pianoLegenda}</legend>
      <p className="text-xs text-muted-foreground">{t.pianoAiuto}</p>
      {fields.length > 0 ? (
        <ol className="space-y-2" aria-label={t.ratePiano}>
          {fields.map((f, i) => (
            <li key={f.id} className="flex items-end gap-2">
              <div className="w-28 shrink-0 space-y-1">
                <Label htmlFor={`pp-${i}-mese`} className="text-xs text-muted-foreground">
                  {t.mese}
                </Label>
                <select id={`pp-${i}-mese`} className={CLASSE_SELECT} {...register(`piano_predefinito.${i}.mese` as const)}>
                  {Array.from({ length: 37 }, (_, m) => (
                    <option key={m} value={m}>
                      {m === 0 ? t.allaFirma : t.piuMesi(m)}
                    </option>
                  ))}
                </select>
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <Label htmlFor={`pp-${i}-importo`} className="text-xs text-muted-foreground">
                  {t.importo}
                </Label>
                <Input
                  id={`pp-${i}-importo`}
                  inputMode="decimal"
                  className="num h-11 text-right"
                  {...register(`piano_predefinito.${i}.importo` as const)}
                />
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-11 shrink-0 text-muted-foreground"
                aria-label={t.togliRata(i + 1)}
                onClick={() => remove(i)}
              >
                <Trash2 className="size-4" aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="grid grid-cols-[5rem_minmax(0,1fr)] gap-2">
        <div className="space-y-1">
          <Label htmlFor="pp-quante" className="text-xs text-muted-foreground">
            {t.quante}
          </Label>
          <select id="pp-quante" className={CLASSE_SELECT} value={quante} onChange={(e) => setQuante(e.currentTarget.value)}>
            {Array.from({ length: 12 }, (_, i) => String(i + 1)).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="pp-importo" className="text-xs text-muted-foreground">
            {t.importoRata}
          </Label>
          <Input
            id="pp-importo"
            inputMode="decimal"
            placeholder="500"
            className="num h-11 text-right"
            value={importo}
            onChange={(e) => setImporto(e.currentTarget.value)}
          />
        </div>
      </div>
      <ErroreCampo id="pp-blocco-errore" messaggio={erroreBlocco ?? undefined} />
      <Button type="button" variant="outline" className="h-11 w-full" onClick={aggiungiBlocco}>
        <ListPlus className="size-4" aria-hidden="true" />
        {t.aggiungi}
      </Button>
    </fieldset>
  )
}

export function AttivoProdotto({ id, nome, attivo }: { id: string; nome: string; attivo: boolean }) {
  const [inCorso, avvia] = useTransition()
  const lingua = useLingua()
  const t = IMPOSTAZIONI[lingua].prodottoForm
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
      <Switch
        checked={attivo}
        disabled={inCorso}
        aria-label={t.inVenditaDi(nome)}
        onCheckedChange={(valore) =>
          avvia(async () => {
            const esito = await cambiaAttivoProdotto({ id, attivo: valore })
            if (esito.ok) toast.success(valore ? t.diNuovoInVendita(nome) : t.messoFuoriVendita(nome))
            else toast.error(traduciImpostazioni(esito.errore, lingua))
          })
        }
      />
      {attivo ? t.inVendita : t.fuoriVendita}
    </label>
  )
}
