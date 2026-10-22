'use client'

import { ChevronDown, LoaderCircle } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useId, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { hrefAnalisiReel } from '@/lib/marketing/analisi/pannello'
import { formatDurata } from '@/lib/marketing/analisi/parole'

type Segmento = { da: number; a: number; testo: string }
type Stato =
  | { stato: 'chiuso' }
  | { stato: 'carico' }
  | { stato: 'errore' }
  | { stato: 'pronto'; esito: string | null; trascrizione: string | null; segmenti: Segmento[] | null }

const FRASE_VUOTO: Record<string, string> = {
  senza_parlato: 'Nessun parlato: solo musica, rumore o silenzio.',
  senza_audio: 'Nessun parlato: solo musica, rumore o silenzio.',
  senza_video: 'Instagram non dà il video di questo reel (di solito per la musica protetta): niente parlato.',
  spenta: 'La trascrizione è spenta: manca la chiave su Vercel.',
  fallita: 'La trascrizione non è riuscita.',
}

/**
 * «Parlato» of a reel (1.36.0): what is said in it, read from the reading of
 * the reel (the same GET as the analysis panel, so the same RLS: the admin, the
 * video editor and marketing) only when the person opens it. Never loaded with
 * the list: a transcript is up to 20.000 characters. The audio is not kept
 * anywhere; this is the text Whisper wrote.
 */
export function ParlatoDelPost({ mediaId, className }: { mediaId: string; className?: string }) {
  const id = useId()
  const [stato, setStato] = useState<Stato>({ stato: 'chiuso' })
  const [aperto, setAperto] = useState(false)
  const controllo = useRef<AbortController | null>(null)

  useEffect(() => () => controllo.current?.abort(), [])

  async function carica() {
    controllo.current?.abort()
    const c = new AbortController()
    controllo.current = c
    setStato({ stato: 'carico' })
    try {
      const r = await fetch(`/api/marketing/analisi/${mediaId}`, { signal: c.signal, cache: 'no-store', headers: { accept: 'application/json' } })
      if (r.status === 404) {
        setStato({ stato: 'pronto', esito: null, trascrizione: null, segmenti: null })
        return
      }
      if (!r.ok || r.redirected || !r.headers.get('content-type')?.includes('application/json')) {
        setStato({ stato: 'errore' })
        return
      }
      const d = (await r.json()) as { lettura: { trascrizione_esito: string | null; trascrizione: string | null; segmenti: Segmento[] | null } | null }
      setStato({ stato: 'pronto', esito: d.lettura?.trascrizione_esito ?? null, trascrizione: d.lettura?.trascrizione ?? null, segmenti: d.lettura?.segmenti ?? null })
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setStato({ stato: 'errore' })
    }
  }

  function alterna() {
    const apro = !aperto
    setAperto(apro)
    if (apro && (stato.stato === 'chiuso' || stato.stato === 'errore')) void carica()
  }

  return (
    <div className={className}>
      <Button
        type="button"
        variant="ghost"
        className="h-11 px-2"
        aria-expanded={aperto}
        aria-controls={id}
        onClick={alterna}
        data-testid="parlato-apri"
      >
        <ChevronDown className={`size-4 transition-transform ${aperto ? 'rotate-180' : ''}`} aria-hidden="true" />
        Parlato
      </Button>
      {aperto ? (
        <div id={id} className="space-y-2 pb-1 pl-2 text-sm" data-testid="parlato">
          {stato.stato === 'carico' ? (
            <p className="flex items-center gap-2 text-muted-foreground" aria-busy="true">
              <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
              Carico il parlato…
            </p>
          ) : stato.stato === 'errore' ? (
            <p role="alert" className="flex flex-wrap items-center gap-2">
              Il parlato non si è caricato.
              <Button type="button" variant="outline" className="h-11" onClick={() => void carica()}>
                Riprova
              </Button>
            </p>
          ) : stato.stato === 'pronto' ? (
            stato.esito === 'pronta' && (stato.segmenti?.length || stato.trascrizione) ? (
              stato.segmenti?.length ? (
                <ol className="space-y-1.5">
                  {stato.segmenti.map((s, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="num w-10 shrink-0 text-muted-foreground">{formatDurata(s.da)}</span>
                      <span className="min-w-0 break-words">{s.testo}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="break-words whitespace-pre-line">{stato.trascrizione}</p>
              )
            ) : (
              <p className="text-muted-foreground">{(stato.esito && FRASE_VUOTO[stato.esito]) || 'Ancora non letto: parte con «Analizza» nel pannello del reel, in Pubblicati.'}</p>
            )
          ) : null}
          <Link href={hrefAnalisiReel(mediaId)} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">
            Apri nei Pubblicati
          </Link>
        </div>
      ) : null}
    </div>
  )
}
