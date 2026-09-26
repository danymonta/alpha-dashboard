import { formatNumero, formatPercentuale } from '@/lib/format'

export type FaseFunnel = { ordine: number; fase: string; valore: number; passaggio: number | null }

/**
 * Horizontal funnel. Bar length is only the visual scale of each stage against
 * the first; the conversion rates come from SQL (funnel_mese).
 */
export function Funnel({ fasi }: { fasi: FaseFunnel[] }) {
  const massimo = Math.max(1, ...fasi.map((f) => f.valore))

  return (
    <ol className="space-y-3">
      {fasi.map((f) => (
        <li key={f.ordine}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
            <span>{f.fase}</span>
            <span className="flex items-baseline gap-2">
              <span className="num font-medium">{formatNumero(f.valore)}</span>
              {f.ordine > 1 ? (
                <span className="num w-20 text-right text-xs text-muted-foreground">
                  {formatPercentuale(f.passaggio)} passa
                </span>
              ) : (
                <span className="w-20" />
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
