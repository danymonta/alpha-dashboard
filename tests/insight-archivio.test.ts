import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { creaArchivio } from '@/lib/insight/archivio'

// The parts of the real archive that read many rows (1.35.0), against a stub of
// PostgREST: it answers at most 1000 rows to a query, like the local and cloud
// projects do (max_rows), without an error.

type Riga = Record<string, unknown>

function dbFinto(righe: Riga[]) {
  const interrogazioni: { da: number; a: number }[] = []
  const costruisci = () => {
    const q: Record<string, unknown> = {}
    for (const metodo of ['select', 'gte', 'neq', 'in', 'order']) q[metodo] = () => q
    q.range = (da: number, a: number) => {
      interrogazioni.push({ da, a })
      return Promise.resolve({ data: righe.slice(da, Math.min(a + 1, da + 1000)), error: null })
    }
    return q
  }
  return { db: { from: () => costruisci() } as never, interrogazioni }
}

describe('schedePrecedenti', () => {
  const scheda = (i: number): Riga => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    esecuzione_id: `00000000-0000-4000-9000-${String(i % 12).padStart(12, '0')}`,
    giorno: '2026-10-10',
    canale: 'instagram',
    tipo: 'lead',
    chiave: `conv-${i % 100}`,
    impronta: 'a'.repeat(64),
    dati: { tipo: 'lead' },
    created_at: new Date(Date.UTC(2026, 9, 10, 8, 0, 0) + i * 1000).toISOString(),
  })

  it('reads every card of a block of 100 chats, even past the 1000 rows PostgREST cuts at', async () => {
    // 12 runs of 100 chats in 14 days: 1200 cards for one block
    const righe = Array.from({ length: 1200 }, (_, i) => scheda(i))
    const { db, interrogazioni } = dbFinto(righe)
    const schede = await creaArchivio(db).schedePrecedenti({
      esecuzione: '00000000-0000-4000-9000-ffffffffffff',
      dalGiorno: '2026-10-01',
      chiavi: Array.from({ length: 100 }, (_, i) => `conv-${i}`),
    })
    expect(schede).toHaveLength(1200)
    expect(interrogazioni.map((q) => q.da)).toEqual([0, 1000])
  })

  it('oldest first, whatever order the pages came in', async () => {
    const righe = Array.from({ length: 5 }, (_, i) => scheda(i)).reverse()
    const { db } = dbFinto(righe)
    const schede = await creaArchivio(db).schedePrecedenti({ esecuzione: 'x', dalGiorno: '2026-10-01', chiavi: ['conv-0', 'conv-1'] })
    expect(schede.map((s) => s.chiave)).toEqual(['conv-0', 'conv-1', 'conv-2', 'conv-3', 'conv-4'])
  })
})
