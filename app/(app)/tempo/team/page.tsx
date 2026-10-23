import { Timer } from 'lucide-react'

import { LinkBottone } from '@/components/link-bottone'
import { IntestazionePagina } from '@/components/pagina/intestazione'
import { SelettorePeriodo } from '@/components/pagina/selettore-periodo'
import { FiltroSelect } from '@/components/pm/filtri'
import { CardPersona } from '@/components/pm/tempo-team/card-persona'
import { raggruppaTempoTeam } from '@/components/pm/tempo-team/dati'
import { StatoVuoto } from '@/components/stati/stato-vuoto'
import { requireRuolo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { formato } from '@/lib/format'
import { getLingua } from '@/lib/i18n/server'
import { TEMPO } from '@/lib/i18n/testi/tempo'
import { hrefPeriodo, leggiPeriodo } from '@/lib/periodo'
import { isUuid } from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'
import { formatDurata } from '@/lib/tempo'

export const dynamic = 'force-dynamic'

const PERCORSO = '/tempo/team'

function primo(valore: string | string[] | undefined): string | undefined {
  return Array.isArray(valore) ? valore[0] : valore
}

/**
 * "Team": who logged what, person by person (Dany, 29/09/2026). Admin only.
 * Only time already declared: running timers stay private, nobody is listed
 * for not logging, people are in alphabetical order and never compared
 * (CLAUDE.md sections 17 and 18).
 */
export default async function TempoTeamPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireRuolo(['admin'])
  const oggi = oggiRoma()
  const parametri = await searchParams
  const lingua = await getLingua()
  const t = TEMPO[lingua]
  const { formatNumero } = formato(lingua)
  const periodo = leggiPeriodo(parametri, oggi, lingua)
  const persona = isUuid(primo(parametri.persona)) ? primo(parametri.persona) : undefined
  const progetto = isUuid(primo(parametri.progetto)) ? primo(parametri.progetto) : undefined
  const supabase = await createClient()

  // everyone's rows on the chosen project: the person filter picks one of them,
  // and its options are the people who logged time in the period
  const [tempo, progetti, scelta] = await Promise.all([
    supabase.rpc('pm_tempo_per_persona', {
      p_da: periodo.da,
      p_a: periodo.a,
      ...(progetto ? { p_progetto: progetto } : {}),
    }),
    supabase.from('pm_progetti').select('id, nome, stato').order('nome'),
    persona
      ? supabase.from('profiles').select('id, nome').eq('id', persona).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (tempo.error || progetti.error || scelta.error) throw new Error(t.errore)

  const team = raggruppaTempoTeam(tempo.data, lingua)
  const personaScelta = persona ? team.persone.find((p) => p.id === persona) : undefined
  const persone = persona ? (personaScelta ? [personaScelta] : []) : team.persone
  const opzioniPersone = team.persone.map((p) => ({ valore: p.id, etichetta: p.nome }))
  if (persona && !personaScelta) {
    opzioniPersone.push({ valore: persona, etichetta: scelta.data?.nome ?? t.personaScelta })
    opzioniPersone.sort((x, y) => x.etichetta.localeCompare(y.etichetta, 'it'))
  }
  const opzioniProgetti = progetti.data.map((p) => ({
    valore: p.id,
    etichetta: p.stato === 'archiviato' ? t.archiviato(p.nome) : p.nome,
  }))
  if (progetto && !progetti.data.some((p) => p.id === progetto)) {
    opzioniProgetti.push({ valore: progetto, etichetta: t.nonDisponibile })
  }

  const filtri = { persona, progetto }
  const conFiltri = Boolean(persona || progetto)
  const nomeProgetto = progetto ? opzioniProgetti.find((p) => p.valore === progetto)?.etichetta : undefined

  return (
    <div className="max-w-4xl space-y-5">
      <IntestazionePagina
        titolo={t.titolo}
        descrizione={t.descrizione}
      />

      {/* 390px: the period, then one full-width row per filter, never a truncated name */}
      <div className="grid gap-2 sm:flex sm:flex-wrap sm:items-end sm:justify-between sm:gap-4">
        <SelettorePeriodo periodo={periodo} oggi={oggi} percorso={PERCORSO} parametri={filtri} confronto={false} />
        <div className="grid gap-2 sm:flex sm:gap-3">
          <FiltroSelect
            id="filtro-persona"
            etichetta={t.persona}
            nome="persona"
            valore={persona ?? ''}
            predefinito=""
            opzioni={[{ valore: '', etichetta: t.tuttePersone }, ...opzioniPersone]}
            parametri={{ ...periodo.parametri, ...filtri }}
          />
          <FiltroSelect
            id="filtro-progetto"
            etichetta={t.progetto}
            nome="progetto"
            valore={progetto ?? ''}
            predefinito=""
            opzioni={[{ valore: '', etichetta: t.tuttiProgetti }, ...opzioniProgetti]}
            parametri={{ ...periodo.parametri, ...filtri }}
          />
        </div>
      </div>

      {persone.length === 0 ? (
        <StatoVuoto
          Icona={Timer}
          titolo={t.vuoto}
          descrizione={conFiltri ? t.vuotoFiltri : t.vuotoDescrizione}
          azione={
            conFiltri ? (
              <LinkBottone href={hrefPeriodo(PERCORSO, periodo)} variant="outline">
                {t.togliFiltri}
              </LinkBottone>
            ) : null
          }
        />
      ) : (
        <>
          {/* one person chosen: the open card below already says it all */}
          {persona ? null : (
            <div className="rounded-xl bg-card p-4" data-testid="totale-team">
              <p className="text-xs text-muted-foreground">
                {t.registrato(nomeProgetto, periodo.etichetta)}
              </p>
              <p className="num text-3xl font-semibold">{formatDurata(team.minuti)}</p>
              <p className="num text-xs text-muted-foreground">
                {t.voci(formatNumero(team.voci), team.voci === 1)}
              </p>
            </div>
          )}

          <section aria-labelledby="titolo-persone" className="space-y-2">
            <h2 id="titolo-persone" className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {t.perPersona}
            </h2>
            <ul className="space-y-2">
              {persone.map((p) => (
                <li key={p.id}>
                  <CardPersona persona={p} aperta={persone.length === 1} lingua={lingua} />
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  )
}
