import { ChevronDown, TriangleAlert, Users } from 'lucide-react'

import { LinkBottone } from '@/components/link-bottone'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { formatData, formatEuro } from '@/lib/format'
import type { Database } from '@/lib/supabase/database.types'
import { ETICHETTA_TIPO_VENDITA } from '@/lib/validation/vendita'

type Riga = Database['public']['Functions']['mie_vendite_setter']['Returns'][number]

/** How an instalment stands, in words: the state never rides on colour alone. */
function statoRata(r: Riga): { testo: string; ritardo: boolean } {
  if (r.stato === 'incassata') return { testo: `pagata il ${formatData(r.incassato_il)}`, ritardo: false }
  if (r.stato === 'rimborsata') return { testo: `rimborsata il ${formatData(r.incassato_il)}`, ritardo: false }
  if (r.stato === 'fallita') return { testo: 'pagamento non andato a buon fine', ritardo: false }
  if (r.in_ritardo) return { testo: `in ritardo, scadeva il ${formatData(r.scadenza)}`, ritardo: true }
  return { testo: `scade il ${formatData(r.scadenza)}`, ritardo: false }
}

/**
 * "I tuoi clienti": the sales where this setter brought the client, what they
 * paid and what each cash-in gives him (mie_vendite_setter, filtered on the
 * caller). Every amount and total comes from SQL; here rows are only grouped.
 */
export function MieiClienti({ righe }: { righe: Riga[] }) {
  const vendite = new Map<string, Riga[]>()
  for (const r of righe) vendite.set(r.sale_id, [...(vendite.get(r.sale_id) ?? []), r])

  return (
    <section aria-labelledby="titolo-miei-clienti" className="space-y-3" data-testid="miei-clienti">
      <div>
        <h2 id="titolo-miei-clienti" className="text-sm font-medium">
          I tuoi clienti
        </h2>
        <p className="text-xs text-muted-foreground">
          Le vendite dove sei il setter: quanto vale il contratto, quanto hanno pagato e quanto ti matura su ogni incasso.
        </p>
      </div>

      {vendite.size === 0 ? (
        <StatoVuoto
          Icona={Users}
          titolo="Nessun cliente ancora"
          descrizione="Quando un lead che hai portato tu diventa cliente, qui vedi i suoi pagamenti e la tua provvigione."
          azione={<LinkBottone href="/calls/new">Fissa una call</LinkBottone>}
        />
      ) : (
        <ul className="space-y-3">
          {[...vendite.values()].map((rate) => {
            const v = rate[0]
            return (
              <li key={v.sale_id} aria-label={v.cliente} className="rounded-xl bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{v.cliente}</p>
                    <p className="text-xs text-muted-foreground">
                      {v.prodotto} · {ETICHETTA_TIPO_VENDITA[v.tipo]} · venduta il{' '}
                      <span className="num">{formatData(v.data_vendita)}</span>
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="num text-sm font-semibold">{formatEuro(v.valore_contratto)}</p>
                    <p className="text-xs text-muted-foreground">revenue</p>
                  </div>
                </div>

                <dl className="mt-3 grid grid-cols-3 gap-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">Pagato</dt>
                    <dd className="num text-sm font-medium">{formatEuro(v.incassato_vendita)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Rate pagate</dt>
                    <dd className="num text-sm font-medium">
                      {v.rate_incassate} di {v.numero_rate}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">A te</dt>
                    <dd className="num text-sm font-medium">{formatEuro(v.provvigione_vendita)}</dd>
                  </div>
                </dl>

                {v.rate_in_ritardo > 0 ? (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-status-warning">
                    <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                    {v.rate_in_ritardo === 1 ? '1 rata in ritardo' : `${v.rate_in_ritardo} rate in ritardo`}
                  </p>
                ) : null}

                <details className="group mt-2">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1 text-sm text-muted-foreground hover:text-foreground [&::-webkit-details-marker]:hidden">
                    <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
                    Le rate
                  </summary>
                  <ul className="divide-y divide-border">
                    {rate.map((r, i) => {
                      const stato = statoRata(r)
                      return (
                        // a refund repeats the number of the instalment it gives back
                        <li key={`${r.numero_rata}-${i}`} className="flex items-center justify-between gap-3 py-2 text-sm">
                          <span className="min-w-0">
                            <span className="block">Rata {r.numero_rata}</span>
                            <span
                              className={
                                stato.ritardo
                                  ? 'num flex items-center gap-1 text-xs text-status-warning'
                                  : 'num block text-xs text-muted-foreground'
                              }
                            >
                              {stato.ritardo ? <TriangleAlert className="size-3 shrink-0" aria-hidden="true" /> : null}
                              {stato.testo}
                            </span>
                          </span>
                          <span className="shrink-0 text-right">
                            <span className="num block">{formatEuro(r.importo_incassato ?? r.importo_previsto)}</span>
                            {r.provvigione !== null ? (
                              <span className="num block text-xs text-muted-foreground">a te {formatEuro(r.provvigione)}</span>
                            ) : null}
                          </span>
                        </li>
                      )
                    })}
                  </ul>
                </details>
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        La provvigione matura quando il cliente paga, secondo la tua regola provvigionale. Se “A te” mostra un trattino,
        per quel tipo di vendita non hai una regola attiva: chiedi all’admin.
      </p>
    </section>
  )
}
