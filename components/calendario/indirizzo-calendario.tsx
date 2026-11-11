'use client'

import { CircleCheck, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useId, useRef, useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'

import { salvaIndirizzoCalendario, togliIndirizzoCalendario } from '@/app/(app)/settings/chiavi/calendario-actions'
import { useLingua } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { INDIRIZZO_CALENDARIO, traduciErroreCalendario } from '@/lib/i18n/testi/contatti'
import { SHELL } from '@/lib/i18n/testi/shell'

/**
 * The secret iCal address of «Dany Discovery Call» (1.76.0): a password field that never keeps the value,
 * sent as FormData and cleared at every send, like the keys of Fathom and Instagram.
 */
export function IndirizzoCalendario({ presente }: { presente: boolean }) {
  const campo = useRef<HTMLInputElement>(null)
  const id = useId()
  const lingua = useLingua()
  const t = INDIRIZZO_CALENDARIO[lingua]
  const CONNESSIONE = SHELL[lingua].connessione
  const [errore, setErrore] = useState<string | null>(null)
  const [letti, setLetti] = useState<number | null>(null)
  const [conferma, setConferma] = useState(false)
  const [inCorso, avvia] = useTransition()

  function invia(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const incollato = campo.current?.value ?? ''
    if (campo.current) campo.current.value = ''
    setErrore(null)
    setLetti(null)
    if (!incollato.trim()) {
      setErrore(t.incolla)
      return
    }
    const dati = new FormData()
    dati.set('indirizzo', incollato)
    avvia(async () => {
      try {
        const esito = await salvaIndirizzoCalendario(dati)
        if (!esito.ok) {
          setErrore(traduciErroreCalendario(esito.errore, lingua))
          return
        }
        if (esito.letti === null) {
          setErrore(traduciErroreCalendario(esito.errore ?? '', lingua) || null)
          toast.warning(t.salvatoNonLetto)
          return
        }
        setLetti(esito.letti)
        toast.success(t.salvatoLetto(esito.letti))
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
        const esito = await togliIndirizzoCalendario()
        if (!esito.ok) setErrore(traduciErroreCalendario(esito.errore, lingua))
        else toast.success(t.tolto)
      } catch {
        setErrore(CONNESSIONE)
      }
    })
  }

  return (
    <div className="space-y-3">
      {letti !== null ? (
        <p role="status" className="flex items-start gap-2 text-sm" data-testid="calendario-letto">
          <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
          {t.salvatoLetto(letti)}
        </p>
      ) : null}
      <form onSubmit={invia} noValidate className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor={`${id}-indirizzo`}>{presente ? t.nuovo : t.campo}</Label>
          <Input
            ref={campo}
            id={`${id}-indirizzo`}
            type="password"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            data-1p-ignore="true"
            data-lpignore="true"
            aria-describedby={`${id}-aiuto${errore ? ` ${id}-errore` : ''}`}
            placeholder={presente ? t.sostituisci : t.segnaposto}
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
