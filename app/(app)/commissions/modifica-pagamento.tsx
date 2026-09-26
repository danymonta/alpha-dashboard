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
import { formatImportoInput, formatMese } from '@/lib/format'
import { ETICHETTA_METODO, METODI } from '@/lib/validation/incasso'
import {
  modificaPagamentoProvvigioneSchema,
  type ModificaPagamentoProvvigioneInput,
} from '@/lib/validation/provvigione'

const OPZIONI_METODO = METODI.map((m) => ({ valore: m, etichetta: ETICHETTA_METODO[m] }))

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
    if (await salva(() => modificaPagamentoProvvigione(valori), 'Pagamento aggiornato')) setAperto(false)
  })

  function elimina() {
    avvia(async () => {
      if (await salva(() => eliminaPagamentoProvvigione({ id: pagamento.id }), 'Pagamento eliminato')) setAperto(false)
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
          aria-label={`Modifica il pagamento a ${nome} del ${pagamento.pagato_il.split('-').reverse().join('/')}`}
          className="size-11 shrink-0 text-muted-foreground"
        />
      }
      contenutoTrigger={<Pencil className="size-4" aria-hidden="true" />}
      titolo={`Pagamento a ${nome}`}
      descrizione="Il saldo delle provvigioni si ricalcola subito."
    >
      <form onSubmit={invia} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`mp-periodo-${pagamento.id}`}>Riferito a</Label>
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
            <Label htmlFor={`mp-data-${pagamento.id}`}>Pagato il</Label>
            <Input id={`mp-data-${pagamento.id}`} type="date" max={oggi} className="num h-11" {...register('pagato_il')} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`mp-importo-${pagamento.id}`}>Importo</Label>
            <Input id={`mp-importo-${pagamento.id}`} inputMode="decimal" className="num h-11 text-right" {...register('importo')} />
          </div>
        </div>
        <ErroreCampo
          id={`mp-errore-${pagamento.id}`}
          messaggio={errors.periodo?.message ?? errors.pagato_il?.message ?? errors.importo?.message}
        />
        <SceltaRapida legenda="Metodo (facoltativo)" opzioni={OPZIONI_METODO} registrazione={register('metodo')} />
        <div className="space-y-1.5">
          <Label htmlFor={`mp-note-${pagamento.id}`}>Note</Label>
          <Input id={`mp-note-${pagamento.id}`} className="h-11" {...register('note')} />
        </div>
        <ErroreModulo testo={errore} />
        <BottoneSalva inCorso={isSubmitting}>Salva il pagamento</BottoneSalva>

        {/* two taps on purpose: the first arms, the second deletes */}
        {conferma ? (
          <Button type="button" variant="destructive" className="h-11 w-full" disabled={eliminando} onClick={elimina}>
            Conferma: elimina il pagamento
          </Button>
        ) : (
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full text-muted-foreground"
            onClick={() => setConferma(true)}
          >
            <Trash2 className="size-4" aria-hidden="true" />
            Elimina il pagamento
          </Button>
        )}
      </form>
    </FoglioModifica>
  )
}
