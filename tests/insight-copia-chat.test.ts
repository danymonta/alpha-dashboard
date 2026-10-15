import { describe, expect, it } from 'vitest'

import { chiCopia, trascrizioneChat } from '@/lib/insight/copia-chat'
import type { MessaggioRecap } from '@/lib/insight/recap'

// «Copia chat», word for word the artifact's transcript. Every chat is invented.

const messaggi: MessaggioRecap[] = [
  { from: 'lead', time: '08/10 21:27', text: 'Ciao, info sul percorso?', at: '2026-10-08T19:27:00Z' },
  { from: 'alpha', time: '08/10 21:30', text: 'Ciao Marco! Certo.\nDimmi di te.', at: '2026-10-08T19:30:00Z' },
]

describe('trascrizioneChat', () => {
  it('Instagram: the handle, the name in brackets, one line per message', () => {
    expect(trascrizioneChat({ username: 'marco.esempio', name: 'Marco Esempio', messages: messaggi }, 'instagram')).toBe(
      [
        'Conversazione Instagram con @marco.esempio (Marco Esempio)',
        '',
        '[08/10 21:27] @marco.esempio: Ciao, info sul percorso?',
        '[08/10 21:30] Percorso Alpha: Ciao Marco! Certo.\nDimmi di te.',
      ].join('\n'),
    )
  })

  it('Instagram without a name or a handle', () => {
    expect(trascrizioneChat({ username: 'luca_prova', name: '', messages: [] }, 'instagram')).toBe(
      'Conversazione Instagram con @luca_prova\n',
    )
    expect(trascrizioneChat({ name: 'Luca', messages: [messaggi[0]] }, 'instagram')).toBe(
      'Conversazione Instagram con @lead (Luca)\n\n[08/10 21:27] @lead: Ciao, info sul percorso?',
    )
  })

  it('Messenger: the name, never a handle, never in brackets', () => {
    expect(trascrizioneChat({ username: 'x', name: 'Alessandro Messenger', messages: messaggi }, 'messenger')).toBe(
      [
        'Conversazione Messenger con Alessandro Messenger',
        '',
        '[08/10 21:27] Alessandro Messenger: Ciao, info sul percorso?',
        '[08/10 21:30] Percorso Alpha: Ciao Marco! Certo.\nDimmi di te.',
      ].join('\n'),
    )
    expect(trascrizioneChat({ name: '', messages: [] }, 'messenger')).toBe('Conversazione Messenger con Lead\n')
  })

  it('a message without its time keeps the brackets, as the artifact', () => {
    expect(trascrizioneChat({ username: 'u', name: '', messages: [{ from: 'lead', time: '', text: 'ok', at: '' }] }, 'instagram')).toBe(
      'Conversazione Instagram con @u\n\n[] @u: ok',
    )
  })
})

describe('chiCopia', () => {
  it('who the copy button names', () => {
    expect(chiCopia({ username: 'marco.esempio', name: 'Marco' }, 'instagram')).toBe('@marco.esempio')
    expect(chiCopia({ name: 'Marco' }, 'messenger')).toBe('Marco')
    expect(chiCopia({ name: '' }, 'messenger')).toBe('Lead')
  })
})
