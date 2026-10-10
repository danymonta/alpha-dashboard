'use client'

import type { MouseEvent } from 'react'

import { classeNome } from '@/components/marketing/badge-status'
import { CellaContenuto, EditorCella, MenuScelta } from '@/components/marketing/cella-contenuto'
import { usePannello } from '@/components/marketing/contesto-pannello'
import { LinkContenuto } from '@/components/marketing/link-contenuto'
import { MenuStatus } from '@/components/marketing/menu-status'
import { formatNumero } from '@/lib/format'
import type { ContenutoElenco } from '@/lib/marketing/elenco'
import { CAMPI, ORDINE_COLONNE } from '@/lib/marketing/etichette'
import { hrefContenuto } from '@/lib/marketing/pannello'
import { cn } from '@/lib/utils'

/** What a list reads (COLONNE_ELENCO): the properties, never the four sections. */
export type RigaContenuto = ContenutoElenco

/** A content's own page (direct links, Cmd/Ctrl-click). */
export function linkContenuto(id: string): string {
  return hrefContenuto(id)
}

/** A tap on a row outside its controls opens the panel (a mouse comfort; the Name link is the way for keyboards). */
const CONTROLLI = 'a, button, input, select, textarea, label, [role="menu"], [data-cella]'

/**
 * One content as a card: the narrow lists (the table below 960px of section,
 * the calendar's agenda, "Senza data"). The Name opens the panel (the whole
 * card is its target); Status, Post Date, Reel Type and Format are chips of
 * 44 px each that change the property and never open the card (1.33.0). The
 * other properties change in the panel; View Count is only read here.
 */
export function CardContenuto({ riga }: { riga: RigaContenuto }) {
  return (
    <li
      data-riga-contenuto={riga.id}
      data-nome-contenuto={riga.nome}
      className="group/riga relative rounded-xl bg-card p-3 transition-colors hover:bg-accent/40 has-[a[data-apri-contenuto]:focus-visible]:ring-3 has-[a[data-apri-contenuto]:focus-visible]:ring-ring/50"
    >
      <div className="flex items-start justify-between gap-3">
        <LinkContenuto
          id={riga.id}
          riga={riga}
          className={cn(
            // wrap-anywhere: a word longer than the card (a pasted link) wraps, never cut
            'line-clamp-2 min-w-0 text-sm font-medium wrap-anywhere outline-none after:absolute after:inset-0 after:rounded-xl',
            classeNome(riga.stato),
          )}
        >
          {riga.nome}
        </LinkContenuto>
        {riga.view_count !== null ? (
          <p className="shrink-0 text-right">
            <span className="num block text-sm font-medium">{formatNumero(riga.view_count)}</span>
            <span className="block text-xs text-muted-foreground">{CAMPI.view_count}</span>
          </p>
        ) : null}
      </div>
      <div className="mt-1 -ml-2 flex flex-wrap items-center gap-x-1">
        <MenuStatus id={riga.id} nome={riga.nome} stato={riga.stato} />
        <EditorCella id={riga.id} nome={riga.nome} campo="post_date" valore={riga.post_date} aspetto="chip" />
        <MenuScelta id={riga.id} nome={riga.nome} campo="reel_type" valore={riga.reel_type} aspetto="chip" />
        <MenuScelta id={riga.id} nome={riga.nome} campo="formato" valore={riga.formato} aspetto="chip" />
      </div>
    </li>
  )
}

export function ListaCard({ righe }: { righe: readonly RigaContenuto[] }) {
  return (
    <ul className="space-y-2">
      {righe.map((r) => (
        <CardContenuto key={r.id} riga={r} />
      ))}
    </ul>
  )
}

const ALLINEA_DESTRA = new Set<string>(['view_count'])

function RigaTabella({ riga }: { riga: RigaContenuto }) {
  const pannello = usePannello()

  function clic(e: MouseEvent<HTMLTableRowElement>) {
    const bersaglio = e.target as Element
    // a click inside a popover bubbles here through React's tree: only clicks in the row's own box count
    if (!pannello || !e.currentTarget.contains(bersaglio) || bersaglio.closest(CONTROLLI)) return
    if ((window.getSelection()?.toString() ?? '') !== '') return
    const link = e.currentTarget.querySelector<HTMLElement>('[data-apri-contenuto]')
    pannello.apri(riga.id, { da: link, riga })
  }

  return (
    <tr
      data-riga-contenuto={riga.id}
      data-nome-contenuto={riga.nome}
      onClick={clic}
      className="group/riga cursor-pointer border-b border-border last:border-0 hover:bg-accent/30"
    >
      {ORDINE_COLONNE.map((c) => (
        <td
          key={c}
          className={cn(
            'px-1.5 py-0.5 align-middle first:pl-3 last:pr-3',
            ALLINEA_DESTRA.has(c) ? 'text-right' : 'text-left',
            // the short values never shrink: the Name takes what is left
            (c === 'reel_type' || c === 'stato' || c === 'post_date' || c === 'view_count') && 'whitespace-nowrap',
            c === 'formato' && 'min-w-24',
          )}
        >
          <CellaContenuto riga={riga} colonna={c} />
        </td>
      ))}
    </tr>
  )
}

/**
 * The "Tabella" view: Notion's table view, same columns in the same order,
 * from the latest Post Date. A <table> from 960px of section (container query:
 * never the screen next to the sidebar), cards below. 960px is the section at
 * its widest (main's max-w-5xl less its padding), from a 1264px window: the
 * nine columns need about 915px with Notion's longest values (the Name at
 * least 160px, "To be recorded", the 44px links), so at 896px (@4xl) the last
 * column was cut. Every property changes from its own cell (1.33.0): admin,
 * video editor and marketing, the three who see the page.
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
              <RigaTabella key={r.id} riga={r} />
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
