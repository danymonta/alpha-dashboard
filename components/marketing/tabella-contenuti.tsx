import { ExternalLink } from 'lucide-react'
import Link from 'next/link'

import { classeNome } from '@/components/marketing/badge-status'
import { MenuStatus } from '@/components/marketing/menu-status'
import { formatData, formatNumero } from '@/lib/format'
import {
  CAMPI,
  ETICHETTA_FORMAT,
  ETICHETTA_REEL_TYPE,
  ORDINE_COLONNE,
} from '@/lib/marketing/etichette'
import type { ContenutoElenco } from '@/lib/marketing/elenco'
import { cn } from '@/lib/utils'

/** What a list reads (COLONNE_ELENCO): the properties, never the four sections. */
export type RigaContenuto = ContenutoElenco

export function linkContenuto(id: string): string {
  return `/marketing/contenuti/${id}`
}

/** "Reel Type · Format", the two Notion selects side by side; empty ones are left out. */
export function tipoEFormato(r: Pick<RigaContenuto, 'reel_type' | 'formato'>): string {
  return [r.reel_type ? ETICHETTA_REEL_TYPE[r.reel_type] : null, r.formato ? ETICHETTA_FORMAT[r.formato] : null]
    .filter(Boolean)
    .join(' · ')
}

/** A 44px icon link that opens outside the app (Inspiration, the published post). */
function LinkEsterno({ href, etichetta }: { href: string; etichetta: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={etichetta}
      title={etichetta}
      className="inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <ExternalLink className="size-4" aria-hidden="true" />
    </a>
  )
}

/**
 * One content as a card: the narrow lists (the table below 960px of section,
 * the calendar's agenda). The Name opens the content (the whole card is its
 * target); the Status is its own 44px button and never opens the card.
 */
export function CardContenuto({ riga, conData = true }: { riga: RigaContenuto; conData?: boolean }) {
  const dettagli = tipoEFormato(riga)
  return (
    <li
      data-riga-contenuto={riga.id}
      data-nome-contenuto={riga.nome}
      className="relative rounded-xl bg-card p-3 transition-colors hover:bg-accent/40 has-[a[data-nome]:focus-visible]:ring-3 has-[a[data-nome]:focus-visible]:ring-ring/50"
    >
      <div className="flex items-start justify-between gap-3">
        <Link
          href={linkContenuto(riga.id)}
          data-nome=""
          className={cn(
            // wrap-anywhere: a word longer than the card (a pasted link) wraps, never cut
            'line-clamp-2 min-w-0 text-sm font-medium wrap-anywhere outline-none after:absolute after:inset-0 after:rounded-xl',
            classeNome(riga.stato),
          )}
        >
          {riga.nome}
        </Link>
        {riga.view_count !== null ? (
          <p className="shrink-0 text-right">
            <span className="num block text-sm font-medium">{formatNumero(riga.view_count)}</span>
            <span className="block text-xs text-muted-foreground">{CAMPI.view_count}</span>
          </p>
        ) : null}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-2">
        <MenuStatus id={riga.id} nome={riga.nome} stato={riga.stato} className="-ml-2" />
        {conData && riga.post_date ? (
          <span className="num text-sm text-muted-foreground">{formatData(riga.post_date)}</span>
        ) : null}
      </div>
      {dettagli ? <p className="mt-0.5 text-xs text-muted-foreground">{dettagli}</p> : null}
    </li>
  )
}

export function ListaCard({ righe, conData = true }: { righe: readonly RigaContenuto[]; conData?: boolean }) {
  return (
    <ul className="space-y-2">
      {righe.map((r) => (
        <CardContenuto key={r.id} riga={r} conData={conData} />
      ))}
    </ul>
  )
}

const ALLINEA_DESTRA = new Set<string>(['view_count'])

function Cella({ riga, colonna }: { riga: RigaContenuto; colonna: (typeof ORDINE_COLONNE)[number] }) {
  switch (colonna) {
    case 'nome':
      return (
        <Link
          href={linkContenuto(riga.id)}
          className={cn(
            // wrap-anywhere: a long word (a pasted link) never sets the column's minimum width, so the table keeps its 960px
            'line-clamp-2 font-medium wrap-anywhere underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
            classeNome(riga.stato),
          )}
        >
          {riga.nome}
        </Link>
      )
    case 'reel_type':
      return riga.reel_type ? ETICHETTA_REEL_TYPE[riga.reel_type] : null
    case 'formato':
      return riga.formato ? ETICHETTA_FORMAT[riga.formato] : null
    case 'inspiration':
      return riga.inspiration ? (
        <LinkEsterno href={riga.inspiration} etichetta={`Apri l’ispirazione di ${riga.nome}`} />
      ) : null
    case 'stato':
      return <MenuStatus id={riga.id} nome={riga.nome} stato={riga.stato} className="-ml-2" />
    case 'post_date':
      return riga.post_date ? <span className="num whitespace-nowrap">{formatData(riga.post_date)}</span> : null
    case 'audio':
      return riga.audio ? (
        <span className="block max-w-24 truncate" title={riga.audio}>
          {riga.audio}
        </span>
      ) : null
    case 'url':
      return riga.url ? <LinkEsterno href={riga.url} etichetta={`Apri il post di ${riga.nome}`} /> : null
    case 'view_count':
      return riga.view_count !== null ? <span className="num">{formatNumero(riga.view_count)}</span> : null
  }
}

/**
 * The "Tabella" view: Notion's table view, same columns in the same order,
 * from the latest Post Date. A <table> from 960px of section (container query:
 * never the screen next to the sidebar), cards below. 960px is the section at
 * its widest (main's max-w-5xl less its padding), from a 1264px window: the
 * nine columns need about 915px with Notion's longest values (the Name at
 * least 160px, "To be recorded", the 44px links), so at 896px (@4xl) the last
 * column was cut.
 */
export function TabellaContenuti({
  righe,
  totale,
  limite,
}: {
  righe: readonly RigaContenuto[]
  /** All the contents with these filters (count exact). */
  totale: number
  limite: number
}) {
  return (
    <div className="space-y-3">
      {/* the columns fit 960px of section; the inner scroll is a safety net, never the page */}
      <div className="hidden overflow-x-auto rounded-xl bg-card @min-[60rem]:block">
        <table className="w-full text-sm">
          <caption className="sr-only">Contenuti, dalla Post Date più recente</caption>
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              {ORDINE_COLONNE.map((c) => (
                <th
                  key={c}
                  scope="col"
                  className={cn(
                    'px-1.5 py-2.5 font-normal whitespace-nowrap first:pl-3 last:pr-3',
                    ALLINEA_DESTRA.has(c) ? 'text-right' : 'text-left',
                    c === 'nome' && 'w-full min-w-40',
                  )}
                >
                  {CAMPI[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => (
              <tr
                key={r.id}
                data-riga-contenuto={r.id}
                data-nome-contenuto={r.nome}
                className="border-b border-border last:border-0 hover:bg-accent/30"
              >
                {ORDINE_COLONNE.map((c) => (
                  <td
                    key={c}
                    className={cn(
                      'px-1.5 py-1 align-middle first:pl-3 last:pr-3',
                      ALLINEA_DESTRA.has(c) ? 'text-right' : 'text-left',
                      // the short values never shrink: the Name takes what is left
                      (c === 'reel_type' || c === 'stato' || c === 'post_date' || c === 'view_count') && 'whitespace-nowrap',
                      c === 'formato' && 'min-w-24',
                    )}
                  >
                    <Cella riga={r} colonna={c} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="@min-[60rem]:hidden">
        <ListaCard righe={righe} />
      </div>

      {totale > limite ? (
        <p className="text-sm text-muted-foreground">
          Si vedono i {formatNumero(limite)} più recenti: usa i filtri o la ricerca per trovare gli altri.
        </p>
      ) : null}
    </div>
  )
}
