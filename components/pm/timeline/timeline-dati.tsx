import { TimelineProgetti, type ListaTimeline, type RepartoTimeline, type TaskTimeline } from '@/components/pm/timeline/timeline-progetti'
import type { StatoProgetto } from '@/lib/progetti'
import { createClient } from '@/lib/supabase/server'

/** One project as /progetti already read it from v_pm_progetti (RLS: only those the reader may see). */
export type ProgettoDellElenco = {
  id: string | null
  nome: string | null
  stato: StatoProgetto | null
  data_inizio: string | null
  data_fine: string | null
  client_id: string | null
  coach_id: string | null
  task_totali: number | null
  task_completati: number | null
  avanzamento: number | null
  /** v_pm_progetti.scaduto: active or paused, past its end (SQL decides). */
  scaduto: boolean | null
}

/** Rows per request; PostgREST caps each response at max_rows (1000), so the pages follow one another. */
const PAGINA = 1000

/**
 * Every row of a read, page after page: lists and dated tasks of all the
 * projects in view can be more than one response (years of projects from a
 * template, "Tutti"), and a silent cut would take a project's rows away.
 * The next page starts after the rows actually received, whatever the cap.
 */
async function tutteLeRighe<T>(
  pagina: (da: number, a: number) => PromiseLike<{ data: T[] | null; error: unknown; count: number | null }>,
): Promise<T[]> {
  const righe: T[] = []
  for (;;) {
    const { data, error, count } = await pagina(righe.length, righe.length + PAGINA - 1)
    if (error || !data) throw new Error('Impossibile caricare la timeline dei progetti')
    righe.push(...data)
    if (data.length === 0 || righe.length >= (count ?? 0)) return righe
  }
}

/**
 * Data of the timeline (05/10/2026), on top of what the list page already
 * read with the same filters: the coaches' names, and each project's lists
 * and dated tasks for the per-task view. Everything through the reader's
 * session (v_pm_* are security_invoker): a coach sees the lists and tasks of
 * the projects he is a member of, nobody sees money. Streamed under its own
 * skeleton.
 */
export async function TimelineDati({
  reparti,
  nomeCliente,
  oggi,
}: {
  reparti: { id: string; nome: string; progetti: ProgettoDellElenco[] }[]
  nomeCliente: ReadonlyMap<string, string>
  oggi: string
}) {
  const progetti = reparti.flatMap((r) => r.progetti)
  // only the projects that go on the chart open on their lists and tasks
  const ids = progetti.filter((p) => p.data_fine).map((p) => p.id!)
  const idCoach = [...new Set(progetti.map((p) => p.coach_id).filter((c): c is string => !!c))]

  const supabase = await createClient()
  const [liste, task, coach] = await Promise.all([
    ids.length > 0
      ? tutteLeRighe((da, a) =>
          supabase
            .from('v_pm_tasklist')
            .select('id, progetto_id, nome, ordine, data_inizio, data_fine, task_totali, task_completati', { count: 'exact' })
            .in('progetto_id', ids)
            .order('id')
            .range(da, a),
        )
      : [],
    ids.length > 0
      ? tutteLeRighe((da, a) =>
          supabase
            .from('v_pm_task')
            .select('id, progetto_id, titolo, tasklist_id, parent_id, ordine, data_inizio, scadenza, stato, in_ritardo', {
              count: 'exact',
            })
            .in('progetto_id', ids)
            // a task without dates has nothing to draw: it stays in its project
            .or('data_inizio.not.is.null,scadenza.not.is.null')
            // a stable order for the pages; organizzaGantt sorts each project by its own order
            .order('id')
            .range(da, a),
        )
      : [],
    idCoach.length > 0
      ? supabase.from('profiles').select('id, nome').in('id', idCoach)
      : Promise.resolve({ data: [], error: null }),
  ])
  if (coach.error) throw new Error('Impossibile caricare la timeline dei progetti')

  const listeDi = new Map<string, ListaTimeline[]>()
  for (const l of liste) {
    const voce: ListaTimeline = {
      id: l.id!,
      nome: l.nome ?? '',
      ordine: l.ordine ?? 0,
      data_inizio: l.data_inizio,
      data_fine: l.data_fine,
      task_totali: l.task_totali ?? 0,
      task_completati: l.task_completati ?? 0,
    }
    const sue = listeDi.get(l.progetto_id!)
    if (sue) sue.push(voce)
    else listeDi.set(l.progetto_id!, [voce])
  }
  const taskDi = new Map<string, TaskTimeline[]>()
  for (const t of task) {
    const voce: TaskTimeline = {
      id: t.id!,
      titolo: t.titolo ?? '',
      tasklist_id: t.tasklist_id,
      parent_id: t.parent_id,
      ordine: t.ordine ?? 0,
      data_inizio: t.data_inizio,
      scadenza: t.scadenza,
      stato: t.stato ?? 'da_fare',
      in_ritardo: t.in_ritardo ?? false,
    }
    const suoi = taskDi.get(t.progetto_id!)
    if (suoi) suoi.push(voce)
    else taskDi.set(t.progetto_id!, [voce])
  }
  const nomeCoach = new Map(coach.data.map((c) => [c.id, c.nome]))

  const dati: RepartoTimeline[] = reparti.map((r) => ({
    id: r.id,
    nome: r.nome,
    progetti: r.progetti.map((p) => ({
      id: p.id!,
      nome: p.nome ?? '',
      stato: p.stato ?? 'attivo',
      data_inizio: p.data_inizio,
      data_fine: p.data_fine,
      per_cliente: p.client_id !== null,
      cliente: p.client_id ? (nomeCliente.get(p.client_id) ?? null) : null,
      coach: p.coach_id ? (nomeCoach.get(p.coach_id) ?? null) : null,
      task_totali: p.task_totali ?? 0,
      task_completati: p.task_completati ?? 0,
      avanzamento: p.avanzamento,
      scaduto: p.scaduto ?? false,
      liste: listeDi.get(p.id!) ?? [],
      task: taskDi.get(p.id!) ?? [],
    })),
  }))

  return <TimelineProgetti reparti={dati} oggi={oggi} />
}
