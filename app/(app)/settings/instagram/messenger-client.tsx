'use client'

import { KeyRound, LoaderCircle, Plus, TriangleAlert } from 'lucide-react'
import { useId, useRef, useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'

import {
  escludiChatMessenger,
  salvaTokenMessenger,
  togliEsclusioneMessenger,
  togliTokenMessenger,
} from '@/app/(app)/settings/instagram/actions'
import { CasellaCancellaMessaggi } from '@/app/(app)/settings/instagram/instagram-client'
import { Elimina } from '@/components/form/elimina'
import { ErroreCampo } from '@/components/form/errore-campo'
import { CLASSE_SELECT, ErroreModulo } from '@/components/form/foglio-modifica'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { esclusioneMessengerSchema, MOTIVO_ESCLUSIONE_MAX } from '@/lib/validation/insight'

const CONNESSIONE = 'Connessione assente. Riprova.'

/**
 * The Page token for the Messenger chats of the Insight (1.35.0), the pattern
 * of the Instagram token: uncontrolled on purpose, no `name`, no `value`,
 * emptied at every try, sent inside a FormData. The action proves it on Meta
 * before saving and answers with the Page's name only.
 */
export function TokenMessenger({ presente }: { presente: boolean }) {
  const campo = useRef<HTMLInputElement>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()
  const id = useId()

  function invia(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const incollato = campo.current?.value ?? ''
    // out of the DOM right away, whatever the outcome
    if (campo.current) campo.current.value = ''
    setErrore(null)
    if (!incollato.trim()) {
      setErrore('Incolla il token della Pagina copiato da Meta.')
      return
    }
    // in a FormData, never as a plain argument: the dev server logs those whole
    const dati = new FormData()
    dati.set('token', incollato)
    avvia(async () => {
      let esito
      try {
        esito = await salvaTokenMessenger(dati)
      } catch {
        setErrore(CONNESSIONE)
        return
      }
      if (!esito.ok) {
        setErrore(esito.errore)
        return
      }
      toast.success(
        esito.pagina
          ? `Pagina «${esito.pagina}» collegata: le chat Messenger arrivano nell’Insight dal prossimo recap.`
          : 'Pagina collegata: le chat Messenger arrivano nell’Insight dal prossimo recap.',
      )
    })
  }

  return (
    <form onSubmit={invia} noValidate className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-token`}>Token della Pagina</Label>
        {/* no name: password managers do not take it for a login */}
        <Input
          ref={campo}
          id={`${id}-token`}
          type="password"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          data-1p-ignore="true"
          data-lpignore="true"
          aria-describedby={errore ? `${id}-errore` : undefined}
          placeholder={presente ? 'Incolla qui per sostituirlo' : 'Incolla qui il token della Pagina'}
          className="h-11"
        />
      </div>
      {errore ? (
        <p id={`${id}-errore`} role="alert" className="flex items-start gap-2 text-sm text-status-critical">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {errore}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" className="h-11 sm:w-auto" disabled={inCorso}>
          {inCorso ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <KeyRound className="size-4" aria-hidden="true" />
          )}
          {inCorso ? 'Provo il token…' : 'Collega la Pagina'}
        </Button>
        {presente ? (
          <div className="sm:w-auto">
            <Elimina
              cosa="il token della Pagina"
              fatto="Token della Pagina tolto"
              etichetta="Togli il token"
              azione={togliTokenMessenger}
              conseguenze={[
                'Le chat Messenger non arrivano più nell’Insight finché non incolli un token nuovo.',
                'Le chat Messenger escluse restano come sono.',
              ]}
              disabilitato={inCorso}
            />
          </div>
        ) : null}
      </div>
    </form>
  )
}

/** One excluded Messenger chat, with the trash that asks first. */
export function RigaEsclusioneMessenger({
  utenteId,
  nome,
  motivo,
}: {
  utenteId: string
  nome: string
  motivo: string | null
}) {
  return (
    <li className="flex items-center gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium break-words">{nome}</p>
        {motivo ? <p className="text-sm break-words text-muted-foreground">{motivo}</p> : null}
      </div>
      <Elimina
        variante="icona"
        cosa={`l’esclusione di ${nome}`}
        fatto={`${nome} non è più esclusa`}
        azione={() => togliEsclusioneMessenger({ utente_id: utenteId })}
        conseguenze={['La sua chat torna nell’Insight dal recap dopo.']}
      />
    </li>
  )
}

export type ChatMessenger = { utente_id: string; nome: string }

/**
 * «Escludi una chat» of Messenger: picked from the latest chats with a name
 * the Insight has read (insight_chat_messenger, the admin only), never typed:
 * a Messenger chat is a PSID, not a username.
 */
export function NuovaEsclusioneMessenger({ chat }: { chat: ChatMessenger[] }) {
  const [scelta, setScelta] = useState('')
  const [motivo, setMotivo] = useState('')
  const [cancella, setCancella] = useState(true)
  const [errore, setErrore] = useState<string | null>(null)
  const [erroreChat, setErroreChat] = useState<string | null>(null)
  const [erroreMotivo, setErroreMotivo] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()
  const id = useId()

  if (chat.length === 0) {
    return (
      // where the form would be, under the list: a line, not a second empty box
      <p className="border-t border-border pt-3 text-sm text-muted-foreground">
        Nessuna chat Messenger da escludere: le chat compaiono qui dopo il primo recap con la Pagina collegata.
      </p>
    )
  }

  function invia(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrore(null)
    setErroreChat(null)
    setErroreMotivo(null)
    const nome = chat.find((c) => c.utente_id === scelta)?.nome ?? ''
    const parsed = esclusioneMessengerSchema.safeParse({
      utente_id: scelta,
      nome,
      motivo,
      cancella_messaggi: cancella,
    })
    if (!parsed.success) {
      for (const problema of parsed.error.issues) {
        if (problema.path[0] === 'motivo') setErroreMotivo(problema.message)
        else setErroreChat(problema.message)
      }
      return
    }
    avvia(async () => {
      let esito
      try {
        esito = await escludiChatMessenger(parsed.data)
      } catch {
        setErrore(CONNESSIONE)
        return
      }
      if (!esito.ok) {
        setErrore(esito.errore)
        return
      }
      toast.success(esito.cancellati ? 'Chat esclusa e messaggi cancellati.' : `${parsed.data.nome} esclusa dall’Insight`)
      if (esito.avviso) toast.warning(esito.avviso)
      setScelta('')
      setMotivo('')
      setCancella(true)
    })
  }

  return (
    <form onSubmit={invia} noValidate className="space-y-3 border-t border-border pt-3" aria-label="Escludi una chat Messenger">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-chat`}>Chat</Label>
          <select
            id={`${id}-chat`}
            className={CLASSE_SELECT}
            value={scelta}
            onChange={(e) => setScelta(e.currentTarget.value)}
            aria-invalid={erroreChat ? true : undefined}
            aria-describedby={erroreChat ? `${id}-errore-chat` : undefined}
          >
            <option value="">Scegli una chat</option>
            {chat.map((c) => (
              <option key={c.utente_id} value={c.utente_id}>
                {c.nome}
              </option>
            ))}
          </select>
          <ErroreCampo id={`${id}-errore-chat`} messaggio={erroreChat ?? undefined} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-motivo`}>Motivo (facoltativo)</Label>
          <Input
            id={`${id}-motivo`}
            maxLength={MOTIVO_ESCLUSIONE_MAX}
            placeholder="Es. cliente, amico, account del team"
            value={motivo}
            onChange={(e) => setMotivo(e.currentTarget.value)}
            aria-invalid={erroreMotivo ? true : undefined}
            aria-describedby={erroreMotivo ? `${id}-errore-motivo` : undefined}
            className="h-11"
          />
          <ErroreCampo id={`${id}-errore-motivo`} messaggio={erroreMotivo ?? undefined} />
        </div>
      </div>
      <CasellaCancellaMessaggi checked={cancella} onCheckedChange={setCancella} disabled={inCorso} />
      <ErroreModulo testo={errore} />
      <Button type="submit" variant="outline" className="h-11 w-full sm:w-auto" disabled={inCorso}>
        {inCorso ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Plus className="size-4" aria-hidden="true" />
        )}
        Escludi la chat
      </Button>
    </form>
  )
}
