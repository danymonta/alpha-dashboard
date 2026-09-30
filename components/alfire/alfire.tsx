'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, getToolName, isToolUIPart, type UIMessage } from 'ai'
import { ArrowUp, Check, LoaderCircle, Mic, Paperclip, RotateCcw, Square, TriangleAlert, X } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { AllegatiInAttesa, AllegatiInviati, useAllegati } from '@/components/alfire/allegati'
import { Fiamma } from '@/components/alfire/fiamma'
import { Markdown } from '@/components/alfire/markdown'
import { RisposteProposte } from '@/components/alfire/proposte'
import { useRegistratore } from '@/components/alfire/use-registratore'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import {
  ACCETTA_ALLEGATI,
  allegatiDelMessaggio,
  alleggerisciAllegati,
  messaggioConAllegati,
} from '@/lib/alfire/allegati'
import { anteprimaAlfire } from '@/lib/alfire/anteprima'
import { avvisoTrascrizione, unisciTesto } from '@/lib/alfire/dettatura'
import { isScrittura } from '@/lib/alfire/permessi'
import { azioneDistruttiva, riassuntoScrittura, type Anteprima } from '@/lib/alfire/riassunto'
import {
  confermeComplete,
  domandaNonDetta,
  isProposta,
  leggiProposte,
  propostaCheRisponde,
  rispostaScelta,
} from '@/lib/alfire/risposte'
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
  rate_cliente: 'le rate del cliente',
  vendite_periodo: 'le vendite',
  metriche_setting: 'le metriche di setting',
  provvigioni: 'le provvigioni',
  costi_periodo: 'i costi',
  miei_numeri: 'i tuoi numeri',
  call_periodo: 'le call',
  progetti: 'i progetti',
  progetto_dettaglio: 'il progetto',
  miei_task: 'i tuoi task',
  mio_tempo: 'il tuo tempo',
  tempo_team: 'il tempo del team',
  commenti_marketing: 'cosa dicono i lead',
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

/** What is read aloud: the answer, or the question asked only above the buttons. */
function testoDaLeggere(m: UIMessage): string {
  const domande = m.parts.flatMap((p) => {
    const d = isToolUIPart(p) && isProposta(p) ? domandaNonDetta(m, leggiProposte(p.input)) : null
    return d ? [d] : []
  })
  return [testoDelMessaggio(m), ...domande].filter(Boolean).join('\n')
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
    transport: new DefaultChatTransport({
      api: '/api/alfire',
      // old attachments travel without their text: the request stays small (alleggerisciAllegati)
      prepareSendMessagesRequest: ({ id, messages, body, trigger, messageId }) => ({
        body: { ...body, id, messages: alleggerisciAllegati(messages), trigger, messageId },
      }),
    }),
    // on after the confirmation cards; a proposal waiting for its tap never holds it back
    sendAutomaticallyWhen: confermeComplete,
    onFinish: ({ message }) => {
      if (leggiAdAltaVoce()) parla(testoDaLeggere(message))
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
      data-tour="alfire"
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
  const [erroriAllegati, setErroriAllegati] = useState<string[]>([])
  const fondo = useRef<HTMLDivElement>(null)
  const campo = useRef<HTMLTextAreaElement>(null)
  const sceltaFile = useRef<HTMLInputElement>(null)
  // files for the next message: read as soon as they are picked, sent with it
  const allegati = useAllegati({
    onErrore: useCallback(
      (m: string[], sostituisci: boolean) =>
        setErroriAllegati((prima) => (sostituisci ? m : [...prima.filter((p) => !m.includes(p)), ...m])),
      [],
    ),
  })
  const router = useRouter()
  const aggiornati = useRef(new Set<string>())
  const occupato = status === 'submitted' || status === 'streaming'
  const ultimo = messages.at(-1)
  const rispostaMuta =
    status === 'ready' &&
    !error &&
    ultimo?.role === 'assistant' &&
    !ultimo.parts.some(
      (p) =>
        (p.type === 'text' && p.text.trim() !== '') ||
        (isToolUIPart(p) && isScrittura(getToolName(p))) ||
        // a closed question answers; follow-ups alone, with no text, do not
        (isToolUIPart(p) && isProposta(p) && propostaCheRisponde(p.input)),
    )

  // the transcript goes into the box, not straight to Alfire: read it, fix it, then send.
  // While recording the box shows the live text after what was typed before the tap.
  const primaDelVocale = useRef('')
  // live text reached the box during this recording: a failed final leaves only that
  const parzialeMostrato = useRef(false)
  // the dictated text changed the box: its last words go in sight (below)
  const seguiDettato = useRef(false)
  const registratore = useRegistratore({
    onParziale: useCallback((t: string) => {
      parzialeMostrato.current = true
      seguiDettato.current = true
      setTesto(unisciTesto(primaDelVocale.current, t))
    }, []),
    onTesto: useCallback((t: string) => {
      seguiDettato.current = true
      setTesto(unisciTesto(primaDelVocale.current, t))
      requestAnimationFrame(() => campo.current?.focus())
    }, []),
    onErrore: useCallback((m: string) => setErroreVoce(avvisoTrascrizione(m, parzialeMostrato.current)), []),
  })
  const inAscolto = registratore.stato !== 'fermo'

  // the box stops growing at 8rem and a value set from code never scrolls it:
  // while dictating, the newest words would be hidden below the first lines
  useLayoutEffect(() => {
    if (!seguiDettato.current) return
    seguiDettato.current = false
    const c = campo.current
    if (c) c.scrollTop = c.scrollHeight
  }, [testo])

  const { pronti, inLettura, svuota: svuotaAllegati } = allegati
  const invia = useCallback(
    (contenuto: string) => {
      const t = contenuto.trim()
      // the live text is not the final one: it goes after the stop, with Invio;
      // a file still being read holds the message back until its text is there
      if ((!t && pronti.length === 0) || occupato || inAscolto || inLettura) return
      clearError()
      void sendMessage(messaggioConAllegati(t, pronti))
      setTesto('')
      setErroriAllegati([])
      svuotaAllegati()
    },
    [clearError, inAscolto, inLettura, occupato, pronti, sendMessage, svuotaAllegati],
  )

  // a tap on an option Alfire proposed: the user's answer, as if typed (the box stays as it is;
  // files waiting go with it, as they would with a typed answer)
  const rispondi = useCallback(
    (opzione: string) => {
      if (occupato || inAscolto || inLettura) return
      clearError()
      void sendMessage(messaggioConAllegati(opzione, pronti))
      if (pronti.length > 0) svuotaAllegati()
    },
    [clearError, inAscolto, inLettura, occupato, pronti, sendMessage, svuotaAllegati],
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
              svuotaAllegati()
              setErroriAllegati([])
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
              Ciao {nome.split(' ')[0]}, sono Alfire. Posso leggere i numeri della dashboard e i file che alleghi e, con la tua
              conferma, registrare al posto tuo.
            </p>
            <div className="flex flex-col gap-2" role="group" aria-label="Domande suggerite">
              {suggerimenti.map((s) => (
                <button
                  key={s}
                  type="button"
                  // while dictating nothing is sent: the send button waits for the stop too (and for a file being read)
                  disabled={inAscolto || inLettura}
                  onClick={() => invia(s)}
                  className="min-h-11 rounded-lg border border-border px-3 py-2 text-left text-sm text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <Messaggio
              key={m.id}
              messaggio={m}
              approva={addToolApprovalResponse}
              chiudi={chiudi}
              // the buttons answer only on the last message, when Alfire is not busy and nobody dictates
              proposte={{
                attive: i === messages.length - 1 && !occupato && !inAscolto && !inLettura && configurata,
                correnti: i === messages.length - 1,
                seguente: messages[i + 1],
                rispondi,
              }}
            />
          ))
        )}

        {status === 'submitted' ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            Alfire ci pensa…
          </p>
        ) : null}

        {rispostaMuta ? (
          // the model read the data and stopped without a word: say it, and offer to go on
          <div role="status" className="space-y-2 rounded-lg bg-muted p-3 text-sm" data-testid="alfire-muta">
            <p className="text-muted-foreground">Alfire ha letto i dati ma si è fermato prima di rispondere.</p>
            <Button type="button" variant="outline" className="h-11" onClick={() => void regenerate()}>
              Riprova
            </Button>
          </div>
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
        {erroriAllegati.length > 0 ? (
          <div role="alert" className="mb-2 flex items-start gap-2 text-sm text-status-warning" data-testid="alfire-errore-allegato">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <ul className="flex-1 space-y-0.5">
              {erroriAllegati.map((m) => (
                <li key={m}>{m}</li>
              ))}
            </ul>
            <button type="button" aria-label="Chiudi l’avviso" className="-my-1 p-1" onClick={() => setErroriAllegati([])}>
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}
        <AllegatiInAttesa file={allegati.file} togli={allegati.togli} />
        {registratore.stato === 'registra' ? (
          <p id="alfire-ascolto" className="mb-2 flex items-center gap-2 text-sm text-status-critical" role="status">
            <span className="size-2 shrink-0 rounded-full bg-status-critical" aria-hidden="true" />
            <span>
              Ti ascolto: tocca il quadrato quando hai finito.
              {registratore.inPausa ? (
                // the partials stopped (a limit, repeated failures): the words are not lost
                <span className="block text-muted-foreground">Testo in diretta in pausa: arriva tutto allo stop.</span>
              ) : null}
            </span>
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
            // while dictating the box shows the live text, muted, until the final one
            readOnly={inAscolto}
            aria-describedby={registratore.stato === 'registra' ? 'alfire-ascolto' : undefined}
            data-in-ascolto={inAscolto ? 'true' : undefined}
            placeholder={configurata ? (inAscolto ? 'In ascolto…' : 'Chiedi ad Alfire…') : 'Alfire non è ancora attiva'}
            onChange={(e) => {
              seguiDettato.current = false
              setTesto(e.currentTarget.value)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                invia(testo)
              }
            }}
            className={cn(
              'max-h-32 min-h-11 flex-1 resize-none rounded-lg border border-input bg-transparent px-3 py-2.5 text-base outline-none field-sizing-content placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 md:text-sm',
              inAscolto && 'text-muted-foreground italic',
            )}
          />
          {configurata ? (
            <>
              <input
                ref={sceltaFile}
                type="file"
                multiple
                accept={ACCETTA_ALLEGATI}
                className="sr-only"
                tabIndex={-1}
                aria-hidden="true"
                data-testid="alfire-scegli-file"
                onChange={(e) => {
                  allegati.aggiungi(e.currentTarget.files)
                  // the same file can be picked again after removing it
                  e.currentTarget.value = ''
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11 shrink-0"
                aria-label="Allega un file"
                // like the microphone: not while Alfire answers or while dictating
                disabled={occupato || inAscolto || allegati.pieno}
                onClick={() => sceltaFile.current?.click()}
              >
                <Paperclip className="size-4" aria-hidden="true" />
              </Button>
            </>
          ) : null}
          {registratore.supportato && configurata ? (
            <Button
              type="button"
              variant={registratore.stato === 'registra' ? 'destructive' : 'outline'}
              size="icon"
              className="size-11 shrink-0"
              aria-label={registratore.stato === 'registra' ? 'Ferma e trascrivi' : 'Parla con Alfire'}
              aria-pressed={registratore.stato === 'registra'}
              // stopping is always possible, even while Alfire answers; one tap opens the microphone
              disabled={
                registratore.stato === 'trascrive' ||
                registratore.stato === 'apre' ||
                (occupato && registratore.stato !== 'registra')
              }
              onClick={() => {
                if (registratore.stato === 'registra') return registratore.ferma()
                primaDelVocale.current = testo
                parzialeMostrato.current = false
                void registratore.avvia()
              }}
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
              disabled={!configurata || (testo.trim() === '' && pronti.length === 0) || inAscolto || inLettura}
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

type StatoRisposte = {
  /** Only the last message's buttons answer, while Alfire is not busy; old ones show the answer. */
  attive: boolean
  /** The last message's: shown even while they wait (Alfire busy, a dictation). */
  correnti: boolean
  /** The user's next message, to show which option it was. */
  seguente: UIMessage | undefined
  rispondi: (opzione: string) => void
}

function Messaggio({
  messaggio,
  approva,
  chiudi,
  proposte,
}: {
  messaggio: UIMessage
  approva: Chat['addToolApprovalResponse']
  chiudi: () => void
  proposte: StatoRisposte
}) {
  if (messaggio.role === 'user') {
    const testo = testoDelMessaggio(messaggio)
    return (
      <div className="flex flex-col items-end gap-2">
        {/* the files as chips, never the text read from them */}
        <AllegatiInviati allegati={allegatiDelMessaggio(messaggio)} />
        {testo ? (
          <p className="max-w-[85%] rounded-xl bg-primary/20 px-3 py-2 text-sm whitespace-pre-wrap" data-testid="alfire-mio-messaggio">
            {testo}
          </p>
        ) : null}
      </div>
    )
  }

  // a card waiting for its tap comes first: the options wait for it (Alfire should never mix them)
  const schedaInAttesa = messaggio.parts.some((p) => isToolUIPart(p) && p.state === 'approval-requested')
  const risposte = schedaInAttesa ? { ...proposte, attive: false } : proposte

  return (
    <div className="space-y-2">
      {messaggio.parts.map((p, i) => {
        if (p.type === 'text') {
          return p.text.trim() ? <Markdown key={i} testo={p.text} chiudi={chiudi} /> : null
        }
        if (!isToolUIPart(p)) return null
        const nome = getToolName(p)
        if (isProposta(p)) return <Proposte key={p.toolCallId} parte={p} messaggio={messaggio} stato={risposte} />
        if (isScrittura(nome)) return <SchedaScrittura key={p.toolCallId} parte={p} nome={nome} approva={approva} chiudi={chiudi} />
        return <StatoLettura key={p.toolCallId} nome={nome} stato={p.state} />
      })}
    </div>
  )
}

/** Alfire's options under its message: nothing while they stream in, nothing if the call was malformed. */
function Proposte({ parte, messaggio, stato }: { parte: ParteStrumento; messaggio: UIMessage; stato: StatoRisposte }) {
  if (parte.state === 'input-streaming' || parte.state === 'output-error') return null
  const proposte = leggiProposte(parte.input)
  if (!proposte) return null
  return (
    <RisposteProposte
      proposte={proposte}
      domanda={domandaNonDetta(messaggio, proposte)}
      attive={stato.attive}
      correnti={stato.correnti}
      scelta={rispostaScelta(stato.seguente, proposte.opzioni)}
      rispondi={stato.rispondi}
    />
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

/** Said by the card when the database could not be read at all. */
const ANTEPRIMA_NON_LETTA: Anteprima = {
  righe: ['Non riesco a leggere i dati attuali: controlla bene prima di confermare.'],
  incompleta: true,
}

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
  const input = useMemo(() => (parte.input ?? {}) as Record<string, unknown>, [parte.input])
  const approvazione =
    'approval' in parte
      ? (parte.approval as { id: string; isAutomatic?: boolean; reason?: string; approved?: boolean } | undefined)
      : undefined
  const daConfermare = parte.state === 'approval-requested' && Boolean(approvazione) && !approvazione?.isAutomatic

  // what the database says before the tap: the real row, before → after, what goes with it
  const [anteprima, setAnteprima] = useState<Anteprima | null>(null)
  const chiesta = useRef(false)
  const rifiutata = useRef(false)
  useEffect(() => {
    if (!daConfermare || chiesta.current) return
    chiesta.current = true
    anteprimaAlfire(nome, input)
      .then(setAnteprima)
      .catch(() => setAnteprima(ANTEPRIMA_NON_LETTA))
  }, [daConfermare, nome, input])

  // a target not found or not unique: the model gets the reason and asks the user which one
  const erroreAnteprima = anteprima && 'errore' in anteprima ? anteprima.errore : null
  useEffect(() => {
    if (!erroreAnteprima || !daConfermare || !approvazione || rifiutata.current) return
    rifiutata.current = true
    void approva({ id: approvazione.id, approved: false, reason: erroreAnteprima })
  }, [erroreAnteprima, daConfermare, approvazione, approva])

  if (parte.state === 'input-streaming') {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
        Preparo l’operazione…
      </p>
    )
  }
  const riassunto = riassuntoScrittura(nome, input)
  const letta = anteprima && !('errore' in anteprima) ? anteprima : null
  const titolo = letta?.titolo ?? riassunto.titolo
  const dettagli = letta?.sostituisceDettagli ? [] : riassunto.dettagli
  const distruttiva = azioneDistruttiva(nome, input)
  const output = parte.state === 'output-available' ? (parte.output as { fatto?: boolean; errore?: string; link?: string }) : null
  // a deletion never goes without its consequences on screen
  const inAttesa = daConfermare && (!anteprima || Boolean(erroreAnteprima) || (Boolean(distruttiva) && Boolean(letta?.incompleta)))

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-3" data-testid="alfire-conferma">
      <div className="space-y-1">
        <p className="text-sm font-medium">{titolo}</p>
        {dettagli.length > 0 ? (
          // notes are shown whole, with their line breaks
          <ul className="space-y-0.5 text-sm break-words whitespace-pre-line text-muted-foreground">
            {dettagli.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        ) : null}
        {letta && letta.righe.length > 0 ? (
          <ul className="space-y-0.5 text-sm break-words whitespace-pre-line" data-testid="alfire-anteprima">
            {letta.righe.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        ) : daConfermare && !anteprima ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            Controllo i dati…
          </p>
        ) : null}
      </div>

      {parte.state === 'approval-requested' && approvazione && !approvazione.isAutomatic && !erroreAnteprima ? (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={() => void approva({ id: approvazione.id, approved: false })}>
            Annulla
          </Button>
          <Button
            type="button"
            variant={distruttiva ? 'destructive' : 'default'}
            className="h-11"
            disabled={inAttesa}
            onClick={() => void approva({ id: approvazione.id, approved: true })}
          >
            {distruttiva ?? 'Conferma'}
          </Button>
        </div>
      ) : parte.state === 'approval-responded' && approvazione?.approved === false ? (
        <p className="text-sm text-muted-foreground">{approvazione.reason ? 'Serve una precisazione: te la chiedo.' : 'Annullato: non ho scritto niente.'}</p>
      ) : parte.state === 'approval-responded' || parte.state === 'input-available' ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          Lo faccio…
        </p>
      ) : parte.state === 'output-denied' ? (
        approvazione?.reason ? (
          <p className="flex items-start gap-1.5 text-sm text-status-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            Non l’ho fatto: {approvazione.reason}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">Annullato: non ho scritto niente.</p>
        )
      ) : erroreAnteprima && daConfermare ? (
        <p className="flex items-start gap-1.5 text-sm text-status-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Non l’ho fatto: {erroreAnteprima}
        </p>
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
