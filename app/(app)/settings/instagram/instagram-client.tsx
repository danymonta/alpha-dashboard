'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { CircleCheck, KeyRound, LoaderCircle, Plus, RefreshCw, TriangleAlert } from 'lucide-react'
import { useId, useRef, useState, useTransition, type FormEvent } from 'react'
import { Controller, useForm } from 'react-hook-form'
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
import { useLingua } from '@/components/i18n/lingua-provider'
import { ErroreCampo } from '@/components/form/errore-campo'
import { CLASSE_SELECT, ErroreModulo } from '@/components/form/foglio-modifica'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formato } from '@/lib/format'
import { traduciImpostazioni } from '@/lib/i18n/testi/impostazioni'
import { giornoEstesoIn, INSTAGRAM_IMPOSTAZIONI } from '@/lib/i18n/testi/instagram-impostazioni'
import { SHELL } from '@/lib/i18n/testi/shell'

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
  const lingua = useLingua()
  const t = INSTAGRAM_IMPOSTAZIONI[lingua].token
  const { formatData } = formato(lingua)

  function invia(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const incollato = campo.current?.value ?? ''
    // out of the DOM right away, whatever the outcome: pasting again is one gesture
    if (campo.current) campo.current.value = ''
    setErrore(null)
    if (!incollato.trim()) {
      setErrore(t.incolla)
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
        setErrore(SHELL[lingua].connessione)
        return
      }
      if (!esito.ok) {
        setErrore(traduciImpostazioni(esito.errore, lingua))
        return
      }
      toast.success(t.salvato(esito.scade_il ? formatData(esito.scade_il) : null))
    })
  }

  return (
    <div className="space-y-3">
      {presente && !scaduto ? (
        <p role="status" className="flex items-start gap-2 text-sm" data-testid="instagram-token-salvato">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
          {t.salvato(scadeIl ? formatData(scadeIl) : null)}
        </p>
      ) : null}
      <form onSubmit={invia} noValidate className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-token`}>{presente ? t.nuovo : t.accesso}</Label>
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
            placeholder={presente ? t.sostituisci : t.incollaQui}
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
            {t.salva}
          </Button>
          {presente ? (
            <div className="sm:w-auto">
              <Elimina
                cosa={t.cosa}
                fatto={t.tolto}
                etichetta={t.togli}
                azione={togliTokenInstagram}
                conseguenze={[...t.conseguenze]}
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
  const lingua = useLingua()
  const t = INSTAGRAM_IMPOSTAZIONI[lingua].setter
  const salvato = setterId ?? ''
  const sceltoNonAttivo = persone.find((p) => p.id === valore && !p.attivo)

  function salva(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrore(null)
    const input = { setter_id: valore || null }
    const parsed = setterInstagramSchema.safeParse(input)
    if (!parsed.success) {
      setErrore(traduciImpostazioni(parsed.error.issues[0]?.message ?? 'Scelta non valida.', lingua))
      return
    }
    avvia(async () => {
      let esito
      try {
        esito = await scegliSetterInstagram(parsed.data)
      } catch {
        setErrore(SHELL[lingua].connessione)
        return
      }
      if (!esito.ok) {
        setErrore(traduciImpostazioni(esito.errore, lingua))
        return
      }
      const nome = persone.find((p) => p.id === parsed.data.setter_id)?.nome
      toast.success(nome ? t.lavora(nome) : t.nessunoLavora)
    })
  }

  return (
    <form onSubmit={salva} noValidate className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-setter`}>{t.setter}</Label>
        <select
          id={`${id}-setter`}
          className={CLASSE_SELECT}
          value={valore}
          onChange={(e) => setValore(e.currentTarget.value)}
          aria-describedby={sceltoNonAttivo ? `${id}-avviso` : undefined}
        >
          <option value="">{t.nessuno}</option>
          {persone.map((p) => (
            <option key={p.id} value={p.id} disabled={!p.attivo}>
              {p.attivo ? p.nome : t.nonAttivo(p.nome)}
            </option>
          ))}
        </select>
      </div>
      {sceltoNonAttivo ? (
        <p id={`${id}-avviso`} className="flex items-start gap-2 text-sm text-status-warning">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t.avviso(sceltoNonAttivo.nome)}
        </p>
      ) : null}
      <ErroreModulo testo={errore} />
      <Button type="submit" className="h-11 w-full sm:w-auto" disabled={inCorso || valore === salvato}>
        {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
        {t.salva}
      </Button>
    </form>
  )
}

/** One excluded account, with the trash that asks first. */
export function RigaEsclusione({ username, motivo }: { username: string; motivo: string | null }) {
  const t = INSTAGRAM_IMPOSTAZIONI[useLingua()].esclusione
  return (
    <li className="flex items-center gap-2 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium break-all">@{username}</p>
        {motivo ? <p className="text-sm break-words text-muted-foreground">{motivo}</p> : null}
      </div>
      <Elimina
        variante="icona"
        cosa={t.cosa(username)}
        fatto={t.nonPiu(username)}
        azione={() => eliminaEsclusioneInstagram({ username })}
        conseguenze={[t.conseguenza]}
      />
    </li>
  )
}

/**
 * «Cancella anche i suoi messaggi già salvati nell’Insight» (1.35.0, D16):
 * checked by default in both exclusion forms. The whole row is the 44px target.
 */
export function CasellaCancellaMessaggi({
  checked,
  onCheckedChange,
  disabled,
}: {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  disabled?: boolean
}) {
  const etichetta = INSTAGRAM_IMPOSTAZIONI[useLingua()].esclusione.cancellaMessaggi
  return (
    <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(v === true)}
        aria-label={etichetta}
        className="size-5"
        disabled={disabled}
      />
      <span aria-hidden="true">{etichetta}</span>
    </label>
  )
}

/** A new account whose chats never count, and never reach the Insight. */
export function NuovaEsclusione() {
  const [errore, setErrore] = useState<string | null>(null)
  const id = useId()
  const lingua = useLingua()
  const t = INSTAGRAM_IMPOSTAZIONI[lingua].esclusione
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<EsclusioneInput, unknown, Esclusione>({
    resolver: zodResolver(esclusioneSchema),
    defaultValues: { username: '', motivo: '', cancella_messaggi: true },
  })

  const invia = handleSubmit(async (valori) => {
    setErrore(null)
    let esito
    try {
      esito = await aggiungiEsclusioneInstagram(valori)
    } catch {
      setErrore(SHELL[lingua].connessione)
      return
    }
    if (!esito.ok) {
      setErrore(traduciImpostazioni(esito.errore, lingua))
      return
    }
    toast.success(esito.cancellati ? t.cancellati : t.esclusa(valori.username))
    if (esito.avviso) toast.warning(traduciImpostazioni(esito.avviso, lingua))
    // explicit: after a submit through the resolver the form may hold its output (motivo null)
    reset({ username: '', motivo: '', cancella_messaggi: true })
  })

  const erroreUsername = traduciImpostazioni(errors.username?.message, lingua)
  const erroreMotivo = traduciImpostazioni(errors.motivo?.message, lingua)

  return (
    <form onSubmit={invia} noValidate className="space-y-3 border-t border-border pt-3" aria-label={t.form}>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-username`}>{t.username}</Label>
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
              placeholder={t.esempioUsername}
              aria-invalid={erroreUsername ? true : undefined}
              aria-describedby={erroreUsername ? `${id}-errore-username` : undefined}
              className="h-11 pl-7"
              {...register('username')}
            />
          </div>
          <ErroreCampo id={`${id}-errore-username`} messaggio={erroreUsername} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-motivo`}>{t.motivo}</Label>
          <Input
            id={`${id}-motivo`}
            maxLength={MOTIVO_ESCLUSIONE_MAX}
            placeholder={t.esempioMotivo}
            aria-invalid={erroreMotivo ? true : undefined}
            aria-describedby={erroreMotivo ? `${id}-errore-motivo` : undefined}
            className="h-11"
            {...register('motivo')}
          />
          <ErroreCampo id={`${id}-errore-motivo`} messaggio={erroreMotivo} />
        </div>
      </div>
      <Controller
        control={control}
        name="cancella_messaggi"
        render={({ field }) => (
          <CasellaCancellaMessaggi
            checked={field.value !== false}
            onCheckedChange={field.onChange}
            disabled={isSubmitting}
          />
        )}
      />
      <ErroreModulo testo={errore} />
      <Button type="submit" variant="outline" className="h-11 w-full sm:w-auto" disabled={isSubmitting}>
        {isSubmitting ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Plus className="size-4" aria-hidden="true" />
        )}
        {t.escludi}
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
  const lingua = useLingua()
  const t = INSTAGRAM_IMPOSTAZIONI[lingua].ricalcolo

  function ricalcola() {
    setEsito(null)
    avvia(async () => {
      try {
        setEsito(await ricalcolaReportInstagram(ieri))
      } catch {
        setEsito({ ok: false, errore: SHELL[lingua].connessione })
      }
    })
  }

  const chi = setterNome ?? t.ilSetter

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
        {t.bottone}
      </Button>
      {nonPronto ? <p className="text-sm text-muted-foreground">{nonPronto}</p> : null}
      <div aria-live="polite" className="text-sm">
        {inCorso ? (
          <p className="text-muted-foreground">{t.leggo(giornoEstesoIn(ieri, lingua))}</p>
        ) : esito === null ? null : esito.ok ? (
          <p className="flex items-start gap-2" data-testid="instagram-ricalcolo-esito">
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
            {esito.gia_decisa
              ? t.giaDecisa(giornoEstesoIn(esito.giorno, lingua), esito.chat_lette, esito.chat_incerte)
              : t.ricalcolata(giornoEstesoIn(esito.giorno, lingua), chi, esito.chat_lette, esito.chat_incerte)}
          </p>
        ) : (
          <p role="alert" className="flex items-start gap-2 text-status-critical" data-testid="instagram-ricalcolo-esito">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {traduciImpostazioni(esito.errore, lingua)}
          </p>
        )}
      </div>
    </div>
  )
}
