'use client'

import { ExternalLink, Link2 } from 'lucide-react'
import { useState, type MouseEvent, type ReactNode } from 'react'

import { CosaFareRiga } from '@/components/marketing/analisi/cosa-fare-riga'
import { usePannelloReel } from '@/components/marketing/analisi/contesto-reel'
import { LinkReel } from '@/components/marketing/analisi/link-reel'
import { CopertinaPost } from '@/components/marketing/instagram/copertina-post'
import { LinkContenuto } from '@/components/marketing/link-contenuto'
import { useOpzioni } from '@/components/marketing/opzioni-contesto'
import { Pillola } from '@/components/marketing/pillola'
import { FoglioCollega, useCollega, type PostPerCollegare } from '@/components/marketing/pubblicati/collega'
import { useLingua } from '@/components/i18n/lingua-provider'
import { Button } from '@/components/ui/button'
import { formato, GIORNI_BREVI_EN, parseDataISO } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { PUBBLICATI } from '@/lib/i18n/testi/pubblicati'
import type { RigaReel } from '@/lib/marketing/analisi/elenco'
import { formatDurata, formatRapporto } from '@/lib/marketing/analisi/parole'
import { nomeDaDidascalia } from '@/lib/marketing/da-post'
import { giornoPost } from '@/lib/marketing/parole-post'
import { eReel, numeroOTrattino, tipoDellaRiga, TRATTINO } from '@/lib/marketing/pubblicati/parole'
import { opzioneDaValore, type CampoOpzione } from '@/lib/marketing/opzioni'
import { cn } from '@/lib/utils'

const CONTROLLI = 'a, button, input, select, textarea, label'

/** The title of a post in the table: the first line of its caption that says something, or «Reel del 03/10/2026». */
export function titoloPost(r: Pick<RigaReel, 'didascalia_inizio' | 'giorno' | 'media_type' | 'reel'>, lingua: Lingua = 'it'): string {
  const daDidascalia = nomeDaDidascalia(r.didascalia_inizio)
  if (daDidascalia) return daDidascalia
  const t = PUBBLICATI[lingua]
  const nome = t.tipoPost[tipoDellaRiga(r)]
  return r.giorno ? t.titoloPost(nome, formato(lingua).formatData(r.giorno)) : nome
}

/** "ven 03/10/2026", or "Fri 03 Oct 2026" in English. */
function giornoIn(giorno: string, lingua: Lingua): string {
  if (lingua === 'it') return giornoPost(giorno)
  return `${GIORNI_BREVI_EN[parseDataISO(giorno).getDay()]} ${formato(lingua).formatData(giorno)}`
}

/** «×1,4» or, in English, «×1.4». */
function rapportoIn(rapporto: string | null, lingua: Lingua): string | null {
  return rapporto && lingua === 'en' ? rapporto.replace(',', '.') : rapporto
}

function postPerCollegare(r: RigaReel): PostPerCollegare | null {
  if (!r.shortcode || !r.giorno) return null
  return { shortcode: r.shortcode, giorno: r.giorno, tipo: tipoDellaRiga(r) }
}

/** The Reel Type or Format of the linked content as its pill, read only (the Piano editoriale changes it). */
function EtichettaLetta({ campo, valore }: { campo: CampoOpzione; valore: string | null }) {
  const { opzioni } = useOpzioni()
  const o = opzioneDaValore(opzioni[campo], valore)
  if (!o) return null
  return <Pillola nome={o.nome} colore={o.colore} />
}

/**
 * The «Piano editoriale» cell: the Name of the linked content, a link that opens its panel, with the pills of its
 * Reel Type and Format; or, when the post is not linked, one discreet button «Collega» (the sheet with the search).
 * Nobody has to link a post: one published before the plan, or never planned, is a normal row.
 */
function CellaPiano({ r, onCollega }: { r: RigaReel; onCollega: (post: PostPerCollegare) => void }) {
  const { puoScrivere } = useCollega()
  const lingua = useLingua()
  const t = PUBBLICATI[lingua]
  const post = postPerCollegare(r)
  if (r.contenuto_id) {
    return (
      <div className="min-w-0 space-y-1" data-testid="cella-piano">
        <LinkContenuto
          id={r.contenuto_id}
          className="line-clamp-2 min-h-6 text-sm font-medium wrap-anywhere underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          {r.nome ?? t.contenuto}
        </LinkContenuto>
        {r.reel_type || r.formato ? (
          <div className="flex flex-wrap gap-1">
            <EtichettaLetta campo="reel_type" valore={r.reel_type} />
            <EtichettaLetta campo="formato" valore={r.formato} />
          </div>
        ) : null}
      </div>
    )
  }
  if (!post || !puoScrivere) return <span className="text-sm text-muted-foreground">{TRATTINO}</span>
  return (
    <Button
      type="button"
      variant="ghost"
      className="-mx-2 h-11 gap-1.5 px-2 text-muted-foreground"
      onClick={() => onCollega(post)}
      aria-label={t.collegaPost(giornoIn(post.giorno, lingua))}
      data-testid="collega"
    >
      <Link2 className="size-4" aria-hidden="true" />
      {t.collega}
    </Button>
  )
}

/** The cover, the start of the caption (a link that opens the reel's panel), the day and the kind, and the post on Instagram. */
function CellaPost({ r, comeCard }: { r: RigaReel; comeCard?: boolean }) {
  const id = r.media_id ?? ''
  const tipo = tipoDellaRiga(r)
  const lingua = useLingua()
  const t = PUBBLICATI[lingua]
  return (
    <div className="flex min-w-0 items-start gap-3">
      <CopertinaPost url={r.copertina_url} tipo={tipo} className="h-12 w-9" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <LinkReel
          id={id}
          riga={r}
          className={cn('flex min-h-11 items-center text-sm font-medium outline-none', comeCard && 'after:absolute after:inset-0 after:rounded-xl')}
        >
          {/* the clamp sits on the text: on the link itself the flex of the 44 px target would undo it */}
          <span className="line-clamp-2 wrap-anywhere">{titoloPost(r, lingua)}</span>
        </LinkReel>
        <p className="num text-xs wrap-anywhere text-muted-foreground">
          {r.giorno ? giornoIn(r.giorno, lingua) : ''} · {t.tipoPost[tipo]}
          {r.durata_ms ? ` · ${formatDurata(r.durata_ms / 1000)}` : ''}
        </p>
      </div>
      {r.permalink ? (
        <a
          href={r.permalink}
          target="_blank"
          rel="noopener noreferrer"
          title={t.apriInstagram}
          aria-label={t.apriInstagramDi(titoloPost(r, lingua))}
          className="relative z-10 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
        >
          <ExternalLink className="size-4" aria-hidden="true" />
          <span className="sr-only">{t.nuovaScheda}</span>
        </a>
      ) : null}
    </div>
  )
}

/** Views, and for a reel under it how it stands against the median of the account at the same age. */
function Views({ r }: { r: RigaReel }) {
  const lingua = useLingua()
  const rapporto = eReel(r) ? rapportoIn(formatRapporto(r.views_rapporto), lingua) : null
  return (
    <span className="num block" data-testid="num-views">
      <span className="block text-sm font-medium">{numeroOTrattino(r.views, lingua)}</span>
      {rapporto && r.views !== null ? <span className="block text-xs text-muted-foreground">{rapporto}</span> : null}
    </span>
  )
}

/** The comments Instagram counted: the insight's, or the count of the post's own listing. */
function commenti(r: RigaReel): number | null {
  return r.comments ?? r.comments_count
}

// the titles are the page's (PUBBLICATI.colonne)
const COLONNE_NUMERI = [
  { chiave: 'views', larghezza: 'w-[4.25rem]' },
  { chiave: 'reach', larghezza: 'w-[3.75rem]' },
  { chiave: 'saved', larghezza: 'w-[4.25rem]' },
  { chiave: 'shares', larghezza: 'w-[5.5rem]' },
  { chiave: 'commenti', larghezza: 'w-[4.75rem]' },
  { chiave: 'dm', larghezza: 'w-[3rem]' },
  { chiave: 'target', larghezza: 'w-[4.25rem]' },
  { chiave: 'call', larghezza: 'w-[3.25rem]' },
] as const

function valoreNumero(r: RigaReel, chiave: (typeof COLONNE_NUMERI)[number]['chiave'], lingua: Lingua): ReactNode {
  switch (chiave) {
    case 'views':
      return <Views r={r} />
    case 'reach':
      return numeroOTrattino(r.reach, lingua)
    case 'saved':
      return numeroOTrattino(r.saved, lingua)
    case 'shares':
      return numeroOTrattino(r.shares, lingua)
    case 'commenti':
      return numeroOTrattino(commenti(r), lingua)
    case 'dm':
      return numeroOTrattino(r.dm, lingua)
    case 'target':
      return numeroOTrattino(r.lead_in_target, lingua)
    case 'call':
      return numeroOTrattino(r.call_prenotate, lingua)
  }
}

/** The score and what to do with a reel (the existing pill); a carousel or a photo has no score. */
function CosaFare({ r }: { r: RigaReel }) {
  const lingua = useLingua()
  if (!eReel(r)) return <span className="text-sm text-muted-foreground">{TRATTINO}</span>
  return <CosaFareRiga r={r} lingua={lingua} />
}

function RigaTabella({ r, onCollega }: { r: RigaReel; onCollega: (post: PostPerCollegare) => void }) {
  const pannello = usePannelloReel()
  const lingua = useLingua()
  function clic(e: MouseEvent<HTMLTableRowElement>) {
    const bersaglio = e.target as Element
    if (!pannello || !e.currentTarget.contains(bersaglio) || bersaglio.closest(CONTROLLI)) return
    if ((window.getSelection()?.toString() ?? '') !== '') return
    const link = e.currentTarget.querySelector<HTMLElement>('[data-apri-reel]')
    if (r.media_id) pannello.apri(r.media_id, { da: link, riga: r })
  }
  return (
    <tr data-riga-post={r.media_id} onClick={clic} className="group/riga cursor-pointer border-b border-border/70 align-middle last:border-0 hover:bg-muted">
      <td className="sticky left-0 z-10 bg-background py-1.5 pr-2 pl-3 group-hover/riga:bg-muted">
        <CellaPost r={r} />
      </td>
      <td className="px-2 py-1.5">
        <CellaPiano r={r} onCollega={onCollega} />
      </td>
      {COLONNE_NUMERI.map((c) => (
        <td key={c.chiave} className={cn('num px-2 py-1.5 text-right text-sm whitespace-nowrap', c.larghezza)} data-colonna={c.chiave}>
          {valoreNumero(r, c.chiave, lingua)}
        </td>
      ))}
      <td className="py-1.5 pr-3 pl-3" data-testid="colonna-punteggio">
        <CosaFare r={r} />
      </td>
    </tr>
  )
}

function Numero({ titolo, children }: { titolo: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{titolo}</dt>
      <dd className="num text-sm break-words">{children}</dd>
    </div>
  )
}

/** The same post as a card (below 960 px of section): its numbers in a small grid under the cover and the title. */
function CardPost({ r, onCollega }: { r: RigaReel; onCollega: (post: PostPerCollegare) => void }) {
  const lingua = useLingua()
  const t = PUBBLICATI[lingua]
  return (
    <li data-riga-post={r.media_id} className="group/riga relative space-y-2 rounded-xl bg-card p-3 transition-colors hover:bg-accent/40 has-[a[data-apri-reel]:focus-visible]:ring-3 has-[a[data-apri-reel]:focus-visible]:ring-ring/50">
      <CellaPost r={r} comeCard />
      <div className="relative z-10 border-t border-border pt-2">
        <p className="text-xs text-muted-foreground">{t.filtri.piano}</p>
        <CellaPiano r={r} onCollega={onCollega} />
      </div>
      <dl className="grid grid-cols-4 gap-x-3 gap-y-2 border-t border-border pt-2">
        {COLONNE_NUMERI.map((c) => (
          <Numero key={c.chiave} titolo={t.colonne[c.chiave]}>
            {valoreNumero(r, c.chiave, lingua)}
          </Numero>
        ))}
      </dl>
      {eReel(r) ? (
        <div className="border-t border-border pt-2">
          <CosaFare r={r} />
        </div>
      ) : null}
    </li>
  )
}

/**
 * The published posts, a clean table in the grammar of the Piano editoriale (thin borders, small headers, quiet
 * rows) from 960 px of section, cards below (a container query on the section, never the screen next to the
 * sidebar). One row per post or reel of the account: the cover and the start of its caption (a tap opens the reel's
 * panel), the content of the plan it is linked to with its pills or «Collega», and the numbers side by side:
 * the Instagram insights, the leads from the DMs, the score. Every figure is SQL's and a number not read is «–»,
 * never 0. The table scrolls inside its box when the section is narrower than its columns: never the page.
 */
export function TabellaPubblicati({ righe, limite }: { righe: readonly RigaReel[]; limite: number }) {
  const [daCollegare, setDaCollegare] = useState<PostPerCollegare | null>(null)
  const lingua = useLingua()
  const t = PUBBLICATI[lingua]
  return (
    <div className="space-y-3">
      {/* The columns need about 1090 px and the page's content is 960: on a computer with the sidebar open the table takes
          the room the page leaves free on both sides (centred, never wider than the screen less the sidebar and its margins);
          with the sidebar shrunk the page is wide already. Narrower than the columns it scrolls inside its own box. */}
      <div className="hidden @min-[60rem]:block md:relative md:left-1/2 md:w-[min(70rem,calc(100vw-19rem))] md:-translate-x-1/2 group-data-[sidebar=ridotta]/shell:md:left-0 group-data-[sidebar=ridotta]/shell:md:w-full group-data-[sidebar=ridotta]/shell:md:translate-x-0">
        <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[69.5rem] table-fixed text-sm" data-testid="tabella-pubblicati">
          <caption className="sr-only">{t.caption}</caption>
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="sticky left-0 z-10 w-[16.5rem] bg-background py-2 pr-2 pl-3 text-left font-normal">
                {t.post}
              </th>
              <th scope="col" className="w-[9rem] px-2 py-2 text-left font-normal">
                {t.filtri.piano}
              </th>
              {COLONNE_NUMERI.map((c) => (
                <th key={c.chiave} scope="col" className={cn('px-2 py-2 text-right font-normal whitespace-nowrap', c.larghezza)}>
                  {t.colonne[c.chiave]}
                </th>
              ))}
              <th scope="col" className="w-[10rem] py-2 pr-3 pl-3 text-left font-normal">
                {t.cosaFare}
              </th>
            </tr>
          </thead>
          <tbody>
            {righe.map((r) => (
              <RigaTabella key={r.media_id} r={r} onCollega={setDaCollegare} />
            ))}
          </tbody>
        </table>
        </div>
      </div>

      <ul className="space-y-2 @min-[60rem]:hidden" data-testid="card-pubblicati">
        {righe.map((r) => (
          <CardPost key={r.media_id} r={r} onCollega={setDaCollegare} />
        ))}
      </ul>

      {righe.length >= limite ? (
        <p className="text-sm text-muted-foreground">
          {t.limite(formato(lingua).formatNumero(limite))}
        </p>
      ) : null}

      <FoglioCollega post={daCollegare} onChiudi={() => setDaCollegare(null)} />
    </div>
  )
}
