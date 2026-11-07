import { cn } from '@/lib/utils'

/**
 * The cash of the period as one bar in its four parts (1.72.0). Every amount
 * comes from SQL (metriche_periodo): the widths only draw them, each part over
 * the SQL total. A refund can make a part negative: it draws as nothing. The
 * numbers are named right under it, so the bar is decoration for the eye.
 */
export function BarraParti({
  totale,
  parti,
}: {
  totale: number
  parti: { chiave: string; colore: string; valore: number }[]
}) {
  if (!(totale > 0)) return null
  return (
    <div aria-hidden="true" className="mt-5 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-muted">
      {parti.map(({ chiave, colore, valore }) => {
        const quota = Math.max(0, Math.min(1, valore / totale))
        return quota > 0 ? (
          <span key={chiave} className={cn('h-full first:rounded-l-full last:rounded-r-full', colore)} style={{ width: `${quota * 100}%` }} />
        ) : null
      })}
    </div>
  )
}
