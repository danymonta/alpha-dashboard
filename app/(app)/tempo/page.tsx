import { Timer } from 'lucide-react'

import { IntestazionePagina } from '@/components/pagina/intestazione'
import { AggiornaConTempo } from '@/components/pm/tempo/aggiorna-con-tempo'
import { CardTimer } from '@/components/pm/tempo/card-timer'
import { ElencoTempo, type VoceTempo } from '@/components/pm/tempo/elenco-tempo'
import {
  EliminaTempo,
  FoglioNuovoTempo,
  ModificaTempo,
  NuovoTempo,
  type OpzioneTask,
  type VoceModificabile,
} from '@/components/pm/tempo/form-tempo'
import { NavigazionePeriodo } from '@/components/pm/tempo/navigazione-periodo'
import { requireProfilo } from '@/lib/auth/session'
import { oggiRoma } from '@/lib/date'
import { formato } from '@/lib/format'
import { getLingua } from '@/lib/i18n/server'
import { MIO_TEMPO } from '@/lib/i18n/testi/tempo'
import { createClient } from '@/lib/supabase/server'
import { formatDurata, periodoTempo } from '@/lib/tempo'

export const dynamic = 'force-dynamic'

type Parametri = { settimana?: string; da?: string; a?: string }

/**
 * "Il mio tempo": the timer, time logged afterwards and the week, day by day.
 * Only the viewer's own time (the admin reads everyone's elsewhere, not here).
 */
export default async function IlMioTempoPage({ searchParams }: { searchParams: Promise<Parametri> }) {
  const profilo = await requireProfilo()
  const oggi = oggiRoma()
  const lingua = await getLingua()
  const testi = MIO_TEMPO[lingua]
  const { formatData } = formato(lingua)
  const periodo = periodoTempo(await searchParams, oggi, lingua)
  const supabase = await createClient()

  const [progetti, task, voci, riepilogo, perTask] = await Promise.all([
    supabase.from('pm_progetti').select('id, nome').neq('stato', 'archiviato').order('nome'),
    supabase.from('pm_task').select('id, titolo, progetto_id, stato').order('ordine').order('titolo'),
    supabase
      .from('pm_tempo')
      .select('id, data, inizio, fine, minuti, nota, progetto_id, task_id, progetto:pm_progetti(nome), task:pm_task(titolo)')
      .eq('profile_id', profilo.id)
      .not('minuti', 'is', null)
      .gte('data', periodo.da)
      .lte('data', periodo.a)
      .order('data', { ascending: false })
      .order('inizio', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    supabase.rpc('pm_riepilogo_tempo', { p_da: periodo.da, p_a: periodo.a }),
    // my own time per project › task (03/10/2026), from SQL like every other total
    supabase.rpc('pm_mio_tempo_per_task', { p_da: periodo.da, p_a: periodo.a }),
  ])
  if (progetti.error || task.error || voci.error || riepilogo.error || perTask.error) {
    throw new Error(testi.errore)
  }

  const opzioniProgetti = progetti.data
  const opzioniTask: OpzioneTask[] = task.data.map((t) => ({
    id: t.id,
    titolo: t.titolo,
    progetto_id: t.progetto_id,
    completato: t.stato === 'completato',
  }))

  // totals from SQL: the overall row, one row per day, one per project
  const totale = riepilogo.data.find((r) => r.livello === 'totale')?.minuti ?? 0
  const totaliGiorno = new Map(riepilogo.data.filter((r) => r.livello === 'giorno').map((r) => [r.data!, r.minuti]))
  const perProgetto = riepilogo.data.filter((r) => r.livello === 'progetto')
  // under each project, its tasks with the most time first (as SQL ordered them); a project
  // whose only row is the time without a task needs none
  const taskDelProgetto = new Map<string, { task_id: string | null; task: string | null; minuti: number }[]>()
  for (const r of perTask.data.filter((x) => x.livello === 'task')) {
    taskDelProgetto.set(r.progetto_id, [...(taskDelProgetto.get(r.progetto_id) ?? []), r])
  }

  const elenco: (VoceTempo & VoceModificabile)[] = voci.data.map((v) => ({
    id: v.id,
    data: v.data,
    inizio: v.inizio,
    fine: v.fine,
    minuti: v.minuti!,
    nota: v.nota,
    titolo: v.progetto?.nome ?? testi.progettoNonAccessibile,
    dettaglio: v.task?.titolo ?? null,
    progetto_id: v.progetto_id,
    nomeProgetto: v.progetto?.nome ?? testi.progettoAttuale,
    task_id: v.task_id,
    daTimer: v.inizio !== null,
  }))
  const conProgetti = opzioniProgetti.length > 0
  // not in any project and nothing logged: the timer card's empty state says it all
  const mostraPeriodo = conProgetti || elenco.length > 0

  return (
    <div className="space-y-6">
      <IntestazionePagina titolo={testi.titolo} descrizione={testi.descrizione} />
      <AggiornaConTempo />

      {/* below lg: timer, then the period with its total and entries; logging afterwards is a sheet */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="space-y-3 lg:space-y-6">
          <section aria-labelledby="titolo-timer" className="space-y-2">
            <h2 id="titolo-timer" className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {testi.timer}
            </h2>
            <CardTimer progetti={opzioniProgetti} task={opzioniTask} />
          </section>

          {conProgetti ? (
            <>
              <div className="lg:hidden">
                <FoglioNuovoTempo progetti={opzioniProgetti} task={opzioniTask} oggi={oggi} lingua={lingua} />
              </div>
              <section id="registra" aria-labelledby="titolo-registra" className="hidden scroll-mt-24 space-y-2 lg:block">
                <h2 id="titolo-registra" className="px-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {testi.registraPassato}
                </h2>
                <NuovoTempo progetti={opzioniProgetti} task={opzioniTask} oggi={oggi} secondario lingua={lingua} />
              </section>
            </>
          ) : null}
        </div>

        {mostraPeriodo ? (
          <section aria-labelledby="titolo-periodo" className="space-y-4">
            <h2 id="titolo-periodo" className="sr-only">
              {testi.tempoRegistrato}
            </h2>
            <NavigazionePeriodo percorso="/tempo" periodo={periodo} oggi={oggi} lingua={lingua} />

            <div className="rounded-xl bg-card p-4" data-testid="totale-periodo">
              <p className="text-xs text-muted-foreground">{testi.totale(periodo.titolo.toLowerCase())}</p>
              <p className="num text-3xl font-semibold">{formatDurata(totale)}</p>
              {perProgetto.length > 0 ? (
                <dl className="mt-4 space-y-2 border-t border-border pt-4">
                  {perProgetto.map((r) => {
                    const sottoTask = (r.progetto_id && taskDelProgetto.get(r.progetto_id)) || []
                    const conTask = sottoTask.some((t) => t.task_id !== null)
                    return (
                      // one row: the project and its total, then (a second dd) its tasks under it
                      <div
                        key={r.progetto_id ?? 'senza'}
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1 text-sm"
                        data-testid="totale-progetto"
                      >
                        <dt className="min-w-0 truncate text-muted-foreground">{r.progetto ?? testi.progettoNonAccessibile}</dt>
                        <dd className="num font-medium">{formatDurata(r.minuti)}</dd>
                        {conTask ? (
                          <dd className="col-span-2">
                            <dl className="space-y-1 border-l border-border pl-3" aria-label={testi.perTask(r.progetto ?? testi.progettoGenerico)}>
                              {sottoTask.map((t) => (
                                <div
                                  key={t.task_id ?? 'senza-task'}
                                  className="flex items-baseline justify-between gap-3 text-xs"
                                  data-testid="totale-task"
                                >
                                  <dt className="min-w-0 truncate text-muted-foreground">
                                    {t.task_id ? (t.task ?? testi.taskNonAccessibile) : testi.senzaTask}
                                  </dt>
                                  <dd className="num shrink-0 text-muted-foreground">{formatDurata(t.minuti)}</dd>
                                </div>
                              ))}
                            </dl>
                          </dd>
                        ) : null}
                      </div>
                    )
                  })}
                </dl>
              ) : null}
            </div>

            {elenco.length === 0 ? (
              <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-10 text-center">
                <Timer className="size-6 text-muted-foreground" aria-hidden="true" />
                <p className="text-sm font-medium">{testi.vuoto}</p>
                <p className="max-w-sm text-sm text-muted-foreground">{testi.vuotoDescrizione}</p>
                {conProgetti ? (
                  // below lg the "Registra tempo passato" button is right above
                  <a
                    href="#registra"
                    className="hidden min-h-11 items-center text-sm font-medium underline-offset-4 hover:underline lg:inline-flex"
                  >
                    {testi.registraPassato}
                  </a>
                ) : null}
              </div>
            ) : (
              <ElencoTempo
                voci={elenco}
                totaliGiorno={totaliGiorno}
                oggi={oggi}
                lingua={lingua}
                azioni={(voce) => {
                  const completa = elenco.find((e) => e.id === voce.id)!
                  const descrizione = testi.descrizioneVoce(formatData(voce.data), voce.titolo)
                  return (
                    <>
                      <ModificaTempo
                        voce={completa}
                        progetti={opzioniProgetti}
                        task={opzioniTask}
                        oggi={oggi}
                        descrizione={descrizione}
                        lingua={lingua}
                      />
                      <EliminaTempo id={voce.id} descrizione={descrizione} lingua={lingua} />
                    </>
                  )
                }}
              />
            )}
          </section>
        ) : null}
      </div>
    </div>
  )
}
