import { describe, expect, it } from 'vitest'

import {
  GRUPPI_PRIORITA,
  GRUPPI_RIATTIVAZIONE,
  ordinaPerPriorita,
  raggruppaPerPriorita,
  raggruppaRiattivazione,
} from '@/lib/insight/priorita'
import type { PrioritaLead } from '@/lib/insight/recap'

// The groups of the Insight's chats, as the artifact. Every chat is invented.

type Lead = { id: string; priority: PrioritaLead; ore: number | null }
const lead = (id: string, priority: PrioritaLead, ore: number | null = null): Lead => ({ id, priority, ore })

describe('ordinaPerPriorita', () => {
  it('alta, media, bassa, the recap’s order within each', () => {
    const leads = [lead('a', 'bassa'), lead('b', 'alta'), lead('c', 'media'), lead('d', 'alta'), lead('e', 'bassa')]
    expect(ordinaPerPriorita(leads).map((l) => l.id)).toEqual(['b', 'd', 'c', 'a', 'e'])
  })
})

describe('raggruppaPerPriorita', () => {
  it('the artifact’s groups and words, the empty ones left out', () => {
    expect(GRUPPI_PRIORITA.map((g) => [g.titolo, g.descrizione])).toEqual([
      ['Priorità alta', 'Da gestire oggi'],
      ['Priorità media', 'Da portare avanti'],
      ['Priorità bassa', 'Nurturing, fuori target o chiuse'],
    ])
    const gruppi = raggruppaPerPriorita([lead('a', 'alta'), lead('b', 'bassa')], (l) => l.ore)
    expect(gruppi.map((g) => g.gruppo.chiave)).toEqual(['alta', 'bassa'])
  })

  it('in each group the longest wait first, the leads not waiting after them in order', () => {
    const leads = [
      lead('nessuna-1', 'alta'),
      lead('due-ore', 'alta', 2),
      lead('nessuna-2', 'alta'),
      lead('venti-ore', 'alta', 20),
      lead('cinque-ore', 'alta', 5),
      lead('media', 'media', 30),
    ]
    const [alta, media] = raggruppaPerPriorita(leads, (l) => l.ore)
    expect(alta.voci.map((l) => l.id)).toEqual(['venti-ore', 'cinque-ore', 'due-ore', 'nessuna-1', 'nessuna-2'])
    expect(media.voci.map((l) => l.id)).toEqual(['media'])
  })

  it('a wait of 0 hours (less than one) still comes before no wait', () => {
    const [alta] = raggruppaPerPriorita([lead('nessuna', 'alta'), lead('zero', 'alta', 0)], (l) => l.ore)
    expect(alta.voci.map((l) => l.id)).toEqual(['zero', 'nessuna'])
  })
})

describe('raggruppaRiattivazione', () => {
  it('the artifact’s steps and words', () => {
    expect(GRUPPI_RIATTIVAZIONE.map((g) => [g.passo, g.titolo, g.descrizione])).toEqual([
      [1, 'Fermi da 2 giorni', 'Riprendi la conversazione'],
      [2, 'Fermi da 5 giorni', 'Porta valore'],
      [3, 'Fermi da 10 giorni', 'Messaggio di chiusura'],
    ])
  })

  it('by step (written, or from the days of silence), the longest silence first', () => {
    const voci = [
      { id: 'a', step: 1, days_silent: 2 },
      { id: 'b', step: undefined, days_silent: 12 },
      { id: 'c', step: 1, days_silent: 4 },
      { id: 'd', step: undefined, days_silent: 6 },
      { id: 'e', step: 3, days_silent: 10 },
      { id: 'f', step: '2', days_silent: 0 },
    ]
    const gruppi = raggruppaRiattivazione(voci)
    expect(gruppi.map((g) => [g.gruppo.passo, g.voci.map((v) => v.id)])).toEqual([
      [1, ['c', 'a']],
      [2, ['d', 'f']],
      [3, ['b', 'e']],
    ])
  })

  it('an empty step is left out', () => {
    expect(raggruppaRiattivazione([{ step: 2, days_silent: 5 }]).map((g) => g.gruppo.passo)).toEqual([2])
    expect(raggruppaRiattivazione([])).toEqual([])
  })
})
