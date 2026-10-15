'use client'

import { ChevronRight, CircleCheck, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useId, useState, useSyncExternalStore, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'

import { salvaAutomazione } from '@/app/(app)/insight/automazione-actions'
import { ErroreCampo } from '@/components/form/errore-campo'
import { ErroreModulo } from '@/components/form/foglio-modifica'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatOra, oggiRoma } from '@/lib/date'
import { formatData } from '@/lib/format'
import { pianificatoreFermo } from '@/lib/insight/stato'
import { automazioneSchema, PASSO_MINUTI_AUTOMAZIONE } from '@/lib/validation/insight'

/**
 * «Automazione» of the Insight (admin): the recap prepared every day at the
 * chosen time by pg_cron and pg_net (1.35.0, D1, D4). The page renders it in
 * the artifact's place, a <details> at the top: the checkbox «Recap automatico
 * attivo», «Pronto alle» in steps of 5 minutes (the artifact's step="300"),
 * «Salva automazione» and the status line. The props are the contract with
 * the page (phase 0).
 */
export type PropsAutomazione = {
  /** insight_impostazioni.attivo */
  attiva: boolean
  /** 'HH:MM', Rome */
  ora: string
  /** insightConfigurato() on the server: without ANTHROPIC_API_KEY the automatic recap never starts */
  configurato: boolean
  /** ISO, the last tick of pg_cron (insight_stato) */
  ultimoTickIl: string | null
}

const CONNESSIONE = 'Connessione assente. Riprova.'

// One clock per minute for the scheduler's warning: 0 on the server and
// before the first tick, so the server's render and the first client render
// agree (the warning appears right after hydration).
let adesso = 0
const ascoltatori = new Set<() => void>()
let intervallo: ReturnType<typeof setInterval> | null = null

function avvisa() {
  adesso = Date.now()
  for (const ascolta of ascoltatori) ascolta()
}

function iscriviti(ascolta: () => void) {
  ascoltatori.add(ascolta)
  if (!intervallo) {
    intervallo = setInterval(avvisa, 60_000)
    queueMicrotask(avvisa)
  }
  return () => {
    ascoltatori.delete(ascolta)
    if (ascoltatori.size === 0 && intervallo) {
      clearInterval(intervallo)
      intervallo = null
    }
  }
}

function useAdesso() {
  return useSyncExternalStore(
    iscriviti,
    () => adesso,
    () => 0,
  )
}

/** "dalle 18:40", or "dal 12/10/2026 alle 18:40" when it is not today (Rome). */
function dalle(istante: string, oggi: string): string {
  const giorno = oggiRoma(new Date(istante))
  return giorno === oggi ? `dalle ${formatOra(istante)}` : `dal ${formatData(giorno)} alle ${formatOra(istante)}`
}

export function Automazione({ attiva, ora, configurato, ultimoTickIl }: PropsAutomazione) {
  // The form starts from what is saved, and starts again when the saved values
  // change (after this save, or another admin's): a render-time reset, never an effect.
  const salvato = `${attiva}|${ora}`
  const [letto, setLetto] = useState(salvato)
  const [accesa, setAccesa] = useState(attiva)
  const [orario, setOrario] = useState(ora)
  if (letto !== salvato) {
    setLetto(salvato)
    setAccesa(attiva)
    setOrario(ora)
  }
  const [errore, setErrore] = useState<string | null>(null)
  const [erroreOra, setErroreOra] = useState<string | null>(null)
  const [inCorso, avvia] = useTransition()
  const id = useId()

  const istante = useAdesso()
  // a tick never seen yet is not a dead scheduler: the settings say «nessun controllo finora»
  const fermo =
    istante > 0 &&
    ultimoTickIl !== null &&
    pianificatoreFermo({ attivo: attiva, ultimo_tick_il: ultimoTickIl }, new Date(istante))

  function salva(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setErrore(null)
    setErroreOra(null)
    const parsed = automazioneSchema.safeParse({ attiva: accesa, ora: orario })
    if (!parsed.success) {
      setErroreOra(parsed.error.issues[0]?.message ?? 'Orario non valido.')
      return
    }
    avvia(async () => {
      let esito
      try {
        esito = await salvaAutomazione(parsed.data)
      } catch {
        setErrore(CONNESSIONE)
        return
      }
      if (!esito.ok) {
        setErrore(esito.errore)
        return
      }
      toast.success('Automazione salvata', esito.avviso ? { description: esito.avviso } : undefined)
    })
  }

  return (
    <details className="group rounded-xl border border-border bg-card px-4 py-1" data-testid="insight-automazione">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground group-open:rotate-90 motion-safe:transition-transform"
          aria-hidden="true"
        />
        Automazione
      </summary>
      <form onSubmit={salva} noValidate className="space-y-3 pt-1 pb-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
          {/* the whole row is the target: 44px tall */}
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <Checkbox
              checked={accesa}
              onCheckedChange={(v) => setAccesa(v === true)}
              aria-label="Recap automatico attivo"
              className="size-5"
              disabled={inCorso}
            />
            <span aria-hidden="true">Recap automatico attivo</span>
          </label>
          <div className="flex min-h-11 items-center gap-3">
            <Label htmlFor={`${id}-ora`} className="text-sm font-normal">
              Pronto alle
            </Label>
            <Input
              id={`${id}-ora`}
              type="time"
              step={PASSO_MINUTI_AUTOMAZIONE * 60}
              required
              value={orario}
              onChange={(e) => setOrario(e.currentTarget.value)}
              aria-invalid={erroreOra ? true : undefined}
              aria-describedby={erroreOra ? `${id}-errore-ora` : undefined}
              className="num h-11 w-32"
            />
          </div>
          <Button type="submit" variant="outline" className="h-11 w-full sm:w-auto" disabled={inCorso}>
            {inCorso ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : null}
            {inCorso ? 'Salvataggio…' : 'Salva automazione'}
          </Button>
        </div>
        <ErroreCampo id={`${id}-errore-ora`} messaggio={erroreOra ?? undefined} />
        <ErroreModulo testo={errore} />

        <div role="status" className="space-y-1.5 text-sm" data-testid="insight-automazione-stato">
          {attiva ? (
            <p className="flex items-start gap-2">
              <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
              <span>
                Attiva: recap pronto ogni giorno alle <span className="num">{ora}</span>.
              </span>
            </p>
          ) : (
            <p className="text-muted-foreground">Disattivata.</p>
          )}
          {attiva && !configurato ? (
            <p className="flex items-start gap-2 text-status-warning">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Manca ANTHROPIC_API_KEY su Vercel: finché non c’è, il recap automatico non parte.
            </p>
          ) : null}
          {fermo && ultimoTickIl ? (
            <p className="flex items-start gap-2 text-status-warning" data-testid="insight-pianificatore-fermo">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Il pianificatore non risponde {dalle(ultimoTickIl, oggiRoma(new Date(istante)))}: il recap automatico è
              fermo. Usa Aggiorna dati e avvisa chi gestisce l’app.
            </p>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          Gira sul server dell’app: il Mac può restare spento. Parte circa 15 minuti prima.
        </p>
      </form>
    </details>
  )
}
