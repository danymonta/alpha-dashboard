'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { CircleCheck, LoaderCircle, Mail, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'

import { chiediCodiceCliente, verificaCodiceCliente } from '@/app/entra/actions'
import { inviaCodiceRegistrazione, verificaCodiceRegistrazione } from '@/app/join/actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { useBackendPercorso, type BackendPercorso } from '@/components/percorso/backend-percorso'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { TESTI_ENTRA, TESTI_JOIN, TESTI_REGISTRAZIONE } from '@/lib/percorso/testi'
import { cn } from '@/lib/utils'
import {
  ATTESA_NUOVO_CODICE_CLIENTE_S,
  CIFRE_CODICE_CLIENTE,
  formCodiceClienteSchema,
  formEmailClienteSchema,
  type FormCodiceClienteInput,
  type FormEmailClienteInput,
} from '@/lib/validation/registrazione-cliente'

/**
 * The client's two steps, the address then the 8 digit code (release B1a), for the
 * registration from the personal link (`registrazione`, our code) and the return through
 * /entra (`entra`, Supabase's code, a neutral answer). Italian only. After the code a whole
 * page load: the session cookie is new.
 */
type Modo = 'registrazione' | 'entra'

type Props = {
  modo: Modo
  /** The registration: the address of the card, already written and editable. */
  emailIniziale?: string
  /** The registration: a code already sent to this address in the last 15 minutes. */
  codiceGiaInviatoA?: string | null
  /** /entra: where to go after the code (the proxy's ?da=, reduced to /percorso by the action). */
  da?: string
  /**
   * The registration draws its own heading (the frame has none): one per step, so the large
   * title always talks about the step on the screen.
   */
  titoli?: { email: string; sottoEmail?: string; codice: string }
}

function Intestazione({ titolo, sotto }: { titolo: string; sotto?: string }) {
  return (
    <div className="space-y-2">
      <h1 id="titolo-accesso" tabIndex={-1} className="font-heading text-2xl font-semibold tracking-tight outline-none">
        {titolo}
      </h1>
      {sotto ? <p className="text-sm text-muted-foreground">{sotto}</p> : null}
    </div>
  )
}

function Errore({ testo }: { testo: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      {testo}
    </p>
  )
}

export function AccessoCliente({ modo, emailIniziale = '', codiceGiaInviatoA = null, da, titoli }: Props) {
  const [email, setEmail] = useState<string | null>(codiceGiaInviatoA)
  const [scritta, setScritta] = useState(codiceGiaInviatoA ?? emailIniziale)
  const [scaduta, setScaduta] = useState(false)
  // back from the code with «Cambia email»: the focus goes to the address field
  const [tornata, setTornata] = useState(false)

  if (scaduta) {
    return (
      <>
        {titoli ? <Intestazione titolo={TESTI_JOIN.titoloPagina} /> : null}
        <Errore testo={TESTI_REGISTRAZIONE.scaduta} />
      </>
    )
  }

  if (email === null) {
    return (
      <>
        {titoli ? <Intestazione titolo={titoli.email} sotto={titoli.sottoEmail} /> : null}
        <PassoEmail
          modo={modo}
          iniziale={scritta}
          fuoco={tornata}
          scaduta={() => setScaduta(true)}
          inviata={(indirizzo) => {
            setEmail(indirizzo)
            setScritta(indirizzo)
          }}
        />
      </>
    )
  }

  return (
    <>
      {titoli ? <Intestazione titolo={titoli.codice} /> : null}
      <PassoCodice
        modo={modo}
        email={email}
        da={da}
        scaduta={() => setScaduta(true)}
        cambiaEmail={() => {
          setTornata(true)
          setEmail(null)
        }}
      />
    </>
  )
}

async function chiedi(
  modo: Modo,
  email: string,
  prova: BackendPercorso['accesso'],
): Promise<{ ok: true } | { ok: false; errore: string; scaduta?: boolean }> {
  // the admin's test of the path: no email leaves, the code is on its bar
  if (prova) return prova.chiedi(email)
  if (modo === 'registrazione') {
    const esito = await inviaCodiceRegistrazione({ email })
    return esito.ok ? { ok: true } : esito
  }
  return chiediCodiceCliente({ email })
}

function PassoEmail({
  modo,
  iniziale,
  fuoco,
  inviata,
  scaduta,
}: {
  modo: Modo
  iniziale: string
  fuoco: boolean
  inviata: (email: string) => void
  scaduta: () => void
}) {
  const T = modo === 'registrazione' ? TESTI_REGISTRAZIONE : TESTI_ENTRA
  const { accesso } = useBackendPercorso()
  const [errore, setErrore] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<FormEmailClienteInput>({
    resolver: zodResolver(formEmailClienteSchema),
    defaultValues: { email: iniziale },
  })

  useEffect(() => {
    if (fuoco) setFocus('email')
  }, [fuoco, setFocus])

  const invia = handleSubmit(async (valori) => {
    setErrore(null)
    try {
      const esito = await chiedi(modo, valori.email, accesso)
      if (!esito.ok) {
        if (esito.scaduta) scaduta()
        else setErrore(esito.errore)
        return
      }
      inviata(valori.email.trim().toLowerCase())
    } catch {
      setErrore(T.connessione)
    }
  })

  return (
    <form onSubmit={invia} noValidate className="space-y-3" data-testid={`accesso-cliente-email-${modo}`}>
      <div className="space-y-1.5">
        <Label htmlFor="cliente-email">{T.campoEmail}</Label>
        <Input
          id="cliente-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={TESTI_REGISTRAZIONE.esempioEmail}
          className="h-11"
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? 'cliente-email-errore' : undefined}
          {...register('email')}
        />
        <ErroreCampo id="cliente-email-errore" messaggio={errors.email?.message} />
      </div>
      {errore ? <Errore testo={errore} /> : null}
      <Button type="submit" className="glow-primario h-11 w-full gap-2" disabled={isSubmitting}>
        {isSubmitting ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Mail className="size-4" aria-hidden="true" />
        )}
        {isSubmitting ? T.invioInCorso : T.inviami}
      </Button>
    </form>
  )
}

function secondiRimasti(fine: number) {
  return Math.max(0, Math.ceil((fine - Date.now()) / 1000))
}

function PassoCodice({
  modo,
  email,
  da,
  cambiaEmail,
  scaduta,
}: {
  modo: Modo
  email: string
  da?: string
  cambiaEmail: () => void
  scaduta: () => void
}) {
  const registrazione = modo === 'registrazione'
  const T = registrazione ? TESTI_REGISTRAZIONE : TESTI_ENTRA
  const { accesso } = useBackendPercorso()
  const [errore, setErrore] = useState<string | null>(null)
  const [pronto, setPronto] = useState(false)
  const [reinvio, setReinvio] = useState(false)
  const [dentro, setDentro] = useState(false)
  const fine = useRef(0)
  const [restano, setRestano] = useState(ATTESA_NUOVO_CODICE_CLIENTE_S)
  const campo = useRef<HTMLInputElement | null>(null)

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormCodiceClienteInput>({
    resolver: zodResolver(formCodiceClienteSchema),
    defaultValues: { codice: '' },
  })
  const { ref: refCodice, ...propsCodice } = register('codice')

  useEffect(() => {
    fine.current = Date.now() + ATTESA_NUOVO_CODICE_CLIENTE_S * 1000
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
      const esito = accesso
        ? await accesso.verifica(valori.codice)
        : registrazione
        ? await verificaCodiceRegistrazione({ codice: valori.codice })
        : await verificaCodiceCliente({ email, codice: valori.codice, da })
      if (!esito.ok) {
        if ('scaduta' in esito && esito.scaduta) {
          scaduta()
          return
        }
        if ('pronto' in esito && esito.pronto) setPronto(true)
        setErrore(esito.errore)
        return
      }
      if (esito.vai.startsWith('/') && !esito.vai.startsWith('//')) {
        setDentro(true)
        if (accesso) accesso.entra(esito.vai)
        else window.location.assign(esito.vai)
      }
    } catch {
      setErrore(T.connessione)
    }
  })

  async function inviaDiNuovo() {
    setErrore(null)
    setReinvio(true)
    try {
      const esito = await chiedi(modo, email, accesso)
      if (!esito.ok) {
        if (esito.scaduta) scaduta()
        else setErrore(esito.errore)
        return
      }
      fine.current = Date.now() + ATTESA_NUOVO_CODICE_CLIENTE_S * 1000
      setRestano(ATTESA_NUOVO_CODICE_CLIENTE_S)
    } catch {
      setErrore(T.connessione)
    } finally {
      setReinvio(false)
    }
  }

  if (pronto) {
    return (
      <div className="space-y-3">
        <p role="status" className="flex items-start gap-2 text-sm">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
          {TESTI_REGISTRAZIONE.pronto}
        </p>
        <Link href="/entra" data-slot="button" className={cn(buttonVariants(), 'h-11 w-full')}>
          {TESTI_ENTRA.entra}
        </Link>
      </div>
    )
  }

  return (
    <form onSubmit={entra} noValidate className="space-y-3" data-testid={`accesso-cliente-codice-${modo}`}>
      <div role="status" className="space-y-1 rounded-lg bg-status-ok/10 px-3 py-2.5 text-sm">
        <p className="flex items-start gap-2 text-status-ok">
          <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>{registrazione ? TESTI_REGISTRAZIONE.inviato(email) : TESTI_ENTRA.inviata}</span>
        </p>
        {registrazione ? <p className="text-xs text-muted-foreground">{TESTI_REGISTRAZIONE.validita}</p> : null}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cliente-codice">{T.campoCodice}</Label>
        <Input
          id="cliente-codice"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9 ]*"
          spellCheck={false}
          placeholder={'0'.repeat(CIFRE_CODICE_CLIENTE)}
          className="num h-12 text-center text-xl tracking-[0.35em]"
          aria-invalid={errors.codice ? true : undefined}
          aria-describedby={errors.codice ? 'cliente-codice-errore' : undefined}
          {...propsCodice}
          ref={(el) => {
            refCodice(el)
            campo.current = el
          }}
        />
        <ErroreCampo id="cliente-codice-errore" messaggio={errors.codice?.message} />
      </div>

      {errore ? <Errore testo={errore} /> : null}

      <Button type="submit" className="glow-primario h-11 w-full" disabled={isSubmitting || dentro}>
        {isSubmitting || dentro ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
        {registrazione ? TESTI_REGISTRAZIONE.conferma : TESTI_ENTRA.entra}
      </Button>

      <div className="flex flex-col gap-1 sm:flex-row sm:justify-between">
        <Button type="button" variant="ghost" className="h-11 text-muted-foreground" onClick={cambiaEmail}>
          {T.cambiaEmail}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-11 text-muted-foreground"
          disabled={restano > 0 || reinvio}
          onClick={inviaDiNuovo}
        >
          {restano > 0 ? T.attesa(restano) : T.inviaDiNuovo}
        </Button>
      </div>
    </form>
  )
}
