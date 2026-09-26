import { IntestazionePagina } from '@/components/pagina/intestazione'
import { SelettoreMese } from '@/components/pagina/selettore-mese'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma, parseMese, primoDelMeseISO } from '@/lib/date'
import { formatEuro, formatMese, formatNumero, formatPercentuale, formatRapporto } from '@/lib/format'
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

export default async function IMieiNumeriPage({ searchParams }: { searchParams: Promise<{ mese?: string }> }) {
  await requireRuolo(['setter'])
  const meseCorrente = primoDelMeseISO(oggiRoma())
  const mese = parseMese((await searchParams).mese) ?? meseCorrente
  const supabase = await createClient()

  // security definer, filtered on the caller: only this setter's totals
  const { data: n, error } = await supabase.rpc('miei_numeri', { p_mese: mese }).single()
  if (error || !n) throw new Error('Impossibile caricare i tuoi numeri')

  return (
    <div className="max-w-2xl space-y-5">
      <IntestazionePagina titolo="I miei numeri" descrizione="Le tue metriche del mese e le tue provvigioni." />
      <SelettoreMese mese={mese} meseCorrente={meseCorrente} percorso="/my-numbers" />

      <section className="rounded-xl bg-card p-4" data-testid="mie-provvigioni">
        <p className="text-sm text-muted-foreground">Provvigioni maturate a {formatMese(mese)}</p>
        <p className="text-5xl font-semibold tracking-tight text-gold">{formatEuro(n.provvigioni_maturate)}</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Pagate per questo mese: <span className="num text-foreground">{formatEuro(n.provvigioni_pagate)}</span>
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
