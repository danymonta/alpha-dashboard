import { CalendarClock, ChevronRight, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { LinkBottone } from '@/components/link-bottone'
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
import { contieneData, leggiPeriodo } from '@/lib/periodo'
import { createClient } from '@/lib/supabase/server'
import { ETICHETTA_FONTE } from '@/lib/validation/call'

export const dynamic = 'force-dynamic'

const KPI: Record<string, { etichetta: string; euro: boolean }> = {
  cash_incassato: { etichetta: 'Cash incassato', euro: true },
  revenue_firmata: { etichetta: 'Revenue firmata', euro: true },
  nuovi_clienti: { etichetta: 'Nuovi clienti firmati', euro: false },
  rinnovi: { etichetta: 'Rinnovi firmati', euro: false },
  // always "Margine operativo", never "utile": taxes are not included
  margine_operativo: { etichetta: 'Margine operativo', euro: true },
}

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

function Voce({ etichetta, valore, nota }: { etichetta: string; valore: string; nota?: string }) {
  return (
    <div className="flex min-h-11 items-center justify-between gap-3 py-2">
      <dt className="text-sm text-muted-foreground">
        {etichetta}
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
            etichetta={KPI[hero.chiave].etichetta}
            valore={valoreKpi(hero.chiave, hero.valore)}
            delta={hero.delta}
            confronto={confronto}
          >
            {/* "quanto è nuovo e quanto è rinnovo": the split, from metriche_periodo */}
            <div className="mt-5 border-t border-border pt-4">
              <p className="mb-2 text-xs font-medium text-muted-foreground">Cash per tipo di vendita</p>
              <dl className="grid grid-cols-3 gap-3" data-testid="cash-per-tipo">
                {(
                  [
                    ['da nuovi', m.cash_nuovo, 'bg-chart-nuovo'],
                    ['da rinnovi', m.cash_rinnovo, 'bg-chart-rinnovo'],
                    ['da upsell', m.cash_upsell, 'bg-chart-upsell'],
                  ] as const
                ).map(([etichetta, valore, colore]) => (
                  <div key={etichetta}>
                    <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className={`size-2.5 rounded-[2px] ${colore}`} aria-hidden="true" />
                      {etichetta}
                    </dt>
                    <dd className="num text-base font-semibold">{formatEuro(valore, { compatto: true })}</dd>
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
              etichetta={KPI[k.chiave].etichetta}
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
          <dl className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7" data-testid="oggi-team">
            {[
              ['DM', formatNumero(team.data.dm_totali)],
              ['Conversazioni', formatNumero(team.data.conversazioni)],
              ['Call prenotate', formatNumero(team.data.call_prenotate)],
              ['Call da fare', formatNumero(team.data.call_in_programma)],
              ['Call svolte', formatNumero(team.data.call_svolte)],
              ['Chiuse', formatNumero(team.data.chiuse)],
              ['Cash oggi', formatEuro(team.data.cash_incassato, { compatto: true })],
            ].map(([etichetta, valore]) => (
              <div key={etichetta}>
                <dt className="text-xs text-muted-foreground">{etichetta}</dt>
                <dd className="text-lg font-semibold" data-testid={`oggi-${etichetta}`}>{valore}</dd>
              </div>
            ))}
          </dl>
        </Scheda>
      ) : null}

      {/* 3. The trend */}
      <Scheda titolo="Cash incassato, ultimi 12 mesi">
        {cashTotale ? (
          <>
            <GraficoCash
              dati={(cash.data ?? []).map((p) => ({
                mese: p.mese,
                nuovo: Number(p.nuovo),
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
                      <th scope="col" className="py-2 text-right font-normal">Nuovo</th>
                      <th scope="col" className="py-2 text-right font-normal">Rinnovo</th>
                      <th scope="col" className="py-2 text-right font-normal">Upsell</th>
                      <th scope="col" className="py-2 text-right font-normal">Totale</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {(cash.data ?? []).map((p) => (
                      <tr key={p.mese}>
                        <th scope="row" className="py-2 text-left font-normal">{formatMese(p.mese)}</th>
                        <td className="py-2 text-right">{formatEuro(p.nuovo)}</td>
                        <td className="py-2 text-right">{formatEuro(p.rinnovo)}</td>
                        <td className="py-2 text-right">{formatEuro(p.upsell)}</td>
                        <td className="py-2 text-right font-medium">{formatEuro(p.totale)}</td>
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
        <Scheda titolo={unMese ? 'Funnel del mese' : 'Funnel del periodo'}>
          <Funnel
            fasi={(funnel.data ?? []).map((f) => ({
              ordine: f.ordine,
              fase: f.fase,
              valore: Number(f.valore),
              passaggio: f.passaggio,
            }))}
          />
        </Scheda>

        <Scheda
          titolo="Indicatori"
          azione={
            <Link href="/setting" className="inline-flex min-h-11 items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
              Setting <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          }
        >
          <dl className="grid gap-x-6 divide-y divide-border sm:grid-cols-2 sm:divide-y-0">
            <Voce etichetta="Cash per DM" valore={formatEuro(m.cash_per_dm)} />
            <Voce etichetta="Revenue per DM" valore={formatEuro(m.revenue_per_dm)} />
            <Voce etichetta="DM per call prenotata" valore={formatRapporto(m.dm_per_call)} />
            <Voce etichetta="DM per strategy call" valore={formatRapporto(m.dm_per_strategy)} />
            <Voce etichetta="Cash per call svolta" valore={formatEuro(m.cash_per_call_svolta)} nota="solo vendite nuove" />
            <Voce etichetta="Valore medio vendita" valore={formatEuro(m.valore_medio_vendita)} />
            <Voce etichetta="Show rate" valore={formatPercentuale(m.show_rate)} />
            <Voce etichetta="Close rate" valore={formatPercentuale(m.close_rate)} />
            <Voce etichetta="Close rate su qualificate" valore={formatPercentuale(m.close_rate_qualificate)} />
            <Voce
              etichetta="Tasso di rinnovo"
              valore={formatPercentuale(m.tasso_rinnovo)}
              nota={`${m.rinnovati} su ${m.in_scadenza} in scadenza nel ${unMese ? 'mese' : 'periodo'}`}
            />
          </dl>
        </Scheda>
      </div>

      {/* 4b. Which channel brings the money */}
      <Scheda
        titolo={`Da dove arrivano i soldi ${periodo.frase}`}
        descrizione="Cash e clienti nuovi per fonte del cliente; lead e close rate per fonte del lead."
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
                        nuovi {f.nuovi_clienti} · lead {f.lead} · close rate {formatPercentuale(f.close_rate)}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="num block text-sm font-medium">{formatEuro(f.cash, { compatto: true })}</span>
                      <span className="num block text-xs text-muted-foreground">{formatPercentuale(f.quota_cash)}</span>
                    </span>
                  </div>
                  {/* share of the period's cash: neutral, the numbers above say it in words */}
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
          <p className="text-sm text-muted-foreground">Nessun incasso, cliente o lead nel periodo.</p>
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
          <dl className="grid grid-cols-3 gap-3" data-testid="da-incassare">
            <div>
              <dt className="flex items-center gap-1 text-xs text-status-warning">
                <TriangleAlert className="size-3.5" aria-hidden="true" />
                In ritardo
              </dt>
              <dd className="num text-lg font-semibold">{formatEuro(fasce.in_ritardo?.totale, { compatto: true })}</dd>
              <dd className="text-xs text-muted-foreground">{fasce.in_ritardo?.numero ?? 0} rate</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Prossimi 30 giorni</dt>
              <dd className="num text-lg font-semibold">{formatEuro(fasce.prossimi_30?.totale, { compatto: true })}</dd>
              <dd className="text-xs text-muted-foreground">{fasce.prossimi_30?.numero ?? 0} rate</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Oltre</dt>
              <dd className="num text-lg font-semibold">{formatEuro(fasce.oltre?.totale, { compatto: true })}</dd>
              <dd className="text-xs text-muted-foreground">{fasce.oltre?.numero ?? 0} rate</dd>
            </div>
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
    </div>
  )
}
