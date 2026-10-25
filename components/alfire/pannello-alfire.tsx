'use client'

import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport, getToolName, isToolUIPart, type UIMessage } from 'ai'
import { ArrowUp, Check, LoaderCircle, Mic, Paperclip, RotateCcw, Square, TriangleAlert, X } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { rivalidaTutto } from '@/app/actions/rivalida'
import { CHIAVE_LEGGI } from '@/components/alfire/alfire'
import { AllegatiInAttesa, AllegatiInviati, useAllegati } from '@/components/alfire/allegati'
import { Fiamma } from '@/components/alfire/fiamma'
import { Markdown } from '@/components/alfire/markdown'
import { RisposteProposte } from '@/components/alfire/proposte'
import { useRegistratore } from '@/components/alfire/use-registratore'
import { useLingua } from '@/components/i18n/lingua-provider'
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
import { azioneDistruttiva, motivoAlModello, motivoPerLaPersona, riassuntoScrittura, type Anteprima } from '@/lib/alfire/riassunto'
import {
  confermeComplete,
  domandaNonDetta,
  isProposta,
  leggiProposte,
  propostaCheRisponde,
  rispostaScelta,
} from '@/lib/alfire/risposte'
import { haEconomics, type AppRole } from '@/lib/auth/roles'
import type { Lingua } from '@/lib/i18n/lingua'
import { ALFIRE, bottoneDistruttivo } from '@/lib/i18n/testi/alfire'
import { cn } from '@/lib/utils'

const SUGGERIMENTI: Record<'admin' | 'setter' | 'closer' | 'altro', string[]> = {
  admin: [
    'Quanto ho incassato questo mese, e quanto è rinnovo?',
    'Chi è in ritardo con i pagamenti?',
    'Com’è andato il setting questo mese?',
    'Come funzionano le provvigioni?',
  ],
  // their own money too, as the app shows it to them (03/10/2026); a reading question in words
  // that never load the write tools on the free plan (tests/alfire-intento.test.ts)
  setter: [
    'Come sto andando questo mese?',
    'A che punto sono i miei clienti con le rate?',
    'Aggiungi 20 DM outbound al report di oggi',
    'Che call ho questa settimana?',
  ],
  closer: ['Che call ho oggi e domani?', 'Cosa mi resta da incassare?', 'Com’è andata la mia settimana?', 'Come registro l’esito di una call?'],
  // the team's own time first (Dany, 03/10/2026: "chiedere ad Alfire di tracciare il tempo"); the reading
  // question without a write verb («registrato» loaded the write tools on the free plan)
  altro: ['Quanto ho lavorato questa settimana?', 'Avvia il timer su un progetto', 'Quali task ho aperti?', 'Come registro il mio tempo?'],
}


/** "{"errore":"..."}" from our routes, or the stream's own message. */
function testoErrore(error: Error | undefined, lingua: Lingua): string {
  if (!error) return ''
  try {
    const dati = JSON.parse(error.message) as { errore?: string }
    if (dati.errore) return dati.errore
  } catch {
    // not JSON: already a sentence
  }
  return error.message && error.message.length < 200 ? error.message : ALFIRE[lingua].nonRispondeErrore
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
 * The chat of Alfire, downloaded only when it is needed (spec 1.33.0 A6: about
 * 354 KB of AI SDK and markdown off every page's first load). AlfireProvider
 * mounts it once, when the browser is idle or at the first sign of intent on the
 * flame, and keeps it mounted while the app is open: the conversation lives here.
 */
export default function PannelloAlfire({
  aperto,
  setAperto,
  configurata,
  ruolo,
  nome,
}: {
  aperto: boolean
  setAperto: (aperto: boolean) => void
  configurata: boolean
  ruolo: AppRole
  nome: string
}) {
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
    <Sheet open={aperto} onOpenChange={setAperto}>
      <SheetContent
        side="right"
        className="gap-0 p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-md"
        data-testid="alfire"
      >
        <Pannello chat={chat} configurata={configurata} ruolo={ruolo} nome={nome} chiudi={() => setAperto(false)} />
      </SheetContent>
    </Sheet>
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
        // the write came from Alfire's route, where revalidatePath does not reach the
        // browser: one redraw and every cached page emptied (spec 1.33.0 R3), never
        // router.refresh(), which clears the current page only
        if ((p.output as { fatto?: boolean })?.fatto) void rivalidaTutto().catch(() => {})
      }
    }
  }, [messages])

  const lingua = useLingua()
  const t = ALFIRE[lingua]
  const economics = haEconomics(ruolo)
  const suggerimenti = SUGGERIMENTI[ruolo === 'admin' || ruolo === 'setter' || ruolo === 'closer' ? ruolo : 'altro']

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SheetHeader className="flex-row items-center gap-3 border-b border-border pr-14">
        <Fiamma className="size-8" accesa />
        <div className="min-w-0 flex-1">
          <SheetTitle>Alfire</SheetTitle>
          <SheetDescription>
            {economics ? t.descrizioneEconomics : t.descrizioneAltro}
          </SheetDescription>
        </div>
        {messages.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-11 text-muted-foreground"
            aria-label={t.nuovaChat}
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
              {t.ciao(nome.split(' ')[0])}{' '}
              {economics ? t.presentazioneEconomics : t.presentazioneAltro}
            </p>
            <div className="flex flex-col gap-2" role="group" aria-label={t.suggerite}>
              {suggerimenti.map((s) => (
                <button
                  key={s}
                  type="button"
                  // while dictating nothing is sent: the send button waits for the stop too (and for a file being read)
                  disabled={inAscolto || inLettura}
                  onClick={() => invia(s)}
                  // the questions are sent to Alfire as they are, in Italian: Alfire works in Italian
                  lang="it"
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
            {t.ciPensa}
          </p>
        ) : null}

        {rispostaMuta ? (
          // the model read the data and stopped without a word: say it, and offer to go on
          <div role="status" className="space-y-2 rounded-lg bg-muted p-3 text-sm" data-testid="alfire-muta">
            <p className="text-muted-foreground">{t.muta}</p>
            <Button type="button" variant="outline" className="h-11" onClick={() => void regenerate()}>
              {t.riprova}
            </Button>
          </div>
        ) : null}

        {error ? (
          <div role="alert" className="space-y-2 rounded-lg bg-status-critical/10 p-3 text-sm">
            <p className="flex items-start gap-2 text-status-critical">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {testoErrore(error, lingua)}
            </p>
            <Button type="button" variant="outline" className="h-11" onClick={() => void regenerate()}>
              {t.riprova}
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
            <button type="button" aria-label={t.chiudiAvviso} className="p-1" onClick={() => setErroreVoce(null)}>
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
            <button type="button" aria-label={t.chiudiAvviso} className="-my-1 p-1" onClick={() => setErroriAllegati([])}>
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}
        <AllegatiInAttesa file={allegati.file} togli={allegati.togli} />
        {registratore.stato === 'registra' ? (
          <p id="alfire-ascolto" className="mb-2 flex items-center gap-2 text-sm text-status-critical" role="status">
            <span className="size-2 shrink-0 rounded-full bg-status-critical" aria-hidden="true" />
            <span>
              {t.ascolto}
              {registratore.inPausa ? (
                // the partials stopped (a limit, repeated failures): the words are not lost
                <span className="block text-muted-foreground">{t.inPausa}</span>
              ) : null}
            </span>
          </p>
        ) : registratore.stato === 'trascrive' ? (
          <p className="mb-2 flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
            {t.trascrivo}
          </p>
        ) : null}
        <div className="flex items-end gap-2">
          <label htmlFor="alfire-testo" className="sr-only">
            {t.scrivi}
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
            placeholder={configurata ? (inAscolto ? t.inAscolto : t.chiedi) : t.nonAttiva}
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
                aria-label={t.allega}
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
              aria-label={registratore.stato === 'registra' ? t.ferma : t.parla}
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
            <Button type="button" size="icon" className="size-11 shrink-0" aria-label={t.fermaRisposta} onClick={() => stop()}>
              <Square className="size-4" aria-hidden="true" />
            </Button>
          ) : (
            <Button
              type="submit"
              size="icon"
              className="size-11 shrink-0"
              aria-label={t.invia}
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
  const t = ALFIRE[useLingua()]
  return (
    <div className="space-y-2 rounded-xl bg-card p-4 text-sm">
      <p className="font-medium">{t.nonAttiva}</p>
      {admin ? (
        <p className="text-muted-foreground">
          {t.manca} <code className="text-foreground">ALFIRE_API_KEY</code>
          {t.poiDeploy}
        </p>
      ) : (
        <p className="text-muted-foreground">{t.staConfigurando}</p>
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
  const lingua = useLingua()
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
          if (!p.text.trim()) return null
          // Alfire answers in Italian: an English page says so to screen readers
          return lingua === 'it' ? (
            <Markdown key={i} testo={p.text} chiudi={chiudi} />
          ) : (
            <div key={i} lang="it">
              <Markdown testo={p.text} chiudi={chiudi} />
            </div>
          )
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
  const t = ALFIRE[useLingua()]
  const cosa = t.letture[nome] ?? t.iDati
  if (stato === 'output-error') {
    return <p className="text-xs text-status-warning">{t.nonRiuscitaLettura(cosa)}</p>
  }
  const finito = stato === 'output-available'
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      {finito ? (
        <Check className="size-3.5" aria-hidden="true" />
      ) : (
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
      )}
      {finito ? t.hoLetto(cosa) : t.leggo(cosa)}
    </p>
  )
}

type ParteStrumento = Extract<UIMessage['parts'][number], { toolCallId: string }>

/** Said by the card when the database could not be read at all. */
function anteprimaNonLetta(lingua: Lingua): Anteprima {
  return { righe: [ALFIRE[lingua].nonLetti], incompleta: true }
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
  const lingua = useLingua()
  const t = ALFIRE[lingua]
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
      .catch(() => setAnteprima(anteprimaNonLetta(lingua)))
  }, [daConfermare, nome, input, lingua])

  // a target not found or not unique: the model gets the reason (with its hint) and asks the user which one;
  // the card shows the person's words only
  const fermata = anteprima && 'errore' in anteprima ? anteprima : null
  const erroreAnteprima = fermata?.errore ?? null
  const motivo = fermata ? motivoAlModello(fermata) : null
  useEffect(() => {
    if (!motivo || !daConfermare || !approvazione || rifiutata.current) return
    rifiutata.current = true
    void approva({ id: approvazione.id, approved: false, reason: motivo })
  }, [motivo, daConfermare, approvazione, approva])

  if (parte.state === 'input-streaming') {
    return (
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
        {t.preparo}
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
        {/* what Alfire writes on the card stays Italian */}
        <p className="text-sm font-medium" lang="it">
          {titolo}
        </p>
        {dettagli.length > 0 ? (
          // notes are shown whole, with their line breaks
          <ul className="space-y-0.5 text-sm break-words whitespace-pre-line text-muted-foreground" lang="it">
            {dettagli.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        ) : null}
        {letta && letta.righe.length > 0 ? (
          <ul className="space-y-0.5 text-sm break-words whitespace-pre-line" data-testid="alfire-anteprima" lang="it">
            {letta.righe.map((d) => (
              <li key={d}>{d}</li>
            ))}
          </ul>
        ) : daConfermare && !anteprima ? (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground" role="status">
            <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
            {t.controllo}
          </p>
        ) : null}
      </div>

      {parte.state === 'approval-requested' && approvazione && !approvazione.isAutomatic && !erroreAnteprima ? (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={() => void approva({ id: approvazione.id, approved: false })}>
            {t.annulla}
          </Button>
          <Button
            type="button"
            variant={distruttiva ? 'destructive' : 'default'}
            className="h-11"
            disabled={inAttesa}
            onClick={() => void approva({ id: approvazione.id, approved: true })}
          >
            {distruttiva ? bottoneDistruttivo(distruttiva, lingua) : t.conferma}
          </Button>
        </div>
      ) : parte.state === 'approval-responded' && approvazione?.approved === false ? (
        <p className="text-sm text-muted-foreground">{approvazione.reason ? t.precisazione : t.annullato}</p>
      ) : parte.state === 'approval-responded' || parte.state === 'input-available' ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          {t.loFaccio}
        </p>
      ) : parte.state === 'output-denied' ? (
        approvazione?.reason ? (
          <p className="flex items-start gap-1.5 text-sm text-status-warning">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t.nonFatto} <span lang="it">{motivoPerLaPersona(approvazione.reason)}</span>
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">{t.annullato}</p>
        )
      ) : erroreAnteprima && daConfermare ? (
        <p className="flex items-start gap-1.5 text-sm text-status-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t.nonFatto} <span lang="it">{erroreAnteprima}</span>
        </p>
      ) : parte.state === 'output-error' ? (
        <p className="flex items-center gap-1.5 text-sm text-status-critical">
          <TriangleAlert className="size-4" aria-hidden="true" />
          {t.nonRiuscita}
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
            {t.fatto}
          </p>
          {output.link ? (
            <Link href={output.link} onClick={chiudi} className="min-h-11 content-center px-2 text-sm font-medium underline underline-offset-4">
              {t.apri}
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
