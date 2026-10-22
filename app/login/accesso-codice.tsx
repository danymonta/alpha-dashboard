'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { CircleCheck, LoaderCircle, Mail, TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'

import { richiediCodice, verificaCodice } from '@/app/login/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { useLingua } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ACCESSO, traduciAccesso } from '@/lib/i18n/testi/accesso'
import {
  ATTESA_NUOVO_CODICE_S,
  CIFRE_CODICE,
  formCodiceSchema,
  formEmailSchema,
  type FormCodiceInput,
  type FormEmailInput,
} from '@/lib/validation/accesso'

/**
 * Sign-in with a code sent by email, under the Google button. Two steps: the
 * address, then the 6 digit code (or the link in the email, which does not
 * need this page at all). The words are in lib/auth/accesso.ts.
 */
export function AccessoCodice({ da = '/' }: { da?: string }) {
  const [email, setEmail] = useState<string | null>(null)
  const [emailScritta, setEmailScritta] = useState('')

  if (email === null) {
    return (
      <PassoEmail
        da={da}
        iniziale={emailScritta}
        inviata={(indirizzo) => {
          setEmail(indirizzo)
          setEmailScritta(indirizzo)
        }}
      />
    )
  }

  return <PassoCodice da={da} email={email} cambiaEmail={() => setEmail(null)} />
}

function Errore({ testo }: { testo: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {testo}
    </p>
  )
}

function PassoEmail({
  da,
  iniziale,
  inviata,
}: {
  da: string
  iniziale: string
  inviata: (email: string) => void
}) {
  const [errore, setErrore] = useState<string | null>(null)
  const lingua = useLingua()
  const t = ACCESSO[lingua]
  const PAROLE_ACCESSO = t.parole
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormEmailInput>({
    resolver: zodResolver(formEmailSchema),
    defaultValues: { email: iniziale },
  })

  const invia = handleSubmit(async (valori) => {
    setErrore(null)
    let esito
    try {
      esito = await richiediCodice({ email: valori.email, da })
    } catch {
      setErrore(PAROLE_ACCESSO.connessione)
      return
    }
    if (!esito.ok) {
      setErrore(traduciAccesso(esito.errore, lingua) ?? esito.errore)
      return
    }
    inviata(valori.email.trim().toLowerCase())
  })

  return (
    <form onSubmit={invia} noValidate className="space-y-3" data-testid="accesso-codice-email">
      <p className="text-sm text-muted-foreground">{PAROLE_ACCESSO.introduzione}</p>
      <div className="space-y-1.5">
        {/* "Indirizzo di posta": the dev login below owns the label "Email" */}
        <Label htmlFor="accesso-posta">{t.posta}</Label>
        <Input
          id="accesso-posta"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={t.esempioPosta}
          className="h-11"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? 'accesso-posta-errore' : undefined}
          {...register('email')}
        />
        <ErroreCampo id="accesso-posta-errore" messaggio={traduciAccesso(errors.email?.message, lingua)} />
      </div>

      {errore ? <Errore testo={errore} /> : null}

      <Button type="submit" variant="outline" className="h-11 w-full gap-2" disabled={isSubmitting}>
        {isSubmitting ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Mail className="size-4" aria-hidden="true" />
        )}
        {isSubmitting ? t.invioInCorso : t.inviaCodice}
      </Button>
    </form>
  )
}

function secondiRimasti(fine: number) {
  return Math.max(0, Math.ceil((fine - Date.now()) / 1000))
}

function PassoCodice({
  da,
  email,
  cambiaEmail,
}: {
  da: string
  email: string
  cambiaEmail: () => void
}) {
  const [errore, setErrore] = useState<string | null>(null)
  const [reinviato, setReinviato] = useState(false)
  const [reinvio, setReinvio] = useState(false)
  const [dentro, setDentro] = useState(false)
  // the pause is counted against a clock, not by ticks: a tab in the background still gets it right
  const fine = useRef(0)
  const [restano, setRestano] = useState(ATTESA_NUOVO_CODICE_S)
  const campo = useRef<HTMLInputElement | null>(null)
  const lingua = useLingua()
  const t = ACCESSO[lingua]
  const PAROLE_ACCESSO = t.parole

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormCodiceInput>({
    resolver: zodResolver(formCodiceSchema),
    defaultValues: { codice: '' },
  })
  const { ref: refCodice, ...propsCodice } = register('codice')

  useEffect(() => {
    fine.current = Date.now() + ATTESA_NUOVO_CODICE_S * 1000
    campo.current?.focus()
  }, [])

  useEffect(() => {
    if (restano <= 0) return
    const t = setInterval(() => setRestano(secondiRimasti(fine.current)), 1000)
    return () => clearInterval(t)
  }, [restano])

  const entra = handleSubmit(async (valori) => {
    setErrore(null)
    try {
      const esito = await verificaCodice({ email, codice: valori.codice, da })
      if (!esito.ok) {
        setErrore(traduciAccesso(esito.errore, lingua) ?? esito.errore)
        return
      }
      // a whole page load: the session cookie is new, nothing of the login page stays
      if (esito.vai.startsWith('/') && !esito.vai.startsWith('//')) {
        // the button stays on "loading" until the page changes
        setDentro(true)
        window.location.assign(esito.vai)
      }
    } catch {
      setErrore(PAROLE_ACCESSO.connessione)
    }
  })

  async function inviaDiNuovo() {
    setErrore(null)
    setReinvio(true)
    try {
      const esito = await richiediCodice({ email, da })
      if (!esito.ok) {
        setErrore(traduciAccesso(esito.errore, lingua) ?? esito.errore)
        return
      }
      fine.current = Date.now() + ATTESA_NUOVO_CODICE_S * 1000
      setRestano(ATTESA_NUOVO_CODICE_S)
      setReinviato(true)
    } catch {
      setErrore(PAROLE_ACCESSO.connessione)
    } finally {
      setReinvio(false)
    }
  }

  return (
    <form onSubmit={entra} noValidate className="space-y-3" data-testid="accesso-codice-codice">
      <div role="status" className="space-y-1 rounded-lg bg-status-ok/10 px-3 py-2.5 text-sm">
        <p className="flex items-start gap-2 text-status-ok">
          <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{reinviato ? `${t.inviatoDiNuovo} ${PAROLE_ACCESSO.inviata}` : PAROLE_ACCESSO.inviata}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          {t.indirizzo} <span className="break-all text-foreground">{email}</span>. {PAROLE_ACCESSO.validita}
        </p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="accesso-codice">{t.codice}</Label>
        <Input
          id="accesso-codice"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          spellCheck={false}
          placeholder={'0'.repeat(CIFRE_CODICE)}
          className="num h-12 text-center text-xl tracking-[0.35em]"
          aria-invalid={errors.codice ? true : undefined}
          aria-describedby={errors.codice ? 'accesso-codice-errore' : undefined}
          {...propsCodice}
          ref={(el) => {
            refCodice(el)
            campo.current = el
          }}
        />
        <ErroreCampo id="accesso-codice-errore" messaggio={traduciAccesso(errors.codice?.message, lingua)} />
      </div>

      {errore ? <Errore testo={errore} /> : null}

      <Button type="submit" className="h-11 w-full" disabled={isSubmitting || dentro}>
        {isSubmitting || dentro ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
        {t.entra}
      </Button>

      <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" className="h-11 text-muted-foreground" onClick={cambiaEmail}>
          {t.cambiaEmail}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-11 text-muted-foreground"
          disabled={restano > 0 || reinvio}
          onClick={inviaDiNuovo}
        >
          {reinvio ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          {restano > 0 ? t.attesa(restano) : t.inviaDiNuovo}
        </Button>
      </div>
    </form>
  )
}
