'use client'

import { CircleCheck, ExternalLink, Info } from 'lucide-react'

import { MarkdownCliente } from '@/components/percorso/markdown-cliente'
import { PlayerYoutube } from '@/components/percorso/player-youtube'
import type { BloccoPercorso } from '@/lib/percorso/blocchi'

/**
 * How a block of the CMS looks to the client (release B1a): the same components in the
 * area /percorso, in a step read again and in the admin's preview (Impostazioni ›
 * Onboarding › Contenuti), so the preview never differs from what the client sees.
 * Read by `tipo`, never by position: a module of v3 uses the same blocks.
 *
 * `modo`: «passo» counts the video's seconds; «rileggi» and «anteprima» only show.
 * The rules of a step to accept are drawn by PassoRegole with their checkbox: here a rule
 * or an item read again is a line with its check.
 */
export type ModoBlocchi = 'passo' | 'rileggi' | 'anteprima'

export function BloccoCliente({
  blocco,
  nome,
  modo,
  onVideoVisto,
  titoloPasso,
}: {
  blocco: BloccoPercorso
  nome?: string
  modo: ModoBlocchi
  onVideoVisto?: (id: string) => void
  /** The step's own title, already the panel's heading: a text block with the same title does not repeat it. */
  titoloPasso?: string
}) {
  const titoloTesto = blocco.titolo && blocco.titolo.trim() !== titoloPasso?.trim() ? blocco.titolo : null
  switch (blocco.tipo) {
    case 'testo':
    case 'domande':
      return (
        <section className="space-y-2" data-blocco={blocco.tipo}>
          {titoloTesto ? <h3 className="font-heading text-base font-semibold tracking-tight">{titoloTesto}</h3> : null}
          {blocco.corpo ? <MarkdownCliente testo={blocco.corpo} nome={nome} /> : null}
        </section>
      )
    case 'avviso':
      return (
        <aside className="flex gap-3 rounded-xl border border-primary/30 bg-primary/10 p-4" data-blocco="avviso">
          <Info className="mt-0.5 size-5 shrink-0 text-rosso-testo" aria-hidden="true" />
          <div className="min-w-0 space-y-1">
            {blocco.titolo ? <p className="font-semibold">{blocco.titolo}</p> : null}
            {blocco.corpo ? <MarkdownCliente testo={blocco.corpo} nome={nome} /> : null}
          </div>
        </aside>
      )
    case 'video':
      return (
        <section className="space-y-3" data-blocco="video">
          {blocco.titolo ? <h3 className="font-heading text-base font-semibold tracking-tight">{blocco.titolo}</h3> : null}
          {blocco.corpo ? <MarkdownCliente testo={blocco.corpo} nome={nome} className="text-sm" /> : null}
          <PlayerYoutube
            bloccoId={blocco.id}
            youtubeId={blocco.youtubeId}
            titolo={blocco.titolo ?? 'Video'}
            percentualeIniziale={blocco.video.percentuale}
            vistoIniziale={blocco.video.visto}
            registra={modo === 'passo'}
            onVisto={() => onVideoVisto?.(blocco.id)}
          />
        </section>
      )
    case 'regola':
    case 'voce':
      return (
        <div className="flex gap-3 rounded-xl bg-muted/40 p-3" data-blocco={blocco.tipo}>
          <CircleCheck
            className={modo === 'anteprima' ? 'mt-0.5 size-5 shrink-0 text-muted-foreground' : 'mt-0.5 size-5 shrink-0 text-status-ok'}
            aria-hidden="true"
          />
          <div className="min-w-0 space-y-0.5">
            <p className="font-medium">{blocco.titolo}</p>
            {blocco.corpo ? <MarkdownCliente testo={blocco.corpo} nome={nome} className="text-sm text-muted-foreground" /> : null}
          </div>
        </div>
      )
    case 'pulsante':
      return (
        <a
          href={blocco.url}
          target="_blank"
          rel="noreferrer noopener"
          className="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm font-medium transition-colors hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
          data-blocco="pulsante"
        >
          <span className="min-w-0 break-words">{blocco.titolo}</span>
          <ExternalLink className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </a>
      )
  }
}

export function ListaBlocchi({
  blocchi,
  nome,
  modo,
  onVideoVisto,
  titoloPasso,
}: {
  blocchi: readonly BloccoPercorso[]
  nome?: string
  modo: ModoBlocchi
  onVideoVisto?: (id: string) => void
  titoloPasso?: string
}) {
  return (
    <div className="space-y-5">
      {blocchi.map((b) => (
        <BloccoCliente key={b.id} blocco={b} nome={nome} modo={modo} onVideoVisto={onVideoVisto} titoloPasso={titoloPasso} />
      ))}
    </div>
  )
}
