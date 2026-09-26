'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { modificaVendita } from '@/app/(app)/sales/[id]/actions'
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
import { formatImportoInput } from '@/lib/format'
import {
  ETICHETTA_TIPO_VENDITA,
  TIPI_VENDITA,
  modificaVenditaSchema,
  type ModificaVenditaInput,
  type TipoVendita,
} from '@/lib/validation/vendita'

const OPZIONI_TIPO = TIPI_VENDITA.map((t) => ({ valore: t, etichetta: ETICHETTA_TIPO_VENDITA[t] }))

type Voce = { id: string; nome: string }

export type VenditaModificabile = {
  id: string
  tipo: TipoVendita
  product_id: string | null
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
  prodotti,
  setters,
  closers,
}: {
  vendita: VenditaModificabile
  prodotti: Voce[]
  setters: Voce[]
  closers: Voce[]
}) {
  const [aperto, setAperto] = useState(false)
  const { errore, setErrore, salva } = useSalvataggio()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ModificaVenditaInput>({
    resolver: zodResolver(modificaVenditaSchema),
    defaultValues: {
      ...vendita,
      product_id: vendita.product_id ?? '',
      valore_contratto: formatImportoInput(vendita.valore_contratto),
      setter_id: vendita.setter_id ?? '',
      closer_id: vendita.closer_id ?? '',
      note: vendita.note ?? '',
    },
  })

  const invia = handleSubmit(async (valori) => {
    if (await salva(() => modificaVendita(valori), 'Vendita aggiornata')) setAperto(false)
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
          Modifica
        </>
      }
      titolo="Modifica la vendita"
      descrizione="Il piano rate non cambia da solo: le rate si correggono una per una qui sotto."
    >
      <form onSubmit={invia} noValidate className="space-y-4">
        <SceltaRapida legenda="Tipo" opzioni={OPZIONI_TIPO} registrazione={register('tipo')} />

        <div className="space-y-1.5">
          <Label htmlFor="mv-prodotto">Prodotto</Label>
          <select id="mv-prodotto" className={CLASSE_SELECT} {...register('product_id')}>
            {vendita.product_id ? null : <option value="">Scegli il prodotto</option>}
            {prodotti.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
          <ErroreCampo id="mv-prodotto-errore" messaggio={errors.product_id?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mv-valore">Valore del contratto</Label>
          <Input
            id="mv-valore"
            inputMode="decimal"
            className="num h-11 text-right"
            aria-invalid={errors.valore_contratto ? true : undefined}
            {...register('valore_contratto')}
          />
          <ErroreCampo id="mv-valore-errore" messaggio={errors.valore_contratto?.message} />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="mv-data">Data vendita</Label>
          <Input id="mv-data" type="date" className="num h-11" {...register('data_vendita')} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="mv-inizio">Inizio percorso</Label>
            <Input id="mv-inizio" type="date" className="num h-11" {...register('data_inizio')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mv-fine">Fine percorso</Label>
            <Input id="mv-fine" type="date" className="num h-11" {...register('data_fine')} />
          </div>
        </div>
        <ErroreCampo
          id="mv-date-errore"
          messaggio={errors.data_vendita?.message ?? errors.data_inizio?.message ?? errors.data_fine?.message}
        />

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="mv-setter">Setter</Label>
            <select id="mv-setter" className={CLASSE_SELECT} {...register('setter_id')}>
              <option value="">Nessuno</option>
              {setters.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="mv-closer">Closer</Label>
            <select id="mv-closer" className={CLASSE_SELECT} {...register('closer_id')}>
              <option value="">Nessuno</option>
              {closers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Il setter della vendita decide la provvigione: cambiarlo sposta anche le provvigioni già maturate.
        </p>

        <div className="space-y-1.5">
          <Label htmlFor="mv-note">Note</Label>
          <Textarea id="mv-note" rows={2} {...register('note')} />
        </div>

        <ErroreModulo testo={errore} />
        <BottoneSalva inCorso={isSubmitting}>Salva la vendita</BottoneSalva>
      </form>
    </FoglioModifica>
  )
}
