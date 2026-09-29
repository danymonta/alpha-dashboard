import { describe, expect, it } from 'vitest'

import { raggruppaTempoTeam, type RigaTempoTeam } from '@/components/pm/tempo-team/dati'

const ANNA = 'a0000000-0000-4000-8000-000000000001'
const ZENO = 'a0000000-0000-4000-8000-000000000002'
const UNO = 'b0000000-0000-4000-8000-000000000001'
const DUE = 'b0000000-0000-4000-8000-000000000002'
const MONTAGGIO = 'c0000000-0000-4000-8000-000000000001'

function riga(parziale: Partial<RigaTempoTeam> & Pick<RigaTempoTeam, 'livello' | 'minuti'>): RigaTempoTeam {
  return {
    profile_id: null,
    persona: null,
    progetto_id: null,
    progetto: null,
    task_id: null,
    task: null,
    voci: null,
    id: null,
    data: null,
    inizio: null,
    fine: null,
    nota: null,
    ...parziale,
  }
}

// the rows of pm_tempo_per_persona, in the order the database returns them
const RIGHE: RigaTempoTeam[] = [
  riga({ livello: 'totale', minuti: 240, voci: 5 }),
  riga({ livello: 'persona', profile_id: ANNA, persona: 'Anna', minuti: 135, voci: 3 }),
  riga({ livello: 'persona', profile_id: ZENO, persona: 'Zeno', minuti: 105, voci: 2 }),
  riga({ livello: 'progetto', profile_id: ANNA, progetto_id: UNO, progetto: 'Uno', minuti: 90, voci: 2 }),
  riga({ livello: 'progetto', profile_id: ANNA, progetto_id: DUE, progetto: 'Due', minuti: 45, voci: 1 }),
  riga({ livello: 'progetto', profile_id: ZENO, progetto_id: DUE, progetto: 'Due', minuti: 105, voci: 2 }),
  riga({ livello: 'task', profile_id: ANNA, progetto_id: UNO, task_id: MONTAGGIO, task: 'Montaggio', minuti: 60, voci: 1 }),
  riga({ livello: 'task', profile_id: ANNA, progetto_id: DUE, minuti: 45, voci: 1 }),
  riga({ livello: 'task', profile_id: ANNA, progetto_id: UNO, minuti: 30, voci: 1 }),
  riga({ livello: 'task', profile_id: ZENO, progetto_id: DUE, minuti: 105, voci: 2 }),
  riga({
    livello: 'voce',
    profile_id: ANNA,
    progetto_id: DUE,
    progetto: 'Due',
    id: 'd1',
    data: '2020-01-14',
    inizio: '2020-01-14T08:00:00Z',
    fine: '2020-01-14T08:45:00Z',
    minuti: 45,
    nota: 'Call',
  }),
  riga({ livello: 'voce', profile_id: ANNA, progetto_id: UNO, progetto: 'Uno', id: 'd2', data: '2020-01-12', minuti: 30 }),
  riga({ livello: 'voce', profile_id: ZENO, progetto_id: DUE, progetto: 'Due', id: 'd3', data: '2020-01-20', minuti: 15 }),
]

describe('raggruppaTempoTeam', () => {
  const team = raggruppaTempoTeam(RIGHE)

  it('keeps the totals of the database and the order of the people', () => {
    expect(team.minuti).toBe(240)
    expect(team.voci).toBe(5)
    expect(team.persone.map((p) => [p.nome, p.minuti, p.voci])).toEqual([
      ['Anna', 135, 3],
      ['Zeno', 105, 2],
    ])
  })

  it('puts each project under its person and each task under its project', () => {
    const anna = team.persone[0]
    expect(anna.progetti.map((p) => [p.nome, p.minuti])).toEqual([
      ['Uno', 90],
      ['Due', 45],
    ])
    expect(anna.progetti[0].task.map((t) => [t.titolo, t.minuti])).toEqual([
      ['Montaggio', 60],
      [null, 30],
    ])
    expect(anna.progetti[1].task.map((t) => [t.titolo, t.minuti])).toEqual([[null, 45]])
    expect(team.persone[1].progetti[0].task).toHaveLength(1)
  })

  it('gives each person their own entries, newest first as the database sent them', () => {
    expect(team.persone[0].ultime.map((v) => v.id)).toEqual(['d1', 'd2'])
    expect(team.persone[0].ultime[0]).toMatchObject({ progetto: 'Due', task: null, nota: 'Call', minuti: 45 })
    expect(team.persone[1].ultime.map((v) => v.id)).toEqual(['d3'])
  })

  it('with no rows: nobody, and zero', () => {
    expect(raggruppaTempoTeam([riga({ livello: 'totale', minuti: 0, voci: 0 })])).toEqual({ minuti: 0, voci: 0, persone: [] })
    expect(raggruppaTempoTeam([])).toEqual({ minuti: 0, voci: 0, persone: [] })
  })
})
