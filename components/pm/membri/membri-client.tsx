'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { LoaderCircle, UserMinus, UserPlus } from 'lucide-react'
import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import { aggiungiMembro, togliMembro } from '@/app/(app)/progetti/[id]/actions'
import { CLASSE_SELECT, ErroreModulo } from '@/components/form/foglio-modifica'
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
import { membroSchema, type MembroInput } from '@/lib/validation/progetti'

/** Adds one active person to the project: a native select, one tap on a phone. */
export function AggiungiMembro({
  progettoId,
  persone,
}: {
  progettoId: string
  persone: readonly { id: string; nome: string; ruolo: string }[]
}) {
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
    return <p className="text-sm text-muted-foreground">Tutte le persone attive fanno già parte del progetto.</p>
  }

  const invia = handleSubmit(async (valori) => {
    setErrore(null)
    let esito
    try {
      esito = await aggiungiMembro(valori)
    } catch {
      setErrore('Connessione assente. Riprova.')
      return
    }
    if (!esito.ok) {
      setErrore(esito.errore)
      return
    }
    toast.success(`${persone.find((p) => p.id === valori.profile_id)?.nome ?? 'Persona'} aggiunta al progetto`)
    reset({ progetto_id: progettoId, profile_id: '' })
  })

  return (
    <form onSubmit={invia} noValidate className="space-y-2 rounded-xl bg-card p-3" aria-label="Aggiungi una persona">
      <Label htmlFor="membro-nuovo">Aggiungi una persona</Label>
      <div className="flex gap-2">
        <select id="membro-nuovo" className={`${CLASSE_SELECT} min-w-0 flex-1`} {...register('profile_id')}>
          <option value="">Scegli…</option>
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
          Aggiungi
        </Button>
      </div>
      {errors.profile_id?.message ? (
        <p role="alert" className="text-sm text-status-critical">
          {errors.profile_id.message}
        </p>
      ) : null}
      <ErroreModulo testo={errore} />
    </form>
  )
}

/** Asks first: leaving the project also leaves their tasks without an assignee. */
export function TogliMembro({ progettoId, profileId, nome }: { progettoId: string; profileId: string; nome: string }) {
  const [conferma, setConferma] = useState(false)
  const [inCorso, avvia] = useTransition()

  function togli() {
    setConferma(false)
    avvia(async () => {
      let esito
      try {
        esito = await togliMembro({ progetto_id: progettoId, profile_id: profileId })
      } catch {
        toast.error('Connessione assente. Riprova.')
        return
      }
      if (esito.ok) toast.success(`${nome} non fa più parte del progetto`)
      else toast.error(esito.errore)
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-11 shrink-0 text-muted-foreground"
        aria-label={`Togli ${nome} dal progetto`}
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
            <DialogTitle>Togliere {nome} dal progetto?</DialogTitle>
            <DialogDescription>
              Non vedrà più il progetto ed esce dai task a cui è assegnato: chi li condivide li tiene. Se ne era
              responsabile, il progetto resta senza responsabile.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" onClick={() => setConferma(false)}>
              Annulla
            </Button>
            <Button type="button" variant="destructive" className="h-11" onClick={togli}>
              Togli dal progetto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
