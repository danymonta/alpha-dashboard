import Link from 'next/link'

import {
  ETICHETTA_ORDINE,
  ETICHETTA_PERIODO,
  ETICHETTA_VERDETTO_FILTRO,
  hrefAnalisi,
  ORDINI,
  PERIODI,
  sonoFiltriPredefiniti,
  VERDETTI_FILTRO,
  type FiltriAnalisi,
} from '@/lib/marketing/analisi/filtri'
import { cn } from '@/lib/utils'

function Gruppo({ etichetta, children }: { etichetta: string; children: React.ReactNode }) {
  return (
    <div role="group" aria-label={etichetta} className="flex flex-wrap items-center gap-1">
      {children}
    </div>
  )
}

function Voce({ href, attiva, children }: { href: string; attiva: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      prefetch={false}
      scroll={false}
      aria-current={attiva ? 'true' : undefined}
      className={cn(
        'inline-flex min-h-11 items-center rounded-lg px-3 text-sm whitespace-nowrap transition-colors focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none',
        attiva ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
      )}
    >
      {children}
    </Link>
  )
}

/**
 * The filters of the Analisi page, as links: they live in the address (a
 * reload, a shared link, Back keep them) and need no script. Period, verdict
 * of today («Da analizzare» = no analysis ready yet), reels without a
 * content of the calendar, and the order.
 */
export function FiltriAnalisiVista({ filtri }: { filtri: FiltriAnalisi }) {
  return (
    <nav aria-label="Filtri dell’analisi" className="space-y-1" data-testid="filtri-analisi">
      <Gruppo etichetta="Periodo">
        {PERIODI.map((p) => (
          <Voce key={p} href={hrefAnalisi({ ...filtri, periodo: p })} attiva={filtri.periodo === p}>
            {ETICHETTA_PERIODO[p]}
          </Voce>
        ))}
      </Gruppo>
      <Gruppo etichetta="Verdetto">
        {VERDETTI_FILTRO.map((v) => (
          <Voce key={v} href={hrefAnalisi({ ...filtri, verdetto: v })} attiva={filtri.verdetto === v}>
            {ETICHETTA_VERDETTO_FILTRO[v]}
          </Voce>
        ))}
      </Gruppo>
      <Gruppo etichetta="Ordine e collegamento">
        {ORDINI.map((o) => (
          <Voce key={o} href={hrefAnalisi({ ...filtri, ordine: o })} attiva={filtri.ordine === o}>
            {ETICHETTA_ORDINE[o]}
          </Voce>
        ))}
        <Voce href={hrefAnalisi({ ...filtri, senzaContenuto: !filtri.senzaContenuto })} attiva={filtri.senzaContenuto}>
          Senza contenuto in calendario
        </Voce>
        {!sonoFiltriPredefiniti(filtri) ? (
          <Link
            href="/marketing/analisi"
            prefetch={false}
            className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm underline underline-offset-4 hover:text-foreground"
          >
            Togli i filtri
          </Link>
        ) : null}
      </Gruppo>
    </nav>
  )
}
