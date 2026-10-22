import { describe, expect, it } from 'vitest'

import { ETICHETTA_MOTIVO, fraseAggiornato } from '@/lib/marketing/parole-post'

describe('fraseAggiornato', () => {
  const base = { letti: 52, collegati: 3, proposti: 5 }
  it('senza numeri: i post letti e quelli collegati da soli, mai le proposte (25/10/2026)', () => {
    expect(fraseAggiornato(base)).toBe('Aggiornato: 52 post letti, 3 collegati da soli.')
    expect(fraseAggiornato({ letti: 52, collegati: 3 })).toBe('Aggiornato: 52 post letti, 3 collegati da soli.')
  })
  it('i singolari', () => {
    expect(fraseAggiornato({ letti: 1, collegati: 1, proposti: 1 })).toBe('Aggiornato: 1 post letto, 1 collegato da solo.')
  })
  it('i post con i numeri', () => {
    expect(fraseAggiornato({ ...base, metriche: 41 })).toBe('Aggiornato: 52 post letti, 3 collegati da soli, numeri di 41 post.')
    expect(fraseAggiornato({ ...base, metriche: 1 })).toContain('numeri di 1 post.')
    expect(fraseAggiornato({ ...base, metriche: 0 })).toBe('Aggiornato: 52 post letti, 3 collegati da soli.')
  })
  it('il permesso mancante lo dice e vince', () => {
    expect(fraseAggiornato({ ...base, metriche: 4, permesso: false })).toBe('Aggiornato: 52 post letti, 3 collegati da soli; statistiche non attive.')
  })
  it('il motivo «parlato simile» ha le sue parole', () => {
    expect(ETICHETTA_MOTIVO.parlato_simile).toBe('parlato simile')
  })
})
