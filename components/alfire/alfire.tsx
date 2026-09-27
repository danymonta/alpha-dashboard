'use client'

import { useChat } from '@ai-sdk/react'
import {
  DefaultChatTransport,
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from 'ai'
import { ArrowUp, Check, LoaderCircle, Mic, RotateCcw, Square, TriangleAlert, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

import { Fiamma } from '@/components/alfire/fiamma'
import { useRegistratore } from '@/components/alfire/use-registratore'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { isScrittura } from '@/lib/alfire/permessi'
import { riassuntoScrittura } from '@/lib/alfire/riassunto'
import type { AppRole } from '@/lib/auth/roles'
import { cn } from '@/lib/utils'

/** Per-viewer convenience (not data): read answers aloud. */
export const CHIAVE_LEGGI = 'alfire-leggi-risposte'

const SUGGERIMENTI: Record<'admin' | 'setter' | 'closer' | 'altro', string[]> = {
  admin: [
    'Quanto ho incassato questo mese, e quanto è rinnovo?',
    'Chi è in ritardo con i pagamenti?',
    'Com’è andato il setting questo mese?',
    'Come funzionano le provvigioni?',
  ],
  setter: ['Come sto andando questo mese?', 'Aggiungi 20 DM outbound al report di oggi', 'Che call ho questa settimana?'],
  closer: ['Che call ho oggi e domani?', 'Come registro l’esito di una call?'],
  altro: ['Quali task ho aperti?', 'Come funzionano i progetti?'],
}

const LETTURE: Record<string, string> = {
  guida: 'la guida',
  numeri_periodo: 'i numeri del periodo',
  cash_per_mese: 'il cash per mese',
  da_incassare: 'le rate da incassare',
  cerca_clienti: 'i clienti',
  vendite_periodo: 'le vendite',
  metriche_setting: 'le metriche di setting',
  provvigioni: 'le provvigioni',
  costi_periodo: 'i costi',
  miei_numeri: 'i tuoi numeri',
  call_periodo: 'le call',
  progetti: 'i progetti',
  miei_task: 'i tuoi task',
}

type ContestoAlfire = { apri: () => void }
const Contesto = createContext<ContestoAlfire | null>(null)

export function useAlfire(): ContestoAlfire {
  const c = useContext(Contesto)
  if (!c) throw new Error('useAlfire fuori da AlfireProvider')
  return c
}

/** "{"errore":"..."}" from our routes, or the stream's own message. */
function testoErrore(error: Error | undefined): string {
  if (!error) return ''
  try {
    const dati = JSON.parse(error.message) as { errore?: string }
    if (dati.errore) return dati.errore
  } catch {
    // not JSON: already a sentence
  }
  return error.message && error.message.length < 200 ? error.message : 'Alfire non ha risposto. Riprova.'
}

function testoDelMessaggio(m: UIMessage): string {
  return m.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('\n')
}

/**
 * Alfire, the team's AI assistant: one panel for the whole shell, opened from
 * the flame in the header. The conversation lives while the app is open.
 */
export function AlfireProvider({
  configurata,
  ruolo,
  nome,
  children,
}: {
  configurata: boolean
  ruolo: AppRole
  nome: string
  children: ReactNode
}) {
  const [aperto, setAperto] = useState(false)
  const valore = useMemo(() => ({ apri: () => setAperto(true) }), [])
  const chat = useChat({
    transport: new DefaultChatTransport({ api: '/api/alfire' }),
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    onFinish: ({ message }) => {
      if (leggiAdAltaVoce()) parla(testoDelMessaggio(message))
    },
  })

  return (
    <Contesto.Provider value={valore}>
      {children}
      <Sheet open={aperto} onOpenChange={setAperto}>
        <SheetContent
          side="right"
          className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
          data-testid="alfire"
        >
          <Pannello chat={chat} configurata={configurata} ruolo={ruolo} nome={nome} chiudi={() => setAperto(false)} />
        </SheetContent>
      </Sheet>
    </Contesto.Provider>
  )
}

function leggiAdAltaVoce(): boolean {
  try {
    return localStorage.getItem(CHIAVE_LEGGI) === '1'
  } catch {
    return false
  }
}

function parla(testo: string) {
  if (typeof speechSynthesis === 'undefined' || !testo) return
  const pulito = testo.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_#`>|]/g, '')
  const voce = new SpeechSynthesisUtterance(pulito)
  voce.lang = 'it-IT'
  speechSynthesis.cancel()
  speechSynthesis.speak(voce)
}

/** The flame button: header on desktop, top bar on mobile. */
export function BottoneAlfire({ conEtichetta = false }: { conEtichetta?: boolean }) {
  const { apri } = useAlfire()
  return (
    <Button
      type="button"
      variant="ghost"
      onClick={apri}
      aria-label="Chatta con Alfire"
      className={cn('group h-11 gap-2', conEtichetta ? 'px-3' : 'w-11 px-0')}
      data-testid="apri-alfire"
    >
      <Fiamma className="size-6" />
      {conEtichetta ? <span className="text-sm font-medium">Chatta con Alfire</span> : null}
    </Button>
  )
}

type Chat = ReturnType<typeof useChat>

function Pannello({
  chat,
  configurata,
  ruolo,
  nome,
  chiudi,
}: {
  chat: Chat
  configurata: boolean
  ruolo: AppRole
  nome: string
  chiudi: () => void
}) {
  const { messages, sendMessage, status, error, stop, setMessages, regenerate, addToolApprovalResponse, clearError } = chat
  const [testo, setTesto] = useState('')
  const [erroreVoce, setErroreVoce] = useState<string | null>(null)
  const fondo = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const router = useRouter()
  const aggiornati = useRef(new Set<string>())
  const occupato = status === 'submitted' || status === 'streaming'

  const invia = useCallback(
    (contenuto: string) => {
      const t = contenuto.trim()
      if (!t || occupato) return
      clearError()
      void sendMessage({ text: t })
      setTesto('')
    },
    [clearError, occupato, sendMessage],
  )

  const registratore = useRegistratore(
    useCallback((t: string) => invia(t), [invia]),
    useCallback((m: string) => setErroreVoce(m), []),
  )

  // follow the conversation
  useEffect(() => {
    fondo.current?.scrollIntoView({ block: 'end' })
  }, [messages, status])

  // a write went through: the page behind shows the new data
  useEffect(() => {
    for (const m of messages) {
      for (const p of m.parts) {
        if (!isToolUIPart(p) || p.state !== 'output-available') continue
        if (!isScrittura(getToolName(p)) || aggiornati.current.has(p.toolCallId)) continue
        aggiornati.current.add(p.toolCallId)
        if ((p.output as { fatto?: boolean })?.fatto) router.refresh()
      }
    }
  }, [messages, router])

  const suggerimenti = SUGGERIMENTI[ruolo === 'admin' || ruolo === 'setter' || ruolo === 'closer' ? ruolo : 'altro']

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SheetHeader className="flex-row items-center gap-3 border-b border-border pr-14">
        <Fiamma className="size-8" accesa />
        <div className="min-w-0 flex-1">
          <SheetTitle>Alfire</SheetTitle>
          <SheetDescription>Chiedi dei numeri o fatti aiutare a registrare.</SheetDescription>
        </div>
        {messages.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 text-muted-foreground"
            aria-label="Nuova chat"
            onClick={() => {
              stop()
              setMessages([])
              clearError()
            }}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
          </Button>
        ) : null}
      </SheetHeader>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {!configurata ? (
          <NonConfigurata admin={ruolo === 'admin'} />
        ) : messages.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm">
              Ciao {nome.split(' ')[0]}, sono Alfire. Posso leggere i numeri della dashboard e, con la tua conferma, registrare
              al posto tuo.
            </p>
            <div className="flex flex-col gap-2" role="group" aria-label="Domande suggerite">
              {suggerimenti.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => invia(s)}
                  className="min-h-11 rounded-lg border border-border px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <Messaggio key={m.id} messaggio={m} approva={addToolApprovalResponse} chiudi={chiudi} />
          ))
        )}

        {status === 'submitted' ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Alfire ci pensa…
          </p>
        ) : null}

        {error ? (
          <div role="alert" className="space-y-2 rounded-lg bg-status-critical/10 p-3 text-sm">
            <p className="flex items-start gap-2 text-status-critical">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {testoErrore(error)}
            </p>
            <Button type="button" variant="outline" className="h-11" onClick={() => void regenerate()}>
              Riprova
            </Button>
          </div>
        ) : null}
        <div ref={fondo} />
      </div>

      <form
        className="border-t border-border p-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
        onSubmit={(e) => {
          e.preventDefault()
          invia(testo)
        }}
      >
        {erroreVoce ? (
          <p role="alert" className="mb-2 flex items-center gap-2 text-sm text-status-warning">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            <span className="flex-1">{erroreVoce}</span>
            <button type="button" aria-label="Chiudi l’avviso" className="p-1" onClick={() => setErroreVoce(null)}>
              <X className="size-4" aria-hidden="true" />
            </button>
          </p>
        ) : null}
        {registratore.stato === 'registra' ? (
          <p className="mb-2 flex items-center gap-2 text-sm text-status-critical" role="status">
            <span className="size-2 rounded-full bg-status-critical" aria-hidden="true" />
            Ti ascolto: tocca il quadrato quando hai finito.
          </p>
        ) : registratore.stato === 'trascrive' ? (
          <p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Trascrivo il vocale…
          </p>
        ) : null}
        <div className="flex items-end gap-2">
          <label htmlFor="alfire-testo" className="sr-only">
            Scrivi ad Alfire
          </label>
          <textarea
            id="alfire-testo"
            ref={campo}
            rows={1}
            value={testo}
            disabled={!configurata}
            placeholder={configurata ? 'Chiedi ad Alfire…' : 'Alfire non è ancora attiva'}
            onChange={(e) => setTesto(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                invia(testo)
              }
            }}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-lg border border-input bg-transparent px-3 py-2.5 text-base outline-none field-sizing-content placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm"
          />
          {registratore.supportato && configurata ? (
            <Button
              type="button"
              variant={registratore.stato === 'registra' ? 'destructive' : 'outline'}
              size="icon"
              className="size-11 shrink-0"
              aria-label={registratore.stato === 'registra' ? 'Invia il vocale' : 'Parla con Alfire'}
              aria-pressed={registratore.stato === 'registra'}
              disabled={registratore.stato === 'trascrive' || occupato}
              onClick={() => (registratore.stato === 'registra' ? registratore.ferma() : void registratore.avvia())}
            >
              {registratore.stato === 'registra' ? (
                <Square className="size-4" aria-hidden="true" />
              ) : (
                <Mic className="size-4" aria-hidden="true" />
              )}
            </Button>
          ) : null}
          {occupato ? (
            <Button type="button" size="icon" className="size-11 shrink-0" aria-label="Ferma la risposta" onClick={() => stop()}>
              <Square className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              className="size-11 shrink-0"
              aria-label="Invia"
              disabled={!configurata || testo.trim() === ''}
            >
              <ArrowUp className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}

function NonConfigurata({ admin }: { admin: boolean }) {
  return (
    <div className="space-y-2 rounded-xl bg-card p-4 text-sm">
      <p className="font-medium">Alfire non è ancora attiva</p>
      {admin ? (
        <p className="text-muted-foreground">
          Manca la chiave del modello. Crea una chiave gratuita su console.groq.com e aggiungila su Vercel come variabile
          segreta <code className="text-foreground">ALFIRE_API_KEY</code>, poi rifai il deploy.
        </p>
      ) : (
        <p className="text-muted-foreground">L’admin la sta configurando: presto potrai chattare qui.</p>
      )}
    </div>
  )
}

function Messaggio({
  messaggio,
  approva,
  chiudi,
}: {
  messaggio: UIMessage
  approva: Chat['addToolApprovalResponse']
  chiudi: () => void
}) {
  if (messaggio.role === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-xl bg-primary/20 px-3 py-2 text-sm whitespace-pre-wrap">{testoDelMessaggio(messaggio)}</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {messaggio.parts.map((p, i) => {
        if (p.type === 'text') {
          return p.text.trim() ? <Markdown key={i} testo={p.text} chiudi={chiudi} /> : null
        }
        if (!isToolUIPart(p)) return null
        const nome = getToolName(p)
        if (isScrittura(nome)) return <SchedaScrittura key={p.toolCallId} parte={p} nome={nome} approva={approva} chiudi={chiudi} />
        return <StatoLettura key={p.toolCallId} nome={nome} stato={p.state} />
      })}
    </div>
  )
}

function StatoLettura({ nome, stato }: { nome: string; stato: string }) {
  const cosa = LETTURE[nome] ?? 'i dati'
  if (stato === 'output-error') {
    return <p className="text-xs text-status-warning">Non sono riuscita a leggere {cosa}.</p>
  }
  const finito = stato === 'output-available'
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {finito ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : (
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
      )}
      {finito ? `Ho letto ${cosa}` : `Leggo ${cosa}…`}
    </p>
  )
}

type ParteStrumento = Extract<UIMessage['parts'][number], { toolCallId: string }>

function SchedaScrittura({
  parte,
  nome,
  approva,
  chiudi,
}: {
  parte: ParteStrumento
  nome: Parameters<typeof riassuntoScrittura>[0]
  approva: Chat['addToolApprovalResponse']
  chiudi: () => void
}) {
  const input = (parte.input ?? {}) as Record<string, unknown>
  if (parte.state === 'input-streaming') {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
        Preparo l’operazione…
      </p>
    )
  }
  const { titolo, dettagli } = riassuntoScrittura(nome, input)
  const output = parte.state === 'output-available' ? (parte.output as { fatto?: boolean; errore?: string; link?: string }) : null
  const approvazione = 'approval' in parte ? (parte.approval as { id: string; isAutomatic?: boolean } | undefined) : undefined

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3" data-testid="alfire-conferma">
      <div className="space-y-1">
        <p className="text-sm font-medium">{titolo}</p>
        {dettagli.length > 0 ? (
          <ul className="space-y-0.5 text-sm text-muted-foreground">
            {dettagli.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        ) : null}
      </div>

      {parte.state === 'approval-requested' && approvazione && !approvazione.isAutomatic ? (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={() => void approva({ id: approvazione.id, approved: false })}>
            Annulla
          </Button>
          <Button type="button" className="h-11" onClick={() => void approva({ id: approvazione.id, approved: true })}>
            Conferma
          </Button>
        </div>
      ) : parte.state === 'approval-responded' || parte.state === 'input-available' ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Lo faccio…
        </p>
      ) : parte.state === 'output-denied' ? (
        <p className="text-sm text-muted-foreground">Annullato: non ho scritto niente.</p>
      ) : parte.state === 'output-error' ? (
        <p className="flex items-center gap-1.5 text-sm text-status-critical">
          <TriangleAlert className="size-4" aria-hidden="true" />
          Non ci sono riuscita. Riprova.
        </p>
      ) : output?.errore ? (
        <p className="flex items-start gap-1.5 text-sm text-status-critical">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {output.errore}
        </p>
      ) : output?.fatto ? (
        <div className="flex items-center justify-between gap-2">
          <p className="flex items-center gap-1.5 text-sm text-status-ok">
            <Check className="size-4" aria-hidden="true" />
            Fatto
          </p>
          {output.link ? (
            <Link href={output.link} onClick={chiudi} className="min-h-11 content-center px-2 text-sm font-medium underline underline-offset-4">
              Apri
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

function Markdown({ testo, chiudi }: { testo: string; chiudi: () => void }) {
  return (
    <div className="prosa-alfire text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children }) =>
            href?.startsWith('/') ? (
              <Link href={href} onClick={chiudi} className="font-medium underline underline-offset-4">
                {children}
              </Link>
            ) : (
              <a href={href} target="_blank" rel="noreferrer noopener" className="font-medium underline underline-offset-4">
                {children}
              </a>
            ),
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => <th className="border-b border-border px-2 py-1 text-left font-medium">{children}</th>,
          td: ({ children }) => <td className="num border-b border-border px-2 py-1">{children}</td>,
          ul: ({ children }) => <ul className="my-1 list-disc space-y-0.5 pl-5">{children}</ul>,
          ol: ({ children }) => <ol className="my-1 list-decimal space-y-0.5 pl-5">{children}</ol>,
          p: ({ children }) => <p className="my-1.5">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          h1: ({ children }) => <p className="my-1.5 font-semibold">{children}</p>,
          h2: ({ children }) => <p className="my-1.5 font-semibold">{children}</p>,
          h3: ({ children }) => <p className="my-1.5 font-semibold">{children}</p>,
          code: ({ children }) => <code className="rounded bg-muted px-1">{children}</code>,
        }}
      >
        {testo}
      </ReactMarkdown>
    </div>
  )
}
