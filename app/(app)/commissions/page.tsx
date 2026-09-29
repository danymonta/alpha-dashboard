import { Percent } from 'lucide-react'
import Link from 'next/link'

import { ModificaPagamento } from '@/app/(app)/commissions/modifica-pagamento'
import { PagaProvvigione } from '@/app/(app)/commissions/paga-provvigione'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { aggiungiMesi, oggiRoma, primoDelMeseISO } from '@/lib/date'
import { formatData, formatEuro, formatMese, formatPercentuale } from '@/lib/format'
import { createClient } from '@/lib/supabase/server'
import { ETICHETTA_TIPO_VENDITA } from '@/lib/validation/vendita'

export const dynamic = 'force-dynamic'

export default async function ProvvigioniPage() {
  await requireRuolo(['admin'])
  const oggi = oggiRoma()
  const supabase = await createClient()

  const [riepilogo, regole, pagamenti, perVendita] = await Promise.all([
    supabase.rpc('provvigioni_riepilogo', { p_mesi: 6 }),
    supabase
      .from('commission_rules')
      .select('profile_id, percentuale, applica_a, valida_dal, valida_al')
      .order('valida_dal', { ascending: false }),
    supabase
      .from('commission_payouts')
      .select('id, profile_id, periodo, importo, pagato_il, metodo, note')
      .order('pagato_il', { ascending: false })
      .limit(20),
    // client by client: "5% of 1.500 € = 75 €", summed in SQL
    supabase.rpc('provvigioni_per_vendita', {}),
  ])
  if (riepilogo.error || regole.error || pagamenti.error || perVendita.error) throw new Error('Impossibile caricare le provvigioni')

  // months a payout can refer to: the last two years, plus whatever is already recorded
  const ultimi24 = Array.from({ length: 24 }, (_, i) => aggiungiMesi(primoDelMeseISO(oggi), -i))

  // group the SQL rows by collaborator; every amount is already computed
  const persone = new Map<string, { nome: string; righe: NonNullable<typeof riepilogo.data> }>()
  for (const r of riepilogo.data ?? []) {
    const voce = persone.get(r.profile_id) ?? { nome: r.nome, righe: [] }
    voce.righe.push(r)
    persone.set(r.profile_id, voce)
  }

  return (
    <div className="max-w-4xl space-y-6">
      <IntestazionePagina
        titolo="Provvigioni"
        descrizione="Maturano sull’incasso, non sulla firma: ogni rata incassata delle vendite coperte dalla regola (di solito solo i clienti nuovi), anche nei mesi dopo la firma. Un rimborso le riduce nel mese in cui avviene."
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

              {/* below 768px: one card per month, no 4-column table */}
              <ul className="space-y-2 md:hidden" aria-label={`Provvigioni di ${nome} per mese`}>
                {mesiRecenti.map((r) => (
                  <li key={r.mese} className="rounded-lg border border-border px-3 py-2.5">
                    <p className="text-sm font-medium">{formatMese(r.mese)}</p>
                    <dl className="mt-1.5 grid grid-cols-3 gap-3">
                      <div className="text-right">
                        <dt className="text-xs text-muted-foreground">Maturato</dt>
                        <dd className="num text-sm">{formatEuro(r.maturato)}</dd>
                      </div>
                      <div className="text-right">
                        <dt className="text-xs text-muted-foreground">Pagato</dt>
                        <dd className="num text-sm">{formatEuro(r.pagato)}</dd>
                      </div>
                      <div className="text-right">
                        <dt className="text-xs text-muted-foreground">Saldo del mese</dt>
                        <dd className="num text-sm font-medium">{formatEuro(r.saldo_mese)}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>

              <div className="hidden overflow-x-auto md:block">
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
                        <th scope="row" className="py-2 text-left font-normal">{formatMese(r.mese)}</th>
                        <td className="py-2 text-right">{formatEuro(r.maturato)}</td>
                        <td className="py-2 text-right">{formatEuro(r.pagato)}</td>
                        <td className="py-2 text-right font-medium">{formatEuro(r.saldo_mese)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <PerCliente nome={nome} righe={(perVendita.data ?? []).filter((v) => v.profile_id === id)} />
            </section>
          )
        })
      )}

      {(pagamenti.data ?? []).length > 0 ? (
        <section className="space-y-2">
          <h2 className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">Ultimi pagamenti</h2>
          <ul className="divide-y divide-border rounded-xl bg-card">
            {pagamenti.data!.map((p) => (
              <li key={p.id} className="flex min-h-11 items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0 flex-1">
                  {persone.get(p.profile_id)?.nome ?? 'Collaboratore'}
                  <span className="block text-xs text-muted-foreground">
                    {formatData(p.pagato_il)} · riferito a {formatMese(p.periodo)}
                  </span>
                </span>
                <span className="num font-medium">{formatEuro(p.importo)}</span>
                <div className="-mr-1.5">
                  <ModificaPagamento
                    pagamento={{
                      id: p.id,
                      periodo: p.periodo,
                      importo: p.importo,
                      pagato_il: p.pagato_il,
                      metodo: p.metodo,
                      note: p.note,
                    }}
                    nome={persone.get(p.profile_id)?.nome ?? 'Collaboratore'}
                    mesi={[...new Set([...ultimi24, p.periodo])].sort().reverse()}
                    oggi={oggi}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

type RigaPerVendita = {
  sale_id: string
  cliente: string
  incassato: number
  percentuale: number | null
  provvigione: number
  ultimo_incasso: string
}

/** Client by client: what came in, the rate and the commission (provvigioni_per_vendita). */
function PerCliente({ nome, righe }: { nome: string; righe: RigaPerVendita[] }) {
  return (
    <div className="border-t border-border pt-3" data-testid="provvigioni-per-cliente">
      <h3 className="text-sm font-medium">Per cliente</h3>
      {righe.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">Nessun incasso con provvigione finora.</p>
      ) : (
        <ul className="divide-y divide-border" aria-label={`Provvigioni di ${nome} per cliente`}>
          {righe.map((v) => (
            <li key={v.sale_id} aria-label={v.cliente} className="flex min-h-11 items-center justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <Link href={`/sales/${v.sale_id}`} className="block truncate hover:underline">
                  {v.cliente}
                </Link>
                <span className="num block text-xs text-muted-foreground">
                  {v.percentuale === null ? 'regole diverse' : formatPercentuale(v.percentuale)} di {formatEuro(v.incassato)} ·
                  ultimo incasso {formatData(v.ultimo_incasso)}
                </span>
              </span>
              <span className="num shrink-0 font-medium">{formatEuro(v.provvigione)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
