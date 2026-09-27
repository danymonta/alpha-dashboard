'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowDown, ArrowUp, Pencil, Plus } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { cambiaAttivoReparto, salvaReparto, spostaReparto } from '@/app/(app)/settings/progetti/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { BottoneSalva, ErroreModulo, FoglioModifica, useSalvataggio } from '@/components/form/foglio-modifica'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { repartoSchema, type RepartoInput } from '@/lib/validation/progetti'

type Reparto = { id: string; nome: string; descrizione: string | null }

/** New department, or rename one: the same sheet. */
export function RepartoForm({ reparto }: { reparto?: Reparto }) {
  const [aperto, setAperto] = useState(false)
  const { errore, setErrore, salva } = useSalvataggio()
  const chiave = reparto?.id ?? 'nuovo'
  const iniziali: RepartoInput = { id: reparto?.id ?? null, nome: reparto?.nome ?? '', descrizione: reparto?.descrizione ?? '' }
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<RepartoInput>({ resolver: zodResolver(repartoSchema), defaultValues: iniziali })

  const invia = handleSubmit(async (valori) => {
    if (await salva(() => salvaReparto(valori), reparto ? 'Reparto salvato' : 'Reparto creato')) {
      setAperto(false)
      if (!reparto) reset(iniziali)
    }
  })

  return (
    <FoglioModifica
      aperto={aperto}
      onApertoChange={(v) => {
        setAperto(v)
        if (!v) {
          setErrore(null)
          reset(iniziali)
        }
      }}
      trigger={
        reparto ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 shrink-0 text-muted-foreground"
            aria-label={`Rinomina ${reparto.nome}`}
          />
        ) : (
          <Button type="button" className="h-11" />
        )
      }
      contenutoTrigger={
        reparto ? (
          <Pencil className="size-4" aria-hidden="true" />
        ) : (
          <>
            <Plus className="size-4" aria-hidden="true" />
            Nuovo reparto
          </>
        )
      }
      titolo={reparto ? 'Modifica il reparto' : 'Nuovo reparto'}
      descrizione="I progetti sono divisi per reparto. Un reparto disattivato non riceve nuovi progetti."
    >
      <form onSubmit={invia} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`r-nome-${chiave}`}>Nome</Label>
          <Input id={`r-nome-${chiave}`} className="h-11" placeholder="Fitness Coaching" {...register('nome')} />
          <ErroreCampo id={`r-nome-errore-${chiave}`} messaggio={errors.nome?.message} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`r-descrizione-${chiave}`}>Descrizione</Label>
          <Textarea id={`r-descrizione-${chiave}`} rows={3} {...register('descrizione')} />
          <ErroreCampo id={`r-descrizione-errore-${chiave}`} messaggio={errors.descrizione?.message} />
        </div>
        <ErroreModulo testo={errore} />
        <BottoneSalva inCorso={isSubmitting}>{reparto ? 'Salva il reparto' : 'Crea il reparto'}</BottoneSalva>
      </form>
    </FoglioModifica>
  )
}

export function AttivoReparto({ id, nome, attivo }: { id: string; nome: string; attivo: boolean }) {
  const [inCorso, avvia] = useTransition()
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
      <Switch
        checked={attivo}
        disabled={inCorso}
        aria-label={`${nome} attivo`}
        onCheckedChange={(valore) =>
          avvia(async () => {
            const esito = await cambiaAttivoReparto({ id, attivo: valore })
            if (esito.ok) toast.success(valore ? `${nome} di nuovo attivo` : `${nome} disattivato: niente nuovi progetti`)
            else toast.error(esito.errore)
          })
        }
      />
      {attivo ? 'Attivo' : 'Disattivato'}
    </label>
  )
}

export function SpostaReparto({ id, nome, prima, ultima }: { id: string; nome: string; prima: boolean; ultima: boolean }) {
  const [inCorso, avvia] = useTransition()
  function sposta(direzione: 'su' | 'giu') {
    avvia(async () => {
      const esito = await spostaReparto({ id, direzione })
      if (!esito.ok) toast.error(esito.errore)
    })
  }
  return (
    <span className="flex shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 text-muted-foreground"
        aria-label={`Sposta su ${nome}`}
        disabled={prima || inCorso}
        onClick={() => sposta('su')}
      >
        <ArrowUp className="size-4" aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 text-muted-foreground"
        aria-label={`Sposta giù ${nome}`}
        disabled={ultima || inCorso}
        onClick={() => sposta('giu')}
      >
        <ArrowDown className="size-4" aria-hidden="true" />
      </Button>
    </span>
  )
}
