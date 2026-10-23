import { BarChart3 } from 'lucide-react'
import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { LinkBottone } from '@/components/link-bottone'
import { Funnel, type FaseFunnel } from '@/components/panoramica/funnel'
import { TileKpi } from '@/components/panoramica/tile-kpi'
import { SelettorePeriodo } from '@/components/pagina/selettore-periodo'
import { GraficoRecap, type PuntoGrafico, type SerieRecap } from '@/components/recap/grafico-recap'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { RUOLI_RECAP } from '@/lib/auth/roles'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { formato } from '@/lib/format'
import { getLingua } from '@/lib/i18n/server'
import { RECAP } from '@/lib/i18n/testi/recap'
import { leggiPeriodo } from '@/lib/periodo'
import { etichettaPunto, leggiRecap, recapVuoto, type PuntoRecap } from '@/lib/recap/recap'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return { title: RECAP[await getLingua()].titolo }
}

function Scheda({ titolo, descrizione, children }: { titolo: string; descrizione?: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl bg-card p-4">
      <div className="mb-4 min-w-0">
        <h2 className="text-sm font-medium">{titolo}</h2>
        {descrizione ? <p className="mt-0.5 text-xs text-muted-foreground">{descrizione}</p> : null}
      </div>
      {children}
    </section>
  )
}

/** The table view of a chart: the same numbers, one row per point (CLAUDE.md section 11). */
function TabellaSerie({
  titolo,
  etichette,
  serie,
  dati,
  valore,
  vediTabella,
  colonnaPeriodo,
}: {
  titolo: string
  etichette: string[]
  serie: SerieRecap[]
  dati: PuntoGrafico[]
  valore: (n: number) => string
  vediTabella: string
  colonnaPeriodo: string
}) {
  return (
    <details className="mt-2">
      <summary className="flex min-h-11 cursor-pointer items-center text-sm text-muted-foreground">{vediTabella}</summary>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <caption className="sr-only">{titolo}</caption>
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="py-2 text-left font-normal">{colonnaPeriodo}</th>
              {serie.map((s) => (
                <th key={s.chiave} scope="col" className="py-2 pl-3 text-right font-normal">{s.etichetta}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {dati.map((p, i) => (
              <tr key={`${p.lunga}-${i}`}>
                <th scope="row" className="py-2 text-left font-normal whitespace-nowrap">{etichette[i]}</th>
                {serie.map((s) => (
                  <td key={s.chiave} className="num py-2 pl-3 text-right whitespace-nowrap">{valore(Number(p[s.chiave]))}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  )
}

/**
 * Recap vendite (1.58.0, Dany, 23/10/2026): the business coach's one page, and the admin's
 * view of it. Aggregates of the sales funnel only: DMs, conversations, calls, cash and
 * revenue of new clients, never a name, a client, costs, margin or commissions. Every
 * number, rate, delta, funnel stage and point of the series comes from recap_sales()
 * (SQL); here only formatting and layout.
 */
export default async function RecapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireRuolo(RUOLI_RECAP)
  const lingua = await getLingua()
  const t = RECAP[lingua]
  const { formatEuro, formatMese, formatMeseBreve, formatNumero, formatPercentuale } = formato(lingua)

  const oggi = oggiRoma()
  const periodo = leggiPeriodo(await searchParams, oggi, lingua)
  const supabase = await createClient()
  const { data, error } = await supabase.rpc('recap_sales', { p_da: periodo.da, p_a: periodo.a })
  if (error || data === null) throw new Error(t.errore)

  const r = leggiRecap(data)
  const v = r.valori
  const confronto = periodo.confronto

  const intestazione = (
    <header className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2">
      <div className="min-w-0">
        <h1 className="font-heading text-xl font-semibold md:text-2xl">{t.titolo}</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">{t.descrizione}</p>
      </div>
      <SelettorePeriodo periodo={periodo} oggi={oggi} percorso="/recap" className="md:-mr-3" />
    </header>
  )

  if (recapVuoto(r)) {
    return (
      <div className="space-y-5">
        {intestazione}
        <StatoVuoto
          Icona={BarChart3}
          titolo={t.vuotoTitolo}
          descrizione={t.vuotoDescrizione}
          azione={
            <LinkBottone href="/recap" variant="outline">
              {t.vuotoAzione}
            </LinkBottone>
          }
        />
      </div>
    )
  }

  // the stages of funnel_periodo, with where they come from and the rates of the overview
  const FONTE: Record<string, string> = {
    'DM totali': t.dalReport,
    Conversazioni: t.dalReport,
    'Call prenotate': t.dalReport,
    'Call svolte': t.dalleCall,
    Chiuse: t.dalleCall,
  }
  const fasi: FaseFunnel[] = r.funnel.map((f) => ({
    ...f,
    fase: t.fasi[f.fase] ?? f.fase,
    fonte: FONTE[f.fase],
    tasso:
      f.fase === 'Conversazioni'
        ? { etichetta: t.tassoConv, spiegazione: t.tassoConvNota }
        : f.fase === 'Call svolte'
          ? { etichetta: t.showRateBreve, spiegazione: t.showRateNota, valore: v.show_rate }
          : undefined,
  }))

  // the series: labels are formatted here, the values are SQL's
  const mese = { breve: formatMeseBreve, lungo: formatMese }
  const etichetta = (p: PuntoRecap) => etichettaPunto(p, r.granularita, lingua, mese, t.settimanaDal)
  const punti = (chiavi: (keyof PuntoRecap)[]): PuntoGrafico[] =>
    r.serie.map((p) => {
      const e = etichetta(p)
      return { breve: e.breve, lunga: e.lunga, ...Object.fromEntries(chiavi.map((k) => [k, Number(p[k])])) }
    })
  const lunghe = r.serie.map((p) => etichetta(p).lunga)
  const quando = t.granularita[r.granularita]

  const SERIE_DM: SerieRecap[] = [
    { chiave: 'dm_outbound', etichetta: t.serieOutbound, colore: 'var(--chart-dm-outbound)' },
    { chiave: 'dm_inbound', etichetta: t.serieInbound, colore: 'var(--chart-dm-inbound)' },
    { chiave: 'follow_up', etichetta: t.serieFollowUp, colore: 'var(--chart-dm-follow-up)' },
  ]
  const SERIE_CALL: SerieRecap[] = [
    { chiave: 'call_svolte', etichetta: t.serieSvolte, colore: 'var(--chart-call-svolte)' },
    { chiave: 'chiuse', etichetta: t.serieChiuse, colore: 'var(--chart-nuovo)' },
  ]
  const SERIE_CASH: SerieRecap[] = [
    { chiave: 'cash_nuovi_clienti', etichetta: t.serieCash, colore: 'var(--chart-nuovo)' },
  ]
  const datiDm = punti(['dm_outbound', 'dm_inbound', 'follow_up'])
  const datiCall = punti(['call_svolte', 'chiuse'])
  const datiCash = punti(['cash_nuovi_clienti'])
  const numero = (n: number) => formatNumero(n)
  const euro = (n: number) => formatEuro(n)
  const comuni = {
    etichette: lunghe,
    vediTabella: t.vediTabella,
    colonnaPeriodo: t.periodoColonna,
  }

  return (
    <div className="space-y-5">
      {intestazione}

      {/* the answer first: the cash the calls brought in, the one gold number */}
      <div className="grid gap-3 lg:grid-cols-[1.4fr_2fr]" data-testid="recap-kpi">
        <TileKpi
          hero
          etichetta={{ etichetta: t.cash, spiegazione: t.cashNota }}
          valore={formatEuro(v.cash_nuovi_clienti, { compatto: true })}
          delta={r.delta.cash_nuovi_clienti}
          confronto={confronto}
          className="flex flex-col justify-center"
        />
        <div className="grid grid-cols-2 content-start gap-3">
          <TileKpi
            etichetta={{ etichetta: t.revenue, spiegazione: t.revenueNota }}
            valore={formatEuro(v.revenue_nuovi, { compatto: true })}
            delta={r.delta.revenue_nuovi}
            confronto={confronto}
          />
          <TileKpi
            etichetta={{ etichetta: t.chiuse, spiegazione: t.chiuseNota }}
            valore={formatNumero(v.chiuse)}
            delta={r.delta.chiuse}
            confronto={confronto}
          >
            <p className="mt-1 text-xs text-muted-foreground num">{t.closeRate(formatPercentuale(v.close_rate))}</p>
          </TileKpi>
          <TileKpi
            etichetta={{ etichetta: t.svolte, spiegazione: t.svolteNota }}
            valore={formatNumero(v.call_svolte)}
            delta={r.delta.call_svolte}
            confronto={confronto}
          >
            <p className="mt-1 text-xs text-muted-foreground num">{t.showRate(formatPercentuale(v.show_rate))}</p>
          </TileKpi>
          <TileKpi
            etichetta={{ etichetta: t.prenotate, spiegazione: t.prenotateNota }}
            valore={formatNumero(v.call_prenotate)}
            delta={r.delta.call_prenotate}
            confronto={confronto}
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2" data-testid="recap-setting">
        <TileKpi
          etichetta={{ etichetta: t.dm, spiegazione: t.dmNota }}
          valore={formatNumero(v.dm_totali)}
          delta={r.delta.dm_totali}
          confronto={confronto}
        >
          <p className="mt-1 text-xs text-muted-foreground num">
            {t.dmParti(formatNumero(v.dm_outbound), formatNumero(v.dm_inbound), formatNumero(v.follow_up))}
          </p>
        </TileKpi>
        <TileKpi
          etichetta={{ etichetta: t.conversazioni, spiegazione: t.conversazioniNota }}
          valore={formatNumero(v.conversazioni)}
          delta={r.delta.conversazioni}
          confronto={confronto}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Scheda titolo={t.funnel} descrizione={t.funnelDescrizione}>
          <Funnel fasi={fasi} />
        </Scheda>
        <Scheda titolo={t.graficoDm} descrizione={quando}>
          <GraficoRecap dati={datiDm} serie={SERIE_DM} impilato />
          <TabellaSerie titolo={t.graficoDm} serie={SERIE_DM} dati={datiDm} valore={numero} {...comuni} />
        </Scheda>
        <Scheda titolo={t.graficoCall} descrizione={quando}>
          <GraficoRecap dati={datiCall} serie={SERIE_CALL} />
          <TabellaSerie titolo={t.graficoCall} serie={SERIE_CALL} dati={datiCall} valore={numero} {...comuni} />
        </Scheda>
        <Scheda titolo={t.graficoCash} descrizione={quando}>
          <GraficoRecap dati={datiCash} serie={SERIE_CASH} euro />
          <TabellaSerie titolo={t.graficoCash} serie={SERIE_CASH} dati={datiCash} valore={euro} {...comuni} />
        </Scheda>
      </div>
    </div>
  )
}
