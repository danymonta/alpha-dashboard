import { CircleHelp, LoaderCircle, TriangleAlert } from 'lucide-react'

import { BadgeVerdetto } from '@/components/marketing/analisi/badge-verdetto'
import { COLORE_FASCIA, ICONA_FASCIA } from '@/components/marketing/analisi/badge-punteggio'
import { cosaFare, type StatoAnalisiCosaFare } from '@/lib/marketing/analisi/cosa-fare'
import type { Lingua } from '@/lib/i18n/lingua'
import { PUBBLICATI } from '@/lib/i18n/testi/pubblicati'
import type { RigaReel } from '@/lib/marketing/analisi/elenco'
import { fasciaDaCodice } from '@/lib/marketing/punteggio/tabelle'
import { cn } from '@/lib/utils'

const STATI: readonly string[] = ['in_coda', 'in_corso', 'pronta', 'fallita']

/**
 * The «Cosa fare» of a reel in the list (1.39.1): the score, what to do with the reel in a few words, and under it
 * how it went with the audience (the verdict of the numbers). One cell instead of the three columns of before
 * (verdict, score, analysis), which said three close things and none of them what to do. The sentence of the
 * panel (lib/marketing/analisi/cosa-fare.ts) is the same, in its short form.
 */
export function CosaFareRiga({ r, lingua = 'it' }: { r: RigaReel; lingua?: Lingua }) {
  const t = PUBBLICATI[lingua]
  const f = r.punteggio_totale !== null ? fasciaDaCodice(r.punteggio_fascia) : null
  const stato = STATI.includes(r.analisi_stato ?? '') ? (r.analisi_stato as StatoAnalisiCosaFare) : null
  const cf = cosaFare({
    fascia: f?.codice ?? null,
    verdetto: r.verdetto_oggi,
    giovane: r.eta_ore !== null && r.eta_ore < 72,
    statoAnalisi: stato,
    eliminato: r.eliminato === true,
  })
  const Icona = f
    ? ICONA_FASCIA[f.codice]
    : cf.chiave === 'in_lavoro'
      ? LoaderCircle
      : cf.chiave === 'non_riuscita'
        ? TriangleAlert
        : CircleHelp
  const colore = f ? COLORE_FASCIA[f.codice] : cf.chiave === 'non_riuscita' ? 'text-status-critical' : 'text-muted-foreground'
  return (
    <div className="flex items-start gap-3" data-testid="colonna-cosa-fare" data-punteggio={f?.codice ?? 'vuoto'} data-cosa-fare={cf.chiave}>
      {f && r.punteggio_totale !== null ? (
        <span className="num w-8 shrink-0 text-right text-lg leading-6 font-semibold" aria-label={t.punteggio(r.punteggio_totale)} data-testid="punteggio-numero">
          {r.punteggio_totale}
        </span>
      ) : null}
      <div className="min-w-0 space-y-0.5">
        <p className={cn('flex items-start gap-1.5 text-sm font-medium', colore)}>
          <Icona className={cn('mt-0.5 size-4 shrink-0', cf.chiave === 'in_lavoro' && 'animate-spin')} aria-hidden="true" />
          <span className="min-w-0 wrap-break-word">{t.breve[cf.chiave]}</span>
        </p>
        {r.eliminato ? null : (
          <BadgeVerdetto
            verdetto={r.verdetto_oggi}
            vuoto={r.eta_ore !== null && r.eta_ore < 72 ? t.troppoPresto : t.nessunVerdetto}
            className="text-xs font-normal"
            lingua={lingua}
          />
        )}
      </div>
    </div>
  )
}
