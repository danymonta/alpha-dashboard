import { ChevronDown } from 'lucide-react'
import { Fragment } from 'react'

import type { PersonaTempo, ProgettoTempo, VoceTeam } from '@/components/pm/tempo-team/dati'
import { formatOra } from '@/lib/date'
import { VUOTO, formato } from '@/lib/format'
import type { Lingua } from '@/lib/i18n/lingua'
import { TEMPO } from '@/lib/i18n/testi/tempo'
import { formatDurata } from '@/lib/tempo'
import { cn } from '@/lib/utils'

const SOMMARIO =
  'cursor-pointer list-none focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none [&::-webkit-details-marker]:hidden'
/** "09:00–10:30" when the entry has its range (a timer, or typed with one); null for minutes only. */
function orario(voce: VoceTeam): string | null {
  return voce.inizio && voce.fine ? `${formatOra(voce.inizio)}–${formatOra(voce.fine)}` : null
}

function dove(voce: VoceTeam): string {
  return voce.task ? `${voce.progetto} › ${voce.task}` : voce.progetto
}

/**
 * One person of the team: the total of the period, and inside it where the
 * time went (project, then task) and the entries themselves. Every number is
 * the database's (pm_tempo_per_persona).
 */
export function CardPersona({ persona, aperta, lingua = 'it' }: { persona: PersonaTempo; aperta: boolean; lingua?: Lingua }) {
  const t = TEMPO[lingua]
  const { formatNumero } = formato(lingua)
  const idTitolo = `persona-${persona.id}`
  return (
    <details open={aperta} className="group/persona rounded-xl bg-card" data-testid="persona-tempo">
      <summary className={cn(SOMMARIO, 'flex min-h-14 items-center gap-3 rounded-xl px-4 py-3')}>
        <div className="min-w-0 flex-1">
          <h3 id={idTitolo} className="truncate text-sm font-semibold">
            {persona.nome}
          </h3>
          <p className="text-xs text-muted-foreground">
            {t.voci(formatNumero(persona.voci), persona.voci === 1)} ·{' '}
            {t.progetti(formatNumero(persona.progetti.length), persona.progetti.length === 1)}
          </p>
        </div>
        <p className="num shrink-0 text-right text-base font-semibold" data-testid="totale-persona">
          <span className="sr-only">{t.totale}</span>
          {formatDurata(persona.minuti)}
        </p>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open/persona:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div className="space-y-4 border-t border-border px-4 pt-3 pb-4">
        <PerProgetto nome={persona.nome} progetti={persona.progetti} lingua={lingua} />
        <Voci persona={persona} lingua={lingua} />
      </div>
    </details>
  )
}

/** Desktop: a table, projects with their tasks indented. Phone: the same as a list. */
function PerProgetto({ nome, progetti, lingua }: { nome: string; progetti: ProgettoTempo[]; lingua: Lingua }) {
  const t = TEMPO[lingua]
  const { formatNumero } = formato(lingua)
  return (
    <section aria-label={t.perProgetto} data-testid="per-progetto">
      <table className="hidden w-full text-sm md:table">
        <caption className="sr-only">{t.perProgettoDi(nome)}</caption>
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="pb-1 text-left font-normal">
              {t.progettoAttivita}
            </th>
            <th scope="col" className="w-20 pb-1 text-right font-normal">
              {t.vociCol}
            </th>
            <th scope="col" className="w-32 pb-1 text-right font-normal">
              {t.tempo}
            </th>
          </tr>
        </thead>
        <tbody>
          {progetti.map((p) => (
            <Fragment key={p.id}>
              <tr className="border-t border-border" data-testid="riga-progetto">
                <th scope="row" className="pt-2 pb-1 text-left font-medium break-words">
                  {p.nome}
                </th>
                <td className="num pt-2 pb-1 text-right text-muted-foreground">{formatNumero(p.voci)}</td>
                <td className="num pt-2 pb-1 text-right font-medium">{formatDurata(p.minuti)}</td>
              </tr>
              {p.task.map((a) => (
                <tr key={a.id ?? 'senza'} data-testid="riga-task">
                  <td className="py-1 pl-4 break-words text-muted-foreground">{a.titolo ?? t.senzaAttivita}</td>
                  <td className="num py-1 text-right text-muted-foreground">{formatNumero(a.voci)}</td>
                  <td className="num py-1 text-right">{formatDurata(a.minuti)}</td>
                </tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>

      <ul className="space-y-3 md:hidden">
        {progetti.map((p) => (
          <li key={p.id} data-testid="riga-progetto">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 font-medium break-words">{p.nome}</span>
              <span className="num shrink-0 text-right font-medium">{formatDurata(p.minuti)}</span>
            </div>
            <ul className="mt-1 space-y-1 border-l border-border pl-3">
              {p.task.map((a) => (
                <li key={a.id ?? 'senza'} className="flex items-baseline justify-between gap-3 text-sm" data-testid="riga-task">
                  <span className="min-w-0 break-words text-muted-foreground">{a.titolo ?? t.senzaAttivita}</span>
                  <span className="num shrink-0 text-right">{formatDurata(a.minuti)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** The entries of the period, newest first: the drill-down behind the totals. */
function Voci({ persona, lingua }: { persona: PersonaTempo; lingua: Lingua }) {
  const t = TEMPO[lingua]
  const { formatData, formatNumero } = formato(lingua)
  const mostrate = persona.ultime.length
  const troncato = mostrate < persona.voci
  return (
    <details className="group/voci rounded-lg border border-border" data-testid="voci-persona">
      <summary className={cn(SOMMARIO, 'flex min-h-11 items-center justify-between gap-2 rounded-lg px-3 text-sm font-medium')}>
        <span>
          {t.vociPeriodo}{' '}
          <span className="num font-normal text-muted-foreground">
            ({troncato ? t.diN(formatNumero(mostrate), formatNumero(persona.voci)) : formatNumero(persona.voci)})
          </span>
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-open/voci:rotate-180"
          aria-hidden="true"
        />
      </summary>

      <div className="border-t border-border">
        {troncato ? (
          <p className="px-3 pt-3 text-xs text-muted-foreground">
            {t.piuRecenti(formatNumero(mostrate))}
          </p>
        ) : null}

        <table className="hidden w-full text-sm md:table">
          <caption className="sr-only">{t.vociDi(persona.nome)}</caption>
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th scope="col" className="w-28 px-3 pt-2 pb-1 text-left font-normal">
                {t.giorno}
              </th>
              <th scope="col" className="w-32 px-3 pt-2 pb-1 text-left font-normal">
                {t.orario}
              </th>
              <th scope="col" className="px-3 pt-2 pb-1 text-left font-normal">
                {t.dove}
              </th>
              <th scope="col" className="px-3 pt-2 pb-1 text-left font-normal">
                {t.nota}
              </th>
              <th scope="col" className="w-28 px-3 pt-2 pb-1 text-right font-normal">
                {t.durata}
              </th>
            </tr>
          </thead>
          <tbody>
            {persona.ultime.map((v) => (
              <tr key={v.id} className="border-t border-border align-top" data-testid="voce-team">
                <td className="num px-3 py-2">{formatData(v.data)}</td>
                <td className="num px-3 py-2">
                  {orario(v) ?? (
                    <>
                      <span aria-hidden="true" className="text-muted-foreground">
                        {VUOTO}
                      </span>
                      <span className="sr-only">{t.senzaOrario}</span>
                    </>
                  )}
                </td>
                <td className="px-3 py-2 break-words">{dove(v)}</td>
                <td lang="it" className="px-3 py-2 break-words whitespace-pre-line text-muted-foreground">
                  {v.nota ?? ''}
                </td>
                <td className="num px-3 py-2 text-right font-medium">{formatDurata(v.minuti)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <ul className="divide-y divide-border md:hidden">
          {persona.ultime.map((v) => (
            <li key={v.id} className="space-y-0.5 px-3 py-2" data-testid="voce-team">
              <div className="flex items-baseline justify-between gap-3">
                <p className="num text-sm">
                  {formatData(v.data)}
                  {orario(v) ? <span className="text-muted-foreground"> · {orario(v)}</span> : null}
                </p>
                <p className="num shrink-0 text-right text-sm font-medium">{formatDurata(v.minuti)}</p>
              </div>
              <p className="text-sm break-words">{dove(v)}</p>
              {v.nota ? (
                <p className="text-xs break-words whitespace-pre-line text-muted-foreground">{v.nota}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}
