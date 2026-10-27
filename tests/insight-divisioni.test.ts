import { describe, expect, it } from 'vitest'

import { contaDivisioni, divisioneDi, raggruppaDivisione, vicinanzaDi } from '@/lib/insight/divisioni'
import { FASI } from '@/lib/insight/schema'
import type { DaChi, PrioritaLead, TargetLead } from '@/lib/insight/recap'

// The divisions of the Insight's chats (Dany, 27/10/2026). Every chat is invented.

type Chat = {
  conversation_id: string
  stage: string
  last_from: DaChi
  suggested_message: string
  target: TargetLead
  priority: PrioritaLead
  days_silent?: number
  ore?: number | null
}

const chat = (id: string, campi: Partial<Chat> = {}): Chat => ({
  conversation_id: id,
  stage: 'obiettivi',
  last_from: 'lead',
  suggested_message: 'Ciao!',
  target: 'si',
  priority: 'media',
  ...campi,
})

describe('divisioneDi', () => {
  it('the lead wrote last: to answer', () => {
    expect(divisioneDi(chat('a'))).toBe('rispondere')
    expect(divisioneDi(chat('a', { stage: 'call prenotata' }))).toBe('rispondere')
  })

  it('we wrote last with a message to send now: follow-up; nothing to send: waiting', () => {
    expect(divisioneDi(chat('a', { last_from: 'alpha' }))).toBe('follow_up')
    expect(divisioneDi(chat('a', { last_from: 'alpha', suggested_message: '  ' }))).toBe('attesa')
  })

  it('every chat to revive is a follow-up, whoever wrote last', () => {
    expect(divisioneDi(chat('a', { last_from: 'alpha', suggested_message: '', days_silent: 3 }))).toBe('follow_up')
  })

  it('closed and lost chats are in none, even when the lead wrote last', () => {
    expect(divisioneDi(chat('a', { stage: 'perso' }))).toBeNull()
    expect(divisioneDi(chat('a', { stage: 'Uscita', last_from: 'alpha' }))).toBeNull()
  })
})

describe('vicinanzaDi', () => {
  it('every stage of the flow has a level, the closest to the call first', () => {
    expect(vicinanzaDi({ stage: 'calendly inviato', target: 'si' })).toBe('vicina')
    expect(vicinanzaDi({ stage: 'proposta call', target: 'da verificare' })).toBe('vicina')
    expect(vicinanzaDi({ stage: 'call prenotata', target: 'si' })).toBe('prenotata')
    expect(vicinanzaDi({ stage: 'urgenza', target: 'si' })).toBe('qualifica')
    expect(vicinanzaDi({ stage: 'messaggio 1', target: 'si' })).toBe('apertura')
    expect(vicinanzaDi({ stage: 'nurture', target: 'si' })).toBe('lontana')
    expect(vicinanzaDi({ stage: '', target: 'si' })).toBe('lontana')
    for (const f of FASI) expect(vicinanzaDi({ stage: f, target: 'si' })).toBeTypeOf('string')
  })

  it('a lead off target is always far from the call', () => {
    expect(vicinanzaDi({ stage: 'calendly inviato', target: 'no' })).toBe('lontana')
  })
})

describe('raggruppaDivisione', () => {
  const urgenza = (c: Chat) => c.ore ?? null

  it('groups by closeness to the call, each by stage, target, priority, then the longest wait', () => {
    const voci = [
      chat('apertura', { stage: 'messaggio 2' }),
      chat('qualifica-routine', { stage: 'routine' }),
      chat('qualifica-urgenza', { stage: 'urgenza' }),
      chat('vicina-poca-attesa', { stage: 'calendly inviato', ore: 1 }),
      chat('vicina-lunga-attesa', { stage: 'calendly inviato', ore: 9 }),
      chat('vicina-da-verificare', { stage: 'calendly inviato', target: 'da verificare', ore: 30 }),
      chat('vicina-alta', { stage: 'calendly inviato', priority: 'alta', ore: 0 }),
      chat('proposta', { stage: 'proposta call', ore: 50 }),
      chat('fuori', { stage: 'calendly inviato', target: 'no' }),
      chat('prenotata', { stage: 'call prenotata' }),
      chat('nostra', { last_from: 'alpha' }),
    ]
    const gruppi = raggruppaDivisione('rispondere', voci, urgenza)
    expect(gruppi.map((g) => [g.livello, g.voci.map((v) => v.conversation_id)])).toEqual([
      ['vicina', ['vicina-alta', 'vicina-lunga-attesa', 'vicina-poca-attesa', 'vicina-da-verificare', 'proposta']],
      ['prenotata', ['prenotata']],
      ['qualifica', ['qualifica-urgenza', 'qualifica-routine']],
      ['apertura', ['apertura']],
      ['lontana', ['fuori']],
    ])
  })

  it('a chat once, even when it is both a lead and to revive', () => {
    const voci = [chat('x', { last_from: 'alpha' }), chat('x', { last_from: 'alpha', days_silent: 3 })]
    expect(raggruppaDivisione('follow_up', voci, urgenza)[0].voci).toHaveLength(1)
  })
})

describe('contaDivisioni', () => {
  it('counts each chat once, the closed ones in none', () => {
    const leads = [
      chat('a'),
      chat('b', { last_from: 'alpha' }),
      chat('c', { last_from: 'alpha', suggested_message: '' }),
      chat('d', { stage: 'perso' }),
    ]
    const riattivare = [chat('e', { last_from: 'alpha', days_silent: 5 }), chat('b', { last_from: 'alpha', days_silent: 2 })]
    expect(contaDivisioni(leads, riattivare)).toEqual({ tutte: 5, rispondere: 1, follow_up: 2, attesa: 1 })
  })
})
