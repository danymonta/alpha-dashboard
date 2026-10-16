'use client'

import { CircleCheck, LoaderCircle, TriangleAlert } from 'lucide-react'
import type { MouseEvent, ReactNode } from 'react'

import { BadgePunteggio } from '@/components/marketing/analisi/badge-punteggio'
import { BadgeVerdetto } from '@/components/marketing/analisi/badge-verdetto'
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
  parolaAnalisi,
  parolaLead,
  SENZA_STATISTICHE,
  type StatoAnalisiRiga,
} from '@/lib/marketing/analisi/parole'
import { giornoPost } from '@/lib/marketing/parole-post'
import { fasciaDaCodice } from '@/lib/marketing/punteggio/tabelle'
import { cn } from '@/lib/utils'

const CONTROLLI = 'a, button, input, select, textarea, label'

function ColonnaAnalisi({ r }: { r: RigaReel }) {
  const stato = (r.analisi_stato ?? null) as StatoAnalisiRiga
  const parola = parolaAnalisi(stato)
  const Icona =
    stato === 'pronta' ? CircleCheck : stato === 'fallita' ? TriangleAlert : stato === 'in_coda' || stato === 'in_corso' ? LoaderCircle : null
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-sm whitespace-nowrap',
        stato === 'fallita' ? 'text-status-critical' : stato === 'pronta' ? 'text-foreground' : 'text-muted-foreground',
      )}
      data-testid="colonna-analisi"
    >
      {Icona ? <Icona className={cn('size-4 shrink-0', stato === 'in_corso' && 'animate-spin', stato === 'pronta' && 'text-status-ok')} aria-hidden="true" /> : null}
      {parola}
    </span>
  )
}

/** The score of the last ready analysis that has one; a reel never scored says «Non valutato». */
function PunteggioDelReel({ r }: { r: RigaReel }) {
  const f = fasciaDaCodice(r.punteggio_fascia)
  return <BadgePunteggio totale={r.punteggio_totale} fascia={f?.codice ?? null} />
}

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
          className={cn(
            'line-clamp-2 min-h-11 text-sm font-medium wrap-anywhere outline-none',
            comeCard && 'after:absolute after:inset-0 after:rounded-xl',
            'inline-flex items-center',
          )}
        >
          {titoloReel(r)}
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
      className="group/riga relative rounded-xl bg-card p-3 transition-colors hover:bg-accent/40 has-[a[data-apri-reel]:focus-visible]:ring-3 has-[a[data-apri-reel]:focus-visible]:ring-ring/50"
    >
      <NomeReel r={r} comeCard />
      <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-2 pl-[3.75rem] text-sm">
        <Cella etichetta="Views">
          <Views r={r} />
        </Cella>
        <Cella etichetta="Salvataggi">
          <Salvataggi r={r} />
        </Cella>
        <Cella etichetta="Visione media">
          <span className="num">{r.metriche_stato === 'lette' ? formatVisione(r.avg_watch_ms, r.quota_vista) : '–'}</span>
        </Cella>
        <Cella etichetta="Lead dai DM">
          <span className="num">{parolaLead(r)}</span>
        </Cella>
        <Cella etichetta="Verdetto">
          <BadgeVerdetto verdetto={r.verdetto_oggi} />
        </Cella>
        <Cella etichetta="Punteggio">
          <PunteggioDelReel r={r} />
        </Cella>
        <Cella etichetta="Analisi">
          <ColonnaAnalisi r={r} />
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
      <td className="min-w-56 py-2 pr-2 pl-3">
        <NomeReel r={r} />
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap">
        <Views r={r} />
      </td>
      <td className="px-2 py-2 text-right whitespace-nowrap">
        <Salvataggi r={r} />
      </td>
      <td className="num px-2 py-2 text-right whitespace-nowrap">{r.metriche_stato === 'lette' ? formatVisione(r.avg_watch_ms, r.quota_vista) : '–'}</td>
      <td className="num min-w-36 px-2 py-2 text-sm">{parolaLead(r)}</td>
      <td className="px-2 py-2">
        <BadgeVerdetto verdetto={r.verdetto_oggi} />
      </td>
      <td className="px-2 py-2" data-testid="colonna-punteggio">
        <PunteggioDelReel r={r} />
      </td>
      <td className="py-2 pr-3 pl-2">
        <ColonnaAnalisi r={r} />
      </td>
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
        <table className="w-full text-sm" data-testid="tabella-reel">
          <caption className="sr-only">Reel, con i numeri contro la mediana e il verdetto</caption>
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="py-2.5 pr-2 pl-3 text-left font-normal">Reel</th>
              <th scope="col" className="px-2 py-2.5 text-right font-normal">Views</th>
              <th scope="col" className="px-2 py-2.5 text-right font-normal">Salvataggi</th>
              <th scope="col" className="px-2 py-2.5 text-right font-normal">Visione media</th>
              <th scope="col" className="px-2 py-2.5 text-left font-normal">Lead dai DM</th>
              <th scope="col" className="px-2 py-2.5 text-left font-normal">Verdetto</th>
              <th scope="col" className="px-2 py-2.5 text-left font-normal">Punteggio</th>
              <th scope="col" className="py-2.5 pr-3 pl-2 text-left font-normal">Analisi</th>
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
