'use client'

import { CircleCheck, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useId, useRef, useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'

import { impostaInterruttoriCall, impostaLimiteSpesaCall, salvaChiaveFathom, togliChiaveFathom } from '@/app/(app)/settings/fathom/actions'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatData } from '@/lib/format'

const CONNESSIONE = 'Connessione assente. Riprova.'

/** The key: a password field that never keeps the value, sent as FormData, cleared at every send. */
export function ChiaveFathom({ presente, salvataIl }: { presente: boolean; salvataIl: string | null }) {
  const campo = useRef<HTMLInputElement>(null)
  const id = useId()
  const [errore, setErrore] = useState<string | null>(null)
  const [prova, setProva] = useState<'risponde' | { errore: string } | null>(null)
  const [conferma, setConferma] = useState(false)
  const [inCorso, avvia] = useTransition()

  function invia(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const incollata = campo.current?.value ?? ''
    if (campo.current) campo.current.value = ''
    setErrore(null)
    setProva(null)
    if (!incollata.trim()) {
      setErrore('Incolla la chiave copiata da Fathom.')
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
        setErrore(esito.errore)
        return
      }
      setProva(esito.prova)
      toast.success(esito.prova === 'risponde' ? 'Chiave salvata: Fathom risponde.' : 'Chiave salvata.')
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
        if (!esito.ok) setErrore(esito.errore)
        else toast.success('Chiave tolta.')
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
          {salvataIl ? `Chiave salvata il ${formatData(salvataIl)}` : 'Chiave salvata'}
        </p>
      ) : null}
      {prova === 'risponde' ? (
        <p role="status" className="flex items-start gap-2 text-sm" data-testid="fathom-prova">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
          Fathom risponde con questa chiave.
        </p>
      ) : prova ? (
        <p role="alert" className="flex items-start gap-2 text-sm text-status-critical" data-testid="fathom-prova">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {prova.errore}
        </p>
      ) : null}
      <form onSubmit={invia} noValidate className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-chiave`}>{presente ? 'Chiave nuova' : 'Chiave API'}</Label>
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
            placeholder={presente ? 'Incolla qui per sostituirla' : 'Incolla qui la chiave'}
            className="h-11"
          />
          <p id={`${id}-aiuto`} className="text-xs text-muted-foreground">
            Fathom › Impostazioni › API Access › Genera. Non incollarla in chat.
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
            Salva la chiave
          </Button>
          {presente ? (
            <Button type="button" variant="outline" className="h-11" disabled={inCorso} onClick={togli} onBlur={() => setConferma(false)}>
              {conferma ? 'Tocca ancora: la ricerca delle registrazioni e l’analisi delle call nuove si fermano' : 'Togli la chiave'}
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
          setErrore(esito.errore)
        } else toast.success(`${titolo}: ${nuovo ? 'accese' : 'spente'}`)
      } catch {
        setValore(prima)
        setErrore(CONNESSIONE)
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
  return (
    <div className="space-y-3">
      <Interruttore
        chiave="analisi"
        acceso={analisi}
        titolo="Analisi delle call"
        descrizione="Claude analizza ogni call registrata (svolta, con l’esito e il link di Fathom) pochi minuti dopo l’esito. Spente, partono solo con «Analizza»."
        testId="fathom-analisi"
      />
    </div>
  )
}

export function LimiteSpesaCall({ valore }: { valore: number }) {
  const id = useId()
  const [testo, setTesto] = useState(String(valore).replace('.', ','))
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()

  function salva(e: React.FormEvent) {
    e.preventDefault()
    const numero = Number(testo.trim().replace(',', '.'))
    if (!Number.isFinite(numero) || numero < 0 || numero > 200) {
      setErrore('Scegli un limite tra 0 e 200 $.')
      return
    }
    setErrore(null)
    avvia(async () => {
      try {
        const esito = await impostaLimiteSpesaCall({ usd: numero })
        if (!esito.ok) setErrore(esito.errore)
        else toast.success(`Limite di spesa: ${numero.toLocaleString('it-IT')} $ al mese`)
      } catch {
        setErrore(CONNESSIONE)
      }
    })
  }

  return (
    <form onSubmit={salva} className="space-y-1.5" data-testid="fathom-limite">
      <Label htmlFor={id}>Limite di spesa al mese ($)</Label>
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
          Salva il limite
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
