'use client'

import { LoaderCircle, ShieldOff, TriangleAlert } from 'lucide-react'
import { useId, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { revocaConsenso } from '@/app/(app)/onboarding/actions'
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
import { LIMITI_ONBOARDING, revocaConsensoSchema } from '@/lib/validation/onboarding'

/**
 * «Registra la revoca» of the consent on health data (release B1b), when the client asks the
 * team: the reason first (it stays in the log), then a second tap on a second question.
 * Nothing is revoked on the first one. The answers of the questionnaire and the files are
 * deleted and the client goes back to the rules (onboarding_revoca_consenso).
 */
export function RevocaConsenso({ clientId, cliente }: { clientId: string; cliente: string }) {
  const id = useId()
  const lingua = useLingua()
  const t = ONBOARDING[lingua]
  const c = t.cliente
  const [aperto, setAperto] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [erroreMotivo, setErroreMotivo] = useState<string | null>(null)
  const [sicuro, setSicuro] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()

  function chiudi() {
    setAperto(false)
    setSicuro(false)
    setErroreMotivo(null)
  }

  function avanti() {
    const valido = revocaConsensoSchema.safeParse({ client_id: clientId, tipo: 'salute', motivo })
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
    setErrore(null)
    avvia(async () => {
      try {
        const esito = await revocaConsenso({ client_id: clientId, tipo: 'salute', motivo })
        if (!esito.ok) {
          setErrore(traduciErroreOnboarding(esito.errore, lingua))
          return
        }
      } catch {
        setErrore(t.connessione)
        return
      }
      toast.success(c.revocaFatta)
      chiudi()
      setMotivo('')
    })
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="h-11 text-rosso-testo hover:text-rosso-testo"
        data-testid="revoca-consenso"
        onClick={() => {
          setErrore(null)
          setSicuro(false)
          setAperto(true)
        }}
      >
        <ShieldOff className="size-4" aria-hidden="true" />
        {c.revocaTitolo}
      </Button>
      <Dialog open={aperto} onOpenChange={(v) => !inCorso && (v ? setAperto(true) : chiudi())}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{c.revocaTitolo}</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{cliente}.</span> {c.revocaAiuto}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-motivo`}>{c.revocaMotivo}</Label>
            <Textarea
              id={`${id}-motivo`}
              rows={3}
              maxLength={LIMITI_ONBOARDING.motivo}
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value)
                setSicuro(false)
                setErroreMotivo(null)
              }}
              aria-required="true"
              aria-invalid={erroreMotivo ? true : undefined}
              aria-describedby={erroreMotivo ? `${id}-motivo-errore` : `${id}-motivo-aiuto`}
            />
            <ErroreCampo id={`${id}-motivo-errore`} messaggio={erroreMotivo ?? undefined} />
            <p id={`${id}-motivo-aiuto`} className="text-xs text-muted-foreground">
              {c.revocaMotivoAiuto}
            </p>
          </div>
          {sicuro ? (
            <p role="status" className="flex items-start gap-2 text-sm text-status-warning" data-testid="revoca-consenso-seconda">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {c.revocaDomanda}
            </p>
          ) : null}
          {errore ? (
            <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {errore}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" disabled={inCorso} onClick={chiudi}>
              {c.revocaAnnulla}
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="h-11"
              disabled={inCorso}
              data-testid="revoca-consenso-si"
              onClick={avanti}
            >
              {inCorso ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <ShieldOff className="size-4" aria-hidden="true" />
              )}
              {sicuro ? c.revocaConferma : c.revocaAvanti}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
