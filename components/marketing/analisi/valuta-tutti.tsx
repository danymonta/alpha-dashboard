'use client'

import { LoaderCircle, Sparkles } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { rivalidaAnalisi } from '@/app/(app)/marketing/pubblicati/azioni-analisi'
import { Button } from '@/components/ui/button'
import { useLingua } from '@/components/i18n/lingua-provider'
import { ANALISI_REEL, traduciErroreReel, usdIn } from '@/lib/i18n/testi/analisi-reel'
import { COSTO_STIMATO_PER_REEL_USD } from '@/lib/marketing/analisi/costi'

/**
 * «Valuta i reel non valutati (N)» (1.39.0): one confirmation for the click of «Analizza» on the reels of the page
 * that have no score, the most recent first, as many as the day's requests still allow, with the estimated
 * cost shown before. Claude works on nothing until the person confirms here: this is still a click, never
 * something the app does by itself. Admin and marketing only (the page does not draw it for the video editor).
 */
export function ValutaTutti({ mediaIds, restano, limiteGiorno }: { mediaIds: readonly string[]; restano: number; limiteGiorno: number }) {
  const router = useRouter()
  const lingua = useLingua()
  const t = ANALISI_REEL[lingua].valuta
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
        toast.success(corpo.accodate === 1 ? t.uno : t.molti(corpo.accodate))
        setAperto(false)
        await rivalidaAnalisi()
        router.refresh()
        apri.current?.focus()
        return
      }
      const motivo = corpo?.fermata ?? corpo?.errore
      setErrore(motivo ? traduciErroreReel(motivo, lingua) : t.nessuna)
    } catch {
      setErrore(t.connessione)
    } finally {
      setInCorso(false)
    }
  }

  return (
    // `contents`: the button takes its place in the row of the filters, the confirmation below takes the whole row
    <div className="contents" data-testid="valuta-tutti">
      <Button
        ref={apri}
        type="button"
        variant="outline"
        className="ml-auto h-11"
        aria-expanded={aperto}
        onClick={() => setAperto((x) => !x)}
        data-testid="valuta-tutti-apri"
      >
        <Sparkles className="size-4 text-[var(--brand-fire-flame)]" aria-hidden="true" />
        {t.bottone(mediaIds.length)}
      </Button>
      {aperto ? (
        <div className="basis-full space-y-3 rounded-xl bg-card p-4 text-sm" role="group" aria-label={t.aria} data-testid="valuta-tutti-conferma">
          {restano <= 0 ? (
            <p>{t.finite(limiteGiorno)}</p>
          ) : (
            <p>
              {t.parte1}
              <span className="num font-medium">{quanti}</span>
              {t.parte2}
              <span className="num font-medium">{usdIn(quanti * COSTO_STIMATO_PER_REEL_USD, lingua)}</span>
              {t.parte3}
              <span className="num">{restano}</span>
              {t.parte4(limiteGiorno)}
              {mediaIds.length > quanti ? t.altri(mediaIds.length - quanti) : ''}.
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
                {inCorso ? t.chiedo : t.conferma(quanti)}
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
              {restano > 0 ? t.annulla : t.chiudi}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}
