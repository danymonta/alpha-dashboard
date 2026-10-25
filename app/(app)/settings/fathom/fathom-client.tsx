'use client'

import { CircleCheck, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useId, useRef, useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'

import { impostaInterruttoriCall, impostaLimiteSpesaCall, salvaChiaveFathom, togliChiaveFathom } from '@/app/(app)/settings/fathom/actions'
import { useLingua } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formato } from '@/lib/format'
import { FATHOM } from '@/lib/i18n/testi/fathom'
import { numeroDollari, traduciImpostazioni } from '@/lib/i18n/testi/impostazioni'
import { SHELL } from '@/lib/i18n/testi/shell'

/** The key: a password field that never keeps the value, sent as FormData, cleared at every send. */
export function ChiaveFathom({ presente, salvataIl }: { presente: boolean; salvataIl: string | null }) {
  const campo = useRef<HTMLInputElement>(null)
  const id = useId()
  const [errore, setErrore] = useState<string | null>(null)
  const [prova, setProva] = useState<'risponde' | { errore: string } | null>(null)
  const [conferma, setConferma] = useState(false)
  const [inCorso, avvia] = useTransition()
  const lingua = useLingua()
  const t = FATHOM[lingua].chiave
  const { formatData } = formato(lingua)
  const CONNESSIONE = SHELL[lingua].connessione

  function invia(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const incollata = campo.current?.value ?? ''
    if (campo.current) campo.current.value = ''
    setErrore(null)
    setProva(null)
    if (!incollata.trim()) {
      setErrore(t.incolla)
      return
    }
    const dati = new FormData()
    dati.set('chiave', incollata)
    avvia(async () => {
      let esito
      try {
        esito = await salvaChiaveFathom(dati)
      } catch {
        setErrore(CONNESSIONE)
        return
      }
      if (!esito.ok) {
        setErrore(traduciImpostazioni(esito.errore, lingua))
        return
      }
      setProva(esito.prova)
      toast.success(esito.prova === 'risponde' ? t.salvataRisponde : t.salvata)
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
        const esito = await togliChiaveFathom()
        if (!esito.ok) setErrore(traduciImpostazioni(esito.errore, lingua))
        else toast.success(t.tolta)
      } catch {
        setErrore(CONNESSIONE)
      }
    })
  }

  return (
    <div className="space-y-3">
      {presente ? (
        <p role="status" className="flex items-start gap-2 text-sm" data-testid="fathom-chiave-salvata">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
          {t.salvataIl(salvataIl ? formatData(salvataIl) : null)}
        </p>
      ) : null}
      {prova === 'risponde' ? (
        <p role="status" className="flex items-start gap-2 text-sm" data-testid="fathom-prova">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
          {t.risponde}
        </p>
      ) : prova ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-status-critical" data-testid="fathom-prova">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {traduciImpostazioni(prova.errore, lingua)}
        </p>
      ) : null}
      <form onSubmit={invia} noValidate className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-chiave`}>{presente ? t.nuova : t.api}</Label>
          <Input
            ref={campo}
            id={`${id}-chiave`}
            type="password"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            data-1p-ignore="true"
            data-lpignore="true"
            aria-describedby={`${id}-aiuto${errore ? ` ${id}-errore` : ''}`}
            placeholder={presente ? t.sostituisci : t.incollaQui}
            className="h-11"
          />
          <p id={`${id}-aiuto`} className="text-xs text-muted-foreground">
            {t.aiuto}
          </p>
        </div>
        {errore ? (
          <p id={`${id}-errore`} role="alert" className="flex items-start gap-2 text-sm text-status-critical">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {errore}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="submit" className="h-11" disabled={inCorso}>
            {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {t.salva}
          </Button>
          {presente ? (
            <Button type="button" variant="outline" className="h-11" disabled={inCorso} onClick={togli} onBlur={() => setConferma(false)}>
              {conferma ? t.conferma : t.togli}
            </Button>
          ) : null}
        </div>
      </form>
    </div>
  )
}

function Interruttore({
  chiave,
  acceso,
  titolo,
  descrizione,
  testId,
}: {
  chiave: 'analisi'
  acceso: boolean
  titolo: string
  descrizione: string
  testId: string
}) {
  const id = useId()
  const lingua = useLingua()
  const t = FATHOM[lingua].analisi
  const [valore, setValore] = useState(acceso)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()

  function cambia(nuovo: boolean) {
    const prima = valore
    setValore(nuovo)
    setErrore(null)
    avvia(async () => {
      try {
        const esito = await impostaInterruttoriCall({ [chiave]: nuovo })
        if (!esito.ok) {
          setValore(prima)
          setErrore(traduciImpostazioni(esito.errore, lingua))
        } else toast.success(t.interruttore(titolo, nuovo))
      } catch {
        setValore(prima)
        setErrore(SHELL[lingua].connessione)
      }
    })
  }

  return (
    <div className="space-y-1">
      <div className="flex min-h-11 items-start gap-3">
        <Checkbox id={id} checked={valore} disabled={inCorso} onCheckedChange={(v) => cambia(v === true)} aria-describedby={`${id}-d`} data-testid={testId} className="mt-1" />
        <div className="min-w-0">
          <Label htmlFor={id} className="min-h-6 text-sm font-medium">
            {titolo}
          </Label>
          <p id={`${id}-d`} className="text-sm text-muted-foreground">
            {descrizione}
          </p>
        </div>
      </div>
      {errore ? (
        <p role="alert" className="pl-7 text-sm text-status-critical">
          {errore}
        </p>
      ) : null}
    </div>
  )
}

export function InterruttoriCall({ analisi }: { analisi: boolean }) {
  const t = FATHOM[useLingua()].analisi
  return (
    <div className="space-y-3">
      <Interruttore
        chiave="analisi"
        acceso={analisi}
        titolo={t.titolo}
        descrizione={t.descrizione}
        testId="fathom-analisi"
      />
    </div>
  )
}

export function LimiteSpesaCall({ valore }: { valore: number }) {
  const id = useId()
  const lingua = useLingua()
  const t = FATHOM[lingua].analisi
  const [testo, setTesto] = useState(lingua === 'it' ? String(valore).replace('.', ',') : String(valore))
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()

  function salva(e: React.FormEvent) {
    e.preventDefault()
    const numero = Number(testo.trim().replace(',', '.'))
    if (!Number.isFinite(numero) || numero < 0 || numero > 200) {
      setErrore(t.limiteNonValido)
      return
    }
    setErrore(null)
    avvia(async () => {
      try {
        const esito = await impostaLimiteSpesaCall({ usd: numero })
        if (!esito.ok) setErrore(traduciImpostazioni(esito.errore, lingua))
        else toast.success(t.limiteSalvato(numeroDollari(numero, lingua)))
      } catch {
        setErrore(SHELL[lingua].connessione)
      }
    })
  }

  return (
    <form onSubmit={salva} className="space-y-1.5" data-testid="fathom-limite">
      <Label htmlFor={id}>{t.limite}</Label>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={id}
          inputMode="decimal"
          value={testo}
          onChange={(e) => setTesto(e.target.value)}
          aria-invalid={errore ? true : undefined}
          aria-describedby={errore ? `${id}-errore` : undefined}
          className="h-11 w-28"
        />
        <Button type="submit" variant="outline" className="h-11" disabled={inCorso}>
          {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
          {t.salvaLimite}
        </Button>
      </div>
      {errore ? (
        <p id={`${id}-errore`} role="alert" className="text-sm text-status-critical">
          {errore}
        </p>
      ) : null}
    </form>
  )
}
