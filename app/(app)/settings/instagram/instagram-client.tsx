'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { CircleCheck, KeyRound, LoaderCircle, Plus, RefreshCw, TriangleAlert } from 'lucide-react'
import { useId, useRef, useState, useTransition, type FormEvent } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'

import {
  aggiungiEsclusioneInstagram,
  eliminaEsclusioneInstagram,
  salvaTokenInstagram,
  scegliSetterInstagram,
  togliTokenInstagram,
} from '@/app/(app)/settings/instagram/actions'
import {
  esclusioneSchema,
  MOTIVO_ESCLUSIONE_MAX,
  setterInstagramSchema,
  type Esclusione,
  type EsclusioneInput,
} from '@/app/(app)/settings/instagram/schema'
import { ricalcolaReportInstagram, type EsitoRicalcolo } from '@/app/actions/report-instagram'
import { Elimina } from '@/components/form/elimina'
import { ErroreCampo } from '@/components/form/errore-campo'
import { CLASSE_SELECT, ErroreModulo } from '@/components/form/foglio-modifica'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { giornoEsteso } from '@/lib/date'
import { formatData } from '@/lib/format'

const CONNESSIONE = 'Connessione assente. Riprova.'

/**
 * The token field (Dany, 08/10/2026). Uncontrolled on purpose: React never
 * writes the value into an attribute, the field is emptied after every try,
 * and the answer of the server action carries the expiry day only. Never
 * prefilled, never shown.
 */
export function TokenInstagram({
  presente,
  scaduto,
  scadeIl,
}: {
  presente: boolean
  scaduto: boolean
  /** expiry day in Rome, 'YYYY-MM-DD' */
  scadeIl: string | null
}) {
  const campo = useRef<HTMLInputElement>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()
  const id = useId()

  function invia(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const incollato = campo.current?.value ?? ''
    // out of the DOM right away, whatever the outcome: pasting again is one gesture
    if (campo.current) campo.current.value = ''
    setErrore(null)
    if (!incollato.trim()) {
      setErrore('Incolla il token copiato dal pannello Meta.')
      return
    }
    // in a FormData, never as a plain argument: the dev server logs those whole
    const dati = new FormData()
    dati.set('token', incollato)
    avvia(async () => {
      let esito
      try {
        esito = await salvaTokenInstagram(dati)
      } catch {
        setErrore(CONNESSIONE)
        return
      }
      if (!esito.ok) {
        setErrore(esito.errore)
        return
      }
      toast.success(esito.scade_il ? `Token salvato, scade il ${formatData(esito.scade_il)}` : 'Token salvato')
    })
  }

  return (
    <div className="space-y-3">
      {presente && !scaduto ? (
        <p role="status" className="flex items-start gap-2 text-sm" data-testid="instagram-token-salvato">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
          {scadeIl ? `Token salvato, scade il ${formatData(scadeIl)}` : 'Token salvato'}
        </p>
      ) : null}
      <form onSubmit={invia} noValidate className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-token`}>{presente ? 'Token nuovo' : 'Token di accesso'}</Label>
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
            placeholder={presente ? 'Incolla qui per sostituirlo' : 'Incolla qui il token'}
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
            Salva il token
          </Button>
          {presente ? (
            <div className="sm:w-auto">
              <Elimina
                cosa="il token di Instagram"
                fatto="Token tolto"
                etichetta="Togli il token"
                azione={togliTokenInstagram}
                conseguenze={[
                  'La proposta di ogni notte si ferma finché non incolli un token nuovo, e con lei la lettura dei post per il calendario dei contenuti.',
                  'Chi lavora i DM e le chat escluse restano come sono.',
                ]}
                disabilitato={inCorso}
              />
            </div>
          ) : null}
        </div>
      </form>
    </div>
  )
}

type Persona = { id: string; nome: string; attivo: boolean }

/** Who works the DMs: the nightly proposals go to him, and only he sees them. */
export function SceltaSetterInstagram({ setterId, persone }: { setterId: string | null; persone: Persona[] }) {
  const [valore, setValore] = useState(setterId ?? '')
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()
  const id = useId()
  const salvato = setterId ?? ''
  const sceltoNonAttivo = persone.find((p) => p.id === valore && !p.attivo)

  function salva(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrore(null)
    const input = { setter_id: valore || null }
    const parsed = setterInstagramSchema.safeParse(input)
    if (!parsed.success) {
      setErrore(parsed.error.issues[0]?.message ?? 'Scelta non valida.')
      return
    }
    avvia(async () => {
      let esito
      try {
        esito = await scegliSetterInstagram(parsed.data)
      } catch {
        setErrore(CONNESSIONE)
        return
      }
      if (!esito.ok) {
        setErrore(esito.errore)
        return
      }
      const nome = persone.find((p) => p.id === parsed.data.setter_id)?.nome
      toast.success(nome ? `I DM di Instagram li lavora ${nome}` : 'Nessuno lavora i DM: la proposta si ferma')
    })
  }

  return (
    <form onSubmit={salva} noValidate className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-setter`}>Setter</Label>
        <select
          id={`${id}-setter`}
          className={CLASSE_SELECT}
          value={valore}
          onChange={(e) => setValore(e.currentTarget.value)}
          aria-describedby={sceltoNonAttivo ? `${id}-avviso` : undefined}
        >
          <option value="">Nessuno: la proposta si ferma</option>
          {persone.map((p) => (
            <option key={p.id} value={p.id} disabled={!p.attivo}>
              {p.attivo ? p.nome : `${p.nome} (non è più un setter attivo)`}
            </option>
          ))}
        </select>
      </div>
      {sceltoNonAttivo ? (
        <p id={`${id}-avviso`} className="flex items-start gap-2 text-sm text-status-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {sceltoNonAttivo.nome} non è più un setter attivo: la proposta non parte finché non scegli un altro setter.
        </p>
      ) : null}
      <ErroreModulo testo={errore} />
      <Button type="submit" className="h-11 w-full sm:w-auto" disabled={inCorso || valore === salvato}>
        {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
        Salva la scelta
      </Button>
    </form>
  )
}

/** One excluded account, with the trash that asks first. */
export function RigaEsclusione({ username, motivo }: { username: string; motivo: string | null }) {
  return (
    <li className="flex items-center gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium break-all">@{username}</p>
        {motivo ? <p className="text-sm break-words text-muted-foreground">{motivo}</p> : null}
      </div>
      <Elimina
        variante="icona"
        cosa={`l’esclusione di @${username}`}
        fatto={`@${username} non è più esclusa`}
        azione={() => eliminaEsclusioneInstagram({ username })}
        conseguenze={['Le sue chat tornano a contare nella proposta, dalla notte dopo.']}
      />
    </li>
  )
}

/** A new account whose chats never count. */
export function NuovaEsclusione() {
  const [errore, setErrore] = useState<string | null>(null)
  const id = useId()
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EsclusioneInput, unknown, Esclusione>({
    resolver: zodResolver(esclusioneSchema),
    defaultValues: { username: '', motivo: '' },
  })

  const invia = handleSubmit(async (valori) => {
    setErrore(null)
    let esito
    try {
      esito = await aggiungiEsclusioneInstagram(valori)
    } catch {
      setErrore(CONNESSIONE)
      return
    }
    if (!esito.ok) {
      setErrore(esito.errore)
      return
    }
    toast.success(`@${valori.username} esclusa: le sue chat non contano`)
    // explicit: after a submit through the resolver the form may hold its output (motivo null)
    reset({ username: '', motivo: '' })
  })

  const erroreUsername = errors.username?.message
  const erroreMotivo = errors.motivo?.message

  return (
    <form onSubmit={invia} noValidate className="space-y-3 border-t border-border pt-3" aria-label="Escludi una chat">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-username`}>Username</Label>
          <div className="relative">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground"
            >
              @
            </span>
            <Input
              id={`${id}-username`}
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="nome.utente"
              aria-invalid={erroreUsername ? true : undefined}
              aria-describedby={erroreUsername ? `${id}-errore-username` : undefined}
              className="h-11 pl-7"
              {...register('username')}
            />
          </div>
          <ErroreCampo id={`${id}-errore-username`} messaggio={erroreUsername} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-motivo`}>Motivo (facoltativo)</Label>
          <Input
            id={`${id}-motivo`}
            maxLength={MOTIVO_ESCLUSIONE_MAX}
            placeholder="Es. cliente, amico, account del team"
            aria-invalid={erroreMotivo ? true : undefined}
            aria-describedby={erroreMotivo ? `${id}-errore-motivo` : undefined}
            className="h-11"
            {...register('motivo')}
          />
          <ErroreCampo id={`${id}-errore-motivo`} messaggio={erroreMotivo} />
        </div>
      </div>
      <ErroreModulo testo={errore} />
      <Button type="submit" variant="outline" className="h-11 w-full sm:w-auto" disabled={isSubmitting}>
        {isSubmitting ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Plus className="size-4" aria-hidden="true" />
        )}
        Escludi la chat
      </Button>
    </form>
  )
}

/**
 * The same run as the nightly one, on yesterday. Shows the outcome and how
 * many chats were read, never the proposal's numbers: they are on the card,
 * in the setter's "Oggi" and on the "Setter" page.
 */
export function RicalcolaIeri({
  ieri,
  setterNome,
  nonPronto,
}: {
  ieri: string
  setterNome: string | null
  /** why it cannot start yet (no token, nobody chosen), or null */
  nonPronto: string | null
}) {
  const [esito, setEsito] = useState<EsitoRicalcolo | null>(null)
  const [inCorso, avvia] = useTransition()

  function ricalcola() {
    setEsito(null)
    avvia(async () => {
      try {
        setEsito(await ricalcolaReportInstagram(ieri))
      } catch {
        setEsito({ ok: false, errore: CONNESSIONE })
      }
    })
  }

  const lette = (n: number) => (n === 1 ? '1 chat letta' : `${n} chat lette`)
  const incerte = (n: number) =>
    n === 0 ? '' : `, ${n === 1 ? '1 letta' : `${n} lette`} solo in parte (Instagram dà gli ultimi 20 messaggi di ogni chat)`
  const chi = setterNome ?? 'il setter'

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        className="h-11 w-full sm:w-auto"
        disabled={inCorso || nonPronto !== null}
        onClick={ricalcola}
      >
        {inCorso ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="size-4" aria-hidden="true" />
        )}
        Ricalcola ieri
      </Button>
      {nonPronto ? <p className="text-sm text-muted-foreground">{nonPronto}</p> : null}
      <div aria-live="polite" className="text-sm">
        {inCorso ? (
          <p className="text-muted-foreground">Leggo i DM di {giornoEsteso(ieri)}: può volerci qualche minuto.</p>
        ) : esito === null ? null : esito.ok ? (
          <p className="flex items-start gap-2" data-testid="instagram-ricalcolo-esito">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
            {esito.gia_decisa
              ? `La proposta di ${giornoEsteso(esito.giorno)} era già stata confermata o scartata: resta com’è. ${lette(esito.chat_lette)}${incerte(esito.chat_incerte)}.`
              : `Proposta di ${giornoEsteso(esito.giorno)} ricalcolata per ${chi}: ${lette(esito.chat_lette)}${incerte(esito.chat_incerte)}.`}
          </p>
        ) : (
          <p role="alert" className="flex items-start gap-2 text-status-critical" data-testid="instagram-ricalcolo-esito">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {esito.errore}
          </p>
        )}
      </div>
    </div>
  )
}
