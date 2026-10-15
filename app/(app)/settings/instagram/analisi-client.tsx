'use client'

import { LoaderCircle } from 'lucide-react'
import { useId, useState, useTransition } from 'react'
import { toast } from 'sonner'

import { impostaInterruttoriAnalisi, impostaLimiteSpesaAnalisi } from '@/app/(app)/settings/instagram/actions'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const CONNESSIONE = 'Connessione assente. Riprova.'

/**
 * «Limite di spesa al mese»: a number of dollars from 0 to 200, saved with the
 * button or Enter. The month's cost itself is SQL's and is said by the server
 * block above this field.
 */
export function LimiteSpesaAnalisi({ valore }: { valore: number }) {
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
        const esito = await impostaLimiteSpesaAnalisi({ usd: numero })
        if (!esito.ok) setErrore(esito.errore)
        else toast.success(`Limite di spesa: ${numero.toLocaleString('it-IT')} $ al mese`)
      } catch {
        setErrore(CONNESSIONE)
      }
    })
  }

  return (
    <form onSubmit={salva} className="space-y-1.5" data-testid="analisi-limite">
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
          setErrore(esito.errore)
        } else {
          toast.success(`${titolo}: ${nuovo ? 'accese' : 'spente'}`)
        }
      } catch {
        setValore(prima)
        setErrore(CONNESSIONE)
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
  return (
    <div className="space-y-3">
      <Interruttore
        chiave="automatiche"
        acceso={automatiche}
        titolo="Analisi automatiche"
        descrizione="Ogni notte Claude legge e analizza i reel nuovi e quelli che hanno compiuto 3, 7 o 14 giorni. Spente, partono solo quando qualcuno tocca «Analizza»."
        testId="analisi-automatiche"
      />
      <Interruttore
        chiave="note_team"
        acceso={noteTeam}
        titolo="Note di setter e closer nelle analisi"
        descrizione="Claude legge le risposte del setter («cosa frenava i lead») e i motivi di non chiusura del closer, senza nomi, per dire cosa dicono i lead. Spente, non le vede mai. Non rifà le analisi già pronte."
        testId="analisi-note-team"
      />
    </div>
  )
}
