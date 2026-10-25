'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle, UserMinus, UserPlus } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { aggiungiMembro, togliMembro } from '@/app/(app)/progetti/[id]/actions'
import { CLASSE_SELECT, ErroreModulo } from '@/components/form/foglio-modifica'
import { useLingua, useTesti } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { traduciErroreProgetti } from '@/lib/i18n/testi/progetti'
import { FOGLI_PROGETTO } from '@/lib/i18n/testi/progetto-fogli'
import { membroSchema, type MembroInput } from '@/lib/validation/progetti'

/** Adds one active person to the project: a native select, one tap on a phone. */
export function AggiungiMembro({
  progettoId,
  persone,
}: {
  progettoId: string
  persone: readonly { id: string; nome: string; ruolo: string }[]
}) {
  const t = useTesti(FOGLI_PROGETTO)
  const lingua = useLingua()
  const [errore, setErrore] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<MembroInput>({
    resolver: zodResolver(membroSchema),
    defaultValues: { progetto_id: progettoId, profile_id: '' },
  })

  if (persone.length === 0) {
    return <p className="text-sm text-muted-foreground">{t.tuttiDentro}</p>
  }

  const invia = handleSubmit(async (valori) => {
    setErrore(null)
    let esito
    try {
      esito = await aggiungiMembro(valori)
    } catch {
      setErrore(traduciErroreProgetti('Connessione assente. Riprova.', lingua) ?? null)
      return
    }
    if (!esito.ok) {
      setErrore(traduciErroreProgetti(esito.errore, lingua) ?? null)
      return
    }
    toast.success(t.aggiuntaAlProgetto(persone.find((p) => p.id === valori.profile_id)?.nome ?? t.persona))
    reset({ progetto_id: progettoId, profile_id: '' })
  })

  return (
    <form onSubmit={invia} noValidate className="space-y-2 rounded-xl bg-card p-3" aria-label={t.aggiungiPersona}>
      <Label htmlFor="membro-nuovo">{t.aggiungiPersona}</Label>
      <div className="flex gap-2">
        <select id="membro-nuovo" className={`${CLASSE_SELECT} min-w-0 flex-1`} {...register('profile_id')}>
          <option value="">{t.scegli}</option>
          {persone.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nome} ({p.ruolo})
            </option>
          ))}
        </select>
        <Button type="submit" className="h-11 shrink-0" disabled={isSubmitting}>
          {isSubmitting ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <UserPlus className="size-4" aria-hidden="true" />
          )}
          {t.aggiungi}
        </Button>
      </div>
      {errors.profile_id?.message ? (
        <p role="alert" className="text-sm text-status-critical">
          {traduciErroreProgetti(errors.profile_id.message, lingua)}
        </p>
      ) : null}
      <ErroreModulo testo={errore} />
    </form>
  )
}

/** Asks first: leaving the project also leaves their tasks without an assignee. */
export function TogliMembro({ progettoId, profileId, nome }: { progettoId: string; profileId: string; nome: string }) {
  const t = useTesti(FOGLI_PROGETTO)
  const lingua = useLingua()
  const [conferma, setConferma] = useState(false)
  const [inCorso, avvia] = useTransition()

  function togli() {
    setConferma(false)
    avvia(async () => {
      let esito
      try {
        esito = await togliMembro({ progetto_id: progettoId, profile_id: profileId })
      } catch {
        toast.error(traduciErroreProgetti('Connessione assente. Riprova.', lingua))
        return
      }
      if (esito.ok) toast.success(t.nonFaPiuParte(nome))
      else toast.error(traduciErroreProgetti(esito.errore, lingua))
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 shrink-0 text-muted-foreground"
        aria-label={t.togliDal(nome)}
        disabled={inCorso}
        onClick={() => setConferma(true)}
      >
        {inCorso ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <UserMinus className="size-4" aria-hidden="true" />
        )}
      </Button>
      <Dialog open={conferma} onOpenChange={setConferma}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t.togliere(nome)}</DialogTitle>
            <DialogDescription>
              {lingua === 'it'
                ? 'Non vedrà più il progetto ed esce dai task a cui è assegnato: chi li condivide li tiene. Se ne era responsabile o coach, il progetto resta senza responsabile o senza coach.'
                : t.togliereDescrizione}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={() => setConferma(false)}>
              {t.annulla}
            </Button>
            <Button type="button" variant="destructive" className="h-11" onClick={togli}>
              {t.togliDalProgetto}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
