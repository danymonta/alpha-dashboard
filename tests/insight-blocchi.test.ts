import { describe, expect, it } from 'vitest'

import {
  CANDIDATI_PER_BLOCCO,
  caratteriTrascrizione,
  CHAT_PER_BLOCCO,
  dimezza,
  pianificaBlocchi,
  TOKEN_PER_BLOCCO,
  tokenStimati,
} from '@/lib/insight/blocchi'
import type { MessaggioChat } from '@/lib/insight/contratti'

// How the chats of a run are packed for Claude (1.35.0). Invented chats only.

function chat(id: string, caratteri: number, minore_14 = false) {
  const messaggi: MessaggioChat[] = [{ da: 'lead', il: '2026-10-14T08:00:00.000Z', testo: 'x'.repeat(caratteri), codici: [], storia: false }]
  return { conversazione_id: id, messaggi, minore_14 }
}

describe('pianificaBlocchi', () => {
  it('at most 10 chats per block, 8 for the reactivation', () => {
    const chats = Array.from({ length: 23 }, (_, i) => chat(`conv-${String(i).padStart(2, '0')}`, 100))
    const schede = pianificaBlocchi({ canale: 'instagram', tipo: 'schede', chats })
    expect(schede.map((b) => b.chiavi.length)).toEqual([CHAT_PER_BLOCCO, CHAT_PER_BLOCCO, 3])
    expect(schede.map((b) => b.indice)).toEqual([0, 1, 2])
    expect(schede.every((b) => b.canale === 'instagram' && b.tipo === 'schede')).toBe(true)
    const riattivazione = pianificaBlocchi({ canale: 'messenger', tipo: 'riattivazione', chats })
    expect(riattivazione.map((b) => b.chiavi.length)).toEqual([CANDIDATI_PER_BLOCCO, CANDIDATI_PER_BLOCCO, 7])
  })

  it('about 5,000 transcript tokens per block; a chat over the budget goes alone', () => {
    const grande = chat('grande', 30_000)
    const medie = ['m1', 'm2', 'm3', 'm4'].map((id) => chat(id, 6_000))
    const blocchi = pianificaBlocchi({ canale: 'instagram', tipo: 'schede', chats: [...medie, grande] })
    expect(blocchi[0].chiavi).toEqual(['grande'])
    for (const b of blocchi.slice(1)) {
      const token = b.chiavi.reduce((n, id) => n + tokenStimati(caratteriTrascrizione(medie.find((m) => m.conversazione_id === id)!.messaggi)), 0)
      expect(token).toBeLessThanOrEqual(TOKEN_PER_BLOCCO)
    }
    expect(blocchi.flatMap((b) => b.chiavi).sort()).toEqual(['grande', 'm1', 'm2', 'm3', 'm4'])
  })

  it('never an under-14 chat, never a chat twice', () => {
    const blocchi = pianificaBlocchi({ canale: 'instagram', tipo: 'schede', chats: [chat('a', 10), chat('b', 10, true), chat('a', 10)] })
    expect(blocchi.flatMap((b) => b.chiavi)).toEqual(['a'])
  })

  it('stable: the same chats in another order give the same blocks', () => {
    const chats = ['c', 'a', 'b', 'd'].map((id, i) => chat(id, 100 * (i % 2)))
    expect(pianificaBlocchi({ canale: 'instagram', tipo: 'schede', chats })).toEqual(
      pianificaBlocchi({ canale: 'instagram', tipo: 'schede', chats: [...chats].reverse() }),
    )
  })

  it('no chats, no blocks', () => {
    expect(pianificaBlocchi({ canale: 'instagram', tipo: 'schede', chats: [] })).toEqual([])
  })
})

describe('dimezza', () => {
  it('two halves, the first larger when odd', () => {
    expect(dimezza([1, 2, 3, 4, 5])).toEqual([
      [1, 2, 3],
      [4, 5],
    ])
    expect(dimezza([1])).toEqual([[1], []])
  })
})
