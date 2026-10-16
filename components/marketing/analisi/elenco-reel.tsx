'use client'

import type { MouseEvent, ReactNode } from 'react'

import { CosaFareRiga } from '@/components/marketing/analisi/cosa-fare-riga'
import { usePannelloReel } from '@/components/marketing/analisi/contesto-reel'
import { LinkReel } from '@/components/marketing/analisi/link-reel'
import { titoloReel } from '@/components/marketing/analisi/scheda-reel'
import { CopertinaPost } from '@/components/marketing/instagram/copertina-post'
import { formatNumero } from '@/lib/format'
import type { RigaReel } from '@/lib/marketing/analisi/elenco'
import {
  formatDurata,
  formatRapporto,
  formatTasso,
  formatVisione,
  parolaLead,
  SENZA_STATISTICHE,
} from '@/lib/marketing/analisi/parole'
import { giornoPost } from '@/lib/marketing/parole-post'
import { cn } from '@/lib/utils'

const CONTROLLI = 'a, button, input, select, textarea, label'

function Views({ r }: { r: RigaReel }) {
  if (r.metriche_stato !== 'lette') return <span className="text-sm text-muted-foreground">{SENZA_STATISTICHE}</span>
  const rapporto = formatRapporto(r.views_rapporto)
  return (
    <span className="num block">
      <span className="block text-sm font-medium">{r.views === null ? 'n/d' : formatNumero(r.views)}</span>
      {rapporto ? <span className="block text-xs text-muted-foreground">{rapporto} della mediana</span> : null}
    </span>
  )
}

function Salvataggi({ r }: { r: RigaReel }) {
  if (r.metriche_stato !== 'lette') return <span className="text-sm text-muted-foreground">–</span>
  return (
    <span className="num block">
      <span className="block text-sm">{formatTasso(r.tasso_salvataggi) ?? 'n/d'}</span>
      <span className="block text-xs text-muted-foreground">{r.saved === null ? '' : `${formatNumero(r.saved)} salvati`}</span>
    </span>
  )
}

function NomeReel({ r, comeCard }: { r: RigaReel; comeCard?: boolean }) {
  const id = r.media_id ?? ''
  return (
    <div className="flex min-w-0 items-start gap-3">
      <CopertinaPost url={r.copertina_url} tipo="reel" />
      <div className="min-w-0 space-y-0.5">
        <LinkReel
          id={id}
          riga={r}
          className={cn('flex min-h-11 items-center text-sm font-medium outline-none', comeCard && 'after:absolute after:inset-0 after:rounded-xl')}
        >
          {/* the clamp sits on the text: on the link itself the flex of the 44 px target would undo it */}
          <span className="line-clamp-2 wrap-anywhere">{titoloReel(r)}</span>
        </LinkReel>
        <p className="num text-xs text-muted-foreground">
          {r.giorno ? giornoPost(r.giorno) : ''}
          {r.durata_ms ? ` · ${formatDurata(r.durata_ms / 1000)}` : ''}
          {r.eliminato ? ' · non più su Instagram' : ''}
        </p>
      </div>
    </div>
  )
}

function CardReel({ r }: { r: RigaReel }) {
  return (
    <li
      data-riga-reel={r.media_id}
      className="group/riga relative space-y-3 rounded-xl bg-card p-3 transition-colors hover:bg-accent/40 has-[a[data-apri-reel]:focus-visible]:ring-3 has-[a[data-apri-reel]:focus-visible]:ring-ring/50"
    >
      <NomeReel r={r} comeCard />
      <div className="border-t border-border pt-3 pl-[3.75rem]">
        <CosaFareRiga r={r} />
      </div>
      <dl className="grid grid-cols-3 gap-x-3 gap-y-2 pl-[3.75rem] text-sm">
        <Cella etichetta="Views">
          <Views r={r} />
        </Cella>
        <Cella etichetta="Salvataggi">
          <Salvataggi r={r} />
        </Cella>
        <Cella etichetta="Lead dai DM">
          <span className="num text-xs">{parolaLead(r)}</span>
        </Cella>
      </dl>
    </li>
  )
}

function Cella({ etichetta, children }: { etichetta: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{etichetta}</dt>
      <dd className="break-words">{children}</dd>
    </div>
  )
}

function RigaTabella({ r }: { r: RigaReel }) {
  const pannello = usePannelloReel()
  function clic(e: MouseEvent<HTMLTableRowElement>) {
    const bersaglio = e.target as Element
    if (!pannello || !e.currentTarget.contains(bersaglio) || bersaglio.closest(CONTROLLI)) return
    if ((window.getSelection()?.toString() ?? '') !== '') return
    const link = e.currentTarget.querySelector<HTMLElement>('[data-apri-reel]')
    if (r.media_id) pannello.apri(r.media_id, { da: link, riga: r })
  }
  return (
    <tr data-riga-reel={r.media_id} onClick={clic} className="cursor-pointer border-b border-border align-top last:border-0 hover:bg-accent/30">
      <td className="py-2.5 pr-2 pl-3">
        <NomeReel r={r} />
      </td>
      <td className="px-2 py-2.5" data-testid="colonna-punteggio">
        <CosaFareRiga r={r} />
      </td>
      <td className="px-2 py-2.5 text-right">
        <Views r={r} />
      </td>
      <td className="px-2 py-2.5 text-right whitespace-nowrap">
        <Salvataggi r={r} />
      </td>
      <td className="num px-2 py-2.5 text-right whitespace-nowrap">{r.metriche_stato === 'lette' ? formatVisione(r.avg_watch_ms, r.quota_vista) : '–'}</td>
      <td className="num py-2.5 pr-3 pl-2 text-right text-xs whitespace-nowrap">{parolaLead(r)}</td>
    </tr>
  )
}

/**
 * The reels of the period (1.36.0): a table from 960 px of section, cards
 * below (a container query on the section, never the screen next to the
 * sidebar). Every figure, ratio and verdict is read from the view; here they
 * are only said. A tap on a row outside its links opens the panel.
 */
export function ElencoReel({ righe, limite }: { righe: readonly RigaReel[]; limite: number }) {
  return (
    <div className="space-y-3">
      <div className="hidden overflow-x-auto rounded-xl bg-card @min-[60rem]:block">
        <table className="w-full table-fixed text-sm" data-testid="tabella-reel">
          <caption className="sr-only">Reel, con cosa fare per ognuno e i numeri contro la mediana</caption>
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="py-2.5 pr-2 pl-3 text-left font-normal">Reel</th>
              <th scope="col" className="w-56 px-2 py-2.5 text-left font-normal">Cosa fare</th>
              <th scope="col" className="w-24 px-2 py-2.5 text-right font-normal">Views</th>
              <th scope="col" className="w-24 px-2 py-2.5 text-right font-normal">Salvataggi</th>
              <th scope="col" className="w-24 px-2 py-2.5 text-right font-normal">Visione media</th>
              <th scope="col" className="w-44 py-2.5 pr-3 pl-2 text-right font-normal">Lead dai DM</th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => (
              <RigaTabella key={r.media_id} r={r} />
            ))}
          </tbody>
        </table>
      </div>
      <ul className="space-y-2 @min-[60rem]:hidden">
        {righe.map((r) => (
          <CardReel key={r.media_id} r={r} />
        ))}
      </ul>
      {righe.length >= limite ? (
        <p className="text-sm text-muted-foreground">
          Si vedono i {formatNumero(limite)} reel più recenti del periodo: restringi il periodo o usa i filtri per trovare gli altri.
        </p>
      ) : null}
    </div>
  )
}
