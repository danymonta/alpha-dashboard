'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowDown, ArrowUp, Pencil, Plus } from 'lucide-react'
import { useState, useTransition } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { cambiaAttivoReparto, eliminaReparto, salvaReparto, spostaReparto } from '@/app/(app)/settings/progetti/actions'
import { Elimina } from '@/components/form/elimina'
import { ErroreCampo } from '@/components/form/errore-campo'
import { useLingua, useTesti } from '@/components/i18n/lingua-provider'
import { BottoneSalva, ErroreModulo, FoglioModifica, useSalvataggio } from '@/components/form/foglio-modifica'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { eliminazioneBloccata, frasiAnteprima } from '@/lib/eliminazione'
import { IMPOSTAZIONI_PROGETTI } from '@/lib/i18n/testi/impostazioni-progetti'
import { traduciErroreProgetti } from '@/lib/i18n/testi/progetti'
import { repartoSchema, type RepartoInput } from '@/lib/validation/progetti'

type Reparto = {
  id: string
  nome: string
  descrizione: string | null
  progetti_con_cliente: boolean
  progetti: number
  modelli: number
}

/** New department, or rename one: the same sheet. */
export function RepartoForm({ reparto }: { reparto?: Reparto }) {
  const t = useTesti(IMPOSTAZIONI_PROGETTI)
  const lingua = useLingua()
  const tradotto = (messaggio: string | undefined) => traduciErroreProgetti(messaggio, lingua)
  const [aperto, setAperto] = useState(false)
  const { errore, setErrore, salva } = useSalvataggio()
  const chiave = reparto?.id ?? 'nuovo'
  const iniziali: RepartoInput = {
    id: reparto?.id ?? null,
    nome: reparto?.nome ?? '',
    descrizione: reparto?.descrizione ?? '',
    progetti_con_cliente: reparto?.progetti_con_cliente ?? false,
  }
  const {
    register,
    handleSubmit,
    reset,
    control,
    formState: { errors, isSubmitting },
  } = useForm<RepartoInput>({ resolver: zodResolver(repartoSchema), defaultValues: iniziali })

  const invia = handleSubmit(async (valori) => {
    if (await salva(() => salvaReparto(valori), reparto ? t.repartoSalvato : t.repartoCreato)) {
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
            aria-label={t.modifica(reparto.nome)}
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
            {t.nuovoReparto}
          </>
        )
      }
      titolo={reparto ? t.modificaReparto : t.nuovoReparto}
      descrizione={t.repartoDescrizione}
    >
      <form onSubmit={invia} noValidate className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor={`r-nome-${chiave}`}>{t.nome}</Label>
          <Input id={`r-nome-${chiave}`} className="h-11" placeholder="Fitness Coaching" {...register('nome')} />
          <ErroreCampo id={`r-nome-errore-${chiave}`} messaggio={tradotto(errors.nome?.message)} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`r-descrizione-${chiave}`}>{t.descrizioneCampo}</Label>
          <Textarea id={`r-descrizione-${chiave}`} rows={3} {...register('descrizione')} />
          <ErroreCampo id={`r-descrizione-errore-${chiave}`} messaggio={tradotto(errors.descrizione?.message)} />
        </div>
        <Controller
          control={control}
          name="progetti_con_cliente"
          render={({ field }) => (
            <label className="flex min-h-11 cursor-pointer items-start justify-between gap-4 rounded-lg border border-border p-3">
              <span className="space-y-0.5">
                <span className="block text-sm font-medium">{t.conCliente}</span>
                <span className="block text-xs text-muted-foreground">{t.conClienteAiuto}</span>
              </span>
              <Switch checked={field.value ?? false} onCheckedChange={field.onChange} aria-label={t.conCliente} />
            </label>
          )}
        />
        <ErroreModulo testo={tradotto(errore ?? undefined) ?? null} />
        <BottoneSalva inCorso={isSubmitting}>{reparto ? t.salvaReparto : t.creaReparto}</BottoneSalva>
        {reparto ? (
          <div className="border-t border-border pt-4">
            <Elimina
              etichetta={t.eliminaReparto}
              cosa={t.ilReparto(reparto.nome)}
              fatto={t.eliminato(reparto.nome)}
              conseguenze={
                lingua === 'it'
                  ? frasiAnteprima('reparto', { progetti: reparto.progetti, modelli: reparto.modelli })
                  : t.conseguenzeReparto(reparto.progetti, reparto.modelli)
              }
              bloccata={eliminazioneBloccata('reparto', { progetti: reparto.progetti, modelli: reparto.modelli })}
              azione={async () => {
                const esito = await eliminaReparto({ id: reparto.id })
                return esito.ok ? esito : { ...esito, errore: tradotto(esito.errore) ?? esito.errore }
              }}
            />
          </div>
        ) : null}
      </form>
    </FoglioModifica>
  )
}

export function AttivoReparto({ id, nome, attivo }: { id: string; nome: string; attivo: boolean }) {
  const t = useTesti(IMPOSTAZIONI_PROGETTI)
  const lingua = useLingua()
  const [inCorso, avvia] = useTransition()
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted-foreground">
      <Switch
        checked={attivo}
        disabled={inCorso}
        aria-label={t.attivoAria(nome)}
        onCheckedChange={(valore) =>
          avvia(async () => {
            const esito = await cambiaAttivoReparto({ id, attivo: valore })
            if (esito.ok) toast.success(valore ? t.diNuovoAttivo(nome) : t.disattivatoToast(nome))
            else toast.error(traduciErroreProgetti(esito.errore, lingua))
          })
        }
      />
      {attivo ? t.attivo : t.disattivato}
    </label>
  )
}

export function SpostaReparto({ id, nome, prima, ultima }: { id: string; nome: string; prima: boolean; ultima: boolean }) {
  const t = useTesti(IMPOSTAZIONI_PROGETTI)
  const lingua = useLingua()
  const [inCorso, avvia] = useTransition()
  function sposta(direzione: 'su' | 'giu') {
    avvia(async () => {
      const esito = await spostaReparto({ id, direzione })
      if (!esito.ok) toast.error(traduciErroreProgetti(esito.errore, lingua))
    })
  }
  return (
    <span className="flex shrink-0">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 text-muted-foreground"
        aria-label={t.spostaSu(nome)}
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
        aria-label={t.spostaGiu(nome)}
        disabled={ultima || inCorso}
        onClick={() => sposta('giu')}
      >
        <ArrowDown className="size-4" aria-hidden="true" />
      </Button>
    </span>
  )
}
