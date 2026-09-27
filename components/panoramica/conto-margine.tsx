import { DeltaKpi } from '@/components/panoramica/tile-kpi'
import { formatEuro } from '@/lib/format'
import { cn } from '@/lib/utils'

type Importo = number | string | null | undefined

type Props = {
  cash: Importo
  provvigioni: Importo
  costi: Importo
  margine: Importo
  /** relative change of the margin from SQL (kpi_panoramica.delta) */
  delta: number | null
  confronto: string
  /** Accessible name of the block, e.g. "Margine operativo a settembre 2026". */
  titolo?: string
  className?: string
}

function Segno({ segno, parola }: { segno?: string; parola?: string }) {
  return (
    <>
      <span aria-hidden="true" className="num inline-block w-4 shrink-0 text-muted-foreground">
        {segno}
      </span>
      {parola ? <span className="sr-only">{parola} </span> : null}
    </>
  )
}

/**
 * The month's bottom line, spelled out: cash − commissions − costs.
 * Every amount comes from SQL (metriche_periodo, kpi_periodo): this only
 * lays them out, to the cent. Never gold: the gold number is the hero cash.
 * Always "Margine operativo", never "utile": taxes are not included.
 */
export function ContoMargine({
  cash,
  provvigioni,
  costi,
  margine,
  delta,
  confronto,
  titolo = 'Margine operativo del mese',
  className,
}: Props) {
  const voci: { etichetta: string; valore: Importo; segno?: string; parola?: string }[] = [
    { etichetta: 'Cash incassato', valore: cash },
    { etichetta: 'Provvigioni maturate', valore: provvigioni, segno: '−', parola: 'meno' },
    { etichetta: 'Costi', valore: costi, segno: '−', parola: 'meno' },
  ]

  return (
    <section
      aria-label={titolo}
      data-testid="conto-margine"
      className={cn('rounded-xl bg-card p-4', className)}
    >
      <dl>
        {voci.map((v) => (
          <div key={v.etichetta} className="flex min-h-8 items-center justify-between gap-3">
            <dt className="flex items-baseline text-sm text-muted-foreground">
              <Segno segno={v.segno} parola={v.parola} />
              {v.etichetta}
            </dt>
            <dd className="num text-right text-sm font-medium">{formatEuro(v.valore)}</dd>
          </div>
        ))}
        <div className="mt-2 grid grid-cols-[1fr_auto] items-baseline gap-x-3 border-t border-border pt-3">
          <dt className="flex items-baseline text-sm font-medium">
            <Segno segno="=" parola="uguale" />
            <span>Margine operativo</span>
          </dt>
          <dd className="num text-right text-3xl font-semibold tracking-tight text-foreground">
            {formatEuro(margine)}
          </dd>
          <dd className="col-span-2 mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="pl-4 text-xs text-muted-foreground">Tasse escluse.</span>
            <DeltaKpi delta={delta} confronto={confronto} />
          </dd>
        </div>
      </dl>
    </section>
  )
}
