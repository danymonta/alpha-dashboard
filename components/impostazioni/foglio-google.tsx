'use client'

import { Copy, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useId, useRef, useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'

import {
  salvaChiaveGoogle,
  salvaFoglio,
  scriviOraFoglio,
  togliChiaveGoogle,
} from '@/app/(app)/settings/chiavi/google-actions'
import { useLingua } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { FOGLIO_GOOGLE, traduciErroreFoglio } from '@/lib/i18n/testi/foglio'
import { SHELL } from '@/lib/i18n/testi/shell'

const FILE_MAX = 20_000

/**
 * The Google service account of the onboarding sheet (1.82.0): the .json key file is read in the
 * browser and sent once inside a FormData (never kept, never shown again), the sheet and its
 * tab, and «Scrivi ora sul foglio». The address of the account is not a secret: it is shown so
 * the sheet can be shared with it.
 */
export function FoglioGoogle({
  presente,
  email,
  foglioId,
  scheda,
}: {
  presente: boolean
  email: string | null
  foglioId: string
  scheda: string
}) {
  const id = useId()
  const lingua = useLingua()
  const t = FOGLIO_GOOGLE[lingua]
  const CONNESSIONE = SHELL[lingua].connessione
  const file = useRef<HTMLInputElement>(null)
  const [errore, setErrore] = useState<string | null>(null)
  const [conferma, setConferma] = useState(false)
  const [foglio, setFoglio] = useState(foglioId)
  const [nomeScheda, setNomeScheda] = useState(scheda)
  const [erroreFoglio, setErroreFoglio] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()

  async function inviaChiave(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrore(null)
    const scelto = file.current?.files?.[0]
    if (!scelto || scelto.size > FILE_MAX) {
      setErrore(t.scegli)
      return
    }
    const testo = await scelto.text()
    if (file.current) file.current.value = ''
    const dati = new FormData()
    dati.set('chiave', testo)
    avvia(async () => {
      try {
        const esito = await salvaChiaveGoogle(dati)
        if (!esito.ok) {
          setErrore(traduciErroreFoglio(esito.errore, lingua))
          return
        }
        if (esito.prova) {
          setErrore(traduciErroreFoglio(esito.prova, lingua))
          toast.warning(t.salvataNonProvata)
          return
        }
        toast.success(t.salvataProvata)
      } catch {
        setErrore(CONNESSIONE)
      }
    })
  }

  function togli() {
    if (!conferma) {
      setConferma(true)
      return
    }
    setConferma(false)
    avvia(async () => {
      try {
        const esito = await togliChiaveGoogle()
        if (!esito.ok) setErrore(traduciErroreFoglio(esito.errore, lingua))
        else toast.success(t.tolta)
      } catch {
        setErrore(CONNESSIONE)
      }
    })
  }

  function inviaFoglio(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErroreFoglio(null)
    avvia(async () => {
      try {
        const esito = await salvaFoglio({ foglio, scheda: nomeScheda })
        if (!esito.ok) setErroreFoglio(traduciErroreFoglio(esito.errore, lingua))
        else toast.success(t.foglioSalvato)
      } catch {
        setErroreFoglio(CONNESSIONE)
      }
    })
  }

  function scrivi() {
    setErrore(null)
    avvia(async () => {
      try {
        const esito = await scriviOraFoglio()
        if (!esito.ok) {
          setErrore(traduciErroreFoglio(esito.errore, lingua))
          return
        }
        const testo = t.scritto(esito.scritte, esito.svuotate, esito.errori)
        if (esito.errori > 0) toast.warning(testo)
        else toast.success(testo)
      } catch {
        setErrore(CONNESSIONE)
      }
    })
  }

  async function copia() {
    if (!email) return
    try {
      await navigator.clipboard.writeText(email)
      toast.success(t.copiato)
    } catch {
      toast.error(CONNESSIONE)
    }
  }

  return (
    <div className="space-y-4">
      {email ? (
        <div className="space-y-1.5">
          <p className="text-sm text-muted-foreground">{t.account}</p>
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 rounded-md bg-muted px-2 py-1 text-xs break-all" data-testid="google-account">
              {email}
            </code>
            <Button type="button" variant="outline" className="h-11" onClick={copia}>
              <Copy className="size-4" aria-hidden="true" />
              {t.copia}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t.condividi}</p>
        </div>
      ) : null}

      <form onSubmit={inviaChiave} noValidate className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-file`}>{presente ? t.nuovoFile : t.campoFile}</Label>
          <Input
            ref={file}
            id={`${id}-file`}
            type="file"
            accept="application/json,.json"
            aria-describedby={`${id}-aiuto${errore ? ` ${id}-errore` : ''}`}
            className="h-11 py-2"
          />
          <p id={`${id}-aiuto`} className="text-xs text-muted-foreground">
            {t.aiutoFile}
          </p>
        </div>
        {errore ? (
          <p id={`${id}-errore`} role="alert" className="flex items-start gap-2 text-sm text-status-critical">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {errore}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button type="submit" className="h-11" disabled={inCorso}>
            {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {t.salva}
          </Button>
          {presente ? (
            <>
              <Button type="button" variant="outline" className="h-11" disabled={inCorso} onClick={scrivi}>
                {t.scriviOra}
              </Button>
              <Button type="button" variant="outline" className="h-11" disabled={inCorso} onClick={togli} onBlur={() => setConferma(false)}>
                {conferma ? t.conferma : t.togli}
              </Button>
            </>
          ) : null}
        </div>
      </form>

      <form onSubmit={inviaFoglio} noValidate className="space-y-3 border-t border-border pt-4">
        <p className="text-sm font-medium">{t.foglio}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-foglio`}>{t.idFoglio}</Label>
            <Input
              id={`${id}-foglio`}
              value={foglio}
              onChange={(e) => setFoglio(e.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-describedby={`${id}-aiuto-foglio`}
              className="h-11"
            />
            <p id={`${id}-aiuto-foglio`} className="text-xs text-muted-foreground">
              {t.aiutoId}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-scheda`}>{t.scheda}</Label>
            <Input id={`${id}-scheda`} value={nomeScheda} onChange={(e) => setNomeScheda(e.target.value)} className="h-11" />
          </div>
        </div>
        {erroreFoglio ? (
          <p role="alert" className="flex items-start gap-2 text-sm text-status-critical">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {erroreFoglio}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" variant="outline" className="h-11" disabled={inCorso}>
            {t.salvaFoglio}
          </Button>
          <a
            href={`https://docs.google.com/spreadsheets/d/${encodeURIComponent(foglioId)}/edit`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-11 items-center justify-center rounded-md px-3 text-sm underline underline-offset-4 hover:text-foreground"
          >
            {t.apri}
          </a>
        </div>
      </form>
    </div>
  )
}
