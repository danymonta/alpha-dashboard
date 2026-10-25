'use client'

import { Gauge } from 'lucide-react'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'

import { decidiPerformance } from '@/app/(app)/calls/actions'
import { useLingua } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import { LIVELLI_PERFORMANCE, type ValutazioneVista } from '@/lib/call/analisi/vista'
import { ANALISI_TESTI, ANALISI_TOAST, CATEGORIE_CALL } from '@/lib/i18n/testi/analisi-call'
import { traduciErrore } from '@/lib/i18n/testi/errori-economics'
import { ETICHETTE } from '@/lib/i18n/testi/etichette'
import type { Database } from '@/lib/supabase/database.types'

type Livello = Database['public']['Enums']['call_performance']

/**
 * How the call was led, proposed by Claude (1.37.0, CLAUDE.md section 31): five criteria, the
 * level worked out by the code, the why, the share of speech. Only the closer who led the call
 * sees it (the admin only on his own calls: RLS gives no other row); the closer confirms or
 * changes the level, and only then is calls.performance written. Never a score for others.
 */
type Props = { callId: string; valutazione: ValutazioneVista; performanceSalvata: Livello | null }

export function PerformanceCall({ callId, valutazione: v, performanceSalvata }: Props) {
  const [inCorso, avvia] = useTransition()
  const lingua = useLingua()
  const ANALISI = ANALISI_TESTI[lingua]
  const toastT = ANALISI_TOAST[lingua]
  const { CRITERI, GIUDIZI_CRITERIO } = CATEGORIE_CALL[lingua]
  const ETICHETTA_PERFORMANCE = ETICHETTE[lingua].performance
  const [attuale, setAttuale] = useState<Livello | null>(performanceSalvata)
  const [cambia, setCambia] = useState(false)
  const proposta = v.livello_proposto

  function decidi(livello: Livello) {
    const prima = attuale
    avvia(async () => {
      const r = await decidiPerformance({ call_id: callId, livello }).catch(() => null)
      if (!r) return void toast.error(traduciErrore('Connessione assente. Riprova.', lingua))
      if (!r.ok) return void toast.error(traduciErrore(r.errore, lingua))
      setAttuale(livello)
      setCambia(false)
      toast.success(ANALISI.performance.fatto(ETICHETTA_PERFORMANCE[livello]), {
        action: {
          label: toastT.annulla,
          onClick: () => {
            void decidiPerformance({ call_id: callId, livello: prima }).then((a) => {
              if (a.ok) setAttuale(prima)
              else toast.error(traduciErrore(a.errore, lingua))
            })
          },
        },
      })
    })
  }

  if (!proposta && !v.perche.length) return null
  const confermata = attuale !== null && attuale === proposta

  return (
    <section className="mt-1 ml-[4.25rem] space-y-2 rounded-lg border border-border p-3 text-sm" data-testid="performance-call">
      <h4 className="flex items-center gap-1.5 font-medium">
        <Gauge className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span>
          {ANALISI.performance.titolo}
          {proposta ? <span data-testid="performance-proposta">: {ETICHETTA_PERFORMANCE[proposta]}</span> : null}
        </span>
      </h4>
      <p className="text-muted-foreground">
        {Object.entries(CRITERI)
          .map(([k, nome]) => `${nome}: ${GIUDIZI_CRITERIO[(v.criteri[k] ?? 'non_applicabile') as keyof typeof GIUDIZI_CRITERIO]}`)
          .join(' · ')}
      </p>
      {v.perche.length > 0 ? (
        <ul lang="it" className="list-disc space-y-0.5 pl-5">
          {v.perche.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      ) : null}
      {v.quota_parlato !== null ? <p className="text-muted-foreground">{ANALISI.performance.quota(Math.round(v.quota_parlato * 100))}</p> : null}
      {attuale !== null && attuale !== proposta && proposta ? (
        <p className="text-muted-foreground" data-testid="performance-diversa">
          {ANALISI.performance.scritta(ETICHETTA_PERFORMANCE[attuale], ETICHETTA_PERFORMANCE[proposta])}
        </p>
      ) : null}
      {confermata ? (
        <p className="text-muted-foreground" data-testid="performance-confermata">
          {ANALISI.performance.fatto(ETICHETTA_PERFORMANCE[attuale!])}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {proposta && !confermata ? (
          <Button type="button" className="h-11" disabled={inCorso} onClick={() => decidi(proposta)}>
            {ANALISI.performance.conferma(ETICHETTA_PERFORMANCE[proposta])}
          </Button>
        ) : null}
        <Button type="button" variant="outline" className="h-11" aria-expanded={cambia} onClick={() => setCambia((c) => !c)}>
          {ANALISI.performance.cambia}
        </Button>
      </div>
      {cambia ? (
        <div className="flex flex-wrap gap-2" role="group" aria-label={toastT.scegli}>
          {LIVELLI_PERFORMANCE.map((l) => (
            <Button key={l} type="button" variant={attuale === l ? 'default' : 'outline'} className="h-11" disabled={inCorso} onClick={() => decidi(l)}>
              {ETICHETTA_PERFORMANCE[l]}
            </Button>
          ))}
        </div>
      ) : null}
      {v.funzionato.length > 0 || v.da_provare.length > 0 ? (
        <details>
          <summary className="min-h-11 cursor-pointer py-2.5 text-muted-foreground">
            {toastT.funzionatoEDaProvare(ANALISI.performance.funzionato, ANALISI.performance.daProvare)}
          </summary>
          <div className="space-y-2 pb-1">
            {v.funzionato.length > 0 ? (
              <div>
                <h5 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{ANALISI.performance.funzionato}</h5>
                <ul lang="it" className="list-disc pl-5">{v.funzionato.map((f, i) => <li key={i}>{f}</li>)}</ul>
              </div>
            ) : null}
            {v.da_provare.length > 0 ? (
              <div>
                <h5 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{ANALISI.performance.daProvare}</h5>
                <ul lang="it" className="list-disc pl-5">{v.da_provare.map((f, i) => <li key={i}>{f}</li>)}</ul>
              </div>
            ) : null}
          </div>
        </details>
      ) : null}
    </section>
  )
}
