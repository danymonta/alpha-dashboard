'use client'

import { Ban, LoaderCircle, RefreshCw, RotateCcw, ShieldCheck, TriangleAlert } from 'lucide-react'
import { useId, useState, useTransition, type ReactNode } from 'react'
import { toast } from 'sonner'

import {
  registraConsensoGenitore,
  revocaLink,
  riattivaLink,
  rigeneraLink,
  type EsitoLink,
} from '@/app/(app)/onboarding/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { useLingua } from '@/components/i18n/lingua-provider'
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
import { Textarea } from '@/components/ui/textarea'
import { ONBOARDING, traduciErroreOnboarding } from '@/lib/i18n/testi/onboarding'
import { LIMITI_ONBOARDING, consensoGenitoreSchema, revocaSchema } from '@/lib/validation/onboarding'

/*
 * The admin's actions on a link, from the card of a client in onboarding (the design of
 * release A): the parent's consent, «Rigenera link», «Revoca» with its reason and a second
 * confirmation, «Riattiva». Each one asks first (a link is the client's way in), says what
 * happened in a toast and leaves the page to the action's own revalidation. The functions
 * in SQL leave the line in the log.
 */

/** One action through its server action: the error in place, never a raw message. */
function useAzione() {
  const lingua = useLingua()
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()

  function esegui(azione: () => Promise<EsitoLink>, fatto: (esito: Extract<EsitoLink, { ok: true }>) => void) {
    setErrore(null)
    avvia(async () => {
      let esito: EsitoLink
      try {
        esito = await azione()
      } catch {
        setErrore(ONBOARDING[lingua].connessione)
        return
      }
      if (!esito.ok) {
        setErrore(traduciErroreOnboarding(esito.errore, lingua))
        return
      }
      fatto(esito)
    })
  }

  return { errore, setErrore, inCorso, esegui }
}

function Errore({ testo }: { testo: string | null }) {
  if (!testo) return null
  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {testo}
    </p>
  )
}

function Rotella({ inCorso, children }: { inCorso: boolean; children: ReactNode }) {
  return inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <>{children}</>
}

/** «Registra il consenso del genitore», for a minor: with it the link turns active if it was paid or confirmed. */
export function ConsensoGenitore({ invitoId, cliente }: { invitoId: string; cliente: string }) {
  const id = useId()
  const lingua = useLingua()
  const t = ONBOARDING[lingua]
  const c = t.link.consenso
  const [aperto, setAperto] = useState(false)
  const [nota, setNota] = useState('')
  const { errore, setErrore, inCorso, esegui } = useAzione()

  function registra() {
    const valido = consensoGenitoreSchema.safeParse({ invito_id: invitoId, nota })
    if (!valido.success) {
      setErrore(traduciErroreOnboarding(valido.error.issues[0]?.message ?? '', lingua))
      return
    }
    esegui(
      () => registraConsensoGenitore({ invito_id: invitoId, nota }),
      (esito) => {
        toast.success(esito.stato === 'attivo' ? c.fattoAttivo : c.fatto)
        setAperto(false)
        setNota('')
      },
    )
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-11"
        data-testid="consenso-genitore"
        onClick={() => {
          setErrore(null)
          setAperto(true)
        }}
      >
        <ShieldCheck className="size-4" aria-hidden="true" />
        {c.bottone}
      </Button>
      <Dialog open={aperto} onOpenChange={(v) => !inCorso && setAperto(v)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{c.titolo}</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{cliente}.</span> {c.testo}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-nota`}>
              {c.nota} <span className="font-normal text-muted-foreground">{t.wizard.cliente.facoltativo}</span>
            </Label>
            <Textarea
              id={`${id}-nota`}
              rows={3}
              maxLength={LIMITI_ONBOARDING.nota}
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              aria-describedby={`${id}-nota-aiuto`}
            />
            <p id={`${id}-nota-aiuto`} className="text-xs text-muted-foreground">
              {c.notaAiuto}
            </p>
          </div>
          <Errore testo={errore} />
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" disabled={inCorso} onClick={() => setAperto(false)}>
              {t.annulla}
            </Button>
            <Button type="button" className="h-11" disabled={inCorso} data-testid="consenso-genitore-si" onClick={registra}>
              <Rotella inCorso={inCorso}>
                <ShieldCheck className="size-4" aria-hidden="true" />
              </Rotella>
              {c.conferma}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** «Rigenera link»: a new token on the same link; the one of before stops working. */
export function RigeneraLink({ invitoId }: { invitoId: string }) {
  const lingua = useLingua()
  const t = ONBOARDING[lingua]
  const r = t.link.rigenera
  const [aperto, setAperto] = useState(false)
  const { errore, setErrore, inCorso, esegui } = useAzione()

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="h-11"
        data-testid="rigenera-link"
        onClick={() => {
          setErrore(null)
          setAperto(true)
        }}
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        {r.bottone}
      </Button>
      <Dialog open={aperto} onOpenChange={(v) => !inCorso && setAperto(v)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{r.titolo}</DialogTitle>
            <DialogDescription>{r.testo}</DialogDescription>
          </DialogHeader>
          <Errore testo={errore} />
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" disabled={inCorso} onClick={() => setAperto(false)}>
              {t.annulla}
            </Button>
            <Button
              type="button"
              className="h-11"
              disabled={inCorso}
              data-testid="rigenera-link-si"
              onClick={() =>
                esegui(
                  () => rigeneraLink({ invito_id: invitoId }),
                  () => {
                    toast.success(r.fatto)
                    setAperto(false)
                  },
                )
              }
            >
              <Rotella inCorso={inCorso}>
                <RefreshCw className="size-4" aria-hidden="true" />
              </Rotella>
              {r.conferma}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * «Revoca»: the reason first (it stays in the log), then a second tap on a second
 * question. Nothing is revoked on the first one.
 */
export function RevocaLink({ invitoId, cliente }: { invitoId: string; cliente: string }) {
  const id = useId()
  const lingua = useLingua()
  const t = ONBOARDING[lingua]
  const r = t.link.revoca
  const [aperto, setAperto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erroreMotivo, setErroreMotivo] = useState<string | null>(null)
  /** The reason is written and checked: the next tap revokes. */
  const [sicuro, setSicuro] = useState(false)
  const { errore, setErrore, inCorso, esegui } = useAzione()

  function chiudi() {
    setAperto(false)
    setSicuro(false)
    setErroreMotivo(null)
  }

  function avanti() {
    const valido = revocaSchema.safeParse({ invito_id: invitoId, motivo })
    if (!valido.success) {
      setErroreMotivo(traduciErroreOnboarding(valido.error.issues[0]?.message ?? '', lingua))
      setSicuro(false)
      return
    }
    setErroreMotivo(null)
    if (!sicuro) {
      setSicuro(true)
      return
    }
    esegui(
      () => revocaLink({ invito_id: invitoId, motivo }),
      () => {
        toast.success(r.fatto)
        chiudi()
        setMotivo('')
      },
    )
  }

  return (
    <>
      {/* rare and destructive: quiet and apart from the primary action; the red button is the dialog's */}
      <Button
        type="button"
        variant="ghost"
        className="ml-auto h-11 text-rosso-testo hover:text-rosso-testo"
        data-testid="revoca-link"
        onClick={() => {
          setErrore(null)
          setSicuro(false)
          setAperto(true)
        }}
      >
        <Ban className="size-4" aria-hidden="true" />
        {r.bottone}
      </Button>
      <Dialog open={aperto} onOpenChange={(v) => !inCorso && (v ? setAperto(true) : chiudi())}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{r.titolo}</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{cliente}.</span> {r.testo}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-motivo`}>{r.motivo}</Label>
            <Textarea
              id={`${id}-motivo`}
              rows={3}
              maxLength={LIMITI_ONBOARDING.motivo}
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value)
                // a reason changed after the first tap is confirmed again
                setSicuro(false)
                setErroreMotivo(null)
              }}
              aria-required="true"
              aria-invalid={erroreMotivo ? true : undefined}
              aria-describedby={erroreMotivo ? `${id}-motivo-errore` : `${id}-motivo-aiuto`}
            />
            <ErroreCampo id={`${id}-motivo-errore`} messaggio={erroreMotivo ?? undefined} />
            <p id={`${id}-motivo-aiuto`} className="text-xs text-muted-foreground">
              {r.motivoAiuto}
            </p>
          </div>
          {sicuro ? (
            <p role="status" className="flex items-start gap-2 text-sm text-status-warning" data-testid="revoca-seconda-conferma">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {r.secondaConferma}
            </p>
          ) : null}
          <Errore testo={errore} />
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" disabled={inCorso} onClick={chiudi}>
              {t.annulla}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-11"
              disabled={inCorso}
              data-testid="revoca-link-si"
              onClick={avanti}
            >
              <Rotella inCorso={inCorso}>
                <Ban className="size-4" aria-hidden="true" />
              </Rotella>
              {sicuro ? r.conferma : r.avanti}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/** «Riattiva» a revoked link: it goes back to what it was, active or waiting for the payment. */
export function RiattivaLink({ invitoId }: { invitoId: string }) {
  const r = ONBOARDING[useLingua()].link.riattiva
  const { errore, inCorso, esegui } = useAzione()

  return (
    <div className="space-y-2">
      <Button
        type="button"
        className="h-11"
        disabled={inCorso}
        data-testid="riattiva-link"
        onClick={() =>
          esegui(
            () => riattivaLink({ invito_id: invitoId }),
            (esito) => toast.success(esito.stato === 'in_attesa_pagamento' ? r.fattoInAttesa : r.fatto),
          )
        }
      >
        <Rotella inCorso={inCorso}>
          <RotateCcw className="size-4" aria-hidden="true" />
        </Rotella>
        {r.bottone}
      </Button>
      <Errore testo={errore} />
    </div>
  )
}
