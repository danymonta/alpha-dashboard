import { TriangleAlert } from 'lucide-react'
import { Fragment } from 'react'

import { IndicatoreLink, LinkRiga } from '@/components/shell/link-riga'
import { formatData, formatEuro } from '@/lib/format'
import { ETICHETTA_TIPO_VENDITA, type TipoVendita } from '@/lib/validation/vendita'

export type RigaVendita = {
  id: string
  cliente: string
  prodotto: string
  tipo: TipoVendita
  data_vendita: string
  valore_contratto: number
  incassato: number | null
  da_incassare: number | null
  rate_in_ritardo: number | null
  prossima_scadenza: string | null
  closer?: string | null
  setter?: string | null
}

function Ritardo({ n }: { n: number | null }) {
  if (!n) return null
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs whitespace-nowrap text-status-warning">
      <TriangleAlert className="size-3.5" aria-hidden="true" />
      {n === 1 ? '1 rata in ritardo' : `${n} rate in ritardo`}
    </span>
  )
}

/**
 * Sales list: cards below 768px, table above (CLAUDE.md section 11).
 * Amounts come from v_vendite: this component only formats them.
 */
export function ElencoVendite({
  righe,
  mostraPersone,
  mostraCliente = true,
}: {
  righe: RigaVendita[]
  mostraPersone: boolean
  /** false inside a client's page: every row is the same client, the product leads. */
  mostraCliente?: boolean
}) {
  return (
    <>
      <ul className="space-y-2 md:hidden" data-testid="elenco-vendite" data-tour="elenco-vendite">
        {righe.map((r) => (
          <li key={r.id}>
            <LinkRiga href={`/sales/${r.id}`} className="block rounded-xl bg-card p-3 hover:bg-accent">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium">
                    <span className="truncate">{mostraCliente ? r.cliente : r.prodotto}</span>
                    <IndicatoreLink />
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {mostraCliente ? `${ETICHETTA_TIPO_VENDITA[r.tipo]} · ${r.prodotto}` : ETICHETTA_TIPO_VENDITA[r.tipo]}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="num text-sm font-medium">{formatEuro(r.valore_contratto)}</p>
                  <p className="num text-xs text-muted-foreground">{formatData(r.data_vendita)}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="num min-w-0">
                  Incassato {formatEuro(r.incassato)} · da incassare {formatEuro(r.da_incassare)}
                </span>
                <Ritardo n={r.rate_in_ritardo} />
              </div>
            </LinkRiga>
          </li>
        ))}
      </ul>

      {/* x-scroll inside the card only if the viewport is narrower than the columns */}
      <div className="hidden overflow-x-auto rounded-xl bg-card md:block" data-tour="elenco-vendite">
        {/* fixed layout: stacked tables (e.g. Le mie vendite) keep their columns aligned.
            A client's history is a single table: auto layout sizes it on its content. */}
        <table className={`w-full text-sm ${mostraCliente ? 'table-fixed' : 'table-auto'}`}>
          <caption className="sr-only">Vendite</caption>
          {mostraCliente ? (
            <colgroup>
              <col />
              <col className="w-20" />
              <col className="w-28" />
              {mostraPersone ? <col className="w-44" /> : null}
              <col className="w-28" />
              <col className="w-28" />
              <col className="w-36" />
            </colgroup>
          ) : null}
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              {mostraCliente ? (
                <th scope="col" className="px-3 py-2.5 text-left font-normal">Cliente</th>
              ) : null}
              <th scope="col" className="px-3 py-2.5 text-left font-normal">Tipo</th>
              <th scope="col" className="px-3 py-2.5 text-left font-normal">Data</th>
              {mostraPersone ? (
                <th scope="col" className="px-3 py-2.5 text-left font-normal">Closer · Setter</th>
              ) : null}
              <th scope="col" className="px-3 py-2.5 text-right font-normal">Valore</th>
              <th scope="col" className="px-3 py-2.5 text-right font-normal">Incassato</th>
              <th scope="col" className="px-3 py-2.5 text-right font-normal">Da incassare</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {righe.map((r) => (
              <tr key={r.id} className="hover:bg-accent/50">
                {mostraCliente ? (
                  <>
                    <td className="px-3 py-2.5">
                      <LinkRiga href={`/sales/${r.id}`} className="inline-flex items-center gap-1.5 font-medium hover:underline">
                        {r.cliente}
                        <IndicatoreLink />
                      </LinkRiga>
                      <p className="text-xs text-muted-foreground">{r.prodotto}</p>
                    </td>
                    <td className="px-3 py-2.5">{ETICHETTA_TIPO_VENDITA[r.tipo]}</td>
                  </>
                ) : (
                  <td className="px-3 py-2.5">
                    <LinkRiga href={`/sales/${r.id}`} className="inline-flex items-center gap-1.5 font-medium hover:underline">
                      {ETICHETTA_TIPO_VENDITA[r.tipo]}
                      <IndicatoreLink />
                    </LinkRiga>
                    <p className="text-xs text-muted-foreground">{r.prodotto}</p>
                  </td>
                )}
                <td className="px-3 py-2.5">{formatData(r.data_vendita)}</td>
                {mostraPersone ? (
                  <td className="px-3 py-2.5 text-muted-foreground">
                    {/* fixed column: wrap between the two names, never inside one */}
                    {[r.closer, r.setter].filter(Boolean).length > 0
                      ? [r.closer, r.setter]
                          .filter(Boolean)
                          .map((nome, i) => (
                            <Fragment key={i}>
                              {i > 0 ? ' · ' : null}
                              <span className="whitespace-nowrap">{nome}</span>
                            </Fragment>
                          ))
                      : '–'}
                  </td>
                ) : null}
                <td className="px-3 py-2.5 text-right">{formatEuro(r.valore_contratto)}</td>
                <td className="px-3 py-2.5 text-right">{formatEuro(r.incassato)}</td>
                <td className="px-3 py-2.5 text-right">
                  {formatEuro(r.da_incassare)}
                  <div>
                    <Ritardo n={r.rate_in_ritardo} />
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
