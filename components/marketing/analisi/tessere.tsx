import Link from 'next/link'

import { formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { PUBBLICATI } from '@/lib/i18n/testi/pubblicati'
import type { Riepilogo } from '@/lib/marketing/analisi/elenco'
import { hrefPubblicati, type FiltriPubblicati } from '@/lib/marketing/pubblicati/filtri'
import { cn } from '@/lib/utils'

function Tessera({
  etichetta,
  valore,
  nota,
  testId,
  href,
  mostra,
}: {
  etichetta: string
  valore: string
  nota?: string
  testId: string
  /** a tile that is also a filter: a tap shows the reels it counts */
  href?: string
  /** the words of that link */
  mostra?: string
}) {
  const corpo = (
    <>
      <p className="text-sm text-muted-foreground">{etichetta}</p>
      <p className="num mt-1 text-2xl font-semibold">{valore}</p>
      {nota ? <p className="mt-1 text-sm text-muted-foreground">{nota}</p> : null}
    </>
  )
  if (href) {
    return (
      <Link
        href={href}
        prefetch={false}
        scroll={false}
        className={cn('block min-w-0 rounded-xl bg-card p-4 transition-colors hover:bg-accent/40 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none')}
        data-testid={testId}
      >
        {corpo}
        <span className="mt-1 block text-sm underline underline-offset-4">{mostra}</span>
      </Link>
    )
  }
  return (
    <div className="min-w-0 rounded-xl bg-card p-4" data-testid={testId}>
      {corpo}
    </div>
  )
}

/**
 * The tiles of the Pubblicati page (analisi_riepilogo, the ones of the old Analisi page): reels of the period, the
 * median of views at three days, the leads of the first 14 days and the reels
 * that say «Cambiare». The leads are SQL's: a reel whose days the Insight did
 * not count is said as such, never counted as zero. No gold: the page has no
 * number more important than the others.
 */
export function Tessere({ r, filtri, lingua = 'it' }: { r: Riepilogo | null; filtri: FiltriPubblicati; lingua?: Lingua }) {
  const t = PUBBLICATI[lingua].tessere
  const { formatNumero } = formato(lingua)
  if (r === null) {
    // the tiles could not be read: the page goes on without them (1.37.1)
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="analisi-tessere" data-non-lette="1">
        <Tessera testId="tessera-reel" etichetta={t.reel} valore={t.nd} nota={t.nonCaricato} />
        <Tessera testId="tessera-views" etichetta={t.views} valore={t.nd} nota={t.nonCaricato} />
        <Tessera testId="tessera-lead" etichetta={t.lead} valore={t.nd} nota={t.nonCaricato} />
        <Tessera testId="tessera-cambiare" etichetta={t.cambiare} valore={t.nd} nota={t.nonCaricato} />
      </div>
    )
  }
  const lead = r.reel_contati > 0
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="analisi-tessere">
      <Tessera testId="tessera-reel" etichetta={t.reel} valore={formatNumero(r.reel)} />
      <Tessera
        testId="tessera-views"
        etichetta={t.views}
        valore={r.views_3g_mediana === null ? t.nd : formatNumero(Math.round(r.views_3g_mediana))}
        nota={t.mediana}
      />
      <Tessera
        testId="tessera-lead"
        etichetta={t.lead}
        valore={lead ? formatNumero(r.dm_14g) : t.nd}
        nota={lead ? t.inTarget(formatNumero(r.in_target_14g), r.reel_non_contati) : t.nessunContato}
      />
      <Tessera
        testId="tessera-cambiare"
        etichetta={t.cambiare}
        valore={formatNumero(r.da_cambiare)}
        nota={t.dicono(r.da_cambiare)}
        mostra={t.mostra}
        href={r.da_cambiare > 0 && !filtri.cambiare ? hrefPubblicati({ ...filtri, cambiare: true }) : undefined}
      />
    </div>
  )
}
