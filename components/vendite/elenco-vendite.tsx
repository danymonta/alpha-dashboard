import { TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { Fragment } from 'react'

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
    <span className="inline-flex items-center gap-1 text-xs text-status-warning">
      <TriangleAlert className="size-3.5" aria-hidden="true" />
      {n === 1 ? '1 rata in ritardo' : `${n} rate in ritardo`}
    </span>
  )
}

/**
 * Sales list: cards below 768px, table above (CLAUDE.md section 11).
 * Amounts come from v_vendite: this component only formats them.
 */
export function ElencoVendite({ righe, mostraPersone }: { righe: RigaVendita[]; mostraPersone: boolean }) {
  return (
    <>
      <ul className="space-y-2 md:hidden" data-testid="elenco-vendite">
        {righe.map((r) => (
          <li key={r.id}>
            <Link href={`/sales/${r.id}`} className="block rounded-xl bg-card p-3 hover:bg-accent">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{r.cliente}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {ETICHETTA_TIPO_VENDITA[r.tipo]} · {r.prodotto} · {formatData(r.data_vendita)}
                  </p>
                </div>
                <p className="num shrink-0 text-right text-sm font-medium">{formatEuro(r.valore_contratto)}</p>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3 text-xs text-muted-foreground">
                <span className="num">
                  Incassato {formatEuro(r.incassato)} · da incassare {formatEuro(r.da_incassare)}
                </span>
                <Ritardo n={r.rate_in_ritardo} />
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-xl bg-card md:block">
        {/* fixed layout: stacked tables (e.g. Le mie vendite) keep their columns aligned */}
        <table className="w-full table-fixed text-sm">
          <caption className="sr-only">Vendite</caption>
          <colgroup>
            <col />
            <col className="w-20" />
            <col className="w-28" />
            {mostraPersone ? <col className="w-44" /> : null}
            <col className="w-28" />
            <col className="w-28" />
            <col className="w-36" />
          </colgroup>
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="px-3 py-2.5 text-left font-normal">Cliente</th>
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
                <td className="px-3 py-2.5">
                  <Link href={`/sales/${r.id}`} className="font-medium hover:underline">
                    {r.cliente}
                  </Link>
                  <p className="text-xs text-muted-foreground">{r.prodotto}</p>
                </td>
                <td className="px-3 py-2.5">{ETICHETTA_TIPO_VENDITA[r.tipo]}</td>
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
