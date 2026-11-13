'use client'

import { CircleCheck, ExternalLink, LoaderCircle, Play, RotateCcw, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { useBackendPercorso } from '@/components/percorso/backend-percorso'
import { Button } from '@/components/ui/button'
import { TESTI_PERCORSO as T } from '@/lib/percorso/testi'
import {
  STATO_FINITO,
  STATO_IN_RIPRODUZIONE,
  SOGLIA_VISTO,
  campiona,
  indirizzoIframe,
  indirizzoYoutube,
  intervalliDaInviare,
  leggiMessaggioPlayer,
  messaggioAscolto,
  messaggioStati,
  percentualeVista,
  type Intervallo,
} from '@/lib/percorso/video'
import { cn } from '@/lib/utils'

/** Every how many milliseconds the seconds seen go to the server while the video plays. */
const OGNI_MS = 12_000
/** Without any message from the iframe for this long after the tap, the video «does not open». */
const SILENZIO_MS = 15_000
/** How often the page says «listening» until the iframe answers (as iframe_api does). */
const ASCOLTO_MS = 400

type Fase = 'riposo' | 'carico' | 'va' | 'errore'

/**
 * The YouTube player of the client's area (release B1a, docs/onboarding/rilascio-b.md,
 * «Player»): a local frame with «Guarda il video» (no request to Google before the tap);
 * at the tap the iframe of youtube-nocookie.com and no script of YouTube in the page: the
 * page talks to the iframe with postMessage (lib/percorso/video.ts). Every message with
 * the time is a sample: a second counts when the time moved forward by at most 2 seconds
 * since the last one, while the video plays (a jump forward never counts). The seconds go
 * to POST /api/percorso/video every 12 seconds, at the pause, at the end, at 90% and when
 * the page hides (fetch with keepalive); the database joins them and says the percentage.
 *
 * `registra` false (the admin's preview, a completed step read again): the video plays,
 * nothing is sent.
 */
export function PlayerYoutube({
  bloccoId,
  consegnaId,
  youtubeId,
  titolo,
  percentualeIniziale = 0,
  vistoIniziale = false,
  registra = true,
  onVisto,
}: {
  /** The video of a block of the CMS, or (release B2) a video the coach delivered: exactly one of the two. */
  bloccoId?: string
  consegnaId?: string
  youtubeId: string
  titolo: string
  percentualeIniziale?: number
  vistoIniziale?: boolean
  registra?: boolean
  onVisto?: () => void
}) {
  const { video: inviaVideo } = useBackendPercorso()
  const [fase, setFase] = useState<Fase>('riposo')
  const [src, setSrc] = useState<string | null>(null)
  const [percentuale, setPercentuale] = useState(percentualeIniziale)
  const [visto, setVisto] = useState(vistoIniziale)
  const iframe = useRef<HTMLIFrameElement | null>(null)

  // what the player said last, and the seconds of this visit not sent yet
  const ultimoTempo = useRef<number | null>(null)
  const statoPlayer = useRef<number | null>(null)
  const durata = useRef<number | null>(null)
  const daInviare = useRef<Intervallo[]>([])
  const visti = useRef<Intervallo[]>([])
  const haParlato = useRef(false)
  const inviaRef = useRef<() => void>(() => {})
  const percentualeRef = useRef(percentualeIniziale)
  // the last send made because the threshold may be crossed (at most one every 3 seconds)
  const ultimoInvioSoglia = useRef(0)
  const onVistoRef = useRef(onVisto)
  useEffect(() => {
    onVistoRef.current = onVisto
  }, [onVisto])

  const vistoRef = useRef(vistoIniziale)
  const segnaVisto = useCallback(() => {
    if (vistoRef.current) return
    vistoRef.current = true
    setVisto(true)
    onVistoRef.current?.()
  }, [])

  const invia = useCallback(
    () => {
      if (!registra) return
      const d = durata.current
      if (!d || daInviare.current.length === 0) return
      const intervalli = intervalliDaInviare(daInviare.current, d)
      if (intervalli.length === 0) return
      daInviare.current = []
      const chi = consegnaId ? { consegna: consegnaId } : { blocco: bloccoId }
      // the admin's test of the path (components/percorso/backend-percorso.tsx): the seconds stay in its memory
      if (inviaVideo) {
        void inviaVideo({ ...chi, durata: Math.max(1, Math.round(d)), intervalli })
          .then((r) => {
            percentualeRef.current = Math.max(percentualeRef.current, r.percentuale)
            setPercentuale(percentualeRef.current)
            if (r.visto) segnaVisto()
          })
          .catch(() => daInviare.current.push(...intervalli))
        return
      }
      const corpo = JSON.stringify({ ...chi, durata: Math.max(1, Math.round(d)), intervalli })
      void fetch('/api/percorso/video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: corpo,
        keepalive: true,
        cache: 'no-store',
      })
        .then(async (risposta) => {
          if (!risposta.ok) {
            // kept for the next send, unless the server refused them for good
            if (risposta.status >= 500) daInviare.current.push(...intervalli)
            return
          }
          const r = (await risposta.json()) as { percentuale?: number; visto?: boolean }
          if (typeof r.percentuale === 'number') {
            percentualeRef.current = Math.max(percentualeRef.current, r.percentuale)
            setPercentuale(percentualeRef.current)
          }
          if (r.visto) segnaVisto()
        })
        .catch(() => {
          // the network: they go with the next send
          daInviare.current.push(...intervalli)
        })
    },
    [bloccoId, consegnaId, inviaVideo, registra, segnaVisto],
  )
  useEffect(() => {
    inviaRef.current = invia
  }, [invia])

  // the messages of the iframe: only from youtube-nocookie and from our iframe's window
  useEffect(() => {
    if (fase !== 'carico' && fase !== 'va') return
    function suMessaggio(evento: MessageEvent) {
      const m = leggiMessaggioPlayer(evento, iframe.current?.contentWindow ?? null)
      if (!m) return
      haParlato.current = true
      setFase('va')
      if (m.durata) durata.current = m.durata
      const statoPrima = statoPlayer.current
      if (m.stato !== undefined) statoPlayer.current = m.stato
      if (m.tempo !== undefined) {
        if (statoPlayer.current === STATO_IN_RIPRODUZIONE) {
          const tratto = campiona(ultimoTempo.current, m.tempo)
          if (tratto) {
            daInviare.current.push(tratto)
            visti.current.push(tratto)
            const d = durata.current
            if (d) {
              const locale = percentualeVista(visti.current, Math.max(1, Math.round(d)))
              const prima = percentualeRef.current
              if (locale > prima) {
                percentualeRef.current = locale
                setPercentuale(locale)
              }
              // the seconds of this visit count only these seconds: a video resumed at 60% may already
              // be past the threshold with the earlier ones. When the sum could reach 90% the seconds go
              // now (at most every 3 seconds), and the database answers the true union of what was seen.
              const ora = Date.now()
              if (
                !vistoRef.current &&
                Math.min(100, locale + percentualeIniziale) >= SOGLIA_VISTO &&
                ora - ultimoInvioSoglia.current >= 3000
              ) {
                ultimoInvioSoglia.current = ora
                inviaRef.current()
              }
            }
          }
        }
        ultimoTempo.current = m.tempo
      }
      // a pause or the end: what was seen goes now
      if (
        m.stato !== undefined &&
        m.stato !== statoPrima &&
        statoPrima === STATO_IN_RIPRODUZIONE &&
        m.stato !== STATO_IN_RIPRODUZIONE
      ) {
        inviaRef.current()
      }
      if (m.stato === STATO_FINITO) inviaRef.current()
    }
    window.addEventListener('message', suMessaggio)
    return () => window.removeEventListener('message', suMessaggio)
  }, [fase, percentualeIniziale])

  // «Guarda il video» goes away when the player loads: the focus goes to the player, never to <body>
  useEffect(() => {
    if (src) iframe.current?.focus()
  }, [src])

  // «listening» until the iframe answers, and the silence that means the video does not open
  useEffect(() => {
    if (fase !== 'carico') return
    const ascolta = window.setInterval(() => {
      if (haParlato.current) return
      const finestra = iframe.current?.contentWindow
      if (!finestra) return
      finestra.postMessage(messaggioAscolto(), 'https://www.youtube-nocookie.com')
      finestra.postMessage(messaggioStati(), 'https://www.youtube-nocookie.com')
    }, ASCOLTO_MS)
    const silenzio = window.setTimeout(() => {
      if (!haParlato.current) setFase('errore')
    }, SILENZIO_MS)
    return () => {
      window.clearInterval(ascolta)
      window.clearTimeout(silenzio)
    }
  }, [fase])

  // every 12 seconds while it plays, and when the page hides
  useEffect(() => {
    if (fase !== 'va' || !registra) return
    const timer = window.setInterval(() => inviaRef.current(), OGNI_MS)
    const nascosta = () => {
      if (document.visibilityState === 'hidden') inviaRef.current()
    }
    const uscita = () => inviaRef.current()
    document.addEventListener('visibilitychange', nascosta)
    window.addEventListener('pagehide', uscita)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', nascosta)
      window.removeEventListener('pagehide', uscita)
      inviaRef.current()
    }
  }, [fase, registra])

  function guarda() {
    const indirizzo = indirizzoIframe(youtubeId, window.location.origin, true)
    if (!indirizzo) {
      setFase('errore')
      return
    }
    haParlato.current = false
    ultimoTempo.current = null
    statoPlayer.current = null
    setSrc(indirizzo)
    setFase('carico')
  }

  const intera = Math.floor(percentuale)

  return (
    <div className="space-y-2" data-testid="player-youtube" data-blocco={bloccoId} data-consegna={consegnaId}>
      <div className="relative aspect-video overflow-hidden rounded-xl bg-black ring-1 ring-border">
        {src && fase !== 'errore' ? (
          <iframe
            ref={iframe}
            src={src}
            title={titolo}
            className="absolute inset-0 size-full"
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            // YouTube wants to know the embedding site: the area's own policy (same-origin) would send nothing
            referrerPolicy="strict-origin-when-cross-origin"
            onLoad={() => {
              const finestra = iframe.current?.contentWindow
              finestra?.postMessage(messaggioAscolto(), 'https://www.youtube-nocookie.com')
              finestra?.postMessage(messaggioStati(), 'https://www.youtube-nocookie.com')
            }}
          />
        ) : null}

        {fase === 'riposo' ? (
          <button
            type="button"
            onClick={guarda}
            className="group absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[radial-gradient(circle_at_50%_40%,var(--glow-primario),transparent_65%)] text-white focus-visible:ring-3 focus-visible:ring-ring/60 focus-visible:outline-none focus-visible:ring-inset"
          >
            <span className="glow-primario flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground transition-transform group-hover:scale-105 motion-reduce:transition-none">
              <Play className="ml-1 size-7" aria-hidden="true" />
            </span>
            <span className="text-sm font-medium">{T.guardaVideo}</span>
          </button>
        ) : null}

        {fase === 'carico' ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/70 to-transparent p-3 text-xs text-white">
            <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            {T.caricoVideo}
          </div>
        ) : null}

        {fase === 'errore' ? (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-4 text-center text-white">
            <TriangleAlert className="size-6 text-status-warning" aria-hidden="true" />
            <p className="max-w-xs text-sm">{T.videoNonSiApre}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <Button type="button" variant="secondary" className="h-11" onClick={guarda}>
                <RotateCcw className="size-4" aria-hidden="true" />
                {T.riprova}
              </Button>
              <a
                href={indirizzoYoutube(youtubeId)}
                target="_blank"
                rel="noreferrer noopener"
                className="inline-flex h-11 items-center gap-2 rounded-lg border border-white/30 px-3 text-sm font-medium hover:bg-white/10"
              >
                <ExternalLink className="size-4" aria-hidden="true" />
                {T.apriSuYoutube}
              </a>
            </div>
          </div>
        ) : null}
      </div>

      {registra ? (
        <div className="space-y-1.5" data-testid="video-avanzamento" data-percentuale={intera}>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={intera}
            aria-label={titolo}
          >
            <div
              className={cn('h-full rounded-full', visto ? 'bg-status-ok' : 'bg-primary')}
              style={{ width: `${Math.min(100, percentuale)}%` }}
            />
          </div>
          <p className={cn('flex items-center gap-1.5 text-sm', visto ? 'text-status-ok' : 'text-muted-foreground')}>
            {visto ? <CircleCheck className="size-4" aria-hidden="true" /> : null}
            {visto ? T.videoVisto : intera > 0 ? T.vistoAl(intera) : T.videoNonVisto}
          </p>
          {/* only «Video visto» is announced: the percentage changes every second while the video plays */}
          <p className="sr-only" aria-live="polite">
            {visto ? T.videoVisto : ''}
          </p>
        </div>
      ) : null}
    </div>
  )
}
