'use client'

import { CircleCheck, CircleDashed, LoaderCircle, TriangleAlert } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

import { salvaReportGiornaliero, type EsitoSalvataggio } from '@/app/(app)/today/actions'
import { Stepper } from '@/components/numeri/stepper'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { etichettaGiorno, formatOra } from '@/lib/date'
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
}

export function ReportForm({ data, oggi, iniziale, salvatoAlle }: Props) {
  const [valori, setValori] = useState<ValoriReport>(iniziale)
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
      <StatoSalvataggio stato={stato} riprova={() => void salva()} />

      {GRUPPI.map((gruppo) => (
        <section key={gruppo.titolo} aria-labelledby={`gruppo-${gruppo.titolo}`}>
          <h2
            id={`gruppo-${gruppo.titolo}`}
            className="mb-1 px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
          >
            {gruppo.titolo}
          </h2>
          <div className="divide-y divide-border rounded-xl bg-card px-3">
            {gruppo.campi.map(([campo, etichetta]) => (
              <Stepper
                key={campo}
                etichetta={etichetta}
                valore={valori[campo]}
                massimo={MASSIMO_GIORNALIERO}
                onCambia={(n) => aggiorna({ [campo]: n })}
                onFineModifica={() => void salva()}
              />
            ))}
          </div>
        </section>
      ))}

      <section aria-labelledby="gruppo-contenuto" className="space-y-2">
        <h2
          id="gruppo-contenuto"
          className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase"
        >
          Contenuto e note
        </h2>
        <div className="rounded-xl bg-card px-3">
          <label className="flex min-h-14 cursor-pointer items-center justify-between gap-3">
            <span className="text-sm">Contenuto pubblicato</span>
            <Switch
              checked={valori.contenuto_pubblicato}
              onCheckedChange={(checked) =>
                aggiorna({ contenuto_pubblicato: checked }, 0)
              }
            />
          </label>
        </div>
        <label className="block">
          <span className="sr-only">Note</span>
          <Textarea
            value={valori.note ?? ''}
            onChange={(e) => aggiorna({ note: e.currentTarget.value }, RITARDO_NOTE_MS)}
            onBlur={() => void salva()}
            placeholder="Note della giornata (facoltative)"
            maxLength={2000}
            rows={3}
            className="bg-card"
          />
        </label>
      </section>
    </div>
  )
}

function StatoSalvataggio({ stato, riprova }: { stato: Stato; riprova: () => void }) {
  return (
    // Stays in view while scrolling. On mobile it sits under the sticky top
    // bar (size-11 button + py-2.5 + 1px border = 65px); no top bar from md up.
    <div
      aria-live="polite"
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
    </div>
  )
}
