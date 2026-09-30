'use client'

import { CircleCheck, CircleDashed, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { salvaReportGiornaliero, type EsitoSalvataggio } from '@/app/(app)/today/actions'
import { Stepper } from '@/components/numeri/stepper'
import { ANCORA_COMMENTO, CommentoReport, DaCompletare } from '@/components/setter/commento-report'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { etichettaGiorno, formatOra } from '@/lib/date'
import { formatNumero } from '@/lib/format'
import { LEGENDA_SETTING } from '@/lib/metriche/legenda'
import { commentoDaCompletare } from '@/lib/setting/commento'
import { cn } from '@/lib/utils'
import {
  GRUPPI_REPORT,
  MASSIMO_GIORNALIERO,
  type ValoriReport,
} from '@/lib/validation/report'

const RITARDO_NUMERI_MS = 500
const RITARDO_NOTE_MS = 1000

const GRUPPI = GRUPPI_REPORT

type Stato =
  | { tipo: 'nuovo' }
  | { tipo: 'modificato' }
  | { tipo: 'salvataggio' }
  | { tipo: 'salvato'; alle: string }
  | { tipo: 'errore'; messaggio: string }

type Props = {
  data: string
  oggi: string
  iniziale: ValoriReport
  salvatoAlle: string | null
  /** DM totali of the loaded row, as the database computed it (0 when there is no row) */
  dmTotali: number | null
  /** created_at of the loaded row (null when there is none): a day reported before the questions is never asked */
  creatoIl?: string | null
}

export function ReportForm({ data, oggi, iniziale, salvatoAlle, dmTotali: dmTotaliIniziale, creatoIl = null }: Props) {
  const [valori, setValori] = useState<ValoriReport>(iniziale)
  // Only the database adds the DM up: the value of the last saved row
  const [dmTotali, setDmTotali] = useState(dmTotaliIniziale)
  const [stato, setStato] = useState<Stato>(
    salvatoAlle ? { tipo: 'salvato', alle: salvatoAlle } : { tipo: 'nuovo' },
  )

  // Save queue. Next dispatches actions one at a time; every request carries
  // the full snapshot, and the loop keeps going until nothing is left pending,
  // so the last value typed is always the one stored.
  const valoriRef = useRef(iniziale)
  const ultimoSalvato = useRef(salvatoAlle ? JSON.stringify(iniziale) : null)
  const ultimaOra = useRef(salvatoAlle)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inVolo = useRef(false)
  const daRisalvare = useRef(false)

  const salva = useCallback(async () => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
    if (inVolo.current) {
      daRisalvare.current = true
      return
    }

    inVolo.current = true
    try {
      let continua = true
      while (continua) {
        daRisalvare.current = false
        const istantanea = valoriRef.current
        const chiave = JSON.stringify(istantanea)

        if (chiave === ultimoSalvato.current) {
          if (ultimaOra.current) setStato({ tipo: 'salvato', alle: ultimaOra.current })
          break
        }

        setStato({ tipo: 'salvataggio' })

        let esito: EsitoSalvataggio
        try {
          esito = await salvaReportGiornaliero({ data, ...istantanea })
        } catch {
          setStato({ tipo: 'errore', messaggio: 'Connessione assente. Riprova.' })
          toast.error('Report non salvato. Connessione assente. Riprova.')
          break
        }

        if (!esito.ok) {
          setStato({ tipo: 'errore', messaggio: esito.errore })
          toast.error(`Report non salvato. ${esito.errore}`)
          break
        }

        ultimoSalvato.current = chiave
        ultimaOra.current = esito.salvatoAlle
        setDmTotali(esito.dmTotali)
        if (esito.creato) {
          toast.success(`Report di ${etichettaGiorno(data, oggi).toLowerCase()} avviato`)
        }
        if (JSON.stringify(valoriRef.current) === chiave) {
          setStato({ tipo: 'salvato', alle: esito.salvatoAlle })
        }

        continua = daRisalvare.current
      }
    } finally {
      inVolo.current = false
    }
  }, [data, oggi])

  const aggiorna = useCallback(
    (modifica: Partial<ValoriReport>, ritardo = RITARDO_NUMERI_MS) => {
      const prossimi = { ...valoriRef.current, ...modifica }
      valoriRef.current = prossimi
      setValori(prossimi)
      setStato({ tipo: 'modificato' })
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => void salva(), ritardo)
    },
    [salva],
  )

  const inSospeso =
    stato.tipo === 'modificato' || stato.tipo === 'salvataggio' || stato.tipo === 'errore'

  // A day with DM or conversations asks for the two scales: a reminder for the
  // setter on his own day, from what is on screen; the save never waits for it
  const daCompletare = commentoDaCompletare(valori, creatoIl)

  // Leaving the screen: flush now, and warn if something is still unsaved.
  useEffect(() => {
    const suNascondi = () => {
      if (document.visibilityState === 'hidden') void salva()
    }
    const primaDiUscire = (e: BeforeUnloadEvent) => {
      if (inSospeso) e.preventDefault()
    }
    document.addEventListener('visibilitychange', suNascondi)
    window.addEventListener('beforeunload', primaDiUscire)
    return () => {
      document.removeEventListener('visibilitychange', suNascondi)
      window.removeEventListener('beforeunload', primaDiUscire)
    }
  }, [salva, inSospeso])

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  return (
    <div className="space-y-5">
      <StatoSalvataggio stato={stato} riprova={() => void salva()} daCompletare={daCompletare} />

      {GRUPPI.map((gruppo, i) => (
        <section
          key={gruppo.titolo}
          aria-labelledby={`gruppo-${gruppo.titolo}`}
          data-tour={i === 0 ? 'oggi-contatori' : undefined}
        >
          <h2
            id={`gruppo-${gruppo.titolo}`}
            className="mb-1 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
          >
            {gruppo.titolo}
          </h2>
          <div className="divide-y divide-border rounded-xl bg-card px-3">
            {gruppo.campi.map(([campo, etichetta, aiuto]) => (
              <div key={campo} className="pb-2">
                <Stepper
                  etichetta={etichetta}
                  valore={valori[campo]}
                  massimo={MASSIMO_GIORNALIERO}
                  onCambia={(n) => aggiorna({ [campo]: n })}
                  onFineModifica={() => void salva()}
                  className="pb-0.5"
                />
                <p className="text-xs leading-snug text-muted-foreground">{aiuto}</p>
              </div>
            ))}
          </div>
          {gruppo.campi.some(([campo]) => campo === 'dm_outbound') ? (
            <DmTotali valore={dmTotali} inAggiornamento={inSospeso} />
          ) : null}
          {gruppo.nota ? (
            <p className="mt-1.5 px-1 text-xs text-muted-foreground">{gruppo.nota}</p>
          ) : null}
          {/* with the volumes, right under the conversations (Dany, 30/09/2026) */}
          {gruppo.commento ? (
            <div className="mt-5">
              <CommentoReport
                valori={valori}
                daCompletare={daCompletare}
                // one tap: saved at once, like the switch
                onScala={(campo, valore) => aggiorna({ [campo]: valore }, 0)}
                onTesto={(campo, testo) => aggiorna({ [campo]: testo }, RITARDO_NOTE_MS)}
                onFineTesto={() => void salva()}
              />
            </div>
          ) : null}
        </section>
      ))}

      <section aria-labelledby="gruppo-contenuto" className="space-y-2">
        <h2
          id="gruppo-contenuto"
          className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          Contenuto
        </h2>
        <div className="rounded-xl bg-card px-3">
          <label className="flex min-h-14 cursor-pointer items-center justify-between gap-3 py-2">
            <span className="min-w-0">
              <span className="block text-sm">Contenuto pubblicato</span>
              <span className="block text-xs leading-snug text-muted-foreground">
                Se è uscito un contenuto sul profilo
              </span>
            </span>
            <Switch
              checked={valori.contenuto_pubblicato}
              onCheckedChange={(checked) =>
                aggiorna({ contenuto_pubblicato: checked }, 0)
              }
            />
          </label>
        </div>
      </section>
    </div>
  )
}

/**
 * The sum of the three counters above, read back from the saved row (a
 * generated column). Until the save lands it shows the last saved value, dimmed.
 */
function DmTotali({ valore, inAggiornamento }: { valore: number | null; inAggiornamento: boolean }) {
  return (
    <p className="mt-1.5 flex flex-wrap items-baseline gap-x-2 px-1" data-testid="dm-totali">
      <span className="text-sm">
        {LEGENDA_SETTING.dm_totali.etichetta}:{' '}
        <span
          className={cn('num font-semibold transition-colors', inAggiornamento && 'text-muted-foreground')}
          data-testid="dm-totali-valore"
        >
          {formatNumero(valore)}
        </span>
      </span>
      <span className="text-xs text-muted-foreground">= outbound + inbound + follow up</span>
    </p>
  )
}

function StatoSalvataggio({
  stato,
  riprova,
  daCompletare,
}: {
  stato: Stato
  riprova: () => void
  /** The day's own reminder, in view while scrolling: never while an error needs the space */
  daCompletare: boolean
}) {
  return (
    // Stays in view while scrolling. On mobile it sits under the sticky top
    // bar (size-11 button + py-2.5 + 1px border = 65px); no top bar from md up.
    <div
      aria-live="polite"
      data-tour="oggi-salvato"
      className="sticky top-[65px] z-10 -mx-1 flex min-h-11 items-center justify-between gap-3 bg-background px-1 text-sm md:top-0"
    >
      {stato.tipo === 'nuovo' ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <CircleDashed className="size-4 shrink-0" aria-hidden="true" />
          Non ancora compilato. Si salva da solo al primo tocco.
        </p>
      ) : null}

      {stato.tipo === 'modificato' || stato.tipo === 'salvataggio' ? (
        <p className="flex items-center gap-2 text-muted-foreground">
          <LoaderCircle className="size-4 shrink-0 animate-spin" aria-hidden="true" />
          Salvataggio…
        </p>
      ) : null}

      {stato.tipo === 'salvato' ? (
        <p className="flex items-center gap-2 text-muted-foreground" data-testid="stato-salvato">
          <CircleCheck className="size-4 shrink-0 text-status-ok" aria-hidden="true" />
          Salvato alle <span className="num text-foreground">{formatOra(stato.alle)}</span>
        </p>
      ) : null}

      {stato.tipo === 'errore' ? (
        <>
          <p role="alert" className="flex items-center gap-2 text-status-critical">
            <TriangleAlert className="size-4 shrink-0" aria-hidden="true" />
            Non salvato. {stato.messaggio}
          </p>
          <Button type="button" variant="outline" className="h-11" onClick={riprova}>
            Riprova
          </Button>
        </>
      ) : null}

      {daCompletare && stato.tipo !== 'errore' ? (
        // a link to the two questions: from the Call group, one tap brings them back
        <DaCompletare className="ml-auto" testId="da-completare-giorno" href={`#${ANCORA_COMMENTO}`} />
      ) : null}
    </div>
  )
}
