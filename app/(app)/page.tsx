import { CalendarClock, ChevronRight, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { Fragment, type ReactNode } from 'react'

import { LinkBottone } from '@/components/link-bottone'
import { LegendaSezione } from '@/components/metriche/legenda-sezione'
import { EtichettaConNota } from '@/components/metriche/nota'
import { AggiornamentoLive } from '@/components/panoramica/aggiornamento-live'
import { ContoMargine } from '@/components/panoramica/conto-margine'
import { Funnel } from '@/components/panoramica/funnel'
import { GraficoCash } from '@/components/panoramica/grafico-cash'
import { ObiettiviMese } from '@/components/panoramica/obiettivi'
import { TileKpi } from '@/components/panoramica/tile-kpi'
import { SelettorePeriodo } from '@/components/pagina/selettore-periodo'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import {
  formatData,
  formatEuro,
  formatMese,
  formatNumero,
  formatPercentuale,
  formatRapporto,
} from '@/lib/format'
import { LEGENDA_CLOSER, LEGENDA_ECONOMICS, LEGENDA_SETTING, type VoceLegenda } from '@/lib/metriche/legenda'
import { contieneData, leggiPeriodo } from '@/lib/periodo'
import { createClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'
import { ETICHETTA_FONTE } from '@/lib/validation/call'

export const dynamic = 'force-dynamic'

// The two sources of the funnel, never mixed without saying so: the setters'
// daily report (the first three stages) and the calls recorded in the app.
const DAL_REPORT = 'Dal report giornaliero dei setter'
const DALLE_CALL = 'Dalle call registrate nell’app'

// what every funnel stage (funnel_periodo) counts, and where it comes from
const FASI_FUNNEL: Record<string, { fonte: string; nota: string }> = {
  'DM totali': { fonte: DAL_REPORT, nota: `${DAL_REPORT}. ${LEGENDA_SETTING.dm_totali.spiegazione}` },
  Conversazioni: { fonte: DAL_REPORT, nota: `${DAL_REPORT}. ${LEGENDA_SETTING.conversazioni.spiegazione}` },
  'Call prenotate': { fonte: DAL_REPORT, nota: `${DAL_REPORT}. ${LEGENDA_SETTING.call_prenotate.spiegazione}` },
  'Call svolte': { fonte: DALLE_CALL, nota: `${DALLE_CALL}. ${LEGENDA_CLOSER.call.spiegazione}` },
  Chiuse: { fonte: DALLE_CALL, nota: `${DALLE_CALL}. ${LEGENDA_CLOSER.chiuse.spiegazione}` },
}

// conversations are not a part of DM totali (Dany, 28/09/2026): no "% passa"
// on that stage, the conversation rate instead (the same SQL value)
const TASSO_CONVERSAZIONE = {
  etichetta: 'tasso conv.',
  spiegazione: `${LEGENDA_SETTING.tasso_conversazione.etichetta}: ${LEGENDA_SETTING.tasso_conversazione.spiegazione} Le conversazioni non sono una parte dei DM totali: per questo qui non c’è «passa».`,
}

// the calls held come from the calls in the app, the bookings above from the
// report: two sources, no "% passa" between them. The show rate instead
// (metriche_periodo), which stays within the calls
const SHOW_RATE = {
  etichetta: 'show rate',
  spiegazione: `${LEGENDA_CLOSER.show_rate.etichetta}: ${LEGENDA_CLOSER.show_rate.spiegazione} Le call prenotate vengono dal report dei setter, le svolte dalle call registrate nell’app: due fonti diverse, per questo qui non c’è «passa».`,
}

const KPI: Record<string, { voce: VoceLegenda; euro: boolean }> = {
  cash_incassato: { voce: LEGENDA_ECONOMICS.cash_incassato, euro: true },
  revenue_firmata: { voce: LEGENDA_ECONOMICS.revenue_firmata, euro: true },
  nuovi_clienti: { voce: LEGENDA_ECONOMICS.nuovi_clienti, euro: false },
  rinnovi: { voce: LEGENDA_ECONOMICS.rinnovi, euro: false },
  // always "Margine operativo", never "utile": taxes are not included
  margine_operativo: { voce: LEGENDA_ECONOMICS.margine_operativo, euro: true },
}

// "Oggi dal team": the id is the test id ("oggi-DM" predates the "DM totali" label);
// "sotto" is a smaller line under the value
type VoceOggi = [id: string, voce: VoceLegenda, valore: string, sotto?: string]

// The cash of the period in four parts (metriche_periodo, 29/09/2026): they
// always add up to the hero. The colours are the chart's, bound to the part.
const PARTI_CASH = [
  { chiave: 'cash_nuovi_clienti', voce: LEGENDA_ECONOMICS.cash_nuovi_clienti, colore: 'bg-chart-nuovo' },
  { chiave: 'cash_rate_precedenti', voce: LEGENDA_ECONOMICS.cash_rate_precedenti, colore: 'bg-chart-rate-precedenti' },
  { chiave: 'cash_rinnovo', voce: LEGENDA_ECONOMICS.cash_rinnovi, colore: 'bg-chart-rinnovo' },
  { chiave: 'cash_upsell', voce: LEGENDA_ECONOMICS.cash_upsell, colore: 'bg-chart-upsell' },
] as const

// every number of the page, in reading order: "Cosa significa ogni numero"
const LEGENDA_PAGINA: VoceLegenda[] = [
  LEGENDA_ECONOMICS.cash_incassato,
  ...PARTI_CASH.map((p) => p.voce),
  LEGENDA_ECONOMICS.revenue_firmata,
  LEGENDA_ECONOMICS.nuovi_clienti,
  LEGENDA_ECONOMICS.rinnovi,
  LEGENDA_ECONOMICS.margine_operativo,
  LEGENDA_ECONOMICS.provvigioni_maturate,
  LEGENDA_ECONOMICS.costi,
  LEGENDA_ECONOMICS.in_ritardo,
  LEGENDA_ECONOMICS.prossimi_30,
  LEGENDA_ECONOMICS.oltre_30,
  LEGENDA_SETTING.dm_totali,
  LEGENDA_SETTING.conversazioni,
  LEGENDA_SETTING.tasso_conversazione,
  LEGENDA_SETTING.call_prenotate,
  LEGENDA_ECONOMICS.call_da_fare,
  LEGENDA_CLOSER.call,
  LEGENDA_CLOSER.chiuse,
  LEGENDA_ECONOMICS.incassato_oggi,
  LEGENDA_SETTING.cash_per_dm,
  LEGENDA_SETTING.revenue_per_dm,
  LEGENDA_SETTING.dm_per_call,
  LEGENDA_ECONOMICS.cash_per_call_svolta,
  LEGENDA_ECONOMICS.valore_medio_nuovo,
  LEGENDA_CLOSER.show_rate,
  LEGENDA_CLOSER.close_rate,
  LEGENDA_CLOSER.close_rate_qualificate,
  LEGENDA_ECONOMICS.tasso_rinnovo,
]

function Scheda({
  titolo,
  descrizione,
  azione,
  children,
  className,
}: {
  titolo: string
  /** One line under the title: what the numbers are counted on. */
  descrizione?: ReactNode
  azione?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`rounded-xl bg-card p-4 ${className ?? ''}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-medium">{titolo}</h2>
          {descrizione ? <p className="mt-0.5 text-xs text-muted-foreground">{descrizione}</p> : null}
        </div>
        {azione}
      </div>
      {children}
    </section>
  )
}

/** A label, or a legend entry whose label gets its "i". */
function Etichetta({ etichetta }: { etichetta: string | VoceLegenda }) {
  return typeof etichetta === 'string' ? etichetta : <EtichettaConNota voce={etichetta} />
}

function Voce({ etichetta, valore, nota }: { etichetta: string | VoceLegenda; valore: string; nota?: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 py-2">
      <dt className="text-sm text-muted-foreground">
        <Etichetta etichetta={etichetta} />
        {nota ? <span className="block text-xs">{nota}</span> : null}
      </dt>
      <dd className="num text-right text-sm font-medium">{valore}</dd>
    </div>
  )
}

export default async function PanoramicaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Admin only: every other role goes to its own landing page (setter /today,
  // closer /calls, the roles without Economics /progetti)
  await requireRuolo(['admin'])

  const oggi = oggiRoma()
  // a month (?mese=) or any range (?da=&a=); the comparison window comes with it
  const periodo = leggiPeriodo(await searchParams, oggi)
  const intervallo = { p_da: periodo.da, p_a: periodo.a }
  // live numbers only make sense while the period includes today
  const inCorso = contieneData(periodo, oggi)
  const unMese = periodo.mese !== null
  const supabase = await createClient()

  // Every number below is computed by SQL functions (CLAUDE.md section 9).
  const [kpi, metriche, cash, funnel, incassare, ritardi, scadenze, team, obiettivi, fonti] = await Promise.all([
    supabase.rpc('kpi_periodo', intervallo),
    supabase.rpc('metriche_periodo', intervallo).single(),
    // the trend stays monthly: the 12 months up to the end of the period (never the future)
    supabase.rpc('cash_mensile', { p_mesi: 12, p_fino: periodo.a < oggi ? periodo.a : oggi }),
    supabase.rpc('funnel_periodo', intervallo),
    supabase.rpc('da_incassare'),
    supabase
      .from('v_rate')
      .select('payment_id, sale_id, cliente, numero_rata, importo_previsto, giorni_ritardo')
      .eq('in_ritardo', true)
      .order('scadenza')
      .limit(6),
    supabase
      .from('v_clienti')
      .select('client_id, nome, cognome, data_fine_ultima')
      .eq('stato', 'in_scadenza')
      .order('data_fine_ultima')
      .limit(6),
    inCorso ? supabase.rpc('oggi_team').single() : Promise.resolve({ data: null, error: null }),
    // targets are monthly: only when the period is one month
    periodo.mese
      ? supabase.rpc('avanzamento_obiettivi', { p_mese: periodo.da }).single()
      : Promise.resolve({ data: null, error: null }),
    supabase.rpc('metriche_per_fonte', intervallo),
  ])

  const errore = [kpi, metriche, cash, funnel, incassare, ritardi, scadenze, team, obiettivi, fonti].find((r) => r.error)
  if (errore) throw new Error('Impossibile caricare la panoramica')

  const m = metriche.data!
  const fasce = Object.fromEntries((incassare.data ?? []).map((f) => [f.fascia, f]))
  const cashTotale = (cash.data ?? []).some((p) => Number(p.totale) !== 0)
  const [hero, ...resto] = kpi.data ?? []
  // the margin gets its own block with the full sum; the other KPIs stay tiles
  const margine = resto.find((k) => k.chiave === 'margine_operativo')
  const altri = resto.filter((k) => k.chiave !== 'margine_operativo')
  const confronto = periodo.confronto
  const valoreKpi = (chiave: string, valore: number | null) =>
    KPI[chiave]?.euro ? formatEuro(valore, { compatto: true }) : formatNumero(valore)

  return (
    <div className="space-y-5">
      {/* Mobile: live status on the title row, period selector on its own row below. */}
      <header className="grid grid-cols-[auto_1fr] items-end gap-x-3 gap-y-2 md:flex md:flex-wrap md:justify-between">
        {/* the period is in the selector: no second copy under the title */}
        <h1 className="font-heading text-xl font-semibold md:text-2xl">Panoramica</h1>
        <div className="contents md:flex md:flex-wrap md:items-center md:gap-3">
          {inCorso ? (
            <div className="min-w-0 justify-self-end text-right">
              <AggiornamentoLive />
            </div>
          ) : null}
          <SelettorePeriodo
            periodo={periodo}
            oggi={oggi}
            percorso="/"
            // mobile: own row, left-aligned like every other page; desktop: right chevron on the right edge
            className="col-span-2 md:ml-0 md:-mr-3"
          />
        </div>
      </header>

      {/* 1. The answer in five seconds */}
      <div className="grid gap-3 lg:grid-cols-[1.4fr_2fr]" data-testid="kpi">
        {hero ? (
          <TileKpi
            hero
            etichetta={KPI[hero.chiave].voce}
            valore={valoreKpi(hero.chiave, hero.valore)}
            delta={hero.delta}
            confronto={confronto}
          >
            {/* "quanto è nuovo e quanto è rinnovo": the four parts, from metriche_periodo;
                new clients of the period apart from the instalments of the ones already in */}
            <div className="mt-5 border-t border-border pt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Di cui</p>
              {/* two by two: the labels are long; in a row the amounts line up at the bottom */}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-3" data-testid="cash-per-tipo">
                {PARTI_CASH.map(({ chiave, voce, colore }) => (
                  <div key={chiave} className="flex min-w-0 flex-col justify-between gap-0.5">
                    <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className={cn('size-2.5 shrink-0 rounded-[2px]', colore)} aria-hidden="true" />
                      <EtichettaConNota voce={voce} className="min-w-0" />
                    </dt>
                    <dd className="num text-base font-semibold" data-testid={`parte-${chiave}`}>
                      {formatEuro(m[chiave], { compatto: true })}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </TileKpi>
        ) : null}
        {/* Mobile: margin block right under the hero. Desktop: top of the right column. */}
        <div className="grid grid-cols-2 content-start gap-3 sm:grid-cols-3">
          {margine ? (
            <ContoMargine
              className="col-span-2 sm:col-span-3"
              titolo={`Margine operativo ${periodo.frase}`}
              cash={m.cash_incassato}
              provvigioni={m.provvigioni_maturate}
              costi={m.costi}
              margine={margine.valore}
              delta={margine.delta}
              confronto={confronto}
            />
          ) : null}
          {altri.map((k, i) => (
            <TileKpi
              key={k.chiave}
              // three tiles: on mobile the first takes a full row, no orphan cell
              className={i === 0 && altri.length % 2 === 1 ? 'col-span-2 sm:col-span-1' : undefined}
              etichetta={KPI[k.chiave].voce}
              valore={valoreKpi(k.chiave, k.valore)}
              delta={k.delta}
              confronto={confronto}
            />
          ))}
        </div>
      </div>

      {obiettivi.data ? (
        <ObiettiviMese
          a={{
            mese: obiettivi.data.mese,
            etichettaMese: formatMese(obiettivi.data.mese),
            obiettivo_cash: obiettivi.data.obiettivo_cash === null ? null : Number(obiettivi.data.obiettivo_cash),
            cash: Number(obiettivi.data.cash),
            quota_cash: obiettivi.data.quota_cash === null ? null : Number(obiettivi.data.quota_cash),
            obiettivo_nuovi: obiettivi.data.obiettivo_nuovi,
            nuovi: obiettivi.data.nuovi,
            quota_nuovi: obiettivi.data.quota_nuovi === null ? null : Number(obiettivi.data.quota_nuovi),
          }}
        />
      ) : null}

      {/* 2. Today, live */}
      {team.data ? (
        <Scheda titolo="Oggi dal team">
          {/* three sources, each named: the report, the calls, the payments */}
          <div className="grid gap-3 xl:grid-cols-[3fr_3fr_1.6fr] xl:gap-0" data-testid="oggi-team">
            {(
              [
                [
                  'Dai report di oggi',
                  [
                    ['DM', LEGENDA_SETTING.dm_totali, formatNumero(team.data.dm_totali)],
                    ['Conversazioni', LEGENDA_SETTING.conversazioni, formatNumero(team.data.conversazioni)],
                    ['Call prenotate', LEGENDA_SETTING.call_prenotate, formatNumero(team.data.call_prenotate)],
                  ],
                ],
                [
                  'Dalle call in agenda oggi',
                  [
                    ['Call da fare', LEGENDA_ECONOMICS.call_da_fare, formatNumero(team.data.call_in_programma)],
                    ['Call svolte', LEGENDA_CLOSER.call, formatNumero(team.data.call_svolte)],
                    ['Chiuse', LEGENDA_CLOSER.chiuse, formatNumero(team.data.chiuse)],
                  ],
                ],
                [
                  'Dagli incassi',
                  [
                    [
                      'incassato',
                      LEGENDA_ECONOMICS.incassato_oggi,
                      formatEuro(team.data.cash_incassato, { compatto: true }),
                      // every cash-in of today, rates and renewals included: say how much is new clients
                      `di cui ${formatEuro(team.data.cash_nuovi_clienti, { compatto: true })} nuovi clienti`,
                    ],
                  ],
                ],
              ] satisfies [string, VoceOggi[]][]
            ).map(([fonte, voci], i) => (
              <div
                key={fonte}
                className={i > 0 ? 'border-t border-border pt-3 xl:border-t-0 xl:border-l xl:pt-0 xl:pl-4' : 'xl:pr-4'}
              >
                <p className="mb-2 text-xs text-muted-foreground">{fonte}</p>
                {/* the same three columns in every group on a phone; the cash alone fills its own on a wide screen */}
                <dl className={cn('grid grid-cols-3 gap-x-2 gap-y-3 sm:gap-x-3', voci.length === 1 && 'xl:grid-cols-1')}>
                  {voci.map(([id, voce, valore, sotto]) => (
                    // alone in its group (today's cash) it takes the whole row on a phone:
                    // its label and its "di cui" line stay on one line
                    <div key={id} className={cn('min-w-0', voci.length === 1 && 'col-span-3 xl:col-span-1')}>
                      {/* min-h-5: the "i" of every label, the values stay on one line */}
                      <dt className="flex min-h-5 items-center text-xs text-muted-foreground">
                        <EtichettaConNota voce={voce} />
                      </dt>
                      <dd className="num text-lg font-semibold" data-testid={`oggi-${id}`}>{valore}</dd>
                      {sotto ? (
                        <dd className="num text-xs text-muted-foreground" data-testid={`oggi-${id}-sotto`}>
                          {sotto}
                        </dd>
                      ) : null}
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </Scheda>
      ) : null}

      {/* 3. The trend */}
      <Scheda
        titolo="Cash incassato, ultimi 12 mesi"
        descrizione="Ogni mese in quattro parti: nuovi clienti del mese, rate di clienti entrati prima, rinnovi e upsell."
      >
        {cashTotale ? (
          <>
            <GraficoCash
              dati={(cash.data ?? []).map((p) => ({
                mese: p.mese,
                nuovi_clienti: Number(p.nuovi_clienti),
                rate_precedenti: Number(p.rate_precedenti),
                rinnovo: Number(p.rinnovo),
                upsell: Number(p.upsell),
                totale: Number(p.totale),
              }))}
            />
            <details className="mt-2">
              <summary className="flex min-h-11 cursor-pointer items-center text-sm text-muted-foreground">
                Vedi come tabella
              </summary>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Cash incassato per mese e tipo</caption>
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      <th scope="col" className="py-2 text-left font-normal">Mese</th>
                      <th scope="col" className="py-2 pl-3 text-right font-normal">Nuovi clienti</th>
                      <th scope="col" className="py-2 pl-3 text-right font-normal">Rate di clienti già entrati</th>
                      <th scope="col" className="py-2 pl-3 text-right font-normal">Rinnovi</th>
                      <th scope="col" className="py-2 pl-3 text-right font-normal">Upsell</th>
                      <th scope="col" className="py-2 pl-3 text-right font-normal">Totale</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(cash.data ?? []).map((p) => (
                      <tr key={p.mese}>
                        <th scope="row" className="py-2 text-left font-normal whitespace-nowrap">{formatMese(p.mese)}</th>
                        <td className="num py-2 pl-3 text-right whitespace-nowrap">{formatEuro(p.nuovi_clienti)}</td>
                        <td className="num py-2 pl-3 text-right whitespace-nowrap">{formatEuro(p.rate_precedenti)}</td>
                        <td className="num py-2 pl-3 text-right whitespace-nowrap">{formatEuro(p.rinnovo)}</td>
                        <td className="num py-2 pl-3 text-right whitespace-nowrap">{formatEuro(p.upsell)}</td>
                        <td className="num py-2 pl-3 text-right font-medium whitespace-nowrap">{formatEuro(p.totale)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground">
            Ancora nessun incasso negli ultimi 12 mesi. Il grafico si riempie quando segni le rate incassate.
          </p>
        )}
      </Scheda>

      {/* 4. How the period is going */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Scheda
          titolo={unMese ? 'Funnel del mese' : 'Funnel del periodo'}
          descrizione="«passa»: la parte della fase sopra che arriva a questa."
        >
          <Funnel
            fasi={(funnel.data ?? []).map((f) => ({
              ordine: f.ordine,
              fase: f.fase,
              valore: Number(f.valore),
              passaggio: f.passaggio,
              nota: FASI_FUNNEL[f.fase]?.nota,
              fonte: FASI_FUNNEL[f.fase]?.fonte,
              tasso:
                f.fase === 'Conversazioni'
                  ? TASSO_CONVERSAZIONE
                  : f.fase === 'Call svolte'
                    ? { ...SHOW_RATE, valore: m.show_rate }
                    : undefined,
            }))}
          />
        </Scheda>

        <Scheda
          titolo="Indicatori"
          descrizione="Rapporti del periodo: i DM vengono dal report dei setter, le call da quelle registrate nell’app. Cash e revenue contano solo i nuovi clienti del periodo."
          azione={
            <Link href="/setting" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              Setting <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          }
        >
          {/* one column next to the funnel: a label with its "i" never wraps */}
          <dl className="grid gap-x-6 divide-y divide-border sm:grid-cols-2 sm:divide-y-0 lg:grid-cols-1 lg:divide-y">
            <Voce etichetta={LEGENDA_SETTING.cash_per_dm} valore={formatEuro(m.cash_per_dm)} />
            <Voce etichetta={LEGENDA_SETTING.revenue_per_dm} valore={formatEuro(m.revenue_per_dm)} />
            <Voce etichetta={LEGENDA_SETTING.dm_per_call} valore={formatRapporto(m.dm_per_call)} />
            <Voce etichetta={LEGENDA_ECONOMICS.cash_per_call_svolta} valore={formatEuro(m.cash_per_call_svolta)} />
            <Voce etichetta={LEGENDA_ECONOMICS.valore_medio_nuovo} valore={formatEuro(m.valore_medio_nuovo)} />
            <Voce etichetta={LEGENDA_CLOSER.show_rate} valore={formatPercentuale(m.show_rate)} />
            <Voce etichetta={LEGENDA_CLOSER.close_rate} valore={formatPercentuale(m.close_rate)} />
            <Voce etichetta={LEGENDA_CLOSER.close_rate_qualificate} valore={formatPercentuale(m.close_rate_qualificate)} />
            <Voce
              etichetta={LEGENDA_ECONOMICS.tasso_rinnovo}
              valore={formatPercentuale(m.tasso_rinnovo)}
              nota={`${m.rinnovati} su ${m.in_scadenza} in scadenza nel ${unMese ? 'mese' : 'periodo'}`}
            />
          </dl>
        </Scheda>
      </div>

      {/* 4b. Which channel brings the new clients: only the new clients of the
          period (metriche_per_fonte), never the instalments or the renewals */}
      <Scheda
        titolo={`Da dove arrivano i nuovi clienti ${periodo.frase}`}
        descrizione="Solo i nuovi clienti del periodo: quanti sono e quanto hanno pagato, per fonte del cliente, con la quota sul loro cash. Rate di clienti entrati prima, rinnovi e upsell esclusi. Lead e close rate per fonte del lead."
      >
        {(fonti.data ?? []).some((f) => Number(f.cash) !== 0 || f.nuovi_clienti > 0 || f.lead > 0) ? (
          <ul className="divide-y divide-border" data-testid="per-fonte">
            {(fonti.data ?? [])
              .filter((f) => Number(f.cash) !== 0 || f.nuovi_clienti > 0 || f.lead > 0 || f.call_svolte > 0)
              .map((f) => (
                <li key={f.fonte} aria-label={ETICHETTA_FONTE[f.fonte]} className="py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0">
                      <span className="block text-sm">{ETICHETTA_FONTE[f.fonte]}</span>
                      <span className="num block text-xs text-muted-foreground">
                        nuovi clienti {f.nuovi_clienti} · lead {f.lead} · close rate {formatPercentuale(f.close_rate)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="num block text-sm font-medium">{formatEuro(f.cash)}</span>
                      <span className="num block text-xs text-muted-foreground">{formatPercentuale(f.quota_cash, { unDecimale: true })}</span>
                    </span>
                  </div>
                  {/* share of the new clients' cash: neutral, the numbers above say it in words */}
                  <div aria-hidden="true" className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-muted-foreground/40"
                      style={{ width: `${Math.min(100, Math.max(0, Number(f.quota_cash ?? 0) * 100))}%` }}
                    />
                  </div>
                </li>
              ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Nessun nuovo cliente, incasso di nuovi clienti o lead nel periodo.</p>
        )}
      </Scheda>

      {/* 5. What needs action */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Scheda
          titolo="Da incassare"
          azione={
            <Link href="/payments" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              Incassi <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          }
        >
          {/* one column per band, filled top to bottom: label, amount, rate count share
              three rows, so the amounts line up even when a label wraps (390px) */}
          <dl className="grid grid-flow-col grid-cols-3 grid-rows-[auto_auto_auto] gap-x-3" data-testid="da-incassare">
            {(
              [
                ['in_ritardo', LEGENDA_ECONOMICS.in_ritardo],
                ['prossimi_30', LEGENDA_ECONOMICS.prossimi_30],
                ['oltre', LEGENDA_ECONOMICS.oltre_30],
              ] as const
            ).map(([fascia, voce]) => (
              <Fragment key={fascia}>
                <dt
                  className={cn(
                    'flex items-center gap-1 self-end pb-0.5 text-xs',
                    fascia === 'in_ritardo' ? 'text-status-warning' : 'text-muted-foreground',
                  )}
                >
                  {fascia === 'in_ritardo' ? <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" /> : null}
                  {/* on two lines ("Entro 30 giorni") the "i" follows the last word, its width in the padding */}
                  <EtichettaConNota
                    voce={voce}
                    className="inline min-w-0 pr-6 [&>button]:-mr-6 [&>button]:ml-1 [&>button]:align-middle"
                  />
                </dt>
                <dd className="num text-lg font-semibold" data-testid={`da-incassare-${fascia}`}>
                  {formatEuro(fasce[fascia]?.totale, { compatto: true })}
                </dd>
                <dd className="text-xs text-muted-foreground">{fasce[fascia]?.numero ?? 0} rate</dd>
              </Fragment>
            ))}
          </dl>
          {(ritardi.data ?? []).length > 0 ? (
            <ul className="mt-4 divide-y divide-border border-t border-border">
              {ritardi.data!.map((r) => (
                <li key={r.payment_id}>
                  <Link href={`/sales/${r.sale_id}`} className="flex min-h-11 items-center justify-between gap-3 py-2 hover:text-foreground">
                    <span className="min-w-0">
                      <span className="block truncate text-sm">{r.cliente}</span>
                      <span className="block text-xs text-status-warning">
                        Rata {r.numero_rata} · {r.giorni_ritardo === 1 ? '1 giorno' : `${r.giorni_ritardo} giorni`} di ritardo
                      </span>
                    </span>
                    <span className="num text-sm font-medium">{formatEuro(r.importo_previsto)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">Nessuna rata in ritardo.</p>
          )}
        </Scheda>

        <Scheda
          titolo="In scadenza nei prossimi 30 giorni"
          azione={
            <Link href="/rinnovi" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              Rinnovi <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          }
        >
          {(scadenze.data ?? []).length > 0 ? (
            <ul className="divide-y divide-border" data-testid="in-scadenza">
              {scadenze.data!.map((c) => (
                <li key={c.client_id} className="flex min-h-14 items-center justify-between gap-3 py-2">
                  <Link href={`/clients/${c.client_id}`} className="min-w-0 hover:underline">
                    <span className="block truncate text-sm">{[c.nome, c.cognome].filter(Boolean).join(' ')}</span>
                    <span className="flex items-center gap-1 text-xs text-status-warning">
                      <CalendarClock className="size-3.5" aria-hidden="true" />
                      scade il {formatData(c.data_fine_ultima)}
                    </span>
                  </Link>
                  <LinkBottone href={`/sales/new?cliente=${c.client_id}&tipo=rinnovo`} variant="outline" className="shrink-0">
                    Registra rinnovo
                  </LinkBottone>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nessun cliente in scadenza nei prossimi 30 giorni.</p>
          )}
        </Scheda>
      </div>

      <LegendaSezione voci={LEGENDA_PAGINA} />
    </div>
  )
}
