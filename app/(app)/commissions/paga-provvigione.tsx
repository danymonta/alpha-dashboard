'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Banknote, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { registraPagamentoProvvigione } from '@/app/(app)/commissions/actions'
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
import { useLingua } from '@/components/i18n/lingua-provider'
import { formato, formatImportoInput } from '@/lib/format'
import { PAGAMENTI_PROVVIGIONI } from '@/lib/i18n/testi/costi'
import { traduciErrore } from '@/lib/i18n/testi/errori-economics'
import { ETICHETTE } from '@/lib/i18n/testi/etichette'
import { METODI } from '@/lib/validation/incasso'
import {
  pagamentoProvvigioneSchema,
  type PagamentoProvvigioneInput,
} from '@/lib/validation/provvigione'

type Mese = { mese: string; saldo_mese: number }

export function PagaProvvigione({
  profileId,
  nome,
  mesi,
  oggi,
}: {
  profileId: string
  nome: string
  /** months with their SQL balance, most recent first */
  mesi: Mese[]
  oggi: string
}) {
  const [aperto, setAperto] = useState(false)
  const lingua = useLingua()
  const t = PAGAMENTI_PROVVIGIONI[lingua]
  const { formatMese } = formato(lingua)
  const OPZIONI_METODO = METODI.map((m) => ({ valore: m, etichetta: ETICHETTE[lingua].metodo[m] }))
  const [errore, setErrore] = useState<string | null>(null)
  const predefinito = mesi.find((m) => Number(m.saldo_mese) > 0) ?? mesi[0]

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<PagamentoProvvigioneInput>({
    resolver: zodResolver(pagamentoProvvigioneSchema),
    defaultValues: {
      profile_id: profileId,
      periodo: predefinito?.mese,
      importo: predefinito ? formatImportoInput(Math.max(0, Number(predefinito.saldo_mese))) : '',
      pagato_il: oggi,
      metodo: 'bonifico',
      note: '',
    },
  })

  const invia = handleSubmit(async (valori) => {
    setErrore(null)
    let esito
    try {
      esito = await registraPagamentoProvvigione(valori)
    } catch {
      setErrore('Connessione assente. Riprova.')
      return
    }
    if (!esito.ok) {
      setErrore(esito.errore)
      return
    }
    toast.success(t.registrato(nome))
    setAperto(false)
  })

  return (
    <Sheet open={aperto} onOpenChange={(v) => { setAperto(v); if (!v) setErrore(null) }}>
      <SheetTrigger render={<Button type="button" className="h-11" />}>
        <Banknote className="size-4" aria-hidden="true" />
        {t.registra}
      </SheetTrigger>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{t.titolo}</SheetTitle>
          <SheetDescription>{nome}</SheetDescription>
        </SheetHeader>
        <form onSubmit={invia} noValidate className="space-y-4 px-4 pb-6">
          <div className="space-y-1.5">
            <Label htmlFor="pp-periodo">{t.meseRiferimento}</Label>
            <select
              id="pp-periodo"
              className="h-11 w-full rounded-lg border border-input bg-input/30 px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
              {...register('periodo', {
                onChange: (e) => {
                  const scelto = mesi.find((m) => m.mese === e.target.value)
                  if (scelto) setValue('importo', formatImportoInput(Math.max(0, Number(scelto.saldo_mese))))
                },
              })}
            >
              {mesi.map((m) => (
                <option key={m.mese} value={m.mese}>{formatMese(m.mese)}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="pp-importo">{t.importo}</Label>
              <Input id="pp-importo" inputMode="decimal" className="num h-11 text-right" {...register('importo')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pp-data">{t.pagatoIl}</Label>
              <Input id="pp-data" type="date" max={oggi} className="num h-11" {...register('pagato_il')} />
            </div>
          </div>
          <ErroreCampo id="pp-errore" messaggio={traduciErrore(errors.importo?.message ?? errors.pagato_il?.message ?? errors.periodo?.message, lingua)} />
          <SceltaRapida legenda={t.metodo} opzioni={OPZIONI_METODO} registrazione={register('metodo')} />
          <div className="space-y-1.5">
            <Label htmlFor="pp-note">{t.noteFacoltative}</Label>
            <Input id="pp-note" className="h-11" {...register('note')} />
          </div>
          {errore ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {traduciErrore(errore, lingua)}
            </p>
          ) : null}
          <Button type="submit" className="h-11 w-full" disabled={isSubmitting}>
            {isSubmitting ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {t.registra}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  )
}
