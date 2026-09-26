import { TrendingUp } from 'lucide-react'

import { ModificaReport } from '@/app/(app)/setting/modifica-report'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { SelettoreMese } from '@/components/pagina/selettore-mese'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { fineMese, oggiRoma, parseMese, primoDelMeseISO } from '@/lib/date'
import { formatData, formatMese, formatNumero, formatPercentuale, formatRapporto } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const COLONNE_REPORT = [
  ['dm_outbound', 'DM out'],
  ['dm_inbound', 'DM in'],
  ['conversazioni', 'Conv.'],
  ['call_proposte', 'Proposte'],
  ['discovery_prenotate', 'Disc. pren.'],
  ['discovery_svolte', 'Disc. svolte'],
  ['call_qualificate', 'Qualif.'],
  ['strategy_prenotate', 'Strat. pren.'],
  ['follow_up', 'Follow-up'],
] as const

export default async function SettingPage({ searchParams }: { searchParams: Promise<{ mese?: string }> }) {
  await requireRuolo(['admin'])
  const meseCorrente = primoDelMeseISO(oggiRoma())
  const mese = parseMese((await searchParams).mese) ?? meseCorrente
  const supabase = await createClient()

  const [metriche, report] = await Promise.all([
    supabase.rpc('metriche_setting', { p_da: mese, p_a: fineMese(mese) }),
    supabase
      .from('setter_daily_reports')
      .select('id, data, dm_outbound, dm_inbound, conversazioni, call_proposte, discovery_prenotate, discovery_svolte, call_qualificate, strategy_prenotate, follow_up, contenuto_pubblicato, note, setter:profiles!setter_daily_reports_setter_id_fkey(nome)')
      .gte('data', mese)
      .lte('data', fineMese(mese))
      .order('data', { ascending: false }),
  ])
  if (metriche.error || report.error) throw new Error('Impossibile caricare il setting')

  const righe = metriche.data ?? []
  const correzione = (r: (typeof report.data)[number]) => (
    <ModificaReport
      data={r.data}
      setter={r.setter?.nome ?? 'Setter'}
      report={{
        id: r.id,
        dm_outbound: r.dm_outbound,
        dm_inbound: r.dm_inbound,
        conversazioni: r.conversazioni,
        call_proposte: r.call_proposte,
        discovery_prenotate: r.discovery_prenotate,
        discovery_svolte: r.discovery_svolte,
        call_qualificate: r.call_qualificate,
        strategy_prenotate: r.strategy_prenotate,
        follow_up: r.follow_up,
        contenuto_pubblicato: r.contenuto_pubblicato,
        note: r.note,
      }}
    />
  )
  const perSetter = righe.filter((r) => r.setter_id !== null)
  const totale = righe.find((r) => r.setter_id === null)

  return (
    <div className="space-y-5">
      <IntestazionePagina
        titolo="Setting"
        descrizione="Volumi DM, call prenotate e svolte, show rate e close rate, per setter."
      />
      <SelettoreMese mese={mese} meseCorrente={meseCorrente} percorso="/setting" />

      {perSetter.length === 0 ? (
        <StatoVuoto
          Icona={TrendingUp}
          titolo={`Nessun report a ${formatMese(mese)}`}
          descrizione="I numeri arrivano dalla schermata Oggi del setter."
        />
      ) : (
        <>
          <div className="grid gap-3 md:grid-cols-2" data-testid="metriche-setter">
            {[...perSetter, ...(perSetter.length > 1 && totale ? [totale] : [])].map((r) => (
              <section key={r.setter_id ?? 'totale'} className="rounded-xl bg-card p-4">
                <h2 className="mb-3 text-sm font-medium">{r.nome}</h2>
                <dl className="grid grid-cols-3 gap-3">
                  {[
                    ['DM totali', formatNumero(r.dm_totali)],
                    ['Conversazioni', formatNumero(r.conversazioni)],
                    ['Tasso conv.', formatPercentuale(r.tasso_conversazione)],
                    ['Call prenotate', formatNumero(r.call_prenotate)],
                    ['Tasso pren.', formatPercentuale(r.tasso_prenotazione)],
                    ['DM per call', formatRapporto(r.dm_per_call)],
                    ['Call svolte', formatNumero(r.call_svolte)],
                    ['Show rate', formatPercentuale(r.show_rate)],
                    ['Close rate', formatPercentuale(r.close_rate)],
                  ].map(([etichetta, valore]) => (
                    <div key={etichetta}>
                      <dt className="text-xs text-muted-foreground">{etichetta}</dt>
                      <dd className="text-lg font-semibold">{valore}</dd>
                    </div>
                  ))}
                </dl>
              </section>
            ))}
          </div>

          <section className="space-y-2">
            <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Report giornalieri ({report.data.length})
            </h2>

            <ul className="space-y-2 md:hidden">
              {report.data.map((r) => (
                <li key={r.id} className="flex items-start gap-2 rounded-xl bg-card p-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {formatData(r.data)} <span className="font-normal text-muted-foreground">· {r.setter?.nome}</span>
                    </p>
                    {/* raw fields: totals are metrics and come from SQL (cards above) */}
                    <p className="num mt-1 text-xs text-muted-foreground">
                      DM out {r.dm_outbound} · in {r.dm_inbound} · conv. {r.conversazioni} · disc. {r.discovery_prenotate} ·
                      strat. {r.strategy_prenotate} · follow-up {r.follow_up}
                    </p>
                  </div>
                  <div className="-mt-1.5 -mr-1.5">{correzione(r)}</div>
                </li>
              ))}
            </ul>

            <div className="hidden overflow-x-auto rounded-xl bg-card md:block">
              <table className="w-full text-sm">
                <caption className="sr-only">Report giornalieri del mese</caption>
                <thead className="text-xs text-muted-foreground">
                  <tr className="border-b border-border">
                    <th scope="col" className="px-3 py-2.5 text-left font-normal">Data</th>
                    <th scope="col" className="px-3 py-2.5 text-left font-normal">Setter</th>
                    {COLONNE_REPORT.map(([, etichetta]) => (
                      <th key={etichetta} scope="col" className="px-2 py-2.5 text-right font-normal">{etichetta}</th>
                    ))}
                    <th scope="col" className="px-3 py-2.5 text-center font-normal">Contenuto</th>
                    <th scope="col" className="w-12 px-1 py-2.5"><span className="sr-only">Correggi</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {report.data.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2">{formatData(r.data)}</td>
                      <td className="px-3 py-2 text-muted-foreground">{r.setter?.nome}</td>
                      {COLONNE_REPORT.map(([campo]) => (
                        <td key={campo} className="px-2 py-2 text-right">{r[campo]}</td>
                      ))}
                      <td className="px-3 py-2 text-center">{r.contenuto_pubblicato ? 'Sì' : '–'}</td>
                      <td className="px-1 py-0.5">{correzione(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
