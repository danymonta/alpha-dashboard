import { ChevronDown, ScrollText } from 'lucide-react'

import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { NOME_APP } from '@/lib/brand/nome'
import { ETICHETTA_DESTINATARIO, VERSIONE_CORRENTE, VERSIONI, type Versione } from '@/lib/changelog/versioni'
import { formatData } from '@/lib/format'

export const dynamic = 'force-dynamic'

export default async function ChangelogPage() {
  await requireRuolo(['admin'])
  const corrente = VERSIONE_CORRENTE

  return (
    <div className="max-w-3xl space-y-5">
      <IntestazionePagina
        titolo="Changelog"
        descrizione={`Ogni versione di ${NOME_APP}, dalla più recente. Le 0.x sono le tappe prima della produzione.`}
        indietro={{ href: '/settings', etichetta: 'Impostazioni' }}
      />

      {!corrente ? (
        <StatoVuoto
          Icona={ScrollText}
          titolo="Nessuna versione registrata"
          descrizione="Le versioni compaiono qui a ogni aggiornamento pubblicato della Dashboard."
        />
      ) : (
        <>
          <section aria-labelledby="versione-in-uso" className="rounded-xl bg-card p-4" data-testid="versione-corrente">
            <h2 id="versione-in-uso" className="text-sm text-muted-foreground">
              Versione in uso
            </h2>
            {/* the one gold element of the screen */}
            <p className="num mt-1 text-4xl font-semibold tracking-tight text-gold">v{corrente.versione}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              <span className="num">{formatData(corrente.data)}</span> · {corrente.titolo}
            </p>
          </section>

          <ol className="space-y-3" aria-label="Versioni, dalla più recente">
            {VERSIONI.map((v) => (
              <li key={v.versione}>
                {/* the latest day reads in full; older versions open with a tap, so the page stays short on a phone */}
                <SchedaVersione versione={v} aperta={v.data === corrente.data} />
              </li>
            ))}
          </ol>
        </>
      )}
    </div>
  )
}

function idTitolo(v: Versione): string {
  return `versione-${v.versione.replaceAll('.', '-')}`
}

/** "7 novità · 2 correzioni": what a closed card holds. */
function conteggio(v: Versione): string {
  const correzioni = v.correzioni?.length ?? 0
  return [
    v.novita.length > 0 ? `${v.novita.length} novità` : null,
    correzioni > 0 ? `${correzioni} ${correzioni === 1 ? 'correzione' : 'correzioni'}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Version, date, title and summary: spans and one heading, valid inside <summary> too. */
function Testata({ v }: { v: Versione }) {
  return (
    <>
      <span className="num block text-sm text-muted-foreground">
        <span className="font-medium text-foreground">v{v.versione}</span> · {formatData(v.data)}
      </span>
      <h2 id={idTitolo(v)} className="text-base font-semibold">
        {v.titolo}
      </h2>
      <span className="block text-sm text-muted-foreground">{v.riassunto}</span>
    </>
  )
}

function Corpo({ v }: { v: Versione }) {
  return (
    <>
      <Elenco titolo="Novità" voci={v.novita} />
      <Elenco titolo="Correzioni" voci={v.correzioni ?? []} />
      {v.perChi?.length ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="text-xs text-muted-foreground">Per</span>
          <ul className="flex flex-wrap gap-1.5" aria-label="Per chi">
            {v.perChi.map((chi) => (
              <li key={chi} className="rounded-md border border-border px-2 py-0.5 text-xs text-foreground">
                {ETICHETTA_DESTINATARIO[chi]}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  )
}

function SchedaVersione({ versione: v, aperta }: { versione: Versione; aperta: boolean }) {
  if (aperta) {
    return (
      <article aria-labelledby={idTitolo(v)} className="space-y-3 rounded-xl bg-card p-4" data-testid="versione">
        <header className="space-y-1">
          <Testata v={v} />
        </header>
        <Corpo v={v} />
      </article>
    )
  }

  return (
    <details className="group rounded-xl bg-card" data-testid="versione">
      {/* heading and spans as direct children: the only content <summary> allows */}
      <summary className="relative block min-h-11 cursor-pointer list-none space-y-1 rounded-xl p-4 pr-11 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <Testata v={v} />
        <span className="block text-xs text-muted-foreground group-open:hidden">{conteggio(v)}</span>
        <ChevronDown className="absolute top-4 right-4 size-4 text-muted-foreground group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-3 px-4 pb-4">
        <Corpo v={v} />
      </div>
    </details>
  )
}

function Elenco({ titolo, voci }: { titolo: string; voci: string[] }) {
  if (voci.length === 0) return null
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{titolo}</h3>
      <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed break-words marker:text-muted-foreground">
        {voci.map((voce) => (
          <li key={voce}>{voce}</li>
        ))}
      </ul>
    </section>
  )
}
