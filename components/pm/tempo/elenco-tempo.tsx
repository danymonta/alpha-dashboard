import { Clock } from 'lucide-react'
import type { ReactNode } from 'react'

import { formatOra } from '@/lib/date'
import { formatDurata, intestazioneGiorno, perGiorno } from '@/lib/tempo'

export type VoceTempo = {
  id: string
  data: string
  inizio: string | null
  fine: string | null
  minuti: number
  nota: string | null
  /** First line: the project on "Il mio tempo", the person on a project. */
  titolo: string
  /** After the title: the task, when there is one. */
  dettaglio: string | null
}

/**
 * Time entries grouped by day, most recent first. The day totals come from
 * SQL (pm_riepilogo_tempo / pm_tempo_progetto), never summed here.
 */
export function ElencoTempo({
  voci,
  totaliGiorno,
  oggi,
  azioni,
}: {
  voci: readonly VoceTempo[]
  totaliGiorno: ReadonlyMap<string, number>
  oggi: string
  /** Edit and delete buttons of an entry, when the viewer may use them. */
  azioni?: (voce: VoceTempo) => ReactNode
}) {
  return (
    <div className="space-y-5">
      {perGiorno(voci).map(({ data, righe }) => {
        const idTitolo = `giorno-${data}`
        return (
          <section key={data} aria-labelledby={idTitolo} data-testid={`giorno-${data}`} className="space-y-2">
            <div className="flex items-baseline justify-between gap-3 px-1">
              <h3 id={idTitolo} className="text-sm font-medium first-letter:uppercase">
                {intestazioneGiorno(data, oggi)}
              </h3>
              <p className="num text-sm font-medium" data-testid="totale-giorno">
                <span className="sr-only">Totale del giorno: </span>
                {formatDurata(totaliGiorno.get(data) ?? 0)}
              </p>
            </div>
            <ul className="divide-y divide-border rounded-xl bg-card">
              {righe.map((voce) => (
                <li key={voce.id} className="flex items-center gap-3 py-2 pr-1 pl-3" data-testid="voce-tempo">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {voce.titolo}
                      {voce.dettaglio ? <span className="font-normal text-muted-foreground"> · {voce.dettaglio}</span> : null}
                    </p>
                    <p className="num flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="size-3 shrink-0" aria-hidden="true" />
                      {voce.inizio && voce.fine ? `${formatOra(voce.inizio)}–${formatOra(voce.fine)}` : 'Inserito a mano'}
                    </p>
                    {voce.nota ? (
                      <p className="mt-0.5 line-clamp-2 text-xs whitespace-pre-line text-muted-foreground">{voce.nota}</p>
                    ) : null}
                  </div>
                  <p className="num shrink-0 text-right text-sm font-medium">{formatDurata(voce.minuti)}</p>
                  {azioni ? <div className="flex shrink-0">{azioni(voce)}</div> : null}
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
