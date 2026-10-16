'use client'

import { LoaderCircle, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { rivalidaAnalisi } from '@/app/(app)/marketing/analisi/actions'
import { Button } from '@/components/ui/button'
import { COSTO_STIMATO_PER_REEL_USD } from '@/lib/marketing/analisi/costi'

const CONNESSIONE = 'Connessione assente. Riprova.'
const usd = (n: number) => `${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $`

/**
 * «Valuta i reel non valutati (N)» (1.39.0): one confirmation for the click of «Analizza» on the reels of the page
 * that have no score, the most recent first, as many as the day's requests still allow, with the estimated
 * cost shown before. Claude works on nothing until the person confirms here: this is still a click, never
 * something the app does by itself. Admin and marketing only (the page does not draw it for the video editor).
 */
export function ValutaTutti({ mediaIds, restano, limiteGiorno }: { mediaIds: readonly string[]; restano: number; limiteGiorno: number }) {
  const router = useRouter()
  const [aperto, setAperto] = useState(false)
  const [inCorso, setInCorso] = useState(false)
  const [errore, setErrore] = useState<string | null>(null)
  const apri = useRef<HTMLButtonElement>(null)
  const quanti = Math.min(mediaIds.length, Math.max(0, restano), limiteGiorno)

  if (mediaIds.length === 0) return null

  async function conferma() {
    if (inCorso || quanti === 0) return
    setInCorso(true)
    setErrore(null)
    try {
      const risposta = await fetch('/api/marketing/analisi/richiedi-molti', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ media_ids: mediaIds.slice(0, quanti) }),
        cache: 'no-store',
      })
      const corpo = (await risposta.json().catch(() => null)) as { accodate?: number; saltate?: number; fermata?: string | null; errore?: string } | null
      if (risposta.status === 202 && corpo?.accodate) {
        toast.success(
          corpo.accodate === 1
            ? 'Un reel in coda: Claude lo analizza e gli dà il punteggio, di solito servono pochi minuti.'
            : `${corpo.accodate} reel in coda: Claude li prepara uno alla volta, ci vorrà un po’.`,
        )
        setAperto(false)
        await rivalidaAnalisi()
        router.refresh()
        apri.current?.focus()
        return
      }
      setErrore(corpo?.fermata ?? corpo?.errore ?? 'Nessuna analisi è partita. Riprova.')
    } catch {
      setErrore(CONNESSIONE)
    } finally {
      setInCorso(false)
    }
  }

  return (
    <div className="space-y-2" data-testid="valuta-tutti">
      <Button
        ref={apri}
        type="button"
        variant="outline"
        className="h-11"
        aria-expanded={aperto}
        onClick={() => setAperto((x) => !x)}
        data-testid="valuta-tutti-apri"
      >
        <Sparkles className="size-4 text-[var(--brand-fire-flame)]" aria-hidden="true" />
        Valuta i reel non valutati ({mediaIds.length})
      </Button>
      {aperto ? (
        <div className="space-y-3 rounded-xl bg-card p-4 text-sm" role="group" aria-label="Conferma della valutazione dei reel" data-testid="valuta-tutti-conferma">
          {restano <= 0 ? (
            <p>Le analisi di oggi sono finite: sono {limiteGiorno} al giorno per tutto il team. Riprova domani.</p>
          ) : (
            <p>
              Claude analizzerà e darà il punteggio a <span className="num font-medium">{quanti}</span> reel, i più recenti tra quelli non valutati, per circa{' '}
              <span className="num font-medium">{usd(quanti * COSTO_STIMATO_PER_REEL_USD)}</span> (è una stima: il costo vero lo conta il gestionale). Oggi restano{' '}
              <span className="num">{restano}</span> richieste su {limiteGiorno} per tutto il team
              {mediaIds.length > quanti ? `; gli altri ${mediaIds.length - quanti} restano per domani` : ''}.
            </p>
          )}
          {errore ? (
            <p role="alert" className="text-status-critical" data-testid="valuta-tutti-errore">
              {errore}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            {restano > 0 ? (
              <Button type="button" className="h-11" focusableWhenDisabled disabled={inCorso} aria-busy={inCorso} onClick={() => void conferma()} data-testid="valuta-tutti-conferma-bottone">
                {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
                {inCorso ? 'Chiedo a Claude…' : `Conferma e analizza ${quanti === 1 ? 'il reel' : `${quanti} reel`}`}
              </Button>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              className="h-11"
              onClick={() => {
                setAperto(false)
                apri.current?.focus()
              }}
            >
              {restano > 0 ? 'Annulla' : 'Chiudi'}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
