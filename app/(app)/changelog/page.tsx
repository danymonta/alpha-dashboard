import { ChevronDown, Megaphone } from 'lucide-react'

import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { percorsoIniziale, TUTTI_I_RUOLI } from '@/lib/auth/roles'
import { requireRuolo } from '@/lib/auth/session'
import { NOME_APP } from '@/lib/brand/nome'
import { VERSIONE_CORRENTE, type Pubblico } from '@/lib/changelog/versioni'
import { versioniPer, type VersioneVisibile, type VoceVisibile } from '@/lib/changelog/visibili'
import { formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { getLingua } from '@/lib/i18n/server'
import { NOVITA } from '@/lib/i18n/testi/novita'

export const dynamic = 'force-dynamic'

/**
 * The changelog, for every role (CLAUDE.md section 23): the version in use on
 * top for everyone, then only the items of the person's work, filtered here on
 * the server. The admin reads everything, with who reads each item.
 */
export default async function NovitaPage() {
  const { ruolo } = await requireRuolo(TUTTI_I_RUOLI)
  const lingua = await getLingua()
  const t = NOVITA[lingua]
  const { formatData } = formato(lingua)
  const admin = ruolo === 'admin'
  const corrente = VERSIONE_CORRENTE
  const versioni = versioniPer(ruolo)
  // the heading of the version in use, when this role reads it
  const inUso = versioni[0]?.versione === corrente?.versione ? versioni[0]?.intestazione : null

  return (
    <div className="max-w-3xl space-y-5">
      <IntestazionePagina
        titolo={t.titolo}
        descrizione={admin ? t.descrizioneAdmin(NOME_APP) : t.descrizioneTeam(NOME_APP)}
      />
      {/* the changelog is Dany's text, in Italian: an English reader is told so */}
      {lingua === 'en' ? <p className="text-sm text-muted-foreground">{t.inItaliano}</p> : null}

      {corrente ? (
        <section aria-labelledby="versione-in-uso" className="rounded-xl bg-card p-4" data-testid="versione-corrente">
          <h2 id="versione-in-uso" className="text-sm text-muted-foreground">
            {t.inUso}
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
          titolo={t.vuotoTitolo}
          descrizione={t.vuotoDescrizione}
          azione={<LinkBottone href={percorsoIniziale(ruolo)}>{t.tornaAlLavoro}</LinkBottone>}
        />
      ) : (
        <ol className="space-y-3" aria-label={t.versioni} lang={lingua === 'en' ? 'it' : undefined}>
          {versioni.map((v) => (
            <li key={v.versione}>
              {/* the latest day reads in full; older versions open with a tap, so the page stays short on a phone */}
              <SchedaVersione versione={v} aperta={v.data === corrente?.data} lingua={lingua} />
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
function conteggio(v: VersioneVisibile, lingua: Lingua): string {
  const t = NOVITA[lingua]
  const correzioni = v.correzioni.length
  return [
    v.novita.length > 0 ? t.nNovita(v.novita.length) : null,
    correzioni > 0 ? t.nCorrezioni(correzioni) : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Version, date, title and summary: spans and one heading, valid inside <summary> too. */
function Testata({ v, lingua }: { v: VersioneVisibile; lingua: Lingua }) {
  const t = NOVITA[lingua]
  const { formatData } = formato(lingua)
  return (
    <>
      <span className="num block text-sm text-muted-foreground">
        <span className="font-medium text-foreground">v{v.versione}</span> · {formatData(v.data)}
      </span>
      <h2 id={idTitolo(v)} className="text-base font-semibold">
        {/* a heading about what this role does not read: a neutral one, never the admin's */}
        {v.intestazione?.titolo ?? (v.novita.length > 0 ? t.novitaPerTe : t.correzioniPerTe)}
      </h2>
      {v.intestazione ? <span className="block text-sm text-muted-foreground">{v.intestazione.riassunto}</span> : null}
    </>
  )
}

function Corpo({ v, lingua }: { v: VersioneVisibile; lingua: Lingua }) {
  const t = NOVITA[lingua]
  return (
    <>
      <Elenco titolo={t.novita} voci={v.novita} lingua={lingua} />
      <Elenco titolo={t.correzioni} voci={v.correzioni} lingua={lingua} />
    </>
  )
}

function SchedaVersione({ versione: v, aperta, lingua }: { versione: VersioneVisibile; aperta: boolean; lingua: Lingua }) {
  if (aperta) {
    return (
      <article aria-labelledby={idTitolo(v)} className="space-y-3 rounded-xl bg-card p-4" data-testid="versione">
        <header className="space-y-1">
          <Testata v={v} lingua={lingua} />
        </header>
        <Corpo v={v} lingua={lingua} />
      </article>
    )
  }

  return (
    <details className="group rounded-xl bg-card" data-testid="versione">
      {/* heading and spans as direct children: the only content <summary> allows */}
      <summary className="relative block min-h-11 cursor-pointer list-none space-y-1 rounded-xl p-4 pr-11 hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <Testata v={v} lingua={lingua} />
        <span className="block text-xs text-muted-foreground group-open:hidden">{conteggio(v, lingua)}</span>
        <ChevronDown className="absolute top-4 right-4 size-4 text-muted-foreground group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="space-y-3 px-4 pb-4">
        <Corpo v={v} lingua={lingua} />
      </div>
    </details>
  )
}

function Elenco({ titolo, voci, lingua }: { titolo: string; voci: VoceVisibile[]; lingua: Lingua }) {
  if (voci.length === 0) return null
  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{titolo}</h3>
      <ul className="list-disc space-y-1.5 pl-5 text-sm leading-relaxed break-words marker:text-muted-foreground">
        {voci.map((voce) => (
          <li key={voce.testo} data-testid="changelog-voce">
            {voce.testo}
            {voce.per ? <PerChi per={voce.per} lingua={lingua} /> : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Admin only: who else reads the item, as small tags after its text. */
function PerChi({ per, lingua }: { per: readonly Pubblico[]; lingua: Lingua }) {
  const t = NOVITA[lingua]
  return (
    <span className="ml-1.5 inline-flex flex-wrap gap-1 align-[1px]">
      <span className="sr-only">{t.per}</span>
      {per.map((p) => (
        <span key={p} className="rounded-md border border-border px-1.5 text-xs whitespace-nowrap text-muted-foreground">
          {t.pubblico[p]}
        </span>
      ))}
    </span>
  )
}
