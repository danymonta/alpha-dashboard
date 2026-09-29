import { EtichettaConNota } from '@/components/metriche/nota'
import { formatNumero, formatPercentuale } from '@/lib/format'

export type FaseFunnel = {
  ordine: number
  fase: string
  valore: number
  passaggio: number | null
  /** What the stage counts and where it comes from: the label gets an "i". */
  nota?: string
  /** Where the number comes from ("Dal report dei setter"): a caption where it changes. */
  fonte?: string
  /**
   * The rate shown instead of "% passa" when the stage is not a subset of the
   * one before: conversations are not part of DM totali (same SQL value, its
   * own words); the calls held come from another source than the bookings, so
   * they show their show rate, another SQL value (`valore`).
   */
  tasso?: { etichetta: string; spiegazione: string; valore?: number | null }
}

/**
 * Horizontal funnel. Bar length is only the visual scale of each stage against
 * the largest; the conversion rates come from SQL (funnel_periodo).
 */
export function Funnel({ fasi }: { fasi: FaseFunnel[] }) {
  const massimo = Math.max(1, ...fasi.map((f) => f.valore))

  return (
    <ol className="space-y-3">
      {fasi.map((f, i) => (
        <li key={f.ordine}>
          {f.fonte && f.fonte !== fasi[i - 1]?.fonte ? (
            <p className={i > 0 ? 'mb-2 border-t border-border pt-3 text-xs text-muted-foreground' : 'mb-2 text-xs text-muted-foreground'}>
              {f.fonte}
            </p>
          ) : null}
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span className="min-w-0">
              {f.nota ? <EtichettaConNota voce={{ etichetta: f.fase, spiegazione: f.nota }} /> : f.fase}
            </span>
            <span className="flex shrink-0 items-baseline gap-2">
              <span className="num font-medium">{formatNumero(f.valore)}</span>
              {f.ordine > 1 ? (
                <span className="num w-32 text-right text-xs whitespace-nowrap text-muted-foreground">
                  {f.tasso ? (
                    <EtichettaConNota
                      className="justify-end"
                      voce={{
                        etichetta: `${f.tasso.etichetta} ${formatPercentuale(f.tasso.valore === undefined ? f.passaggio : f.tasso.valore)}`,
                        spiegazione: f.tasso.spiegazione,
                      }}
                    />
                  ) : (
                    `${formatPercentuale(f.passaggio)} passa`
                  )}
                </span>
              ) : (
                <span className="w-32" />
              )}
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-muted" aria-hidden="true">
            <div
              className="h-full rounded-full bg-primary-light"
              style={{ width: `${Math.max(f.valore > 0 ? 2 : 0, (f.valore / massimo) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  )
}
