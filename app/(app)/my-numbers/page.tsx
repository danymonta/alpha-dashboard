import { IntestazionePagina } from '@/components/pagina/intestazione'
import { SelettorePeriodo } from '@/components/pagina/selettore-periodo'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { formatEuro, formatNumero, formatPercentuale, formatRapporto } from '@/lib/format'
import { leggiPeriodo } from '@/lib/periodo'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function Gruppo({ titolo, voci }: { titolo: string; voci: [string, string][] }) {
  return (
    <section className="rounded-xl bg-card p-4">
      <h2 className="mb-3 text-sm font-medium">{titolo}</h2>
      <dl className="grid grid-cols-3 gap-3">
        {voci.map(([etichetta, valore]) => (
          <div key={etichetta}>
            <dt className="text-xs text-muted-foreground">{etichetta}</dt>
            <dd className="text-lg font-semibold">{valore}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

export default async function IMieiNumeriPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireRuolo(['setter'])
  const oggi = oggiRoma()
  const periodo = leggiPeriodo(await searchParams, oggi)
  const supabase = await createClient()

  // security definer, filtered on the caller: only this setter's totals
  const { data: n, error } = await supabase
    .rpc('miei_numeri_periodo', { p_da: periodo.da, p_a: periodo.a })
    .single()
  if (error || !n) throw new Error('Impossibile caricare i tuoi numeri')

  return (
    <div className="max-w-2xl space-y-5">
      <IntestazionePagina titolo="I miei numeri" descrizione="Le tue metriche del periodo e le tue provvigioni." />
      <SelettorePeriodo periodo={periodo} oggi={oggi} percorso="/my-numbers" />

      <section className="rounded-xl bg-card p-4" data-testid="mie-provvigioni">
        <p className="text-sm text-muted-foreground">Provvigioni maturate {periodo.frase}</p>
        <p className="text-5xl font-semibold tracking-tight text-gold">{formatEuro(n.provvigioni_maturate)}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          {/* payouts refer to a month: a range counts every month it touches (miei_numeri_periodo) */}
          {periodo.mese ? 'Pagate per questo mese' : 'Pagate per i mesi del periodo'}:{' '}
          <span className="num text-foreground">{formatEuro(n.provvigioni_pagate)}</span>
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Maturano quando il cliente paga, non alla firma. Vedi solo i tuoi totali.
        </p>
      </section>

      <Gruppo
        titolo="Setting"
        voci={[
          ['DM totali', formatNumero(n.dm_totali)],
          ['Conversazioni', formatNumero(n.conversazioni)],
          ['Tasso conv.', formatPercentuale(n.tasso_conversazione)],
          ['Call proposte', formatNumero(n.call_proposte)],
          ['Call prenotate', formatNumero(n.call_prenotate)],
          ['DM per call', formatRapporto(n.dm_per_call)],
        ]}
      />

      <Gruppo
        titolo="Le tue call"
        voci={[
          ['Fissate', formatNumero(n.call_fissate)],
          ['Svolte', formatNumero(n.call_svolte)],
          ['No show', formatNumero(n.no_show)],
          ['Show rate', formatPercentuale(n.show_rate)],
          ['Chiuse', formatNumero(n.chiuse)],
          ['Close rate', formatPercentuale(n.close_rate)],
        ]}
      />
    </div>
  )
}
