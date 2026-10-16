import Link from 'next/link'

import { formatNumero } from '@/lib/format'
import type { Riepilogo } from '@/lib/marketing/analisi/elenco'
import { hrefAnalisi, type FiltriAnalisi } from '@/lib/marketing/analisi/filtri'
import { cn } from '@/lib/utils'

function Tessera({
  etichetta,
  valore,
  nota,
  testId,
  href,
}: {
  etichetta: string
  valore: string
  nota?: string
  testId: string
  /** a tile that is also a filter: a tap shows the reels it counts */
  href?: string
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
        <span className="mt-1 block text-sm underline underline-offset-4">Mostra i reel</span>
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
 * The tiles of the Analisi page (analisi_riepilogo): reels of the period, the
 * median of views at three days, the leads of the first 14 days and the reels
 * that say «Cambiare». The leads are SQL's: a reel whose days the Insight did
 * not count is said as such, never counted as zero. No gold: the page has no
 * number more important than the others.
 */
export function Tessere({ r, filtri }: { r: Riepilogo | null; filtri: FiltriAnalisi }) {
  if (r === null) {
    // the tiles could not be read: the page goes on without them (1.37.1)
    return (
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="analisi-tessere" data-non-lette="1">
        <Tessera testId="tessera-reel" etichetta="Reel del periodo" valore="n/d" nota="non caricato" />
        <Tessera testId="tessera-views" etichetta="Views a 3 giorni" valore="n/d" nota="non caricato" />
        <Tessera testId="tessera-lead" etichetta="Lead dai DM" valore="n/d" nota="non caricato" />
        <Tessera testId="tessera-cambiare" etichetta="Da cambiare" valore="n/d" nota="non caricato" />
      </div>
    )
  }
  const lead = r.reel_contati > 0
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="analisi-tessere">
      <Tessera testId="tessera-reel" etichetta="Reel del periodo" valore={formatNumero(r.reel)} />
      <Tessera
        testId="tessera-views"
        etichetta="Views a 3 giorni"
        valore={r.views_3g_mediana === null ? 'n/d' : formatNumero(Math.round(r.views_3g_mediana))}
        nota="mediana dei reel"
      />
      <Tessera
        testId="tessera-lead"
        etichetta="Lead dai DM"
        valore={lead ? formatNumero(r.dm_14g) : 'n/d'}
        nota={
          lead
            ? `${formatNumero(r.in_target_14g)} in target nei primi 14 giorni${
                r.reel_non_contati > 0 ? `; ${r.reel_non_contati} reel non contati` : ''
              }`
            : 'nessun reel contato ancora'
        }
      />
      <Tessera
        testId="tessera-cambiare"
        etichetta="Da cambiare"
        valore={formatNumero(r.da_cambiare)}
        nota={r.da_cambiare === 1 ? 'reel dice «Cambiare»' : 'reel dicono «Cambiare»'}
        href={r.da_cambiare > 0 && filtri.verdetto !== 'cambiare' ? hrefAnalisi({ ...filtri, verdetto: 'cambiare' }) : undefined}
      />
    </div>
  )
}
