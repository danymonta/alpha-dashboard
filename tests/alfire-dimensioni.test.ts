import { asSchema, type ToolSet } from 'ai'
import { describe, expect, it, vi } from 'vitest'

import { strumentiAlfire } from '@/lib/alfire/strumenti'
import type { AppRole, LivelloPm } from '@/lib/auth/roles'
import type { Profilo } from '@/lib/auth/session'

// Only the shape of the tools is measured: the actions never run here
vi.mock('server-only', () => ({}))
vi.mock('@/app/(app)/calls/actions', () => ({}))
vi.mock('@/app/(app)/calls/new/actions', () => ({}))
vi.mock('@/app/(app)/progetti/[id]/actions', () => ({}))
vi.mock('@/app/(app)/progetti/[id]/note/actions', () => ({}))
vi.mock('@/app/(app)/tempo/actions', () => ({}))
vi.mock('@/app/(app)/clients/actions', () => ({}))
vi.mock('@/app/(app)/expenses/actions', () => ({}))
vi.mock('@/app/(app)/progetti/actions', () => ({}))
vi.mock('@/app/(app)/sales/[id]/actions', () => ({}))
vi.mock('@/app/(app)/sales/new/actions', () => ({}))
vi.mock('@/app/(app)/today/actions', () => ({}))
vi.mock('@/app/(app)/leads/actions', () => ({}))
vi.mock('@/app/(app)/setting/actions', () => ({}))
vi.mock('@/app/(app)/commissions/actions', () => ({}))
vi.mock('@/app/(app)/settings/commissions/actions', () => ({}))
vi.mock('@/app/(app)/settings/products/actions', () => ({}))
vi.mock('@/app/actions/obiettivi', () => ({}))
vi.mock('@/app/actions/eliminazione', () => ({}))

/**
 * What every request carries before a single word of the chat: name,
 * description and JSON schema of each tool the role gets (the same measure
 * as the design, 29/09/2026: 15.366 characters for the admin before the new
 * write tools).
 */
async function dimensione(ruolo: AppRole, livello: LivelloPm) {
  const profilo = { id: 'x', nome: 'X', ruolo, attivo: true } as Profilo
  const strumenti: ToolSet = strumentiAlfire({} as never, profilo, livello)
  let caratteri = 0
  for (const [nome, t] of Object.entries(strumenti)) {
    caratteri += JSON.stringify({ nome, descrizione: t.description, input: await asSchema(t.inputSchema).jsonSchema }).length
  }
  return { strumenti: Object.keys(strumenti).length, caratteri }
}

describe('quanto pesano gli strumenti di Alfire', () => {
  it('l’admin fa tutto restando sotto i 40.000 caratteri di strumenti', async () => {
    const admin = await dimensione('admin', 'admin')
    console.info('[alfire] strumenti admin', admin)
    // 16 reads, the answers at a tap, 18 writes
    expect(admin.strumenti).toBe(35)
    expect(admin.caratteri).toBeLessThan(40_000)
  })

  it('ogni collaboratore riceve molto meno', async () => {
    for (const [ruolo, livello] of [
      ['setter', 'employee'],
      ['closer', 'employee'],
      ['coach', 'employee'],
      ['coach', 'manager'],
    ] as const) {
      const d = await dimensione(ruolo, livello)
      console.info(`[alfire] strumenti ${ruolo}/${livello}`, d)
      expect(d.caratteri, ruolo).toBeLessThan(20_000)
    }
  })
})
