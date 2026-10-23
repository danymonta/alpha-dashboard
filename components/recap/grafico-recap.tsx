'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'

import { useLingua } from '@/components/i18n/lingua-provider'
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '@/components/ui/chart'
import { formato } from '@/lib/format'

/** One series: its key in the points, its label and its colour token (the entity's, never the rank's). */
export type SerieRecap = { chiave: string; etichetta: string; colore: string }

/** One point: the axis tick, the tooltip label and a value per series (all from SQL). */
export type PuntoGrafico = { breve: string; lunga: string } & Record<string, number | string>

/**
 * A bar chart of the sales recap (1.58.0): one y axis, thin bars, a legend with two or more
 * series, the tooltip on hover or tap, text in text colours. `impilato` stacks parts of
 * one total (the DMs); otherwise the series stand side by side (calls held and closed:
 * the closed are a part of the held, stacking them would count them twice).
 */
export function GraficoRecap({
  dati,
  serie,
  impilato = false,
  euro = false,
}: {
  dati: PuntoGrafico[]
  serie: SerieRecap[]
  impilato?: boolean
  euro?: boolean
}) {
  const lingua = useLingua()
  const { formatEuro, formatEuroAsse, formatNumero } = formato(lingua)
  const config = Object.fromEntries(
    serie.map((s) => [s.chiave, { label: s.etichetta, color: s.colore }]),
  ) satisfies ChartConfig
  const valore = (n: number) => (euro ? formatEuro(n, { compatto: true }) : formatNumero(n))
  // many days: the axis keeps about six labels (they fit at 390 px next to the euro axis), always the last one
  const passo = Math.max(1, Math.ceil(dati.length / 6))
  const ticks = dati.filter((_, i) => (dati.length - 1 - i) % passo === 0).map((p) => p.breve)

  return (
    <ChartContainer config={config} className="aspect-auto h-60 w-full md:h-72">
      <BarChart data={dati} margin={{ top: 8, right: 16, left: 4, bottom: 0 }} barGap={2} accessibilityLayer>
        <CartesianGrid vertical={false} stroke="var(--alpha-border)" />
        <XAxis
          dataKey="breve"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          ticks={ticks}
          interval={0}
          stroke="var(--alpha-text-muted)"
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={euro ? 56 : 40}
          allowDecimals={false}
          tickFormatter={(n: number) => (euro ? formatEuroAsse(n) : formatNumero(n))}
          stroke="var(--alpha-text-muted)"
        />
        <ChartTooltip
          cursor={{ fill: 'var(--alpha-surface-2)' }}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => (payload?.[0]?.payload?.lunga as string | undefined) ?? null}
              formatter={(v, nome, item) => (
                <div className="flex w-full items-center justify-between gap-4">
                  <span className="flex items-center gap-1.5 text-muted-foreground">
                    <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: item.color }} />
                    {config[nome as string]?.label ?? nome}
                  </span>
                  <span className="num font-medium text-foreground">{valore(Number(v))}</span>
                </div>
              )}
            />
          }
        />
        {serie.length > 1 ? (
          <ChartLegend content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-1" />} />
        ) : null}
        {serie.map((s, i) => (
          <Bar
            key={s.chiave}
            dataKey={s.chiave}
            stackId={impilato ? 'recap' : undefined}
            fill={`var(--color-${s.chiave})`}
            maxBarSize={impilato ? 24 : 14}
            // data screens stay still (section 11): no growing-bar animation
            isAnimationActive={false}
            // 2px surface gap between stacked segments (side by side: barGap); 4px rounded data end.
            // A stroke on thin side-by-side bars (a month of days on a phone) would hide them.
            stroke={impilato ? 'var(--card)' : undefined}
            strokeWidth={impilato ? 2 : 0}
            radius={!impilato || i === serie.length - 1 ? [4, 4, 0, 0] : 0}
          />
        ))}
      </BarChart>
    </ChartContainer>
  )
}
