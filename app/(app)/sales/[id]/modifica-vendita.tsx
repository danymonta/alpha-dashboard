'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { useForm, useWatch } from 'react-hook-form'

import { eliminaVendita, modificaVendita } from '@/app/(app)/sales/[id]/actions'
import { Elimina } from '@/components/form/elimina'
import { ErroreCampo } from '@/components/form/errore-campo'
import {
  BottoneSalva,
  CLASSE_SELECT,
  ErroreModulo,
  FoglioModifica,
  useSalvataggio,
} from '@/components/form/foglio-modifica'
import { SceltaRapida } from '@/components/form/scelta-rapida'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { useLingua } from '@/components/i18n/lingua-provider'
import { formatImportoInput } from '@/lib/format'
import { traduciErrore, tradotto } from '@/lib/i18n/testi/errori-economics'
import { ETICHETTE } from '@/lib/i18n/testi/etichette'
import { MODIFICA_VENDITA } from '@/lib/i18n/testi/nuova-vendita'
import {
  PERSONALIZZATO,
  TIPI_VENDITA,
  modificaVenditaSchema,
  type ModificaVenditaInput,
  type TipoVendita,
} from '@/lib/validation/vendita'

type Voce = { id: string; nome: string }

export type VenditaModificabile = {
  id: string
  tipo: TipoVendita
  product_id: string | null
  prodotto_personalizzato: string | null
  valore_contratto: number
  data_vendita: string
  data_inizio: string
  data_fine: string
  setter_id: string | null
  closer_id: string | null
  note: string | null
}

export function ModificaVendita({
  vendita,
  descrizione,
  prodotti,
  setters,
  closers,
}: {
  vendita: VenditaModificabile
  /** "la vendita di Luca Rossi": for the delete question */
  descrizione: string
  prodotti: Voce[]
  setters: Voce[]
  closers: Voce[]
}) {
  const [aperto, setAperto] = useState(false)
  const lingua = useLingua()
  const t = MODIFICA_VENDITA[lingua]
  const tr = (testo: string | undefined) => traduciErrore(testo, lingua)
  const OPZIONI_TIPO = TIPI_VENDITA.map((v) => ({ valore: v, etichetta: ETICHETTE[lingua].tipoVendita[v] }))
  const { errore, setErrore, salva } = useSalvataggio()
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ModificaVenditaInput>({
    resolver: zodResolver(modificaVenditaSchema),
    defaultValues: {
      ...vendita,
      product_id: vendita.product_id ?? (vendita.prodotto_personalizzato ? PERSONALIZZATO : ''),
      prodotto_personalizzato: vendita.prodotto_personalizzato ?? '',
      valore_contratto: formatImportoInput(vendita.valore_contratto),
      setter_id: vendita.setter_id ?? '',
      closer_id: vendita.closer_id ?? '',
      note: vendita.note ?? '',
    },
  })

  const personalizzato = useWatch({ control, name: 'product_id' }) === PERSONALIZZATO

  const invia = handleSubmit(async (valori) => {
    if (await salva(() => modificaVendita(valori), t.aggiornata)) setAperto(false)
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
      titolo={t.titolo}
      descrizione={t.descrizione}
    >
      <form onSubmit={invia} noValidate className="space-y-4">
        <SceltaRapida legenda={t.tipo} opzioni={OPZIONI_TIPO} registrazione={register('tipo')} />

        <div className="space-y-1.5">
          <Label htmlFor="mv-prodotto">{t.prodotto}</Label>
          <select id="mv-prodotto" className={CLASSE_SELECT} {...register('product_id')}>
            {vendita.product_id || vendita.prodotto_personalizzato ? null : <option value="">{t.scegliProdotto}</option>}
            {prodotti.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
            <option value={PERSONALIZZATO}>{t.personalizzato}</option>
          </select>
          <ErroreCampo id="mv-prodotto-errore" messaggio={tr(errors.product_id?.message)} />
        </div>

        {personalizzato ? (
          <div className="space-y-1.5">
            <Label htmlFor="mv-personalizzato">{t.cosaHaiVenduto}</Label>
            <Input id="mv-personalizzato" className="h-11" placeholder={t.cosaPlaceholder} {...register('prodotto_personalizzato')} />
            <ErroreCampo id="mv-personalizzato-errore" messaggio={tr(errors.prodotto_personalizzato?.message)} />
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="mv-valore">{t.valore}</Label>
          <Input
            id="mv-valore"
            inputMode="decimal"
            className="num h-11 text-right"
            aria-invalid={errors.valore_contratto ? true : undefined}
            {...register('valore_contratto')}
          />
          <ErroreCampo id="mv-valore-errore" messaggio={tr(errors.valore_contratto?.message)} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mv-data">{t.dataVendita}</Label>
          <Input id="mv-data" type="date" className="num h-11" {...register('data_vendita')} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="mv-inizio">{t.inizio}</Label>
            <Input id="mv-inizio" type="date" className="num h-11" {...register('data_inizio')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mv-fine">{t.fine}</Label>
            <Input id="mv-fine" type="date" className="num h-11" {...register('data_fine')} />
          </div>
        </div>
        <ErroreCampo
          id="mv-date-errore"
          messaggio={tr(errors.data_vendita?.message ?? errors.data_inizio?.message ?? errors.data_fine?.message)}
        />

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="mv-setter">{t.setter}</Label>
            <select id="mv-setter" className={CLASSE_SELECT} {...register('setter_id')}>
              <option value="">{t.nessuno}</option>
              {setters.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mv-closer">{t.closer}</Label>
            <select id="mv-closer" className={CLASSE_SELECT} {...register('closer_id')}>
              <option value="">{t.nessuno}</option>
              {closers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          {t.setterAiuto}
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="mv-note">{t.note}</Label>
          <Textarea id="mv-note" rows={2} {...register('note')} />
        </div>

        <ErroreModulo testo={tr(errore ?? undefined) ?? null} />
        <BottoneSalva inCorso={isSubmitting}>{t.salva}</BottoneSalva>

        <div className="border-t border-border pt-4">
          <Elimina
            etichetta={t.elimina}
            cosa={descrizione}
            fatto={t.eliminata}
            anteprima={{ tipo: 'vendita', id: vendita.id }}
            azione={async () => tradotto(await eliminaVendita({ id: vendita.id }), lingua)}
            dopo="/sales"
          />
        </div>
      </form>
    </FoglioModifica>
  )
}
