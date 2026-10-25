'use client'

import { LoaderCircle, RefreshCw } from 'lucide-react'
import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { rivalidaMarketing } from '@/app/(app)/marketing/pubblicati/actions'
import { Button } from '@/components/ui/button'
import { useLingua } from '@/components/i18n/lingua-provider'
import { POST_INSTAGRAM } from '@/lib/i18n/testi/post-instagram'
import { fraseAggiornato } from '@/lib/marketing/parole-post'

type Risposta = {
  esito?: 'ok' | 'parziale' | 'fallito'
  letti?: number
  collegati?: number
  proposti?: number
  /** the statistics phase (1.36.0): posts with numbers, and whether the permission is there */
  metriche?: number
  permesso?: boolean | null
  errore?: string | null
  rifiutato?: 'in_corso' | 'appena_fatto'
}

/**
 * «Aggiorna da Instagram» (1.33.0, admin and marketing): the listing run now,
 * from a route (spec R5), so the other taps of the page never wait behind it;
 * then one redraw of the area (rivalidaMarketing). The button stays still
 * while it works («Leggo i post…»), a second tap does not start another run.
 */
export function AggiornaDaInstagram({ variante = 'outline' }: { variante?: 'outline' | 'default' }) {
  const lingua = useLingua()
  const t = POST_INSTAGRAM[lingua].aggiorna
  const [leggo, setLeggo] = useState(false)
  const [, avvia] = useTransition()
  const inVolo = useRef(false)

  async function aggiorna() {
    if (inVolo.current) return
    inVolo.current = true
    setLeggo(true)
    let risposta: Risposta
    try {
      const r = await fetch('/api/marketing/instagram/aggiorna', {
        method: 'POST',
        cache: 'no-store',
        headers: { accept: 'application/json' },
      })
      const json = r.headers.get('content-type')?.includes('application/json') && !r.redirected
      risposta = json ? ((await r.json()) as Risposta) : { esito: 'fallito', errore: t.sessione }
      if (!r.ok && !risposta.errore) risposta.errore = t.nonRiuscito
      if (!r.ok) risposta.esito = 'fallito'
    } catch {
      risposta = { esito: 'fallito', errore: t.connessione }
    }

    // the new posts and links on the page: one redraw, the browser's cache emptied
    avvia(async () => {
      try {
        await rivalidaMarketing()
      } catch {
        // the page stays as it was: the next visit reads again
      }
      inVolo.current = false
      setLeggo(false)
    })

    const conteggi = {
      letti: risposta.letti ?? 0,
      collegati: risposta.collegati ?? 0,
      proposti: risposta.proposti ?? 0,
      metriche: risposta.metriche,
      permesso: risposta.permesso,
    }
    if (risposta.rifiutato) toast.info(risposta.errore ?? t.traPoco)
    else if (risposta.esito === 'ok') toast.success(fraseAggiornato(conteggi, lingua))
    else if (risposta.esito === 'parziale')
      toast.warning(fraseAggiornato(conteggi, lingua), { description: risposta.errore ?? t.resto })
    else toast.error(risposta.errore ?? t.nonRiuscito)
  }

  return (
    <Button
      type="button"
      variant={variante}
      className="h-11 aria-disabled:opacity-70"
      aria-busy={leggo}
      disabled={leggo}
      focusableWhenDisabled
      onClick={() => void aggiorna()}
    >
      {leggo ? (
        <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
      ) : (
        <RefreshCw className="size-4" aria-hidden="true" />
      )}
      {leggo ? t.leggo : t.aggiorna}
    </Button>
  )
}
