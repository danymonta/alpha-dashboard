'use client'

import { LoaderCircle } from 'lucide-react'
import { useId, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { impostaInterruttoriAnalisi, impostaLimiteSpesaAnalisi } from '@/app/(app)/settings/instagram/actions'
import { useLingua } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { numeroDollari, traduciImpostazioni } from '@/lib/i18n/testi/impostazioni'
import { INSTAGRAM_IMPOSTAZIONI } from '@/lib/i18n/testi/instagram-impostazioni'
import { SHELL } from '@/lib/i18n/testi/shell'

/**
 * «Limite di spesa al mese»: a number of dollars from 0 to 200, saved with the
 * button or Enter. The month's cost itself is SQL's and is said by the server
 * block above this field.
 */
export function LimiteSpesaAnalisi({ valore }: { valore: number }) {
  const id = useId()
  const lingua = useLingua()
  const t = INSTAGRAM_IMPOSTAZIONI[lingua].analisi
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
        const esito = await impostaLimiteSpesaAnalisi({ usd: numero })
        if (!esito.ok) setErrore(traduciImpostazioni(esito.errore, lingua))
        else toast.success(t.limiteSalvato(numeroDollari(numero, lingua)))
      } catch {
        setErrore(SHELL[lingua].connessione)
      }
    })
  }

  return (
    <form onSubmit={salva} className="space-y-1.5" data-testid="analisi-limite">
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

/** One switch of the reel analysis: a checkbox in a 44 px row, saved at the tap. */
function Interruttore({
  chiave,
  acceso,
  titolo,
  descrizione,
  testId,
}: {
  chiave: 'automatiche' | 'note_team'
  acceso: boolean
  titolo: string
  descrizione: string
  testId: string
}) {
  const id = useId()
  const lingua = useLingua()
  const t = INSTAGRAM_IMPOSTAZIONI[lingua].analisi
  const [valore, setValore] = useState(acceso)
  const [errore, setErrore] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()

  function cambia(nuovo: boolean) {
    const prima = valore
    setValore(nuovo)
    setErrore(null)
    avvia(async () => {
      try {
        const esito = await impostaInterruttoriAnalisi({ [chiave]: nuovo })
        if (!esito.ok) {
          setValore(prima)
          setErrore(traduciImpostazioni(esito.errore, lingua))
        } else {
          toast.success(t.interruttore(titolo, nuovo))
        }
      } catch {
        setValore(prima)
        setErrore(SHELL[lingua].connessione)
      }
    })
  }

  return (
    <div className="space-y-1">
      <div className="flex min-h-11 items-start gap-3">
        <Checkbox
          id={id}
          checked={valore}
          disabled={inCorso}
          onCheckedChange={(v) => cambia(v === true)}
          aria-describedby={`${id}-d`}
          data-testid={testId}
          className="mt-1"
        />
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

export function InterruttoriAnalisi({ automatiche, noteTeam }: { automatiche: boolean; noteTeam: boolean }) {
  const t = INSTAGRAM_IMPOSTAZIONI[useLingua()].analisi
  return (
    <div className="space-y-3">
      <Interruttore
        chiave="automatiche"
        acceso={automatiche}
        titolo={t.automatiche}
        descrizione={t.automaticheDescrizione}
        testId="analisi-automatiche"
      />
      <Interruttore
        chiave="note_team"
        acceso={noteTeam}
        titolo={t.noteTeam}
        descrizione={t.noteTeamDescrizione}
        testId="analisi-note-team"
      />
    </div>
  )
}
