import { EtichettaConNota } from '@/components/metriche/nota'
import { DeltaKpi } from '@/components/panoramica/tile-kpi'
import { formato } from '@/lib/format'
import { getLingua } from '@/lib/i18n/server'
import { PANORAMICA } from '@/lib/i18n/testi/panoramica'
import type { VoceLegenda } from '@/lib/metriche/legenda'
import { legende } from '@/lib/metriche/legenda-en'
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
export async function ContoMargine({
  cash,
  provvigioni,
  costi,
  margine,
  delta,
  confronto,
  titolo,
  className,
}: Props) {
  const lingua = await getLingua()
  const t = PANORAMICA[lingua]
  const { formatEuro } = formato(lingua)
  const LEGENDA_ECONOMICS = legende(lingua).economics
  const voci: {
    etichetta: string | VoceLegenda
    valore: Importo
    compatto?: true
    segno?: string
    parola?: string
  }[] = [
    // with the cents, like the lines below: the subtraction adds up at a glance
    { etichetta: LEGENDA_ECONOMICS.cash_incassato, valore: cash },
    { etichetta: LEGENDA_ECONOMICS.provvigioni_maturate, valore: provvigioni, segno: '−', parola: t.meno },
    { etichetta: LEGENDA_ECONOMICS.costi, valore: costi, segno: '−', parola: t.meno },
  ]

  return (
    <section
      aria-label={titolo ?? t.margineMese}
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
            <Segno segno="=" parola={t.uguale} />
            <EtichettaConNota voce={LEGENDA_ECONOMICS.margine_operativo} />
          </dt>
          <dd className="num text-right text-3xl font-semibold tracking-tight text-foreground">
            {formatEuro(margine)}
          </dd>
          <dd className="col-span-2 mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span className="pl-4 text-xs text-muted-foreground">{t.tasseEscluse}</span>
            <DeltaKpi delta={delta} confronto={confronto} />
          </dd>
        </div>
      </dl>
    </section>
  )
}
