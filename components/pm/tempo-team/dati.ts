/**
 * The rows of pm_tempo_per_persona, shaped for the "Team" page. Every number
 * (minutes, entries) comes from SQL as it is: here rows are only grouped under
 * their person and project, keeping the order the database gave them (people
 * alphabetical, projects and tasks by time, entries newest first).
 */

export type RigaTempoTeam = {
  livello: string
  profile_id: string | null
  persona: string | null
  progetto_id: string | null
  progetto: string | null
  task_id: string | null
  task: string | null
  minuti: number
  voci: number | null
  id: string | null
  data: string | null
  inizio: string | null
  fine: string | null
  nota: string | null
}

export type TaskTempo = { id: string | null; titolo: string | null; minuti: number; voci: number }

export type ProgettoTempo = { id: string; nome: string; minuti: number; voci: number; task: TaskTempo[] }

export type VoceTeam = {
  id: string
  data: string
  inizio: string | null
  fine: string | null
  minuti: number
  nota: string | null
  progetto: string
  task: string | null
}

export type PersonaTempo = {
  id: string
  nome: string
  minuti: number
  /** Every entry of the period; `ultime` may hold fewer (the most recent ones). */
  voci: number
  progetti: ProgettoTempo[]
  ultime: VoceTeam[]
}

export type TempoTeam = { minuti: number; voci: number; persone: PersonaTempo[] }

const PROGETTO_SCONOSCIUTO = 'Progetto non più disponibile'

export function raggruppaTempoTeam(righe: readonly RigaTempoTeam[]): TempoTeam {
  const totale = righe.find((r) => r.livello === 'totale')
  const persone = new Map<string, PersonaTempo>()

  for (const r of righe) {
    if (r.livello !== 'persona' || !r.profile_id) continue
    persone.set(r.profile_id, {
      id: r.profile_id,
      nome: r.persona ?? 'Collaboratore',
      minuti: r.minuti,
      voci: r.voci ?? 0,
      progetti: [],
      ultime: [],
    })
  }

  const progetti = new Map<string, ProgettoTempo>()
  const chiave = (persona: string, progetto: string) => `${persona}:${progetto}`

  for (const r of righe) {
    if (r.livello !== 'progetto' || !r.profile_id || !r.progetto_id) continue
    const persona = persone.get(r.profile_id)
    if (!persona) continue
    const progetto: ProgettoTempo = {
      id: r.progetto_id,
      nome: r.progetto ?? PROGETTO_SCONOSCIUTO,
      minuti: r.minuti,
      voci: r.voci ?? 0,
      task: [],
    }
    persona.progetti.push(progetto)
    progetti.set(chiave(r.profile_id, r.progetto_id), progetto)
  }

  for (const r of righe) {
    if (!r.profile_id || !r.progetto_id) continue
    if (r.livello === 'task') {
      progetti.get(chiave(r.profile_id, r.progetto_id))?.task.push({
        id: r.task_id,
        titolo: r.task_id ? r.task : null,
        minuti: r.minuti,
        voci: r.voci ?? 0,
      })
    } else if (r.livello === 'voce' && r.id && r.data) {
      persone.get(r.profile_id)?.ultime.push({
        id: r.id,
        data: r.data,
        inizio: r.inizio,
        fine: r.fine,
        minuti: r.minuti,
        nota: r.nota,
        progetto: r.progetto ?? PROGETTO_SCONOSCIUTO,
        task: r.task_id ? r.task : null,
      })
    }
  }

  return { minuti: totale?.minuti ?? 0, voci: totale?.voci ?? 0, persone: [...persone.values()] }
}
