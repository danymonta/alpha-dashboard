import { describe, expect, it } from 'vitest'

import { cercaChat, corrisponde, normalizzaRicerca, paroleRicerca } from '@/lib/insight/cerca'

const mario = { conversation_id: 'c1', username: 'mario_rossi', name: 'Mario Rossi' }
const luca = { conversation_id: 'c2', username: 'luca.bianchi', name: 'Luca Bianchì' }
const senzaUser = { conversation_id: 'c3', name: 'Giovanni' }

describe('normalizzaRicerca', () => {
  it('drops case, accents, @ and the separators of a username', () => {
    expect(normalizzaRicerca('  @Màrio_Rossi.  ')).toBe('mario rossi')
    expect(normalizzaRicerca('')).toBe('')
  })
})

describe('corrisponde', () => {
  it('finds by name, username, part of a word and glued words', () => {
    for (const q of ['mario', 'ROSSI', '@mario_rossi', 'mario rossi', 'mariorossi', 'ros']) {
      expect(corrisponde(mario, paroleRicerca(q))).toBe(true)
    }
  })
  it('needs every word, ignores accents both ways', () => {
    expect(corrisponde(mario, paroleRicerca('mario bianchi'))).toBe(false)
    expect(corrisponde(luca, paroleRicerca('bianchi'))).toBe(true)
    expect(corrisponde(luca, paroleRicerca('luca.bianchi'))).toBe(true)
  })
  it('an empty query matches nothing', () => {
    expect(corrisponde(mario, paroleRicerca('   '))).toBe(false)
  })
})

describe('cercaChat', () => {
  it('one card per chat, the main list first, and the non leads apart', () => {
    const riattivare = [{ ...mario, days_silent: 3 }, senzaUser]
    const r = cercaChat('o', [[mario, luca], riattivare], [{ username: 'brand_ok', reason: 'brand' }, { name: 'Zia', reason: 'parente' }])
    expect(r.leads.map((l) => l.conversation_id)).toEqual(['c1', 'c3'])
    expect(r.leads[0]).toBe(mario)
    expect(r.nonLeads).toEqual([{ username: 'brand_ok', reason: 'brand' }])
  })
  it('no query, no results', () => {
    expect(cercaChat(' ', [[mario]], [])).toEqual({ leads: [], nonLeads: [] })
  })
})
