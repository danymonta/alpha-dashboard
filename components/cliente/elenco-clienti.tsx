'use client'

import { ChevronDown, CircleCheck, ListChecks, TriangleAlert } from 'lucide-react'
import { useId, useState } from 'react'

import { CartellaDrive } from '@/components/cliente/cartella-drive'
import { ContrattoVendita } from '@/components/cliente/contratto-vendita'
import { StatoClienteBadge } from '@/components/cliente/stato-cliente'
import { StatoRata } from '@/components/pagamento/stato-rata'
import { IndicatoreLink, LinkRiga } from '@/components/shell/link-riga'
import {
  etichettaPercorsoVendita,
  nomeCompleto,
  prossimaRata,
  testoMetodi,
  testoPercorso,
  testoRata,
  testoRatePagate,
  type RigaElenco,
} from '@/lib/clienti/elenco'
import { formatData, formatEuro } from '@/lib/format'
import type { ConfigPicker } from '@/lib/google/picker'
import { cn } from '@/lib/utils'
import { ETICHETTA_METODO, type Metodo } from '@/lib/validation/incasso'

/*
 * The table of the client list (Dany, 21/10/2026), minimal like Notion: tall
 * rows, thin borders, small headers, nothing decorative. One DOM for both
 * layouts: a grid of ARIA rows that is a table from xl (the content column is
 * 960px wide, seven columns do not fit before) and a list of cards below, with
 * each cell's label shown only on the cards. Admin only: it carries the
 * contract, which no other role ever reads.
 */

const COLONNE = [
  'Cliente',
  'Percorso',
  'Contratto',
  'Cartella Drive',
  'Pagato',
  'Come paga',
  'Rate da saldare',
] as const

/** The same seven columns for the header and every row. */
const GRIGLIA =
  'xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1.5fr)_minmax(0,0.85fr)_minmax(0,0.85fr)_minmax(0,1.05fr)_minmax(0,1fr)_minmax(0,1.4fr)]'

function Cella({
  etichetta,
  larga = false,
  className,
  children,
}: {
  etichetta: string
  /** Full width on the cards; a table cell like the others from xl. */
  larga?: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <div role="cell" className={cn('min-w-0', larga && 'col-span-2 xl:col-span-1', className)}>
      <span className="mb-0.5 block text-xs text-muted-foreground xl:hidden">{etichetta}</span>
      {children}
    </div>
  )
}

function PianoRate({ riga, oggi, id }: { riga: RigaElenco; oggi: string; id: string }) {
  return (
    <div
      id={id}
      role="row"
      data-testid="piano-rate-cliente"
      className="mt-2 rounded-xl bg-muted/20 px-3 py-2 xl:mt-0 xl:rounded-none xl:border-t xl:border-border"
    >
      <div role="cell">
        <ul className="divide-y divide-border" aria-label={`Piano rate di ${nomeCompleto(riga)}`}>
          {riga.rate.map((rata) => {
            const pagata = rata.stato === 'incassata' || rata.stato === 'rimborsata'
            const metodo = rata.metodo ? ETICHETTA_METODO[rata.metodo as Metodo] : null
            return (
              <li
                key={rata.numero}
                data-in-ritardo={rata.in_ritardo || undefined}
                className={cn(
                  'flex flex-wrap items-center gap-x-3 gap-y-0.5 py-2 text-sm',
                  rata.in_ritardo && '-mx-3 bg-status-warning/10 px-3',
                )}
              >
                <span className="num w-8 shrink-0 text-muted-foreground">{rata.numero}ª</span>
                <span className="num w-24 shrink-0">{formatData(pagata ? rata.incassato_il : rata.scadenza)}</span>
                <span className="num w-24 shrink-0 text-right font-medium">
                  {formatEuro(rata.importo_incassato ?? rata.importo_previsto)}
                </span>
                <StatoRata stato={rata.stato} scadenza={rata.scadenza} oggi={oggi} className="shrink-0 text-xs" />
                {pagata && metodo ? <span className="text-xs text-muted-foreground">{metodo}</span> : null}
              </li>
            )
          })}
        </ul>
        <p className="py-2 text-xs text-muted-foreground">
          Per segnare un incasso apri la{' '}
          <LinkRiga href={`/sales/${riga.sale_id}`} className="rounded-sm underline hover:text-foreground">
            vendita
          </LinkRiga>{' '}
          o la{' '}
          <LinkRiga href={`/clients/${riga.client_id}`} className="rounded-sm underline hover:text-foreground">
            scheda del cliente
          </LinkRiga>
          .
        </p>
      </div>
    </div>
  )
}

function RigaCliente({
  riga,
  handle,
  oggi,
  picker,
  solaLettura,
}: {
  riga: RigaElenco
  handle: string | null
  oggi: string
  picker: ConfigPicker | null
  solaLettura: boolean
}) {
  const [aperto, setAperto] = useState(false)
  const id = useId()
  const nome = nomeCompleto(riga)
  const percorso = testoPercorso(riga, oggi)
  const etichettaVendita = etichettaPercorsoVendita(riga.tipo, riga.numero_percorso)
  const metodi = testoMetodi(riga.metodi)
  const prossima = prossimaRata(riga)
  const daSaldare = riga.rate.filter((r) => r.stato === 'prevista' || r.stato === 'fallita').length
  const inRitardo = Number(riga.in_ritardo) > 0

  return (
    <div role="rowgroup" data-testid="riga-cliente" aria-label={nome} className="border-border xl:border-b xl:last:border-b-0">
      <div
        role="row"
        className={cn(
          'grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl border border-border bg-card p-3',
          'xl:items-start xl:gap-x-3 xl:rounded-none xl:border-0 xl:bg-transparent xl:px-3 xl:py-4',
          GRIGLIA,
        )}
      >
        <Cella etichetta="Cliente" larga>
          <div className="flex items-start justify-between gap-2 xl:block">
            <div className="min-w-0">
              <LinkRiga
                href={`/clients/${riga.client_id}`}
                className="inline-flex items-center gap-1.5 rounded-sm text-sm font-medium break-words hover:underline focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {nome}
                <IndicatoreLink />
              </LinkRiga>
              {handle ? <p className="truncate text-xs text-muted-foreground">{handle}</p> : null}
            </div>
            <StatoClienteBadge stato={riga.stato} className="shrink-0 text-xs xl:mt-1 xl:flex" />
          </div>
        </Cella>

        <Cella etichetta="Percorso" larga>
          <p className="num text-sm" data-testid="percorso-mese">
            {percorso.principale}
          </p>
          {percorso.avanzamento !== null ? (
            <div
              role="progressbar"
              aria-label="Avanzamento del percorso"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(percorso.avanzamento * 100)}
              className="my-1.5 h-1 w-full overflow-hidden rounded-full bg-muted"
            >
              <div className="h-full rounded-full bg-primary" style={{ width: `${Math.round(percorso.avanzamento * 100)}%` }} />
            </div>
          ) : null}
          <p className="num text-xs text-muted-foreground">{percorso.dettaglio}</p>
          <p className="text-xs text-muted-foreground">
            {etichettaVendita}
            {riga.prodotto ? ` · ${riga.prodotto}` : ''}
          </p>
          {riga.stato === 'sospeso' && riga.sospeso_il ? (
            <p className="num text-xs text-muted-foreground">Sospeso dal {formatData(riga.sospeso_il)}</p>
          ) : null}
        </Cella>

        <Cella etichetta="Contratto">
          <ContrattoVendita
            saleId={riga.sale_id}
            cliente={nome}
            percorso={etichettaVendita}
            url={riga.contratto_url}
            picker={picker}
            variante="cella"
            solaLettura={solaLettura}
          />
        </Cella>

        <Cella etichetta="Cartella Drive">
          <CartellaDrive
            clientId={riga.client_id}
            cliente={nome}
            url={riga.cartella_url}
            chi="admin"
            picker={picker}
            variante="cella"
            solaLettura={solaLettura}
          />
        </Cella>

        <Cella etichetta="Pagato">
          <p className="num text-sm font-medium" data-testid="pagato">
            {formatEuro(riga.incassato)}
          </p>
          <p className="num text-xs text-muted-foreground">su {formatEuro(riga.valore_contratto)}</p>
          {/* the lifetime value: what he paid across every path (a figure, not a ranking) */}
          <p className="num text-xs text-muted-foreground" data-testid="ltv">
            LTV {formatEuro(riga.ltv, { compatto: true })}
          </p>
        </Cella>

        <Cella etichetta="Come paga">
          <p className="text-sm">{metodi ?? <span className="text-muted-foreground">Nessun incasso</span>}</p>
          <p className="num text-xs text-muted-foreground">{testoRatePagate(riga)}</p>
        </Cella>

        <Cella etichetta="Rate da saldare" larga>
          {prossima ? (
            <div className="space-y-1">
              <p className="num text-sm" data-testid="prossima-rata">
                <span className="text-muted-foreground">{testoRata(prossima, riga.rate_totali)} · </span>
                {formatData(prossima.scadenza)} · {formatEuro(riga.prossimo_importo ?? prossima.importo_previsto)}
              </p>
              {inRitardo ? (
                <p className="num flex items-center gap-1.5 text-xs font-medium text-status-warning" data-testid="in-ritardo">
                  <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
                  In ritardo: {formatEuro(riga.in_ritardo)}
                </p>
              ) : null}
              <p className="num text-xs text-muted-foreground">
                {daSaldare === 1 ? '1 rata' : `${daSaldare} rate`} da saldare · {formatEuro(riga.da_incassare)}
              </p>
            </div>
          ) : (
            <p className="flex items-center gap-1.5 text-sm text-status-ok">
              <CircleCheck className="size-4 shrink-0" aria-hidden="true" />
              Tutto saldato
            </p>
          )}
          {riga.rate.length > 0 ? (
            <button
              type="button"
              aria-expanded={aperto}
              aria-controls={id}
              onClick={() => setAperto((v) => !v)}
              className="-ml-1 mt-1 inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-xs text-muted-foreground hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <ListChecks className="size-4 shrink-0" aria-hidden="true" />
              {aperto ? 'Nascondi il piano' : 'Piano rate'}
              <span className="sr-only"> di {nome}</span>
              <ChevronDown className={cn('size-4 shrink-0 transition-transform', aperto && 'rotate-180')} aria-hidden="true" />
            </button>
          ) : null}
        </Cella>
      </div>
      {aperto ? <PianoRate riga={riga} oggi={oggi} id={id} /> : null}
    </div>
  )
}

/** The list: header on the table layout, one row (card) per client. */
export function ElencoClienti({
  righe,
  handle,
  oggi,
  picker,
  etichetta,
  solaLettura = false,
}: {
  righe: RigaElenco[]
  /** Instagram handle by client id (the list function does not carry it). */
  handle: Record<string, string | null>
  oggi: string
  picker: ConfigPicker | null
  etichetta: string
  /** The business coach (22/10/2026): the links open, nothing changes them. */
  solaLettura?: boolean
}) {
  return (
    <div role="table" aria-label={etichetta} className="xl:overflow-hidden xl:rounded-xl xl:border xl:border-border xl:bg-card">
      <div role="rowgroup" className="hidden xl:block">
        <div role="row" className={cn('grid gap-x-3 border-b border-border px-3 py-2', GRIGLIA)}>
          {COLONNE.map((c) => (
            <div key={c} role="columnheader" className="text-xs font-normal text-muted-foreground">
              {c}
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-2 xl:space-y-0">
        {righe.map((r) => (
          <RigaCliente key={r.client_id} riga={r} handle={handle[r.client_id] ?? null} oggi={oggi} picker={picker} solaLettura={solaLettura} />
        ))}
      </div>
    </div>
  )
}
