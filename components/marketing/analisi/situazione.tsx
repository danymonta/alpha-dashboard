import { CircleCheck, Clock, TriangleAlert } from 'lucide-react'

import { quando } from '@/app/(app)/settings/instagram/quando'
import type { Situazione } from '@/lib/marketing/analisi/elenco'

const FRASE = {
  attive: 'Claude lavora solo quando premi «Analizza»: l’analisi e il punteggio partono da lì. Di notte si trascrive solo il parlato dei reel nuovi.',
  in_pausa_spesa: 'Le analisi sono in pausa: il limite di spesa del mese è raggiunto.',
  ferme_chiave: 'Le analisi sono ferme: manca la chiave di Claude.',
  spente: 'Claude lavora solo quando premi «Analizza»: l’analisi e il punteggio partono da lì. Le trascrizioni di notte sono spente.',
} as const

/**
 * The line under the title: what the work is doing, as marketing_lavori_situazione
 * says it (the video editor reads it too: no money in it, no person). A read
 * that failed says nothing.
 */
export function RigaSituazione({
  situazione,
  oggi,
  permesso,
  accountStatistiche,
}: {
  situazione: Situazione | null
  oggi: string
  /** Meta said the permission for the statistics is missing: false */
  permesso: boolean | null
  accountStatistiche?: string
}) {
  if (!situazione && permesso !== false) return null
  const s = situazione
  const buona = s?.automatiche === 'attive'
  return (
    <div className="space-y-1.5" data-testid="analisi-situazione">
      {s ? (
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          {buona ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
          ) : (
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
          )}
          <span>
            {FRASE[s.automatiche]}
            {s.in_coda > 0 ? ` ${s.in_coda === 1 ? '1 lavoro in coda' : `${s.in_coda} lavori in coda`}.` : ''}
          </span>
        </p>
      ) : null}
      {s?.ultimo_passo_il ? (
        <p className="num flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="size-4 shrink-0" aria-hidden="true" />
          Ultimo lavoro {quando(s.ultimo_passo_il, oggi)}
        </p>
      ) : null}
      {permesso === false ? (
        <p className="flex items-start gap-1.5 text-sm text-status-warning" role="status">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          Instagram non dà ancora le statistiche dei post{accountStatistiche ? ` di ${accountStatistiche}` : ''}: i numeri
          arrivano quando l’admin rinnova il token con il permesso giusto.
        </p>
      ) : null}
    </div>
  )
}
