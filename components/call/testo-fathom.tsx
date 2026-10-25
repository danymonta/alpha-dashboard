'use client'

import { FileText, Search, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Skeleton } from '@/components/ui/skeleton'
import { useLingua, useTesti } from '@/components/i18n/lingua-provider'
import { conMinuto } from '@/lib/call/analisi/vista'
import { traduciErrore } from '@/lib/i18n/testi/errori-economics'
import { FATHOM_TESTI, REGISTRAZIONE_TESTI } from '@/lib/i18n/testi/esito'

/**
 * The transcript and Fathom's own summary of a call, read from Fathom when the sheet opens
 * (1.37.0, CLAUDE.md section 31): GET /api/call/<id>/trascrizione and /riassunto, no-store,
 * never saved by the app, never in a log. The four states: skeleton, error with «Riprova»,
 * empty, the text. Each minute of the transcript opens the recording at that second.
 */
type Segmento = { t: string; s: number; chi: 'closer' | 'lead' | 'altro'; testo: string }
type Stato<T> = { fase: 'carico' } | { fase: 'errore'; frase: string } | { fase: 'pronto'; dati: T }

function useLettura<T>(callId: string, percorso: 'trascrizione' | 'riassunto', aperto: boolean): [Stato<T>, () => void] {
  // the reading belongs to the round that asked for it: a new round (Riprova) shows the skeleton until it answers
  const [lettura, setLettura] = useState<{ giro: number; stato: Stato<T> } | null>(null)
  const [giro, setGiro] = useState(0)
  useEffect(() => {
    if (!aperto) return
    const controllo = new AbortController()
    fetch(`/api/call/${callId}/${percorso}`, { cache: 'no-store', signal: controllo.signal })
      .then(async (r) => {
        const corpo = (await r.json().catch(() => ({}))) as { errore?: string }
        if (!r.ok) throw new Error(corpo.errore ?? FATHOM_TESTI.it.nonCaricata)
        setLettura({ giro, stato: { fase: 'pronto', dati: corpo as T } })
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
        setLettura({
          giro,
          stato: { fase: 'errore', frase: e instanceof Error && e.message ? e.message : FATHOM_TESTI.it.nonCaricata },
        })
      })
    return () => controllo.abort()
  }, [callId, percorso, aperto, giro])
  const stato: Stato<T> = lettura && lettura.giro === giro ? lettura.stato : { fase: 'carico' }
  return [stato, useCallback(() => setGiro((g) => g + 1), [])]
}

function Scheletro() {
  const t = useTesti(FATHOM_TESTI)
  return (
    <div className="space-y-3 px-4" aria-busy="true">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
      <span className="sr-only">{t.leggo}</span>
    </div>
  )
}

function Errore({ frase, riprova }: { frase: string; riprova: () => void }) {
  const lingua = useLingua()
  const t = FATHOM_TESTI[lingua]
  return (
    <div role="alert" className="mx-4 flex flex-col items-start gap-3 rounded-lg border border-border p-4 text-sm">
      <p className="flex items-start gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-critical" aria-hidden="true" />
        {traduciErrore(frase, lingua)}
      </p>
      <Button type="button" variant="outline" className="h-11" onClick={riprova}>
        {t.riprova}
      </Button>
    </div>
  )
}

export function TrascrizioneFathom({ callId, aperto, onChiudi }: { callId: string; aperto: boolean; onChiudi: () => void }) {
  const [stato, riprova] = useLettura<{ segmenti: Segmento[]; link: string }>(callId, 'trascrizione', aperto)
  const [cerca, setCerca] = useState('')
  const lingua = useLingua()
  const t = FATHOM_TESTI[lingua]
  const REGISTRAZIONE = REGISTRAZIONE_TESTI[lingua]
  const segmenti =
    stato.fase === 'pronto'
      ? stato.dati.segmenti.filter((s) => cerca.trim() === '' || s.testo.toLowerCase().includes(cerca.trim().toLowerCase()))
      : []
  return (
    <Sheet open={aperto} onOpenChange={(v) => !v && onChiudi()}>
      <SheetContent side="bottom" className="mx-auto max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-y-auto rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        <SheetHeader>
          <SheetTitle>{REGISTRAZIONE.scheda.trascrizione}</SheetTitle>
          <SheetDescription>{REGISTRAZIONE.scheda.trascrizioneNota}</SheetDescription>
        </SheetHeader>
        {stato.fase === 'carico' ? (
          <Scheletro />
        ) : stato.fase === 'errore' ? (
          <Errore frase={stato.frase} riprova={riprova} />
        ) : stato.dati.segmenti.length === 0 ? (
          <p className="px-4 text-sm text-muted-foreground">{t.senzaTrascrizione}</p>
        ) : (
          <div className="space-y-3 px-4">
            {lingua === 'en' ? <p className="text-xs text-muted-foreground">{t.inItaliano}</p> : null}
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input
                type="search"
                value={cerca}
                onChange={(e) => setCerca(e.currentTarget.value)}
                placeholder={t.cerca}
                aria-label={t.cercaNome}
                className="h-11 pl-9"
              />
            </div>
            <ol className="space-y-2" data-testid="trascrizione">
              {segmenti.map((s, i) => (
                <li key={`${s.s}-${i}`} className="flex gap-3 text-sm">
                  <a
                    href={conMinuto(stato.dati.link, s.s)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="num flex min-h-11 shrink-0 items-start pt-2 text-muted-foreground underline underline-offset-4"
                    aria-label={t.alMinuto(s.t)}
                  >
                    {s.t}
                  </a>
                  <p className="min-w-0 flex-1 py-2 break-words">
                    <span className="font-medium">{t.chi[s.chi]}</span>: <span lang="it">{s.testo}</span>
                  </p>
                </li>
              ))}
              {segmenti.length === 0 ? <li className="text-sm text-muted-foreground">{t.nessunPassaggio}</li> : null}
            </ol>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

export function RiassuntoFathom({ callId, aperto, onChiudi }: { callId: string; aperto: boolean; onChiudi: () => void }) {
  const [stato, riprova] = useLettura<{ testo: string }>(callId, 'riassunto', aperto)
  const t = useTesti(FATHOM_TESTI)
  const REGISTRAZIONE = useTesti(REGISTRAZIONE_TESTI)
  return (
    <Sheet open={aperto} onOpenChange={(v) => !v && onChiudi()}>
      <SheetContent side="bottom" className="mx-auto max-h-[calc(100dvh-1rem)] w-full max-w-2xl overflow-y-auto rounded-t-xl pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
        <SheetHeader>
          <SheetTitle>{REGISTRAZIONE.scheda.riassunto}</SheetTitle>
          <SheetDescription>{REGISTRAZIONE.scheda.riassuntoNota}</SheetDescription>
        </SheetHeader>
        {stato.fase === 'carico' ? (
          <Scheletro />
        ) : stato.fase === 'errore' ? (
          <Errore frase={stato.frase} riprova={riprova} />
        ) : stato.dati.testo.trim() === '' ? (
          <p className="px-4 text-sm text-muted-foreground">{t.senzaRiassunto}</p>
        ) : (
          <div className="px-4 text-sm leading-relaxed" data-testid="riassunto-fathom">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                a: ({ href, children }) => (
                  <a href={href} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-4">
                    {children}
                  </a>
                ),
                img: ({ alt }) => (alt ? <span className="text-muted-foreground italic">{alt}</span> : null),
              }}
            >
              {stato.dati.testo}
            </ReactMarkdown>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}

/** The small button that opens one of the two sheets. */
export function BottoneTesto({ etichetta, onClick }: { etichetta: string; onClick: () => void }) {
  return (
    <Button type="button" variant="outline" className="h-11 gap-1.5" onClick={onClick}>
      <FileText className="size-4" aria-hidden="true" />
      {etichetta}
    </Button>
  )
}

