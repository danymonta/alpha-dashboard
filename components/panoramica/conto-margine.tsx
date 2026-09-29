import { EtichettaConNota } from '@/components/metriche/nota'
import { DeltaKpi } from '@/components/panoramica/tile-kpi'
import { formatEuro } from '@/lib/format'
import { LEGENDA_ECONOMICS, type VoceLegenda } from '@/lib/metriche/legenda'
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
 * lays them out, to the cent; the cash in whole euros, as in the hero tile
 * next to it, so the two read as the same number. Never gold: the gold number
 * is the hero cash.
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
  const voci: {
    etichetta: string | VoceLegenda
    valore: Importo
    compatto?: true
    segno?: string
    parola?: string
  }[] = [
    // with the cents, like the lines below: the subtraction adds up at a glance
    { etichetta: LEGENDA_ECONOMICS.cash_incassato, valore: cash },
    { etichetta: LEGENDA_ECONOMICS.provvigioni_maturate, valore: provvigioni, segno: '−', parola: 'meno' },
    { etichetta: LEGENDA_ECONOMICS.costi, valore: costi, segno: '−', parola: 'meno' },
  ]

  return (
    <section
      aria-label={titolo}
      data-testid="conto-margine"
      className={cn('rounded-xl bg-card p-4', className)}
    >
      <dl>
        {voci.map((v) => (
          <div
            key={typeof v.etichetta === 'string' ? v.etichetta : v.etichetta.etichetta}
            className="flex min-h-8 items-center justify-between gap-3"
          >
            <dt className="flex items-baseline text-sm text-muted-foreground">
              <Segno segno={v.segno} parola={v.parola} />
              {typeof v.etichetta === 'string' ? v.etichetta : <EtichettaConNota voce={v.etichetta} />}
            </dt>
            <dd className="num text-right text-sm font-medium">{formatEuro(v.valore, { compatto: v.compatto })}</dd>
          </div>
        ))}
        <div className="mt-2 grid grid-cols-[1fr_auto] items-baseline gap-x-3 border-t border-border pt-3">
          <dt className="flex items-baseline text-sm font-medium">
            <Segno segno="=" parola="uguale" />
            <EtichettaConNota voce={LEGENDA_ECONOMICS.margine_operativo} />
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
