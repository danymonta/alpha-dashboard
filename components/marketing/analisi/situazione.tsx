import { CircleCheck, Clock, TriangleAlert } from 'lucide-react'

import { quando } from '@/app/(app)/settings/instagram/quando'
import { aggiungiGiorni, formatOra, oggiRoma } from '@/lib/date'
import { formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { PUBBLICATI } from '@/lib/i18n/testi/pubblicati'
import type { Situazione } from '@/lib/marketing/analisi/elenco'

/** "oggi alle 00:41" in the page's language. */
function quandoIn(istante: string, oggi: string, lingua: Lingua): string {
  if (lingua === 'it') return quando(istante, oggi)
  const t = PUBBLICATI[lingua]
  const giorno = oggiRoma(new Date(istante))
  const ora = formatOra(istante)
  if (giorno === oggi) return t.quandoOggi(ora)
  if (giorno === aggiungiGiorni(oggi, -1)) return t.quandoIeri(ora)
  return t.quandoIl(formato(lingua).formatData(giorno), ora)
}

/**
 * The line under the title: what the work is doing, as marketing_lavori_situazione
 * says it (the video editor reads it too: no money in it, no person). A read
 * that failed says nothing.
 */
export function RigaSituazione({
  situazione,
  oggi,
  permesso,
  accountStatistiche,
  lingua = 'it',
}: {
  situazione: Situazione | null
  oggi: string
  /** Meta said the permission for the statistics is missing: false */
  permesso: boolean | null
  accountStatistiche?: string
  lingua?: Lingua
}) {
  if (!situazione && permesso !== false) return null
  const t = PUBBLICATI[lingua]
  const s = situazione
  const buona = s?.automatiche === 'attive'
  return (
    <div className="space-y-1.5" data-testid="analisi-situazione">
      {s ? (
        <p className="flex items-start gap-1.5 text-sm text-muted-foreground">
          {buona ? (
            <CircleCheck className="mt-0.5 size-4 shrink-0 text-status-ok" aria-hidden="true" />
          ) : (
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-status-warning" aria-hidden="true" />
          )}
          <span>
            {t.situazione[s.automatiche]}
            {s.in_coda > 0 ? t.inCoda(s.in_coda) : ''}
          </span>
        </p>
      ) : null}
      {s?.ultimo_passo_il ? (
        <p className="num flex items-center gap-1.5 text-sm text-muted-foreground">
          <Clock className="size-4 shrink-0" aria-hidden="true" />
          {t.ultimoLavoro(quandoIn(s.ultimo_passo_il, oggi, lingua))}
        </p>
      ) : null}
      {permesso === false ? (
        <p className="flex items-start gap-1.5 text-sm text-status-warning" role="status">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {t.senzaPermesso(accountStatistiche ?? '')}
        </p>
      ) : null}
    </div>
  )
}
