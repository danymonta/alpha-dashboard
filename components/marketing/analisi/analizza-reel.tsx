'use client'

import { LoaderCircle, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { useOpzioniToast } from '@/components/marketing/contesto-pannello'
import { Button } from '@/components/ui/button'
import { useLingua } from '@/components/i18n/lingua-provider'
import { ANALISI_REEL, traduciErroreReel } from '@/lib/i18n/testi/analisi-reel'

/**
 * «Analizza», «Dai il punteggio» and «Analizza di nuovo»: admin and marketing. The three are the same
 * request: one click asks for the reading of the reel, Claude's analysis and its score (1.39.0), and it
 * is the only thing that ever makes Claude work on a reel. A POST to a route
 * (never a server action: Next sends the actions of a tab one at a time). The
 * tap puts the analysis in the queue and wakes the work; the panel then polls
 * its own detail and shows «In coda» / «Claude la sta facendo…» until it is
 * ready. The database says no, in words, to a second request on the same
 * reel, the day's ten, and the month's spending limit.
 */
export function AnalizzaReel({
  mediaId,
  etichetta = 'Analizza',
  onFatto,
  variante = 'default',
}: {
  mediaId: string
  /** the visible words: «Analizza», «Dai il punteggio» (analysed before the score existed), «Analizza di nuovo» */
  etichetta?: 'Analizza' | 'Dai il punteggio' | 'Analizza di nuovo'
  onFatto: () => void
  variante?: 'default' | 'outline' | 'ghost'
}) {
  const opzioniToast = useOpzioniToast()
  const lingua = useLingua()
  const t = ANALISI_REEL[lingua].analizza
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
        toast.success(t.inCoda, opzioniToast)
        onFatto()
        return
      }
      const corpo = (await risposta.json().catch(() => null)) as { errore?: string } | null
      setErrore(corpo?.errore ? traduciErroreReel(corpo.errore, lingua) : t.nonPartita)
    } catch {
      setErrore(t.connessione)
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
        {inCorso ? t.chiedo : t.etichette[etichetta]}
      </Button>
      {errore ? (
        <p role="alert" className="text-sm text-status-critical" data-testid="analizza-errore">
          {errore}
        </p>
      ) : null}
    </div>
  )
}
