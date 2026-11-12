'use client'

import { BadgeCheck, LoaderCircle } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { confermaPagamento } from '@/app/(app)/onboarding/actions'
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
import { ONBOARDING, traduciErroreOnboarding } from '@/lib/i18n/testi/onboarding'
import type { StatoInvito } from '@/lib/validation/onboarding'

/**
 * «Conferma pagamento» (the design of release A): the link waiting for the payment turns
 * active by hand. A question first, which says that no cash-in is registered (the
 * instalment stays to mark in Incassi) and, for a minor without a parent's consent, that
 * the link still waits for it. On the wizard's last screen and on the card of the client.
 */
export function ConfermaPagamento({
  invitoId,
  cliente,
  attendeConsenso,
  aperto,
  variante = 'default',
  onFatto,
}: {
  invitoId: string
  cliente: string
  /** A minor without the parent's consent: the payment is confirmed, the link stays on hold. */
  attendeConsenso: boolean
  /** onboarding_impostazioni.aperto_ai_clienti: decides the words of the toast. */
  aperto: boolean
  variante?: 'default' | 'outline'
  /** The state the link is in now: the wizard's last screen follows it without a reload. */
  onFatto?: (stato: StatoInvito) => void
}) {
  const lingua = useLingua()
  const t = ONBOARDING[lingua].link.confermaPagamento
  const comuni = ONBOARDING[lingua]
  const [apertoDialogo, setApertoDialogo] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()

  function conferma() {
    setErrore(null)
    avvia(async () => {
      let esito: Awaited<ReturnType<typeof confermaPagamento>>
      try {
        esito = await confermaPagamento({ invito_id: invitoId })
      } catch {
        setErrore(comuni.connessione)
        return
      }
      if (!esito.ok) {
        setErrore(esito.errore)
        return
      }
      toast.success(esito.stato !== 'attivo' ? t.fattoInAttesaConsenso : aperto ? t.fatto : t.fattoNonAperto)
      setApertoDialogo(false)
      onFatto?.(esito.stato)
    })
  }

  return (
    <>
      <Button
        type="button"
        variant={variante}
        className="h-11"
        data-testid="conferma-pagamento"
        onClick={() => {
          setErrore(null)
          setApertoDialogo(true)
        }}
      >
        <BadgeCheck className="size-4" aria-hidden="true" />
        {t.bottone}
      </Button>
      <Dialog open={apertoDialogo} onOpenChange={(v) => !inCorso && setApertoDialogo(v)}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{t.titolo}</DialogTitle>
            <DialogDescription>
              <span className="font-medium text-foreground">{cliente}.</span> {t.testo}
              {attendeConsenso ? ` ${t.testoMinorenne}` : ''}
            </DialogDescription>
          </DialogHeader>
          {errore ? (
            <p role="alert" className="text-sm text-status-critical">
              {traduciErroreOnboarding(errore, lingua)}
            </p>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" className="h-11" disabled={inCorso} onClick={() => setApertoDialogo(false)}>
              {comuni.annulla}
            </Button>
            <Button type="button" className="h-11" disabled={inCorso} data-testid="conferma-pagamento-si" onClick={conferma}>
              {inCorso ? (
                <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              ) : (
                <BadgeCheck className="size-4" aria-hidden="true" />
              )}
              {t.conferma}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
