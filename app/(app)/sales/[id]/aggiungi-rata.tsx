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
import { useLingua } from '@/components/i18n/lingua-provider'
import { traduciErrore } from '@/lib/i18n/testi/errori-economics'
import { MODIFICA_VENDITA } from '@/lib/i18n/testi/nuova-vendita'
import { nuovaRataSchema, type NuovaRataInput } from '@/lib/validation/vendita'

/** One more instalment on a recorded sale (admin): it takes its place by due date. */
export function AggiungiRata({ saleId, scadenzaProposta }: { saleId: string; scadenzaProposta: string }) {
  const [aperto, setAperto] = useState(false)
  const lingua = useLingua()
  const t = MODIFICA_VENDITA[lingua]
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
    if (await salva(() => aggiungiRata(valori), t.rataAggiunta)) {
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
          {t.aggiungiRata}
        </>
      }
      titolo={t.titoloRata}
      descrizione={t.descrizioneRata}
    >
      <form onSubmit={invia} noValidate className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="nr-scadenza">{t.scadenza}</Label>
            <Input id="nr-scadenza" type="date" className="num h-11" {...register('scadenza')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="nr-importo">{t.importo}</Label>
            <Input id="nr-importo" inputMode="decimal" placeholder="0,00" className="num h-11 text-right" {...register('importo')} />
          </div>
        </div>
        <ErroreCampo id="nr-errore" messaggio={traduciErrore(errors.scadenza?.message ?? errors.importo?.message, lingua)} />
        <ErroreModulo testo={traduciErrore(errore, lingua) ?? null} />
        <BottoneSalva inCorso={isSubmitting}>{t.aggiungiLaRata}</BottoneSalva>
      </form>
    </FoglioModifica>
  )
}
