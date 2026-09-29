'use client'

import { useSyncExternalStore } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { formatEuro, formatEuroAsse, formatMese, formatMeseBreve } from '@/lib/format'

/** One month of cash_mensile: the four parts add up to the total. */
export type PuntoCash = {
  mese: string
  nuovi_clienti: number
  rate_precedenti: number
  rinnovo: number
  upsell: number
  totale: number
}

// colour follows the entity, never the rank (CLAUDE.md section 11); the four
// colours are validated together in this stacking order (app/globals.css)
const CONFIG = {
  nuovi_clienti: { label: 'Nuovi clienti del mese', color: 'var(--chart-nuovo)' },
  rate_precedenti: { label: 'Rate di clienti già entrati', color: 'var(--chart-rate-precedenti)' },
  rinnovo: { label: 'Rinnovi', color: 'var(--chart-rinnovo)' },
  upsell: { label: 'Upsell', color: 'var(--chart-upsell)' },
} satisfies ChartConfig

const SERIE = ['nuovi_clienti', 'rate_precedenti', 'rinnovo', 'upsell'] as const

// below lg twelve labels do not fit: Recharts would drop them unevenly
const STRETTO = '(max-width: 1023.98px)'

function iscriviti(avvisa: () => void) {
  const mq = window.matchMedia(STRETTO)
  mq.addEventListener('change', avvisa)
  return () => mq.removeEventListener('change', avvisa)
}

function useStretto() {
  return useSyncExternalStore(
    iscriviti,
    () => window.matchMedia(STRETTO).matches,
    () => false,
  )
}

export function GraficoCash({ dati }: { dati: PuntoCash[] }) {
  const stretto = useStretto()
  // every other month counting back from the last one, so the selected month is always labelled
  const ticks = stretto ? dati.filter((_, i) => (dati.length - 1 - i) % 2 === 0).map((p) => p.mese) : undefined

  return (
    <ChartContainer config={CONFIG} className="aspect-auto h-64 w-full md:h-72">
      <BarChart data={dati} margin={{ top: 8, right: 4, left: 4, bottom: 0 }} accessibilityLayer>
        <CartesianGrid vertical={false} stroke="var(--alpha-border)" />
        <XAxis
          dataKey="mese"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          tickFormatter={formatMeseBreve}
          ticks={ticks}
          interval={stretto ? 0 : 'preserveEnd'}
          stroke="var(--alpha-text-muted)"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          tickFormatter={formatEuroAsse}
          stroke="var(--alpha-text-muted)"
        />
        <ChartTooltip
          cursor={{ fill: 'var(--alpha-surface-2)' }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const mese = payload?.[0]?.payload?.mese as string | undefined
                return mese ? formatMese(mese) : null
              }}
              formatter={(valore, nome, item) => (
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: item.color }} />
                    {CONFIG[nome as keyof typeof CONFIG]?.label ?? nome}
                  </span>
                  <span className="num font-medium text-foreground">{formatEuro(Number(valore))}</span>
                </div>
              )}
            />
          }
        />
        {/* four long labels: they wrap on a phone instead of widening the page */}
        <ChartLegend content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-1" />} />
        {SERIE.map((serie, i) => (
          <Bar
            key={serie}
            dataKey={serie}
            stackId="cash"
            fill={`var(--color-${serie})`}
            maxBarSize={24}
            // data screens stay still (section 11): no growing-bar animation
            isAnimationActive={false}
            // 2px surface gap between stacked segments; 4px rounded data end on top
            stroke="var(--card)"
            strokeWidth={2}
            radius={i === SERIE.length - 1 ? [4, 4, 0, 0] : 0}
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}
