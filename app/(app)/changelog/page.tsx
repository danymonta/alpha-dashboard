import { ChevronDown, Megaphone } from 'lucide-react'

import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { leggeComeAdmin, percorsoIniziale, TUTTI_I_RUOLI } from '@/lib/auth/roles'
import { requireRuolo } from '@/lib/auth/session'
import { NOME_APP } from '@/lib/brand/nome'
import { ETICHETTA_PUBBLICO, VERSIONE_CORRENTE, type Pubblico } from '@/lib/changelog/versioni'
import { versioniPer, type VersioneVisibile, type VoceVisibile } from '@/lib/changelog/visibili'
import { formatData } from '@/lib/format'

export const dynamic = 'force-dynamic'

/**
 * The changelog, for every role (CLAUDE.md section 23): the version in use on
 * top for everyone, then only the items of the person's work, filtered here on
 * the server. The admin reads everything, with who reads each item.
 */
export default async function NovitaPage() {
  const { ruolo } = await requireRuolo(TUTTI_I_RUOLI)
  // the business coach reads every item like the admin (22/10/2026)
  const admin = leggeComeAdmin(ruolo)
  const corrente = VERSIONE_CORRENTE
  const versioni = versioniPer(ruolo)
  // the heading of the version in use, when this role reads it
  const inUso = versioni[0]?.versione === corrente?.versione ? versioni[0]?.intestazione : null

  return (
    <div className="max-w-3xl space-y-5">
      <IntestazionePagina
        titolo="Novità"
        descrizione={
          admin
            ? `Il changelog di ${NOME_APP}, dalla più recente: ogni voce dice per chi è, e il team legge solo le voci del suo lavoro. Le 0.x sono le tappe prima della produzione.`
            : `Cosa cambia nel tuo lavoro a ogni versione di ${NOME_APP}, dalla più recente. Le 0.x sono le tappe prima della produzione.`
        }
      />

      {corrente ? (
        <section aria-labelledby="versione-in-uso" className="rounded-xl bg-card p-4" data-testid="versione-corrente">
          <h2 id="versione-in-uso" className="text-sm text-muted-foreground">
            Versione in uso
          </h2>
          {/* the one gold element of the screen */}
          <p className="num mt-1 text-4xl font-semibold tracking-tight text-gold">v{corrente.versione}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="num">{formatData(corrente.data)}</span>
            {inUso ? <> · {inUso.titolo}</> : null}
          </p>
        </section>
      ) : null}

      {versioni.length === 0 ? (
        <StatoVuoto
          Icona={Megaphone}
          titolo="Ancora nessuna novità per te"
          descrizione="Le novità del tuo lavoro compaiono qui a ogni aggiornamento dell’app."
          azione={<LinkBottone href={percorsoIniziale(ruolo)}>Torna al lavoro</LinkBottone>}
        />
      ) : (
        <ol className="space-y-3" aria-label="Versioni, dalla più recente">
          {versioni.map((v) => (
            <li key={v.versione}>
              {/* the latest day reads in full; older versions open with a tap, so the page stays short on a phone */}
              <SchedaVersione versione={v} aperta={v.data === corrente?.data} />
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function idTitolo(v: VersioneVisibile): string {
  return `versione-${v.versione.replaceAll('.', '-')}`
}

/** "7 novità · 2 correzioni": what a closed card holds. */
function conteggio(v: VersioneVisibile): string {
  const correzioni = v.correzioni.length
  return [
    v.novita.length > 0 ? `${v.novita.length} novità` : null,
    correzioni > 0 ? `${correzioni} ${correzioni === 1 ? 'correzione' : 'correzioni'}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Version, date, title and summary: spans and one heading, valid inside <summary> too. */
function Testata({ v }: { v: VersioneVisibile }) {
  return (
    <>
      <span className="num block text-sm text-muted-foreground">
        <span className="font-medium text-foreground">v{v.versione}</span> · {formatData(v.data)}
      </span>
      <h2 id={idTitolo(v)} className="text-base font-semibold">
        {/* a heading about what this role does not read: a neutral one, never the admin's */}
        {v.intestazione?.titolo ?? (v.novita.length > 0 ? 'Novità per te' : 'Correzioni per te')}
      </h2>
      {v.intestazione ? <span className="block text-sm text-muted-foreground">{v.intestazione.riassunto}</span> : null}
    </>
  )
}

function Corpo({ v }: { v: VersioneVisibile }) {
  return (
    <>
      <Elenco titolo="Novità" voci={v.novita} />
      <Elenco titolo="Correzioni" voci={v.correzioni} />
    </>
  )
}

function SchedaVersione({ versione: v, aperta }: { versione: VersioneVisibile; aperta: boolean }) {
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

function Elenco({ titolo, voci }: { titolo: string; voci: VoceVisibile[] }) {
  if (voci.length === 0) return null
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{titolo}</h3>
      <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed break-words marker:text-muted-foreground">
        {voci.map((voce) => (
          <li key={voce.testo} data-testid="changelog-voce">
            {voce.testo}
            {voce.per ? <PerChi per={voce.per} /> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Admin only: who else reads the item, as small tags after its text. */
function PerChi({ per }: { per: readonly Pubblico[] }) {
  return (
    <span className="ml-1.5 inline-flex flex-wrap gap-1 align-[1px]">
      <span className="sr-only">Per:</span>
      {per.map((p) => (
        <span key={p} className="rounded-md border border-border px-1.5 text-xs whitespace-nowrap text-muted-foreground">
          {ETICHETTA_PUBBLICO[p]}
        </span>
      ))}
    </span>
  )
}
