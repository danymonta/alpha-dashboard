'use client'

import { LoaderCircle, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { useOpzioniToast } from '@/components/marketing/contesto-pannello'
import { Button } from '@/components/ui/button'

const CONNESSIONE = 'Connessione assente. Riprova.'

/**
 * «Analizza» and «Analizza di nuovo»: admin and marketing. A POST to a route
 * (never a server action: Next sends the actions of a tab one at a time). The
 * tap puts the analysis in the queue and wakes the work; the panel then polls
 * its own detail and shows «In coda» / «Claude la sta facendo…» until it is
 * ready. The database says no, in words, to a second request on the same
 * reel, the day's ten, and the month's spending limit.
 */
export function AnalizzaReel({
  mediaId,
  rifa,
  onFatto,
  variante = 'default',
}: {
  mediaId: string
  /** «Analizza di nuovo» */
  rifa?: boolean
  onFatto: () => void
  variante?: 'default' | 'outline'
}) {
  const opzioniToast = useOpzioniToast()
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)

  async function chiedi() {
    if (inCorso) return
    setInCorso(true)
    setErrore(null)
    try {
      const risposta = await fetch('/api/marketing/analisi/richiedi', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ media_id: mediaId }),
        cache: 'no-store',
      })
      if (risposta.status === 202) {
        toast.success('Analisi in coda: Claude la prepara, di solito servono pochi minuti.', opzioniToast)
        onFatto()
        return
      }
      const corpo = (await risposta.json().catch(() => null)) as { errore?: string } | null
      setErrore(corpo?.errore ?? 'Analisi non partita. Riprova.')
    } catch {
      setErrore(CONNESSIONE)
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <Button
        type="button"
        variant={variante}
        className="h-11"
        onClick={() => void chiedi()}
        aria-busy={inCorso}
        // the tapped button stays focusable while it works
        focusableWhenDisabled
        disabled={inCorso}
        data-testid="analizza-reel"
      >
        {inCorso ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles className="size-4 text-[var(--brand-fire-flame)]" aria-hidden="true" />
        )}
        {inCorso ? 'Chiedo a Claude…' : rifa ? 'Analizza di nuovo' : 'Analizza'}
      </Button>
      {errore ? (
        <p role="alert" className="text-sm text-status-critical" data-testid="analizza-errore">
          {errore}
        </p>
      ) : null}
    </div>
  )
}
