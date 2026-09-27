'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'

import { aggiungiRata } from '@/app/(app)/sales/[id]/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { BottoneSalva, ErroreModulo, FoglioModifica, useSalvataggio } from '@/components/form/foglio-modifica'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { nuovaRataSchema, type NuovaRataInput } from '@/lib/validation/vendita'

/** One more instalment on a recorded sale (admin): it takes its place by due date. */
export function AggiungiRata({ saleId, scadenzaProposta }: { saleId: string; scadenzaProposta: string }) {
  const [aperto, setAperto] = useState(false)
  const { errore, setErrore, salva } = useSalvataggio()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<NuovaRataInput>({
    resolver: zodResolver(nuovaRataSchema),
    defaultValues: { sale_id: saleId, scadenza: scadenzaProposta, importo: '' },
  })

  const invia = handleSubmit(async (valori) => {
    if (await salva(() => aggiungiRata(valori), 'Rata aggiunta')) {
      setAperto(false)
      reset({ sale_id: saleId, scadenza: scadenzaProposta, importo: '' })
    }
  })

  return (
    <FoglioModifica
      aperto={aperto}
      onApertoChange={(v) => {
        setAperto(v)
        if (!v) setErrore(null)
      }}
      trigger={<Button type="button" variant="outline" className="h-11" />}
      contenutoTrigger={
        <>
          <Plus className="size-4" aria-hidden="true" />
          Aggiungi rata
        </>
      }
      titolo="Aggiungi una rata"
      descrizione="Prende il suo posto in ordine di scadenza. Se il totale delle rate non torna più col contratto, la vendita lo segnala."
    >
      <form onSubmit={invia} noValidate className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="nr-scadenza">Scadenza</Label>
            <Input id="nr-scadenza" type="date" className="num h-11" {...register('scadenza')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nr-importo">Importo</Label>
            <Input id="nr-importo" inputMode="decimal" placeholder="0,00" className="num h-11 text-right" {...register('importo')} />
          </div>
        </div>
        <ErroreCampo id="nr-errore" messaggio={errors.scadenza?.message ?? errors.importo?.message} />
        <ErroreModulo testo={errore} />
        <BottoneSalva inCorso={isSubmitting}>Aggiungi la rata</BottoneSalva>
      </form>
    </FoglioModifica>
  )
}
