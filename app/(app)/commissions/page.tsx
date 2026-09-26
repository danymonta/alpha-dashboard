import { Percent } from 'lucide-react'

import { PagaProvvigione } from '@/app/(app)/commissions/paga-provvigione'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { formatData, formatEuro, formatMese, formatPercentuale } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { ETICHETTA_TIPO_VENDITA } from '@/lib/validation/vendita'

export const dynamic = 'force-dynamic'

export default async function ProvvigioniPage() {
  await requireRuolo(['admin'])
  const oggi = oggiRoma()
  const supabase = await createClient()

  const [riepilogo, regole, pagamenti] = await Promise.all([
    supabase.rpc('provvigioni_riepilogo', { p_mesi: 6 }),
    supabase
      .from('commission_rules')
      .select('profile_id, percentuale, applica_a, valida_dal, valida_al')
      .order('valida_dal', { ascending: false }),
    supabase
      .from('commission_payouts')
      .select('id, profile_id, periodo, importo, pagato_il, metodo')
      .order('pagato_il', { ascending: false })
      .limit(20),
  ])
  if (riepilogo.error || regole.error || pagamenti.error) throw new Error('Impossibile caricare le provvigioni')

  // group the SQL rows by collaborator; every amount is already computed
  const persone = new Map<string, { nome: string; righe: NonNullable<typeof riepilogo.data> }>()
  for (const r of riepilogo.data ?? []) {
    const voce = persone.get(r.profile_id) ?? { nome: r.nome, righe: [] }
    voce.righe.push(r)
    persone.set(r.profile_id, voce)
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <IntestazionePagina
        titolo="Provvigioni"
        descrizione="Maturano sull’incasso, non sulla firma. Un rimborso le riduce nel mese in cui avviene."
      />

      {persone.size === 0 ? (
        <StatoVuoto
          Icona={Percent}
          titolo="Nessuna regola provvigionale"
          descrizione="Le provvigioni compaiono quando un collaboratore ha una regola attiva (Impostazioni, Fase 4)."
        />
      ) : (
        [...persone.entries()].map(([id, { nome, righe }]) => {
          const regola = (regole.data ?? []).find(
            (r) => r.profile_id === id && r.valida_dal <= oggi && (!r.valida_al || r.valida_al >= oggi),
          )
          const ultima = righe[righe.length - 1]
          const mesiRecenti = [...righe].reverse()

          return (
            <section key={id} className="space-y-3 rounded-xl bg-card p-4" aria-labelledby={`p-${id}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 id={`p-${id}`} className="text-base font-medium">{nome}</h2>
                  <p className="text-sm text-muted-foreground">
                    {regola
                      ? `${formatPercentuale(regola.percentuale)} sull’incassato di: ${regola.applica_a
                          .map((t) => ETICHETTA_TIPO_VENDITA[t].toLowerCase())
                          .join(', ')} · dal ${formatData(regola.valida_dal)}`
                      : 'Nessuna regola attiva oggi'}
                  </p>
                </div>
                <PagaProvvigione
                  profileId={id}
                  nome={nome}
                  oggi={oggi}
                  mesi={mesiRecenti.map((r) => ({ mese: r.mese, saldo_mese: r.saldo_mese }))}
                />
              </div>

              <div className="rounded-lg bg-muted/40 p-3" data-testid={`saldo-${id}`}>
                <p className="text-xs text-muted-foreground">Da pagare a oggi</p>
                <p className="num text-3xl font-semibold text-gold">{formatEuro(ultima?.saldo_progressivo)}</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <caption className="sr-only">Provvigioni di {nome} per mese</caption>
                  <thead className="text-xs text-muted-foreground">
                    <tr className="border-b border-border">
                      <th scope="col" className="py-2 text-left font-normal">Mese</th>
                      <th scope="col" className="py-2 text-right font-normal">Maturato</th>
                      <th scope="col" className="py-2 text-right font-normal">Pagato</th>
                      <th scope="col" className="py-2 text-right font-normal">Saldo del mese</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {mesiRecenti.map((r) => (
                      <tr key={r.mese}>
                        <th scope="row" className="py-2 text-left font-normal capitalize">{formatMese(r.mese)}</th>
                        <td className="py-2 text-right">{formatEuro(r.maturato)}</td>
                        <td className="py-2 text-right">{formatEuro(r.pagato)}</td>
                        <td className="py-2 text-right font-medium">{formatEuro(r.saldo_mese)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )
        })
      )}

      {(pagamenti.data ?? []).length > 0 ? (
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Ultimi pagamenti</h2>
          <ul className="divide-y divide-border rounded-xl bg-card">
            {pagamenti.data!.map((p) => (
              <li key={p.id} className="flex min-h-11 items-center justify-between gap-3 px-3 py-2 text-sm">
                <span>
                  {persone.get(p.profile_id)?.nome ?? 'Collaboratore'}
                  <span className="block text-xs text-muted-foreground">
                    {formatData(p.pagato_il)} · riferito a <span className="capitalize">{formatMese(p.periodo)}</span>
                  </span>
                </span>
                <span className="num font-medium">{formatEuro(p.importo)}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}
