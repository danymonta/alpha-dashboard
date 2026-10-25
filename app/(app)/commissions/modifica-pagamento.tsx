'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { Pencil, Trash2 } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'

import { eliminaPagamentoProvvigione, modificaPagamentoProvvigione } from '@/app/(app)/commissions/actions'
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
import { useLingua } from '@/components/i18n/lingua-provider'
import { formato, formatImportoInput } from '@/lib/format'
import { PAGAMENTI_PROVVIGIONI } from '@/lib/i18n/testi/costi'
import { traduciErrore } from '@/lib/i18n/testi/errori-economics'
import { ETICHETTE } from '@/lib/i18n/testi/etichette'
import { METODI } from '@/lib/validation/incasso'
import {
  modificaPagamentoProvvigioneSchema,
  type ModificaPagamentoProvvigioneInput,
} from '@/lib/validation/provvigione'

export function ModificaPagamento({
  pagamento,
  nome,
  mesi,
  oggi,
}: {
  pagamento: ModificaPagamentoProvvigioneInput & { importo: number }
  nome: string
  /** 'YYYY-MM-01' the payout can refer to, most recent first */
  mesi: string[]
  oggi: string
}) {
  const [aperto, setAperto] = useState(false)
  const lingua = useLingua()
  const t = PAGAMENTI_PROVVIGIONI[lingua]
  const { formatData, formatMese } = formato(lingua)
  const OPZIONI_METODO = METODI.map((m) => ({ valore: m, etichetta: ETICHETTE[lingua].metodo[m] }))
  const [conferma, setConferma] = useState(false)
  const [eliminando, avvia] = useTransition()
  const { errore, setErrore, salva } = useSalvataggio()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<ModificaPagamentoProvvigioneInput>({
    resolver: zodResolver(modificaPagamentoProvvigioneSchema),
    defaultValues: { ...pagamento, importo: formatImportoInput(pagamento.importo), note: pagamento.note ?? '' },
  })

  const invia = handleSubmit(async (valori) => {
    if (await salva(() => modificaPagamentoProvvigione(valori), t.aggiornato)) setAperto(false)
  })

  function elimina() {
    avvia(async () => {
      if (await salva(() => eliminaPagamentoProvvigione({ id: pagamento.id }), t.eliminato)) setAperto(false)
      setConferma(false)
    })
  }

  return (
    <FoglioModifica
      aperto={aperto}
      onApertoChange={(v) => {
        setAperto(v)
        if (!v) {
          setErrore(null)
          setConferma(false)
          reset()
        }
      }}
      trigger={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t.modificaNome(nome, lingua === 'it' ? pagamento.pagato_il.split('-').reverse().join('/') : formatData(pagamento.pagato_il))}
          className="size-11 shrink-0 text-muted-foreground"
        />
      }
      contenutoTrigger={<Pencil className="size-4" aria-hidden="true" />}
      titolo={t.titoloModifica(nome)}
      descrizione={t.descrizioneModifica}
    >
      <form onSubmit={invia} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`mp-periodo-${pagamento.id}`}>{t.riferitoA}</Label>
          <select id={`mp-periodo-${pagamento.id}`} className={CLASSE_SELECT} {...register('periodo')}>
            {mesi.map((m) => (
              <option key={m} value={m}>
                {formatMese(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor={`mp-data-${pagamento.id}`}>{t.pagatoIl}</Label>
            <Input id={`mp-data-${pagamento.id}`} type="date" max={oggi} className="num h-11" {...register('pagato_il')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`mp-importo-${pagamento.id}`}>{t.importo}</Label>
            <Input id={`mp-importo-${pagamento.id}`} inputMode="decimal" className="num h-11 text-right" {...register('importo')} />
          </div>
        </div>
        <ErroreCampo
          id={`mp-errore-${pagamento.id}`}
          messaggio={traduciErrore(errors.periodo?.message ?? errors.pagato_il?.message ?? errors.importo?.message, lingua)}
        />
        <SceltaRapida legenda={t.metodoFacoltativo} opzioni={OPZIONI_METODO} registrazione={register('metodo')} />
        <div className="space-y-1.5">
          <Label htmlFor={`mp-note-${pagamento.id}`}>{t.note}</Label>
          <Input id={`mp-note-${pagamento.id}`} className="h-11" {...register('note')} />
        </div>
        <ErroreModulo testo={traduciErrore(errore, lingua) ?? null} />
        <BottoneSalva inCorso={isSubmitting}>{t.salva}</BottoneSalva>

        {/* two taps on purpose: the first arms, the second deletes */}
        {conferma ? (
          <Button type="button" variant="destructive" className="h-11 w-full" disabled={eliminando} onClick={elimina}>
            {t.conferma}
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full text-muted-foreground"
            onClick={() => setConferma(true)}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            {t.elimina}
          </Button>
        )}
      </form>
    </FoglioModifica>
  )
}
